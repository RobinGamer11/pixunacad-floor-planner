export const MAPPE_PAGE_BASE_WIDTH_PX = 1100;

/**
 * Kanonische Bildschirmauflösung der Projektmappe bei 100 % Zoom:
 * CSS-Pixel pro Papiermillimeter — unabhängig vom Seitenformat.
 *
 * Referenz ist A3-quer (420 mm) auf 1100 px. Dadurch bleibt jede reale
 * mm-/pt-Größe (Linienstärke, Text, Tabellen, Schraffur) beim Wechsel des
 * Seitenformats exakt gleich; nur die physische Blattgröße ändert sich.
 */
export const MAPPE_CANONICAL_PX_PER_MM = MAPPE_PAGE_BASE_WIDTH_PX / 420;

const positiveOrFallback = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

/** Basis-Pixel pro Papiermillimeter bei 100 % Zoom in der Projektmappe. */
export function mappePagePxPerMm(_pageWidthMm?: number): number {
  return MAPPE_CANONICAL_PX_PER_MM;
}


/** Bildschirmbreite bei 100 % in die reale Strichbreite auf dem Blatt umrechnen. */
export function guideStrokePxToMm(strokeWidthPx: number, pxPerMm: number): number {
  return positiveOrFallback(strokeWidthPx, 0) / positiveOrFallback(pxPerMm, 1);
}

/** Reale Strichbreite auf dem Blatt in Bildschirm-Pixel bei 100 % umrechnen. */
export function guideStrokeMmToPx(strokeWidthMm: number, pxPerMm: number): number {
  return positiveOrFallback(strokeWidthMm, 0) * positiveOrFallback(pxPerMm, 1);
}
