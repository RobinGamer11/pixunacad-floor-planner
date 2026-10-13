import { toast } from "sonner";
import { v, type Vec2 } from "./geometry";
import type { Input } from "./Input";
import { drawSnapDot } from "./snapDraw";
import { constrainRulerAngle, snapRulerPoint } from "./rulerModel";
import { cutPolyline, cutRegion, hatchRegion, edgeCutParams } from "./cutGeometry";
import { applyObjectMeta, ensureObjectCode } from "./objectMeta";
import { getDefinition, instanceWorldSnapshots } from "./library/LibraryManager";
import { createObjectsFromSnapshots } from "./library/libraryGeometry";

/**
 * Cutter: 1) Punkt 1, 2) Punkt 2 (= Schnittlinie), 3) Enter / Doppel-L-Klick
 * teilt alle gekreuzten Linien, Polygone, Schraffuren, Wände und
 * Bibliothekselemente. Genau ein Undo-Schritt.
 */
export class CutterTool {
  app: any;
  id = "cutter";
  phase: "p1" | "p2" | "ready" = "p1";
  p1: Vec2 | null = null;
  p2: Vec2 | null = null;
  private _cursor: Vec2 | null = null;
  private _snapScreen: { x: number; y: number } | null = null;

  constructor(app: any) { this.app = app; }

  activate() {
    this.reset();
    this.app?.hub?.hide?.();
    this.app?.pointEditMenu?.hide?.();
    if (this.app?.renderer) this.app.renderer.overlay = { draw: (ctx: CanvasRenderingContext2D, cam: any) => this._draw(ctx, cam) };
  }

  reset() { this.phase = "p1"; this.p1 = null; this.p2 = null; this._cursor = null; this._snapScreen = null; }
  cancel() { this.reset(); }
  finish() { this.execute(); }
  isDrawing() { return this.phase !== "p1"; }
  canFinish() { return this.phase === "ready"; }
  getGuideAnchor() { return this.phase === "p2" ? this.p1 : null; }
  getCursor() { return "crosshair"; }

  update(input: Input) {
    const snap = snapRulerPoint(this.app, input);
    let w = v(snap.x, snap.y);
    this._snapScreen = snap.snapped ? this.app.camera.worldToScreen(snap.x, snap.y) : null;
    if (this.phase === "p2" && this.p1 && (input as any).keys?.shift) {
      const c = constrainRulerAngle(this.p1, w); w = v(c.x, c.y); this._snapScreen = null;
    }
    this._cursor = w;

    if (this.phase === "ready") {
      if (input.doubleClicked) this.execute();
      return;
    }
    if (!input.clicked) return;
    if (this.phase === "p1") { this.p1 = w; this.phase = "p2"; return; }
    if (this.p1 && Math.hypot(w.x - this.p1.x, w.y - this.p1.y) > 1e-4) { this.p2 = w; this.phase = "ready"; }
  }

  /** Schnitt ausführen. true = mindestens ein Objekt geteilt. */
  execute(): boolean {
    if (this.phase !== "ready" || !this.p1 || !this.p2) return false;
    const c = this.p1, d = this.p2;
    const count = this.app.runAction(() => cutAlongLine(this.app, c, d)) || 0;
    this.reset();
    this.app.renderer?.render?.();
    if (count > 0) {
      try { this.app.refreshLabelUI?.(); } catch {}
      toast.success(`${count} ${count === 1 ? "Objekt" : "Objekte"} geteilt`);
    } else toast("Cutter", { description: "Die Linie kreuzt kein teilbares Objekt." });
    return count > 0;
  }

  private _draw(ctx: CanvasRenderingContext2D, cam: any) {
    if (this._snapScreen) drawSnapDot(ctx, this._snapScreen.x, this._snapScreen.y, { ring: true });
    const a = this.p1;
    const b = this.phase === "ready" ? this.p2 : this._cursor;
    if (!a || !b) return;
    let col = "#e5484d";
    try { const s = getComputedStyle(document.documentElement).getPropertyValue("--destructive").trim(); if (s) col = `hsl(${s})`; } catch {}
    const sa = cam.worldToScreen(a.x, a.y), sb = cam.worldToScreen(b.x, b.y);
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.setLineDash(this.phase === "ready" ? [] : [6, 4]);
    ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = col;
    for (const p of [sa, sb]) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- Schnitt */

const deep = (x: any) => (x && typeof x === "object" ? JSON.parse(JSON.stringify(x)) : x);

function scenesOf(app: any): any[] {
  const out: any[] = [];
  try { for (const s of app.scenesById?.values?.() || []) out.push(s); } catch {}
  if (app.scene && !out.includes(app.scene)) out.push(app.scene);
  return out;
}

/** Kopie eines Szenenobjekts gleicher Klasse mit neuer ID (Stil, Name, Beschreibung, Anlagen bleiben). */
function cloneObject(scene: any, obj: any, skip: string[]): any {
  const clone = Object.create(Object.getPrototypeOf(obj));
  for (const k of Object.keys(obj)) {
    if (k === "id" || k === "objCode" || skip.includes(k)) continue;
    clone[k] = deep(obj[k]);
  }
  clone.id = scene._makeId();
  return clone;
}

function crossesBBox(pts: Vec2[], c: Vec2, d: Vec2): boolean {
  if (pts.length < 2) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const box = [v(minX, minY), v(maxX, minY), v(maxX, maxY), v(minX, maxY)];
  for (let i = 0; i < 4; i++) if (edgeCutParams(box[i], box[(i + 1) % 4], 0, c, d).length) return true;
  return false;
}

function collectPoints(x: any, out: Vec2[] = []): Vec2[] {
  if (!x || typeof x !== "object") return out;
  if (typeof x.x === "number" && typeof x.y === "number") { out.push(x); return out; }
  for (const k of Object.keys(x)) collectPoints(x[k], out);
  return out;
}

/** Teilt alle editierbaren, sichtbaren Objekte entlang der Strecke CD. Liefert Anzahl geteilter Objekte. */
export function cutAlongLine(app: any, c: Vec2, d: Vec2): number {
  const scene = app.scene;
  const scenes = scenesOf(app);
  const ok = (labelId: string) => {
    try { return app.labelManager.isEditable(labelId) && app.labelManager.isVisible(labelId); } catch { return true; }
  };
  let count = 0;

  // Bibliothekselemente zuerst in eigenständige Objekte auflösen, wenn die Linie sie kreuzt.
  for (const inst of [...(scene.libraryInstances || [])]) {
    if (!ok(inst.labelId)) continue;
    const def = getDefinition(app, inst.definitionId);
    if (!def) continue;
    const world = instanceWorldSnapshots(def, {
      position: { x: inst.position.x, y: inst.position.y },
      rotationRad: inst.rotationRad, scaleX: inst.scaleX, scaleY: inst.scaleY,
    });
    if (!crossesBBox(collectPoints(world), c, d)) continue;
    createObjectsFromSnapshots(scene, world, inst.labelId);
    scene.removeLibraryInstance(inst);
  }

  // Linien
  for (const seg of [...scene.segments]) {
    if (!ok(seg.labelId)) continue;
    const pieces = cutPolyline([seg.a, seg.b], [seg.bulge || 0], false, c, d);
    if (!pieces || pieces.length < 2) continue;
    const idx = scene.segments.indexOf(seg);
    const parts = pieces.map((p, i) => {
      const s = i === 0 ? seg : cloneObject(scene, seg, []);
      s.a = v(p.points[0].x, p.points[0].y);
      s.b = v(p.points[1].x, p.points[1].y);
      s.bulge = p.bulges[0] || 0;
      if (i > 0) s.arrowStart = false;
      if (i < pieces.length - 1) s.arrowEnd = false;
      return s;
    });
    scene.segments.splice(idx + 1, 0, ...parts.slice(1));
    for (const s of parts.slice(1)) ensureObjectCode(scenes, "segment", s);
    count++;
  }
  try { scene._rebuildSegIdMap(); } catch {}

  // Polygone und Schraffuren
  for (const h of [...scene.hatches]) {
    if (!ok(h.labelId)) continue;
    const idx = scene.hatches.indexOf(h);
    let made: any[] = [];
    if (h.isPolygon && h.closed === false) {
      const pieces = cutPolyline(h.points, h.bulges, false, c, d);
      if (!pieces || pieces.length < 2) continue;
      made = pieces.map((p, i) => {
        const o = i === 0 ? h : cloneObject(scene, h, ["points", "bulges"]);
        o.points = p.points; o.bulges = p.bulges; o.shapeMode = "polygon";
        return o;
      });
    } else {
      const parts = cutRegion(hatchRegion(h), c, d);
      if (!parts) continue;
      made = parts.map((r, i) => {
        const o = i === 0 ? h : cloneObject(scene, h, ["points", "bulges", "holes", "holeBulges"]);
        o.points = r.outer.points; o.bulges = r.outer.bulges;
        o.holes = r.holes.map((x) => x.points); o.holeBulges = r.holes.map((x) => x.bulges);
        if (h.isPolygon) o.shapeMode = "polygon";
        return o;
      });
    }
    scene.hatches.splice(idx + 1, 0, ...made.slice(1));
    for (const o of made.slice(1)) ensureObjectCode(scenes, "hatch", o);
    count++;
  }
  try { scene._rebuildHatchIdMap(); } catch {}

  // Wände (an jedem Schnittpunkt der Bezugslinie)
  for (const wall of [...scene.walls]) {
    if (!ok(wall.labelId)) continue;
    const pieces = cutPolyline(wall.corners, wall.bulges || [], false, c, d);
    if (!pieces || pieces.length < 2) continue;
    let current: any = wall;
    let didSplit = false;
    for (let i = 0; i < pieces.length - 1; i++) {
      const cutP = pieces[i].points[pieces[i].points.length - 1];
      const res = scene.splitWallAt(current, cutP);
      if (!res) break;
      const [wa, wb] = res;
      applyObjectMeta(wa, current);
      applyObjectMeta(wb, current, { withCode: false });
      if (!wb.customName) wb.customName = current.customName;
      ensureObjectCode(scenes, "wall", wb);
      current = wb; didSplit = true;
    }
    if (didSplit) count++;
  }
  try { scene.markWallsDirty?.(); } catch {}

  if (count > 0) {
    try { app.clearSelection?.(); } catch {}
  }
  return count;
}
