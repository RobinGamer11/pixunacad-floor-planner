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
 * via TopologyEngine. Right-click guides come from the central GuideInteractionController.
 *
 * After placing, the box is auto-selected and the inline HTML editor is opened
 * so the user can immediately type.
 */
export class TextTool {
  app: CadApp;
  id = ToolIds.TEXT;

  hoverSnapWorld: Vec2 | null = null;

  // Drag-create state (Modus "Text passt sich Rahmen an")
  private _dragStart: Vec2 | null = null;
  private _dragEnd: Vec2 | null = null;
  private _wasLeftDown = false;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
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
      if (!this.app.labelManager.isEditable(box.labelId)) continue;
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

    return p;
  }

  /* ---- Update ---- */

  update(input: Input) {
    // Hover (allow re-selecting an existing textbox by clicking it)
    const hover = this._hitTextBox(input);
    this.app.renderer.setHoverTextBoxId(hover?.id || null);

    const anchor = this._previewAnchor(input);


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
        widthM = Math.max(widthM, Defaults.textMinBoxSizeM);
        heightM = Math.max(heightM, Defaults.textMinBoxSizeM);
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
      const widthM = Math.max(Defaults.textBoxWidthM * wf, Defaults.textMinBoxSizeM);
      const heightM = Math.max(Defaults.textBoxHeightM * wf, Defaults.textMinBoxSizeM);
      const center = centerFromTopLeft(anchor, widthM, heightM, 0);
      const created = this.app.scene.createTextBox(center, widthM, heightM, style, "", 0);
      this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: created.id, handleIndex: null });
      this.app.refreshLabelUI();
      this.app.beginTextEdit(created);
    }
  }

  /* ---- Overlay ---- */

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Snap indicator
    if (this.hoverSnapWorld) {
      const s = cam.worldToScreen(this.hoverSnapWorld.x, this.hoverSnapWorld.y);
      drawSnapDot(ctx, s.x, s.y, { ring: true });
    }

    // Preview rectangle
    if (!this.app.textEditor?.isActive()) {
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.08)";
      ctx.strokeStyle = "rgba(77,163,255,0.85)";
      ctx.lineWidth = 1.8;
      if (this._dragStart && this._dragEnd) {
        // Drag-Rechteck (Modus 2)
        const a = cam.worldToScreen(this._dragStart.x, this._dragStart.y);
        const b = cam.worldToScreen(this._dragEnd.x, this._dragEnd.y);
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      } else {
        const anchor = this._previewAnchor(this.app.input);
        const wf = this.app.renderer.worldScaleFactor();
        const widthPx = Defaults.textBoxWidthM * cam.scale * wf;
        const heightPx = Defaults.textBoxHeightM * cam.scale * wf;
        const tl = cam.worldToScreen(anchor.x, anchor.y);
        ctx.fillRect(tl.x, tl.y, widthPx, heightPx);
        ctx.strokeRect(tl.x, tl.y, widthPx, heightPx);
      }
      ctx.restore();
    }
  }
}
