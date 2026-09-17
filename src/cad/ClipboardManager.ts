import { copyDisplayGradient } from "./displayGradient";
import { Defaults, SelectionType } from "./constants";
import { Vec2, v, sub, add, polygonCentroid } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Segment, Hatch, Dimension, TextBox, AreaLabel, TextBoxStyle, FreeStroke } from "./Scene";
import { copyStrokeEffects } from "./Scene";

interface SegmentSnap {
  kind: "segment"; a: Vec2; b: Vec2;
  color: string; thicknessM: number; labelId: string;
  bulge?: number;
}
interface HatchSnap {
  kind: "hatch"; points: Vec2[];
  fillColor: string; strokeColor: string;
  fillAlphaPct: number; strokeWidthPx: number;
  labelId: string; areaLabel: AreaLabel;
  patternEnabled?: boolean; patternId?: string; patternScale?: number;
  patternAngleDeg?: number; patternSkewDeg?: number; patternStretch?: number; patternOffsetX?: number; patternOffsetY?: number;
  bulges?: number[]; holeBulges?: number[][];
}
interface DimensionSnap {
  kind: "dimension"; p1: Vec2; p2: Vec2; placementPoint: Vec2;
  mode: "parallel" | "diagonal" | "arc" | "angle"; refDir: Vec2 | null; p3?: Vec2 | null; bulge?: number;
  textColor: string; textSizePx: number; lineColor: string;
  decimals: number; tickLengthM: number; showExtensions: boolean;
  useFreeText: boolean; freeText: string;
  textBgEnabled: boolean; textBgColor: string; textBgAlpha: number;
  labelId: string;
}
interface TextBoxSnap {
  kind: "textbox"; center: Vec2; widthM: number; heightM: number;
  rotationRad: number; html: string; style: Required<Omit<TextBoxStyle, "labelId" | "spanGroupId">> & { spanGroupId?: string };
  labelId: string;
}

/** Wand-Snapshot (Bezugspolylinie + Körper-Parameter). */
export interface WallSnap {
  kind: "wall"; corners: Vec2[];
  wallKind: string; thicknessM: number; referenceSide: string;
  color: string; fillColor: string; priority: number; labelId: string;
  patternId?: string; patternScale?: number; patternAlignToWall?: boolean;
  patternAngleDeg?: number;
}

/** Freihand-Strich (Kopie inkl. Stil). */
interface FreeSnap {
  kind: "free"; points: Vec2[];
  color: string; thicknessM: number; opacity: number; lineStyle: any;
  gapM: number; blobSpacingM: number; blobSizeM: number; smoothing: boolean;
  imageSrc: string | null; imageSizeM: number; imageSpacingM: number; imageRotateAlongPath: boolean;
  labelId: string;
}

/** Platzierte Bibliotheksinstanz (nur Verweis + Transformation, Definition bleibt unberührt). */
interface LibrarySnap {
  kind: "library"; definitionId: string; definitionVersion: number;
  position: Vec2; rotationRad: number; scaleX: number; scaleY: number; labelId: string;
}

/** Tabellenobjekt (Inhalt + Maßstab, keine Verknüpfung zum Original). */
interface TableSnap {
  kind: "table"; center: Vec2; rotationRad: number;
  data: any; mPerMm: number; scale: number; labelId: string;
}

/** Dokument (PDF-Seite/Bild) inklusive sichtbarer Darstellungseinstellungen. */
interface DocumentSnap {
  kind: "document"; position: Vec2; data: Record<string, any>;
}

/**
 * Tür/Fenster. Türen hängen immer an einer Wand: Wird die Wand mitkopiert,
 * verweist `wallRef` auf deren Index in der Kopie; sonst bleibt die Tür an der
 * Originalwand (Duplikat auf derselben Wand).
 */
interface DoorSnap {
  kind: "door"; wallId: string; wallRef: number | null; props: Record<string, any>;
}

export type ClipboardItem = SegmentSnap | HatchSnap | DimensionSnap | TextBoxSnap | WallSnap | FreeSnap
  | LibrarySnap | TableSnap | DocumentSnap | DoorSnap;


export interface Clipboard {
  items: ClipboardItem[];
  anchor: Vec2; // world-position used as origin for paste preview
}

/* ---- Snapshot helpers ---- */
function snapSegment(s: Segment): SegmentSnap {
  return { kind: "segment", a: v(s.a.x, s.a.y), b: v(s.b.x, s.b.y),
    color: s.color, thicknessM: s.thicknessM, labelId: s.labelId, bulge: (s as any).bulge || 0,
    ...copyStrokeEffects(s) } as any;
}
function snapHatch(h: Hatch): HatchSnap {
  return { kind: "hatch", points: h.points.map(p => v(p.x, p.y)),
    fillColor: h.fillColor, strokeColor: h.strokeColor,
    fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
    labelId: h.labelId, areaLabel: { ...h.areaLabel },
    patternEnabled: h.patternEnabled, patternId: h.patternId,
    patternScale: h.patternScale, patternAngleDeg: h.patternAngleDeg,
    patternSkewDeg: h.patternSkewDeg, patternStretch: h.patternStretch, patternOffsetX: h.patternOffsetX, patternOffsetY: h.patternOffsetY,
    bulges: [...((h as any).bulges || [])], holeBulges: ((h as any).holeBulges || []).map((l: number[]) => [...l]),
    isPolygon: (h as any).isPolygon === true, thicknessM: (h as any).thicknessM, alpha: (h as any).alpha,
    closed: (h as any).closed !== false, shapeMode: (h as any).shapeMode,
    midpointSnap: !!(h as any).midpointSnap, divisionSnap: (h as any).divisionSnap,
    displayGradient: copyDisplayGradient((h as any).displayGradient),
    ...copyStrokeEffects(h) } as any;
}
function snapDimension(d: Dimension): DimensionSnap {
  return { kind: "dimension",
    p1: v(d.p1.x, d.p1.y), p2: v(d.p2.x, d.p2.y),
    placementPoint: v(d.placementPoint.x, d.placementPoint.y),
    mode: d.mode, refDir: d.refDir ? v(d.refDir.x, d.refDir.y) : null,
    p3: d.p3 ? v(d.p3.x, d.p3.y) : null, bulge: (d as any).bulge || 0,
    textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
    decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
    useFreeText: d.useFreeText, freeText: d.freeText,
    textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
    labelId: d.labelId };
}
function snapFree(f: FreeStroke): FreeSnap {
  return { kind: "free", points: f.points.map(p => v(p.x, p.y)),
    color: (f as any).color, thicknessM: (f as any).thicknessM, opacity: (f as any).opacity,
    lineStyle: (f as any).lineStyle, gapM: (f as any).gapM,
    blobSpacingM: (f as any).blobSpacingM, blobSizeM: (f as any).blobSizeM,
    smoothing: (f as any).smoothing,
    imageSrc: (f as any).imageSrc ?? null, imageSizeM: (f as any).imageSizeM,
    imageSpacingM: (f as any).imageSpacingM, imageRotateAlongPath: (f as any).imageRotateAlongPath,
    labelId: f.labelId, ...copyStrokeEffects(f) } as any;
}
function snapTextBox(t: TextBox): TextBoxSnap {
  return { kind: "textbox",
    center: v(t.center.x, t.center.y),
    widthM: t.widthM, heightM: t.heightM, rotationRad: t.rotationRad,
    html: t.html, style: { ...t.style }, labelId: t.labelId };
}

/* ---- Bounding center for an item, used as anchor candidate ---- */
function snapLibrary(i: any): LibrarySnap {
  return { kind: "library", definitionId: i.definitionId, definitionVersion: i.definitionVersion,
    position: v(i.position.x, i.position.y), rotationRad: i.rotationRad,
    scaleX: i.scaleX, scaleY: i.scaleY, labelId: i.labelId };
}

const DOC_FIELDS = [
  "name", "kind", "src", "pageIndex", "widthM", "heightM", "rotationRad",
  "pixelWidth", "pixelHeight", "labelId", "importScaleDenom", "eraseMaskDataUrl",
  "pdfSourceB64", "guideEdges", "cropM", "opacity", "filters", "activeFilterId",
  "bgRemoval", "anchors", "warpCorners", "flipX", "flipY", "displayGradient",
];

const DOOR_FIELDS = [
  "posM", "widthM", "heightM", "breakHeightM", "breakHeightVisible", "kind",
  "side", "hand", "edge", "color", "jambEnabled", "jambColor", "jambLenM",
  "jambThickM", "sashEnabled", "glassColor", "glassThickM", "glassFillColor", "labelId",
];

const pickFields = (obj: any, keys: string[]): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const k of keys) {
    if (obj?.[k] === undefined) continue;
    const val = obj[k];
    out[k] = val && typeof val === "object" ? JSON.parse(JSON.stringify(val)) : val;
  }
  return out;
};

function snapTable(t: any): TableSnap {
  return { kind: "table", center: v(t.center.x, t.center.y), rotationRad: t.rotationRad || 0,
    data: JSON.parse(JSON.stringify(t.data ?? {})), mPerMm: t.mPerMm, scale: t.scale || 1,
    labelId: t.labelId };
}

function snapDocument(d: any): DocumentSnap {
  return { kind: "document", position: v(d.position.x, d.position.y), data: pickFields(d, DOC_FIELDS) };
}

function snapDoor(d: any, wallRef: number | null): DoorSnap {
  return { kind: "door", wallId: d.wallId, wallRef, props: pickFields(d, DOOR_FIELDS) };
}

function snapWallObj(o: any): WallSnap {
  return { kind: "wall", corners: o.corners.map((p: Vec2) => v(p.x, p.y)),
    wallKind: o.kind, thicknessM: o.thicknessM, referenceSide: o.referenceSide,
    color: o.color, fillColor: o.fillColor, priority: o.priority, labelId: o.labelId,
    patternId: o.patternId, patternScale: o.patternScale, patternAlignToWall: o.patternAlignToWall,
    patternAngleDeg: o.patternAngleDeg ?? 0,
    bulges: Array.isArray(o.bulges) ? [...o.bulges] : undefined } as any;
}

function itemCenter(it: ClipboardItem): Vec2 {
  if (it.kind === "segment") return { x: (it.a.x + it.b.x) / 2, y: (it.a.y + it.b.y) / 2 };
  if (it.kind === "hatch") return polygonCentroid(it.points);
  if (it.kind === "dimension") return { x: (it.p1.x + it.p2.x) / 2, y: (it.p1.y + it.p2.y) / 2 };
  if (it.kind === "wall") return polygonCentroid(it.corners);
  if (it.kind === "free") return polygonCentroid(it.points);
  if (it.kind === "library") return v(it.position.x, it.position.y);
  if (it.kind === "document") return v(it.position.x, it.position.y);
  if (it.kind === "door") return v(0, 0);
  return v(it.center.x, it.center.y);
}


/** Alle echten Fangpunkte eines Snapshots (Endpunkte, Ecken, Einfügepunkte). */
function itemPoints(it: ClipboardItem): Vec2[] {
  if (it.kind === "segment") return [it.a, it.b];
  if (it.kind === "hatch") return it.points;
  if (it.kind === "dimension") return [it.p1, it.p2, it.placementPoint];
  if (it.kind === "wall") return it.corners;
  if (it.kind === "free") return it.points;
  if (it.kind === "library") return [it.position];
  if (it.kind === "document") return [it.position];
  if (it.kind === "door") return [];
  return [it.center];
}

/**
 * Gemeinsamer Einfügeanker der Kopie.
 * Bevorzugt den echten Objekt-Fangpunkt, der beim Kopieren dem Mauszeiger am
 * nächsten liegt (der bewusst angeklickte Griffpunkt). Nur wenn kein echter
 * Punkt existiert, wird der Auswahlmittelpunkt verwendet.
 */
function itemsAnchor(items: ClipboardItem[], near?: Vec2 | null): Vec2 {
  if (items.length === 0) return v(0, 0);
  if (near) {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const it of items) {
      for (const p of itemPoints(it)) {
        const d = Math.hypot(p.x - near.x, p.y - near.y);
        if (d < bestD) { bestD = d; best = v(p.x, p.y); }
      }
    }
    if (best) return best;
  }
  let sx = 0, sy = 0;
  for (const it of items) { const c = itemCenter(it); sx += c.x; sy += c.y; }
  return v(sx / items.length, sy / items.length);
}

/**
 * Build a clipboard from current selection.
 * - Single object selection -> that one
 * - Group (selectedLabelId, no single selection) -> all objects with that labelId
 */
export function buildClipboardFromSelection(app: CadApp, anchorOverride?: Vec2 | null): Clipboard | null {
  const items: ClipboardItem[] = [];
  /** Wand-ID → Index des Wand-Snapshots (für mitkopierte Türen/Fenster). */
  const copiedWalls = new Map<string, number>();

  const seg = app.getSelectedSegment();
  const hatch = app.getSelectedHatch();
  const dim = app.getSelectedDimension();
  const tb = app.getSelectedTextBox();

  // Mehrfachauswahl (Marquee/Shift) hat Vorrang – alles zusammen kopieren.
  const multi: { kind: string; id: string }[] = (app as any).selectTool?.marqueeSelectedIds || [];
  if (multi.length > 0) {
    for (const { kind, id } of multi) {
      const s = app.scene as any;
      if (kind === "segment") { const o = s.getSegmentById?.(id); if (o) items.push(snapSegment(o)); }
      else if (kind === "hatch") { const o = s.getHatchById?.(id); if (o) items.push(snapHatch(o)); }
      else if (kind === "dimension") { const o = s.getDimensionById?.(id); if (o) items.push(snapDimension(o)); }
      else if (kind === "textbox") { const o = s.getTextBoxById?.(id); if (o) items.push(snapTextBox(o)); }
      else if (kind === "freeStroke" || kind === "free") { const o = s.getFreeStrokeById?.(id); if (o) items.push(snapFree(o)); }
      else if (kind === "library") { const o = s.getLibraryInstanceById?.(id); if (o) items.push(snapLibrary(o)); }
      else if (kind === "table") { const o = s.getTableById?.(id); if (o) items.push(snapTable(o)); }
      else if (kind === "document") { const o = s.getDocumentById?.(id); if (o && !o._snapOnly) items.push(snapDocument(o)); }
      else if (kind === "wall") {
        const o = s.getWallById?.(id);
        if (o) { copiedWalls.set(o.id, items.length); items.push(snapWallObj(o)); }
      }
    }
  }

  if (items.length === 0) {
    const table = (app as any).getSelectedTable?.();
    const doc = (app as any).getSelectedDocument?.()
      ?? ((app.selection as any)?.documentId ? app.scene.getDocumentById((app.selection as any).documentId) : null);
    const wall = (app as any).getSelectedWall?.();
    if (seg) items.push(snapSegment(seg));
    else if (hatch) items.push(snapHatch(hatch));
    else if (dim) items.push(snapDimension(dim));
    else if (table) items.push(snapTable(table));
    else if (tb) items.push(snapTextBox(tb));
    else if (doc && !(doc as any)._snapOnly) items.push(snapDocument(doc));
    else if (wall) { copiedWalls.set(wall.id, items.length); items.push(snapWallObj(wall)); }
    else if ((app as any).getSelectedLibraryInstance?.()) {
      items.push(snapLibrary((app as any).getSelectedLibraryInstance()));
    }
    else if ((app as any).getSelectedFreeStroke?.()) {
      items.push(snapFree((app as any).getSelectedFreeStroke()));
    }
    else if (app.selectedLabelId) {
      for (const s of app.scene.getSegmentsByLabelId(app.selectedLabelId)) items.push(snapSegment(s));
      for (const h of app.scene.getHatchesByLabelId(app.selectedLabelId)) items.push(snapHatch(h));
      for (const d of app.scene.getDimensionsByLabelId(app.selectedLabelId)) items.push(snapDimension(d));
      for (const t of app.scene.getTextBoxesByLabelId(app.selectedLabelId)) items.push(snapTextBox(t));
      for (const f of app.scene.getFreeStrokesByLabelId(app.selectedLabelId)) items.push(snapFree(f));
      for (const t of ((app.scene as any).tables || []).filter((x: any) => x.labelId === app.selectedLabelId)) items.push(snapTable(t));
      for (const d of app.scene.getDocumentsByLabelId(app.selectedLabelId)) { if (!(d as any)._snapOnly) items.push(snapDocument(d)); }
      for (const w of ((app.scene as any).walls || []).filter((x: any) => x.labelId === app.selectedLabelId)) {
        copiedWalls.set(w.id, items.length); items.push(snapWallObj(w));
      }
    }
  }

  // Türen/Fenster gehören zu ihrer Wand: Wird die Wand mitkopiert, wandern sie mit.
  for (const [wallId, ref] of copiedWalls) {
    for (const d of ((app.scene as any).getDoorsByWallId?.(wallId) || [])) items.push(snapDoor(d, ref));
  }

  if (items.length === 0) return null;
  const m = (app as any).input?.mouse;
  const near = m && Number.isFinite(m.wx) && Number.isFinite(m.wy) ? v(m.wx, m.wy) : null;
  const anchor = anchorOverride ? v(anchorOverride.x, anchorOverride.y) : itemsAnchor(items, near);
  return { items, anchor };
}

/* ---- Translation helpers ---- */
function translatedSegment(s: SegmentSnap, dx: number, dy: number): SegmentSnap {
  return { ...s, a: { x: s.a.x + dx, y: s.a.y + dy }, b: { x: s.b.x + dx, y: s.b.y + dy } };
}
function translatedHatch(h: HatchSnap, dx: number, dy: number): HatchSnap {
  return { ...h, points: h.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
}
function translatedDim(d: DimensionSnap, dx: number, dy: number): DimensionSnap {
  return { ...d,
    p1: { x: d.p1.x + dx, y: d.p1.y + dy },
    p2: { x: d.p2.x + dx, y: d.p2.y + dy },
    placementPoint: { x: d.placementPoint.x + dx, y: d.placementPoint.y + dy } };
}
function translatedText(t: TextBoxSnap, dx: number, dy: number): TextBoxSnap {
  return { ...t, center: { x: t.center.x + dx, y: t.center.y + dy } };
}

export function translatedItems(items: ClipboardItem[], dx: number, dy: number): ClipboardItem[] {
  return items.map(it => {
    if (it.kind === "segment") return translatedSegment(it, dx, dy);
    if (it.kind === "hatch") return translatedHatch(it, dx, dy);
    if (it.kind === "dimension") return translatedDim(it, dx, dy);
    if (it.kind === "wall") return { ...it, corners: it.corners.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    if (it.kind === "free") return { ...it, points: it.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    if (it.kind === "library") return { ...it, position: { x: it.position.x + dx, y: it.position.y + dy } };
    if (it.kind === "document") return { ...it, position: { x: it.position.x + dx, y: it.position.y + dy } };
    if (it.kind === "table") return { ...it, center: { x: it.center.x + dx, y: it.center.y + dy } };
    if (it.kind === "door") return it;
    return translatedText(it, dx, dy);
  });
}


/**
 * Commit clipboard (translated) into the scene. Returns refs of created objects.
 */
export function commitClipboardAt(app: CadApp, clip: Clipboard, mouseW: Vec2): { kind: string; id: string }[] {
  const dx = mouseW.x - clip.anchor.x;
  const dy = mouseW.y - clip.anchor.y;
  const created: { kind: string; id: string }[] = [];
  /** Index des Wand-Snapshots → ID der neu erzeugten Wand (für Türen/Fenster). */
  const newWallIds = new Map<number, string>();
  for (let idx = 0; idx < clip.items.length; idx++) {
    const it = clip.items[idx];
    if (it.kind === "segment") {
      const o = app.scene.createSegment({ x: it.a.x + dx, y: it.a.y + dy }, { x: it.b.x + dx, y: it.b.y + dy },
        { color: it.color, thicknessM: it.thicknessM, labelId: it.labelId, bulge: (it as any).bulge,
          ...copyStrokeEffects(it) });
      if (o) created.push({ kind: "segment", id: o.id });
    } else if (it.kind === "hatch" && (it as any).isPolygon) {
      const o = app.scene.createPolygon(it.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
        { color: it.strokeColor, thicknessM: (it as any).thicknessM, alpha: (it as any).alpha,
          labelId: it.labelId, bulges: (it as any).bulges,
          midpointSnap: !!(it as any).midpointSnap, divisionSnap: (it as any).divisionSnap,
          closed: (it as any).closed !== false, shapeMode: (it as any).shapeMode,
          ...copyStrokeEffects(it) });
      if (o) created.push({ kind: "hatch", id: o.id });
    } else if (it.kind === "hatch") {
      const o = app.scene.createHatch(it.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
        { fillColor: it.fillColor, strokeColor: it.strokeColor,
          fillAlphaPct: it.fillAlphaPct, strokeWidthPx: it.strokeWidthPx,
          labelId: it.labelId, areaLabel: it.areaLabel,
          patternEnabled: it.patternEnabled, patternId: it.patternId, patternScale: it.patternScale, patternAngleDeg: it.patternAngleDeg, patternSkewDeg: it.patternSkewDeg, patternStretch: it.patternStretch, patternOffsetX: it.patternOffsetX, patternOffsetY: it.patternOffsetY,
          bulges: (it as any).bulges, holeBulges: (it as any).holeBulges,
          displayGradient: (it as any).displayGradient,
          ...copyStrokeEffects(it) });
      if (o) created.push({ kind: "hatch", id: o.id });
    } else if (it.kind === "dimension") {
      const o = app.scene.createDimension(
        { x: it.p1.x + dx, y: it.p1.y + dy },
        { x: it.p2.x + dx, y: it.p2.y + dy },
        { x: it.placementPoint.x + dx, y: it.placementPoint.y + dy },
        it.mode, it.refDir,
        { textColor: it.textColor, textSizePx: it.textSizePx, lineColor: it.lineColor,
          decimals: it.decimals, tickLengthM: it.tickLengthM, showExtensions: it.showExtensions,
          useFreeText: it.useFreeText, freeText: it.freeText,
          textBgEnabled: it.textBgEnabled, textBgColor: it.textBgColor, textBgAlpha: it.textBgAlpha,
          bulge: (it as any).bulge || 0,
          p3: it.p3 ? { x: it.p3.x + dx, y: it.p3.y + dy } : null,
          labelId: it.labelId });
      if (o) created.push({ kind: "dimension", id: o.id });
    } else if (it.kind === "wall") {
      const o = app.scene.createWall({
        kind: it.wallKind as any,
        thicknessM: it.thicknessM,
        referenceSide: it.referenceSide as any,
        corners: it.corners.map(p => ({ x: p.x + dx, y: p.y + dy })),
        color: it.color, fillColor: it.fillColor,
        priority: it.priority, labelId: it.labelId,
        patternId: it.patternId, patternScale: it.patternScale, patternAlignToWall: it.patternAlignToWall,
        patternAngleDeg: it.patternAngleDeg ?? 0,
      });
      if (o) { newWallIds.set(idx, o.id); created.push({ kind: "wall", id: o.id }); }
    } else if (it.kind === "free") {
      const o = app.scene.createFreeStroke(it.points.map(p => ({ x: p.x + dx, y: p.y + dy })), {
        color: it.color, thicknessM: it.thicknessM, opacity: it.opacity, lineStyle: it.lineStyle,
        gapM: it.gapM, blobSpacingM: it.blobSpacingM, blobSizeM: it.blobSizeM, smoothing: it.smoothing,
        imageSrc: it.imageSrc, imageSizeM: it.imageSizeM, imageSpacingM: it.imageSpacingM,
        imageRotateAlongPath: it.imageRotateAlongPath, labelId: it.labelId,
        ...copyStrokeEffects(it),
      });
      if (o) created.push({ kind: "freeStroke", id: o.id });
    } else if (it.kind === "library") {
      // Neue Instanz mit neuer ID, aber identischer definitionId — die
      // Bibliotheksdefinition selbst bleibt unverändert.
      const o = (app.scene as any).createLibraryInstance({
        definitionId: it.definitionId, definitionVersion: it.definitionVersion,
        position: { x: it.position.x + dx, y: it.position.y + dy },
        rotationRad: it.rotationRad, scaleX: it.scaleX, scaleY: it.scaleY,
        labelId: it.labelId,
      });
      if (o) created.push({ kind: "library", id: o.id });
    } else if (it.kind === "table") {
      const o = (app.scene as any).createTable(
        { x: it.center.x + dx, y: it.center.y + dy },
        JSON.parse(JSON.stringify(it.data ?? {})), it.mPerMm,
        { rotationRad: it.rotationRad, labelId: it.labelId, scale: it.scale });
      if (o) created.push({ kind: "table", id: o.id });
    } else if (it.kind === "document") {
      const o = app.scene.createDocument({
        ...(JSON.parse(JSON.stringify(it.data)) as any),
        position: { x: it.position.x + dx, y: it.position.y + dy },
      });
      if (o) created.push({ kind: "document", id: o.id });
    } else if (it.kind === "door") {
      const wallId = (it.wallRef !== null ? newWallIds.get(it.wallRef) : null) || it.wallId;
      if ((app.scene as any).getWallById?.(wallId)) {
        const o = (app.scene as any).createDoor({ ...(it.props as any), wallId });
        if (o) created.push({ kind: "door", id: o.id });
      }
    } else {
      const o = app.scene.createTextBox(
        { x: it.center.x + dx, y: it.center.y + dy },
        it.widthM, it.heightM,
        { ...it.style, labelId: it.labelId },
        it.html, it.rotationRad);
      if (o) created.push({ kind: "textbox", id: o.id });
    }

  }
  return created;
}
