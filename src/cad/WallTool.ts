import { Defaults, SnapType } from "./constants";
import { Vec2, v, dist, sub, add, mul, norm, orthoSnapFromA, angleDeg, pointFromLengthAngle, dot, projectPointToInfiniteLine } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { computeWallLines, type WallKind, type WallReferenceSide } from "./wallGeom";
import { runWallTopologyMaintenance } from "./wallTopologyMaintenance";

export interface WallToolSettings {
  kind: WallKind;
  referenceSide: WallReferenceSide;
  thicknessOuterM: number;
  thicknessInnerM: number;
  /** Override – wenn gesetzt, hat Vorrang vor thicknessOuter/Inner. */
  thicknessOverrideM: number | null;
  customName: string;
  color: string;
  fillColor: string;
  /** Wenn true: fillColor folgt automatisch dem AW/IW-Default beim Wechsel. */
  fillColorAuto: boolean;
}

export class WallTool {
  app: CadApp;
  id = "wall";

  state: "idle" | "drawing" = "idle";
  corners: Vec2[] = [];
  snap: Snap | null = null;

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
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
    this.app.renderer.showWallHelpers = true;
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
  }

  cancel() {
    this.state = "idle";
    this.corners = [];
    this.snap = null;
    this.app.renderer.showWallHelpers = false;
  }

  /** Liefert die Bezugslinien-Priorität dieser Wand. */
  ownLineKind(): "main" | "sub" | "help" {
    if (this.settings.referenceSide === "outer") return "main";
    if (this.settings.referenceSide === "inner") return "sub";
    return "help";
  }

  /** Wenn customName gesetzt → eigene Layer. Sonst: aktive Default-Layer-ID. */
  private _resolveLabelId(): string {
    const customName = (this.settings.customName || "").trim();
    if (customName) {
      return this.app.labelManager.ensureGroupNamed(customName).id;
    }
    return this.app.activeDrawLabelId || Defaults.defaultLabelId;
  }

  /** Erzeugt eine einzelne Wand zwischen zwei Punkten (jeder Klick = neues Objekt). */
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

  finish() {
    this.cancel();
  }

  /**
   * Phase 3: Auto-Split (T-Stoß) + Auto-Merge (kollineare Geschwister) als
   * deterministische Topologie-Wartung. Wird auf die neu erzeugte Wand
   * fokussiert; Split-/Merge-Folgewellen laufen frei über alle Wände.
   */
  private _runConnectionPipeline(newWall: import("./Scene").Wall) {
    runWallTopologyMaintenance(this.app.scene, [newWall]);
  }

  isDrawing() { return this.state === "drawing"; }

  private _rawWorld(input: Input): Vec2 {
    return this.snap && this.snap.world ? v(this.snap.world.x, this.snap.world.y) : v(input.mouse.wx, input.mouse.wy);
  }

  private _previewWorld(input: Input): Vec2 {
    let p = this._rawWorld(input);
    if (this.state === "drawing" && this.corners.length > 0) {
      const base = this.corners[this.corners.length - 1];
      // Wand-Endpunkt-Snap (Punkt auf einer Wandlinie) hat Vorrang vor Shift-Ortho,
      // damit 90°-Anschlüsse an bestehenden Wänden trotzdem exakt verbinden.
      const isWallPointSnap = !!(this.snap && this.snap.wallId && this.snap.type === SnapType.POINT);
      if (input.keys.shift && !isWallPointSnap) p = orthoSnapFromA(base, p);
    }
    return p;
  }

  update(input: Input) {
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const baseSnap = this.app.topology.findBestSnap(mouseS, mouseW);
    this.snap = this._applyPrioritySnap(baseSnap, mouseS, mouseW);

    if (input.doubleClicked) { this.finish(); return; }
    if (input.clicked) {
      const p = this._previewWorld(input);
      if (this.state === "idle") {
        this.corners = [v(p.x, p.y)];
        this.state = "drawing";
      } else {
        const last = this.corners[this.corners.length - 1];
        if (dist(last, p) >= Defaults.minSegLenM) {
          // Jeder Klick = neues Wand-Objekt (analog Linienwerkzeug).
          this._createSingleWall(last, p);
          // Anschluss-Kette: nächster Startpunkt = aktueller Klickpunkt.
          this.corners = [v(p.x, p.y)];
        }
      }
    }
  }

  /**
   * Wenn der gefundene Snap auf einer Wandlinie liegt, deren Priorität nicht zu unserer
   * eigenen Bezugslinie passt, suche nach einem alternativen Wand-Snap mit passender
   * Priorität in der Nähe – nur dieser darf binden. So verbinden sich:
   *   main↔main, sub↔sub, help↔help.
   */
  private _applyPrioritySnap(snap: import("./TopologyEngine").Snap | null, mouseS: Vec2, mouseW: Vec2) {
    if (!snap) return snap;
    if (!snap.wallId) return snap;
    const want = this.ownLineKind();
    if (snap.wallLine === want) return snap;

    // Suche bestpassenden Wall-Snap mit gewünschter Linie
    let best: import("./TopologyEngine").Snap | null = null;
    let bestPx = Defaults.snapPx;
    for (const wall of this.app.scene.walls) {
      if (!this.app.labelManager.isVisible(wall.labelId)) continue;
      const lines = computeWallLines(wall.corners, wall.thicknessM, wall.referenceSide);
      const poly: Vec2[] = want === "main" ? lines.mainCorners : want === "sub" ? lines.subCorners : lines.helpCorners;
      // Punkte
      for (const p of poly) {
        const sp = this.app.camera.worldToScreen(p.x, p.y);
        const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
        if (px <= bestPx) {
          bestPx = px;
          best = { type: SnapType.POINT, world: v(p.x, p.y), segment: null, hatch: null, pointIndex: null, t: null, px, wallId: wall.id, wallLine: want };
        }
      }
      // Linien
      for (let i = 0; i < poly.length - 1; i++) {
        const a = poly[i], b = poly[i + 1];
        const ab = sub(b, a);
        const ap = sub(mouseW, a);
        const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-12;
        let t = (ap.x * ab.x + ap.y * ab.y) / ab2;
        if (t <= 0 || t >= 1) continue;
        const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
        const sp = this.app.camera.worldToScreen(q.x, q.y);
        const px = Math.hypot(sp.x - mouseS.x, sp.y - mouseS.y);
        if (px <= bestPx) {
          bestPx = px;
          best = { type: SnapType.LINE, world: q, segment: null, hatch: null, pointIndex: null, t, px, lineA: a, lineB: b, wallId: wall.id, wallLine: want };
        }
      }
    }
    return best || snap;
  }

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

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Snap-Cursor
    if (this.snap) {
      const s = cam.worldToScreen(this.snap.world.x, this.snap.world.y);
      drawSnapDot(ctx, s.x, s.y, { ring: true });
    }

    if (this.state !== "drawing" || this.corners.length === 0) return;

    const previewPt = this._previewWorld(this.app.input);
    const allCorners = [...this.corners, previewPt];

    // Wandlinien preview (live-gemeißelt)
    const lines = computeWallLines(allCorners, this.getThickness(), this.settings.referenceSide);

    // Sub (Help-Linie der Innenkante / Gegenkante) – etwas dezenter
    this._drawPolyline(ctx, cam, lines.subCorners, { color: this.settings.color, widthPx: 1.5 });
    // Help (Mittellinie) – gestrichelt
    this._drawPolyline(ctx, cam, lines.helpCorners, { color: "rgba(120,120,120,0.7)", widthPx: 1, dashed: true });
    // Hauptlinie – stark
    this._drawPolyline(ctx, cam, lines.mainCorners, { color: this.settings.color, widthPx: 2 });

    // Eckpunkte
    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    for (const c of this.corners) {
      const s = cam.worldToScreen(c.x, c.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
