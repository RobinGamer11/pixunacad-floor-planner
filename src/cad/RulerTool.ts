import { v } from "./geometry";
import type { Input } from "./Input";
import { RulerDragController } from "./rulerInteraction";

/**
 * Eigenständiges Lineal-Werkzeug.
 *
 * Bedienung (identisch in CAD-Oberfläche und Projektmappe):
 *   1. L-Klick setzt den Anfangspunkt
 *   2. L-Klick setzt den Endpunkt
 *   3. danach: Körper ziehen = verschieben, Endpunkte ziehen = drehen/skalieren
 *
 * Die Länge wird immer in echten Zentimetern der Zeichnung geführt
 * (1 cm = 0.01 Welteinheiten); der Zoom ändert nur die Bildschirmgröße.
 */
export class RulerTool {
  app: any;
  id = "ruler";

  /** "start" = Anfangspunkt fehlt, "end" = Endpunkt wird gesetzt, "ready" = fertig. */
  phase: "start" | "end" | "ready" = "start";

  private _anchor: { x: number; y: number } | null = null;
  private _drag: RulerDragController;

  constructor(app: any) {
    this.app = app;
    this._drag = new RulerDragController(app, { handlesOnly: false });
  }

  activate() {
    this._drag.reset();
    this._anchor = null;
    this.phase = this.app?.scene?.rulerGuide ? "ready" : "start";
    this.app?.hub?.hide?.();
    this.app?.pointEditMenu?.hide?.();
  }

  cancel() {
    this._drag.reset();
    if (this.phase === "end") {
      this.app.scene.rulerGuide = null;
      this.phase = "start";
    }
    this._anchor = null;
  }

  finish() { this.cancel(); }

  isDrawing() { return this.phase === "end"; }

  getCursor() {
    if (this.phase !== "ready") return "crosshair";
    return this._drag.hoverCursor(this.app.input) || "default";
  }

  /** Aktuelle Länge in Zentimetern (0, wenn kein Lineal existiert). */
  getLengthCm(): number {
    const g = this.app?.scene?.rulerGuide;
    if (!g) return 0;
    return Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) * 100;
  }

  /** Länge in Zentimetern setzen — Anfangspunkt und Richtung bleiben erhalten. */
  setLengthCm(cm: number) {
    const g = this.app?.scene?.rulerGuide;
    if (!g) return;
    const target = Math.max(0.1, cm) / 100;
    let dx = g.b.x - g.a.x, dy = g.b.y - g.a.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-9) { dx = 1; dy = 0; len = 1; }
    g.b = v(g.a.x + (dx / len) * target, g.a.y + (dy / len) * target);
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

  update(input: Input) {
    const scene = this.app?.scene;
    if (!scene) return;

    if (this.phase === "ready") {
      if (!scene.rulerGuide) { this.phase = "start"; return; }
      this._drag.update(input);
      return;
    }

    const w = v(input.mouse.wx, input.mouse.wy);

    if (this.phase === "start") {
      if (input.mouse.left && input.clicked) {
        this._anchor = { x: w.x, y: w.y };
        scene.rulerGuide = { a: v(w.x, w.y), b: v(w.x, w.y) };
        this.phase = "end";
      }
      return;
    }

    // phase === "end": Vorschau folgt der Maus, zweiter Klick schließt ab.
    if (this._anchor) {
      scene.rulerGuide = { a: v(this._anchor.x, this._anchor.y), b: v(w.x, w.y) };
      const lenCm = Math.hypot(w.x - this._anchor.x, w.y - this._anchor.y) * 100;
      const angleDeg = Math.atan2(-(w.y - this._anchor.y), w.x - this._anchor.x) * 180 / Math.PI;
      try {
        this.app.hub?.showAt?.(input.mouse.sx, input.mouse.sy);
        this.app.hub?.updateDisplay?.(lenCm / 100, angleDeg);
      } catch { /* Hub optional */ }
      if (input.mouse.left && input.clicked) {
        if (lenCm < 0.05) return;
        this.phase = "ready";
        this._anchor = null;
        this.app.hub?.hide?.();
      }
    }
  }
}
