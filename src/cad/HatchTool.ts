import { Defaults, SnapType } from "./constants";
import {
  Vec2, v, sub, dot, dist, angleDeg, pointFromLengthAngle,
  orthoSnapFromA, nearestAngleToReference, rgbaFromHex
} from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";

export class HatchTool {
  app: CadApp;
  id = "hatch";

  state: "idle" | "drawing" = "idle";
  points: Vec2[] = [];
  snap: Snap | null = null;
  activeTargetHatchId: string | null = null;
  startReferenceEdge: { hatchId: string; edgeIndex: number } | null = null;
  startPointReference: { a: Vec2; b: Vec2 } | null = null;

  hubLocked = false;
  hubLengthM: number | null = null;
  hubAngleDeg: number | null = null;

  constructor(app: CadApp) {
    this.app = app;
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
  }

  activate() {
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
    this.state = "idle";
    this.points = [];
    this.snap = null;
    this.activeTargetHatchId = null;
    this.startReferenceEdge = null;
    this.startPointReference = null;
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.app.renderer.setHoverHatchId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.state = "idle";
    this.points = [];
    this.snap = null;
    this.activeTargetHatchId = null;
    this.startReferenceEdge = null;
    this.startPointReference = null;
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.app.renderer.setHoverHatchId(null);
    this.app.hub.hide();
  }

  finish() { this.cancel(); }
  isDrawing() { return this.state === "drawing"; }

  private _findDraftStartSnap(input: Input): Snap | null {
    if (this.state !== "drawing" || this.points.length < 3) return null;
    const first = this.points[0];
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const sp = this.app.camera.worldToScreen(first.x, first.y);
    const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
    if (px > Defaults.snapPx) return null;
    return {
      type: SnapType.POINT, world: v(first.x, first.y),
      segment: null, hatch: null, pointIndex: 0, edgeIndex: null, t: null, px, isDraftStart: true,
    };
  }

  private _findHatchToolSnap(input: Input): Snap | null {
    const draftStartSnap = this._findDraftStartSnap(input);
    if (draftStartSnap) return draftStartSnap;

    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const snap = this.app.topology.findBestSnap(mouseS, mouseW);
    if (snap?.hatch) this.activeTargetHatchId = snap.hatch.id;
    return snap;
  }

  private _getAdjacentDirectionFromPointSnap(snap: Snap | null): { a: Vec2; b: Vec2 } | null {
    if (!snap || snap.type !== SnapType.POINT || !snap.hatch) return null;
    const hatch = snap.hatch;
    const idx = snap.pointIndex;
    if (idx == null || hatch.points.length < 2) return null;
    const prev = hatch.points[(idx - 1 + hatch.points.length) % hatch.points.length];
    const curr = hatch.points[idx];
    const next = hatch.points[(idx + 1) % hatch.points.length];
    if (dist(prev, curr) > Defaults.minSegLenM) return { a: prev, b: curr };
    if (dist(curr, next) > Defaults.minSegLenM) return { a: curr, b: next };
    return null;
  }

  private _getLastPolylineDirection(): { a: Vec2; b: Vec2 } | null {
    if (this.points.length >= 2) {
      const a = this.points[this.points.length - 2];
      const b = this.points[this.points.length - 1];
      if (dist(a, b) > Defaults.minSegLenM) return { a, b };
    }
    return null;
  }

  private _getReferenceSegmentPoints(): { a: Vec2; b: Vec2 } | null {
    if (this.snap && this.snap.type === SnapType.LINE && this.snap.hatch) {
      const hatch = this.snap.hatch;
      const ei = this.snap.edgeIndex!;
      return {
        a: v(hatch.points[ei].x, hatch.points[ei].y),
        b: v(hatch.points[(ei + 1) % hatch.points.length].x, hatch.points[(ei + 1) % hatch.points.length].y),
      };
    }
    const pointSnapRef = this._getAdjacentDirectionFromPointSnap(this.snap);
    if (pointSnapRef) return pointSnapRef;
    const lastDir = this._getLastPolylineDirection();
    if (lastDir) return lastDir;
    if (this.startPointReference) return this.startPointReference;
    if (this.startReferenceEdge) {
      const hatch = this.app.scene.getHatchById(this.startReferenceEdge.hatchId);
      if (hatch && hatch.points.length >= 2) {
        const ei = this.startReferenceEdge.edgeIndex;
        return {
          a: v(hatch.points[ei].x, hatch.points[ei].y),
          b: v(hatch.points[(ei + 1) % hatch.points.length].x, hatch.points[(ei + 1) % hatch.points.length].y),
        };
      }
    }
    return null;
  }

  private _hasAngleConstraint(input: Input): boolean {
    return !!(input.keys.space || input.keys.shift);
  }

  private _applyRelativeConstraint(basePoint: Vec2, rawPoint: Vec2, input: Input): Vec2 {
    const refSeg = this._getReferenceSegmentPoints();
    if (input.keys.space && refSeg) {
      const currentAngle = angleDeg(basePoint, rawPoint);
      const base = angleDeg(refSeg.a, refSeg.b);
      const options = [
        ((base) % 360 + 360) % 360, ((base + 180) % 360 + 360) % 360,
        ((base + 90) % 360 + 360) % 360, ((base + 270) % 360 + 360) % 360,
      ];
      const snapped = nearestAngleToReference(options, currentAngle);
      const dir = pointFromLengthAngle(v(0, 0), 1, snapped);
      const rel = sub(rawPoint, basePoint);
      const projectedLen = Math.max(0, dot(rel, dir));
      return pointFromLengthAngle(basePoint, projectedLen, snapped);
    }
    if (input.keys.shift) return orthoSnapFromA(basePoint, rawPoint);
    return rawPoint;
  }

  private _rawPreviewWorld(input: Input): Vec2 {
    return this.snap && this.snap.world ? v(this.snap.world.x, this.snap.world.y) : v(input.mouse.wx, input.mouse.wy);
  }

  private _previewWorld(input: Input): Vec2 {
    if (this.state !== "drawing" || this.points.length === 0) return this._rawPreviewWorld(input);
    const last = this.points[this.points.length - 1];
    if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
      return pointFromLengthAngle(last, this.hubLengthM, this.hubAngleDeg);
    }
    let p = this._rawPreviewWorld(input);
    p = this._applyRelativeConstraint(last, p, input);
    return p;
  }

  private _previewMetrics(input: Input) {
    if (this.state !== "drawing" || this.points.length === 0) return { lengthM: 0, angleDeg: 0 };
    const last = this.points[this.points.length - 1];
    const b = this._previewWorld(input);
    return { lengthM: dist(last, b), angleDeg: angleDeg(last, b) };
  }

  private _resolveCommitPointWithConstraint(snap: Snap | null, constrainedPoint: Vec2, input: Input): Vec2 {
    const hasConstraint = this._hasAngleConstraint(input);
    if (!snap) return constrainedPoint;
    if (snap.type === SnapType.LINE) return this.app.topology.resolveSnapPoint(snap, constrainedPoint);
    if (snap.type === SnapType.POINT) {
      if (hasConstraint) return constrainedPoint;
      return v(snap.world.x, snap.world.y);
    }
    return constrainedPoint;
  }

  private _commitPoint(input: Input): Vec2 {
    if (this.state === "drawing" && this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
        return pointFromLengthAngle(last, this.hubLengthM, this.hubAngleDeg);
      }
      let freePoint = this._rawPreviewWorld(input);
      freePoint = this._applyRelativeConstraint(last, freePoint, input);
      return this._resolveCommitPointWithConstraint(this.snap, freePoint, input);
    }
    const startPoint = this._rawPreviewWorld(input);
    return this.app.topology.resolveSnapPoint(this.snap, startPoint);
  }

  private _refreshHoverHatch() {
    if (this.snap && this.snap.hatch) this.app.renderer.setHoverHatchId(this.snap.hatch.id);
    else this.app.renderer.setHoverHatchId(null);
  }

  private _openHubWithCurrentPreview() {
    if (this.state !== "drawing" || this.points.length === 0) return;
    const metrics = this._previewMetrics(this.app.input);
    this.hubLocked = true;
    this.hubLengthM = metrics.lengthM;
    this.hubAngleDeg = metrics.angleDeg;
    this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
    this.app.hub.updateDisplay(this.hubLengthM, this.hubAngleDeg);
    this.app.hub.setValues(this.hubLengthM, this.hubAngleDeg);
    this.app.hub.enterEditMode();
  }

  private _applyHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.state !== "drawing" || this.points.length === 0) return;
    const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : this.hubLengthM;
    const nextAng = (vals.angleDeg != null) ? vals.angleDeg : this.hubAngleDeg;
    this.hubLengthM = nextLen;
    this.hubAngleDeg = ((nextAng! % 360) + 360) % 360;
    this.hubLocked = true;
    this.app.hub.setValues(this.hubLengthM!, this.hubAngleDeg);
    this.app.hub.updateDisplay(this.hubLengthM!, this.hubAngleDeg);
  }

  private _finishAndCreateHatch(points: Vec2[]) {
    if (points.length < 3) return;
    this.app.scene.createHatch(points, this.app.getCurrentHatchStyle());
    this.app.clearSelection();
    this.points = [];
    this.state = "idle";
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.startReferenceEdge = null;
    this.startPointReference = null;
  }

  update(input: Input) {
    this.snap = this._findHatchToolSnap(input);
    this._refreshHoverHatch();

    if (this.state === "drawing") {
      const metrics = this._previewMetrics(input);
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);
    } else {
      this.app.hub.hide();
    }

    if (input.doubleClicked) {
      if (this.state === "drawing" && this.points.length >= 3) {
        this._finishAndCreateHatch(this.points.slice());
      } else {
        this.finish();
      }
      return;
    }

    if (input.clicked) this._onClick(input);
  }

  private _onClick(input: Input) {
    if (
      this.state === "drawing" && this.snap && this.snap.isDraftStart &&
      this.points.length >= 3 && !this._hasAngleConstraint(input)
    ) {
      this._finishAndCreateHatch(this.points.slice());
      return;
    }

    const point = this._commitPoint(input);

    if (this.state === "idle") {
      this.points = [v(point.x, point.y)];
      this.state = "drawing";
      this.hubLocked = false;
      this.hubLengthM = null;
      this.hubAngleDeg = null;

      if (this.snap && this.snap.type === SnapType.LINE && this.snap.hatch) {
        this.startReferenceEdge = { hatchId: this.snap.hatch.id, edgeIndex: this.snap.edgeIndex! };
        this.startPointReference = null;
      } else if (this.snap && this.snap.type === SnapType.POINT && this.snap.hatch) {
        this.startReferenceEdge = null;
        this.startPointReference = this._getAdjacentDirectionFromPointSnap(this.snap);
      } else {
        this.startReferenceEdge = null;
        this.startPointReference = null;
      }
      return;
    }

    if (dist(this.points[this.points.length - 1], point) < Defaults.minSegLenM) return;

    if (
      this.points.length >= 3 && dist(point, this.points[0]) <= Defaults.minSegLenM &&
      !this._hasAngleConstraint(input)
    ) {
      this._finishAndCreateHatch(this.points.slice());
      return;
    }

    this.points.push(v(point.x, point.y));
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
  }

  onTabRequest(): boolean {
    if (this.state !== "drawing") return false;
    this._openHubWithCurrentPreview();
    return true;
  }

  _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    if (this.snap) {
      if (this.snap.type === SnapType.LINE && this.snap.lineA && this.snap.lineB) {
        const a = cam.worldToScreen(this.snap.lineA.x, this.snap.lineA.y);
        const b = cam.worldToScreen(this.snap.lineB.x, this.snap.lineB.y);
        ctx.save();
        ctx.strokeStyle = "rgba(77,163,255,0.42)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }

      const s = cam.worldToScreen(this.snap.world.x, this.snap.world.y);
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(77,163,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (this.state !== "drawing" || this.points.length === 0) return;

    const previewPoint = this._previewWorld(this.app.input);
    const path = [...this.points, previewPoint];
    const style = this.app.getCurrentHatchStyle();
    const fillCol = rgbaFromHex(style.fillColor, style.fillAlphaPct / 100);
    const scaledStrokePx = Math.max(0, style.strokeWidthPx || 0) * (cam.scale / Defaults.strokeWidthBaseScale);

    ctx.save();

    if (path.length >= 3) {
      ctx.beginPath();
      const p0 = cam.worldToScreen(path[0].x, path[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < path.length; i++) {
        const sp = cam.worldToScreen(path[i].x, path[i].y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.fillStyle = fillCol;
      ctx.fill();
    }

    ctx.beginPath();
    const a0 = cam.worldToScreen(this.points[0].x, this.points[0].y);
    ctx.moveTo(a0.x, a0.y);
    for (let i = 1; i < this.points.length; i++) {
      const sp = cam.worldToScreen(this.points[i].x, this.points[i].y);
      ctx.lineTo(sp.x, sp.y);
    }
    const pp = cam.worldToScreen(previewPoint.x, previewPoint.y);
    ctx.lineTo(pp.x, pp.y);
    if (scaledStrokePx > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = scaledStrokePx;
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(77,163,255,0.85)";
    for (const p of this.points) {
      const sp = cam.worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const start = cam.worldToScreen(this.points[0].x, this.points[0].y);
    ctx.strokeStyle = "rgba(77,163,255,0.65)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(start.x, start.y, 8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}
