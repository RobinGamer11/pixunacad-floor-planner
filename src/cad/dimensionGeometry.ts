import { Defaults } from "./constants";
import {
  Vec2, v, add, sub, mul, norm, dot, len, perpLeft,
  projectPointToInfiniteLine, bulgedCurvePoints, polylineLength, offsetPolyline
} from "./geometry";
import type { Dimension } from "./Scene";

export interface DimensionGeometry {
  dir: Vec2;
  n: Vec2;
  offset: number;
  d1: Vec2;
  d2: Vec2;
  mid: Vec2;
  ext1a: Vec2;
  ext1b: Vec2;
  ext2a: Vec2;
  ext2b: Vec2;
  text: string;
  measureValue: number;
  /** Gewölbte Maßlinie (nur im Modus "arc"). */
  arcPts?: Vec2[];
}

export interface DimensionLike {
  p1: Vec2;
  p2: Vec2;
  placementPoint: Vec2;
  mode: "parallel" | "diagonal" | "arc" | "angle";
  refDir: Vec2 | null;
  /** Neigungsmaß: Endpunkt des zweiten Schenkels (p1 = Scheitel, p2 = erster Schenkel). */
  p3?: Vec2 | null;
  /** Wölbung der gemessenen Kante (Modus "arc"). */
  bulge?: number;
  decimals?: number;
  useFreeText?: boolean;
  freeText?: string;
  tickLengthM?: number;
  showUnit?: boolean;
  unit?: "mm" | "cm" | "m";
}

export function getDimensionBaseDirection(dim: DimensionLike): Vec2 {
  if (dim.mode === "parallel" || dim.mode === "arc") {
    if (dim.refDir && len(dim.refDir) > 1e-9) return norm(dim.refDir);
    const fallback = sub(dim.p2, dim.p1);
    return len(fallback) > 1e-9 ? norm(fallback) : v(1, 0);
  }
  const dir = sub(dim.p2, dim.p1);
  return len(dir) > 1e-9 ? norm(dir) : v(1, 0);
}

export function getDimensionDisplayText(dim: DimensionLike, distanceValue: number): string {
  if (dim.useFreeText) return dim.freeText || "";
  const decimals = Math.max(0, Math.min(6, dim.decimals ?? Defaults.measureDecimals));
  const unit = dim.unit ?? Defaults.measureUnit;
  const showUnit = (typeof dim.showUnit === "boolean") ? dim.showUnit : Defaults.measureShowUnit;
  const factor = unit === "mm" ? 1000 : unit === "cm" ? 100 : 1;
  const value = distanceValue * factor;
  const numText = value.toFixed(decimals);
  return showUnit ? `${numText} ${unit}` : numText;
}

/**
 * Neigungsmaß ("angle"): p1 = Scheitel, p2 = Ende des ersten Schenkels,
 * p3 = Ende des zweiten Schenkels. Liefert Radius, Bogenpunkte und den
 * Standard-Ankerpunkt für die Gradzahl (Winkelhalbierende).
 */
export function getAngleDimensionParts(dim: DimensionLike) {
  const apex = dim.p1;
  const b = dim.p2;
  const c = dim.p3 ?? dim.p2;
  const v1 = sub(b, apex);
  const v2 = sub(c, apex);
  const l1 = len(v1) || 1e-9;
  const l2 = len(v2) || 1e-9;
  const d1 = len(v1) > 1e-9 ? norm(v1) : v(1, 0);
  const d2 = len(v2) > 1e-9 ? norm(v2) : v(0, 1);
  const a1 = Math.atan2(d1.y, d1.x);
  const a2 = Math.atan2(d2.y, d2.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const angleDeg = Math.abs(delta) * 180 / Math.PI;
  const radius = Math.max(1e-4, Math.min(l1, l2) * 0.45);
  const steps = 40;
  const arcPts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a1 + delta * (i / steps);
    arcPts.push(v(apex.x + Math.cos(a) * radius, apex.y + Math.sin(a) * radius));
  }
  const bisect = a1 + delta / 2;
  const defaultLabel = v(
    apex.x + Math.cos(bisect) * radius * 1.35,
    apex.y + Math.sin(bisect) * radius * 1.35,
  );
  return { apex, b, c, d1, d2, radius, arcPts, angleDeg, defaultLabel };
}

export function getDimensionGeometry(dim: DimensionLike): DimensionGeometry {
  if (dim.mode === "angle") {
    const a = getAngleDimensionParts(dim);
    const decimals = Math.max(0, Math.min(6, dim.decimals ?? 1));
    const text = dim.useFreeText
      ? (dim.freeText || "")
      : `${a.angleDeg.toFixed(decimals)}°`;
    const label = dim.placementPoint ?? a.defaultLabel;
    const dir = a.d1;
    return {
      dir, n: perpLeft(dir), offset: 0,
      d1: a.arcPts[0], d2: a.arcPts[a.arcPts.length - 1],
      mid: v(label.x, label.y),
      ext1a: v(a.apex.x, a.apex.y), ext1b: v(a.b.x, a.b.y),
      ext2a: v(a.apex.x, a.apex.y), ext2b: v(a.c.x, a.c.y),
      text, measureValue: a.angleDeg, arcPts: a.arcPts,
    };
  }
  if (dim.mode === "arc") {
    const chordDir = (() => {
      const d = sub(dim.p2, dim.p1);
      return len(d) > 1e-9 ? norm(d) : v(1, 0);
    })();
    const nA = perpLeft(chordDir);
    const curve = bulgedCurvePoints(dim.p1, dim.p2, dim.bulge || 0, 48);
    const off = dot(sub(dim.placementPoint, dim.p1), nA);
    const arcPts = offsetPolyline(curve, off);
    const d1 = arcPts[0];
    const d2 = arcPts[arcPts.length - 1];
    const mid = arcPts[Math.floor(arcPts.length / 2)];
    const measureValue = polylineLength(curve);
    return {
      dir: chordDir, n: nA, offset: off, d1, d2, mid,
      ext1a: v(dim.p1.x, dim.p1.y), ext1b: v(d1.x, d1.y),
      ext2a: v(dim.p2.x, dim.p2.y), ext2b: v(d2.x, d2.y),
      text: getDimensionDisplayText(dim, measureValue),
      measureValue,
      arcPts,
    };
  }
  const dir = getDimensionBaseDirection(dim);
  const n = perpLeft(dir);

  const offset = dot(sub(dim.placementPoint, dim.p1), n);

  const lineOrigin = add(dim.p1, mul(n, offset));
  const d1 = projectPointToInfiniteLine(dim.p1, lineOrigin, dir).q;
  const d2 = projectPointToInfiniteLine(dim.p2, lineOrigin, dir).q;

  const mid = mul(add(d1, d2), 0.5);
  const measureValue = Math.abs(dot(sub(dim.p2, dim.p1), dir));

  return {
    dir, n, offset, d1, d2, mid,
    ext1a: v(dim.p1.x, dim.p1.y),
    ext1b: v(d1.x, d1.y),
    ext2a: v(dim.p2.x, dim.p2.y),
    ext2b: v(d2.x, d2.y),
    text: getDimensionDisplayText(dim, measureValue),
    measureValue,
  };
}
