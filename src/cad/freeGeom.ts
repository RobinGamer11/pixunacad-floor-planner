// Helpers für FreeDraw / Eraser. Bewusst eigenständig, importiert nur aus geometry.ts.
import { Vec2, v, dist, lerp, projectPointToSegment } from "./geometry";

export function dedupePoints(points: Vec2[], eps = 1e-5): Vec2[] {
  if (!points || points.length === 0) return [];
  const out: Vec2[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dist(points[i], out[out.length - 1]) > eps) out.push(points[i]);
  }
  return out;
}

export function densifyPolyline(points: Vec2[], stepM: number): Vec2[] {
  if (!points || points.length === 0) return [];
  const out: Vec2[] = [v(points[0].x, points[0].y)];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const d = dist(a, b);
    if (d <= stepM) { out.push(v(b.x, b.y)); continue; }
    const n = Math.ceil(d / stepM);
    for (let j = 1; j <= n; j++) out.push(lerp(a, b, j / n));
  }
  return dedupePoints(out);
}

export function smoothChaikin(points: Vec2[], iterations = 2): Vec2[] {
  if (!points || points.length < 3) return points ? points.slice() : [];
  let cur = points.slice();
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) break;
    const next: Vec2[] = [cur[0]];
    for (let i = 0; i < cur.length - 1; i++) {
      const p0 = cur[i], p1 = cur[i + 1];
      next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}

/** Splittet eine Polyline an einem Kreis (eraser). Liefert die übrigbleibenden Sub-Polylines. */
export function splitPolylineByCircle(points: Vec2[], center: Vec2, radiusM: number, stepM: number): Vec2[][] {
  const dense = densifyPolyline(points, Math.max(stepM, radiusM * 0.22, 0.003));
  if (dense.length < 2) return [];
  const chunks: Vec2[][] = [];
  let current: Vec2[] = [];
  for (const p of dense) {
    if (dist(p, center) > radiusM) current.push(v(p.x, p.y));
    else { if (current.length >= 2) chunks.push(dedupePoints(current)); current = []; }
  }
  if (current.length >= 2) chunks.push(dedupePoints(current));
  return chunks.filter(c => c.length >= 2);
}

/** Distanz von Punkt zu Polyline (Welt). */
export function distPointToPolyline(p: Vec2, points: Vec2[]): number {
  if (!points || points.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = dist(p, projectPointToSegment(p, points[i], points[i + 1]).q);
    if (d < best) best = d;
  }
  return best;
}

/** Splittet ein Liniensegment a→b an einem Kreis. Liefert 0–2 verbleibende Sub-Segmente als {a,b} Paare. */
export function splitSegmentByCircle(a: Vec2, b: Vec2, center: Vec2, radiusM: number): { a: Vec2; b: Vec2 }[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - center.x, fy = a.y - center.y;
  const A = dx * dx + dy * dy;
  if (A < 1e-12) {
    return dist(a, center) > radiusM ? [{ a: v(a.x, a.y), b: v(b.x, b.y) }] : [];
  }
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - radiusM * radiusM;
  const disc = B * B - 4 * A * C;
  if (disc < 0) {
    // Komplette Linie außerhalb des Kreises
    return [{ a: v(a.x, a.y), b: v(b.x, b.y) }];
  }
  const sq = Math.sqrt(disc);
  let t1 = (-B - sq) / (2 * A);
  let t2 = (-B + sq) / (2 * A);
  if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
  // Schnitt mit Segment-Bereich [0,1]
  const tA = Math.max(0, Math.min(1, t1));
  const tB = Math.max(0, Math.min(1, t2));
  const out: { a: Vec2; b: Vec2 }[] = [];
  // Stück vor dem Eintritt
  if (tA > 0.001) {
    out.push({ a: v(a.x, a.y), b: v(a.x + dx * tA, a.y + dy * tA) });
  }
  // Stück nach dem Austritt
  if (tB < 0.999) {
    out.push({ a: v(a.x + dx * tB, a.y + dy * tB), b: v(b.x, b.y) });
  }
  return out;
}

/** Projektion eines Punktes auf eine unendliche Linie (für Hilfslinien-Snap). */
export function projectPointToInfiniteLineFromTwoPoints(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return v(a.x, a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  return v(a.x + dx * t, a.y + dy * t);
}
