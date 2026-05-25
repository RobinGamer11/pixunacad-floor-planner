import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import type { Wall } from "./Scene";
import { buildWallSolidRing, ringToPCPolygon } from "./wallSolid";

/**
 * Booleansche Union aller Wand-Solids einer Liste.
 * Eingabe: Wände desselben Labels (Layer).
 * Ausgabe: MultiPolygon (Ringe = [x,y][]; pro Polygon: [outer, ...holes]).
 *
 * Bei leerer Eingabe oder degenerierter Geometrie: leeres MultiPolygon.
 */
export function unionWallSolids(walls: Wall[]): MultiPolygon {
  if (!walls || walls.length === 0) return [];
  const polys: number[][][][] = [];
  for (const w of walls) {
    const ring = buildWallSolidRing(w);
    const pc = ringToPCPolygon(ring);
    if (pc.length < 4) continue;
    polys.push([pc]);
  }
  if (polys.length === 0) return [];
  try {
    const [first, ...rest] = polys as any[];
    if (rest.length === 0) return first as MultiPolygon;
    return polygonClipping.union(first, ...rest);
  } catch {
    return polys as unknown as MultiPolygon;
  }
}

/**
 * Cache pro Wandverbund-Schlüssel. Schlüssel = labelId + Hash über alle
 * relevanten Wand-Parameter dieses Labels. Invalidierung erfolgt implizit
 * über Hash-Vergleich, sodass markWallsDirty() nicht zwingend nötig ist.
 */
const _cache = new Map<string, { hash: string; result: MultiPolygon }>();

export function getWallUnionForLabel(walls: Wall[], labelId: string): MultiPolygon {
  const relevant = walls.filter(w => w.labelId === labelId && w.corners.length >= 2 && w.thicknessM > 0);
  if (relevant.length === 0) {
    _cache.delete(labelId);
    return [];
  }
  let h = "" + relevant.length;
  for (const w of relevant) {
    h += "|" + w.id + ":" + w.thicknessM.toFixed(4) + ":" + w.referenceSide;
    for (const c of w.corners) h += "," + c.x.toFixed(4) + "," + c.y.toFixed(4);
  }
  const cached = _cache.get(labelId);
  if (cached && cached.hash === h) return cached.result;
  const result = unionWallSolids(relevant);
  _cache.set(labelId, { hash: h, result });
  return result;
}

export function clearWallUnionCache(): void { _cache.clear(); }
