import { describe, it, expect } from "vitest";
import { frameForEdge, tiltShape, tiltPoint, plumbScale } from "./tiltGeometry";
import { copyObjectMeta } from "../objectMeta";

// Rechteck 4 m (quer zur Kante) × 2 m, Bezugskante oben (y = 4).
const hatch = { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 4 }, { x: 0, y: 4 }] };
const H = 0.3, A = 20;
const f = frameForEdge(hatch, 2, A, 0).frame!;

describe("Kanten bündig", () => {
  it("Oberkante bleibt exakt an der Stelle der starren Drehung", () => {
    const s = tiltShape("rotate", true, f, 0, H, "top");
    if (s.kind !== "field") throw new Error();
    const p = s.map!({ x: 2, y: 4 }), rigid = tiltPoint(2, 4, H, f);
    expect(p.x).toBeCloseTo(rigid.x, 6); expect(p.y).toBeCloseTo(rigid.y, 6);
    expect(s.zt(p)).toBeCloseTo(rigid.z, 6);
  });
  it("Unterkante bleibt fest, Kante darüber geht lotrecht nach oben", () => {
    const s = tiltShape("rotate", true, f, 0, H, "bottom");
    if (s.kind !== "field") throw new Error();
    const p = s.map!({ x: 2, y: 4 }), rigid = tiltPoint(2, 4, 0, f);
    expect(p.y).toBeCloseTo(rigid.y, 6); expect(s.zb(p)).toBeCloseTo(rigid.z, 6);
    expect(s.zt(p)).toBeGreaterThan(s.zb(p));
  });
  it("Körper wird nie länger als der Grundriss", () => {
    expect(plumbScale(f, H, "top")).toBeLessThan(1);
    expect(plumbScale(f, H, "bottom")).toBeLessThan(1);
  });
  it("Bezugsseite wird gespeichert", () => {
    const m = copyObjectMeta({ tilt3D: { edgeIndex: 2, a: { x: 2, y: 4 }, b: { x: 0, y: 4 }, count: 4, angleDeg: A, plumb: true, anchor: "bottom" } } as any);
    expect((m as any).tilt3D.anchor).toBe("bottom");
  });
});
