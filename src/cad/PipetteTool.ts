import { Defaults, SelectionType } from "./constants";
import { Vec2, v, projectPointToSegment, pointInPolygon } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { Segment, Hatch, Dimension, TextBox } from "./Scene";
import { getDimensionGeometry } from "./dimensionGeometry";
import { pointInOrientedBox } from "./textGeometry";

type PickedSource =
  | { kind: "segment"; obj: Segment }
  | { kind: "hatch"; obj: Hatch }
  | { kind: "dimension"; obj: Dimension }
  | { kind: "textbox"; obj: TextBox };

/**
 * Pipette: Klick auf Objekt -> Stil (+ Bezeichnungs-ID) übernehmen.
 * - Wenn aktuell ein passendes Objekt ausgewählt ist: Stil direkt übertragen.
 * - Wenn nichts ausgewählt: Stil + (optional) ID werden zu Tool-Defaults und das passende Werkzeug aktiviert.
 * - Shift gedrückt: Bezeichnungs-ID NICHT übernehmen (nur Stil).
 */
export class PipetteTool {
  app: CadApp;
  id = "pipette";
  hoverSource: PickedSource | null = null;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this.hoverSource = null;
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.renderer.setHoverTextBoxId(null);
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.hoverSource = null;
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.renderer.setHoverTextBoxId(null);
  }

  finish() {}

  getCursor() { return "crosshair"; }

  update(input: Input) {
    this.hoverSource = this._pickAt(input);
    this.app.renderer.setHoverSegmentId(this.hoverSource?.kind === "segment" ? this.hoverSource.obj.id : null);
    this.app.renderer.setHoverHatchId(this.hoverSource?.kind === "hatch" ? this.hoverSource.obj.id : null);
    this.app.renderer.setHoverTextBoxId(this.hoverSource?.kind === "textbox" ? this.hoverSource.obj.id : null);

    if (input.clicked && this.hoverSource) {
      this._applyPick(this.hoverSource, !input.keys.shift);
    }
  }

  private _pickAt(input: Input): PickedSource | null {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const cam = this.app.camera;
    const distPx = (p: Vec2) => {
      const sp = cam.worldToScreen(p.x, p.y);
      return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
    };

    // Text boxes (top of stack first)
    for (let i = this.app.scene.textBoxes.length - 1; i >= 0; i--) {
      const box = this.app.scene.textBoxes[i];
      if (!this.app.labelManager.isVisible(box.labelId)) continue;
      if (pointInOrientedBox(mouseW, box)) return { kind: "textbox", obj: box };
    }

    // Segments
    let bestSeg: Segment | null = null;
    let bestSegPx = Infinity;
    for (const seg of this.app.scene.segments) {
      if (!this.app.labelManager.isVisible(seg.labelId)) continue;
      const proj = projectPointToSegment(mouseW, seg.a, seg.b);
      const px = distPx(proj.q);
      if (px <= Defaults.hitPx && px < bestSegPx) { bestSegPx = px; bestSeg = seg; }
    }
    if (bestSeg) return { kind: "segment", obj: bestSeg };

    // Dimensions (parallel-line hit)
    for (const dim of this.app.scene.dimensions) {
      if (!this.app.labelManager.isVisible(dim.labelId)) continue;
      const g = getDimensionGeometry(dim);
      const proj = projectPointToSegment(mouseW, g.d1, g.d2);
      if (distPx(proj.q) <= Defaults.hitPx) return { kind: "dimension", obj: dim };
    }

    // Hatches (polygon)
    for (const hatch of this.app.scene.hatches) {
      if (!this.app.labelManager.isVisible(hatch.labelId)) continue;
      if (hatch.points.length >= 3 && pointInPolygon(mouseW, hatch.points)) return { kind: "hatch", obj: hatch };
    }

    return null;
  }

  private _applyPick(src: PickedSource, takeLabel: boolean) {
    const labelId = takeLabel ? src.obj.labelId : null;
    if (src.kind === "segment") this._applySegmentStyle(src.obj, labelId);
    else if (src.kind === "hatch") this._applyHatchStyle(src.obj, labelId);
    else if (src.kind === "dimension") this._applyDimensionStyle(src.obj, labelId);
    else if (src.kind === "textbox") this._applyTextBoxStyle(src.obj, labelId);

    this.app.refreshLabelUI();
  }

  /* ---- Apply per type: write to selected target if it matches type, else set tool defaults + switch tool ---- */
  private _applySegmentStyle(src: Segment, labelId: string | null) {
    const target = this.app.getSelectedSegment();
    if (target) {
      target.color = src.color;
      target.thicknessM = src.thicknessM;
      if (labelId) target.labelId = labelId;
      this.app.setSelection({ type: SelectionType.SEGMENT, segmentId: target.id });
      return;
    }
    this.app.defaultLineColor = src.color;
    this.app.defaultLineThicknessM = src.thicknessM;
    if (labelId) this.app.setActiveDrawLabelId(labelId);
    this.app.setTool("line");
  }

  private _applyHatchStyle(src: Hatch, labelId: string | null) {
    const target = this.app.getSelectedHatch();
    if (target) {
      target.fillColor = src.fillColor;
      target.strokeColor = src.strokeColor;
      target.fillAlphaPct = src.fillAlphaPct;
      target.strokeWidthPx = src.strokeWidthPx;
      target.areaLabel = { ...src.areaLabel, offsetX: target.areaLabel.offsetX, offsetY: target.areaLabel.offsetY };
      if (labelId) target.labelId = labelId;
      this.app.setSelection({ type: SelectionType.HATCH, hatchId: target.id, pointIndex: null });
      return;
    }
    this.app.defaultHatchFillColor = src.fillColor;
    this.app.defaultHatchStrokeColor = src.strokeColor;
    this.app.defaultHatchFillAlphaPct = src.fillAlphaPct;
    this.app.defaultHatchStrokeWidthPx = src.strokeWidthPx;
    if (labelId) this.app.setActiveDrawLabelId(labelId);
    this.app.setTool("hatch");
  }

  private _applyDimensionStyle(src: Dimension, labelId: string | null) {
    const target = this.app.getSelectedDimension();
    if (target) {
      target.textColor = src.textColor; target.textSizePx = src.textSizePx;
      target.lineColor = src.lineColor; target.decimals = src.decimals;
      target.tickLengthM = src.tickLengthM; target.showExtensions = src.showExtensions;
      target.textBgEnabled = src.textBgEnabled; target.textBgColor = src.textBgColor;
      target.textBgAlpha = src.textBgAlpha;
      if (labelId) target.labelId = labelId;
      this.app.setSelection({ type: SelectionType.DIMENSION, dimensionId: target.id });
      return;
    }
    const ms = this.app.measureSettings;
    ms.textColor = src.textColor; ms.textSizePx = src.textSizePx;
    ms.lineColor = src.lineColor; ms.decimals = src.decimals;
    ms.tickLengthM = src.tickLengthM; ms.showExtensions = src.showExtensions;
    ms.textBgEnabled = src.textBgEnabled; ms.textBgColor = src.textBgColor;
    ms.textBgAlpha = src.textBgAlpha;
    if (labelId) this.app.setActiveDrawLabelId(labelId);
    this.app.setTool("measure");
  }

  private _applyTextBoxStyle(src: TextBox, labelId: string | null) {
    const target = this.app.getSelectedTextBox();
    if (target) {
      target.style = { ...src.style };
      if (labelId) target.labelId = labelId;
      this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: target.id });
      return;
    }
    this.app.defaultTextColor = src.style.textColor;
    this.app.defaultTextFontSizePx = src.style.fontSizePx;
    this.app.defaultTextBgColor = src.style.bgColor;
    this.app.defaultTextBgAlphaPct = src.style.bgAlphaPct;
    this.app.defaultTextWrap = src.style.wrap;
    this.app.defaultTextAlign = src.style.align;
    this.app.defaultTextBorderEnabled = src.style.borderEnabled;
    this.app.defaultTextBorderColor = src.style.borderColor;
    this.app.defaultTextBorderWidthPx = src.style.borderWidthPx;
    if (labelId) this.app.setActiveDrawLabelId(labelId);
    this.app.setTool("text");
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    if (!this.hoverSource) return;
    ctx.save();
    ctx.strokeStyle = "hsl(var(--primary))";
    try { ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--primary") || "#4da3ff"; } catch {}
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    const src = this.hoverSource;
    if (src.kind === "segment") {
      const a = cam.worldToScreen(src.obj.a.x, src.obj.a.y);
      const b = cam.worldToScreen(src.obj.b.x, src.obj.b.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (src.kind === "hatch") {
      ctx.beginPath();
      for (let i = 0; i < src.obj.points.length; i++) {
        const p = cam.worldToScreen(src.obj.points[i].x, src.obj.points[i].y);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.stroke();
    } else if (src.kind === "textbox") {
      const cx = src.obj.center.x, cy = src.obj.center.y;
      const w = src.obj.widthM, h = src.obj.heightM;
      const rot = src.obj.rotationRad || 0;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const corners = [
        { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
      ].map(p => cam.worldToScreen(cx + p.x * cs - p.y * sn, cy + p.x * sn + p.y * cs));
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath(); ctx.stroke();
    } else if (src.kind === "dimension") {
      const g = getDimensionGeometry(src.obj);
      const a = cam.worldToScreen(g.d1.x, g.d1.y);
      const b = cam.worldToScreen(g.d2.x, g.d2.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }
}
