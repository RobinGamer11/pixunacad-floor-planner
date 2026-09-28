export const CSS_PX_PER_PT = 96 / 72;
export const MM_PER_PT = 25.4 / 72;

export function ptToCssPx(pt: number): number {
  return pt * CSS_PX_PER_PT;
}

export function cssPxToPt(px: number): number {
  return px / CSS_PX_PER_PT;
}

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

export function textStyleFontSizePt(style: { fontSizePt?: number; fontSizePx?: number }): number {
  if (Number.isFinite(style.fontSizePt) && Number(style.fontSizePt) > 0) return Number(style.fontSizePt);
  if (Number.isFinite(style.fontSizePx) && Number(style.fontSizePx) > 0) return cssPxToPt(Number(style.fontSizePx));
  return 11;
}

export function clampFontSizePt(pt: number): number {
  return Math.max(1, Math.min(400, pt));
}
/** CSS-Pixel pro Millimeter (96 dpi Referenz). */
export const CSS_PX_PER_MM = 96 / 25.4;

/**
 * Zentrale Annotationsskalierung im CAD-Modellraum: Dokument-Millimeter
 * (Tabellenspalten, Zeilenhöhen) → Modell-Meter. Bewusst maßstabsunabhängig —
 * das CAD-Modell ist immer 1:1, der Ausgabemaßstab wirkt erst im Druckplan.
 * Der Bezug entspricht exakt der pt-Darstellung des Textwerkzeugs
 * (ptToCssPx(pt) * cam.scale / referencePxPerM).
 */
export const ANNOTATION_M_PER_MM = CSS_PX_PER_MM / 80;

/**
 * PDF-Schriftgröße (PDF-Punkte der Seite) → CAD-fontSizePt, sodass die Schrift
 * im Modellraum exakt dieselbe Höhe hat wie im platzierten PDF.
 * Renderer: Bildschirmhöhe = ptToCssPx(pt) * textPtScale * cam.scale / referencePxPerM
 * ⇒ Welt-Höhe = ptToCssPx(pt) * textPtScale / referencePxPerM.
 * Soll: Welt-Höhe = pdfFontPt * worldMPerPdfPt (gleiche Skalierung wie Linien/Flächen).
 */
export function pdfFontPtToCadPt(
  pdfFontPt: number,
  worldMPerPdfPt: number,
  referencePxPerM: number,
  textPtScale = 1,
): number {
  const ref = Number.isFinite(referencePxPerM) && referencePxPerM > 0 ? referencePxPerM : 80;
  const tps = Number.isFinite(textPtScale) && textPtScale > 0 ? textPtScale : 1;
  const worldH = Math.max(0, pdfFontPt) * Math.max(0, worldMPerPdfPt);
  return (worldH * ref) / (CSS_PX_PER_PT * tps);
}
