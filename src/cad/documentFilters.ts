/**
 * Filter-System für Dokumente (PDF/Bild).
 * Unterstützt: Schwarz/Weiß, Graustufen, Einzelfarbe (Tint), Frei (Dominantfarben-Remap).
 * Original = kein Filter (activeFilterId === null).
 */

export type DocumentFilterMode = "bw" | "grayscale" | "tint" | "free" | "adjust";

export interface FreeRemap {
  /** Quellfarbe (hex #rrggbb). */
  from: string;
  /** Zielfarbe (hex #rrggbb). Leer = keine Änderung. */
  to: string;
}

/**
 * Parameter für den "adjust"-Filter (Bildbearbeitung).
 * 30 Regler in 5 Gruppen (Aquarell-Archviz-Pipeline), Werte 0..100.
 * Definition + Presets in imageAdjustPipeline.ts.
 */
export type { AdjustParams } from "./imageAdjustPipeline";
export { DEFAULT_ADJUST, ADJUST_GROUPS, ADJUST_PRESETS, ADJUST_KEYS } from "./imageAdjustPipeline";
import type { AdjustParams } from "./imageAdjustPipeline";
import { DEFAULT_ADJUST, renderAdjust } from "./imageAdjustPipeline";

export interface DocumentFilter {
  id: string;
  name: string;
  mode: DocumentFilterMode;
  /** "tint" — Zielfarbe. */
  tintColor?: string;
  /** "bw" — Schwellwert (0..255). Default 160. */
  bwThreshold?: number;
  /** "free" — Liste der dominanten Quellfarben → neuer Zielfarbe. */
  freeRemaps?: FreeRemap[];
  /** "adjust" — Bildbearbeitungs-Parameter. */
  adjust?: AdjustParams;
}

export function newFilterId(): string {
  return "flt_" + Math.random().toString(36).slice(2, 10);
}

export function makeDefaultFilter(mode: DocumentFilterMode, name?: string): DocumentFilter {
  const f: DocumentFilter = { id: newFilterId(), name: name || filterModeLabel(mode), mode };
  if (mode === "bw") f.bwThreshold = 160;
  if (mode === "tint") f.tintColor = "#c0392b";
  if (mode === "free") f.freeRemaps = [];
  if (mode === "adjust") f.adjust = { ...DEFAULT_ADJUST };
  return f;
}

export function filterModeLabel(mode: DocumentFilterMode): string {
  switch (mode) {
    case "bw": return "Schwarz/Weiß";
    case "grayscale": return "Graustufen";
    case "tint": return "Einzelfarbe";
    case "free": return "Frei";
    case "adjust": return "Bildbearbeitung";
  }
}

/** Stabile Signatur — Cache-Key. */
export function filterSignature(f: DocumentFilter): string {
  return JSON.stringify([f.mode, f.tintColor || "", f.bwThreshold ?? 0, f.freeRemaps || [], f.adjust || null]);
}

// ---------------------------------------------------------------- color utils
function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (h.length >= 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return [0, 0, 0];
}
function clamp8(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
function luminance(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp8(n).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

// ---------------------------------------------------------------- apply
/**
 * Wendet einen Filter auf ein Quellbild/-Canvas an und liefert ein neues Canvas.
 * Erhält Alpha-Kanal (transparente Stellen bleiben transparent).
 */
export function applyFilterToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  filter: DocumentFilter | null,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.floor(width));
  out.height = Math.max(1, Math.floor(height));
  const ctx = out.getContext("2d", { willReadFrequently: true })!;

  // "adjust" → Aquarell-Archviz-Pipeline.
  if (filter && filter.mode === "adjust") {
    return renderAdjust(source, out.width, out.height, { ...DEFAULT_ADJUST, ...(filter.adjust || {}) });
  }

  ctx.drawImage(source, 0, 0, out.width, out.height);
  if (!filter) return out;
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const px = img.data;
  switch (filter.mode) {
    case "bw": {
      const t = typeof filter.bwThreshold === "number" ? filter.bwThreshold : 160;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const lum = luminance(px[i], px[i + 1], px[i + 2]);
        const v = lum < t ? 0 : 255;
        px[i] = v; px[i + 1] = v; px[i + 2] = v;
      }
      break;
    }
    case "grayscale": {
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const lum = clamp8(luminance(px[i], px[i + 1], px[i + 2]));
        px[i] = lum; px[i + 1] = lum; px[i + 2] = lum;
      }
      break;
    }
    case "tint": {
      const [tr, tg, tb] = hexToRgb(filter.tintColor || "#000000");
      // Erhält Originalhelligkeit: dunkles Quellpixel → dunkle Variante der Tintfarbe,
      // helles Quellpixel → in Richtung Weiß.
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const lum = luminance(px[i], px[i + 1], px[i + 2]) / 255; // 0..1
        // out = tint*(1 - (1-lum)) + white*(1-...) — simple multiply ramp
        // Ergebnis: lum=0 → tint, lum=1 → weiß.
        px[i]     = clamp8(tr + (255 - tr) * lum);
        px[i + 1] = clamp8(tg + (255 - tg) * lum);
        px[i + 2] = clamp8(tb + (255 - tb) * lum);
      }
      break;
    }
    case "free": {
      const remaps = (filter.freeRemaps || []).filter(r => r && r.from && r.to);
      if (remaps.length === 0) break;
      const fromRgb = remaps.map(r => hexToRgb(r.from));
      const toRgb = remaps.map(r => hexToRgb(r.to));
      const fromLum = fromRgb.map(([r, g, b]) => luminance(r, g, b));
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        // Nächste Quellfarbe finden (euklidische Distanz im RGB).
        let best = 0, bestD = Infinity;
        for (let k = 0; k < fromRgb.length; k++) {
          const dr = r - fromRgb[k][0], dg = g - fromRgb[k][1], db = b - fromRgb[k][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) { bestD = d; best = k; }
        }
        // Luminanz-Verhältnis übernehmen.
        const [tr, tg, tb] = toRgb[best];
        const srcL = luminance(r, g, b);
        const refL = fromLum[best] || 1;
        const ratio = srcL / Math.max(1, refL);
        px[i]     = clamp8(tr * ratio);
        px[i + 1] = clamp8(tg * ratio);
        px[i + 2] = clamp8(tb * ratio);
      }
      break;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ---------------------------------------------------------------- dominant colors
/**
 * Extrahiert die N häufigsten Farben aus einem Quellbild.
 * Quantisiert auf 4 Bit pro Kanal (4096 Buckets) und liefert die größten Cluster.
 */
export function extractDominantColors(source: CanvasImageSource, sampleSize = 160, topN = 8): string[] {
  const c = document.createElement("canvas");
  // Quelldimensionen ermitteln
  const sw = (source as any).width || (source as any).naturalWidth || sampleSize;
  const sh = (source as any).height || (source as any).naturalHeight || sampleSize;
  const aspect = sh > 0 ? sw / sh : 1;
  const w = aspect >= 1 ? sampleSize : Math.max(8, Math.round(sampleSize * aspect));
  const h = aspect >= 1 ? Math.max(8, Math.round(sampleSize / aspect)) : sampleSize;
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) { e.count++; e.r += r; e.g += g; e.b += b; }
    else buckets.set(key, { count: 1, r, g, b });
  }
  const arr = Array.from(buckets.values()).sort((a, b) => b.count - a.count).slice(0, topN);
  return arr.map(e => rgbToHex(e.r / e.count, e.g / e.count, e.b / e.count));
}

// adjust-Filter → delegiert an renderAdjust (imageAdjustPipeline.ts).


