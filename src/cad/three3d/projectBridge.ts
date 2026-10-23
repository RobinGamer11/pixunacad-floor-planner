/**
 * Brücke zwischen der einen CadApp und der 3D-Ansicht. Die 3D-Ansicht hat keine
 * eigene Planung/Auswahl/Verlauf: Lesen geschieht über diese Funktionen,
 * Änderungen nur über `CadApp.runAction` (genau ein Undo-Schritt).
 */
import type { CadApp } from "../CadApp";
import { SelectionType } from "../constants";
import { snapshotsBounds, instanceCornersWorld } from "../library/libraryGeometry";
import { deriveProject3D, deriveScene3D, type Derived3D } from "./geometryDerivation";
import { objectDisplayName } from "../objectMeta";
import { ProjectionCamera, renderProjectionCanvas, preloadSnapshotDocImages } from "../ProjectionRender";
import type { DossierInput, DossierObject } from "./dossier";
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

/**
 * Nur Vorschau: Teile eines einzelnen Objekts mit einer Entwurfsneigung (ohne Beziehungen).
 * Setzt `tilt3D` nur synchron für die Ableitung und stellt es sofort wieder her.
 */
export function deriveObjectFromApp(app: CadApp, obj: any, tilt: any): Derived3D[] {
  const had = Object.prototype.hasOwnProperty.call(obj, "tilt3D"), prev = obj.tilt3D;
  try {
    if (tilt) obj.tilt3D = tilt; else delete obj.tilt3D;
    const sh = (app.sheetManager as any).getById?.(app.activeSheetId);
    if (!sh) return [];
    return deriveScene3D(sceneOf(app, sh.id), sh, { ...deriveOpts(app), isLabelVisible: () => true }).filter(d => d.sourceId === obj.id);
  } finally { if (had) obj.tilt3D = prev; else delete obj.tilt3D; }
}

export function deriveFromApp(app: CadApp): { items: Derived3D[]; issues: RelationIssue[] } {
  const raw = deriveProject3D(app.sheetManager.list(), id => sceneOf(app, id), deriveOpts(app));
  return applyRelations3D(raw, relationSources(app));
}

function deriveOpts(app: CadApp) {
  return {
    activeSheetId: app.activeSheetId,
    isLabelVisible: (l) => app.labelManager.isVisible(l),
    labelFrontRank: (() => {
      const list = app.labelManager.list();
      const rank = new Map(list.map((g: any, i: number) => [g.id, list.length - i]));
      return (l: string) => rank.get(l) ?? 0;
    })(),
    libraryCorners: (li) => {
      const def: any = app.getLibraryDefinition(li.definitionId);
      if (!def?.geometry?.length) return null;
      try {
        return instanceCornersWorld(def.geometry, { position: { x: li.position.x, y: li.position.y }, rotationRad: li.rotationRad || 0, scaleX: li.scaleX ?? 1, scaleY: li.scaleY ?? 1 } as any);
      } catch { return null; }
    },
    libraryBounds: (defId) => {
      const def: any = app.getLibraryDefinition(defId);
      return def?.geometry ? snapshotsBounds(def.geometry) : null;
    },
  } as any;
}

/** 3D-Auswahl → gemeinsame CAD-Auswahl (wechselt bei Bedarf eindeutig das Blatt). */
export function selectInCad(app: CadApp, sheetId: string, id: string) {
  const hit = findObject(app, sheetId, id);
  if (!hit) return;
  // Gesperrte Ebenen: sichtbar, aber wie im CAD nicht anwählbar.
  if (hit.obj?.labelId && !app.labelManager.isEditable(hit.obj.labelId)) return;
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

/** Klick ins Leere der 3D-Ansicht: Auswahl aufheben (schließt die Einstellungen). */
export function clearCadSelection(app: CadApp) { try { app.clearSelection(); } catch { /* ignorieren */ } }

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
    const list: Relation3D[] = (s.obj.relations3D || []).filter((r: Relation3D) => !(r.type === rel.type && r.targetSheetId === rel.targetSheetId && r.targetId === rel.targetId && r.face === rel.face && r.keep === rel.keep && !!r.trim === !!rel.trim));
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

const KIND: Record<string, string> = { walls: "wall", hatches: "hatch", stairs: "stair", documents: "document", textBoxes: "textbox", tables: "table", libraryInstances: "library", segments: "segment", dimensions: "dimension", freeStrokes: "freeStroke" };

/** Objektangaben für das Render-Dossier. */
export function dossierInfo(app: CadApp, key: string): DossierInput | null {
  const [sheetId, id] = key.split("::");
  const hit = findObject(app, sheetId, id);
  if (!hit) return null;
  const kind = KIND[hit.list] || hit.list;
  return {
    key, kind,
    sheetName: app.sheetManager.getById(sheetId)?.name ?? "Blatt",
    name: objectDisplayName(kind, hit.obj),
    objCode: hit.obj.objCode || null,
    description: hit.obj.objDesc || "",
    attachments: hit.obj.objAttachments || [],
  };
}

/** 2D-Draufsicht der beteiligten Blätter mit Kennungs-Positionen (für das Dossier). */
export async function render2DView(app: CadApp, objects: DossierObject[]): Promise<{ png: string; w: number; h: number; badges: { id: string; x: number; y: number }[] } | null> {
  const sheetIds = [...new Set(objects.map(o => o.sheetId))];
  if (!sheetIds.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of objects) {
    minX = Math.min(minX, o.center.x - o.sizeM.x / 2); maxX = Math.max(maxX, o.center.x + o.sizeM.x / 2);
    minY = Math.min(minY, o.center.y - o.sizeM.y / 2); maxY = Math.max(maxY, o.center.y + o.sizeM.y / 2);
  }
  const pad = Math.max(0.5, (maxX - minX + maxY - minY) * 0.04);
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const MAX = 3000;
  const scale = MAX / Math.max(maxX - minX, maxY - minY, 0.01);
  const w = Math.ceil((maxX - minX) * scale), h = Math.ceil((maxY - minY) * scale);
  const cam = new ProjectionCamera(scale, -minX * scale, -minY * scale);
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const ctx = out.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  for (const sid of sheetIds) {
    const snap = app.serializeSheetSnapshot(sid); if (!snap) continue;
    let imgs: Map<string, HTMLImageElement> | undefined;
    try { imgs = await preloadSnapshotDocImages(snap); } catch { /* ohne Bilder */ }
    const c = renderProjectionCanvas(snap, (app as any).libraryDefinitions, cam, w, h, imgs);
    if (c) ctx.drawImage(c, 0, 0);
  }
  const badges = objects.map(o => { const p = cam.worldToScreen(o.center.x, o.center.y); return { id: o.dossierId, x: p.x, y: p.y }; });
  return { png: out.toDataURL("image/png"), w, h, badges };
}

/** Serialisierter Stand eines Blattes (auch das aktive). */
export function sheetSnapshotOf(app: CadApp, sheetId: string): any | null {
  const sc = sceneOf(app, sheetId);
  return sc ? (app as any)._serializeOneScene(sc) : null;
}

export function libraryDefinitionsOf(app: CadApp): any[] {
  return (app as any).libraryDefinitions || [];
}
