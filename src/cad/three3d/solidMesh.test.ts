import { describe, it, expect } from "vitest";
import { slabMesh, meshVolume, csgMesh, frameForEdge, tiltMesh, meshZRange, resolveTilt } from "./solidMesh";

const sq = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

describe("Körpernetze", () => {
  it("Prisma mit Aussparung hat das richtige Volumen", () => {
    const m = slabMesh(sq(0, 0, 4, 4), [sq(1, 1, 2, 2)], () => 0, () => 2)!;
    expect(meshVolume(m)).toBeCloseTo((16 - 1) * 2, 6);
  });

  it("Echte Volumen-Verschneidung entfernt nur das gemeinsame Volumen", () => {
    const a = slabMesh(sq(0, 0, 2, 1), [], () => 0, () => 1)!;
    const b = slabMesh(sq(1, 0, 3, 1), [], () => 0, () => 1)!;
    const r = csgMesh(a, b, "subtract")!;
    expect(meshVolume(r)).toBeCloseTo(1, 4);
  });

  it("Neigung dreht um die feste Gegenachse, Bezugskante hebt sich", () => {
    const h = { points: sq(0, 0, 4, 2) };
    // Kante 0: (0,0)→(4,0); gegenüberliegender äußerster Punkt y = 2.
    const { frame } = frameForEdge(h, 0, 30, 0);
    expect(frame!.D).toBeCloseTo(2);
    expect(frame!.axis.y).toBeCloseTo(2);
    const m = tiltMesh(slabMesh(h.points, [], () => 0, () => 0.2)!, frame!);
    const z = meshZRange(m);
    // Achse bleibt auf Höhe 0, Kante hebt sich um D·sin(30°) = 1
    expect(z.min).toBeCloseTo(0, 6);
    expect(z.max).toBeCloseTo(2 * Math.sin(Math.PI / 6) + 0.2 * Math.cos(Math.PI / 6), 6);
    expect(meshVolume(m)).toBeCloseTo(8 * 0.2, 6); // starrer Körper
  });

  it("Gebogene oder verlorene Bezugskante wird gemeldet", () => {
    expect(frameForEdge({ points: sq(0, 0, 1, 1), bulges: [0.3, 0, 0, 0] }, 0, 10, 0).error).toMatch(/gebogen/);
    const h: any = { points: sq(0, 0, 1, 1), tilt3D: { edgeIndex: 0, a: { x: 9, y: 9 }, b: { x: 8, y: 9 }, count: 5, angleDeg: 10 } };
    expect(resolveTilt(h, 0)!.error).toMatch(/nicht mehr eindeutig/);
    h.tilt3D.count = 4; // gleiche Punktanzahl → kontrolliert gleicher Index
    expect(resolveTilt(h, 0)!.frame!.edgeIndex).toBe(0);
  });
});
