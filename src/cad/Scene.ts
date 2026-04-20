import { Defaults } from "./constants";
import { Vec2, v, clamp, lerp } from "./geometry";

export class Segment {
  id: string;
  a: Vec2;
  b: Vec2;
  color: string;
  thicknessM: number;
  labelId: string;
  /** Wenn gesetzt: dieses Objekt gehört zum Edit-Mode der Sticker-Instanz mit dieser ID. */
  _stickerEditOwnerId?: string | null;

  constructor({ id, a, b, color, thicknessM, labelId }: { id: string; a: Vec2; b: Vec2; color?: string; thicknessM?: number; labelId?: string }) {
    this.id = id;
    this.a = v(a.x, a.y);
    this.b = v(b.x, b.y);
    this.color = color || Defaults.lineColor;
    this.thicknessM = (typeof thicknessM === "number" && thicknessM > 0) ? thicknessM : Defaults.lineThicknessM;
    this.labelId = labelId || Defaults.defaultLabelId;
    this._stickerEditOwnerId = null;
  }
}

export interface AreaLabel {
  show: boolean;
  textColor: string;
  fontSizePx: number;
  bgColor: string;
  bgAlphaPct: number;
  offsetX: number;
  offsetY: number;
}

export class Hatch {
  id: string;
  points: Vec2[];
  fillColor: string;
  strokeColor: string;
  fillAlphaPct: number;
  strokeWidthPx: number;
  labelId: string;
  areaLabel: AreaLabel;
  _stickerEditOwnerId?: string | null;

  constructor({ id, points, fillColor, strokeColor, fillAlphaPct, strokeWidthPx, labelId, areaLabel }: {
    id: string; points: Vec2[]; fillColor?: string; strokeColor?: string;
    fillAlphaPct?: number; strokeWidthPx?: number; labelId?: string; areaLabel?: Partial<AreaLabel>;
  }) {
    this.id = id;
    this.points = points.map(p => v(p.x, p.y));
    this.fillColor = fillColor || Defaults.hatchFillColor;
    this.strokeColor = strokeColor || Defaults.hatchStrokeColor;
    this.fillAlphaPct = clamp(fillAlphaPct ?? Defaults.hatchFillAlphaPct, 0, 100);
    this.strokeWidthPx = (typeof strokeWidthPx === "number" && strokeWidthPx >= 0) ? strokeWidthPx : Defaults.hatchStrokePx;
    this.labelId = labelId || Defaults.defaultLabelId;
    this.areaLabel = {
      show: !!(areaLabel?.show ?? Defaults.areaShow),
      textColor: areaLabel?.textColor || Defaults.areaTextColor,
      fontSizePx: clamp(areaLabel?.fontSizePx ?? Defaults.areaFontSizePx, 8, 72),
      bgColor: areaLabel?.bgColor || Defaults.areaBgColor,
      bgAlphaPct: clamp(areaLabel?.bgAlphaPct ?? Defaults.areaBgAlphaPct, 0, 100),
      offsetX: Number.isFinite(areaLabel?.offsetX) ? areaLabel!.offsetX! : 0,
      offsetY: Number.isFinite(areaLabel?.offsetY) ? areaLabel!.offsetY! : 0,
    };
    this._stickerEditOwnerId = null;
  }
}

export interface DimensionStyle {
  textColor?: string;
  textSizePx?: number;
  lineColor?: string;
  decimals?: number;
  tickLengthM?: number;
  showExtensions?: boolean;
  useFreeText?: boolean;
  freeText?: string;
  textBgEnabled?: boolean;
  textBgColor?: string;
  textBgAlpha?: number;
  labelId?: string;
}

export class Dimension {
  id: string;
  p1: Vec2;
  p2: Vec2;
  placementPoint: Vec2;
  mode: "parallel" | "diagonal";
  refDir: Vec2 | null;

  textColor: string;
  textSizePx: number;
  lineColor: string;
  decimals: number;
  tickLengthM: number;
  showExtensions: boolean;

  useFreeText: boolean;
  freeText: string;

  textBgEnabled: boolean;
  textBgColor: string;
  textBgAlpha: number;

  labelId: string;
  _stickerEditOwnerId?: string | null;

  constructor({ id, p1, p2, placementPoint, mode, refDir, style, labelId }: {
    id: string; p1: Vec2; p2: Vec2; placementPoint: Vec2;
    mode?: "parallel" | "diagonal"; refDir?: Vec2 | null; style?: DimensionStyle; labelId?: string;
  }) {
    this.id = id;
    this.p1 = v(p1.x, p1.y);
    this.p2 = v(p2.x, p2.y);
    this.placementPoint = v(placementPoint.x, placementPoint.y);
    this.mode = mode || (Defaults.measureOrientation as "parallel" | "diagonal");
    this.refDir = refDir ? v(refDir.x, refDir.y) : null;

    const s = style || {};
    this.textColor = s.textColor || Defaults.measureTextColor;
    this.textSizePx = (typeof s.textSizePx === "number" && s.textSizePx > 0) ? s.textSizePx : Defaults.measureTextSizePx;
    this.lineColor = s.lineColor || Defaults.measureLineColor;
    this.decimals = Number.isInteger(s.decimals) ? s.decimals! : Defaults.measureDecimals;
    this.tickLengthM = (typeof s.tickLengthM === "number" && s.tickLengthM > 0) ? s.tickLengthM : Defaults.measureTickLengthM;
    this.showExtensions = (typeof s.showExtensions === "boolean") ? s.showExtensions : Defaults.measureShowExtensions;
    this.useFreeText = (typeof s.useFreeText === "boolean") ? s.useFreeText : Defaults.measureUseFreeText;
    this.freeText = (typeof s.freeText === "string") ? s.freeText : Defaults.measureFreeText;
    this.textBgEnabled = (typeof s.textBgEnabled === "boolean") ? s.textBgEnabled : Defaults.measureTextBgEnabled;
    this.textBgColor = s.textBgColor || Defaults.measureTextBgColor;
    this.textBgAlpha = (typeof s.textBgAlpha === "number") ? clamp(s.textBgAlpha, 0, 1) : Defaults.measureTextBgAlpha;
    this.labelId = labelId || s.labelId || Defaults.defaultLabelId;
    this._stickerEditOwnerId = null;
  }
}

export interface TextBoxStyle {
  textColor?: string;
  fontSizePx?: number;
  bgColor?: string;
  bgAlphaPct?: number;
  wrap?: boolean;
  align?: "left" | "center" | "right";
  borderEnabled?: boolean;
  borderColor?: string;
  borderWidthPx?: number;
  labelId?: string;
}

export class TextBox {
  id: string;
  center: Vec2;
  widthM: number;
  heightM: number;
  rotationRad: number;
  html: string;
  style: Required<Omit<TextBoxStyle, "labelId">>;
  labelId: string;
  _stickerEditOwnerId?: string | null;

  constructor({ id, center, widthM, heightM, rotationRad, html, style, labelId }: {
    id: string; center: Vec2; widthM: number; heightM: number;
    rotationRad?: number; html?: string; style?: TextBoxStyle; labelId?: string;
  }) {
    this.id = id;
    this.center = v(center.x, center.y);
    this.widthM = Math.max(Defaults.textMinBoxSizeM, widthM);
    this.heightM = Math.max(Defaults.textMinBoxSizeM, heightM);
    this.rotationRad = rotationRad || 0;
    this.html = html || "";
    const s = style || {};
    this.style = {
      textColor: s.textColor || Defaults.textColor,
      fontSizePx: clamp(s.fontSizePx ?? Defaults.textFontSizePx, 6, 200),
      bgColor: s.bgColor || Defaults.textBgColor,
      bgAlphaPct: clamp(s.bgAlphaPct ?? Defaults.textBgAlphaPct, 0, 100),
      wrap: (typeof s.wrap === "boolean") ? s.wrap : Defaults.textWrap,
      align: s.align || Defaults.textAlign,
      borderEnabled: (typeof s.borderEnabled === "boolean") ? s.borderEnabled : Defaults.textBorderEnabled,
      borderColor: s.borderColor || Defaults.textBorderColor,
      borderWidthPx: clamp(s.borderWidthPx ?? Defaults.textBorderWidthPx, 0, 30),
    };
    this.labelId = labelId || s.labelId || Defaults.defaultLabelId;
    this._stickerEditOwnerId = null;
  }
}

export interface StickerInstanceItem {
  // Lokale Snapshot-Items (relativ zu (0,0)). Strukturell identisch zu ClipboardItem.
  // Wir lassen das absichtlich "any" um keine Zirkulärimporte zu erzeugen.
  [key: string]: any;
}

export class StickerInstance {
  id: string;
  defId: string | null; // optional: Referenz auf Bibliotheks-Definition
  name: string;
  items: StickerInstanceItem[]; // lokale Geometrie (Kopie)
  position: Vec2;
  rotationRad: number;
  scale: number;
  labelId: string;

  constructor({ id, defId, name, items, position, rotationRad, scale, labelId }: {
    id: string; defId?: string | null; name?: string;
    items: StickerInstanceItem[];
    position: Vec2; rotationRad?: number; scale?: number; labelId?: string;
  }) {
    this.id = id;
    this.defId = defId || null;
    this.name = name || "Sticker";
    this.items = items;
    this.position = v(position.x, position.y);
    this.rotationRad = rotationRad || 0;
    this.scale = (typeof scale === "number" && scale > 0) ? scale : 1;
    this.labelId = labelId || Defaults.defaultLabelId;
  }
}

export class DocumentObject {
  id: string;
  name: string;
  /** "image" (jpg/png) oder "pdf-page" (gerendertes PDF). */
  kind: "image" | "pdf-page";
  /** Base64 DataURL des gerenderten Bildes (PNG für PDF, original für JPG/PNG). */
  src: string;
  /** Bei PDFs: Seitenindex (0-basiert). */
  pageIndex: number;
  /** Welt-Position der oberen-linken Ecke (vor Rotation). */
  position: Vec2;
  /** Welt-Breite/-Höhe in Metern. */
  widthM: number;
  heightM: number;
  /** Rotation um die Mitte, in Radiant. */
  rotationRad: number;
  /** Original-Pixelgröße. */
  pixelWidth: number;
  pixelHeight: number;
  labelId: string;
  /** Beim Import gewählter Plan-Maßstab (Nenner). z. B. 100 für 1:100. Kann nachträglich geändert werden. */
  importScaleDenom: number;

  constructor({ id, name, kind, src, pageIndex, position, widthM, heightM, rotationRad, pixelWidth, pixelHeight, labelId, importScaleDenom }: {
    id: string; name?: string; kind?: "image" | "pdf-page"; src: string;
    pageIndex?: number; position: Vec2; widthM: number; heightM: number;
    rotationRad?: number; pixelWidth?: number; pixelHeight?: number; labelId?: string;
    importScaleDenom?: number;
  }) {
    this.id = id;
    this.name = name || "Dokument";
    this.kind = kind || "image";
    this.src = src;
    this.pageIndex = pageIndex || 0;
    this.position = v(position.x, position.y);
    this.widthM = Math.max(0.001, widthM);
    this.heightM = Math.max(0.001, heightM);
    this.rotationRad = rotationRad || 0;
    this.pixelWidth = pixelWidth || 0;
    this.pixelHeight = pixelHeight || 0;
    this.labelId = labelId || Defaults.defaultLabelId;
    this.importScaleDenom = (typeof importScaleDenom === "number" && importScaleDenom > 0) ? importScaleDenom : 100;
  }
}

export class Scene {
  segments: Segment[] = [];
  hatches: Hatch[] = [];
  dimensions: Dimension[] = [];
  textBoxes: TextBox[] = [];
  stickerInstances: StickerInstance[] = [];
  documents: DocumentObject[] = [];
  /**
   * Wenn !== null: alle danach via create* erzeugten Objekte werden mit dieser
   * Sticker-Edit-Owner-ID markiert. Wird von CadApp während enterStickerEdit
   * gesetzt und beim Exit wieder geleert.
   */
  _currentEditOwnerId: string | null = null;
  private _segIdMap = new Map<string, Segment>();
  private _hatchIdMap = new Map<string, Hatch>();
  private _dimIdMap = new Map<string, Dimension>();
  private _textIdMap = new Map<string, TextBox>();
  private _stickerIdMap = new Map<string, StickerInstance>();
  private _docIdMap = new Map<string, DocumentObject>();

  private _makeId(): string {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  private _rebuildSegIdMap() {
    this._segIdMap.clear();
    for (const s of this.segments) this._segIdMap.set(s.id, s);
  }

  private _rebuildHatchIdMap() {
    this._hatchIdMap.clear();
    for (const h of this.hatches) this._hatchIdMap.set(h.id, h);
  }

  private _rebuildDimIdMap() {
    this._dimIdMap.clear();
    for (const d of this.dimensions) this._dimIdMap.set(d.id, d);
  }

  private _rebuildTextIdMap() {
    this._textIdMap.clear();
    for (const t of this.textBoxes) this._textIdMap.set(t.id, t);
  }

  private _rebuildStickerIdMap() {
    this._stickerIdMap.clear();
    for (const s of this.stickerInstances) this._stickerIdMap.set(s.id, s);
  }

  private _rebuildDocIdMap() {
    this._docIdMap.clear();
    for (const d of this.documents) this._docIdMap.set(d.id, d);
  }

  // ---- Documents (PDF/JPG/PNG) ----
  createDocument(opts: {
    name?: string; kind?: "image" | "pdf-page"; src: string; pageIndex?: number;
    position: Vec2; widthM: number; heightM: number; rotationRad?: number;
    pixelWidth?: number; pixelHeight?: number; labelId?: string;
    importScaleDenom?: number;
  }): DocumentObject {
    const doc = new DocumentObject({ id: this._makeId(), ...opts });
    this.documents.push(doc);
    this._rebuildDocIdMap();
    return doc;
  }

  getDocumentById(id: string): DocumentObject | null { return this._docIdMap.get(id) || null; }

  getDocumentsByLabelId(labelId: string): DocumentObject[] {
    return this.documents.filter(d => d.labelId === labelId);
  }

  removeDocument(doc: DocumentObject) {
    this.documents = this.documents.filter(d => d !== doc);
    this._rebuildDocIdMap();
  }

  removeDocumentsByIds(ids: string[]) {
    const set = new Set(ids);
    this.documents = this.documents.filter(d => !set.has(d.id));
    this._rebuildDocIdMap();
  }

  removeDocumentsByLabelId(labelId: string) {
    this.documents = this.documents.filter(d => d.labelId !== labelId);
    this._rebuildDocIdMap();
  }

  reassignDocumentsLabel(oldId: string, newId: string) {
    for (const d of this.documents) if (d.labelId === oldId) d.labelId = newId;
  }

  assignDocumentsToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const d of this.documents) if (set.has(d.id)) d.labelId = newId;
  }

  // ---- Sticker Instances ----
  createStickerInstance(opts: {
    defId?: string | null; name?: string;
    items: StickerInstanceItem[];
    position: Vec2; rotationRad?: number; scale?: number; labelId?: string;
  }): StickerInstance {
    const inst = new StickerInstance({ id: this._makeId(), ...opts });
    this.stickerInstances.push(inst);
    this._rebuildStickerIdMap();
    return inst;
  }

  getStickerInstanceById(id: string): StickerInstance | null { return this._stickerIdMap.get(id) || null; }

  getStickerInstancesByLabelId(labelId: string): StickerInstance[] {
    return this.stickerInstances.filter(s => s.labelId === labelId);
  }

  removeStickerInstance(inst: StickerInstance) {
    this.stickerInstances = this.stickerInstances.filter(s => s !== inst);
    this._rebuildStickerIdMap();
  }

  removeStickerInstancesByLabelId(labelId: string) {
    this.stickerInstances = this.stickerInstances.filter(s => s.labelId !== labelId);
    this._rebuildStickerIdMap();
  }

  reassignStickerInstancesLabel(oldId: string, newId: string) {
    for (const s of this.stickerInstances) if (s.labelId === oldId) s.labelId = newId;
  }

  assignStickerInstancesToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const s of this.stickerInstances) if (set.has(s.id)) s.labelId = newId;
  }

  // ---- TextBoxes ----
  createTextBox(center: Vec2, widthM: number, heightM: number, style: TextBoxStyle = {}, html: string = "", rotationRad: number = 0) {
    const box = new TextBox({
      id: this._makeId(), center, widthM, heightM, rotationRad, html, style, labelId: style.labelId,
    });
    box._stickerEditOwnerId = this._currentEditOwnerId;
    this.textBoxes.push(box);
    this._rebuildTextIdMap();
    return box;
  }

  getTextBoxById(id: string): TextBox | null { return this._textIdMap.get(id) || null; }

  getTextBoxesByLabelId(labelId: string): TextBox[] {
    return this.textBoxes.filter(t => t.labelId === labelId);
  }

  removeTextBox(box: TextBox) {
    this.textBoxes = this.textBoxes.filter(t => t !== box);
    this._rebuildTextIdMap();
  }

  removeTextBoxesByIds(ids: string[]) {
    const set = new Set(ids);
    this.textBoxes = this.textBoxes.filter(t => !set.has(t.id));
    this._rebuildTextIdMap();
  }

  removeTextBoxesByLabelId(labelId: string) {
    this.textBoxes = this.textBoxes.filter(t => t.labelId !== labelId);
    this._rebuildTextIdMap();
  }

  reassignTextBoxesLabel(oldId: string, newId: string) {
    for (const t of this.textBoxes) {
      if (t.labelId === oldId) t.labelId = newId;
    }
  }

  assignTextBoxesToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const t of this.textBoxes) {
      if (set.has(t.id)) t.labelId = newId;
    }
  }

  // ---- Dimensions ----
  createDimension(p1: Vec2, p2: Vec2, placementPoint: Vec2, mode: "parallel" | "diagonal", refDir: Vec2 | null, style: DimensionStyle = {}) {
    const dim = new Dimension({ id: this._makeId(), p1, p2, placementPoint, mode, refDir, style, labelId: style.labelId });
    dim._stickerEditOwnerId = this._currentEditOwnerId;
    this.dimensions.push(dim);
    this._rebuildDimIdMap();
    return dim;
  }

  getDimensionById(id: string): Dimension | null { return this._dimIdMap.get(id) || null; }

  getDimensionsByLabelId(labelId: string): Dimension[] {
    return this.dimensions.filter(d => d.labelId === labelId);
  }

  removeDimension(dim: Dimension) {
    this.dimensions = this.dimensions.filter(d => d !== dim);
    this._rebuildDimIdMap();
  }

  removeDimensionsByIds(ids: string[]) {
    const set = new Set(ids);
    this.dimensions = this.dimensions.filter(d => !set.has(d.id));
    this._rebuildDimIdMap();
  }

  removeDimensionsByLabelId(labelId: string) {
    this.dimensions = this.dimensions.filter(d => d.labelId !== labelId);
    this._rebuildDimIdMap();
  }

  reassignDimensionsLabel(oldId: string, newId: string) {
    for (const d of this.dimensions) {
      if (d.labelId === oldId) d.labelId = newId;
    }
  }

  assignDimensionsToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const d of this.dimensions) {
      if (set.has(d.id)) d.labelId = newId;
    }
  }

  // ---- Segments ----
  createSegment(a: Vec2, b: Vec2, style: { color?: string; thicknessM?: number; labelId?: string } = {}) {
    const seg = new Segment({ id: this._makeId(), a, b, color: style.color, thicknessM: style.thicknessM, labelId: style.labelId });
    seg._stickerEditOwnerId = this._currentEditOwnerId;
    this.segments.push(seg);
    this._rebuildSegIdMap();
    return seg;
  }

  getSegmentById(id: string): Segment | null { return this._segIdMap.get(id) || null; }

  getSegmentsByLabelId(labelId: string): Segment[] {
    return this.segments.filter(s => s.labelId === labelId);
  }

  removeSegment(seg: Segment) {
    this.segments = this.segments.filter(s => s !== seg);
    this._rebuildSegIdMap();
  }

  removeSegmentsByIds(ids: string[]) {
    const set = new Set(ids);
    this.segments = this.segments.filter(s => !set.has(s.id));
    this._rebuildSegIdMap();
  }

  removeSegmentsByLabelId(labelId: string) {
    this.segments = this.segments.filter(s => s.labelId !== labelId);
    this._rebuildSegIdMap();
  }

  reassignSegmentsLabel(oldId: string, newId: string) {
    for (const seg of this.segments) {
      if (seg.labelId === oldId) seg.labelId = newId;
    }
  }

  assignSegmentsToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const seg of this.segments) {
      if (set.has(seg.id)) seg.labelId = newId;
    }
  }

  splitSegmentAtT(seg: Segment, t: number) {
    t = clamp(t, 0, 1);
    if (t <= Defaults.splitEpsT || t >= 1 - Defaults.splitEpsT) {
      return { didSplit: false, point: (t < 0.5 ? seg.a : seg.b), newSegments: [seg] };
    }
    const p = lerp(seg.a, seg.b, t);
    const style = { color: seg.color, thicknessM: seg.thicknessM, labelId: seg.labelId };
    this.removeSegment(seg);
    const s1 = this.createSegment(seg.a, p, style);
    const s2 = this.createSegment(p, seg.b, style);
    return { didSplit: true, point: p, newSegments: [s1, s2] };
  }

  // ---- Hatches ----
  createHatch(points: Vec2[], style: {
    fillColor?: string; strokeColor?: string; fillAlphaPct?: number;
    strokeWidthPx?: number; labelId?: string; areaLabel?: Partial<AreaLabel>;
  } = {}) {
    const hatch = new Hatch({
      id: this._makeId(), points,
      fillColor: style.fillColor, strokeColor: style.strokeColor,
      fillAlphaPct: style.fillAlphaPct, strokeWidthPx: style.strokeWidthPx,
      labelId: style.labelId, areaLabel: style.areaLabel,
    });
    hatch._stickerEditOwnerId = this._currentEditOwnerId;
    this.hatches.push(hatch);
    this._rebuildHatchIdMap();
    return hatch;
  }

  getHatchById(id: string): Hatch | null { return this._hatchIdMap.get(id) || null; }

  getHatchesByLabelId(labelId: string): Hatch[] {
    return this.hatches.filter(h => h.labelId === labelId);
  }

  removeHatch(hatch: Hatch) {
    this.hatches = this.hatches.filter(h => h !== hatch);
    this._rebuildHatchIdMap();
  }

  removeHatchesByIds(ids: string[]) {
    const set = new Set(ids);
    this.hatches = this.hatches.filter(h => !set.has(h.id));
    this._rebuildHatchIdMap();
  }

  removeHatchesByLabelId(labelId: string) {
    this.hatches = this.hatches.filter(h => h.labelId !== labelId);
    this._rebuildHatchIdMap();
  }

  reassignHatchesLabel(oldId: string, newId: string) {
    for (const h of this.hatches) {
      if (h.labelId === oldId) h.labelId = newId;
    }
  }

  assignHatchesToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const h of this.hatches) {
      if (set.has(h.id)) h.labelId = newId;
    }
  }

  removePointFromHatch(hatch: Hatch, pointIndex: number): boolean {
    if (!hatch || hatch.points.length <= 3) return false;
    if (pointIndex < 0 || pointIndex >= hatch.points.length) return false;
    hatch.points.splice(pointIndex, 1);
    return true;
  }

  insertPointIntoHatchEdge(hatch: Hatch, edgeIndex: number, t: number) {
    if (!hatch || hatch.points.length < 2) {
      return { didInsert: false, point: v(0, 0) as Vec2, pointIndex: -1 };
    }
    const n = hatch.points.length;
    const a = hatch.points[edgeIndex];
    const b = hatch.points[(edgeIndex + 1) % n];
    t = clamp(t, 0, 1);
    if (t <= Defaults.splitEpsT) return { didInsert: false, point: v(a.x, a.y), pointIndex: edgeIndex };
    if (t >= 1 - Defaults.splitEpsT) return { didInsert: false, point: v(b.x, b.y), pointIndex: (edgeIndex + 1) % n };
    const p = lerp(a, b, t);
    hatch.points.splice(edgeIndex + 1, 0, v(p.x, p.y));
    return { didInsert: true, point: p, pointIndex: edgeIndex + 1 };
  }

  getHatchEdges() {
    const edges: { hatch: Hatch; edgeIndex: number; a: Vec2; b: Vec2 }[] = [];
    for (const hatch of this.hatches) {
      const n = hatch.points.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        edges.push({ hatch, edgeIndex: i, a: hatch.points[i], b: hatch.points[(i + 1) % n] });
      }
    }
    return edges;
  }
}
