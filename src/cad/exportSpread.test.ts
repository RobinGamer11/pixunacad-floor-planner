import { describe, it, expect } from "vitest";
import { PlanManager } from "./PlanManager";
import { holePunchPointsMm, pageGuideSnapGeometry, normalizeHolePattern, type HolePattern, type HolePunchSide } from "./pageGuides";
import { diffSnapshots, indexSnapshot } from "@/lib/cadCollab/sceneDiff";

function twoPages() {
  const pm = new PlanManager();
  const a = pm.createPlan({ name: "A" });
  const b = pm.createPlan({ name: "B" });
  pm.movePage(a.id, null, 0);
  pm.movePage(b.id, null, 1);
  return { pm, a, b };
}

describe("Lochungsmuster", () => {
  const counts: Record<Exclude<HolePattern, "none">, number> = { din2: 2, four: 4, a5ring6: 6 };
  for (const pattern of ["din2", "four", "a5ring6"] as const) {
    for (const side of ["left", "right", "top", "bottom"] as HolePunchSide[]) {
      it(`${pattern} ${side}: Anzeige und Fangpunkte identisch`, () => {
        const hp = holePunchPointsMm(210, 297, side, pattern);
        expect(hp.holes).toHaveLength(counts[pattern]);
        const g = pageGuideSnapGeometry({ widthMm: 210, heightMm: 297, marginsMm: 0, holePattern: pattern, holePunchSide: side });
        expect(g.points).toHaveLength(counts[pattern] + 1);
        expect(g.points[0].x).toBeCloseTo((hp.holes[0].x - 105) / 1000);
      });
    }
  }
  it("keine Lochung → keine Punkte", () => {
    const g = pageGuideSnapGeometry({ widthMm: 210, heightMm: 297, marginsMm: 0, holePattern: "none", holePunchSide: "left" });
    expect(g.points).toHaveLength(0);
  });
  it("Altdaten holePunch werden übernommen", () => {
    expect(normalizeHolePattern(undefined, true)).toBe("din2");
    expect(normalizeHolePattern(undefined, false)).toBe("none");
    const pm = new PlanManager();
    pm.restore([{ id: "x", name: "X", holePunch: true } as any]);
    expect(pm.getById("x")!.holePattern).toBe("din2");
    expect(JSON.stringify(pm.toJSON())).not.toContain("\"holePunch\"");
  });
});

describe("Seitenverbund", () => {
  it("grid legt Seiten bündig nebeneinander, Rücksetzen verwirft Versätze", () => {
    const { pm, a, b } = twoPages();
    const sid = pm.linkSpread(a.id, b.id)!;
    expect(pm.spreadRects(sid).map(r => r.x)).toEqual([0, 210]);
    pm.setSpreadLayoutMode(sid, "free");
    pm.setSpreadOffset(b.id, 250, 30);
    const r = pm.spreadRects(sid);
    expect(r[1]).toMatchObject({ x: 250, y: 30 });
    pm.resetSpreadLayout(sid);
    expect(pm.getSpreadLayoutMode(sid)).toBe("grid");
    expect(pm.spreadRects(sid).map(r => [r.x, r.y])).toEqual([[0, 0], [210, 0]]);
  });
  it("Aus Verbund lösen entfernt Rest-Verbund und Layout-Eintrag", () => {
    const { pm, a, b } = twoPages();
    const sid = pm.linkSpread(a.id, b.id)!;
    expect(pm.spreadLayoutsToJSON()[sid]).toBeTruthy();
    pm.unlinkFromSpread(a.id);
    expect(pm.getById(b.id)!.spreadId).toBeNull();
    expect(pm.spreadLayoutsToJSON()[sid]).toBeUndefined();
  });
  it("spreadLayouts laufen als eigene Strukturobjekte durch den Cloud-Abgleich", () => {
    const before = JSON.stringify({ spreadLayouts: {} });
    const after = JSON.stringify({ spreadLayouts: { s1: { layoutMode: "free" } } });
    const ops = diffSnapshots(before, after);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ objectKind: "spreadLayouts", objectId: "s1", changeType: "create" });
    expect(indexSnapshot(after).get("__structure__")!.get("spreadLayouts")!.size).toBe(1);
  });
});

describe("Mindestens eine Exportseite", () => {
  it("letzte Seite ist nicht löschbar", () => {
    const { pm, a, b } = twoPages();
    expect(pm.deletePlan(a.id)).toBe(true);
    expect(pm.canDeletePlan(b.id)).toBe(false);
    expect(pm.deletePlan(b.id)).toBe(false);
    expect(pm.list()).toHaveLength(1);
  });
  it("Ordner löschen behält Seiten", () => {
    const pm = new PlanManager();
    const f = pm.createFolder("F");
    pm.createPlan({ parentFolderId: f.id });
    pm.deleteFolder(f.id);
    expect(pm.list()).toHaveLength(1);
  });
});
