/**
 * PlanController (Step 4):
 * - Verarbeitet Drop von Sheet-Drags auf den aktiven Plan (erzeugt Projektionen).
 * - Übernimmt Plan-Modus-Input (Hover, Klick, Drag) und priorisiert über andere Tools.
 * - Zeigt Mini-HUB (DOM) bei selektierter Projektion: Skalieren, Drehen, Löschen.
 *
 * Bewusst eigenständig — KEINE Integration in SelectTool/HatchTool, damit der
 * Zeichenmodus unverändert bleibt.
 */
import { CadApp } from "./CadApp";
import { Plan, Projection } from "./PlanManager";
import {
  flattenSheetSnapshot,
  ProjectionItem,
  drawProjection,
  hitTestProjection,
  computeProjectionLayout,
  itemsBoundsM,
  sheetToPlanFactor,
} from "./PlanProjections";
import { makeHubDraggable, resetHubUserMoved, hubWasUserMoved } from "./hubDrag";

type HandleKind = "body" | "edge-left" | "edge-right" | "edge-top" | "edge-bottom" | "corner";

interface DragState {
  kind: "move" | "edge-left" | "edge-right" | "edge-top" | "edge-bottom";
  projectionId: string;
  startSx: number;
  startSy: number;
  origX: number;
  origY: number;
  origClip: { left: number; right: number; top: number; bottom: number };
}

export class PlanController {
  app: CadApp;

  /** Cache: projectionId → Items (aus Snapshot geflattent). */
  private _itemsCache = new Map<string, ProjectionItem[]>();

  selectedProjectionId: string | null = null;
  hoverProjectionId: string | null = null;
  hoverHandle: "body" | "edge-left" | "edge-right" | "edge-top" | "edge-bottom" | null = null;

  private _drag: DragState | null = null;

  // HUB DOM
  private _hubEl: HTMLDivElement | null = null;

  constructor(app: CadApp) {
    this.app = app;
  }

  /** Liefert Items zur Projektion, mit Cache. */
  getItems(proj: Projection): ProjectionItem[] {
    let items = this._itemsCache.get(proj.id);
    if (!items) {
      items = flattenSheetSnapshot(proj.sceneSnapshot);
      this._itemsCache.set(proj.id, items);
    }
    return items;
  }

  /** Cache leeren (bei History-Restore aufrufen). */
  invalidateCache() {
    this._itemsCache.clear();
  }

  /** Aktueller Plan oder null. */
  private _activePlan(): Plan | null {
    if (!this.app.activePlanId) return null;
    return this.app.planManager.getById(this.app.activePlanId);
  }

  /**
   * Erzeugt eine Projektion auf dem aktiven Plan, ausgehend von einem Sheet-Drop.
   * sheetId = Quell-Blatt. (sx, sy) = Drop-Position in Bildschirm-Pixel.
   */
  createProjectionFromSheet(sheetId: string, sx: number, sy: number): Projection | null {
    const plan = this._activePlan();
    if (!plan) return null;
    const sheet = this.app.sheetManager.getById(sheetId);
    if (!sheet) return null;
    const sheetScene = this.app.scenesById.get(sheetId);
    if (!sheetScene) return null;

    // Snapshot über CadApp's bestehende Serialisierung.
    const snapshot = (this.app as any)._serializeOneScene(sheetScene);
    const items = flattenSheetSnapshot(snapshot);
    const bb = itemsBoundsM(items);
    const factor = sheetToPlanFactor(this._sheetScaleValue(sheetId));

    // Drop-Punkt in Plan-Welt (Meter) → mm
    const world = this.app.camera.screenToWorld(sx, sy);
    const xMm = world.x * 1000;
    const yMm = world.y * 1000;

    const proj: Projection = {
      id: `proj-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      sourceSheetId: sheetId,
      sceneSnapshot: snapshot,
      scale: this._sheetScaleValue(sheetId),
      x: xMm,
      y: yMm,
      rotation: 0,
      clip: { left: 0, right: 0, top: 0, bottom: 0 },
    };
    // Falls Sheet leer ist: kleines Default-Rechteck (sonst nichts sichtbar).
    if (!isFinite(bb.minX) || bb.maxX === bb.minX) { /* nothing */ }
    void factor;

    this.app.planManager.addProjection(plan.id, proj);
    this._itemsCache.set(proj.id, items);
    this.selectedProjectionId = proj.id;
    this._showHub();
    this.app.refreshPlanUI();
    // History-Snapshot
    this.app.commitHistorySnapshot();
    return proj;
  }

  private _sheetScaleValue(sheetId: string): number {
    // Lokal aufgelöst, um Zirkular-Imports zu vermeiden.
    const sheet = this.app.sheetManager.getById(sheetId);
    if (!sheet) return 100;
    const key = sheet.scaleKey || "1:100";
    if (key === "free" && typeof sheet.scaleValue === "number" && sheet.scaleValue > 0) return sheet.scaleValue;
    const parsed = key.startsWith("1:") ? parseFloat(key.slice(2)) : NaN;
    return isFinite(parsed) && parsed > 0 ? parsed : 100;
  }

  /** Zeichne alle Projektionen des aktiven Plans. */
  drawAll(ctx: CanvasRenderingContext2D) {
    const plan = this._activePlan();
    if (!plan) return;
    for (const proj of plan.projections) {
      const items = this.getItems(proj);
      const isSel = proj.id === this.selectedProjectionId;
      const isHov = proj.id === this.hoverProjectionId && !isSel;
      drawProjection(ctx, this.app.camera, items, proj, isSel, isHov);
    }
    // Innen-Snap-Marker (Hover) zeichnen.
    if (this._innerHover) {
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.beginPath();
      ctx.arc(this._innerHover.sx, this._innerHover.sy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(77,163,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this._innerHover.sx, this._innerHover.sy, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Letzter Hover auf einen inneren Snap-Punkt einer Projektion. */
  private _innerHover: { projectionId: string; sx: number; sy: number } | null = null;

  /** Sammelt Snap-Kandidaten (Bildschirm-Koords) für die gesamte Projektion. */
  private _findInnerSnap(proj: Projection, sx: number, sy: number): { sx: number; sy: number } | null {
    const items = this.getItems(proj);
    if (items.length === 0) return null;
    const layout = computeProjectionLayout(items, proj);
    const cam = this.app.camera;
    const cs = cam.worldToScreen(layout.centerPlanM.x, layout.centerPlanM.y);
    const itemScalePxPerSheetM = layout.factor * cam.scale;
    const offX = layout.itemOriginOffsetPlanM.x * cam.scale;
    const offY = layout.itemOriginOffsetPlanM.y * cam.scale;
    const cosA = Math.cos(proj.rotation);
    const sinA = Math.sin(proj.rotation);
    const toScreen = (x: number, y: number) => {
      const lx = offX + x * itemScalePxPerSheetM;
      const ly = offY + y * itemScalePxPerSheetM;
      // Rotation um BBox-Center anwenden
      const rx = lx * cosA - ly * sinA;
      const ry = lx * sinA + ly * cosA;
      return { x: cs.x + rx, y: cs.y + ry };
    };
    // Clip-Bereich (im rotierten lokalen Frame) — nur Punkte innerhalb akzeptieren.
    const mmToPx = (mm: number) => (mm / 1000) * cam.scale;
    const cl = mmToPx(layout.clipLocalMm.left);
    const cr = mmToPx(layout.clipLocalMm.right);
    const ct = mmToPx(layout.clipLocalMm.top);
    const cb = mmToPx(layout.clipLocalMm.bottom);

    const tol = 10;
    let best: { sx: number; sy: number; d: number } | null = null;
    const tryPoint = (x: number, y: number) => {
      // Im lokalen (rotierten) Frame prüfen, ob innerhalb Clip.
      const lx = offX + x * itemScalePxPerSheetM;
      const ly = offY + y * itemScalePxPerSheetM;
      if (lx < cl - 0.5 || lx > cr + 0.5 || ly < ct - 0.5 || ly > cb + 0.5) return;
      const s = toScreen(x, y);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d <= tol && (!best || d < best.d)) best = { sx: s.x, sy: s.y, d };
    };
    for (const it of items) {
      if ((it.kind === "segment" || it.kind === "dimension-line") && it.a && it.b) {
        tryPoint(it.a.x, it.a.y);
        tryPoint(it.b.x, it.b.y);
      } else if (it.kind === "hatch" && it.points) {
        for (const p of it.points) tryPoint(p.x, p.y);
      } else if ((it.kind === "textbox-rect" || it.kind === "document-rect") && it.center) {
        const w = (it.widthM || 0) / 2;
        const h = (it.heightM || 0) / 2;
        const c = it.center;
        // 4 Ecken (Rotation des Items hier ignoriert — gut genug).
        tryPoint(c.x - w, c.y - h);
        tryPoint(c.x + w, c.y - h);
        tryPoint(c.x + w, c.y + h);
        tryPoint(c.x - w, c.y + h);
        tryPoint(c.x, c.y);
      }
    }
    return best ? { sx: best.sx, sy: best.sy } : null;
  }

  /**
   * Update jedes Frames (nur im Plan-Modus aufrufen).
   * Returns true, wenn der Controller die Eingabe verbraucht hat
   * (Werkzeuge sollen dann diesen Frame nicht laufen).
   */
  update(): boolean {
    const plan = this._activePlan();
    if (!plan) {
      this._hideHub();
      this._innerHover = null;
      return false;
    }
    const input = this.app.input;
    const sx = input.mouse.sx;
    const sy = input.mouse.sy;

    // Drag fortsetzen → konsumiert Eingabe komplett.
    if (this._drag) {
      this._continueDrag(sx, sy);
      if (!input.mouse.left) this._endDrag();
      return true;
    }

    // Hover berechnen: Edges/Body wie gehabt.
    let hoverId: string | null = null;
    let hoverHandle: typeof this.hoverHandle = null;
    const selected = this.selectedProjectionId
      ? plan.projections.find(p => p.id === this.selectedProjectionId)
      : null;
    if (selected) {
      const h = hitTestProjection(this.app.camera, this.getItems(selected), selected, sx, sy);
      if (h) { hoverId = selected.id; hoverHandle = h; }
    }
    if (!hoverId) {
      for (let i = plan.projections.length - 1; i >= 0; i--) {
        const proj = plan.projections[i];
        if (selected && proj.id === selected.id) continue;
        const h = hitTestProjection(this.app.camera, this.getItems(proj), proj, sx, sy);
        if (h) { hoverId = proj.id; hoverHandle = h; break; }
      }
    }
    this.hoverProjectionId = hoverId;
    this.hoverHandle = hoverHandle;

    // Innerer Snap-Punkt (nur wenn wir auf einer Projektion sind und im Body).
    let innerSnap: { projectionId: string; sx: number; sy: number } | null = null;
    if (hoverId && hoverHandle === "body") {
      const proj = plan.projections.find(p => p.id === hoverId)!;
      const s = this._findInnerSnap(proj, sx, sy);
      if (s) innerSnap = { projectionId: hoverId, sx: s.sx, sy: s.sy };
    }
    this._innerHover = innerSnap;

    let consumed = false;
    if (innerSnap) { this.app.canvas.style.cursor = "crosshair"; consumed = true; }
    else if (hoverHandle === "body") { this.app.canvas.style.cursor = "move"; consumed = true; }
    else if (hoverHandle === "edge-left" || hoverHandle === "edge-right") { this.app.canvas.style.cursor = "ew-resize"; consumed = true; }
    else if (hoverHandle === "edge-top" || hoverHandle === "edge-bottom") { this.app.canvas.style.cursor = "ns-resize"; consumed = true; }

    if (input.clicked) {
      if (innerSnap) {
        // Klick auf Innenpunkt → Selektieren + HUB an Punkt zeigen + Drag (move).
        this.selectedProjectionId = innerSnap.projectionId;
        const proj = plan.projections.find(p => p.id === innerSnap!.projectionId)!;
        this._beginDrag("body", proj, sx, sy);
        this._showHub({ x: innerSnap.sx, y: innerSnap.sy });
        consumed = true;
      } else if (hoverId && hoverHandle) {
        this.selectedProjectionId = hoverId;
        const proj = plan.projections.find(p => p.id === hoverId)!;
        this._beginDrag(hoverHandle, proj, sx, sy);
        // HUB an Außenpunkt (Klickposition) anheften.
        this._showHub({ x: sx, y: sy });
        consumed = true;
      } else if (this.selectedProjectionId) {
        this.selectedProjectionId = null;
        this._hideHub();
      }
    }

    if (this.selectedProjectionId) this._positionHub();
    return consumed;
  }

  private _beginDrag(
    handle: "body" | "edge-left" | "edge-right" | "edge-top" | "edge-bottom",
    proj: Projection,
    sx: number,
    sy: number,
  ) {
    this._drag = {
      kind: handle === "body" ? "move" : handle,
      projectionId: proj.id,
      startSx: sx,
      startSy: sy,
      origX: proj.x,
      origY: proj.y,
      origClip: { ...proj.clip },
    };
  }

  private _continueDrag(sx: number, sy: number) {
    if (!this._drag) return;
    const plan = this._activePlan();
    if (!plan) return;
    const proj = plan.projections.find(p => p.id === this._drag!.projectionId);
    if (!proj) { this._drag = null; return; }
    const cam = this.app.camera;
    const dxPx = sx - this._drag.startSx;
    const dyPx = sy - this._drag.startSy;
    // Bildschirm-Pixel → Plan-Welt-mm (camera.scale = px/m)
    const dxMm = (dxPx / cam.scale) * 1000;
    const dyMm = (dyPx / cam.scale) * 1000;

    if (this._drag.kind === "move") {
      proj.x = this._drag.origX + dxMm;
      proj.y = this._drag.origY + dyMm;
    } else {
      // Kanten ziehen: ins lokale (rotierte) System transformieren, dann clip anpassen
      const cosA = Math.cos(-proj.rotation);
      const sinA = Math.sin(-proj.rotation);
      const ldxMm = dxMm * cosA - dyMm * sinA;
      const ldyMm = dxMm * sinA + dyMm * cosA;
      const next = { ...this._drag.origClip };
      // Begrenzung: clip darf BBox nicht überschreiten
      const items = this.getItems(proj);
      const layout = computeProjectionLayout(items, { ...proj, clip: this._drag.origClip });
      const bboxW = layout.bboxLocalMm.right - layout.bboxLocalMm.left;
      const bboxH = layout.bboxLocalMm.bottom - layout.bboxLocalMm.top;
      const maxW = bboxW - 5; // 5 mm Min-Breite
      const maxH = bboxH - 5;

      if (this._drag.kind === "edge-left") {
        next.left = clampN(this._drag.origClip.left + ldxMm, 0, maxW - this._drag.origClip.right);
      } else if (this._drag.kind === "edge-right") {
        next.right = clampN(this._drag.origClip.right - ldxMm, 0, maxW - this._drag.origClip.left);
      } else if (this._drag.kind === "edge-top") {
        next.top = clampN(this._drag.origClip.top + ldyMm, 0, maxH - this._drag.origClip.bottom);
      } else if (this._drag.kind === "edge-bottom") {
        next.bottom = clampN(this._drag.origClip.bottom - ldyMm, 0, maxH - this._drag.origClip.top);
      }
      proj.clip = next;
    }
  }

  private _endDrag() {
    this._drag = null;
    // Snapshot in History
    this.app.commitHistorySnapshot();
  }

  /* ---------- HUB (im Stil von cad-point-menu) ---------- */
  /** Bevorzugte Bildschirm-Position für das HUB (z. B. innerer Snap-Punkt). */
  private _hubAnchorScreen: { x: number; y: number } | null = null;

  private _ensureHub() {
    if (this._hubEl) return this._hubEl;
    const el = document.createElement("div");
    // Gleiche Klasse wie das Punkt-Bearbeitungs-HUB, plus Wrapper für Skala-Zeile.
    el.className = "cad-point-menu plan-projection-hub";
    el.style.position = "fixed";
    el.style.zIndex = "60";
    el.style.flexDirection = "column";
    el.style.alignItems = "stretch";
    el.style.gap = "4px";
    el.innerHTML = `
      <div style="display:flex;gap:4px;align-items:center;">
        <button data-act="move" title="Bewegen">◉</button>
        <button data-act="translate" title="Verschieben">✥</button>
        <button data-act="rot-l" title="-15°">⟲</button>
        <button data-act="rot-r" title="+15°">⟳</button>
        <button data-act="reset-clip" title="Clip zurücksetzen">⤢</button>
        <button data-act="delete" title="Löschen">🗑</button>
      </div>
      <div style="display:flex;gap:4px;align-items:center;font-size:11px;color:hsl(var(--cad-toolbar-foreground));padding:0 2px;">
        <span>1:</span>
        <input type="number" data-field="scale" min="1" step="1" style="width:64px;height:22px;border-radius:4px;border:1px solid hsl(var(--cad-hub-border));background:hsl(var(--background));color:inherit;padding:0 4px;font-size:11px;" />
      </div>
    `;
    document.body.appendChild(el);

    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const act = target.closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      e.stopPropagation();
      const proj = this._currentProj();
      if (!proj) return;
      if (act === "move" || act === "translate") {
        // Initiiere Drag-Move unter Maus.
        const sx = this.app.input.mouse.sx;
        const sy = this.app.input.mouse.sy;
        this._beginDrag("body", proj, sx, sy);
      } else if (act === "rot-l") proj.rotation -= Math.PI / 12;
      else if (act === "rot-r") proj.rotation += Math.PI / 12;
      else if (act === "reset-clip") proj.clip = { left: 0, right: 0, top: 0, bottom: 0 };
      else if (act === "delete") {
        const plan = this._activePlan();
        if (plan) this.app.planManager.removeProjection(plan.id, proj.id);
        this.selectedProjectionId = null;
        this._hideHub();
      }
      this.app.commitHistorySnapshot();
    });

    el.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      const field = target.getAttribute("data-field");
      if (field === "scale") {
        const proj = this._currentProj();
        if (!proj) return;
        const num = parseFloat(target.value);
        if (isFinite(num) && num > 0) {
          proj.scale = num;
          this.app.commitHistorySnapshot();
        }
      }
    });

    this._hubEl = el;
    return el;
  }

  private _currentProj(): Projection | null {
    const plan = this._activePlan();
    if (!plan || !this.selectedProjectionId) return null;
    return plan.projections.find(p => p.id === this.selectedProjectionId) || null;
  }

  private _showHub(anchorScreen?: { x: number; y: number }) {
    const el = this._ensureHub();
    el.style.display = "flex";
    this._hubAnchorScreen = anchorScreen || null;
    const proj = this._currentProj();
    if (proj) {
      const input = el.querySelector('input[data-field="scale"]') as HTMLInputElement | null;
      if (input) input.value = String(Math.round(proj.scale));
    }
    this._positionHub();
  }

  private _hideHub() {
    if (this._hubEl) this._hubEl.style.display = "none";
    this._hubAnchorScreen = null;
  }

  private _positionHub() {
    if (!this._hubEl) return;
    const proj = this._currentProj();
    if (!proj) { this._hideHub(); return; }
    const rect = this.app.canvas.getBoundingClientRect();
    let x: number, y: number;
    if (this._hubAnchorScreen) {
      x = rect.left + this._hubAnchorScreen.x + 12;
      y = rect.top + this._hubAnchorScreen.y - 60;
    } else {
      const cam = this.app.camera;
      const layout = computeProjectionLayout(this.getItems(proj), proj);
      const cs = cam.worldToScreen(layout.centerPlanM.x, layout.centerPlanM.y);
      const mmToPx = (mm: number) => (mm / 1000) * cam.scale;
      const top = mmToPx(layout.clipLocalMm.top);
      const cosA = Math.cos(proj.rotation);
      const sinA = Math.sin(proj.rotation);
      const offX = -sinA * top;
      const offY = cosA * top;
      x = rect.left + cs.x + offX;
      y = rect.top + cs.y + offY - 60;
    }
    // Clampen ans Viewport.
    x = Math.max(8, Math.min(window.innerWidth - 240, x));
    y = Math.max(8, Math.min(window.innerHeight - 80, y));
    this._hubEl.style.left = `${x}px`;
    this._hubEl.style.top = `${y}px`;
  }

  /** Beim Verlassen des Plan-Modus aufrufen. */
  onExitPlanMode() {
    this.selectedProjectionId = null;
    this.hoverProjectionId = null;
    this.hoverHandle = null;
    this._drag = null;
    this._hideHub();
  }

  destroy() {
    if (this._hubEl?.parentNode) this._hubEl.parentNode.removeChild(this._hubEl);
    this._hubEl = null;
  }
}

function clampN(v: number, min: number, max: number): number {
  if (max < min) max = min;
  return Math.max(min, Math.min(max, v));
}
