import { drawSnapDot } from "./snapDraw";
import { Defaults, SelectionType, ToolIds } from "./constants";
import { Vec2, v } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import { boxCornersWorld, centerFromTopLeft, pointInOrientedBox } from "./textGeometry";
import type { TextBox } from "./Scene";

/**
 * TextTool — places new text boxes by clicking. Anchor = top-left.
 * Snaps to all existing snap points (segments/hatches/dimensions/textbox corners)
 * via TopologyEngine. Right-click on a snap point toggles a guide anchor (axis lock).
 *
 * After placing, the box is auto-selected and the inline HTML editor is opened
 * so the user can immediately type.
 */
export class TextTool {
  app: CadApp;
  id = ToolIds.TEXT;

  guideAnchors: { key: string; point: Vec2 }[] = [];
  hoverSnapWorld: Vec2 | null = null;

  // Drag-create state (Modus "Text passt sich Rahmen an")
  private _dragStart: Vec2 | null = null;
  private _dragEnd: Vec2 | null = null;
  private _wasLeftDown = false;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this.guideAnchors = [];
    this.hoverSnapWorld = null;
    this._dragStart = null;
    this._dragEnd = null;
    this._wasLeftDown = false;
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.renderer.setHoverTextBoxId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.guideAnchors = [];
    this.hoverSnapWorld = null;
    this._dragStart = null;
    this._dragEnd = null;
    this.app.renderer.setHoverTextBoxId(null);
  }

  finish() { this.cancel(); }

  isDrawing() { return !!this._dragStart; }
  onTabRequest(): boolean { return false; }

  /* ---- Hit-testing helpers ---- */

  private _hitTextBox(input: Input): TextBox | null {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    for (let i = this.app.scene.textBoxes.length - 1; i >= 0; i--) {
      const box = this.app.scene.textBoxes[i];
      if (!this.app.labelManager.isVisible(box.labelId)) continue;
      if (pointInOrientedBox(mouseW, box)) return box;
    }
    return null;
  }

  private _previewAnchor(input: Input): Vec2 {
    let p = v(input.mouse.wx, input.mouse.wy);
    const snap = this.app.topology.findBestSnap(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy),
    );
    this.hoverSnapWorld = snap ? v(snap.world.x, snap.world.y) : null;
    if (snap) p = v(snap.world.x, snap.world.y);

    // Apply guide-anchor axis locks (X/Y from any anchor, by screen distance)
    let bestX: number | null = null, bestY: number | null = null;
    let bestXPx = Infinity, bestYPx = Infinity;
    for (const anchor of this.guideAnchors) {
      const s = this.app.camera.worldToScreen(anchor.point.x, anchor.point.y);
      const dx = Math.abs(s.x - input.mouse.sx);
      if (dx <= Defaults.snapPx && dx < bestXPx) { bestXPx = dx; bestX = anchor.point.x; }
      const dy = Math.abs(s.y - input.mouse.sy);
      if (dy <= Defaults.snapPx && dy < bestYPx) { bestYPx = dy; bestY = anchor.point.y; }
    }
    if (bestX != null) p.x = bestX;
    if (bestY != null) p.y = bestY;

    return p;
  }

  /* ---- Update ---- */

  update(input: Input) {
    // Hover (allow re-selecting an existing textbox by clicking it)
    const hover = this._hitTextBox(input);
    this.app.renderer.setHoverTextBoxId(hover?.id || null);

    const anchor = this._previewAnchor(input);

    // Right-click on a snap point toggles a guide anchor
    if (input.rightClicked && this.hoverSnapWorld) {
      const key = `${this.hoverSnapWorld.x.toFixed(6)}_${this.hoverSnapWorld.y.toFixed(6)}`;
      const idx = this.guideAnchors.findIndex(a => a.key === key);
      if (idx >= 0) this.guideAnchors.splice(idx, 1);
      else this.guideAnchors.push({ key, point: v(this.hoverSnapWorld.x, this.hoverSnapWorld.y) });
    }

    if (input.doubleClicked) {
      const box = this._hitTextBox(input);
      if (box) {
        this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: box.id, handleIndex: null });
        this.app.beginTextEdit(box);
        return;
      }
    }

    // ====== Modus 2: Text passt sich Rahmen an → Drag-Create ======
    const style = this.app.getCurrentTextStyle();
    const autoSize = (style as any).autoSize !== false;

    if (!autoSize) {
      const leftDown = input.mouse.left;
      const wasDown = this._wasLeftDown;
      this._wasLeftDown = leftDown;

      // Editor open → erster Mausklick committet ihn (kein Drag).
      if (leftDown && !wasDown && this.app.textEditor?.isActive()) {
        this.app.textEditor.commit();
        return;
      }

      // Klick auf bestehende Textbox = nur auswählen, kein Drag.
      if (leftDown && !wasDown) {
        const box = this._hitTextBox(input);
        if (box) {
          this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: box.id, handleIndex: null });
          return;
        }
        this._dragStart = v(anchor.x, anchor.y);
        this._dragEnd = v(anchor.x, anchor.y);
        return;
      }

      if (leftDown && this._dragStart) {
        this._dragEnd = v(anchor.x, anchor.y);
        return;
      }

      // Mouse-Up → Box finalisieren
      if (!leftDown && wasDown && this._dragStart && this._dragEnd) {
        const a = this._dragStart, b = this._dragEnd;
        this._dragStart = null;
        this._dragEnd = null;
        const wf = this.app.renderer.worldScaleFactor();
        const minM = Defaults.textMinBoxSizeM * wf;
        let widthM = Math.abs(b.x - a.x);
        let heightM = Math.abs(b.y - a.y);
        // Zu kleiner Drag → Default-Größe
        if (widthM < minM * 2 || heightM < minM * 2) {
          widthM = Defaults.textBoxWidthM * wf;
          heightM = Defaults.textBoxHeightM * wf;
        }
        const tl = v(Math.min(a.x, b.x), Math.min(a.y, b.y));
        const center = centerFromTopLeft(tl, widthM, heightM, 0);
        const created = this.app.scene.createTextBox(
          center, widthM, heightM,
          { ...style, wrap: true, autoSize: false } as any,
          "", 0,
        );
        this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: created.id, handleIndex: null });
        this.app.refreshLabelUI();
        this.app.beginTextEdit(created);
      }
      return;
    }

    // ====== Modus 1 (Default): Auto-Size — wie bisher ======
    if (input.clicked) {
      if (this.app.textEditor?.isActive()) {
        this.app.textEditor.commit();
        return;
      }
      const box = this._hitTextBox(input);
      if (box) {
        this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: box.id, handleIndex: null });
        return;
      }
      const wf = this.app.renderer.worldScaleFactor();
      const widthM = Defaults.textBoxWidthM * wf;
      const heightM = Defaults.textBoxHeightM * wf;
      const center = centerFromTopLeft(anchor, widthM, heightM, 0);
      const created = this.app.scene.createTextBox(center, widthM, heightM, style, "", 0);
      this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: created.id, handleIndex: null });
      this.app.refreshLabelUI();
      this.app.beginTextEdit(created);
    }
  }

  /* ---- Overlay ---- */

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Guide lines (full viewport cross at each anchor)
    if (this.guideAnchors.length > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(110,110,110,0.38)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 6]);
      for (const a of this.guideAnchors) {
        const s = cam.worldToScreen(a.point.x, a.point.y);
        ctx.beginPath();
        ctx.moveTo(0, s.y); ctx.lineTo(this.app.renderer.vw, s.y);
        ctx.moveTo(s.x, 0); ctx.lineTo(s.x, this.app.renderer.vh);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Snap indicator
    if (this.hoverSnapWorld) {
      const s = cam.worldToScreen(this.hoverSnapWorld.x, this.hoverSnapWorld.y);
      drawSnapDot(ctx, s.x, s.y, { ring: true });
    }

    // Preview rectangle at anchor (top-left = anchor, default size, no rotation).
    // Hide the preview while an editor is open — the next click will commit
    // it AND place the new textbox at the same time, so the preview reappears
    // immediately on the following frame.
    if (!this.app.textEditor?.isActive()) {
      const anchor = this._previewAnchor(this.app.input);
      const wf = this.app.renderer.worldScaleFactor();
      const widthPx = Defaults.textBoxWidthM * cam.scale * wf;
      const heightPx = Defaults.textBoxHeightM * cam.scale * wf;
      const tl = cam.worldToScreen(anchor.x, anchor.y);
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.08)";
      ctx.strokeStyle = "rgba(77,163,255,0.85)";
      ctx.lineWidth = 1.8;
      ctx.fillRect(tl.x, tl.y, widthPx, heightPx);
      ctx.strokeRect(tl.x, tl.y, widthPx, heightPx);
      ctx.restore();
    }
  }
}
