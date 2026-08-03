import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType, SelectionType, PointEditAction } from "./constants";
import { Vec2, v, sub, add, mul, dot, dist, angleDeg, pointFromLengthAngle, projectPointToSegment, orthoSnapFromA, nearestAngleToReference, pointInPolygon, pointInHatchSolid, polygonCentroid, projectPointToInfiniteLine, lineLineIntersectionInfinite, norm, perpLeft, len } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { getDimensionGeometry } from "./dimensionGeometry";
import { pointInOrientedBox, boxCornersWorld, rotateVector } from "./textGeometry";
import type { TextBox } from "./Scene";
import { pointInInstance, instanceBoundingCornersWorld } from "./StickerManager";
import { pointInDocument, hitDocumentCorner, hitDocumentEdge, documentCornersWorld, documentCenterWorld, hitDocumentVisibleEdge, documentVisibleCornersWorld, documentEdgeMidpointsWorld, documentAnchorsWorld } from "./documentGeometry";
import { pointInDocumentVisible } from "./documentBgRemove";
import { computeWallLines } from "./wallGeom";
import { buildWallSolidRing, buildHealedWallSolidRing } from "./wallSolid";
import { runWallTopologyMaintenance } from "./wallTopologyMaintenance";
import { trimWallEndpointsToNeighbors } from "./wallConnect";

type EditTarget =
  | { kind: "segment"; segmentId: string; pointIndex: number }
  | { kind: "hatch"; hatchId: string; pointIndex: number }
  | { kind: "hatchHole"; hatchId: string; holeIndex: number; pointIndex: number }
  | { kind: "hatchEdge"; hatchId: string; edgeIndex: number }
  | { kind: "hatchHoleEdge"; hatchId: string; holeIndex: number; edgeIndex: number }
  | { kind: "textboxHandle"; textBoxId: string; handleIndex: number }
  | { kind: "areaLabelHandle"; hatchId: string; handleIndex: number }
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
  /** Wenn true: ROTATE dreht die Box um den angeklickten Fangpunkt (Pivot = Ecke). */
  textBoxRotatePivotMode = false;

  // AreaLabel handle (corner) edit state
  areaLabelOriginalRotation = 0;
  areaLabelOriginalScale = 1;
  areaLabelOriginalOffset: Vec2 | null = null;
  areaLabelOriginalCornerWorld: Vec2 | null = null;
  areaLabelOriginalOppositeWorld: Vec2 | null = null;
  areaLabelPolyCenter: Vec2 | null = null;

  moveHubLocked = false;
  moveHubLengthM: number | null = null;
  moveHubAngleDeg: number | null = null;

  // Wall edit snapshot
  wallPointsOriginal: Vec2[] | null = null;
  // Preview-State für Wand-Punkt-Edits (Bewegen / Verschieben).
  // Während der Bewegung wird die Wand NICHT mutiert — erst beim Commit-Klick.
  wallPreviewPoint: Vec2 | null = null;
  wallPreviewDelta: Vec2 | null = null;

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

  // FreeStroke Drag-State (Verschieben der gesamten Freihand-Linie)
  dragFreeStrokeId: string | null = null;
  dragFreeStrokeGrabOffset: Vec2 | null = null; // mouseStart - points[0]
  dragFreeStrokeOrigPoints: Vec2[] | null = null;
  // FreeStroke Edit-State (HUB-Action TRANSLATE / ROTATE)
  freeStrokePointsOriginal: Vec2[] | null = null;

  // TextBox Drag/Rotate-State
  dragTextBoxId: string | null = null;
  dragTextBoxGrabOffset: Vec2 | null = null; // mouseStart - center
  dragTextBoxSnap: Snap | null = null;
  rotateTextBoxId: string | null = null;
  rotateTextBoxStartAngle = 0; // initial mouse angle (rad) at rotate-begin
  rotateTextBoxOriginalRot = 0; // box.rotationRad at rotate-begin

  // AreaLabel Drag-State (Verschieben der m²-Box innerhalb einer Schraffur)
  dragAreaLabelHatchId: string | null = null;
  dragAreaLabelGrabOffsetWorld: Vec2 | null = null; // mouse - labelCenterWorld at drag-start
  dragAreaLabelStartOffset: Vec2 | null = null;     // hatch.areaLabel.offsetX/Y at drag-start

  // Hilfslinien-Anker während aktivem Punkt-Edit (per Rechtsklick auf Snap-Punkte gesetzt).
  // Erzeugen vertikale + horizontale Hilfslinien durch jeden Anker, deren Schnittpunkte und Achsen snappen.
  editGuideAnchors: { key: string; point: Vec2 }[] = [];

  // ── Marquee (Rahmen-Auswahl) ─────────────────────────────────────────────
  // Zwei Modi analog zu Archicad:
  //   "touch"   → Crossing: alle Elemente, die den Rahmen berühren/schneiden
  //   "enclose" → Window: nur Elemente, die vollständig im Rahmen liegen
  marqueeMode: "touch" | "enclose" | "click" = "click";
  marqueeStart: Vec2 | null = null;    // Screen-Pixel
  marqueeCurrent: Vec2 | null = null;  // Screen-Pixel
  marqueeActive = false;
  marqueeSelectedIds: { kind: string; id: string }[] = [];


  constructor(app: CadApp) {
    this.app = app;
  }

  private _isHiddenWallCorner(wall: { hiddenCornerIndices?: number[] } | null | undefined, pointIndex: number): boolean {
    return !!wall?.hiddenCornerIndices?.includes(pointIndex);
  }

  activate() {
    this._clearEditState();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverTextBoxId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.marqueeStart = null;
    this.marqueeCurrent = null;
    this.marqueeActive = false;
    this.marqueeSelectedIds = [];
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this._restoreTextBoxEdit();
    this._clearEditState();
    this.app.pointEditMenu.hide();
    this.app.hub.hide();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverTextBoxId(null);
    this.dragDimId = null;
    this.dragDocId = null;
    this.dragDocGrabOffset = null;
    this.dragDocSnap = null;
    this.dragFreeStrokeId = null;
    this.dragFreeStrokeGrabOffset = null;
    this.dragFreeStrokeOrigPoints = null;
    this.dragTextBoxId = null;
    this.dragTextBoxGrabOffset = null;
    this.dragTextBoxSnap = null;
    if (this.rotateTextBoxId) {
      // ESC während des freien Drehens: Ausgangsrotation wiederherstellen.
      const rb = this.app.scene.getTextBoxById(this.rotateTextBoxId);
      if (rb) rb.rotationRad = this.rotateTextBoxOriginalRot;
      this.rotateTextBoxId = null;
    }
    this.dragAreaLabelHatchId = null;
    this.dragAreaLabelGrabOffsetWorld = null;
    this.dragAreaLabelStartOffset = null;
    this.marqueeStart = null;
    this.marqueeCurrent = null;
    this.marqueeActive = false;
    this.marqueeSelectedIds = [];
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
    const selectedWallId = this.getPriorityWallId();
    const wallsByPriority = selectedWallId
      ? [
          ...this.app.scene.walls.filter(w => w.id === selectedWallId),
          ...this.app.scene.walls.filter(w => w.id !== selectedWallId),
        ]
      : this.app.scene.walls;
    // Eckpunkte zuerst — die aktuell selektierte Wand gewinnt bei überlagerten
    // Verbindungspunkten; automatische T-Stoß-Stützpunkte bleiben unsichtbar.
    for (const wall of wallsByPriority) {
      if (!this.app.labelManager.isVisible(wall.labelId)) continue;
      for (let i = 0; i < wall.corners.length; i++) {
        if (this._isHiddenWallCorner(wall, i)) continue;
        const sp = cam.worldToScreen(wall.corners[i].x, wall.corners[i].y);
        const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
        if (wall.id === selectedWallId && px <= Defaults.hitPx + 2) {
          return { wallId: wall.id, pointIndex: i, edgeIndex: null };
        }
        if (px <= Defaults.hitPx + 2 && (px < bestPx || (wall.id === selectedWallId && bestPoint?.wallId !== selectedWallId))) {
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
    // Wand-Körper-Treffer: Klick irgendwo im GEHEILTEN Wand-Solid (inkl. der
    // durch Gehrungen/T-Stöße verlängerten Bereiche), damit die Wand auch
    // dort selektierbar ist, wo sie sich an Nachbarn anpasst.
    const visibleWalls = this.app.scene.walls.filter(w => this.app.labelManager.isVisible(w.labelId));
    const graph = this.app.scene.getWallTopology();
    for (let wi = visibleWalls.length - 1; wi >= 0; wi--) {
      const wall = visibleWalls[wi];
      const others = visibleWalls.filter(w => w !== wall && w.corners.length >= 2);
      const ring = others.length > 0
        ? buildHealedWallSolidRing(wall, others, graph)
        : buildWallSolidRing(wall);
      if (ring.length < 3) continue;
      if (pointInPolygon(mouseW, ring)) {
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
      if (pointInDocumentVisible(mouseW, doc)) return doc;
    }
    return null;
  }

  private _startDocumentDrag(doc: any, input: Input) {
    const mouseW0 = v(input.mouse.wx, input.mouse.wy);
    this.dragDocId = doc.id;
    this.dragDocGrabOffset = { x: mouseW0.x - doc.position.x, y: mouseW0.y - doc.position.y };
    this.dragDocSnap = null;
    this.app.setSelection({ type: SelectionType.DOCUMENT, documentId: doc.id } as any);
    this.app.documentHubMode = "none";
    this.app.documentHubState = { visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null };
  }

  private _isOwnDocumentSnap(doc: any, snap: Snap | null): boolean {
    if (!doc || !snap?.world) return false;
    const eps = 1e-6;
    const same = (p: Vec2) => Math.hypot(p.x - snap.world.x, p.y - snap.world.y) <= eps;
    if (same(documentCenterWorld(doc))) return true;
    for (const p of documentCornersWorld(doc)) if (same(p)) return true;
    for (const p of documentEdgeMidpointsWorld(doc)) if (same(p)) return true;
    for (const p of documentAnchorsWorld(doc)) if (same(p)) return true;
    return false;
  }

  /** Hit-Test gegen Freihand-Strokes (Polyline-Abstand in Pixel). */
  private _hitFreeStroke(input: Input) {
    const cam = this.app.camera;
    const tolM = Defaults.hitPx / Math.max(1e-6, cam.scale);
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    for (let i = this.app.scene.freeStrokes.length - 1; i >= 0; i--) {
      const s = this.app.scene.freeStrokes[i];
      if (!this.app.labelManager.isVisible(s.labelId)) continue;
      if (s.points.length < 2) continue;
      // distance from polyline
      let best = Infinity;
      for (let k = 0; k < s.points.length - 1; k++) {
        const proj = projectPointToSegment(mouseW, s.points[k], s.points[k + 1]);
        const d = Math.hypot(mouseW.x - proj.q.x, mouseW.y - proj.q.y);
        if (d < best) best = d;
      }
      // Hit if within tolerance OR within actual stroke thickness (+small slack).
      const effectiveTol = Math.max(tolM, (s.thicknessM || 0) * 0.6);
      if (best <= effectiveTol) return s;
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

  getPriorityWallId(): string | null {
    if (this.editTarget) {
      if (
        this.editTarget.kind === "wall" ||
        this.editTarget.kind === "wallEdge" ||
        this.editTarget.kind === "wallPoint"
      ) {
        return this.editTarget.wallId;
      }
    }
    const sel: any = this.app.selection;
    return sel?.wallId || null;
  }

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

  /** Begin TextBox-Handle-Edit (move/translate/rotate/resize) for a clicked corner. */
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

    // ROTATE: Drehung erfolgt um den angeklickten Fangpunkt selbst (nicht um die
    // gegenüberliegende Ecke). Referenzpunkt für Winkel/Hub ist das Box-Zentrum.
    this.textBoxRotatePivotMode = action === PointEditAction.ROTATE;
    if (this.textBoxRotatePivotMode) {
      this.fixedPoint = v(this.textBoxCornerOriginal.x, this.textBoxCornerOriginal.y);
      this.otherPointOriginal = v(this.textBoxCenterOriginal.x, this.textBoxCenterOriginal.y);
    } else {
      this.fixedPoint = v(this.textBoxOppositeOriginal.x, this.textBoxOppositeOriginal.y);
      this.otherPointOriginal = v(this.textBoxCornerOriginal.x, this.textBoxCornerOriginal.y);
    }

    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;
    this.app.pointEditMenu.hide();

    if (action === PointEditAction.RESIZE) {
      // Box wird unabhängig vom Text skaliert: Textgröße bleibt, Text läuft in
      // der Box um. Deshalb autoSize deaktivieren und wrap aktivieren.
      (box.style as any).autoSize = false;
      box.style.wrap = true;
      this.app.hub.hide();
      this.app.hub.bindCommit(null);
      // Während der Resize-Aktion intern wie MOVE behandeln (Drag-Schleife).
      this.activeEditAction = PointEditAction.MOVE;
      (this as any)._textBoxResizeMode = true;
      return;
    }
    (this as any)._textBoxResizeMode = false;

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

  /** Begin AreaLabel-Handle-Edit (move/translate/rotate) for a clicked m²-Box corner. */
  beginAreaLabelHandleEdit(hatchId: string, handleIndex: number, action: string) {
    const hatch = this.app.scene.getHatchById(hatchId);
    if (!hatch || !hatch.areaLabel?.show) return;
    if (action === PointEditAction.DELETE) return;
    const layout = (this.app.renderer as any)._getAreaLabelLayout(hatch);
    if (!layout) return;

    this.activeEditAction = action;
    this.editTarget = { kind: "areaLabelHandle", hatchId, handleIndex };

    // Convert handle screen positions back to world for pivot math.
    const cam = this.app.camera;
    const handleWorlds = layout.handles.map((h: Vec2) => cam.screenToWorld(h.x, h.y));
    const cornerW = handleWorlds[handleIndex];
    const oppW = handleWorlds[(handleIndex + 2) % 4];

    this.areaLabelOriginalRotation = hatch.areaLabel.rotationRad || 0;
    this.areaLabelOriginalScale = hatch.areaLabel.scale ?? 1;
    this.areaLabelOriginalOffset = v(hatch.areaLabel.offsetX || 0, hatch.areaLabel.offsetY || 0);
    this.areaLabelOriginalCornerWorld = v(cornerW.x, cornerW.y);
    this.areaLabelOriginalOppositeWorld = v(oppW.x, oppW.y);
    this.areaLabelPolyCenter = polygonCentroid(hatch.points);

    // For ROTATE: pivot = label center (world). For MOVE: pivot = opposite corner.
    if (action === PointEditAction.ROTATE) {
      this.fixedPoint = v(layout.centerWorld.x, layout.centerWorld.y);
    } else {
      this.fixedPoint = v(oppW.x, oppW.y);
    }
    this.otherPointOriginal = v(cornerW.x, cornerW.y);

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
    this.app.hub.setCompact(true, "✂");
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
      this.app.hub.setCompact(true, "✂");
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

  /** HUB-Aktion für einen Freihand-Stroke: TRANSLATE / ROTATE / DELETE. */
  beginFreeStrokeAction(strokeId: string, action: string) {
    const stroke = this.app.scene.getFreeStrokeById?.(strokeId);
    if (!stroke || !stroke.points || stroke.points.length < 1) return;

    if (action === PointEditAction.DELETE) {
      this.app.scene.removeFreeStroke(stroke);
      this.app.setSelection(null);
      this.app.pointEditMenu.hide();
      return;
    }

    // Pivot/Fixpunkt = geometrischer Mittelpunkt aller Stützpunkte (Centroid).
    let cx = 0, cy = 0;
    for (const p of stroke.points) { cx += p.x; cy += p.y; }
    cx /= stroke.points.length;
    cy /= stroke.points.length;
    const center = v(cx, cy);

    // "Anderer" Referenzpunkt für Rotate/Translate: erster Stroke-Punkt.
    const other = v(stroke.points[0].x, stroke.points[0].y);

    this.editTarget = { kind: "freeStroke", freeStrokeId: strokeId } as any;
    this.freeStrokePointsOriginal = stroke.points.map((p) => v(p.x, p.y));
    this.fixedPoint = center;
    this.otherPointOriginal = other;
    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;
    this.app.pointEditMenu.hide();

    if (action === PointEditAction.ROTATE) {
      this.activeEditAction = PointEditAction.ROTATE;
      const radius = dist(this.fixedPoint, this.otherPointOriginal);
      const ang = angleDeg(this.fixedPoint, this.otherPointOriginal);
      this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
      this.app.hub.updateDisplay(radius, ang);
      this.app.hub.setValues(radius, ang);
      this.app.hub.enterEditMode();
    } else {
      // Default: TRANSLATE (Verschieben / Bewegen der gesamten Linie).
      this.activeEditAction = PointEditAction.TRANSLATE;
      this.app.hub.hide();
      this.app.hub.bindCommit(null);
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
        wall.hiddenCornerIndices = (wall.hiddenCornerIndices || [])
          .filter(i => i !== ctx.target.pointIndex)
          .map(i => i > ctx.target.pointIndex ? i - 1 : i);
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
      const box = this.app.scene.getTextBoxById(this.editTarget.textBoxId);
      if (!box || this.textBoxOppositeOriginal == null) return;
      const opp = this.textBoxOppositeOriginal;
      const w = this.textBoxWidthOriginal;
      const h = this.textBoxHeightOriginal;
      const handleIndex = this.editTarget.handleIndex;

      if (this.textBoxRotatePivotMode && this.activeEditAction === PointEditAction.ROTATE
          && this.textBoxCornerOriginal && this.textBoxCenterOriginal) {
        // Drehung exakt um den angeklickten Fangpunkt (Pivot = Ecke).
        // Referenzrichtung = Kantenlinie durch den Pivot und die horizontal
        // benachbarte Ecke (z. B. oben-links -> oben-rechts). Dadurch liegt die
        // Maus beim Drehen exakt auf der Höhe/Linie dieser beiden Fangpunkte.
        const pivot = this.textBoxCornerOriginal;
        const c0 = this.textBoxCenterOriginal;
        const cosR = Math.cos(this.textBoxRotationOriginal), sinR = Math.sin(this.textBoxRotationOriginal);
        const lPivot = this._textBoxLocalCornerForIndex(handleIndex, w, h);
        const lNeigh = this._textBoxLocalCornerForIndex(handleIndex ^ 1, w, h);
        const eLx = lNeigh.x - lPivot.x, eLy = lNeigh.y - lPivot.y;
        const baseAng = Math.atan2(eLx * sinR + eLy * cosR, eLx * cosR - eLy * sinR);
        const curAng = Math.atan2(newPoint.y - pivot.y, newPoint.x - pivot.x);
        let delta = curAng - baseAng;
        if (this.app.input?.keys?.shift) {
          // Shift: absolute Box-Rotation auf 15°-Raster fangen (0°, 90°, ...).
          const step = Math.PI / 12;
          const snapped = Math.round((this.textBoxRotationOriginal + delta) / step) * step;
          delta = snapped - this.textBoxRotationOriginal;
        }
        const cs = Math.cos(delta), sn = Math.sin(delta);
        const dx = c0.x - pivot.x, dy = c0.y - pivot.y;
        box.center = v(pivot.x + dx * cs - dy * sn, pivot.y + dx * sn + dy * cs);
        box.rotationRad = this.textBoxRotationOriginal + delta;
        box.widthM = w;
        box.heightM = h;
        return;
      }



      if ((this as any)._textBoxResizeMode) {
        // RESIZE: Rotation bleibt fix, gegenüberliegende Ecke bleibt fix,
        // Box-Breite/Höhe folgen der Maus (Textgröße bleibt unverändert).
        const rot = this.textBoxRotationOriginal;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const dx = newPoint.x - opp.x;
        const dy = newPoint.y - opp.y;
        // In Box-lokales Koordinatensystem (vor Rotation) projizieren.
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        const localOpp = this._textBoxLocalCornerForIndex((handleIndex + 2) % 4, w, h);
        // signX/signY: Richtung von gegenüber zur bewegten Ecke
        const signX = -Math.sign(localOpp.x) || 1;
        const signY = -Math.sign(localOpp.y) || 1;
        const minM = 0.02;
        const newW = Math.max(minM, lx * signX);
        const newH = Math.max(minM, ly * signY);
        // Neues Center: Mittelpunkt zwischen opp (welt) und neuer bewegter Ecke (welt).
        const localMovNew = { x: signX * newW * 0.5, y: signY * newH * 0.5 };
        const localOppNew = { x: -localMovNew.x, y: -localMovNew.y };
        // Welt-Position der bewegten Ecke aus opp+local-Differenz herleiten
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        const diffLx = localMovNew.x - localOppNew.x;
        const diffLy = localMovNew.y - localOppNew.y;
        const diffWx = diffLx * cosR - diffLy * sinR;
        const diffWy = diffLx * sinR + diffLy * cosR;
        const movWorld = { x: opp.x + diffWx, y: opp.y + diffWy };
        box.center = v((opp.x + movWorld.x) * 0.5, (opp.y + movWorld.y) * 0.5);
        box.widthM = newW;
        box.heightM = newH;
        box.rotationRad = rot;
        return;
      }

      // MOVE (Verschieben): Die Box bleibt starr (Größe + Rotation unverändert)
      // und wird so verschoben, dass der angeklickte Fangpunkt exakt (hart fix)
      // am Mauszeiger bzw. am gefangenen Punkt klebt.
      if (this.activeEditAction === PointEditAction.MOVE && this.textBoxCornerOriginal && this.textBoxCenterOriginal) {
        const dx = newPoint.x - this.textBoxCornerOriginal.x;
        const dy = newPoint.y - this.textBoxCornerOriginal.y;
        box.center = v(this.textBoxCenterOriginal.x + dx, this.textBoxCenterOriginal.y + dy);
        box.rotationRad = this.textBoxRotationOriginal;
        box.widthM = w;
        box.heightM = h;
        return;
      }

      // ROTATE (original): Box width/height stay constant; rotation +
      // center are recomputed so that opposite stays put and moving handle
      // reaches newPoint.
      const diagLen = Math.hypot(w, h);
      const distMoving = Math.hypot(newPoint.x - opp.x, newPoint.y - opp.y);
      if (diagLen < 1e-9 || distMoving < 1e-9) return;
      const localMov = this._textBoxLocalCornerForIndex(handleIndex, w, h);
      const localOpp = this._textBoxLocalCornerForIndex((handleIndex + 2) % 4, w, h);
      const dxL = localMov.x - localOpp.x;
      const dyL = localMov.y - localOpp.y;
      const localDiagAng = Math.atan2(dyL, dxL);
      const worldDiagAng = Math.atan2(newPoint.y - opp.y, newPoint.x - opp.x);
      const newRot = worldDiagAng - localDiagAng;
      const newCenter = v((opp.x + newPoint.x) * 0.5, (opp.y + newPoint.y) * 0.5);
      box.center = newCenter;
      box.rotationRad = newRot;
    } else if (this.editTarget.kind === "areaLabelHandle") {
      const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
      if (!hatch || !this.areaLabelOriginalCornerWorld || !this.areaLabelOriginalOffset || !this.areaLabelPolyCenter) return;
      const action = this.activeEditAction;
      if (action === PointEditAction.ROTATE) {
        // Pivot = label center (world position = polyCenter + offset). offset/scale stay.
        const pivot = this.fixedPoint!;
        const origAng = Math.atan2(this.areaLabelOriginalCornerWorld.y - pivot.y, this.areaLabelOriginalCornerWorld.x - pivot.x);
        const newAng = Math.atan2(newPoint.y - pivot.y, newPoint.x - pivot.x);
        hatch.areaLabel.rotationRad = this.areaLabelOriginalRotation + (newAng - origAng);
      } else if (action === PointEditAction.MOVE) {
        // Pivot = opposite corner (stays put). Box scales + rotates; center moves.
        const opp = this.areaLabelOriginalOppositeWorld!;
        const origDist = Math.hypot(this.areaLabelOriginalCornerWorld.x - opp.x, this.areaLabelOriginalCornerWorld.y - opp.y);
        const newDist = Math.hypot(newPoint.x - opp.x, newPoint.y - opp.y);
        if (origDist < 1e-9 || newDist < 1e-9) return;
        const scaleFactor = newDist / origDist;
        hatch.areaLabel.scale = Math.max(0.1, Math.min(20, this.areaLabelOriginalScale * scaleFactor));
        const origAng = Math.atan2(this.areaLabelOriginalCornerWorld.y - opp.y, this.areaLabelOriginalCornerWorld.x - opp.x);
        const newAng = Math.atan2(newPoint.y - opp.y, newPoint.x - opp.x);
        hatch.areaLabel.rotationRad = this.areaLabelOriginalRotation + (newAng - origAng);
        const newCenter = v((opp.x + newPoint.x) * 0.5, (opp.y + newPoint.y) * 0.5);
        hatch.areaLabel.offsetX = newCenter.x - this.areaLabelPolyCenter.x;
        hatch.areaLabel.offsetY = newCenter.y - this.areaLabelPolyCenter.y;
      }
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
    } else if (this.editTarget.kind === "areaLabelHandle") {
      const hatch = this.app.scene.getHatchById(this.editTarget.hatchId);
      if (!hatch || !this.areaLabelOriginalOffset) return;
      hatch.areaLabel.offsetX = this.areaLabelOriginalOffset.x + delta.x;
      hatch.areaLabel.offsetY = this.areaLabelOriginalOffset.y + delta.y;
    } else if (this.editTarget.kind === "hatchEdge") {
      // Translate-Mode für Edge entspricht Offset entlang Normale.
      const n = this.hatchEdgeNormal;
      if (!n) return;
      const offset = delta.x * n.x + delta.y * n.y;
      this._applyHatchEdgeOffset(offset);
    } else if (this.editTarget.kind === "wallPoint") {
      // TRANSLATE auf einem Wand-Fangpunkt = die GANZE Wand wird am gegriffenen
      // Punkt verschoben (alle Eckpunkte um delta).
      const wall = this.app.scene.getWallById(this.editTarget.wallId);
      if (!wall || !this.wallPointsOriginal) return;
      for (let i = 0; i < wall.corners.length; i++) {
        const orig = this.wallPointsOriginal[i];
        wall.corners[i] = v(orig.x + delta.x, orig.y + delta.y);
      }

    } else if (this.editTarget.kind === "wall") {
      const wall = this.app.scene.getWallById(this.editTarget.wallId);
      if (!wall || !this.wallPointsOriginal) return;
      for (let i = 0; i < wall.corners.length; i++) {
        const orig = this.wallPointsOriginal[i];
        wall.corners[i] = v(orig.x + delta.x, orig.y + delta.y);
      }
    } else if ((this.editTarget as any).kind === "freeStroke") {
      const stroke = this.app.scene.getFreeStrokeById?.((this.editTarget as any).freeStrokeId);
      if (!stroke || !this.freeStrokePointsOriginal) return;
      for (let i = 0; i < stroke.points.length && i < this.freeStrokePointsOriginal.length; i++) {
        const o = this.freeStrokePointsOriginal[i];
        stroke.points[i] = v(o.x + delta.x, o.y + delta.y);
      }
    }
  }


  /** Rotate ALL points of the currently edited free-stroke around `fixedPoint`
   *  to the absolute angle `newAngleDeg` (relative to the original first point). */
  private _applyFreeStrokeRotate(newAngleDeg: number) {
    if (!this.editTarget || (this.editTarget as any).kind !== "freeStroke") return;
    if (!this.freeStrokePointsOriginal || !this.fixedPoint || !this.otherPointOriginal) return;
    const stroke = this.app.scene.getFreeStrokeById?.((this.editTarget as any).freeStrokeId);
    if (!stroke) return;
    const baseAng = angleDeg(this.fixedPoint, this.otherPointOriginal);
    const dRad = ((newAngleDeg - baseAng) * Math.PI) / 180;
    const c = Math.cos(dRad), s = Math.sin(dRad);
    for (let i = 0; i < stroke.points.length && i < this.freeStrokePointsOriginal.length; i++) {
      const o = this.freeStrokePointsOriginal[i];
      const dx = o.x - this.fixedPoint.x;
      const dy = o.y - this.fixedPoint.y;
      stroke.points[i] = v(this.fixedPoint.x + dx * c - dy * s, this.fixedPoint.y + dx * s + dy * c);
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

  /** ESC-Abbruch: Textbox-Geometrie auf den Zustand bei Edit-Beginn zurücksetzen. */
  _restoreTextBoxEdit() {
    if (this.editTarget?.kind !== "textboxHandle") return;
    const box = this.app.scene.getTextBoxById((this.editTarget as any).textBoxId);
    if (!box || !this.textBoxCenterOriginal) return;
    box.center = v(this.textBoxCenterOriginal.x, this.textBoxCenterOriginal.y);
    box.rotationRad = this.textBoxRotationOriginal;
    if (this.textBoxWidthOriginal > 0) box.widthM = this.textBoxWidthOriginal;
    if (this.textBoxHeightOriginal > 0) box.heightM = this.textBoxHeightOriginal;
  }

  _clearEditState() {
    // Nach Wand-Mutationen: erst Auto-Trim der betroffenen Wand-Endpunkte an
    // Nachbar-Bezugslinien, dann Topologie-Wartung (Auto-Split / Auto-Merge).
    const wasWallEdit = !!this.editTarget && (
      this.editTarget.kind === "wall" ||
      this.editTarget.kind === "wallPoint" ||
      this.editTarget.kind === "wallEdge"
    );
    if (wasWallEdit) {
      try {
        const wallId = (this.editTarget as any).wallId;
        const wall = wallId ? this.app.scene.getWallById(wallId) : null;
        if (wall) trimWallEndpointsToNeighbors(this.app.scene, wall);
        runWallTopologyMaintenance(this.app.scene);
      } catch { /* noop */ }
    }
    this.activeEditAction = null;
    this.editTarget = null;
    (this as any)._textBoxResizeMode = false;
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
    this.textBoxRotatePivotMode = false;
    this.areaLabelOriginalRotation = 0;
    this.areaLabelOriginalScale = 1;
    this.areaLabelOriginalOffset = null;
    this.areaLabelOriginalCornerWorld = null;
    this.areaLabelOriginalOppositeWorld = null;
    this.areaLabelPolyCenter = null;
    this.moveHubLocked = false;
    this.moveHubLengthM = null;
    this.moveHubAngleDeg = null;
    this.editGuideAnchors = [];
    this.wallPointsOriginal = null;
    this.freeStrokePointsOriginal = null;
    this.wallPreviewPoint = null;
    this.wallPreviewDelta = null;

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

    const isFrameSeg = (s: any) => s?.labelId === "__page_frame__" || s?.labelId === "__ext_rect__";
    const visibleSegs = this.app.topology._segmentsFrontToBack().filter((s: any) => !isFrameSeg(s));
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
    this.app.topology.priorityWallId = this.getPriorityWallId();
    let topoSnap: Snap | null;
    if (this.editTarget.kind === "segment") {
      topoSnap = this.app.topology.findBestSnapExcludingSegment(
        v(input.mouse.sx, input.mouse.sy),
        v(input.mouse.wx, input.mouse.wy),
        this.editTarget.segmentId
      );
    } else if (this.editTarget.kind === "hatch") {
      // Bei TRANSLATE/ROTATE bewegen sich ALLE Punkte des Hatches mit –
      // ohne Self-Exclude würde das Snap-System auf andere Punkte derselben
      // Schraffur einrasten und beim Verschieben (insb. Kreis-Hatches mit
      // 96 Stützpunkten) ein Pendeln/Driften erzeugen.
      const excludeAll =
        this.activeEditAction === PointEditAction.TRANSLATE ||
        this.activeEditAction === PointEditAction.ROTATE;
      topoSnap = this.app.topology.findBestSnapExcludingHatch(
        v(input.mouse.sx, input.mouse.sy),
        v(input.mouse.wx, input.mouse.wy),
        this.editTarget.hatchId,
        this.editTarget.pointIndex,
        excludeAll
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
    // Drehen: Fangpunkte anderer Objekte werden nicht nur anvisiert, sondern
    // wirklich gefangen — der Winkel zeigt exakt auf den Fangpunkt.
    // Shift rastet zusätzlich auf exakte 45°-Schritte (0/45/90/135/…).
    const shift = !!(input.keys?.shift || (this.app as any).input?.keys?.shift);
    let target = v(input.mouse.wx, input.mouse.wy);
    if (!shift) {
      const snap = this._findPreviewSnapForEdit(input);
      if (snap && snap.world) target = v(snap.world.x, snap.world.y);
    }

    let ang = angleDeg(this.fixedPoint!, target);
    if (shift) {
      // Absolutes Raster: gilt über beliebig viele Drehintervalle hinweg.
      ang = ((Math.round(ang / 45) * 45) % 360 + 360) % 360;
    }
    this.rotateGuide = {
      pivot: v(this.fixedPoint!.x, this.fixedPoint!.y),
      radius: dist(this.fixedPoint!, this.otherPointOriginal || target),
      angleDeg: ang,
      snapped: shift,
    };
    return ang;
  }




  update(input: Input) {
    this.app.topology.priorityWallId = this.getPriorityWallId();

    // Hintergrund-Ausschnitt-Interaktion (aktiviert via DocumentFilterPanel).
    // Klick = Magic-Wand-Fill; Drag mit gedrückter Maustaste = Pinsel.
    if (this.app.bgRemoveInteraction) {
      const inter = this.app.bgRemoveInteraction;
      const doc = this.app.scene.getDocumentById(inter.docId);
      if (doc) {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        // Nur reagieren, wenn Cursor über dem Dokument ist.
        if (pointInDocument(mouseW, doc)) {
          void import("./documentBgRemove").then(({ ensureBgRemoval, floodFillAt, paintBrushAt }) => {
            const b = ensureBgRemoval(doc);
            b.enabled = true;
            if (inter.tool === "wand") {
              if (input.clicked) {
                floodFillAt(doc, mouseW, b.tolerance, inter.target);
              }
            } else if (inter.tool === "brush") {
              if (input.mouse.left) {
                paintBrushAt(doc, mouseW, b.brushRadiusM, inter.target);
              }
            }
          });
          return; // Andere Klicks/Drag-Handler blockieren.
        }
      }
    }



    // Dimension-Hub-Box: aktiver "move"-Modus → nächster Klick legt
    // den PlacementPoint der ausgewählten Maßkette (mit Snap auf andere
    // Maßketten / Geometrie) neu. Wir intercepten den Klick hier ganz oben,
    // damit weder Drag noch andere Auswahl-Handler ausgelöst werden.
    if (this.app.dimensionHubMode === "move" && this.app.dimensionHubState.dimensionId) {
      const dim = this.app.scene.getDimensionById(this.app.dimensionHubState.dimensionId);
      if (!dim) {
        this.app.dimensionHubMode = "none";
        this.app.dimensionHubState = { visible: false, screenX: 0, screenY: 0, dimensionId: null };
      } else {
        const mouseS = v(input.mouse.sx, input.mouse.sy);
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const snap = this.app.topology.findBestSnap(mouseS, mouseW);
        // Live-Vorschau: PlacementPoint folgt dem Mauszeiger bzw. Snap.
        const targetW = snap ? v(snap.world.x, snap.world.y) : mouseW;
        // Eigene Geometrie nicht auf sich selbst snappen
        const g0 = getDimensionGeometry(dim);
        const eq = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
        const isSelf = snap && (eq(snap.world, dim.p1) || eq(snap.world, dim.p2)
          || eq(snap.world, g0.d1) || eq(snap.world, g0.d2) || eq(snap.world, g0.mid));
        dim.placementPoint = (snap && !isSelf) ? v(snap.world.x, snap.world.y) : mouseW;
        // Hub-Position aktualisieren, damit sie der Maßlinie folgt
        const g1 = getDimensionGeometry(dim);
        const sp = this.app.camera.worldToScreen(g1.mid.x, g1.mid.y);
        this.app.dimensionHubState = { visible: true, screenX: sp.x, screenY: sp.y, dimensionId: dim.id };
        if (input.clicked) {
          this.app.dimensionHubMode = "none";
        }
        // Snap-Indikator zeichnen
        this.snap = snap;
        return;
      }
    }


    // ── Marquee-Rahmen-Auswahl ───────────────────────────────────────────
    // Nur aktiv, wenn nichts anderes läuft (kein Drag, kein Edit, keine
    // Sonder-Modi, kein Pan). Wird beim Aufziehen aus der Leerraum-Situation
    // heraus entstehen — sobald der Cursor sich > 6px vom Klickpunkt bewegt.
    {
      const anyDrag = !!(this.dragStickerId || this.dragDocId || this.dragFreeStrokeId
        || this.dragTextBoxId || this.dragDimId || this.dragAreaLabelHatchId
        || this.rotateTextBoxId);
      const anyEdit = this.isEditing();
      const specialMode = this.app.dimensionHubMode === "move"
        || !!this.app.bgRemoveInteraction
        || this.app.documentHubMode !== "none";
      const blocked = anyDrag || anyEdit || specialMode || input.isPanning || input.keys.space;

      if (this.marqueeMode !== "click" && input.mouse.left && !blocked) {
        if (!this.marqueeStart) {
          this.marqueeStart = v(input.mouse.sx, input.mouse.sy);
          // Neuer Klick → alte Marquee-Auswahl verwerfen.
          if (this.marqueeSelectedIds.length) this.marqueeSelectedIds = [];
        }
        const dx = input.mouse.sx - this.marqueeStart.x;
        const dy = input.mouse.sy - this.marqueeStart.y;
        if (this.marqueeActive || Math.hypot(dx, dy) > 6) {
          this.marqueeActive = true;
          this.marqueeCurrent = v(input.mouse.sx, input.mouse.sy);
          // Vorherige Einzel-Selektion beim Aufziehen räumen.
          if (this.app.selection) this.app.setSelection(null);
          this.snap = null;
          return;
        }
      } else if (!input.mouse.left) {
        if (this.marqueeActive) {
          this._commitMarquee();
          this.marqueeActive = false;
          this.marqueeStart = null;
          this.marqueeCurrent = null;
          // Den zugehörigen Click-Release schlucken, damit nicht direkt
          // wieder setSelection(null) im Fallthrough getriggert wird.
          input.clicked = false;
          input.doubleClicked = false;
          return;
        }
        this.marqueeStart = null;
      } else if (blocked) {
        // Etwas hat begonnen (z.B. Drag) → Marquee-Ansatz verwerfen.
        this.marqueeStart = null;
        this.marqueeCurrent = null;
        this.marqueeActive = false;
      }
    }



    // Tür-Klick → in Door-Tool (nur Edit-Modus) wechseln & selektieren.
    if (input.clicked && !this.isEditing() && !this.dragStickerId && !this.dragDocId
        && !this.dragTextBoxId && !this.dragAreaLabelHatchId && !this.rotateTextBoxId) {
      // doorTool existiert nur in der vollständigen CadApp, nicht in MiniCad (Projektmappen-Seite).
      const doorTool: any = (this.app as any).doorTool;
      if (doorTool && typeof doorTool.hitDoorAt === "function") {
        const doorHit = doorTool.hitDoorAt(input);
        if (doorHit) {
          this.app.setTool("door");
          doorTool.placementMode = false;
          doorTool.selectDoor(doorHit.id);
          return;
        }
      }
    }



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
        const rawSnap = this.app.topology.findBestSnap(
          v(input.mouse.sx, input.mouse.sy),
          mouseW
        );
        const snap = this._isOwnDocumentSnap(doc, rawSnap) ? null : rawSnap;
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

    // Aktives FreeStroke-Drag (Verschieben der gesamten Freihand-Linie mit Snap)
    if (this.dragFreeStrokeId) {
      const stroke = this.app.scene.getFreeStrokeById(this.dragFreeStrokeId);
      if (!stroke || !this.dragFreeStrokeGrabOffset || !this.dragFreeStrokeOrigPoints) {
        this.dragFreeStrokeId = null;
        this.dragFreeStrokeGrabOffset = null;
        this.dragFreeStrokeOrigPoints = null;
      } else {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const rawSnap = this.app.topology.findBestSnap(
          v(input.mouse.sx, input.mouse.sy),
          mouseW,
        );
        const target = (rawSnap && rawSnap.world) ? rawSnap.world : mouseW;
        // Neuer Referenzpunkt (points[0]) = target - grabOffset
        const p0x = target.x - this.dragFreeStrokeGrabOffset.x;
        const p0y = target.y - this.dragFreeStrokeGrabOffset.y;
        const orig = this.dragFreeStrokeOrigPoints;
        const dx = p0x - orig[0].x;
        const dy = p0y - orig[0].y;
        for (let i = 0; i < stroke.points.length && i < orig.length; i++) {
          stroke.points[i] = { x: orig[i].x + dx, y: orig[i].y + dy };
        }
        if (!input.mouse.left) {
          this.dragFreeStrokeId = null;
          this.dragFreeStrokeGrabOffset = null;
          this.dragFreeStrokeOrigPoints = null;
        }
        return;
      }
    }


    // Active textbox drag (translate) with snap
    // Active area-label drag (verschieben der m²-Anzeige innerhalb einer Schraffur)
    if (this.dragAreaLabelHatchId) {
      const hatch = this.app.scene.getHatchById(this.dragAreaLabelHatchId);
      if (!hatch || !this.dragAreaLabelGrabOffsetWorld || !this.dragAreaLabelStartOffset) {
        this.dragAreaLabelHatchId = null;
        this.dragAreaLabelGrabOffsetWorld = null;
        this.dragAreaLabelStartOffset = null;
      } else {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const snap = this.app.topology.findBestSnap(
          v(input.mouse.sx, input.mouse.sy),
          mouseW
        );
        const target = (snap && snap.world) ? snap.world : mouseW;
        // New label center should be: target - grabOffset
        // Convert to offset relative to polygon centroid:
        const centroid = polygonCentroid(hatch.points);
        hatch.areaLabel.offsetX = (target.x - this.dragAreaLabelGrabOffsetWorld.x) - centroid.x;
        hatch.areaLabel.offsetY = (target.y - this.dragAreaLabelGrabOffsetWorld.y) - centroid.y;
        if (!input.mouse.left) {
          this.dragAreaLabelHatchId = null;
          this.dragAreaLabelGrabOffsetWorld = null;
          this.dragAreaLabelStartOffset = null;
        }
        return;
      }
    }

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
        // Snap-Versuch: bestehende Maßlinien/-punkte etc. dürfen die
        // Platzierung fangen. Eigene Geometrie ausblenden, indem wir die
        // Snap-Treffer auf "nicht dieses Dimensionsobjekt" filtern.
        const mouseS = v(input.mouse.sx, input.mouse.sy);
        const snap = this.app.topology.findBestSnap(mouseS, mouseW);
        const isSelfSnap = (() => {
          if (!snap) return false;
          const eq = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
          return eq(snap.world, dim.p1) || eq(snap.world, dim.p2)
            || eq(snap.world, g.d1) || eq(snap.world, g.d2) || eq(snap.world, g.mid);
        })();
        if (snap && !isSelfSnap) {
          // PlacementPoint exakt auf den Snap-Punkt legen – die
          // Maßlinien-Offset-Geometrie ergibt sich daraus automatisch.
          dim.placementPoint = v(snap.world.x, snap.world.y);
        } else {
          const mouseOffset = dot(sub(mouseW, dim.p1), g.n);
          const newOffset = mouseOffset - this.dragDimOffsetAlongNormal;
          dim.placementPoint = add(dim.p1, mul(g.n, newOffset));
        }
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

        const isWallPointEdit = this.editTarget?.kind === "wallPoint";
        if (isWallPointEdit) {
          // Vorschau-Only: Scene NICHT mutieren, nur Position merken.
          this.wallPreviewPoint = v(p.x, p.y);
        } else {
          this._applyMovingPoint(p, this.fixedPoint!);
        }

        this.app.renderer.setHoverSegmentId(null);
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.updateDisplay(metrics.lengthM, metrics.angleDeg);

        if (input.clicked) {
          const finalP = this._commitMovePoint(input);
          if (isWallPointEdit) {
            // Jetzt erst einmalig auf die Scene anwenden → genau ein Undo-Schritt.
            this._applyMovingPoint(finalP, this.fixedPoint!);
          } else {
            this._applyMovingPoint(finalP, this.fixedPoint!);
          }
          this._clearEditState();
          this.app.hub.hide();
          (this.app as any).commitHistorySnapshot?.();
        }
        return;
      }

      if (this.activeEditAction === PointEditAction.TRANSLATE) {
        const delta = this._previewTranslateDelta(input);
        const isWallTranslatePreview =
          this.editTarget?.kind === "wallPoint" || this.editTarget?.kind === "wall";
        if (isWallTranslatePreview) {
          // Vorschau-Only: Scene NICHT mutieren, nur Delta merken (ganze Wand).
          this.wallPreviewDelta = v(delta.x, delta.y);
        } else {
          this._applyTranslateDelta(delta);
        }

        this.app.renderer.setHoverSegmentId(null);
        // Distanz-/Winkel-Anzeige der Verschiebung (wie beim Linienwerkzeug)
        if (isWallTranslatePreview) {
          const len = Math.hypot(delta.x, delta.y);
          const ang = len > 1e-6 ? (Math.atan2(delta.y, delta.x) * 180) / Math.PI : 0;
          this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
          this.app.hub.updateDisplay(len, ang);
        } else {
          this.app.hub.hide();
        }

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
          } else if ((this.editTarget as any)?.kind === "freeStroke") {
            this._applyFreeStrokeRotate(ang);
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
          (this.app as any).commitHistorySnapshot?.();
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
      // PDF/Bild-Hub: aktiver Maus-Modus (Move/Rotate/Scale/Crop) — Canvas-Klick committet
      // die Transformation bezogen auf den frei gewählten Ankerpunkt (Welt).
      {
        const sel = this.app.selection as any;
        const hs = this.app.documentHubState;
        const mode = this.app.documentHubMode;
        if (mode !== "none" && hs.visible && sel && sel.type === SelectionType.DOCUMENT && sel.documentId && hs.docId === sel.documentId) {
          const doc = this.app.scene.getDocumentById(sel.documentId);
          if (doc) {
            const mouseW = v(input.mouse.wx, input.mouse.wy);
            const snap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), mouseW);
            const target = (snap && snap.world) ? snap.world : mouseW;
            const a = hs.anchorWorld;

            if (mode === "crop" && hs.cropSide) {
              // Klick-Position in lokale Doc-Koords (Origin = Doc-Center, unrotiert)
              const cx = doc.position.x + doc.widthM / 2;
              const cy = doc.position.y + doc.heightM / 2;
              const dx = target.x - cx, dy = target.y - cy;
              const cs = Math.cos(-doc.rotationRad), sn = Math.sin(-doc.rotationRad);
              const lx = dx * cs - dy * sn;
              const ly = dx * sn + dy * cs;
              const hx = doc.widthM / 2, hy = doc.heightM / 2;
              const cur = doc.cropM || { top: 0, right: 0, bottom: 0, left: 0 };
              const side = hs.cropSide;
              if (side === "left") {
                const inset = Math.max(0, Math.min(doc.widthM - (cur.right || 0) - 0.001, lx + hx));
                doc.cropM = { ...cur, left: inset };
              } else if (side === "right") {
                const inset = Math.max(0, Math.min(doc.widthM - (cur.left || 0) - 0.001, hx - lx));
                doc.cropM = { ...cur, right: inset };
              } else if (side === "top") {
                const inset = Math.max(0, Math.min(doc.heightM - (cur.bottom || 0) - 0.001, ly + hy));
                doc.cropM = { ...cur, top: inset };
              } else if (side === "bottom") {
                const inset = Math.max(0, Math.min(doc.heightM - (cur.top || 0) - 0.001, hy - ly));
                doc.cropM = { ...cur, bottom: inset };
              }
            } else if (a && mode === "move") {
              const dx = target.x - a.x;
              const dy = target.y - a.y;
              doc.position = { x: doc.position.x + dx, y: doc.position.y + dy };
            } else if (a && mode === "rotate") {
              const center = documentCenterWorld(doc);
              const r0 = Math.hypot(center.x - a.x, center.y - a.y);
              if (r0 > 1e-6) {
                const ang0 = Math.atan2(center.y - a.y, center.x - a.x);
                const ang1 = Math.atan2(target.y - a.y, target.x - a.x);
                let delta = ang1 - ang0;
                // Soft-Snap auf 15°-Schritte (innerhalb ±3°).
                const STEP = Math.PI / 12; // 15°
                const TOL = (3 * Math.PI) / 180;
                const targetRot = doc.rotationRad + delta;
                const nearest = Math.round(targetRot / STEP) * STEP;
                if (Math.abs(targetRot - nearest) < TOL) {
                  delta = nearest - doc.rotationRad;
                }
                doc.rotationRad = doc.rotationRad + delta;
                const cs = Math.cos(delta), sn = Math.sin(delta);
                const cx = a.x + (center.x - a.x) * cs - (center.y - a.y) * sn;
                const cy = a.y + (center.x - a.x) * sn + (center.y - a.y) * cs;
                doc.position = { x: cx - doc.widthM / 2, y: cy - doc.heightM / 2 };
              }
            } else if (a && mode === "scale") {
              const center = documentCenterWorld(doc);
              const r0 = Math.hypot(center.x - a.x, center.y - a.y);
              const r1 = Math.hypot(target.x - a.x, target.y - a.y);
              if (r0 > 1e-6 && r1 > 1e-6) {
                const f = Math.max(0.05, Math.min(20, r1 / r0));
                doc.widthM = Math.max(0.001, doc.widthM * f);
                doc.heightM = Math.max(0.001, doc.heightM * f);
                const cx = a.x + (center.x - a.x) * f;
                const cy = a.y + (center.y - a.y) * f;
                doc.position = { x: cx - doc.widthM / 2, y: cy - doc.heightM / 2 };
              }
            }
            // Modus & Hub schließen nach Commit.
            this.app.documentHubMode = "none";
            this.app.documentHubFirstClick = null;
            this.app.documentHubState = { visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null };
            return;
          }
        }
      }


      // Dokument-Auswahl: bei aktiver Dokument-Selektion einen Klick irgendwo im
      // Dokument als Ankerpunkt für die Hub-Box akzeptieren. Eckpunkte/Kanten
      // werden wie bisher (Kante = Crop-Hub, Ecke = Hub) behandelt.
      {
        const sel = this.app.selection as any;
        if (sel && sel.type === SelectionType.DOCUMENT && sel.documentId) {
          const doc = this.app.scene.getDocumentById(sel.documentId);
          if (doc) {
            const w2s = (x: number, y: number) => this.app.camera.worldToScreen(x, y);
            const cornerIdx = hitDocumentCorner(doc, w2s, input.mouse.sx, input.mouse.sy, 10);
            if (cornerIdx != null) {
              const cornersW = documentCornersWorld(doc);
              const cw = cornersW[cornerIdx];
              const sp = this.app.camera.worldToScreen(cw.x, cw.y);
              this.app.documentHubState = {
                visible: true, screenX: sp.x, screenY: sp.y,
                docId: doc.id, cornerIndex: cornerIdx,
                anchorWorld: { x: cw.x, y: cw.y }, cropSide: null,
              };
              return;
            }
            // Kante (sichtbar, nach Crop) klicken → Crop-Hub an Klick-Position öffnen.
            const edgeSide = hitDocumentVisibleEdge(doc, w2s, input.mouse.sx, input.mouse.sy, 8)
              || hitDocumentEdge(doc, w2s, input.mouse.sx, input.mouse.sy, 8);
            if (edgeSide) {
              this.app.documentHubState = {
                visible: true, screenX: input.mouse.sx, screenY: input.mouse.sy,
                docId: doc.id, cornerIndex: 0,
                anchorWorld: { x: input.mouse.wx, y: input.mouse.wy },
                cropSide: edgeSide,
              };
              return;
            }
            // Klick irgendwo INNERHALB des Dokuments → Hub an Klick-Position öffnen,
            // Anker = (gesnapter) Welt-Klickpunkt. So lässt sich die PDF von jeder
            // Stelle aus verschieben/drehen/skalieren.
            const mouseW = v(input.mouse.wx, input.mouse.wy);
            if (pointInDocumentVisible(mouseW, doc)) {
              if ((doc as any)._snapOnly) {
                this._startDocumentDrag(doc, input);
                return;
              }
              const snap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), mouseW);
              const anchor = (snap && snap.world) ? snap.world : mouseW;
              this.app.documentHubState = {
                visible: true, screenX: input.mouse.sx, screenY: input.mouse.sy,
                docId: doc.id, cornerIndex: 0,
                anchorWorld: { x: anchor.x, y: anchor.y }, cropSide: null,
              };
              return;
            }
            // Klick außerhalb schließt die Hub-Box (Auswahl bleibt evtl. erhalten).
            if (this.app.documentHubState.visible) {
              this.app.documentHubState = { visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null };
            }
          }
        }
      }

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

      // AreaLabel (m²-Anzeige) der selektierten Schraffur → Ecken-HUB ODER ziehen zum Verschieben.
      {
        const sel = this.app.selection;
        const selHatchId = sel && (sel as any).hatchId ? (sel as any).hatchId as string : null;
        if (selHatchId) {
          const hatch = this.app.scene.getHatchById(selHatchId);
          if (hatch && hatch.areaLabel?.show) {
            const layout = (this.app.renderer as any)._getAreaLabelLayout(hatch);
            if (layout) {
              const sx = input.mouse.sx, sy = input.mouse.sy;
              // 1) Eckpunkt-Hit zuerst (Fangpunkt-Box ~ hitPx)
              const hitPx = Defaults.hitPx;
              let bestCorner = -1;
              let bestDist = Infinity;
              for (let i = 0; i < layout.handles.length; i++) {
                const h = layout.handles[i];
                const d = Math.hypot(h.x - sx, h.y - sy);
                if (d <= hitPx && d < bestDist) { bestDist = d; bestCorner = i; }
              }
              if (bestCorner >= 0) {
                this.app.setSelection({ type: SelectionType.AREA_LABEL_HANDLE, hatchId: hatch.id, handleIndex: bestCorner } as any);
                this.app.pointEditMenu.showAt(layout.handles[bestCorner].x, layout.handles[bestCorner].y, [
                  PointEditAction.MOVE,
                  PointEditAction.TRANSLATE,
                  PointEditAction.ROTATE,
                ]);
                return;
              }
              // 2) Body-Hit für Drag (rotiertes Rechteck)
              const dx = sx - layout.centerScreen.x;
              const dy = sy - layout.centerScreen.y;
              const cos = Math.cos(-(layout.rotationRad || 0));
              const sin = Math.sin(-(layout.rotationRad || 0));
              const lx = dx * cos - dy * sin;
              const ly = dx * sin + dy * cos;
              if (Math.abs(lx) <= layout.boxW / 2 && Math.abs(ly) <= layout.boxH / 2) {
                const mouseW = v(input.mouse.wx, input.mouse.wy);
                this.dragAreaLabelHatchId = hatch.id;
                this.dragAreaLabelGrabOffsetWorld = { x: mouseW.x - layout.centerWorld.x, y: mouseW.y - layout.centerWorld.y };
                this.dragAreaLabelStartOffset = { x: hatch.areaLabel.offsetX || 0, y: hatch.areaLabel.offsetY || 0 };
                return;
              }
            }
          }
        }
      }


      // TextBox-Eckpunkt der bereits selektierten TextBox? → Hub-Menü (Translate/Rotate/Resize)
      const cornerHit = this._hitTextBoxCornerHandle(input);
      if (cornerHit) {
        this.app.setSelection({
          type: SelectionType.TEXTBOX_HANDLE,
          textBoxId: cornerHit.box.id,
          handleIndex: cornerHit.handleIndex,
        });
        // Menü immer horizontal mittig OBERHALB der Textbox platzieren.
        const corners = boxCornersWorld(cornerHit.box);
        let minSx = Infinity, minSy = Infinity, maxSx = -Infinity;
        for (const c of corners) {
          const s = this.app.camera.worldToScreen(c.x, c.y);
          if (s.x < minSx) minSx = s.x;
          if (s.x > maxSx) maxSx = s.x;
          if (s.y < minSy) minSy = s.y;
        }
        const anchorSx = (minSx + maxSx) * 0.5;
        const anchorSy = minSy; // top edge
        this.app.pointEditMenu.showAt(anchorSx, anchorSy, [
          PointEditAction.TRANSLATE,
          PointEditAction.ROTATE,
          PointEditAction.RESIZE,
          PointEditAction.DUPLICATE,
        ], { align: "centerAbove" });
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

      // Fangpunkte (Hatch-/Segment-Eckpunkte) immer vor Kanten priorisieren.
      {
        const pointHit = this._hitTestWithForegroundPriority(input);
        if (pointHit && pointHit.type === SelectionType.POINT) {
          this.app.setSelection(pointHit);
          if ((pointHit as any).segmentId) this.app.showLineSettingsPanel(true);
          if ((pointHit as any).hatchId) this.app.showHatchSettingsPanel(true);
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
      // Dokument-Underlay-Priorität: Wenn der Vordergrund-Hit nur ein Hatch-Body
      // ist (keine Kante, kein Eckpunkt) und ein Dokument unter der Maus liegt,
      // bevorzugen wir das Dokument. So kann der User jederzeit ein Bild/PDF
      // erneut anklicken, um die Werkzeug-Einstellungen (rechtes Panel) zu sehen.
      const isPlainHatchBody = !!hit
        && (hit as any).type === SelectionType.HATCH
        && (hit as any).edgeIndex == null
        && (hit as any).pointIndex == null
        && (hit as any).holeIndex == null;
      const docHitEarly = (!hit || isPlainHatchBody) ? this._hitDocument(input) : null;
      if (docHitEarly) {
        if ((docHitEarly as any)._snapOnly) {
          this._startDocumentDrag(docHitEarly, input);
        } else {
          this.app.setSelection({ type: SelectionType.DOCUMENT, documentId: docHitEarly.id } as any);
        }
        return;
      }
      if (hit) {
        this.app.setSelection(hit);
        if ((hit as any).segmentId) this.app.showLineSettingsPanel(true);
        if ((hit as any).hatchId) this.app.showHatchSettingsPanel(true);
        if (hit.type === SelectionType.DIMENSION) {
          // Hinweis: Dimensionen werden bewusst NICHT mehr per Maus-Drag verschoben.
          // Verschieben passiert ausschließlich über das Move-Symbol in der Hub-Box
          // (siehe dimensionHubMode === "move" in input.clicked-Handler).
        }
      } else {
        // Freihand-Stroke: Klick selektiert nur & zeigt HUB — Verschieben/Drehen/Löschen
        // ausschließlich über die HUB-Aktionen (kein direktes Maus-Drag).
        const freeHit = this._hitFreeStroke(input);
        if (freeHit) {
          this.app.setSelection({ type: SelectionType.FREE_STROKE, freeStrokeId: freeHit.id } as any);
          this.app.pointEditMenu.showAt(input.mouse.sx, input.mouse.sy, [
            PointEditAction.TRANSLATE,
            PointEditAction.ROTATE,
            PointEditAction.DELETE,
          ]);
          return;
        }
        // Kein Vordergrund-Hit & kein Dokument → Auswahl aufheben.
        this.app.setSelection(null);
        this.app.documentHubState = { visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null };
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

    // Dimension-Hub-Box: sichtbar, solange genau eine Maßkette selektiert ist
    // (und wir nicht gerade aktiv ziehen). Position folgt der Maßlinien-Mitte.
    if (this.app.dimensionHubMode !== "move") {
      const sel = this.app.selection as any;
      if (sel && sel.type === SelectionType.DIMENSION && sel.dimensionId && !this.dragDimId) {
        const dim = this.app.scene.getDimensionById(sel.dimensionId);
        if (dim) {
          const g = getDimensionGeometry(dim);
          const sp = this.app.camera.worldToScreen(g.mid.x, g.mid.y);
          this.app.dimensionHubState = { visible: true, screenX: sp.x, screenY: sp.y, dimensionId: dim.id };
        } else if (this.app.dimensionHubState.visible) {
          this.app.dimensionHubState = { visible: false, screenX: 0, screenY: 0, dimensionId: null };
        }
      } else if (this.app.dimensionHubState.visible) {
        this.app.dimensionHubState = { visible: false, screenX: 0, screenY: 0, dimensionId: null };
      }
    }


    this.snap = this.app.topology.findBestSnap(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy)
    );
  }

  _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // ── Marquee-Rechteck + hervorgehobene Auswahl ──────────────────────
    this._drawMarqueeOverlay(ctx, cam);

    // PDF/Bild-Hub: Live-Vorschau (Ghost) während aktivem Move/Rotate/Scale.
    {
      const mode = this.app.documentHubMode;
      const hs = this.app.documentHubState;
      const sel = this.app.selection as any;
      if (mode !== "none" && hs.visible && sel && sel.type === SelectionType.DOCUMENT && sel.documentId && hs.docId === sel.documentId) {
        const doc = this.app.scene.getDocumentById(sel.documentId);
        if (doc) {
          const mouseW = v(this.app.input.mouse.wx, this.app.input.mouse.wy);
          const snap = this.app.topology.findBestSnap(v(this.app.input.mouse.sx, this.app.input.mouse.sy), mouseW);
          const target = (snap && snap.world) ? snap.world : mouseW;
          const a = hs.anchorWorld;
          let ghost: any = null;
          if (mode === "crop" && hs.cropSide) {
            // Crop-Vorschau: projeziere Maus in lokale Doc-Koords und berechne neuen cropM.
            const cx = doc.position.x + doc.widthM / 2;
            const cy = doc.position.y + doc.heightM / 2;
            const dxw = target.x - cx, dyw = target.y - cy;
            const csA = Math.cos(-doc.rotationRad), snA = Math.sin(-doc.rotationRad);
            const lx = dxw * csA - dyw * snA;
            const ly = dxw * snA + dyw * csA;
            const hx = doc.widthM / 2, hy = doc.heightM / 2;
            const cur = (doc as any).cropM || { top: 0, right: 0, bottom: 0, left: 0 };
            const next = { ...cur };
            const side = hs.cropSide;
            if (side === "left") next.left = Math.max(0, Math.min(doc.widthM - (cur.right || 0) - 0.001, lx + hx));
            else if (side === "right") next.right = Math.max(0, Math.min(doc.widthM - (cur.left || 0) - 0.001, hx - lx));
            else if (side === "top") next.top = Math.max(0, Math.min(doc.heightM - (cur.bottom || 0) - 0.001, ly + hy));
            else if (side === "bottom") next.bottom = Math.max(0, Math.min(doc.heightM - (cur.top || 0) - 0.001, hy - ly));
            ghost = { ...doc, cropM: next, _snapOnly: false };
          } else if (a && mode === "move") {
            ghost = { ...doc, position: { x: doc.position.x + (target.x - a.x), y: doc.position.y + (target.y - a.y) }, _snapOnly: false };
          } else if (a && mode === "rotate") {
            const center = documentCenterWorld(doc);
            const r0 = Math.hypot(center.x - a.x, center.y - a.y);
            if (r0 > 1e-6) {
              const ang0 = Math.atan2(center.y - a.y, center.x - a.x);
              const ang1 = Math.atan2(target.y - a.y, target.x - a.x);
              let delta = ang1 - ang0;
              const STEP = Math.PI / 12;
              const TOL = (3 * Math.PI) / 180;
              const targetRot = doc.rotationRad + delta;
              const nearest = Math.round(targetRot / STEP) * STEP;
              if (Math.abs(targetRot - nearest) < TOL) delta = nearest - doc.rotationRad;
              const cs = Math.cos(delta), sn = Math.sin(delta);
              const cx = a.x + (center.x - a.x) * cs - (center.y - a.y) * sn;
              const cy = a.y + (center.x - a.x) * sn + (center.y - a.y) * cs;
              ghost = { ...doc, rotationRad: doc.rotationRad + delta, position: { x: cx - doc.widthM / 2, y: cy - doc.heightM / 2 }, _snapOnly: false };
            }
          } else if (a && mode === "scale") {
            const center = documentCenterWorld(doc);
            const r0 = Math.hypot(center.x - a.x, center.y - a.y);
            const r1 = Math.hypot(target.x - a.x, target.y - a.y);
            if (r0 > 1e-6 && r1 > 1e-6) {
              const f = Math.max(0.05, Math.min(20, r1 / r0));
              const nw = Math.max(0.001, doc.widthM * f);
              const nh = Math.max(0.001, doc.heightM * f);
              const cx = a.x + (center.x - a.x) * f;
              const cy = a.y + (center.y - a.y) * f;
              ghost = { ...doc, widthM: nw, heightM: nh, position: { x: cx - nw / 2, y: cy - nh / 2 }, _snapOnly: false };
            }
          }
          if (ghost) {
            ctx.save();
            ctx.globalAlpha = 0.55;
            try { (this.app.renderer as any)._drawSingleDocument(ghost); } catch { /* ignore */ }
            ctx.restore();
            const st = cam.worldToScreen(target.x, target.y);
            if (a) {
              // Anker-Marker + Linie zur Maus
              const sa = cam.worldToScreen(a.x, a.y);
              ctx.save();
              ctx.strokeStyle = "rgba(77,163,255,0.8)";
              ctx.setLineDash([5, 4]);
              ctx.lineWidth = 1.2;
              ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(st.x, st.y); ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = "rgba(77,163,255,0.95)";
              ctx.strokeStyle = "#fff";
              ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(sa.x, sa.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
              ctx.restore();
            }
            if (snap && snap.world) {
              drawSnapDot(ctx, st.x, st.y, { ring: true });
            }
          }
        }
      }
    }

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
        drawSnapDot(ctx, s.x, s.y, { ring: true });
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
        drawSnapDot(ctx, s.x, s.y, { ring: true });
      }
      return;
    }

    if (this.isEditing()) {
      // Vorschau-Wandkontur für Wand-Punkt-Edits (MOVE / TRANSLATE) und für
      // ganze Wand-Translation (Edge-basiert). Render-Stil entspricht dem
      // Wand-Werkzeug: Haupt-/Sub-Linie als kräftige Linie in Wandfarbe,
      // Mittellinie gestrichelt, plus weiße Eckpunkte.
      const isWallKind =
        this.editTarget?.kind === "wallPoint" || this.editTarget?.kind === "wall";
      if (isWallKind && this.wallPointsOriginal) {
        const wallId = (this.editTarget as any).wallId as string;
        const wall = this.app.scene.getWallById(wallId);
        if (wall) {
          let previewCorners: Vec2[] | null = null;
          if (
            this.activeEditAction === PointEditAction.MOVE &&
            this.wallPreviewPoint &&
            this.editTarget?.kind === "wallPoint"
          ) {
            previewCorners = this.wallPointsOriginal.map(p => v(p.x, p.y));
            previewCorners[(this.editTarget as any).pointIndex] =
              v(this.wallPreviewPoint.x, this.wallPreviewPoint.y);
          } else if (
            this.activeEditAction === PointEditAction.TRANSLATE &&
            this.wallPreviewDelta
          ) {
            const d = this.wallPreviewDelta;
            previewCorners = this.wallPointsOriginal.map(p => v(p.x + d.x, p.y + d.y));
          }
          if (previewCorners && previewCorners.length >= 2) {
            const lines = computeWallLines(previewCorners, wall.thicknessM, wall.referenceSide);
            const drawPoly = (pts: Vec2[], opts: { color: string; widthPx: number; dashed?: boolean }) => {
              if (pts.length < 2) return;
              ctx.save();
              ctx.strokeStyle = opts.color;
              ctx.lineWidth = opts.widthPx;
              if (opts.dashed) ctx.setLineDash([5, 4]);
              ctx.beginPath();
              const s0 = cam.worldToScreen(pts[0].x, pts[0].y);
              ctx.moveTo(s0.x, s0.y);
              for (let i = 1; i < pts.length; i++) {
                const s = cam.worldToScreen(pts[i].x, pts[i].y);
                ctx.lineTo(s.x, s.y);
              }
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.restore();
            };
            const wallColor = wall.color || "#1a1a1a";
            // Sub-Linie (Gegenkante) – kräftig
            drawPoly(lines.subCorners, { color: wallColor, widthPx: 1.5 });
            // Mittellinie – gestrichelt, dezent
            drawPoly(lines.helpCorners, { color: "rgba(120,120,120,0.7)", widthPx: 1, dashed: true });
            // Hauptlinie (= Bezug) – kräftig
            drawPoly(lines.mainCorners, { color: wallColor, widthPx: 2 });
            // Vorschau-Eckpunkte (weiß mit blauem Ring, wie Selektion)
            ctx.save();
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "rgba(77,163,255,0.95)";
            ctx.lineWidth = 1.4;
            for (const c of previewCorners) {
              const s = cam.worldToScreen(c.x, c.y);
              ctx.beginPath();
              ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            }
            ctx.restore();
          }
        }
      }

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
          drawSnapDot(ctx, s.x, s.y, { ring: true });
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
    drawSnapDot(ctx, s.x, s.y, { ring: true });
  }

  // ── Marquee helpers ──────────────────────────────────────────────────────

  private _marqueeRectWorld(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (!this.marqueeStart || !this.marqueeCurrent) return null;
    const a = this.app.camera.screenToWorld(this.marqueeStart.x, this.marqueeStart.y);
    const b = this.app.camera.screenToWorld(this.marqueeCurrent.x, this.marqueeCurrent.y);
    return {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    };
  }

  private _pointsAabb(pts: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (!pts || !pts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  /** Repräsentative Weltpunkte je Element-Kind (für Enclose/AABB-Test). */
  private _elementPoints(kind: string, obj: any): Vec2[] {
    try {
      switch (kind) {
        case "segment":  return [obj.a, obj.b];
        case "wall":     return obj.corners || [];
        case "hatch":    return obj.points || [];
        case "freeStroke": return obj.points || [];
        case "dimension": {
          const g = getDimensionGeometry(obj);
          return [obj.p1, obj.p2, g.d1, g.d2];
        }
        case "textbox":  return boxCornersWorld(obj);
        case "document": return documentCornersWorld(obj);
        case "sticker":  return instanceBoundingCornersWorld(obj.items, obj.position, obj.rotationRad, obj.scale);
        default: return [];
      }
    } catch { return []; }
  }

  private _rectsOverlap(
    a: { minX: number; minY: number; maxX: number; maxY: number },
    b: { minX: number; minY: number; maxX: number; maxY: number }
  ): boolean {
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  }

  private _allPointsInside(
    pts: Vec2[],
    r: { minX: number; minY: number; maxX: number; maxY: number }
  ): boolean {
    if (!pts.length) return false;
    for (const p of pts) {
      if (p.x < r.minX || p.x > r.maxX || p.y < r.minY || p.y > r.maxY) return false;
    }
    return true;
  }

  /** Iteriert alle testbaren Scene-Elemente. */
  private *_iterElements(): Generator<{ kind: string; id: string; obj: any }> {
    const s = this.app.scene as any;
    for (const o of s.segments || [])         yield { kind: "segment",    id: o.id, obj: o };
    for (const o of s.walls || [])            yield { kind: "wall",       id: o.id, obj: o };
    for (const o of s.hatches || [])          yield { kind: "hatch",      id: o.id, obj: o };
    for (const o of s.freeStrokes || [])      yield { kind: "freeStroke", id: o.id, obj: o };
    for (const o of s.dimensions || [])       yield { kind: "dimension",  id: o.id, obj: o };
    for (const o of s.textBoxes || [])        yield { kind: "textbox",    id: o.id, obj: o };
    for (const o of s.documents || [])        yield { kind: "document",   id: o.id, obj: o };
    for (const o of s.stickerInstances || []) yield { kind: "sticker",    id: o.id, obj: o };
  }

  private _commitMarquee() {
    const rect = this._marqueeRectWorld();
    if (!rect || (rect.maxX - rect.minX) < 1e-6 || (rect.maxY - rect.minY) < 1e-6) {
      this.marqueeSelectedIds = [];
      return;
    }
    const hits: { kind: string; id: string }[] = [];
    for (const { kind, id, obj } of this._iterElements()) {
      const pts = this._elementPoints(kind, obj);
      if (!pts.length) continue;
      const aabb = this._pointsAabb(pts);
      if (!aabb) continue;
      if (this.marqueeMode === "enclose") {
        if (this._allPointsInside(pts, rect)) hits.push({ kind, id });
      } else {
        if (this._rectsOverlap(aabb, rect)) hits.push({ kind, id });
      }
    }
    this.marqueeSelectedIds = hits;
  }

  /** Löscht alle per Marquee ausgewählten Elemente. Wird aus CadApp Delete-Handler aufgerufen. */
  deleteMarqueeSelection(): boolean {
    if (!this.marqueeSelectedIds.length) return false;
    const scene = this.app.scene;
    for (const { kind, id } of this.marqueeSelectedIds) {
      try {
        switch (kind) {
          case "segment":    { const o = scene.getSegmentById(id);         if (o) scene.removeSegment(o); break; }
          case "wall":       { const o = scene.getWallById(id);            if (o) scene.removeWall(o); break; }
          case "hatch":      { const o = scene.getHatchById(id);           if (o) scene.removeHatch(o); break; }
          case "freeStroke": { const o = scene.getFreeStrokeById(id);      if (o) scene.removeFreeStroke(o); break; }
          case "dimension":  { const o = scene.getDimensionById(id);       if (o) scene.removeDimension(o); break; }
          case "textbox":    { const o = scene.getTextBoxById(id);         if (o) scene.removeTextBox(o); break; }
          case "document":   { const o = scene.getDocumentById(id);        if (o) scene.removeDocument(o); break; }
          case "sticker":    { const o = scene.getStickerInstanceById(id); if (o) scene.removeStickerInstance(o); break; }
        }
      } catch { /* ignore individual failures */ }
    }
    this.marqueeSelectedIds = [];
    try { (this.app as any).refreshLabelUI?.(); } catch {}
    return true;
  }

  private _drawMarqueeOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Hervorhebung marquee-selektierter Elemente — visuell möglichst identisch
    // zur normalen Einzel-Selektion:
    //   • Wände   → gefülltes Wand-Solid (blau, 0.28) mit Kanten-Stroke
    //   • Hatch   → Polygon in Blau (fill 0.22) + Umriss
    //   • Sonst   → dicker blauer Umriss entlang der echten Geometrie
    if (this.marqueeSelectedIds.length) {
      const seen = new Set<string>();
      const strokeCol = "rgba(77,163,255,0.95)";
      const fillCol   = "rgba(77,163,255,0.28)";

      for (const { kind, id } of this.marqueeSelectedIds) {
        const key = kind + ":" + id;
        if (seen.has(key)) continue; seen.add(key);
        const obj = this._getElementById(kind, id);
        if (!obj) continue;

        // Wände → gefülltes healed Solid analog Renderer-Selektion.
        if (kind === "wall") {
          try {
            const topo = (this.app.scene as any).getWallTopology?.();
            const ring = buildHealedWallSolidRing(obj, this.app.scene.walls, topo);
            if (ring && ring.length >= 3) {
              ctx.save();
              ctx.beginPath();
              const p0 = cam.worldToScreen(ring[0].x, ring[0].y);
              ctx.moveTo(p0.x, p0.y);
              for (let i = 1; i < ring.length; i++) {
                const p = cam.worldToScreen(ring[i].x, ring[i].y);
                ctx.lineTo(p.x, p.y);
              }
              ctx.closePath();
              ctx.fillStyle = fillCol;
              ctx.fill();
              ctx.strokeStyle = strokeCol;
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.restore();
            }
          } catch { /* fall through */ }
          continue;
        }

        // Hatch → gefülltes Polygon in Blau.
        if (kind === "hatch" && Array.isArray(obj.points) && obj.points.length >= 3) {
          ctx.save();
          ctx.beginPath();
          const p0 = cam.worldToScreen(obj.points[0].x, obj.points[0].y);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < obj.points.length; i++) {
            const p = cam.worldToScreen(obj.points[i].x, obj.points[i].y);
            ctx.lineTo(p.x, p.y);
          }
          ctx.closePath();
          const holes = obj.holes || [];
          for (const loop of holes) {
            if (!loop || loop.length < 3) continue;
            const h0 = cam.worldToScreen(loop[0].x, loop[0].y);
            ctx.moveTo(h0.x, h0.y);
            for (let i = 1; i < loop.length; i++) {
              const hp = cam.worldToScreen(loop[i].x, loop[i].y);
              ctx.lineTo(hp.x, hp.y);
            }
            ctx.closePath();
          }
          ctx.fillStyle = fillCol;
          ctx.fill("evenodd");
          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
          continue;
        }

        // Fallback: dicker blauer Umriss entlang der Geometrie.
        const pts = this._elementPoints(kind, obj);
        if (!pts || pts.length < 2) continue;
        const closed = pts.length >= 3 && kind !== "segment" && kind !== "dimension";
        ctx.save();
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        const p0 = cam.worldToScreen(pts[0].x, pts[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
          const p = cam.worldToScreen(pts[i].x, pts[i].y);
          ctx.lineTo(p.x, p.y);
        }
        if (closed) ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    // Aktives Aufzieh-Rechteck.
    if (this.marqueeActive && this.marqueeStart && this.marqueeCurrent) {
      const x = Math.min(this.marqueeStart.x, this.marqueeCurrent.x);
      const y = Math.min(this.marqueeStart.y, this.marqueeCurrent.y);
      const w = Math.abs(this.marqueeCurrent.x - this.marqueeStart.x);
      const h = Math.abs(this.marqueeCurrent.y - this.marqueeStart.y);
      ctx.save();
      if (this.marqueeMode === "enclose") {
        ctx.strokeStyle = "rgba(59,130,246,0.95)";
        ctx.fillStyle   = "rgba(59,130,246,0.10)";
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "rgba(249,115,22,0.95)";
        ctx.fillStyle   = "rgba(249,115,22,0.10)";
        ctx.setLineDash([6, 4]);
      }
      ctx.lineWidth = 1.25;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private _getElementById(kind: string, id: string): any {
    const s = this.app.scene as any;
    switch (kind) {
      case "segment":    return s.getSegmentById?.(id);
      case "wall":       return s.getWallById?.(id);
      case "hatch":      return s.getHatchById?.(id);
      case "freeStroke": return s.getFreeStrokeById?.(id);
      case "dimension":  return s.getDimensionById?.(id);
      case "textbox":    return s.getTextBoxById?.(id);
      case "document":   return s.getDocumentById?.(id);
      case "sticker":    return s.getStickerInstanceById?.(id);
      default: return null;
    }
  }
}
