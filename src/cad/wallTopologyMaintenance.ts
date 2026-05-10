import { Vec2, v, sub, norm, dist } from "./geometry";
import type { Scene, Wall } from "./Scene";

/**
 * Phase 3 — Wand-Topologie-Wartung
 *
 *   1. Auto-Split (S4): Endet ein Wand-Endpunkt strikt im Inneren der Bezugslinie
 *      einer anderen Wand UND geht jene Wand hinter dem Treffpunkt in eine dritte
 *      Wand über (Endpunkt-Konvergenz mit weiterer Wand), wird die getroffene
 *      Wand am Treffpunkt gesplittet.
 *
 *   2. Auto-Merge (inverse): Treffen sich an einem Knoten genau zwei Wand-
 *      Endpunkte (keine T-Stöße, keine dritte Wand) UND sind die Wände kollinear
 *      mit identischen Eigenschaften, werden sie zu einer einzelnen Wand
 *      verschmolzen.
 *
 * Beide Operationen sind idempotent: Nach Anwendung erzeugen sie keine neuen
 * Treffer; eine begrenzte Iteration deckt Mehrfachfälle in einem Pass ab.
 */

const HIT_TOL = 0.02;            // Endpunkt liegt auf Edge dieser Distanz
const NODE_TOL = 0.05;           // Endpunkt-Cluster (analog WallTopologyGraph.NODE_TOL)
const COLLINEAR_DOT = 0.9998;    // ~1.15° Abweichung erlaubt
const MIN_SEG_LEN_M = 0.01;
const MAX_PASSES = 4;

export function runWallTopologyMaintenance(scene: Scene, focusWalls?: Wall[]): boolean {
  let anyChange = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const split = runAutoSplit(scene, focusWalls);
    const merged = runAutoMerge(scene);
    if (!split && !merged) break;
    anyChange = anyChange || split || merged;
    // Nach Split/Merge nicht mehr auf focusWalls beschränken — Folgewellen frei.
    focusWalls = undefined;
  }
  if (anyChange) scene.markWallsDirty();
  return anyChange;
}

/** S4: T-Stoß-Split. Liefert true wenn mindestens ein Split passiert ist. */
function runAutoSplit(scene: Scene, focusWalls?: Wall[]): boolean {
  let changed = false;
  // Snapshot, da scene.walls mutiert wird.
  const drivers = (focusWalls ?? scene.walls).slice();
  for (const driver of drivers) {
    if (!scene.walls.includes(driver)) continue;
    if (driver.corners.length < 2) continue;
    const endpoints: Vec2[] = [
      driver.corners[0],
      driver.corners[driver.corners.length - 1],
    ];
    for (const ep of endpoints) {
      const others = scene.walls.filter(w => w !== driver);
      for (const ow of others) {
        if (!scene.walls.includes(ow)) continue;
        const hit = findInteriorHit(ow, ep, HIT_TOL);
        if (!hit) continue;
        // Phase 4 (T-Stoß): Jeder Endpunkt-im-Inneren-Treffer splittet die
        // getroffene Wand. Dadurch entsteht am Treffpunkt ein echter Knoten,
        // an dem Heal+Cleanup alle drei Wände sauber mitern können —
        // notwendige Voraussetzung u.a. für künftige mehrschichtige Wände.
        const split = scene.splitWallAt(ow, ep, MIN_SEG_LEN_M);
        if (split) {
          split[1].labelId = ow.labelId;
          changed = true;
        }
      }
    }
  }
  return changed;
}

/** Inverse: kollineare Endpunkt-Paare ohne dritten Nachbar verschmelzen. */
function runAutoMerge(scene: Scene): boolean {
  // Cluster aller Endpunkte sammeln.
  type EP = { wall: Wall; atStart: boolean; p: Vec2 };
  const eps: EP[] = [];
  for (const w of scene.walls) {
    if (w.corners.length < 2) continue;
    eps.push({ wall: w, atStart: true, p: w.corners[0] });
    eps.push({ wall: w, atStart: false, p: w.corners[w.corners.length - 1] });
  }
  const clusters: EP[][] = [];
  const taken = new Array(eps.length).fill(false);
  for (let i = 0; i < eps.length; i++) {
    if (taken[i]) continue;
    const cluster: EP[] = [eps[i]];
    taken[i] = true;
    for (let j = i + 1; j < eps.length; j++) {
      if (taken[j]) continue;
      if (dist(eps[i].p, eps[j].p) <= NODE_TOL) { cluster.push(eps[j]); taken[j] = true; }
    }
    clusters.push(cluster);
  }
  for (const cluster of clusters) {
    if (cluster.length !== 2) continue;
    const [a, b] = cluster;
    if (a.wall === b.wall) continue;
    if (!sameWallProps(a.wall, b.wall)) continue;
    // Kein T-Stoß einer dritten Wand auf dem gemeinsamen Punkt.
    if (anyOtherWallPassesNear(scene, a.p, [a.wall, b.wall])) continue;
    if (!collinearAtJoin(a, b)) continue;
    // Verschmelzen: gerichtete Polylinien so verbinden, dass am Knoten der Übergang
    // sauber ist. Ergebnis-Reihenfolge: A's "freie" Seite → join → B's "freie" Seite.
    const cornersA = a.atStart ? [...a.wall.corners].reverse() : [...a.wall.corners];
    const cornersB = b.atStart ? [...b.wall.corners] : [...b.wall.corners].reverse();
    // cornersA endet am Knoten, cornersB beginnt am Knoten — ersten Punkt von B
    // weglassen, da identisch mit Ende von A.
    const merged = cornersA.concat(cornersB.slice(1)).map(p => v(p.x, p.y));
    if (merged.length < 2) continue;
    // Ursprungs-Wand A behält id und Eigenschaften, B wird entfernt.
    a.wall.corners = merged;
    scene.removeWall(b.wall);
    return true; // Nach Mutation neu starten (Cluster-Indizes sind ungültig).
  }
  return false;
}

function findInteriorHit(w: Wall, p: Vec2, tol: number): { edgeIndex: number; t: number; pos: Vec2; cumStart: number; total: number } | null {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < w.corners.length - 1; i++) {
    const L = dist(w.corners[i], w.corners[i + 1]);
    segLens.push(L); total += L;
  }
  let best: { edgeIndex: number; t: number; pos: Vec2; cumStart: number; total: number; d: number } | null = null;
  let cum = 0;
  for (let i = 0; i < w.corners.length - 1; i++) {
    const a = w.corners[i], b = w.corners[i + 1];
    const ab = sub(b, a);
    const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-12;
    let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / ab2;
    if (t > 0.02 && t < 0.98) {
      const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= tol && (!best || d < best.d)) best = { edgeIndex: i, t, pos: v(q.x, q.y), cumStart: cum, total, d };
    }
    cum += segLens[i];
  }
  return best;
}

/* continuesToThirdWall entfernt: T-Stöße splitten jetzt unbedingt. */
  return (
    a.kind === b.kind &&
    a.referenceSide === b.referenceSide &&
    Math.abs(a.thicknessM - b.thicknessM) < 1e-6 &&
    a.labelId === b.labelId &&
    a.color === b.color &&
    a.fillColor === b.fillColor &&
    a.customName === b.customName &&
    (a._stickerEditOwnerId || null) === (b._stickerEditOwnerId || null)
  );
}

function anyOtherWallPassesNear(scene: Scene, p: Vec2, exclude: Wall[]): boolean {
  for (const w of scene.walls) {
    if (exclude.includes(w)) continue;
    if (w.corners.length < 2) continue;
    // Endpunkt-Treffer
    if (dist(w.corners[0], p) <= NODE_TOL) return true;
    if (dist(w.corners[w.corners.length - 1], p) <= NODE_TOL) return true;
    // T-Stoß auf einer Edge
    for (let i = 0; i < w.corners.length - 1; i++) {
      const a = w.corners[i], b = w.corners[i + 1];
      const ab = sub(b, a);
      const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-12;
      let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / ab2;
      if (t < 0.02 || t > 0.98) continue;
      const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      if (Math.hypot(q.x - p.x, q.y - p.y) <= NODE_TOL) return true;
    }
  }
  return false;
}

/**
 * Kollinearitäts-Check am gemeinsamen Knoten: die zur Verbindung "einlaufenden"
 * Tangenten von A (Richtung Knoten hin) und B (Richtung vom Knoten weg) müssen
 * nahezu identisch sein, damit nach Merge keine Knickkante an der Naht entsteht.
 */
function collinearAtJoin(a: { wall: Wall; atStart: boolean }, b: { wall: Wall; atStart: boolean }): boolean {
  const dirInto = endpointTangent(a.wall, a.atStart, /*intoNode=*/true);
  const dirOut = endpointTangent(b.wall, b.atStart, /*intoNode=*/false);
  if (!dirInto || !dirOut) return false;
  const dot = dirInto.x * dirOut.x + dirInto.y * dirOut.y;
  return dot >= COLLINEAR_DOT;
}

function endpointTangent(w: Wall, atStart: boolean, intoNode: boolean): Vec2 | null {
  const n = w.corners.length;
  if (n < 2) return null;
  let from: Vec2, to: Vec2;
  if (atStart) {
    // Knoten = corners[0]
    from = w.corners[1]; to = w.corners[0];
  } else {
    from = w.corners[n - 2]; to = w.corners[n - 1];
  }
  const d = norm(sub(to, from));
  if (d.x === 0 && d.y === 0) return null;
  return intoNode ? d : v(-d.x, -d.y);
}
