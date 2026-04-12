import { Defaults, SelectionType } from "./constants";
import { Camera } from "./Camera";
import { Scene } from "./Scene";
import { LabelManager } from "./LabelManager";

export interface Selection {
  type: string;
  segmentId: string;
  pointIndex?: number;
}

export interface Overlay {
  draw: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
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

  private _segmentsBackToFront() {
    const order = this.labels.list();
    const rank = new Map(order.map((g, i) => [g.id, i]));
    return [...this.scene.segments]
      .filter(s => this.labels.isVisible(s.labelId))
      .sort((a, b) => (rank.get(a.labelId) || 0) - (rank.get(b.labelId) || 0));
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "hsl(0 0% 100%)";
    ctx.fillRect(0, 0, this.vw, this.vh);
    ctx.restore();

    this._drawGrid();
    this._drawSegments();
    this._drawSelection();
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

  private _drawSelection() {
    if (!this.selection) return;
    const seg = this.scene.getSegmentById(this.selection.segmentId);
    if (!seg) return;
    if (!this.labels.isVisible(seg.labelId)) return;

    const ctx = this.ctx;
    const cam = this.camera;
    const selStroke = "rgba(77,163,255,0.95)";
    const selFill = "rgba(77,163,255,0.12)";
    const selPoint = "rgba(77,163,255,0.95)";

    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);
    const segScreenThickness = Math.max(0.5, seg.thicknessM * cam.scale);

    ctx.save();
    ctx.strokeStyle = selStroke;
    ctx.lineWidth = Math.max(segScreenThickness + 1.6, 4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.fillStyle = selFill;
    ctx.strokeStyle = selStroke;
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
      ctx.fillStyle = selPoint;
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
    const selFill = "rgba(77,163,255,0.12)";
    const selStroke = "rgba(77,163,255,0.95)";

    const a = cam.worldToScreen(seg.a.x, seg.a.y);
    const b = cam.worldToScreen(seg.b.x, seg.b.y);

    ctx.save();
    ctx.fillStyle = selFill;
    ctx.strokeStyle = selStroke;
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
