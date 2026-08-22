import { describe, it, expect } from "vitest";
import { PlanManager, getPlanPaperSize, type Plan } from "./PlanManager";
import {
  computeProjectionLayout,
  projectionScaleDen,
  PROJECTION_BBOX_PADDING_MM,
  type ProjectionItem,
} from "./PlanProjections";
import { SheetManager } from "./SheetManager";
import { modelMetersToPaperMm, mmToPt } from "@/lib/scale";

/** 10,000 m lange horizontale Linie im Modell (1:1 Modellraum). */
const TEN_METER_LINE: ProjectionItem[] = [
  { kind: "segment", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
];

function layoutWidthMm(scaleDen: number): number {
  const layout = computeProjectionLayout(TEN_METER_LINE, {
    x: 0, y: 0, rotation: 0, scaleDen,
    clip: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  // Padding herausrechnen — die reine Geometriebreite muss dem Maßstab folgen.
  return (layout.bboxLocalMm.right - layout.bboxLocalMm.left) - 2 * PROJECTION_BBOX_PADDING_MM;
}

describe("Druckplan-Projektion: Papiermaß der 10-m-Linie", () => {
  it.each([
    [50, 200],
    [100, 100],
    [200, 50],
    [500, 20],
    [125, 80],
  ])("1:%i ⇒ %f mm auf dem Papier", (den, mm) => {
    expect(layoutWidthMm(den)).toBeCloseTo(mm, 9);
    expect(modelMetersToPaperMm(10, den)).toBeCloseTo(mm, 9);
  });
});

describe("Projektions-Maßstab: Migration & Kanonik", () => {
  it("liest scaleDen bevorzugt, fällt auf Altfeld scale zurück", () => {
    expect(projectionScaleDen({ scaleDen: 50, scale: 100 })).toBe(50);
    expect(projectionScaleDen({ scale: 200 })).toBe(200);
    expect(projectionScaleDen({})).toBe(100);
  });

  it("restore() migriert alte Projektionen ohne scaleDen", () => {
    const pm = new PlanManager();
    pm.restore([{
      id: "plan-1", name: "Plan 1", formatKey: "a3", landscape: false,
      freeWidth: 297, freeHeight: 210, selected: false,
      projections: [{
        id: "proj-1", sourceSheetId: "default-sheet", sceneSnapshot: null,
        scale: 250, x: 0, y: 0, rotation: 0,
        clip: { left: 0, right: 0, top: 0, bottom: 0 },
      }],
    } as unknown as Plan]);
    const proj = pm.list()[0].projections[0];
    expect(proj.scaleDen).toBe(250);
    expect(projectionScaleDen(proj)).toBe(250);
  });

  it("toJSON spiegelt scaleDen ins Altfeld (abwärtskompatibel)", () => {
    const pm = new PlanManager();
    const plan = pm.createPlan({ formatKey: "a3" });
    pm.addProjection(plan.id, {
      id: "p", sourceSheetId: "s", sceneSnapshot: null, scaleDen: 20,
      x: 0, y: 0, rotation: 0, clip: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    const json = pm.toJSON()[0].projections[0];
    expect(json.scaleDen).toBe(20);
    expect(json.scale).toBe(20);
  });

  it("gemischte Maßstäbe auf einem Plan bleiben erhalten", () => {
    const pm = new PlanManager();
    const plan = pm.createPlan({ formatKey: "a1" });
    const mk = (id: string, den: number) => pm.addProjection(plan.id, {
      id, sourceSheetId: "s", sceneSnapshot: null, scaleDen: den,
      x: 0, y: 0, rotation: 0, clip: { left: 0, right: 0, top: 0, bottom: 0 },
    });
    mk("grundriss", 100); mk("detail", 10); mk("lageplan", 500);
    expect(pm.list()[0].projections.map(p => p.scaleDen)).toEqual([100, 10, 500]);
  });
});

describe("Papierformat physisch exakt", () => {
  it("A3 quer = 420 × 297 mm ⇒ PDF-Punkte", () => {
    const pm = new PlanManager();
    const plan = pm.createPlan({ formatKey: "a3", landscape: true });
    const size = getPlanPaperSize(plan);
    expect(size).toEqual({ width: 420, height: 297 });
    expect(mmToPt(size.width)).toBeCloseTo(1190.5511811, 6);
    expect(mmToPt(size.height)).toBeCloseTo(841.8897638, 6);
  });
});

describe("CAD-Blatt = Modellbereich (immer 1:1)", () => {
  it("neue Blätter tragen keine Ausgabe-Maßstabsinformation", () => {
    const sm = new SheetManager();
    const created = sm.createSheet();
    expect(created.scaleKey).toBeUndefined();
    expect(created.scaleValue).toBeUndefined();
    expect(sm.list()[sm.getIndex("default-sheet")].scaleKey).toBeUndefined();
  });

  it("Altdaten bleiben rückwärtskompatibel erhalten", () => {
    const sm = new SheetManager();
    sm.restore([{ id: "s1", name: "Alt", scaleKey: "1:200", scaleValue: 200 }]);
    expect(sm.getById("s1")?.scaleValue).toBe(200);
  });
});

describe("Projektmappen-Referenz (Paper-Space)", () => {
  // SceneRegionRenderer: modelWm = paperWmm * scaleDen / 1000
  const modelWm = (paperWmm: number, den: number) => (paperWmm * den) / 1000;
  it.each([
    [100, 100, 10],
    [200, 50, 10],
    [50, 200, 10],
    [80, 125, 10],
  ])("%f mm Papier bei 1:%i ⇒ %f m Modell", (paperMm, den, expectedM) => {
    expect(modelWm(paperMm, den)).toBeCloseTo(expectedM, 9);
    expect(modelMetersToPaperMm(expectedM, den)).toBeCloseTo(paperMm, 9);
  });
});
