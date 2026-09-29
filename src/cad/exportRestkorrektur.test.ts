import { describe, it, expect } from "vitest";
import { PlanManager } from "./PlanManager";
import { clipAfterEdgeDrag, scaleProjectionClip } from "./PlanProjections";

describe("Export-Restkorrektur", () => {
  it("neue Seiten heißen fortlaufend Seite N, auch nach Neuladen", () => {
    const pm = new PlanManager();
    expect(pm.createPlan().name).toBe("Seite 1");
    expect(pm.createPlan().name).toBe("Seite 2");
    pm.createPlan({ name: "Grundriss" });
    const json = pm.toJSON();
    const pm2 = new PlanManager();
    pm2.restore(json as any);
    expect(pm2.createPlan().name).toBe("Seite 3");
    expect(pm2.list().some(p => p.name === "Grundriss")).toBe(true);
  });

  it("aktive und nicht aktive Verbundseite lassen sich frei verschieben", () => {
    const pm = new PlanManager();
    const a = pm.createPlan({ formatKey: "a4" });
    const b = pm.createPlan({ formatKey: "a4" });
    pm.linkSpread(a.id, b.id);
    const spread = pm.getById(a.id)!.spreadId!;
    pm.setSpreadLayoutMode(spread, "free");
    const r0 = pm.spreadRects(spread);
    const ra = r0.find(r => r.id === a.id)!, rb = r0.find(r => r.id === b.id)!;
    // aktive Seite a um 30 mm nach unten
    pm.setSpreadOffset(a.id, ra.x, ra.y + 30);
    let r1 = pm.spreadRects(spread);
    const dy1 = r1.find(r => r.id === a.id)!.y - r1.find(r => r.id === b.id)!.y;
    expect(dy1).toBeCloseTo(30);
    // danach b um 50 mm nach rechts – Abstand relativ zu a bleibt korrekt
    const ra1 = r1.find(r => r.id === a.id)!, rb1 = r1.find(r => r.id === b.id)!;
    pm.setSpreadOffset(b.id, rb1.x + 50, rb1.y);
    const r2 = pm.spreadRects(spread);
    const dx = r2.find(r => r.id === b.id)!.x - r2.find(r => r.id === a.id)!.x;
    expect(dx).toBeCloseTo(rb.x - ra.x + 50);
    expect(ra1).toBeTruthy();
  });

  it("Kante schneidet nach innen und erweitert nach außen bis zur vollen Größe", () => {
    const zero = { left: 0, right: 0, top: 0, bottom: 0 };
    const cut = clipAfterEdgeDrag(zero, "edge-left", 40, 0, 200, 100);
    expect(cut.left).toBe(40);
    const back = clipAfterEdgeDrag(cut, "edge-left", -100, 0, 200, 100);
    expect(back.left).toBe(0);
    const r = clipAfterEdgeDrag(zero, "edge-right", -20, 0, 200, 100);
    expect(r.right).toBe(20);
    expect(clipAfterEdgeDrag(r, "edge-right", 50, 0, 200, 100).right).toBe(0);
    expect(clipAfterEdgeDrag(zero, "edge-bottom", 0, -500, 200, 100).bottom).toBe(95);
  });

  it("freier Maßstab 1:75 skaliert den Clip proportional", () => {
    const c = scaleProjectionClip({ left: 30, right: 0, top: 15, bottom: 6 }, 100 / 75);
    expect(c.left).toBeCloseTo(40);
    expect(c.top).toBeCloseTo(20);
    expect(c.bottom).toBeCloseTo(8);
  });
});
