/**
 * Objektdaten (Name, Objekt-ID, Beschreibung) für alle CAD-Objekte.
 *
 * Werte liegen direkt am Objekt (`objName`, `objCode`, `objDesc`) und laufen
 * über die zentrale Serialisierung (`CadApp._serializeOneScene` → hier
 * `attachObjectMeta`, Laden → `restoreObjectMeta`) mit – damit auch Undo,
 * Blätter und Cloud. Alte Projekte ohne Felder bleiben unverändert lesbar.
 *
 * Objekt-ID = „<Name> - #<Code>“, Code = Buchstabe + 4 Ziffern (A0001 … A9999,
 * dann B0001 …). Nummeriert wird je Name; die volle ID ist im Projekt eindeutig.
 */
import { OBJECT_TYPE_LABELS, objectTypeKey } from "./selectionFilter";

export const SCENE_OBJECT_KEYS = [
  "segments", "hatches", "walls", "dimensions", "textBoxes", "tables",
  "libraryInstances", "documents", "freeStrokes", "doors", "stairs",
] as const;

/** Auswahl-Art (wie in SelectTool) je Szenen-Liste. */
const KIND_OF_KEY: Record<string, string> = {
  segments: "segment", hatches: "hatch", walls: "wall", dimensions: "dimension",
  textBoxes: "textbox", tables: "table", libraryInstances: "library", documents: "document",
  freeStrokes: "freeStroke", doors: "door", stairs: "stair",
};

export interface ObjectMeta { objName?: string; objCode?: string; objDesc?: string }

const CODE_RE = /^[A-Z]\d{4}$/;

export function codeFromIndex(n: number): string {
  const i = Math.max(1, Math.floor(n)) - 1;
  const letter = String.fromCharCode(65 + Math.min(25, Math.floor(i / 9999)));
  return letter + String((i % 9999) + 1).padStart(4, "0");
}

export function indexFromCode(code: string): number {
  if (!CODE_RE.test(code)) return 0;
  return (code.charCodeAt(0) - 65) * 9999 + Number(code.slice(1));
}

export function normalizeCode(raw: string): string {
  return String(raw || "").trim().replace(/^#/, "").toUpperCase();
}

/** Automatischer Name je Werkzeug/Objektart. */
export function autoObjectName(kind: string, obj: any): string {
  if (kind === "door") return obj?.kind === "window" ? "Fenster" : "Tür";
  const key = objectTypeKey(kind, obj);
  if (key === "document") return "Dokument";
  if (key === "library") return "Bibliotheksobjekt";
  return OBJECT_TYPE_LABELS[key] ?? "Objekt";
}

export function objectDisplayName(kind: string, obj: any): string {
  const n = typeof obj?.objName === "string" ? obj.objName.trim() : "";
  return n || autoObjectName(kind, obj);
}

export function formatObjectId(kind: string, obj: any): string {
  return obj?.objCode ? `${objectDisplayName(kind, obj)} - #${obj.objCode}` : objectDisplayName(kind, obj);
}

/** Alle Objekte aller übergebenen Szenen. */
export function* iterSceneObjects(scenes: any[]): Generator<{ kind: string; obj: any }> {
  for (const sc of scenes) {
    if (!sc) continue;
    for (const key of SCENE_OBJECT_KEYS) {
      for (const obj of (sc[key] || []) as any[]) if (obj) yield { kind: KIND_OF_KEY[key], obj };
    }
  }
}

function idTaken(scenes: any[], self: any, name: string, code: string): boolean {
  for (const { kind, obj } of iterSceneObjects(scenes)) {
    if (obj === self || obj.objCode !== code) continue;
    if (objectDisplayName(kind, obj) === name) return true;
  }
  return false;
}

function nextFreeCode(scenes: any[], self: any, name: string): string {
  let max = 0;
  for (const { kind, obj } of iterSceneObjects(scenes)) {
    if (obj === self || !obj.objCode) continue;
    if (objectDisplayName(kind, obj) === name) max = Math.max(max, indexFromCode(obj.objCode));
  }
  let n = max + 1;
  while (idTaken(scenes, self, name, codeFromIndex(n))) n++;
  return codeFromIndex(n);
}

/** Vergibt eine eindeutige ID, falls keine vorhanden oder doppelt. true = geändert. */
export function ensureObjectCode(scenes: any[], kind: string, obj: any): boolean {
  if (!obj) return false;
  const name = objectDisplayName(kind, obj);
  if (obj.objCode && CODE_RE.test(obj.objCode) && !idTaken(scenes, obj, name, obj.objCode)) return false;
  obj.objCode = nextFreeCode(scenes, obj, name);
  return true;
}

/** Manuelle ID-Änderung. Liefert eine Fehlermeldung oder null bei Erfolg. */
export function setObjectCode(scenes: any[], kind: string, obj: any, raw: string): string | null {
  const code = normalizeCode(raw);
  if (!CODE_RE.test(code)) return "Format: Buchstabe + 4 Ziffern, z. B. A0001";
  if (idTaken(scenes, obj, objectDisplayName(kind, obj), code)) return "Diese ID ist im Projekt bereits vergeben";
  obj.objCode = code;
  return null;
}

/** Name ändern; die ID bleibt erhalten, außer sie wäre mit dem neuen Namen doppelt. */
export function setObjectName(scenes: any[], kind: string, obj: any, name: string) {
  obj.objName = name;
  if (obj.objCode && idTaken(scenes, obj, objectDisplayName(kind, obj), obj.objCode)) {
    obj.objCode = nextFreeCode(scenes, obj, objectDisplayName(kind, obj));
  }
}

export function copyObjectMeta(obj: any, opts: { withCode?: boolean } = {}): ObjectMeta {
  const out: ObjectMeta = {};
  if (typeof obj?.objName === "string" && obj.objName) out.objName = obj.objName;
  if (typeof obj?.objDesc === "string" && obj.objDesc) out.objDesc = obj.objDesc;
  if (opts.withCode !== false && typeof obj?.objCode === "string" && obj.objCode) out.objCode = obj.objCode;
  return out;
}

export function applyObjectMeta(obj: any, src: any, opts: { withCode?: boolean } = {}) {
  if (!obj || !src) return;
  const m = copyObjectMeta(src, opts);
  if (m.objName) obj.objName = m.objName;
  if (m.objDesc) obj.objDesc = m.objDesc;
  if (m.objCode) obj.objCode = m.objCode;
}

/** Hängt die Objektdaten an eine serialisierte Szene (Zuordnung über id). */
export function attachObjectMeta(out: any, scene: any) {
  for (const key of SCENE_OBJECT_KEYS) {
    const list = out?.[key];
    const src = (scene?.[key] || []) as any[];
    if (!Array.isArray(list) || !src.length) continue;
    const byId = new Map<string, any>();
    for (const o of src) if (o?.id) byId.set(o.id, o);
    list.forEach((item: any, i: number) => {
      if (!item || typeof item !== "object") return;
      const o = (item.id && byId.get(item.id)) || (list.length === src.length ? src[i] : null);
      if (o) Object.assign(item, copyObjectMeta(o));
    });
  }
}

export function sceneObjectCounts(scene: any): Record<string, number> {
  const c: Record<string, number> = {};
  for (const key of SCENE_OBJECT_KEYS) c[key] = (scene?.[key] || []).length;
  return c;
}

/** Überträgt Objektdaten nach dem Laden (neue Objekte = ab `before`). */
export function restoreObjectMeta(scene: any, data: any, before: Record<string, number>) {
  if (!data) return;
  for (const key of SCENE_OBJECT_KEYS) {
    const raw = data[key];
    if (!Array.isArray(raw) || !raw.some((r: any) => r && (r.objName || r.objCode || r.objDesc))) continue;
    const created = ((scene?.[key] || []) as any[]).slice(before[key] ?? 0);
    if (created.length !== raw.length) continue;
    raw.forEach((r: any, i: number) => applyObjectMeta(created[i], r));
  }
}
