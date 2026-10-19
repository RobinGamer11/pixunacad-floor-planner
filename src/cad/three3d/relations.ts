/**
 * Körperbeziehungen (Paket 01, Schritt 2).
 *
 * Gespeichert am Quellobjekt (`relations3D` über objectMeta) mit Blatt + Objekt-ID
 * des Ziels. Ausgewertet wird nur flüchtig auf den abgeleiteten 3D-Körpern:
 * - "cutout":         Quelle durchbricht Ziel → Ziel verliert das Volumen der Quelle.
 * - "limitToSurface": Quelle wird an Ober- oder Unterseite des Ziels begrenzt;
 *                     `keep` bestimmt eindeutig, welche Seite erhalten bleibt.
 * Fehlt das Ziel oder schlägt die Verschneidung fehl, bleibt die Originalgeometrie.
 */
import polygonClipping from "polygon-clipping";
import type { Vec2 } from "../geometry";
import type { Relation3D } from "../objectMeta";
import type { Derived3D, Prism3D, Plane3D } from "./geometryDerivation";

export type { Relation3D };
export const objKey = (sheetId: string, id: string) => `${sheetId}::${id}`;

export interface RelationSource { sheetId: string; id: string; relations3D?: Relation3D[] }
export interface RelationIssue { sourceKey: string; targetKey: string; message: string }

const EPS = 1e-6;

/** Würde die neue Kante source→target einen Zyklus bilden? */
export function wouldCreateCycle(sources: RelationSource[], sourceKey: string, targetKey: string): boolean {
  if (sourceKey === targetKey) return true;
  const adj = new Map<string, string[]>();
  for (const s of sources) {
    const k = objKey(s.sheetId, s.id);
    for (const r of s.relations3D || []) {
      const arr = adj.get(k) || []; arr.push(objKey(r.targetSheetId, r.targetId)); adj.set(k, arr);
    }
  }
  const stack = [targetKey]; const seen = new Set<string>();
  while (stack.length) {
    const k = stack.pop()!;
    if (k === sourceKey) return true;
    if (seen.has(k)) continue; seen.add(k);
    for (const n of adj.get(k) || []) stack.push(n);
  }
  return false;
}

type Ring = [number, number][];
type Poly = Ring[];
const toRing = (pts: Vec2[]): Ring => {
  const r = pts.map(p => [p.x, p.y] as [number, number]);
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]]);
  return r;
};
const toPoly = (outer: Vec2[], holes: Vec2[][]): Poly => [toRing(outer), ...holes.map(toRing)];
const fromRing = (r: Ring): Vec2[] => r.slice(0, r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? -1 : undefined).map(([x, y]) => ({ x, y }));

function solidFootprint(d: Derived3D): { outer: Vec2[]; holes: Vec2[][]; z0: number; z1: number } | null {
  if (d.type === "prism") return { outer: d.footprint, holes: d.holes, z0: d.z0, z1: d.z1 };
  return null;
}

/** Zieh das Volumen der Quell-Prismen vom Ziel-Prisma ab. */
export function subtractPrism(t: Prism3D, cutters: Prism3D[]): Prism3D[] {
  let pieces: Prism3D[] = [t];
  for (const c of cutters) {
    const next: Prism3D[] = [];
    for (const p of pieces) {
      const lo = Math.max(p.z0, c.z0), hi = Math.min(p.z1, c.z1);
      if (hi - lo <= EPS) { next.push(p); continue; }
      const P = toPoly(p.footprint, p.holes), C = toPoly(c.footprint, c.holes);
      const outside = polygonClipping.difference(P as any, C as any) as unknown as Poly[];
      const inside = polygonClipping.intersection(P as any, C as any) as unknown as Poly[];
      if (!inside.length) { next.push(p); continue; }
      const mk = (poly: Poly, z0: number, z1: number): Prism3D => ({ ...p, footprint: fromRing(poly[0]), holes: poly.slice(1).map(fromRing), z0, z1 });
      for (const poly of outside) next.push(mk(poly, p.z0, p.z1));
      for (const poly of inside) {
        if (lo - p.z0 > EPS) next.push(mk(poly, p.z0, lo));
        if (p.z1 - hi > EPS) next.push(mk(poly, hi, p.z1));
      }
    }
    pieces = next;
  }
  return pieces;
}

/** Wendet alle Beziehungen auf die abgeleiteten Körper an. */
export function applyRelations3D(items: Derived3D[], sources: RelationSource[]): { items: Derived3D[]; issues: RelationIssue[] } {
  const issues: RelationIssue[] = [];
  const byKey = new Map<string, Derived3D[]>();
  for (const d of items) {
    const k = objKey(d.sheetId, d.sourceId);
    const arr = byKey.get(k) || []; arr.push(d); byKey.set(k, arr);
  }
  for (const s of sources) {
    const sk = objKey(s.sheetId, s.id);
    for (const r of s.relations3D || []) {
      const tk = objKey(r.targetSheetId, r.targetId);
      const src = byKey.get(sk) || [], tgt = byKey.get(tk);
      if (!tgt || !tgt.length) { issues.push({ sourceKey: sk, targetKey: tk, message: "Zielobjekt fehlt – Originalgeometrie bleibt erhalten." }); continue; }
      try {
        if (r.type === "cutout") {
          const cutters = src.filter((d): d is Prism3D => d.type === "prism");
          if (!cutters.length) { issues.push({ sourceKey: sk, targetKey: tk, message: "Quelle hat keinen Körper zum Durchbrechen." }); continue; }
          const out: Derived3D[] = [];
          for (const t of tgt) out.push(...(t.type === "prism" ? subtractPrism(t, cutters) : [t]));
          byKey.set(tk, out);
        } else {
          const fps = tgt.map(solidFootprint).filter(Boolean) as { z0: number; z1: number }[];
          const zs = fps.length ? fps : tgt.map(t => ({ z0: (t as Plane3D).z ?? 0, z1: (t as Plane3D).z ?? 0 }));
          const face = r.face === "bottom" ? "bottom" : "top";
          const plane = face === "top" ? Math.max(...zs.map(z => z.z1)) : Math.min(...zs.map(z => z.z0));
          const keep = r.keep === "above" ? "above" : "below";
          const out: Derived3D[] = [];
          for (const d of src) {
            if (d.type !== "prism") { out.push(d); continue; }
            const z0 = keep === "above" ? Math.max(d.z0, plane) : d.z0;
            const z1 = keep === "below" ? Math.min(d.z1, plane) : d.z1;
            if (z1 - z0 > EPS) out.push({ ...d, z0, z1 });
          }
          byKey.set(sk, out);
        }
      } catch (e) {
        issues.push({ sourceKey: sk, targetKey: tk, message: "Verschneidung fehlgeschlagen – Originalgeometrie bleibt erhalten." });
      }
    }
  }
  const out: Derived3D[] = [];
  const done = new Set<string>();
  for (const d of items) {
    const k = objKey(d.sheetId, d.sourceId);
    if (done.has(k)) continue; done.add(k);
    out.push(...(byKey.get(k) || []));
  }
  return { items: out, issues };
}
