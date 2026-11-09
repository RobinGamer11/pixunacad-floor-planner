/**
 * Vektor-PDF-Aufzeichnung: ein Canvas-2D-kompatibler Context, der alle
 * Zeichenbefehle des normalen CAD-Renderers in PDF-Inhaltsoperatoren
 * übersetzt. Linien, Kurven, Flächen, Texte und geometrische Musterkacheln
 * bleiben Vektoren; Fotos/Bildmuster werden als Bilder eingebettet,
 * eingefügte PDF-Seiten als Original-Seite (Form-XObject).
 *
 * Koordinaten: Pfadpunkte werden zum Zeitpunkt der Pfadbildung mit der
 * aktuellen Context-Matrix in den Recorder-Raum (lokale Pixel) überführt;
 * die äußere Matrix (lokale Pixel → PDF-Punkte) setzt der Aufrufer per `cm`.
 * Dieselbe Matrix gilt damit für Vektoren, Bilder und PDF-Seiten.
 */
import { PDFDocument, PDFPage, PDFName, PDFDict, PDFRef, PDFOperator, PDFArray, PDFNumber, StandardFonts, type PDFFont, type PDFEmbeddedPage } from "pdf-lib";
import { vectorTileSource, drawVectorPatternTile } from "../hatchPatterns";

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

/** A∘B (B zuerst angewandt) — Canvas-/PDF-Konvention [a b c d e f]. */
export function matMul(A: Mat, B: Mat): Mat {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
}
function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function inv(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
const n = (v: number) => {
  if (!Number.isFinite(v)) return "0";
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? "0" : String(r);
};
const matStr = (m: Mat) => m.map(n).join(" ");

interface RGBA { r: number; g: number; b: number; a: number }

let _colorCtx: CanvasRenderingContext2D | null | undefined;
const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  gray: "#808080", grey: "#808080", yellow: "#ffff00", orange: "#ffa500", transparent: "rgba(0,0,0,0)",
};
/** CSS-Farbe → RGBA (0..1). Unbekannt → Schwarz. */
export function parseCssColor(input: string): RGBA {
  let s = String(input || "").trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map(c => c + c).join("");
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { r: v(0), g: v(2), b: v(4), a: h.length >= 8 ? v(6) : 1 };
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const ch = (x: string) => x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x) / 255;
    const al = p[3] != null ? (p[3].endsWith("%") ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    return { r: ch(p[0]), g: ch(p[1]), b: ch(p[2]), a: Number.isFinite(al) ? al : 1 };
  }
  m = s.match(/^hsla?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const h = ((parseFloat(p[0]) % 360) + 360) % 360 / 360;
    const sat = parseFloat(p[1]) / 100, l = parseFloat(p[2]) / 100;
    const al = p[3] != null ? (p[3].endsWith("%") ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, pp = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return pp + (q - pp) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6;
      return pp;
    };
    return { r: f(h + 1 / 3), g: f(h), b: f(h - 1 / 3), a: Number.isFinite(al) ? al : 1 };
  }
  // Fallback über den Browser (benannte Farben etc.).
  if (_colorCtx === undefined) {
    try { _colorCtx = document.createElement("canvas").getContext("2d"); } catch { _colorCtx = null; }
  }
  if (_colorCtx) {
    _colorCtx.fillStyle = "#000000";
    _colorCtx.fillStyle = s;
    const out = String(_colorCtx.fillStyle);
    if (out !== s && (out.startsWith("#") || out.startsWith("rgb"))) return parseCssColor(out);
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Musterobjekt (createPattern) — merkt Kachel und Transform. */
export class RecPattern {
  t: Mat = [...IDENTITY] as Mat;
  constructor(public image: any, public repetition: string | null) {}
  setTransform(m?: any) {
    if (!m) { this.t = [...IDENTITY] as Mat; return; }
    this.t = [m.a ?? 1, m.b ?? 0, m.c ?? 0, m.d ?? 1, m.e ?? 0, m.f ?? 0];
  }
}
/** Verlaufsobjekt — im PDF als mittlerer Farbton der Stopps. */
export class RecGradient {
  stops: RGBA[] = [];
  addColorStop(_o: number, c: string) { this.stops.push(parseCssColor(c)); }
  average(): RGBA {
    if (!this.stops.length) return { r: 0.5, g: 0.5, b: 0.5, a: 0.3 };
    const s = this.stops.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b, a: a.a + c.a }), { r: 0, g: 0, b: 0, a: 0 });
    const k = this.stops.length;
    return { r: s.r / k, g: s.g / k, b: s.b / k, a: s.a / k };
  }
}

interface RecState {
  m: Mat;
  fillStyle: any; strokeStyle: any;
  lineWidth: number; lineCap: string; lineJoin: string; miterLimit: number;
  dash: number[]; lineDashOffset: number;
  globalAlpha: number; globalCompositeOperation: string;
  font: string; textAlign: string; textBaseline: string;
}

type Part = string | (() => Promise<string>);

/** Gemeinsame PDF-Ressourcen (Fonts, Transparenzen, Bilder) einer Seite. */
export class PdfResourceBook {
  private gs = new Map<string, string>();
  private images = new Map<any, Promise<string | null>>();
  private fontNames = new Map<PDFFont, string>();
  private patternDict: PDFDict | null = null;
  private counter = 0;
  /** Für Muster-Kacheln: Name → Ref aller angelegten Ressourcen. */
  readonly refs = { ExtGState: new Map<string, PDFRef>(), XObject: new Map<string, PDFRef>(), Font: new Map<string, PDFRef>() };
  constructor(public pdf: PDFDocument, public page: PDFPage, public fonts: Record<string, PDFFont>,
    public pdfPages: Map<string, PDFEmbeddedPage>) {}

  static async create(pdf: PDFDocument, page: PDFPage, pdfPages = new Map<string, PDFEmbeddedPage>()) {
    const fonts = {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    };
    return new PdfResourceBook(pdf, page, fonts, pdfPages);
  }

  gsName(fillA: number, strokeA: number, blend: string | null): string {
    const fa = Math.max(0, Math.min(1, fillA)), sa = Math.max(0, Math.min(1, strokeA));
    const key = `${fa.toFixed(3)}|${sa.toFixed(3)}|${blend || ""}`;
    const hit = this.gs.get(key);
    if (hit) return hit;
    const o: any = { Type: "ExtGState", ca: fa, CA: sa };
    if (blend) o.BM = blend;
    const ref = this.pdf.context.register(this.pdf.context.obj(o));
    const name = this.page.node.newExtGState("PxGS", ref).asString().slice(1);
    this.refs.ExtGState.set(name, ref);
    this.gs.set(key, name);
    return name;
  }

  fontName(f: PDFFont): string {
    const hit = this.fontNames.get(f);
    if (hit) return hit;
    const name = this.page.node.newFontDictionary("PxF", f.ref).asString().slice(1);
    this.refs.Font.set(name, f.ref);
    this.fontNames.set(f, name);
    return name;
  }

  xobjectName(ref: PDFRef): string {
    const name = this.page.node.newXObject("PxIm", ref).asString().slice(1);
    this.refs.XObject.set(name, ref);
    return name;
  }

  /** Bildquelle (Image/Canvas, optional Teilrechteck) → XObject-Name. */
  imageName(src: any, crop?: [number, number, number, number]): Promise<string | null> {
    const key = crop ? undefined : src;
    if (key && this.images.has(key)) return this.images.get(key)!;
    const job = (async () => {
      try {
        const sw = crop ? crop[2] : (src.naturalWidth || src.videoWidth || src.width || 0);
        const sh = crop ? crop[3] : (src.naturalHeight || src.videoHeight || src.height || 0);
        if (!(sw >= 1 && sh >= 1)) return null;
        const f = Math.min(1, 4096 / Math.max(sw, sh));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(sw * f));
        c.height = Math.max(1, Math.round(sh * f));
        const g = c.getContext("2d");
        if (!g) return null;
        g.imageSmoothingEnabled = true;
        if (crop) g.drawImage(src, crop[0], crop[1], crop[2], crop[3], 0, 0, c.width, c.height);
        else g.drawImage(src, 0, 0, c.width, c.height);
        const img = await this.pdf.embedPng(c.toDataURL("image/png"));
        return this.xobjectName(img.ref);
      } catch { return null; }
    })();
    if (key) this.images.set(key, job);
    return job;
  }

  patternName(ref: PDFRef): string {
    const res = this.page.node.normalizedEntries().Resources;
    if (!this.patternDict) {
      const existing = res.lookupMaybe(PDFName.of("Pattern"), PDFDict);
      this.patternDict = existing ?? this.pdf.context.obj({});
      if (!existing) res.set(PDFName.of("Pattern"), this.patternDict);
    }
    const name = `PxP${++this.counter}`;
    this.patternDict.set(PDFName.of(name), ref);
    return name;
  }

  /** Ressourcen-Dict für Musterkacheln (alle bisher bekannten Namen). */
  resourceDictFor(names: { gs: Set<string>; xo: Set<string>; font: Set<string> }): PDFDict {
    const ctx = this.pdf.context;
    const pick = (src: Map<string, PDFRef>, want: Set<string>) => {
      const d = ctx.obj({});
      for (const k of want) { const r = src.get(k); if (r) d.set(PDFName.of(k), r); }
      return d;
    };
    const dict = ctx.obj({});
    dict.set(PDFName.of("ExtGState"), pick(this.refs.ExtGState, names.gs));
    dict.set(PDFName.of("XObject"), pick(this.refs.XObject, names.xo));
    dict.set(PDFName.of("Font"), pick(this.refs.Font, names.font));
    return dict;
  }
}

const TAU = Math.PI * 2;

/**
 * Canvas-2D-kompatibler Aufzeichner. Nur die vom CAD-Renderer genutzten
 * Befehle sind abgebildet; alles andere ist ein stilles No-op.
 */
export class PdfCanvasRecorder {
  readonly __vectorRecorder = true;
  readonly canvas: any;
  private parts: Part[] = [];
  private st: RecState;
  private stack: RecState[] = [];
  private path: string[] = [];
  private cur: [number, number] | null = null; // Gerät
  private curUser: [number, number] | null = null;
  private start: [number, number] | null = null;
  private startUser: [number, number] | null = null;
  readonly used = { gs: new Set<string>(), xo: new Set<string>(), font: new Set<string>() };
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "high";
  shadowBlur = 0; shadowColor = "transparent"; shadowOffsetX = 0; shadowOffsetY = 0;
  filter = "none"; direction = "ltr"; letterSpacing = "0px"; fontKerning = "auto";
  private measureCtx: CanvasRenderingContext2D | null | undefined;

  constructor(public book: PdfResourceBook, width: number, height: number) {
    this.canvas = { width, height, clientWidth: width, clientHeight: height, style: {} };
    this.st = {
      m: [...IDENTITY] as Mat, fillStyle: "#000000", strokeStyle: "#000000",
      lineWidth: 1, lineCap: "butt", lineJoin: "miter", miterLimit: 10,
      dash: [], lineDashOffset: 0, globalAlpha: 1, globalCompositeOperation: "source-over",
      font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic",
    };
  }

  // ---------- Zustand ----------
  get fillStyle() { return this.st.fillStyle; } set fillStyle(v: any) { this.st.fillStyle = v; }
  get strokeStyle() { return this.st.strokeStyle; } set strokeStyle(v: any) { this.st.strokeStyle = v; }
  get lineWidth() { return this.st.lineWidth; } set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.st.lineWidth = v; }
  get lineCap() { return this.st.lineCap; } set lineCap(v: any) { this.st.lineCap = v; }
  get lineJoin() { return this.st.lineJoin; } set lineJoin(v: any) { this.st.lineJoin = v; }
  get miterLimit() { return this.st.miterLimit; } set miterLimit(v: number) { if (v > 0) this.st.miterLimit = v; }
  get lineDashOffset() { return this.st.lineDashOffset; } set lineDashOffset(v: number) { this.st.lineDashOffset = v || 0; }
  get globalAlpha() { return this.st.globalAlpha; } set globalAlpha(v: number) { if (Number.isFinite(v)) this.st.globalAlpha = Math.max(0, Math.min(1, v)); }
  get globalCompositeOperation() { return this.st.globalCompositeOperation; } set globalCompositeOperation(v: any) { this.st.globalCompositeOperation = v; }
  get font() { return this.st.font; } set font(v: string) { this.st.font = v; }
  get textAlign() { return this.st.textAlign; } set textAlign(v: any) { this.st.textAlign = v; }
  get textBaseline() { return this.st.textBaseline; } set textBaseline(v: any) { this.st.textBaseline = v; }

  save() { this.stack.push({ ...this.st, m: [...this.st.m] as Mat, dash: [...this.st.dash] }); this.parts.push("q\n"); }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.st = s;
    this.parts.push("Q\n");
  }
  reset() { while (this.stack.length) this.restore(); this.beginPath(); }

  // ---------- Transform ----------
  setTransform(a: any = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    if (typeof a === "object" && a) this.st.m = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
    else this.st.m = [a, b, c, d, e, f];
  }
  resetTransform() { this.st.m = [...IDENTITY] as Mat; }
  getTransform() { const m = this.st.m; return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5], is2D: true }; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) { this.st.m = matMul(this.st.m, [a, b, c, d, e, f]); }
  translate(x: number, y: number) { this.st.m = matMul(this.st.m, [1, 0, 0, 1, x, y]); }
  scale(x: number, y: number) { this.st.m = matMul(this.st.m, [x, 0, 0, y, 0, 0]); }
  rotate(a: number) { const c = Math.cos(a), s = Math.sin(a); this.st.m = matMul(this.st.m, [c, s, -s, c, 0, 0]); }

  // ---------- Pfade ----------
  beginPath() { this.path = []; this.cur = null; this.curUser = null; this.start = null; this.startUser = null; }
  moveTo(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const p = apply(this.st.m, x, y);
    this.path.push(`${n(p[0])} ${n(p[1])} m`);
    this.cur = p; this.start = p; this.curUser = [x, y]; this.startUser = [x, y];
  }
  lineTo(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!this.cur) { this.moveTo(x, y); return; }
    const p = apply(this.st.m, x, y);
    this.path.push(`${n(p[0])} ${n(p[1])} l`);
    this.cur = p; this.curUser = [x, y];
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    if (!this.cur) this.moveTo(x1, y1);
    const a = apply(this.st.m, x1, y1), b = apply(this.st.m, x2, y2), p = apply(this.st.m, x, y);
    this.path.push(`${n(a[0])} ${n(a[1])} ${n(b[0])} ${n(b[1])} ${n(p[0])} ${n(p[1])} c`);
    this.cur = p; this.curUser = [x, y];
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    if (!this.curUser) this.moveTo(cx, cy);
    const [x0, y0] = this.curUser!;
    this.bezierCurveTo(x0 + (2 / 3) * (cx - x0), y0 + (2 / 3) * (cy - y0), x + (2 / 3) * (cx - x), y + (2 / 3) * (cy - y), x, y);
  }
  closePath() {
    if (!this.cur) return;
    this.path.push("h");
    this.cur = this.start; this.curUser = this.startUser;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath();
  }
  roundRect(x: number, y: number, w: number, h: number, radii?: any) {
    let r = Array.isArray(radii) ? Number(typeof radii[0] === "object" ? radii[0]?.x : radii[0]) : Number(typeof radii === "object" && radii ? radii.x : radii);
    if (!Number.isFinite(r) || r <= 0) { this.rect(x, y, w, h); return; }
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y); this._ellArc(x + w - r, y + r, r, r, 0, -Math.PI / 2, Math.PI / 2, false);
    this.lineTo(x + w, y + h - r); this._ellArc(x + w - r, y + h - r, r, r, 0, 0, Math.PI / 2, false);
    this.lineTo(x + r, y + h); this._ellArc(x + r, y + h - r, r, r, 0, Math.PI / 2, Math.PI / 2, false);
    this.lineTo(x, y + r); this._ellArc(x + r, y + r, r, r, 0, Math.PI, Math.PI / 2, false);
    this.closePath();
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) {
    if (!(rx >= 0 && ry >= 0)) return;
    let sweep = a1 - a0;
    if (!ccw) { if (sweep >= TAU) sweep = TAU; else { sweep %= TAU; if (sweep < 0) sweep += TAU; } }
    else { if (-sweep >= TAU) sweep = -TAU; else { sweep %= TAU; if (sweep > 0) sweep -= TAU; } }
    this._ellArc(x, y, rx, ry, rot, a0, sweep, true);
  }
  /** Bogen in Benutzerkoordinaten; verbindet mit Linie zum Startpunkt. */
  private _ellArc(cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, sweep: number, connect = true) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const pt = (t: number): [number, number] => {
      const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      return [cx + ex * cr - ey * sr, cy + ex * sr + ey * cr];
    };
    const dv = (t: number): [number, number] => {
      const ex = -rx * Math.sin(t), ey = ry * Math.cos(t);
      return [ex * cr - ey * sr, ex * sr + ey * cr];
    };
    const p0 = pt(a0);
    if (this.cur && connect) this.lineTo(p0[0], p0[1]); else if (!this.cur) this.moveTo(p0[0], p0[1]); else this.lineTo(p0[0], p0[1]);
    const segs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const d = sweep / segs;
    const k = (4 / 3) * Math.tan(d / 4);
    let t = a0;
    for (let i = 0; i < segs; i++) {
      const t1 = t + d;
      const s = pt(t), e = pt(t1), ds = dv(t), de = dv(t1);
      this.bezierCurveTo(s[0] + k * ds[0], s[1] + k * ds[1], e[0] - k * de[0], e[1] - k * de[1], e[0], e[1]);
      t = t1;
    }
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    if (!this.curUser) { this.moveTo(x1, y1); return; }
    const [x0, y0] = this.curUser;
    const v1x = x0 - x1, v1y = y0 - y1, v2x = x2 - x1, v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    const cross = v1x * v2y - v1y * v2x;
    if (r <= 0 || l1 < 1e-12 || l2 < 1e-12 || Math.abs(cross) < 1e-12) { this.lineTo(x1, y1); return; }
    const u1x = v1x / l1, u1y = v1y / l1, u2x = v2x / l2, u2y = v2y / l2;
    const cosT = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const theta = Math.acos(cosT);
    const dist = r / Math.tan(theta / 2);
    const t1x = x1 + u1x * dist, t1y = y1 + u1y * dist;
    const t2x = x1 + u2x * dist, t2y = y1 + u2y * dist;
    let bx = u1x + u2x, by = u1y + u2y; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const cd = r / Math.sin(theta / 2);
    const ccx = x1 + bx * cd, ccy = y1 + by * cd;
    const a0 = Math.atan2(t1y - ccy, t1x - ccx), a1 = Math.atan2(t2y - ccy, t2x - ccx);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= TAU;
    while (sweep < -Math.PI) sweep += TAU;
    this.lineTo(t1x, t1y);
    this._ellArc(ccx, ccy, r, r, 0, a0, sweep, true);
  }

  // ---------- Malen ----------
  private _skip(): boolean {
    const op = this.st.globalCompositeOperation;
    return op === "destination-out" || op === "destination-in" || op === "clear" || op === "copy" || op === "xor";
  }
  private _blend(): string | null { return this.st.globalCompositeOperation === "multiply" ? "Multiply" : null; }
  private _gs(fa: number, sa: number) {
    const name = this.book.gsName(fa, sa, this._blend());
    this.used.gs.add(name);
    return `/${name} gs`;
  }
  private _lwScale() { const m = this.st.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }
  private _strokeParams(): string {
    const k = this._lwScale();
    const cap = this.st.lineCap === "round" ? 1 : this.st.lineCap === "square" ? 2 : 0;
    const join = this.st.lineJoin === "round" ? 1 : this.st.lineJoin === "bevel" ? 2 : 0;
    let dash = this.st.dash;
    if (dash.length % 2 === 1) dash = [...dash, ...dash];
    const ds = dash.length && dash.some(v => v > 0) ? `[${dash.map(v => n(v * k)).join(" ")}] ${n(this.st.lineDashOffset * k)} d` : "[] 0 d";
    return `${n(Math.max(0.01, this.st.lineWidth * k))} w ${cap} J ${join} j ${n(this.st.miterLimit)} M ${ds}`;
  }
  private _color(style: any): RGBA | null {
    if (typeof style === "string") return parseCssColor(style);
    if (style instanceof RecGradient) return style.average();
    return null;
  }

  fill(a?: any, _b?: any) {
    const rule = a === "evenodd" || _b === "evenodd";
    if (!this.path.length || this._skip()) return;
    this._paintFill(this.path.join(" "), rule);
  }
  private _paintFill(path: string, evenodd: boolean) {
    const style = this.st.fillStyle;
    const op = evenodd ? "f*" : "f";
    if (style instanceof RecPattern) { this._patternFill(path, op, style); return; }
    const c = this._color(style);
    if (!c) return;
    const a = c.a * this.st.globalAlpha;
    if (a <= 0.001) return;
    this.parts.push(`q ${this._gs(a, 1)} ${n(c.r)} ${n(c.g)} ${n(c.b)} rg\n${path} ${op}\nQ\n`);
  }
  stroke() {
    if (!this.path.length || this._skip()) return;
    this._paintStroke(this.path.join(" "));
  }
  private _paintStroke(path: string) {
    let c = this._color(this.st.strokeStyle);
    if (!c && this.st.strokeStyle instanceof RecPattern) c = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    if (!c) return;
    const a = c.a * this.st.globalAlpha;
    if (a <= 0.001) return;
    this.parts.push(`q ${this._gs(1, a)} ${n(c.r)} ${n(c.g)} ${n(c.b)} RG ${this._strokeParams()}\n${path} S\nQ\n`);
  }
  clip(a?: any) {
    const rule = a === "evenodd";
    if (!this.path.length) { this.parts.push("0 0 m h W n\n"); return; }
    this.parts.push(`${this.path.join(" ")} ${rule ? "W*" : "W"} n\n`);
  }
  private _rectPath(x: number, y: number, w: number, h: number): string {
    const m = this.st.m;
    const p = [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)];
    return `${n(p[0][0])} ${n(p[0][1])} m ${n(p[1][0])} ${n(p[1][1])} l ${n(p[2][0])} ${n(p[2][1])} l ${n(p[3][0])} ${n(p[3][1])} l h`;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    if (this._skip() || !(Math.abs(w) > 0 && Math.abs(h) > 0)) return;
    this._paintFill(this._rectPath(x, y, w, h), false);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    if (this._skip()) return;
    this._paintStroke(this._rectPath(x, y, w, h));
  }
  clearRect() { /* transparenter Grund: nichts zu tun */ }
  setLineDash(d: number[]) { this.st.dash = Array.isArray(d) ? d.filter(v => Number.isFinite(v) && v >= 0) : []; }
  getLineDash() { return [...this.st.dash]; }
  isPointInPath() { return false; }
  isPointInStroke() { return false; }
  drawFocusIfNeeded() {}
  getImageData(_x: number, _y: number, w: number, h: number) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }; }
  putImageData() {}
  createImageData(w: number, h: number) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }; }

  createPattern(image: any, repetition: string | null) { return image ? new RecPattern(image, repetition) : null; }
  createLinearGradient() { return new RecGradient(); }
  createRadialGradient() { return new RecGradient(); }
  createConicGradient() { return new RecGradient(); }

  /** Musterfüllung als PDF-Kachelmuster (Vektor bei geometrischen Mustern). */
  private _patternFill(path: string, op: string, pat: RecPattern) {
    const img = pat.image;
    const w = img?.naturalWidth || img?.width || 0;
    const h = img?.naturalHeight || img?.height || 0;
    if (!(w > 0 && h > 0)) return;
    const a = this.st.globalAlpha;
    if (a <= 0.001) return;
    const gs = this._gs(a, a);
    const fullM = matMul(this.st.m, pat.t);
    const book = this.book;
    const outer = () => this.outer;
    const vec = vectorTileSource(img);
    let tileOps: string | null = null;
    let tileUsed: PdfCanvasRecorder["used"] | null = null;
    if (vec) {
      const sub = new PdfCanvasRecorder(book, w, h);
      try { drawVectorPatternTile(sub as any, vec); tileOps = sub.syncContent(); tileUsed = sub.used; }
      catch { tileOps = null; }
    }
    this.parts.push(async () => {
      let content = tileOps;
      const used = tileUsed ?? { gs: new Set<string>(), xo: new Set<string>(), font: new Set<string>() };
      if (content == null) {
        const name = await book.imageName(img);
        if (!name) return "";
        used.xo.add(name);
        content = `q ${n(w)} 0 0 ${n(-h)} 0 ${n(h)} cm /${name} Do Q`;
      }
      const ctx = book.pdf.context;
      const M = matMul(outer(), fullM);
      const dict = ctx.obj({
        Type: "Pattern", PatternType: 1, PaintType: 1, TilingType: 1,
        BBox: [0, 0, w, h], XStep: w, YStep: h,
      });
      const arr = PDFArray.withContext(ctx);
      for (const v of M) arr.push(PDFNumber.of(Number.isFinite(v) ? v : 0));
      dict.set(PDFName.of("Matrix"), arr);
      dict.set(PDFName.of("Resources"), book.resourceDictFor(used));
      const stream = ctx.flateStream(content);
      // Dict-Einträge in den Stream übernehmen.
      for (const [k, v] of dict.entries()) stream.dict.set(k, v);
      const ref = ctx.register(stream);
      const pname = book.patternName(ref);
      return `q ${gs} /Pattern cs /${pname} scn\n${path} ${op}\nQ\n`;
    });
  }

  /** Äußere Matrix (lokale Pixel → PDF-Seite), für Kachelmuster benötigt. */
  outer: Mat = [...IDENTITY] as Mat;

  // ---------- Bilder ----------
  drawImage(img: any, ...args: number[]) {
    if (this._skip() || !img) return;
    let sx = 0, sy = 0, sw = img.naturalWidth || img.videoWidth || img.width || 0, sh = img.naturalHeight || img.videoHeight || img.height || 0;
    let dx: number, dy: number, dw: number, dh: number;
    let crop: [number, number, number, number] | undefined;
    if (args.length >= 8) {
      [sx, sy, sw, sh, dx, dy, dw, dh] = args;
      crop = [sx, sy, sw, sh];
    } else if (args.length >= 4) { [dx, dy, dw, dh] = args; }
    else { [dx, dy] = args; dw = sw; dh = sh; }
    if (!(sw > 0 && sh > 0 && Math.abs(dw) > 0 && Math.abs(dh) > 0)) return;
    const a = this.st.globalAlpha;
    if (a <= 0.001) return;
    const gs = this._gs(a, a);
    const m = matStr(this.st.m);
    const used = this.used;
    this.parts.push(async () => {
      const name = await this.book.imageName(img, crop);
      if (!name) return "";
      used.xo.add(name);
      return `q ${gs} ${m} cm ${n(dw)} 0 0 ${n(-dh)} ${n(dx)} ${n(dy + dh)} cm /${name} Do Q\n`;
    });
  }

  /** Eingefügte PDF-Seite (Original-Vektoren) im Rechteck −w/2..w/2 × −h/2..h/2. */
  drawEmbeddedPdfPage(page: PDFEmbeddedPage, w: number, h: number) {
    const a = this.st.globalAlpha;
    if (a <= 0.001 || !(page.width > 0 && page.height > 0)) return;
    const gs = this._gs(a, a);
    const name = this.book.xobjectName(page.ref);
    this.used.xo.add(name);
    this.parts.push(`q ${gs} ${matStr(this.st.m)} cm ${n(w / page.width)} 0 0 ${n(-h / page.height)} ${n(-w / 2)} ${n(h / 2)} cm /${name} Do Q\n`);
  }

  // ---------- Text ----------
  private _parseFont() {
    const f = this.st.font || "";
    const m = f.match(/(\d+(?:\.\d+)?)px/);
    const size = m ? parseFloat(m[1]) : 10;
    const bold = /\bbold\b|\b[6-9]00\b|bolder/.test(f);
    const italic = /italic|oblique/.test(f);
    const fonts = this.book.fonts;
    const font = bold && italic ? fonts.boldItalic : bold ? fonts.bold : italic ? fonts.italic : fonts.regular;
    return { size, font };
  }
  private _charCache = new Map<PDFFont, Map<string, string>>();
  private _sanitize(font: PDFFont, text: string): string {
    let cache = this._charCache.get(font);
    if (!cache) { cache = new Map(); this._charCache.set(font, cache); }
    const map: Record<string, string> = { "\u2212": "-", "\u2300": "\u00d8", "\u00a0": " ", "\u2009": " ", "\u202f": " ", "\t": " " };
    let out = "";
    for (const ch0 of text) {
      const ch = map[ch0] ?? ch0;
      let r = cache.get(ch);
      if (r === undefined) {
        try { font.encodeText(ch); r = ch; } catch { r = "?"; }
        cache.set(ch, r);
      }
      out += r;
    }
    return out;
  }
  measureText(text: string) {
    if (this.measureCtx === undefined) {
      try { this.measureCtx = document.createElement("canvas").getContext("2d"); } catch { this.measureCtx = null; }
    }
    if (this.measureCtx) { this.measureCtx.font = this.st.font; return this.measureCtx.measureText(text); }
    const { size, font } = this._parseFont();
    let w = 0;
    try { w = font.widthOfTextAtSize(this._sanitize(font, String(text)), size); } catch { w = String(text).length * size * 0.55; }
    return { width: w, actualBoundingBoxAscent: size * 0.75, actualBoundingBoxDescent: size * 0.25, fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w } as any;
  }
  private _text(text: string, x: number, y: number, maxWidth: number | undefined, stroke: boolean) {
    if (this._skip() || text == null) return;
    const str = String(text);
    if (!str.trim() && !stroke) return;
    const { size, font } = this._parseFont();
    if (!(size > 0)) return;
    const clean = this._sanitize(font, str);
    let w = 0;
    try { w = font.widthOfTextAtSize(clean, size); } catch { return; }
    const hs = maxWidth != null && maxWidth > 0 && w > maxWidth ? maxWidth / w : 1;
    const ww = w * hs;
    const align = this.st.textAlign;
    const dx = align === "center" ? -ww / 2 : (align === "right" || align === "end") ? -ww : 0;
    const asc = font.heightAtSize(size, { descender: false });
    const desc = Math.max(0, font.heightAtSize(size) - asc);
    const bl = this.st.textBaseline;
    const dy = bl === "top" || bl === "hanging" ? asc : bl === "middle" ? (asc - desc) / 2 : (bl === "bottom" || bl === "ideographic") ? -desc : 0;
    const style = stroke ? this.st.strokeStyle : this.st.fillStyle;
    const c = this._color(style) ?? { r: 0, g: 0, b: 0, a: 1 };
    const a = c.a * this.st.globalAlpha;
    if (a <= 0.001) return;
    let hex: string;
    try { hex = font.encodeText(clean).toString(); } catch { return; }
    const fname = this.book.fontName(font);
    this.used.font.add(fname);
    const paint = stroke
      ? `${this._gs(1, a)} ${n(c.r)} ${n(c.g)} ${n(c.b)} RG ${n(this.st.lineWidth)} w 1 j 1 Tr`
      : `${this._gs(a, 1)} ${n(c.r)} ${n(c.g)} ${n(c.b)} rg 0 Tr`;
    this.parts.push(`q ${matStr(this.st.m)} cm ${paint} BT /${fname} ${n(size)} Tf ${n(hs)} 0 0 -1 ${n(x + dx)} ${n(y + dy)} Tm ${hex} Tj ET Q\n`);
  }
  fillText(text: string, x: number, y: number, maxWidth?: number) { this._text(text, x, y, maxWidth, false); }
  strokeText(text: string, x: number, y: number, maxWidth?: number) { this._text(text, x, y, maxWidth, true); }

  // ---------- Ausgabe ----------
  /** Inhalt ohne verzögerte Teile (für Musterkacheln). */
  syncContent(): string {
    let depth = 0;
    let s = "";
    for (const p of this.parts) {
      if (typeof p !== "string") continue;
      s += p;
    }
    // Offene save() schließen.
    depth = this.stack.length;
    return s + "Q\n".repeat(depth);
  }
  async content(): Promise<string> {
    const out: string[] = [];
    for (const p of this.parts) out.push(typeof p === "string" ? p : await p());
    return out.join("") + "Q\n".repeat(this.stack.length);
  }
}

/** Hängt rohen PDF-Inhalt in Zeichenreihenfolge an die Seite an. */
export function pushRawContent(page: PDFPage, content: string) {
  page.pushOperators(PDFOperator.of(content as any));
}

export { inv as invertMat };
