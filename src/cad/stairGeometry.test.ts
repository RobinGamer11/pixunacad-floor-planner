import { describe, it, expect } from "vitest";
import { computeStairGeometry, moveStairBoundary, resetStairTread, stairLabelLines, riserFromRule, type StairParams } from "./stairGeometry";
import { Scene, serializeStair } from "./Scene";
import { restoreOneScene } from "./sceneSerde";

const base = (path: { x: number; y: number }[], extra: Partial<StairParams> = {}): StairParams => ({
  mode: "straight", path, referenceSide: "left", treadDepthM: 0.28, stairWidthM: 1,
  riserHeightM: 0.175, direction: "up", ...extra,
});

describe("Treppe – Geometrie", () => {
  it("zählt Auftritte und Steigungen getrennt", () => {
    const g = computeStairGeometry(base([{ x: 0, y: 0 }, { x: 0.28 * 15, y: 0 }]));
    expect(g.valid).toBe(true);
    expect(g.treadCount).toBe(15);
    expect(g.riserCount).toBe(16);
    expect(g.totalHeightM).toBeCloseTo(16 * 0.175);
    expect(g.totalRunM).toBeCloseTo(15 * 0.28);
    const lines = stairLabelLines(base([]), g, false);
    expect(lines[0]).toBe("16 STG");
    expect(lines[1]).toBe("17,5 / 28 cm");
  });

  it("Schrittmaßregel: 63 cm, Auftritt 28 → Steigung 17,5", () => {
    expect(riserFromRule(0.28, 0.63)).toBeCloseTo(0.175);
  });

  it("erste Stufe beginnt an der Referenzlinie (Bezug links)", () => {
    const g = computeStairGeometry(base([{ x: 0, y: 0 }, { x: 2.8, y: 0 }]));
    expect(g.treads[0].poly[0]).toEqual({ x: 0, y: 0 });
    expect(g.firstTreadEdges!.left[0]).toEqual({ x: 0, y: 0 });
  });

  it("L-Treppe: Podest mindestens Laufbreite, keine Überlappung mit Stufen", () => {
    const g = computeStairGeometry(base([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: -3 }], { mode: "landing" }));
    expect(g.valid).toBe(true);
    expect(g.landings.length).toBe(1);
    for (const t of g.treads.filter((t) => t.run === 0)) {
      for (const q of t.poly) expect(q.x).toBeLessThanOrEqual(3 - 1 + 1e-9);
    }
  });

  it("L-Treppe: kein Spalt zwischen letzter Stufe und Podest, Standardauftritte bleiben", () => {
    const g = computeStairGeometry(base([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: -3 }]));
    const run0 = g.treads.filter((t) => t.run === 0);
    const lastEnd = run0[run0.length - 1].poly[1];
    const landingXs = g.landings[0].poly.map((q) => q.x);
    expect(Math.min(...landingXs)).toBeCloseTo(lastEnd.x);
    for (const t of g.treads) expect(t.depth).toBeCloseTo(0.28);
    // Podest = eine Stufenebene: Steigungen = Auftritte + Podeste + 1
    expect(g.riserCount).toBe(g.treadCount + 2);
  });

  it("stark vergrößerter Auftritt wird Zwischenpodest; Reset entfernt es wieder", () => {
    const p = base([{ x: 0, y: 0 }, { x: 0.28 * 5, y: 0 }]);
    const wide = moveStairBoundary(p, 2, 0.9)!;
    expect(wide).not.toBeNull();
    const g = computeStairGeometry(wide);
    expect(g.landings.length).toBe(1);
    expect(g.treadCount).toBe(4);
    const back = resetStairTread(wide, 2)!;
    expect(computeStairGeometry(back).landings.length).toBe(0);
    expect(back.stepDistancesM).toBeNull();
    expect(back.path[1].x).toBeCloseTo(0.28 * 5);
  });

  it("zu kurze Linie für Podest wird als ungültig markiert", () => {
    const g = computeStairGeometry(base([{ x: 0, y: 0 }, { x: 0.8, y: 0 }, { x: 0.8, y: -3 }]));
    expect(g.valid).toBe(false);
    expect(g.warnings.length).toBeGreaterThan(0);
  });

  it("Fangpunkte sind dedupliziert", () => {
    const g = computeStairGeometry(base([{ x: 0, y: 0 }, { x: 0.56, y: 0 }]));
    const keys = g.snapPoints.map((p) => `${p.x.toFixed(5)}:${p.y.toFixed(5)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("innere Grenze verschieben: nur davorliegender Auftritt, Folgestufen bleiben, Endpunkt wandert", () => {
    const p = base([{ x: 0, y: 0 }, { x: 0.28 * 4, y: 0 }]);
    const r = moveStairBoundary(p, 1, 0.02)!;
    expect(r).not.toBeNull();
    const g = computeStairGeometry(r);
    expect(g.treads.map((t) => +t.depth.toFixed(3))).toEqual([0.28, 0.3, 0.28, 0.28]);
    expect(r.path[1].x).toBeCloseTo(0.28 * 4 + 0.02);
    const last = g.treads[3].poly[1];
    expect(last.x).toBeCloseTo(r.path[1].x);
    expect(moveStairBoundary(p, 1, -0.2)).toBeNull();
  });
});

describe("Treppe – Persistenz", () => {
  it("bleibt nach Serialisierung ein einzelnes Objekt mit allen Parametern", () => {
    const s = new Scene();
    (s as any).createStair({ path: [{ x: 0, y: 0 }, { x: 2.8, y: 0 }] as any, stepDistancesM: [0.3] });
    const data = { stairs: (s as any).stairs.map(serializeStair) };
    const s2 = new Scene();
    restoreOneScene(s2 as any, JSON.parse(JSON.stringify(data)) as any);
    expect((s2 as any).stairs.length).toBe(1);
    expect(serializeStair((s2 as any).stairs[0]).stepDistancesM).toEqual([0.3]);
  });
});
