import { drawSnapDot } from "./snapDraw";
import { Defaults, SnapType } from "./constants";
import { Vec2, v, sub, norm, len, dist, projectPointToSegment } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Snap } from "./TopologyEngine";
import type { Input } from "./Input";
import type { DimensionStyle } from "./Scene";
import { getDimensionGeometry } from "./dimensionGeometry";
import { computeHealedWallLines } from "./wallHeal";
import { bulgeFromPoint } from "./geometry";

/**
 * Ermittelt die Wölbung zwischen zwei Punkten auf einer bereits tessellierten
 * Polylinie (z. B. Außen-/Innenkante einer gewölbten Wand). Es wird der
 * tatsächliche Bogenverlauf zwischen den beiden Treffern ausgewertet, damit
 * Maßketten auch an Sub- und Hilfslinien gewölbt bleiben.
 */
function polyBulgeBetween(
  pts: Vec2[] | null | undefined,
  a: Vec2,
  b: Vec2,
  same: (p: Vec2, q: Vec2) => boolean,
): number | null {
  if (!pts || pts.length < 3) return null;
  let ia = -1, ib = -1;
  for (let i = 0; i < pts.length; i++) {
    if (ia < 0 && same(pts[i], a)) { ia = i; continue; }
    if (ib < 0 && same(pts[i], b)) ib = i;
  }
  if (ia < 0 || ib < 0) return null;
  const lo = Math.min(ia, ib), hi = Math.max(ia, ib);
  if (hi - lo < 2) return null;
  const mid = pts[Math.round((lo + hi) / 2)];
  const bg = bulgeFromPoint(a, b, mid);
  return Math.abs(bg) < 1e-4 ? null : bg;
}



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



  getOrientationMode(): "parallel" | "diagonal" | "arc" {
    const o = this.app.measureSettings.orientation as any;
    return (o === "angle" ? "parallel" : o);
  }

  /** Neigungsmodus: Scheitel + zwei Schenkel, Anzeige des Winkels in Grad. */
  private _isAngleMode(): boolean {
    return (this.app.measureSettings.pointCount as any) === "angle";
  }

  getPointCountMode(): "two" | "multi" | "free" {
    const pc = this.app.measureSettings.pointCount as any;
    return (pc === "angle" ? "free" : pc);
  }

  /** "Freies Maß": Punkte dürfen ohne Fangpunkt gesetzt werden.
   *  Im Neigungsmodus ist das immer erlaubt (Fangpunkte dienen der Orientierung). */
  private _isFreePoints(): boolean {
    return (this.app.measureSettings.pointCount as any) === "free" || this._isAngleMode();
  }

  /** Aktueller Zielpunkt: Snap wenn vorhanden, im freien Modus sonst die Mausposition. */
  private _pickPoint(input: Input): Vec2 | null {
    if (this.pointSnap) return v(this.pointSnap.world.x, this.pointSnap.world.y);
    if (this._isFreePoints()) return v(input.mouse.wx, input.mouse.wy);
    return null;
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

  /** Sucht die Wölbung einer bestehenden Kante zwischen zwei Punkten (Linie, Schraffur, Wand). */
  private _findEdgeBulge(a: Vec2, b: Vec2): number {
    const tol = 1e-6 + 0.005;
    const same = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y) <= tol;
    const scene: any = this.app.scene;

    for (const seg of scene.segments || []) {
      const bg = (seg as any).bulge || 0;
      if (!bg) continue;
      if (same(seg.a, a) && same(seg.b, b)) return bg;
      if (same(seg.a, b) && same(seg.b, a)) return -bg;
    }
    const ringScan = (pts: Vec2[], bulges: number[] | undefined, closed: boolean): number | null => {
      if (!pts || !bulges) return null;
      const last = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < last; i++) {
        const bg = bulges[i] || 0;
        if (!bg) continue;
        const p = pts[i], q = pts[(i + 1) % pts.length];
        if (same(p, a) && same(q, b)) return bg;
        if (same(p, b) && same(q, a)) return -bg;
      }
      return null;
    };
    for (const h of scene.hatches || []) {
      const r = ringScan(h.points, (h as any).bulges, true);
      if (r != null) return r;
      const holes = (h as any).holes || [];
      const holeBulges = (h as any).holeBulges || [];
      for (let hi = 0; hi < holes.length; hi++) {
        const rr = ringScan(holes[hi], holeBulges[hi], true);
        if (rr != null) return rr;
      }
    }
    for (const w of scene.walls || []) {
      const bulges = (w as any).bulges as number[] | undefined;
      const r = ringScan(w.corners, bulges, false);
      if (r != null) return r;
      // Auch Außen-/Innenkanten (Main/Help/Sub) prüfen: Offsetbögen haben denselben
      // Öffnungswinkel und damit exakt dieselbe Wölbung wie die Bezugslinie.
      if (bulges && bulges.some(b => b)) {
        try {
          const lines = computeHealedWallLines(w, scene.walls, scene.getWallTopology?.());
          for (const side of [lines.mainCorners, lines.helpCorners, lines.subCorners]) {
            const rr = polyBulgeBetween(side, a, b, same);
            if (rr != null) return rr;
          }
        } catch { /* ignore */ }
      }
    }

    return 0;
  }

  private _canStartPlacement() {
    return this.selectedPoints.length >= 2;
  }

  private _buildPreviewSpecs(placementPoint: Vec2) {
    const specs: Array<{ p1: Vec2; p2: Vec2; placementPoint: Vec2; mode: "parallel" | "diagonal" | "arc"; refDir: Vec2 | null; style: DimensionStyle; doorRefId: string | null }> = [];
    if (this.selectedPoints.length < 2) return specs;

    const style = this.app.getCurrentMeasureStyle();
    const dirMode = this.getDirectionMode();
    const orientation = this.getOrientationMode();
    // Wenn eine Achse vorgegeben ist (H/V/Frei), erzwingen wir "parallel" damit
    // die gesamte Kette EINE gemeinsame Maßlinie hat.
    const mode: "parallel" | "diagonal" | "arc" = orientation;

    if (orientation === "arc") {
      const pts = this.selectedPoints;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i].world, b = pts[i + 1].world;
        const bulge = this._findEdgeBulge(a, b);
        specs.push({
          p1: v(a.x, a.y), p2: v(b.x, b.y), placementPoint,
          mode: "arc", refDir: null,
          style: { ...style, bulge },
          doorRefId: null,
        });
        if (this.getPointCountMode() === "two") break;
      }
      return specs;
    }

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

    if (this._isAngleMode()) { this._updateAngle(input); return; }

    // Distanz-Hub: Länge/Winkel vom letzten gesetzten Punkt (bzw. ersten
    // Richtungspunkt im Frei-Modus) zur aktuellen Snap-Position.
    const hubAnchor: Vec2 | null =
      this.state === "freeDir" && this.freeDirPoints.length >= 1
        ? this.freeDirPoints[this.freeDirPoints.length - 1]
        : this.state === "collect" && this.selectedPoints.length >= 1
          ? this.selectedPoints[this.selectedPoints.length - 1].world
          : null;
    const hubTarget = this.pointSnap
      ? this.pointSnap.world
      : (this._isFreePoints() ? v(input.mouse.wx, input.mouse.wy) : null);
    if (hubAnchor && hubTarget) {
      const cur = hubTarget;
      const dx = cur.x - hubAnchor.x;
      const dy = cur.y - hubAnchor.y;
      const lengthM = Math.hypot(dx, dy);
      const angleDeg = Math.atan2(-dy, dx) * 180 / Math.PI;
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(lengthM, angleDeg);
    } else {
      this.app.hub.hide();
    }

    if (this.state === "freeDir") {
      if (input.doubleClicked && this.freeDirPoints.length >= 2) {
        // Doppelklick auf den zweiten Punkt bestätigt die Richtung sofort.
        if (this.finishCollect()) return;
      }
      if (input.clicked) {
        const p = this._pickPoint(input);
        if (p) {
          if (this.freeDirPoints.length >= 2) {
            // Bereits 2 Punkte – ein weiterer Klick ersetzt den zweiten.
            this.freeDirPoints[1] = p;
          } else {
            this.freeDirPoints.push(p);
          }
        }
      }
      // Häkchen-Hub zum Bestätigen der Richtung anzeigen, sobald 2 Punkte gesetzt sind.
      if (this.freeDirPoints.length >= 2) {
        const last = this.freeDirPoints[this.freeDirPoints.length - 1];
        const sp = this.app.camera.worldToScreen(last.x, last.y);
        this.app.measureFinishHubState = { visible: true, screenX: sp.x, screenY: sp.y };
      } else {
        this.app.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
      }
      return;
    }

    if (this.state === "collect") {
      if (input.doubleClicked && this.getPointCountMode() !== "two") {
        if (this.finishCollect()) return;
      }
      if (input.clicked) {
        const picked = this._pickPoint(input);
        if (!picked) return;
        const refDir = this._refDirFromSnap(this.pointSnap);
        this.selectedPoints.push({
          world: picked,
          refDir,
          doorId: this.pointSnap?.doorId || null,
        });
        if (this.getPointCountMode() === "two" && this.selectedPoints.length === 2) {
          this.state = "place";
        }
      }
      if (
        this.state === "collect" &&
        this.getPointCountMode() !== "two" &&
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
        // Wenn ein Snap aktiv ist (z. B. auf einer bestehenden Maßlinie),
        // den Snap-Punkt als Platzierungspunkt nutzen ⇒ Maßketten lassen
        // sich exakt nebeneinandersetzen.
        const placement = this.pointSnap
          ? v(this.pointSnap.world.x, this.pointSnap.world.y)
          : v(input.mouse.wx, input.mouse.wy);
        const specs = this._buildPreviewSpecs(placement);
        for (const s of specs) {
          this.app.scene.createDimension(s.p1, s.p2, s.placementPoint, s.mode, s.refDir, s.style, s.doorRefId);
        }
        this.app.clearSelection();
        this.app.refreshLabelUI();
        this.selectedPoints = [];
        // Im Frei-Modus bleibt die einmal gesetzte Achse erhalten, damit nicht
        // jedes Mal eine neue Richtungslinie gezeichnet werden muss.
        this.state = "collect";
      }
    }
  }



  /**
   * Neigungsmodus: 1. Klick = Scheitel, 2. Klick = Ende des ersten Schenkels
   * (erste Linie steht sofort), 3. Klick = Ende des zweiten Schenkels. Zwischen
   * den Schenkeln erscheint der Winkel; der Radius wird gestrichelt grau gezeigt.
   */
  /**
   * Zielpunkt im Neigungsmodus.
   * - Erster Schenkel: mit Shift wird die Richtung auf 45°-Schritte gerastet.
   * - Zweiter Schenkel: Länge wird zwingend auf die Länge des ersten Schenkels
   *   gesetzt (Kreisbahn um den Scheitel), damit die Neigung exakt bleibt.
   */
  private _angleTarget(input: Input): Vec2 {
    const raw = this.pointSnap ? v(this.pointSnap.world.x, this.pointSnap.world.y) : v(input.mouse.wx, input.mouse.wy);
    if (this.selectedPoints.length === 0) return raw;
    const apex = this.selectedPoints[0].world;
    let dx = raw.x - apex.x, dy = raw.y - apex.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-9) return raw;
    let ang = Math.atan2(dy, dx);
    if (input.keys.shift) {
      const step = Math.PI / 4;
      ang = Math.round(ang / step) * step;
    }
    if (this.selectedPoints.length >= 2) {
      // Kreisbahn: gleiche Schenkellänge wie der erste Schenkel.
      const b = this.selectedPoints[1].world;
      const r = Math.hypot(b.x - apex.x, b.y - apex.y);
      if (r > 1e-9) len = r;
    }
    return v(apex.x + Math.cos(ang) * len, apex.y + Math.sin(ang) * len);
  }

  private _updateAngle(input: Input) {
    const target = this._angleTarget(input);

    // Hub: Länge/Winkel ab letztem gesetzten Punkt.
    if (this.selectedPoints.length >= 1) {
      const from = this.selectedPoints.length >= 2
        ? this.selectedPoints[0].world
        : this.selectedPoints[this.selectedPoints.length - 1].world;
      const dx = target.x - from.x, dy = target.y - from.y;
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(Math.hypot(dx, dy), Math.atan2(-dy, dx) * 180 / Math.PI);
    } else {
      this.app.hub.hide();
    }
    this.app.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };

    if (!input.clicked) return;
    this.selectedPoints.push({ world: target, refDir: null, doorId: null });
    if (this.selectedPoints.length < 3) return;

    const [a, b, c] = this.selectedPoints.map((p) => p.world);
    const style = { ...this.app.getCurrentMeasureStyle(), p3: v(c.x, c.y) };
    const preview = getDimensionGeometry({
      p1: a, p2: b, p3: c, placementPoint: null as any,
      mode: "angle", refDir: null,
    } as any);
    this.app.scene.createDimension(a, b, v(preview.mid.x, preview.mid.y), "angle", null, style, null);
    this.app.clearSelection();
    this.app.refreshLabelUI();
    this.selectedPoints = [];
    this.state = "collect";
  }

  /** Live-Vorschau für den Neigungsmodus. */
  private _drawAngleOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    if (this.selectedPoints.length === 0) return;
    const target = this._angleTarget(this.app.input);
    const a = this.selectedPoints[0].world;
    if (this.selectedPoints.length === 1) {
      const s0 = cam.worldToScreen(a.x, a.y);
      const s1 = cam.worldToScreen(target.x, target.y);
      ctx.save();
      ctx.strokeStyle = "rgba(255,180,0,0.95)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const b = this.selectedPoints[1].world;
    const style = this.app.getCurrentMeasureStyle();
    const spec = { p1: a, p2: b, p3: target, placementPoint: null, mode: "angle", refDir: null };
    const g = getDimensionGeometry(spec as any);
    (this.app.renderer as any)._drawAngleDimension(ctx, cam, {
      ...spec, ...style, placementPoint: g.mid,
      decimals: style.decimals ?? Defaults.measureDecimals,
    }, true);
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

    // Frei-Modus: Richtungslinie (vor dem Sammeln) zeichnen
    if (this.state === "freeDir" && this.freeDirPoints.length > 0) {
      const p0 = this.freeDirPoints[0];
      const p1 = this.freeDirPoints.length >= 2
        ? this.freeDirPoints[1]
        : (this.pointSnap ? this.pointSnap.world : null);
      const s0 = cam.worldToScreen(p0.x, p0.y);
      ctx.save();
      ctx.fillStyle = "rgba(255,140,0,0.95)";
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s0.x, s0.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (p1) {
        const s1 = cam.worldToScreen(p1.x, p1.y);
        ctx.beginPath();
        ctx.arc(s1.x, s1.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,140,0,0.9)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(s0.x, s0.y);
        ctx.lineTo(s1.x, s1.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }


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

    if (this._isAngleMode()) { this._drawAngleOverlay(ctx, cam); return; }

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

