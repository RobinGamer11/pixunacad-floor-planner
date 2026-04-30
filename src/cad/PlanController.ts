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
  /** Welches Handle ist aktuell selektiert (steuert Inhalt der HUB-Box). */
  selectedHandle: HandleKind | null = null;
  /** Wenn ein Eckpunkt selektiert ist, dessen Index 0..3. */
  selectedCornerIndex: number | null = null;
  hoverProjectionId: string | null = null;
  hoverHandle: HandleKind | null = null;
  hoverCornerIndex: number | null = null;

  private _drag: DragState | null = null;

  // HUB DOM
  private _hubEl: HTMLDivElement | null = null;
  private _hubDragCleanup: (() => void) | null = null;

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
    // Eckpunkte des Außenrahmens (klein, dezent) — nur für selektierte/hover Projektion.
    const drawCorners = (proj: Projection, hovered: number | null, selected: number | null) => {
      const corners = this._cornerScreens(proj);
      ctx.save();
      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        const isSel = i === selected;
        const isHov = i === hovered && !isSel;
        ctx.beginPath();
        ctx.arc(c.x, c.y, isSel ? 5 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? "rgba(255,180,0,0.95)" : isHov ? "rgba(77,163,255,0.95)" : "rgba(255,255,255,0.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(40,60,90,0.85)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    };
    const sel = this.selectedProjectionId
      ? plan.projections.find(p => p.id === this.selectedProjectionId)
      : null;
    if (sel) {
      drawCorners(sel, this.hoverProjectionId === sel.id ? this.hoverCornerIndex : null, this.selectedHandle === "corner" ? this.selectedCornerIndex : null);
    }
    if (this.hoverProjectionId && (!sel || this.hoverProjectionId !== sel.id)) {
      const hp = plan.projections.find(p => p.id === this.hoverProjectionId);
      if (hp) drawCorners(hp, this.hoverCornerIndex, null);
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
   * Liefert die 4 Bildschirm-Koordinaten der Außenrahmen-Eckpunkte (clip-Rechteck).
   * Reihenfolge: 0=TL, 1=TR, 2=BR, 3=BL.
   */
  private _cornerScreens(proj: Projection): { x: number; y: number }[] {
    const items = this.getItems(proj);
    const layout = computeProjectionLayout(items, proj);
    const cam = this.app.camera;
    const cs = cam.worldToScreen(layout.centerPlanM.x, layout.centerPlanM.y);
    const mmToPx = (mm: number) => (mm / 1000) * cam.scale;
    const L = mmToPx(layout.clipLocalMm.left);
    const R = mmToPx(layout.clipLocalMm.right);
    const T = mmToPx(layout.clipLocalMm.top);
    const B = mmToPx(layout.clipLocalMm.bottom);
    const cosA = Math.cos(proj.rotation);
    const sinA = Math.sin(proj.rotation);
    const xform = (lx: number, ly: number) => ({
      x: cs.x + lx * cosA - ly * sinA,
      y: cs.y + lx * sinA + ly * cosA,
    });
    return [xform(L, T), xform(R, T), xform(R, B), xform(L, B)];
  }

  private _hitCorner(proj: Projection, sx: number, sy: number): number | null {
    const corners = this._cornerScreens(proj);
    const tol = 9;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < corners.length; i++) {
      const d = Math.hypot(corners[i].x - sx, corners[i].y - sy);
      if (d <= tol && d < bestD) { bestD = d; best = i; }
    }
    return best >= 0 ? best : null;
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

    // Hover-Reihenfolge: Eckpunkt > Edge > Body. Selektierte Projektion bevorzugt.
    let hoverId: string | null = null;
    let hoverHandle: HandleKind | null = null;
    let hoverCorner: number | null = null;
    const selected = this.selectedProjectionId
      ? plan.projections.find(p => p.id === this.selectedProjectionId)
      : null;

    const tryHit = (proj: Projection): boolean => {
      const c = this._hitCorner(proj, sx, sy);
      if (c !== null) { hoverId = proj.id; hoverHandle = "corner"; hoverCorner = c; return true; }
      const h = hitTestProjection(this.app.camera, this.getItems(proj), proj, sx, sy);
      if (h) { hoverId = proj.id; hoverHandle = h; return true; }
      return false;
    };

    if (selected) tryHit(selected);
    if (!hoverId) {
      for (let i = plan.projections.length - 1; i >= 0; i--) {
        const proj = plan.projections[i];
        if (selected && proj.id === selected.id) continue;
        if (tryHit(proj)) break;
      }
    }
    this.hoverProjectionId = hoverId;
    this.hoverHandle = hoverHandle;
    this.hoverCornerIndex = hoverCorner;

    // Innerer Snap-Punkt nur bei body-Hover (nicht auf Edges/Corners).
    let innerSnap: { projectionId: string; sx: number; sy: number } | null = null;
    if (hoverId && hoverHandle === "body") {
      const proj = plan.projections.find(p => p.id === hoverId)!;
      const s = this._findInnerSnap(proj, sx, sy);
      if (s) innerSnap = { projectionId: hoverId, sx: s.sx, sy: s.sy };
    }
    this._innerHover = innerSnap;

    let consumed = false;
    if (hoverHandle === "corner") { this.app.canvas.style.cursor = "pointer"; consumed = true; }
    else if (innerSnap) { this.app.canvas.style.cursor = "pointer"; consumed = true; }
    else if (hoverHandle === "body") { this.app.canvas.style.cursor = "pointer"; consumed = true; }
    else if (hoverHandle === "edge-left" || hoverHandle === "edge-right") { this.app.canvas.style.cursor = "ew-resize"; consumed = true; }
    else if (hoverHandle === "edge-top" || hoverHandle === "edge-bottom") { this.app.canvas.style.cursor = "ns-resize"; consumed = true; }

    if (input.clicked) {
      if (hoverId && hoverHandle === "corner") {
        // Eckpunkt-HUB: nur Löschen.
        this.selectedProjectionId = hoverId;
        this.selectedHandle = "corner";
        this.selectedCornerIndex = hoverCorner;
        const corner = this._cornerScreens(plan.projections.find(p => p.id === hoverId)!)[hoverCorner!];
        this._showHub({ x: corner.x, y: corner.y });
        consumed = true;
      } else if (innerSnap) {
        // Innenpunkt-HUB: voll (Move/Rotate/Reset/Delete), an Snap-Punkt verankert.
        this.selectedProjectionId = innerSnap.projectionId;
        this.selectedHandle = "body";
        this.selectedCornerIndex = null;
        this._showHub({ x: innerSnap.sx, y: innerSnap.sy });
        consumed = true;
      } else if (hoverId && hoverHandle === "body") {
        this.selectedProjectionId = hoverId;
        this.selectedHandle = "body";
        this.selectedCornerIndex = null;
        this._showHub({ x: sx, y: sy });
        consumed = true;
      } else if (hoverId && (hoverHandle === "edge-left" || hoverHandle === "edge-right" || hoverHandle === "edge-top" || hoverHandle === "edge-bottom")) {
        // Edge nur selektieren (kein automatisches Drag) → HUB zeigt Cut + Reset + Delete.
        this.selectedProjectionId = hoverId;
        this.selectedHandle = hoverHandle;
        this.selectedCornerIndex = null;
        this._showHub({ x: sx, y: sy });
        consumed = true;
      } else if (this.selectedProjectionId) {
        this.selectedProjectionId = null;
        this.selectedHandle = null;
        this.selectedCornerIndex = null;
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
  /** Bevorzugte Bildschirm-Position für das HUB. */
  private _hubAnchorScreen: { x: number; y: number } | null = null;

  private _ensureHub() {
    if (this._hubEl) return this._hubEl;
    const el = document.createElement("div");
    el.className = "cad-point-menu plan-projection-hub";
    el.style.position = "fixed";
    el.style.zIndex = "60";
    document.body.appendChild(el);

    // Drag-Handle: Box ist greifbar zwischen Buttons (siehe hubDrag.ts).
    this._hubDragCleanup = makeHubDraggable(el, { positionMode: "fixed" });

    el.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const act = target.closest("[data-act]")?.getAttribute("data-act");
      if (!act) return;
      e.stopPropagation();
      const proj = this._currentProj();
      if (!proj) return;

      if (act === "move" || act === "translate") {
        // Drag-Move ab aktueller Mausposition.
        const sx = this.app.input.mouse.sx;
        const sy = this.app.input.mouse.sy;
        this._beginDrag("body", proj, sx, sy);
      } else if (act === "rot-l") {
        proj.rotation -= Math.PI / 12;
        this.app.commitHistorySnapshot();
      } else if (act === "rot-r") {
        proj.rotation += Math.PI / 12;
        this.app.commitHistorySnapshot();
      } else if (act === "reset-clip") {
        proj.clip = { left: 0, right: 0, top: 0, bottom: 0 };
        this.app.commitHistorySnapshot();
      } else if (act === "cut") {
        // Edge-Drag ab aktueller Mausposition starten.
        if (
          this.selectedHandle === "edge-left" ||
          this.selectedHandle === "edge-right" ||
          this.selectedHandle === "edge-top" ||
          this.selectedHandle === "edge-bottom"
        ) {
          const sx = this.app.input.mouse.sx;
          const sy = this.app.input.mouse.sy;
          this._beginDrag(this.selectedHandle, proj, sx, sy);
        }
      } else if (act === "delete") {
        const plan = this._activePlan();
        if (plan) this.app.planManager.removeProjection(plan.id, proj.id);
        this.selectedProjectionId = null;
        this.selectedHandle = null;
        this.selectedCornerIndex = null;
        this._hideHub();
        this.app.commitHistorySnapshot();
      }
    });

    this._hubEl = el;
    return el;
  }

  private _renderHubButtons() {
    if (!this._hubEl) return;
    const handle = this.selectedHandle;
    let html = "";
    if (handle === "corner") {
      // Eckpunkt: Verschieben (ganzes Blatt) + Löschen.
      html = `
        <button data-act="move" title="Bewegen">◉</button>
        <button data-act="translate" title="Verschieben">✥</button>
        <button data-act="delete" title="Zeichnungsblatt löschen">🗑</button>
      `;
    } else if (
      handle === "edge-left" ||
      handle === "edge-right" ||
      handle === "edge-top" ||
      handle === "edge-bottom"
    ) {
      // Edge: Cut + Reset + Delete.
      html = `
        <button data-act="cut" title="Einschneiden">✂</button>
        <button data-act="reset-clip" title="Clip zurücksetzen">⤢</button>
        <button data-act="delete" title="Löschen">🗑</button>
      `;
    } else {
      // Body / Innenpunkt: Move + Rotate + Reset + Delete.
      html = `
        <button data-act="move" title="Bewegen">◉</button>
        <button data-act="translate" title="Verschieben">✥</button>
        <button data-act="rot-l" title="-15°">⟲</button>
        <button data-act="rot-r" title="+15°">⟳</button>
        <button data-act="reset-clip" title="Clip zurücksetzen">⤢</button>
        <button data-act="delete" title="Löschen">🗑</button>
      `;
    }
    this._hubEl.innerHTML = html;
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
    // Bei jeder neuen Selektion vom User-Move-Flag befreien.
    resetHubUserMoved(el);
    this._renderHubButtons();
    this._positionHub();
  }

  private _hideHub() {
    if (this._hubEl) {
      this._hubEl.style.display = "none";
      resetHubUserMoved(this._hubEl);
    }
    this._hubAnchorScreen = null;
  }

  private _positionHub() {
    if (!this._hubEl) return;
    const proj = this._currentProj();
    if (!proj) { this._hideHub(); return; }
    // Wenn der User die Box manuell verschoben hat: Position respektieren.
    if (hubWasUserMoved(this._hubEl)) return;
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
    x = Math.max(8, Math.min(window.innerWidth - 240, x));
    y = Math.max(8, Math.min(window.innerHeight - 80, y));
    this._hubEl.style.left = `${x}px`;
    this._hubEl.style.top = `${y}px`;
  }

  /** Versucht, die aktuell selektierte Projektion zu löschen (für Delete-Key). */
  deleteSelected(): boolean {
    const proj = this._currentProj();
    if (!proj) return false;
    const plan = this._activePlan();
    if (!plan) return false;
    this.app.planManager.removeProjection(plan.id, proj.id);
    this.selectedProjectionId = null;
    this.selectedHandle = null;
    this.selectedCornerIndex = null;
    this._hideHub();
    this.app.commitHistorySnapshot();
    return true;
  }

  /** Beim Verlassen des Plan-Modus aufrufen. */
  onExitPlanMode() {
    this.selectedProjectionId = null;
    this.selectedHandle = null;
    this.selectedCornerIndex = null;
    this.hoverProjectionId = null;
    this.hoverHandle = null;
    this.hoverCornerIndex = null;
    this._drag = null;
    this._hideHub();
  }

  destroy() {
    if (this._hubDragCleanup) { this._hubDragCleanup(); this._hubDragCleanup = null; }
    if (this._hubEl?.parentNode) this._hubEl.parentNode.removeChild(this._hubEl);
    this._hubEl = null;
  }
}

function clampN(v: number, min: number, max: number): number {
  if (max < min) max = min;
  return Math.max(min, Math.min(max, v));
}
