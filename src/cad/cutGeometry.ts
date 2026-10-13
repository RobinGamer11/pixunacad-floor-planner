/**
 * Reine Geometrie für Cutter und Schraffur-Verbinden.
 *
 * Grundsatz: gewölbte Kanten bleiben echte Bögen. Flächen werden zwar über
 * eine tessellierte Kontur geschnitten/vereinigt, danach setzt `restoreArcs`
 * die Bogenstücke wieder zu Kanten mit `bulge` zusammen (keine kurzen
 * Geradenstücke im Ergebnis).
 */
import polygonClippingDefault from "polygon-clipping";
import { v, type Vec2, arcFromBulge, splitBulgedEdge, tessellateWithBulges, type BulgeArc } from "./geometry";

const pc: any = (polygonClippingDefault as any)?.intersection
  ? polygonClippingDefault
  : (polygonClippingDefault as any)?.default;

/** Feinheit der Bogen-Tessellierung für Flächenoperationen. */
export const ARC_SEGMENTS = 48;
const TAU = Math.PI * 2;

type Ring = [number, number][];
const toRing = (pts: Vec2[]): Ring => pts.map((p) => [p.x, p.y] as [number, number]);
function fromRing(r: Ring): Vec2[] {
  const pts = r.map(([x, y]) => v(x, y));
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12) pts.pop();
  }
  return pts;
}

export interface LoopWithBulges { points: Vec2[]; bulges: number[] }
export interface Region { outer: LoopWithBulges; holes: LoopWithBulges[] }

/* ------------------------------------------------------------ Bögen */

/** Alle echten Bögen eines geschlossenen Rings. */
export function loopArcs(points: Vec2[], bulges: number[] | null | undefined): BulgeArc[] {
  const out: BulgeArc[] = [];
  const n = points.length;
  if (!bulges || n < 2) return out;
  for (let i = 0; i < n; i++) {
    const bg = bulges[i] || 0;
    if (!bg) continue;
    const arc = arcFromBulge(points[i], points[(i + 1) % n], bg);
    if (arc) out.push(arc);
  }
  return out;
}

function relAngle(arc: BulgeArc, p: Vec2): number {
  const sign = arc.sweep >= 0 ? 1 : -1;
  const ang = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
  let rel = (((ang - arc.angA) * sign) % TAU + TAU) % TAU;
  const mag = Math.abs(arc.sweep);
  if (rel > mag + 1e-6 && rel > TAU - 1e-6) rel = 0;
  return rel;
}

/**
 * Setzt tessellierte Bogenstücke eines Rings wieder zu echten Bogenkanten
 * zusammen. Punkte, die auf einer Tessellier-Sehne liegen (z. B.
 * Schnittpunkte), werden exakt auf den Bogen gelegt.
 */
export function restoreArcs(ring: Vec2[], arcs: BulgeArc[]): LoopWithBulges {
  const n = ring.length;
  const pts = ring.map((p) => v(p.x, p.y));
  if (!arcs.length || n < 3) return { points: pts, bulges: pts.map(() => 0) };

  const onArc: number[][] = pts.map(() => []);
  const rels: number[][] = pts.map(() => []);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    for (let k = 0; k < arcs.length; k++) {
      const a = arcs[k];
      const mag = Math.abs(a.sweep);
      const tol = 1e-7 * Math.max(1, a.radius);
      // Sehnen-Pfeilhöhe der Tessellierung: Punkte darin gehören zum Bogen.
      const sag = a.radius * (1 - Math.cos(mag / ARC_SEGMENTS / 2)) + tol;
      const d = Math.hypot(p.x - a.center.x, p.y - a.center.y);
      if (Math.abs(d - a.radius) > sag) continue;
      const rel = relAngle(a, p);
      if (rel > mag + 1e-6) continue;
      if (Math.abs(d - a.radius) > tol && d > 1e-12) {
        // exakt auf den Kreis legen
        pts[i] = v(a.center.x + (p.x - a.center.x) / d * a.radius, a.center.y + (p.y - a.center.y) / d * a.radius);
      }
      onArc[i].push(k);
      rels[i].push(rel);
    }
  }

  const label: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    for (let x = 0; x < onArc[i].length; x++) {
      const k = onArc[i][x];
      const y = onArc[j].indexOf(k);
      if (y < 0) continue;
      const span = Math.abs(rels[j][y] - rels[i][x]);
      const mag = Math.abs(arcs[k].sweep);
      if (span <= mag / ARC_SEGMENTS * 1.05 + 1e-9) { label[i] = k; break; }
    }
  }

  let s = -1;
  for (let i = 0; i < n; i++) {
    const prev = label[(i - 1 + n) % n];
    if (label[i] === -1 || prev !== label[i]) { s = i; break; }
  }
  if (s < 0) return { points: pts, bulges: pts.map(() => 0) };

  const outP: Vec2[] = [];
  const outB: number[] = [];
  let i = 0;
  while (i < n) {
    const idx = (s + i) % n;
    const k = label[idx];
    if (k === -1) { outP.push(pts[idx]); outB.push(0); i++; continue; }
    const arc = arcs[k];
    const startRel = relAngle(arc, pts[idx]);
    let j = i;
    while (j < n && label[(s + j) % n] === k) j++;
    const endIdx = (s + j) % n;
    const endRel = relAngle(arc, pts[endIdx]);
    const sign = arc.sweep >= 0 ? 1 : -1;
    const sw = sign * (endRel - startRel);
    outP.push(pts[idx]);
    outB.push(-Math.tan(sw / 4) / 2);
    i = j;
  }
  return { points: outP, bulges: outB };
}

/* --------------------------------------------------- Schnittpunkte */

/** Schnitt Strecke AB × Strecke CD → t auf AB, u auf CD. */
function segSeg(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { t: number; u: number } | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-14) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, u };
}

/** Schnittpunkte einer (ggf. gewölbten) Kante A→B mit der Strecke CD, als Kantenparameter t. */
export function edgeCutParams(a: Vec2, b: Vec2, bulge: number, c: Vec2, d: Vec2): number[] {
  const arc = bulge ? arcFromBulge(a, b, bulge) : null;
  if (!arc) {
    const h = segSeg(a, b, c, d);
    return h ? [h.t] : [];
  }
  const dx = d.x - c.x, dy = d.y - c.y;
  const fx = c.x - arc.center.x, fy = c.y - arc.center.y;
  const A = dx * dx + dy * dy;
  if (A < 1e-18) return [];
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - arc.radius * arc.radius;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const out: number[] = [];
  const mag = Math.abs(arc.sweep);
  for (const u of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const p = v(c.x + dx * u, c.y + dy * u);
    const rel = relAngle(arc, p);
    if (rel > mag + 1e-9) continue;
    out.push(mag > 1e-12 ? rel / mag : 0);
  }
  return out;
}

const EPS_T = 1e-4;

/**
 * Schneidet einen offenen oder geschlossenen Linienzug an der Strecke CD.
 * Liefert offene Teilstücke (bogenexakt), oder null ohne Schnitt.
 */
export function cutPolyline(points: Vec2[], bulges: number[] | null | undefined, closed: boolean, c: Vec2, d: Vec2): LoopWithBulges[] | null {
  const n = points.length;
  if (n < 2) return null;
  const edges = closed ? n : n - 1;
  const V: Vec2[] = [v(points[0].x, points[0].y)];
  const B: number[] = [];
  const cutAt: number[] = [];
  for (let i = 0; i < edges; i++) {
    let a = points[i];
    const b = points[(i + 1) % n];
    let bg = bulges?.[i] || 0;
    const ts = edgeCutParams(a, b, bg, c, d).filter((t) => t > EPS_T && t < 1 - EPS_T).sort((x, y) => x - y);
    let consumed = 0;
    for (const t of ts) {
      // Restkante a→b neu parametrisieren
      const local = (t - consumed) / (1 - consumed);
      if (local <= EPS_T || local >= 1 - EPS_T) continue;
      const arc = bg ? arcFromBulge(a, b, bg) : null;
      const target = arc
        ? v(arc.center.x + Math.cos(arc.angA + arc.sweep * local) * arc.radius, arc.center.y + Math.sin(arc.angA + arc.sweep * local) * arc.radius)
        : v(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local);
      const cut = splitBulgedEdge(a, b, bg, target);
      B.push(cut.bulgeA);
      V.push(v(cut.point.x, cut.point.y));
      cutAt.push(V.length - 1);
      a = cut.point; bg = cut.bulgeB; consumed = t;
    }
    B.push(bg);
    V.push(v(b.x, b.y));
  }
  if (!cutAt.length) return null;

  const slice = (from: number, to: number): LoopWithBulges => ({
    points: V.slice(from, to + 1).map((p) => v(p.x, p.y)),
    bulges: B.slice(from, to),
  });
  const pieces: LoopWithBulges[] = [];
  if (closed) {
    // Ring an Schnitten öffnen: letztes Stück geht über den Startpunkt weiter.
    for (let k = 0; k < cutAt.length - 1; k++) pieces.push(slice(cutAt[k], cutAt[k + 1]));
    const tail = slice(cutAt[cutAt.length - 1], V.length - 1);
    const head = slice(0, cutAt[0]);
    pieces.push({ points: tail.points.concat(head.points.slice(1)), bulges: tail.bulges.concat(head.bulges) });
  } else {
    let from = 0;
    for (const k of cutAt) { pieces.push(slice(from, k)); from = k; }
    pieces.push(slice(from, V.length - 1));
  }
  return pieces.filter((p) => p.points.length >= 2);
}

/* ------------------------------------------------------- Flächen */

function ringBBox(r: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of r) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

function polyAreaAbs(r: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}

/**
 * Teilt eine Fläche (Außenkontur + Löcher, bogenexakt) an der Strecke CD.
 * Geschnitten wird nur, wenn die Strecke die Außenkontur mindestens zweimal
 * kreuzt. Ergebnis: Teilflächen (größte zuerst) oder null.
 */
export function cutRegion(region: Region, c: Vec2, d: Vec2): Region[] | null {
  const outerT = tessellateWithBulges(region.outer.points, region.outer.bulges, true, ARC_SEGMENTS);
  if (outerT.length < 3) return null;
  let crossings = 0;
  const on = region.outer.points.length;
  for (let i = 0; i < on; i++) {
    crossings += edgeCutParams(region.outer.points[i], region.outer.points[(i + 1) % on], region.outer.bulges[i] || 0, c, d)
      .filter((t) => t > 1e-9 && t < 1 - 1e-9).length;
  }
  if (crossings < 2) return null;

  const dx = d.x - c.x, dy = d.y - c.y;
  const L0 = Math.hypot(dx, dy);
  if (L0 < 1e-9) return null;
  const ux = dx / L0, uy = dy / L0, nx = -uy, ny = ux;
  const bb = ringBBox(outerT);
  const L = (Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) + Math.hypot(bb.minX - c.x, bb.minY - c.y) + L0) * 4 + 1;
  const half = (s: number): Ring => {
    const p0 = [c.x - ux * L, c.y - uy * L], p1 = [c.x + ux * L, c.y + uy * L];
    return [
      [p0[0], p0[1]], [p1[0], p1[1]],
      [p1[0] + nx * L * s, p1[1] + ny * L * s], [p0[0] + nx * L * s, p0[1] + ny * L * s],
    ] as Ring;
  };
  const holesT = region.holes.map((h) => tessellateWithBulges(h.points, h.bulges, true, ARC_SEGMENTS)).filter((h) => h.length >= 3);
  const poly = [toRing(outerT), ...holesT.map(toRing)];
  const arcs = [
    ...loopArcs(region.outer.points, region.outer.bulges),
    ...region.holes.flatMap((h) => loopArcs(h.points, h.bulges)),
  ];
  const results: Region[] = [];
  for (const s of [1, -1]) {
    const res: Ring[][] = pc.intersection(poly, [half(s)]);
    for (const p of res || []) {
      const [o, ...hs] = p.map(fromRing);
      if (o.length < 3 || polyAreaAbs(o) < 1e-10) continue;
      results.push({ outer: restoreArcs(o, arcs), holes: hs.filter((h) => h.length >= 3).map((h) => restoreArcs(h, arcs)) });
    }
  }
  if (results.length < 2) return null;
  const area = (r: Region) => polyAreaAbs(tessellateWithBulges(r.outer.points, r.outer.bulges, true, ARC_SEGMENTS));
  results.sort((a, b) => area(b) - area(a));
  return results;
}

/** Vereinigt Flächen (bogenexakt). null, wenn keine zusammenhängende Fläche entsteht. */
export function unionRegions(regions: Region[]): Region | null {
  const polys: Ring[][] = [];
  const arcs: BulgeArc[] = [];
  for (const r of regions) {
    const o = tessellateWithBulges(r.outer.points, r.outer.bulges, true, ARC_SEGMENTS);
    if (o.length < 3) continue;
    polys.push([toRing(o), ...r.holes.map((h) => tessellateWithBulges(h.points, h.bulges, true, ARC_SEGMENTS)).filter((h) => h.length >= 3).map(toRing)]);
    arcs.push(...loopArcs(r.outer.points, r.outer.bulges), ...r.holes.flatMap((h) => loopArcs(h.points, h.bulges)));
  }
  if (polys.length < 2) return null;
  const pu: any = (polygonClippingDefault as any)?.union ? polygonClippingDefault : (polygonClippingDefault as any)?.default;
  const res: Ring[][] = pu.union(polys[0], ...polys.slice(1));
  if (!Array.isArray(res) || res.length !== 1) return null;
  const [o, ...hs] = res[0].map(fromRing);
  return { outer: restoreArcs(o, arcs), holes: hs.map((h) => restoreArcs(h, arcs)) };
}

/** Fläche einer Schraffur / eines geschlossenen Polygons. */
export function hatchRegion(h: any): Region {
  const pts: Vec2[] = (h.points || []).map((p: Vec2) => v(p.x, p.y));
  const holes: Vec2[][] = h.holes || [];
  return {
    outer: { points: pts, bulges: pts.map((_, i) => h.bulges?.[i] || 0) },
    holes: holes.map((loop: Vec2[], hi: number) => ({
      points: loop.map((p) => v(p.x, p.y)),
      bulges: loop.map((_, i) => h.holeBulges?.[hi]?.[i] || 0),
    })),
  };
}
