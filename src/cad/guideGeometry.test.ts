import { describe, it, expect } from "vitest";
import { buildGuideGeometry, incidentDirectionsAt, nearestGuideEdge } from "./guideGeometry";

const vis = () => true;

describe("guideGeometry", () => {
  it("liefert echte anliegende Achsen an Polygon-Ecken (nicht nur Wände)", () => {
    const scene = { hatches: [{ id: "h", labelId: "x", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }] }] };
    const g = buildGuideGeometry({ scene, isVisible: vis });
    const dirs = incidentDirectionsAt(g, { x: 2, y: 0 }, 1e-6);
    expect(dirs.length).toBe(2);
  });
  it("Richtung und Gegenrichtung sind dieselbe Achse", () => {
    const scene = { segments: [{ id: "a", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { id: "b", a: { x: 2, y: 0 }, b: { x: 1, y: 0 } }] };
    const g = buildGuideGeometry({ scene, isVisible: vis });
    expect(incidentDirectionsAt(g, { x: 1, y: 0 }, 1e-6).length).toBe(1);
  });
  it("ausgeblendete Ebenen liefern nichts, Kanten werden gefunden", () => {
    const scene = { segments: [{ id: "a", labelId: "off", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { id: "b", labelId: "on", a: { x: 0, y: 1 }, b: { x: 1, y: 1 } }] };
    const g = buildGuideGeometry({ scene, isVisible: (l) => l === "on" });
    expect(nearestGuideEdge(g, { x: 0.5, y: 0.02 }, 0.1)).toBeNull();
    expect(nearestGuideEdge(g, { x: 0.5, y: 0.98 }, 0.1)).not.toBeNull();
  });
});

import { clipInfiniteLineToRect } from "./globalGuides";
import { findGuideTarget } from "./GuideInteractionController";

describe("Nachkorrektur Hilfslinien", () => {
  const cam = { worldToScreen: (x: number, y: number) => ({ x: x * 100, y: y * 100 }), screenToWorld: (x: number, y: number) => ({ x: x / 100, y: y / 100 }) };
  it("schräge Achse reicht über die ganze sichtbare Fläche", () => {
    const s = clipInfiniteLineToRect(cam, { x: 1, y: 1 }, { x: 1, y: 1 }, 800, 600)!;
    expect(Math.min(s[0].x, s[1].x)).toBeLessThanOrEqual(0);
    expect(Math.max(s[0].y, s[1].y)).toBeGreaterThanOrEqual(600);
  });
  it("Rechtsklick auf gesetzten Punkt einer laufenden Zeichnung liefert dessen Kantenachsen", () => {
    const topo = { findBestSnap: () => null };
    const t = findGuideTarget(topo, cam, { x: 200, y: 0 }, { x: 2, y: 0 }, {
      anchor: { x: 2, y: 1 },
      extraEdges: [[{ x: 0, y: 0 }, { x: 2, y: 0 }], [{ x: 2, y: 0 }, { x: 2, y: 1 }]],
      extraPoints: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }],
    });
    expect(t?.kind).toBe("point");
    expect((t as any).directions.length).toBe(2);
  });
  it("einzelner gesetzter Punkt ist Ziel", () => {
    const t = findGuideTarget({ findBestSnap: () => null }, cam, { x: 0, y: 0 }, { x: 0, y: 0 }, { anchor: null, extraPoints: [{ x: 0, y: 0 }] });
    expect(t?.kind).toBe("point");
  });
});

import { GlobalGuides } from "./globalGuides";
import { GuideInteractionController } from "./GuideInteractionController";

describe("Laufende Kante: Parallele durch Bezugspunkt", () => {
  const cam = { worldToScreen: (x: number, y: number) => ({ x: x * 100, y: y * 100 }), screenToWorld: (x: number, y: number) => ({ x: x / 100, y: y / 100 }) };
  it("Rechtsklick auf temporäre Kante → Parallele durch Bezugspunkt, Toggle", () => {
    const g = new GlobalGuides();
    const c = new GuideInteractionController(g, { findBestSnap: () => null } as any, cam);
    const ctx = { anchor: { x: 3, y: 2 }, extraEdges: [[{ x: 0, y: 0 }, { x: 2, y: 1 }]] as any, extraPoints: [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 2 }] };
    expect(c.handleRightClick({ x: 100, y: 50 }, { x: 1, y: 0.5 }, ctx)).toBe(true);
    expect(g.lines.length).toBe(1);
    const l: any = g.lines[0];
    expect(Math.abs(l.dir.x * 1 - l.dir.y * 2)).toBeLessThan(1e-6);
    expect(Math.abs((3 - l.point.x) * l.dir.y - (2 - l.point.y) * l.dir.x)).toBeLessThan(1e-6);
    c.handleRightClick({ x: 100, y: 50 }, { x: 1, y: 0.5 }, ctx);
    expect(g.lines.length).toBe(0);
  });
});
