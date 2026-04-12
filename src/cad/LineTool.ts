import { Defaults, SnapType } from "./constants";
import {
  Vec2, v, add, sub, mul, norm, dist, dot, angleDeg, pointFromLengthAngle,
  orthoSnapFromA, nearestAngleToReference, lineLineIntersectionInfinite,
  projectPointToInfiniteLine
} from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";

interface GuideAnchor {
  key: string;
  segmentId: string;
  pointIndex: number;
  point: Vec2;
}

interface ParallelGuide {
  key: string;
  segmentId: string;
}

interface GuideDef {
  point: Vec2;
  dir: Vec2;
  parallelSourceSegmentId?: string;
}

export class LineTool {
  app: CadApp;
  id = "line";

  state: "idle" | "drawing" = "idle";
  currentPoint: Vec2 | null = null;
  snap: Snap | null = null;
  activeTargetSegmentId: string | null = null;
  startReferenceSegmentId: string | null = null;

  hubLocked = false;
  hubLengthM: number | null = null;
  hubAngleDeg: number | null = null;

  guideAnchors: GuideAnchor[] = [];
  parallelGuideSegments: ParallelGuide[] = [];

  spaceShiftLocked = false;
  spaceShiftLockedAngleDeg: number | null = null;

  constructor(app: CadApp) {
    this.app = app;
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
  }

  activate() {
    this.resetGuides();
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
    this.state = "idle";
    this.currentPoint = null;
    this.snap = null;
    this.activeTargetSegmentId = null;
    this.startReferenceSegmentId = null;
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.spaceShiftLocked = false;
    this.spaceShiftLockedAngleDeg = null;
    this.app.renderer.setHoverSegmentId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.resetGuides();
    this.state = "idle";
    this.currentPoint = null;
    this.snap = null;
    this.activeTargetSegmentId = null;
    this.startReferenceSegmentId = null;
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.spaceShiftLocked = false;
    this.spaceShiftLockedAngleDeg = null;
    this.app.renderer.setHoverSegmentId(null);
    this.app.hub.hide();
  }

  finish() { this.cancel(); }
  resetGuides() { this.guideAnchors = []; this.parallelGuideSegments = []; }
  isDrawing() { return this.state === "drawing"; }

  private _makeAnchorKey(segmentId: string, pointIndex: number) { return `${segmentId}__${pointIndex}`; }
  private _makeParallelKey(segmentId: string) { return `${segmentId}`; }

  private _toggleGuideAnchorFromSnap(snap: Snap) {
    if (!snap || snap.type !== SnapType.POINT || !snap.segment) return;
    const key = this._makeAnchorKey(snap.segment.id, snap.pointIndex!);
    const idx = this.guideAnchors.findIndex(a => a.key === key);
    if (idx >= 0) { this.guideAnchors.splice(idx, 1); return; }
    this.guideAnchors.push({ key, segmentId: snap.segment.id, pointIndex: snap.pointIndex!, point: v(snap.world.x, snap.world.y) });
  }

  private _toggleParallelGuideFromSnap(snap: Snap) {
    if (!snap || snap.type !== SnapType.LINE || !snap.segment || !this.currentPoint) return;
    const key = this._makeParallelKey(snap.segment.id);
    const idx = this.parallelGuideSegments.findIndex(g => g.key === key);
    if (idx >= 0) { this.parallelGuideSegments.splice(idx, 1); return; }
    this.parallelGuideSegments.push({ key, segmentId: snap.segment.id });
  }

  private _getReferenceSegment() {
    if (this.snap && this.snap.segment) return this.snap.segment;
    if (this.startReferenceSegmentId) {
      const s = this.app.scene.getSegmentById(this.startReferenceSegmentId);
      if (s) return s;
    }
    if (this.activeTargetSegmentId) return this.app.scene.getSegmentById(this.activeTargetSegmentId);
    return null;
  }

  private _buildGuideDefinitions(): GuideDef[] {
    const defs: GuideDef[] = [];
    const refSeg = this._getReferenceSegment();
    const refDir = refSeg ? norm(sub(refSeg.b, refSeg.a)) : null;
    const refPerp = refDir ? v(-refDir.y, refDir.x) : null;

    for (const anchor of this.guideAnchors) {
      const p = anchor.point;
      defs.push({ point: p, dir: v(1, 0) });
      defs.push({ point: p, dir: v(0, 1) });
      if (refDir) defs.push({ point: p, dir: refDir });
      if (refPerp) defs.push({ point: p, dir: refPerp });
    }

    if (this.currentPoint) {
      for (const item of this.parallelGuideSegments) {
        const seg = this.app.scene.getSegmentById(item.segmentId);
        if (!seg) continue;
        const dir = norm(sub(seg.b, seg.a));
        defs.push({ point: v(this.currentPoint.x, this.currentPoint.y), dir, parallelSourceSegmentId: seg.id });
      }
    }

    return defs;
  }

  private _buildGuideIntersections(guideDefs: GuideDef[]): Vec2[] {
    const points: Vec2[] = [];
    for (let i = 0; i < guideDefs.length; i++) {
      for (let j = i + 1; j < guideDefs.length; j++) {
        const g1 = guideDefs[i];
        const g2 = guideDefs[j];
        const ip = lineLineIntersectionInfinite(g1.point, g1.dir, g2.point, g2.dir);
        if (!ip) continue;
        let duplicate = false;
        for (const p of points) { if (dist(p, ip) <= 1e-6) { duplicate = true; break; } }
        if (!duplicate) points.push(ip);
      }
    }
    return points;
  }

  private _getGuideRenderSegment(point: Vec2, dir: Vec2) {
    const cam = this.app.camera;
    const span = (Math.hypot(this.app.renderer.vw, this.app.renderer.vh) / cam.scale) * 1.5;
    const d = norm(dir);
    return { a: sub(point, mul(d, span)), b: add(point, mul(d, span)) };
  }

  private _findGuideIntersectionSnap(mouseS: Vec2): Snap | null {
    const defs = this._buildGuideDefinitions();
    const intersections = this._buildGuideIntersections(defs);
    let best: Snap | null = null;
    let bestPx = Infinity;

    for (const p of intersections) {
      const px = this.app.topology._worldToMousePx(p, mouseS);
      if (px > Defaults.snapPx) continue;
      if (px < bestPx) {
        bestPx = px;
        best = { type: SnapType.GUIDE_POINT, world: v(p.x, p.y), segment: null, pointIndex: null, t: null, px };
      }
    }
    return best;
  }

  private _findGuideSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    let best: Snap | null = this._findGuideIntersectionSnap(mouseS);
    let bestScore = best ? best.px - 50 : Infinity;

    const defs = this._buildGuideDefinitions();
    for (const def of defs) {
      const proj = projectPointToInfiniteLine(mouseW, def.point, def.dir);
      const sp = this.app.camera.worldToScreen(proj.q.x, proj.q.y);
      const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
      if (px > Defaults.snapPx) continue;

      const seg = this._getGuideRenderSegment(def.point, def.dir);
      const score = 500 + px;

      if (score < bestScore) {
        bestScore = score;
        best = {
          type: SnapType.GUIDE, world: v(proj.q.x, proj.q.y), segment: null, pointIndex: null, t: null, px,
          lineA: seg.a, lineB: seg.b, guidePoint: def.point, guideDir: def.dir
        };
      }
    }
    return best;
  }

  private _findLineToolSnap(input: Input): Snap | null {
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);

    const hoveredLineSnap = this.app.topology.findNearestLineSnap(mouseS, mouseW);
    if (hoveredLineSnap && hoveredLineSnap.segment) this.activeTargetSegmentId = hoveredLineSnap.segment.id;

    const activeSegment = this.activeTargetSegmentId ? this.app.scene.getSegmentById(this.activeTargetSegmentId) : null;
    const preferredPointSnap = activeSegment ? this.app.topology.findPointSnapOnSegment(mouseS, activeSegment) : null;
    if (preferredPointSnap) return preferredPointSnap;

    const guideSnap = this._findGuideSnap(mouseS, mouseW);
    if (guideSnap && guideSnap.type === SnapType.GUIDE_POINT) return guideSnap;

    const bestSceneSnap = this.app.topology.findBestSnap(mouseS, mouseW);
    if (bestSceneSnap && bestSceneSnap.type === SnapType.POINT) return bestSceneSnap;

    if (guideSnap) return guideSnap;
    if (hoveredLineSnap) return hoveredLineSnap;
    return bestSceneSnap;
  }

  private _angleFromSpaceRules(basePoint: Vec2, rawPoint: Vec2): number {
    const currentAngle = angleDeg(basePoint, rawPoint);
    const refSeg = this._getReferenceSegment();
    if (refSeg) {
      const base = angleDeg(refSeg.a, refSeg.b);
      const options = [((base) % 360 + 360) % 360, ((base + 180) % 360 + 360) % 360, ((base + 90) % 360 + 360) % 360, ((base + 270) % 360 + 360) % 360];
      return nearestAngleToReference(options, currentAngle);
    }
    const orthoPoint = orthoSnapFromA(basePoint, rawPoint);
    return angleDeg(basePoint, orthoPoint);
  }

  private _syncSpaceShiftLock(input: Input) {
    const comboNow = this.state === "drawing" && !!this.currentPoint && input.keys.space && input.keys.shift;
    if (comboNow && !this.spaceShiftLocked) {
      const raw = this._rawPreviewWorld(input);
      this.spaceShiftLockedAngleDeg = this._angleFromSpaceRules(this.currentPoint!, raw);
      this.spaceShiftLocked = true;
      return;
    }
    if (!comboNow) { this.spaceShiftLocked = false; this.spaceShiftLockedAngleDeg = null; }
  }

  private _applyRelativeConstraint(basePoint: Vec2, rawPoint: Vec2, input: Input): Vec2 {
    if (input.keys.space && input.keys.shift) {
      const lockedAngle = (this.spaceShiftLockedAngleDeg != null) ? this.spaceShiftLockedAngleDeg : this._angleFromSpaceRules(basePoint, rawPoint);
      const dir = pointFromLengthAngle(v(0, 0), 1, lockedAngle);
      const rel = sub(rawPoint, basePoint);
      const projectedLen = dot(rel, dir);
      return pointFromLengthAngle(basePoint, projectedLen, lockedAngle);
    }

    const currentAngle = angleDeg(basePoint, rawPoint);

    if (input.keys.space) {
      const refSeg = this._getReferenceSegment();
      if (refSeg) {
        const base = angleDeg(refSeg.a, refSeg.b);
        const options = [((base) % 360 + 360) % 360, ((base + 180) % 360 + 360) % 360, ((base + 90) % 360 + 360) % 360, ((base + 270) % 360 + 360) % 360];
        const snapped = nearestAngleToReference(options, currentAngle);
        const dir = pointFromLengthAngle(v(0, 0), 1, snapped);
        const rel = sub(rawPoint, basePoint);
        const projectedLen = dot(rel, dir);
        return pointFromLengthAngle(basePoint, projectedLen, snapped);
      }
      return orthoSnapFromA(basePoint, rawPoint);
    }

    if (input.keys.shift) return orthoSnapFromA(basePoint, rawPoint);
    return rawPoint;
  }

  private _rawPreviewWorld(input: Input): Vec2 {
    return this.snap && this.snap.world ? v(this.snap.world.x, this.snap.world.y) : v(input.mouse.wx, input.mouse.wy);
  }

  private _previewWorld(input: Input): Vec2 {
    if (this.state !== "drawing" || !this.currentPoint) return this._rawPreviewWorld(input);
    if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
      return pointFromLengthAngle(this.currentPoint, this.hubLengthM, this.hubAngleDeg);
    }
    let p = this._rawPreviewWorld(input);
    p = this._applyRelativeConstraint(this.currentPoint, p, input);
    return p;
  }

  private _previewMetrics(input: Input) {
    if (this.state !== "drawing" || !this.currentPoint) return { lengthM: 0, angleDeg: 0 };
    const b = this._previewWorld(input);
    return { lengthM: dist(this.currentPoint, b), angleDeg: angleDeg(this.currentPoint, b) };
  }

  private _commitPoint(input: Input): Vec2 {
    if (this.state === "drawing" && this.currentPoint) {
      if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
        return pointFromLengthAngle(this.currentPoint, this.hubLengthM, this.hubAngleDeg);
      }
      let freePoint = this._rawPreviewWorld(input);
      const constrained = input.keys.space || input.keys.shift;
      freePoint = this._applyRelativeConstraint(this.currentPoint, freePoint, input);
      if (constrained) return v(freePoint.x, freePoint.y);
      return this.app.topology.resolveSnapPoint(this.snap, freePoint);
    }
    const startPoint = this._rawPreviewWorld(input);
    return this.app.topology.resolveSnapPoint(this.snap, startPoint);
  }

  private _refreshHoverSegment() {
    if (this.snap && this.snap.segment) this.app.renderer.setHoverSegmentId(this.snap.segment.id);
    else this.app.renderer.setHoverSegmentId(null);
  }

  private _openHubWithCurrentPreview() {
    if (this.state !== "drawing" || !this.currentPoint) return;
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
    if (this.state !== "drawing" || !this.currentPoint) return;
    const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : this.hubLengthM;
    const nextAng = (vals.angleDeg != null) ? vals.angleDeg : this.hubAngleDeg;
    this.hubLengthM = nextLen;
    this.hubAngleDeg = ((nextAng! % 360) + 360) % 360;
    this.hubLocked = true;
    this.app.hub.setValues(this.hubLengthM!, this.hubAngleDeg);
    this.app.hub.updateDisplay(this.hubLengthM!, this.hubAngleDeg);
  }

  update(input: Input) {
    this.snap = this._findLineToolSnap(input);
    this._refreshHoverSegment();
    this._syncSpaceShiftLock(input);

    if (input.rightClicked) {
      if (this.snap && this.snap.type === SnapType.POINT) { this._toggleGuideAnchorFromSnap(this.snap); return; }
      if (this.snap && this.snap.type === SnapType.LINE) { this._toggleParallelGuideFromSnap(this.snap); return; }
    }

    if (this.state === "drawing") {
      const metrics = this._previewMetrics(input);
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);
    } else {
      this.app.hub.hide();
    }

    if (input.doubleClicked) { this.finish(); return; }
    if (input.clicked) this._onClick(input);
  }

  private _onClick(input: Input) {
    const point = this._commitPoint(input);
    if (this.state === "idle") {
      this.currentPoint = v(point.x, point.y);
      this.state = "drawing";
      this.hubLocked = false;
      this.hubLengthM = null;
      this.hubAngleDeg = null;
      this.startReferenceSegmentId = this.snap?.segment?.id || null;
      return;
    }
    if (dist(this.currentPoint!, point) < Defaults.minSegLenM) return;
    this.app.scene.createSegment(this.currentPoint!, point, this.app.getCurrentLineStyle());
    this.app.clearSelection();
    this.currentPoint = v(point.x, point.y);
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.startReferenceSegmentId = this.snap?.segment?.id || null;
    this.app.refreshLabelUI();
  }

  onTabRequest(): boolean {
    if (this.state !== "drawing") return false;
    this._openHubWithCurrentPreview();
    return true;
  }

  private _drawGuideDefinitions(ctx: CanvasRenderingContext2D, cam: any) {
    const defs = this._buildGuideDefinitions();
    if (defs.length === 0) return;

    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.42)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    for (const def of defs) {
      const seg = this._getGuideRenderSegment(def.point, def.dir);
      const a = cam.worldToScreen(seg.a.x, seg.a.y);
      const b = cam.worldToScreen(seg.b.x, seg.b.y);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;

    for (const anchor of this.guideAnchors) {
      const s = cam.worldToScreen(anchor.point.x, anchor.point.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const intersections = this._buildGuideIntersections(defs);
    for (const p of intersections) {
      const s = cam.worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    this._drawGuideDefinitions(ctx, cam);

    if (this.snap) {
      if ((this.snap.type === SnapType.LINE || this.snap.type === SnapType.GUIDE) && this.snap.lineA && this.snap.lineB) {
        const a = cam.worldToScreen(this.snap.lineA.x, this.snap.lineA.y);
        const b = cam.worldToScreen(this.snap.lineB.x, this.snap.lineB.y);
        ctx.save();
        ctx.strokeStyle = "rgba(77,163,255,0.42)";
        ctx.lineWidth = 2;
        if (this.snap.type === SnapType.GUIDE) ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
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

    if (this.state !== "drawing" || !this.currentPoint) return;

    const a = this.currentPoint;
    const b = this._previewWorld(this.app.input);
    const sa = cam.worldToScreen(a.x, a.y);
    const sb = cam.worldToScreen(b.x, b.y);
    const style = this.app.getCurrentLineStyle();

    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = Math.max(0.5, style.thicknessM * cam.scale);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.fillStyle = "rgba(77,163,255,0.85)";
    ctx.beginPath();
    ctx.arc(sa.x, sa.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
