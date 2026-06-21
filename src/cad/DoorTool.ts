import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import { v, Vec2, dist } from "./geometry";
import { Defaults } from "./constants";
import type { Door, DoorHand, DoorSide, Wall } from "./Scene";
import { projectPointToWall, doorGeometry, pointOnWallAt, drawDoor } from "./doorGeom";

export type DoorMode = "door" | "window";

export interface DoorToolSettings {
  mode: DoorMode;
  widthM: number;
  heightM: number;
  side: DoorSide;
  hand: DoorHand;
  color: string;
}

export class DoorTool {
  app: CadApp;
  id = "door";

  settings: DoorToolSettings = {
    mode: "door",
    widthM: 0.9,
    heightM: 2.1,
    side: "inner",
    hand: "left",
    color: "#111111",
  };

  /** ID der aktuell selektierten Tür (für Inspector). */
  selectedDoorId: string | null = null;
  /** Hover-Wand für Platzierungs-Preview. */
  private _hoverWallId: string | null = null;
  private _hoverPosM: number = 0;
  /** Drag-Resize-State. */
  private _dragHandle: "left" | "right" | null = null;
  /** Drag-Move-State (Verschieben entlang Wand). */
  private _dragMove: boolean = false;
  private _dragMoveOffsetM: number = 0;
  /** Settings-Update-Callback (von CadEditor gesetzt) — feuert wenn Selection wechselt. */
  onSelectionChange: ((doorId: string | null) => void) | null = null;

  constructor(app: CadApp) { this.app = app; }

  activate() {
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
  }
  cancel() {
    this._dragHandle = null;
    this._dragMove = false;
    this.app.renderer.overlay = null;
  }
  finish() { this.cancel(); }

  /** Findet die nächstgelegene Wand und Position auf ihr. */
  private _hitWall(input: Input): { wall: Wall; posM: number } | null {
    const wm = v(input.mouse.wx, input.mouse.wy);
    let best: { wall: Wall; posM: number; d: number } | null = null;
    for (const w of this.app.scene.walls) {
      if (w.corners.length < 2) continue;
      const proj = projectPointToWall(w, wm);
      if (!proj) continue;
      // Toleranz: halbe Wandstärke + etwas Spielraum
      const tol = w.thicknessM * 0.7 + 0.05;
      if (proj.dist > tol) continue;
      if (!best || proj.dist < best.d) best = { wall: w, posM: proj.s, d: proj.dist };
    }
    return best ? { wall: best.wall, posM: best.posM } : null;
  }

  /** Test ob ein Bildschirm-Punkt nahe einem Tür-Endpunkt-Handle ist. */
  private _hitDoorHandle(input: Input): { door: Door; which: "left" | "right" } | null {
    const cam = this.app.camera;
    const sx = input.mouse.sx, sy = input.mouse.sy;
    for (const d of this.app.scene.doors) {
      if (d.id !== this.selectedDoorId) continue;
      const w = this.app.scene.getWallById(d.wallId);
      if (!w) continue;
      const g = doorGeometry(w, d);
      if (!g) continue;
      const sL = cam.worldToScreen(g.leftEnd.x, g.leftEnd.y);
      const sR = cam.worldToScreen(g.rightEnd.x, g.rightEnd.y);
      if (Math.hypot(sx - sL.x, sy - sL.y) <= 8) return { door: d, which: "left" };
      if (Math.hypot(sx - sR.x, sy - sR.y) <= 8) return { door: d, which: "right" };
    }
    return null;
  }

  /** Test ob ein Bildschirm-Punkt nahe dem Center-Move-Handle ist. */
  private _hitDoorCenter(input: Input): Door | null {
    const cam = this.app.camera;
    const sx = input.mouse.sx, sy = input.mouse.sy;
    for (const d of this.app.scene.doors) {
      if (d.id !== this.selectedDoorId) continue;
      const w = this.app.scene.getWallById(d.wallId);
      if (!w) continue;
      const g = doorGeometry(w, d);
      if (!g) continue;
      const sC = cam.worldToScreen(g.center.x, g.center.y);
      if (Math.hypot(sx - sC.x, sy - sC.y) <= 8) return d;
    }
    return null;
  }

  /** Test ob ein Welt-Punkt eine Tür trifft (für Selektion). */
  private _hitDoor(input: Input): Door | null {
    const wm = v(input.mouse.wx, input.mouse.wy);
    for (const d of this.app.scene.doors) {
      const w = this.app.scene.getWallById(d.wallId);
      if (!w) continue;
      const g = doorGeometry(w, d);
      if (!g) continue;
      // Treffer-Rechteck: entlang Wand widthM, quer Wandstärke
      const dx = wm.x - g.center.x, dy = wm.y - g.center.y;
      const along = dx * g.tan.x + dy * g.tan.y;
      const across = dx * g.n.x + dy * g.n.y;
      if (Math.abs(along) <= d.widthM / 2 && Math.abs(across) <= Math.max(w.thicknessM, 0.05) / 2 + 0.04) {
        return d;
      }
    }
    return null;
  }

  selectDoor(id: string | null) {
    if (this.selectedDoorId === id) return;
    this.selectedDoorId = id;
    if (id) {
      const d = this.app.scene.getDoorById(id);
      if (d) {
        this.settings.widthM = d.widthM;
        this.settings.heightM = d.heightM;
        this.settings.side = d.side;
        this.settings.hand = d.hand;
        this.settings.color = d.color;
      }
    }
    this.onSelectionChange?.(id);
  }

  /** Wendet aktuelle settings auf die selektierte Tür an (für Inspector-Updates). */
  applySettingsToSelection() {
    if (!this.selectedDoorId) return;
    const d = this.app.scene.getDoorById(this.selectedDoorId);
    if (!d) return;
    const w = this.app.scene.getWallById(d.wallId);
    if (!w) return;
    const { total } = (function() {
      let total = 0;
      for (let i = 1; i < w.corners.length; i++) total += dist(w.corners[i - 1], w.corners[i]);
      return { total };
    })();
    d.widthM = Math.max(0.1, Math.min(this.settings.widthM, total));
    d.heightM = this.settings.heightM;
    d.side = this.settings.side;
    d.hand = this.settings.hand;
    d.color = this.settings.color;
    // Position innerhalb Wand halten
    d.posM = Math.max(d.widthM / 2, Math.min(total - d.widthM / 2, d.posM));
  }

  update(input: Input) {
    // Hover für Platzierung berechnen
    this._hoverWallId = null;
    const hit = this._hitWall(input);
    if (hit) {
      // Begrenzung: Tür muss komplett auf der Wand liegen
      let total = 0;
      for (let i = 1; i < hit.wall.corners.length; i++) total += dist(hit.wall.corners[i - 1], hit.wall.corners[i]);
      const half = this.settings.widthM / 2;
      const clamped = Math.max(half, Math.min(total - half, hit.posM));
      this._hoverWallId = hit.wall.id;
      this._hoverPosM = clamped;
    }

    // Drag-Resize (Endpunkt-Handles)
    if (this._dragHandle && this.selectedDoorId) {
      if (!input.mouse.left) { this._dragHandle = null; }
      else {
        const d = this.app.scene.getDoorById(this.selectedDoorId);
        const w = d ? this.app.scene.getWallById(d.wallId) : null;
        if (d && w) {
          const proj = projectPointToWall(w, v(input.mouse.wx, input.mouse.wy));
          if (proj) {
            let total = 0;
            for (let i = 1; i < w.corners.length; i++) total += dist(w.corners[i - 1], w.corners[i]);
            const fixedSide = this._dragHandle === "left" ? d.posM + d.widthM / 2 : d.posM - d.widthM / 2;
            const newOther = Math.max(0, Math.min(total, proj.s));
            const newCenter = (fixedSide + newOther) / 2;
            const newWidth = Math.max(0.1, Math.abs(fixedSide - newOther));
            d.widthM = newWidth;
            d.posM = newCenter;
            this.settings.widthM = newWidth;
            this.onSelectionChange?.(d.id);
          }
        }
        return;
      }
    }

    // Drag-Move (Center-Handle: verschiebt Tür entlang Wand)
    if (this._dragMove && this.selectedDoorId) {
      if (!input.mouse.left) { this._dragMove = false; }
      else {
        const d = this.app.scene.getDoorById(this.selectedDoorId);
        const w = d ? this.app.scene.getWallById(d.wallId) : null;
        if (d && w) {
          const proj = projectPointToWall(w, v(input.mouse.wx, input.mouse.wy));
          if (proj) {
            let total = 0;
            for (let i = 1; i < w.corners.length; i++) total += dist(w.corners[i - 1], w.corners[i]);
            const half = d.widthM / 2;
            const target = proj.s - this._dragMoveOffsetM;
            d.posM = Math.max(half, Math.min(total - half, target));
            this.onSelectionChange?.(d.id);
          }
        }
        return;
      }
    }

    if (input.clicked) {
      // 1) Center-Handle → Drag-Move
      const centerHit = this._hitDoorCenter(input);
      if (centerHit) {
        const w = this.app.scene.getWallById(centerHit.wallId);
        if (w) {
          const proj = projectPointToWall(w, v(input.mouse.wx, input.mouse.wy));
          this._dragMoveOffsetM = proj ? (proj.s - centerHit.posM) : 0;
        }
        this._dragMove = true;
        return;
      }
      // 2) Endpunkt-Handle → Drag-Resize
      const handleHit = this._hitDoorHandle(input);
      if (handleHit) { this._dragHandle = handleHit.which; return; }
      // 3) Tür-Click → selektieren
      const doorHit = this._hitDoor(input);
      if (doorHit) { this.selectDoor(doorHit.id); return; }
      // 4) Wand-Click → neue Tür platzieren (wenn Modus = Tür)
      if (this.settings.mode === "door" && this._hoverWallId) {
        const w = this.app.scene.getWallById(this._hoverWallId);
        if (w) {
          const door = this.app.scene.createDoor({
            wallId: w.id,
            posM: this._hoverPosM,
            widthM: this.settings.widthM,
            heightM: this.settings.heightM,
            side: this.settings.side,
            hand: this.settings.hand,
            color: this.settings.color,
            labelId: w.labelId,
          });
          this.selectDoor(door.id);
        }
        return;
      }
      // 5) Sonst: Selektion aufheben
      this.selectDoor(null);
    }
  }

  /** Zeichnet Hover-Preview + Selection-Handles. */
  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Hover-Preview
    if (this._hoverWallId && this.settings.mode === "door" && !this._dragHandle) {
      const w = this.app.scene.getWallById(this._hoverWallId);
      if (w) {
        const fake: Door = {
          id: "_preview", wallId: w.id, posM: this._hoverPosM,
          widthM: this.settings.widthM, heightM: this.settings.heightM,
          side: this.settings.side, hand: this.settings.hand,
          color: this.settings.color, labelId: w.labelId,
        } as Door;
        drawDoor(ctx, cam, w, fake, 0.5);
      }
    }
    // Selection-Handles
    if (this.selectedDoorId) {
      const d = this.app.scene.getDoorById(this.selectedDoorId);
      const w = d ? this.app.scene.getWallById(d.wallId) : null;
      if (d && w) {
        const g = doorGeometry(w, d);
        if (g) {
          const sL = cam.worldToScreen(g.leftEnd.x, g.leftEnd.y);
          const sR = cam.worldToScreen(g.rightEnd.x, g.rightEnd.y);
          const sC = cam.worldToScreen(g.center.x, g.center.y);
          ctx.save();
          // Endpunkt-Handles (Resize)
          for (const s of [sL, sR]) {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#4da3ff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(s.x - 5, s.y - 5, 10, 10);
            ctx.fill();
            ctx.stroke();
          }
          // Center-Handle (Move) — rund, dezent
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#4da3ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sC.x, sC.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Innerer Punkt
          ctx.fillStyle = "#4da3ff";
          ctx.beginPath();
          ctx.arc(sC.x, sC.y, 2, 0, Math.PI * 2);
          ctx.fill();

          // Distanzanzeige beim Verschieben — modern schlicht
          if (this._dragMove) {
            // Distanz: posM vom Wandanfang
            const txt = `${d.posM.toFixed(2)} m`;
            ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
            const padX = 8, padY = 4;
            const tw = ctx.measureText(txt).width;
            const bx = sC.x + 12, by = sC.y - 28;
            const bw = tw + padX * 2, bh = 20;
            ctx.fillStyle = "rgba(17,24,39,0.92)";
            ctx.beginPath();
            const r = 6;
            ctx.moveTo(bx + r, by);
            ctx.lineTo(bx + bw - r, by);
            ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
            ctx.lineTo(bx + bw, by + bh - r);
            ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
            ctx.lineTo(bx + r, by + bh);
            ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
            ctx.lineTo(bx, by + r);
            ctx.quadraticCurveTo(bx, by, bx + r, by);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.textBaseline = "middle";
            ctx.fillText(txt, bx + padX, by + bh / 2);
          }
          ctx.restore();
        }
      }
    }
  }
}


