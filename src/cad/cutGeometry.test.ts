import { describe, it, expect } from "vitest";
import { cutPolyline, cutRegion, hatchRegion } from "./cutGeometry";
import { mergeHatchGeometry } from "./hatchMerge";

const P = (x: number, y: number) => ({ x, y });

describe("Bogenerhalt beim Verbinden", () => {
  it("gewölbte Kante bleibt eine einzige Bogenkante mit gleicher Wölbung", () => {
    // Quadrat 0..2 mit nach unten gewölbter Unterkante (bulge 0.25), zweites Quadrat rechts überlappend.
    const a = { points: [P(0, 0), P(2, 0), P(2, 2), P(0, 2)], bulges: [0.25, 0, 0, 0], holes: [], holeBulges: [] };
    const b = { points: [P(1.5, 1), P(4, 1), P(4, 2), P(1.5, 2)], bulges: [], holes: [], holeBulges: [] };
    const r = mergeHatchGeometry([a, b])!;
    expect(r).not.toBeNull();
    const curved = r.outerBulges.filter((x) => Math.abs(x) > 1e-6);
    expect(curved.length).toBe(1);
    expect(Math.abs(curved[0])).toBeCloseTo(0.25, 6);
    // keine Tessellierpunkte übrig: wenige Ecken
    expect(r.outer.length).toBeLessThanOrEqual(8);
  });
});

describe("Cutter-Geometrie", () => {
  it("teilt ein Rechteck in zwei Flächen", () => {
    const reg = hatchRegion({ points: [P(0, 0), P(4, 0), P(4, 2), P(0, 2)] });
    const parts = cutRegion(reg, P(1, -1), P(1, 3))!;
    expect(parts.length).toBe(2);
  });
  it("Schnitt durch einen Bogen erhält zwei Bogenkanten", () => {
    const reg = hatchRegion({ points: [P(0, 0), P(4, 0), P(4, 2), P(0, 2)], bulges: [0.2, 0, 0, 0] });
    const parts = cutRegion(reg, P(2, -3), P(2, 3))!;
    expect(parts.length).toBe(2);
    for (const p of parts) {
      expect(p.outer.bulges.filter((x) => Math.abs(x) > 1e-6).length).toBe(1);
      expect(p.outer.points.length).toBeLessThanOrEqual(5);
    }
  });
  it("kurze Strecke ohne Durchquerung schneidet nicht", () => {
    const reg = hatchRegion({ points: [P(0, 0), P(4, 0), P(4, 2), P(0, 2)] });
    expect(cutRegion(reg, P(1, 1), P(1, 1.5))).toBeNull();
  });
  it("teilt eine Linie in zwei Stücke", () => {
    const parts = cutPolyline([P(0, 0), P(4, 0)], [0], false, P(1, -1), P(1, 1))!;
    expect(parts.length).toBe(2);
    expect(parts[0].points[1].x).toBeCloseTo(1, 9);
  });
});
