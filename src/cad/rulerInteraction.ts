import { Vec2, v, dist, projectPointToSegment } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import { constrainRulerAngle, snapRulerPoint } from "./rulerModel";

export type RulerHit = { kind: "a" | "b" | "body" } | null;

const HIT_PX_HANDLE = 12;
const HIT_PX_BODY = 8;

export function hitRulerAtScreen(app: CadApp, sx: number, sy: number): RulerHit {
  const g = app.scene.rulerGuide;
  if (!g) return null;
  const cam = app.camera;
  const a = cam.worldToScreen(g.a.x, g.a.y);
  const b = cam.worldToScreen(g.b.x, g.b.y);
  if (Math.hypot(sx - a.x, sy - a.y) <= HIT_PX_HANDLE) return { kind: "a" };
  if (Math.hypot(sx - b.x, sy - b.y) <= HIT_PX_HANDLE) return { kind: "b" };
  const proj = projectPointToSegment(v(sx, sy), v(a.x, a.y), v(b.x, b.y));
  if (dist(proj.q, v(sx, sy)) <= HIT_PX_BODY) return { kind: "body" };
  return null;
}

/**
 * Shared Ruler-Drag-State + Update-Logik für FreeDraw/Eraser.
 * Aufruf am Anfang der tool.update(input). Gibt true zurück wenn der
 * Ruler aktiv manipuliert wird → Tool soll restlichen Update überspringen.
 */
export class RulerDragController {
  app: CadApp;
  private _mode: null | "a" | "b" | "body" = null;
  private _startMouseW: Vec2 | null = null;
  private _startA: Vec2 | null = null;
  private _startB: Vec2 | null = null;

  /** true = nur die beiden Endpunkte lassen sich ziehen (Linie selbst fängt). */
  handlesOnly: boolean;
  /** true = Endpunkte rasten an den vorhandenen CAD-Fangpunkten ein. */
  useSnap: boolean;

  /** Bildschirmposition des zuletzt genutzten Fangpunkts (für die Anzeige). */
  lastSnapScreen: { x: number; y: number } | null = null;

  constructor(app: CadApp, opts?: { handlesOnly?: boolean; snap?: boolean }) {
    this.app = app;
    this.handlesOnly = !!opts?.handlesOnly;
    this.useSnap = !!opts?.snap;
  }

  reset() {
    this._mode = null;
    this._startMouseW = null;
    this._startA = null;
    this._startB = null;
    this.lastSnapScreen = null;
  }

  /** True = Tool soll Drawing/Erasing in dieser Frame überspringen. */
  update(input: Input): boolean {
    const g = this.app.scene.rulerGuide;
    if (!g) { this.reset(); return false; }

    const snapped = () => {
      if (!this.useSnap) { this.lastSnapScreen = null; return v(input.mouse.wx, input.mouse.wy); }
      const s = snapRulerPoint(this.app, input);
      this.lastSnapScreen = s.snapped ? this.app.camera.worldToScreen(s.x, s.y) : null;
      return v(s.x, s.y);
    };

    // Aktiv? -> verarbeite Drag
    if (this._mode) {
      if (!input.mouse.left) { this.reset(); return false; }
      const mw = snapped();
      if (this._mode === "a") {
        g.a = v(mw.x, mw.y);
      } else if (this._mode === "b") {
        g.b = v(mw.x, mw.y);
      } else if (this._mode === "body" && this._startMouseW && this._startA && this._startB) {
        const dx = mw.x - this._startMouseW.x;
        const dy = mw.y - this._startMouseW.y;
        g.a = v(this._startA.x + dx, this._startA.y + dy);
        g.b = v(this._startB.x + dx, this._startB.y + dy);
      }
      return true;
    }

    // Nicht aktiv: prüfe ob Klick auf Ruler beginnt
    if (input.mouse.left && input.clicked) {
      const hit = hitRulerAtScreen(this.app, input.mouse.sx, input.mouse.sy);
      if (hit && !(this.handlesOnly && hit.kind === "body")) {
        this._mode = hit.kind;
        // Beim Verschieben über einen Endpunkt bleibt der Bezug der Endpunkt,
        // damit das ganze Lineal an Fangpunkten einrasten kann.
        this._startMouseW = v(input.mouse.wx, input.mouse.wy);
        this._startA = v(g.a.x, g.a.y);
        this._startB = v(g.b.x, g.b.y);
        return true;
      }
    }
    this.lastSnapScreen = null;
    return false;
  }

  /** Cursor-Hint je nach Hover. */
  hoverCursor(input: Input): string | null {
    if (this._mode) return "grabbing";
    const hit = hitRulerAtScreen(this.app, input.mouse.sx, input.mouse.sy);
    if (!hit) return null;
    if (hit.kind === "body") return this.handlesOnly ? null : "grab";
    return "move";
  }
}
