/**
 * Hybride Grenz-Analyse (Vektor + Raster) — Vorbereitung für Füllung/Schraffur.
 *
 * Die Füllwerkzeuge arbeiten heute rein vektoriell. Damit sie später auch
 * Rasterstriche (Pixelmodus der Projektmappe) als Begrenzung erkennen können,
 * liefert dieses Modul eine einheitliche Maske eines Weltausschnitts:
 * deckende Pixel = Grenze, transparente Pixel = füllbarer Bereich.
 *
 * Ebenenwahl (`RasterScope`) ist bereits vorgesehen:
 * - "current": nur die aktuell aktive Ebene begrenzt
 * - "all":     alle sichtbaren Ebenen begrenzen gemeinsam
 */
import type { RasterLayers } from "./RasterLayers";

export type RasterScope = "current" | "all";

export interface BoundaryMask {
  canvas: HTMLCanvasElement;
  /** Weltrechteck, das die Maske abdeckt. */
  x: number; y: number; w: number; h: number;
  pxPerM: number;
  /** true, wenn der Weltpunkt in der Maske deckend (= Grenze) ist. */
  isBoundaryAt: (wx: number, wy: number) => boolean;
}

export interface BoundaryMaskOptions {
  scope?: RasterScope;
  /** Aktive Ebene (nur bei scope === "current" relevant). */
  activeLabelId?: string | null;
  /** Sichtbarkeitsfilter für Ebenen. */
  isVisible?: (labelId: string) => boolean;
  /** Analyse-Auflösung (Pixel pro Weltmeter). */
  pxPerM?: number;
  /** Ab welchem Alpha ein Pixel als Grenze gilt. */
  alphaThreshold?: number;
}

/** Maximale Maskengröße (Speicherschutz). */
const MAX_MASK_PIXELS = 16_000_000;

/**
 * Baut die Rastermaske eines Weltausschnitts.
 * Gibt null zurück, wenn im Ausschnitt kein relevanter Rasterinhalt liegt.
 */
export function buildRasterBoundaryMask(
  rasterLayers: RasterLayers | null | undefined,
  x: number, y: number, w: number, h: number,
  options: BoundaryMaskOptions = {},
): BoundaryMask | null {
  if (!rasterLayers || w <= 0 || h <= 0) return null;
  const scope = options.scope ?? "all";
  const threshold = options.alphaThreshold ?? 24;

  const labelIds = rasterLayers.labelIds().filter((id) => {
    if (options.isVisible && !options.isVisible(id)) return false;
    if (scope === "current" && options.activeLabelId) return id === options.activeLabelId;
    return true;
  });
  if (labelIds.length === 0) return null;

  let pxPerM = options.pxPerM ?? rasterLayers.pxPerM;
  let wPx = Math.ceil(w * pxPerM);
  let hPx = Math.ceil(h * pxPerM);
  if (wPx * hPx > MAX_MASK_PIXELS) {
    const k = Math.sqrt(MAX_MASK_PIXELS / (wPx * hPx));
    pxPerM *= k;
    wPx = Math.max(1, Math.floor(wPx * k));
    hPx = Math.max(1, Math.floor(hPx * k));
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, wPx);
  canvas.height = Math.max(1, hPx);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;

  for (const id of labelIds) {
    rasterLayers.get(id)?.drawIntoMask(ctx, x, y, w, h, pxPerM);
  }

  let data: Uint8ClampedArray | null = null;
  try { data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; }
  catch { data = null; }
  if (!data) return null;

  let any = false;
  for (let i = 3; i < data.length; i += 4) { if (data[i] >= threshold) { any = true; break; } }
  if (!any) return null;

  const cw = canvas.width, ch = canvas.height;
  return {
    canvas, x, y, w, h, pxPerM,
    isBoundaryAt: (wx: number, wy: number) => {
      const px = Math.floor((wx - x) * pxPerM);
      const py = Math.floor((wy - y) * pxPerM);
      if (px < 0 || py < 0 || px >= cw || py >= ch) return false;
      return data![(py * cw + px) * 4 + 3] >= threshold;
    },
  };
}
