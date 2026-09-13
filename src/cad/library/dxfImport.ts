/**
 * DXF-Import-Adapter für das Bibliothekssystem.
 *
 *   DXF-Datei → importDxfToSnapshots() → LibraryGeometrySnapshot[]
 *             → LibraryDefinition (LibraryManager)
 *
 * Der Adapter ist bewusst vollständig getrennt von der Zeichenengine:
 * Es werden KEINE Scene-Objekte erzeugt, kein Renderer und kein Werkzeug
 * verändert. Einzige Schnittstelle ist `LibraryGeometrySnapshot`.
 *
 * Koordinaten und Maßstab
 * -----------------------
 * DXF rechnet mit Y nach oben, PixunaCAD mit Y nach unten. Der Import spiegelt
 * daher die Y-Achse (`y_pixuna = -y_dxf`) und teilt anschließend durch die
 * Einheiten je Meter aus `$INSUNITS`. Der DXF-Export (`dxfExport.ts`) wendet
 * exakt die Umkehrung an (Meter, `$INSUNITS = 6`).
 *
 * Bögen
 * -----
 * DXF-Bulge = tan(Öffnungswinkel/4) mit positiver Drehrichtung gegen den
 * Uhrzeigersinn. PixunaCAD-Bulge = Pfeilhöhe/Sehnenlänge = tan(Winkel/4)/2,
 * positiv in Richtung (-dy, dx). Durch die Achsenspiegelung dreht sich das
 * Vorzeichen um: `pixuna = sign(det) * dxfBulge / 2`.
 */
import DxfParser from "dxf-parser";
import type { LibraryGeometrySnapshot } from "./types";

type Pt = { x: number; y: number };
/** Affine Matrix [a b c d e f] im DXF-Koordinatenraum. */
type Mat = [number, number, number, number, number, number];

const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function apply(m: Mat, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
function det(m: Mat): number {
  return m[0] * m[3] - m[1] * m[2];
}
function matScale(m: Mat): number {
  return (Math.hypot(m[0], m[1]) + Math.hypot(m[2], m[3])) / 2 || 1;
}

/* --------------------------------------------------------------- Einheiten */

export interface DxfUnitInfo {
  /** $INSUNITS-Code (0 = ohne Einheit). */
  code: number;
  label: string;
  /** DXF-Einheiten je Meter. */
  unitsPerMeter: number;
  /** true, wenn die Datei keine Einheit angibt und mm angenommen wurde. */
  assumed: boolean;
}

const UNIT_TABLE: Record<number, { label: string; perMeter: number }> = {
  1: { label: "Zoll", perMeter: 1 / 0.0254 },
  2: { label: "Fuß", perMeter: 1 / 0.3048 },
  3: { label: "Meilen", perMeter: 1 / 1609.344 },
  4: { label: "Millimeter", perMeter: 1000 },
  5: { label: "Zentimeter", perMeter: 100 },
  6: { label: "Meter", perMeter: 1 },
  7: { label: "Kilometer", perMeter: 0.001 },
  8: { label: "Mikrozoll", perMeter: 1 / 0.0000000254 },
  9: { label: "Mil", perMeter: 1 / 0.0000254 },
  10: { label: "Yard", perMeter: 1 / 0.9144 },
  11: { label: "Ångström", perMeter: 1e10 },
  12: { label: "Nanometer", perMeter: 1e9 },
  13: { label: "Mikrometer", perMeter: 1e6 },
  14: { label: "Dezimeter", perMeter: 10 },
  15: { label: "Dekameter", perMeter: 0.1 },
  16: { label: "Hektometer", perMeter: 0.01 },
  17: { label: "Gigameter", perMeter: 1e-9 },
  21: { label: "Lichtjahre", perMeter: 1 / 9.4607304725808e15 },
};

/** Liest `$INSUNITS` direkt aus dem Text (für den Import-Dialog). */
export function detectDxfUnits(text: string): DxfUnitInfo {
  const m = /\$INSUNITS\s*[\r\n]+\s*70\s*[\r\n]+\s*(-?\d+)/i.exec(text);
  const code = m ? parseInt(m[1], 10) : 0;
  const entry = UNIT_TABLE[code];
  if (!entry) return { code: 0, label: "ohne Einheit (mm angenommen)", unitsPerMeter: 1000, assumed: true };
  return { code, label: entry.label, unitsPerMeter: entry.perMeter, assumed: false };
}

export function listDxfUnitOptions(): { code: number; label: string; unitsPerMeter: number }[] {
  return Object.entries(UNIT_TABLE)
    .map(([c, e]) => ({ code: Number(c), label: e.label, unitsPerMeter: e.perMeter }))
    .sort((a, b) => a.code - b.code);
}

/* ------------------------------------------------------------------ Farben */

const ACI_BASE = ["#000000", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ffffff", "#808080", "#c0c0c0"];
const ACI_GRAY = ["#333333", "#505050", "#696969", "#828282", "#bebebe", "#ffffff"];

function hsvHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** ACI-Farbindex → Hex. 1–9 und 250–255 exakt, 10–249 sehr nah angenähert. */
export function aciToHex(index: number): string {
  if (!Number.isFinite(index)) return "#000000";
  const i = Math.round(index);
  if (i >= 0 && i < ACI_BASE.length) return ACI_BASE[i];
  if (i >= 250 && i <= 255) return ACI_GRAY[i - 250];
  if (i < 10 || i > 249) return "#000000";
  const j = i - 10;
  const hue = Math.floor(j / 10) * 15;
  const step = j % 10;
  const sat = [1, 1, 0.65, 0.65, 0.45, 0.45, 0.3, 0.3, 0.15, 0.15][step];
  const val = [1, 0.65, 1, 0.65, 1, 0.65, 1, 0.65, 1, 0.65][step];
  return hsvHex(hue, sat, val);
}

function trueColorToHex(n: number): string {
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

/* ------------------------------------------------------------------- Optionen */

export interface DxfImportOptions {
  /** DXF-Einheiten je Meter. Standard: aus `$INSUNITS`, sonst 1000 (mm). */
  unitsPerMeter?: number;
}

export interface DxfImportResult {
  snapshots: LibraryGeometrySnapshot[];
  /** Vereinfacht übernommene Inhalte. */
  simplified: string[];
  /** Nicht übernommene Inhalte. */
  skipped: string[];
  /** Alle Hinweise zusammen (für einfache Anzeigen). */
  warnings: string[];
  units: DxfUnitInfo;
  /** true, wenn gar nichts gelesen werden konnte. */
  failed?: string;
}

/* ------------------------------------------------------------ HATCH (roh) */

type RawPair = { code: number; value: string };

function rawPairs(text: string): RawPair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const out: RawPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    out.push({ code, value: lines[i + 1] });
  }
  return out;
}

interface RawHatch {
  layer: string;
  colorIndex: number | null;
  trueColor: number | null;
  solid: boolean;
  loops: { pts: Pt[]; bulges: number[] }[];
}

/**
 * HATCH wird bewusst direkt aus den Gruppencodes gelesen — der Parser der
 * Fremdbibliothek unterstützt HATCH nicht. Unterstützt werden Polylinien- und
 * Kanten-Begrenzungen (Linien und Bögen) inklusive Löchern.
 */
function parseRawHatches(text: string): RawHatch[] {
  const pairs = rawPairs(text);
  const out: RawHatch[] = [];
  let cur: RawHatch | null = null;
  let loop: { pts: Pt[]; bulges: number[] } | null = null;
  let edgeType = 0;
  let arc: any = null;
  let inBoundary = false;

  const flushArc = () => {
    if (!loop || !arc || arc.cx === undefined || !arc.r) { arc = null; return; }
    const s = arc.a0 ?? 0, e = arc.a1 ?? 360;
    let sweep = ((e - s) % 360 + 360) % 360 || 360;
    if (arc.ccw === 0) sweep = -(360 - sweep);
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / 15));
    for (let i = 0; i <= steps; i++) {
      const a = ((s + (sweep * i) / steps) * Math.PI) / 180;
      loop.pts.push({ x: arc.cx + arc.r * Math.cos(a), y: arc.cy + arc.r * Math.sin(a) });
      loop.bulges.push(0);
    }
    arc = null;
  };
  const flushLoop = () => {
    flushArc();
    if (loop && loop.pts.length >= 3) cur!.loops.push(loop);
    loop = null;
  };

  for (const p of pairs) {
    if (p.code === 0) {
      if (cur) { flushLoop(); out.push(cur); cur = null; }
      if (p.value.trim().toUpperCase() === "HATCH") {
        cur = { layer: "0", colorIndex: null, trueColor: null, solid: true, loops: [] };
        inBoundary = false;
        edgeType = 0;
      }
      continue;
    }
    if (!cur) continue;
    switch (p.code) {
      case 8: cur.layer = p.value.trim(); break;
      case 62: cur.colorIndex = parseInt(p.value, 10); break;
      case 420: cur.trueColor = parseInt(p.value, 10); break;
      case 70: cur.solid = parseInt(p.value, 10) === 1; break;
      case 91: inBoundary = true; break;
      case 92: if (inBoundary) { flushLoop(); loop = { pts: [], bulges: [] }; } break;
      case 72: if (inBoundary) { flushArc(); edgeType = parseInt(p.value, 10); if (edgeType === 2) arc = {}; } break;
      case 10:
        if (!inBoundary || !loop) break;
        if (edgeType === 2 && arc) arc.cx = parseFloat(p.value);
        else { loop.pts.push({ x: parseFloat(p.value), y: 0 }); loop.bulges.push(0); }
        break;
      case 20:
        if (!inBoundary || !loop) break;
        if (edgeType === 2 && arc) arc.cy = parseFloat(p.value);
        else if (loop.pts.length) loop.pts[loop.pts.length - 1].y = parseFloat(p.value);
        break;
      case 40: if (inBoundary && edgeType === 2 && arc) arc.r = parseFloat(p.value); break;
      case 50: if (inBoundary && edgeType === 2 && arc) arc.a0 = parseFloat(p.value); break;
      case 51: if (inBoundary && edgeType === 2 && arc) arc.a1 = parseFloat(p.value); break;
      case 73: if (inBoundary && edgeType === 2 && arc) arc.ccw = parseInt(p.value, 10); break;
      case 42: if (inBoundary && loop && loop.bulges.length) loop.bulges[loop.bulges.length - 1] = parseFloat(p.value); break;
      case 75: case 76: case 47: case 98: inBoundary = inBoundary && p.code < 47; break;
      default: break;
    }
  }
  if (cur) { flushLoop(); out.push(cur); }
  return out;
}

function ringArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/* ------------------------------------------------------------------ Splines */

function deBoor(points: Pt[], degree: number, knots: number[], samples: number): Pt[] {
  const n = points.length - 1;
  const p = Math.max(1, Math.min(degree, n));
  if (!knots || knots.length !== n + p + 2) return points;
  const out: Pt[] = [];
  const t0 = knots[p], t1 = knots[n + 1];
  for (let s = 0; s <= samples; s++) {
    const t = t0 + ((t1 - t0) * s) / samples;
    let k = p;
    while (k < n && t >= knots[k + 1]) k++;
    const d: Pt[] = [];
    for (let j = 0; j <= p; j++) d[j] = { ...points[Math.min(Math.max(k - p + j, 0), n)] };
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = k - p + j;
        const den = knots[i + p - r + 1] - knots[i];
        const a = den === 0 ? 0 : (t - knots[i]) / den;
        d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y };
      }
    }
    out.push(d[p]);
  }
  return out;
}

/* --------------------------------------------------------------- Hauptlauf */

export function importDxfToSnapshots(text: string, opts: DxfImportOptions = {}): DxfImportResult {
  const units = detectDxfUnits(text);
  const upm = opts.unitsPerMeter && opts.unitsPerMeter > 0 ? opts.unitsPerMeter : units.unitsPerMeter;
  const simplified = new Map<string, number>();
  const skipped = new Map<string, number>();
  const note = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) || 0) + 1);
  const snapshots: LibraryGeometrySnapshot[] = [];

  const fail = (msg: string): DxfImportResult => ({
    snapshots: [], simplified: [], skipped: [], warnings: [msg], units, failed: msg,
  });

  if (/^\s*AutoCAD Binary DXF/i.test(text.slice(0, 40)) || /\u0000/.test(text.slice(0, 512))) {
    return fail("Binäre DXF-Dateien werden nicht unterstützt. Bitte die Datei als ASCII-DXF (DXF R12–2018, Text) speichern.");
  }

  let dxf: any;
  try {
    dxf = new (DxfParser as any)().parseSync(text.trim());
  } catch (e: any) {
    return fail("Die DXF-Datei konnte nicht gelesen werden: " + (e?.message || "unbekannter Fehler"));
  }
  if (!dxf) return fail("Die DXF-Datei konnte nicht gelesen werden.");

  /* ---------------------------------------------------------- Layerfarben */
  const layerColor = new Map<string, string>();
  const layers = dxf.tables?.layer?.layers || {};
  for (const name of Object.keys(layers)) {
    const l: any = layers[name];
    if (typeof l?.color === "number" && l.color >= 0) layerColor.set(name, trueColorToHex(l.color));
    else if (typeof l?.colorIndex === "number") layerColor.set(name, aciToHex(l.colorIndex));
  }

  const colorOf = (e: any): string => {
    if (typeof e?.color === "number" && e.color >= 0) return trueColorToHex(e.color);
    if (typeof e?.colorIndex === "number" && e.colorIndex > 0 && e.colorIndex < 256) return aciToHex(e.colorIndex);
    const lc = layerColor.get(e?.layer);
    return lc || "#000000";
  };

  /* ----------------------------------------------------- Basis-Hilfsmittel */
  const w = (m: Mat, p: Pt): Pt => {
    const q = apply(m, p);
    return { x: q.x / upm, y: -q.y / upm };
  };
  const pixBulge = (dxfBulge: number, m: Mat) => {
    // Achsenspiegelung ist in der Umrechnung enthalten (det < 0 ⇒ Vorzeichen dreht).
    const sign = det(m) * -1 < 0 ? -1 : 1;
    return (sign * dxfBulge) / 2;
  };
  const thicknessOf = (e: any, m: Mat) => {
    const lw = typeof e?.lineweight === "number" && e.lineweight > 0 ? (e.lineweight / 100) / 1000 : 0.002;
    return Math.max(0.0005, lw * matScale(m));
  };

  const pushSegment = (a: Pt, b: Pt, bulge: number, e: any, m: Mat) => {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-12 && !bulge) return;
    snapshots.push({
      kind: "segment",
      data: {
        a, b,
        color: colorOf(e),
        thicknessM: thicknessOf(e, m),
        bulge: bulge || 0,
        isGuide: false,
        sourceLayer: e?.layer || "0",
      },
    });
  };

  const pushPolygon = (pts: Pt[], bulges: number[], e: any, m: Mat, fill?: { color: string; alphaPct: number }, holes: Pt[][] = [], holeBulges: number[][] = []) => {
    if (pts.length < 3) return;
    snapshots.push({
      kind: "hatch",
      data: {
        points: pts,
        holes,
        fillColor: fill?.color || colorOf(e),
        strokeColor: colorOf(e),
        fillAlphaPct: fill ? fill.alphaPct : 0,
        strokeWidthPx: 1,
        areaLabel: {},
        patternEnabled: false,
        bulges,
        holeBulges,
        isPolygon: true,
        closed: true,
        sourceLayer: e?.layer || "0",
      },
    });
  };

  const pushText = (txt: string, anchor: Pt, heightDxf: number, rotationRad: number, e: any, m: Mat) => {
    const clean = String(txt || "")
      .replace(/\\P/g, " ")
      .replace(/\\[A-Za-z][^;]*;/g, "")
      .replace(/[{}]/g, "")
      .trim();
    if (!clean) return;
    const sizeM = Math.max(0.005, (heightDxf * matScale(m)) / upm);
    const widthM = Math.max(sizeM, clean.length * sizeM * 0.6);
    snapshots.push({
      kind: "textBox",
      data: {
        center: { x: anchor.x + widthM / 2, y: anchor.y - sizeM / 2 },
        widthM,
        heightM: sizeM * 1.4,
        rotationRad: -rotationRad,
        html: clean.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)),
        style: { color: colorOf(e) },
        sourceLayer: e?.layer || "0",
      },
    });
  };

  /** Kreisbogen in PixunaCAD-Segmente mit Bogeninformation zerlegen. */
  const pushArc = (center: Pt, r: number, startRad: number, sweepRad: number, e: any, m: Mat) => {
    if (r <= 0 || Math.abs(sweepRad) < 1e-9) return;
    const parts = Math.max(1, Math.ceil(Math.abs(sweepRad) / (Math.PI / 2)));
    const step = sweepRad / parts;
    const dxfBulge = Math.tan(step / 4);
    for (let i = 0; i < parts; i++) {
      const a0 = startRad + step * i, a1 = a0 + step;
      const p0 = w(m, { x: center.x + r * Math.cos(a0), y: center.y + r * Math.sin(a0) });
      const p1 = w(m, { x: center.x + r * Math.cos(a1), y: center.y + r * Math.sin(a1) });
      pushSegment(p0, p1, pixBulge(dxfBulge, m), e, m);
    }
  };

  const pushPolyline = (verts: any[], closed: boolean, e: any, m: Mat) => {
    const pts = verts.map((v: any) => w(m, { x: v.x || 0, y: v.y || 0 }));
    const bulges = verts.map((v: any) => pixBulge(v.bulge || 0, m));
    if (pts.length < 2) return;
    if (closed && pts.length >= 3) {
      pushPolygon(pts, bulges, e, m);
      return;
    }
    for (let i = 0; i + 1 < pts.length; i++) pushSegment(pts[i], pts[i + 1], bulges[i], e, m);
  };

  /* ------------------------------------------------------------- Entitäten */
  const blocks = dxf.blocks || {};
  const seenBlocks: string[] = [];

  const handle = (e: any, m: Mat, depth: number) => {
    if (!e || !e.type) return;
    switch (e.type) {
      case "LINE": {
        const v0 = e.vertices?.[0], v1 = e.vertices?.[1];
        if (!v0 || !v1) return;
        pushSegment(w(m, v0), w(m, v1), 0, e, m);
        return;
      }
      case "LWPOLYLINE":
        pushPolyline(e.vertices || [], !!(e.shape || e.closed), e, m);
        return;
      case "POLYLINE":
        if (e.polyfaceMesh || e.polygonMesh) { note(skipped, "3D-Netz (POLYLINE)"); return; }
        pushPolyline(e.vertices || [], !!(e.shape || e.closed), e, m);
        return;
      case "ARC": {
        const c = e.center; if (!c) return;
        const s = e.startAngle ?? 0, en = e.endAngle ?? Math.PI * 2;
        let sweep = en - s;
        while (sweep <= 0) sweep += Math.PI * 2;
        pushArc(c, e.radius || 0, s, sweep, e, m);
        return;
      }
      case "CIRCLE": {
        const c = e.center; if (!c) return;
        // Vier verbundene Bogensegmente statt grober Polygon-Näherung.
        pushArc(c, e.radius || 0, 0, Math.PI * 2, e, m);
        return;
      }
      case "ELLIPSE": {
        const c = e.center; if (!c) return;
        const ax = e.majorAxisEndPoint || { x: 1, y: 0 };
        const ratio = e.axisRatio ?? 1;
        const a0 = e.startAngle ?? 0;
        const a1 = e.endAngle ?? Math.PI * 2;
        let sweep = a1 - a0;
        while (sweep <= 1e-9) sweep += Math.PI * 2;
        const rMaj = Math.hypot(ax.x, ax.y);
        const rot = Math.atan2(ax.y, ax.x);
        const steps = Math.max(24, Math.ceil((sweep / (Math.PI * 2)) * 96));
        const pts: Pt[] = [];
        for (let i = 0; i <= steps; i++) {
          const t = a0 + (sweep * i) / steps;
          const x = rMaj * Math.cos(t), y = rMaj * ratio * Math.sin(t);
          pts.push(w(m, { x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot) }));
        }
        note(simplified, "Ellipse als feine Kurvennäherung");
        const closed = sweep >= Math.PI * 2 - 1e-6;
        if (closed) pushPolygon(pts.slice(0, -1), pts.slice(0, -1).map(() => 0), e, m);
        else for (let i = 0; i + 1 < pts.length; i++) pushSegment(pts[i], pts[i + 1], 0, e, m);
        return;
      }
      case "SPLINE": {
        const cps: Pt[] = (e.controlPoints || []).map((p: any) => ({ x: p.x, y: p.y }));
        const fits: Pt[] = (e.fitPoints || []).map((p: any) => ({ x: p.x, y: p.y }));
        let curve: Pt[] = [];
        if (cps.length >= 2) {
          const samples = Math.max(32, cps.length * 12);
          curve = deBoor(cps, e.degreeOfSplineCurve || 3, e.knotValues || [], samples);
        } else curve = fits;
        if (curve.length < 2) { note(skipped, "SPLINE ohne verwertbare Punkte"); return; }
        note(simplified, "SPLINE als geglätteter Linienzug angenähert");
        const pts = curve.map((p) => w(m, p));
        if (e.closed) pushPolygon(pts, pts.map(() => 0), e, m);
        else for (let i = 0; i + 1 < pts.length; i++) pushSegment(pts[i], pts[i + 1], 0, e, m);
        return;
      }
      case "TEXT": {
        const p = e.startPoint || e.position;
        if (!p) return;
        pushText(e.text, w(m, p), e.textHeight || e.height || 0.2, e.rotation ? (e.rotation * Math.PI) / 180 : 0, e, m);
        return;
      }
      case "MTEXT": {
        const p = e.position || e.startPoint;
        if (!p) return;
        pushText(e.text, w(m, p), e.height || 0.2, e.rotation || 0, e, m);
        return;
      }
      case "INSERT": {
        if (depth > 8) { note(skipped, "zu tief verschachtelter Block"); return; }
        const block = blocks[e.name];
        if (!block || !block.entities) { note(skipped, `Block „${e.name}“ ohne Definition`); return; }
        if (!seenBlocks.includes(e.name)) seenBlocks.push(e.name);
        const sx = e.xScale ?? 1, sy = e.yScale ?? 1;
        const rot = e.rotation ? (e.rotation * Math.PI) / 180 : 0;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const bp = block.position || { x: 0, y: 0 };
        const local: Mat = mul(
          [1, 0, 0, 1, e.position?.x || 0, e.position?.y || 0],
          mul([cos, sin, -sin, cos, 0, 0], mul([sx, 0, 0, sy, 0, 0], [1, 0, 0, 1, -(bp.x || 0), -(bp.y || 0)])),
        );
        const next = mul(m, local);
        for (const child of block.entities) handle(child, next, depth + 1);
        return;
      }
      case "POINT": note(skipped, "Punktobjekt (POINT)"); return;
      case "HATCH": return; // separat aus den Rohdaten gelesen
      case "DIMENSION": note(skipped, "DXF-Bemaßung (DIMENSION)"); return;
      case "IMAGE": note(skipped, "Bildreferenz"); return;
      case "SOLID":
      case "3DFACE": {
        const vs = (e.points || e.vertices || []).map((p: any) => w(m, p));
        if (vs.length >= 3) { pushPolygon(vs, vs.map(() => 0), e, m, { color: colorOf(e), alphaPct: 100 }); note(simplified, "Fläche (SOLID/3DFACE) als Polygon"); }
        return;
      }
      default:
        note(skipped, `unbekanntes DXF-Objekt (${e.type})`);
    }
  };

  for (const e of dxf.entities || []) handle(e, IDENT, 0);

  /* ---------------------------------------------------------------- HATCH */
  for (const h of parseRawHatches(text)) {
    if (h.loops.length === 0) continue;
    const loops = [...h.loops].sort((a, b) => ringArea(b.pts) - ringArea(a.pts));
    const m = IDENT;
    const color = h.trueColor != null ? trueColorToHex(h.trueColor)
      : h.colorIndex != null && h.colorIndex > 0 ? aciToHex(h.colorIndex)
      : layerColor.get(h.layer) || "#808080";
    const outer = loops[0];
    const holes = loops.slice(1);
    if (!h.solid) note(simplified, "Musterschraffur als einfarbige Fläche");
    pushPolygon(
      outer.pts.map((p) => w(m, p)),
      outer.bulges.map((b) => pixBulge(b, m)),
      { layer: h.layer, color: -1 },
      m,
      { color, alphaPct: 100 },
      holes.map((l) => l.pts.map((p) => w(m, p))),
      holes.map((l) => l.bulges.map((b) => pixBulge(b, m))),
    );
    snapshots[snapshots.length - 1].data.strokeColor = color;
  }

  const fmt = (map: Map<string, number>, verb: string) =>
    [...map.entries()].map(([k, n]) => `${n}× ${k} ${verb}.`);
  const simplifiedList = fmt(simplified, "vereinfacht übernommen");
  const skippedList = fmt(skipped, "nicht übernommen");

  return {
    snapshots,
    simplified: simplifiedList,
    skipped: skippedList,
    warnings: [...simplifiedList, ...skippedList],
    units: opts.unitsPerMeter && opts.unitsPerMeter > 0
      ? { ...units, unitsPerMeter: opts.unitsPerMeter, assumed: false }
      : units,
  };
}
