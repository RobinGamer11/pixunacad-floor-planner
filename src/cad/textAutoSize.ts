import { Defaults } from "./constants";
import type { TextBox } from "./Scene";
import { measureTextBoxContent } from "./textRichRenderer";

/**
 * Auto-resize a TextBox so that its content is always fully readable.
 *
 * - wrap=true:  Width remains fixed (user-controlled). Height grows down to fit.
 * - wrap=false: Both width AND height grow to fit the longest line.
 *
 * Anchors the top-left corner so the box visually expands "downward / rightward".
 * Uses Defaults.measureReferenceScalePxPerM as the px↔meter conversion so the
 * result is independent of the current camera zoom.
 */
export function autoSizeTextBox(box: TextBox, pxPerMOverride?: number) {
  if (!box) return;
  // Wenn autoSize ausgeschaltet ist (Modus „Text passt sich Rahmen an"),
  // bleibt der Rahmen fix; Text wird nur umbrochen.
  if ((box.style as any).autoSize === false) return;
  const pxPerM = pxPerMOverride && pxPerMOverride > 0
    ? pxPerMOverride
    : Defaults.measureReferenceScalePxPerM;
  const paddingPx = 6;
  const baseFontPx = box.style.fontSizePx;

  const tlX = box.center.x - box.widthM / 2;
  const tlY = box.center.y - box.heightM / 2;

  let newWidthM = box.widthM;
  let newHeightM = box.heightM;

  if (box.style.wrap) {
    const innerWidthPx = Math.max(8, box.widthM * pxPerM - paddingPx * 2);
    const m = measureTextBoxContent(box.html || "", baseFontPx, innerWidthPx, true, paddingPx);
    newHeightM = Math.max(Defaults.textMinBoxSizeM, m.heightPx / pxPerM);
  } else {
    const m = measureTextBoxContent(box.html || "", baseFontPx, Infinity, false, paddingPx);
    newWidthM = Math.max(Defaults.textMinBoxSizeM, m.widthPx / pxPerM);
    newHeightM = Math.max(Defaults.textMinBoxSizeM, m.heightPx / pxPerM);
  }

  box.widthM = newWidthM;
  box.heightM = newHeightM;
  box.center = { x: tlX + newWidthM / 2, y: tlY + newHeightM / 2 } as any;
}
