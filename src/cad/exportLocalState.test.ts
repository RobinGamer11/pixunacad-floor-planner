import { describe, it, expect } from "vitest";
import { PlanManager } from "./PlanManager";
import { pageGuideSnapGeometry, holePunchPointsMm } from "./pageGuides";

describe("Export: lokaler Bedienzustand wird nie gespeichert", () => {
  it("Plan.selected und Ordner-collapsed erscheinen nicht in der Serialisierung", () => {
    const pm = new PlanManager();
    const p = pm.createPlan({ name: "A" });
    const f = pm.createFolder("EG");
    expect(p.id).toBeTruthy();
    const json = JSON.stringify({ plans: pm.toJSON(), planFolders: pm.foldersToJSON() });
    expect(json).not.toContain("selected");
    expect(json).not.toContain("collapsed");
    expect(pm.foldersToJSON()[0]).toEqual({ id: f.id, name: "EG", parentId: null, order: expect.any(Number) });
  });

  it("alte Daten mit selected/collapsed werden gelesen, aber ignoriert", () => {
    const pm = new PlanManager();
    pm.restore(
      [{ id: "x", name: "Alt", formatKey: "a4", landscape: false, freeWidth: 1, freeHeight: 1, projections: [], selected: true } as any],
      [{ id: "f", name: "O", parentId: null, order: 0, collapsed: true } as any],
    );
    expect(pm.getById("x")).toBeTruthy();
    expect((pm as any).getSelected).toBeUndefined();
    expect(JSON.stringify(pm.toJSON())).not.toContain("selected");
    expect(JSON.stringify(pm.foldersToJSON())).not.toContain("collapsed");
    expect(pm.getById("x")!.holePunchSide).toBe("left");
  });
});

describe("Export: Rand- und Lochungsfangpunkte", () => {
  it("Seitenrand liefert 4 Ecken + 4 Mitten und 4 Linien", () => {
    const g = pageGuideSnapGeometry({ widthMm: 420, heightMm: 297, marginsMm: 10, holePattern: "none", holePunchSide: "left" });
    expect(g.points).toHaveLength(8);
    expect(g.lines).toHaveLength(4);
    expect(g.points[0].x).toBeCloseTo(-0.2);
    expect(g.points[0].y).toBeCloseTo(-0.1385);
  });

  it("Lochung folgt der gewählten Seite", () => {
    const left = holePunchPointsMm(210, 297, "left");
    expect(left.holes.map(h => h.x)).toEqual([12, 12]);
    const top = holePunchPointsMm(210, 297, "top");
    expect(top.holes.map(h => h.y)).toEqual([12, 12]);
    expect(top.center).toEqual({ x: 105, y: 12 });
    const g = pageGuideSnapGeometry({ widthMm: 210, heightMm: 297, marginsMm: 0, holePattern: "din2", holePunchSide: "right" });
    expect(g.points).toHaveLength(3);
    expect(g.lines).toHaveLength(0);
  });
});
