/**
 * Geschlossene Dreiecksnetze für räumliche Körper (Paket 01 – 3D-Einstellungen).
 *
 * - `slabMesh`: Grundriss (+Aussparungen) zwischen einer unteren und oberen
 *   Höhenfunktion – deckt senkrechte Prismen, schräge Begrenzungskörper ab.
 * - `tiltFrame`/`tiltPoint`: starres Neigen um eine feste Achse parallel zur
 *   gewählten Kante durch den gegenüberliegenden äußersten Punkt.
 * - `csgMesh`: echte Volumen-Verschneidung (three-bvh-csg) für geneigte Körper.
 *
 * Alles flüchtig, nichts wird gespeichert. Koordinaten: x/y = CAD, z = Höhe.
 */
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import { Brush, Evaluator, INTERSECTION, SUBTRACTION } from "three-bvh-csg";
import type { Vec2 } from "../geometry";

export interface MeshData { positions: number[]; indices: number[] }
export interface Vec3 { x: number; y: number; z: number }

const EPS = 1e-9;

export function ringArea(r: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

/** Doppelte Folgepunkte und Schlusspunkt entfernen. */
export function cleanRing(r: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of r) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 1e-7) out.push({ x: p.x, y: p.y });
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-7) out.pop();
  return out;
}

/** Fläche inkl. Aussparungen (m²). */
export function netArea(outer: Vec2[], holes: Vec2[][]): number {
  return Math.max(0, Math.abs(ringArea(outer)) - holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0));
}

/**
 * Körper über einem Grundriss: unten `zb(p)`, oben `zt(p)`. Ergebnis ist
 * geschlossen und nach außen orientiert (gegen den Uhrzeigersinn von außen).
 */
export function slabMesh(outerIn: Vec2[], holesIn: Vec2[][], zb: (p: Vec2) => number, zt: (p: Vec2) => number): MeshData | null {
  let outer = cleanRing(outerIn);
  if (outer.length < 3 || Math.abs(ringArea(outer)) < 1e-10) return null;
  if (ringArea(outer) < 0) outer = outer.reverse();
  const holes = holesIn.map(cleanRing).filter(h => h.length >= 3 && Math.abs(ringArea(h)) > 1e-10).map(h => (ringArea(h) > 0 ? h.reverse() : h));
  const rings = [outer, ...holes];
  const flat = rings.flat();
  const positions: number[] = [];
  for (const p of flat) positions.push(p.x, p.y, zb(p));
  for (const p of flat) positions.push(p.x, p.y, zt(p));
  const n = flat.length;
  const indices: number[] = [];
  const tris = ShapeUtils.triangulateShape(outer.map(p => new Vector2(p.x, p.y)), holes.map(h => h.map(p => new Vector2(p.x, p.y))));
  for (const [a, b, c] of tris) {
    const A = flat[a], B = flat[b], C = flat[c];
    const ccw = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) > 0;
    const [i, j, k] = ccw ? [a, b, c] : [a, c, b];
    indices.push(n + i, n + j, n + k); // oben: gegen den Uhrzeigersinn
    indices.push(i, k, j);             // unten: umgekehrt
  }
  let off = 0;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = off + i, b = off + ((i + 1) % r.length);
      indices.push(a, b, n + b, a, n + b, n + a);
    }
    off += r.length;
  }
  return { positions, indices };
}

/** Einseitige flache Fläche (Körperhöhe 0) als Netz. */
export function faceMesh(outerIn: Vec2[], holesIn: Vec2[][], z: (p: Vec2) => number): MeshData | null {
  const outer = cleanRing(outerIn);
  if (outer.length < 3) return null;
  const holes = holesIn.map(cleanRing).filter(h => h.length >= 3);
  const flat = [outer, ...holes].flat();
  const positions: number[] = [];
  for (const p of flat) positions.push(p.x, p.y, z(p));
  const indices: number[] = [];
  for (const [a, b, c] of ShapeUtils.triangulateShape(outer.map(p => new Vector2(p.x, p.y)), holes.map(h => h.map(p => new Vector2(p.x, p.y))))) indices.push(a, b, c);
  return { positions, indices };
}

// ---------------------------------------------------------------- Neigung

/** Gespeicherte Neigung einer Schraffur (räumlich, 2D-Punkte bleiben unverändert). */
export interface Tilt3D {
  /** Index der Bezugskante (Punkt i → i+1 der Außenkontur). */
  edgeIndex: number;
  /** Endpunkte der Bezugskante zum Zeitpunkt der Wahl. */
  a: Vec2; b: Vec2;
  /** Punktanzahl der Außenkontur zum Zeitpunkt der Wahl. */
  count: number;
  angleDeg: number;
}

export interface TiltFrame {
  /** Punkt auf der Drehachse. */
  axis: Vec2;
  /** Richtung der Achse (= Richtung der Bezugskante). */
  dir: Vec2;
  /** Einheitsvektor von der Achse zur Bezugskante. */
  n: Vec2;
  /** Abstand Achse ↔ Bezugskante (m). */
  D: number;
  angleRad: number;
  /** Bezugshöhe der ungekippten Ausgangsgeometrie. */
  z0: number;
  edgeIndex: number;
}

const near = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;

/** Gerade Kanten der Außenkontur, die als Bezugskante taugen. */
export function straightEdgeIndices(hatch: any): number[] {
  const pts: Vec2[] = hatch?.points || [];
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const b = pts[(i + 1) % pts.length];
    if (Array.isArray(hatch.bulges) && Math.abs(Number(hatch.bulges[i]) || 0) > 1e-9) continue;
    if (Math.hypot(b.x - pts[i].x, b.y - pts[i].y) > 1e-6) out.push(i);
  }
  return out;
}

/** Drehachse aus einer Kante bestimmen (ohne gespeicherte Neigung). */
export function frameForEdge(hatch: any, edgeIndex: number, angleDeg: number, z0: number): { frame?: TiltFrame; error?: string } {
  const pts: Vec2[] = hatch?.points || [];
  if (pts.length < 3 || edgeIndex < 0 || edgeIndex >= pts.length) return { error: "Bezugskante nicht vorhanden." };
  if (Array.isArray(hatch.bulges) && Math.abs(Number(hatch.bulges[edgeIndex]) || 0) > 1e-9) return { error: "Die Bezugskante ist gebogen – bitte eine gerade Kante wählen." };
  const a = pts[edgeIndex], b = pts[(edgeIndex + 1) % pts.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return { error: "Die Bezugskante hat keine Länge." };
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const nl = { x: -dir.y, y: dir.x };
  let pos = 0, neg = 0;
  for (const p of pts) { const s = (p.x - a.x) * nl.x + (p.y - a.y) * nl.y; pos = Math.max(pos, s); neg = Math.max(neg, -s); }
  if (pos > 1e-4 && neg > 1e-4) return { error: "Die Kante liegt nicht am Rand der Fläche – die Drehachse ist nicht eindeutig." };
  const m = pos >= neg ? nl : { x: -nl.x, y: -nl.y };
  const D = Math.max(pos, neg);
  if (D < 1e-4) return { error: "Die Fläche hat keine Ausdehnung quer zur Kante." };
  return { frame: { axis: { x: a.x + m.x * D, y: a.y + m.y * D }, dir, n: { x: -m.x, y: -m.y }, D, angleRad: (angleDeg * Math.PI) / 180, z0, edgeIndex } };
}

/**
 * Gespeicherte Bezugskante auf die aktuelle Kontur abbilden:
 * 1. gleiche Endpunkte → diese Kante,
 * 2. gleiche Punktanzahl → gleicher Index (Kontur wurde verschoben/verändert),
 * sonst Meldung – nie stillschweigend eine andere Kante.
 */
export function resolveTilt(hatch: any, z0: number): { frame?: TiltFrame; error?: string } | null {
  const t: Tilt3D | undefined = hatch?.tilt3D;
  if (!t || !Number.isFinite(t.angleDeg) || Math.abs(t.angleDeg) < 1e-9) return null;
  const pts: Vec2[] = hatch.points || [];
  let idx = -1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    if ((near(p, t.a) && near(q, t.b)) || (near(p, t.b) && near(q, t.a))) { idx = i; break; }
  }
  if (idx < 0 && pts.length === t.count && t.edgeIndex >= 0 && t.edgeIndex < pts.length) idx = t.edgeIndex;
  if (idx < 0) return { error: "Die Bezugskante der Neigung ist nicht mehr eindeutig – bitte Kante neu wählen oder Neigung zurücksetzen." };
  return frameForEdge(hatch, idx, t.angleDeg, z0);
}

export function tiltPoint(x: number, y: number, z: number, f: TiltFrame): Vec3 {
  const dx = x - f.axis.x, dy = y - f.axis.y;
  const u = dx * f.n.x + dy * f.n.y, t = dx * f.dir.x + dy * f.dir.y, w = z - f.z0;
  const c = Math.cos(f.angleRad), s = Math.sin(f.angleRad);
  const u2 = u * c - w * s, w2 = u * s + w * c;
  return { x: f.axis.x + f.dir.x * t + f.n.x * u2, y: f.axis.y + f.dir.y * t + f.n.y * u2, z: f.z0 + w2 };
}

export function tiltMesh(m: MeshData, f: TiltFrame): MeshData {
  const p = m.positions, out: number[] = new Array(p.length);
  for (let i = 0; i < p.length; i += 3) { const q = tiltPoint(p[i], p[i + 1], p[i + 2], f); out[i] = q.x; out[i + 1] = q.y; out[i + 2] = q.z; }
  return { positions: out, indices: m.indices.slice() };
}

export function meshZRange(m: MeshData): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let i = 2; i < m.positions.length; i += 3) { min = Math.min(min, m.positions[i]); max = Math.max(max, m.positions[i]); }
  return { min, max };
}

export function meshBounds(m: MeshData) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const p = m.positions;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** Volumen (Divergenzsatz) – für Tests und Plausibilität. */
export function meshVolume(m: MeshData): number {
  const p = m.positions, ix = m.indices;
  let v = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

// ---------------------------------------------------------------- Ebene einer Fläche

/** Ebene z = ax + by + c durch einen räumlichen Ring (null bei senkrechter Fläche). */
export function planeOfRing(r: Vec3[]): { a: number; b: number; c: number } | null {
  let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    nx += (p.y - q.y) * (p.z + q.z); ny += (p.z - q.z) * (p.x + q.x); nz += (p.x - q.x) * (p.y + q.y);
    cx += p.x; cy += p.y; cz += p.z;
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < EPS || Math.abs(nz) / len < 0.05) return null;
  cx /= r.length; cy /= r.length; cz /= r.length;
  return { a: -nx / nz, b: -ny / nz, c: cz + (nx * cx + ny * cy) / nz };
}

// ---------------------------------------------------------------- CSG

function brushOf(m: MeshData): Brush {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(m.positions, 3));
  g.setIndex(m.indices.slice());
  const b = new Brush(g);
  b.updateMatrixWorld();
  return b;
}

let evaluator: Evaluator | null = null;

/** Volumen-Verschneidung. `null` = leer. Wirft bei fehlerhaften Netzen. */
export function csgMesh(a: MeshData, b: MeshData, op: "subtract" | "intersect"): MeshData | null {
  if (!evaluator) { evaluator = new Evaluator(); evaluator.attributes = ["position"]; evaluator.useGroups = false; }
  const res = evaluator.evaluate(brushOf(a), brushOf(b), op === "subtract" ? SUBTRACTION : INTERSECTION);
  const pos = res.geometry.getAttribute("position");
  if (!pos || pos.count < 3) return null;
  const positions = Array.from(pos.array as ArrayLike<number>).slice(0, pos.count * 3);
  const idx = res.geometry.getIndex();
  const indices = idx ? Array.from(idx.array as ArrayLike<number>) : positions.map((_, i) => i).filter(i => i < pos.count);
  res.geometry.dispose();
  return indices.length >= 3 ? { positions, indices } : null;
}
