import { Defaults, SelectionType } from "./constants";
import { Vec2, v } from "./geometry";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";
import type { Snap } from "./TopologyEngine";
import { centerFromTopLeft, pointInOrientedBox, boxCornersWorld } from "./textGeometry";
import { drawRichTextBox } from "./textRichRenderer";

/**
 * TextTool — places new text boxes via click. Snaps to all existing geometry
 * (lines, hatches, dimensions, text-box corners) using the TopologyEngine.
 */
export class TextTool {
  app: CadApp;
  id = "text";
  pointSnap: Snap | null = null;

  constructor(app: CadApp) {
    this.app = app;
  }

  activate() {
    this.pointSnap = null;
    this.app.renderer.setHoverSegmentId(null);
    this.app.renderer.setHoverHatchId(null);
    this.app.hub.hide();
    this.app.pointEditMenu.hide();
    this.app.renderer.overlay = { draw: (ctx, cam) => this._drawOverlay(ctx, cam) };
  }

  cancel() {
    this.pointSnap = null;
  }

  finish() { this.cancel(); }

  isDrawing() { return false; }

  private _findSnap(input: Input): Snap | null {
    return this.app.topology.findBestSnap(
      v(input.mouse.sx, input.mouse.sy),
      v(input.mouse.wx, input.mouse.wy),
    );
  }

  private _hitExistingTextBox(input: Input) {
    const mouseW = v(input.mouse.wx, input.mouse.wy);
    for (let i = this.app.scene.textBoxes.length - 1; i >= 0; i--) {
      const box = this.app.scene.textBoxes[i];
      if (!this.app.labelManager.isVisible(box.labelId)) continue;
      if (pointInOrientedBox(mouseW, box)) return box;
    }
    return null;
  }

  private _previewAnchor(input: Input): Vec2 {
    if (this.pointSnap && this.pointSnap.world) {
      return v(this.pointSnap.world.x, this.pointSnap.world.y);
    }
    return v(input.mouse.wx, input.mouse.wy);
  }

  update(input: Input) {
    this.pointSnap = this._findSnap(input);
    this.app.renderer.setHoverSegmentId(this.pointSnap?.segment?.id || null);
    this.app.renderer.setHoverHatchId(this.pointSnap?.hatch?.id || null);
    this.app.hub.hide();

    // Double-click on existing box → start editing it
    if (input.doubleClicked) {
      const box = this._hitExistingTextBox(input);
      if (box) {
        this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: box.id } as any);
        this.app.beginTextBoxEdit(box.id);
        return;
      }
    }

    if (input.clicked) {
      // Clicking inside an existing box → just select it (don't create a new one)
      const existing = this._hitExistingTextBox(input);
      if (existing) {
        this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: existing.id } as any);
        return;
      }

      const anchor = this._previewAnchor(input);
      const style = this.app.getCurrentTextBoxStyle();
      const widthM = Defaults.textBoxWidthM;
      const heightM = Defaults.textBoxHeightM;
      const center = centerFromTopLeft(anchor, widthM, heightM, 0);
      const box = this.app.scene.createTextBox(center, widthM, heightM, style, "", 0);
      this.app.setSelection({ type: SelectionType.TEXTBOX, textBoxId: box.id } as any);
      this.app.refreshLabelUI();
      this.app.beginTextBoxEdit(box.id);
    }
  }

  onTabRequest(): boolean { return false; }

  private _drawOverlay(ctx: CanvasRenderingContext2D, cam: any) {
    // Snap-point indicator
    if (this.pointSnap) {
      const s = cam.worldToScreen(this.pointSnap.world.x, this.pointSnap.world.y);
      ctx.save();
      ctx.fillStyle = "rgba(77,163,255,0.95)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(77,163,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Preview box at the cursor (anchor = top-left)
    const anchor = this._previewAnchor(this.app.input);
    const widthM = Defaults.textBoxWidthM;
    const heightM = Defaults.textBoxHeightM;
    const center = centerFromTopLeft(anchor, widthM, heightM, 0);
    const centerS = cam.worldToScreen(center.x, center.y);
    const widthPx = widthM * cam.scale;
    const heightPx = heightM * cam.scale;
    const style = this.app.getCurrentTextBoxStyle();

    drawRichTextBox({
      ctx,
      centerScreenX: centerS.x,
      centerScreenY: centerS.y,
      widthPx,
      heightPx,
      rotationRad: 0,
      html: "",
      baseFontSizePx: style.fontSizePx ?? Defaults.textFontSizePx,
      baseColor: style.textColor || Defaults.textColor,
      bgColor: style.bgColor || Defaults.textBgColor,
      bgAlpha: 0.08,
      align: (style.align as any) || Defaults.textAlign,
      wrap: !!style.wrap,
      borderEnabled: true,
      borderColor: "rgba(77,163,255,0.85)",
      borderWidthPx: 1.5,
      paddingPx: 6,
    });
  }
}
