import type { Vec2 } from "./geometry";
import type { Wall } from "./Scene";
import { computeWallLines, wallRefCorners } from "./wallGeom";
import { computeHealedWallLines } from "./wallHeal";
import type { WallTopologyGraph } from "./WallTopologyGraph";

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
  const lines = computeWallLines(wallRefCorners(wall as any), t, wall.referenceSide);
  return ringFromMainSub(lines.mainCorners, lines.subCorners);
}

/**
 * ArchiCAD-Stil: Solid-Ring aus den GEHEILTEN Main+Sub-Linien einer Wand.
 * Verwendet `computeHealedWallLines`, sodass an gemeinsamen Knoten beide
 * Wandkanten (auch die gegenüberliegende!) bis zum echten Gehrungspunkt
 * verlängert werden. Die anschließende Boolean-Union der Solids ergibt
 * automatisch saubere Außengehrungen, T-Stöße und X-Knoten.
 */
export function buildHealedWallSolidRing(
  wall: Wall,
  others: Wall[],
  graph?: WallTopologyGraph,
): Vec2[] {
  if (!wall.corners || wall.corners.length < 2) return [];
  const t = Math.max(0, wall.thicknessM);
  if (t <= 1e-6) return [];
  const lines = computeHealedWallLines(wall, others, graph);
  const ref = wallRefCorners(wall as any);
  return ringFromMainSub(lines.mainCorners, lines.subCorners, ref[0], ref[ref.length - 1]);
}

function ringFromMainSub(main: Vec2[], sub: Vec2[], refStart?: Vec2, refEnd?: Vec2): Vec2[] {
  const ring: Vec2[] = [];
  const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;
  for (const p of main) ring.push({ x: p.x, y: p.y });
  // Die Bezugs-Endpunkte (= Fangpunkte der Wand) gehören immer zum Wandkörper.
  // So bleibt die optische Wand exakt an den Fangpunkten und benachbarte
  // Wandkörper überlappen sich am gemeinsamen Knoten — auch bei Wölbung.
  if (refEnd && main.length && sub.length && !near(refEnd, main[main.length - 1]) && !near(refEnd, sub[sub.length - 1])) {
    ring.push({ x: refEnd.x, y: refEnd.y });
  }
  for (let i = sub.length - 1; i >= 0; i--) {
    const p = sub[i];
    ring.push({ x: p.x, y: p.y });
  }
  if (refStart && main.length && sub.length && !near(refStart, main[0]) && !near(refStart, sub[0])) {
    ring.push({ x: refStart.x, y: refStart.y });
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

