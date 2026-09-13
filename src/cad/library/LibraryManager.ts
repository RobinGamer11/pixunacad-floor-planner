/**
 * LibraryManager — alle Bibliotheksoperationen der eigenständigen
 * CAD-Oberfläche (Speichern, Platzieren, Umwandeln, Auflösen, Import/Export).
 *
 * Die bestehenden Zeichenwerkzeuge und das Sticker-System bleiben unberührt.
 * Undo/Redo entsteht automatisch über den Snapshot-Verlauf von `CadApp`:
 * Jede Operation läuft synchron und erzeugt daher genau einen Verlaufsschritt.
 */
import type { CadApp } from "../CadApp";
import type { Scene } from "../Scene";
import {
  createObjectsFromSnapshots,
  snapshotFromSceneObject,
  snapshotsCentroid,
  transformSnapshots,
  translateSnapshots,
} from "./libraryGeometry";
import { importSvgToSnapshots } from "./svgImport";
import { exportDefinitionToSvg } from "./svgExport";
import {
  exportDefinitionToPxobj,
  importDefinitionFromPxobj,
  newLibraryId,
} from "./librarySerde";
import type {
  LibraryDefinition,
  LibraryDefinitionMeta,
  LibraryGeometryKind,
  LibraryGeometrySnapshot,
  LibraryTransform,
} from "./types";

/* ----------------------------------------------------------- Auswahl */

const KIND_MAP: Record<string, LibraryGeometryKind> = {
  segment: "segment",
  hatch: "hatch",
  wall: "wall",
  dimension: "dimension",
  textbox: "textBox",
  table: "table",
  freeStroke: "freeStroke",
};

const UNSUPPORTED_LABELS: Record<string, string> = {
  document: "Dokument (PDF/Bild)",
  sticker: "Stempel-Instanz",
  library: "Bibliotheksobjekt",
  door: "Tür/Fenster",
};

export interface LibrarySelection {
  /** Welt-Snapshots aller unterstützten Objekte der Auswahl. */
  snapshots: LibraryGeometrySnapshot[];
  /** Referenzen der erfassten Objekte (für „umwandeln“ = löschen). */
  refs: { kind: string; id: string }[];
  /** Klartext-Liste nicht unterstützter Objektarten in der Auswahl. */
  unsupported: string[];
}

function sceneObject(scene: Scene, kind: string, id: string): any {
  const s = scene as any;
  switch (kind) {
    case "segment": return s.getSegmentById?.(id);
    case "hatch": return s.getHatchById?.(id);
    case "wall": return s.getWallById?.(id);
    case "dimension": return s.getDimensionById?.(id);
    case "textbox": return s.getTextBoxById?.(id);
    case "table": return s.getTableById?.(id);
    case "freeStroke": return s.getFreeStrokeById?.(id);
    default: return null;
  }
}

/** Sammelt die aktuelle Auswahl der CAD-Oberfläche für die Bibliothek. */
export function collectLibrarySelection(app: CadApp): LibrarySelection {
  const scene = app.scene as any;
  const refs: { kind: string; id: string }[] = [];
  const unsupported = new Set<string>();

  const multi: { kind: string; id: string }[] = (app as any).selectTool?.marqueeSelectedIds || [];
  if (multi.length > 0) {
    for (const r of multi) refs.push(r);
  } else {
    const sel: any = app.selection;
    if (sel) {
      if (sel.segmentId) refs.push({ kind: "segment", id: sel.segmentId });
      else if (sel.hatchId) refs.push({ kind: "hatch", id: sel.hatchId });
      else if (sel.wallId) refs.push({ kind: "wall", id: sel.wallId });
      else if (sel.dimensionId) refs.push({ kind: "dimension", id: sel.dimensionId });
      else if (sel.freeStrokeId) refs.push({ kind: "freeStroke", id: sel.freeStrokeId });
      else if (sel.textBoxId) {
        refs.push(scene.getTableById?.(sel.textBoxId)
          ? { kind: "table", id: sel.textBoxId }
          : { kind: "textbox", id: sel.textBoxId });
      }
      else if (sel.documentId) refs.push({ kind: "document", id: sel.documentId });
      else if (sel.stickerInstanceId) refs.push({ kind: "sticker", id: sel.stickerInstanceId });
      else if (sel.libraryInstanceId) refs.push({ kind: "library", id: sel.libraryInstanceId });
    }
  }

  const snapshots: LibraryGeometrySnapshot[] = [];
  const usedRefs: { kind: string; id: string }[] = [];
  for (const ref of refs) {
    // Tabellen kommen in der Mehrfachauswahl teils als "textbox" an.
    let kind = ref.kind;
    if (kind === "textbox" && scene.getTableById?.(ref.id)) kind = "table";
    const mapped = KIND_MAP[kind];
    if (!mapped) {
      unsupported.add(UNSUPPORTED_LABELS[kind] || kind);
      continue;
    }
    const obj = sceneObject(app.scene, kind, ref.id);
    if (!obj) continue;
    const snap = snapshotFromSceneObject(mapped, obj);
    if (!snap) continue;
    snapshots.push(snap);
    usedRefs.push({ kind, id: ref.id });
  }

  return { snapshots, refs: usedRefs, unsupported: [...unsupported] };
}

/* -------------------------------------------------------- Definitionen */

export function getDefinition(app: CadApp, id: string): LibraryDefinition | null {
  return (app.libraryDefinitions || []).find((d) => d.id === id) || null;
}

function buildDefinition(sel: LibrarySelection, meta: LibraryDefinitionMeta): LibraryDefinition | null {
  if (sel.snapshots.length === 0) return null;
  // Einfügepunkt ist immer der Mittelpunkt der Auswahl (kein Nullpunkt-Modus).
  const ip = snapshotsCentroid(sel.snapshots);
  const local = translateSnapshots(sel.snapshots, -ip.x, -ip.y);
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: newLibraryId(),
    version: 1,
    name: (meta.name || "").trim() || "Bibliotheksobjekt",
    category: (meta.category || "").trim(),
    tags: (meta.tags || []).map((t) => t.trim()).filter(Boolean),
    units: meta.units || "m",
    insertionPoint: { x: 0, y: 0 },
    metadata: {
      author: meta.author?.trim() || undefined,
      license: meta.license?.trim() || undefined,
      source: meta.source?.trim() || undefined,
    },
    geometry: local,
    createdAt: now,
    updatedAt: now,
  };
}

/** „Zur Bibliothek hinzufügen“ — die Objekte bleiben unverändert auf dem Blatt. */
export function addDefinitionFromSelection(
  app: CadApp,
  meta: LibraryDefinitionMeta,
): { definition: LibraryDefinition | null; unsupported: string[] } {
  const sel = collectLibrarySelection(app);
  const def = buildDefinition(sel, meta);
  if (def) {
    app.libraryDefinitions.push(def);
    app.onLibraryChange?.();
    app.commitHistorySnapshot?.();
  }
  return { definition: def, unsupported: sel.unsupported };
}

/** Entfernt die Original-Objekte einer erfassten Auswahl aus der Szene. */
function removeRefs(scene: Scene, refs: { kind: string; id: string }[]) {
  const s = scene as any;
  for (const { kind, id } of refs) {
    try {
      const o = sceneObject(scene, kind, id);
      if (!o) continue;
      switch (kind) {
        case "segment": s.removeSegment(o); break;
        case "hatch": s.removeHatch(o); break;
        case "wall": s.removeWall(o); break;
        case "dimension": s.removeDimension(o); break;
        case "textbox": s.removeTextBox(o); break;
        case "table": s.removeTable(o); break;
        case "freeStroke": s.removeFreeStroke(o); break;
      }
    } catch { /* einzelne Fehler dürfen den Vorgang nicht abbrechen */ }
  }
  scene.markWallsDirty();
}

/**
 * „In Bibliotheksobjekt umwandeln“ — die Auswahl wird durch genau eine
 * Bibliotheksinstanz ersetzt. Genau ein Undo-Schritt.
 */
export function convertSelectionToInstance(
  app: CadApp,
  meta: LibraryDefinitionMeta,
): { definition: LibraryDefinition | null; unsupported: string[] } {
  const sel = collectLibrarySelection(app);
  const def = buildDefinition(sel, meta);
  if (!def) return { definition: null, unsupported: sel.unsupported };

  const ip = snapshotsCentroid(sel.snapshots);
  app.libraryDefinitions.push(def);
  removeRefs(app.scene, sel.refs);
  const inst = app.scene.createLibraryInstance({
    definitionId: def.id,
    definitionVersion: def.version,
    position: { x: ip.x, y: ip.y },
    rotationRad: 0,
    scaleX: 1,
    scaleY: 1,
    labelId: app.activeDrawLabelId,
  });
  (app as any).selectTool.marqueeSelectedIds = [];
  app.setSelection({ type: "library_instance", libraryInstanceId: inst.id } as any);
  app.onLibraryChange?.();
  app.refreshLabelUI?.();
  app.commitHistorySnapshot?.();
  return { definition: def, unsupported: sel.unsupported };
}

export function renameDefinition(app: CadApp, id: string, name: string): boolean {
  const def = getDefinition(app, id);
  if (!def) return false;
  def.name = name.trim() || def.name;
  def.updatedAt = Date.now();
  app.onLibraryChange?.();
  app.commitHistorySnapshot?.();
  return true;
}

/** Löscht eine Definition samt aller platzierten Instanzen (alle Blätter/Pläne). */
export function removeDefinition(app: CadApp, id: string): boolean {
  const before = app.libraryDefinitions.length;
  app.libraryDefinitions = app.libraryDefinitions.filter((d) => d.id !== id);
  if (app.libraryDefinitions.length === before) return false;
  for (const scene of allScenes(app)) {
    const hits = scene.libraryInstances.filter((i) => i.definitionId === id);
    for (const h of hits) scene.removeLibraryInstance(h);
  }
  if ((app as any).libraryTool?.activeDefinitionId === id) (app as any).libraryTool?.cancel();
  app.clearSelection?.();
  app.onLibraryChange?.();
  app.refreshLabelUI?.();
  app.commitHistorySnapshot?.();
  return true;
}

function allScenes(app: CadApp): Scene[] {
  const out = new Set<Scene>();
  out.add(app.scene);
  for (const sc of (app as any).scenesById?.values?.() || []) out.add(sc);
  for (const sc of (app as any).planScenesById?.values?.() || []) out.add(sc);
  return [...out];
}

/* ----------------------------------------------------------- Platzieren */

export function placeLibraryInstance(
  app: CadApp,
  definitionId: string,
  world: { x: number; y: number },
  rotationRad = 0,
  scale = 1,
): string | null {
  const def = getDefinition(app, definitionId);
  if (!def) return null;
  const inst = app.scene.createLibraryInstance({
    definitionId: def.id,
    definitionVersion: def.version,
    position: { x: world.x, y: world.y },
    rotationRad,
    scaleX: scale,
    scaleY: scale,
    labelId: app.activeDrawLabelId,
  });
  app.refreshLabelUI?.();
  app.commitHistorySnapshot?.();
  return inst.id;
}

/** Welt-Snapshots einer Instanz (für Renderer, Hit-Test und Auflösen). */
export function instanceWorldSnapshots(
  def: LibraryDefinition,
  t: LibraryTransform,
): LibraryGeometrySnapshot[] {
  return transformSnapshots(def.geometry, t);
}

/**
 * „Auflösen“ — dauerhaft. Erzeugt normale PixunaCAD-Objekte, entfernt die
 * Instanz und wählt das Ergebnis aus. Genau ein Undo-Schritt.
 */
export function explodeLibraryInstance(app: CadApp, instanceId: string): boolean {
  const inst = app.scene.getLibraryInstanceById(instanceId);
  if (!inst) return false;
  const def = getDefinition(app, inst.definitionId);
  if (!def) return false;

  const world = instanceWorldSnapshots(def, {
    position: { x: inst.position.x, y: inst.position.y },
    rotationRad: inst.rotationRad,
    scaleX: inst.scaleX,
    scaleY: inst.scaleY,
  });
  const created = createObjectsFromSnapshots(app.scene, world, inst.labelId);
  app.scene.removeLibraryInstance(inst);
  app.clearSelection?.();
  const selectTool: any = (app as any).selectTool;
  if (selectTool) {
    selectTool.marqueeSelectedIds = created;
    selectTool.syncPrimarySelection?.();
  }
  app.refreshLabelUI?.();
  app.commitHistorySnapshot?.();
  return created.length > 0;
}

/* ------------------------------------------------------- Import/Export */

export function exportDefinition(app: CadApp, id: string): string | null {
  const def = getDefinition(app, id);
  return def ? exportDefinitionToPxobj(def) : null;
}

export function importDefinition(app: CadApp, json: string): LibraryDefinition | null {
  const def = importDefinitionFromPxobj(json);
  if (!def) return null;
  app.libraryDefinitions.push(def);
  app.onLibraryChange?.();
  app.commitHistorySnapshot?.();
  return def;
}

/* -------------------------------------------- Metadaten nachträglich ändern */

/**
 * Ändert die Metadaten einer bestehenden Definition. Geometrie und alle
 * platzierten Instanzen (Position, Drehung, Skalierung) bleiben unverändert.
 */
export function updateDefinitionMeta(
  app: CadApp,
  id: string,
  meta: LibraryDefinitionMeta,
): boolean {
  const def = getDefinition(app, id);
  if (!def) return false;
  def.name = (meta.name || "").trim() || def.name;
  def.category = (meta.category ?? def.category ?? "").trim();
  def.tags = (meta.tags || []).map((t) => t.trim()).filter(Boolean);
  def.units = meta.units || def.units;
  def.metadata = {
    author: meta.author?.trim() || undefined,
    license: meta.license?.trim() || undefined,
    source: meta.source?.trim() || undefined,
  };
  def.updatedAt = Date.now();
  app.onLibraryChange?.();
  app.commitHistorySnapshot?.();
  return true;
}

/* ------------------------------------------------------- Adapter-Import */

/**
 * Erzeugt eine Definition direkt aus Snapshots (Adapter-Pfad: SVG, später
 * DXF/DWG). Die Geometrie wird auf ihren Mittelpunkt zentriert.
 */
export function addDefinitionFromSnapshots(
  app: CadApp,
  snapshots: LibraryGeometrySnapshot[],
  meta: LibraryDefinitionMeta,
): LibraryDefinition | null {
  const def = buildDefinition({ snapshots, refs: [], unsupported: [] }, meta);
  if (!def) return null;
  app.libraryDefinitions.push(def);
  app.onLibraryChange?.();
  app.commitHistorySnapshot?.();
  return def;
}

/** SVG-Datei → neue Bibliotheksdefinition. */
export function importDefinitionFromSvg(
  app: CadApp,
  svgText: string,
  meta: LibraryDefinitionMeta,
  unitsPerMeter?: number,
): { definition: LibraryDefinition | null; warnings: string[] } {
  const res = importSvgToSnapshots(svgText, { unitsPerMeter });
  if (res.snapshots.length === 0) return { definition: null, warnings: res.warnings };
  return { definition: addDefinitionFromSnapshots(app, res.snapshots, meta), warnings: res.warnings };
}

/** Bibliotheksdefinition → SVG-Datei. */
export function exportDefinitionSvg(app: CadApp, id: string): string | null {
  const def = getDefinition(app, id);
  return def ? exportDefinitionToSvg(def) : null;
}
