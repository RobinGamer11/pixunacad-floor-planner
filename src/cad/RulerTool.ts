import { v } from "./geometry";
import type { Input } from "./Input";
import { RulerDragController } from "./rulerInteraction";
import { drawSnapDot } from "./snapDraw";
import {
  DEFAULT_RULER_SIDE, DEFAULT_RULER_UNIT, constrainRulerAngle, metersToUnit,
  rulerSideOf, rulerUnitOf, snapRulerPoint, unitToMeters,
  type RulerSide, type RulerUnit,
} from "./rulerModel";

/**
 * Eigenständiges Lineal-Werkzeug.
 *
 * Bedienung (identisch in CAD-Oberfläche und Projektmappe):
 *   1. L-Klick setzt den Anfangspunkt
 *   2. L-Klick setzt den Endpunkt
 *   3. danach: Körper ziehen = verschieben, Endpunkte ziehen = drehen/skalieren
 *
 * Die Strecke a→b ist immer die Zeichenkante. Alle Längen liegen intern in
 * Metern vor; die Anzeigeeinheit (mm/cm/m) gehört zum Lineal selbst.
 * Fangpunkte kommen aus der vorhandenen TopologyEngine, Hilfslinien per
 * Rechtsklick aus dem vorhandenen GlobalGuides-System.
 */
export class RulerTool {
  app: any;
  id = "ruler";

  /** "start" = Anfangspunkt fehlt, "end" = Endpunkt wird gesetzt, "ready" = fertig. */
  phase: "start" | "end" | "ready" = "start";

  private _anchor: { x: number; y: number } | null = null;
  private _drag: RulerDragController;
  private _snapScreen: { x: number; y: number } | null = null;

  /** Voreinstellungen für das nächste Lineal. */
  defaultSide: RulerSide = DEFAULT_RULER_SIDE;
  defaultUnit: RulerUnit = DEFAULT_RULER_UNIT;

  constructor(app: any) {
    this.app = app;
    this._drag = new RulerDragController(app, { handlesOnly: false, snap: true });
  }

  activate() {
    this._drag.reset();
    this._anchor = null;
    this._snapScreen = null;
    this.phase = this.app?.scene?.rulerGuide ? "ready" : "start";
    this.app?.hub?.hide?.();
    this.app?.pointEditMenu?.hide?.();
    if (this.app?.renderer) {
      this.app.renderer.overlay = { draw: (ctx: CanvasRenderingContext2D) => this._drawOverlay(ctx) };
    }
  }

  cancel() {
    this._drag.reset();
    if (this.phase === "end") {
      this.app.scene.rulerGuide = null;
      this.phase = "start";
    }
    this._anchor = null;
    this._snapScreen = null;
  }

  finish() { this.cancel(); }

  isDrawing() { return this.phase === "end"; }

  getCursor() {
    if (this.phase !== "ready") return "crosshair";
    return this._drag.hoverCursor(this.app.input) || "default";
  }

  /** Aktuelle Länge in Metern (0, wenn kein Lineal existiert). */
  getLengthM(): number {
    const g = this.app?.scene?.rulerGuide;
    if (!g) return 0;
    return Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
  }

  /** Länge in Metern setzen — Anfangspunkt und Richtung bleiben erhalten. */
  setLengthM(m: number) {
    const g = this.app?.scene?.rulerGuide;
    if (!g) return;
    const target = Math.max(0.0005, m);
    let dx = g.b.x - g.a.x, dy = g.b.y - g.a.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-9) { dx = 1; dy = 0; len = 1; }
    g.b = v(g.a.x + (dx / len) * target, g.a.y + (dy / len) * target);
    this.app?.requestRender?.();
  }

  /** Länge in der aktuell gewählten Anzeigeeinheit. */
  getLengthInUnit(): number { return metersToUnit(this.getLengthM(), this.getUnit()); }
  setLengthInUnit(value: number) { this.setLengthM(unitToMeters(value, this.getUnit())); }

  getSide(): RulerSide {
    const g = this.app?.scene?.rulerGuide;
    return g ? rulerSideOf(g) : this.defaultSide;
  }

  setSide(side: RulerSide) {
    this.defaultSide = side;
    const g = this.app?.scene?.rulerGuide;
    // Die Zeichenkante a→b bleibt exakt an derselben Stelle; nur der
    // halbtransparente Körper wird beim Zeichnen versetzt dargestellt.
    if (g) g.side = side;
    this.app?.requestRender?.();
  }

  getUnit(): RulerUnit {
    const g = this.app?.scene?.rulerGuide;
    return g ? rulerUnitOf(g) : this.defaultUnit;
  }

  setUnit(unit: RulerUnit) {
    this.defaultUnit = unit;
    const g = this.app?.scene?.rulerGuide;
    if (g) g.unit = unit;
    this.app?.requestRender?.();
  }

  /** Lineal entfernen. */
  remove() {
    if (!this.app?.scene) return;
    this.app.scene.rulerGuide = null;
    this.phase = "start";
    this._anchor = null;
    this.app?.requestRender?.();
  }

  hasRuler() { return !!this.app?.scene?.rulerGuide; }

  private _drawOverlay(ctx: CanvasRenderingContext2D) {
    if (!this._snapScreen) return;
    drawSnapDot(ctx, this._snapScreen.x, this._snapScreen.y, { ring: true });
  }

  update(input: Input) {
    const scene = this.app?.scene;
    if (!scene) return;

    if (this.phase === "ready") {
      if (!scene.rulerGuide) { this.phase = "start"; return; }
      this._drag.update(input);
      this._snapScreen = this._drag.lastSnapScreen;
      return;
    }

    const snap = snapRulerPoint(this.app, input);
    let w = v(snap.x, snap.y);
    this._snapScreen = snap.snapped
      ? this.app.camera.worldToScreen(snap.x, snap.y)
      : null;
    // Shift hält 0/45/90/135/180 … Grad.
    if (this.phase === "end" && this._anchor && input.keys?.shift) {
      const c = constrainRulerAngle(this._anchor, w);
      w = v(c.x, c.y);
      this._snapScreen = null;
    }

    if (this.phase === "start") {
      if (input.mouse.left && input.clicked) {
        this._anchor = { x: w.x, y: w.y };
        scene.rulerGuide = {
          a: v(w.x, w.y), b: v(w.x, w.y),
          side: this.defaultSide, unit: this.defaultUnit,
        };
        this.phase = "end";
      }
      return;
    }

    // phase === "end": Vorschau folgt der Maus, zweiter Klick schließt ab.
    if (this._anchor) {
      scene.rulerGuide = {
        a: v(this._anchor.x, this._anchor.y), b: v(w.x, w.y),
        side: this.defaultSide, unit: this.defaultUnit,
      };
      const lenM = Math.hypot(w.x - this._anchor.x, w.y - this._anchor.y);
      const angleDeg = Math.atan2(-(w.y - this._anchor.y), w.x - this._anchor.x) * 180 / Math.PI;
      try {
        this.app.hub?.showAt?.(input.mouse.sx, input.mouse.sy);
        this.app.hub?.updateDisplay?.(lenM, angleDeg);
      } catch { /* Hub optional */ }
      if (input.mouse.left && input.clicked) {
        if (lenM < 0.0005) return;
        this.phase = "ready";
        this._anchor = null;
        this.app.hub?.hide?.();
      }
    }
  }
}
