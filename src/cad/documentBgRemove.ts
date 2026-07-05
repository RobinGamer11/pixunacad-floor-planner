/**
 * Hintergrund-Ausschnitt für Dokumente (PNG/JPG/PDF).
 *
 * Konzept:
 * - Foreground-Alpha-Maske pro Dokument (Canvas, weiß = Vordergrund, schwarz = Hintergrund).
 * - Maske startet vollständig schwarz (alles Hintergrund).
 * - "Magic Wand": Klick sampelt Quellfarbe → Flood-Fill über zusammenhängende Region
 *   ähnlicher Farbe (RGB-Distanz ≤ tolerance) und setzt diese als Foreground/Background.
 * - "Pinsel": Kreis-Stempel entlang der Mausbewegung, kann Foreground hinzufügen/entfernen.
 * - Rendering: Foreground/Background werden separat eingefärbt oder transparent gemacht.
 */

import { Defaults } from "./constants";
import type { DocumentObject } from "./Scene";
import { Vec2 } from "./geometry";
import { documentCenterWorld } from "./documentGeometry";

export interface BgRemoval {
  enabled: boolean;
  /** Persistente Foreground-Alpha-Maske (PNG-DataURL). null = leer/schwarz. */
  fgMaskDataUrl: string | null;
  /** Flood-Fill-Toleranz (0..128). Höher = großzügiger. */
  tolerance: number;
  /** Pinselradius in Welt-Metern. */
  brushRadiusM: number;
  /** Vordergrund-Einfärbung (hex). null = keine Einfärbung (Original). */
  fgColor: string | null;
  /** Vordergrund-Deckkraft 0..1 (1 = voll sichtbar / voll eingefärbt). */
  fgAlpha: number;
  /** Hintergrund-Einfärbung (hex). null = transparent (Original weggeschnitten). */
  bgColor: string | null;
  /** Hintergrund-Deckkraft 0..1 (1 = voll sichtbar). Bei bgColor=null: 0=komplett weg. */
  bgAlpha: number;
}

export function defaultBgRemoval(): BgRemoval {
  return {
    enabled: false,
    fgMaskDataUrl: null,
    tolerance: 24,
    brushRadiusM: 0.15,
    fgColor: null,
    fgAlpha: 1,
    bgColor: null,
    bgAlpha: 0,
  };
}

export function ensureBgRemoval(doc: DocumentObject): BgRemoval {
  const anyDoc = doc as any;
  if (!anyDoc.bgRemoval) anyDoc.bgRemoval = defaultBgRemoval();
  return anyDoc.bgRemoval as BgRemoval;
}

/** Signatur für Renderer-Cache. */
export function bgRemovalSignature(doc: DocumentObject): string {
  const anyDoc = doc as any;
  const b: BgRemoval | undefined = anyDoc.bgRemoval;
  if (!b || !b.enabled) return "";
  return [
    b.enabled ? "1" : "0",
    b.fgColor || "-",
    b.fgAlpha.toFixed(3),
    b.bgColor || "-",
    b.bgAlpha.toFixed(3),
    anyDoc._bgMaskRev || 0,
  ].join("|");
}

// ------------------------------------------------------------ mask & source

function getMaskDimensions(doc: DocumentObject): { w: number; h: number } {
  const cap = Defaults.docMaskMaxPx || 2048;
  const pw = doc.pixelWidth || Math.round(doc.widthM * 200);
  const ph = doc.pixelHeight || Math.round(doc.heightM * 200);
  if (pw <= 0 || ph <= 0) return { w: 512, h: 512 };
  const longer = Math.max(pw, ph);
  if (longer <= cap) return { w: pw, h: ph };
  const f = cap / longer;
  return { w: Math.max(1, Math.round(pw * f)), h: Math.max(1, Math.round(ph * f)) };
}

export function getOrCreateBgMask(doc: DocumentObject, onLoaded?: () => void): HTMLCanvasElement {
  const anyDoc = doc as any;
  if (anyDoc._bgFgMask) return anyDoc._bgFgMask as HTMLCanvasElement;
  const { w, h } = getMaskDimensions(doc);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  // Start: alles Hintergrund (schwarz).
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  anyDoc._bgFgMask = c;
  anyDoc._bgMaskRev = (anyDoc._bgMaskRev || 0) + 1;
  const b = ensureBgRemoval(doc);
  if (b.fgMaskDataUrl) {
    const img = new Image();
    img.onload = () => {
      try {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        anyDoc._bgMaskRev = (anyDoc._bgMaskRev || 0) + 1;
        onLoaded?.();
      } catch { /* ignore */ }
    };
    img.src = b.fgMaskDataUrl;
  }
  return c;
}

export function resetBgMask(doc: DocumentObject) {
  const anyDoc = doc as any;
  anyDoc._bgFgMask = null;
  anyDoc._bgMaskRev = (anyDoc._bgMaskRev || 0) + 1;
  const b = ensureBgRemoval(doc);
  b.fgMaskDataUrl = null;
}

export function exportBgMaskDataUrl(doc: DocumentObject): string | null {
  const anyDoc = doc as any;
  if (!anyDoc._bgFgMask) return ensureBgRemoval(doc).fgMaskDataUrl;
  try {
    const url = (anyDoc._bgFgMask as HTMLCanvasElement).toDataURL("image/png");
    ensureBgRemoval(doc).fgMaskDataUrl = url;
    return url;
  } catch { return ensureBgRemoval(doc).fgMaskDataUrl; }
}

// -------- source pixel cache (from doc.src) --------

const _sourceCache = new Map<string, { data: Uint8ClampedArray; w: number; h: number } | "pending">();

export function ensureSourcePixels(doc: DocumentObject, onReady?: () => void): { data: Uint8ClampedArray; w: number; h: number } | null {
  const key = doc.id + "|" + (doc.src?.length || 0);
  const c = _sourceCache.get(key);
  if (c && c !== "pending") return c;
  if (c === "pending") return null;
  _sourceCache.set(key, "pending");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const { w, h } = getMaskDimensions(doc);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const cx = cv.getContext("2d", { willReadFrequently: true })!;
      cx.drawImage(img, 0, 0, w, h);
      const data = cx.getImageData(0, 0, w, h).data;
      _sourceCache.set(key, { data, w, h });
      onReady?.();
    } catch {
      _sourceCache.delete(key);
    }
  };
  img.onerror = () => { _sourceCache.delete(key); };
  img.src = doc.src;
  return null;
}

// ------------------------------------------------------------ world → mask

function worldToMaskPx(doc: DocumentObject, p: Vec2, mask: HTMLCanvasElement): { x: number; y: number } {
  const c = documentCenterWorld(doc);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const cosA = Math.cos(-doc.rotationRad);
  const sinA = Math.sin(-doc.rotationRad);
  const lx = dx * cosA - dy * sinA + doc.widthM / 2;
  const ly = dx * sinA + dy * cosA + doc.heightM / 2;
  return { x: (lx / doc.widthM) * mask.width, y: (ly / doc.heightM) * mask.height };
}

// ------------------------------------------------------------ flood fill

/**
 * Magic-Wand: sampelt Farbe an worldPoint, füllt zusammenhängende Region
 * mit RGB-Distanz ≤ tolerance und setzt sie im FG-Mask auf Foreground oder Background.
 */
export function floodFillAt(
  doc: DocumentObject,
  worldPoint: Vec2,
  tolerance: number,
  target: "fg" | "bg",
  onReady?: () => void,
): boolean {
  const src = ensureSourcePixels(doc, () => onReady?.());
  if (!src) return false;
  const mask = getOrCreateBgMask(doc);
  const p = worldToMaskPx(doc, worldPoint, mask);
  const px = Math.round(p.x), py = Math.round(p.y);
  if (px < 0 || py < 0 || px >= src.w || py >= src.h) return false;

  const idx0 = (py * src.w + px) * 4;
  const r0 = src.data[idx0], g0 = src.data[idx0 + 1], b0 = src.data[idx0 + 2];
  const tol2 = tolerance * tolerance * 3; // Distanz² über 3 Kanäle

  // BFS over pixels. Verwendet Uint8Array als visited.
  const w = src.w, h = src.h;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [py * w + px];
  visited[py * w + px] = 1;
  const hits: number[] = [];
  const maxHits = w * h;
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % w, y = (k / w) | 0;
    const di = k * 4;
    const dr = src.data[di] - r0, dg = src.data[di + 1] - g0, db = src.data[di + 2] - b0;
    const d2 = dr * dr + dg * dg + db * db;
    if (d2 > tol2) continue;
    hits.push(k);
    if (hits.length > maxHits) break;
    // 4-neighborhood
    if (x > 0 && !visited[k - 1]) { visited[k - 1] = 1; stack.push(k - 1); }
    if (x < w - 1 && !visited[k + 1]) { visited[k + 1] = 1; stack.push(k + 1); }
    if (y > 0 && !visited[k - w]) { visited[k - w] = 1; stack.push(k - w); }
    if (y < h - 1 && !visited[k + w]) { visited[k + w] = 1; stack.push(k + w); }
  }
  if (!hits.length) return false;

  const ctx = mask.getContext("2d", { willReadFrequently: true })!;
  const md = ctx.getImageData(0, 0, w, h);
  const val = target === "fg" ? 255 : 0;
  for (const k of hits) {
    const j = k * 4;
    md.data[j] = val; md.data[j + 1] = val; md.data[j + 2] = val; md.data[j + 3] = 255;
  }
  ctx.putImageData(md, 0, 0);
  (doc as any)._bgMaskRev = ((doc as any)._bgMaskRev || 0) + 1;
  const b = ensureBgRemoval(doc);
  b.fgMaskDataUrl = null; // dirty — Re-Export lazy
  return true;
}

// ------------------------------------------------------------ brush

export function paintBrushAt(doc: DocumentObject, worldPoint: Vec2, radiusM: number, target: "fg" | "bg"): boolean {
  const mask = getOrCreateBgMask(doc);
  const p = worldToMaskPx(doc, worldPoint, mask);
  const sx = mask.width / doc.widthM;
  const sy = mask.height / doc.heightM;
  const pr = radiusM * Math.max(sx, sy);
  if (p.x + pr < 0 || p.y + pr < 0 || p.x - pr > mask.width || p.y - pr > mask.height) return false;
  const ctx = mask.getContext("2d")!;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = target === "fg" ? "#ffffff" : "#000000";
  ctx.beginPath();
  ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  (doc as any)._bgMaskRev = ((doc as any)._bgMaskRev || 0) + 1;
  ensureBgRemoval(doc).fgMaskDataUrl = null;
  return true;
}

// ------------------------------------------------------------ apply to canvas

function hexToRgb(hex: string): [number, number, number] {
  const h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Wendet BgRemoval auf eine (bereits gefilterte) Bild-Canvas an.
 * Skaliert die Maske auf die Canvas-Größe und verrechnet FG/BG-Einfärbung + Alpha.
 * Gibt neues Canvas zurück (oder das Original, wenn nichts zu tun).
 */
export function applyBgRemovalToCanvas(
  source: HTMLCanvasElement,
  doc: DocumentObject,
): HTMLCanvasElement {
  const b: BgRemoval | undefined = (doc as any).bgRemoval;
  if (!b || !b.enabled) return source;
  const mask: HTMLCanvasElement | null = (doc as any)._bgFgMask || null;
  if (!mask) return source;
  const w = source.width, h = source.height;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // Maske auf Zielgröße skalieren
  const mScaled = document.createElement("canvas");
  mScaled.width = w; mScaled.height = h;
  const mctx = mScaled.getContext("2d", { willReadFrequently: true })!;
  mctx.imageSmoothingEnabled = true;
  (mctx as any).imageSmoothingQuality = "high";
  mctx.drawImage(mask, 0, 0, w, h);
  const mdata = mctx.getImageData(0, 0, w, h).data;

  const fgTint = b.fgColor ? hexToRgb(b.fgColor) : null;
  const bgTint = b.bgColor ? hexToRgb(b.bgColor) : null;
  const fgA = Math.max(0, Math.min(1, b.fgAlpha));
  const bgA = Math.max(0, Math.min(1, b.bgAlpha));

  for (let i = 0; i < px.length; i += 4) {
    // Maske: FG-Anteil aus Rot-Kanal (0..1)
    const m = mdata[i] / 255;
    const bgW = 1 - m;
    const origA = px[i + 3] / 255;
    if (origA === 0) continue;

    // FG-Beitrag
    let fgR = px[i], fgG = px[i + 1], fgB = px[i + 2], fgAOut = origA;
    if (fgTint) {
      // Luminanz-Ramp wie beim Tint-Filter (dunkel → tint, hell → weiß)
      const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      fgR = fgTint[0] + (255 - fgTint[0]) * lum;
      fgG = fgTint[1] + (255 - fgTint[1]) * lum;
      fgB = fgTint[2] + (255 - fgTint[2]) * lum;
    }
    fgAOut = origA * fgA;

    // BG-Beitrag
    let bgR = px[i], bgG = px[i + 1], bgB = px[i + 2], bgAOut = origA;
    if (bgTint) {
      const lum = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
      bgR = bgTint[0] + (255 - bgTint[0]) * lum;
      bgG = bgTint[1] + (255 - bgTint[1]) * lum;
      bgB = bgTint[2] + (255 - bgTint[2]) * lum;
    }
    bgAOut = origA * bgA;

    // Kombinieren nach Maskengewicht
    const outR = fgR * m + bgR * bgW;
    const outG = fgG * m + bgG * bgW;
    const outB = fgB * m + bgB * bgW;
    const outA = fgAOut * m + bgAOut * bgW;

    px[i] = outR; px[i + 1] = outG; px[i + 2] = outB; px[i + 3] = Math.max(0, Math.min(255, outA * 255));
  }
  ctx.putImageData(img, 0, 0);
  return out;
}
