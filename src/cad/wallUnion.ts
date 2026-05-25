import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import type { Wall } from "./Scene";
import { Defaults } from "./constants";
import { buildWallSolidRing, ringToPCPolygon } from "./wallSolid";

/**
 * Booleansche Union einer Wandliste (gleicher Stil-Gruppe).
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

export interface WallUnionGroup {
  fillColor: string;
  strokeColor: string;
  kind: "outer" | "inner";
  wallIds: string[];
  multi: MultiPolygon;
}

function styleKey(w: Wall): string {
  const fill = w.fillColor || (w.kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner);
  return `${fill}|${w.color}|${w.kind}`;
}

/**
 * Gruppiert Wände eines Labels nach visuellem Stil (fill+stroke+kind) und
 * liefert pro Gruppe das vereinigte Polygon. So bleiben unterschiedlich
 * gefärbte Wände visuell getrennt, gleich gefärbte verschmelzen nahtlos.
 */
const _cache = new Map<string, { hash: string; result: WallUnionGroup[] }>();

export function getWallUnionGroups(walls: Wall[], labelId: string): WallUnionGroup[] {
  const relevant = walls.filter(w => w.labelId === labelId && w.corners.length >= 2 && w.thicknessM > 0);
  if (relevant.length === 0) { _cache.delete(labelId); return []; }
  let h = "" + relevant.length;
  for (const w of relevant) {
    h += "|" + w.id + ":" + w.thicknessM.toFixed(4) + ":" + w.referenceSide + ":" + styleKey(w);
    for (const c of w.corners) h += "," + c.x.toFixed(4) + "," + c.y.toFixed(4);
  }
  const cached = _cache.get(labelId);
  if (cached && cached.hash === h) return cached.result;

  const buckets = new Map<string, Wall[]>();
  for (const w of relevant) {
    const k = styleKey(w);
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    arr.push(w);
  }
  const out: WallUnionGroup[] = [];
  for (const [k, ws] of buckets) {
    const [fill, stroke, kind] = k.split("|");
    out.push({
      fillColor: fill,
      strokeColor: stroke,
      kind: kind as "outer" | "inner",
      wallIds: ws.map(w => w.id),
      multi: unionWallSolids(ws),
    });
  }
  _cache.set(labelId, { hash: h, result: out });
  return out;
}

export function clearWallUnionCache(): void { _cache.clear(); }
