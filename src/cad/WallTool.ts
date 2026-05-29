import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType } from "./constants";
import {
  Vec2, v, dist, sub, add, mul, norm, dot,
  orthoSnapFromA, angleDeg, pointFromLengthAngle,
  nearestAngleToReference, lineLineIntersectionInfinite, projectPointToInfiniteLine,
} from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { computeWallLines, type WallKind, type WallReferenceSide } from "./wallGeom";
import { computeHealedWallLines } from "./wallHeal";
import { WallTopologyGraph } from "./WallTopologyGraph";
import { Wall } from "./Scene";
import { runWallTopologyMaintenance } from "./wallTopologyMaintenance";
import { trimWallEndpointsToNeighbors } from "./wallConnect";

export type WallInputMode = "single" | "chain";

export interface WallToolSettings {
  kind: WallKind;
  referenceSide: WallReferenceSide;
  thicknessOuterM: number;
  thicknessInnerM: number;
  thicknessOverrideM: number | null;
  customName: string;
  color: string;
  fillColor: string;
  fillColorAuto: boolean;
  inputMode: WallInputMode;
}

interface GuideAnchor {
  key: string;
  segmentId?: string;
  hatchId?: string;
  wallId?: string;
  pointIndex: number;
  point: Vec2;
}

interface ParallelGuide {
  key: string;
  segmentId?: string;
  hatchId?: string;
  wallId?: string;
  edgeIndex?: number;
}

interface GuideDef {
  point: Vec2;
  dir: Vec2;
}

export class WallTool {
  app: CadApp;
  id = "wall";

  state: "idle" | "drawing" = "idle";
  corners: Vec2[] = [];
  snap: Snap | null = null;
  private _prevSpace = false;

  // Hub (Length / Angle) lock — identisch zum Linienwerkzeug.
  hubLocked = false;
  hubLengthM: number | null = null;
  hubAngleDeg: number | null = null;

  // Hilfslinien-Anker (Rechtsklick auf Eckpunkt) + Parallel-Hilfslinien
  // (Rechtsklick auf eine Linie/Kante).
  guideAnchors: GuideAnchor[] = [];
  parallelGuideSegments: ParallelGuide[] = [];

  // Space+Shift lockt den aktuellen relativen Winkel.
  spaceShiftLocked = false;
  spaceShiftLockedAngleDeg: number | null = null;

  // Referenz-Anker für Space-Ortho (Bezug zur zuletzt aktiv hervorgehobenen Linie).
  startReferenceKey: string | null = null;
  activeTargetKey: string | null = null;

  settings: WallToolSettings = {
    kind: "outer",
    referenceSide: "outer",
    thicknessOuterM: 0.30,
    thicknessInnerM: 0.115,
    thicknessOverrideM: null,
    customName: "",
    color: Defaults.lineColor,
    fillColor: Defaults.wallFillColorOuter,
    fillColorAuto: true,
    inputMode: "chain",
  };

  constructor(app: CadApp) {
    this.app = app;
  }

  getThickness(): number {
    if (this.settings.thicknessOverrideM != null && this.settings.thicknessOverrideM > 0) {
      return this.settings.thicknessOverrideM;
    }
    return this.settings.kind === "outer" ? this.settings.thicknessOuterM : this.settings.thicknessInnerM;
  }

  activate() {
    this.state = "idle";
    this.corners = [];
    this.snap = null;
    this.resetGuides();
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.spaceShiftLocked = false;
    this.spaceShiftLockedAngleDeg = null;
    this.startReferenceKey = null;
    this.activeTargetKey = null;
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
    this.app.renderer.showWallHelpers = true;
    this.app.topology.includeWallOffsetSnaps = true;

    this.app.topology.activeDrawingWallKind = this.settings.kind;
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
  }

  cancel() {
    this.state = "idle";
    this.corners = [];
    this.snap = null;
    this.resetGuides();
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
    this.spaceShiftLocked = false;
    this.spaceShiftLockedAngleDeg = null;
    this.app.renderer.showWallHelpers = false;
    // includeWallOffsetSnaps bleibt global aktiv (Sub-/Gehrungs-Snaps auch in anderen Werkzeugen).

    this.app.topology.activeDrawingWallKind = null;
    this.app.hub.hide();
  }

  finish() { this.cancel(); }
  resetGuides() { this.guideAnchors = []; this.parallelGuideSegments = []; }
  isDrawing() { return this.state === "drawing"; }

  ownLineKind(): "main" | "sub" | "help" {
    if (this.settings.referenceSide === "outer") return "main";
    if (this.settings.referenceSide === "inner") return "sub";
    return "help";
  }

  private _resolveLabelId(): string {
    const customName = (this.settings.customName || "").trim();
    if (customName) {
      return this.app.labelManager.ensureGroupNamed(customName).id;
    }
    return this.app.activeDrawLabelId || Defaults.defaultLabelId;
  }

  private _createSingleWall(a: Vec2, b: Vec2) {
    const labelId = this._resolveLabelId();
    const newWall = this.app.scene.createWall({
      kind: this.settings.kind,
      thicknessM: this.getThickness(),
      referenceSide: this.settings.referenceSide,
      corners: [v(a.x, a.y), v(b.x, b.y)],
      customName: this.settings.customName,
      color: this.settings.color,
      fillColor: this.settings.fillColor,
      labelId,
    });
    this._runConnectionPipeline(newWall);
    this.app.refreshLabelUI?.();
    return newWall;
  }

  private _runConnectionPipeline(newWall: import("./Scene").Wall) {
    trimWallEndpointsToNeighbors(this.app.scene, newWall);
    runWallTopologyMaintenance(this.app.scene, [newWall]);
  }

  cycleReferenceSide() {
    const order: WallReferenceSide[] = ["outer", "center", "inner"];
    const i = order.indexOf(this.settings.referenceSide);
    this.settings.referenceSide = order[(i + 1) % order.length];
    this.app.refreshLabelUI?.();
  }

  /* ===== Hilfslinien / Parallel-Anker ===== */

  private _toggleGuideAnchorFromSnap(snap: Snap) {
    if (!snap || snap.type !== SnapType.POINT || snap.pointIndex == null) return;
    if (snap.wallId) {
      const key = `wall_${snap.wallId}__${snap.pointIndex}`;
      const idx = this.guideAnchors.findIndex(a => a.key === key);
      if (idx >= 0) { this.guideAnchors.splice(idx, 1); return; }
      this.guideAnchors.push({ key, wallId: snap.wallId, pointIndex: snap.pointIndex, point: v(snap.world.x, snap.world.y) });
      return;
    }
    if (snap.segment) {
      const key = `seg_${snap.segment.id}__${snap.pointIndex}`;
      const idx = this.guideAnchors.findIndex(a => a.key === key);
      if (idx >= 0) { this.guideAnchors.splice(idx, 1); return; }
      this.guideAnchors.push({ key, segmentId: snap.segment.id, pointIndex: snap.pointIndex, point: v(snap.world.x, snap.world.y) });
      return;
    }
    if (snap.hatch) {
      const key = `hatch_${snap.hatch.id}__${snap.pointIndex}`;
      const idx = this.guideAnchors.findIndex(a => a.key === key);
      if (idx >= 0) { this.guideAnchors.splice(idx, 1); return; }
      this.guideAnchors.push({ key, hatchId: snap.hatch.id, pointIndex: snap.pointIndex, point: v(snap.world.x, snap.world.y) });
    }
  }

  private _toggleParallelGuideFromSnap(snap: Snap) {
    if (!snap || snap.type !== SnapType.LINE) return;
    if (snap.wallId && snap.edgeIndex != null) {
      const key = `pwall_${snap.wallId}_${snap.edgeIndex}`;
      const idx = this.parallelGuideSegments.findIndex(g => g.key === key);
      if (idx >= 0) { this.parallelGuideSegments.splice(idx, 1); return; }
      this.parallelGuideSegments.push({ key, wallId: snap.wallId, edgeIndex: snap.edgeIndex });
      return;
    }
    if (snap.segment) {
      const key = `pseg_${snap.segment.id}`;
      const idx = this.parallelGuideSegments.findIndex(g => g.key === key);
      if (idx >= 0) { this.parallelGuideSegments.splice(idx, 1); return; }
      this.parallelGuideSegments.push({ key, segmentId: snap.segment.id });
      return;
    }
    if (snap.hatch && snap.edgeIndex != null) {
      const key = `phatch_${snap.hatch.id}_${snap.edgeIndex}`;
      const idx = this.parallelGuideSegments.findIndex(g => g.key === key);
      if (idx >= 0) { this.parallelGuideSegments.splice(idx, 1); return; }
      this.parallelGuideSegments.push({ key, hatchId: snap.hatch.id, edgeIndex: snap.edgeIndex });
    }
  }

  /** Liefert die Richtung der zuletzt aktiv hervorgehobenen Linie als Referenz für Space-Ortho. */
  private _getReferenceDir(): Vec2 | null {
    const fromSnap = this.snap;
    if (fromSnap) {
      if (fromSnap.segment) return norm(sub(fromSnap.segment.b, fromSnap.segment.a));
      if (fromSnap.wallId && fromSnap.edgeIndex != null) {
        const wall = this.app.scene.getWallById(fromSnap.wallId);
        if (wall && wall.corners.length > fromSnap.edgeIndex + 1) {
          return norm(sub(wall.corners[fromSnap.edgeIndex + 1], wall.corners[fromSnap.edgeIndex]));
        }
      }
    }
    return null;
  }

  private _buildGuideDefinitions(): GuideDef[] {
    const defs: GuideDef[] = [];
    const refDir = this._getReferenceDir();
    const refPerp = refDir ? v(-refDir.y, refDir.x) : null;

    for (const a of this.guideAnchors) {
      defs.push({ point: a.point, dir: v(1, 0) });
      defs.push({ point: a.point, dir: v(0, 1) });
      if (refDir) defs.push({ point: a.point, dir: refDir });
      if (refPerp) defs.push({ point: a.point, dir: refPerp });
    }

    const last = this.corners.length > 0 ? this.corners[this.corners.length - 1] : null;
    if (last) {
      for (const item of this.parallelGuideSegments) {
        let dir: Vec2 | null = null;
        if (item.segmentId) {
          const seg = this.app.scene.getSegmentById(item.segmentId);
          if (seg) dir = norm(sub(seg.b, seg.a));
        } else if (item.wallId && item.edgeIndex != null) {
          const wall = this.app.scene.getWallById(item.wallId);
          if (wall && wall.corners.length > item.edgeIndex + 1) {
            dir = norm(sub(wall.corners[item.edgeIndex + 1], wall.corners[item.edgeIndex]));
          }
        } else if (item.hatchId && item.edgeIndex != null) {
          const hatch = this.app.scene.getHatchById(item.hatchId);
          if (hatch && hatch.points.length > 0) {
            const a = hatch.points[item.edgeIndex % hatch.points.length];
            const b = hatch.points[(item.edgeIndex + 1) % hatch.points.length];
            dir = norm(sub(b, a));
          }
        }
        if (dir) defs.push({ point: v(last.x, last.y), dir });
      }
    }
    return defs;
  }

  private _buildGuideIntersections(defs: GuideDef[]): Vec2[] {
    const out: Vec2[] = [];
    for (let i = 0; i < defs.length; i++) {
      for (let j = i + 1; j < defs.length; j++) {
        const ip = lineLineIntersectionInfinite(defs[i].point, defs[i].dir, defs[j].point, defs[j].dir);
        if (!ip) continue;
        let dup = false;
        for (const p of out) { if (dist(p, ip) <= 1e-6) { dup = true; break; } }
        if (!dup) out.push(ip);
      }
    }
    return out;
  }

  private _getGuideRenderSegment(point: Vec2, dir: Vec2) {
    const cam = this.app.camera;
    const span = (Math.hypot(this.app.renderer.vw, this.app.renderer.vh) / cam.scale) * 1.5;
    const d = norm(dir);
    return { a: sub(point, mul(d, span)), b: add(point, mul(d, span)) };
  }

  private _findGuideIntersectionSnap(mouseS: Vec2): Snap | null {
    const defs = this._buildGuideDefinitions();
    const ints = this._buildGuideIntersections(defs);
    let best: Snap | null = null;
    let bestPx = Infinity;
    for (const p of ints) {
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
          lineA: seg.a, lineB: seg.b, guidePoint: def.point, guideDir: def.dir,
        };
      }
    }
    return best;
  }

  private _findWallToolSnap(input: Input): Snap | null {
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);

    const baseSnap = this.app.topology.findBestSnap(mouseS, mouseW);
    const guideSnap = this._findGuideSnap(mouseS, mouseW);

    if (guideSnap && guideSnap.type === SnapType.GUIDE_POINT) return guideSnap;
    if (baseSnap && baseSnap.type === SnapType.POINT) return baseSnap;
    if (guideSnap) return guideSnap;
    return baseSnap;
  }

  /* ===== Relative Constraints (Shift = Ortho, Space = Ref-Ortho, Space+Shift = Lock) ===== */

  private _angleFromSpaceRules(basePoint: Vec2, rawPoint: Vec2): number {
    const currentAngle = angleDeg(basePoint, rawPoint);
    const refDir = this._getReferenceDir();
    if (refDir) {
      const base = (Math.atan2(refDir.y, refDir.x) * 180) / Math.PI;
      const options = [
        ((base) % 360 + 360) % 360,
        ((base + 180) % 360 + 360) % 360,
        ((base + 90) % 360 + 360) % 360,
        ((base + 270) % 360 + 360) % 360,
      ];
      return nearestAngleToReference(options, currentAngle);
    }
    const o = orthoSnapFromA(basePoint, rawPoint);
    return angleDeg(basePoint, o);
  }

  private _syncSpaceShiftLock(input: Input) {
    const last = this.corners.length > 0 ? this.corners[this.corners.length - 1] : null;
    const comboNow = this.state === "drawing" && !!last && input.keys.space && input.keys.shift;
    if (comboNow && !this.spaceShiftLocked) {
      const raw = this._rawWorld(input);
      this.spaceShiftLockedAngleDeg = this._angleFromSpaceRules(last!, raw);
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
      const refDir = this._getReferenceDir();
      if (refDir) {
        const base = (Math.atan2(refDir.y, refDir.x) * 180) / Math.PI;
        const options = [
          ((base) % 360 + 360) % 360,
          ((base + 180) % 360 + 360) % 360,
          ((base + 90) % 360 + 360) % 360,
          ((base + 270) % 360 + 360) % 360,
        ];
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

  /* ===== Preview / Commit ===== */

  private _rawWorld(input: Input): Vec2 {
    return this.snap && this.snap.world ? v(this.snap.world.x, this.snap.world.y) : v(input.mouse.wx, input.mouse.wy);
  }

  private _previewWorld(input: Input): Vec2 {
    if (this.state !== "drawing" || this.corners.length === 0) return this._rawWorld(input);
    const base = this.corners[this.corners.length - 1];
    if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
      return pointFromLengthAngle(base, this.hubLengthM, this.hubAngleDeg);
    }
    let p = this._rawWorld(input);
    // Wand-Endpunkt-Snap (auf einer Wandlinie) hat Vorrang vor Shift-Ortho,
    // damit 90°-Anschlüsse an bestehenden Wänden exakt verbinden.
    const isWallPointSnap = !!(this.snap && this.snap.wallId && this.snap.type === SnapType.POINT);
    if (isWallPointSnap) return p;
    p = this._applyRelativeConstraint(base, p, input);
    return p;
  }

  private _previewMetrics(input: Input) {
    if (this.state !== "drawing" || this.corners.length === 0) return { lengthM: 0, angleDeg: 0 };
    const base = this.corners[this.corners.length - 1];
    const b = this._previewWorld(input);
    return { lengthM: dist(base, b), angleDeg: angleDeg(base, b) };
  }

  private _commitPoint(input: Input): Vec2 {
    if (this.state === "drawing" && this.corners.length > 0) {
      const base = this.corners[this.corners.length - 1];
      if (this.hubLocked && this.hubLengthM != null && this.hubAngleDeg != null) {
        return pointFromLengthAngle(base, this.hubLengthM, this.hubAngleDeg);
      }
      let p = this._rawWorld(input);
      const isWallPointSnap = !!(this.snap && this.snap.wallId && this.snap.type === SnapType.POINT);
      if (isWallPointSnap) return p;
      const constrained = input.keys.space || input.keys.shift;
      p = this._applyRelativeConstraint(base, p, input);
      if (constrained) return v(p.x, p.y);
      return this.app.topology.resolveSnapPoint(this.snap, p);
    }
    const start = this._rawWorld(input);
    return this.app.topology.resolveSnapPoint(this.snap, start);
  }

  private _openHubWithCurrentPreview() {
    if (this.state !== "drawing" || this.corners.length === 0) return;
    const m = this._previewMetrics(this.app.input);
    this.hubLocked = true;
    this.hubLengthM = m.lengthM;
    this.hubAngleDeg = m.angleDeg;
    this.app.hub.showAt(this.app.input.mouse.sx, this.app.input.mouse.sy);
    this.app.hub.updateDisplay(this.hubLengthM, this.hubAngleDeg);
    this.app.hub.setValues(this.hubLengthM, this.hubAngleDeg);
    this.app.hub.enterEditMode();
  }

  private _applyHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.state !== "drawing" || this.corners.length === 0) return;
    const nextLen = (vals.lengthM != null) ? Math.max(0, vals.lengthM) : this.hubLengthM;
    const nextAng = (vals.angleDeg != null) ? vals.angleDeg : this.hubAngleDeg;
    this.hubLengthM = nextLen;
    this.hubAngleDeg = ((nextAng! % 360) + 360) % 360;
    this.hubLocked = true;
    this.app.hub.setValues(this.hubLengthM!, this.hubAngleDeg);
    this.app.hub.updateDisplay(this.hubLengthM!, this.hubAngleDeg);
  }

  onTabRequest(): boolean {
    if (this.state !== "drawing") return false;
    this._openHubWithCurrentPreview();
    return true;
  }

  /* ===== Update / Click ===== */

  update(input: Input) {
    this.app.topology.activeDrawingWallKind = this.settings.kind;
    this.snap = this._findWallToolSnap(input);
    this._syncSpaceShiftLock(input);

    // Bezugsseite cyclen mit Leertaste — NUR im Idle (während Zeichnen wirkt Space
    // als Ortho-Bezug analog Linienwerkzeug).
    if (input.keys.space && !this._prevSpace && this.state === "idle") {
      this.cycleReferenceSide();
    }
    this._prevSpace = input.keys.space;

    // Rechtsklick: Hilfslinien-Anker / Parallel-Guides togglen — analog Linienwerkzeug.
    if (input.rightClicked) {
      if (this.snap && this.snap.type === SnapType.POINT) { this._toggleGuideAnchorFromSnap(this.snap); return; }
      if (this.snap && this.snap.type === SnapType.LINE) { this._toggleParallelGuideFromSnap(this.snap); return; }
    }

    // Längen-/Winkel-HUD während des Zeichnens.
    if (this.state === "drawing") {
      const m = this._previewMetrics(input);
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(m.lengthM, m.angleDeg);
    } else {
      this.app.hub.hide();
    }

    if (input.doubleClicked) { this.finish(); return; }
    if (input.clicked) this._onClick(input);
  }

  private _onClick(input: Input) {
    const p = this._commitPoint(input);
    if (this.state === "idle") {
      this.corners = [v(p.x, p.y)];
      this.state = "drawing";
      this.hubLocked = false;
      this.hubLengthM = null;
      this.hubAngleDeg = null;
      return;
    }
    const last = this.corners[this.corners.length - 1];
    if (dist(last, p) < Defaults.minSegLenM) return;
    this._createSingleWall(last, p);
    if (this.settings.inputMode === "chain") {
      this.corners = [v(p.x, p.y)];
    } else {
      this.state = "idle";
      this.corners = [];
    }
    this.hubLocked = false;
    this.hubLengthM = null;
    this.hubAngleDeg = null;
  }

  /* ===== Overlay-Render ===== */

  private _applyPrioritySnap(snap: Snap | null) { return snap; }

  private _drawPolyline(ctx: CanvasRenderingContext2D, cam: any, pts: Vec2[], style: { color: string; widthPx: number; dashed?: boolean }) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.widthPx;
    if (style.dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    const a0 = cam.worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(a0.x, a0.y);
    for (let i = 1; i < pts.length; i++) {
      const s = cam.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
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

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    this._drawGuideDefinitions(ctx, cam);

    // Snap-Cursor + Snap-Linie (für LINE/GUIDE)
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
      const sideLabel = this.settings.referenceSide === "outer"
        ? "Außen" : this.settings.referenceSide === "inner" ? "Innen" : "Mitte";
      ctx.save();
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "rgba(20,20,20,0.85)";
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 3;
      const tx = s.x + 10, ty = s.y - 10;
      ctx.strokeText(sideLabel, tx, ty);
      ctx.fillText(sideLabel, tx, ty);
      ctx.restore();
    }

    if (this.state !== "drawing" || this.corners.length === 0) return;

    const previewPt = this._previewWorld(this.app.input);
    const allCorners = [...this.corners, previewPt];

    const previewLabelId = this._resolveLabelId();
    const previewThickness = this.getThickness();
    const previewWall = new Wall({
      id: "__wallToolPreview__",
      kind: this.settings.kind,
      thicknessM: previewThickness,
      referenceSide: this.settings.referenceSide,
      corners: allCorners,
      labelId: previewLabelId,
      color: this.settings.color,
      fillColor: this.settings.fillColor,
    });
    const others = this.app.scene.walls.filter(
      w => w.labelId === previewLabelId && w.id !== previewWall.id && w.corners.length >= 2,
    );
    let lines: ReturnType<typeof computeWallLines>;
    if (others.length > 0) {
      const graph = new WallTopologyGraph();
      graph.build([...others, previewWall]);
      lines = computeHealedWallLines(previewWall, others, graph);
    } else {
      lines = computeWallLines(allCorners, previewThickness, this.settings.referenceSide);
    }

    // Sub-/Help-Linie immer aus dem rohen Offset zeichnen — unabhängig von
    // der gehealten Bezugslinie, damit sie nur die tatsächliche Wandlänge
    // zur Orientierung anzeigen (kein automatisches Verlängern).
    const rawLines = computeWallLines(allCorners, previewThickness, this.settings.referenceSide);
    this._drawPolyline(ctx, cam, rawLines.subCorners, { color: this.settings.color, widthPx: 1.5 });
    this._drawPolyline(ctx, cam, rawLines.helpCorners, { color: "rgba(120,120,120,0.7)", widthPx: 1, dashed: true });
    this._drawPolyline(ctx, cam, lines.mainCorners, { color: this.settings.color, widthPx: 2 });

    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    for (const c of this.corners) {
      const s = cam.worldToScreen(c.x, c.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
