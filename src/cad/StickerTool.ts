import { v, Vec2 } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { ClipboardItem } from "./ClipboardManager";
import { StickerDefinition, transformedStickerItems, commitStickerAt } from "./StickerManager";

type Phase = "idle" | "placing" | "rotating";

/**
 * StickerTool: Sticker aus Library platzieren.
 * - "placing": Vorschau folgt der Maus, Klick setzt Anker.
 * - "rotating": Anker fix, Maus = Rotation; Klick committet.
 *   Hub zeigt Winkel; Enter übernimmt numerische Eingabe; Shift = 90°-Snap.
 */
export class StickerTool {
  app: CadApp;
  id = "sticker";

  activeDef: StickerDefinition | null = null;
  phase: Phase = "idle";
  anchor: Vec2 | null = null;
  rotationRad = 0;
  // Wenn der User per Hub einen Wert eingibt, lockt er die Rotation
  rotationLocked = false;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
  }

  cancel() {
    this.phase = "idle";
    this.anchor = null;
    this.rotationRad = 0;
    this.rotationLocked = false;
    this.app.hub.hide();
    this.app.hub.bindCommit(null);
  }

  finish() {}

  getCursor() {
    if (this.phase === "placing" || this.phase === "rotating") return "copy";
    return "crosshair";
  }

  /** Wird aus CadApp aufgerufen, wenn ein Sticker aus der Library zur Platzierung gewählt wird. */
  beginPlacement(def: StickerDefinition) {
    this.activeDef = def;
    this.phase = "placing";
    this.anchor = null;
    this.rotationRad = 0;
    this.rotationLocked = false;
    this.app.clearSelection();
    this.app.setSelectedLabelId(null);
    this.app.pointEditMenu.hide();
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
  }

  update(input: Input) {
    if (!this.activeDef || this.phase === "idle") return;

    if (this.phase === "placing") {
      // Vorschau folgt der Maus (Anker = Mausposition); Klick setzt Anker.
      if (input.clicked) {
        this.anchor = v(input.mouse.wx, input.mouse.wy);
        this.phase = "rotating";
        this.rotationRad = 0;
        this.rotationLocked = false;
        this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
        this.app.hub.setValues(0, 0);
        this.app.hub.updateDisplay(0, 0);
      }
      return;
    }

    // rotating
    if (this.anchor) {
      if (!this.rotationLocked) {
        const dx = input.mouse.wx - this.anchor.x;
        const dy = input.mouse.wy - this.anchor.y;
        let ang = Math.atan2(dy, dx);
        if (input.keys.shift) {
          // 90°-Snap
          const step = Math.PI / 2;
          ang = Math.round(ang / step) * step;
        }
        this.rotationRad = ang;
      }
      const angDeg = (this.rotationRad * 180 / Math.PI + 360) % 360;
      this.app.hub.showAt(input.mouse.sx, input.mouse.sy);
      this.app.hub.updateDisplay(0, angDeg);

      if (input.clicked) {
        this._commit();
      }
    }
  }

  private _applyHubValues(vals: { lengthM: number | null; angleDeg: number | null }) {
    if (this.phase !== "rotating") return;
    if (vals.angleDeg != null && Number.isFinite(vals.angleDeg)) {
      this.rotationRad = vals.angleDeg * Math.PI / 180;
      this.rotationLocked = true;
      const angDeg = (vals.angleDeg % 360 + 360) % 360;
      this.app.hub.setValues(0, angDeg);
      this.app.hub.updateDisplay(0, angDeg);
    }
  }

  private _commit() {
    if (!this.activeDef || !this.anchor) return;
    commitStickerAt(this.app, this.activeDef, this.anchor, this.rotationRad);
    this.app.refreshLabelUI();
    // Direkt für nächste Platzierung bereit
    this.phase = "placing";
    this.anchor = null;
    this.rotationRad = 0;
    this.rotationLocked = false;
    this.app.hub.hide();
  }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    if (!this.activeDef || this.phase === "idle") return;

    const mouse = v(this.app.input.mouse.wx, this.app.input.mouse.wy);
    const anchor = this.phase === "rotating" && this.anchor ? this.anchor : mouse;
    const items = transformedStickerItems(this.activeDef, anchor, this.rotationRad);

    ctx.save();
    ctx.globalAlpha = 0.65;
    this._drawItemsPreview(ctx, cam, items);
    ctx.restore();

    // Anker-Punkt markieren
    const sa = cam.worldToScreen(anchor.x, anchor.y);
    ctx.save();
    let primary = "#4da3ff";
    try { primary = getComputedStyle(document.documentElement).getPropertyValue("--primary") || primary; } catch {}
    ctx.fillStyle = primary;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sa.x, sa.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Rotation: Linie Anker -> Maus
    if (this.phase === "rotating" && this.anchor) {
      const sm = cam.worldToScreen(mouse.x, mouse.y);
      ctx.save();
      ctx.strokeStyle = "rgba(77,163,255,0.55)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sm.x, sm.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  private _drawItemsPreview(ctx: CanvasRenderingContext2D, cam: any, items: ClipboardItem[]) {
    for (const it of items) {
      if (it.kind === "segment") {
        const a = cam.worldToScreen(it.a.x, it.a.y);
        const b = cam.worldToScreen(it.b.x, it.b.y);
        ctx.save();
        ctx.strokeStyle = it.color;
        ctx.lineWidth = Math.max(1, it.thicknessM * cam.scale);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      } else if (it.kind === "hatch") {
        ctx.save();
        const alpha = (it.fillAlphaPct / 100);
        ctx.fillStyle = it.fillColor;
        ctx.globalAlpha = (ctx.globalAlpha) * alpha;
        ctx.beginPath();
        for (let i = 0; i < it.points.length; i++) {
          const p = cam.worldToScreen(it.points[i].x, it.points[i].y);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath(); ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = it.strokeColor;
        ctx.lineWidth = it.strokeWidthPx;
        ctx.beginPath();
        for (let i = 0; i < it.points.length; i++) {
          const p = cam.worldToScreen(it.points[i].x, it.points[i].y);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      } else if (it.kind === "dimension") {
        const a = cam.worldToScreen(it.p1.x, it.p1.y);
        const b = cam.worldToScreen(it.p2.x, it.p2.y);
        ctx.save();
        ctx.strokeStyle = it.lineColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.restore();
      } else if (it.kind === "textbox") {
        const cx = it.center.x, cy = it.center.y;
        const w = it.widthM, h = it.heightM;
        const rot = it.rotationRad || 0;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const corners = [
          { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
        ].map(p => cam.worldToScreen(cx + p.x * cs - p.y * sn, cy + p.x * sn + p.y * cs));
        ctx.save();
        ctx.strokeStyle = it.style.borderEnabled ? it.style.borderColor : "rgba(77,163,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
    }
  }
}
