import { describe, it, expect } from "vitest";
import {
  normalizeScaleDen,
  modelMetersToPaperMm,
  paperMmToModelMeters,
  formatScaleLabel,
  mmToPt,
  MM_TO_PT,
} from "./scale";

describe("normalizeScaleDen", () => {
  it("akzeptiert Zahlen, Verhältnisse und Brüche", () => {
    expect(normalizeScaleDen(100)).toBe(100);
    expect(normalizeScaleDen("1:50")).toBe(50);
    expect(normalizeScaleDen("1 : 125")).toBe(125);
    expect(normalizeScaleDen("1/75")).toBe(75);
    expect(normalizeScaleDen("1:12,5")).toBe(12.5);
    expect(normalizeScaleDen("200")).toBe(200);
  });
  it("fällt auf 1:100 zurück", () => {
    expect(normalizeScaleDen(null)).toBe(100);
    expect(normalizeScaleDen("")).toBe(100);
    expect(normalizeScaleDen(0)).toBe(100);
    expect(normalizeScaleDen(-5)).toBe(100);
    expect(normalizeScaleDen("Unsinn")).toBe(100);
  });
});

describe("Modell ↔ Papier (10,000 m Linie)", () => {
  const MODEL_M = 10;
  it.each([
    [1, 10000],
    [50, 200],
    [100, 100],
    [200, 50],
    [500, 20],
    [125, 80],
  ])("1:%i ⇒ %f mm Papier", (den, mm) => {
    expect(modelMetersToPaperMm(MODEL_M, den)).toBeCloseTo(mm, 9);
  });

  it("Einzelwerte laut Spezifikation", () => {
    expect(modelMetersToPaperMm(1, 100)).toBeCloseTo(10, 9);
    expect(modelMetersToPaperMm(5, 100)).toBeCloseTo(50, 9);
    expect(modelMetersToPaperMm(5, 50)).toBeCloseTo(100, 9);
    expect(modelMetersToPaperMm(10, 200)).toBeCloseTo(50, 9);
    expect(modelMetersToPaperMm(25, 500)).toBeCloseTo(50, 9);
  });

  it("Round-Trip ist verlustfrei", () => {
    for (const den of [1, 10, 50, 100, 125, 333, 1000]) {
      expect(paperMmToModelMeters(modelMetersToPaperMm(7.321, den), den)).toBeCloseTo(7.321, 9);
    }
  });
});

describe("PDF-Punkte", () => {
  it("1 mm = 72/25.4 pt", () => {
    expect(MM_TO_PT).toBeCloseTo(2.834645669, 9);
  });
  it("A3 exakt", () => {
    expect(mmToPt(297)).toBeCloseTo(841.8897638, 6);
    expect(mmToPt(420)).toBeCloseTo(1190.5511811, 6);
  });
});

describe("formatScaleLabel", () => {
  it("zeigt 1:N", () => {
    expect(formatScaleLabel(100)).toBe("1:100");
    expect(formatScaleLabel(12.5)).toBe("1:12,5");
  });
});
