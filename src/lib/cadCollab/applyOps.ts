/**
 * Eingehende Objektänderungen lokal anwenden.
 *
 * Es wird ausschließlich das betroffene Objekt ersetzt oder entfernt – die
 * Zeichenfläche wird nicht neu aufgebaut, die Auswahl bleibt erhalten und das
 * aktive Werkzeug wechselt nicht.
 */
import type { Scene } from "@/cad/Scene";
import { appendSceneObjects } from "@/cad/sceneSerde";
import type { CadObjectKind, CadObjectOp } from "./types";

interface KindOps {
  /** Vorhandenes Objekt mit dieser ID entfernen. */
  remove(scene: Scene, id: string): void;
  /** Feldname der Objektliste in der Szene. */
  field: CadObjectKind;
  /** ID-Zuordnung nach dem Einfügen neu aufbauen. */
  rebuild(scene: Scene): void;
}

const anyScene = (scene: Scene) => scene as unknown as Record<string, any>;

const KIND_OPS: Record<CadObjectKind, KindOps> = {
  segments: {
    field: "segments",
    remove: (s, id) => { const o = s.getSegmentById(id); if (o) s.removeSegment(o); },
    rebuild: (s) => anyScene(s)._rebuildSegIdMap?.(),
  },
  hatches: {
    field: "hatches",
    remove: (s, id) => { const o = s.getHatchById(id); if (o) s.removeHatch(o); },
    rebuild: (s) => anyScene(s)._rebuildHatchIdMap?.(),
  },
  walls: {
    field: "walls",
    remove: (s, id) => { const o = s.getWallById(id); if (o) s.removeWall(o); },
    rebuild: (s) => s.markWallsDirty(),
  },
  dimensions: {
    field: "dimensions",
    remove: (s, id) => { const o = s.getDimensionById(id); if (o) s.removeDimension(o); },
    rebuild: (s) => anyScene(s)._rebuildDimIdMap?.(),
  },
  textBoxes: {
    field: "textBoxes",
    remove: (s, id) => { const o = s.getTextBoxById(id); if (o) s.removeTextBox(o); },
    rebuild: (s) => anyScene(s)._rebuildTextIdMap?.(),
  },
  tables: {
    field: "tables",
    remove: (s, id) => { const o = anyScene(s).getTableById?.(id); if (o) anyScene(s).removeTable?.(o); },
    rebuild: (s) => anyScene(s)._rebuildTableIdMap?.(),
  },
  libraryInstances: {
    field: "libraryInstances",
    remove: (s, id) => { const o = anyScene(s).getLibraryInstanceById?.(id); if (o) anyScene(s).removeLibraryInstance?.(o); },
    rebuild: (s) => anyScene(s)._rebuildLibraryIdMap?.(),
  },
  documents: {
    field: "documents",
    remove: (s, id) => { const o = s.getDocumentById(id); if (o) s.removeDocument(o); },
    rebuild: (s) => anyScene(s)._rebuildDocIdMap?.(),
  },
  freeStrokes: {
    field: "freeStrokes",
    remove: (s, id) => { const o = s.getFreeStrokeById(id); if (o) s.removeFreeStroke(o); },
    rebuild: (s) => anyScene(s)._rebuildFreeIdMap?.(),
  },
  doors: {
    field: "doors",
    remove: (s, id) => { const o = s.getDoorById(id); if (o) s.removeDoor(o); },
    rebuild: () => { /* Türen haben keine ID-Zuordnung. */ },
  },
};

/**
 * Wendet eine einzelne Objektänderung auf eine Szene an.
 * Rückgabe: true, wenn sich die Szene geändert hat.
 */
export function applyOpToScene(
  scene: Scene,
  kind: CadObjectKind,
  objectId: string,
  changeType: CadObjectOp["changeType"],
  payload: Record<string, unknown> | null,
): boolean {
  const ops = KIND_OPS[kind];
  if (!ops) return false;

  ops.remove(scene, objectId);
  if (changeType === "delete") {
    ops.rebuild(scene);
    return true;
  }
  if (!payload) return true;

  const list = anyScene(scene)[ops.field] as unknown[] | undefined;
  const before = Array.isArray(list) ? list.length : 0;
  appendSceneObjects(scene, { [ops.field]: [payload] } as never);
  const after = anyScene(scene)[ops.field] as unknown[] | undefined;
  if (Array.isArray(after)) {
    // Identität sicherstellen: die Objekt-ID bleibt über alle Geräte gleich.
    for (let i = before; i < after.length; i++) {
      (after[i] as { id?: string }).id = objectId;
    }
  }
  ops.rebuild(scene);
  return true;
}
