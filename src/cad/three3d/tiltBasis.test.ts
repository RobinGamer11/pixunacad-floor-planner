import { describe, it, expect } from "vitest";
import { deriveHatch } from "./geometryDerivation";
import { meshBounds } from "./solidMesh";

const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }];
const hatch = (basis: "plan" | "actual", points = sq): any => ({ id: "h", points, heightM: 0.2, tilt3D: { edgeIndex: 2, a: points[2], b: points[3], count: 4, angleDeg: 30, basis } });

describe("Neigung – Orientierung", () => {
  it("Grundfläche: Körper bleibt im 2D-Grundriss (0…2 m quer zur Achse)", () => {
    const d: any = deriveHatch(hatch("plan"), "s", 0);
    const b = meshBounds(d.mesh);
    expect(b.minY).toBeCloseTo(0, 6); expect(b.maxY).toBeCloseTo(2, 6);
  });
  it("Tatsächliche Fläche: 2D-Projektion (2·cos30°) ergibt wahre Länge 2 m im geneigten Körper", () => {
    const k = Math.cos(Math.PI / 6);
    const proj = sq.map(p => ({ x: p.x, y: p.y * k }));
    const d: any = deriveHatch(hatch("actual", proj), "s", 0);
    const top = d.faces.bottom.outer;
    const len = Math.hypot(top[3].y - top[0].y, top[3].z - top[0].z);
    expect(len).toBeCloseTo(2, 4);
  });
});
