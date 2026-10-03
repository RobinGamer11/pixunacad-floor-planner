import { describe, it, expect } from "vitest";
import { computeStairGeometry, setKnickMode, type StairParams } from "./stairGeometry";
import { Scene, serializeStair } from "./Scene";

type Pt = { x: number; y: number };
const area = (poly: Pt[]) => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p.x * q.y - q.x * p.y; }, 0)) / 2;
const L = 1 + 0.28 * 7;
const base = (side: "left" | "right", path: Pt[]): StairParams => ({
  mode: "landing", path, referenceSide: side, treadDepthM: 0.28, stairWidthM: 1, riserHeightM: 0.175, direction: "up",
});

describe("Treppe – Knick als genau eine Fläche", () => {
  for (const side of ["left", "right"] as const) {
    it(`Bezug ${side}: genau ein Podest 1×1, lückenlos, ohne Überlappung`, () => {
      // Bezug links = außen, Bezug rechts = innen (Knick nach unten).
      const path = side === "left" ? [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: -3 }] : [{ x: 0, y: 0 }, { x: 0.28 * 7, y: 0 }, { x: 0.28 * 7, y: -3 }];
      const g = computeStairGeometry(base(side, path));
      expect(g.valid).toBe(true);
      const corner = g.landings.filter((l) => l.knick === 1);
      expect(corner.length).toBe(1);
      expect(g.landings.filter((l) => l.knick < 0).length).toBe(0);
      expect(area(corner[0].poly)).toBeCloseTo(1, 6);
      const run0 = g.treads.filter((t) => t.run === 0);
      expect(run0.length).toBe(7);
      const entry = corner[0].entryEdge!;
      const last = run0[run0.length - 1].poly;
      const hit = (p: Pt) => entry.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 1e-6);
      expect(hit(last[1]) && hit(last[2])).toBe(true);
      const firstOut = g.treads.find((t) => t.run === 1)!.poly;
      const exit = corner[0].exitEdge!;
      const hitX = (p: Pt) => exit.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 1e-6);
      expect(hitX(firstOut[0]) && hitX(firstOut[3])).toBe(true);
    });
  }

  it("Gewendelt: Podest vollständig ersetzt, drei Stufen decken die Knickfläche exakt", () => {
    const p = base("left", [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: -3 }]);
    const landing = computeStairGeometry(p).landings[0];
    const w = setKnickMode(p, 1, "winder")!;
    const g = computeStairGeometry(w);
    expect(g.valid).toBe(true);
    expect(g.landings.length).toBe(0);
    const winders = g.treads.filter((t) => t.isWinder);
    expect(winders.length).toBe(3);
    const sum = winders.reduce((a, t) => a + area(t.poly), 0);
    expect(sum).toBeCloseTo(area(landing.poly), 6);
    // Zu- und Abgang schließen an die erste/letzte Wendelstufe an.
    const lastIn = g.treads.filter((t) => t.run === 0).pop()!.poly;
    const has = (poly: Pt[], q: Pt) => poly.some((v) => Math.hypot(v.x - q.x, v.y - q.y) < 1e-6);
    expect(has(winders[0].poly, lastIn[1]) && has(winders[0].poly, lastIn[2])).toBe(true);
    const firstOut = g.treads.find((t) => t.run === 1 && !t.isWinder)!.poly;
    expect(has(winders[2].poly, firstOut[0]) && has(winders[2].poly, firstOut[3])).toBe(true);
    // Podest = 1 Stufenebene, 3 Wendelstufen = 3 Auftritte.
    expect(g.riserCount).toBe(computeStairGeometry(p).riserCount - 1 + 3);
    expect(setKnickMode(w, 1, "landing")!.knickModes).toBeNull();
  });

  it("Knickausbildung und Wendelvorgaben bleiben nach Serialisierung erhalten", () => {
    const s = new Scene();
    const st = (s as any).createStair({ path: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: -3 }], knickModes: { 1: "winder" }, minWinderInnerTreadM: 0.12 });
    const ser = JSON.parse(JSON.stringify(serializeStair(st)));
    expect(ser.knickModes).toEqual({ 1: "winder" });
    expect(ser.minWinderInnerTreadM).toBe(0.12);
    (s as any).assignStairsToLabel([st.id], "x");
    expect((s as any).getStairsByLabelId("x").length).toBe(1);
  });
});

import { moveStairOuterPoint } from "./stairGeometry";
describe("Treppe – Außenpunkt polygonartig bewegen", () => {
  it("abgeleiteter Außenpunkt liegt genau am Ziel, Startpunkt bleibt", () => {
    const p = base("left", [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: -3 }]);
    const g = computeStairGeometry(p);
    const outer = g.treads.filter((t) => t.run === 1 && !t.isWinder).pop()!.poly[2];
    const target = { x: outer.x + 0.3, y: outer.y - 0.28 };
    const r = moveStairOuterPoint(p, 2, outer, target);
    expect(r.path[0]).toEqual(p.path[0]);
    expect(r.path[1]).toEqual(p.path[1]);
    const g2 = computeStairGeometry(r);
    const pts = g2.treads.flatMap((t) => t.poly);
    expect(Math.min(...pts.map((q) => Math.hypot(q.x - target.x, q.y - target.y)))).toBeLessThan(1e-4);
  });
  it("Wendelanzahl wirkt sichtbar", () => {
    const p = { ...setKnickMode(base("left", [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: -3 }]), 1, "winder")!, winderCount: 4 };
    expect(computeStairGeometry(p).treads.filter((t) => t.isWinder).length).toBe(4);
  });
});
