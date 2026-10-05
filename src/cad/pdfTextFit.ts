import type { TextBox } from "./Scene";
import { autoSizeTextBox } from "./textAutoSize";

/**
 * Passt eine aus einem PDF übernommene Textbox an das Original an:
 * - Inhalt wird mit CAD-Metrik gemessen (kein Umbruch, keine feste Größe →
 *   nichts wird abgeschnitten).
 * - Ist der CAD-Text breiter als im PDF (andere Schrift, horizontale
 *   Skalierung, Laufweite), wird die Schriftgröße proportional verkleinert,
 *   damit die Zeichenbreite zum Original passt und Nachbarn nicht überdeckt.
 * - Position: linker Textanfang auf der PDF-Grundlinie, Drehung wie im PDF.
 * Einschränkung: CAD kennt keine horizontale Schriftstreckung und keine
 * eingebetteten PDF-Schriften – es wird die CAD-Schrift verwendet.
 */
export function fitPdfTextBox(box: TextBox, o: {
  baseline: { x: number; y: number };
  angleRad: number;
  widthPt: number;
  sizePt: number;
  toWorld: (x: number, y: number) => { x: number; y: number };
  mPerPt: number;
  pxPerM: number;
  fontScale: number;
}) {
  const style: any = box.style;
  const padM = 1 / Math.max(1e-6, o.pxPerM);
  style.autoSize = true;
  style.wrap = false;
  autoSizeTextBox(box, o.pxPerM, o.fontScale);
  const targetW = o.widthPt * o.mPerPt;
  const contentW = Math.max(1e-9, box.widthM - 2 * padM);
  if (targetW > 0 && contentW > targetW * 1.02 && Number.isFinite(style.fontSizePt)) {
    const f = Math.max(0.5, targetW / contentW);
    style.fontSizePt = style.fontSizePt * f;
    autoSizeTextBox(box, o.pxPerM, o.fontScale);
  }
  // Mittelpunkt in PDF-Raum: Grundlinie + halbe Breite entlang der Schrift,
  // vertikal so, dass Unterlängen (≈ 0,22 Höhe) unter der Grundlinie liegen.
  const wPt = Math.max(0, (box.widthM - 2 * padM) / o.mPerPt);
  const hPt = box.heightM / o.mPerPt;
  const upPt = hPt / 2 - 0.22 * o.sizePt;
  const leftPadPt = padM / o.mPerPt;
  const cos = Math.cos(o.angleRad), sin = Math.sin(o.angleRad);
  const along = wPt / 2 - leftPadPt + leftPadPt; // Textanfang = Grundlinien-Ursprung
  const cx = o.baseline.x + cos * along - sin * upPt;
  const cy = o.baseline.y + sin * along + cos * upPt;
  const c = o.toWorld(cx, cy);
  box.center = { x: c.x, y: c.y } as any;
  // Danach fixe Box: Inhalt passt bereits vollständig hinein.
  style.autoSize = false;
}

/** PDF-Strichelung (Seiten-pt) → CAD-Linienart in Welt-mm. Punkte (≈0) → Strichpunkt/Punktiert. */
export function pdfDashToPattern(dashPt: number[], mPerPt: number) {
  const mm = (pt: number) => Math.max(0.01, pt * mPerPt * 1000);
  const arr = dashPt.length % 2 ? [...dashPt, ...dashPt] : dashPt;
  const on = arr.filter((_, i) => i % 2 === 0), off = arr.filter((_, i) => i % 2 === 1);
  const gap = mm(off.reduce((s, x) => s + x, 0) / Math.max(1, off.length));
  const tiny = (x: number) => x < 0.6;
  if (on.every(tiny)) return { kind: "dotted" as const, dashLengthMm: gap, gapLengthMm: gap };
  const dash = mm(Math.max(...on));
  if (on.some(tiny)) return { kind: "dash-dot" as const, dashLengthMm: dash, gapLengthMm: gap };
  return { kind: "dashed" as const, dashLengthMm: dash, gapLengthMm: gap };
}
