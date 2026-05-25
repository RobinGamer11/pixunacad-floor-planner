import type { Vec2 } from "./geometry";
import type { Wall } from "./Scene";
import { computeWallLines } from "./wallGeom";

/**
 * Erzeugt aus einer Wand (Bezugslinie + Dicke + referenceSide) einen
 * geschlossenen, einfachen Polygonring (Außenkante + Innenkante).
 *
 * Reihenfolge:
 *   mainCorners[0..n] → subCorners[n..0]
 *
 * Der Ring ist als äußere Hülle eines einzelnen Wand-Streifens gedacht und
 * dient ausschließlich als Eingabe für die Boolean-Union der gesamten
 * Wandgeometrie eines Layers. Die topologische Bedeutung liegt weiterhin
 * ausschließlich auf wall.corners.
 */
export function buildWallSolidRing(wall: Wall): Vec2[] {
  if (!wall.corners || wall.corners.length < 2) return [];
  const t = Math.max(0, wall.thicknessM);
  if (t <= 1e-6) return [];
  const lines = computeWallLines(wall.corners, t, wall.referenceSide);
  const ring: Vec2[] = [];
  for (const p of lines.mainCorners) ring.push({ x: p.x, y: p.y });
  for (let i = lines.subCorners.length - 1; i >= 0; i--) {
    const p = lines.subCorners[i];
    ring.push({ x: p.x, y: p.y });
  }
  return ring;
}

/** Polygon-clipping erwartet [x,y]-Paare; konvertiert + schließt den Ring. */
export function ringToPCPolygon(ring: Vec2[]): number[][] {
  if (ring.length < 3) return [];
  const pts: number[][] = ring.map(p => [p.x, p.y]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push([first[0], first[1]]);
  return pts;
}
