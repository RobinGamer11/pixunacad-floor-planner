import { Defaults, SnapType, SelectionType, PointEditAction } from "./constants";
import { Vec2, v, sub, add, mul, dot, dist, angleDeg, pointFromLengthAngle, projectPointToSegment, orthoSnapFromA, nearestAngleToReference, pointInPolygon, polygonCentroid } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { getDimensionGeometry } from "./dimensionGeometry";

type EditTarget =
  | { kind: "segment"; segmentId: string; pointIndex: number }
  | { kind: "hatch"; hatchId: string; pointIndex: number };

export class SelectTool {
  app: CadApp;
  id = "select";
  snap: Snap | null = null;

  activeEditAction: string | null = null;
  editTarget: EditTarget | null = null;

  // For segment edits: fixed = the other endpoint. originalMoving = the moving endpoint.
  // For hatch edits: fixed = polygon centroid (rotate pivot). originalMoving = original position of edited point.
  fixedPoint: Vec2 | null = null;
  otherPointOriginal: Vec2 | null = null;
  // Snapshot of all hatch points at edit start (for translate/rotate of full polygon if needed)
  hatchPointsOriginal: Vec2[] | null = null;

  moveHubLocked = false;
  moveHubLengthM: number | null = null;
  moveHubAngleDeg: number | null = null;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this._clearEditState();
    this.app.renderer.setHoverSegmentId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this._clearEditState();
    this.app.pointEditMenu.hide();
    this.app.hub.hide();
    this.app.renderer.setHoverSegmentId(null);
  }

  finish() {}

  isEditing() { return !!this.activeEditAction; }

  hasPointMenu() {
    return !this.isEditing() && !!this._getSelectedPointContext();
  }

  cyclePointMenu() {
    if (this.hasPointMenu()) this.app.pointEditMenu.next();
  }

  activatePointMenu() {
    if (this.hasPointMenu()) this.app.pointEditMenu.activateCurrent();
  }

  beginPointEdit(action: string) {
    const ctx = this._getSelectedPointContext();
    if (!ctx) return;

    // DELETE handled inline
    if (action === PointEditAction.DELETE) {
      this._deleteSelectedPoint();
      return;
    }

    this.activeEditAction = action;
    this.editTarget = ctx.target;

    if (ctx.target.kind === "segment") {
      const seg = ctx.segment!;
      this.fixedPoint = (ctx.target.pointIndex === 0) ? v(seg.b.x, seg.b.y) : v(seg.a.x, seg.a.y);
      this.otherPointOriginal = (ctx.target.pointIndex === 0) ? v(seg.a.x, seg.a.y) : v(seg.b.x, seg.b.y);
      this.hatchPointsOriginal = null;
    } else {
      const hatch = ctx.hatch!;
      const idx = ctx.target.pointIndex;
      // For hatch points, pivot for rotate = polygon centroid (excluding moving point gives slightly biased pivot, use centroid of all to feel natural).
      this.fixedPoint = polygonCentroid(hatch.points);
      this.otherPointOriginal = v(hatch.points[idx].x, hatch.points[idx].y);
      this.hatchPointsOriginal = hatch.points.map(p => v(p.x, p.y));
    }

    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;

    this.app.pointEditMenu.hide();

    if (action === PointEditAction.ROTATE) {
      const radius = dist(this.fixedPoint!, this.otherPointOriginal!);
      const ang = angleDeg(this.fixedPoint!, this.otherPointOriginal!);
      this.app.hub.bindCommit((vals) => this._applyRotateHubValues(vals));
      this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
      this.app.hub.updateDisplay(radius, ang);
      this.app.hub.setValues(radius, ang);
      this.app.hub.enterEditMode();
    } else if (action === PointEditAction.MOVE) {
      const radius = dist(this.fixedPoint!, this.otherPointOriginal!);
      const ang = angleDeg(this.fixedPoint!, this.otherPointOriginal!);
      this.app.hub.bindCommit((vals) => this._applyMoveHubValues(vals));
      this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
      this.app.hub.updateDisplay(radius, ang);
      this.app.hub.setValues(radius, ang);
      this.app.hub.enterEditMode();
    } else {
      this.app.hub.hide();
      this.app.hub.bindCommit(null);
    }
  }

  private _deleteSelectedPoint() {
    const ctx = this._getSelectedPointContext();
    if (!ctx) return;
    if (ctx.target.kind === "segment") {
      this.app.scene.removeSegment(ctx.segment!);
      this.app.clearSelection();
      this.app.pointEditMenu.hide();
      this.app.refreshLabelUI();
    } else {
      const hatch = ctx.hatch!;
      if (hatch.points.length > 3) {
        this.app.scene.removePointFromHatch(hatch, ctx.target.pointIndex);
        this.app.setSelection({ type: SelectionType.HATCH, hatchId: hatch.id, pointIndex: null });
      } else {
        this.app.scene.removeHatch(hatch);
        this.app.clearSelection();
        this.app.pointEditMenu.hide();
        this.app.refreshLabelUI();
      }
    }
  }

  private _applyRotateHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.activeEditAction !== PointEditAction.ROTATE || !this.editTarget) return;

    const radiusDefault = dist(this.fixedPoint!, this.otherPointOriginal!);
    const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : radiusDefault;
    const nextAng = ((vals.angleDeg != null ? vals.angleDeg : angleDeg(this.fixedPoint!, this.otherPointOriginal!)) % 360 + 360) % 360;

    const p = pointFromLengthAngle(this.fixedPoint!, nextLen, nextAng);
    this._applyMovingPoint(p, this.fixedPoint!);

    this.app.hub.setValues(nextLen, nextAng);
    this.app.hub.updateDisplay(nextLen, nextAng);
  }

  private _applyMoveHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.activeEditAction !== PointEditAction.MOVE) return;
    const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : this.moveHubLengthM;
    const nextAng = (vals.angleDeg != null) ? vals.angleDeg : this.moveHubAngleDeg;

    this.moveHubLocked = true;
    this.moveHubLengthM = nextLen;
    this.moveHubAngleDeg = ((nextAng! % 360) + 360) % 360;

    this.app.hub.setValues(this.moveHubLengthM!, this.moveHubAngleDeg);
    this.app.hub.updateDisplay(this.moveHubLengthM!, this.moveHubAngleDeg);
  }

  /** Apply the new position for the currently edited moving point. For segments, also keeps the fixed endpoint. */
  private _applyMovingPoint(newPoint: Vec2, fixedKeep: Vec2) {
    if (!this.editTarget) return;
    if (this.editTarget.kind === "segment") {
      const seg = this.app.scene.getSegmentById(this.editTarget.segmentId);
      if (!seg) return;
      if (this.editTarget.pointIndex === 0) {
        seg.a = v(newPoint.x, newPoint.y);
        seg.b = v(fixedKeep.x, fixedKeep.y);
      } else {
        seg.b = v(newPoint.x, newPoint.y);
        seg.a = v(fixedKeep.x, fixedKeep.y);
      }
    } else {
      const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
      if (!hatch) return;
      hatch.points[this.editTarget.pointIndex] = v(newPoint.x, newPoint.y);
    }
  }

  /** Apply translate delta for the whole object (segment or hatch). */
  private _applyTranslateDelta(delta: Vec2) {
    if (!this.editTarget) return;
    if (this.editTarget.kind === "segment") {
      const seg = this.app.scene.getSegmentById(this.editTarget.segmentId);
      if (!seg) return;
      const movingFinal = { x: this.otherPointOriginal!.x + delta.x, y: this.otherPointOriginal!.y + delta.y };
      const fixedFinal = { x: this.fixedPoint!.x + delta.x, y: this.fixedPoint!.y + delta.y };
      if (this.editTarget.pointIndex === 0) {
        seg.a = v(movingFinal.x, movingFinal.y);
        seg.b = v(fixedFinal.x, fixedFinal.y);
      } else {
        seg.b = v(movingFinal.x, movingFinal.y);
        seg.a = v(fixedFinal.x, fixedFinal.y);
      }
    } else {
      const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
      if (!hatch || !this.hatchPointsOriginal) return;
      for (let i = 0; i < hatch.points.length; i++) {
        const orig = this.hatchPointsOriginal[i];
        hatch.points[i] = v(orig.x + delta.x, orig.y + delta.y);
      }
    }
  }

  private _getSelectedPointContext() {
    const sel = this.app.selection;
    if (!sel || sel.type !== SelectionType.POINT) return null;
    if (sel.segmentId) {
      const segment = this.app.scene.getSegmentById(sel.segmentId);
      if (!segment) return null;
      return {
        target: { kind: "segment" as const, segmentId: sel.segmentId, pointIndex: sel.pointIndex! },
        segment,
        hatch: null,
        point: sel.pointIndex === 0 ? segment.a : segment.b,
      };
    }
    if (sel.hatchId) {
      const hatch = this.app.scene.getHatchById(sel.hatchId);
      if (!hatch) return null;
      const idx = sel.pointIndex!;
      if (idx < 0 || idx >= hatch.points.length) return null;
      return {
        target: { kind: "hatch" as const, hatchId: sel.hatchId, pointIndex: idx },
        segment: null,
        hatch,
        point: hatch.points[idx],
      };
    }
    return null;
  }

  _clearEditState() {
    this.activeEditAction = null;
    this.editTarget = null;
    this.fixedPoint = null;
    this.otherPointOriginal = null;
    this.hatchPointsOriginal = null;
    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;
    this.app.hub.bindCommit(null);
  }

  private _hitTestWithForegroundPriority(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const cam = this.app.camera;
    const selectedSeg = this.app.getSelectedSegment();
    const selectedHatch = this.app.getSelectedHatch();

    const distPxToWorldPoint = (pWorld: Vec2) => {
      const sp = cam.worldToScreen(pWorld.x, pWorld.y);
      return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
    };

    // Priority: selected hatch points
    if (selectedHatch && this.app.labelManager.isVisible(selectedHatch.labelId)) {
      for (let i = 0; i < selectedHatch.points.length; i++) {
        const px = distPxToWorldPoint(selectedHatch.points[i]);
        if (px <= Defaults.hitPx) return { type: SelectionType.POINT, hatchId: selectedHatch.id, pointIndex: i };
      }
      if (selectedHatch.points.length >= 3 && pointInPolygon(mouseW, selectedHatch.points)) {
        return { type: SelectionType.HATCH, hatchId: selectedHatch.id, pointIndex: null };
      }
    }

    // Priority: selected segment points
    if (selectedSeg && this.app.labelManager.isVisible(selectedSeg.labelId)) {
      const pxA = distPxToWorldPoint(selectedSeg.a);
      if (pxA <= Defaults.hitPx) return { type: SelectionType.POINT, segmentId: selectedSeg.id, pointIndex: 0 };
      const pxB = distPxToWorldPoint(selectedSeg.b);
      if (pxB <= Defaults.hitPx) return { type: SelectionType.POINT, segmentId: selectedSeg.id, pointIndex: 1 };

      const projSel = projectPointToSegment(mouseW, selectedSeg.a, selectedSeg.b);
      const pxSel = distPxToWorldPoint(projSel.q);
      if (pxSel <= Defaults.hitPx) return { type: SelectionType.SEGMENT, segmentId: selectedSeg.id };
    }

    const visibleSegs = this.app.topology._segmentsFrontToBack();
    const visibleHatches = this.app.topology._hatchesFrontToBack();

    let best: any = null;
    let bestScore = Infinity;

    // Segment points
    for (const seg of visibleSegs) {
      if (selectedSeg && seg.id === selectedSeg.id) continue;
      const pxA = distPxToWorldPoint(seg.a);
      if (pxA <= Defaults.hitPx && pxA < bestScore) {
        bestScore = pxA;
        best = { type: SelectionType.POINT, segmentId: seg.id, pointIndex: 0 };
      }
      const pxB = distPxToWorldPoint(seg.b);
      if (pxB <= Defaults.hitPx && pxB < bestScore) {
        bestScore = pxB;
        best = { type: SelectionType.POINT, segmentId: seg.id, pointIndex: 1 };
      }
    }

    // Hatch points
    for (const hatch of visibleHatches) {
      if (selectedHatch && hatch.id === selectedHatch.id) continue;
      for (let i = 0; i < hatch.points.length; i++) {
        const px = distPxToWorldPoint(hatch.points[i]);
        if (px <= Defaults.hitPx && px < bestScore) {
          bestScore = px;
          best = { type: SelectionType.POINT, hatchId: hatch.id, pointIndex: i };
        }
      }
    }

    // Segment lines
    for (const seg of visibleSegs) {
      if (selectedSeg && seg.id === selectedSeg.id) continue;
      const proj = projectPointToSegment(mouseW, seg.a, seg.b);
      const px = distPxToWorldPoint(proj.q);
      if (px <= Defaults.hitPx && px < bestScore) {
        bestScore = px;
        best = { type: SelectionType.SEGMENT, segmentId: seg.id };
      }
    }

    if (best) return best;

    // Hatch polygon hit (pointInPolygon)
    for (const hatch of visibleHatches) {
      if (selectedHatch && hatch.id === selectedHatch.id) continue;
      if (hatch.points.length >= 3 && pointInPolygon(mouseW, hatch.points)) {
        return { type: SelectionType.HATCH, hatchId: hatch.id, pointIndex: null };
      }
    }

    return null;
  }

  /** Look for a hatch edge near mouse; return {hatch, edgeIndex, t} or null. */
  private _hitTestHatchEdge(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const cam = this.app.camera;

    const distPxToWorldPoint = (pWorld: Vec2) => {
      const sp = cam.worldToScreen(pWorld.x, pWorld.y);
      return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
    };

    const visibleHatches = this.app.topology._hatchesFrontToBack();
    let best: { hatch: any; edgeIndex: number; t: number } | null = null;
    let bestPx = Infinity;

    for (const hatch of visibleHatches) {
      const n = hatch.points.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const a = hatch.points[i];
        const b = hatch.points[(i + 1) % n];
        const proj = projectPointToSegment(mouseW, a, b);
        if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
        const px = distPxToWorldPoint(proj.q);
        if (px <= Defaults.hitPx && px < bestPx) {
          bestPx = px;
          best = { hatch, edgeIndex: i, t: proj.t };
        }
      }
    }
    return best;
  }

  private _findPreviewSnapForEdit(input: Input) {
    if (!this.editTarget) return null;
    if (this.editTarget.kind === "segment") {
      return this.app.topology.findBestSnapExcludingSegment(
        v(input.mouse.sx, input.mouse.sy),
        v(input.mouse.wx, input.mouse.wy),
        this.editTarget.segmentId
      );
    }
    return this.app.topology.findBestSnapExcludingHatch(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy),
      this.editTarget.hatchId
    );
  }

  private _findRotateAssistSegment(input: Input) {
    const snap = this._findPreviewSnapForEdit(input);
    return snap?.segment || null;
  }

  private _applyAngleConstraintFromKeys(basePoint: Vec2, rawPoint: Vec2, refSeg: any, input: Input) {
    const currentAngle = angleDeg(basePoint, rawPoint);
    if (input.keys.space) {
      if (refSeg) {
        const base = angleDeg(refSeg.a, refSeg.b);
        const options = [
          ((base) % 360 + 360) % 360,
          ((base + 180) % 360 + 360) % 360,
          ((base + 90) % 360 + 360) % 360,
          ((base + 270) % 360 + 360) % 360,
        ];
        const snapped = nearestAngleToReference(options, currentAngle);
        const dir = pointFromLengthAngle(v(0, 0), 1, snapped);
        const rel = sub(rawPoint, basePoint);
        const projectedLen = Math.max(0, dot(rel, dir));
        return pointFromLengthAngle(basePoint, projectedLen, snapped);
      }
      return orthoSnapFromA(basePoint, rawPoint);
    }
    if (input.keys.shift) {
      return orthoSnapFromA(basePoint, rawPoint);
    }
    return rawPoint;
  }

  private _previewMovePoint(input: Input) {
    if (this.moveHubLocked && this.moveHubLengthM != null && this.moveHubAngleDeg != null) {
      return pointFromLengthAngle(this.fixedPoint!, this.moveHubLengthM, this.moveHubAngleDeg);
    }
    const snap = this._findPreviewSnapForEdit(input);
    let raw = (snap && snap.world) ? v(snap.world.x, snap.world.y) : v(input.mouse.wx, input.mouse.wy);
    raw = this._applyAngleConstraintFromKeys(this.fixedPoint!, raw, snap?.segment || null, input);
    return raw;
  }

  private _commitMovePoint(input: Input) {
    if (this.moveHubLocked && this.moveHubLengthM != null && this.moveHubAngleDeg != null) {
      return pointFromLengthAngle(this.fixedPoint!, this.moveHubLengthM, this.moveHubAngleDeg);
    }
    const snap = this._findPreviewSnapForEdit(input);
    let raw = (snap && snap.world) ? v(snap.world.x, snap.world.y) : v(input.mouse.wx, input.mouse.wy);
    raw = this._applyAngleConstraintFromKeys(this.fixedPoint!, raw, snap?.segment || null, input);
    return this.app.topology.resolveSnapPoint(snap, raw);
  }

  private _previewTranslateDelta(input: Input) {
    const originMoving = this.otherPointOriginal!;
    const snap = this._findPreviewSnapForEdit(input);
    let target = (snap && snap.world) ? v(snap.world.x, snap.world.y) : v(input.mouse.wx, input.mouse.wy);
    target = this._applyAngleConstraintFromKeys(originMoving, target, snap?.segment || null, input);
    return sub(target, originMoving);
  }

  private _commitTranslateDelta(input: Input) {
    const originMoving = this.otherPointOriginal!;
    const snap = this._findPreviewSnapForEdit(input);
    let target = (snap && snap.world) ? v(snap.world.x, snap.world.y) : v(input.mouse.wx, input.mouse.wy);
    target = this._applyAngleConstraintFromKeys(originMoving, target, snap?.segment || null, input);
    const resolved = this.app.topology.resolveSnapPoint(snap, target);
    return sub(resolved, originMoving);
  }

  private _previewRotateAngle(input: Input) {
    return angleDeg(this.fixedPoint!, v(input.mouse.wx, input.mouse.wy));
  }

  update(input: Input) {
    if (this.isEditing()) {
      if (this.activeEditAction === PointEditAction.MOVE) {
        const p = this._previewMovePoint(input);
        const metrics = { lengthM: dist(this.fixedPoint!, p), angleDeg: angleDeg(this.fixedPoint!, p) };

        this._applyMovingPoint(p, this.fixedPoint!);

        this.app.renderer.setHoverSegmentId(null);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);

        if (input.clicked) {
          const finalP = this._commitMovePoint(input);
          this._applyMovingPoint(finalP, this.fixedPoint!);
          this._clearEditState();
          this.app.hub.hide();
        }
        return;
      }

      if (this.activeEditAction === PointEditAction.TRANSLATE) {
        const delta = this._previewTranslateDelta(input);
        this._applyTranslateDelta(delta);

        this.app.renderer.setHoverSegmentId(null);
        this.app.hub.hide();

        if (input.clicked) {
          const finalDelta = this._commitTranslateDelta(input);
          this._applyTranslateDelta(finalDelta);
          this._clearEditState();
        }
        return;
      }

      if (this.activeEditAction === PointEditAction.ROTATE) {
        const assistSeg = this._findRotateAssistSegment(input);
        this.app.renderer.setHoverSegmentId(assistSeg ? assistSeg.id : null);

        const radius = dist(this.fixedPoint!, this.otherPointOriginal!);
        const ang = this._previewRotateAngle(input);
        const p = pointFromLengthAngle(this.fixedPoint!, radius, ang);

        if (document.activeElement !== this.app.hub.lenInputEl && document.activeElement !== this.app.hub.angInputEl) {
          this._applyMovingPoint(p, this.fixedPoint!);
          this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
          this.app.hub.updateDisplay(radius, ang);
        }

        if (input.clicked) {
          this._clearEditState();
          this.app.hub.hide();
          this.app.renderer.setHoverSegmentId(null);
        }
        return;
      }
    }

    this.app.renderer.setHoverSegmentId(null);
    this.app.hub.hide();

    // Double-click on hatch edge → insert point
    if (input.doubleClicked) {
      const edgeHit = this._hitTestHatchEdge(input);
      if (edgeHit) {
        const result = this.app.scene.insertPointIntoHatchEdge(edgeHit.hatch, edgeHit.edgeIndex, edgeHit.t);
        if (result.didInsert) {
          this.app.setSelection({ type: SelectionType.POINT, hatchId: edgeHit.hatch.id, pointIndex: result.pointIndex });
          this.app.showHatchSettingsPanel(true);
        }
        return;
      }
    }

    if (input.clicked) {
      const hit = this._hitTestWithForegroundPriority(input);
      this.app.setSelection(hit);
      if (hit && hit.segmentId) {
        this.app.showLineSettingsPanel(true);
      }
      if (hit && hit.hatchId) {
        this.app.showHatchSettingsPanel(true);
      }
    }

    const ctx = this._getSelectedPointContext();
    if (ctx) {
      const p = ctx.point;
      const sp = this.app.camera.worldToScreen(p.x, p.y);
      this.app.pointEditMenu.showAt(sp.x, sp.y);
    } else {
      this.app.pointEditMenu.hide();
    }

    this.snap = this.app.topology.findBestSnap(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy)
    );
  }

  _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    if (this.isEditing()) {
      if (this.activeEditAction === PointEditAction.MOVE || this.activeEditAction === PointEditAction.TRANSLATE) {
        const snap = this._findPreviewSnapForEdit(this.app.input);

        if (snap && snap.type === SnapType.LINE && snap.lineA && snap.lineB) {
          const a = cam.worldToScreen(snap.lineA.x, snap.lineA.y);
          const b = cam.worldToScreen(snap.lineB.x, snap.lineB.y);
          ctx.save();
          ctx.strokeStyle = "rgba(77,163,255,0.42)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.restore();
        }

        if (snap && snap.world) {
          const s = cam.worldToScreen(snap.world.x, snap.world.y);
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
      }
      return;
    }

    if (!this.snap) return;

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
}
