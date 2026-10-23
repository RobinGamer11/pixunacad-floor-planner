import { describe, expect, it } from "vitest";
import { cardinalEdge, frameForCardinal, resolveTilt, tiltPoint } from "./tiltGeometry";
import { applyGenericTilt } from "./geometryDerivation";

// Schräge Unterkante: (0,10) → (4,12). „Unten“ = waagerechte Linie am untersten Punkt (y = 12).
const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 12 }, { x: 0, y: 10 }];

describe("gedachte Bezugskanten", () => {
  it("unten liegt waagerecht am untersten Punkt, Achse am obersten", () => {
    expect(cardinalEdge(pts, "bottom")).toEqual([{ x: 0, y: 12 }, { x: 4, y: 12 }]);
    const f = frameForCardinal(pts, "bottom", 90, 0).frame!;
    expect(f.axis.y).toBe(0);
    expect(f.D).toBe(12);
    // Aufstellen um 90°: alle Punkte der Unterlinie landen auf derselben Höhe – nicht schräg.
    const a = tiltPoint(0, 12, 0, f), b = tiltPoint(4, 12, 0, f);
    expect(a.z).toBeCloseTo(12); expect(b.z).toBeCloseTo(12);
  });

  it("Schraffur nutzt die gespeicherte gedachte Kante", () => {
    const r = resolveTilt({ points: pts, tilt3D: { cardinal: "left", angleDeg: 30, edgeIndex: -1, a: { x: 0, y: 0 }, b: { x: 0, y: 12 }, count: 4 } }, 0);
    expect(r?.frame?.axis.x).toBe(4);
  });

  it("beliebige Objekte (z. B. Wand) werden geneigt", () => {
    const prism: any = { type: "prism", source: "wall", sourceId: "w", sheetId: "s", footprint: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.2 }, { x: 0, y: 0.2 }], holes: [], z0: 0, z1: 3, color: "#fff" };
    const out: any[] = applyGenericTilt({ tilt3D: { cardinal: "right", angleDeg: 20, edgeIndex: -1, a: { x: 4, y: 0 }, b: { x: 4, y: 0.2 }, count: 4 } }, [prism], 0);
    expect(out[0].type).toBe("mesh");
    const zs = out[0].mesh.positions.filter((_: number, i: number) => i % 3 === 2);
    expect(Math.min(...zs)).toBeLessThan(-0.1);
  });
});
