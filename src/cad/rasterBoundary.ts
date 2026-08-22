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
  /** Maskenbreite/-höhe in Pixeln. */
  wPx: number; hPx: number;
  /** Rohe Alpha-Werte (1 Byte je Pixel) der Analysemaske. */
  alpha: Uint8Array;
  /** Schwelle, ab der ein Pixel als Grenze gilt. */
  threshold: number;
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
  /**
   * Zusätzliche Begrenzungen (z. B. Vektorkanten) in dieselbe Analysemaske
   * zeichnen. Wird nach den Rasterebenen aufgerufen; Koordinaten in Pixeln
   * relativ zum Weltausschnitt (Aufrufer transformiert selbst).
   */
  drawExtra?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pxPerM: number) => void;
}

/** Maximale Maskengröße (Speicherschutz). */
const MAX_MASK_PIXELS = 16_000_000;

/**
 * Baut die Rastermaske eines Weltausschnitts.
 * Gibt null zurück, wenn im Ausschnitt kein relevanter Inhalt liegt.
 */
export function buildRasterBoundaryMask(
  rasterLayers: RasterLayers | null | undefined,
  x: number, y: number, w: number, h: number,
  options: BoundaryMaskOptions = {},
): BoundaryMask | null {
  if (w <= 0 || h <= 0) return null;
  const scope = options.scope ?? "all";
  const threshold = options.alphaThreshold ?? 24;

  const labelIds = (rasterLayers?.labelIds() ?? []).filter((id) => {
    if (options.isVisible && !options.isVisible(id)) return false;
    if (scope === "current" && options.activeLabelId) return id === options.activeLabelId;
    return true;
  });
  if (labelIds.length === 0 && !options.drawExtra) return null;

  let pxPerM = options.pxPerM ?? rasterLayers?.pxPerM ?? 1000;
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
  const ctx = canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;

  for (const id of labelIds) {
    rasterLayers?.get(id)?.drawIntoMask(ctx, x, y, w, h, pxPerM);
  }
  options.drawExtra?.(ctx, x, y, w, h, pxPerM);

  let data: Uint8ClampedArray | null = null;
  try { data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; }
  catch { data = null; }
  if (!data) return null;

  const cw = canvas.width, ch = canvas.height;
  const alpha = new Uint8Array(cw * ch);
  let any = false;
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) {
    const a = data[p];
    alpha[i] = a;
    if (!any && a >= threshold) any = true;
  }
  if (!any) return null;

  return {
    canvas, x, y, w, h, pxPerM, wPx: cw, hPx: ch, alpha, threshold,
    isBoundaryAt: (wx: number, wy: number) => {
      const px = Math.floor((wx - x) * pxPerM);
      const py = Math.floor((wy - y) * pxPerM);
      if (px < 0 || py < 0 || px >= cw || py >= ch) return false;
      return alpha[py * cw + px] >= threshold;
    },
  };
}

