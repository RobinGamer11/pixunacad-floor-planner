import { Defaults } from "./constants";
import {
  Vec2, v, add, sub, mul, norm, dot, len, perpLeft,
  projectPointToInfiniteLine
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
}

export interface DimensionLike {
  p1: Vec2;
  p2: Vec2;
  placementPoint: Vec2;
  mode: "parallel" | "diagonal";
  refDir: Vec2 | null;
  decimals?: number;
  useFreeText?: boolean;
  freeText?: string;
  tickLengthM?: number;
}

export function getDimensionBaseDirection(dim: DimensionLike): Vec2 {
  if (dim.mode === "parallel") {
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
  return `${distanceValue.toFixed(decimals)} m`;
}

export function getDimensionGeometry(dim: DimensionLike): DimensionGeometry {
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
