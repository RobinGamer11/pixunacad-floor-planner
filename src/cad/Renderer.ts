import { Defaults, SelectionType } from "./constants";
import { Vec2, v, clamp, rgbaFromHex, polygonAreaAbs, polygonCentroid } from "./geometry";
import { Camera } from "./Camera";
import { Scene, Hatch } from "./Scene";
import { LabelManager } from "./LabelManager";

export interface Selection {
  type: string;
  segmentId?: string;
  hatchId?: string;
  pointIndex?: number | null;
}

export interface Overlay {
  draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
}

export interface AreaLabelLayout {
  text: string;
  fontSizePx: number;
  rect: { x: number; y: number; w: number; h: number };
  handles: { x: number; y: number }[];
  centerWorld: Vec2;
  centerScreen: Vec2;
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  scene: Scene;
  labels: LabelManager;
  vw = 1;
  vh = 1;
  overlay: Overlay | null = null;
  selection: Selection | null = null;
  selectedLabelId: string | null = null;
  hoverSegmentId: string | null = null;
  hoverHatchId: string | null = null;

  constructor(ctx: CanvasRenderingContext2D, camera: Camera, scene: Scene, labels: LabelManager) {
    this.ctx = ctx;
    this.camera = camera;
    this.scene = scene;
    this.labels = labels;
  }

  setViewport(w: number, h: number) { this.vw = w; this.vh = h; }
  setSelection(selection: Selection | null) { this.selection = selection; }
  setSelectedLabelId(labelId: string | null) { this.selectedLabelId = labelId || null; }
  setHoverSegmentId(id: string | null) { this.hoverSegmentId = id || null; }
  setHoverHatchId(id: string | null) { this.hoverHatchId = id || null; }

  private _segmentsBackToFront() {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.segments]
      .filter(s => this.labels.isVisible(s.labelId))
      .sort((a, b) => (rank.get(a.labelId) || 0) - (rank.get(b.labelId) || 0));
  }

  private _scaledStrokePx(storedWidth: number): number {
    const baseWidth = Math.max(0, storedWidth || 0);
    return baseWidth * (this.camera.scale / Defaults.strokeWidthBaseScale);
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "hsl(0 0% 100%)";
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();

    this._drawGrid();
    this._drawHatches();
    this._drawSegments();
    this._drawHatchSelection();
    this._drawSegmentSelection();
    this._drawHoverSegmentPoints();

    if (this.overlay && this.overlay.draw) {
      this.overlay.draw(ctx, this.camera);
    }
  }

  private _drawGrid() {
    const ctx = this.ctx;
    const cam = this.camera;
    const tl = cam.screenToWorld(0, 0);
    const br = cam.screenToWorld(this.vw, this.vh);

    const minX = Math.floor(Math.min(tl.x, br.x));
    const maxX = Math.ceil(Math.max(tl.x, br.x));
    const minY = Math.floor(Math.min(tl.y, br.y));
    const maxY = Math.ceil(Math.max(tl.y, br.y));

    const pxPerM = cam.scale;
    const skip = pxPerM < 35 ? 2 : pxPerM < 18 ? 4 : 1;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.06)";

    ctx.beginPath();
    for (let x = minX; x <= maxX; x += skip) {
      const s = cam.worldToScreen(x, 0);
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, this.vh);
    }
    for (let y = minY; y <= maxY; y += skip) {
      const s = cam.worldToScreen(0, y);
      ctx.moveTo(0, s.y);
      ctx.lineTo(this.vw, s.y);
    }
    ctx.stroke();

    const o = cam.worldToScreen(0, 0);
    ctx.strokeStyle = "rgba(77,163,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(o.x, 0);
    ctx.lineTo(o.x, this.vh);
    ctx.moveTo(0, o.y);
    ctx.lineTo(this.vw, o.y);
    ctx.stroke();
    ctx.restore();
  }

  private _drawSegments() {
    const ctx = this.ctx;
    const cam = this.camera;

    for (const seg of this._segmentsBackToFront()) {
      const a = cam.worldToScreen(seg.a.x, seg.a.y);
      const b = cam.worldToScreen(seg.b.x, seg.b.y);
      const isGroupSel = this.selectedLabelId && seg.labelId === this.selectedLabelId;

      ctx.save();
      ctx.strokeStyle = seg.color || Defaults.lineColor;
      ctx.lineWidth = Math.max(0.5, seg.thicknessM * cam.scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      if (isGroupSel) {
        ctx.strokeStyle = "rgba(77,163,255,0.95)";
        ctx.lineWidth = Math.max(4, Math.max(0.5, seg.thicknessM * cam.scale) + 1.4);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private _drawHatches() {
    const ctx = this.ctx;
    const cam = this.camera;

    for (const hatch of this.scene.hatches) {
      if (hatch.points.length < 3) continue;

      const isHovered = this.hoverHatchId === hatch.id;
      const isSelected = this.selection && this.selection.hatchId === hatch.id;
      const fillAlpha = (hatch.fillAlphaPct ?? Defaults.hatchFillAlphaPct) / 100;
      const fillCol = rgbaFromHex(hatch.fillColor, fillAlpha);
      const strokeCol = hatch.strokeColor || Defaults.hatchStrokeColor;
      const strokePx = this._scaledStrokePx(hatch.strokeWidthPx);

      ctx.save();

      ctx.beginPath();
      const p0 = cam.worldToScreen(hatch.points[0].x, hatch.points[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < hatch.points.length; i++) {
        const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();

      ctx.fillStyle = fillCol;
      ctx.fill();

      if (strokePx > 0) {
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = strokePx;
        ctx.stroke();
      }

      if (isHovered && !isSelected) {
        ctx.strokeStyle = "rgba(77,163,255,0.55)";
        ctx.lineWidth = Math.max(1.5, strokePx + 1.2);
        ctx.stroke();
      }

      this._drawAreaLabel(hatch, !!isSelected);
      ctx.restore();
    }
  }

  _getAreaLabelLayout(hatch: Hatch): AreaLabelLayout | null {
    if (!hatch || !hatch.areaLabel?.show || hatch.points.length < 3) return null;

    const ctx = this.ctx;
    const cam = this.camera;

    const areaM2 = polygonAreaAbs(hatch.points);
    const text = `${areaM2.toFixed(2)} m²`;
    const fontSizePx = clamp(hatch.areaLabel.fontSizePx ?? Defaults.areaFontSizePx, 8, 72);
    const padX = 8, padY = 5;

    ctx.save();
    ctx.font = `${fontSizePx}px system-ui, Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    ctx.restore();

    const textW = metrics.width;
    const boxW = textW + padX * 2;
    const boxH = fontSizePx + padY * 2;

    const polyCenter = polygonCentroid(hatch.points);
    const centerWorld = v(polyCenter.x + (hatch.areaLabel.offsetX || 0), polyCenter.y + (hatch.areaLabel.offsetY || 0));
    const centerScreen = cam.worldToScreen(centerWorld.x, centerWorld.y);

    const rect = { x: centerScreen.x - boxW / 2, y: centerScreen.y - boxH / 2, w: boxW, h: boxH };
    const handles = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];

    return { text, fontSizePx, rect, handles, centerWorld, centerScreen };
  }

  private _drawAreaLabel(hatch: Hatch, isSelected: boolean) {
    const layout = this._getAreaLabelLayout(hatch);
    if (!layout) return;

    const ctx = this.ctx;
    const bg = rgbaFromHex(hatch.areaLabel.bgColor || Defaults.areaBgColor, (hatch.areaLabel.bgAlphaPct ?? Defaults.areaBgAlphaPct) / 100);
    const textColor = hatch.areaLabel.textColor || Defaults.areaTextColor;

    ctx.save();
    ctx.fillStyle = bg;
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(layout.rect.x, layout.rect.y, layout.rect.w, layout.rect.h);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = `${layout.fontSizePx}px system-ui, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(layout.text, layout.centerScreen.x, layout.centerScreen.y + 0.5);

    if (isSelected) {
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      for (const h of layout.handles) {
        ctx.beginPath();
        ctx.rect(h.x - 4, h.y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private _drawHatchSelection() {
    if (!this.selection || !this.selection.hatchId) return;
    const hatch = this.scene.getHatchById(this.selection.hatchId);
    if (!hatch || hatch.points.length < 2) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const scaledStrokePx = this._scaledStrokePx(hatch.strokeWidthPx);

    ctx.save();
    if (hatch.points.length >= 3) {
      ctx.beginPath();
      const p0 = cam.worldToScreen(hatch.points[0].x, hatch.points[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < hatch.points.length; i++) {
        const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(77,163,255,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = Math.max(1.5, scaledStrokePx + 1.6);
      ctx.stroke();
    }

    for (let i = 0; i < hatch.points.length; i++) {
      const sp = cam.worldToScreen(hatch.points[i].x, hatch.points[i].y);
      ctx.fillStyle = "rgba(77,163,255,0.12)";
      ctx.strokeStyle = "rgba(77,163,255,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (this.selection.type === SelectionType.POINT && this.selection.pointIndex === i) {
        ctx.fillStyle = "rgba(77,163,255,0.95)";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private _drawSegmentSelection() {
    if (!this.selection || !this.selection.segmentId) return;
    const seg = this.scene.getSegmentById(this.selection.segmentId);
    if (!seg) return;
    if (!this.labels.isVisible(seg.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);
    const segScreenThickness = Math.max(0.5, seg.thicknessM * cam.scale);

    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = Math.max(segScreenThickness + 1.6, 4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = "rgba(77,163,255,0.12)";
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (this.selection.type === SelectionType.POINT) {
      const p = this.selection.pointIndex === 0 ? seg.a : seg.b;
      const sp = cam.worldToScreen(p.x, p.y);
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private _drawHoverSegmentPoints() {
    if (!this.hoverSegmentId) return;
    if (this.selection && this.selection.segmentId === this.hoverSegmentId) return;

    const seg = this.scene.getSegmentById(this.hoverSegmentId);
    if (!seg) return;
    if (!this.labels.isVisible(seg.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);

    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.12)";
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(a.x, a.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
