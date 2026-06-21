/**
 * PDF "Auflösen": Vektorinhalte einer PDF-Seite in CAD-Primitive übersetzen.
 * - Linien/Polylinien/Kurven → Segments (Bézier wird subdividiert)
 * - Gefüllte Pfade → Hatches
 * - Texte (via getTextContent) → TextBoxes
 *
 * Pragmatische Implementierung: tracked CTM (save/restore/transform), nutzt
 * pdfjs OPS-IDs. Pattern-Fills/Transparenzgruppen/Clipping werden ignoriert.
 */

import { Defaults } from "./constants";
import { loadPdfDocFromB64, loadPdfJs } from "./documentImport";

export interface DissolvedPdfResult {
  segments: { a: { x: number; y: number }; b: { x: number; y: number }; color: string; thicknessM: number }[];
  hatches: { points: { x: number; y: number }[]; fillColor: string; strokeColor: string }[];
  texts: { x: number; y: number; widthM: number; heightM: number; fontSizePx: number; text: string; color: string }[];
}

interface Mat2x3 { a: number; b: number; c: number; d: number; e: number; f: number }
const ID: Mat2x3 = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function mul(m: Mat2x3, n: Mat2x3): Mat2x3 {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}
function tx(m: Mat2x3, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function colorArrayToHex(arr: any): string {
  if (!arr) return "#000000";
  if (typeof arr === "string") return arr;
  if (Array.isArray(arr)) {
    if (arr.length >= 3) {
      const [r, g, b] = arr;
      const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
      return `#${h(r)}${h(g)}${h(b)}`;
    }
    if (arr.length === 1) {
      const v = Math.max(0, Math.min(255, Math.round(arr[0])));
      const h = v.toString(16).padStart(2, "0");
      return `#${h}${h}${h}`;
    }
  }
  return "#000000";
}

/**
 * Extrahiert Vektor-Inhalte einer PDF-Seite. Koordinaten bleiben im
 * PDF-User-Space (bottom-left, Punkte). Der Caller mappt sie in Welt-m.
 */
export async function extractPdfPageVectors(sourceB64: string, pageIndex: number): Promise<DissolvedPdfResult> {
  const pdfjs = await loadPdfJs();
  const OPS = pdfjs.OPS;
  const pdf = await loadPdfDocFromB64(sourceB64);
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const pageHeight = viewport.height;

  const opList = await page.getOperatorList();
  const fns: number[] = opList.fnArray;
  const args: any[] = opList.argsArray;

  const result: DissolvedPdfResult = { segments: [], hatches: [], texts: [] };

  let ctm: Mat2x3 = { ...ID };
  const ctmStack: Mat2x3[] = [];
  let currentPath: { x: number; y: number }[][] = []; // Subpaths (transformed to PDF user space)
  let currentSub: { x: number; y: number }[] = [];
  let fillColor = "#000000";
  let strokeColor = "#000000";
  let lineWidth = 1; // in user units

  const addPathPoint = (xLocal: number, yLocal: number) => {
    const p = tx(ctm, xLocal, yLocal);
    currentSub.push(p);
  };

  const flushSubpath = () => {
    if (currentSub.length > 0) {
      currentPath.push(currentSub);
      currentSub = [];
    }
  };

  const emitStroke = () => {
    flushSubpath();
    for (const sub of currentPath) {
      for (let i = 1; i < sub.length; i++) {
        result.segments.push({
          a: sub[i - 1], b: sub[i],
          color: strokeColor,
          thicknessM: Math.max(0.0005, lineWidth * Defaults.documentMetersPerPdfPt),
        });
      }
    }
  };

  const emitFill = () => {
    flushSubpath();
    for (const sub of currentPath) {
      if (sub.length >= 3) {
        result.hatches.push({ points: sub.slice(), fillColor, strokeColor });
      }
    }
  };

  const clearPath = () => { currentPath = []; currentSub = []; };

  // Bézier-Subdivision (adaptiv, einfache flachheits-Heuristik).
  const flatness = 0.5; // in user units (~0.5 pt ≈ 0.17 mm)
  const subdivideCubic = (p0: any, p1: any, p2: any, p3: any, depth = 0): { x: number; y: number }[] => {
    const dx = p3.x - p0.x, dy = p3.y - p0.y;
    const len = Math.hypot(dx, dy);
    const d1 = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx);
    const d2 = Math.abs((p2.x - p0.x) * dy - (p2.y - p0.y) * dx);
    if (depth > 8 || (len > 0 && (d1 + d2) / len < flatness)) return [p3];
    const m = (a: any, b: any) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const p01 = m(p0, p1), p12 = m(p1, p2), p23 = m(p2, p3);
    const p012 = m(p01, p12), p123 = m(p12, p23), p0123 = m(p012, p123);
    return [...subdivideCubic(p0, p01, p012, p0123, depth + 1), ...subdivideCubic(p0123, p123, p23, p3, depth + 1)];
  };

  // constructPath args (pdfjs >= 2.x): [ops, args, minMax]
  const handleConstructPath = (ops: number[], pArgs: number[]) => {
    let i = 0;
    let last = { x: 0, y: 0 };
    for (const op of ops) {
      if (op === OPS.moveTo) {
        flushSubpath();
        const x = pArgs[i++], y = pArgs[i++];
        const p = tx(ctm, x, y);
        currentSub.push(p);
        last = { x, y };
      } else if (op === OPS.lineTo) {
        const x = pArgs[i++], y = pArgs[i++];
        const p = tx(ctm, x, y);
        currentSub.push(p);
        last = { x, y };
      } else if (op === OPS.curveTo) {
        const x1 = pArgs[i++], y1 = pArgs[i++];
        const x2 = pArgs[i++], y2 = pArgs[i++];
        const x3 = pArgs[i++], y3 = pArgs[i++];
        const p0 = last, p1 = { x: x1, y: y1 }, p2 = { x: x2, y: y2 }, p3 = { x: x3, y: y3 };
        const pts = subdivideCubic(p0, p1, p2, p3);
        for (const pt of pts) currentSub.push(tx(ctm, pt.x, pt.y));
        last = p3;
      } else if (op === OPS.curveTo2) {
        const x2 = pArgs[i++], y2 = pArgs[i++];
        const x3 = pArgs[i++], y3 = pArgs[i++];
        const pts = subdivideCubic(last, last, { x: x2, y: y2 }, { x: x3, y: y3 });
        for (const pt of pts) currentSub.push(tx(ctm, pt.x, pt.y));
        last = { x: x3, y: y3 };
      } else if (op === OPS.curveTo3) {
        const x1 = pArgs[i++], y1 = pArgs[i++];
        const x3 = pArgs[i++], y3 = pArgs[i++];
        const pts = subdivideCubic(last, { x: x1, y: y1 }, { x: x3, y: y3 }, { x: x3, y: y3 });
        for (const pt of pts) currentSub.push(tx(ctm, pt.x, pt.y));
        last = { x: x3, y: y3 };
      } else if (op === OPS.closePath) {
        if (currentSub.length > 0) {
          currentSub.push({ ...currentSub[0] });
        }
      } else if (op === OPS.rectangle) {
        const x = pArgs[i++], y = pArgs[i++], w = pArgs[i++], h = pArgs[i++];
        flushSubpath();
        currentSub.push(tx(ctm, x, y));
        currentSub.push(tx(ctm, x + w, y));
        currentSub.push(tx(ctm, x + w, y + h));
        currentSub.push(tx(ctm, x, y + h));
        currentSub.push(tx(ctm, x, y));
        flushSubpath();
        last = { x, y };
      }
    }
  };

  for (let k = 0; k < fns.length; k++) {
    const fn = fns[k];
    const a = args[k] || [];
    if (fn === OPS.save) ctmStack.push({ ...ctm });
    else if (fn === OPS.restore) { if (ctmStack.length) ctm = ctmStack.pop()!; }
    else if (fn === OPS.transform) {
      const [aa, bb, cc, dd, ee, ff] = a;
      ctm = mul(ctm, { a: aa, b: bb, c: cc, d: dd, e: ee, f: ff });
    }
    else if (fn === OPS.constructPath) handleConstructPath(a[0], a[1]);
    else if (fn === OPS.moveTo) { flushSubpath(); addPathPoint(a[0], a[1]); }
    else if (fn === OPS.lineTo) addPathPoint(a[0], a[1]);
    else if (fn === OPS.rectangle) {
      const [x, y, w, h] = a;
      flushSubpath();
      addPathPoint(x, y); addPathPoint(x + w, y); addPathPoint(x + w, y + h); addPathPoint(x, y + h); addPathPoint(x, y);
      flushSubpath();
    }
    else if (fn === OPS.closePath) { if (currentSub.length > 0) currentSub.push({ ...currentSub[0] }); }
    else if (fn === OPS.stroke) { emitStroke(); clearPath(); }
    else if (fn === OPS.fill || fn === OPS.eoFill) { emitFill(); clearPath(); }
    else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke) { emitFill(); emitStroke(); clearPath(); }
    else if (fn === OPS.closeStroke) { if (currentSub.length > 0) currentSub.push({ ...currentSub[0] }); emitStroke(); clearPath(); }
    else if (fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
      if (currentSub.length > 0) currentSub.push({ ...currentSub[0] });
      emitFill(); emitStroke(); clearPath();
    }
    else if (fn === OPS.endPath) clearPath();
    else if (fn === OPS.setFillRGBColor) fillColor = colorArrayToHex(a);
    else if (fn === OPS.setStrokeRGBColor) strokeColor = colorArrayToHex(a);
    else if (fn === OPS.setLineWidth) lineWidth = typeof a[0] === "number" ? a[0] : lineWidth;
  }

  // Texte via getTextContent (zuverlässiger als opList-Text-State).
  try {
    const tc = await page.getTextContent();
    for (const item of tc.items || []) {
      if (!item || typeof item.str !== "string" || !item.str.trim()) continue;
      const t = item.transform; // [a, b, c, d, e, f] — PDF user space
      if (!t) continue;
      const fontSizePt = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10;
      // y in PDF ist bottom-left → wir liefern PDF-Punkte; Caller flippt.
      const widthPt = item.width || fontSizePt * Math.max(1, item.str.length) * 0.5;
      const heightPt = fontSizePt * 1.2;
      result.texts.push({
        x: t[4], y: t[5],
        widthM: widthPt * Defaults.documentMetersPerPdfPt,
        heightM: heightPt * Defaults.documentMetersPerPdfPt,
        fontSizePx: Math.max(6, fontSizePt),
        text: item.str,
        color: fillColor,
      });
    }
  } catch { /* ignore */ }

  return result;
}

/** Mapt PDF-User-Space-Punkt in Welt-Meter unter Berücksichtigung von doc.position/rotation/Größe. */
export function pdfPointToWorld(
  xPt: number, yPt: number,
  pdfWidthPt: number, pdfHeightPt: number,
  doc: { position: { x: number; y: number }; widthM: number; heightM: number; rotationRad: number }
): { x: number; y: number } {
  const sx = doc.widthM / pdfWidthPt;
  const sy = doc.heightM / pdfHeightPt;
  // PDF y ist bottom-left → flip
  const localX = xPt * sx;
  const localY = (pdfHeightPt - yPt) * sy;
  const cx = doc.position.x + doc.widthM / 2;
  const cy = doc.position.y + doc.heightM / 2;
  const relX = localX - doc.widthM / 2;
  const relY = localY - doc.heightM / 2;
  const cos = Math.cos(doc.rotationRad), sin = Math.sin(doc.rotationRad);
  return { x: cx + relX * cos - relY * sin, y: cy + relX * sin + relY * cos };
}
