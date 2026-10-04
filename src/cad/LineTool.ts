import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType } from "./constants";
import {
  Vec2, v, add, sub, mul, norm, dist, dot, angleDeg, pointFromLengthAngle,
  orthoSnapFromA, nearestAngleToReference, lineLineIntersectionInfinite,
  projectPointToInfiniteLine, normalizeDeg, buildCircleOrSectorPoints
} from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { maybeRasterize } from "./rasterize";

/** Zeichenmodus des Linienwerkzeugs — 1:1 analog zum Schraffurwerkzeug. */
export type LineDrawMode = "polyline" | "rectangle" | "circle";


interface GuideAnchor {
  key: string;
  segmentId?: string;
  hatchId?: string;
  pointIndex: number;
  point: Vec2;
}

interface ParallelGuide {
  key: string;
  segmentId?: string;
  hatchId?: string;
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


  spaceShiftLocked = false;
  spaceShiftLockedAngleDeg: number | null = null;

  /* ---- Zeichenmodi (1:1 wie im Schraffurwerkzeug) ---- */
  drawMode: LineDrawMode = "polyline";
  onDrawModeChange?: (mode: LineDrawMode) => void;

  rectState: "idle" | "firstSide" | "secondSide" = "idle";
  rectPointA: Vec2 | null = null;
  rectPointB: Vec2 | null = null;

  circleState: "idle" | "radius" | "arc" = "idle";
  circleCenter: Vec2 | null = null;
  circleRadiusM = 0;
  circleStartAngleDeg = 0;
  circleEndAngleDeg = 0;

  private _lastInput: Input | null = null;

  setDrawMode(mode: LineDrawMode) {
    if (this.drawMode === mode) return;
    this.cancel();
    this.drawMode = mode;
    this.onDrawModeChange?.(mode);
  }

  constructor(app: CadApp) {
    this.app = app;
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
  }

  activate() {
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
    this._resetRectState();
    this._resetCircleState();
    this.app.renderer.setHoverSegmentId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
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
    this._resetRectState();
    this._resetCircleState();
    this.app.renderer.setHoverSegmentId(null);
    this.app.hub.hide();
  }

  private _resetRectState() {
    this.rectState = "idle";
    this.rectPointA = null;
    this.rectPointB = null;
  }

  private _resetCircleState() {
    this.circleState = "idle";
    this.circleCenter = null;
    this.circleRadiusM = 0;
    this.circleStartAngleDeg = 0;
    this.circleEndAngleDeg = 0;
  }

  finish() { this.cancel(); }
  /** Bezugspunkt für den zentralen Hilfslinien-Controller. */
  getGuideAnchor() { return this.currentPoint; }
  isDrawing() {
    return this.state === "drawing" || this.rectState !== "idle" || this.circleState !== "idle";
  }

  /** ENTER: laufende Rechteck-/Kreiskontur sofort abschließen. */
  finishFromKey(): boolean {
    if (this.drawMode === "rectangle" && this.rectState !== "idle") {
      if (this.rectState === "secondSide" && this._lastInput) {
        const rect = this._getRectPreviewPoints(this._lastInput);
        if (rect && dist(rect[1], rect[2]) >= Defaults.minSegLenM) {
          this._createClosedPolygon(rect);
          return true;
        }
      }
      this.finish();
      return true;
    }
    if (this.drawMode === "circle" && this.circleState !== "idle") {
      this._finishCircle(true);
      return true;
    }
    return false;
  }

  /** Erzeugt aus einer geschlossenen Punktfolge einzelne Liniensegmente. */
  private _createClosedPolygon(points: Vec2[]) {
    if (points.length < 2) return;
    const style = this.app.getCurrentLineStyle();
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (dist(a, b) < 1e-9) continue;
      const seg = this.app.scene.createSegment(v(a.x, a.y), v(b.x, b.y), { ...style, ...((this.app as any).getStrokeEffectDefaults?.("line") ?? {}) });
      maybeRasterize(this.app, { type: "segment", obj: seg });
    }
    this.app.clearSelection();
    this._resetRectState();
    this._resetCircleState();
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.app.refreshLabelUI();
  }

  /* ---- Rechteck-Helfer (analog HatchTool) ---- */

  private _leftNormalUnit(a: Vec2, b: Vec2): Vec2 {
    const d = norm(sub(b, a));
    return v(-d.y, d.x);
  }

  private _getRectWidthCandidates(): number[] {
    if (!this.rectPointA || !this.rectPointB) return [0, 180];
    const base = angleDeg(this.rectPointA, this.rectPointB);
    return [((base + 90) % 360 + 360) % 360, ((base + 270) % 360 + 360) % 360];
  }

  private _getRectPreviewWidthPoint(input: Input): Vec2 | null {
    if (!this.rectPointA || !this.rectPointB) return null;
    const baseAngle = angleDeg(this.rectPointA, this.rectPointB);
    const leftN = this._leftNormalUnit(this.rectPointA, this.rectPointB);

    if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
      const chosen = nearestAngleToReference(this._getRectWidthCandidates(), this.hubAngleDeg);
      const sign = Math.abs((((chosen - (baseAngle + 90)) % 360) + 360) % 360) < 1 ? +1 : -1;
      return add(this.rectPointB, mul(leftN, sign * this.hubLengthM));
    }

    const raw = this._rawPreviewWorld(input);
    const signedWidth = dot(sub(raw, this.rectPointB), leftN);
    return add(this.rectPointB, mul(leftN, signedWidth));
  }

  private _getRectPreviewPoints(input: Input): Vec2[] | null {
    if (!this.rectPointA || !this.rectPointB) return null;
    const c = this._getRectPreviewWidthPoint(input);
    if (!c) return null;
    const offset = sub(c, this.rectPointB);
    const d = add(this.rectPointA, offset);
    return [v(this.rectPointA.x, this.rectPointA.y), v(this.rectPointB.x, this.rectPointB.y), v(c.x, c.y), v(d.x, d.y)];
  }

  private _rectFirstSidePoint(input: Input): Vec2 {
    const a = this.rectPointA!;
    if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
      return pointFromLengthAngle(a, this.hubLengthM, this.hubAngleDeg);
    }
    let p = this._rawPreviewWorld(input);
    const constrained = input.keys.space || input.keys.shift;
    p = this._applyRelativeConstraint(a, p, input);
    if (constrained) return v(p.x, p.y);
    return this.app.topology.resolveSnapPoint(this.snap, p);
  }

  private _rectPreviewMetrics(input: Input) {
    if (this.rectState === "firstSide" && this.rectPointA) {
      const b = this._rectFirstSidePoint(input);
      return { lengthM: dist(this.rectPointA, b), angleDeg: angleDeg(this.rectPointA, b) };
    }
    if (this.rectState === "secondSide" && this.rectPointA && this.rectPointB) {
      const c = this._getRectPreviewWidthPoint(input)!;
      return { lengthM: dist(this.rectPointB, c), angleDeg: angleDeg(this.rectPointB, c) };
    }
    return { lengthM: 0, angleDeg: 0 };
  }

  private _onRectClick(input: Input) {
    if (this.rectState === "idle") {
      const p = this.app.topology.resolveSnapPoint(this.snap, this._rawPreviewWorld(input));
      this.rectPointA = v(p.x, p.y);
      this.rectState = "firstSide";
      this.hubLocked = false;
      this.hubLengthM = null;
      this.hubAngleDeg = null;
      this.startReferenceSegmentId = this.snap?.segment?.id || null;
      return;
    }
    if (this.rectState === "firstSide") {
      const p = this._rectFirstSidePoint(input);
      if (dist(this.rectPointA!, p) < Defaults.minSegLenM) return;
      this.rectPointB = v(p.x, p.y);
      this.rectState = "secondSide";
      this.hubLocked = false;
      this.hubLengthM = null;
      this.hubAngleDeg = null;
      return;
    }
    if (this.rectState === "secondSide") {
      const rect = this._getRectPreviewPoints(input);
      if (!rect) return;
      if (dist(rect[1], rect[2]) < Defaults.minSegLenM) return;
      this._createClosedPolygon(rect);
    }
  }

  /* ---- Kreis-Helfer (analog HatchTool) ---- */

  private _circlePreviewRadiusWorld(input: Input): Vec2 {
    if (!this.circleCenter) return this._rawPreviewWorld(input);
    if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null && this.circleState === "radius") {
      return pointFromLengthAngle(this.circleCenter, this.hubLengthM, this.hubAngleDeg);
    }
    let p = this._rawPreviewWorld(input);
    if (input.keys.shift) p = orthoSnapFromA(this.circleCenter, p);
    return p;
  }

  private _circlePreviewMetrics(input: Input) {
    if (!this.circleCenter) return { lengthM: 0, angleDeg: 0 };
    if (this.circleState === "radius") {
      const p = this._circlePreviewRadiusWorld(input);
      return { lengthM: dist(this.circleCenter, p), angleDeg: angleDeg(this.circleCenter, p) };
    }
    if (this.circleState === "arc") {
      return { lengthM: this.circleRadiusM, angleDeg: this._circlePreviewArcEndAngle(input) };
    }
    return { lengthM: 0, angleDeg: 0 };
  }

  private _circlePreviewArcEndAngle(input: Input): number {
    if (!this.circleCenter) return 0;
    if (this.hubLocked && this.hubAngleDeg != null && this.circleState === "arc") {
      return normalizeDeg(this.hubAngleDeg);
    }
    let p = this._rawPreviewWorld(input);
    if (input.keys.shift) p = orthoSnapFromA(this.circleCenter, p);
    return normalizeDeg(angleDeg(this.circleCenter, p));
  }

  private _finishCircle(forceFullCircle: boolean) {
    if (!this.circleCenter || this.circleRadiusM <= Defaults.minSegLenM) return;
    const points = forceFullCircle
      ? buildCircleOrSectorPoints(this.circleCenter, this.circleRadiusM, 0, 360, 96)
      : buildCircleOrSectorPoints(this.circleCenter, this.circleRadiusM, this.circleStartAngleDeg, this.circleEndAngleDeg, 96);
    if (!points || points.length < 3) return;
    this._createClosedPolygon(points);
  }

  private _onCircleClick(input: Input) {
    if (this.circleState === "idle") {
      const p = this.app.topology.resolveSnapPoint(this.snap, this._rawPreviewWorld(input));
      this.circleCenter = v(p.x, p.y);
      this.circleState = "radius";
      this.hubLocked = false;
      this.hubLengthM = null;
      this.hubAngleDeg = null;
      return;
    }
    if (this.circleState === "radius") {
      const metrics = this._circlePreviewMetrics(input);
      this.circleRadiusM = metrics.lengthM;
      this.circleStartAngleDeg = metrics.angleDeg;
      this.circleEndAngleDeg = metrics.angleDeg;
      if (this.circleRadiusM <= Defaults.minSegLenM) return;
      this.circleState = "arc";
      this.hubLocked = false;
      this.hubLengthM = this.circleRadiusM;
      this.hubAngleDeg = this.circleStartAngleDeg;
      return;
    }
    if (this.circleState === "arc") {
      this.circleEndAngleDeg = this._circlePreviewArcEndAngle(input);
      this._finishCircle(false);
    }
  }

  /** Enter im Bogen-Status: Vollkreis committen. */
  finishCircleFromKey() {
    if (this.drawMode === "circle" && this.circleState === "arc") this._finishCircle(true);
  }


`; }
`; }





  private _getReferenceSegment() {
    if (this.snap && this.snap.segment) return this.snap.segment;
    if (this.startReferenceSegmentId) {
      const s = this.app.scene.getSegmentById(this.startReferenceSegmentId);
      if (s) return s;
    }
    if (this.activeTargetSegmentId) return this.app.scene.getSegmentById(this.activeTargetSegmentId);
    return null;
  }



  private _getGuideRenderSegment(point: Vec2, dir: Vec2) {
    const cam = this.app.camera;
    const span = (Math.hypot(this.app.renderer.vw, this.app.renderer.vh) / cam.scale) * 1.5;
    const d = norm(dir);
    return { a: sub(point, mul(d, span)), b: add(point, mul(d, span)) };
  }


  private _findGuideSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    return this.app.globalGuides.findSnap(mouseS, mouseW, this.app.camera);
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
    if (this.drawMode === "polyline") {
      if (this.state !== "drawing" || !this.currentPoint) return;
      const metrics = this._previewMetrics(this.app.input);
      this.hubLocked = true;
      this.hubLengthM = metrics.lengthM;
      this.hubAngleDeg = metrics.angleDeg;
    } else if (this.drawMode === "rectangle") {
      if (this.rectState === "idle") return;
      const metrics = this._rectPreviewMetrics(this.app.input);
      this.hubLocked = true;
      this.hubLengthM = metrics.lengthM;
      this.hubAngleDeg = metrics.angleDeg;
    } else {
      if (this.circleState === "idle") return;
      const metrics = this._circlePreviewMetrics(this.app.input);
      this.hubLocked = true;
      this.hubLengthM = metrics.lengthM;
      this.hubAngleDeg = metrics.angleDeg;
    }
    this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
    this.app.hub.updateDisplay(this.hubLengthM!, this.hubAngleDeg!);
    this.app.hub.setValues(this.hubLengthM!, this.hubAngleDeg!);
    this.app.hub.enterEditMode();
  }

  private _applyHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.drawMode === "polyline") {
      if (this.state !== "drawing" || !this.currentPoint) return;
    } else if (this.drawMode === "rectangle") {
      if (this.rectState === "idle") return;
    } else {
      if (this.circleState === "idle") return;
      this._applyCircleHubValues(vals);
      return;
    }
    const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : this.hubLengthM;
    const nextAng = (vals.angleDeg != null) ? vals.angleDeg : this.hubAngleDeg;
    this.hubLengthM = nextLen;
    this.hubAngleDeg = ((nextAng! % 360) + 360) % 360;
    this.hubLocked = true;
    this.app.hub.setValues(this.hubLengthM!, this.hubAngleDeg);
    this.app.hub.updateDisplay(this.hubLengthM!, this.hubAngleDeg);
  }

  private _applyCircleHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.circleState === "radius") {
      const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : (this.hubLengthM ?? 0);
      const nextAng = normalizeDeg(vals.angleDeg ?? this.hubAngleDeg ?? 0);
      this.hubLengthM = nextLen;
      this.hubAngleDeg = nextAng;
      this.hubLocked = true;
      this.circleRadiusM = nextLen;
      this.circleStartAngleDeg = nextAng;
      this.circleEndAngleDeg = nextAng;
      this.circleState = "arc";
      this.app.hub.setValues(this.circleRadiusM, this.circleEndAngleDeg);
      this.app.hub.updateDisplay(this.circleRadiusM, this.circleEndAngleDeg);
      this.app.hub.enterEditMode();
      return;
    }
    if (this.circleState === "arc") {
      const nextAng = normalizeDeg(vals.angleDeg ?? this.circleEndAngleDeg);
      this.hubAngleDeg = nextAng;
      this.hubLocked = true;
      this.circleEndAngleDeg = nextAng;
      this._finishCircle(true);
    }
  }

  update(input: Input) {
    this._lastInput = input;
    this.snap = this._findLineToolSnap(input);
    this._refreshHoverSegment();
    this._syncSpaceShiftLock(input);


    if (this.drawMode === "rectangle") {
      if (this.rectState !== "idle") {
        const metrics = this._rectPreviewMetrics(input);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);
      } else {
        this.app.hub.hide();
      }
      if (input.clicked) this._onRectClick(input);
      return;
    }

    if (this.drawMode === "circle") {
      if (this.circleState === "radius") {
        const metrics = this._circlePreviewMetrics(input);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);
      } else if (this.circleState === "arc") {
        this.circleEndAngleDeg = this._circlePreviewArcEndAngle(input);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(this.circleRadiusM, this.circleEndAngleDeg);
      } else {
        this.app.hub.hide();
      }
      if (input.doubleClicked && this.circleState === "arc") { this._finishCircle(true); return; }
      if (input.clicked) this._onCircleClick(input);
      return;
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
    const createdSeg = this.app.scene.createSegment(this.currentPoint!, point, { ...this.app.getCurrentLineStyle(), ...((this.app as any).getStrokeEffectDefaults?.("line") ?? {}) });
    maybeRasterize(this.app, { type: "segment", obj: createdSeg });
    this.app.clearSelection();
    this.currentPoint = v(point.x, point.y);
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.startReferenceSegmentId = this.snap?.segment?.id || null;
    this.app.refreshLabelUI();
  }

  onTabRequest(): boolean {
    if (this.drawMode === "polyline") {
      if (this.state !== "drawing") return false;
    } else if (this.drawMode === "rectangle") {
      if (this.rectState === "idle") return false;
    } else if (this.circleState === "idle") return false;
    this._openHubWithCurrentPreview();
    return true;
  }



  /** Vorschau für Rechteck-/Kreis-Modus. */
  private _drawShapePreview(ctx: CanvasRenderingContext2D, cam: any) {
    const input = this.app.input;
    const style = this.app.getCurrentLineStyle();
    const lw = (this.app.renderer as any)._segStrokePx?.(style.thicknessM) ?? Math.max(0.5, style.thicknessM * cam.scale);
    let pts: Vec2[] | null = null;
    let closed = true;

    if (this.drawMode === "rectangle") {
      if (this.rectState === "firstSide" && this.rectPointA) {
        pts = [this.rectPointA, this._rectFirstSidePoint(input)];
        closed = false;
      } else if (this.rectState === "secondSide") {
        pts = this._getRectPreviewPoints(input);
      }
    } else if (this.drawMode === "circle" && this.circleCenter) {
      if (this.circleState === "radius") {
        const p = this._circlePreviewRadiusWorld(input);
        pts = [this.circleCenter, p];
        closed = false;
      } else if (this.circleState === "arc") {
        const end = this._circlePreviewArcEndAngle(input);
        pts = buildCircleOrSectorPoints(this.circleCenter, this.circleRadiusM, this.circleStartAngleDeg, end, 96);
      }
    }
    if (!pts || pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = cam.worldToScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(77,163,255,0.85)";
    for (const p of pts) {
      const s = cam.worldToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {


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
      drawSnapDot(ctx, s.x, s.y, { ring: true });
    }

    if (this.drawMode !== "polyline") { this._drawShapePreview(ctx, cam); return; }

    if (this.state !== "drawing" || !this.currentPoint) return;


    const a = this.currentPoint;
    const b = this._previewWorld(this.app.input);
    const sa = cam.worldToScreen(a.x, a.y);
    const sb = cam.worldToScreen(b.x, b.y);
    const style = this.app.getCurrentLineStyle();

    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = (this.app.renderer as any)._segStrokePx?.(style.thicknessM) ?? Math.max(0.5, style.thicknessM * cam.scale);
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
