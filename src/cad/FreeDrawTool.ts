import { Defaults } from "./constants";
import { Vec2, v, dist } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { FreeLineStyle } from "./Scene";
import { dedupePoints, projectPointToInfiniteLineFromTwoPoints, autoShapePoints } from "./freeGeom";
import { RulerDragController } from "./rulerInteraction";

/**
 * Freihand-Zeichenwerkzeug (Hotkey: F).
 * Mausdruck → sammelt Punkte → loslassen erzeugt FreeStroke in der aktiven Scene.
 * Wenn rulerGuide gesetzt ist, werden alle Punkte auf die Lineal-Linie projiziert.
 */
export class FreeDrawTool {
  app: CadApp;
  id = "free";

  private _drawing = false;
  private _points: Vec2[] = [];
  private _lastSamplePx: { x: number; y: number } | null = null;
  private _rulerDrag!: RulerDragController;

  constructor(app: CadApp) {
    this.app = app;
    this._rulerDrag = new RulerDragController(app);
  }

  activate() {
    this._drawing = false;
    this._points = [];
    this._lastSamplePx = null;
    this._rulerDrag.reset();
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this._drawing = false;
    this._points = [];
    this._lastSamplePx = null;
  }

  finish() { this.cancel(); }

  getCursor() {
    const c = this._rulerDrag.hoverCursor(this.app.input);
    return c || "crosshair";
  }

  update(input: Input) {
    // Ruler-Manipulation hat Vorrang vor dem Zeichnen.
    if (this._rulerDrag.update(input)) {
      // Sicherheit: laufendes Drawing abbrechen
      if (this._drawing) { this._drawing = false; this._points = []; this._lastSamplePx = null; }
      return;
    }
    const ruler = this.app.scene.rulerGuide;
    const rawW = v(input.mouse.wx, input.mouse.wy);
    const projW = ruler ? projectPointToInfiniteLineFromTwoPoints(rawW, ruler.a, ruler.b) : rawW;

    if (!this._drawing && input.mouse.left && input.clicked) {
      this._drawing = true;
      this._points = [v(projW.x, projW.y)];
      this._lastSamplePx = { x: input.mouse.sx, y: input.mouse.sy };
      return;
    }

    if (this._drawing) {
      // Sample bei genügend Pixel-Abstand
      const minPx = Defaults.freeSampleMinPx;
      if (!this._lastSamplePx ||
          Math.hypot(input.mouse.sx - this._lastSamplePx.x, input.mouse.sy - this._lastSamplePx.y) >= minPx) {
        this._points.push(v(projW.x, projW.y));
        this._lastSamplePx = { x: input.mouse.sx, y: input.mouse.sy };
      }
      if (!input.mouse.left) {
        // Commit
        const pts = dedupePoints(this._points);
        this._drawing = false;
        this._points = [];
        this._lastSamplePx = null;
        if (pts.length >= 2 && this._pathLength(pts) > 1e-4) {
          this.app.scene.createFreeStroke(pts, this._currentStyle());
          this.app.refreshLabelUI?.();
        }
      }
    }
  }

  private _pathLength(pts: Vec2[]): number {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    return L;
  }

  private _currentStyle() {
    return {
      color: this.app.defaultFreeColor,
      thicknessM: this.app.defaultFreeThicknessM,
      opacity: this.app.defaultFreeOpacity,
      lineStyle: this.app.defaultFreeLineStyle as FreeLineStyle,
      gapM: this.app.defaultFreeGapM,
      blobSpacingM: Defaults.freeBlobSpacingM,
      blobSizeM: Defaults.freeBlobSizeM,
      smoothing: Defaults.freeSmooth,
      imageSrc: this.app.defaultFreeImageSrc,
      imageSizeM: this.app.defaultFreeImageSizeM,
      imageSpacingM: this.app.defaultFreeImageSpacingM,
      imageRotateAlongPath: this.app.defaultFreeImageRotate,
      labelId: this.app.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, _cam: any) {
    if (this._drawing && this._points.length >= 2) {
      const style = this._currentStyle();
      this.app.renderer.drawFreeStrokePreview(this._points, style);
    }
  }
}
