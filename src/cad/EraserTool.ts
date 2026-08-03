import { Defaults, SelectionType } from "./constants";
import { Vec2, v, dist, projectPointToSegment, pointInPolygon } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { Segment, FreeStroke } from "./Scene";
import { splitPolylineByCircle, splitSegmentByCircle, projectPointToInfiniteLineFromTwoPoints } from "./freeGeom";
import { eraseDocCircle } from "./documentMask";
import { RulerDragController } from "./rulerInteraction";

/**
 * Radiergummi-Werkzeug (Hotkey: E).
 * - Linke Maustaste gehalten → radiert FreeStrokes UND Liniensegmente entlang Pfad.
 * - Optional Lineal-Snap (rulerGuide).
 * - Splittet Linien an Kreis-Schnittpunkten; Hatches/Texte/Maße bleiben unberührt.
 */
export class EraserTool {
  app: CadApp;
  id = "eraser";

  private _erasing = false;
  private _lastWorld: Vec2 | null = null;
  private _rulerDrag!: RulerDragController;

  constructor(app: CadApp) {
    this.app = app;
    this._rulerDrag = new RulerDragController(app);
  }

  activate() {
    this._erasing = false;
    this._lastWorld = null;
    this._rulerDrag.reset();
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this._erasing = false;
    this._lastWorld = null;
  }

  finish() { this.cancel(); }
  getCursor() {
    const c = this._rulerDrag.hoverCursor(this.app.input);
    return c || "none";
  }

  update(input: Input) {
    if (this._rulerDrag.update(input)) {
      this._erasing = false;
      this._lastWorld = null;
      return;
    }
    const ruler = this.app.scene.rulerGuide;
    const rawW = v(input.mouse.wx, input.mouse.wy);
    const projW = ruler ? projectPointToInfiniteLineFromTwoPoints(rawW, ruler.a, ruler.b) : rawW;

    if (input.mouse.left) {
      if (!this._erasing) {
        this._erasing = true;
        this._lastWorld = v(projW.x, projW.y);
        this._eraseAt(projW);
      } else {
        // Sample entlang der Bewegung (in r/2-Schritten)
        const r = this.app.defaultEraserRadiusM;
        const stepM = Math.max(r * 0.5, 0.01);
        const last = this._lastWorld!;
        const d = dist(last, projW);
        if (d > stepM) {
          const n = Math.ceil(d / stepM);
          for (let i = 1; i <= n; i++) {
            const t = i / n;
            this._eraseAt(v(last.x + (projW.x - last.x) * t, last.y + (projW.y - last.y) * t));
          }
        } else {
          this._eraseAt(projW);
        }
        this._lastWorld = v(projW.x, projW.y);
      }
    } else {
      this._erasing = false;
      this._lastWorld = null;
    }
  }

  private _eraseAt(centerW: Vec2) {
    const r = this.app.defaultEraserRadiusM;
    const strength = this.app.defaultEraserStrength;
    const mode = this.app.defaultEraserMode ?? "hard";
    const softness = this.app.defaultEraserSoftness ?? 0.5;
    // Vektorobjekte (Linien/Freihand) kennen keine Teiltransparenz: im
    // Smooth-Modus wird nur der harte Kern geschnitten.
    const rVec = mode === "smooth" ? Math.max(0.001, r * (1 - Math.max(0.05, Math.min(0.95, softness)))) : r;
    const scene = this.app.scene;

    // Dokument-Pixelmasken radieren
    for (const doc of scene.documents) {
      if (!this.app.labelManager.isVisible(doc.labelId)) continue;
      eraseDocCircle(doc, centerW, r, strength, mode, softness);
    }

    // FreeStrokes splitten
    const freeStrokesCopy = scene.freeStrokes.slice();
    for (const stroke of freeStrokesCopy) {
      // Bounding-Box Test
      if (!this._strokeNearCircle(stroke.points, centerW, rVec)) continue;
      const chunks = splitPolylineByCircle(stroke.points, centerW, rVec, 0.02);
      // Wenn unverändert (nichts geschnitten), übergehen
      if (chunks.length === 1 && chunks[0].length === stroke.points.length) {
        const same = chunks[0].every((p, i) => p.x === stroke.points[i].x && p.y === stroke.points[i].y);
        if (same) continue;
      }
      scene.replaceFreeStrokeWithChunks(stroke, chunks);
    }

    // Linien-Segmente splitten
    const segsCopy = scene.segments.slice();
    for (const seg of segsCopy) {
      if (!this.app.labelManager.isVisible(seg.labelId)) continue;
      // Quick reject
      const pa = seg.a, pb = seg.b;
      const proj = projectPointToSegment(centerW, pa, pb);
      if (dist(proj.q, centerW) > rVec) continue;
      const subs = splitSegmentByCircle(pa, pb, centerW, rVec);
      if (subs.length === 1 && dist(subs[0].a, pa) < 1e-9 && dist(subs[0].b, pb) < 1e-9) continue;
      const style = { color: seg.color, thicknessM: seg.thicknessM, labelId: seg.labelId };
      scene.removeSegment(seg);
      // Selektion bereinigen, falls dieses Segment ausgewählt war
      if (this.app.selection && (this.app.selection as any).segmentId === seg.id) {
        this.app.setSelection(null);
      }
      for (const s of subs) {
        if (dist(s.a, s.b) < Defaults.minSegLenM) continue;
        scene.createSegment(s.a, s.b, style);
      }
    }
  }

  private _strokeNearCircle(points: Vec2[], center: Vec2, r: number): boolean {
    if (!points.length) return false;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    return !(center.x + r < minX || center.x - r > maxX || center.y + r < minY || center.y - r > maxY);
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    const c = cam.worldToScreen(this.app.input.mouse.wx, this.app.input.mouse.wy);
    const r = Math.max(3, this.app.defaultEraserRadiusM * cam.scale);
    const mode = this.app.defaultEraserMode ?? "hard";
    const soft = Math.max(0.05, Math.min(1, this.app.defaultEraserSoftness ?? 0.5));
    ctx.save();
    if (mode === "smooth") {
      const g = ctx.createRadialGradient(c.x, c.y, r * (1 - soft), c.x, c.y, r);
      g.addColorStop(0, "rgba(77,163,255,0.28)");
      g.addColorStop(1, "rgba(77,163,255,0)");
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = `rgba(77,163,255,${Math.min(1, Math.max(0.05, this.app.defaultEraserStrength)) * 0.18})`;
    }
    ctx.strokeStyle = "rgba(77,163,255,0.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
