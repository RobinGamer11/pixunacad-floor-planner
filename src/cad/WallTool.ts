import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType } from "./constants";
import { Vec2, v, dist, sub, add, mul, norm, orthoSnapFromA, angleDeg, pointFromLengthAngle, dot, projectPointToInfiniteLine } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { computeWallLines, type WallKind, type WallReferenceSide } from "./wallGeom";
import { runWallTopologyMaintenance } from "./wallTopologyMaintenance";
import { trimWallEndpointsToNeighbors } from "./wallConnect";

export type WallInputMode = "single" | "chain";

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
  /** "chain" = Polywand (jeder Klick verlängert), "single" = Klick-Klick einzeln. */
  inputMode: WallInputMode;
}

export class WallTool {
  app: CadApp;
  id = "wall";

  state: "idle" | "drawing" = "idle";
  corners: Vec2[] = [];
  snap: Snap | null = null;
  /** Edge-Detection für Spacebar (Bezugsseite cyclen). */
  private _prevSpace = false;

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
   * Auto-Trim der Endpunkte an Nachbar-Bezugslinien + deterministische
   * Topologie-Wartung (Auto-Split / Auto-Merge).
   */
  private _runConnectionPipeline(newWall: import("./Scene").Wall) {
    trimWallEndpointsToNeighbors(this.app.scene, newWall);
    runWallTopologyMaintenance(this.app.scene, [newWall]);
  }

  /** Cycle: outer → center → inner → outer (Leertaste während Zeichnen). */
  cycleReferenceSide() {
    const order: WallReferenceSide[] = ["outer", "center", "inner"];
    const i = order.indexOf(this.settings.referenceSide);
    this.settings.referenceSide = order[(i + 1) % order.length];
    this.app.refreshLabelUI?.();
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

    // Edge-Detection: Leertaste cyclet Bezugsseite (auch außerhalb von "drawing"
    // nutzbar, damit User die Seite vor dem ersten Klick wechseln kann).
    if (input.keys.space && !this._prevSpace) {
      this.cycleReferenceSide();
    }
    this._prevSpace = input.keys.space;

    if (input.doubleClicked) { this.finish(); return; }
    if (input.clicked) {
      const p = this._previewWorld(input);
      if (this.state === "idle") {
        this.corners = [v(p.x, p.y)];
        this.state = "drawing";
      } else {
        const last = this.corners[this.corners.length - 1];
        if (dist(last, p) >= Defaults.minSegLenM) {
          this._createSingleWall(last, p);
          if (this.settings.inputMode === "chain") {
            // Polywand: nächster Startpunkt = aktueller Klickpunkt.
            this.corners = [v(p.x, p.y)];
          } else {
            // Einzeln: nach jeder Wand zurück in idle.
            this.state = "idle";
            this.corners = [];
          }
        }
      }
    }
  }

  /**
   * Topologie-Reform: Wand-Anschlüsse entstehen ausschließlich über die
   * Bezugslinie (wall.corners). Es gibt deshalb keine Prioritätssuche zwischen
   * main/sub/help-Snaps mehr — der von der TopologyEngine gelieferte Snap
   * gilt unverändert.
   */
  private _applyPrioritySnap(snap: import("./TopologyEngine").Snap | null, _mouseS: Vec2, _mouseW: Vec2) {
    return snap;
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
    // Snap-Cursor + kleines Label mit aktiver Bezugsseite (Außen/Mitte/Innen)
    if (this.snap) {
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
