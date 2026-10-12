import { describe, expect, it } from "vitest";
import { colorLuminance, contrastRatio, previewSurface } from "./previewSurface";

/** Panels-Untergrund (Nachtmodus), der unverändert bleibt wenn nichts passt. */
const fallback = { bg: "hsl(222 16% 17%)", border: "hsl(220 12% 26%)" };

const surfaceLum = (bg: string) => colorLuminance(bg)!;

describe("Vorschau-Untergrund im Freihandwerkzeug", () => {
  it("dunkle Linie (#111111) bekommt einen hellen Untergrund", () => {
    expect(surfaceLum(previewSurface("#111111", fallback).bg)).toBeGreaterThan(0.5);
  });

  it("helle Linie (#f2f2f2) bekommt einen dunklen Untergrund", () => {
    expect(surfaceLum(previewSurface("#f2f2f2", fallback).bg)).toBeLessThan(0.5);
  });

  it("unlesbare Farbangabe lässt den Panels-Untergrund stehen", () => {
    expect(previewSurface("transparent", fallback)).toBe(fallback);
  });

  it("gewählter Untergrund hat zu jeder Linienfarbe mindestens 3:1 Kontrast", () => {
    for (const color of ["#000000", "#111111", "#7f7f7f", "#ffd400", "#ffffff"]) {
      const surface = previewSurface(color, fallback);
      const ratio = contrastRatio(colorLuminance(color)!, surfaceLum(surface.bg));
      expect(ratio, `${color} auf ${surface.bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});
