import { describe, it, expect } from "vitest";
import { applyRelations3D, wouldCreateCycle } from "./relations";
import type { Prism3D } from "./geometryDerivation";

const box = (id: string, x0: number, x1: number, z0: number, z1: number, sheetId = "s1"): Prism3D => ({
  type: "prism", source: "hatch", sourceId: id, sheetId, color: "#ccc", holes: [], z0, z1,
  footprint: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 1 }, { x: x0, y: 1 }],
});

describe("Körperbeziehungen", () => {
  it("A durchbricht B entfernt das Volumen von A aus B", () => {
    const { items } = applyRelations3D([box("A", 1, 2, 0, 1), box("B", 0, 3, 0, 1)],
      [{ sheetId: "s1", id: "A", relations3D: [{ type: "cutout", targetSheetId: "s1", targetId: "B" }] }]);
    const b = items.filter(d => d.sourceId === "B");
    expect(b.length).toBeGreaterThanOrEqual(1);
    // Außerhalb von A bleibt B voll erhalten, innen nichts
    const area = b.reduce((s, d: any) => s + Math.abs(d.footprint.reduce((a: number, p: any, i: number, arr: any[]) => a + p.x * arr[(i + 1) % arr.length].y - arr[(i + 1) % arr.length].x * p.y, 0) / 2), 0);
    expect(area).toBeCloseTo(2, 5);
  });

  it("An Oberfläche begrenzen hält die gewählte Seite", () => {
    const src = [{ sheetId: "s1", id: "A", relations3D: [{ type: "limitToSurface" as const, targetSheetId: "s2", targetId: "D", face: "bottom" as const, keep: "below" as const }] }];
    const { items } = applyRelations3D([box("A", 0, 1, 0, 5), box("D", 0, 1, 3, 3.2, "s2")], src);
    const a = items.find(d => d.sourceId === "A") as Prism3D;
    expect(a.z1).toBe(3);
    const up = applyRelations3D([box("A", 0, 1, 0, 5), box("D", 0, 1, 3, 3.2, "s2")], [{ ...src[0], relations3D: [{ ...src[0].relations3D[0], face: "top", keep: "above" }] }]);
    expect((up.items.find(d => d.sourceId === "A") as Prism3D).z0).toBe(3.2);
  });

  it("Fehlendes Ziel lässt Original stehen und meldet es", () => {
    const { items, issues } = applyRelations3D([box("A", 0, 1, 0, 1)], [{ sheetId: "s1", id: "A", relations3D: [{ type: "cutout", targetSheetId: "s1", targetId: "X" }] }]);
    expect(items).toHaveLength(1);
    expect(issues).toHaveLength(1);
  });

  it("Zyklen und Selbstbezug werden erkannt – auch über Blattgrenzen", () => {
    const srcs = [{ sheetId: "s1", id: "A", relations3D: [{ type: "cutout" as const, targetSheetId: "s2", targetId: "B" }] }];
    expect(wouldCreateCycle(srcs, "s2::B", "s1::A")).toBe(true);
    expect(wouldCreateCycle(srcs, "s1::A", "s1::A")).toBe(true);
    expect(wouldCreateCycle(srcs, "s2::B", "s1::B")).toBe(false);
  });
});
