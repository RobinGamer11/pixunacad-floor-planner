/**
 * LibraryPlacementTool — Platzierung von Bibliotheksobjekten.
 *
 * Ablauf (analog zum bewährten Sticker-Ablauf, aber eigenständig):
 *   „placing“  → Geist-Vorschau folgt dem Cursor, Klick setzt den Ankerpunkt
 *   „rotating“ → Anker fix, Mausbewegung dreht, Klick bestätigt
 *   Esc        → Abbruch
 */
import { v, type Vec2 } from "../geometry";
import type { CadApp } from "../CadApp";
import type { Input } from "../Input";
import type { Camera } from "../Camera";
import { snapshotPoints, transformSnapshots } from "./libraryGeometry";
import type { LibraryDefinition } from "./types";

type Phase = "idle" | "placing" | "rotating";

export class LibraryPlacementTool {
  app: CadApp;
  id = "library";

  activeDef: LibraryDefinition | null = null;
  phase: Phase = "idle";
  anchor: Vec2 | null = null;
  rotationRad = 0;
  scale = 1;

  /** UI-Callback (Panel-Status). */
  onStateChange?: () => void;

  constructor(app: CadApp) {
    this.app = app;
  }

  get activeDefinitionId(): string | null { return this.activeDef?.id || null; }

  activate() {
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.phase = "idle";
    this.activeDef = null;
    this.anchor = null;
    this.rotationRad = 0;
    this.app.hub.hide();
    this.onStateChange?.();
  }

  finish() {}

  getCursor() { return this.phase === "idle" ? "default" : "copy"; }

  /** Startet die Platzierung einer Definition. */
  beginPlacement(def: LibraryDefinition, scale = 1) {
    this.activeDef = def;
    this.phase = "placing";
    this.anchor = null;
    this.rotationRad = 0;
    this.scale = scale > 0 ? scale : 1;
    this.app.clearSelection();
    this.app.pointEditMenu.hide();
    this.onStateChange?.();
  }

  update(input: Input) {
    if (!this.activeDef || this.phase === "idle") return;
    const mouseW = v(input.mouse.wx, input.mouse.wy);

    if (this.phase === "placing") {
      if (input.clicked) {
        const snap = this.app.topology.findBestSnap(v(input.mouse.sx, input.mouse.sy), mouseW);
        this.anchor = (snap && snap.world) ? { x: snap.world.x, y: snap.world.y } : mouseW;
        this.phase = "rotating";
        this.onStateChange?.();
      }
      return;
    }

    if (this.phase === "rotating" && this.anchor) {
      let a = Math.atan2(mouseW.y - this.anchor.y, mouseW.x - this.anchor.x);
      if (input.keys.shift) a = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
      this.rotationRad = a;
      if (input.clicked) this.commit();
    }
  }

  /** Setzt die Instanz endgültig (ein Undo-Schritt) und bleibt platzierbereit. */
  commit() {
    if (!this.activeDef || !this.anchor) return;
    this.app.scene.createLibraryInstance({
      definitionId: this.activeDef.id,
      definitionVersion: this.activeDef.version,
      position: { x: this.anchor.x, y: this.anchor.y },
      rotationRad: this.rotationRad,
      scaleX: this.scale,
      scaleY: this.scale,
      labelId: this.app.activeDrawLabelId,
    });
    this.anchor = null;
    this.rotationRad = 0;
    this.phase = "placing";
    this.app.refreshLabelUI?.();
    this.app.commitHistorySnapshot?.();
    this.onStateChange?.();
  }

  onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === "Escape" && this.phase !== "idle") {
      if (this.phase === "rotating") { this.phase = "placing"; this.anchor = null; }
      else this.cancel();
      this.onStateChange?.();
      return true;
    }
    return false;
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    if (!this.activeDef || this.phase === "idle") return;
    const input: any = (this.app as any).input;
    const pos = this.anchor || { x: input?.mouse?.wx ?? 0, y: input?.mouse?.wy ?? 0 };
    const snaps = transformSnapshots(this.activeDef.geometry, {
      position: pos, rotationRad: this.rotationRad, scaleX: this.scale, scaleY: this.scale,
    });
    ctx.save();
    ctx.strokeStyle = "rgba(120,110,255,0.9)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    for (const snap of snaps) {
      const pts = snapshotPoints(snap);
      if (pts.length < 2) continue;
      ctx.beginPath();
      const p0 = cam.worldToScreen(pts[0].x, pts[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) {
        const p = cam.worldToScreen(pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
      }
      if (snap.kind === "hatch" || snap.kind === "wall" || snap.kind === "textBox" || snap.kind === "table") ctx.closePath();
      ctx.stroke();
    }
    // Ankerkreuz
    const a = cam.worldToScreen(pos.x, pos.y);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(a.x - 8, a.y); ctx.lineTo(a.x + 8, a.y);
    ctx.moveTo(a.x, a.y - 8); ctx.lineTo(a.x, a.y + 8);
    ctx.stroke();
    ctx.restore();
  }
}
