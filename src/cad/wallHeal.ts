import { Vec2, v, sub, norm, lineLineIntersectionInfinite } from "./geometry";
import { computeWallLines } from "./wallGeom";
import type { Wall } from "./Scene";

const HEAL_TOL_M = 0.05;

/**
 * Liefert healed mainCorners/subCorners/helpCorners einer Wand. Endpunkte werden
 * an benachbarte Wandlinien getrimmt nach folgender Priorität:
 *  1) Gleichnamiger Stoß (Main↔Main, Sub↔Sub, Help↔Help) der Nachbarwand.
 *  2) Fallback: wenn der gleichnamige Schnitt jenseits der Main-Linie der Nachbar liegen
 *     würde (= Main blockiert), trimme an der Main-Linie der Nachbarwand (S3).
 * Außenwand (AW) hat höhere Priorität als Innenwand (IW). IW trimmt an AW;
 * AW trimmt nur an gleichrangiger AW.
 */
export function computeHealedWallLines(wall: Wall, others: Wall[]) {
  const lines = computeWallLines(wall.corners, wall.thicknessM, wall.referenceSide);
  if (wall.corners.length < 2) return { ...lines, capStart: true, capEnd: true };

  const mainCorners = lines.mainCorners.map(p => v(p.x, p.y));
  const subCorners = lines.subCorners.map(p => v(p.x, p.y));
  const helpCorners = lines.helpCorners.map(p => v(p.x, p.y));

  const capStart = !healEnd(wall, others, mainCorners, subCorners, helpCorners, true);
  const capEnd = !healEnd(wall, others, mainCorners, subCorners, helpCorners, false);

  return { mainCorners, subCorners, helpCorners, capStart, capEnd };
}

function healEnd(
  wall: Wall,
  others: Wall[],
  mainCorners: Vec2[],
  subCorners: Vec2[],
  helpCorners: Vec2[],
  atStart: boolean,
): boolean {
  const n = wall.corners.length;
  if (n < 2) return false;

  const idx = atStart ? 0 : mainCorners.length - 1;
  const corner = atStart ? wall.corners[0] : wall.corners[n - 1];
  const dir = atStart
    ? norm(sub(wall.corners[1], wall.corners[0]))
    : norm(sub(wall.corners[n - 1], wall.corners[n - 2]));
  if (dir.x === 0 && dir.y === 0) return false;

  // Suche beste Nachbarwand: deren Bezugs-Polylinie liegt nah am Endpunkt.
  let bestNeighbor: Wall | null = null;
  let bestPriority = -1;
  for (const ow of others) {
    if (ow === wall) continue;
    // AW darf nicht an IW trimmen
    if (wall.kind === "outer" && ow.kind !== "outer") continue;
    if (!pointNearPolyline(corner, ow.corners, HEAL_TOL_M + ow.thicknessM)) continue;
    // AW>IW: Außenwände bevorzugt
    const prio = ow.kind === "outer" ? 2 : 1;
    if (prio > bestPriority) {
      bestPriority = prio;
      bestNeighbor = ow;
    }
  }
  if (!bestNeighbor) return false;

  const olines = computeWallLines(bestNeighbor.corners, bestNeighbor.thicknessM, bestNeighbor.referenceSide);

  // Gleichnamiger Trim mit Fallback auf Main bei "Main blockiert"
  const trim = (origin: Vec2, samePoly: Vec2[]): Vec2 | null => {
    const same = intersectRayWithPoly(origin, dir, samePoly);
    const main = intersectRayWithPoly(origin, dir, olines.mainCorners);
    if (!same && !main) return null;
    if (!same) return main;
    if (!main) return same;
    // Wenn die "same"-Schnittstelle weiter weg liegt als die Main-Schnittstelle in
    // gleicher Bewegungsrichtung, liegt sie hinter der Main → Main blockiert (S3).
    const tSame = signedT(origin, dir, same);
    const tMain = signedT(origin, dir, main);
    // beide in gleicher Richtung wie dir? Wir trimmen in Bewegungsrichtung dir
    // (der Endpunkt sitzt bei start/end auf der Achse, dir zeigt von start nach corner[1]
    //  bzw. corner[n-1]→corner[n-2] für end ist ABER wir benutzen oben "from prev to last"
    //  → wir brauchen die Richtung ZUM Endpunkt, also ggf. negieren).
    // Vereinfacht: wähle den Treffer, der näher an origin liegt entlang einer Achse,
    // und stelle sicher, dass er nicht hinter Main liegt.
    const useMainBlockade = (atStart ? (tSame < tMain) : (tSame > tMain));
    return useMainBlockade ? main : same;
  };

  const newMain = intersectRayWithPoly(mainCorners[idx], dir, olines.mainCorners);
  const newSub = trim(subCorners[idx], olines.subCorners);
  const newHelp = trim(helpCorners[idx], olines.helpCorners);

  let healed = false;
  if (newMain) { mainCorners[idx] = newMain; healed = true; }
  if (newSub) { subCorners[idx] = newSub; healed = true; }
  if (newHelp) { helpCorners[idx] = newHelp; healed = true; }
  return healed;
}

function pointNearPolyline(p: Vec2, poly: Vec2[], tol: number): boolean {
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const ab = sub(b, a);
    const ap = sub(p, a);
    const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-12;
    let t = (ap.x * ab.x + ap.y * ab.y) / ab2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
    if (Math.hypot(q.x - p.x, q.y - p.y) <= tol) return true;
  }
  return false;
}

/** Schiebt p entlang dir auf den nächstgelegenen gültigen Schnittpunkt mit einer Polylinie. */
function intersectRayWithPoly(p: Vec2, dir: Vec2, poly: Vec2[]): Vec2 | null {
  let best: Vec2 | null = null;
  let bestAbs = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const segDir = sub(b, a);
    const ip = lineLineIntersectionInfinite(p, dir, a, segDir);
    if (!ip) continue;
    // Bounds-Check bewusst sehr weit: Wandlinien benachbarter Wände werden zur
    // Mitren-Bildung als unendlich angenommen. bestNeighbor ist bereits per
    // Proximität vorgefiltert.
    const distToP = Math.hypot(ip.x - p.x, ip.y - p.y);
    if (distToP < bestAbs) { bestAbs = distToP; best = ip; }
  }
  return best;
}

function signedT(origin: Vec2, dir: Vec2, p: Vec2): number {
  return (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
}
