import { Defaults, SelectionType } from "./constants";
import { Vec2, v, sub, add, mul, norm, perpLeft, clamp, rgbaFromHex, hexToRgba, polygonAreaAbs, polygonCentroid } from "./geometry";
import { Camera } from "./Camera";
import { Scene, Hatch, Dimension, TextBox } from "./Scene";
import { LabelManager } from "./LabelManager";
import { getDimensionGeometry, type DimensionLike } from "./dimensionGeometry";
import { boxCornersWorld } from "./textGeometry";
import { drawRichTextBox } from "./textRichRenderer";

export interface Selection {
  type: string;
  segmentId?: string;
  hatchId?: string;
  dimensionId?: string;
  textBoxId?: string;
  handleIndex?: number | null;
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
  hoverTextBoxId: string | null = null;
  /** Box currently being edited inline — skip canvas rendering for it. */
  editingTextBoxId: string | null = null;

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
  setHoverTextBoxId(id: string | null) { this.hoverTextBoxId = id || null; }
  setEditingTextBoxId(id: string | null) { this.editingTextBoxId = id || null; }

  private _segmentsBackToFront() {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.segments]
      .filter(s => this.labels.isVisible(s.labelId))
      .sort((a, b) => (rank.get(a.labelId) || 0) - (rank.get(b.labelId) || 0));
  }

  private _hatchesBackToFront() {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.hatches]
      .filter(h => this.labels.isVisible(h.labelId))
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
    this._drawDimensions();
    this._drawTextBoxes();
    this._drawHatchSelection();
    this._drawSegmentSelection();
    this._drawDimensionSelection();
    this._drawTextBoxSelection();
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

    for (const hatch of this._hatchesBackToFront()) {
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
    const baseFontSize = clamp(hatch.areaLabel.fontSizePx ?? Defaults.areaFontSizePx, 8, 72);
    const zoomFactor = cam.scale / Defaults.strokeWidthBaseScale;
    const fontSizePx = Math.max(1, baseFontSize * zoomFactor);
    const padX = 8 * zoomFactor, padY = 5 * zoomFactor;

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

  /* ---------- Dimensions ---------- */

  private _dimensionsBackToFront() {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.dimensions]
      .filter(d => this.labels.isVisible(d.labelId))
      .sort((a, b) => (rank.get(a.labelId) || 0) - (rank.get(b.labelId) || 0));
  }

  private _drawDimensions() {
    for (const dim of this._dimensionsBackToFront()) {
      this._drawSingleDimension(this.ctx, this.camera, dim, false);
    }
  }

  /**
   * Draws a dimension. Public so MeasureTool can render previews using the same logic.
   * `isPreview` slightly reduces line widths for the live preview.
   */
  _drawSingleDimension(ctx: CanvasRenderingContext2D, cam: Camera, dim: DimensionLike & {
    textColor?: string; textSizePx?: number; lineColor?: string; tickLengthM?: number;
    showExtensions?: boolean; useFreeText?: boolean; freeText?: string; decimals?: number;
    textBgEnabled?: boolean; textBgColor?: string; textBgAlpha?: number;
  }, isPreview = false) {
    const g = getDimensionGeometry(dim);

    const p1 = cam.worldToScreen(g.ext1a.x, g.ext1a.y);
    const p2 = cam.worldToScreen(g.ext1b.x, g.ext1b.y);
    const p3 = cam.worldToScreen(g.ext2a.x, g.ext2a.y);
    const p4 = cam.worldToScreen(g.ext2b.x, g.ext2b.y);
    const d1 = cam.worldToScreen(g.d1.x, g.d1.y);
    const d2 = cam.worldToScreen(g.d2.x, g.d2.y);
    const mid = cam.worldToScreen(g.mid.x, g.mid.y);

    ctx.save();
    ctx.strokeStyle = dim.lineColor || Defaults.measureLineColor;
    ctx.lineWidth = isPreview ? 1.2 : 1.3;

    ctx.beginPath();
    if (dim.showExtensions) {
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    }
    ctx.moveTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.stroke();

    const tickDir = norm(sub(g.d2, g.d1));
    const tickN = perpLeft(tickDir);
    const tickLen = dim.tickLengthM || Defaults.measureTickLengthM;

    const t1aP = add(g.d1, mul(tickN, tickLen));
    const t1bP = sub(g.d1, mul(tickN, tickLen));
    const t2aP = add(g.d2, mul(tickN, tickLen));
    const t2bP = sub(g.d2, mul(tickN, tickLen));
    const t1a = cam.worldToScreen(t1aP.x, t1aP.y);
    const t1b = cam.worldToScreen(t1bP.x, t1bP.y);
    const t2a = cam.worldToScreen(t2aP.x, t2aP.y);
    const t2b = cam.worldToScreen(t2bP.x, t2bP.y);

    ctx.beginPath();
    ctx.moveTo(t1a.x, t1a.y); ctx.lineTo(t1b.x, t1b.y);
    ctx.moveTo(t2a.x, t2a.y); ctx.lineTo(t2b.x, t2b.y);
    ctx.stroke();

    // Text + background — proportional to dimension via reference scale
    const text = g.text || "";
    const zoomFactor = cam.scale / Defaults.measureReferenceScalePxPerM;
    const baseSize = dim.textSizePx || Defaults.measureTextSizePx;
    const fontPx = Math.max(1, baseSize * zoomFactor);

    const screenAngle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
    const normalizedAngle = (screenAngle > Math.PI / 2 || screenAngle < -Math.PI / 2)
      ? screenAngle + Math.PI
      : screenAngle;

    const tickOffsetPx = (dim.tickLengthM || Defaults.measureTickLengthM) * cam.scale;
    const textOffsetPx = Math.max(fontPx * 0.95, tickOffsetPx * 0.9 + fontPx * 0.35);

    ctx.translate(mid.x, mid.y);
    ctx.rotate(normalizedAngle);
    ctx.font = `${fontPx}px system-ui, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const ascent = metrics.actualBoundingBoxAscent || fontPx * 0.7;
    const descent = metrics.actualBoundingBoxDescent || fontPx * 0.3;
    const textHeight = ascent + descent;
    const padX = Math.max(4, fontPx * 0.45);
    const padY = Math.max(2, fontPx * 0.22);
    const textY = -textOffsetPx;

    if (dim.textBgEnabled) {
      ctx.fillStyle = hexToRgba(dim.textBgColor || Defaults.measureTextBgColor, dim.textBgAlpha ?? Defaults.measureTextBgAlpha);
      ctx.fillRect(-textWidth / 2 - padX, textY - textHeight / 2 - padY, textWidth + padX * 2, textHeight + padY * 2);
    }

    ctx.fillStyle = dim.textColor || Defaults.measureTextColor;
    ctx.fillText(text, 0, textY);
    ctx.restore();
  }

  private _drawDimensionSelection() {
    if (!this.selection || this.selection.type !== SelectionType.DIMENSION) return;
    const dim = this.scene.getDimensionById((this.selection as any).dimensionId);
    if (!dim) return;
    if (!this.labels.isVisible(dim.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const g = getDimensionGeometry(dim);
    const a = cam.worldToScreen(g.d1.x, g.d1.y);
    const b = cam.worldToScreen(g.d2.x, g.d2.y);

    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Endpoint handles
    ctx.fillStyle = "rgba(77,163,255,0.12)";
    ctx.lineWidth = 2;
    for (const ep of [g.ext1a, g.ext2a]) {
      const sp = cam.worldToScreen(ep.x, ep.y);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
