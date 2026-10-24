import { describe, expect, it } from "vitest";
import { convexHull, frameForEdge, oppositeFrame, resolveGenericTilt, tiltPoint } from "./tiltGeometry";
import { applyGenericTilt } from "./geometryDerivation";
import { projectObject2D } from "./tiltProject2D";

const rect = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }];

describe("Neigung für alle Objektarten", () => {
  it("echte Kante einer Wand wählbar (Umrisshülle) und geneigt", () => {
    const hull = convexHull(rect);
    const i = hull.findIndex((p, k) => { const q = hull[(k + 1) % hull.length]; return p.y === 2 && q.y === 2; });
    expect(i).toBeGreaterThanOrEqual(0);
    const t = { edgeIndex: i, a: hull[i], b: hull[(i + 1) % hull.length], count: hull.length, angleDeg: 30 };
    const prism: any = { type: "prism", source: "wall", sourceId: "w", sheetId: "s", footprint: rect, holes: [], z0: 0, z1: 1, color: "#fff" };
    const out: any[] = applyGenericTilt({ tilt3D: t }, [prism], 0);
    expect(out[0].type).toBe("mesh");
    expect(resolveGenericTilt(t, rect, 0)?.frame?.D).toBeCloseTo(2);
  });

  it("Gegenüberliegende Kante neigen: gewählte Kante bleibt auf Höhe 0", () => {
    const f = frameForEdge({ points: rect }, 2, 30, 0).frame!; // Kante (4,2)→(0,2)
    const normal = tiltPoint(0, 2, 0, f), opp = tiltPoint(0, 2, 0, oppositeFrame(f));
    expect(normal.z).toBeCloseTo(Math.sin(Math.PI / 6) * 2);
    expect(opp.z).toBeCloseTo(0);
    expect(tiltPoint(0, 0, 0, oppositeFrame(f)).z).toBeCloseTo(1);
  });

  it("Tatsächliche Fläche staucht ein Bild in 2D quer zur Achse", () => {
    const f = frameForEdge({ points: rect }, 2, 60, 0).frame!; // Achse bei y = 0, quer = y
    const doc: any = { position: { x: 0, y: 0 }, widthM: 4, heightM: 2, rotationRad: 0 };
    projectObject2D(doc, f, 0.5);
    expect(doc.widthM).toBeCloseTo(4);
    expect(doc.heightM).toBeCloseTo(1);
    expect(doc.position.y).toBeCloseTo(0);
  });
});
