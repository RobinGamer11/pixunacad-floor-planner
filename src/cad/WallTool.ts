import { Defaults, SnapType } from "./constants";
import { Vec2, v, dist, sub, add, mul, norm, orthoSnapFromA, angleDeg, pointFromLengthAngle, dot, projectPointToInfiniteLine } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import { computeWallLines, type WallKind, type WallReferenceSide } from "./wallGeom";

export interface WallToolSettings {
  kind: WallKind;
  referenceSide: WallReferenceSide;
  thicknessOuterM: number;
  thicknessInnerM: number;
  /** Override – wenn gesetzt, hat Vorrang vor thicknessOuter/Inner. */
  thicknessOverrideM: number | null;
  customName: string;
  color: string;
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
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
  }

  cancel() {
    this.state = "idle";
    this.corners = [];
    this.snap = null;
  }

  /** Liefert die Bezugslinien-Priorität dieser Wand. */
  ownLineKind(): "main" | "sub" | "help" {
    if (this.settings.referenceSide === "outer") return "main";
    if (this.settings.referenceSide === "inner") return "sub";
    return "help";
  }

  /** Auto-ID AW01/AW02 / IW01/IW02 falls customName leer. Erzeugt Label-Group falls nötig. */
  private _resolveLabelId(): string {
    const customName = (this.settings.customName || "").trim();
    if (customName) {
      return this.app.labelManager.ensureGroupNamed(customName).id;
    }
    const prefix = this.settings.kind === "outer" ? "AW" : "IW";
    const used = new Set<string>();
    for (const w of this.app.scene.walls) {
      const g = this.app.labelManager.getById(w.labelId);
      if (g && g.name.startsWith(prefix)) used.add(g.name);
    }
    let n = 1;
    while (used.has(`${prefix}${String(n).padStart(2, "0")}`)) n++;
    const name = `${prefix}${String(n).padStart(2, "0")}`;
    return this.app.labelManager.ensureGroupNamed(name).id;
  }

  finish() {
    if (this.state === "drawing" && this.corners.length >= 2) {
      const labelId = this._resolveLabelId();
      this.app.scene.createWall({
        kind: this.settings.kind,
        thicknessM: this.getThickness(),
        referenceSide: this.settings.referenceSide,
        corners: this.corners,
        customName: this.settings.customName,
        color: this.settings.color,
        labelId,
      });
    }
    this.cancel();
  }

  isDrawing() { return this.state === "drawing"; }

  private _rawWorld(input: Input): Vec2 {
    return this.snap && this.snap.world ? v(this.snap.world.x, this.snap.world.y) : v(input.mouse.wx, input.mouse.wy);
  }

  private _previewWorld(input: Input): Vec2 {
    let p = this._rawWorld(input);
    if (this.state === "drawing" && this.corners.length > 0) {
      const base = this.corners[this.corners.length - 1];
      if (input.keys.shift) p = orthoSnapFromA(base, p);
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
        if (dist(last, p) >= Defaults.minSegLenM) this.corners.push(v(p.x, p.y));
      }
    }
  }

  /** Polylinie + drei Wandlinien als Preview. */
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
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.beginPath(); ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(77,163,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, Math.PI * 2); ctx.stroke();
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
