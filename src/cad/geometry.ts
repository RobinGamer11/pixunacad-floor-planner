import { Defaults } from "./constants";

export interface Vec2 {
  x: number;
  y: number;
}

export function v(x: number, y: number): Vec2 { return { x, y }; }
export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function mul(a: Vec2, s: number): Vec2 { return { x: a.x * s, y: a.y * s }; }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
export function cross(a: Vec2, b: Vec2): number { return a.x * b.y - a.y * b.x; }
export function dist(a: Vec2, b: Vec2): number { return Math.hypot(a.x - b.x, a.y - b.y); }
export function len(a: Vec2): number { return Math.hypot(a.x, a.y); }
export function norm(a: Vec2): Vec2 { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; }
export function clamp(x: number, a: number, b: number): number { return Math.max(a, Math.min(b, x)); }
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

export function projectPointToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const ab2 = dot(ab, ab) || 1e-12;
  let t = dot(ap, ab) / ab2;
  t = clamp(t, 0, 1);
  const q = add(a, mul(ab, t));
  return { t, q };
}

export function projectPointToInfiniteLine(p: Vec2, a: Vec2, dir: Vec2) {
  const d = norm(dir);
  const ap = sub(p, a);
  const t = dot(ap, d);
  const q = add(a, mul(d, t));
  return { t, q };
}

export function lineLineIntersectionInfinite(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < Defaults.geomEps) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, mul(d1, t));
}

export function orthoSnapFromA(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: b.x, y: a.y };
  return { x: a.x, y: b.y };
}

export function angleDeg(a: Vec2, b: Vec2): number {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return (ang + 360) % 360;
}

export function pointFromLengthAngle(a: Vec2, lengthM: number, angleDegValue: number): Vec2 {
  const rad = angleDegValue * Math.PI / 180;
  return {
    x: a.x + Math.cos(rad) * lengthM,
    y: a.y + Math.sin(rad) * lengthM,
  };
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Build polygon points along a circular arc from startAngleDeg → endAngleDeg.
 * If start≈end (within 0.1°), produces a full closed circle.
 * Otherwise produces a sector (pie slice) including the center, swept counter-clockwise.
 */
export function buildCircleOrSectorPoints(
  center: Vec2,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number,
  segments: number = 96
): Vec2[] {
  if (radius <= 0 || segments < 3) return [];
  const start = normalizeDeg(startAngleDeg);
  const end = normalizeDeg(endAngleDeg);
  let sweep = end - start;
  if (sweep <= 0) sweep += 360;

  // Treat tiny sweep or near-full as full circle
  const isFull = sweep < 0.1 || sweep > 359.9;

  const pts: Vec2[] = [];

  if (isFull) {
    for (let i = 0; i < segments; i++) {
      const ang = (i / segments) * 360;
      pts.push(pointFromLengthAngle(center, radius, ang));
    }
    return pts;
  }

  // Sector: include center as first point so it forms a pie slice
  const arcSegs = Math.max(2, Math.ceil((sweep / 360) * segments));
  pts.push(v(center.x, center.y));
  for (let i = 0; i <= arcSegs; i++) {
    const ang = start + (sweep * i) / arcSegs;
    pts.push(pointFromLengthAngle(center, radius, ang));
  }
  return pts;
}

export function nearestAngleToReference(options: number[], ref: number): number {
  let best = options[0];
  let bestDiff = Infinity;
  for (const a of options) {
    let d = Math.abs(a - ref) % 360;
    if (d > 180) d = 360 - d;
    if (d < bestDiff) {
      bestDiff = d;
      best = a;
    }
  }
  return best;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if p is inside outer polygon AND not inside any hole loop. */
export function pointInHatchSolid(p: Vec2, outer: Vec2[], holes?: Vec2[][] | null): boolean {
  if (!outer || outer.length < 3) return false;
  if (!pointInPolygon(p, outer)) return false;
  if (holes) {
    for (const h of holes) {
      if (h && h.length >= 3 && pointInPolygon(p, h)) return false;
    }
  }
  return true;
}

export function rgbaFromHex(hex: string, alpha01: number): string {
  const clean = hex.replace("#", "");
  const full = (clean.length === 3)
    ? clean.split("").map(ch => ch + ch).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha01})`;
}

export function rotatePointAround(point: Vec2, pivot: Vec2, angleRad: number): Vec2 {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    x: pivot.x + dx * c - dy * s,
    y: pivot.y + dx * s + dy * c,
  };
}

export function centroid(points: Vec2[]): Vec2 {
  if (!points.length) return v(0, 0);
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  return v(sx / points.length, sy / points.length);
}

export function polygonSignedArea(poly: Vec2[]): number {
  if (!poly || poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

export function polygonAreaAbs(poly: Vec2[]): number {
  return Math.abs(polygonSignedArea(poly));
}

export function perpLeft(a: Vec2): Vec2 { return { x: -a.y, y: a.x }; }

export function hexToRgba(hex: string, alpha: number): string {
  const clean = String(hex || "#ffffff").replace("#", "");
  const normalized = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean.padEnd(6, "f").slice(0, 6);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  if (!poly || poly.length === 0) return v(0, 0);
  if (poly.length < 3) {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    return v(sx / poly.length, sy / poly.length);
  }
  const a = polygonSignedArea(poly);
  if (Math.abs(a) < 1e-12) {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    return v(sx / poly.length, sy / poly.length);
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cr = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/* ------------------------------------------------------------------ */
/* Kanten-Wölbung (Bulge)                                              */
/* ------------------------------------------------------------------ */
/**
 * `bulge` = signierte Pfeilhöhe (Sagitta) im Verhältnis zur Sehnenlänge.
 * 0 = gerade Kante, +/- = rein-/rausgewölbt.
 * Die Kante wird als Kreisbogen durch A, Scheitel, B tesselliert.
 */
export function bulgedEdgePoints(a: Vec2, b: Vec2, bulge: number, segments = 24): Vec2[] {
  const out: Vec2[] = [];
  const chord = dist(a, b);
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-6 || chord < 1e-9) return out;
  const arc = arcFromBulge(a, b, bulge);
  if (!arc) return out;
  const n = Math.max(4, Math.min(192, segments));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const ang = arc.angA + arc.sweep * t;
    out.push(v(arc.center.x + Math.cos(ang) * arc.radius, arc.center.y + Math.sin(ang) * arc.radius));
  }
  return out;
}

export interface BulgeArc {
  center: Vec2;
  radius: number;
  /** Startwinkel (bei A). */
  angA: number;
  /** Signierter Öffnungswinkel A→B. */
  sweep: number;
}

/**
 * Echter Kreisbogen zu einer Kante A→B mit `bulge` = Pfeilhöhe / Sehnenlänge.
 * Positive Werte wölben in Richtung n = (-dy, dx).
 */
export function arcFromBulge(a: Vec2, b: Vec2, bulge: number): BulgeArc | null {
  const c = dist(a, b);
  if (!Number.isFinite(bulge) || Math.abs(bulge) < 1e-6 || c < 1e-9) return null;
  const dx = (b.x - a.x) / c, dy = (b.y - a.y) / c;
  const nx = -dy, ny = dx;
  const h = bulge * c;
  const radius = (c * c / 4 + h * h) / (2 * Math.abs(h));
  const sgnH = h >= 0 ? 1 : -1;
  const mid = v((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
  const center = v(mid.x + nx * (h - sgnH * radius), mid.y + ny * (h - sgnH * radius));
  const angA = Math.atan2(a.y - center.y, a.x - center.x);
  const angB = Math.atan2(b.y - center.y, b.x - center.x);
  const sweepMag = Math.abs(4 * Math.atan(2 * bulge));
  const TAU = Math.PI * 2;
  const dCCW = ((angB - angA) % TAU + TAU) % TAU;
  const sign = Math.abs(dCCW - sweepMag) <= Math.abs((TAU - dCCW) - sweepMag) ? 1 : -1;
  return { center, radius, angA, sweep: sign * sweepMag };
}

/** Tesselliert einen Ring/Pfad mit optionalen Kanten-Wölbungen. */
export function tessellateWithBulges(
  points: Vec2[],
  bulges: number[] | null | undefined,
  closed: boolean,
  segments = 24
): Vec2[] {
  if (!points || points.length < 2) return (points || []).map(p => v(p.x, p.y));
  if (!bulges || bulges.every(b => !b)) return points.map(p => v(p.x, p.y));
  const out: Vec2[] = [];
  const last = closed ? points.length : points.length - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push(v(a.x, a.y));
    const bg = bulges[i] || 0;
    if (bg) out.push(...bulgedEdgePoints(a, b, bg, segments));
  }
  if (!closed) out.push(v(points[points.length - 1].x, points[points.length - 1].y));
  return out;
}

/** Aktuelle Wölbung aus einem Zielpunkt (z. B. Maus) ableiten. */
export function bulgeFromPoint(a: Vec2, b: Vec2, p: Vec2): number {
  const chord = dist(a, b);
  if (chord < 1e-9) return 0;
  const dx = (b.x - a.x) / chord, dy = (b.y - a.y) / chord;
  const nx = -dy, ny = dx;
  const mid = v((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
  const h = (p.x - mid.x) * nx + (p.y - mid.y) * ny;
  return clamp(h / chord, -4, 4);
}

/** Punkte einer gewölbten Kante inkl. Start- und Endpunkt. */
export function bulgedCurvePoints(a: Vec2, b: Vec2, bulge: number, segments = 48): Vec2[] {
  if (!bulge) return [v(a.x, a.y), v(b.x, b.y)];
  return [v(a.x, a.y), ...bulgedEdgePoints(a, b, bulge, segments), v(b.x, b.y)];
}

/** Länge eines Polygonzugs. */
export function polylineLength(pts: Vec2[]): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i], pts[i + 1]);
  return L;
}

/** Versetzt einen Polygonzug entlang seiner lokalen Normalen (links positiv). */
export function offsetPolyline(pts: Vec2[], offset: number): Vec2[] {
  if (pts.length < 2 || !offset) return pts.map(p => v(p.x, p.y));
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const t = sub(next, prev);
    const L = Math.hypot(t.x, t.y) || 1;
    const nx = -t.y / L, ny = t.x / L;
    out.push(v(pts[i].x + nx * offset, pts[i].y + ny * offset));
  }
  return out;
}

/**
 * Projiziert einen Punkt auf eine (ggf. gewölbte) Kante A→B.
 * Bei `bulge === 0` identisch zu `projectPointToSegment`.
 * Der zurückgegebene Parameter `t` entspricht der Bogenlängen-Position
 * entlang der Wölbung (0 = A, 1 = B).
 */
export function projectPointToCurvedEdge(p: Vec2, a: Vec2, b: Vec2, bulge?: number | null) {
  if (!bulge || Math.abs(bulge) < 1e-6) return projectPointToSegment(p, a, b);
  const pts = bulgedCurvePoints(a, b, bulge, 48);
  const total = polylineLength(pts) || 1;
  let acc = 0;
  let bestD = Infinity;
  let bestQ = v(a.x, a.y);
  let bestT = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const segLen = dist(pts[i], pts[i + 1]);
    const proj = projectPointToSegment(p, pts[i], pts[i + 1]);
    const d = dist(p, proj.q);
    if (d < bestD) {
      bestD = d;
      bestQ = proj.q;
      bestT = (acc + proj.t * segLen) / total;
    }
    acc += segLen;
  }
  return { t: clamp(bestT, 0, 1), q: bestQ };
}

/* ------------------------------------------------------------------ */
/* Exaktes Aufschneiden gewölbter Kanten                               */
/* ------------------------------------------------------------------ */
export interface BulgeSplitResult {
  /** Schnittpunkt exakt auf dem Bogen. */
  point: Vec2;
  /** Wölbung der Teilkante A→Schnittpunkt. */
  bulgeA: number;
  /** Wölbung der Teilkante Schnittpunkt→B. */
  bulgeB: number;
  /** Bogenlängen-Parameter des Schnittpunkts (0..1). */
  t: number;
}

/**
 * Schneidet eine (ggf. gewölbte) Kante A→B an der Stelle auf, die dem Punkt `p`
 * am nächsten liegt. Beide Teilkanten behalten exakt die ursprüngliche
 * Krümmung — die Gesamtform bleibt nach dem Schnitt unverändert.
 *
 * Konvention: `bulge` = Pfeilhöhe / Sehnenlänge, positiv in Richtung
 * `n = (-dy, dx)` (identisch zu `bulgedEdgePoints`).
 */
export function splitBulgedEdge(a: Vec2, b: Vec2, bulge: number | null | undefined, p: Vec2): BulgeSplitResult {
  const c = dist(a, b);
  if (!bulge || Math.abs(bulge) < 1e-6 || c < 1e-9) {
    const pr = projectPointToSegment(p, a, b);
    return { point: pr.q, bulgeA: 0, bulgeB: 0, t: pr.t };
  }
  const arc = arcFromBulge(a, b, bulge);
  if (!arc) {
    const pr = projectPointToSegment(p, a, b);
    return { point: pr.q, bulgeA: 0, bulgeB: 0, t: pr.t };
  }
  const { center, radius: R, angA, sweep } = arc;
  const sign = sweep >= 0 ? 1 : -1;
  const sweepMag = Math.abs(sweep);
  const TAU = Math.PI * 2;

  // Punkt auf den Kreis projizieren.
  let vx = p.x - center.x, vy = p.y - center.y;
  if (Math.hypot(vx, vy) < 1e-9) { vx = a.x - center.x; vy = a.y - center.y; }
  const angS = Math.atan2(vy, vx);
  const rel = (((angS - angA) * sign) % TAU + TAU) % TAU;
  let t = sweepMag > 1e-9 ? rel / sweepMag : 0;
  t = clamp(t, 0, 1);
  const angSplit = angA + sweep * t;
  const point = v(center.x + Math.cos(angSplit) * R, center.y + Math.sin(angSplit) * R);

  const subBulge = (sw: number) => -Math.tan(sw / 4) / 2;
  return {
    point,
    bulgeA: subBulge(sign * sweepMag * t),
    bulgeB: subBulge(sign * sweepMag * (1 - t)),
    t,
  };
}

/* ------------------------------------------------------------------ */
/* Schraffur-Ringe inkl. Wölbung                                       */
/* ------------------------------------------------------------------ */
/** Äußerer Ring einer Schraffur inkl. Wölbungen (für Fläche & Trefferprüfung). */
export function hatchOuterRing(hatch: { points: Vec2[]; bulges?: number[] | null }): Vec2[] {
  return tessellateWithBulges(hatch.points || [], hatch.bulges, true, 48);
}

/** Loch-Ringe einer Schraffur inkl. Wölbungen. */
export function hatchHoleRings(hatch: { holes?: Vec2[][] | null; holeBulges?: (number[] | null)[] | null }): Vec2[][] {
  const holes = hatch.holes || [];
  return holes.map((loop, i) => tessellateWithBulges(loop || [], hatch.holeBulges?.[i], true, 48));
}
