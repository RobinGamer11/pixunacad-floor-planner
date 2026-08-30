/**
 * Gemeinsame Pinsel-Linienarten („Stifte“) für Linie, Freihand, Polygon und
 * Schraffur-Kontur — in CAD und Projektmappe identisch.
 *
 * Grundsätze
 * ----------
 * - Rein additiv: Ohne gesetztes `brushPreset` bleibt der bisherige Renderer
 *   vollständig unverändert.
 * - Kein `Math.random()` beim Rendern. Jede Verteilung stammt aus einem
 *   deterministischen, am Objekt gespeicherten Seed (`brushSeed`) und der
 *   Bogenlänge des Pfades — dadurch stabil bei Zoom, Pan, Auswahl, Export,
 *   Radieren und beim Wechsel zwischen CAD und Projektmappe.
 * - Physische Größe: Die Pinselbreite folgt immer der Linienstärke in
 *   Bildschirm-Pixeln (also der projizierten Welt-/Papierbreite).
 * - Aquarell, Spray und Halftone werden objektweise in einer transparenten
 *   Offscreen-Ebene erzeugt; `destination-out` (Blüten) wirkt ausschließlich
 *   dort und kann keine fremden CAD-Objekte löschen.
 *
 * Der Charakter der acht Pinsel folgt der Referenzdatei „Brush Lab Mobile v7“.
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
  /** Nutzt der Quellalgorithmus einen Federwinkel? (bei allen acht: nein) */
  usesAngle: boolean;
}

export const BRUSH_PRESETS: BrushPresetInfo[] = [
  { id: "watercolorSpatterBloom", label: "Aqua Blüten-Spritzer", character: 68, usesAngle: false },
  { id: "bristleFine", label: "Borste fein", character: 42, usesAngle: false },
  { id: "bristleDry", label: "Borste trocken", character: 72, usesAngle: false },
  { id: "bristleCoarse", label: "Borste grob", character: 60, usesAngle: false },
  { id: "marker", label: "Marker", character: 40, usesAngle: false },
  { id: "spray", label: "Spray", character: 55, usesAngle: false },
  { id: "halftoneFine", label: "Halftone fein", character: 52, usesAngle: false },
  { id: "halftoneBold", label: "Halftone grob", character: 60, usesAngle: false },
];

export const BRUSH_IDS = BRUSH_PRESETS.map((b) => b.id);

export function isBrushPresetId(x: any): x is BrushPresetId {
  return typeof x === "string" && (BRUSH_IDS as string[]).includes(x);
}

export function brushPresetInfo(id: any): BrushPresetInfo | null {
  return BRUSH_PRESETS.find((b) => b.id === id) || null;
}

// ------------------------------------------------------------------ Zufall

function hash32(a: number, b: number): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Deterministischer Zufallsstrom für eine Stempelposition. */
function makeRng(seed: number, index: number): () => number {
  let s = hash32(seed >>> 0, index | 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalFrom(rng: () => number): number {
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

function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${clamp(a * c.a, 0, 1)})`;
}

// ------------------------------------------------------------------ Pfad

export interface ScreenPoint { x: number; y: number }

function resample(pts: ScreenPoint[], closed: boolean, spacing: number): ScreenPoint[] {
  const src = closed && pts.length > 2 ? [...pts, pts[0]] : pts;
  if (src.length < 2) return src.slice();
  const step = Math.max(0.5, spacing);
  const out: ScreenPoint[] = [{ x: src[0].x, y: src[0].y }];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      d += step;
    }
    carry = (len - (d - step));
  }
  const last = src[src.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step * 0.25) out.push({ x: last.x, y: last.y });
  return out;
}

// ------------------------------------------------------------------ Rendering

export interface BrushRenderStyle {
  preset: BrushPresetId;
  /** 0–100 */
  character: number;
  seed: number;
  /** Sichtbare Gesamtbreite in Bildschirm-Pixeln. */
  sizePx: number;
  /** CSS-Farbe (hex oder rgba). */
  color: string;
  /** Deckkraft 0–1. */
  opacity: number;
  closed: boolean;
}

interface CacheEntry { canvas: HTMLCanvasElement; ox: number; oy: number }
const brushCache = new Map<string, CacheEntry>();
const MAX_CACHE = 80;

function pathSignature(pts: ScreenPoint[], ox: number, oy: number): string {
  let h = 0x811c9dc5;
  for (const p of pts) {
    h = hash32(h, Math.round((p.x - ox) * 8));
    h = hash32(h, Math.round((p.y - oy) * 8));
  }
  return `${pts.length}:${h.toString(36)}`;
}

/**
 * Zeichnet einen Pinselstrich entlang bereits projizierter Bildschirmpunkte.
 * Das Ergebnis wird pro Objekt und Darstellungsmaßstab zwischengespeichert.
 */
export function renderBrushStroke(
  ctx: CanvasRenderingContext2D,
  screenPts: ScreenPoint[],
  style: BrushRenderStyle,
  cacheKey?: string,
) {
  if (!screenPts || screenPts.length < 1) return;
  const size = Math.max(1.5, style.sizePx);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of screenPts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pad = Math.ceil(size * 3 + 8);
  const ox = Math.floor(minX) - pad;
  const oy = Math.floor(minY) - pad;
  const w = Math.ceil(maxX - minX) + pad * 2;
  const h = Math.ceil(maxY - minY) + pad * 2;
  // Sicherheitsgrenze: sehr große Flächen nicht offscreen puffern.
  if (w <= 0 || h <= 0 || w * h > 36_000_000) return;

  const key = cacheKey
    ? `${cacheKey}|${style.preset}|${style.character}|${style.seed}|${size.toFixed(2)}|${style.color}|${style.opacity.toFixed(3)}|${style.closed}|${w}x${h}|${pathSignature(screenPts, minX, minY)}`
    : null;

  let entry = key ? brushCache.get(key) : undefined;
  if (!entry) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const bctx = canvas.getContext("2d");
    if (!bctx) return;
    const local = screenPts.map((p) => ({ x: p.x - ox, y: p.y - oy }));
    paintBrush(bctx, local, style);
    entry = { canvas, ox, oy };
    if (key) {
      if (brushCache.size > MAX_CACHE) brushCache.clear();
      brushCache.set(key, entry);
    }
  }
  ctx.save();
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(entry.canvas, entry.ox, entry.oy);
  ctx.restore();
}

/** Leert den Pinsel-Cache (z. B. bei Themenwechsel). */
export function clearBrushCache() { brushCache.clear(); }

function paintBrush(ctx: CanvasRenderingContext2D, pts: ScreenPoint[], style: BrushRenderStyle) {
  const col = parseColor(style.color);
  const character = clamp((style.character ?? 50) / 100, 0, 1);
  const opacity = clamp(style.opacity ?? 1, 0, 1);
  const size = Math.max(1.5, style.sizePx);
  const seed = (style.seed || 1) >>> 0;
  const closed = !!style.closed && pts.length > 2;

  switch (style.preset) {
    case "marker": return paintMarker(ctx, pts, { col, opacity, size, closed });
    case "spray": return paintSpray(ctx, pts, { col, opacity, size, seed, character });
    case "halftoneFine":
    case "halftoneBold": return paintHalftone(ctx, pts, style.preset, { col, opacity, size, seed, character, closed });
    case "watercolorSpatterBloom": return paintWaterSpatter(ctx, pts, { col, opacity, size, seed, character, closed });
    case "bristleFine":
    case "bristleDry":
    case "bristleCoarse": return paintBristle(ctx, pts, style.preset, { col, opacity, size, seed, character, closed });
    default: return;
  }
}

// ---- Marker: breite gleichmäßige Bahn, eckige Enden, runde Verbindungen ----
function paintMarker(ctx: CanvasRenderingContext2D, pts: ScreenPoint[], o: { col: Rgb; opacity: number; size: number; closed: boolean }) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = clamp(o.opacity * o.col.a, 0, 1);
  ctx.strokeStyle = rgba(o.col, 1);
  ctx.lineWidth = o.size;
  ctx.lineCap = "square";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (o.closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ---- Spray ----
function paintSpray(ctx: CanvasRenderingContext2D, pts: ScreenPoint[], o: { col: Rgb; opacity: number; size: number; seed: number; character: number }) {
  const radius = o.size * 0.5;
  const samples = resample(pts, false, 3);
  const densityScale = lerp(0.5, 1.6, o.character);
  ctx.save();
  for (let i = 0; i < samples.length; i++) {
    const rng = makeRng(o.seed, i * 7 + 1);
    const p = samples[i];
    const dots = Math.ceil((3 + o.size * 0.07 * 1.05) * densityScale);
    for (let k = 0; k < dots; k++) {
      const angle = rng() * Math.PI * 2;
      const r = radius * Math.sqrt(rng());
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r,
        (0.35 + rng() * 1.3) * Math.max(0.6, o.size / 46), 0, Math.PI * 2);
      ctx.fillStyle = rgba(o.col, o.opacity * (0.08 + rng() * 0.28));
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---- Halftone ----
function paintHalftone(
  ctx: CanvasRenderingContext2D, pts: ScreenPoint[], variant: "halftoneFine" | "halftoneBold",
  o: { col: Rgb; opacity: number; size: number; seed: number; character: number; closed: boolean },
) {
  const cfg = variant === "halftoneFine"
    ? { spacingFactor: 0.15, stampRadius: 0.32, grid: 4, dotMax: 1.35, density: 0.92, alphaMin: 0.10, alphaMax: 0.34 }
    : { spacingFactor: 0.26, stampRadius: 0.46, grid: 6, dotMax: 2.85, density: 0.84, alphaMin: 0.10, alphaMax: 0.42 };
  const k = o.size / 42;
  const pressure = 0.55;
  const spacing = Math.max(5 * k, o.size * cfg.spacingFactor);
  const samples = resample(pts, o.closed, spacing);
  const radius = o.size * cfg.stampRadius * lerp(0.7, 1.25, pressure);
  const grid = Math.max(1.2, cfg.grid * k);
  const density = clamp(cfg.density * lerp(0.7, 1.25, o.character), 0.05, 1);
  const ca = Math.cos(Math.PI / 4), sa = Math.sin(Math.PI / 4);

  ctx.save();
  for (let i = 0; i < samples.length; i++) {
    const rng = makeRng(o.seed, i * 13 + 3);
    const p = samples[i];
    for (let gx = -radius; gx <= radius; gx += grid) {
      for (let gy = -radius; gy <= radius; gy += grid) {
        const rx = gx * ca - gy * sa;
        const ry = gx * sa + gy * ca;
        const distNorm = Math.hypot(rx, ry) / radius;
        if (distNorm > 1) continue;
        const intensity = Math.max(0, 1 - distNorm);
        if (rng() > density * (0.55 + intensity * 0.45)) continue;
        const dotRadius = Math.max(0.18, cfg.dotMax * k * intensity * lerp(0.55, 1.15, pressure));
        ctx.beginPath();
        ctx.arc(p.x + rx, p.y + ry, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(o.col, o.opacity * (cfg.alphaMin + rng() * (cfg.alphaMax - cfg.alphaMin)));
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ---- Aqua Blüten-Spritzer ----
function blobPath(ctx: CanvasRenderingContext2D, rng: () => number, x: number, y: number, r: number, rough: number, sx: number, sy: number) {
  const count = 20;
  const rotation = rng() * Math.PI * 2;
  ctx.beginPath();
  for (let i = 0; i <= count; i++) {
    const angle = rotation + (i % count) / count * Math.PI * 2;
    const radius = r * (1 + normalFrom(rng) * rough);
    const px = x + Math.cos(angle) * radius * sx;
    const py = y + Math.sin(angle) * radius * sy;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function paintWaterSpatter(
  ctx: CanvasRenderingContext2D, pts: ScreenPoint[],
  o: { col: Rgb; opacity: number; size: number; seed: number; character: number; closed: boolean },
) {
  const cfg = { spacingFactor: 0.30, baseRadius: 0.28, countBase: 5, countSize: 0.10, bloomChance: 0.42, haloAlpha: 0.040, edgeAlpha: 0.06 };
  const k = o.size / 46;
  const spacing = Math.max(6 * k, o.size * cfg.spacingFactor);
  const samples = resample(pts, o.closed, spacing);
  const pressure = 0.55;
  const radius = o.size * cfg.baseRadius * lerp(0.7, 1.35, pressure);
  const count = Math.ceil((cfg.countBase + o.size * cfg.countSize) * lerp(0.6, 1.5, o.character));
  const bloomChance = clamp(cfg.bloomChance * lerp(0.5, 1.4, o.character), 0, 1);

  ctx.save();
  for (let s = 0; s < samples.length; s++) {
    const rng = makeRng(o.seed, s * 17 + 5);
    const point = samples[s];
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2;
      const distOut = radius * (0.2 + rng() * 2.1);
      const cx = point.x + Math.cos(angle) * distOut;
      const cy = point.y + Math.sin(angle) * distOut;
      const r = radius * (0.12 + rng() * 0.36);

      ctx.fillStyle = rgba(o.col, o.opacity * (0.035 + rng() * 0.06));
      blobPath(ctx, rng, cx, cy, r, 0.18 + rng() * 0.12, 0.9 + rng() * 0.5, 0.9 + rng() * 0.5);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx + normalFrom(rng) * r * 0.10, cy + normalFrom(rng) * r * 0.10, r * (0.18 + rng() * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = rgba(o.col, o.opacity * (0.06 + rng() * 0.11));
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r * (1.2 + rng() * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = rgba(o.col, o.opacity * (cfg.haloAlpha * (0.6 + rng() * 0.9)));
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r * (0.95 + rng() * 0.35), 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.25, r * 0.08);
      ctx.strokeStyle = rgba(o.col, o.opacity * (cfg.edgeAlpha * (0.6 + rng() * 0.8)));
      ctx.stroke();

      // Blüte: wirkt ausschließlich in dieser Offscreen-Ebene.
      if (rng() < bloomChance) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx + normalFrom(rng) * r * 0.14, cy + normalFrom(rng) * r * 0.14, r * (0.18 + rng() * 0.22), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,.03)";
        ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
}

// ---- Borstenpinsel ----
interface Bristle {
  across: number; thickness: number; alpha: number; paint: number; permanentGap: boolean;
  gapFrequency: number; gapPhase: number; microFrequency: number; microPhase: number;
  dry: number; waviness: number; wavePhase: number; edge: number;
}

function makeBristles(variant: "bristleFine" | "bristleDry" | "bristleCoarse", seed: number, character: number): Bristle[] {
  const configs = {
    bristleFine: { count: 86, dry: .34, thicknessMin: .25, thicknessMax: .92, inactiveChance: .07, edgeLoss: .18, waviness: .010, longGap: .16, paintMin: .58, paintMax: 1.00 },
    bristleDry: { count: 68, dry: .66, thicknessMin: .28, thicknessMax: 1.12, inactiveChance: .19, edgeLoss: .30, waviness: .015, longGap: .30, paintMin: .30, paintMax: .82 },
    bristleCoarse: { count: 42, dry: .50, thicknessMin: .55, thicknessMax: 2.05, inactiveChance: .14, edgeLoss: .27, waviness: .020, longGap: .24, paintMin: .40, paintMax: .92 },
  } as const;
  const cfg = configs[variant];
  const characterDry = (character - .5) * .34;
  const out: Bristle[] = [];
  for (let i = 0; i < cfg.count; i++) {
    const rng = makeRng(seed, i * 31 + 11);
    const u = i / Math.max(1, cfg.count - 1);
    let across = lerp(-.5, .5, u);
    across += normalFrom(rng) * (variant === "bristleCoarse" ? .018 : .010);
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
      dry: clamp(cfg.dry + characterDry + normalFrom(rng) * .07, .05, .92),
      waviness: normalFrom(rng) * cfg.waviness,
      wavePhase: rng() * Math.PI * 2,
      edge,
    });
  }
  return out;
}

function paintBristle(
  ctx: CanvasRenderingContext2D, pts: ScreenPoint[],
  variant: "bristleFine" | "bristleDry" | "bristleCoarse",
  o: { col: Rgb; opacity: number; size: number; seed: number; character: number; closed: boolean },
) {
  const samples = resample(pts, o.closed, Math.max(1.2, o.size * 0.06));
  if (samples.length < 2) return;
  const bristles = makeBristles(variant, o.seed, o.character);
  const pressure = 0.55;
  const width = o.size * lerp(.76, 1.12, pressure);
  const k = o.size / 60;
  let travel = 0;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const d = Math.max(.25, Math.hypot(b.x - a.x, b.y - a.y));
    travel += d;
    const dx = (b.x - a.x) / d, dy = (b.y - a.y) / d;
    const nx = -dy, ny = dx;
    const segRng = makeRng(o.seed, i * 97 + 7);

    for (const bristle of bristles) {
      if (bristle.permanentGap) continue;
      const longNoise = (Math.sin(travel * bristle.gapFrequency + bristle.gapPhase) + 1) * .5;
      const microNoise = (Math.sin(travel * bristle.microFrequency + bristle.microPhase) + 1) * .5;
      const threshold = clamp(bristle.dry * lerp(1.22, .78, pressure) * lerp(1.08, .82, bristle.paint), .05, .94);
      const contact = longNoise * .78 + microNoise * .22 - bristle.edge * .08;
      if (contact < threshold) continue;

      const waveA = Math.sin(bristle.wavePhase + travel * .022) * width * bristle.waviness;
      const waveB = Math.sin(bristle.wavePhase + (travel + d) * .022) * width * bristle.waviness;
      const offset = bristle.across * width;
      const localAlpha = o.opacity * bristle.alpha * lerp(.55, 1.0, contact) * lerp(.55, 1.0, bristle.paint);

      ctx.beginPath();
      ctx.moveTo(a.x + nx * (offset + waveA), a.y + ny * (offset + waveA));
      ctx.lineTo(b.x + nx * (offset + waveB), b.y + ny * (offset + waveB));
      ctx.lineWidth = Math.max(.24, bristle.thickness * k * lerp(.78, 1.28, pressure));
      ctx.strokeStyle = rgba(o.col, localAlpha);
      ctx.stroke();
    }

    // Feine Randverluste / trockene Körnung.
    const grains = Math.min(16, Math.ceil(d * 1.1));
    for (let g = 0; g < grains; g++) {
      const t = segRng();
      const x = lerp(a.x, b.x, t) + normalFrom(segRng) * width * .6;
      const y = lerp(a.y, b.y, t) + normalFrom(segRng) * width * .6;
      const s = (.2 + segRng() * .7) * Math.max(.5, k);
      ctx.fillStyle = rgba(o.col, o.opacity * (.06 + segRng() * .15));
      ctx.fillRect(x, y, s, s);
    }
  }
  ctx.restore();
}
