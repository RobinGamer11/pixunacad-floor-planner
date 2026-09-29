import { describe, it, expect } from "vitest";
import { Scene } from "./Scene";
import { collectSceneSnapGeometry, transformSnapGeometryToPlan } from "./tracingSnapGeometry";
import { computeProjectionLayout, type ProjectionItem } from "./PlanProjections";

function sceneWithLine(): Scene {
  const sc = new Scene();
  sc.createSegment({ x: 0, y: 0 }, { x: 2, y: 0 });
  return sc;
}

describe("Transparenzpause: schreibgeschützte Fangquelle der CAD-Ausschnitte", () => {
  it("liefert Endpunkte und Fanglinien sichtbarer Objekte", () => {
    const sc = sceneWithLine();
    const geo = collectSceneSnapGeometry(sc, () => true);
    expect(geo.points.some(p => Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
    expect(geo.points.some(p => Math.abs(p.x - 2) < 1e-9)).toBe(true);
    expect(geo.lines.length).toBeGreaterThan(0);
  });

  it("liefert nichts für ausgeblendete Objekte", () => {
    const sc = sceneWithLine();
    const geo = collectSceneSnapGeometry(sc, () => false);
    expect(geo.points).toHaveLength(0);
    expect(geo.lines).toHaveLength(0);
  });

  it("verändert die Quell-Scene nicht (keine Kopie, keine neuen Objekte)", () => {
    const sc = sceneWithLine();
    const before = sc.segments.length;
    collectSceneSnapGeometry(sc, () => true);
    expect(sc.segments.length).toBe(before);
    expect(sc.hatches.length).toBe(0);
  });

  it("transformiert mit Maßstab und Position in Plan-Weltmeter", () => {
    const items: ProjectionItem[] = [
      { kind: "segment", a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, widthM: 0.01, color: "#000" } as any,
    ];
    const proj = { x: 1, y: 1, rotation: 0, scaleDen: 100, clip: { left: 0, right: 0, top: 0, bottom: 0 } };
    const layout = computeProjectionLayout(items, proj);
    const geo = transformSnapGeometryToPlan(
      { points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], lines: [[{ x: 0, y: 0 }, { x: 2, y: 0 }]] },
      layout,
      0,
    );
    expect(geo.points).toHaveLength(2);
    // Maßstab 1:100 → 2 m Modell entsprechen 20 mm auf dem Plan.
    const d = Math.hypot(geo.points[1].x - geo.points[0].x, geo.points[1].y - geo.points[0].y);
    expect(d).toBeCloseTo(0.02, 6);
    // Ausschnitt liegt um die Projektionsposition herum.
    expect(Math.abs(geo.points[0].x - proj.x / 1000)).toBeLessThan(0.1);
  });

  it("schneidet weggeschnittene Teile vollständig weg", () => {
    const layout = {
      centerPlanM: { x: 0, y: 0 },
      bboxLocalMm: { left: -10, right: 10, top: -10, bottom: 10 },
      clipLocalMm: { left: -10, right: 0, top: -10, bottom: 10 },
      factor: 0.01,
      itemOriginOffsetPlanM: { x: 0, y: 0 },
    };
    const geo = transformSnapGeometryToPlan(
      { points: [{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }], lines: [[{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }]] },
      layout as any,
      0,
    );
    // Nur der Punkt links der Clip-Kante bleibt fangbar.
    expect(geo.points).toHaveLength(1);
    expect(geo.points[0].x).toBeCloseTo(-0.005, 6);
    // Die Linie wird an der Clip-Kante abgeschnitten.
    expect(geo.lines).toHaveLength(1);
    expect(geo.lines[0][1].x).toBeCloseTo(0, 6);
  });
});
