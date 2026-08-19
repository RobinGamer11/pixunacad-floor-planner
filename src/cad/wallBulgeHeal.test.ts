import { describe, it, expect } from "vitest";
import { Wall, type WallKind } from "./Scene";
import { v, polygonAreaAbs, dist, pointInPolygon } from "./geometry";
import type { WallReferenceSide } from "./wallGeom";
import { computeHealedWallLines } from "./wallHeal";
import { buildHealedWallSolidRing } from "./wallSolid";
import { unionWallSolids } from "./wallUnion";
import { WallTopologyGraph } from "./WallTopologyGraph";

/**
 * Regressionstests für gewölbte Wände an Nachbarwand-Knoten:
 *  - Fangpunkte (Bezugs-Endpunkte) liegen exakt im Wandkörper.
 *  - Help-/Sublinien der Nachbarn treffen sich am gemeinsamen Knoten.
 *  - Die Boolean-Union ergibt genau EINE zusammenhängende Fläche (keine Lücke).
 */

const BULGES = [0, 0.2, -0.2, 0.5, -0.5, 0.9, -0.9, 1.5, -1.5];
const SIDES: WallReferenceSide[] = ["outer", "center", "inner"];

function makeWall(
  id: string,
  corners: { x: number; y: number }[],
  bulges: number[],
  side: WallReferenceSide,
  kind: WallKind = "outer",
  thicknessM = 0.3,
): Wall {
  return new Wall({
    id,
    kind,
    thicknessM,
    referenceSide: side,
    corners: corners.map(c => v(c.x, c.y)),
    labelId: "L1",
    bulges,
  } as any);
}

function graphOf(walls: Wall[]): WallTopologyGraph {
  const g = new WallTopologyGraph();
  g.build(walls);
  return g;
}

function containsPoint(ring: { x: number; y: number }[], p: { x: number; y: number }, tol = 1e-9): boolean {
  return ring.some(q => dist(q, p) <= tol);
}

/** Punkt liegt in mindestens einem Polygon der Union (Löcher berücksichtigt). */
function coveredByUnion(multi: any, p: { x: number; y: number }): boolean {
  for (const poly of multi as number[][][][]) {
    const rings = poly.map(r => r.map(([x, y]) => v(x, y)));
    if (!rings.length) continue;
    if (!pointInPolygon(p, rings[0])) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) if (pointInPolygon(p, rings[i])) inHole = true;
    if (!inHole) return true;
  }
  return false;
}

function endPointsOf(wall: Wall, others: Wall[], graph: WallTopologyGraph, atStart: boolean) {
  const l = computeHealedWallLines(wall, others, graph);
  const i = atStart ? 0 : l.mainCorners.length - 1;
  return { main: l.mainCorners[i], help: l.helpCorners[i], sub: l.subCorners[i] };
}

describe("gewölbte Wände – Heilung an Nachbarknoten", () => {
  for (const side of SIDES) {
    for (const bulge of BULGES) {
      it(`Fangpunkte bleiben exakt im Wandkörper (side=${side}, bulge=${bulge})`, () => {
        const a = makeWall("a", [{ x: 0, y: 0 }, { x: 4, y: 0 }], [bulge], side);
        const b = makeWall("b", [{ x: 4, y: 0 }, { x: 4, y: 3 }], [0], side);
        const walls = [a, b];
        const g = graphOf(walls);
        for (const w of walls) {
          const ring = buildHealedWallSolidRing(w, walls, g);
          expect(ring.length).toBeGreaterThan(3);
          expect(containsPoint(ring, w.corners[0])).toBe(true);
          expect(containsPoint(ring, w.corners[w.corners.length - 1])).toBe(true);
        }
      });

      it(`Help-/Sublinien treffen sich am Knoten (side=${side}, bulge=${bulge})`, () => {
        const a = makeWall("a", [{ x: 0, y: 0 }, { x: 4, y: 0 }], [bulge], side);
        const b = makeWall("b", [{ x: 4, y: 0 }, { x: 4, y: 3 }], [-bulge], side);
        const walls = [a, b];
        const g = graphOf(walls);
        const ea = endPointsOf(a, [b], g, false);
        const eb = endPointsOf(b, [a], g, true);
        // Toleranz großzügig gegen Rundung, aber weit unter Wanddicke (0.3 m).
        expect(dist(ea.help, eb.help)).toBeLessThan(0.05);
        expect(dist(ea.sub, eb.sub)).toBeLessThan(0.05);
      });

      it(`keine Lücke am Knoten (side=${side}, bulge=${bulge})`, () => {
        const a = makeWall("a", [{ x: 0, y: 0 }, { x: 4, y: 0 }], [bulge], side);
        const b = makeWall("b", [{ x: 4, y: 0 }, { x: 4, y: 3 }], [0], side);
        const walls = [a, b];
        const g = graphOf(walls);
        const multi = unionWallSolids(walls, walls, g);
        expect(multi.length).toBeGreaterThan(0);

        // Umgebung des Knoten-Querschnitts muss vollständig durch Wandmasse
        // gedeckt sein — sonst klafft dort eine sichtbare Lücke.
        const e = endPointsOf(a, walls, g, false);
        const mid = v((e.main.x + e.sub.x) / 2, (e.main.y + e.sub.y) / 2);
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          const p = v(mid.x + Math.cos(ang) * 0.01, mid.y + Math.sin(ang) * 0.01);
          expect(coveredByUnion(multi, p)).toBe(true);
        }
      });

      it(`Wandkörper bleibt flächenmäßig plausibel (side=${side}, bulge=${bulge})`, () => {
        const a = makeWall("a", [{ x: 0, y: 0 }, { x: 4, y: 0 }], [bulge], side);
        const b = makeWall("b", [{ x: 4, y: 0 }, { x: 4, y: 3 }], [0], side);
        const walls = [a, b];
        const g = graphOf(walls);
        const ring = buildHealedWallSolidRing(a, walls, g);
        const area = polygonAreaAbs(ring);
        // Bogenlänge wächst mit der Wölbung – großzügige, aber endliche Schranke.
        const maxLen = 4 * (1 + 4 * Math.abs(bulge));
        expect(area).toBeGreaterThan(0.1);
        expect(area).toBeLessThan(maxLen * 0.3 * 3);
      });
    }
  }

  it("T-Stoß mit gewölbter Wand bleibt verbunden", () => {
    const a = makeWall("a", [{ x: 0, y: 0 }, { x: 6, y: 0 }], [0.6], "center");
    // Endpunkt der Innenwand liegt auf der Bezugssehne der gewölbten Außenwand.
    const b = makeWall("b", [{ x: 3, y: 0 }, { x: 3, y: 3 }], [0], "center", "inner", 0.2);
    const walls = [a, b];
    const g = graphOf(walls);
    for (const w of walls) {
      const ring = buildHealedWallSolidRing(w, walls, g);
      expect(containsPoint(ring, w.corners[0])).toBe(true);
      expect(containsPoint(ring, w.corners[w.corners.length - 1])).toBe(true);
      expect(polygonAreaAbs(ring)).toBeGreaterThan(0.05);
    }
  });
});
