import { Defaults } from "./constants";
import { Vec2, v, clamp, lerp } from "./geometry";

export class Segment {
  id: string;
  a: Vec2;
  b: Vec2;
  color: string;
  thicknessM: number;
  labelId: string;

  constructor({ id, a, b, color, thicknessM, labelId }: { id: string; a: Vec2; b: Vec2; color?: string; thicknessM?: number; labelId?: string }) {
    this.id = id;
    this.a = v(a.x, a.y);
    this.b = v(b.x, b.y);
    this.color = color || Defaults.lineColor;
    this.thicknessM = (typeof thicknessM === "number" && thicknessM > 0) ? thicknessM : Defaults.lineThicknessM;
    this.labelId = labelId || Defaults.defaultLabelId;
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
  }
}

export class Scene {
  segments: Segment[] = [];
  hatches: Hatch[] = [];
  dimensions: Dimension[] = [];
  private _segIdMap = new Map<string, Segment>();
  private _hatchIdMap = new Map<string, Hatch>();
  private _dimIdMap = new Map<string, Dimension>();

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

  // ---- Segments ----
  createSegment(a: Vec2, b: Vec2, style: { color?: string; thicknessM?: number; labelId?: string } = {}) {
    const seg = new Segment({ id: this._makeId(), a, b, color: style.color, thicknessM: style.thicknessM, labelId: style.labelId });
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
