import { describe, it, expect } from "vitest";
import { HatchTool } from "./HatchTool";

function makeTool() {
  const app: any = { hub: { bindCommit() {}, hide() {} }, renderer: { setHoverHatchId() {} } };
  const t = new HatchTool(app) as any;
  t.drawMode = "polygon";
  return t as HatchTool & { points: { x: number; y: number }[]; state: string };
}

describe("Punktweises Rückgängig (Schraffur/Polygon)", () => {
  it("nimmt den letzten Punkt zurück und stellt ihn wieder her", () => {
    const t = makeTool();
    t.state = "drawing";
    t.points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] as any;
    expect(t.pointUndo()).toBe(true);
    expect(t.points.length).toBe(2);
    expect(t.pointRedo()).toBe(true);
    expect(t.points.length).toBe(3);
  });

  it("Wiederholen funktioniert auch nach Rücknahme des letzten Punkts", () => {
    const t = makeTool();
    t.state = "drawing";
    t.points = [{ x: 0, y: 0 }] as any;
    expect(t.pointUndo()).toBe(true);
    expect(t.points.length).toBe(0);
    expect(t.hasPointRedo()).toBe(true);
    expect(t.pointRedo()).toBe(true);
    expect(t.points.length).toBe(1);
    expect(t.state).toBe("drawing");
  });

  it("leere Kette ohne Sitzung gibt an die globale Historie ab", () => {
    const t = makeTool();
    expect(t.pointUndo()).toBe(false);
    expect(t.pointRedo()).toBe(false);
  });

  it("Abbrechen beendet die lokale Sitzung", () => {
    const t = makeTool();
    t.state = "drawing";
    t.points = [{ x: 0, y: 0 }, { x: 1, y: 0 }] as any;
    t.pointUndo();
    t.cancel();
    expect(t.hasPointRedo()).toBe(false);
  });
});
