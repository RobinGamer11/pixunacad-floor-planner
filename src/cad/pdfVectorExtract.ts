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
  segments: { a: { x: number; y: number }; b: { x: number; y: number }; color: string; thicknessM: number;
    /** Strichelung in Seiten-pt (wirksam, inkl. Transformation); fehlt = durchgezogen. */ dashPt?: number[] }[];
  hatches: { points: { x: number; y: number }[]; holes?: { x: number; y: number }[][]; fillColor: string; strokeColor: string }[];
  texts: { x: number; y: number; widthM: number; heightM: number; fontSizePx: number; /** Schriftgröße in PDF-Punkten der Seite (ohne Mindestwert). */ fontSizePdfPt: number; text: string; color: string;
    /** Drehung der Grundlinie in PDF-Raum (rad, gegen den Uhrzeigersinn). */ angleRad?: number;
    /** Breite des Textinhalts in PDF-pt laut PDF (inkl. Laufweite/Skalierung). */ widthPdfPt?: number }[];
  /** Anzahl nicht übertragbarer PDF-Spezialfüllungen/-konturen (Mesh-Verläufe, unbekannte Muster). Bleiben in der PDF-Unterlage sichtbar. */
  skippedSpecial?: number;
}

/** PDF-Hairline (Breite 0) = dünnster Strich. */
export const HAIRLINE_PT = 0.1;

type Box = { x0: number; y0: number; x1: number; y1: number };
function boxOf(pts: { x: number; y: number }[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}
function intersectBox(a: Box, b: Box): Box {
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
}
function boxesOverlap(a: Box, b: Box) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
/** Liang-Barsky: Strecke auf Rechteck beschneiden (null = komplett außerhalb). */
export function clipSegment(a: { x: number; y: number }, b: { x: number; y: number }, r: Box): [{ x: number; y: number }, { x: number; y: number }] | null {
  const eps = 1e-6;
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const ps = [-dx, dx, -dy, dy], qs = [a.x - (r.x0 - eps), (r.x1 + eps) - a.x, a.y - (r.y0 - eps), (r.y1 + eps) - a.y];
  for (let i = 0; i < 4; i++) {
    const p = ps[i], q = qs[i];
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
    else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
}

type Pt = { x: number; y: number };
/** Sutherland–Hodgman: Fläche auf Beschneidungsrechteck begrenzen. */
export function clipPolygonToBox(poly: Pt[], b: Box): Pt[] {
  const bb = boxOf(poly);
  if (bb.x0 >= b.x0 && bb.x1 <= b.x1 && bb.y0 >= b.y0 && bb.y1 <= b.y1) return poly;
  let out = poly;
  const edges: [(p: Pt) => boolean, (a: Pt, c: Pt) => Pt][] = [
    [(p) => p.x >= b.x0, (a, c) => ({ x: b.x0, y: a.y + (c.y - a.y) * (b.x0 - a.x) / (c.x - a.x) })],
    [(p) => p.x <= b.x1, (a, c) => ({ x: b.x1, y: a.y + (c.y - a.y) * (b.x1 - a.x) / (c.x - a.x) })],
    [(p) => p.y >= b.y0, (a, c) => ({ x: a.x + (c.x - a.x) * (b.y0 - a.y) / (c.y - a.y), y: b.y0 })],
    [(p) => p.y <= b.y1, (a, c) => ({ x: a.x + (c.x - a.x) * (b.y1 - a.y) / (c.y - a.y), y: b.y1 })],
  ];
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i], prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cut(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) return out;
  }
  return out;
}
function ringArea(r: Pt[]) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x + r[i].x) * (r[j].y - r[i].y); return Math.abs(a / 2); }
function pointInRing(p: Pt, r: Pt[]) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i].y > p.y) !== (r[j].y > p.y) && p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x) c = !c;
  }
  return c;
}
/** Teilpfade einer Füllung → Außenringe mit Löchern (Verschachtelungstiefe gerade = Fläche, ungerade = Loch). */
export function groupFillRings(subs: Pt[][]): { points: Pt[]; holes: Pt[][] }[] {
  if (subs.length <= 1) return subs.map((s) => ({ points: s.slice(), holes: [] }));
  const rings = subs.map((s) => ({ s, area: ringArea(s), depth: 0, parent: -1 })).sort((a, b) => b.area - a.area);
  for (let i = 0; i < rings.length; i++) {
    const probe = rings[i].s[0];
    for (let k = i - 1; k >= 0; k--) {
      if (rings[k].area > rings[i].area && pointInRing(probe, rings[k].s)) { rings[i].parent = k; rings[i].depth = rings[k].depth + 1; break; }
    }
  }
  const out: { points: Pt[]; holes: Pt[][] }[] = [];
  const outIdx = new Map<number, number>();
  rings.forEach((r, i) => { if (r.depth % 2 === 0) { outIdx.set(i, out.length); out.push({ points: r.s.slice(), holes: [] }); } });
  rings.forEach((r) => { if (r.depth % 2 === 1 && outIdx.has(r.parent)) out[outIdx.get(r.parent)!].holes.push(r.s.slice()); });
  return out;
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

const hx = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");

/** Normalisiert CSS-/Hex-Strings von PDF.js ("#rgb", "#rrggbb", "rgb(...)") → "#rrggbb" oder null. */
function cssColorToHex(str: string): string | null {
  const t = str.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(t);
  if (m) return `#${m[1]}`;
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(t);
  if (m) return `#${hx(+m[1])}${hx(+m[2])}${hx(+m[3])}`;
  return null;
}

/** Liefert reine Zahlen aus Array/TypedArray, sonst null. */
function numsOf(arr: any): number[] | null {
  if (!arr) return null;
  if (ArrayBuffer.isView(arr)) return Array.from(arr as any as ArrayLike<number>);
  if (Array.isArray(arr)) {
    const n = arr.filter((v) => typeof v === "number" && Number.isFinite(v));
    return n.length === arr.length ? n : null;
  }
  return null;
}

/**
 * RGB-Operator-Args → Hex. PDF.js liefert je nach Version einen Hex-String
 * (["#rrggbb"] / "#rrggbb"), ein Uint8ClampedArray (0..255) oder Zahlen 0..1.
 */
function rgbArgsToHex(a: any): string | null {
  if (a == null) return null;
  if (typeof a === "string") return cssColorToHex(a);
  if (Array.isArray(a) && a.length >= 1 && typeof a[0] === "string") return cssColorToHex(a[0]);
  const n = numsOf(a);
  if (!n || n.length < 3) return null;
  const isTyped = ArrayBuffer.isView(a);
  const scale = !isTyped && n.slice(0, 3).every((v) => v <= 1) ? 255 : 1;
  return `#${hx(n[0] * scale)}${hx(n[1] * scale)}${hx(n[2] * scale)}`;
}

/** Grauwert (0..1, bzw. 0..255) → Hex. */
function grayToHex(v: any): string | null {
  if (typeof v === "string") return cssColorToHex(v);
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const g = v <= 1 ? v * 255 : v;
  return `#${hx(g)}${hx(g)}${hx(g)}`;
}

/** CMYK (0..1) → Hex. */
function cmykToHex(c: any, m: any, y: any, k: any): string | null {
  if (typeof c === "string") return cssColorToHex(c);
  if (![c, m, y, k].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const f = (v: number) => Math.max(0, Math.min(1, v > 1 ? v / 100 : v));
  const kk = f(k);
  const ch = (v: number) => hx(255 * (1 - f(v)) * (1 - kk));
  return `#${ch(c)}${ch(m)}${ch(y)}`;
}

/** Ergebnis einer Farbzuweisung: solide Farbe oder nicht übertragbare Spezialfüllung. */
type PaintColor = { hex: string; special: boolean };

/**
 * Generische Farb-Args (setFillColor/setFillColorN, inkl. Muster/Verläufe).
 * - Zahlen: Grau (1), RGB (3), CMYK (4).
 * - Axial/Radial-Verlauf: mittlere Verlaufsfarbe als Näherung.
 * - Kachelmuster mit Farbe: diese Farbe.
 * - Sonst (Mesh, unbekannt): Spezialfüllung → null-Farbe.
 */
function genericColorToPaint(a: any): PaintColor | null {
  if (a == null) return null;
  if (typeof a === "string") { const h = cssColorToHex(a); return h ? { hex: h, special: false } : null; }
  if (!Array.isArray(a) && !ArrayBuffer.isView(a)) return null;
  const arr: any[] = Array.from(a as any);
  if (typeof arr[0] === "string") {
    const kind = arr[0];
    const direct = cssColorToHex(kind);
    if (direct) return { hex: direct, special: false };
    // Verlauf: ["RadialAxial", type, bbox, colorStops, ...]
    if (kind === "RadialAxial" || kind === "Shading") {
      const stops = arr.find((x) => Array.isArray(x) && x.length > 0 && Array.isArray(x[0]) && typeof x[0][1] === "string");
      if (stops) {
        const cols = stops.map((s: any) => cssColorToHex(s[1])).filter(Boolean) as string[];
        if (cols.length) return { hex: averageHex(cols), special: true };
      }
      return { hex: "", special: true };
    }
    if (kind === "TilingPattern") {
      const col = arr[1];
      const h = col ? rgbArgsToHex(col) : null;
      return h ? { hex: h, special: false } : { hex: "", special: true };
    }
    return { hex: "", special: true };
  }
  const nums = numsOf(arr);
  if (!nums) return null;
  let h: string | null = null;
  if (nums.length === 1) h = grayToHex(nums[0]);
  else if (nums.length === 3) h = rgbArgsToHex(nums);
  else if (nums.length === 4) h = cmykToHex(nums[0], nums[1], nums[2], nums[3]);
  return h ? { hex: h, special: false } : null;
}

function averageHex(cols: string[]): string {
  let r = 0, g = 0, b = 0;
  for (const c of cols) { r += parseInt(c.slice(1, 3), 16); g += parseInt(c.slice(3, 5), 16); b += parseInt(c.slice(5, 7), 16); }
  const n = cols.length || 1;
  return `#${hx(r / n)}${hx(g / n)}${hx(b / n)}`;
}

/** Unicode-Text einer Text-Show-Op (Glyph-Array) für die Zuordnung zu Textinhalten. */
function glyphText(a: any): string {
  const g = Array.isArray(a) ? (Array.isArray(a[0]) ? a[0] : a) : [];
  let out = "";
  for (const x of g) {
    if (x && typeof x === "object") out += x.unicode ?? x.fontChar ?? "";
    else if (typeof x === "string") out += x;
  }
  return out.replace(/\s+/g, "");
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
  const colorStack: { fill: string; stroke: string; lw: number; fs: boolean; ss: boolean }[] = [];
  let currentPath: { x: number; y: number }[][] = []; // Subpaths (transformed to PDF user space)
  let currentSub: { x: number; y: number }[] = [];
  let fillColor = "#000000";
  let strokeColor = "#000000";
  /** true, wenn die aktuelle Füllung/Kontur eine nicht exakt übertragbare Spezialfarbe ist. */
  let fillSpecial = false;
  let strokeSpecial = false;
  let lineWidth = 1; // in user units
  let dashArr: number[] = [];
  /** Aktueller Beschneidungsrahmen in Seiten-pt (null = keiner). */
  let clipBox: Box | null = null;
  let pendingClip = false;
  const clipStack: (Box | null)[] = [];
  const dashStack: number[][] = [];
  /** fillColor zum Zeitpunkt jeder Text-Show-Op (Reihenfolge wie in der opList). */
  const textOpFillColors: string[] = [];
  /** Text pro Show-Op (ohne Leerzeichen) für die positionsgenaue Farbzuordnung. */
  const textOpStrings: string[] = [];

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

  /**
   * Wirksame Strichbreite in Seiten-pt: Linienbreite × Skalierung der aktuellen
   * Transformation (bei ungleichmäßiger Skalierung geometrisches Mittel).
   * Breite 0 = PDF-Hairline → dünnster darstellbarer Strich (0,1 pt).
   * Keine künstliche Mindeststärke.
   */
  const effectiveStrokePt = () => {
    const s = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) || 1;
    const w = lineWidth * s;
    return w > 0 ? w : HAIRLINE_PT;
  };

  const emitStroke = () => {
    flushSubpath();
    if (strokeSpecial) { result.skippedSpecial = (result.skippedSpecial || 0) + currentPath.length; return; }
    const s = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) || 1;
    const dashPt = dashArr.length && dashArr.some((d) => d > 0) ? dashArr.map((d) => d * s) : undefined;
    for (const sub of currentPath) {
      for (let i = 1; i < sub.length; i++) {
        const c = clipBox ? clipSegment(sub[i - 1], sub[i], clipBox) : [sub[i - 1], sub[i]];
        if (!c) continue;
        result.segments.push({
          a: c[0], b: c[1],
          color: strokeColor,
          thicknessM: effectiveStrokePt() * Defaults.documentMetersPerPdfPt,
          ...(dashPt ? { dashPt } : {}),
        });
      }
    }
  };

  /** W/W* n: Beschneidungsrahmen = Schnitt mit Hüllrechteck des Pfads. */
  const applyPendingClip = () => {
    if (!pendingClip) return;
    pendingClip = false;
    const pts = [...currentPath.flat(), ...currentSub];
    if (!pts.length) return;
    const b = boxOf(pts);
    clipBox = clipBox ? intersectBox(clipBox, b) : b;
  };

  const emitFill = () => {
    flushSubpath();
    // Verläufe/Muster ohne ermittelbare Farbe nicht als falsche Vollfläche ausgeben.
    if (fillSpecial) { result.skippedSpecial = (result.skippedSpecial || 0) + currentPath.length; return; }
    // Reine Füllung ohne Rand; Konturen kommen nur aus Stroke-Ops als Linien.
    // Mehrere Teilpfade: innenliegende Ringe werden Löcher (statt die
    // Aussparung vollflächig zu übermalen).
    for (const f of groupFillRings(currentPath.filter((s) => s.length >= 3))) {
      let pts = f.points;
      if (clipBox) { pts = clipPolygonToBox(pts, clipBox); if (pts.length < 3) continue; }
      result.hatches.push({ points: pts, ...(f.holes.length ? { holes: f.holes } : {}), fillColor, strokeColor: fillColor });
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
    if (fn === OPS.save) { clipStack.push(clipBox); dashStack.push(dashArr); }
    else if (fn === OPS.restore) { if (clipStack.length) clipBox = clipStack.pop()!; if (dashStack.length) dashArr = dashStack.pop()!; }
    if (fn === OPS.clip || fn === OPS.eoClip) pendingClip = true;
    else if (fn === OPS.setDash) dashArr = Array.isArray(a[0]) ? a[0].map(Number).filter(Number.isFinite) : [];
    if (fn === OPS.endPath || fn === OPS.stroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) applyPendingClip();
    if (fn === OPS.save) { ctmStack.push({ ...ctm }); colorStack.push({ fill: fillColor, stroke: strokeColor, lw: lineWidth, fs: fillSpecial, ss: strokeSpecial }); }
    else if (fn === OPS.restore) {
      if (ctmStack.length) ctm = ctmStack.pop()!;
      const c = colorStack.pop();
      if (c) { fillColor = c.fill; strokeColor = c.stroke; lineWidth = c.lw; fillSpecial = c.fs; strokeSpecial = c.ss; }
    }
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
    else if (fn === OPS.setFillRGBColor) { const c = rgbArgsToHex(a); if (c) { fillColor = c; fillSpecial = false; } }
    else if (fn === OPS.setStrokeRGBColor) { const c = rgbArgsToHex(a); if (c) { strokeColor = c; strokeSpecial = false; } }
    else if (fn === OPS.setFillGray) { const c = grayToHex(a?.[0]); if (c) { fillColor = c; fillSpecial = false; } }
    else if (fn === OPS.setStrokeGray) { const c = grayToHex(a?.[0]); if (c) { strokeColor = c; strokeSpecial = false; } }
    else if (fn === OPS.setFillCMYKColor) { const c = cmykToHex(a?.[0], a?.[1], a?.[2], a?.[3]); if (c) { fillColor = c; fillSpecial = false; } }
    else if (fn === OPS.setStrokeCMYKColor) { const c = cmykToHex(a?.[0], a?.[1], a?.[2], a?.[3]); if (c) { strokeColor = c; strokeSpecial = false; } }
    else if (fn === OPS.setFillColor || fn === OPS.setFillColorN || fn === (OPS as any).setFillTransparent) {
      const p = genericColorToPaint(a);
      if (p) { if (p.hex) fillColor = p.hex; fillSpecial = p.special && !p.hex; }
    }
    else if (fn === OPS.setStrokeColor || fn === OPS.setStrokeColorN || fn === (OPS as any).setStrokeTransparent) {
      const p = genericColorToPaint(a);
      if (p) { if (p.hex) strokeColor = p.hex; strokeSpecial = p.special && !p.hex; }
    }
    else if (fn === OPS.setLineWidth) lineWidth = typeof a[0] === "number" ? a[0] : lineWidth;
    else if (
      fn === OPS.showText ||
      fn === OPS.showSpacedText ||
      fn === OPS.nextLineShowText ||
      fn === OPS.nextLineSetSpacingShowText
    ) {
      textOpFillColors.push(fillColor);
      textOpStrings.push(glyphText(fn === OPS.nextLineSetSpacingShowText ? a?.[2] : a?.[0]));
    }
  }

  // Texte via getTextContent (zuverlässiger als opList-Text-State).
  // Farben pro Textstelle: die Text-Items werden in Leserichtung den
  // Show-Ops über ihren Inhalt zugeordnet; die Farbe der passenden Op gilt.
  let fallbackTextColor: string = "#000000";
  try {
    const tc = await page.getTextContent();
    const items = (tc.items || []).filter((it: any) => it && typeof it.str === "string" && it.str.trim());
    const canMap1to1 = textOpFillColors.length === items.length;
    const haveStrings = textOpStrings.some((x) => x.length > 0);
    let opPtr = 0;
    const colorForItem = (idx: number, str: string): string => {
      if (!textOpFillColors.length) return fallbackTextColor;
      if (haveStrings) {
        const needle = str.replace(/\s+/g, "");
        if (needle) {
          // Vorwärts suchen (Items folgen i. d. R. der Op-Reihenfolge).
          const limit = Math.min(textOpStrings.length, opPtr + 400);
          for (let k = opPtr; k < limit; k++) {
            const hay = textOpStrings[k];
            if (!hay) continue;
            if (hay.includes(needle) || needle.startsWith(hay) || needle.includes(hay)) {
              opPtr = hay.endsWith(needle) || hay === needle ? k + 1 : k;
              fallbackTextColor = textOpFillColors[k];
              return textOpFillColors[k];
            }
          }
        }
      }
      if (canMap1to1) return textOpFillColors[idx] || fallbackTextColor;
      // Nächstliegende Op-Farbe statt pauschal häufigster Farbe.
      return textOpFillColors[Math.min(opPtr, textOpFillColors.length - 1)] || fallbackTextColor;
    };
    items.forEach((item: any, idx: number) => {
      const t = item.transform; // [a, b, c, d, e, f] — PDF user space
      if (!t) return;
      const fontSizePt = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 10;
      const angleRad = Math.atan2(t[1], t[0]) || 0;
      const widthPt = item.width || fontSizePt * Math.max(1, item.str.length) * 0.5;
      const heightPt = fontSizePt * 1.2;
      const col = colorForItem(idx, item.str);
      result.texts.push({
        x: t[4], y: t[5],
        widthM: widthPt * Defaults.documentMetersPerPdfPt,
        heightM: heightPt * Defaults.documentMetersPerPdfPt,
        fontSizePx: fontSizePt,
        fontSizePdfPt: fontSizePt,
        text: item.str,
        color: col,
        angleRad,
        widthPdfPt: item.width || 0,
      });
    });
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
