/**
 * Objektartübergreifende Stapelreihenfolge innerhalb einer Ebene.
 *
 * `stackOrder` liegt optional am Objekt (serialisiert über `objectMeta.ts`).
 * Objekte ohne Wert erhalten die bisherige typbasierte Ordnung
 * (Dokumente unten … Bibliothekselemente oben) – Altprojekte bleiben optisch
 * unverändert. Größerer Schlüssel = weiter vorne.
 */

/** Zeichenlisten in bisheriger Reihenfolge (hinten → vorne). */
export const STACK_KEYS = [
  "documents", "hatches", "walls", "doors", "stairs", "segments",
  "freeStrokes", "dimensions", "textBoxes", "tables", "libraryInstances",
] as const;
export type StackListKey = typeof STACK_KEYS[number];

const KIND_TO_KEY: Record<string, StackListKey> = {
  document: "documents", hatch: "hatches", wall: "walls", door: "doors", stair: "stairs",
  segment: "segments", freeStroke: "freeStrokes", dimension: "dimensions",
  textbox: "textBoxes", table: "tables", library: "libraryInstances",
};

const RANK_STEP = 1_000_000;

export interface StackItem { key: StackListKey; obj: any; sk: number }

function listOf(scene: any, key: StackListKey): any[] {
  const l = scene?.[key];
  return Array.isArray(l) ? l : [];
}

/** Effektiver Stapelschlüssel (explizit oder typbasiert). */
export function stackKey(key: StackListKey, obj: any, index: number): number {
  const v = obj?.stackOrder;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return STACK_KEYS.indexOf(key) * RANK_STEP + index;
}

export function hasExplicitStackOrder(scene: any, labelId: string): boolean {
  for (const key of STACK_KEYS) for (const o of listOf(scene, key)) {
    if (o?.labelId === labelId && typeof o.stackOrder === "number") return true;
  }
  return false;
}

/** Alle Objekte einer Ebene, hinten → vorne (stabil). */
export function orderedLabelItems(scene: any, labelId: string): StackItem[] {
  const out: StackItem[] = [];
  for (const key of STACK_KEYS) {
    listOf(scene, key).forEach((obj, i) => {
      if (obj?.labelId === labelId) out.push({ key, obj, sk: stackKey(key, obj, i) });
    });
  }
  return out.sort((a, b) => a.sk - b.sk);
}

/** Schlüssel eines einzelnen Objekts (für Trefferreihenfolge). */
export function stackKeyOf(scene: any, key: StackListKey, obj: any): number {
  return stackKey(key, obj, listOf(scene, key).indexOf(obj));
}

function labelExtremes(scene: any, labelId: string): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const it of orderedLabelItems(scene, labelId)) { if (it.sk < min) min = it.sk; if (it.sk > max) max = it.sk; }
  return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0 };
}

export interface StackRef { kind: string; id: string }

/**
 * Bringt die Objekte nach vorne/hinten ihrer jeweiligen Ebene.
 * Relative Reihenfolge der Auswahl bleibt erhalten. Rückgabe: etwas geändert?
 */
export function moveStack(scene: any, refs: StackRef[], dir: "front" | "back", canEdit: (labelId: string) => boolean = () => true, dryRun = false): boolean {
  const byLabel = new Map<string, any[]>();
  const seen = new Set<any>();
  for (const r of refs) {
    const key = KIND_TO_KEY[r.kind];
    if (!key) continue;
    const obj = listOf(scene, key).find((o) => o?.id === r.id);
    if (!obj || seen.has(obj) || !canEdit(obj.labelId)) continue;
    seen.add(obj);
    const arr = byLabel.get(obj.labelId) || [];
    arr.push(obj);
    byLabel.set(obj.labelId, arr);
  }
  let changed = false;
  for (const [labelId, objs] of byLabel) {
    const items = orderedLabelItems(scene, labelId);
    const sel = items.filter((it) => seen.has(it.obj));
    const rest = items.filter((it) => !seen.has(it.obj));
    const next = dir === "front" ? [...rest, ...sel] : [...sel, ...rest];
    if (next.every((it, i) => it === items[i])) continue;
    void objs;
    changed = true;
    if (dryRun) continue;
    const { min, max } = labelExtremes(scene, labelId);
    if (dir === "front") sel.forEach((it, i) => { it.obj.stackOrder = max + 1 + i; });
    else sel.forEach((it, i) => { it.obj.stackOrder = min - sel.length + i; });
  }
  return changed;
}

/* ── Neue Objekte / Ebenenwechsel → oben ─────────────────────────────── */

const known = new WeakMap<object, Map<any, string>>();

/** Vergisst die bekannte Objektmenge (z. B. nach Undo/Laden). */
export function resetStackTracking(scene: any) { if (scene) known.delete(scene); }

/**
 * Neue Objekte und Objekte mit gewechselter Ebene kommen nach vorne.
 * Erster Aufruf je Szene merkt sich nur den Bestand.
 */
export function normalizeStackOrder(scene: any): void {
  if (!scene) return;
  const prev = known.get(scene);
  const now = new Map<any, string>();
  const pending: { key: StackListKey; obj: any }[] = [];
  for (const key of STACK_KEYS) for (const o of listOf(scene, key)) {
    if (!o) continue;
    now.set(o, o.labelId);
    if (prev && prev.get(o) !== o.labelId) pending.push({ key, obj: o });
  }
  for (const { obj } of pending) {
    delete obj.stackOrder;
    const { max } = labelExtremes(scene, obj.labelId);
    obj.stackOrder = max + 1;
  }
  known.set(scene, now);
}
