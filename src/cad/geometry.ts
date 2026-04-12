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
