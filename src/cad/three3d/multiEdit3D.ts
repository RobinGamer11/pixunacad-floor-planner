/**
 * Mehrfachauswahl in 3D: gemeinsame Zahlen-Eigenschaften.
 * Ein Feld erscheint nur, wenn alle ausgewählten Objekte es besitzen;
 * gleiche Werte werden angezeigt, abweichende als „Verschieden“ (null).
 */
import { libraryBodyHeightM } from "../objectMeta";

export interface SelItem { kind: string; obj: any }
export interface SharedField {
  key: string; label: string; value: number | null; min: number; minExclusive: boolean;
  /** Schreibt den Wert in alle Objekte (Aufrufer bündelt in einem runAction). */
  write: (v: number) => void;
}

interface Acc { read: (o: any) => number; write: (o: any, v: number) => void; minExclusive: boolean }

function bodyHeight(x: SelItem): Acc | null {
  if (x.kind === "wall") return { read: o => Number(o.heightM) || 0, write: (o, v) => { o.heightM = v; }, minExclusive: true };
  if (x.kind === "hatch" && x.obj?.isPolygon !== true) return { read: o => Math.max(0, Number(o.heightM) || 0), write: (o, v) => { o.heightM = v; }, minExclusive: false };
  if (x.kind === "library") return { read: o => libraryBodyHeightM(o), write: (o, v) => { o.bodyHeightM = v; }, minExclusive: true };
  return null;
}

export function commonNumber(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.every(v => Math.abs(v - vals[0]) < 1e-9) ? vals[0] : null;
}

function field(key: string, label: string, items: SelItem[], accs: (Acc | null)[]): SharedField | null {
  if (items.length < 2 || accs.some(a => !a)) return null;
  const a = accs as Acc[];
  return {
    key, label, min: 0,
    minExclusive: a.some(x => x.minExclusive),
    value: commonNumber(items.map((x, i) => a[i].read(x.obj))),
    write: (v) => items.forEach((x, i) => a[i].write(x.obj, v)),
  };
}

export function sharedFields3D(items: SelItem[]): SharedField[] {
  const out: SharedField[] = [];
  const allWalls = items.every(x => x.kind === "wall");
  const body = field("body", allWalls ? "Körperhöhe (Wandhöhe)" : "Körperhöhe", items, items.map(bodyHeight));
  if (body) out.push(body);
  if (items.length > 1 && items.every(x => x.kind === "door")) {
    const allWin = items.every(x => x.obj?.kind === "window");
    const h: Acc = { read: o => Math.max(0, Number(o.heightM) || 0), write: (o, v) => { o.heightM = v; }, minExclusive: true };
    const s: Acc = { read: o => Number(o.breakHeightM) || 0, write: (o, v) => { o.breakHeightM = v; }, minExclusive: false };
    out.push(field("openingHeight", "Körperhöhe (Öffnungshöhe)", items, items.map(() => h))!);
    const sill = field("sill", allWin ? "Brüstung (über Wand)" : "Unterkante (über Wand)", items, items.map(() => s))!;
    sill.min = -Infinity; out.push(sill);
  }
  return out;
}
