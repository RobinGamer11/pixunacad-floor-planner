import polygonClippingDefault from "polygon-clipping";
const pc: any = (polygonClippingDefault as any)?.difference
  ? (polygonClippingDefault as any)
  : (polygonClippingDefault as any)?.default;

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
  /** Weicher Modus: pro Objekt akkumulierte Abtragung (0..1) innerhalb eines Striches. */
  private _acc = new Map<string, number>();
  /** Gesammelter Radier-Pfad des aktuellen Striches (Preview + Schraffur-Schnitt). */
  private _hatchStamps: Array<{ c: Vec2; r: number }> = [];

  constructor(app: CadApp) {
    this.app = app;
    this._rulerDrag = new RulerDragController(app);
  }

  activate() {
    this._erasing = false;
    this._lastWorld = null;
    this._acc.clear();
    this._hatchStamps = [];
    this._rulerDrag.reset();
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this._erasing = false;
    this._lastWorld = null;
    this._acc.clear();
    this._hatchStamps = [];
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
      if (this._erasing) {
        // Maus losgelassen → Schraffur-Pfad ausstanzen und History-Schritt setzen.
        this._commitHatchErase();
        (this.app as any).commitHistorySnapshot?.();
        (this.app as any).onEraseStrokeEnd?.();
      }
      this._erasing = false;
      this._lastWorld = null;
      this._acc.clear();
    }
  }

  /**
   * Stanzt den kompletten Radier-Pfad (Kreis-Sweep) boolesch aus allen
   * getroffenen Schraffuren aus. Ränder werden echt beschnitten, es entstehen
   * keine neuen Flächen; leere Ergebnisse löschen die Schraffur.
   */
  private _commitHatchErase() {
    const stamps = this._hatchStamps;
    this._hatchStamps = [];
    if (!stamps.length) return;
    const scene = this.app.scene;
    const eraser: any = stamps.map((s) => [this._circleRing(s.c, s.r)]);
    for (const hatch of scene.hatches.slice()) {
      if (!this.app.labelManager.isVisible(hatch.labelId)) continue;
      if (!this._polyNearStamps(hatch.points, stamps)) continue;
      const subject: any = [[
        hatch.points.map((p) => [p.x, p.y]),
        ...(hatch.holes || []).filter((h) => h.length > 2).map((h) => h.map((p) => [p.x, p.y])),
      ]];
      let result: any;
      try {
        result = polygonClipping.difference(subject, eraser);
      } catch {
        continue;
      }
      const style = {
        fillColor: hatch.fillColor, strokeColor: hatch.strokeColor,
        fillAlphaPct: hatch.fillAlphaPct, strokeWidthPx: hatch.strokeWidthPx,
        labelId: hatch.labelId, areaLabel: hatch.areaLabel,
      };
      scene.removeHatch(hatch);
      if (this.app.selection && (this.app.selection as any).hatchId === hatch.id) this.app.setSelection(null);
      for (const poly of result || []) {
        const rings = poly.map((ring: number[][]) => ring.map((p) => v(p[0], p[1])));
        const outer = rings[0];
        if (!outer || outer.length < 3) continue;
        scene.createHatch(outer, { ...style, holes: rings.slice(1).filter((r: Vec2[]) => r.length > 2) });
      }
    }
  }

  private _circleRing(c: Vec2, r: number, n = 32): number[][] {
    const ring: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]);
    }
    return ring;
  }

  private _polyNearStamps(pts: Vec2[], stamps: Array<{ c: Vec2; r: number }>): boolean {
    for (const s of stamps) if (this._strokeNearCircle(pts, s.c, s.r)) return true;
    return false;
  }


  /**
   * Effektiver Schnittradius für Vektorobjekte.
   * - Hart: voller Radius.
   * - Smooth: startet beim harten Kern und wächst mit der Verweildauer über
   *   dem Objekt bis zum vollen Radius — dadurch wird nicht sofort hart
   *   abgeschnitten, sondern die Kante "frisst" sich weich nach außen.
   */
  private _effRadius(objId: string, r: number, mode: "hard" | "smooth", softness: number, strength: number): number {
    if (mode === "hard") return r;
    const soft = Math.max(0.05, Math.min(1, softness));
    const core = Math.max(0.0002, r * (1 - soft));
    const prev = this._acc.get(objId) ?? 0;
    const next = Math.min(1, prev + 0.06 * Math.max(0.1, strength));
    this._acc.set(objId, next);
    return core + (r - core) * next;
  }

  private _eraseAt(centerW: Vec2) {
    const r = this.app.defaultEraserRadiusM;
    const strength = this.app.defaultEraserStrength;
    const mode = this.app.defaultEraserMode ?? "hard";
    const softness = Math.max(0.05, Math.min(1, this.app.defaultEraserSoftness ?? 0.5));
    const scene = this.app.scene;

    // Dokument-Pixelmasken radieren
    for (const doc of scene.documents) {
      if (!this.app.labelManager.isVisible(doc.labelId)) continue;
      eraseDocCircle(doc, centerW, r, strength, mode, softness);
    }

    // Externe Objekte (z. B. CAD-Blatt in der Projektmappe) radieren
    (this.app as any).onEraseStroke?.(v(centerW.x, centerW.y), r, mode, softness, strength);

    // FreeStrokes splitten (im Smooth-Modus zusätzlich mit ausgedünntem Rand)
    const freeStrokesCopy = scene.freeStrokes.slice();
    for (const stroke of freeStrokesCopy) {
      if (!this._strokeNearCircle(stroke.points, centerW, r)) continue;
      const rVec = this._effRadius(stroke.id, r, mode, softness, strength);
      const chunks = splitPolylineByCircle(stroke.points, centerW, rVec, 0.02);
      if (chunks.length === 1 && chunks[0].length === stroke.points.length) {
        const same = chunks[0].every((p, i) => p.x === stroke.points[i].x && p.y === stroke.points[i].y);
        if (same) continue;
      }
      if (mode === "smooth") {
        // Randbereich (zwischen Schnittradius und Pinselradius) wird schwächer
        // gezeichnet → weicher Auslauf statt harter Kante.
        scene.removeFreeStroke(stroke);
        for (const ch of chunks) {
          for (const piece of this._splitFringe(ch, centerW, r)) {
            if (piece.pts.length < 2) continue;
            scene.createFreeStroke(piece.pts, {
              color: stroke.color, thicknessM: stroke.thicknessM,
              opacity: piece.fringe ? Math.max(0.05, stroke.opacity * 0.35) : stroke.opacity,
              lineStyle: stroke.lineStyle, gapM: stroke.gapM,
              blobSpacingM: stroke.blobSpacingM, blobSizeM: stroke.blobSizeM,
              smoothing: stroke.smoothing, labelId: stroke.labelId,
              imageSrc: stroke.imageSrc, imageSizeM: stroke.imageSizeM,
              imageSpacingM: stroke.imageSpacingM, imageRotateAlongPath: stroke.imageRotateAlongPath,
            });
          }
        }
      } else {
        scene.replaceFreeStrokeWithChunks(stroke, chunks);
      }
    }

    // Linien-Segmente splitten
    const segsCopy = scene.segments.slice();
    for (const seg of segsCopy) {
      if (!this.app.labelManager.isVisible(seg.labelId)) continue;
      const pa = seg.a, pb = seg.b;
      const proj = projectPointToSegment(centerW, pa, pb);
      if (dist(proj.q, centerW) > r) continue;
      const rVec = this._effRadius(seg.id, r, mode, softness, strength);
      const subs = splitSegmentByCircle(pa, pb, centerW, rVec);
      if (subs.length === 1 && dist(subs[0].a, pa) < 1e-9 && dist(subs[0].b, pb) < 1e-9) continue;
      const style = { color: seg.color, thicknessM: seg.thicknessM, labelId: seg.labelId };
      scene.removeSegment(seg);
      if (this.app.selection && (this.app.selection as any).segmentId === seg.id) {
        this.app.setSelection(null);
      }
      for (const s of subs) {
        if (dist(s.a, s.b) < Defaults.minSegLenM) continue;
        scene.createSegment(s.a, s.b, style);
      }
    }

    // Schraffuren: Radier-Pfad nur sammeln (Preview). Der echte boolesche
    // Schnitt passiert erst beim Loslassen der Maus (_commitHatchErase).
    const lastStamp = this._hatchStamps[this._hatchStamps.length - 1];
    if (!lastStamp || dist(lastStamp.c, centerW) > r * 0.25) {
      this._hatchStamps.push({ c: v(centerW.x, centerW.y), r });
      if (this._hatchStamps.length > 4000) this._hatchStamps.shift();
    }


    // Textboxen: werden entfernt, sobald der Pinsel sie trifft (Smooth = mit
    // Verweildauer, damit ein Streifen am Rand nicht sofort alles löscht).
    for (const box of scene.textBoxes.slice()) {
      if (!this.app.labelManager.isVisible(box.labelId)) continue;
      const d = this._distToBox(centerW, box.center, box.widthM, box.heightM, box.rotationRad);
      if (d > r) continue;
      const rT = this._effRadius(box.id, r, mode, softness, strength);
      if (d > rT) continue;
      scene.removeTextBox(box);
      if (this.app.selection && (this.app.selection as any).textBoxId === box.id) this.app.setSelection(null);
    }
  }

  /** Teilt eine Polylinie in Stücke innerhalb (fringe) / außerhalb des Radius. */
  private _splitFringe(pts: Vec2[], center: Vec2, r: number): Array<{ pts: Vec2[]; fringe: boolean }> {
    const out: Array<{ pts: Vec2[]; fringe: boolean }> = [];
    if (!pts.length) return out;
    let cur: Vec2[] = [pts[0]];
    let curFringe = dist(pts[0], center) <= r;
    for (let i = 1; i < pts.length; i++) {
      const f = dist(pts[i], center) <= r;
      if (f !== curFringe) {
        cur.push(pts[i]);
        out.push({ pts: cur, fringe: curFringe });
        cur = [pts[i]];
        curFringe = f;
      } else {
        cur.push(pts[i]);
      }
    }
    out.push({ pts: cur, fringe: curFringe });
    return out;
  }

  private _circlePoly(c: Vec2, r: number, n = 16): Vec2[] {
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(v(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r));
    }
    return pts;
  }

  private _polyCenter(pts: Vec2[]): Vec2 {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return v(x / pts.length, y / pts.length);
  }

  private _polyNearCircle(pts: Vec2[], center: Vec2, r: number): boolean {
    return this._strokeNearCircle(pts, center, r);
  }

  private _polyEdgeNear(pts: Vec2[], center: Vec2, r: number): boolean {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (dist(projectPointToSegment(center, a, b).q, center) <= r) return true;
    }
    return false;
  }

  /** Abstand eines Weltpunkts zu einem rotierten Rechteck (0 = innerhalb). */
  private _distToBox(p: Vec2, center: Vec2, w: number, h: number, rot: number): number {
    const dx = p.x - center.x, dy = p.y - center.y;
    const cos = Math.cos(-rot), sin = Math.sin(-rot);
    const lx = Math.abs(dx * cos - dy * sin) - w / 2;
    const ly = Math.abs(dx * sin + dy * cos) - h / 2;
    if (lx <= 0 && ly <= 0) return 0;
    return Math.hypot(Math.max(0, lx), Math.max(0, ly));
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
    // Preview des laufenden Radier-Pfades (Schraffur-Ausschnitt).
    if (this._hatchStamps.length) {
      ctx.fillStyle = "rgba(77,163,255,0.22)";
      for (const s of this._hatchStamps) {
        const p = cam.worldToScreen(s.c.x, s.c.y);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2, s.r * cam.scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }

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
