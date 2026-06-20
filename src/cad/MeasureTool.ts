import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType } from "./constants";
import { Vec2, v, sub, norm, len, dist, projectPointToSegment } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import type { DimensionStyle } from "./Scene";
import { getDimensionGeometry } from "./dimensionGeometry";

interface CollectedPoint {
  world: Vec2;
  // Reference info for parallel orientation
  refDir?: Vec2 | null;
}

export class MeasureTool {
  app: CadApp;
  id = "measure";

  state: "collect" | "place" = "collect";
  pointSnap: Snap | null = null;
  selectedPoints: CollectedPoint[] = [];

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this.state = "collect";
    this.pointSnap = null;
    this.selectedPoints = [];
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.state = "collect";
    this.pointSnap = null;
    this.selectedPoints = [];
  }

  finish() { this.cancel(); }

  isDrawing() { return this.selectedPoints.length > 0 || this.state === "place"; }

  getOrientationMode(): "parallel" | "diagonal" {
    return this.app.measureSettings.orientation;
  }

  getPointCountMode(): "two" | "multi" {
    return this.app.measureSettings.pointCount;
  }

  /** Find a snap on lines, hatch points, hatch edges, segment endpoints + midpoints. */
  private _findMeasureSnap(input: Input): Snap | null {
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    return this.app.topology.findBestSnap(mouseS, mouseW);
  }

  /** Compute a reference direction from snap context (for parallel mode). */
  private _refDirFromSnap(snap: Snap | null): Vec2 | null {
    if (!snap) return null;
    if (snap.segment) {
      const d = sub(snap.segment.b, snap.segment.a);
      if (len(d) > 1e-9) return norm(d);
    }
    if (snap.hatch && snap.edgeIndex != null && snap.hatch.points.length >= 2) {
      const a = snap.hatch.points[snap.edgeIndex];
      const b = snap.hatch.points[(snap.edgeIndex + 1) % snap.hatch.points.length];
      const d = sub(b, a);
      if (len(d) > 1e-9) return norm(d);
    }
    return null;
  }

  private _makeRefDir(pA: CollectedPoint, pB: CollectedPoint): Vec2 | null {
    if (this.getOrientationMode() !== "parallel") return null;
    if (pA.refDir && len(pA.refDir) > 1e-9) return norm(pA.refDir);
    if (pB.refDir && len(pB.refDir) > 1e-9) return norm(pB.refDir);
    const fallback = sub(pB.world, pA.world);
    if (len(fallback) > 1e-9) return norm(fallback);
    return v(1, 0);
  }

  private _canStartPlacement() {
    return this.selectedPoints.length >= 2;
  }

  private _buildPreviewSpecs(placementPoint: Vec2) {
    const specs: Array<{ p1: Vec2; p2: Vec2; placementPoint: Vec2; mode: "parallel" | "diagonal"; refDir: Vec2 | null; style: DimensionStyle }> = [];
    if (this.selectedPoints.length < 2) return specs;

    const mode = this.getOrientationMode();
    const style = this.app.getCurrentMeasureStyle();

    if (this.getPointCountMode() === "two") {
      const a = this.selectedPoints[0];
      const b = this.selectedPoints[1];
      specs.push({ p1: a.world, p2: b.world, placementPoint, mode, refDir: this._makeRefDir(a, b), style });
      return specs;
    }

    for (let i = 0; i < this.selectedPoints.length - 1; i++) {
      const a = this.selectedPoints[i];
      const b = this.selectedPoints[i + 1];
      specs.push({ p1: a.world, p2: b.world, placementPoint, mode, refDir: this._makeRefDir(a, b), style });
    }
    return specs;
  }

  update(input: Input) {
    this.pointSnap = this._findMeasureSnap(input);
    this.app.renderer.setHoverHatchId(this.pointSnap?.hatch?.id || null);
    this.app.renderer.setHoverSegmentId(this.pointSnap?.segment?.id || null);

    // Distanz-Hub: ab dem ersten gesetzten Punkt Länge/Winkel vom letzten
    // gesetzten Punkt zur aktuellen Snap-Position anzeigen (gleicher Stil
    // wie im Linienwerkzeug).
    if (this.state === "collect" && this.selectedPoints.length >= 1 && this.pointSnap) {
      const last = this.selectedPoints[this.selectedPoints.length - 1].world;
      const cur = this.pointSnap.world;
      const dx = cur.x - last.x;
      const dy = cur.y - last.y;
      const lengthM = Math.hypot(dx, dy);
      const angleDeg = Math.atan2(-dy, dx) * 180 / Math.PI;
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(lengthM, angleDeg);
    } else {
      this.app.hub.hide();
    }

    if (this.state === "collect") {
      if (input.doubleClicked && this.getPointCountMode() === "multi" && this._canStartPlacement()) {
        this.state = "place";
        return;
      }
      if (input.clicked) {
        if (!this.pointSnap) return;
        // Reference the snapped world position WITHOUT modifying the underlying geometry.
        // The MeasureTool must never split segments or insert hatch points — that's the LineTool's job.
        const refDir = this._refDirFromSnap(this.pointSnap);
        this.selectedPoints.push({ world: v(this.pointSnap.world.x, this.pointSnap.world.y), refDir });
        if (this.getPointCountMode() === "two" && this.selectedPoints.length === 2) {
          this.state = "place";
        }
      }
      return;
    }

    if (this.state === "place") {
      if (input.clicked) {
        const placement = v(input.mouse.wx, input.mouse.wy);
        const specs = this._buildPreviewSpecs(placement);
        for (const s of specs) {
          this.app.scene.createDimension(s.p1, s.p2, s.placementPoint, s.mode, s.refDir, s.style);
        }
        this.app.clearSelection();
        this.app.refreshLabelUI();
        this.selectedPoints = [];
        this.state = "collect";
      }
    }
  }

  onTabRequest(): boolean { return false; }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Highlight all segment + hatch points so the user knows they can be snapped
    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.85)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.2;
    for (const seg of this.app.scene.segments) {
      if (!this.app.labelManager.isVisible(seg.labelId)) continue;
      for (const p of [seg.a, seg.b]) {
        const s = cam.worldToScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const h of this.app.scene.hatches) {
      if (!this.app.labelManager.isVisible(h.labelId)) continue;
      for (const p of h.points) {
        const s = cam.worldToScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();

    // Selected (collected) points
    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;
    for (const p of this.selectedPoints) {
      const s = cam.worldToScreen(p.world.x, p.world.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Snap indicator
    if (this.pointSnap) {
      const s = cam.worldToScreen(this.pointSnap.world.x, this.pointSnap.world.y);
      drawSnapDot(ctx, s.x, s.y, { ring: true });

      // Snap-line highlight
      if (this.pointSnap.type === SnapType.LINE && this.pointSnap.lineA && this.pointSnap.lineB) {
        const a = cam.worldToScreen(this.pointSnap.lineA.x, this.pointSnap.lineA.y);
        const b = cam.worldToScreen(this.pointSnap.lineB.x, this.pointSnap.lineB.y);
        ctx.save();
        ctx.strokeStyle = "rgba(77,163,255,0.42)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.state !== "place") return;

    const specs = this._buildPreviewSpecs(v(this.app.input.mouse.wx, this.app.input.mouse.wy));
    for (const s of specs) {
      this._drawPreviewDimension(ctx, cam, s);
    }
  }

  private _drawPreviewDimension(ctx: CanvasRenderingContext2D, cam: any, spec: any) {
    // Use renderer's full dimension draw via temporary "fake" dimension
    this.app.renderer._drawSingleDimension(ctx, cam, {
      p1: spec.p1, p2: spec.p2, placementPoint: spec.placementPoint,
      mode: spec.mode, refDir: spec.refDir,
      ...spec.style,
      decimals: spec.style.decimals ?? Defaults.measureDecimals,
      tickLengthM: spec.style.tickLengthM ?? Defaults.measureTickLengthM,
    } as any, true);
  }
}
