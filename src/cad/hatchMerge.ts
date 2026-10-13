import type { Vec2 } from "./geometry";
import { hatchRegion, unionRegions } from "./cutGeometry";

/**
 * Vereinigt die Flächen mehrerer Schraffuren zu einer Kontur. Gewölbte
 * Kanten bleiben echte Bögen (`outerBulges`/`holeBulges`).
 * Ergebnis null, wenn die Flächen keine zusammenhängende Fläche ergeben
 * (eine Schraffur hat genau eine Außenkontur).
 */
export function mergeHatchGeometry(hatches: any[]): {
  outer: Vec2[]; outerBulges: number[]; holes: Vec2[][]; holeBulges: number[][];
} | null {
  const regions = hatches.filter((h) => (h?.points || []).length >= 3).map(hatchRegion);
  if (regions.length < 2) return null;
  const r = unionRegions(regions);
  if (!r) return null;
  return {
    outer: r.outer.points, outerBulges: r.outer.bulges,
    holes: r.holes.map((h) => h.points), holeBulges: r.holes.map((h) => h.bulges),
  };
}
