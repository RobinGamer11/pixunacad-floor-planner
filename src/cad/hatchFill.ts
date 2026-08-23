/**
 * Flood-Fill für Schraffuren.
 * Findet das kleinste geschlossene Polygon, das den Klickpunkt umschließt,
 * aus den Linien-/Wand-/Hatch-Kanten der Szene.
 *
 * Vorgehen:
 *  1) Alle Eingabe-Kanten sammeln (Segments + Wand-Achs-Polylines + Hatch-Außenringe)
 *  2) Alle Schnittpunkte berechnen und Kanten an den Schnittparametern teilen
 *  3) Half-Edge / DCEL aufbauen (zwei Darts pro ungerichteter Kante)
 *  4) An jedem Knoten ausgehende Darts nach Winkel sortieren
 *  5) Faces traversieren (Standard-Faces-via-Twins-Rotation)
 *  6) Das kleinste finite Face wählen, das den Klickpunkt enthält
 */
import { Vec2, v, dist, pointInPolygon, polygonSignedArea, polygonAreaAbs } from "./geometry";
import type { Scene } from "./Scene";
import { buildHealedWallSolidRing } from "./wallSolid";

export interface RawEdge { a: Vec2; b: Vec2; }

const COORD_QUANT = 1e-6;
const PARAM_EPS = 1e-9;

function quantKey(p: Vec2): string {
  return `${Math.round(p.x / COORD_QUANT)},${Math.round(p.y / COORD_QUANT)}`;
}

/**
 * Sammelt alle Vektorkanten der Szene, die als Füllbegrenzung gelten.
 * Wird auch von der hybriden Vektor/Raster-Analyse (`hybridFill.ts`) genutzt.
 */
export function collectBoundaryEdges(scene: Scene): RawEdge[] {
  const out: RawEdge[] = [];
  for (const seg of scene.segments) {
    if (dist(seg.a, seg.b) > 1e-7) out.push({ a: v(seg.a.x, seg.a.y), b: v(seg.b.x, seg.b.y) });
  }
  // Wände: beide Wandseiten (Außen- + Innenkontur) als Begrenzung. Dadurch
  // schnappt die Flood-Fill an die innere Wandkante und überspringt den
  // Wandkörper nicht — Räume zwischen Wänden werden korrekt umrandet.
  const wallGraph = scene.getWallTopology?.();
  for (let wi = 0; wi < scene.walls.length; wi++) {
    const w = scene.walls[wi];
    if (w.corners.length < 2) continue;
    const others = scene.walls.filter((_, i) => i !== wi);
    const ring = buildHealedWallSolidRing(w, others, wallGraph);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (dist(a, b) > 1e-7) out.push({ a: v(a.x, a.y), b: v(b.x, b.y) });
    }
  }
  for (const h of scene.hatches) {
    const pts = h.points;
    if (pts.length < 3) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (dist(a, b) > 1e-7) out.push({ a: v(a.x, a.y), b: v(b.x, b.y) });
    }
  }
  for (const s of scene.freeStrokes) {
    for (let i = 0; i < s.points.length - 1; i++) {
      const a = s.points[i], b = s.points[i + 1];
      if (dist(a, b) > 1e-7) out.push({ a: v(a.x, a.y), b: v(b.x, b.y) });
    }
  }
  return out;
}

/** Schnittpunkt zweier Segmente (in Parametern t,u ∈ (0,1) excl. Endpunkte). null wenn parallel oder nur am Endpunkt. */
function segIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): { t: number; u: number } | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: p4.x - p3.x, y: p4.y - p3.y };
  const rxs = r.x * s.y - r.y * s.x;
  if (Math.abs(rxs) < 1e-12) return null;
  const qmp = { x: p3.x - p1.x, y: p3.y - p1.y };
  const t = (qmp.x * s.y - qmp.y * s.x) / rxs;
  const u = (qmp.x * r.y - qmp.y * r.x) / rxs;
  if (t < -PARAM_EPS || t > 1 + PARAM_EPS) return null;
  if (u < -PARAM_EPS || u > 1 + PARAM_EPS) return null;
  return { t, u };
}

/** Teilt jede Eingabe-Kante an allen Schnittpunkten mit anderen Kanten. */
function subdivideEdges(edges: RawEdge[]): RawEdge[] {
  const splits: number[][] = edges.map(() => [0, 1]);
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const ix = segIntersect(edges[i].a, edges[i].b, edges[j].a, edges[j].b);
      if (!ix) continue;
      // Nur Schnittpunkte mitten in einer Kante als neue Knoten hinzufügen
      if (ix.t > PARAM_EPS && ix.t < 1 - PARAM_EPS) splits[i].push(ix.t);
      if (ix.u > PARAM_EPS && ix.u < 1 - PARAM_EPS) splits[j].push(ix.u);
    }
  }
  const out: RawEdge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const ts = Array.from(new Set(splits[i])).sort((a, b) => a - b);
    const e = edges[i];
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      const a = { x: e.a.x + (e.b.x - e.a.x) * t0, y: e.a.y + (e.b.y - e.a.y) * t0 };
      const b = { x: e.a.x + (e.b.x - e.a.x) * t1, y: e.a.y + (e.b.y - e.a.y) * t1 };
      if (dist(a, b) > 1e-7) out.push({ a, b });
    }
  }
  return out;
}

/**
 * Entfernt iterativ alle Sackgassen-Segmente (Knoten mit Grad 1).
 *
 * Läuft NACH dem Aufteilen an allen Schnittpunkten und VOR der Face-Auswahl.
 * Ein Segment, das hinter einem Schnittpunkt weiterläuft, endet zwangsläufig
 * frei und kann deshalb nie Teil eines geschlossenen Faces sein. Ohne diese
 * Bereinigung nimmt die DCEL-Traversierung solche Äste als Hin- und Rückweg
 * (Fläche 0) in die Kontur auf — die Füllung „hangelt“ sich dann optisch an
 * weiterlaufenden Linien entlang.
 */
function pruneDanglingEdges(edges: RawEdge[]): RawEdge[] {
  let cur = edges;
  for (let pass = 0; pass < 64; pass++) {
    const deg = new Map<string, number>();
    for (const e of cur) {
      const ka = quantKey(e.a), kb = quantKey(e.b);
      deg.set(ka, (deg.get(ka) ?? 0) + 1);
      deg.set(kb, (deg.get(kb) ?? 0) + 1);
    }
    const next = cur.filter((e) => (deg.get(quantKey(e.a)) ?? 0) > 1 && (deg.get(quantKey(e.b)) ?? 0) > 1);
    if (next.length === cur.length) return next;
    cur = next;
    if (cur.length === 0) return cur;
  }
  return cur;
}

interface Dart {
  id: number;
  from: number;
  to: number;
  twin: number;
  angle: number;
  next: number; // next dart in face (set in step 5)
  faceId: number;
}

function buildPlanarFaces(rawEdges: RawEdge[]): { faceLoops: Vec2[][]; verts: Vec2[] } {
  // Vertices via Quantisierung
  const vmap = new Map<string, number>();
  const verts: Vec2[] = [];
  const vid = (p: Vec2) => {
    const k = quantKey(p);
    let id = vmap.get(k);
    if (id === undefined) { id = verts.length; vmap.set(k, id); verts.push(v(p.x, p.y)); }
    return id;
  };

  const darts: Dart[] = [];
  // Adjacenz: undirected dedupe (a<b key)
  const edgeKey = new Set<string>();
  for (const e of rawEdges) {
    const ia = vid(e.a), ib = vid(e.b);
    if (ia === ib) continue;
    const k = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
    if (edgeKey.has(k)) continue;
    edgeKey.add(k);
    const d1: Dart = { id: darts.length, from: ia, to: ib, twin: -1, angle: Math.atan2(verts[ib].y - verts[ia].y, verts[ib].x - verts[ia].x), next: -1, faceId: -1 };
    darts.push(d1);
    const d2: Dart = { id: darts.length, from: ib, to: ia, twin: -1, angle: Math.atan2(verts[ia].y - verts[ib].y, verts[ia].x - verts[ib].x), next: -1, faceId: -1 };
    darts.push(d2);
    d1.twin = d2.id; d2.twin = d1.id;
  }

  // Pro Vertex: ausgehende Darts nach Winkel sortiert
  const outByVertex: number[][] = verts.map(() => []);
  for (const d of darts) outByVertex[d.from].push(d.id);
  for (const arr of outByVertex) arr.sort((a, b) => darts[a].angle - darts[b].angle);

  // Index Lookup: vertex -> Map dartId -> position in sortedList
  const indexInRing: number[] = new Array(darts.length).fill(0);
  for (let v0 = 0; v0 < outByVertex.length; v0++) {
    for (let k = 0; k < outByVertex[v0].length; k++) indexInRing[outByVertex[v0][k]] = k;
  }

  // Face-Traversierung: für jeden Dart d setze next = twin's predecessor (CW) im Ring von twin.from
  for (const d of darts) {
    const twin = darts[d.twin];
    const ring = outByVertex[twin.from];
    const idx = indexInRing[twin.id];
    const prevIdx = (idx - 1 + ring.length) % ring.length;
    d.next = ring[prevIdx];
  }

  // Faces sammeln
  const loops: Vec2[][] = [];
  const visited = new Set<number>();
  for (const start of darts) {
    if (visited.has(start.id)) continue;
    const loop: Vec2[] = [];
    let cur = start;
    let guard = 0;
    while (!visited.has(cur.id) && guard++ < darts.length * 2) {
      visited.add(cur.id);
      loop.push(v(verts[cur.from].x, verts[cur.from].y));
      cur = darts[cur.next];
    }
    if (loop.length >= 3) loops.push(loop);
  }

  return { faceLoops: loops, verts };
}

/**
 * Findet das kleinste Polygon, das den Klickpunkt enthält.
 * Rückgabe: Polygon-Punkte (CCW) oder null wenn kein geschlossener Bereich umschließt.
 */
export function findEnclosingFace(scene: Scene, click: Vec2): Vec2[] | null {
  return findEnclosingFaceFromEdges(collectBoundaryEdges(scene), click);
}

/**
 * Identische Face-Erkennung für eine beliebige Kantenmenge. Wird vom
 * Hybridpfad genutzt, damit vektorisierte Pixelgrenzen exakt dieselbe
 * planare Zerlegung durchlaufen wie echte Vektorkanten (Schnittpunkte teilen
 * Kanten in Segmente, überstehende Äste gehören zu keinem Face).
 */
export function findEnclosingFaceFromEdges(raw: RawEdge[], click: Vec2): Vec2[] | null {
  if (raw.length === 0) return null;
  const sub = subdivideEdges(raw);
  if (sub.length === 0) return null;


  const { faceLoops } = buildPlanarFaces(sub);

  // Kleinste umschließende Fläche wählen — unabhängig von der Umlauf-
  // Richtung. Bei stark gewölbten Wänden kann die Traversierung eine
  // Innenfläche im Uhrzeigersinn liefern; die frühere CCW-Bedingung hat
  // solche Bereiche fälschlich als "nicht geschlossen" verworfen.
  // Das unendliche Außen-Face ist immer die flächengrößte Kandidatin und
  // fällt durch die Minimum-Auswahl automatisch heraus.
  let best: Vec2[] | null = null;
  let bestArea = Infinity;
  for (const loop of faceLoops) {
    const a = polygonAreaAbs(loop);
    if (a <= 1e-9) continue; // degeneriert
    if (!pointInPolygon(click, loop)) continue;
    if (a < bestArea) { bestArea = a; best = loop; }
  }
  if (best && polygonSignedArea(best) < 0) best = [...best].reverse();
  return best;
}
