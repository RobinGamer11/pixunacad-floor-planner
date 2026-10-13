import { describe, it, expect } from "vitest";
import { cutPolyline } from "./cutGeometry";

describe("Polygon schneiden", () => {
  it("öffnet ein geschlossenes Quadrat ohne Schließkante entlang des Schnitts", () => {
    const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    const pieces = cutPolyline(sq, null, true, { x: 1, y: -1 }, { x: 1, y: 3 })!;
    expect(pieces.length).toBe(2);
    for (const p of pieces) {
      const a = p.points[0], b = p.points[p.points.length - 1];
      // Enden liegen auf der Schnittlinie x=1 und werden nicht verbunden.
      expect(a.x).toBeCloseTo(1); expect(b.x).toBeCloseTo(1);
      expect(p.bulges.length).toBe(p.points.length - 1);
    }
  });
});
