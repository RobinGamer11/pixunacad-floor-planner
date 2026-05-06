import { Defaults, SnapType, SelectionType, PointEditAction } from "./constants";
import { Vec2, v, sub, add, mul, dot, dist, angleDeg, pointFromLengthAngle, projectPointToSegment, orthoSnapFromA, nearestAngleToReference, pointInPolygon, pointInHatchSolid, polygonCentroid, projectPointToInfiniteLine, lineLineIntersectionInfinite, norm, perpLeft, len } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { getDimensionGeometry } from "./dimensionGeometry";
import { pointInOrientedBox, boxCornersWorld, rotateVector } from "./textGeometry";
import type { TextBox } from "./Scene";
import { pointInInstance, instanceBoundingCornersWorld } from "./StickerManager";
import { pointInDocument } from "./documentGeometry";
import { computeWallLines } from "./wallGeom";

type EditTarget =
  | { kind: "segment"; segmentId: string; pointIndex: number }
  | { kind: "hatch"; hatchId: string; pointIndex: number }
  | { kind: "hatchHole"; hatchId: string; holeIndex: number; pointIndex: number }
  | { kind: "hatchEdge"; hatchId: string; edgeIndex: number }
  | { kind: "hatchHoleEdge"; hatchId: string; holeIndex: number; edgeIndex: number }
  | { kind: "textboxHandle"; textBoxId: string; handleIndex: number }
  | { kind: "wallPoint"; wallId: string; pointIndex: number }
  | { kind: "wallEdge"; wallId: string; edgeIndex: number }
  | { kind: "wall"; wallId: string };

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

  // Hatch-edge-offset state
  hatchEdgeAOriginal: Vec2 | null = null;
  hatchEdgeBOriginal: Vec2 | null = null;
  hatchEdgePrevOriginal: Vec2 | null = null;
  hatchEdgeNextOriginal: Vec2 | null = null;
  hatchEdgeNormal: Vec2 | null = null;     // unit normal pointing "outward" (left of A→B)
  hatchEdgeMidOriginal: Vec2 | null = null;
  hatchEdgeOffsetM = 0;
  hatchEdgeOffsetLocked = false;

  // TextBox handle (corner) edit state
  textBoxOppositeOriginal: Vec2 | null = null; // world pos of opposite corner at edit start
  textBoxRotationOriginal = 0;
  textBoxWidthOriginal = 0;
  textBoxHeightOriginal = 0;
  textBoxCenterOriginal: Vec2 | null = null;
  textBoxCornerOriginal: Vec2 | null = null;   // moving (clicked) corner world pos at edit start

  moveHubLocked = false;
  moveHubLengthM: number | null = null;
  moveHubAngleDeg: number | null = null;

  // Wall edit snapshot
  wallPointsOriginal: Vec2[] | null = null;
  // Wall-Edge offset state (analog hatchEdge*)
  wallEdgeAOriginal: Vec2 | null = null;
  wallEdgeBOriginal: Vec2 | null = null;
  wallEdgePrevOriginal: Vec2 | null = null;
  wallEdgeNextOriginal: Vec2 | null = null;
  wallEdgeNormal: Vec2 | null = null;
  wallEdgeMidOriginal: Vec2 | null = null;
  wallEdgeOffsetM = 0;
  wallEdgeOffsetLocked = false;
  wallEdgeHasPrev = false;
  wallEdgeHasNext = false;

  // Parallel-drag state for dimensions
  dragDimId: string | null = null;
  dragDimOffsetAlongNormal = 0;

  // Sticker-Instanz Drag-State (Translate)
  dragStickerId: string | null = null;
  dragStickerOrigin: Vec2 | null = null; // Position der Instanz beim Drag-Start
  dragStickerMouseStart: Vec2 | null = null; // Mausposition (Welt) bei Drag-Start
  dragStickerGrabOffset: Vec2 | null = null; // mouseStart - instanceOrigin (Greifpunkt-Offset relativ zur Position)
  dragStickerSnap: Snap | null = null; // letzter aktiver Snap während Drag (für Overlay)

  // Document Drag-State (Translate via Mausziehen, snap-fähig)
  dragDocId: string | null = null;
  dragDocGrabOffset: Vec2 | null = null;
  dragDocSnap: Snap | null = null;

  // TextBox Drag/Rotate-State
  dragTextBoxId: string | null = null;
  dragTextBoxGrabOffset: Vec2 | null = null; // mouseStart - center
  dragTextBoxSnap: Snap | null = null;
  rotateTextBoxId: string | null = null;
  rotateTextBoxStartAngle = 0; // initial mouse angle (rad) at rotate-begin
  rotateTextBoxOriginalRot = 0; // box.rotationRad at rotate-begin

  // Hilfslinien-Anker während aktivem Punkt-Edit (per Rechtsklick auf Snap-Punkte gesetzt).
  // Erzeugen vertikale + horizontale Hilfslinien durch jeden Anker, deren Schnittpunkte und Achsen snappen.
  editGuideAnchors: { key: string; point: Vec2 }[] = [];


  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this._clearEditState();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverTextBoxId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this._clearEditState();
    this.app.pointEditMenu.hide();
    this.app.hub.hide();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverTextBoxId(null);
    this.dragDimId = null;
    this.dragDocId = null;
    this.dragDocGrabOffset = null;
    this.dragDocSnap = null;
    this.dragTextBoxId = null;
    this.dragTextBoxGrabOffset = null;
    this.dragTextBoxSnap = null;
    this.rotateTextBoxId = null;
  }

  /** Welt-Position des Rotate-Handles über der Top-Edge-Mitte einer TextBox. */
  private _textBoxRotateHandleWorld(box: TextBox): Vec2 {
    const offsetPx = 22;
    const offsetM = offsetPx / Math.max(1e-6, this.app.camera.scale);
    const lx = 0, ly = -box.heightM * 0.5 - offsetM;
    const c = Math.cos(box.rotationRad), s = Math.sin(box.rotationRad);
    return v(box.center.x + lx * c - ly * s, box.center.y + lx * s + ly * c);
  }

  /** Hit-Test gegen Rotate-Handle der aktuell selektierten TextBox. */
  private _hitTextBoxRotateHandle(input: Input): TextBox | null {
    const sel = this.app.selection;
    if (!sel || (sel.type !== SelectionType.TEXTBOX && sel.type !== SelectionType.TEXTBOX_HANDLE)) return null;
    const box = this.app.getSelectedTextBox();
    if (!box || !this.app.labelManager.isVisible(box.labelId)) return null;
    const handleW = this._textBoxRotateHandleWorld(box);
    const handleS = this.app.camera.worldToScreen(handleW.x, handleW.y);
    const dx = handleS.x - input.mouse.sx;
    const dy = handleS.y - input.mouse.sy;
    if (Math.hypot(dx, dy) <= Defaults.hitPx + 4) return box;
    return null;
  }

  /** Hit-Test gegen die 4 Eck-Handles der aktuell selektierten TextBox. */
  private _hitTextBoxCornerHandle(input: Input): { box: TextBox; handleIndex: number } | null {
    const sel = this.app.selection;
    if (!sel || (sel.type !== SelectionType.TEXTBOX && sel.type !== SelectionType.TEXTBOX_HANDLE)) return null;
    const box = this.app.getSelectedTextBox();
    if (!box || !this.app.labelManager.isVisible(box.labelId)) return null;
    const corners = boxCornersWorld(box);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    let best: { box: TextBox; handleIndex: number } | null = null;
    let bestPx = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const sp = this.app.camera.worldToScreen(corners[i].x, corners[i].y);
      const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
      if (px <= Defaults.hitPx + 2 && px < bestPx) {
        bestPx = px;
        best = { box, handleIndex: i };
      }
    }
    return best;
  }

  finish() {}

  /** Hit-Test gegen Wand-Eckpunkte und Wand-Achslinien. edgeIndex gesetzt bei Liniensegment-Treffer. */
  private _hitTestWall(input: Input): { wallId: string; pointIndex: number | null; edgeIndex: number | null } | null {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const cam = this.app.camera;
    let bestPx = Infinity;
    let bestPoint: { wallId: string; pointIndex: number | null; edgeIndex: number | null } | null = null;
    // Eckpunkte zuerst
    for (const wall of this.app.scene.walls) {
      if (!this.app.labelManager.isVisible(wall.labelId)) continue;
      for (let i = 0; i < wall.corners.length; i++) {
        const sp = cam.worldToScreen(wall.corners[i].x, wall.corners[i].y);
        const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
        if (px <= Defaults.hitPx + 2 && px < bestPx) {
          bestPx = px;
          bestPoint = { wallId: wall.id, pointIndex: i, edgeIndex: null };
        }
      }
    }
    if (bestPoint) return bestPoint;
    // Achslinien
    for (const wall of this.app.scene.walls) {
      if (!this.app.labelManager.isVisible(wall.labelId)) continue;
      for (let i = 0; i < wall.corners.length - 1; i++) {
        const a = wall.corners[i], b = wall.corners[i + 1];
        const proj = projectPointToSegment(mouseW, a, b);
        const sp = cam.worldToScreen(proj.q.x, proj.q.y);
        const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
        if (px <= Defaults.hitPx + 4 && px < bestPx) {
          bestPx = px;
          bestPoint = { wallId: wall.id, pointIndex: null, edgeIndex: i };
        }
      }
    }
    if (bestPoint) return bestPoint;
    // Wand-Körper (gefülltes Polygon main+sub) – Klick irgendwo in der Wand.
    for (let wi = this.app.scene.walls.length - 1; wi >= 0; wi--) {
      const wall = this.app.scene.walls[wi];
      if (!this.app.labelManager.isVisible(wall.labelId)) continue;
      const lines = computeWallLines(wall.corners, wall.thicknessM, wall.referenceSide);
      const poly: Vec2[] = [...lines.mainCorners];
      for (let i = lines.subCorners.length - 1; i >= 0; i--) poly.push(lines.subCorners[i]);
      if (pointInPolygon(mouseW, poly)) {
        return { wallId: wall.id, pointIndex: null, edgeIndex: null };
      }
    }
    return bestPoint;
  }


  private _hitTextBox(input: Input): TextBox | null {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    for (let i = this.app.scene.textBoxes.length - 1; i >= 0; i--) {
      const box = this.app.scene.textBoxes[i];
      if (!this.app.labelManager.isVisible(box.labelId)) continue;
      if (pointInOrientedBox(mouseW, box)) return box;
    }
    return null;
  }

  /** Returns the topmost sticker instance under the mouse, or null. */
  private _hitStickerInstance(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    for (let i = this.app.scene.stickerInstances.length - 1; i >= 0; i--) {
      const inst = this.app.scene.stickerInstances[i];
      if (!this.app.labelManager.isVisible(inst.labelId)) continue;
      if (pointInInstance(inst.items as any, inst.position, inst.rotationRad, inst.scale, mouseW)) return inst;
    }
    return null;
  }

  /** Returns the topmost document under the mouse, or null. */
  private _hitDocument(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    for (let i = this.app.scene.documents.length - 1; i >= 0; i--) {
      const doc = this.app.scene.documents[i];
      if (!this.app.labelManager.isVisible(doc.labelId)) continue;
      if (pointInDocument(mouseW, doc)) return doc;
    }
    return null;
  }

  /** Hit-Test gegen die 4 Eck-Handles der aktuell selektierten Sticker-Instanz. */
  private _hitStickerCorner(input: Input): { instId: string; cornerIndex: number } | null {
    const sel = this.app.selection;
    if (!sel || sel.type !== SelectionType.STICKER_INSTANCE) return null;
    const inst = this.app.scene.getStickerInstanceById((sel as any).stickerInstanceId);
    if (!inst || !this.app.labelManager.isVisible(inst.labelId)) return null;
    const corners = instanceBoundingCornersWorld(inst.items as any, inst.position, inst.rotationRad, inst.scale);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    for (let i = 0; i < corners.length; i++) {
      const sp = this.app.camera.worldToScreen(corners[i].x, corners[i].y);
      if (Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y) <= Defaults.hitPx + 2) {
        return { instId: inst.id, cornerIndex: i };
      }
    }
    return null;
  }

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
    } else if (ctx.target.kind === "hatchHole") {
      const hatch = ctx.hatch!;
      const loop = hatch.holes![ctx.target.holeIndex];
      const idx = ctx.target.pointIndex;
      this.fixedPoint = polygonCentroid(loop);
      this.otherPointOriginal = v(loop[idx].x, loop[idx].y);
      this.hatchPointsOriginal = loop.map(p => v(p.x, p.y));
    } else if (ctx.target.kind === "wallPoint") {
      const wall = this.app.scene.getWallById(ctx.target.wallId)!;
      const idx = ctx.target.pointIndex;
      // Fixpunkt = Nachbar-Eckpunkt (vorhergehender; bei idx 0 nachfolgender)
      const fixIdx = idx === 0 ? 1 : idx - 1;
      this.fixedPoint = v(wall.corners[fixIdx].x, wall.corners[fixIdx].y);
      this.otherPointOriginal = v(wall.corners[idx].x, wall.corners[idx].y);
      this.wallPointsOriginal = wall.corners.map(p => v(p.x, p.y));
      this.hatchPointsOriginal = null;
    } else {
      const hatch = ctx.hatch!;
      const idx = ctx.target.pointIndex;
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

  /** Begin TextBox-Handle-Edit (move/translate/rotate) for a clicked corner. */
  beginTextBoxHandleEdit(textBoxId: string, handleIndex: number, action: string) {
    const box = this.app.scene.getTextBoxById(textBoxId);
    if (!box) return;
    if (action === PointEditAction.DELETE) return;

    this.activeEditAction = action;
    this.editTarget = { kind: "textboxHandle", textBoxId, handleIndex };

    this.textBoxRotationOriginal = box.rotationRad;
    this.textBoxWidthOriginal = box.widthM;
    this.textBoxHeightOriginal = box.heightM;
    this.textBoxCenterOriginal = v(box.center.x, box.center.y);
    const corners = boxCornersWorld(box);
    this.textBoxCornerOriginal = v(corners[handleIndex].x, corners[handleIndex].y);
    this.textBoxOppositeOriginal = v(corners[(handleIndex + 2) % 4].x, corners[(handleIndex + 2) % 4].y);

    this.fixedPoint = v(this.textBoxOppositeOriginal.x, this.textBoxOppositeOriginal.y);
    this.otherPointOriginal = v(this.textBoxCornerOriginal.x, this.textBoxCornerOriginal.y);

    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;
    this.app.pointEditMenu.hide();

    if (action === PointEditAction.ROTATE || action === PointEditAction.MOVE) {
      const radius = dist(this.fixedPoint!, this.otherPointOriginal!);
      const ang = angleDeg(this.fixedPoint!, this.otherPointOriginal!);
      this.app.hub.bindCommit((vals) =>
        action === PointEditAction.ROTATE ? this._applyRotateHubValues(vals) : this._applyMoveHubValues(vals)
      );
      this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
      this.app.hub.updateDisplay(radius, ang);
      this.app.hub.setValues(radius, ang);
      this.app.hub.enterEditMode();
    } else {
      this.app.hub.hide();
      this.app.hub.bindCommit(null);
    }
  }

  /** Begin Hatch-Edge-Offset (parallel shift along edge normal). */
  beginHatchEdgeOffset(hatchId: string, edgeIndex: number, holeIndex: number | null = null) {
    const hatch = this.app.scene.getHatchById(hatchId);
    if (!hatch) return;
    const loop: Vec2[] = holeIndex == null ? hatch.points : (hatch.holes?.[holeIndex] || []);
    const n = loop.length;
    if (n < 3) return;

    this.activeEditAction = PointEditAction.OFFSET;
    this.editTarget = holeIndex == null
      ? { kind: "hatchEdge", hatchId, edgeIndex }
      : { kind: "hatchHoleEdge", hatchId, holeIndex, edgeIndex };

    const A = loop[edgeIndex];
    const B = loop[(edgeIndex + 1) % n];
    const Pp = loop[(edgeIndex - 1 + n) % n];
    const Nn = loop[(edgeIndex + 2) % n];

    this.hatchEdgeAOriginal = v(A.x, A.y);
    this.hatchEdgeBOriginal = v(B.x, B.y);
    this.hatchEdgePrevOriginal = v(Pp.x, Pp.y);
    this.hatchEdgeNextOriginal = v(Nn.x, Nn.y);
    this.hatchEdgeMidOriginal = v((A.x + B.x) * 0.5, (A.y + B.y) * 0.5);

    const dir = sub(B, A);
    const dirLen = Math.hypot(dir.x, dir.y) || 1;
    const nUnit = v(-dir.y / dirLen, dir.x / dirLen);
    const c = polygonCentroid(loop);
    const toCentroid = sub(c, this.hatchEdgeMidOriginal);
    const sign = (nUnit.x * toCentroid.x + nUnit.y * toCentroid.y) > 0 ? -1 : 1;
    this.hatchEdgeNormal = v(nUnit.x * sign, nUnit.y * sign);

    this.hatchEdgeOffsetM = 0;
    this.hatchEdgeOffsetLocked = false;
    this.app.pointEditMenu.hide();

    this.app.hub.bindCommit((vals) => this._applyHatchEdgeHubValues(vals));
    this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
    this.app.hub.updateDisplay(0, 0);
    this.app.hub.setValues(0, 0);
    this.app.hub.enterEditMode();
  }

  private _applyHatchEdgeHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.activeEditAction !== PointEditAction.OFFSET || !this.editTarget) return;
    if (this.editTarget.kind !== "hatchEdge" && this.editTarget.kind !== "hatchHoleEdge") return;
    const off = vals.lengthM != null ? vals.lengthM : this.hatchEdgeOffsetM;
    this.hatchEdgeOffsetLocked = true;
    this.hatchEdgeOffsetM = off;
    this._applyHatchEdgeOffset(off);
    this.app.hub.setValues(off, 0);
    this.app.hub.updateDisplay(off, 0);
  }

  /** Begin Wall-Edit für Edge-Selection (OFFSET = Kantenverschiebung; TRANSLATE/ROTATE = ganze Wand). */
  beginWallEdgeAction(wallId: string, edgeIndex: number, action: string) {
    const wall = this.app.scene.getWallById(wallId);
    if (!wall || wall.corners.length < 2) return;
    if (edgeIndex < 0 || edgeIndex >= wall.corners.length - 1) return;

    if (action === PointEditAction.OFFSET) {
      this.activeEditAction = PointEditAction.OFFSET;
      this.editTarget = { kind: "wallEdge", wallId, edgeIndex };
      const A = wall.corners[edgeIndex];
      const B = wall.corners[edgeIndex + 1];
      this.wallEdgeAOriginal = v(A.x, A.y);
      this.wallEdgeBOriginal = v(B.x, B.y);
      this.wallEdgeHasPrev = edgeIndex > 0;
      this.wallEdgeHasNext = edgeIndex + 2 < wall.corners.length;
      this.wallEdgePrevOriginal = this.wallEdgeHasPrev ? v(wall.corners[edgeIndex - 1].x, wall.corners[edgeIndex - 1].y) : null;
      this.wallEdgeNextOriginal = this.wallEdgeHasNext ? v(wall.corners[edgeIndex + 2].x, wall.corners[edgeIndex + 2].y) : null;
      this.wallEdgeMidOriginal = v((A.x + B.x) * 0.5, (A.y + B.y) * 0.5);
      const dir = sub(B, A);
      const dirLen = Math.hypot(dir.x, dir.y) || 1;
      // Linkes Lot der Zeichenrichtung (analog perpLeftScreen in wallGeom)
      this.wallEdgeNormal = v(dir.y / dirLen, -dir.x / dirLen);
      this.wallEdgeOffsetM = 0;
      this.wallEdgeOffsetLocked = false;
      this.wallPointsOriginal = wall.corners.map(p => v(p.x, p.y));
      this.app.pointEditMenu.hide();
      this.app.hub.bindCommit((vals) => this._applyWallEdgeHubValues(vals));
      this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
      this.app.hub.updateDisplay(0, 0);
      this.app.hub.setValues(0, 0);
      this.app.hub.enterEditMode();
      return;
    }

    if (action === PointEditAction.TRANSLATE || action === PointEditAction.ROTATE) {
      // Ganze Wand: pivot/fixed = Mittelpunkt der Edge
      this.activeEditAction = action;
      this.editTarget = { kind: "wall", wallId };
      const A = wall.corners[edgeIndex];
      const B = wall.corners[edgeIndex + 1];
      const mid = v((A.x + B.x) * 0.5, (A.y + B.y) * 0.5);
      this.wallPointsOriginal = wall.corners.map(p => v(p.x, p.y));
      this.fixedPoint = mid;
      this.otherPointOriginal = v(B.x, B.y);
      this.moveHubLocked = false;
      this.moveHubLengthM = null;
      this.moveHubAngleDeg = null;
      this.app.pointEditMenu.hide();
      if (action === PointEditAction.ROTATE) {
        const radius = dist(this.fixedPoint, this.otherPointOriginal);
        const ang = angleDeg(this.fixedPoint, this.otherPointOriginal);
        this.app.hub.bindCommit((vals) => this._applyWallRotateHubValues(vals));
        this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
        this.app.hub.updateDisplay(radius, ang);
        this.app.hub.setValues(radius, ang);
        this.app.hub.enterEditMode();
      } else {
        this.app.hub.hide();
        this.app.hub.bindCommit(null);
      }
    }
  }

  private _applyWallEdgeHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.activeEditAction !== PointEditAction.OFFSET || !this.editTarget) return;
    if (this.editTarget.kind !== "wallEdge") return;
    const off = vals.lengthM != null ? vals.lengthM : this.wallEdgeOffsetM;
    this.wallEdgeOffsetLocked = true;
    this.wallEdgeOffsetM = off;
    this._applyWallEdgeOffset(off);
    this.app.hub.setValues(off, 0);
    this.app.hub.updateDisplay(off, 0);
  }

  private _applyWallRotateHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.activeEditAction !== PointEditAction.ROTATE || !this.editTarget) return;
    if (this.editTarget.kind !== "wall") return;
    const wall = this.app.scene.getWallById(this.editTarget.wallId);
    if (!wall || !this.wallPointsOriginal || !this.fixedPoint) return;
    const radiusDefault = dist(this.fixedPoint, this.otherPointOriginal!);
    const baseAng = angleDeg(this.fixedPoint, this.otherPointOriginal!);
    const nextAng = vals.angleDeg != null ? vals.angleDeg : baseAng;
    const dRad = ((nextAng - baseAng) * Math.PI) / 180;
    const c = Math.cos(dRad), s = Math.sin(dRad);
    for (let i = 0; i < wall.corners.length; i++) {
      const o = this.wallPointsOriginal[i];
      const dx = o.x - this.fixedPoint.x;
      const dy = o.y - this.fixedPoint.y;
      wall.corners[i] = v(this.fixedPoint.x + dx * c - dy * s, this.fixedPoint.y + dx * s + dy * c);
    }
    this.app.hub.setValues(radiusDefault, nextAng);
    this.app.hub.updateDisplay(radiusDefault, nextAng);
  }

  /** Parallele Verschiebung einer Wand-Achs-Edge entlang ihrer Normale. Nachbar-Eckpunkte gleiten an angrenzender Edge. */
  private _applyWallEdgeOffset(offsetM: number) {
    if (!this.editTarget || this.editTarget.kind !== "wallEdge") return;
    const wall = this.app.scene.getWallById(this.editTarget.wallId);
    if (!wall || !this.wallPointsOriginal) return;
    const A0 = this.wallEdgeAOriginal!;
    const B0 = this.wallEdgeBOriginal!;
    const n = this.wallEdgeNormal!;
    const A1 = v(A0.x + n.x * offsetM, A0.y + n.y * offsetM);
    const B1 = v(B0.x + n.x * offsetM, B0.y + n.y * offsetM);
    const dirEdge = sub(B1, A1);
    const idxA = this.editTarget.edgeIndex;
    const idxB = idxA + 1;
    let newA = A1;
    let newB = B1;
    if (this.wallEdgeHasPrev && this.wallEdgePrevOriginal) {
      const dirPrev = sub(A0, this.wallEdgePrevOriginal);
      const ip = lineLineIntersectionInfinite(A1, dirEdge, this.wallEdgePrevOriginal, dirPrev);
      if (ip) newA = ip;
    }
    if (this.wallEdgeHasNext && this.wallEdgeNextOriginal) {
      const dirNext = sub(B0, this.wallEdgeNextOriginal);
      const ip = lineLineIntersectionInfinite(A1, dirEdge, this.wallEdgeNextOriginal, dirNext);
      if (ip) newB = ip;
    }
    wall.corners[idxA] = newA;
    wall.corners[idxB] = newB;
  }

  private _deleteSelectedPoint() {
    const ctx = this._getSelectedPointContext();
    if (!ctx) return;
    if (ctx.target.kind === "segment") {
      this.app.scene.removeSegment(ctx.segment!);
      this.app.clearSelection();
      this.app.pointEditMenu.hide();
      this.app.refreshLabelUI();
    } else if (ctx.target.kind === "hatchHole") {
      const hatch = ctx.hatch!;
      this.app.scene.removePointFromHatchHole(hatch, ctx.target.holeIndex, ctx.target.pointIndex);
      this.app.setSelection({ type: SelectionType.HATCH, hatchId: hatch.id, pointIndex: null });
      this.app.pointEditMenu.hide();
    } else if (ctx.target.kind === "wallPoint") {
      const wall = this.app.scene.getWallById(ctx.target.wallId);
      if (!wall) return;
      if (wall.corners.length > 2) {
        wall.corners.splice(ctx.target.pointIndex, 1);
        this.app.clearSelection();
      } else {
        this.app.scene.removeWall(wall);
        this.app.clearSelection();
        this.app.refreshLabelUI();
      }
      this.app.pointEditMenu.hide();
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
    } else if (this.editTarget.kind === "hatch") {
      const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
      if (!hatch) return;
      hatch.points[this.editTarget.pointIndex] = v(newPoint.x, newPoint.y);
    } else if (this.editTarget.kind === "hatchHole") {
      const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
      const loop = hatch?.holes?.[this.editTarget.holeIndex];
      if (!loop) return;
      loop[this.editTarget.pointIndex] = v(newPoint.x, newPoint.y);
    } else if (this.editTarget.kind === "textboxHandle") {
      // For textbox MOVE/ROTATE: opposite corner is the pivot (fixedKeep);
      // moving handle should land on newPoint. Box width/height stay constant.
      // Compute new center and rotation so that opposite stays put and moving handle reaches newPoint.
      const box = this.app.scene.getTextBoxById(this.editTarget.textBoxId);
      if (!box || this.textBoxOppositeOriginal == null) return;
      const opp = this.textBoxOppositeOriginal;
      const w = this.textBoxWidthOriginal;
      const h = this.textBoxHeightOriginal;
      const diagLen = Math.hypot(w, h);
      const distMoving = Math.hypot(newPoint.x - opp.x, newPoint.y - opp.y);
      if (diagLen < 1e-9 || distMoving < 1e-9) return;
      // Diagonal in local box-frame from opposite corner to moving corner depends on which corner index.
      // boxLocalCorners order: 0=TL, 1=TR, 2=BR, 3=BL
      // opposite-of(0)=2, of(1)=3, of(2)=0, of(3)=1
      const handleIndex = this.editTarget.handleIndex;
      const localMov = this._textBoxLocalCornerForIndex(handleIndex, w, h);
      const localOpp = this._textBoxLocalCornerForIndex((handleIndex + 2) % 4, w, h);
      // Local diagonal vector (from opp to mov)
      const dxL = localMov.x - localOpp.x;
      const dyL = localMov.y - localOpp.y;
      const localDiagAng = Math.atan2(dyL, dxL);
      const worldDiagAng = Math.atan2(newPoint.y - opp.y, newPoint.x - opp.x);
      const newRot = worldDiagAng - localDiagAng;
      // Center is midpoint of opp and moving in world.
      const newCenter = v((opp.x + newPoint.x) * 0.5, (opp.y + newPoint.y) * 0.5);
      box.center = newCenter;
      box.rotationRad = newRot;
    } else if (this.editTarget.kind === "wallPoint") {
      const wall = this.app.scene.getWallById(this.editTarget.wallId);
      if (!wall) return;
      wall.corners[this.editTarget.pointIndex] = v(newPoint.x, newPoint.y);
    }
  }

  private _textBoxLocalCornerForIndex(i: number, w: number, h: number): Vec2 {
    const hw = w * 0.5, hh = h * 0.5;
    if (i === 0) return v(-hw, -hh);
    if (i === 1) return v(hw, -hh);
    if (i === 2) return v(hw, hh);
    return v(-hw, hh);
  }

  /** Apply translate delta for the whole object (segment or hatch or textbox). */
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
    } else if (this.editTarget.kind === "hatch") {
      const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
      if (!hatch || !this.hatchPointsOriginal) return;
      for (let i = 0; i < hatch.points.length; i++) {
        const orig = this.hatchPointsOriginal[i];
        hatch.points[i] = v(orig.x + delta.x, orig.y + delta.y);
      }
    } else if (this.editTarget.kind === "textboxHandle") {
      const box = this.app.scene.getTextBoxById(this.editTarget.textBoxId);
      if (!box || !this.textBoxCenterOriginal) return;
      box.center = v(this.textBoxCenterOriginal.x + delta.x, this.textBoxCenterOriginal.y + delta.y);
    } else if (this.editTarget.kind === "hatchEdge") {
      // Translate-Mode für Edge entspricht Offset entlang Normale.
      const n = this.hatchEdgeNormal;
      if (!n) return;
      const offset = delta.x * n.x + delta.y * n.y;
      this._applyHatchEdgeOffset(offset);
    } else if (this.editTarget.kind === "wallPoint") {
      const wall = this.app.scene.getWallById(this.editTarget.wallId);
      if (!wall || !this.wallPointsOriginal) return;
      const orig = this.wallPointsOriginal[this.editTarget.pointIndex];
      wall.corners[this.editTarget.pointIndex] = v(orig.x + delta.x, orig.y + delta.y);
    } else if (this.editTarget.kind === "wall") {
      const wall = this.app.scene.getWallById(this.editTarget.wallId);
      if (!wall || !this.wallPointsOriginal) return;
      for (let i = 0; i < wall.corners.length; i++) {
        const orig = this.wallPointsOriginal[i];
        wall.corners[i] = v(orig.x + delta.x, orig.y + delta.y);
      }
    }
  }

  /** Apply parallel offset to selected hatch edge. Adjacent endpoints slide along their adjacent edges. */
  private _applyHatchEdgeOffset(offsetM: number) {
    if (!this.editTarget) return;
    if (this.editTarget.kind !== "hatchEdge" && this.editTarget.kind !== "hatchHoleEdge") return;
    const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
    if (!hatch) return;
    const loop: Vec2[] = this.editTarget.kind === "hatchEdge"
      ? hatch.points
      : (hatch.holes?.[this.editTarget.holeIndex] || []);
    if (loop.length < 3) return;
    const A0 = this.hatchEdgeAOriginal!;
    const B0 = this.hatchEdgeBOriginal!;
    const Pp = this.hatchEdgePrevOriginal!;
    const Nn = this.hatchEdgeNextOriginal!;
    const n = this.hatchEdgeNormal!;
    const A1 = v(A0.x + n.x * offsetM, A0.y + n.y * offsetM);
    const B1 = v(B0.x + n.x * offsetM, B0.y + n.y * offsetM);
    const dirEdge = sub(B1, A1);
    const dirPrev = sub(A0, Pp);
    const dirNext = sub(B0, Nn);
    let newA = lineLineIntersectionInfinite(A1, dirEdge, Pp, dirPrev);
    let newB = lineLineIntersectionInfinite(A1, dirEdge, Nn, dirNext);
    if (!newA) newA = A1;
    if (!newB) newB = B1;
    const idxA = this.editTarget.edgeIndex;
    const idxB = (idxA + 1) % loop.length;
    loop[idxA] = newA;
    loop[idxB] = newB;
  }

  private _isHatchEdgeSelectionActive(): boolean {
    const sel = this.app.selection;
    if (!sel || sel.type !== SelectionType.HATCH) return false;
    return (sel as any).edgeIndex != null;
  }

  private _isWallEdgeSelectionActive(): boolean {
    const sel: any = this.app.selection;
    if (!sel || sel.type !== SelectionType.WALL) return false;
    return sel.edgeIndex != null;
  }

  private _isTextBoxHandleSelectionActive(): boolean {
    const sel = this.app.selection;
    if (!sel || sel.type !== SelectionType.TEXTBOX_HANDLE) return false;
    return sel.handleIndex != null;
  }

  private _getSelectedPointContext() {
    const sel: any = this.app.selection;
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
    if (sel.wallId && sel.pointIndex != null) {
      const wall = this.app.scene.getWallById(sel.wallId);
      if (!wall) return null;
      const idx = sel.pointIndex;
      if (idx < 0 || idx >= wall.corners.length) return null;
      return {
        target: { kind: "wallPoint" as const, wallId: sel.wallId, pointIndex: idx },
        segment: null,
        hatch: null,
        point: wall.corners[idx],
      } as any;
    }
    if (sel.hatchId) {
      const hatch = this.app.scene.getHatchById(sel.hatchId);
      if (!hatch) return null;
      const idx = sel.pointIndex!;
      if (sel.holeIndex != null) {
        const loop = hatch.holes?.[sel.holeIndex];
        if (!loop || idx < 0 || idx >= loop.length) return null;
        return {
          target: { kind: "hatchHole" as const, hatchId: sel.hatchId, holeIndex: sel.holeIndex, pointIndex: idx },
          segment: null,
          hatch,
          point: loop[idx],
        };
      }
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
    this.hatchEdgeAOriginal = null;
    this.hatchEdgeBOriginal = null;
    this.hatchEdgePrevOriginal = null;
    this.hatchEdgeNextOriginal = null;
    this.hatchEdgeNormal = null;
    this.hatchEdgeMidOriginal = null;
    this.hatchEdgeOffsetM = 0;
    this.hatchEdgeOffsetLocked = false;
    this.textBoxOppositeOriginal = null;
    this.textBoxRotationOriginal = 0;
    this.textBoxWidthOriginal = 0;
    this.textBoxHeightOriginal = 0;
    this.textBoxCenterOriginal = null;
    this.textBoxCornerOriginal = null;
    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;
    this.editGuideAnchors = [];
    this.wallPointsOriginal = null;
    this.wallEdgeAOriginal = null;
    this.wallEdgeBOriginal = null;
    this.wallEdgePrevOriginal = null;
    this.wallEdgeNextOriginal = null;
    this.wallEdgeNormal = null;
    this.wallEdgeMidOriginal = null;
    this.wallEdgeOffsetM = 0;
    this.wallEdgeOffsetLocked = false;
    this.wallEdgeHasPrev = false;
    this.wallEdgeHasNext = false;
    this.app.hub.bindCommit(null);
  }

  /** Snap aus aktiven Edit-Hilfslinien (H/V durch Anker). Null falls keine Anker oder Maus zu weit. */
  private _findEditGuideSnap(input: Input): Snap | null {
    if (this.editGuideAnchors.length === 0) return null;
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const cam = this.app.camera;

    const defs: { point: Vec2; dir: Vec2 }[] = [];
    for (const a of this.editGuideAnchors) {
      defs.push({ point: a.point, dir: v(1, 0) });
      defs.push({ point: a.point, dir: v(0, 1) });
    }

    let best: Snap | null = null;
    let bestPx = Infinity;

    // Schnittpunkte (höhere Priorität)
    for (let i = 0; i < defs.length; i++) {
      for (let j = i + 1; j < defs.length; j++) {
        const ip = lineLineIntersectionInfinite(defs[i].point, defs[i].dir, defs[j].point, defs[j].dir);
        if (!ip) continue;
        const sp = cam.worldToScreen(ip.x, ip.y);
        const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
        if (px <= Defaults.snapPx && px < bestPx) {
          bestPx = px;
          best = { type: SnapType.GUIDE_POINT, world: v(ip.x, ip.y), segment: null, pointIndex: null, t: null, px } as any;
        }
      }
    }
    if (best) return best;

    for (const def of defs) {
      const proj = projectPointToInfiniteLine(mouseW, def.point, def.dir);
      const sp = cam.worldToScreen(proj.q.x, proj.q.y);
      const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
      if (px > Defaults.snapPx) continue;
      if (px < bestPx) {
        bestPx = px;
        const span = (Math.hypot(this.app.renderer.vw, this.app.renderer.vh) / cam.scale) * 1.5;
        const d = norm(def.dir);
        const lineA = sub(def.point, mul(d, span));
        const lineB = add(def.point, mul(d, span));
        best = { type: SnapType.GUIDE, world: v(proj.q.x, proj.q.y), segment: null, pointIndex: null, t: null, px, lineA, lineB } as any;
      }
    }
    return best;
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

    // Priority: selected hatch points (outer + holes)
    if (selectedHatch && this.app.labelManager.isVisible(selectedHatch.labelId)) {
      for (let i = 0; i < selectedHatch.points.length; i++) {
        const px = distPxToWorldPoint(selectedHatch.points[i]);
        if (px <= Defaults.hitPx) return { type: SelectionType.POINT, hatchId: selectedHatch.id, pointIndex: i };
      }
      const hLoops = selectedHatch.holes || [];
      for (let h = 0; h < hLoops.length; h++) {
        const loop = hLoops[h];
        for (let i = 0; i < loop.length; i++) {
          const px = distPxToWorldPoint(loop[i]);
          if (px <= Defaults.hitPx) return { type: SelectionType.POINT, hatchId: selectedHatch.id, holeIndex: h, pointIndex: i } as any;
        }
      }
      if (selectedHatch.points.length >= 3 && pointInHatchSolid(mouseW, selectedHatch.points, selectedHatch.holes)) {
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

    // Dimensions (parallel-line hit)
    for (const dim of this.app.scene.dimensions) {
      if (!this.app.labelManager.isVisible(dim.labelId)) continue;
      const g = getDimensionGeometry(dim);
      const proj = projectPointToSegment(mouseW, g.d1, g.d2);
      const px = distPxToWorldPoint(proj.q);
      if (px <= Defaults.hitPx) {
        return { type: SelectionType.DIMENSION, dimensionId: dim.id } as any;
      }
    }

    // Hatch polygon hit (pointInPolygon)
    for (const hatch of visibleHatches) {
      if (selectedHatch && hatch.id === selectedHatch.id) continue;
      if (hatch.points.length >= 3 && pointInHatchSolid(mouseW, hatch.points, hatch.holes)) {
        return { type: SelectionType.HATCH, hatchId: hatch.id, pointIndex: null };
      }
    }

    return null;
  }

  /** Look for a hatch edge near mouse; return {hatch, edgeIndex, t, holeIndex?} or null. */
  private _hitTestHatchEdge(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const cam = this.app.camera;

    const distPxToWorldPoint = (pWorld: Vec2) => {
      const sp = cam.worldToScreen(pWorld.x, pWorld.y);
      return Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
    };

    const visibleHatches = this.app.topology._hatchesFrontToBack();
    let best: { hatch: any; edgeIndex: number; t: number; holeIndex: number | null } | null = null;
    let bestPx = Infinity;

    const tryLoop = (hatch: any, pts: Vec2[], holeIndex: number | null) => {
      const n = pts.length;
      if (n < 2) return;
      for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        const proj = projectPointToSegment(mouseW, a, b);
        if (proj.t <= Defaults.splitEpsT || proj.t >= 1 - Defaults.splitEpsT) continue;
        const px = distPxToWorldPoint(proj.q);
        if (px <= Defaults.hitPx && px < bestPx) {
          bestPx = px;
          best = { hatch, edgeIndex: i, t: proj.t, holeIndex };
        }
      }
    };

    for (const hatch of visibleHatches) {
      tryLoop(hatch, hatch.points, null);
      const loops = hatch.holes || [];
      for (let h = 0; h < loops.length; h++) tryLoop(hatch, loops[h], h);
    }
    return best;
  }

  private _findPreviewSnapForEdit(input: Input) {
    if (!this.editTarget) return null;
    let topoSnap: Snap | null;
    if (this.editTarget.kind === "segment") {
      topoSnap = this.app.topology.findBestSnapExcludingSegment(
        v(input.mouse.sx, input.mouse.sy),
        v(input.mouse.wx, input.mouse.wy),
        this.editTarget.segmentId
      );
    } else if (this.editTarget.kind === "hatch") {
      topoSnap = this.app.topology.findBestSnapExcludingHatch(
        v(input.mouse.sx, input.mouse.sy),
        v(input.mouse.wx, input.mouse.wy),
        this.editTarget.hatchId,
        this.editTarget.pointIndex
      );
    } else {
      topoSnap = this.app.topology.findBestSnap(
        v(input.mouse.sx, input.mouse.sy),
        v(input.mouse.wx, input.mouse.wy)
      );
    }
    const guideSnap = this._findEditGuideSnap(input);
    if (!guideSnap) return topoSnap;
    if (!topoSnap) return guideSnap;
    // GUIDE_POINT > POINT > GUIDE > LINE — bevorzuge präzisere; sonst geringerer Pixel-Abstand.
    const rank = (s: Snap) => {
      if (s.type === SnapType.POINT) return 0;
      if (s.type === SnapType.GUIDE_POINT) return 0;
      if (s.type === SnapType.GUIDE) return 2;
      return 3;
    };
    if (rank(topoSnap) < rank(guideSnap)) return topoSnap;
    if (rank(guideSnap) < rank(topoSnap)) return guideSnap;
    return ((topoSnap.px ?? Infinity) <= (guideSnap.px ?? Infinity)) ? topoSnap : guideSnap;
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
    // Active sticker drag with point snapping
    if (this.dragStickerId) {
      const inst = this.app.scene.getStickerInstanceById(this.dragStickerId);
      if (!inst || !this.dragStickerOrigin || !this.dragStickerMouseStart || !this.dragStickerGrabOffset) {
        this.dragStickerId = null;
        this.dragStickerOrigin = null;
        this.dragStickerMouseStart = null;
        this.dragStickerGrabOffset = null;
        this.dragStickerSnap = null;
      } else {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        // Snap gegen Scene-Punkte/Linien (Sticker-Instanzen sind dort nicht enthalten).
        const snap = this.app.topology.findBestSnap(
          v(input.mouse.sx, input.mouse.sy),
          mouseW
        );
        this.dragStickerSnap = snap;
        // Wir wollen, dass der ursprünglich gegriffene Punkt der Sticker-Instanz an mouseW (oder snap) landet.
        const target = (snap && snap.world) ? snap.world : mouseW;
        inst.position = {
          x: target.x - this.dragStickerGrabOffset.x,
          y: target.y - this.dragStickerGrabOffset.y,
        };
        if (!input.mouse.left) {
          this.dragStickerId = null;
          this.dragStickerOrigin = null;
          this.dragStickerMouseStart = null;
          this.dragStickerGrabOffset = null;
          this.dragStickerSnap = null;
        }
        return;
      }
    }

    // Active document drag with point snapping
    if (this.dragDocId) {
      const doc = this.app.scene.getDocumentById(this.dragDocId);
      if (!doc || !this.dragDocGrabOffset) {
        this.dragDocId = null;
        this.dragDocGrabOffset = null;
        this.dragDocSnap = null;
      } else {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const snap = this.app.topology.findBestSnap(
          v(input.mouse.sx, input.mouse.sy),
          mouseW
        );
        this.dragDocSnap = snap;
        const target = (snap && snap.world) ? snap.world : mouseW;
        // doc.position ist die Top-Left-Ecke; Greifpunkt-Offset bezieht sich darauf.
        doc.position = {
          x: target.x - this.dragDocGrabOffset.x,
          y: target.y - this.dragDocGrabOffset.y,
        };
        if (!input.mouse.left) {
          this.dragDocId = null;
          this.dragDocGrabOffset = null;
          this.dragDocSnap = null;
        }
        return;
      }
    }

    // Active textbox drag (translate) with snap
    if (this.dragTextBoxId) {
      const box = this.app.scene.getTextBoxById(this.dragTextBoxId);
      if (!box || !this.dragTextBoxGrabOffset) {
        this.dragTextBoxId = null;
        this.dragTextBoxGrabOffset = null;
        this.dragTextBoxSnap = null;
      } else {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const snap = this.app.topology.findBestSnap(
          v(input.mouse.sx, input.mouse.sy),
          mouseW
        );
        this.dragTextBoxSnap = snap;
        const target = (snap && snap.world) ? snap.world : mouseW;
        box.center = v(target.x - this.dragTextBoxGrabOffset.x, target.y - this.dragTextBoxGrabOffset.y);
        const len = Math.hypot(box.center.x, box.center.y);
        const angDeg = (box.rotationRad * 180 / Math.PI + 360) % 360;
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(len, angDeg);
        if (!input.mouse.left) {
          this.dragTextBoxId = null;
          this.dragTextBoxGrabOffset = null;
          this.dragTextBoxSnap = null;
          this.app.hub.hide();
        }
        return;
      }
    }

    // Active textbox rotate
    if (this.rotateTextBoxId) {
      const box = this.app.scene.getTextBoxById(this.rotateTextBoxId);
      if (!box) {
        this.rotateTextBoxId = null;
      } else {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const curAng = Math.atan2(mouseW.y - box.center.y, mouseW.x - box.center.x);
        let newRot = this.rotateTextBoxOriginalRot + (curAng - this.rotateTextBoxStartAngle);
        if (input.keys.shift) {
          const step = Math.PI / 12; // 15°
          newRot = Math.round(newRot / step) * step;
        }
        box.rotationRad = newRot;
        const angDeg = (newRot * 180 / Math.PI + 360) % 360;
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(Math.hypot(box.widthM, box.heightM), angDeg);
        if (!input.mouse.left) {
          this.rotateTextBoxId = null;
          this.app.hub.hide();
        }
        return;
      }
    }

    if (this.dragDimId) {
      const dim = this.app.scene.getDimensionById(this.dragDimId);
      if (!dim) {
        this.dragDimId = null;
      } else {
        const g = getDimensionGeometry(dim);
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const mouseOffset = dot(sub(mouseW, dim.p1), g.n);
        const newOffset = mouseOffset - this.dragDimOffsetAlongNormal;
        dim.placementPoint = add(dim.p1, mul(g.n, newOffset));
        this.app.renderer.setHoverSegmentId(null);
        this.app.hub.hide();
        if (!input.mouse.left) {
          this.dragDimId = null;
        }
        return;
      }
    }

    if (this.isEditing()) {
      // Rechtsklick während Edit: Toggle eines Hilfslinien-Ankers am aktuellen Snap-Punkt.
      if (input.rightClicked) {
        const snap = this._findPreviewSnapForEdit(input);
        if (snap && snap.world && (snap.type === SnapType.POINT || snap.type === SnapType.GUIDE_POINT)) {
          const key = `${snap.world.x.toFixed(6)}_${snap.world.y.toFixed(6)}`;
          const idx = this.editGuideAnchors.findIndex(a => a.key === key);
          if (idx >= 0) this.editGuideAnchors.splice(idx, 1);
          else this.editGuideAnchors.push({ key, point: v(snap.world.x, snap.world.y) });
          return;
        }
      }

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
          if (this.editTarget?.kind === "wall") {
            this._applyWallRotateHubValues({ lengthM: null, angleDeg: ang });
          } else {
            this._applyMovingPoint(p, this.fixedPoint!);
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

      if (this.activeEditAction === PointEditAction.OFFSET) {
        const isWallEdge = this.editTarget?.kind === "wallEdge";
        const midOrig = isWallEdge ? this.wallEdgeMidOriginal : this.hatchEdgeMidOriginal;
        const normal = isWallEdge ? this.wallEdgeNormal : this.hatchEdgeNormal;
        const locked = isWallEdge ? this.wallEdgeOffsetLocked : this.hatchEdgeOffsetLocked;
        const currentOff = isWallEdge ? this.wallEdgeOffsetM : this.hatchEdgeOffsetM;
        if (!locked && midOrig && normal) {
          const mouseW = v(input.mouse.wx, input.mouse.wy);
          const rel = sub(mouseW, midOrig);
          const off = rel.x * normal.x + rel.y * normal.y;
          if (isWallEdge) { this.wallEdgeOffsetM = off; this._applyWallEdgeOffset(off); }
          else { this.hatchEdgeOffsetM = off; this._applyHatchEdgeOffset(off); }
          if (document.activeElement !== this.app.hub.lenInputEl && document.activeElement !== this.app.hub.angInputEl) {
            this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
            this.app.hub.updateDisplay(off, 0);
            this.app.hub.setValues(off, 0);
          }
        } else {
          this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
          this.app.hub.updateDisplay(currentOff, 0);
        }
        if (input.clicked) {
          this._clearEditState();
          this.app.hub.hide();
        }
        return;
      }
    }

    this.app.renderer.setHoverSegmentId(null);
    // Hub nur ausblenden, wenn KEINE Sticker-Instanz selektiert ist
    // (für Sticker-Selection wird der Hub von _syncStickerInstanceHub verwaltet).
    if (!this.app.selection || this.app.selection.type !== SelectionType.STICKER_INSTANCE) {
      this.app.hub.hide();
    }

    // Hover indicator for textboxes (so user sees they can be clicked)
    const hoverBox = this._hitTextBox(input);
    this.app.renderer.setHoverTextBoxId(hoverBox?.id || null);

    // Double-click on a textbox → enter inline editing
    if (input.doubleClicked) {
      const box = this._hitTextBox(input);
      if (box) {
        this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: box.id, handleIndex: null });
        this.app.beginTextEdit(box);
        return;
      }
    }

    // Double-click on a sticker instance → enter sticker edit mode
    if (input.doubleClicked && !this.app.isStickerEditing()) {
      const stickerHit = this._hitStickerInstance(input);
      if (stickerHit) {
        this.app.enterStickerEdit(stickerHit as any);
        return;
      }
    }

    // Double-click on hatch edge → insert point (outer or hole)
    if (input.doubleClicked) {
      const edgeHit = this._hitTestHatchEdge(input);
      if (edgeHit) {
        const result = edgeHit.holeIndex == null
          ? this.app.scene.insertPointIntoHatchEdge(edgeHit.hatch, edgeHit.edgeIndex, edgeHit.t)
          : this.app.scene.insertPointIntoHatchHoleEdge(edgeHit.hatch, edgeHit.holeIndex, edgeHit.edgeIndex, edgeHit.t);
        if (result.didInsert) {
          this.app.setSelection({ type: SelectionType.POINT, hatchId: edgeHit.hatch.id, pointIndex: result.pointIndex, holeIndex: edgeHit.holeIndex } as any);
          this.app.showHatchSettingsPanel(true);
        }
        return;
      }
    }

    if (input.clicked) {
      // Edit-Mode: Klick außerhalb der Bounding-Box verlässt ihn (vor allen anderen Hits).
      if (this.app.isStickerEditing()) {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        if (this.app.isPointOutsideStickerEdit(mouseW)) {
          this.app.exitStickerEdit();
          this.app.clearSelection();
          return;
        }
        // Innerhalb: ganz normal Innenobjekte selektieren (kein Sticker-Hit-Test, da die Instanz im Edit-Mode nicht existiert).
      } else {
        // Eck-Handle der bereits selektierten Sticker-Instanz? → Translate-Drag mit Eckpunkt als Greifanker
        const cornerHit = this._hitStickerCorner(input);
        if (cornerHit) {
          const inst = this.app.scene.getStickerInstanceById(cornerHit.instId);
          if (inst) {
            const corners = instanceBoundingCornersWorld(inst.items as any, inst.position, inst.rotationRad, inst.scale);
            const cornerW = corners[cornerHit.cornerIndex];
            this.dragStickerId = inst.id;
            this.dragStickerOrigin = { x: inst.position.x, y: inst.position.y };
            this.dragStickerMouseStart = { x: cornerW.x, y: cornerW.y };
            // Greifpunkt = Eckpunkt: offset = corner - position
            this.dragStickerGrabOffset = { x: cornerW.x - inst.position.x, y: cornerW.y - inst.position.y };
            this.dragStickerSnap = null;
            return;
          }
        }
        // Sticker-Instanzen haben höchste Priorität (sie liegen visuell oben)
        const stickerHit = this._hitStickerInstance(input);
        if (stickerHit) {
          this.app.setSelection({ type: SelectionType.STICKER_INSTANCE, stickerInstanceId: stickerHit.id });
          // Drag vorbereiten (verschieben, solange Maustaste gedrückt bleibt)
          const mouseW0 = v(input.mouse.wx, input.mouse.wy);
          this.dragStickerId = stickerHit.id;
          this.dragStickerOrigin = { x: stickerHit.position.x, y: stickerHit.position.y };
          this.dragStickerMouseStart = mouseW0;
          // Greifpunkt-Offset: position + offset = mouse → offset = mouse - position
          this.dragStickerGrabOffset = { x: mouseW0.x - stickerHit.position.x, y: mouseW0.y - stickerHit.position.y };
          this.dragStickerSnap = null;
          return;
        }
      }

      // TextBox-Eckpunkt der bereits selektierten TextBox? → Hub-Menü (Move/Translate/Rotate)
      const cornerHit = this._hitTextBoxCornerHandle(input);
      if (cornerHit) {
        this.app.setSelection({
          type: SelectionType.TEXTBOX_HANDLE,
          textBoxId: cornerHit.box.id,
          handleIndex: cornerHit.handleIndex,
        });
        const sp = this.app.camera.worldToScreen(
          boxCornersWorld(cornerHit.box)[cornerHit.handleIndex].x,
          boxCornersWorld(cornerHit.box)[cornerHit.handleIndex].y,
        );
        this.app.pointEditMenu.showAt(sp.x, sp.y, [
          PointEditAction.MOVE,
          PointEditAction.TRANSLATE,
          PointEditAction.ROTATE,
        ]);
        return;
      }

      // Wand-Hit (Eckpunkt oder Achslinie)
      {
        const wallHit = this._hitTestWall(input);
        if (wallHit) {
          if (wallHit.pointIndex != null) {
            this.app.setSelection({ type: SelectionType.POINT, wallId: wallHit.wallId, pointIndex: wallHit.pointIndex } as any);
            const wall = this.app.scene.getWallById(wallHit.wallId)!;
            const p = wall.corners[wallHit.pointIndex];
            const sp = this.app.camera.worldToScreen(p.x, p.y);
            this.app.pointEditMenu.showAt(sp.x, sp.y, [
              PointEditAction.MOVE,
              PointEditAction.TRANSLATE,
              PointEditAction.ROTATE,
              PointEditAction.DELETE,
            ]);
          } else if (wallHit.edgeIndex != null) {
            // Edge selektiert → Edge-Offset, Translate (ganze Wand) und Rotate
            this.app.setSelection({ type: SelectionType.WALL, wallId: wallHit.wallId, edgeIndex: wallHit.edgeIndex } as any);
            const wall = this.app.scene.getWallById(wallHit.wallId)!;
            const a = wall.corners[wallHit.edgeIndex];
            const b = wall.corners[wallHit.edgeIndex + 1];
            const midW = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
            const sp = this.app.camera.worldToScreen(midW.x, midW.y);
            this.app.pointEditMenu.showAt(sp.x, sp.y, [
              PointEditAction.OFFSET,
              PointEditAction.TRANSLATE,
              PointEditAction.ROTATE,
            ]);
          } else {
            this.app.setSelection({ type: SelectionType.WALL, wallId: wallHit.wallId } as any);
          }
          return;
        }
      }

      {
        const edgeHit = this._hitTestHatchEdge(input);
        if (edgeHit) {
          this.app.setSelection({
            type: SelectionType.HATCH,
            hatchId: edgeHit.hatch.id,
            pointIndex: null,
            edgeIndex: edgeHit.edgeIndex,
            holeIndex: edgeHit.holeIndex,
          } as any);
          this.app.showHatchSettingsPanel(true);
          const loop = edgeHit.holeIndex == null ? edgeHit.hatch.points : edgeHit.hatch.holes[edgeHit.holeIndex];
          const a = loop[edgeHit.edgeIndex];
          const b = loop[(edgeHit.edgeIndex + 1) % loop.length];
          const midW = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
          const sp = this.app.camera.worldToScreen(midW.x, midW.y);
          this.app.pointEditMenu.showAt(sp.x, sp.y, [PointEditAction.OFFSET]);
          return;
        }
      }

      // Klick auf TextBox-Body (kein Eckpunkt-Handle) → nur selektieren, nicht ziehen.
      const box = this._hitTextBox(input);
      if (box) {
        this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: box.id, handleIndex: null });
        return;
      }

      const hit = this._hitTestWithForegroundPriority(input);
      if (hit) {
        this.app.setSelection(hit);
        if ((hit as any).segmentId) this.app.showLineSettingsPanel(true);
        if ((hit as any).hatchId) this.app.showHatchSettingsPanel(true);
        if (hit.type === SelectionType.DIMENSION) {
          const dim = this.app.scene.getDimensionById((hit as any).dimensionId);
          if (dim) {
            const g = getDimensionGeometry(dim);
            const mouseW = v(input.mouse.wx, input.mouse.wy);
            this.dragDimId = dim.id;
            this.dragDimOffsetAlongNormal = dot(sub(mouseW, dim.p1), g.n) - g.offset;
          }
        }
      } else {
        // Kein Vordergrund-Hit → Document-Underlay testen (kann gewählt + gezogen werden)
        const docHit = this._hitDocument(input);
        if (docHit) {
          this.app.setSelection({ type: SelectionType.DOCUMENT, documentId: docHit.id } as any);
          const mouseW0 = v(input.mouse.wx, input.mouse.wy);
          this.dragDocId = docHit.id;
          this.dragDocGrabOffset = { x: mouseW0.x - docHit.position.x, y: mouseW0.y - docHit.position.y };
          this.dragDocSnap = null;
        } else {
          this.app.setSelection(null);
        }
      }
    }

    const ctx = this._getSelectedPointContext();
    if (ctx) {
      const p = ctx.point;
      const sp = this.app.camera.worldToScreen(p.x, p.y);
      this.app.pointEditMenu.showAt(sp.x, sp.y, [
        PointEditAction.MOVE,
        PointEditAction.TRANSLATE,
        PointEditAction.ROTATE,
        PointEditAction.DELETE,
      ]);
    } else if (!this.isEditing() && this._isHatchEdgeSelectionActive()) {
      // Hatch-Edge-Auswahl: Menü mit Offset offen halten.
    } else if (!this.isEditing() && this._isTextBoxHandleSelectionActive()) {
      // TextBox-Handle-Auswahl: Menü offen halten.
    } else if (!this.isEditing() && this._isWallEdgeSelectionActive()) {
      // Wand-Edge-Auswahl: Menü offen halten.
    } else {
      this.app.pointEditMenu.hide();
    }

    this.snap = this.app.topology.findBestSnap(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy)
    );
  }

  _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Hilfslinien-Anker während Punkt-Edit
    if (this.isEditing() && this.editGuideAnchors.length > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(110,110,110,0.42)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 6]);
      for (const a of this.editGuideAnchors) {
        const s = cam.worldToScreen(a.point.x, a.point.y);
        ctx.beginPath();
        ctx.moveTo(0, s.y); ctx.lineTo(this.app.renderer.vw, s.y);
        ctx.moveTo(s.x, 0); ctx.lineTo(s.x, this.app.renderer.vh);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Anker-Marker
      for (const a of this.editGuideAnchors) {
        const s = cam.worldToScreen(a.point.x, a.point.y);
        ctx.fillStyle = "rgba(110,110,110,0.85)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Sticker-Drag-Snap-Marker
    if (this.dragStickerId && this.dragStickerSnap) {
      const sn = this.dragStickerSnap;
      if ((sn.type === SnapType.LINE || sn.type === SnapType.GUIDE) && sn.lineA && sn.lineB) {
        const a = cam.worldToScreen(sn.lineA.x, sn.lineA.y);
        const b = cam.worldToScreen(sn.lineB.x, sn.lineB.y);
        ctx.save();
        ctx.strokeStyle = "rgba(77,163,255,0.42)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      }
      if (sn.world) {
        const s = cam.worldToScreen(sn.world.x, sn.world.y);
        ctx.save();
        ctx.fillStyle = "rgba(77,163,255,0.95)";
        ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(77,163,255,0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      return;
    }

    // Document-Drag-Snap-Marker
    if (this.dragDocId && this.dragDocSnap) {
      const sn = this.dragDocSnap;
      if ((sn.type === SnapType.LINE || sn.type === SnapType.GUIDE) && sn.lineA && sn.lineB) {
        const a = cam.worldToScreen(sn.lineA.x, sn.lineA.y);
        const b = cam.worldToScreen(sn.lineB.x, sn.lineB.y);
        ctx.save();
        ctx.strokeStyle = "rgba(77,163,255,0.42)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      }
      if (sn.world) {
        const s = cam.worldToScreen(sn.world.x, sn.world.y);
        ctx.save();
        ctx.fillStyle = "rgba(77,163,255,0.95)";
        ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(77,163,255,0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      return;
    }

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
