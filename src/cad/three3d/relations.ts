/**
 * Körperbeziehungen (Paket 01, Schritt 2).
 *
 * Gespeichert am Quellobjekt (`relations3D` über objectMeta) mit Blatt + Objekt-ID
 * des Ziels. Ausgewertet wird nur flüchtig auf den abgeleiteten 3D-Körpern:
 * - "cutout":         Quelle durchbricht Ziel → Ziel verliert das Volumen der Quelle;
 *                     mit `edge` (top/bottom) zusätzlich den Raum über der Ober- bzw.
 *                     unter der Unterkante der Quelle (die Quelle stößt ganz hindurch).
 * - "limitToSurface": Quelle wird an Ober- oder Unterseite des Ziels begrenzt;
 *                     `keep` bestimmt eindeutig, welche Seite erhalten bleibt.
 * Fehlt das Ziel oder schlägt die Verschneidung fehl, bleibt die Originalgeometrie.
 */
import polygonClipping from "polygon-clipping";
import type { Vec2 } from "../geometry";
import type { Relation3D } from "../objectMeta";
import type { Derived3D, Prism3D, Mesh3D } from "./geometryDerivation";
import { csgMesh, meshBounds, planeOfRing, slabMesh, type MeshData, type Vec3 } from "./solidMesh";

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

export function solidFootprint(d: Derived3D): { outer: Vec2[]; holes: Vec2[][]; z0: number; z1: number } | null {
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

type Face = { outer: Vec3[]; holes: Vec3[][] };

/** Ober-/Unterseite eines Zielkörpers als räumliche Flächen. */
function facesOf(t: Derived3D, face: "top" | "bottom"): Face[] | null {
  const flat = (r: Vec2[], z: number): Vec3[] => r.map(p => ({ x: p.x, y: p.y, z }));
  if (t.type === "prism") return [{ outer: flat(t.footprint, face === "top" ? t.z1 : t.z0), holes: t.holes.map(h => flat(h, face === "top" ? t.z1 : t.z0)) }];
  if (t.type === "plane") return [{ outer: flat(t.outline, t.z), holes: t.holes.map(h => flat(h, t.z)) }];
  if (t.type === "mesh" && t.faces) return [t.faces[face]];
  return null;
}

const isHorizontal = (f: Face) => f.outer.every(p => Math.abs(p.z - f.outer[0].z) < 1e-7);
const xy = (r: Vec3[]): Vec2[] => r.map(p => ({ x: p.x, y: p.y }));

/** Körper als geschlossenes Netz (Prisma oder geschlossenes Netz), sonst null. */
export function meshOf(d: Derived3D): MeshData | null {
  if (d.type === "prism") return slabMesh(d.footprint, d.holes, () => d.z0, () => d.z1);
  if (d.type === "mesh" && d.closed) return d.mesh;
  return null;
}

const asMesh = (d: Derived3D, mesh: MeshData): Mesh3D => ({
  type: "mesh", source: d.source, sourceId: d.sourceId, sheetId: d.sheetId, color: d.color, order: d.order, mesh, closed: true,
});

/** Senkrechte Prismen exakt im Grundriss an einer waagerechten Fläche begrenzen (nur im Wirkbereich). */
function limitPrismFlat(d: Prism3D, f: Face, keep: "below" | "above"): Prism3D[] {
  const plane = f.outer[0].z;
  const P = toPoly(d.footprint, d.holes), F = toPoly(xy(f.outer), f.holes.map(xy));
  const inside = polygonClipping.intersection(P as any, F as any) as unknown as Poly[];
  if (!inside.length) return [d];
  const outside = polygonClipping.difference(P as any, F as any) as unknown as Poly[];
  const mk = (poly: Poly, z0: number, z1: number): Prism3D => ({ ...d, footprint: fromRing(poly[0]), holes: poly.slice(1).map(fromRing), z0, z1 });
  const out: Prism3D[] = outside.map(poly => mk(poly, d.z0, d.z1));
  for (const poly of inside) {
    const z0 = keep === "above" ? Math.max(d.z0, plane) : d.z0;
    const z1 = keep === "below" ? Math.min(d.z1, plane) : d.z1;
    if (z1 - z0 > EPS) out.push(mk(poly, z0, z1));
  }
  return out;
}

/** Beliebige Körper an einer (auch geneigten) Fläche begrenzen – nur innerhalb ihres Grundrisses. */
function limitMesh(d: Derived3D, f: Face, keep: "below" | "above"): Derived3D[] {
  const m = meshOf(d);
  if (!m) return [d];
  const pl = planeOfRing(f.outer);
  if (!pl) throw new Error("steep");
  const b = meshBounds(m);
  const zf = (p: Vec2) => pl.a * p.x + pl.b * p.y + pl.c;
  const hi = Math.max(b.maxZ, ...f.outer.map(p => p.z)) + 10, lo = Math.min(b.minZ, ...f.outer.map(p => p.z)) - 10;
  // Entfernt wird der Raum über (darunter behalten) bzw. unter (darüber behalten) der Fläche.
  const cutter = keep === "below"
    ? slabMesh(xy(f.outer), f.holes.map(xy), zf, () => hi)
    : slabMesh(xy(f.outer), f.holes.map(xy), () => lo, zf);
  if (!cutter) return [d];
  const r = csgMesh(m, cutter, "subtract");
  return r ? [asMesh(d, r)] : [];
}

/** Abhängigkeiten geordnet auswerten: wer ein Objekt verändert, läuft vor dem, der es benutzt. */
function orderRelations(list: { sk: string; tk: string; r: Relation3D }[]) {
  const modifies = (x: { sk: string; tk: string; r: Relation3D }) => (x.r.type === "cutout" ? x.tk : x.sk);
  const uses = (x: { sk: string; tk: string; r: Relation3D }) => (x.r.type === "cutout" ? x.sk : x.tk);
  const out: typeof list = [];
  const rest = list.slice();
  let guard = rest.length * rest.length + 1;
  while (rest.length && guard-- > 0) {
    const i = rest.findIndex(x => !rest.some(y => y !== x && modifies(y) === uses(x)));
    out.push(...rest.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

/** Wendet alle Beziehungen auf die abgeleiteten Körper an. */
export function applyRelations3D(items: Derived3D[], sources: RelationSource[]): { items: Derived3D[]; issues: RelationIssue[] } {
  const issues: RelationIssue[] = [];
  const byKey = new Map<string, Derived3D[]>();
  for (const d of items) {
    const k = objKey(d.sheetId, d.sourceId);
    const arr = byKey.get(k) || []; arr.push(d); byKey.set(k, arr);
    if (d.note) issues.push({ sourceKey: k, targetKey: k, message: d.note });
  }
  const rels: { sk: string; tk: string; r: Relation3D }[] = [];
  for (const s of sources) for (const r of s.relations3D || []) rels.push({ sk: objKey(s.sheetId, s.id), tk: objKey(r.targetSheetId, r.targetId), r });
  for (const { sk, tk, r } of orderRelations(rels)) {
    const src = byKey.get(sk) || [], tgt = byKey.get(tk);
    if (!tgt || !tgt.length) { issues.push({ sourceKey: sk, targetKey: tk, message: "Zielobjekt fehlt – Originalgeometrie bleibt erhalten." }); continue; }
    const before = { s: byKey.get(sk), t: byKey.get(tk) };
    try {
      if (r.type === "cutout") {
        const solids = src.filter(d => d.type === "prism" || (d.type === "mesh" && d.closed));
        if (!solids.length) { issues.push({ sourceKey: sk, targetKey: tk, message: "Quelle hat keinen Körper zum Durchbrechen." }); continue; }
        const allPrism = solids.every(d => d.type === "prism");
        // Ziel verliert nur das tatsächliche Schnittvolumen mit der Quelle – nie den Raum darüber/darunter.
        const cutters: MeshData[] = [];
        const prismCutters: Prism3D[] = [];
        for (const c of solids) {
          if (c.type === "prism") prismCutters.push(c);
          cutters.push(meshOf(c)!);
        }
        const out: Derived3D[] = [];
        for (const t of tgt) {
          if (allPrism && t.type === "prism") { out.push(...subtractPrism(t, prismCutters)); continue; }
          let m = meshOf(t);
          if (!m) { out.push(t); continue; }
          // Echtes Volumen der (auch geneigten) Quelle inkl. Aussparungen abziehen.
          for (const c of cutters) { if (!m) break; m = csgMesh(m, c, "subtract"); }
          if (m) out.push(asMesh(t, m));
        }
        byKey.set(tk, out);
      } else {
        const face = r.face === "bottom" ? "bottom" : "top";
        const keep = r.keep === "above" ? "above" : "below";
        const faces = tgt.map(t => facesOf(t, face));
        if (faces.some(f => !f)) { issues.push({ sourceKey: sk, targetKey: tk, message: "Die Zielfläche ist nicht eindeutig bestimmbar – Originalgeometrie bleibt erhalten." }); continue; }
        let cur: Derived3D[] = src;
        for (const f of faces.flat() as Face[]) {
          cur = cur.flatMap((d): Derived3D[] => {
            if (d.type !== "prism" && !(d.type === "mesh" && d.closed)) return [d];
            if (d.type === "prism" && isHorizontal(f)) return limitPrismFlat(d, f, keep);
            return limitMesh(d, f, keep);
          });
        }
        byKey.set(sk, cur);
      }
    } catch (e) {
      if (before.s) byKey.set(sk, before.s); if (before.t) byKey.set(tk, before.t);
      const steep = e instanceof Error && e.message === "steep";
      issues.push({ sourceKey: sk, targetKey: tk, message: steep ? "Die Zielfläche steht zu steil – Begrenzung nicht möglich, Originalgeometrie bleibt erhalten." : "Verschneidung fehlgeschlagen – Originalgeometrie bleibt erhalten." });
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

/** Höchste tatsächlich verbleibende Stelle eines Objekts (m). */
export function topOfItems(items: Derived3D[]): number | null {
  let top = -Infinity;
  for (const d of items) {
    if (d.type === "prism") top = Math.max(top, d.z1);
    else if (d.type === "plane" || d.type === "line") top = Math.max(top, d.z);
    else top = Math.max(top, meshBounds(d.mesh).maxZ);
  }
  return Number.isFinite(top) ? top : null;
}
