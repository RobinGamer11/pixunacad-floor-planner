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