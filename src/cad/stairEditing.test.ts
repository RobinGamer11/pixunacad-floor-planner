import { describe, it, expect } from "vitest";
import {
  computeStairGeometry, translateStair, rotateStair, stairEditableEdges, setLandingDepth, landingDepthOf,
  moveStairBoundary, type StairParams,
} from "./stairGeometry";
import { GlobalGuides } from "./globalGuides";
import { Camera } from "./Camera";

const base = (path: { x: number; y: number }[]): StairParams => ({
  mode: path.length > 2 ? "landing" : "straight", path, referenceSide: "left",
  treadDepthM: 0.28, stairWidthM: 1, riserHeightM: 0.175, direction: "up",
});
const L = 1 + 0.28 * 7;
const lStair = () => base([{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: -L }]);

describe("Treppe – Bearbeitung über Fangpunkte", () => {
  it("jede bearbeitbare Kante liefert Endpunkte und Mitte; Podest hat Zulauf-, Abgangs- und Seitenkanten", () => {
    const edges = stairEditableEdges(lStair());
    expect(edges.some((e) => e.kind === "boundary")).toBe(true);
    expect(edges.filter((e) => e.kind === "ref").length).toBe(2);
    expect(edges.filter((e) => e.kind === "width" && e.knick == null).length).toBe(2);
    const landing = edges.filter((e) => e.knick === 1);
    expect(landing.filter((e) => e.kind === "landing").length).toBe(2);
    expect(landing.filter((e) => e.kind === "width").length).toBeGreaterThanOrEqual(1);
  });

  it("Abgangskante bewegen ändert nur dieses Podest, Mindestmaß bleibt geschützt", () => {
    const p = base([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: -3 }, { x: 6, y: -3 }]);
    const q = setLandingDepth(p, 2, landingDepthOf(p, 2) + 0.3)!;
    expect(landingDepthOf(q, 2)).toBeCloseTo(1.3);
    expect(landingDepthOf(q, 1)).toBeCloseTo(1);
    expect(landingDepthOf(setLandingDepth(p, 2, 0.2)!, 2)).toBeCloseTo(1);
  });

  it("Zahleneingabe und Kante bewegen führen zum identischen Ergebnis", () => {
    const p = base([{ x: 0, y: 0 }, { x: 0.28 * 6, y: 0 }]);
    const byDrag = moveStairBoundary(p, 1, 0.04)!;
    const t = computeStairGeometry(p).treads[1];
    const byField = moveStairBoundary(p, 1, 0.32 - t.depth)!;
    expect(byField).toEqual(byDrag);
  });

  it("ganze Treppe verschieben/drehen hält Geometrie zusammen und speichert keine Stufen", () => {
    const p = lStair();
    const g0 = computeStairGeometry(p);
    const moved = translateStair(p, 2, 3);
    const g1 = computeStairGeometry(moved);
    expect(g1.treadCount).toBe(g0.treadCount);
    expect(g1.treads[0].poly[0].x).toBeCloseTo(g0.treads[0].poly[0].x + 2);
    const rot = rotateStair(p, { x: 0, y: 0 }, Math.PI / 2);
    const g2 = computeStairGeometry(rot);
    expect(g2.valid).toBe(g0.valid);
    expect(g2.landings.length).toBe(g0.landings.length);
    expect(rot.path[1].x).toBeCloseTo(0); expect(rot.path[1].y).toBeCloseTo(L);
    expect(Object.keys(moved)).not.toContain("treads");
  });
});

describe("Hilfslinien – parallel zu einer Kante", () => {
  it("toggleLine setzt/entfernt eine Gerade und liefert Fang darauf", () => {
    const g = new GlobalGuides();
    g.toggleLine({ x: 0, y: 1 }, { x: 1, y: 1 });
    expect(g.lines.length).toBe(1);
    const cam = new Camera(); cam.scale = 100; cam.offsetX = 0; cam.offsetY = 0;
    const w = { x: 2, y: 3.02 };
    const s = cam.worldToScreen(w.x, w.y);
    const snap = g.findSnap(s, w, cam);
    expect(snap).not.toBeNull();
    expect(snap.world.y - snap.world.x).toBeCloseTo(1);
    g.toggleLine({ x: 5, y: 6 }, { x: -1, y: -1 }); // gleiche Gerade, andere Richtung
    expect(g.lines.length).toBe(0);
  });
});
