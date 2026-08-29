/**
 * Gemeinsames Kontur-Modell für Linie, Polygon, Schraffur und Freihand.
 *
 * Enthält:
 *  - Linienarten (solid / dashed / dash-dot / dotted) mit Abständen in echten mm
 *  - nicht-destruktiven Vektoreffekt „Roughen / Aufrauen“
 *  - deterministischen, seed-basierten Zufall (kein Math.random beim Rendern)
 *
 * Kanonische Einheit ist immer eine physische, zoomunabhängige Größe (mm bzw. m).
 * Die Darstellung wird ausschließlich beim Rendern in Pixel projiziert.
 */

import type { Vec2 } from "./geometry";

// ---------------------------------------------------------------- Typen

export type StrokePatternKind = "solid" | "dashed" | "dash-dot" | "dotted";

export interface StrokePatternParams {
  kind: StrokePatternKind;
  /** Strichlänge in mm (dashed / dash-dot). */
  dashLengthMm: number;
  /** Abstand in mm (dashed / dash-dot / dotted → Punktabstand). */
  gapLengthMm: number;
}

export type RoughenMode = "smooth" | "corner";

export interface RoughenParams {
  enabled: boolean;
  /** Maximale seitliche Abweichung von der Originalkontur in mm. */
  strengthMm: number;
  /** Unregelmäßigkeiten pro 100 mm Konturlänge. */
  detailPer100Mm: number;
  mode: RoughenMode;
  /** Fester Zufalls-Seed — bleibt über Zoom, Speichern, Export erhalten. */
  seed: number;
  /**
   * Skalierung des abgeleiteten Roughen-Profils in Prozent (100 = bisherige
   * Darstellung). Skaliert Stärke und räumlichen Abstand der Struktur —
   * niemals die Originalgeometrie.
   */
  scalePercent: number;
}


export interface StrokeAppearance {
  pattern: StrokePatternParams;
  roughen: RoughenParams;
  appearanceSeed: number;
}

// ---------------------------------------------------------------- Defaults

export const DEFAULT_STROKE_PATTERN: StrokePatternParams = {
  kind: "solid",
  dashLengthMm: 6,
  gapLengthMm: 3,
};

export const DEFAULT_ROUGHEN: RoughenParams = {
  enabled: false,
  strengthMm: 1,
  detailPer100Mm: 10,
  mode: "smooth",
  seed: 1,
  scalePercent: 100,

};

export function makeAppearanceSeed(): number {
  return (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0;
}

const KINDS: StrokePatternKind[] = ["solid", "dashed", "dash-dot", "dotted"];

/** Migrationssichere Normalisierung (alte Objekte bleiben „solid“ / Roughen aus). */
export function normalizeStrokePattern(raw: any): StrokePatternParams {
  const kind: StrokePatternKind = KINDS.includes(raw?.kind) ? raw.kind : "solid";
  const num = (x: any, fb: number, min: number) =>
    (typeof x === "number" && Number.isFinite(x) && x >= min) ? x : fb;
  return {
    kind,
    dashLengthMm: num(raw?.dashLengthMm, DEFAULT_STROKE_PATTERN.dashLengthMm, 0.01),
    gapLengthMm: num(raw?.gapLengthMm, DEFAULT_STROKE_PATTERN.gapLengthMm, 0.01),
  };
}

export function normalizeRoughen(raw: any, fallbackSeed?: number): RoughenParams {
  const num = (x: any, fb: number, min: number, max: number) =>
    (typeof x === "number" && Number.isFinite(x)) ? Math.min(max, Math.max(min, x)) : fb;
  const seedRaw = raw?.seed;
  const seed = (typeof seedRaw === "number" && Number.isFinite(seedRaw) && seedRaw !== 0)
    ? Math.floor(Math.abs(seedRaw))
    : (fallbackSeed && fallbackSeed > 0 ? fallbackSeed : DEFAULT_ROUGHEN.seed);
  return {
    enabled: !!raw?.enabled,
    strengthMm: num(raw?.strengthMm, DEFAULT_ROUGHEN.strengthMm, 0, 3000),
    detailPer100Mm: num(raw?.detailPer100Mm, DEFAULT_ROUGHEN.detailPer100Mm, 0.1, 1000),
    mode: raw?.mode === "corner" ? "corner" : "smooth",
    seed,
    // Alte Objekte ohne Wert bleiben migrationssicher bei 100 %.
    scalePercent: num(raw?.scalePercent, DEFAULT_ROUGHEN.scalePercent, 10, 1800),

  };
}

/** Alte FreeStroke-Linienstile migrationssicher auf das gemeinsame Modell abbilden. */
export function patternFromLegacyFreeStyle(lineStyle: string | undefined, gapM: number | undefined): StrokePatternParams {
  const gapMm = (typeof gapM === "number" && gapM > 0) ? gapM * 1000 : DEFAULT_STROKE_PATTERN.gapLengthMm;
  switch (lineStyle) {
    case "dashed": return { kind: "dashed", dashLengthMm: gapMm * 1.5, gapLengthMm: gapMm };
    case "dotted": return { kind: "dotted", dashLengthMm: gapMm * 1.5, gapLengthMm: gapMm };
    case "dashdot": return { kind: "dash-dot", dashLengthMm: gapMm * 1.5, gapLengthMm: gapMm };
    default: return { ...DEFAULT_STROKE_PATTERN };
  }
}

// ---------------------------------------------------------------- Deterministischer Zufall

/** 32-Bit Integer-Hash (deterministisch, plattformunabhängig). */
function hash32(a: number, b: number): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Zufallswert in [-1, 1], abhängig ausschließlich von Seed und der absoluten
 * Distanz-Stützstelle auf dem Originalpfad. Dadurch bleibt ein Konturbereich
 * identisch, auch wenn davor etwas radiert oder geteilt wurde.
 */
export function seededUnit(seed: number, index: number): number {
  return (hash32(seed, index) / 0xffffffff) * 2 - 1;
}

// ---------------------------------------------------------------- Roughen-Pfad

/**
 * Vollständige Geometriesignatur ALLER Punkte (0,01 mm genau). Ändert sich bei
 * Verschieben, Drehen, Skalieren, Punkt-/Kantenbearbeitung, Bulge-Änderung,
 * Radieren, Teilen, Einfügen und Undo/Redo — und macht damit den Cache
 * zuverlässig ungültig.
 */
export function geometrySignature(pts: Vec2[]): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < pts.length; i++) {
    h = hash32(h, Math.round(pts[i].x * 100000));
    h = hash32(h, Math.round(pts[i].y * 100000));
  }
  return h >>> 0;
}

interface RoughenCacheEntry { key: string; pts: Vec2[] }
const roughenCache = new Map<string, RoughenCacheEntry>();
const MAX_ROUGHEN_SAMPLES = 4000;


function polylineLength(pts: Vec2[], closed: boolean): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (closed && pts.length > 1) L += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return L;
}

/** Punkt + Tangente an einer Distanz entlang einer (ggf. geschlossenen) Polylinie. */
function sampleAt(pts: Vec2[], closed: boolean, cum: number[], total: number, d: number) {
  let dist = d;
  if (closed) dist = ((d % total) + total) % total;
  else dist = Math.min(Math.max(d, 0), total);
  let i = 1;
  while (i < cum.length && cum[i] < dist) i++;
  const i0 = Math.max(0, i - 1);
  const i1 = Math.min(cum.length - 1, i);
  const segLen = cum[i1] - cum[i0] || 1e-9;
  const t = (dist - cum[i0]) / segLen;
  const a = pts[i0 % pts.length];
  const b = pts[i1 % pts.length];
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x, y, tx: (b.x - a.x) / L, ty: (b.y - a.y) / L };
}

/** Catmull-Rom → dichte Polylinie (deterministisch, weich). */
function catmullRom(points: Vec2[], closed: boolean, samplesPerSeg = 6): Vec2[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const out: Vec2[] = [];
  const idx = (i: number) => closed
    ? points[((i % n) + n) % n]
    : points[Math.min(n - 1, Math.max(0, i))];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = idx(i - 1), p1 = idx(i), p2 = idx(i + 1), p3 = idx(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      } as Vec2);
    }
  }
  out.push(closed ? { ...(out[0] as any) } as Vec2 : points[n - 1]);
  return out;
}

export interface RoughenOptions {
  /** Distanzversatz des Abschnitts auf dem Originalpfad (für geteilte Strokes). */
  phaseM?: number;
  /** Cache-Schlüsselanteil: Objekt-ID + Geometrierevision. */
  cacheKey?: string;
}

/**
 * Leitet den aufgerauten Renderpfad aus Originalgeometrie + Parametern ab.
 * Die Originalgeometrie bleibt unverändert; Start- und Endpunkt offener Pfade
 * bleiben exakt erhalten, geschlossene Konturen laufen nahtlos durch.
 */
export function roughenPolyline(
  pts: Vec2[],
  closed: boolean,
  params: RoughenParams,
  opts: RoughenOptions = {},
): Vec2[] {
  if (!params?.enabled || !pts || pts.length < 2) return pts;
  const scale = Math.min(3, Math.max(0.1, (params.scalePercent ?? 100) / 100));
  const strengthM = (params.strengthMm / 1000) * scale;
  if (strengthM <= 0) return pts;

  const total = polylineLength(pts, closed);
  if (total <= 1e-6) return pts;

  const stepM = Math.max(total / MAX_ROUGHEN_SAMPLES, (0.1 / Math.max(0.1, params.detailPer100Mm)) * scale);
  const count = Math.max(closed ? 4 : 2, Math.round(total / stepM));
  const step = total / count;
  const phase = opts.phaseM || 0;

  // Der Cache speichert abgeleitete ABSOLUTE Weltpunkte. Der Schlüssel MUSS
  // deshalb die vollständige aktuelle Originalgeometrie abbilden — sonst bleibt
  // die sichtbare Kontur beim Verschieben/Drehen/Punktbearbeiten stehen.
  const cacheKey = opts.cacheKey
    ? `${opts.cacheKey}|${geometrySignature(pts)}|${closed}|${params.strengthMm}|${params.detailPer100Mm}|${params.mode}|${params.seed}|${params.scalePercent ?? 100}|${phase.toFixed(4)}|${total.toFixed(4)}|${pts.length}`
    : null;
  if (cacheKey) {
    const hit = roughenCache.get(cacheKey);
    if (hit) return hit.pts;
  }


  // Kumulierte Längen der Originalpolylinie.
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  if (closed) cum.push(total);

  const base: Vec2[] = [];
  const n = closed ? count : count + 1;
  for (let i = 0; i < n; i++) {
    const d = i * step;
    const s = sampleAt(pts, closed, cum, total, d);
    // Endpunkte offener Pfade bleiben exakt erhalten.
    const isEnd = !closed && (i === 0 || i === count);
    let off = 0;
    if (!isEnd) {
      // Index aus absoluter Distanz — stabil auch nach dem Teilen der Kontur.
      const globalIndex = Math.round((phase + d) / step);
      off = seededUnit(params.seed, globalIndex) * strengthM;
    }
    base.push({ x: s.x - s.ty * off, y: s.y + s.tx * off } as Vec2);
  }

  const out = params.mode === "corner" ? base : catmullRom(base, closed, 5);
  if (!closed && params.mode !== "corner") {
    out[0] = pts[0];
    out[out.length - 1] = pts[pts.length - 1];
  }

  if (cacheKey) {
    if (roughenCache.size > 400) roughenCache.clear();
    roughenCache.set(cacheKey, { key: cacheKey, pts: out });
  }
  return out;
}

// ---------------------------------------------------------------- Linienart

/**
 * Dash-Array in Bildschirm-Pixeln. `pxPerM` ist die aktuelle Kamera-Skalierung —
 * die gespeicherten mm-Werte bleiben zoomunabhängig, nur die Projektion ändert sich.
 */
export function dashArrayPx(pattern: StrokePatternParams, pxPerM: number, lineWidthPx = 1): number[] {
  if (!pattern || pattern.kind === "solid") return [];
  const mm = (x: number) => Math.max(0.01, x) / 1000 * pxPerM;
  const dash = mm(pattern.dashLengthMm);
  const gap = mm(pattern.gapLengthMm);
  // Punkt = minimal kurzer Strich mit runder Kappe → Größe folgt der Linienstärke.
  const dot = 0.01;
  switch (pattern.kind) {
    case "dashed": return [dash, gap];
    case "dotted": return [dot, Math.max(gap, lineWidthPx * 1.2)];
    case "dash-dot": return [dash, gap, dot, gap];
    default: return [];
  }
}

/** Runde Punkte brauchen eine runde Linienkappe. */
export function lineCapForPattern(pattern: StrokePatternParams): CanvasLineCap {
  return (pattern && (pattern.kind === "dotted" || pattern.kind === "dash-dot")) ? "round" : "butt";
}

/** Dash-Offset in px, damit geteilte Konturen das Muster nahtlos fortsetzen. */
export function dashOffsetPx(phaseM: number, pxPerM: number): number {
  return -(phaseM || 0) * pxPerM;
}

// ---------------------------------------------------------------- Canvas-Pipeline

export interface StrokeRenderOptions {
  pattern?: StrokePatternParams;
  roughen?: RoughenParams;
  /** Kamera-Skalierung (Bildschirm-Pixel pro Weltmeter). */
  pxPerM: number;
  lineWidthPx?: number;
  /** Distanzversatz auf dem Originalpfad (geteilte Konturen). */
  phaseM?: number;
  cacheKey?: string;
}

/**
 * Gemeinsame Stroke-Pipeline:
 *   Originalgeometrie → Roughen (Weltkoordinaten) → Linienart entlang der
 *   Pfadlänge → Kontur zeichnen.
 * Wird von Linie, Polygon, Schraffur (außen + Löcher) und Freihand genutzt.
 */
export function tracePathWithEffects(
  ctx: CanvasRenderingContext2D,
  project: (p: Vec2) => { x: number; y: number },
  worldPts: Vec2[],
  closed: boolean,
  opts: StrokeRenderOptions,
): Vec2[] {
  const pts = opts.roughen?.enabled
    ? roughenPolyline(worldPts, closed, opts.roughen, { phaseM: opts.phaseM, cacheKey: opts.cacheKey })
    : worldPts;
  if (!pts.length) return pts;
  ctx.beginPath();
  const s0 = project(pts[0]);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < pts.length; i++) {
    const s = project(pts[i]);
    ctx.lineTo(s.x, s.y);
  }
  if (closed) ctx.closePath();
  return pts;
}

/** Setzt Linienart (Dash/Punkte, Kappe, Phase) am Kontext. */
export function applyStrokePattern(ctx: CanvasRenderingContext2D, opts: StrokeRenderOptions) {
  const pattern = opts.pattern;
  if (!pattern || pattern.kind === "solid") { ctx.setLineDash([]); ctx.lineDashOffset = 0; return; }
  ctx.setLineDash(dashArrayPx(pattern, opts.pxPerM, opts.lineWidthPx ?? ctx.lineWidth));
  ctx.lineDashOffset = dashOffsetPx(opts.phaseM || 0, opts.pxPerM);
  ctx.lineCap = lineCapForPattern(pattern);
}
