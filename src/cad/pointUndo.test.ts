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

describe("Punktweises Rückgängig (Rechteck/Kreis)", () => {
  it("Rechteck: zweite Seite und Startpunkt lassen sich zurücknehmen und wiederherstellen", () => {
    const t = makeTool() as any;
    t.drawMode = "rectangle";
    t.rectState = "secondSide";
    t.rectPointA = { x: 0, y: 0 };
    t.rectPointB = { x: 2, y: 0 };
    expect(t.pointUndo()).toBe(true);
    expect(t.rectState).toBe("firstSide");
    expect(t.rectPointB).toBeNull();
    expect(t.pointUndo()).toBe(true);
    expect(t.rectState).toBe("idle");
    expect(t.rectPointA).toBeNull();
    expect(t.pointRedo()).toBe(true);
    expect(t.rectState).toBe("firstSide");
    expect(t.pointRedo()).toBe(true);
    expect(t.rectState).toBe("secondSide");
    expect(t.rectPointB).toEqual({ x: 2, y: 0 });
  });

  it("Kreis: Radius und Mittelpunkt lassen sich zurücknehmen und wiederherstellen", () => {
    const t = makeTool() as any;
    t.drawMode = "circle";
    t.circleState = "arc";
    t.circleCenter = { x: 1, y: 1 };
    t.circleRadiusM = 2;
    expect(t.pointUndo()).toBe(true);
    expect(t.circleState).toBe("radius");
    expect(t.pointUndo()).toBe(true);
    expect(t.circleState).toBe("idle");
    expect(t.circleCenter).toBeNull();
    expect(t.pointRedo()).toBe(true);
    expect(t.circleState).toBe("radius");
    expect(t.circleCenter).toEqual({ x: 1, y: 1 });
    expect(t.pointRedo()).toBe(true);
    expect(t.circleState).toBe("arc");
    expect(t.circleRadiusM).toBe(2);
  });

  it("Rechteck ohne gesetzten Punkt gibt an die globale Historie ab", () => {
    const t = makeTool() as any;
    t.drawMode = "rectangle";
    expect(t.pointUndo()).toBe(false);
    t.drawMode = "circle";
    expect(t.pointUndo()).toBe(false);
  });
});
