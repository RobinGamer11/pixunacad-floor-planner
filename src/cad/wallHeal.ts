import { Vec2, v, sub, add, mul, norm, dot, dist, lineLineIntersectionInfinite } from "./geometry";
import { computeWallLines, type WallReferenceSide } from "./wallGeom";
import type { Wall } from "./Scene";

const HEAL_TOL_M = 0.02;

/** Liefert healed mainCorners/subCorners einer Wand: Endpunkte werden an benachbarte Wandlinien verlängert/getrimmt. */
export function computeHealedWallLines(wall: Wall, others: Wall[]) {
  const lines = computeWallLines(wall.corners, wall.thicknessM, wall.referenceSide);
  if (wall.corners.length < 2) return { ...lines, capStart: true, capEnd: true };

  const mainCorners = lines.mainCorners.map(p => v(p.x, p.y));
  const subCorners = lines.subCorners.map(p => v(p.x, p.y));

  let capStart = true;
  let capEnd = true;

  // START-Endpunkt: untersuche corners[0], suche andere Wand, deren Hauptlinie nahe liegt
  capStart = !healEnd(wall, others, mainCorners, subCorners, true);
  capEnd = !healEnd(wall, others, mainCorners, subCorners, false);

  return { mainCorners, subCorners, helpCorners: lines.helpCorners, capStart, capEnd };
}

/** Verlängert/Trimmt das jeweilige Wand-Ende an eine getroffene Nachbar-Wandlinie. Returns true wenn geheilt. */
function healEnd(wall: Wall, others: Wall[], mainCorners: Vec2[], subCorners: Vec2[], atStart: boolean): boolean {
  const n = wall.corners.length;
  if (n < 2) return false;

  const idxMain = atStart ? 0 : mainCorners.length - 1;
  const idxSub = atStart ? 0 : subCorners.length - 1;
  const corner = atStart ? wall.corners[0] : wall.corners[n - 1];

  // Richtung der ersten/letzten Wandachse
  let dir: Vec2;
  if (atStart) {
    dir = norm(sub(wall.corners[1], wall.corners[0]));
  } else {
    dir = norm(sub(wall.corners[n - 1], wall.corners[n - 2]));
  }
  if (dir.x === 0 && dir.y === 0) return false;

  // Suche andere Wand, deren Hauptlinie in der Nähe vom Corner liegt
  for (const ow of others) {
    if (ow === wall) continue;
    const olines = computeWallLines(ow.corners, ow.thicknessM, ow.referenceSide);
    // Prüfe Mittellinie (ow.corners) zuerst – wenn unser Endpunkt auf ihr liegt → T-Stoß
    if (pointNearPolyline(corner, ow.corners, HEAL_TOL_M + ow.thicknessM * 0.6)) {
      // Trimme/Verlängere main- und sub-Endpunkt an ow.mainCorners bzw. ow.subCorners
      const newMain = intersectRayWithPolyline(mainCorners[idxMain], dir, olines.mainCorners, olines.subCorners);
      const newSub = intersectRayWithPolyline(subCorners[idxSub], dir, olines.mainCorners, olines.subCorners);
      if (newMain) mainCorners[idxMain] = newMain;
      if (newSub) subCorners[idxSub] = newSub;
      if (newMain || newSub) return true;
    }
  }
  return false;
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

/** Schiebt p entlang dir auf den nächstgelegenen Schnittpunkt mit einer der Polylinien. */
function intersectRayWithPolyline(p: Vec2, dir: Vec2, polyA: Vec2[], polyB: Vec2[]): Vec2 | null {
  let best: Vec2 | null = null;
  let bestAbs = Infinity;
  const tryPoly = (poly: Vec2[]) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      const segDir = sub(b, a);
      const ip = lineLineIntersectionInfinite(p, dir, a, segDir);
      if (!ip) continue;
      // Prüfe ob ip auf Segment liegt
      const segLen2 = segDir.x * segDir.x + segDir.y * segDir.y || 1e-12;
      const t = ((ip.x - a.x) * segDir.x + (ip.y - a.y) * segDir.y) / segLen2;
      if (t < -0.05 || t > 1.05) continue;
      const distToP = Math.hypot(ip.x - p.x, ip.y - p.y);
      if (distToP < bestAbs) {
        bestAbs = distToP;
        best = ip;
      }
    }
  };
  tryPoly(polyA);
  tryPoly(polyB);
  return best;
}
