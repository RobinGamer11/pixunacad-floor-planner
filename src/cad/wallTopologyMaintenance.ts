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
    const cleaned = runHiddenCornerCleanup(scene);
    const merged = runAutoMerge(scene);
    if (!split && !merged && !cleaned) break;
    anyChange = anyChange || split || merged || cleaned;
    // Nach Split/Merge nicht mehr auf focusWalls beschränken — Folgewellen frei.
    focusWalls = undefined;
  }
  if (anyChange) scene.markWallsDirty();
  return anyChange;
}

/**
 * Entfernt verwaiste T-Stoß-Hilfspunkte: Hidden-Corners, an denen keine andere
 * Wand mehr mit einem Endpunkt andockt, sind topologisch bedeutungslos und
 * werden inklusive Eckpunkt aus der Wand entfernt. Wird z. B. nötig, wenn die
 * andockende Wand verschoben/gedreht/gelöscht wurde und der T-Stoß sich auflöst.
 */
function runHiddenCornerCleanup(scene: Scene): boolean {
  let changed = false;
  for (const wall of scene.walls) {
    const hidden = wall.hiddenCornerIndices;
    if (!hidden || hidden.length === 0) continue;
    // Verwaiste Indizes ermitteln (kein anderer Wand-Endpunkt am Punkt).
    const stale = new Set<number>();
    for (const idx of hidden) {
      if (idx <= 0 || idx >= wall.corners.length - 1) { stale.add(idx); continue; }
      const p = wall.corners[idx];
      let docked = false;
      for (const ow of scene.walls) {
        if (ow === wall) continue;
        if (ow.corners.length < 2) continue;
        if (dist(ow.corners[0], p) <= NODE_TOL || dist(ow.corners[ow.corners.length - 1], p) <= NODE_TOL) {
          docked = true; break;
        }
      }
      if (!docked) stale.add(idx);
    }
    if (stale.size === 0) continue;
    // Eckpunkte entfernen (von hinten nach vorn) und Hidden-Indizes anpassen.
    const sortedStale = [...stale].sort((a, b) => b - a);
    for (const idx of sortedStale) {
      wall.corners.splice(idx, 1);
    }
    // Hidden-Indizes neu mappen: stale weg, höhere Indizes um Anzahl entfernter Vorgänger verringern.
    wall.hiddenCornerIndices = (wall.hiddenCornerIndices || [])
      .filter(i => !stale.has(i))
      .map(i => i - sortedStale.filter(s => s < i).length);
    changed = true;
  }
  return changed;
}


/**
 * Auto-Split: Endet ein Wand-Endpunkt strikt im Inneren einer fremden
 * Bezugslinie, wird die getroffene Wand am Treffpunkt gesplittet. So entsteht
 * im Topologie-Graph ein echter T-Knoten — Anschluss-Logik & Union arbeiten
 * dann auf gemeinsamen Bezugslinien-Endpunkten statt auf T-Stoß-Inzidenzen.
 */
function runAutoSplit(scene: Scene, focusWalls?: Wall[]): boolean {
  const targets = focusWalls && focusWalls.length > 0 ? focusWalls : scene.walls;
  for (const moving of targets) {
    if (moving.corners.length < 2) continue;
    for (const atStart of [true, false]) {
      const p = atStart ? moving.corners[0] : moving.corners[moving.corners.length - 1];
      for (const host of scene.walls) {
        if (host === moving) continue;
        if (host.corners.length < 2) continue;
        // Endpunkt-Cluster: nur splitten, wenn p NICHT bereits ein Endpunkt von host ist.
        if (dist(host.corners[0], p) <= NODE_TOL) continue;
        if (dist(host.corners[host.corners.length - 1], p) <= NODE_TOL) continue;
        const hit = findInteriorHit(host, p, HIT_TOL);
        if (!hit) continue;
        // Auch interne Eckpunkte von host nicht versehentlich verdoppeln.
        let nearExistingCorner = false;
        for (const c of host.corners) {
          if (dist(c, hit.pos) <= NODE_TOL) { nearExistingCorner = true; break; }
        }
        if (nearExistingCorner) continue;
        // Split: neuen Corner am Treffpunkt in host.corners einfügen.
        host.corners = [
          ...host.corners.slice(0, hit.edgeIndex + 1),
          v(hit.pos.x, hit.pos.y),
          ...host.corners.slice(hit.edgeIndex + 1),
        ];
        host.hiddenCornerIndices = [
          ...(host.hiddenCornerIndices || []).map(i => i > hit.edgeIndex ? i + 1 : i),
          hit.edgeIndex + 1,
        ];
        // Mikro-Segmente vermeiden.
        if (dist(host.corners[hit.edgeIndex], host.corners[hit.edgeIndex + 1]) < MIN_SEG_LEN_M) {
          host.corners.splice(hit.edgeIndex + 1, 1);
          host.hiddenCornerIndices = (host.hiddenCornerIndices || [])
            .filter(i => i !== hit.edgeIndex + 1)
            .map(i => i > hit.edgeIndex + 1 ? i - 1 : i);
        }
        return true;
      }
    }
  }
  return false;
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
    a.wall.hiddenCornerIndices = [];
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

function sameWallProps(a: Wall, b: Wall): boolean {
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
