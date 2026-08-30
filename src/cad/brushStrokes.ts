/**
 * Gemeinsame Pinsel-Linienarten („Stifte“) für Linie, Freihand, Polygon und
 * Schraffur-Kontur — in CAD und Projektmappe identisch.
 *
 * Grundsätze
 * ----------
 * - Die Algorithmen, Konstanten und Abläufe stammen 1:1 aus der Referenzdatei
 *   „brush_lab_mobile_v7_nur_deine_favoriten.html“ (BrushEngine).
 *   Zulässige technische Abweichungen sind ausschließlich:
 *     1. fester Zufalls-Seed pro Objekt statt `Math.random()`,
 *     2. Umrechnung der Referenz-Pixel in CAD-/Papierkoordinaten,
 *     3. Einbindung in das gemeinsame Kontur-Modell (`strokeEffects.ts`).
 * - Alle Stempel-/Borstenpositionen werden aus der kumulierten Pfadlänge in
 *   Objekt-/Weltkoordinaten abgeleitet (zzgl. Phase `sourceStartDistanceM`).
 *   Dadurch bleibt ein bereits gezeichneter Abschnitt beim Weiterzeichnen,
 *   Zoomen, Scrollen, Speichern, Radieren und Exportieren unverändert.
 * - Aquarell nutzt eine transparente Offscreen-Ebene; `destination-out`
 *   (Blüten) wirkt ausschließlich dort und kann keine fremden Objekte löschen.
 */

export type BrushPresetId =
  | "watercolorSpatterBloom"
  | "bristleFine"
  | "bristleDry"
  | "bristleCoarse"
  | "marker"
  | "spray"
  | "halftoneFine"
  | "halftoneBold";

export interface BrushPresetInfo {
  id: BrushPresetId;
  label: string;
  /** Standard-Charakter (0–100) aus der Referenzdatei. */
  character: number;
  /** Referenzgröße (`size`) der Vorlage — Basis der Konstanten-Umrechnung. */
  refSize: number;
  /** Nutzt der Quellalgorithmus einen Federwinkel? (bei allen acht: nein) */
  usesAngle: boolean;
}

export const BRUSH_PRESETS: BrushPresetInfo[] = [
  { id: "watercolorSpatterBloom", label: "Aqua Blüten-Spritzer", character: 68, refSize: 46, usesAngle: false },
  { id: "bristleFine", label: "Borste fein", character: 42, refSize: 58, usesAngle: false },
  { id: "bristleDry", label: "Borste trocken", character: 72, refSize: 62, usesAngle: false },
  { id: "bristleCoarse", label: "Borste grob", character: 60, refSize: 64, usesAngle: false },
  { id: "marker", label: "Marker", character: 40, refSize: 36, usesAngle: false },
  { id: "spray", label: "Spray", character: 55, refSize: 46, usesAngle: false },
  { id: "halftoneFine", label: "Halftone fein", character: 52, refSize: 30, usesAngle: false },
  { id: "halftoneBold", label: "Halftone grob", character: 60, refSize: 42, usesAngle: false },
];

export const BRUSH_IDS = BRUSH_PRESETS.map((b) => b.id);

export function isBrushPresetId(x: any): x is BrushPresetId {
  return typeof x === "string" && (BRUSH_IDS as string[]).includes(x);
}

export function brushPresetInfo(id: any): BrushPresetInfo | null {
  return BRUSH_PRESETS.find((b) => b.id === id) || null;
}

/** Neutraler Ersatzdruck der Referenz, wenn kein Stiftdruck vorliegt. */
export const NEUTRAL_PRESSURE = 0.55;

// ------------------------------------------------------------------ Zufall

function hash32(a: number, b: number): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Deterministischer Zufallsstrom. `index` ist immer ein GLOBALER Index, der
 * ausschließlich aus der Pfaddistanz (inkl. Phase) abgeleitet wird — deshalb
 * bleibt jeder bereits erzeugte Abschnitt identisch.
 */
function makeRng(seed: number, index: number): () => number {
  let s = hash32(seed >>> 0, index | 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Referenz: randomNormal() */
function randomNormal(rng: () => number): number {
  let u = rng(); let v = rng();
  if (u <= 0) u = 1e-6;
  if (v <= 0) v = 1e-6;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ------------------------------------------------------------------ Farbe

interface Rgb { r: number; g: number; b: number; a: number }

function parseColor(input: string): Rgb {
  const s = (input || "#000000").trim();
  if (s.startsWith("#")) {
    const hex = s.length === 4
      ? s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
      : s.slice(1, 7);
    const n = parseInt(hex, 16);
    if (Number.isFinite(n)) return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Referenz: rgba(hex,a) */
function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${clamp(a * c.a, 0, 1)})`;
}

// ------------------------------------------------------------------ Pfad

export interface ScreenPoint { x: number; y: number }
interface WorldPoint { x: number; y: number }

/**
 * Abtastung des Pfades entlang der Referenz-Distanz.
 *
 * Distanzen werden in „Referenz-Pixeln“ geführt: 1 Referenz-Pixel entspricht
 * `sizePx / refSize` Bildschirmpixeln bzw. dem gleichen physischen Anteil der
 * Linienstärke. Dadurch gelten alle Konstanten der Vorlage unverändert und die
 * Struktur ist zoom-, pan- und exportstabil.
 */
class PathSampler {
  screen: ScreenPoint[] = [];
  press: number[] = [];
  cum: number[] = [0];
  total = 0;

  constructor(worldPts: WorldPoint[], closed: boolean, project: (p: WorldPoint) => ScreenPoint,
              refPerWorld: number, pressures?: number[]) {
    const src = closed && worldPts.length > 2 ? [...worldPts, worldPts[0]] : worldPts;
    for (let i = 0; i < src.length; i++) {
      this.screen.push(project(src[i]));
      const pr = pressures && pressures.length
        ? pressures[Math.min(pressures.length - 1, i)]
        : NEUTRAL_PRESSURE;
      this.press.push(Number.isFinite(pr) && pr > 0 ? clamp(pr, 0.01, 1) : NEUTRAL_PRESSURE);
    }
    for (let i = 1; i < src.length; i++) {
      const d = Math.hypot(src[i].x - src[i - 1].x, src[i].y - src[i - 1].y) * refPerWorld;
      this.cum.push(this.cum[i - 1] + d);
    }
    this.total = this.cum[this.cum.length - 1] || 0;
  }

  /** Fortlaufender Segmentzeiger — verhindert lineare Suche je Stempel. */
  private _cursor = 1;

  /** Punkt (Bildschirm) + Druck an einer Referenz-Distanz. */
  at(d: number): { x: number; y: number; pressure: number } {
    const cum = this.cum;
    if (cum.length < 2) {
      const p = this.screen[0] || { x: 0, y: 0 };
      return { x: p.x, y: p.y, pressure: this.press[0] ?? NEUTRAL_PRESSURE };
    }
    const dist = clamp(d, 0, this.total);
    let i = this._cursor;
    if (i < 1) i = 1;
    if (i > cum.length - 1) i = cum.length - 1;
    if (cum[i - 1] > dist) {
      // Rücksprung (z. B. neue Abtastreihe) → binäre Suche statt Neustart.
      let lo = 1, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < dist) lo = mid + 1; else hi = mid; }
      i = lo;
    } else {
      while (i < cum.length - 1 && cum[i] < dist) i++;
    }
    this._cursor = i;
    const i0 = i - 1;
    const seg = cum[i] - cum[i0] || 1e-9;
    const t = clamp((dist - cum[i0]) / seg, 0, 1);
    const a = this.screen[i0], b = this.screen[i];
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      pressure: lerp(this.press[i0], this.press[i], t),
    };
  }
}


// ------------------------------------------------------------------ Rendering

export interface BrushRenderStyle {
  preset: BrushPresetId;
  /** 0–100 */
  character: number;
  seed: number;
  /** Sichtbare Gesamtbreite in Bildschirm-Pixeln (projizierte Linienstärke). */
  sizePx: number;
  /** CSS-Farbe (hex oder rgba). */
  color: string;
  /** Deckkraft 0–1. */
  opacity: number;
  closed: boolean;
}

export interface BrushRenderRequest {
  worldPts: WorldPoint[];
  closed: boolean;
  project: (p: WorldPoint) => ScreenPoint;
  style: BrushRenderStyle;
  /** Startdistanz des Abschnitts auf dem Originalpfad (Weltmeter). */
  phaseM?: number;
  /** Pointer-Druck je Pfadpunkt (optional). */
  pressures?: number[];
  cacheKey?: string;
  /**
   * Live-Puffer-Schlüssel (nur während des Zeichnens). Ist er gesetzt, wird
   * ausschließlich der neu hinzugekommene Pfadabschnitt in einen persistenten
   * Puffer gerendert — bereits gezeichnete Abschnitte bleiben unberührt.
   */
  liveKey?: string;
}

const brushCache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 24;

function pathSignature(pts: ScreenPoint[], ox: number, oy: number): string {
  let h = 0x811c9dc5;
  for (const p of pts) {
    h = hash32(h, Math.round((p.x - ox) * 8));
    h = hash32(h, Math.round((p.y - oy) * 8));
  }
  return `${pts.length}:${h.toString(36)}`;
}

interface BrushCtx {
  col: Rgb;
  opacity: number;
  /** Referenzgröße des Stiftes (this.size in der Vorlage). */
  size: number;
  /** Charakter 0–1 (Vorlage: this.character). */
  character: number;
  seed: number;
  /** Bildschirmpixel je Referenz-Pixel. */
  P: number;
  /** Phase in Referenz-Pixeln. */
  phase: number;
}

/** Fortgeschriebener Zustand eines Stiftes (Borsten-Farbverbrauch, Weglänge). */
interface PaintState { bristles?: Bristle[]; travel?: number }

// ---------------------------------------------------------------- Live-Puffer

interface LiveState {
  canvas: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  sig: string;
  /** Bereits gerenderte Referenz-Distanz (lokal, ohne Phase). */
  done: number;
  count: number;
  paint: PaintState;
}

const liveStates = new Map<string, LiveState>();

/** Live-Puffer eines beendeten Striches freigeben. */
export function endLiveBrush(key: string) { liveStates.delete(key); }
export function clearLiveBrushes() { liveStates.clear(); }

function makeBrushCtx(style: BrushRenderStyle, info: BrushPresetInfo, P: number, phaseRef: number): BrushCtx {
  return {
    col: parseColor(style.color),
    opacity: clamp(style.opacity ?? 1, 0, 1),
    size: info.refSize,
    character: clamp((style.character ?? info.character) / 100, 0, 1),
    seed: (style.seed || 1) >>> 0,
    P,
    phase: phaseRef,
  };
}

/** Zeichnet den Pinselstrich entlang der Weltgeometrie (mit Offscreen-Cache). */
export function renderBrushStroke(req: BrushRenderRequest, ctx: CanvasRenderingContext2D) {
  const { style } = req;
  const info = brushPresetInfo(style.preset);
  if (!info) return;
  const worldPts = req.worldPts;
  if (!worldPts || worldPts.length < 1) return;

  const sizePx = Math.max(1.2, style.sizePx);
  const P = sizePx / info.refSize;                 // Bildschirm-px je Referenz-px
  const closed = !!style.closed && worldPts.length > 2;

  const screenAll = worldPts.map((p) => req.project(p));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of screenAll) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }

  // Weltlänge → Referenz-Pixel. Die Linienstärke ist physisch, daher ist der
  // Faktor zoomunabhängig.
  const worldLen = polyWorldLength(worldPts, closed);
  const screenLen = polyScreenLength(screenAll, closed);
  const pxPerWorld = worldLen > 1e-9 ? screenLen / worldLen : 1;
  const refPerWorld = pxPerWorld / P;
  const phaseRef = (req.phaseM || 0) * refPerWorld;

  if (req.liveKey) {
    renderBrushLive(req, ctx, info, {
      P, closed, refPerWorld, phaseRef, sizePx, worldPts,
    });
    return;
  }

  const pad = Math.ceil(sizePx * 3 + 8);
  const ox = Math.floor(minX) - pad;
  const oy = Math.floor(minY) - pad;
  const w = Math.ceil(maxX - minX) + pad * 2;
  const h = Math.ceil(maxY - minY) + pad * 2;
  if (w <= 0 || h <= 0 || w * h > 36_000_000) return;

  const key = req.cacheKey
    ? `${req.cacheKey}|${style.preset}|${style.character}|${style.seed}|${sizePx.toFixed(2)}|${style.color}|${style.opacity.toFixed(3)}|${closed}|${phaseRef.toFixed(2)}|${w}x${h}|${pathSignature(screenAll, minX, minY)}`
    : null;

  let canvas = key ? brushCache.get(key) : undefined;
  if (canvas && key) {
    // LRU: bei Treffer ans Ende sortieren.
    brushCache.delete(key); brushCache.set(key, canvas);
  }
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const bctx = canvas.getContext("2d");
    if (!bctx) return;
    const sampler = new PathSampler(
      worldPts, closed,
      (p) => { const s = req.project(p); return { x: s.x - ox, y: s.y - oy }; },
      refPerWorld, req.pressures,
    );
    const bc = makeBrushCtx(style, info, P, phaseRef);
    paintBrush(bctx, sampler, style.preset, bc, closed, 0, true, null);
    if (key) {
      // Einzelne älteste Einträge verwerfen statt den ganzen Cache zu leeren.
      while (brushCache.size >= MAX_CACHE) {
        const oldest = brushCache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        brushCache.delete(oldest);
      }
      brushCache.set(key, canvas);
    }
  }
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(canvas, ox, oy);
  ctx.restore();
}

/**
 * Inkrementeller Live-Render: genau ein Puffer je Strich, pro Bewegung wird
 * nur der neue Abschnitt gestempelt. Die Stempelpositionen hängen weiterhin
 * ausschließlich von Seed, globaler Pfaddistanz und Phase ab — das Ergebnis
 * ist deshalb identisch mit dem späteren, endgültigen Rendern.
 */
function renderBrushLive(
  req: BrushRenderRequest,
  ctx: CanvasRenderingContext2D,
  info: BrushPresetInfo,
  m: { P: number; closed: boolean; refPerWorld: number; phaseRef: number; sizePx: number; worldPts: WorldPoint[] },
) {
  const style = req.style;
  const key = req.liveKey!;
  const target = ctx.canvas;
  if (!target.width || !target.height) return;
  const tf = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const a = tf ? tf.a : 1, d = tf ? tf.d : 1, e = tf ? tf.e : 0, f = tf ? tf.f : 0;
  const p0 = req.project({ x: 0, y: 0 });
  const p1 = req.project({ x: 1, y: 1 });

  // Signatur: Stil, Kamera/Transform und Puffergröße. Ändert sich etwas davon,
  // wird der Puffer einmalig komplett neu aufgebaut.
  const sig = [
    style.preset, style.character, style.seed, m.sizePx.toFixed(2), style.color,
    (style.opacity ?? 1).toFixed(3), m.closed, m.phaseRef.toFixed(2),
    a, d, e, f, target.width, target.height,
    p0.x.toFixed(2), p0.y.toFixed(2), p1.x.toFixed(2), p1.y.toFixed(2),
  ].join("|");

  // Der Marker ist eine einfache Bahn — dort ist ein Vollrender billiger als
  // jede Zustandsführung.
  const fullRepaint = style.preset === "marker";

  let st = liveStates.get(key);
  if (!st || st.sig !== sig || m.worldPts.length < st.count || fullRepaint) {
    let canvas = st?.canvas;
    if (!canvas || canvas.width !== target.width || canvas.height !== target.height) {
      canvas = document.createElement("canvas");
      canvas.width = target.width;
      canvas.height = target.height;
    }
    const lctx = canvas.getContext("2d");
    if (!lctx) return;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.clearRect(0, 0, canvas.width, canvas.height);
    st = { canvas, lctx, sig, done: 0, count: 0, paint: {} };
    liveStates.set(key, st);
  }

  // Gleiche Koordinaten wie der Aufrufer (CSS-Pixel inkl. DPR-Transform).
  st.lctx.setTransform(a, 0, 0, d, e, f);

  const sampler = new PathSampler(m.worldPts, m.closed, req.project, m.refPerWorld, req.pressures);
  const bc = makeBrushCtx(style, info, m.P, m.phaseRef);
  st.done = paintBrush(st.lctx, sampler, style.preset, bc, m.closed, st.done, fullRepaint, st.paint);
  st.count = m.worldPts.length;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(st.canvas, 0, 0);
  ctx.restore();
}

function polyWorldLength(pts: WorldPoint[], closed: boolean): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 2) L += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return L;
}
function polyScreenLength(pts: ScreenPoint[], closed: boolean): number {
  return polyWorldLength(pts as WorldPoint[], closed);
}

/** Leert den Pinsel-Cache (z. B. bei Themenwechsel). */
export function clearBrushCache() { brushCache.clear(); liveStates.clear(); }

/**
 * Malt den Abschnitt [`from`, Pfadende] und liefert die neue, bereits
 * gerenderte Distanz zurück. Ist `final` false, endet der Lauf am letzten
 * vollständigen Raster-Schritt, damit der nächste Aufruf lückenlos anschließt.
 */
function paintBrush(ctx: CanvasRenderingContext2D, S: PathSampler, preset: BrushPresetId,
                    o: BrushCtx, closed: boolean, from: number, final: boolean,
                    state: PaintState | null): number {
  switch (preset) {
    case "marker": paintMarker(ctx, S, o, closed); return S.total;
    case "spray": return paintStamped(ctx, S, o, from, final, 3, (c, pt, rng) => stampSpray(c, pt, o, rng));
    case "halftoneFine":
    case "halftoneBold": {
      const cfg = HALFTONE_CFG[preset];
      const spacing = Math.max(5, o.size * cfg.spacingFactor);
      return paintStamped(ctx, S, o, from, final, spacing, (c, pt, rng) => stampHalftone(c, pt, cfg, o, rng));
    }
    case "watercolorSpatterBloom": {
      const spacing = Math.max(6, o.size * AQUA_CFG.spacingFactor);
      return paintStamped(ctx, S, o, from, final, spacing, (c, pt, rng) => stampWaterSpatter(c, pt, o, rng));
    }
    case "bristleFine":
    case "bristleDry":
    case "bristleCoarse": return paintBristle(ctx, S, preset, o, from, final, state);
    default: return S.total;
  }
}

/**
 * Gemeinsame Stempelschleife (Spray, Halftone, Aquarell). Der Stempelindex
 * leitet sich aus Phase + Rasterdistanz ab und ist damit unabhängig davon,
 * in wie vielen Teilstücken gerendert wurde.
 */
function paintStamped(
  ctx: CanvasRenderingContext2D, S: PathSampler, o: BrushCtx,
  from: number, final: boolean, spacing: number,
  stamp: (ctx: CanvasRenderingContext2D, pt: { x: number; y: number; pressure: number }, rng: () => number) => void,
): number {
  if (spacing <= 1e-6) return S.total;
  const limit = S.total + (final ? 1e-6 : -1e-6);
  let painted = from;
  ctx.save();
  for (let k = Math.max(0, Math.ceil((from - 1e-9) / spacing)); k * spacing <= limit; k++) {
    const dist = k * spacing;
    const gi = Math.round((o.phase + dist) / spacing);
    stamp(ctx, S.at(dist), makeRng(o.seed, gi));
    painted = dist;
  }
  ctx.restore();
  return final ? S.total : Math.max(from, painted);
}


// ---------------------------------------------------------------- Marker
// Referenz: markerPreview() — durchgehende Bahn, eckige Enden, runde Ecken.
function paintMarker(ctx: CanvasRenderingContext2D, S: PathSampler, o: BrushCtx, closed: boolean) {
  const pts = S.screen;
  if (pts.length < 2) return;
  ctx.save();
  // Deckkraft genau einmal anwenden — `rgba()` bringt bereits das Farb-Alpha mit.
  ctx.globalAlpha = clamp(o.opacity, 0, 1);
  ctx.strokeStyle = rgba(o.col, 1);
  ctx.lineWidth = o.size * o.P;
  ctx.lineCap = "square";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- Spray
// Referenz: spray(a,b) — Schrittweite 3 px, Radius size*.5.
function stampSpray(ctx: CanvasRenderingContext2D, p: { x: number; y: number; pressure: number },
                    o: BrushCtx, rng: () => number) {
  const radius = o.size * 0.5;
  const dots = Math.ceil(3 + o.size * 0.07 * lerp(0.6, 1.35, p.pressure));
  for (let i = 0; i < dots; i++) {
    const angle = rng() * Math.PI * 2;
    const r = radius * Math.sqrt(rng());
    ctx.beginPath();
    ctx.arc(
      p.x + Math.cos(angle) * r * o.P,
      p.y + Math.sin(angle) * r * o.P,
      Math.max(0.2, (0.35 + rng() * 1.3) * o.P),
      0, Math.PI * 2,
    );
    ctx.fillStyle = rgba(o.col, o.opacity * (0.08 + rng() * 0.28));
    ctx.fill();
  }
}


// ---------------------------------------------------------------- Halftone
// Referenz: halftoneBrush() / stampHalftone()
interface HalftoneCfg {
  spacingFactor: number; stampRadius: number; grid: number; dotMax: number;
  density: number; alphaMin: number; alphaMax: number;
}

const HALFTONE_CFG: Record<"halftoneFine" | "halftoneBold", HalftoneCfg> = {
  halftoneFine: { spacingFactor: .15, stampRadius: .32, grid: 4, dotMax: 1.35, density: .92, alphaMin: .10, alphaMax: .34 },
  halftoneBold: { spacingFactor: .26, stampRadius: .46, grid: 6, dotMax: 2.85, density: .84, alphaMin: .10, alphaMax: .42 },
};


function stampHalftone(ctx: CanvasRenderingContext2D, point: { x: number; y: number; pressure: number },
                       cfg: HalftoneCfg, o: BrushCtx, rng: () => number) {
  const pressure = point.pressure || NEUTRAL_PRESSURE;
  const radius = o.size * cfg.stampRadius * lerp(.7, 1.25, pressure);
  const grid = cfg.grid;
  const angle = Math.PI / 4;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);

  for (let gx = -radius; gx <= radius; gx += grid) {
    for (let gy = -radius; gy <= radius; gy += grid) {
      const rx = gx * ca - gy * sa;
      const ry = gx * sa + gy * ca;
      const distNorm = Math.hypot(rx, ry) / radius;
      if (distNorm > 1) continue;
      const intensity = Math.max(0, 1 - distNorm);
      if (rng() > cfg.density * (0.55 + intensity * .45)) continue;
      const dotRadius = Math.max(.18, cfg.dotMax * intensity * lerp(.55, 1.15, pressure));
      ctx.beginPath();
      ctx.arc(point.x + rx * o.P, point.y + ry * o.P, Math.max(0.15, dotRadius * o.P), 0, Math.PI * 2);
      ctx.fillStyle = rgba(o.col, o.opacity * (cfg.alphaMin + rng() * (cfg.alphaMax - cfg.alphaMin)));
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- Aquarell
// Referenz: blobPath(), watercolorSpatterBrush("watercolorSpatterBloom"), stampWaterSpatter()
const AQUA_CFG = {
  spacingFactor: .30, baseRadius: .28, countBase: 5, countSize: .10,
  bloomChance: .42, haloAlpha: .040, edgeAlpha: .06,
};

function blobPath(ctx: CanvasRenderingContext2D, rng: () => number,
                  x: number, y: number, r: number, rough: number, sx: number, sy: number) {
  const count = 20;
  const rotation = rng() * Math.PI * 2;
  ctx.beginPath();
  for (let i = 0; i <= count; i++) {
    const angle = rotation + (i % count) / count * Math.PI * 2;
    const radius = r * (1 + randomNormal(rng) * rough);
    const px = x + Math.cos(angle) * radius * sx;
    const py = y + Math.sin(angle) * radius * sy;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}


function stampWaterSpatter(ctx: CanvasRenderingContext2D, point: { x: number; y: number; pressure: number },
                           o: BrushCtx, rng: () => number) {
  const cfg = AQUA_CFG;
  const pressure = point.pressure || NEUTRAL_PRESSURE;
  const radius = o.size * cfg.baseRadius * lerp(.7, 1.35, pressure);
  const count = Math.ceil(cfg.countBase + o.size * cfg.countSize);
  const P = o.P;

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const distOut = radius * (.2 + rng() * 2.1);
    const cx = point.x + Math.cos(angle) * distOut * P;
    const cy = point.y + Math.sin(angle) * distOut * P;
    const r = radius * (.12 + rng() * 0.36) * P;

    /* weicher Körper */
    ctx.fillStyle = rgba(o.col, o.opacity * (.035 + rng() * .06));
    blobPath(ctx, rng, cx, cy, r, .18 + rng() * .12, .9 + rng() * .5, .9 + rng() * .5);
    ctx.fill();

    /* Pigmentierter Kern */
    ctx.beginPath();
    ctx.arc(cx + randomNormal(rng) * r * .10, cy + randomNormal(rng) * r * .10,
      Math.max(0.1, r * (.18 + rng() * .28)), 0, Math.PI * 2);
    ctx.fillStyle = rgba(o.col, o.opacity * (.06 + rng() * .11));
    ctx.fill();

    /* Wasserhof */
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.1, r * (1.2 + rng() * .8)), 0, Math.PI * 2);
    ctx.fillStyle = rgba(o.col, o.opacity * (cfg.haloAlpha * (.6 + rng() * .9)));
    ctx.fill();

    /* Randpigment */
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.1, r * (.95 + rng() * .35)), 0, Math.PI * 2);
    ctx.lineWidth = Math.max(.25, r * .08);
    ctx.strokeStyle = rgba(o.col, o.opacity * (cfg.edgeAlpha * (.6 + rng() * .8)));
    ctx.stroke();

    /* gelegentliche Blüte (nur in der Offscreen-Ebene) */
    if (rng() < cfg.bloomChance) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(cx + randomNormal(rng) * r * .14, cy + randomNormal(rng) * r * .14,
        Math.max(0.1, r * (.18 + rng() * .22)), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,.03)";
      ctx.fill();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- Borsten
// Referenz: makeReferenceBristles() / referenceBristle()
interface Bristle {
  across: number; thickness: number; alpha: number; paint: number; permanentGap: boolean;
  gapFrequency: number; gapPhase: number; microFrequency: number; microPhase: number;
  dry: number; waviness: number; wavePhase: number; edge: number;
}

const BRISTLE_CFG = {
  bristleFine: { count: 86, dry: .34, thicknessMin: .25, thicknessMax: .92, inactiveChance: .07, edgeLoss: .18, waviness: .010, longGap: .16, paintMin: .58, paintMax: 1.00 },
  bristleDry: { count: 68, dry: .66, thicknessMin: .28, thicknessMax: 1.12, inactiveChance: .19, edgeLoss: .30, waviness: .015, longGap: .30, paintMin: .30, paintMax: .82 },
  bristleCoarse: { count: 42, dry: .50, thicknessMin: .55, thicknessMax: 2.05, inactiveChance: .14, edgeLoss: .27, waviness: .020, longGap: .24, paintMin: .40, paintMax: .92 },
} as const;

function makeBristles(variant: keyof typeof BRISTLE_CFG, seed: number, character: number): Bristle[] {
  const cfg = BRISTLE_CFG[variant];
  const characterDry = (character - .5) * .34;
  // Ein einziger fortlaufender Zufallsstrom je Objekt — entspricht der
  // sequenziellen Math.random()-Kette der Vorlage.
  const rng = makeRng(seed, 0);
  const out: Bristle[] = [];
  for (let i = 0; i < cfg.count; i++) {
    const u = i / Math.max(1, cfg.count - 1);
    let across = lerp(-.5, .5, u);
    across += randomNormal(rng) * (variant === "bristleCoarse" ? .018 : .010);
    const edge = Math.pow(Math.abs(across) * 2, 1.8);
    const permanentGap = rng() < (cfg.inactiveChance + edge * cfg.edgeLoss * .20 + Math.max(0, characterDry) * .12);
    const channelSeed = Math.sin(across * 41.7 + rng() * 3.0);
    const channel = channelSeed > (1.0 - cfg.longGap * 1.8);
    out.push({
      across,
      thickness: lerp(cfg.thicknessMin, cfg.thicknessMax, Math.pow(rng(), .72)),
      alpha: .22 + rng() * .66,
      paint: lerp(cfg.paintMin, cfg.paintMax, rng()),
      permanentGap: permanentGap || channel,
      gapFrequency: .018 + rng() * .035,
      gapPhase: rng() * Math.PI * 2,
      microFrequency: .10 + rng() * .18,
      microPhase: rng() * Math.PI * 2,
      dry: clamp(cfg.dry + characterDry + randomNormal(rng) * .07, .05, .92),
      waviness: randomNormal(rng) * cfg.waviness,
      wavePhase: rng() * Math.PI * 2,
      edge,
    });
  }
  return out;
}

function paintBristle(ctx: CanvasRenderingContext2D, S: PathSampler,
                      variant: keyof typeof BRISTLE_CFG, o: BrushCtx,
                      from: number, final: boolean, state: PaintState | null): number {
  if (S.total <= 1e-6) return S.total;
  // Schrittweite in Referenz-Pixeln: entspricht dem typischen Pointer-Abstand
  // der Vorlage und ist unabhängig von Zoom und Punktdichte.
  const step = 2;
  const P = o.P;

  // Borstenzustand (Farbverbrauch, Weglänge) wird über inkrementelle Läufe
  // hinweg fortgeschrieben — sonst würde jeder Teillauf neu „nass“ starten.
  let bristles = state?.bristles;
  if (!bristles || from <= 1e-9) {
    bristles = makeBristles(variant, o.seed, o.character);
    // Ein geteilter Abschnitt startet mit der bereits verbrauchten Farbe.
    if (o.phase > 0) {
      for (const b of bristles) {
        b.paint = Math.max(.10, b.paint - o.phase * (.00012 + b.dry * .00030));
      }
    }
    if (state) { state.bristles = bristles; state.travel = o.phase; }
  }

  let travel = state?.travel ?? (o.phase + from);
  const start = Math.max(0, Math.ceil((from - 1e-9) / step) * step);
  const limit = final ? S.total : Math.max(0, S.total - step);
  let painted = from;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineJoin = "round";

  for (let d = start; d < limit - 1e-6; d += step) {
    const dEnd = Math.min(S.total, d + step);
    const a = S.at(d);
    const b = S.at(dEnd);
    const segLenPx = Math.hypot(b.x - a.x, b.y - a.y);
    painted = dEnd;
    if (segLenPx < 1e-6) continue;
    const dRef = Math.max(.25, dEnd - d);
    const pressure = (a.pressure + b.pressure) * .5;
    travel += dRef;


    const dx = (b.x - a.x) / segLenPx;
    const dy = (b.y - a.y) / segLenPx;
    const nx = -dy, ny = dx;
    const width = o.size * lerp(.76, 1.12, pressure);

    for (const bristle of bristles) {
      if (bristle.permanentGap) continue;

      const longNoise = ((Math.sin(travel * bristle.gapFrequency + bristle.gapPhase) + 1) * .5);
      const microNoise = ((Math.sin(travel * bristle.microFrequency + bristle.microPhase) + 1) * .5);
      const threshold = clamp(
        bristle.dry * lerp(1.22, .78, pressure) * lerp(1.08, .82, bristle.paint),
        .05, .94,
      );
      const contact = longNoise * .78 + microNoise * .22 - bristle.edge * .08;
      if (contact < threshold) continue;

      // Fortlaufender Farbverbrauch wie in der Vorlage.
      bristle.paint = Math.max(.10, bristle.paint - dRef * (.00012 + bristle.dry * .00030));

      const waveA = Math.sin(bristle.wavePhase + travel * .022) * width * bristle.waviness;
      const waveB = Math.sin(bristle.wavePhase + (travel + dRef) * .022) * width * bristle.waviness;
      const offset = bristle.across * width;
      const localAlpha = o.opacity * bristle.alpha * lerp(.55, 1.0, contact) * lerp(.55, 1.0, bristle.paint);

      drawRefLine(ctx,
        { x: a.x + nx * (offset + waveA) * P, y: a.y + ny * (offset + waveA) * P },
        { x: b.x + nx * (offset + waveB) * P, y: b.y + ny * (offset + waveB) * P },
        Math.max(.24, bristle.thickness * lerp(.78, 1.28, pressure)) * P,
        rgba(o.col, localAlpha), "round");
    }

    // Gelegentlicher Borstenrand (Referenz: Math.random()<.22).
    const gi = Math.round((travel) / step);
    const rng = makeRng(o.seed ^ 0x5bf03635, gi);
    if (rng() < .22) {
      const side = rng() < .5 ? -1 : 1;
      const edgeOffset = side * width * (.47 + rng() * .055);
      drawRefLine(ctx,
        { x: a.x + nx * edgeOffset * P, y: a.y + ny * edgeOffset * P },
        { x: b.x + nx * edgeOffset * P, y: b.y + ny * edgeOffset * P },
        (.28 + rng() * .80) * P,
        rgba(o.col, o.opacity * (.10 + rng() * .18)), "round");
    }
  }
  ctx.restore();
  if (state) state.travel = travel;
  return final ? S.total : Math.max(from, painted);
}


/** Referenz: drawLine() */
function drawRefLine(ctx: CanvasRenderingContext2D, a: ScreenPoint, b: ScreenPoint,
                     width: number, color: string, cap: CanvasLineCap = "round") {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = Math.max(.2, width);
  ctx.lineCap = cap;
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
}

// ---------------------------------------------------------------- Vorschau

/**
 * Kleine Linienvorschau für die Auswahl-Buttons — nutzt exakt denselben
 * Generator wie das Zeichnen.
 */
export function renderBrushPreview(canvas: HTMLCanvasElement, preset: BrushPresetId, color: string,
                                   character?: number, opacity?: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 60;
  const h = canvas.clientHeight || 16;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const info = brushPresetInfo(preset);
  if (!info) return;
  const pts: WorldPoint[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: 4 + t * (w - 8), y: h / 2 + Math.sin(t * Math.PI * 1.6) * (h * 0.16) });
  }
  renderBrushStroke({
    worldPts: pts,
    closed: false,
    project: (p) => p,
    style: {
      preset, character: character ?? info.character, seed: 1,
      sizePx: Math.max(3, h * 0.5), color, opacity: opacity ?? 0.9, closed: false,
    },
  }, ctx);
}
