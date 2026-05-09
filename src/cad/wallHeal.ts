import { Vec2, v, sub, norm, lineLineIntersectionInfinite, dist } from "./geometry";
import { computeWallLines } from "./wallGeom";
import type { Wall, WallKind } from "./Scene";
import { WallTopologyGraph, CLEANUP_TOL, endpointLineCorners, priorityIndex } from "./WallTopologyGraph";

const HEAL_TOL_M = 0.05;
/**
 * Phase 4 — Stabilisierung: Maximale Heal-Distanz, jenseits derer ein
 * Schnitt mit der gleichnamigen Linie eines Nachbarn als unrealistisch
 * verworfen wird. Verhindert "explodierende" Verlängerungen bei sehr spitzen
 * Winkeln (Strahl ist fast parallel zum Nachbarn → Treffpunkt extrem weit).
 */
const HEAL_MAX_DIST_M = 5.0;
type LineType = "main" | "help" | "sub";
type WallLines = ReturnType<typeof computeWallLines>;

function priorityOf(kind: WallKind, t: LineType): number {
  return priorityIndex(kind, t);
}

/**
 * Phase 2: Heal nutzt globalen Topologie-Graph (wenn übergeben), sonst Fallback
 * auf paarweisen Modus. Zusätzlich Cleanup-Pass: Mikro-Lücken zwischen
 * gleichnamigen Linien-Endpunkten am gleichen Knoten werden auf den Endpunkt
 * der höchstpriorisierten inzidenten Wand gesnappt.
 */
export function computeHealedWallLines(wall: Wall, others: Wall[], graph?: WallTopologyGraph) {
  const lines = computeWallLines(wall.corners, wall.thicknessM, wall.referenceSide);
  if (wall.corners.length < 2) return { ...lines, capStart: true, capEnd: true };

  const mainCorners = lines.mainCorners.map(p => v(p.x, p.y));
  const subCorners = lines.subCorners.map(p => v(p.x, p.y));
  const helpCorners = lines.helpCorners.map(p => v(p.x, p.y));

  const capStart = !healEnd(wall, others, mainCorners, subCorners, helpCorners, true, graph);
  const capEnd = !healEnd(wall, others, mainCorners, subCorners, helpCorners, false, graph);

  // Cleanup-Pass: gleicher Knoten → gleichnamige Linien zusammenführen.
  if (graph) cleanupAtNodes(wall, mainCorners, subCorners, helpCorners, graph, others);

  return { mainCorners, subCorners, helpCorners, capStart, capEnd };
}

function healEnd(
  wall: Wall,
  others: Wall[],
  mainCorners: Vec2[],
  subCorners: Vec2[],
  helpCorners: Vec2[],
  atStart: boolean,
  graph?: WallTopologyGraph,
): boolean {
  const n = wall.corners.length;
  if (n < 2) return false;

  const idx = atStart ? 0 : mainCorners.length - 1;
  const corner = atStart ? wall.corners[0] : wall.corners[n - 1];
  const dir = atStart
    ? norm(sub(wall.corners[1], wall.corners[0]))
    : norm(sub(wall.corners[n - 1], wall.corners[n - 2]));
  if (dir.x === 0 && dir.y === 0) return false;

  // Kandidaten: aus Graph (nur inzidente Wände am Knoten) — sonst alle nahen anderen.
  const node = graph?.getNodeForEndpoint(wall.id, atStart) || null;
  let candidates: Wall[] = [];
  if (node) {
    const ids = new Set(node.incidents.filter(i => i.wallId !== wall.id).map(i => i.wallId));
    candidates = others.filter(w => ids.has(w.id));
  }
  if (candidates.length === 0) {
    for (const ow of others) {
      if (ow === wall) continue;
      if (!pointNearPolyline(corner, ow.corners, HEAL_TOL_M + Math.max(ow.thicknessM, wall.thicknessM))) continue;
      candidates.push(ow);
    }
  }
  if (candidates.length === 0) return false;

  const cache = new Map<Wall, WallLines>();
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

    // Phase 1: ideale Zielposition über alle Kandidaten (gleichnamige Linie).
    // Phase 4: Distanz-Cap (HEAL_MAX_DIST_M) verhindert Ausreißer bei spitzen
    // Winkeln; der gleichnamige Schnitt bestimmt echte Verlängerung/Kürzung.
    let ideal: Vec2 | null = null;
    let idealAbs = Infinity;
    for (const ow of candidates) {
      if (wall.kind === "outer" && ow.kind === "inner") continue;
      const ol = linesOf(ow);
      const targetPoly = T === "main" ? ol.mainCorners : T === "help" ? ol.helpCorners : ol.subCorners;
      const p = intersectRayWithPoly(origin, dir, targetPoly);
      if (!p) continue;
      const d = dist(origin, p);
      if (d > HEAL_MAX_DIST_M) continue;
      if (d < idealAbs) {
        idealAbs = d;
        ideal = p;
      }
    }
    if (!ideal) continue;

    // Gleichnamige Linien müssen sich am Stoß wirklich treffen. Eine frühere
    // Prioritäts-Blockade schnitt sub/help an main/help des Nachbarn ab; dadurch
    // blieben sie faktisch auf Bezugslinien-Länge. Deshalb wird hier der echte
    // gleichnamige Schnittpunkt direkt übernommen.
    polysSelf[T][idx] = ideal;
    healedAny = true;
  }

  return healedAny;
}

/**
 * Cleanup-Pass: an jedem Knoten, an dem die Wand mit einem Endpunkt hängt,
 * alle gleichnamigen Linien-Endpunkte (main/help/sub) der inzidenten Wände
 * vergleichen. Liegen Endpunkte innerhalb CLEANUP_TOL beieinander, wird der
 * Endpunkt der niedrigeren Priorität auf den der höchsten Priorität gesetzt
 * (Wand nur lokal verändert; Nachbarn werden in deren eigenem Heal-Lauf gleich
 * behandelt → konvergent, da Prio-Reihenfolge deterministisch ist).
 */
function cleanupAtNodes(
  wall: Wall,
  mainCorners: Vec2[],
  subCorners: Vec2[],
  helpCorners: Vec2[],
  graph: WallTopologyGraph,
  others: Wall[],
) {
  const polys: Record<LineType, Vec2[]> = { main: mainCorners, help: helpCorners, sub: subCorners };
  for (const atStart of [true, false]) {
    const node = graph.getNodeForEndpoint(wall.id, atStart);
    if (!node) continue;
    const idx = atStart ? 0 : mainCorners.length - 1;
    const ownPrio = (T: LineType) => priorityIndex(wall.kind, T);

    for (const T of ["main", "help", "sub"] as LineType[]) {
      // Sub-/Hilfslinien werden bereits über echte gleichnamige Schnitte geheilt.
      // Der Cleanup darf sie nicht zurück auf rohe Bezugslinien-Endlänge snappen.
      if (T !== "main") continue;
      const ownP = ownPrio(T);
      let bestPrio = ownP;
      let bestPoint: Vec2 = polys[T][idx];
      let bestWallId: string | null = null;
      for (const inc of node.incidents) {
        if (inc.wallId === wall.id) continue;
        // Nur "echte" Endpunkt-Inzidenzen — T-Stöße haben keine gleichnamige
        // Endpunkt-Position am Knoten.
        if (inc.kind === "tjunction") continue;
        const ow = others.find(w => w.id === inc.wallId);
        if (!ow) continue;
        const op = priorityIndex(ow.kind, T);
        for (const isStart of [true, false]) {
          const corners = endpointLineCorners(ow, isStart);
          const otherPoint = T === "main" ? corners.main : T === "help" ? corners.help : corners.sub;
          if (dist(otherPoint, polys[T][idx]) > CLEANUP_TOL) continue;
          // Phase 4: Strikt höhere Prio gewinnt; bei Gleichprio (4+ Wände
          // gleicher Art am Knoten) deterministisch über kleinste wallId
          // tie-breaken, damit alle inzidenten Wände konvergieren.
          const isBetter =
            op < bestPrio ||
            (op === bestPrio && op < ownP &&
              (bestWallId === null || ow.id < bestWallId));
          if (isBetter) {
            bestPrio = op;
            bestPoint = otherPoint;
            bestWallId = ow.id;
          } else if (op === ownP && bestWallId === null && ow.id < wall.id) {
            // Gleichprio mit eigener Wand: kleinste id im Cluster gewinnt.
            bestPrio = op;
            bestPoint = otherPoint;
            bestWallId = ow.id;
          }
        }
      }
      if (bestWallId !== null) polys[T][idx] = v(bestPoint.x, bestPoint.y);
    }
  }
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
 * Phase 4: Strahl-Polylinien-Schnitt. `dir` ist die Tangente am Eckpunkt
 * (zeigt in die Wand hinein); ein gültiger Heal-Treffer kann je nach Linientyp
 * sowohl vor als auch hinter dem Origin liegen (Außeneck vs. Innenneck).
 * Daher unsignierte Distanz minimieren — die Vorzeichen-Konsistenz beim
 * Blockade-Check (Phase 2) wird separat über `idealSign` geprüft.
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
