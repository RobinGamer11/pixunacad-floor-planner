import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType } from "./constants";
import { Vec2, v, sub, norm, len, dist, projectPointToSegment } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import type { DimensionStyle } from "./Scene";
import { getDimensionGeometry } from "./dimensionGeometry";

interface CollectedPoint {
  world: Vec2;
  // Reference info for parallel orientation
  refDir?: Vec2 | null;
  /** Wenn der Punkt auf einem Tür-/Fenster-Endpunkt liegt: Tür-ID. */
  doorId?: string | null;
}


export class MeasureTool {
  app: CadApp;
  id = "measure";

  state: "freeDir" | "collect" | "place" = "collect";
  pointSnap: Snap | null = null;
  selectedPoints: CollectedPoint[] = [];
  /** Im "frei"-Modus: zwei Punkte, die die Richtungsachse vorgeben. */
  freeDirPoints: Vec2[] = [];
  /** Gespeicherte Richtungsachse (nur im "frei"-Modus). */
  freeAxis: Vec2 | null = null;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this.pointSnap = null;
    this.selectedPoints = [];
    this.freeDirPoints = [];
    this.freeAxis = null;
    this.state = this.getDirectionMode() === "free" ? "freeDir" : "collect";
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.pointSnap = null;
    this.selectedPoints = [];
    this.freeDirPoints = [];
    this.freeAxis = null;
    this.state = this.getDirectionMode() === "free" ? "freeDir" : "collect";
    this.app.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
  }

  finish() { this.cancel(); }

  /** Bricht das letzte Mini-Segment ab, falls dessen Länge ~0 ist (entsteht durch
   *  den ersten Klick eines Doppelklicks oder einen Doppelpunkt). */
  private _stripTrailingZeroLengthPoint() {
    if (this.selectedPoints.length < 2) return;
    const a = this.selectedPoints[this.selectedPoints.length - 1].world;
    const b = this.selectedPoints[this.selectedPoints.length - 2].world;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-4) this.selectedPoints.pop();
  }

  /** Schließt das Sammeln ab (Enter / Häkchen / Doppelklick) und wechselt
   *  zum nächsten Schritt. Liefert true, wenn der Wechsel erfolgte. */
  finishCollect(): boolean {
    if (this.state === "freeDir") {
      if (this.freeDirPoints.length < 2) return false;
      const d = sub(this.freeDirPoints[1], this.freeDirPoints[0]);
      if (len(d) < 1e-9) return false;
      this.freeAxis = norm(d);
      this.freeDirPoints = [];
      this.state = "collect";
      this.app.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
      return true;
    }
    if (this.state !== "collect") return false;
    this._stripTrailingZeroLengthPoint();
    if (!this._canStartPlacement()) return false;
    this.state = "place";
    this.app.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
    return true;
  }

  isDrawing() {
    return this.selectedPoints.length > 0 || this.freeDirPoints.length > 0 || this.state === "place";
  }



  getOrientationMode(): "parallel" | "diagonal" {
    return this.app.measureSettings.orientation;
  }

  getPointCountMode(): "two" | "multi" {
    return this.app.measureSettings.pointCount;
  }

  getDirectionMode(): "horizontal" | "vertical" | "free" {
    return this.app.measureSettings.direction;
  }

  /** Find a snap on lines, hatch points, hatch edges, segment endpoints + midpoints. */
  private _findMeasureSnap(input: Input): Snap | null {
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    return this.app.topology.findBestSnap(mouseS, mouseW);
  }

  /** Compute a reference direction from snap context (for parallel mode). */
  private _refDirFromSnap(snap: Snap | null): Vec2 | null {
    if (!snap) return null;
    if (snap.segment) {
      const d = sub(snap.segment.b, snap.segment.a);
      if (len(d) > 1e-9) return norm(d);
    }
    if (snap.hatch && snap.edgeIndex != null && snap.hatch.points.length >= 2) {
      const a = snap.hatch.points[snap.edgeIndex];
      const b = snap.hatch.points[(snap.edgeIndex + 1) % snap.hatch.points.length];
      const d = sub(b, a);
      if (len(d) > 1e-9) return norm(d);
    }
    return null;
  }

  /** Achsen-Richtung der Maßkette. "horizontal" → (1,0); "vertical" → (0,1);
   *  "free" → aus den ersten zwei gesetzten Punkten (oder Fallback). */
  private _chainAxis(): Vec2 {
    const dir = this.getDirectionMode();
    if (dir === "horizontal") return v(1, 0);
    if (dir === "vertical") return v(0, 1);
    if (this.freeAxis) return this.freeAxis;
    if (this.selectedPoints.length >= 2) {
      const d = sub(this.selectedPoints[1].world, this.selectedPoints[0].world);
      if (len(d) > 1e-9) return norm(d);
    }
    return v(1, 0);
  }

  /** Projiziert einen Punkt orthogonal auf die durch `anchor` laufende Achse. */
  private _projectOnAxis(p: Vec2, anchor: Vec2, axis: Vec2): Vec2 {
    const t = (p.x - anchor.x) * axis.x + (p.y - anchor.y) * axis.y;
    return v(anchor.x + axis.x * t, anchor.y + axis.y * t);
  }

  private _canStartPlacement() {
    return this.selectedPoints.length >= 2;
  }

  private _buildPreviewSpecs(placementPoint: Vec2) {
    const specs: Array<{ p1: Vec2; p2: Vec2; placementPoint: Vec2; mode: "parallel" | "diagonal"; refDir: Vec2 | null; style: DimensionStyle; doorRefId: string | null }> = [];
    if (this.selectedPoints.length < 2) return specs;

    const style = this.app.getCurrentMeasureStyle();
    const dirMode = this.getDirectionMode();
    const orientation = this.getOrientationMode();
    // Wenn eine Achse vorgegeben ist (H/V/Frei), erzwingen wir "parallel" damit
    // die gesamte Kette EINE gemeinsame Maßlinie hat.
    const mode: "parallel" | "diagonal" = orientation;

    const axis = this._chainAxis();
    const anchor = this.selectedPoints[0].world;

    // Punkte ggf. auf gemeinsame Achse projizieren, dann nach Achsen-t sortieren,
    // damit die Kette in eine Richtung läuft (egal in welcher Reihenfolge geklickt).
    const projected = this.selectedPoints.map((sp) => {
      const w = dirMode === "free" && this.selectedPoints.length < 2
        ? sp.world
        : this._projectOnAxis(sp.world, anchor, axis);
      const t = (w.x - anchor.x) * axis.x + (w.y - anchor.y) * axis.y;
      return { world: w, t, doorId: sp.doorId || null };
    });
    projected.sort((a, b) => a.t - b.t);

    if (this.getPointCountMode() === "two") {
      const doorRefId = (projected[0].doorId && projected[0].doorId === projected[1].doorId) ? projected[0].doorId : null;
      specs.push({
        p1: projected[0].world,
        p2: projected[1].world,
        placementPoint,
        mode,
        refDir: axis,
        style,
        doorRefId,
      });
      return specs;
    }

    for (let i = 0; i < projected.length - 1; i++) {
      const doorRefId = (projected[i].doorId && projected[i].doorId === projected[i + 1].doorId) ? projected[i].doorId : null;
      specs.push({
        p1: projected[i].world,
        p2: projected[i + 1].world,
        placementPoint,
        mode,
        refDir: axis,
        style,
        doorRefId,
      });
    }
    return specs;
  }



  update(input: Input) {
    this.pointSnap = this._findMeasureSnap(input);
    this.app.renderer.setHoverHatchId(this.pointSnap?.hatch?.id || null);
    this.app.renderer.setHoverSegmentId(this.pointSnap?.segment?.id || null);

    // Distanz-Hub: ab dem ersten gesetzten Punkt Länge/Winkel vom letzten
    // gesetzten Punkt zur aktuellen Snap-Position anzeigen (gleicher Stil
    // wie im Linienwerkzeug).
    if (this.state === "collect" && this.selectedPoints.length >= 1 && this.pointSnap) {
      const last = this.selectedPoints[this.selectedPoints.length - 1].world;
      const cur = this.pointSnap.world;
      const dx = cur.x - last.x;
      const dy = cur.y - last.y;
      const lengthM = Math.hypot(dx, dy);
      const angleDeg = Math.atan2(-dy, dx) * 180 / Math.PI;
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(lengthM, angleDeg);
    } else {
      this.app.hub.hide();
    }

    if (this.state === "collect") {
      if (input.doubleClicked && this.getPointCountMode() === "multi") {
        // Doppelklick fügt durch den ersten Klick einen Punkt am Mauszeiger ein,
        // der oft mit dem zuletzt gesetzten Punkt zusammenfällt → entfernen,
        // damit kein 0,00 m-Mini-Maß entsteht.
        if (this.finishCollect()) return;
      }
      if (input.clicked) {
        if (!this.pointSnap) return;
        // Reference the snapped world position WITHOUT modifying the underlying geometry.
        // The MeasureTool must never split segments or insert hatch points — that's the LineTool's job.
        const refDir = this._refDirFromSnap(this.pointSnap);
        this.selectedPoints.push({
          world: v(this.pointSnap.world.x, this.pointSnap.world.y),
          refDir,
          doorId: this.pointSnap.doorId || null,
        });
        if (this.getPointCountMode() === "two" && this.selectedPoints.length === 2) {
          this.state = "place";
        }
      }
      // "Maßkette fertig"-Häkchen-Button neben dem zuletzt gesetzten Punkt anzeigen
      // (nur im Multi-Modus, sobald genug Punkte für eine Maßkette gesetzt sind).
      if (
        this.state === "collect" &&
        this.getPointCountMode() === "multi" &&
        this._canStartPlacement()
      ) {
        const last = this.selectedPoints[this.selectedPoints.length - 1].world;
        const sp = this.app.camera.worldToScreen(last.x, last.y);
        this.app.measureFinishHubState = { visible: true, screenX: sp.x, screenY: sp.y };
      } else {
        this.app.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
      }
      return;
    }


    if (this.state === "place") {
      if (input.clicked) {
        const placement = v(input.mouse.wx, input.mouse.wy);
        const specs = this._buildPreviewSpecs(placement);
        for (const s of specs) {
          this.app.scene.createDimension(s.p1, s.p2, s.placementPoint, s.mode, s.refDir, s.style, s.doorRefId);
        }
        this.app.clearSelection();
        this.app.refreshLabelUI();
        this.selectedPoints = [];
        this.state = "collect";
      }
    }
  }


  onTabRequest(): boolean { return false; }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Highlight all segment + hatch points so the user knows they can be snapped
    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.85)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.2;
    for (const seg of this.app.scene.segments) {
      if (!this.app.labelManager.isVisible(seg.labelId)) continue;
      for (const p of [seg.a, seg.b]) {
        const s = cam.worldToScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const h of this.app.scene.hatches) {
      if (!this.app.labelManager.isVisible(h.labelId)) continue;
      for (const p of h.points) {
        const s = cam.worldToScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();

    // Selected (collected) points
    ctx.save();
    ctx.fillStyle = "rgba(77,163,255,0.95)";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;
    for (const p of this.selectedPoints) {
      const s = cam.worldToScreen(p.world.x, p.world.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Snap indicator
    if (this.pointSnap) {
      const s = cam.worldToScreen(this.pointSnap.world.x, this.pointSnap.world.y);
      drawSnapDot(ctx, s.x, s.y, { ring: true });

      // Snap-line highlight
      if (this.pointSnap.type === SnapType.LINE && this.pointSnap.lineA && this.pointSnap.lineB) {
        const a = cam.worldToScreen(this.pointSnap.lineA.x, this.pointSnap.lineA.y);
        const b = cam.worldToScreen(this.pointSnap.lineB.x, this.pointSnap.lineB.y);
        ctx.save();
        ctx.strokeStyle = "rgba(77,163,255,0.42)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.state !== "place") return;

    const specs = this._buildPreviewSpecs(v(this.app.input.mouse.wx, this.app.input.mouse.wy));
    for (const s of specs) {
      this._drawPreviewDimension(ctx, cam, s);
    }
  }

  private _drawPreviewDimension(ctx: CanvasRenderingContext2D, cam: any, spec: any) {
    // Use renderer's full dimension draw via temporary "fake" dimension
    this.app.renderer._drawSingleDimension(ctx, cam, {
      p1: spec.p1, p2: spec.p2, placementPoint: spec.placementPoint,
      mode: spec.mode, refDir: spec.refDir,
      ...spec.style,
      decimals: spec.style.decimals ?? Defaults.measureDecimals,
      tickLengthM: spec.style.tickLengthM ?? Defaults.measureTickLengthM,
      doorRefId: spec.doorRefId || null,
    } as any, true);
  }
}

