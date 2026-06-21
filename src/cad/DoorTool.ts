import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import { v, Vec2, dist } from "./geometry";
import { Defaults } from "./constants";
import type { Door, DoorHand, DoorSide, DoorEdge, Wall } from "./Scene";
import { projectPointToWall, doorGeometry, pointOnWallAt, drawDoor } from "./doorGeom";

export type DoorMode = "door" | "window";

export interface DoorToolSettings {
  mode: DoorMode;
  widthM: number;
  heightM: number;
  side: DoorSide;
  hand: DoorHand;
  edge: DoorEdge;
  color: string;
  jambEnabled: boolean;
  jambColor: string;
  jambLenM: number;
  jambThickM: number;
  /** Flügeltür anzeigen (default true für door, false für window). */
  sashEnabled: boolean;
  /** Farbe der Fenster-Linien. */
  glassColor: string;
  /** Dicke des Fenster-Elements (Abstand der Linien, m). 0 = auto. */
  glassThickM: number;
  /** Füllfarbe zwischen den Fensterlinien. "" = keine Füllung. */
  glassFillColor: string;
}

export interface DoorHubState {
  visible: boolean;
  screenX: number;
  screenY: number;
  doorId: string | null;
  posM: number;
  widthM: number;
  /** true wenn aktuell im Follow-Move (ganzes Element folgt Maus). */
  moving: boolean;
  /** true wenn aktuell im Follow-Resize (Breite folgt Maus). */
  resizing: boolean;
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
    edge: "center",
    color: "#111111",
    jambEnabled: true,
    jambColor: "#9aa3ad",
    jambLenM: 0.06,
    jambThickM: 0,
    sashEnabled: true,
    glassColor: "#2a2f36",
    glassThickM: 0,
    glassFillColor: "",
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
  /** Follow-Move: Tür folgt Maus ohne gedrückte Taste; nächster Klick fixiert. */
  private _followMove: boolean = false;
  /** Settings-Update-Callback (von CadEditor gesetzt) — feuert wenn Selection wechselt. */
  onSelectionChange: ((doorId: string | null) => void) | null = null;
  /** Hubbox-Update-Callback (von CadEditor gesetzt). */
  onHubChange: ((state: DoorHubState) => void) | null = null;
  /** Wenn false: nur Selektion/Bearbeitung, keine neue Tür-Platzierung. */
  placementMode: boolean = true;
  /** Hub-Box-State. */
  private _hub: DoorHubState = { visible: false, screenX: 0, screenY: 0, doorId: null, posM: 0, moving: false };

  constructor(app: CadApp) { this.app = app; }

  activate() {
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.placementMode = true;
    this._hideHub();
  }
  cancel() {
    this._dragHandle = null;
    this._dragMove = false;
    this._followMove = false;
    this._hideHub();
    this.app.renderer.overlay = null;
  }
  finish() { this.cancel(); }

  /** Hubbox-API: zeigt die Box bei Schirmkoordinaten an, gebunden an die selektierte Tür. */
  private _showHub(sx: number, sy: number) {
    const d = this.selectedDoorId ? this.app.scene.getDoorById(this.selectedDoorId) : null;
    if (!d) { this._hideHub(); return; }
    this._hub = {
      visible: true, screenX: sx, screenY: sy,
      doorId: d.id, posM: d.posM, moving: this._followMove,
    };
    this.onHubChange?.(this._hub);
  }
  private _hideHub() {
    if (!this._hub.visible && !this._hub.doorId) return;
    this._hub = { visible: false, screenX: 0, screenY: 0, doorId: null, posM: 0, moving: false };
    this.onHubChange?.(this._hub);
  }
  private _refreshHub() {
    if (!this._hub.visible || !this._hub.doorId) return;
    const d = this.app.scene.getDoorById(this._hub.doorId);
    if (!d) { this._hideHub(); return; }
    const w = this.app.scene.getWallById(d.wallId);
    if (!w) { this._hideHub(); return; }
    const g = doorGeometry(w, d);
    if (!g) return;
    const sC = this.app.camera.worldToScreen(g.center.x, g.center.y);
    this._hub = { ...this._hub, screenX: sC.x, screenY: sC.y - 28, posM: d.posM, moving: this._followMove };
    this.onHubChange?.(this._hub);
  }
  /** Startet Follow-Move (Tür folgt Maus; nächster Klick fixiert). Von Hubbox aufgerufen. */
  beginFollowMove() {
    if (!this.selectedDoorId) return;
    this._followMove = true;
    this._refreshHub();
  }
  /** Setzt posM exakt (von Hubbox aufgerufen). */
  setSelectedPosM(posM: number) {
    if (!this.selectedDoorId) return;
    const d = this.app.scene.getDoorById(this.selectedDoorId);
    const w = d ? this.app.scene.getWallById(d.wallId) : null;
    if (!d || !w) return;
    let total = 0;
    for (let i = 1; i < w.corners.length; i++) total += dist(w.corners[i - 1], w.corners[i]);
    const half = d.widthM / 2;
    d.posM = Math.max(half, Math.min(total - half, posM));
    this._refreshHub();
  }
  hideHub() { this._hideHub(); }

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

  /** Test ob ein Bildschirm-Punkt nahe einem Tür-Endpunkt-Handle ist (alle Türen). */
  private _hitDoorHandle(input: Input): { door: Door; which: "left" | "right" } | null {
    const cam = this.app.camera;
    const sx = input.mouse.sx, sy = input.mouse.sy;
    // Selektierte Tür zuerst priorisieren
    const ordered = [...this.app.scene.doors].sort((a, b) =>
      (a.id === this.selectedDoorId ? -1 : 0) - (b.id === this.selectedDoorId ? -1 : 0));
    for (const d of ordered) {
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

  /** Test ob ein Welt-Punkt eine Tür trifft (für Selektion). Robust: Blatt, Laibung, Schwung. */
  hitDoorAt(input: Input): Door | null { return this._hitDoor(input); }
  private _hitDoor(input: Input): Door | null {
    const cam = this.app.camera;
    const wm = v(input.mouse.wx, input.mouse.wy);
    const sx = input.mouse.sx, sy = input.mouse.sy;
    // Pixel-Toleranz in Welt-Einheiten
    const pxTolWorld = 8 / Math.max(cam.scale || 1, 1e-6);
    // Selektierte Tür zuerst
    const ordered = [...this.app.scene.doors].sort((a, b) =>
      (a.id === this.selectedDoorId ? -1 : 0) - (b.id === this.selectedDoorId ? -1 : 0));
    for (const d of ordered) {
      const w = this.app.scene.getWallById(d.wallId);
      if (!w) continue;
      const g = doorGeometry(w, d);
      if (!g) continue;
      const dx = wm.x - g.center.x, dy = wm.y - g.center.y;
      const along = dx * g.tan.x + dy * g.tan.y;
      const across = dx * g.n.x + dy * g.n.y;
      const tol = Math.max(0.05, pxTolWorld);
      // (a) Wandöffnungs-Streifen inkl. Laibung über volle Wandstärke
      if (Math.abs(along) <= d.widthM / 2 + tol
          && Math.abs(across) <= Math.max(w.thicknessM, 0.05) / 2 + tol) {
        return d;
      }
      // (b) Blatt + Schwungbereich (Viertelkreis um hinge mit Radius lichteM)
      const hx = wm.x - g.hinge.x, hy = wm.y - g.hinge.y;
      const rad = Math.hypot(hx, hy);
      const handSign = d.hand === "left" ? -1 : +1;
      const openSign = d.side === "inner" ? +1 : -1;
      const aAlong = hx * g.tan.x + hy * g.tan.y;
      const aAcross = hx * g.n.x + hy * g.n.y;
      // (b1) Innerhalb des Viertelkreis-Sektors (Schwung-Füllung)
      if (rad <= g.lichteM + tol
          && aAlong * (-handSign) >= -tol
          && aAcross * openSign >= -tol) {
        return d;
      }
      // (b2) Pixel-Toleranz zum Türblatt-Linienstück (hinge → leafEnd)
      const sH = cam.worldToScreen(g.hinge.x, g.hinge.y);
      const sLeaf = cam.worldToScreen(g.leafEnd.x, g.leafEnd.y);
      if (_distPointToSegmentPx(sx, sy, sH.x, sH.y, sLeaf.x, sLeaf.y) <= 8) return d;
      // (b3) Pixel-Toleranz zum Schwung-Bogen
      const radPx = Math.hypot(sLeaf.x - sH.x, sLeaf.y - sH.y);
      const distToCenter = Math.hypot(sx - sH.x, sy - sH.y);
      if (Math.abs(distToCenter - radPx) <= 6) {
        // Im Sektor?
        if (aAlong * (-handSign) >= -tol && aAcross * openSign >= -tol) return d;
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
        this.settings.mode = d.kind;
        this.settings.widthM = d.widthM;
        this.settings.heightM = d.heightM;
        this.settings.side = d.side;
        this.settings.hand = d.hand;
        this.settings.edge = d.edge;
        this.settings.color = d.color;
        this.settings.jambEnabled = d.jambEnabled;
        this.settings.jambColor = d.jambColor;
        this.settings.jambLenM = d.jambLenM;
        this.settings.jambThickM = d.jambThickM;
        this.settings.sashEnabled = d.sashEnabled;
        this.settings.glassColor = d.glassColor;
      }
    } else {
      this._hideHub();
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
    d.kind = this.settings.mode;
    d.widthM = Math.max(0.1, Math.min(this.settings.widthM, total));
    d.heightM = this.settings.heightM;
    d.side = this.settings.side;
    d.hand = this.settings.hand;
    d.edge = this.settings.edge;
    d.color = this.settings.color;
    d.jambEnabled = this.settings.jambEnabled;
    d.jambColor = this.settings.jambColor;
    d.jambLenM = Math.max(0, this.settings.jambLenM);
    d.jambThickM = Math.max(0, this.settings.jambThickM);
    d.sashEnabled = this.settings.sashEnabled;
    d.glassColor = this.settings.glassColor;
    // Position innerhalb Wand halten
    d.posM = Math.max(d.widthM / 2, Math.min(total - d.widthM / 2, d.posM));
    this._refreshHub();
  }

  update(input: Input) {
    // Hover für Platzierung berechnen
    this._hoverWallId = null;
    if (this.placementMode) {
      const hit = this._hitWall(input);
      if (hit) {
        let total = 0;
        for (let i = 1; i < hit.wall.corners.length; i++) total += dist(hit.wall.corners[i - 1], hit.wall.corners[i]);
        const half = this.settings.widthM / 2;
        const clamped = Math.max(half, Math.min(total - half, hit.posM));
        this._hoverWallId = hit.wall.id;
        this._hoverPosM = clamped;
      }
    }

    // Follow-Move: Tür folgt Maus ohne gedrückte Taste
    if (this._followMove && this.selectedDoorId) {
      const d = this.app.scene.getDoorById(this.selectedDoorId);
      const w = d ? this.app.scene.getWallById(d.wallId) : null;
      if (d && w) {
        const proj = projectPointToWall(w, v(input.mouse.wx, input.mouse.wy));
        if (proj) {
          let total = 0;
          for (let i = 1; i < w.corners.length; i++) total += dist(w.corners[i - 1], w.corners[i]);
          const half = d.widthM / 2;
          d.posM = Math.max(half, Math.min(total - half, proj.s));
          this._refreshHub();
        }
      }
      if (input.clicked) {
        this._followMove = false;
        this._refreshHub();
        return;
      }
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
            this._refreshHub();
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
            this._refreshHub();
          }
        }
        return;
      }
    }

    if (input.clicked) {
      // 1) Endpunkt-Handle → Tür selektieren + Hubbox an Handle anzeigen.
      //    Bei bereits selektierter Tür zusätzlich Drag-Resize starten.
      const handleHit = this._hitDoorHandle(input);
      if (handleHit) {
        const wasSelected = this.selectedDoorId === handleHit.door.id;
        if (!wasSelected) this.selectDoor(handleHit.door.id);
        const w = this.app.scene.getWallById(handleHit.door.wallId);
        const g = w ? doorGeometry(w, handleHit.door) : null;
        if (g) {
          const which = handleHit.which === "left" ? g.leftEnd : g.rightEnd;
          const s = this.app.camera.worldToScreen(which.x, which.y);
          this._showHub(s.x, s.y - 28);
        }
        if (wasSelected) this._dragHandle = handleHit.which;
        return;
      }
      // 2) Center-Handle → Drag-Move
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
      // 3) Tür-Click → selektieren + Hubbox an Türmitte
      const doorHit = this._hitDoor(input);
      if (doorHit) {
        this.selectDoor(doorHit.id);
        const w = this.app.scene.getWallById(doorHit.wallId);
        const g = w ? doorGeometry(w, doorHit) : null;
        if (g) {
          const sC = this.app.camera.worldToScreen(g.center.x, g.center.y);
          this._showHub(sC.x, sC.y - 28);
        }
        return;
      }
      // 4) Wand-Click → neue Tür/Fenster platzieren (nur im Platzierungs-Modus)
      if (this.placementMode && this._hoverWallId) {
        const w = this.app.scene.getWallById(this._hoverWallId);
        if (w) {
          const door = this.app.scene.createDoor({
            wallId: w.id,
            posM: this._hoverPosM,
            kind: this.settings.mode,
            widthM: this.settings.widthM,
            heightM: this.settings.heightM,
            side: this.settings.side,
            hand: this.settings.hand,
            edge: this.settings.edge,
            color: this.settings.color,
            jambEnabled: this.settings.jambEnabled,
            jambColor: this.settings.jambColor,
            jambLenM: this.settings.jambLenM,
            jambThickM: this.settings.jambThickM,
            sashEnabled: this.settings.sashEnabled,
            glassColor: this.settings.glassColor,
            labelId: w.labelId,
          });
          this.selectDoor(door.id);
        }
        return;
      }
      // 5) Sonst: Selektion aufheben — im Edit-Modus zurück zum Auswahlwerkzeug
      this.selectDoor(null);
      this._hideHub();
      if (!this.placementMode) this.app.setTool("select");
    }
  }

  /** Zeichnet Hover-Preview + Selection-Handles. */
  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Hover-Preview
    if (this._hoverWallId && !this._dragHandle && this.placementMode) {
      const w = this.app.scene.getWallById(this._hoverWallId);
      if (w) {
        const fake: Door = {
          id: "_preview", wallId: w.id, posM: this._hoverPosM,
          kind: this.settings.mode,
          widthM: this.settings.widthM, heightM: this.settings.heightM,
          side: this.settings.side, hand: this.settings.hand, edge: this.settings.edge,
          color: this.settings.color,
          jambEnabled: this.settings.jambEnabled, jambColor: this.settings.jambColor,
          jambLenM: this.settings.jambLenM, jambThickM: this.settings.jambThickM,
          sashEnabled: this.settings.sashEnabled, glassColor: this.settings.glassColor,
          labelId: w.labelId,
        } as Door;
        drawDoor(ctx, cam, w, fake, 0.5);
      }
    }
    // Endpunkt-Snaps für ALLE Türen (anklickbar zum Selektieren)
    {
      ctx.save();
      for (const d of this.app.scene.doors) {
        if (d.id === this.selectedDoorId) continue;
        const w = this.app.scene.getWallById(d.wallId);
        if (!w) continue;
        const g = doorGeometry(w, d);
        if (!g) continue;
        const sL = cam.worldToScreen(g.leftEnd.x, g.leftEnd.y);
        const sR = cam.worldToScreen(g.rightEnd.x, g.rightEnd.y);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#9ca3af";
        ctx.lineWidth = 1.2;
        for (const s of [sL, sR]) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
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

function _distPointToSegmentPx(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t, qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
}



