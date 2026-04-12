import { Defaults, SnapType, SelectionType, PointEditAction } from "./constants";
import { Vec2, v, sub, dot, dist, angleDeg, pointFromLengthAngle, projectPointToSegment, orthoSnapFromA } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";

export class SelectTool {
  app: CadApp;
  id = "select";
  snap: Snap | null = null;

  activeEditAction: string | null = null;
  editSegmentId: string | null = null;
  editPointIndex: number | null = null;
  fixedPoint: Vec2 | null = null;
  otherPointOriginal: Vec2 | null = null;

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

    this.activeEditAction = action;
    this.editSegmentId = ctx.segment.id;
    this.editPointIndex = ctx.pointIndex;

    this.fixedPoint = (ctx.pointIndex === 0) ? v(ctx.segment.b.x, ctx.segment.b.y) : v(ctx.segment.a.x, ctx.segment.a.y);
    this.otherPointOriginal = (ctx.pointIndex === 0) ? v(ctx.segment.a.x, ctx.segment.a.y) : v(ctx.segment.b.x, ctx.segment.b.y);

    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;

    this.app.pointEditMenu.hide();

    if (action === PointEditAction.ROTATE) {
      const radius = dist(this.fixedPoint, this.otherPointOriginal);
      const ang = angleDeg(this.fixedPoint, this.otherPointOriginal);
      this.app.hub.bindCommit((vals) => this._applyRotateHubValues(vals));
      this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
      this.app.hub.updateDisplay(radius, ang);
      this.app.hub.setValues(radius, ang);
      this.app.hub.enterEditMode();
    } else if (action === PointEditAction.MOVE) {
      const radius = dist(this.fixedPoint, this.otherPointOriginal);
      const ang = angleDeg(this.fixedPoint, this.otherPointOriginal);
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

  private _applyRotateHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.activeEditAction !== PointEditAction.ROTATE) return;
    const seg = this.app.scene.getSegmentById(this.editSegmentId!);
    if (!seg) return;

    const radiusDefault = dist(this.fixedPoint!, this.otherPointOriginal!);
    const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : radiusDefault;
    const nextAng = ((vals.angleDeg != null ? vals.angleDeg : angleDeg(this.fixedPoint!, this.otherPointOriginal!)) % 360 + 360) % 360;

    const p = pointFromLengthAngle(this.fixedPoint!, nextLen, nextAng);

    if (this.editPointIndex === 0) {
      seg.a = v(p.x, p.y);
      seg.b = v(this.fixedPoint!.x, this.fixedPoint!.y);
    } else {
      seg.b = v(p.x, p.y);
      seg.a = v(this.fixedPoint!.x, this.fixedPoint!.y);
    }

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

  private _getSelectedPointContext() {
    const sel = this.app.selection;
    if (!sel || sel.type !== SelectionType.POINT) return null;
    const segment = this.app.scene.getSegmentById(sel.segmentId);
    if (!segment) return null;
    return { segment, pointIndex: sel.pointIndex! };
  }

  _clearEditState() {
    this.activeEditAction = null;
    this.editSegmentId = null;
    this.editPointIndex = null;
    this.fixedPoint = null;
    this.otherPointOriginal = null;
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

    const distPxToWorldPoint = (pWorld: Vec2) => {
      const sp = cam.worldToScreen(pWorld.x, pWorld.y);
      return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
    };

    if (selectedSeg) {
      const pxA = distPxToWorldPoint(selectedSeg.a);
      if (pxA <= Defaults.hitPx) return { type: SelectionType.POINT, segmentId: selectedSeg.id, pointIndex: 0 };
      const pxB = distPxToWorldPoint(selectedSeg.b);
      if (pxB <= Defaults.hitPx) return { type: SelectionType.POINT, segmentId: selectedSeg.id, pointIndex: 1 };

      const projSel = projectPointToSegment(mouseW, selectedSeg.a, selectedSeg.b);
      const pxSel = distPxToWorldPoint(projSel.q);
      if (pxSel <= Defaults.hitPx) return { type: SelectionType.SEGMENT, segmentId: selectedSeg.id };

      for (const seg of this.app.scene.segments) {
        if (seg.id === selectedSeg.id) continue;
        const proj = projectPointToSegment(mouseW, seg.a, seg.b);
        const px = distPxToWorldPoint(proj.q);
        if (px <= Defaults.hitPx) return { type: SelectionType.SEGMENT, segmentId: seg.id };
      }
      return null;
    }

    let best: any = null;
    let bestScore = Infinity;

    for (const seg of this.app.scene.segments) {
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

    for (const seg of this.app.scene.segments) {
      const proj = projectPointToSegment(mouseW, seg.a, seg.b);
      const px = distPxToWorldPoint(proj.q);
      if (px <= Defaults.hitPx && px < bestScore) {
        bestScore = px;
        best = { type: SelectionType.SEGMENT, segmentId: seg.id };
      }
    }

    return best;
  }

  private _findPreviewSnapForEdit(input: Input) {
    const seg = this.app.scene.getSegmentById(this.editSegmentId!);
    if (!seg) return null;
    return this.app.topology.findBestSnapExcludingSegment(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy),
      seg.id
    );
  }

  private _findRotateAssistSegment(input: Input) {
    const seg = this.app.scene.getSegmentById(this.editSegmentId!);
    if (!seg) return null;
    const snap = this.app.topology.findBestSnapExcludingSegment(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy),
      seg.id
    );
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
        const { nearestAngleToReference: nar } = require("./geometry");
        const snapped = nar(options, currentAngle);
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
      const seg = this.app.scene.getSegmentById(this.editSegmentId!);
      if (!seg) return;

      if (this.activeEditAction === PointEditAction.MOVE) {
        const p = this._previewMovePoint(input);
        const metrics = { lengthM: dist(this.fixedPoint!, p), angleDeg: angleDeg(this.fixedPoint!, p) };

        if (this.editPointIndex === 0) {
          seg.a = v(p.x, p.y);
          seg.b = v(this.fixedPoint!.x, this.fixedPoint!.y);
        } else {
          seg.b = v(p.x, p.y);
          seg.a = v(this.fixedPoint!.x, this.fixedPoint!.y);
        }

        this.app.renderer.setHoverSegmentId(null);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);

        if (input.clicked) {
          const finalP = this._commitMovePoint(input);
          if (this.editPointIndex === 0) {
            seg.a = v(finalP.x, finalP.y);
            seg.b = v(this.fixedPoint!.x, this.fixedPoint!.y);
          } else {
            seg.b = v(finalP.x, finalP.y);
            seg.a = v(this.fixedPoint!.x, this.fixedPoint!.y);
          }
          this._clearEditState();
          this.app.hub.hide();
        }
        return;
      }

      if (this.activeEditAction === PointEditAction.TRANSLATE) {
        const delta = this._previewTranslateDelta(input);
        const movingPreview = { x: this.otherPointOriginal!.x + delta.x, y: this.otherPointOriginal!.y + delta.y };
        const fixedPreview = { x: this.fixedPoint!.x + delta.x, y: this.fixedPoint!.y + delta.y };

        if (this.editPointIndex === 0) {
          seg.a = v(movingPreview.x, movingPreview.y);
          seg.b = v(fixedPreview.x, fixedPreview.y);
        } else {
          seg.b = v(movingPreview.x, movingPreview.y);
          seg.a = v(fixedPreview.x, fixedPreview.y);
        }

        this.app.renderer.setHoverSegmentId(null);
        this.app.hub.hide();

        if (input.clicked) {
          const finalDelta = this._commitTranslateDelta(input);
          const movingFinal = { x: this.otherPointOriginal!.x + finalDelta.x, y: this.otherPointOriginal!.y + finalDelta.y };
          const fixedFinal = { x: this.fixedPoint!.x + finalDelta.x, y: this.fixedPoint!.y + finalDelta.y };

          if (this.editPointIndex === 0) {
            seg.a = v(movingFinal.x, movingFinal.y);
            seg.b = v(fixedFinal.x, fixedFinal.y);
          } else {
            seg.b = v(movingFinal.x, movingFinal.y);
            seg.a = v(fixedFinal.x, fixedFinal.y);
          }
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
          if (this.editPointIndex === 0) {
            seg.a = v(p.x, p.y);
            seg.b = v(this.fixedPoint!.x, this.fixedPoint!.y);
          } else {
            seg.b = v(p.x, p.y);
            seg.a = v(this.fixedPoint!.x, this.fixedPoint!.y);
          }
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

    if (input.clicked) {
      const hit = this._hitTestWithForegroundPriority(input);
      this.app.setSelection(hit);
      if (hit && hit.segmentId) {
        this.app.showLineSettingsPanel(true);
      }
    }

    const ctx = this._getSelectedPointContext();
    if (ctx) {
      const p = (ctx.pointIndex === 0) ? ctx.segment.a : ctx.segment.b;
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
