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

/**
 * Erkennt aus einem Freihand-Pfad, ob eine gerade Linie oder ein Kreis gemeint war,
 * und liefert eine bereinigte Punktfolge zurück. Wenn keine klare Form erkannt wird,
 * werden die Punkte stark geglättet (Chaikin) zurückgegeben.
 */
export function autoShapePoints(points: Vec2[]): Vec2[] {
  const pts = dedupePoints(points);
  if (pts.length < 3) return pts;

  // Gesamtlänge und Sehne
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  const a = pts[0], b = pts[pts.length - 1];
  const chord = dist(a, b);
  if (L < 1e-6) return pts;

  // 1) Geradenerkennung: max. senkrechter Abstand zur Sehne (start→end)
  if (chord / L > 0.85 && chord > 1e-4) {
    let maxPerp = 0;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (const p of pts) {
      const d = Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny);
      if (d > maxPerp) maxPerp = d;
    }
    if (maxPerp / chord < 0.06) {
      return [v(a.x, a.y), v(b.x, b.y)];
    }
  }

  // 2) Kreiserkennung: Kasa-Fit (algebraisch) über alle Punkte.
  // Mindestens „geschlossen-artig": chord/L < 0.55 (offener Bogen bis ~Halbkreis)
  if (pts.length >= 6) {
    // Berechne Sum-Terms
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    const n = pts.length;
    for (const p of pts) {
      const z = p.x * p.x + p.y * p.y;
      sx += p.x; sy += p.y;
      sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y;
      sxz += p.x * z; syz += p.y * z; sz += z;
    }
    // Löse [[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]] * [A,B,C] = [sxz,syz,sz]
    const m: number[][] = [
      [sxx, sxy, sx, sxz],
      [sxy, syy, sy, syz],
      [sx,  sy,  n,  sz ],
    ];
    // Gaussian elimination
    let ok = true;
    for (let i = 0; i < 3; i++) {
      let pivot = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[pivot][i])) pivot = k;
      if (Math.abs(m[pivot][i]) < 1e-12) { ok = false; break; }
      if (pivot !== i) { const t = m[i]; m[i] = m[pivot]; m[pivot] = t; }
      for (let k = i + 1; k < 3; k++) {
        const f = m[k][i] / m[i][i];
        for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
      }
    }
    if (ok) {
      const C = m[2][3] / m[2][2];
      const B = (m[1][3] - m[1][2] * C) / m[1][1];
      const A = (m[0][3] - m[0][1] * B - m[0][2] * C) / m[0][0];
      const cx = A / 2, cy = B / 2;
      const r2 = C + cx * cx + cy * cy;
      if (r2 > 1e-8) {
        const r = Math.sqrt(r2);
        // Residuen
        let maxRes = 0, sumRes = 0;
        for (const p of pts) {
          const d = Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
          sumRes += d;
          if (d > maxRes) maxRes = d;
        }
        const avgRes = sumRes / n;
        // Winkel-Spannweite ermitteln
        const angles = pts.map(p => Math.atan2(p.y - cy, p.x - cx));
        // Sortieren und größte Lücke finden
        const sorted = angles.slice().sort((x, y) => x - y);
        let maxGap = sorted[0] + 2 * Math.PI - sorted[sorted.length - 1];
        for (let i = 1; i < sorted.length; i++) {
          const g = sorted[i] - sorted[i - 1];
          if (g > maxGap) maxGap = g;
        }
        const span = 2 * Math.PI - maxGap; // belegter Winkel
        const isClosed = chord < r * 0.5;
        // Strenge Akzeptanz: Residuen klein im Verhältnis zum Radius
        if (avgRes / r < 0.08 && maxRes / r < 0.18 && r > 1e-4) {
          if (isClosed && span > Math.PI * 1.5) {
            // Voller Kreis
            const out: Vec2[] = [];
            const N = 64;
            for (let i = 0; i <= N; i++) {
              const t = (i / N) * Math.PI * 2;
              out.push(v(cx + r * Math.cos(t), cy + r * Math.sin(t)));
            }
            return out;
          } else if (span > Math.PI * 0.35) {
            // Bogen zwischen Start- und Endwinkel — kürzester Weg, der die Mittelpunkte abdeckt
            const a0 = Math.atan2(a.y - cy, a.x - cx);
            const a1 = Math.atan2(b.y - cy, b.x - cx);
            // Wähle Drehrichtung so, dass mittlerer Punkt enthalten ist
            const mid = pts[Math.floor(pts.length / 2)];
            const am = Math.atan2(mid.y - cy, mid.x - cx);
            const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            const ccwSpan = norm(a1 - a0);
            const midOffsetCcw = norm(am - a0);
            const useCcw = midOffsetCcw <= ccwSpan;
            const N = 48;
            const out: Vec2[] = [];
            for (let i = 0; i <= N; i++) {
              const t = i / N;
              const ang = useCcw ? a0 + t * ccwSpan : a0 - t * (2 * Math.PI - ccwSpan);
              out.push(v(cx + r * Math.cos(ang), cy + r * Math.sin(ang)));
            }
            return out;
          }
        }
      }
    }
  }

  // 3) Fallback: stärkeres Glätten
  return smoothChaikin(pts, 3);
}
