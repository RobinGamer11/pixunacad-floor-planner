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
