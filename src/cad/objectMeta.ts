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
import { normalizeMaterial, type Material3D } from "./three3d/materials";
import type { Tilt3D } from "./three3d/tiltGeometry";
import { normalizedPose, type MatrixData } from "./three3d/spatialTransform";
export type { Tilt3D } from "./three3d/tiltGeometry";

export const SCENE_OBJECT_KEYS = [
  "segments", "hatches", "walls", "dimensions", "textBoxes", "tables",
  "libraryInstances", "documents", "freeStrokes", "doors", "stairs", "infoBoxes",
] as const;

/** Auswahl-Art (wie in SelectTool) je Szenen-Liste. */
const KIND_OF_KEY: Record<string, string> = {
  segments: "segment", hatches: "hatch", walls: "wall", dimensions: "dimension",
  textBoxes: "textbox", tables: "table", libraryInstances: "library", documents: "document",
  freeStrokes: "freeStroke", doors: "door", stairs: "stair", infoBoxes: "infobox",
};

/** Referenz-Kategorie einer Anlage (optional; alte Anlagen ohne Kategorie bleiben gültig). */
export type AttachmentCategory = "Material" | "Vorderseite" | "Rückseite" | "Seitenansicht";
export const ATTACHMENT_CATEGORIES: AttachmentCategory[] = ["Material", "Vorderseite", "Rückseite", "Seitenansicht"];
export interface ObjectAttachment { id: string; name: string; type: string; size: number; dataUrl: string; category?: AttachmentCategory }
export interface ObjectMeta { objName?: string; objCode?: string; objDesc?: string; objAttachments?: ObjectAttachment[]; elevationM?: number; pose3D?: MatrixData; relations3D?: Relation3D[]; stackOrder?: number; tilt3D?: Tilt3D; bodyHeightM?: number; material3D?: Material3D; frameMaterial3D?: Material3D; panelMaterial3D?: Material3D; open3D?: boolean; size3DM?: number; thickness3DM?: number }

/** 3D-Körperbeziehung, am Quellobjekt gespeichert (Ziel über Blatt + Objekt-ID). */
export interface Relation3D { type: "cutout" | "limitToSurface"; targetSheetId: string; targetId: string; face?: "top" | "bottom"; keep?: "below" | "above"; /** Veraltet (ohne Wirkung, nur Altdaten). */ edge?: "top" | "bottom"; /** Nur "cutout": Quelle wird an der Außenkante des Ziels abgeschnitten („Körper abgeschnitten“); fehlt = „Körper vollständig“. */ trim?: boolean }

/** 3D: Objekthöhe relativ zum Blatt (m). Fehlend = 0. */
export function objectElevationM(obj: any): number {
  const v = obj?.elevationM;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Räumliche Körperhöhe eines Bibliothekselements (nie die 2D-Größe). */
export function libraryBodyHeightM(li: any, fallback = 1): number {
  const v = li?.bodyHeightM;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return Number.isFinite(li?.heightM) && li.heightM > 0 ? li.heightM : fallback;
}

/** Maximaler Anlagenspeicher je Objekt (Bytes). */
export const MAX_ATTACHMENT_BYTES_PER_OBJECT = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"];

export function attachmentBytes(obj: any): number {
  return ((obj?.objAttachments || []) as ObjectAttachment[]).reduce((n, a) => n + (a?.size || 0), 0);
}

/** Fügt Anlagen hinzu, solange das 5-MB-Limit nicht überschritten wird. Liefert abgewiesene Namen. */
export function addAttachments(obj: any, items: ObjectAttachment[]): string[] {
  const list: ObjectAttachment[] = Array.isArray(obj.objAttachments) ? obj.objAttachments.slice() : [];
  let used = attachmentBytes(obj);
  const rejected: string[] = [];
  for (const a of items) {
    if (!ATTACHMENT_TYPES.includes(a.type) || used + a.size > MAX_ATTACHMENT_BYTES_PER_OBJECT) { rejected.push(a.name); continue; }
    list.push(a); used += a.size;
  }
  obj.objAttachments = list;
  return rejected;
}

/** Mehrfachauswahl: gleicher Name für alle; IDs werden fortlaufend und eindeutig neu vergeben. */
export function setObjectNameMany(scenes: any[], items: { kind: string; obj: any }[], name: string) {
  if (items.length === 1) { setObjectName(scenes, items[0].kind, items[0].obj, name); return; }
  for (const { obj } of items) { obj.objName = name; obj.objCode = undefined; }
  for (const { kind, obj } of items) ensureObjectCode(scenes, kind, obj);
}

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
  const before = objectDisplayName(kind, obj);
  obj.objName = name;
  const after = objectDisplayName(kind, obj);
  // Neuer Name → Nummerierung dieses Namens neu bestimmen (unbenutzt = A0001)
  if (obj.objCode && (before !== after || idTaken(scenes, obj, after, obj.objCode))) {
    obj.objCode = nextFreeCode(scenes, obj, objectDisplayName(kind, obj));
  }
}

export function copyObjectMeta(obj: any, opts: { withCode?: boolean } = {}): ObjectMeta {
  const out: ObjectMeta = {};
  const pose = normalizedPose(obj?.pose3D); if (pose) out.pose3D = pose;
  if (typeof obj?.objName === "string" && obj.objName) out.objName = obj.objName;
  if (typeof obj?.objDesc === "string" && obj.objDesc) out.objDesc = obj.objDesc;
  if (Array.isArray(obj?.objAttachments) && obj.objAttachments.length) out.objAttachments = obj.objAttachments.map((a: ObjectAttachment) => ({ ...a }));
  if (typeof obj?.elevationM === "number" && Number.isFinite(obj.elevationM)) out.elevationM = obj.elevationM;
  for (const key of ["material3D", "frameMaterial3D", "panelMaterial3D"] as const) { const m = normalizeMaterial(obj?.[key]); if (m) out[key] = m; }
  if (typeof obj?.open3D === "boolean") out.open3D = obj.open3D;
  for (const key of ["size3DM", "thickness3DM"] as const) if (Number.isFinite(obj?.[key]) && obj[key] > 0) out[key] = obj[key];
  // Räumliche Form gehört zum Objekt: Kopien behalten Neigung und Körperhöhe.
  const t = obj?.tilt3D;
  if (t && Number.isFinite(t.angleDeg) && t.angleDeg !== 0 && t.a && t.b) out.tilt3D = { edgeIndex: t.edgeIndex | 0, a: { x: +t.a.x, y: +t.a.y }, b: { x: +t.b.x, y: +t.b.y }, count: t.count | 0, angleDeg: +t.angleDeg, ...(t.mode === "lift" ? { mode: "lift" as const } : {}), ...(t.plumb === true ? { plumb: true } : {}), ...(t.plumb === true && t.anchor === "bottom" ? { anchor: "bottom" as const } : {}), ...(t.basis === "plan" || t.basis === "actual" ? { basis: t.basis } : {}), ...(["top", "bottom", "left", "right"].includes(t.cardinal) ? { cardinal: t.cardinal } : {}), ...(t.opposite === true ? { opposite: true } : {}) };
  if (typeof obj?.bodyHeightM === "number" && Number.isFinite(obj.bodyHeightM) && obj.bodyHeightM > 0) out.bodyHeightM = obj.bodyHeightM;
  // Beziehungen hängen an der Identität: Kopien (ohne Kennung) übernehmen sie nicht.
  if (opts.withCode !== false && Array.isArray(obj?.relations3D) && obj.relations3D.length) out.relations3D = obj.relations3D.map((r: Relation3D) => ({ ...r }));
  // Stapelreihenfolge gehört zur Identität; Kopien kommen ohnehin nach vorne.
  if (opts.withCode !== false && typeof obj?.stackOrder === "number" && Number.isFinite(obj.stackOrder)) out.stackOrder = obj.stackOrder;
  if (opts.withCode !== false && typeof obj?.objCode === "string" && obj.objCode) out.objCode = obj.objCode;
  return out;
}

export function applyObjectMeta(obj: any, src: any, opts: { withCode?: boolean } = {}) {
  if (!obj || !src) return;
  const m = copyObjectMeta(src, opts);
  if (m.objName) obj.objName = m.objName;
  if (m.objDesc) obj.objDesc = m.objDesc;
  if (m.objCode) obj.objCode = m.objCode;
  if (m.objAttachments) obj.objAttachments = m.objAttachments;
  if (typeof m.elevationM === "number") obj.elevationM = m.elevationM;
  if (m.relations3D) obj.relations3D = m.relations3D;
  if (typeof m.stackOrder === "number") obj.stackOrder = m.stackOrder;
  if (m.tilt3D) obj.tilt3D = m.tilt3D;
  if (m.pose3D) obj.pose3D = m.pose3D;
  if (typeof m.bodyHeightM === "number") obj.bodyHeightM = m.bodyHeightM;
  for (const key of ["material3D", "frameMaterial3D", "panelMaterial3D", "open3D", "size3DM", "thickness3DM"] as const) if (m[key] !== undefined) obj[key] = m[key];
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
    if (!Array.isArray(raw) || !raw.some((r: any) => r && (r.pose3D || r.objName || r.objCode || r.objDesc || r.objAttachments || typeof r.elevationM === "number" || r.relations3D || typeof r.stackOrder === "number" || r.tilt3D || typeof r.bodyHeightM === "number" || r.material3D || r.frameMaterial3D || r.panelMaterial3D || typeof r.open3D === "boolean" || r.size3DM || r.thickness3DM))) continue;
    const created = ((scene?.[key] || []) as any[]).slice(before[key] ?? 0);
    if (created.length !== raw.length) continue;
    raw.forEach((r: any, i: number) => applyObjectMeta(created[i], r));
  }
}
