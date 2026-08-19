import { Vec2, v, sub, norm, lineLineIntersectionInfinite, dist } from "./geometry";
import { computeWallLines, wallRefCorners } from "./wallGeom";
import type { Wall } from "./Scene";
import { WallTopologyGraph, CLEANUP_TOL, endpointLineCorners, priorityIndex } from "./WallTopologyGraph";

const HEAL_TOL_M = 0.05;
/**
 * Phase 4 — Stabilisierung: Maximale Heal-Distanz, jenseits derer ein
 * Schnitt mit der gleichnamigen Linie eines Nachbarn als unrealistisch
 * verworfen wird. Verhindert "explodierende" Verlängerungen bei sehr spitzen
 * Winkeln (Strahl ist fast parallel zum Nachbarn → Treffpunkt extrem weit).
 */
const HEAL_MAX_DIST_M = 30.0;
type LineType = "main" | "help" | "sub";
type WallLines = ReturnType<typeof computeWallLines>;

/**
 * Phase 2: Heal nutzt globalen Topologie-Graph (wenn übergeben), sonst Fallback
 * auf paarweisen Modus. Zusätzlich Cleanup-Pass: Mikro-Lücken zwischen
 * gleichnamigen Linien-Endpunkten am gleichen Knoten werden auf den Endpunkt
 * der höchstpriorisierten inzidenten Wand gesnappt.
 */
export function computeHealedWallLines(wallInput: Wall, others: Wall[], graph?: WallTopologyGraph) {
  const refCorners = wallRefCorners(wallInput as any);
  const wall: Wall = refCorners === wallInput.corners
    ? wallInput
    : (Object.assign(Object.create(Object.getPrototypeOf(wallInput)), wallInput, { corners: refCorners }) as Wall);
  const lines = computeWallLines(wall.corners, wall.thicknessM, wall.referenceSide);
  if (wall.corners.length < 2) return { ...lines, capStart: true, capEnd: true };

  const mainCorners = lines.mainCorners.map(p => v(p.x, p.y));
  const subCorners = lines.subCorners.map(p => v(p.x, p.y));
  const helpCorners = lines.helpCorners.map(p => v(p.x, p.y));

  const rawBulges: number[] = Array.isArray((wallInput as any).bulges) ? (wallInput as any).bulges : [];
  const nRaw = wallInput.corners.length;
  const startBulge = Math.abs(rawBulges[0] || 0);
  const endBulge = Math.abs(rawBulges[Math.max(0, nRaw - 2)] || 0);

  const symMain = { start: false, end: false };
  const capStart = !healEnd(wall, others, mainCorners, subCorners, helpCorners, true, graph, startBulge, symMain);
  const capEnd = !healEnd(wall, others, mainCorners, subCorners, helpCorners, false, graph, endBulge, symMain);

  // Cleanup-Pass: gleicher Knoten → gleichnamige Linien zusammenführen.
  if (graph) cleanupAtNodes(wall, mainCorners, subCorners, helpCorners, graph, others, symMain);

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
  endBulgeMag: number = 0,
  symMain?: { start: boolean; end: boolean },
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
    if (!l) { l = computeWallLines(wallRefCorners(ow as any), ow.thicknessM, ow.referenceSide); cache.set(ow, l); }
    return l;
  };

  const polysSelf: Record<LineType, Vec2[]> = {
    main: mainCorners,
    help: helpCorners,
    sub: subCorners,
  };

  let healedAny = false;

  // Phase 6 — gewölbte Wände: Die Gehrung darf nur um ein sinnvolles Maß
  // (abhängig von den beteiligten Wanddicken) verlängert werden. Sonst
  // "reißt" die Sub-Linie bei stark gewölbten Wänden weit vom Knoten weg und
  // die optische Wand verlässt die Fangpunkte.
  let maxNeighborThickness = 0;
  for (const c of candidates) maxNeighborThickness = Math.max(maxNeighborThickness, c.thicknessM || 0);
  // Krümmungsabhängig: bei gewölbten Wänden laufen die End-Tangenten stärker
  // auseinander, echte Gehrungen liegen dann weiter draußen.
  const healLimit = (wall.thicknessM + maxNeighborThickness) * 2 * (1 + endBulgeMag) + HEAL_TOL_M;

  /**
   * Rückfall-Punkt für Help-/Sublinien: Mittelwert der gleichnamigen rohen
   * Linien-Endpunkte aller am Knoten hängenden Wände (inkl. eigener). Da alle
   * beteiligten Wände denselben Mittelwert berechnen, treffen sich die Linien
   * exakt — auch bei starker Wölbung, wo keine sinnvolle Gehrung existiert.
   */
  const nodeMeetPoint = (T: LineType, origin: Vec2): Vec2 | null => {
    if (!node) return null;
    let sx = origin.x, sy = origin.y, count = 1;
    for (const inc of node.incidents) {
      if (inc.wallId === wall.id) continue;
      if (inc.kind === "tjunction") continue;
      const ow = others.find(w => w.id === inc.wallId);
      if (!ow || ow.corners.length < 2) continue;
      const isStart = inc.kind === "start";
      const c = endpointLineCorners(ow, isStart);
      const p = T === "main" ? c.main : T === "help" ? c.help : c.sub;
      sx += p.x; sy += p.y; count++;
    }
    if (count < 2) return null;
    return v(sx / count, sy / count);
  };

  /**
   * Symmetrische Gehrung für Help-/Sublinien an reinen Endpunkt-Knoten:
   * Schnitt der beiden End-Tangenten der gleichnamigen Offset-Linien beider
   * Wände. Beide Nachbarn berechnen exakt dieselbe Geometrie → sie treffen
   * sich zwangsläufig, auch wenn die Linien gewölbt sind (der einseitige
   * Strahl-gegen-Kurve-Schnitt liefert dagegen zwei verschiedene Punkte).
   */
  const symmetricMiter = (T: LineType, origin: Vec2): Vec2 | null => {
    if (!node) return null;
    if (node.incidents.some(i => i.wallId !== wall.id && i.kind === "tjunction")) return null;
    let best: Vec2 | null = null;
    let bestAbs = Infinity;
    for (const inc of node.incidents) {
      if (inc.wallId === wall.id || inc.kind === "tjunction") continue;
      const ow = others.find(w => w.id === inc.wallId);
      if (!ow || ow.corners.length < 2) continue;
      // Nur die Hauptlinie respektiert die Priorität. Help-/Sublinien MÜSSEN
      // auf beiden Seiten dieselbe Geometrie berechnen, sonst driften die
      // gegenüberliegenden Kanten (besonders bei Wölbung) auseinander.
      if (T === "main" && ow.priority < wall.priority) continue;
      const isStart = inc.kind === "start";
      const c = endpointLineCorners(ow, isStart);
      const op = T === "main" ? c.main : T === "help" ? c.help : c.sub;
      const oc = wallRefCorners(ow as any);
      const od = isStart
        ? norm(sub(oc[1], oc[0]))
        : norm(sub(oc[oc.length - 1], oc[oc.length - 2]));
      const ip = lineLineIntersectionInfinite(origin, dir, op, od);
      if (!ip) continue;
      // Grenzwert symmetrisch bilden: beide Wände müssen dieselbe
      // Annahme/Verwerfung treffen, sonst reißt eine Seite ab.
      const ob: number[] = Array.isArray((ow as any).bulges) ? (ow as any).bulges : [];
      const owBulge = Math.abs((isStart ? ob[0] : ob[Math.max(0, ow.corners.length - 2)]) || 0);
      // Enger Grenzwert: bei stark gewölbten Nachbarn liegt der Tangenten-
      // Schnitt weit außerhalb des Knotens. Solche "Ausreißer" würden den
      // Wandkörper meterweit in den Raum ziehen (Schraffur-Autofüllung
      // erkennt den Raum dann als Wand). Statt dessen greift der
      // nodeMeetPoint-Fallback direkt am Knoten.
      const pairLimit = (wall.thicknessM + (ow.thicknessM || 0)) * 2
        * (1 + Math.max(endBulgeMag, owBulge)) + HEAL_TOL_M;
      const a = Math.max(dist(origin, ip), dist(op, ip));
      if (a > pairLimit) continue;
      if (a < bestAbs) { bestAbs = a; best = ip; }
    }
    return best || nodeMeetPoint(T, origin);
  };

  for (const T of ["main", "help", "sub"] as LineType[]) {
    const origin = polysSelf[T][idx];

    {
      // Symmetrische Gehrung zuerst — sie liefert für beide Nachbarwände
      // identische Punkte und schließt damit Lücken auch bei Wölbung.
      const pair = symmetricMiter(T, origin);
      if (pair) {
        polysSelf[T][idx] = pair;
        healedAny = true;
        if (T === "main" && symMain) {
          if (atStart) symMain.start = true; else symMain.end = true;
        }
        continue;
      }
    }


    // Phase 1: ideale Zielposition über alle Kandidaten (gleichnamige Linie).
    // Phase 4: Distanz-Cap (HEAL_MAX_DIST_M) verhindert Ausreißer bei spitzen
    // Winkeln; der gleichnamige Schnitt bestimmt echte Verlängerung/Kürzung.
    let ideal: Vec2 | null = null;
    let idealAbs = Infinity;
    for (const ow of candidates) {
      // Wand mit niedrigerer Priorität darf eine höher priorisierte nicht stutzen.
      if (ow.priority < wall.priority) continue;
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
    if (!ideal) {
      // Kein gleichnamiger Schnitt (z. B. parallele Tangenten bei Wölbung):
      // Help/Sub am gemeinsamen Knoten zusammenführen statt offen lassen.
      if (T !== "main") {
        const meet = nodeMeetPoint(T, origin);
        if (meet) { polysSelf[T][idx] = meet; healedAny = true; }
      }
      continue;
    }

    // Phase 5 (ArchiCAD-Verhalten): Beide Bezugslinien (main UND sub) jeder
    // Nachbarwand sind harte Grenzen — die neue Wand stoppt an der zugewandten
    // Kante der bestehenden Wand. Der nächstgelegene Treffer gewinnt,
    // unabhängig von der Strahl-Seite.
    //
    // ABER: An einem reinen Endpunkt-zu-Endpunkt-Knoten (alle anderen
    // inzidenten Wände hängen mit IHREM Endpunkt am selben Knoten und kein
    // T-Stoß ist beteiligt) ist die Klemmung schädlich: die Nachbar-main
    // endet exakt im geteilten Eckpunkt und liegt damit zwangsläufig näher
    // am Origin als der korrekte Sub-Gehrungspunkt → sie würde die Sub-
    // Verlängerung zurück auf die Ecke ziehen und die gegenüberliegende
    // Kante nicht mitern. In dem Fall: Klemmung überspringen.
    if (T !== "main") {
      let tjunctionIds: Set<string> | null = null;
      if (node) {
        const tj = node.incidents.filter(i => i.wallId !== wall.id && i.kind === "tjunction");
        if (tj.length > 0) tjunctionIds = new Set(tj.map(i => i.wallId));
      }
      const skipClamp = node != null && tjunctionIds === null;
      if (!skipClamp) {
        const clampPool = tjunctionIds
          ? candidates.filter(c => tjunctionIds!.has(c.id))
          : candidates;
        const idealT = (ideal.x - origin.x) * dir.x + (ideal.y - origin.y) * dir.y;
        let clampAbs = Math.abs(idealT);
        let clamped: Vec2 | null = null;
        for (const ow of clampPool) {
          if (ow.priority < wall.priority) continue;
          const ol = linesOf(ow);
          for (const boundary of [ol.mainCorners, ol.subCorners]) {
            const p = intersectRayWithPoly(origin, dir, boundary);
            if (!p) continue;
            const a = Math.abs((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y);
            if (a < clampAbs - 1e-9) {
              clampAbs = a;
              clamped = p;
            }
          }
        }
        if (clamped) ideal = clamped;
      }
    }

    // Bevel-Begrenzung: zu weite Gehrungen nicht stumpf abschneiden, sondern
    // Help/Sub am Knoten zusammenführen (sonst entsteht dort eine Lücke).
    {
      const tAlong = (ideal.x - origin.x) * dir.x + (ideal.y - origin.y) * dir.y;
      if (Math.abs(tAlong) > healLimit) {
        const meet = T !== "main" ? nodeMeetPoint(T, origin) : null;
        if (meet) {
          ideal = meet;
        } else {
          const s = tAlong >= 0 ? healLimit : -healLimit;
          ideal = v(origin.x + dir.x * s, origin.y + dir.y * s);
        }
      }
    }

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
  symMain?: { start: boolean; end: boolean },
) {
  const polys: Record<LineType, Vec2[]> = { main: mainCorners, help: helpCorners, sub: subCorners };
  for (const atStart of [true, false]) {
    const node = graph.getNodeForEndpoint(wall.id, atStart);
    if (!node) continue;
    // Bereits symmetrisch gemitert → nicht zurück auf Rohpunkte snappen.
    if (symMain && (atStart ? symMain.start : symMain.end)) continue;
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
 * Schnitt der End-Tangente mit einer Polylinie. `dir` zeigt in die Wand hinein;
 * gültige Gehrungspunkte können je nach Außenecke/Innenecke vor oder hinter
 * dem Origin liegen. Deshalb wird der nächstgelegene unsignierte Schnitt gewählt.
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
