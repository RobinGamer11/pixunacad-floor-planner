import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import type { Wall } from "./Scene";
import { Defaults } from "./constants";
import { buildHealedWallSolidRing, ringToPCPolygon } from "./wallSolid";
import type { WallTopologyGraph } from "./WallTopologyGraph";

export function unionWallSolids(
  walls: Wall[],
  allWalls?: Wall[],
  graph?: WallTopologyGraph,
): MultiPolygon {
  if (!walls || walls.length === 0) return [];
  const neighborPool = allWalls && allWalls.length ? allWalls : walls;
  const polys: number[][][][] = [];
  for (const w of walls) {
    const ring = buildHealedWallSolidRing(w, neighborPool, graph);
    const pc = ringToPCPolygon(ring);
    if (pc.length < 4) continue;
    polys.push([pc]);
  }
  if (polys.length === 0) return [];
  try {
    const [first, ...rest] = polys as any[];
    // first ist bereits ein Polygon (Array von Ringen). MultiPolygon = Array von Polygonen.
    if (rest.length === 0) return [first] as MultiPolygon;
    return polygonClipping.union(first, ...rest);
  } catch {
    return polys as unknown as MultiPolygon;
  }

}


export interface WallUnionGroup {
  /** Höhere Werte rendern OBEN und "schneiden" niedrigere. */
  priority: number;
  fillColor: string;
  strokeColor: string;
  kind: "outer" | "inner";
  wallIds: string[];
  /** Bereits gegen alle höher priorisierten Gruppen subtrahiertes Polygon. */
  multi: MultiPolygon;
}

function styleKey(w: Wall): string {
  const fill = w.fillColor || (w.kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner);
  return `${w.priority}|${fill}|${w.color}|${w.kind}`;
}

/**
 * Gruppiert Wände eines Labels nach (Priorität, Fill, Stroke, Kind) und
 * liefert pro Gruppe das vereinigte Polygon. Anschließend wird jede Gruppe
 * von der Vereinigung aller höher priorisierten Gruppen abgezogen — so läuft
 * z. B. AW (Prio 200) ungebrochen durch, IW (Prio 100) endet sauber an der
 * AW-Kante (ArchiCAD-Verschneidungspriorität).
 *
 * Innerhalb gleicher Priorität entstehen Gehrungen automatisch durch die
 * Boolean-Union.
 *
 * Rückgabe ist nach Priorität AUFsteigend sortiert — der Renderer zeichnet
 * also höher Priorisiertes zuletzt (oben).
 */
const _cache = new Map<string, { hash: string; result: WallUnionGroup[] }>();

export function getWallUnionGroups(
  walls: Wall[],
  labelId: string,
  graph?: WallTopologyGraph,
): WallUnionGroup[] {
  const relevant = walls.filter(w => w.labelId === labelId && w.corners.length >= 2 && w.thicknessM > 0);
  if (relevant.length === 0) { _cache.delete(labelId); return []; }
  // Hash beinhaltet ALLE Wände im selben Label — Nachbar-Heal hängt davon ab.
  let h = "" + relevant.length;
  for (const w of relevant) {
    h += "|" + w.id + ":" + w.thicknessM.toFixed(4) + ":" + w.referenceSide + ":" + styleKey(w);
    for (const c of w.corners) h += "," + c.x.toFixed(4) + "," + c.y.toFixed(4);
    if (Array.isArray((w as any).bulges)) h += "#" + (w as any).bulges.map((b: number) => (b || 0).toFixed(4)).join(",");
  }
  const cached = _cache.get(labelId);
  if (cached && cached.hash === h) return cached.result;

  // Bucket nach Style-Key (inkl. Priorität).
  const buckets = new Map<string, Wall[]>();
  for (const w of relevant) {
    const k = styleKey(w);
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    arr.push(w);
  }

  // Vorab pro Bucket unionieren — Heal nutzt ALLE relevanten Wände als Nachbar-Pool,
  // damit Außenkanten gleichnamiger Linien an Knoten korrekt mitern.
  type Pre = { key: string; priority: number; fill: string; stroke: string; kind: "outer" | "inner"; wallIds: string[]; multi: MultiPolygon };
  const pre: Pre[] = [];
  for (const [k, ws] of buckets) {
    const [prioStr, fill, stroke, kind] = k.split("|");
    pre.push({
      key: k,
      priority: parseInt(prioStr, 10) || 0,
      fill,
      stroke,
      kind: kind as "outer" | "inner",
      wallIds: ws.map(w => w.id),
      multi: unionWallSolids(ws, relevant, graph),
    });
  }


  // Subtraktionsphase auf Prioritäts-Tier-Basis:
  // Gleichrangige Gruppen schneiden sich NICHT gegenseitig (sie sollen sauber
  // anschließen/unionieren). Nur strikt höhere Prioritäten schneiden niedrigere aus.
  pre.sort((a, b) => b.priority - a.priority);
  const prios = Array.from(new Set(pre.map(p => p.priority))); // bereits absteigend
  let higherMask: MultiPolygon = [];
  for (const prio of prios) {
    const tier = pre.filter(p => p.priority === prio);
    // 1) Dieses Tier gegen die bisher akkumulierte (strikt höhere) Maske schneiden.
    if (higherMask.length > 0) {
      for (const g of tier) {
        if (g.multi.length === 0) continue;
        try {
          g.multi = polygonClipping.difference(g.multi as any, higherMask as any);
        } catch {
          // ignore
        }
      }
    }
    // 2) Tier zur Maske für nachfolgende (niedrigere) Tiers hinzufügen.
    for (const g of tier) {
      if (g.multi.length === 0) continue;
      try {
        higherMask = higherMask.length === 0 ? g.multi : polygonClipping.union(higherMask as any, g.multi as any);
      } catch {
        // ignore
      }
    }
  }

  // Aufsteigend ausgeben, damit Renderer höhere Prio ZULETZT (oben) zeichnet.
  pre.sort((a, b) => a.priority - b.priority);

  const out: WallUnionGroup[] = pre.map(p => ({
    priority: p.priority,
    fillColor: p.fill,
    strokeColor: p.stroke,
    kind: p.kind,
    wallIds: p.wallIds,
    multi: p.multi,
  }));
  _cache.set(labelId, { hash: h, result: out });
  return out;
}

export function clearWallUnionCache(): void { _cache.clear(); }
