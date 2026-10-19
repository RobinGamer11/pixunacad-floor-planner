/**
 * Brücke zwischen der einen CadApp und der 3D-Ansicht. Die 3D-Ansicht hat keine
 * eigene Planung/Auswahl/Verlauf: Lesen geschieht über diese Funktionen,
 * Änderungen nur über `CadApp.runAction` (genau ein Undo-Schritt).
 */
import type { CadApp } from "../CadApp";
import { SelectionType } from "../constants";
import { snapshotsBounds } from "../library/libraryGeometry";
import { deriveProject3D, type Derived3D } from "./geometryDerivation";
import { applyRelations3D, objKey, wouldCreateCycle, type Relation3D, type RelationIssue, type RelationSource } from "./relations";

export const OBJECT_LISTS = ["walls", "hatches", "stairs", "documents", "textBoxes", "tables", "libraryInstances", "segments", "dimensions", "freeStrokes"] as const;

const sceneOf = (app: CadApp, id: string) => (app as any).scenesById?.get(id) || (id === app.activeSheetId ? (app as any).scene : null);

export function findObject(app: CadApp, sheetId: string, id: string): { obj: any; list: string } | null {
  const sc = sceneOf(app, sheetId);
  if (!sc) return null;
  for (const l of OBJECT_LISTS) {
    const o = (sc[l] || []).find((x: any) => x?.id === id);
    if (o) return { obj: o, list: l };
  }
  return null;
}

function relationSources(app: CadApp): RelationSource[] {
  const out: RelationSource[] = [];
  for (const sh of app.sheetManager.list()) {
    const sc = sceneOf(app, sh.id);
    if (!sc) continue;
    for (const l of OBJECT_LISTS) for (const o of sc[l] || []) {
      if (o?.relations3D?.length) out.push({ sheetId: sh.id, id: o.id, relations3D: o.relations3D });
    }
  }
  return out;
}

export function deriveFromApp(app: CadApp): { items: Derived3D[]; issues: RelationIssue[] } {
  const raw = deriveProject3D(app.sheetManager.list(), id => sceneOf(app, id), {
    activeSheetId: app.activeSheetId,
    libraryBounds: (defId) => {
      const def: any = app.getLibraryDefinition(defId);
      return def?.geometry ? snapshotsBounds(def.geometry) : null;
    },
  });
  return applyRelations3D(raw, relationSources(app));
}

/** 3D-Auswahl → gemeinsame CAD-Auswahl (wechselt bei Bedarf eindeutig das Blatt). */
export function selectInCad(app: CadApp, sheetId: string, id: string) {
  const hit = findObject(app, sheetId, id);
  if (!hit) return;
  if (app.activeSheetId !== sheetId) app.setActiveSheetId(sheetId);
  const map: Record<string, any> = {
    walls: { type: SelectionType.WALL, wallId: id },
    hatches: { type: SelectionType.HATCH, hatchId: id },
    stairs: { type: (SelectionType as any).STAIR, stairId: id },
    documents: { type: SelectionType.DOCUMENT, documentId: id },
    textBoxes: { type: SelectionType.TEXTBOX, textBoxId: id },
    tables: { type: SelectionType.TEXTBOX, textBoxId: id },
    libraryInstances: { type: SelectionType.LIBRARY_INSTANCE, libraryInstanceId: id },
    segments: { type: SelectionType.SEGMENT, segmentId: id },
    dimensions: { type: SelectionType.DIMENSION, dimensionId: id },
    freeStrokes: { type: SelectionType.FREE_STROKE, freeStrokeId: id },
  };
  try { app.setSelection({ ...map[hit.list], handleIndex: null } as any); } catch { /* Auswahl nicht möglich */ }
}

export function setSheetIn3D(app: CadApp, sheetId: string, on: boolean) {
  app.runAction(() => { app.sheetManager.setParticipatesIn3D(sheetId, on); });
}

export function setSheetElevation(app: CadApp, sheetId: string, m: number) {
  if (!Number.isFinite(m)) return;
  app.runAction(() => { app.sheetManager.setElevation(sheetId, m); });
}

export function addRelation(app: CadApp, src: { sheetId: string; id: string }, rel: Relation3D): string | null {
  const s = findObject(app, src.sheetId, src.id);
  if (!s) return "Quellobjekt nicht gefunden.";
  if (!findObject(app, rel.targetSheetId, rel.targetId)) return "Zielobjekt nicht gefunden.";
  if (wouldCreateCycle(relationSources(app), objKey(src.sheetId, src.id), objKey(rel.targetSheetId, rel.targetId)))
    return "Diese Beziehung würde einen Kreisbezug erzeugen.";
  app.runAction(() => {
    const list: Relation3D[] = (s.obj.relations3D || []).filter((r: Relation3D) => !(r.targetSheetId === rel.targetSheetId && r.targetId === rel.targetId));
    s.obj.relations3D = [...list, { ...rel }];
  });
  return null;
}

export function removeRelation(app: CadApp, src: { sheetId: string; id: string }, index: number) {
  const s = findObject(app, src.sheetId, src.id);
  if (!s?.obj.relations3D) return;
  app.runAction(() => {
    const next = s.obj.relations3D.filter((_: any, i: number) => i !== index);
    if (next.length) s.obj.relations3D = next; else delete s.obj.relations3D;
  });
}

export function objectLabel(app: CadApp, sheetId: string, id: string): string {
  const hit = findObject(app, sheetId, id);
  const sheet = app.sheetManager.getById(sheetId);
  const name = hit?.obj?.objName || hit?.obj?.objCode || hit?.list || "Objekt";
  return `${name}${hit?.obj?.objCode && hit.obj.objName ? ` (${hit.obj.objCode})` : ""} · ${sheet?.name ?? "Blatt"}`;
}
