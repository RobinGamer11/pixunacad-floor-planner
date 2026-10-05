import { buildGuideGeometry, type GuideGeometry } from "./guideGeometry";
import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType } from "./constants";
import {
  Vec2, v, add, sub, mul, norm, dot, dist, angleDeg, pointFromLengthAngle,
  orthoSnapFromA, nearestAngleToReference, rgbaFromHex,
  lineLineIntersectionInfinite, projectPointToInfiniteLine,
  normalizeDeg, buildCircleOrSectorPoints, polygonCentroid, pointInPolygon
} from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { findEnclosingFace } from "./hatchFill";
import { findHybridEnclosingFace } from "./hybridFill";

import { maybeRasterize } from "./rasterize";
import { toast } from "sonner";




export type HatchDrawMode = "polygon" | "rectangle" | "circle" | "fill";

export class HatchTool {
  app: CadApp;
  id = "hatch";

  drawMode: HatchDrawMode = "polygon";

  /** Letzter Input-Frame — für ENTER-Abschluss mit aktueller Vorschau. */
  private _lastInput: Input | null = null;

  // Polygon mode state
  state: "idle" | "drawing" = "idle";
  points: Vec2[] = [];

  // Rectangle mode state
  rectState: "idle" | "firstSide" | "secondSide" = "idle";
  rectPointA: Vec2 | null = null;
  rectPointB: Vec2 | null = null;

  // Circle mode state ("idle" | "radius" | "arc")
  circleState: "idle" | "radius" | "arc" = "idle";
  circleCenter: Vec2 | null = null;
  circleRadiusM = 0;
  circleStartAngleDeg = 0;
  circleEndAngleDeg = 0;

  snap: Snap | null = null;
  activeTargetHatchId: string | null = null;
  startReferenceEdge: { hatchId: string; edgeIndex: number } | null = null;
  startPointReference: { a: Vec2; b: Vec2 } | null = null;

  hubLocked = false;
  hubLengthM: number | null = null;
  hubAngleDeg: number | null = null;


  onDrawModeChange?: (mode: HatchDrawMode) => void;

  setDrawMode(mode: HatchDrawMode) {
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
    this.points = [];
    this.rectState = "idle";
    this.rectPointA = null;
    this.rectPointB = null;
    this._resetCircleState();
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
    this.rectState = "idle";
    this.rectPointA = null;
    this.rectPointB = null;
    this._resetCircleState();
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
  /** ENTER: laufende Kontur sofort abschließen und Schraffur erzeugen. */
  finishFromKey(): boolean {
    if (this.drawMode === "polygon" && this.state === "drawing") {
      if (this.points.length >= this._polygonMinPoints()) {
        this._finishAndCreateHatch(this.points.slice(), this._polygonAutoCloses());
        return true;
      }
      this.finish();
      return true;
    }
    if (this.drawMode === "rectangle" && this.rectState !== "idle") {
      // Im Breiten-Status wird die aktuelle Vorschau direkt platziert.
      if (this.rectState === "secondSide" && this._lastInput) {
        const rect = this._getRectPreviewPoints(this._lastInput);
        if (rect && dist(rect[1], rect[2]) >= Defaults.minSegLenM) {
          this._finishAndCreateHatch(rect);
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

  /** BACKSPACE: letzten gesetzten Punkt der laufenden Kontur entfernen. */
  removeLastPoint(): boolean {
    if (this.drawMode !== "polygon" || this.state !== "drawing") return false;
    if (this.points.length <= 1) { this.cancel(); return true; }
    this.points.pop();
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    return true;
  }

  isDrawing() { return this.state === "drawing" || this.rectState !== "idle" || this.circleState !== "idle"; }
  /** Bezugspunkt für den zentralen Hilfslinien-Controller. */
  getGuideAnchor() { return this.points.length ? this.points[this.points.length - 1] : null; }
  /** Laufende Zeichnung (gesetzte Punkte + bestätigte Kanten) als temporäre Guide-Geometrie – nur lesend. */
  getGuideExtraGeometry(): GuideGeometry {
    const edges: [Vec2, Vec2][] = [];
    for (let i = 0; i < this.points.length - 1; i++) edges.push([this.points[i], this.points[i + 1]]);
    return buildGuideGeometry({ scene: null, isVisible: () => true, extraEdges: edges, extraPoints: this.points });
  }

  protected _resetCircleState() {
    this.circleState = "idle";
    this.circleCenter = null;
    this.circleRadiusM = 0;
    this.circleStartAngleDeg = 0;
    this.circleEndAngleDeg = 0;
  }

  /* ---- Guide system (identical pattern to LineTool) ---- */





  private _getReferenceDirection(): Vec2 | null {
    const refSeg = this._getReferenceSegmentPoints();
    if (refSeg) return norm(sub(refSeg.b, refSeg.a));
    return null;
  }





  private _findGuideSnap(mouseS: Vec2, mouseW: Vec2): Snap | null {
    return (this.app as any).globalGuides?.findSnap(mouseS, mouseW, this.app.camera) ?? null;
  }

  /* ---- Snap ---- */

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

  private _findDraftPointSnap(input: Input): Snap | null {
    if (this.state !== "drawing" || this.points.length === 0) return null;
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    let best: Snap | null = null;
    let bestPx = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const sp = this.app.camera.worldToScreen(p.x, p.y);
      const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
      if (px > Defaults.snapPx) continue;
      if (px < bestPx) {
        bestPx = px;
        best = {
          type: SnapType.POINT, world: v(p.x, p.y),
          segment: null, hatch: null, pointIndex: i, edgeIndex: null, t: null, px,
        } as Snap;
      }
    }
    return best;
  }

  private _findHatchToolSnap(input: Input): Snap | null {
    const draftStartSnap = this._findDraftStartSnap(input);
    if (draftStartSnap) return draftStartSnap;

    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);

    // Guide intersection snap (highest priority)
    const guideSnap = this._findGuideSnap(mouseS, mouseW);
    if (guideSnap && guideSnap.type === SnapType.GUIDE_POINT) return guideSnap;

    // Draft point snap (currently in-progress polygon points)
    const draftPointSnap = this._findDraftPointSnap(input);
    if (draftPointSnap) return draftPointSnap;

    const snap = this.app.topology.findBestSnap(mouseS, mouseW);
    if (snap?.hatch) this.activeTargetHatchId = snap.hatch.id;
    if (snap?.segment) this.activeTargetHatchId = null;

    // Point snaps take priority over guide lines
    if (snap && snap.type === SnapType.POINT) return snap;

    // Guide line snap
    if (guideSnap) return guideSnap;

    return snap;
  }

  /* ---- Reference directions ---- */

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
    if (this.snap && this.snap.type === SnapType.LINE && this.snap.segment) {
      return { a: v(this.snap.segment.a.x, this.snap.segment.a.y), b: v(this.snap.segment.b.x, this.snap.segment.b.y) };
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

  /* ---- Constraints ---- */

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

  /* ---- Preview & Commit ---- */

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
    if (snap.type === SnapType.GUIDE || snap.type === SnapType.GUIDE_POINT) {
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

  /* ---- Hub ---- */

  private _openHubWithCurrentPreview() {
    if (this.drawMode === "polygon") {
      if (this.state !== "drawing" || this.points.length === 0) return;
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
      // circle
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
    if (this.drawMode === "polygon") {
      if (this.state !== "drawing" || this.points.length === 0) return;
    } else if (this.drawMode === "rectangle") {
      if (this.rectState === "idle") return;
    } else {
      // circle
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

  /* ---- Finish ---- */

  /** Mindestpunktzahl im freien Modus (offene Ketten brauchen nur zwei). */
  protected _polygonMinPoints(): number { return 3; }
  /** Wird die freie Kontur beim Beenden automatisch geschlossen? */
  protected _polygonAutoCloses(): boolean { return true; }

  protected _finishAndCreateHatch(points: Vec2[], closed = true) {
    if (points.length < (closed ? 3 : 2)) return;
    this._createShapeFromPoints(points, closed);
    this.app.clearSelection();
    this.points = [];
    this.state = "idle";
    this.rectState = "idle";
    this.rectPointA = null;
    this.rectPointB = null;
    this._resetCircleState();
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.startReferenceEdge = null;
    this.startPointReference = null;
  }

  /**
   * Erzeugt das eigentliche Objekt aus der fertigen Kontur.
   * Das Polygonwerkzeug überschreibt diesen Hook (erzeugt ein Polygonobjekt
   * statt einer Schraffur) — die gesamte Zeichenmechanik bleibt geteilt.
   */
  protected _createShapeFromPoints(points: Vec2[], _closed = true) {

    // Wenn eine bestehende Schraffur ausgewählt ist und die neue Kontur
    // innerhalb dieser liegt, wird sie als Aussparung (Hole) in die
    // ausgewählte Schraffur eingetragen — es entsteht KEINE neue Schraffur.
    const sel = this.app.selection;
    const targetHatch = (sel && sel.hatchId) ? this.app.scene.getHatchById(sel.hatchId) : null;
    let carvedAsHole = false;
    if (targetHatch && targetHatch.points.length >= 3) {
      const c = polygonCentroid(points);
      if (pointInPolygon(c, targetHatch.points)) {
        if (!targetHatch.holes) targetHatch.holes = [];
        targetHatch.holes.push(points.map(p => v(p.x, p.y)));
        carvedAsHole = true;
      }
    }

    if (!carvedAsHole) {
      this.app.runAction(() => {
        const createdHatch = this.app.scene.createHatch(points, { ...this.app.getCurrentHatchStyle(), ...((this.app as any).getStrokeEffectDefaults?.("hatch") ?? {}) });
        maybeRasterize(this.app, { type: "hatch", obj: createdHatch });
      });
    }
  }

  /* ---- Circle helpers ---- */

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

  protected _finishCircle(forceFullCircle: boolean) {
    if (!this.circleCenter || this.circleRadiusM <= Defaults.minSegLenM) return;
    const points = forceFullCircle
      ? buildCircleOrSectorPoints(this.circleCenter, this.circleRadiusM, 0, 360, 96)
      : buildCircleOrSectorPoints(this.circleCenter, this.circleRadiusM, this.circleStartAngleDeg, this.circleEndAngleDeg, 96);
    if (!points || points.length < 3) return;
    this._finishAndCreateHatch(points);
  }

  protected _onCircleClick(input: Input) {
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


  /* ---- Rectangle helpers ---- */

  private _leftNormalUnit(a: Vec2, b: Vec2): Vec2 {
    const d = norm(sub(b, a));
    return v(-d.y, d.x);
  }

  private _getRectWidthCandidates(): number[] {
    if (!this.rectPointA || !this.rectPointB) return [0, 180];
    const base = angleDeg(this.rectPointA, this.rectPointB);
    return [
      ((base + 90) % 360 + 360) % 360,
      ((base + 270) % 360 + 360) % 360,
    ];
  }

  private _getRectPreviewWidthPoint(input: Input): Vec2 | null {
    if (!this.rectPointA || !this.rectPointB) return null;
    const baseAngle = angleDeg(this.rectPointA, this.rectPointB);
    const leftN = this._leftNormalUnit(this.rectPointA, this.rectPointB);

    if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
      const candidates = this._getRectWidthCandidates();
      const chosen = nearestAngleToReference(candidates, this.hubAngleDeg);
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
    let p = this._rawPreviewWorld(input);
    p = this._applyRelativeConstraint(a, p, input);
    return this._resolveCommitPointWithConstraint(this.snap, p, input);
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

  /* ---- Update ---- */

  update(input: Input) {
    this._lastInput = input;
    this.snap = this._findHatchToolSnap(input);
    this._refreshHoverHatch();

    // Right-click: toggle guide anchors/parallel guides

    if (this.drawMode === "fill") {
      this.app.hub.hide();
      if (input.clicked) this._onFillClick(input);
      return;
    }

    if (this.drawMode === "polygon") {
      if (this.state === "drawing") {
        const metrics = this._previewMetrics(input);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);
      } else {
        this.app.hub.hide();
      }

      if (input.doubleClicked) {
        if (this.state === "drawing" && this.points.length >= this._polygonMinPoints()) {
          this._finishAndCreateHatch(this.points.slice(), this._polygonAutoCloses());
        } else {
          this.finish();
        }
        return;
      }

      if (input.clicked) this._onClick(input);
    } else if (this.drawMode === "rectangle") {
      if (this.rectState !== "idle") {
        const metrics = this._rectPreviewMetrics(input);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);
      } else {
        this.app.hub.hide();
      }
      if (input.clicked) this._onRectClick(input);
    } else {
      // circle mode
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

      if (input.doubleClicked && this.circleState === "arc") {
        this._finishCircle(true);
        return;
      }
      if (input.clicked) this._onCircleClick(input);
    }
  }

  private _onClick(input: Input) {
    if (
      this.state === "drawing" && this.snap && this.snap.isDraftStart &&
      this.points.length >= 3 && !this._hasAngleConstraint(input)
    ) {
      this._finishAndCreateHatch(this.points.slice(), true);
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
      } else if (this.snap && this.snap.type === SnapType.LINE && this.snap.segment) {
        this.startReferenceEdge = null;
        this.startPointReference = { a: v(this.snap.segment.a.x, this.snap.segment.a.y), b: v(this.snap.segment.b.x, this.snap.segment.b.y) };
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
      this._finishAndCreateHatch(this.points.slice(), true);
      return;
    }

    this.points.push(v(point.x, point.y));
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
  }

  private _onFillClick(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const raster = this.app.rasterLayers;
    const isVisible = (id: string) => this.app.labelManager.isVisible(id);
    // Bibliotheksobjekte begrenzen die Füllung wie normale Geometrie; sie
    // werden dabei ausschließlich gelesen und bleiben unverändert.
    const libScenes = (this.app.topology.librarySnaps?.scenesFor(this.app.scene, isVisible) || []).map((e) => e.scene);
    // Reihenfolge: 1) exakter Vektorpfad (DCEL) — liefert wenige, originale
    // Punkte. 2) Nur wenn dort kein geschlossener Bereich gefunden wird und
    // sichtbarer Rasterinhalt existiert, greift die hybride Rasteranalyse.
    let loop: ReturnType<typeof findEnclosingFace> = findEnclosingFace(this.app.scene, mouseW, libScenes);
    if (!loop || loop.length < 3) {
      const hasRaster = !!raster?.labelIds().some((id) => isVisible(id));
      if (hasRaster) {
        loop = findHybridEnclosingFace(this.app.scene, raster, mouseW, { scope: "all", isVisible, extraScenes: libScenes });
      }
    }
    if (!loop || loop.length < 3) {
      toast.error("Bereich nicht geschlossen", {
        description: "Klicke in einen vollständig von Linien, Wänden oder Pixelstrichen umschlossenen Bereich.",
      });
      return;
    }
    const fillLoop = loop;
    this.app.runAction(() => {
      const filledHatch = this.app.scene.createHatch(fillLoop, { ...this.app.getCurrentHatchStyle(), ...((this.app as any).getStrokeEffectDefaults?.("hatch") ?? {}) });
      maybeRasterize(this.app, { type: "hatch", obj: filledHatch });
    });
    this.app.clearSelection();
  }


  private _onRectClick(input: Input) {
    if (this.rectState === "idle") {
      const p = this._commitPoint(input);
      this.rectPointA = v(p.x, p.y);
      this.rectState = "firstSide";
      this.hubLocked = false;
      this.hubLengthM = null;
      this.hubAngleDeg = null;
      if (this.snap && this.snap.type === SnapType.LINE && this.snap.hatch) {
        this.startReferenceEdge = { hatchId: this.snap.hatch.id, edgeIndex: this.snap.edgeIndex! };
        this.startPointReference = null;
      } else if (this.snap && this.snap.type === SnapType.LINE && this.snap.segment) {
        this.startReferenceEdge = null;
        this.startPointReference = { a: v(this.snap.segment.a.x, this.snap.segment.a.y), b: v(this.snap.segment.b.x, this.snap.segment.b.y) };
      } else {
        this.startReferenceEdge = null;
        this.startPointReference = null;
      }
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
      const width = dist(rect[1], rect[2]);
      if (width < Defaults.minSegLenM) return;
      this._finishAndCreateHatch(rect);
    }
  }

  onTabRequest(): boolean {
    if (this.drawMode === "fill") return false;
    if (this.drawMode === "polygon") {
      if (this.state !== "drawing") return false;
    } else if (this.drawMode === "rectangle") {
      if (this.rectState === "idle") return false;
    } else {
      if (this.circleState === "idle") return false;
    }
    this._openHubWithCurrentPreview();
    return true;
  }

  /** Called by CadApp on Enter key while in arc state to commit a full circle. */
  finishCircleFromKey() {
    if (this.drawMode === "circle" && this.circleState === "arc") {
      this._finishCircle(true);
    }
  }

  /* ---- Overlay Drawing ---- */


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

    const style = this.app.getCurrentHatchStyle();
    const fillCol = rgbaFromHex(style.fillColor, style.fillAlphaPct / 100);
    const scaledStrokePx = this.app.renderer.scaledStrokePx(style.strokeWidthPx || 0);

    if (this.drawMode === "rectangle") {
      if (this.rectState === "firstSide" && this.rectPointA) {
        const b = this._rectFirstSidePoint(this.app.input);
        const a0 = cam.worldToScreen(this.rectPointA.x, this.rectPointA.y);
        const b0 = cam.worldToScreen(b.x, b.y);
        ctx.save();
        if (scaledStrokePx > 0) {
          ctx.strokeStyle = style.strokeColor;
          ctx.lineWidth = scaledStrokePx;
          ctx.beginPath();
          ctx.moveTo(a0.x, a0.y);
          ctx.lineTo(b0.x, b0.y);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(77,163,255,0.85)";
        ctx.beginPath(); ctx.arc(a0.x, a0.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(b0.x, b0.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (this.rectState === "secondSide" && this.rectPointA && this.rectPointB) {
        const rect = this._getRectPreviewPoints(this.app.input);
        if (!rect) return;
        ctx.save();
        ctx.beginPath();
        const p0 = cam.worldToScreen(rect[0].x, rect[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < rect.length; i++) {
          const sp = cam.worldToScreen(rect[i].x, rect[i].y);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = fillCol;
        ctx.fill();
        if (scaledStrokePx > 0) {
          ctx.strokeStyle = style.strokeColor;
          ctx.lineWidth = scaledStrokePx;
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(77,163,255,0.85)";
        for (const p of rect) {
          const sp = cam.worldToScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      return;
    }

    if (this.drawMode === "circle") {
      if (!this.circleCenter) return;
      ctx.save();
      const c = cam.worldToScreen(this.circleCenter.x, this.circleCenter.y);
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fill();

      if (this.circleState === "radius") {
        const p = this._circlePreviewRadiusWorld(this.app.input);
        const sp = cam.worldToScreen(p.x, p.y);
        const r = dist(this.circleCenter, p) * cam.scale;

        if (scaledStrokePx > 0) {
          ctx.strokeStyle = style.strokeColor;
          ctx.lineWidth = scaledStrokePx;
        } else {
          ctx.strokeStyle = "rgba(77,163,255,0.85)";
          ctx.lineWidth = 1.5;
        }
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(sp.x, sp.y);
        ctx.stroke();

        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(77,163,255,0.65)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (this.circleState === "arc") {
        const previewPts = buildCircleOrSectorPoints(
          this.circleCenter,
          this.circleRadiusM,
          this.circleStartAngleDeg,
          this.circleEndAngleDeg,
          96
        );
        if (previewPts.length >= 3) {
          ctx.beginPath();
          const p0 = cam.worldToScreen(previewPts[0].x, previewPts[0].y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < previewPts.length; i++) {
            const sp = cam.worldToScreen(previewPts[i].x, previewPts[i].y);
            ctx.lineTo(sp.x, sp.y);
          }
          ctx.closePath();
          ctx.fillStyle = fillCol;
          ctx.fill();
          if (scaledStrokePx > 0) {
            ctx.strokeStyle = style.strokeColor;
            ctx.lineWidth = scaledStrokePx;
            ctx.stroke();
          }
        }

        // Helper radii
        const startP = pointFromLengthAngle(this.circleCenter, this.circleRadiusM, this.circleStartAngleDeg);
        const endP = pointFromLengthAngle(this.circleCenter, this.circleRadiusM, this.circleEndAngleDeg);
        const ss = cam.worldToScreen(startP.x, startP.y);
        const se = cam.worldToScreen(endP.x, endP.y);
        ctx.strokeStyle = "rgba(77,163,255,0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y); ctx.lineTo(ss.x, ss.y);
        ctx.moveTo(c.x, c.y); ctx.lineTo(se.x, se.y);
        ctx.stroke();

        // Endpoint markers
        ctx.fillStyle = "rgba(77,163,255,0.85)";
        ctx.beginPath(); ctx.arc(ss.x, ss.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(se.x, se.y, 4, 0, Math.PI * 2); ctx.fill();
      }

      ctx.restore();
      return;
    }

    if (this.state !== "drawing" || this.points.length === 0) return;

    const previewPoint = this._previewWorld(this.app.input);
    const path = [...this.points, previewPoint];

    ctx.save();

    if (path.length >= 3 && this._polygonAutoCloses()) {
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
