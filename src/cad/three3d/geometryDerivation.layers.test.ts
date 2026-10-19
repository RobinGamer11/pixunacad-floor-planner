import { describe, it, expect } from "vitest";
import { deriveScene3D } from "./geometryDerivation";

const sheet = { id: "s1", name: "EG" } as any;
const doc = (extra: any = {}) => ({ id: "d1", labelId: "L", position: { x: 10, y: 20 }, widthM: 4, heightM: 2, rotationRad: 0, ...extra });

describe("3D-Korrekturen", () => {
  it("ausgeblendete Ebene erscheint nicht in 3D", () => {
    const sc = { documents: [doc()], segments: [{ id: "s", labelId: "H", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }] };
    const out = deriveScene3D(sc, sheet, { isLabelVisible: (l) => l !== "H" });
    expect(out.map((d) => d.sourceId)).toEqual(["d1"]);
  });

  it("Dokument-Position ist die linke obere Ecke, nicht der Mittelpunkt", () => {
    const [p] = deriveScene3D({ documents: [doc()] }, sheet) as any[];
    expect(p.outline[0].x).toBeCloseTo(10); expect(p.outline[0].y).toBeCloseTo(20);
    expect(p.outline[2].x).toBeCloseTo(14); expect(p.outline[2].y).toBeCloseTo(22);
    expect(p.texture.list).toBe("documents");
  });

  it("Bibliothekselement nutzt die exakten Ecken", () => {
    const corners = [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 1, y: 2 }];
    const [p] = deriveScene3D({ libraryInstances: [{ id: "li", labelId: "L", definitionId: "x", position: { x: 0, y: 0 } }] }, sheet, { libraryCorners: () => corners }) as any[];
    expect(p.footprint.map((c: any) => c.x).sort()).toEqual([1, 1, 3, 3]);
  });

  it("Stapelreihenfolge wird an die 3D-Körper weitergegeben", () => {
    const sc = { documents: [doc({ stackOrder: 5_000_000 })], hatches: [{ id: "h", labelId: "L", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }] };
    const out = deriveScene3D(sc, sheet) as any[];
    const d = out.find((x) => x.sourceId === "d1"), h = out.find((x) => x.sourceId === "h");
    expect(d.order).toBeGreaterThan(h.order);
  });
});
