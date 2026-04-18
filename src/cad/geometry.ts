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
