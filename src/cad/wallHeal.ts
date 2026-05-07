import { Vec2, v, sub, norm, lineLineIntersectionInfinite, dist } from "./geometry";
import { computeWallLines } from "./wallGeom";
import type { Wall, WallKind } from "./Scene";

const HEAL_TOL_M = 0.05;
type LineType = "main" | "help" | "sub";

/**
 * Hierarchie-Prioritätsindex. Niedrigere Zahl = höhere Priorität.
 * 1 AW-Bezugslinie · 2 AW-Helplinie · 3 AW-Sublinie ·
 * 4 IW-Bezugslinie · 5 IW-Helplinie · 6 IW-Sublinie.
 */
function priorityOf(kind: WallKind, t: LineType): number {
  const base = kind === "outer" ? 0 : 3;
  const off = t === "main" ? 1 : t === "help" ? 2 : 3;
  return base + off;
}

/**
 * Liefert getrimmte Polylinien (Main/Sub/Help) einer Wand. Funktioniert in zwei
 * Phasen pro Endpunkt und Linientyp:
 *  1) "Virtuelle Vollverbindung": ideale Zielposition = Schnitt mit gleichnamiger
 *     Linie (Main↔Main, Help↔Help, Sub↔Sub) der nächstgelegenen Nachbarwand.
 *  2) "Sichtbare Kürzung durch höhere Priorität": entlang des Pfades vom Endpunkt
 *     zum idealen Ziel wird der erste Schnitt mit einer Nachbar-Linie höherer
 *     Priorität gesucht; falls näher als das Ideal, wird dort gekappt.
 *
 * AW-Linien werden nie an IW-Linien getrimmt (Phase 1 überspringt IW als Ziel
 * für AW; Phase 2 kann AW nicht durch IW kappen, da IW immer niedrigere Priorität).
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

  // Sammle plausible Nachbarn über alle Linientypen (Endpunkt nahe an Bezugs-
  // Polylinie der anderen Wand). Wir filtern später pro Trim-Schritt erneut
  // (AW darf nicht durch IW getrimmt werden).
  const candidates: Wall[] = [];
  for (const ow of others) {
    if (ow === wall) continue;
    if (!pointNearPolyline(corner, ow.corners, HEAL_TOL_M + Math.max(ow.thicknessM, wall.thicknessM))) continue;
    candidates.push(ow);
  }
  if (candidates.length === 0) return false;

  // Pre-compute neighbor lines (Cache pro healEnd-Aufruf).
  const cache = new Map<Wall, ReturnType<typeof computeWallLines>>();
  const linesOf = (ow: Wall) => {
    let l = cache.get(ow);
    if (!l) { l = computeWallLines(ow.corners, ow.thicknessM, ow.referenceSide); cache.set(ow, l); }
    return l;
  };

  const polysSelf: Record<LineType, Vec2[]> = {
    main: mainCorners,
    help: helpCorners,
    sub: subCorners,
  };

  let healedAny = false;

  for (const T of ["main", "help", "sub"] as LineType[]) {
    const ownPrio = priorityOf(wall.kind, T);
    const origin = polysSelf[T][idx];

    // --- Phase 1: Ideale Zielposition (gleichnamige Linie der Nachbarwand) ---
    let ideal: Vec2 | null = null;
    let idealAbs = Infinity;
    let idealSignedT = 0;
    for (const ow of candidates) {
      // AW darf nie gegen IW trimmen
      if (wall.kind === "outer" && ow.kind === "inner") continue;
      const ol = linesOf(ow);
      const targetPoly = T === "main" ? ol.mainCorners : T === "help" ? ol.helpCorners : ol.subCorners;
      const p = intersectRayWithPoly(origin, dir, targetPoly);
      if (!p) continue;
      const d = dist(origin, p);
      if (d < idealAbs) {
        idealAbs = d;
        ideal = p;
        idealSignedT = (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
      }
    }
    if (!ideal) continue;

    // --- Phase 2: Blockade durch höhere Priorität auf dem Pfad origin → ideal ---
    let endpoint: Vec2 = ideal;
    let endpointAbs = idealAbs;
    const idealSign = Math.sign(idealSignedT) || 1;

    for (const ow of candidates) {
      const ol = linesOf(ow);
      const tryBlock = (linePoly: Vec2[], otherType: LineType) => {
        const op = priorityOf(ow.kind, otherType);
        if (op >= ownPrio) return; // nur strikt höhere Priorität blockiert
        const p = intersectRayWithPoly(origin, dir, linePoly);
        if (!p) return;
        const tP = (p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y;
        if (Math.sign(tP) !== idealSign) return;             // muss in Richtung Ideal liegen
        if (Math.abs(tP) >= Math.abs(idealSignedT)) return;  // nur VOR dem Ideal kappen
        const d = dist(origin, p);
        if (d < endpointAbs) {
          endpointAbs = d;
          endpoint = p;
        }
      };
      tryBlock(ol.mainCorners, "main");
      tryBlock(ol.helpCorners, "help");
      tryBlock(ol.subCorners, "sub");
    }

    polysSelf[T][idx] = endpoint;
    healedAny = true;
  }

  return healedAny;
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

/**
 * Sucht nächstgelegenen Schnittpunkt der durch (p, dir) definierten Geraden mit
 * den Segmenten der Polylinie. Segmente werden als unendliche Geraden behandelt
 * (für Mitren-Verlängerung „virtueller Vollverbindung").
 */
function intersectRayWithPoly(p: Vec2, dir: Vec2, poly: Vec2[]): Vec2 | null {
  let best: Vec2 | null = null;
  let bestAbs = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const segDir = sub(b, a);
    const ip = lineLineIntersectionInfinite(p, dir, a, segDir);
    if (!ip) continue;
    const d = Math.hypot(ip.x - p.x, ip.y - p.y);
    if (d < bestAbs) { bestAbs = d; best = ip; }
  }
  return best;
}
