export const MAPPE_PAGE_BASE_WIDTH_PX = 1100;

const positiveOrFallback = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

/** Basis-Pixel pro Papiermillimeter bei 100 % Zoom in der Projektmappe. */
export function mappePagePxPerMm(pageWidthMm: number): number {
  return MAPPE_PAGE_BASE_WIDTH_PX / positiveOrFallback(pageWidthMm, MAPPE_PAGE_BASE_WIDTH_PX);
}

/** Bildschirmbreite bei 100 % in die reale Strichbreite auf dem Blatt umrechnen. */
export function guideStrokePxToMm(strokeWidthPx: number, pxPerMm: number): number {
  return positiveOrFallback(strokeWidthPx, 0) / positiveOrFallback(pxPerMm, 1);
}

/** Reale Strichbreite auf dem Blatt in Bildschirm-Pixel bei 100 % umrechnen. */
export function guideStrokeMmToPx(strokeWidthMm: number, pxPerMm: number): number {
  return positiveOrFallback(strokeWidthMm, 0) * positiveOrFallback(pxPerMm, 1);
}
