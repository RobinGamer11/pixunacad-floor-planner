/**
 * Änderungserkennung je Objekt.
 *
 * Grundlage ist der ohnehin erzeugte Serialisierungsstand des CAD
 * (`_serializeScene` → `scenesById`). Statt den kompletten Projektstand zu
 * übertragen, wird der vorherige mit dem neuen Stand Objekt für Objekt
 * verglichen; daraus entstehen einzelne Operationen.
 */
import {
  CAD_LIBRARY_KINDS,
  CAD_LIBRARY_SHEET_ID,
  CAD_OBJECT_KINDS,
  type CadObjectKind,
  type LocalCadOp,
} from "./types";

/** sheetId → kind → objectId → JSON-Text des Objekts. */
export type SceneIndex = Map<string, Map<CadObjectKind, Map<string, string>>>;

interface RawSnapshot {
  scenesById?: Record<string, Record<string, unknown>>;
  activeSheetId?: string;
  [key: string]: unknown;
}

function indexOneScene(scene: Record<string, unknown> | undefined): Map<CadObjectKind, Map<string, string>> {
  const out = new Map<CadObjectKind, Map<string, string>>();
  for (const kind of CAD_OBJECT_KINDS) {
    const list = (scene?.[kind] as unknown[]) || [];
    const byId = new Map<string, string>();
    if (Array.isArray(list)) {
      for (const obj of list) {
        const id = (obj as { id?: unknown } | null)?.id;
        if (typeof id !== "string" || !id) continue;
        byId.set(id, JSON.stringify(obj));
      }
    }
    out.set(kind, byId);
  }
  return out;
}

/** Zerlegt einen Serialisierungsstand in vergleichbare Einzelobjekte. */
export function indexSnapshot(snapshot: string | null | undefined): SceneIndex {
  const index: SceneIndex = new Map();
  if (!snapshot) return index;
  let data: RawSnapshot;
  try { data = JSON.parse(snapshot) as RawSnapshot; } catch { return index; }
  const scenes = data.scenesById;
  if (scenes && typeof scenes === "object") {
    for (const sheetId of Object.keys(scenes)) index.set(sheetId, indexOneScene(scenes[sheetId]));
  } else if (typeof data.activeSheetId === "string") {
    // Altstand ohne `scenesById`: nur die aktive Seite.
    index.set(data.activeSheetId, indexOneScene(data as Record<string, unknown>));
  }
  return index;
}

/** Vergleicht zwei Stände und liefert die betroffenen Einzelobjekte. */
export function diffSceneIndexes(prev: SceneIndex, next: SceneIndex): LocalCadOp[] {
  const ops: LocalCadOp[] = [];
  for (const [sheetId, kinds] of next) {
    const prevKinds = prev.get(sheetId);
    for (const [kind, byId] of kinds) {
      const prevById = prevKinds?.get(kind);
      for (const [objectId, json] of byId) {
        const before = prevById?.get(objectId);
        if (before === json) continue;
        ops.push({
          sheetId,
          objectId,
          objectKind: kind,
          changeType: before === undefined ? "create" : "update",
          payload: JSON.parse(json) as Record<string, unknown>,
        });
      }
      if (prevById) {
        for (const objectId of prevById.keys()) {
          if (byId.has(objectId)) continue;
          ops.push({ sheetId, objectId, objectKind: kind, changeType: "delete", payload: null });
        }
      }
    }
  }
  // Entfernte Seiten: deren Objekte gelten als gelöscht.
  for (const [sheetId, kinds] of prev) {
    if (next.has(sheetId)) continue;
    for (const [kind, byId] of kinds) {
      for (const objectId of byId.keys()) {
        ops.push({ sheetId, objectId, objectKind: kind, changeType: "delete", payload: null });
      }
    }
  }
  return ops;
}

/** Bequemer Direktvergleich zweier Serialisierungsstände. */
export function diffSnapshots(prev: string | null | undefined, next: string | null | undefined): LocalCadOp[] {
  return diffSceneIndexes(indexSnapshot(prev), indexSnapshot(next));
}
