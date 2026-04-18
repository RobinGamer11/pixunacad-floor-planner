import { v, Vec2, projectPointToSegment, pointInPolygon } from "./geometry";
import { Defaults, SelectionType } from "./constants";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { ClipboardItem } from "./ClipboardManager";
import { StickerDefinition, transformedStickerItems, commitStickerAt, pointInInstance } from "./StickerManager";
import { getDimensionGeometry } from "./dimensionGeometry";

type Phase = "idle" | "selecting" | "placing" | "rotating";

/**
 * StickerTool:
 *  - "selecting": Multi-Select-Modus zum Sammeln von Objekten für neuen Sticker.
 *      Klick toggelt Objekte (Linien, Schraffuren, Maßketten, Textboxen).
 *      Enter ODER Doppelklick speichert (fragt Namen ab).
 *      Esc bricht ab.
 *  - "placing": Vorschau folgt der Maus, Klick setzt Anker.
 *  - "rotating": Anker fix, Maus = Rotation; Klick committet.
 *      Hub zeigt Winkel; Enter übernimmt numerische Eingabe; Shift = 90°-Snap.
 */
export class StickerTool {
  app: CadApp;
  id = "sticker";

  activeDef: StickerDefinition | null = null;
  phase: Phase = "idle";
  anchor: Vec2 | null = null;
  rotationRad = 0;
  rotationLocked = false;

  // Multi-Select-Sammel-Sets (selecting phase)
  selSegmentIds = new Set<string>();
  selHatchIds = new Set<string>();
  selDimensionIds = new Set<string>();
  selTextBoxIds = new Set<string>();

  /** Callback to UI to refresh count display etc. */
  onSelectionChange?: () => void;

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
    this._clearSelectionSets();
    this.app.hub.hide();
    this.app.hub.bindCommit(null);
    this.onSelectionChange?.();
  }

  finish() {}

  getCursor() {
    if (this.phase === "placing" || this.phase === "rotating") return "copy";
    if (this.phase === "selecting") return "pointer";
    return "crosshair";
  }

  /* ---- Multi-select API ---- */
  beginSelectionMode() {
    this.activeDef = null;
    this.phase = "selecting";
    this.anchor = null;
    this.rotationRad = 0;
    this.rotationLocked = false;
    this._clearSelectionSets();
    this.app.clearSelection();
    this.app.setSelectedLabelId(null);
    this.app.pointEditMenu.hide();
    this.app.hub.hide();
    this.onSelectionChange?.();
  }

  getSelectionCount(): number {
    return this.selSegmentIds.size + this.selHatchIds.size + this.selDimensionIds.size + this.selTextBoxIds.size;
  }

  /** Speichert die aktuelle Multi-Select-Sammlung als neuen Sticker. */
  commitSelectionAsSticker(name: string): StickerDefinition | null {
    const def = this.app.createStickerFromIds({
      segmentIds: this.selSegmentIds,
      hatchIds: this.selHatchIds,
      dimensionIds: this.selDimensionIds,
      textBoxIds: this.selTextBoxIds,
    }, name);
    if (def) {
      this._clearSelectionSets();
      this.phase = "idle";
      this.onSelectionChange?.();
    }
    return def;
  }

  private _clearSelectionSets() {
    this.selSegmentIds.clear();
    this.selHatchIds.clear();
    this.selDimensionIds.clear();
    this.selTextBoxIds.clear();
  }

  /** Wird aus CadApp aufgerufen, wenn ein Sticker aus der Library zur Platzierung gewählt wird. */
  beginPlacement(def: StickerDefinition) {
    this.activeDef = def;
    this.phase = "placing";
    this.anchor = null;
    this.rotationRad = 0;
    this.rotationLocked = false;
    this._clearSelectionSets();
    this.app.clearSelection();
    this.app.setSelectedLabelId(null);
    this.app.pointEditMenu.hide();
    this.app.hub.bindCommit((vals) => this._applyHubValues(vals));
    this.onSelectionChange?.();
  }

  // Drag-State für Sticker-Instanzen im Sticker-Werkzeug
  private _dragStickerId: string | null = null;
  private _dragOrigin: Vec2 | null = null;
  private _dragMouseStart: Vec2 | null = null;
  private _dragGrabOffset: Vec2 | null = null;
  private _dragSnap: any = null;

  /** Hit-Test gegen platzierte Sticker-Instanzen. */
  private _hitStickerInstance(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    for (let i = this.app.scene.stickerInstances.length - 1; i >= 0; i--) {
      const inst = this.app.scene.stickerInstances[i];
      if (!this.app.labelManager.isVisible(inst.labelId)) continue;
      if (pointInInstance(inst.items as any, inst.position, inst.rotationRad, inst.scale, mouseW)) return inst;
    }
    return null;
  }

  update(input: Input) {
    // Aktiver Drag (Verschieben einer ausgewählten Sticker-Instanz) mit Punkt-Snap
    if (this._dragStickerId) {
      const inst = this.app.scene.getStickerInstanceById(this._dragStickerId);
      if (inst && this._dragGrabOffset) {
        const mouseW = v(input.mouse.wx, input.mouse.wy);
        const snap = this.app.topology.findBestSnap(
          v(input.mouse.sx, input.mouse.sy),
          mouseW
        );
        this._dragSnap = snap;
        const target = (snap && snap.world) ? snap.world : mouseW;
        inst.position = {
          x: target.x - this._dragGrabOffset.x,
          y: target.y - this._dragGrabOffset.y,
        };
      }
      if (!input.mouse.left) {
        this._dragStickerId = null;
        this._dragOrigin = null;
        this._dragMouseStart = null;
        this._dragGrabOffset = null;
        this._dragSnap = null;
      }
      return;
    }

    if (this.phase === "selecting") {
      // Doppelklick = sofort speichern (Namens-Prompt via UI/CadApp)
      if (input.doubleClicked) {
        if (this.getSelectionCount() > 0) this._promptAndCommitSelection();
        return;
      }
      if (input.clicked) {
        this._toggleAtMouse(input);
      }
      return;
    }

    // Im idle-Modus: Doppelklick auf Sticker-Instanz öffnet Edit-Mode
    if (this.phase === "idle" && input.doubleClicked && !this.app.isStickerEditing()) {
      const hit = this._hitStickerInstance(input);
      if (hit) {
        this.app.enterStickerEdit(hit as any);
        return;
      }
    }

    // Im Edit-Mode: Klick außerhalb der Bounding-Box verlässt ihn
    if (this.phase === "idle" && input.clicked && this.app.isStickerEditing()) {
      const mouseW = v(input.mouse.wx, input.mouse.wy);
      if (this.app.isPointOutsideStickerEdit(mouseW)) {
        this.app.exitStickerEdit();
        this.app.clearSelection();
        return;
      }
      // Innerhalb: keine spezielle Sticker-Selektion (Innenobjekte sind echte Scene-Objekte, im Sticker-Tool nicht editierbar).
      return;
    }

    // Im idle-Modus: Klick auf existierende Sticker-Instanz wählt sie aus + startet Drag
    if (this.phase === "idle" && input.clicked) {
      const hit = this._hitStickerInstance(input);
      if (hit) {
        this.app.setSelection({ type: SelectionType.STICKER_INSTANCE, stickerInstanceId: hit.id });
        const mouseW0 = v(input.mouse.wx, input.mouse.wy);
        this._dragStickerId = hit.id;
        this._dragOrigin = { x: hit.position.x, y: hit.position.y };
        this._dragMouseStart = mouseW0;
        this._dragGrabOffset = { x: mouseW0.x - hit.position.x, y: mouseW0.y - hit.position.y };
        this._dragSnap = null;
        return;
      }
      // Klick ins Leere = deselektieren
      if (this.app.selection?.type === SelectionType.STICKER_INSTANCE) {
        this.app.clearSelection();
      }
    }

    if (!this.activeDef || this.phase === "idle") return;

    if (this.phase === "placing") {
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

  /** Called by CadApp on Enter key while sticker tool active. */
  handleEnterKey(): boolean {
    if (this.phase === "selecting" && this.getSelectionCount() > 0) {
      this._promptAndCommitSelection();
      return true;
    }
    return false;
  }

  private _promptAndCommitSelection() {
    const defaultName = `Sticker ${this.app.stickers.length + 1}`;
    const name = window.prompt("Name für neuen Sticker:", defaultName);
    if (!name) return;
    this.commitSelectionAsSticker(name);
  }

  private _toggleAtMouse(input: Input) {
    const hit = this._hitTestAny(input);
    if (!hit) return;
    if (hit.kind === "segment") this._toggleSet(this.selSegmentIds, hit.id);
    else if (hit.kind === "hatch") this._toggleSet(this.selHatchIds, hit.id);
    else if (hit.kind === "dimension") this._toggleSet(this.selDimensionIds, hit.id);
    else if (hit.kind === "textbox") this._toggleSet(this.selTextBoxIds, hit.id);
    this.onSelectionChange?.();
  }

  private _toggleSet(set: Set<string>, id: string) {
    if (set.has(id)) set.delete(id); else set.add(id);
  }

  /** Hit-Test über alle Objekttypen (vereinfachte Variante des SelectTool). */
  private _hitTestAny(input: Input): { kind: "segment" | "hatch" | "dimension" | "textbox"; id: string } | null {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    const mouseS = v(input.mouse.sx, input.mouse.sy);
    const cam = this.app.camera;
    const distPxToWorldPoint = (pWorld: Vec2) =>
      Math.hypot(cam.worldToScreen(pWorld.x, pWorld.y).x - mouseS.x, cam.worldToScreen(pWorld.x, pWorld.y).y - mouseS.y);

    let best: { kind: any; id: string } | null = null;
    let bestScore = Infinity;

    // Segments
    for (const seg of this.app.scene.segments) {
      if (!this.app.labelManager.isVisible(seg.labelId)) continue;
      const proj = projectPointToSegment(mouseW, seg.a, seg.b);
      const px = distPxToWorldPoint(proj.q);
      if (px <= Defaults.hitPx && px < bestScore) {
        bestScore = px;
        best = { kind: "segment", id: seg.id };
      }
    }

    // Dimensions
    for (const dim of this.app.scene.dimensions) {
      if (!this.app.labelManager.isVisible(dim.labelId)) continue;
      const g = getDimensionGeometry(dim);
      const proj = projectPointToSegment(mouseW, g.d1, g.d2);
      const px = distPxToWorldPoint(proj.q);
      if (px <= Defaults.hitPx && px < bestScore) {
        bestScore = px;
        best = { kind: "dimension", id: dim.id };
      }
    }

    if (best) return best;

    // Hatch polygon area
    for (const hatch of this.app.scene.hatches) {
      if (!this.app.labelManager.isVisible(hatch.labelId)) continue;
      if (hatch.points.length >= 3 && pointInPolygon(mouseW, hatch.points)) {
        return { kind: "hatch", id: hatch.id };
      }
    }

    // TextBoxes (axis-aligned approx via rotated rect)
    for (const tb of this.app.scene.textBoxes) {
      if (!this.app.labelManager.isVisible(tb.labelId)) continue;
      const cs = Math.cos(tb.rotationRad || 0), sn = Math.sin(tb.rotationRad || 0);
      const dx = mouseW.x - tb.center.x, dy = mouseW.y - tb.center.y;
      const lx = dx * cs + dy * sn;
      const ly = -dx * sn + dy * cs;
      if (Math.abs(lx) <= tb.widthM / 2 && Math.abs(ly) <= tb.heightM / 2) {
        return { kind: "textbox", id: tb.id };
      }
    }

    return null;
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
    // Selecting-Phase: Hervorhebung aller ausgewählten Objekte
    if (this.phase === "selecting") {
      this._drawSelectionHighlights(ctx, cam);
      // Hover-Highlight
      const hoverHit = this._hitTestAny(this.app.input);
      if (hoverHit) this._drawHoverHighlight(ctx, cam, hoverHit);
      return;
    }

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

  private _drawSelectionHighlights(ctx: CanvasRenderingContext2D, cam: any) {
    ctx.save();
    ctx.strokeStyle = "rgba(77,163,255,0.95)";
    ctx.fillStyle = "rgba(77,163,255,0.18)";
    ctx.lineWidth = 3;

    for (const id of this.selSegmentIds) {
      const seg = this.app.scene.getSegmentById(id);
      if (!seg) continue;
      const a = cam.worldToScreen(seg.a.x, seg.a.y);
      const b = cam.worldToScreen(seg.b.x, seg.b.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const id of this.selHatchIds) {
      const h = this.app.scene.getHatchById(id);
      if (!h || h.points.length < 3) continue;
      ctx.beginPath();
      for (let i = 0; i < h.points.length; i++) {
        const p = cam.worldToScreen(h.points[i].x, h.points[i].y);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (const id of this.selDimensionIds) {
      const d = this.app.scene.getDimensionById(id);
      if (!d) continue;
      const g = getDimensionGeometry(d);
      const a = cam.worldToScreen(g.d1.x, g.d1.y);
      const b = cam.worldToScreen(g.d2.x, g.d2.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const id of this.selTextBoxIds) {
      const t = this.app.scene.getTextBoxById(id);
      if (!t) continue;
      const cs = Math.cos(t.rotationRad || 0), sn = Math.sin(t.rotationRad || 0);
      const w = t.widthM, h = t.heightM;
      const corners = [
        { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
      ].map(p => cam.worldToScreen(t.center.x + p.x * cs - p.y * sn, t.center.y + p.x * sn + p.y * cs));
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  private _drawHoverHighlight(ctx: CanvasRenderingContext2D, cam: any, hit: { kind: string; id: string }) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,180,0,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    if (hit.kind === "segment") {
      const s = this.app.scene.getSegmentById(hit.id);
      if (s) {
        const a = cam.worldToScreen(s.a.x, s.a.y);
        const b = cam.worldToScreen(s.b.x, s.b.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    } else if (hit.kind === "hatch") {
      const h = this.app.scene.getHatchById(hit.id);
      if (h) {
        ctx.beginPath();
        for (let i = 0; i < h.points.length; i++) {
          const p = cam.worldToScreen(h.points[i].x, h.points[i].y);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath(); ctx.stroke();
      }
    } else if (hit.kind === "dimension") {
      const d = this.app.scene.getDimensionById(hit.id);
      if (d) {
        const g = getDimensionGeometry(d);
        const a = cam.worldToScreen(g.d1.x, g.d1.y);
        const b = cam.worldToScreen(g.d2.x, g.d2.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    } else if (hit.kind === "textbox") {
      const t = this.app.scene.getTextBoxById(hit.id);
      if (t) {
        const cs = Math.cos(t.rotationRad || 0), sn = Math.sin(t.rotationRad || 0);
        const w = t.widthM, h = t.heightM;
        const corners = [
          { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
        ].map(p => cam.worldToScreen(t.center.x + p.x * cs - p.y * sn, t.center.y + p.x * sn + p.y * cs));
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();
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
