import { describe, it, expect } from "vitest";
import { pdfFontPtToCadPt, ptToCssPx } from "./textTypography";

/** Welt-Höhe, wie der Renderer sie aus fontSizePt zeichnet. */
const worldHeight = (pt: number, ref: number, tps = 1) => (ptToCssPx(pt) * tps) / ref;

describe("PDF-Auflösen: Textgröße maßstabsgetreu", () => {
  const pdfWidthPt = 842; // A4 quer
  for (const [label, docWidthM] of [["klein platziert", 0.297], ["groß platziert", 29.7]] as const) {
    it(`${label}: Schrift hat dieselbe Welt-Höhe wie im PDF`, () => {
      const mPerPt = docWidthM / pdfWidthPt;
      for (const ref of [80, 3500]) {
        const pt = pdfFontPtToCadPt(10, mPerPt, ref);
        expect(worldHeight(pt, ref)).toBeCloseTo(10 * mPerPt, 9);
      }
    });
  }
  it("skaliert linear mit der Dokumentgröße (kein fester Faktor)", () => {
    const a = pdfFontPtToCadPt(12, 0.297 / 842, 80);
    const b = pdfFontPtToCadPt(12, 2.97 / 842, 80);
    expect(b / a).toBeCloseTo(10, 9);
  });
  it("berücksichtigt textPtScale (Projektmappe)", () => {
    const pt = pdfFontPtToCadPt(8, 0.001, 3780, 2.8);
    expect(worldHeight(pt, 3780, 2.8)).toBeCloseTo(0.008, 9);
  });
});
