import polygonClippingDefault from "polygon-clipping";
import { v, type Vec2, hatchOuterRing, hatchHoleRings } from "./geometry";

const pc: any = (polygonClippingDefault as any)?.union
  ? polygonClippingDefault
  : (polygonClippingDefault as any)?.default;

type Ring = [number, number][];

function toRing(pts: Vec2[]): Ring {
  return pts.map((p) => [p.x, p.y] as [number, number]);
}

function fromRing(r: Ring): Vec2[] {
  const pts = r.map(([x, y]) => v(x, y));
  // polygon-clipping schließt Ringe mit doppeltem Endpunkt.
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12) pts.pop();
  }
  return pts;
}

/**
 * Vereinigt die Flächen mehrerer Schraffuren zu einer Kontur.
 * Ergebnis null, wenn die Flächen keine zusammenhängende Fläche ergeben
 * (eine Schraffur hat genau eine Außenkontur).
 */
export function mergeHatchGeometry(hatches: any[]): { outer: Vec2[]; holes: Vec2[][] } | null {
  const polys = hatches
    .map((h) => {
      const outer = hatchOuterRing(h);
      if (outer.length < 3) return null;
      return [toRing(outer), ...hatchHoleRings(h).filter((r) => r.length >= 3).map(toRing)];
    })
    .filter(Boolean) as Ring[][];
  if (polys.length < 2) return null;
  const res: Ring[][] = pc.union(polys[0], ...polys.slice(1));
  if (!Array.isArray(res) || res.length !== 1) return null;
  const [outer, ...holes] = res[0];
  return { outer: fromRing(outer), holes: holes.map(fromRing) };
}
