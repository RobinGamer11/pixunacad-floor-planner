import { describe, expect, it } from "vitest";
import {
  guideStrokeMmToPx,
  guideStrokePxToMm,
  mappePagePxPerMm,
} from "./guideStrokeWidth";

describe("Hilfslinien-Strichstärke", () => {
  it("rechnet Pixel bei 100 Prozent in reale Papiermillimeter um", () => {
    const pxPerMm = mappePagePxPerMm(420);

    expect(pxPerMm).toBeCloseTo(1100 / 420, 8);
    expect(guideStrokePxToMm(1, pxPerMm)).toBeCloseTo(420 / 1100, 8);
  });

  it("hält die px- und mm-Eingaben verlustfrei gekoppelt", () => {
    const pxPerMm = mappePagePxPerMm(297);
    const strokeWidthMm = guideStrokePxToMm(3.75, pxPerMm);

    expect(guideStrokeMmToPx(strokeWidthMm, pxPerMm)).toBeCloseTo(3.75, 8);
  });
});
