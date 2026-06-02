import { Defaults } from "./constants";
import { autoSizeTextBox } from "./textAutoSize";
import type { CadApp } from "./CadApp";
import type { TextBox } from "./Scene";
import { rgbaFromHex } from "./geometry";

/**
 * Inline HTML contenteditable overlay used to edit a TextBox.
 *
 * - Sized in CSS pixels matching the box's world size at current zoom.
 * - Rotated to match `box.rotationRad`.
 * - On commit, persists `innerHTML` back to `box.html` (parsed by textRichRenderer).
 * - While active, Renderer skips drawing the box (set via `setEditingTextBoxId`).
 *
 * The toolbar is a small floating bar above the box (Bold / Italic / Color /
 * Size / Symbol). It uses `document.execCommand` for inline formatting so the
 * resulting HTML is straightforward for the canvas renderer to reproduce.
 */
export class TextEditorOverlay {
  el: HTMLDivElement;
  toolbarEl: HTMLDivElement;
  app: CadApp;
  activeBoxId: string | null = null;

  boldBtn: HTMLButtonElement;
  italicBtn: HTMLButtonElement;
  colorInput: HTMLInputElement;
  sizeSelect: HTMLSelectElement;
  symbolSelect: HTMLSelectElement;

  private _onDocMouseDown: (e: MouseEvent) => void;
  private _onSelectionChange: () => void;

  constructor(
    el: HTMLDivElement,
    toolbarEl: HTMLDivElement,
    boldBtn: HTMLButtonElement,
    italicBtn: HTMLButtonElement,
    colorInput: HTMLInputElement,
    sizeSelect: HTMLSelectElement,
    symbolSelect: HTMLSelectElement,
    app: CadApp,
  ) {
    this.el = el;
    this.toolbarEl = toolbarEl;
    this.boldBtn = boldBtn;
    this.italicBtn = italicBtn;
    this.colorInput = colorInput;
    this.sizeSelect = sizeSelect;
    this.symbolSelect = symbolSelect;
    this.app = app;

    this._onDocMouseDown = (e: MouseEvent) => {
      if (!this.isActive()) return;
      const t = e.target as Node;
      if (this.el.contains(t) || this.toolbarEl.contains(t)) return;
      // While the TextTool is active, let the tool handle commit on its own
      // click — that way the click is consumed only as a "commit + show preview"
      // step, and a *second* click is needed to place the next box.
      if (this.app.activeTool === this.app.textTool) return;
      this.commit();
    };
    document.addEventListener("mousedown", this._onDocMouseDown);

    // Prevent toolbar interactions from blurring/losing the editor selection
    [boldBtn, italicBtn].forEach(b => b.addEventListener("mousedown", (e) => e.preventDefault()));
    [colorInput, sizeSelect, symbolSelect].forEach(c => c.addEventListener("mousedown", (e) => e.stopPropagation()));

    boldBtn.addEventListener("click", () => {
      this.el.focus();
      try { document.execCommand("styleWithCSS", false, "true"); } catch {}
      document.execCommand("bold", false);
      this._syncToolbarState();
    });
    italicBtn.addEventListener("click", () => {
      this.el.focus();
      try { document.execCommand("styleWithCSS", false, "true"); } catch {}
      document.execCommand("italic", false);
      this._syncToolbarState();
    });
    colorInput.addEventListener("input", () => {
      this.el.focus();
      try { document.execCommand("styleWithCSS", false, "true"); } catch {}
      document.execCommand("foreColor", false, colorInput.value);
      this._syncToolbarState();
    });
    sizeSelect.addEventListener("change", () => {
      this.el.focus();
      this._applyFontSizeToSelection(sizeSelect.value);
      this._syncToolbarState();
    });
    symbolSelect.addEventListener("change", () => {
      const sym = symbolSelect.value;
      if (!sym) return;
      this.el.focus();
      document.execCommand("insertText", false, sym);
      symbolSelect.selectedIndex = 0;
      this._syncToolbarState();
    });

    this._onSelectionChange = () => {
      if (!this.isActive()) return;
      this._syncToolbarState();
    };
    document.addEventListener("selectionchange", this._onSelectionChange);
  }

  isActive(): boolean { return this.activeBoxId != null; }

  beginEdit(box: TextBox) {
    this.activeBoxId = box.id;
    this.el.classList.remove("hidden");
    this.toolbarEl.classList.remove("hidden");
    this.el.contentEditable = "true";
    this.el.spellcheck = false;
    this.el.innerHTML = box.html || "";
    this._applyBoxStyle(box);
    this.reposition(box);
    this.app.renderer.setEditingTextBoxId(box.id);
    this.el.focus();
    this._placeCaretAtEnd();
    this._syncToolbarState();
  }

  reposition(box: TextBox) {
    const cam = this.app.camera;
    const cs = cam.worldToScreen(box.center.x, box.center.y);
    const widthPx = box.widthM * cam.scale;
    const heightPx = box.heightM * cam.scale;

    // Top-left corner in screen px (no rotation: rotation is currently always 0)
    const leftPx = cs.x - widthPx / 2;
    const topPx = cs.y - heightPx / 2;

    this.el.style.position = "absolute";
    this.el.style.left = `${leftPx}px`;
    this.el.style.top = `${topPx}px`;

    // While editing, the *box* follows the *text* (auto-grow), not the other way around.
    // - wrap=true:  fixed width, height grows downward
    // - wrap=false: width and height both grow (single line / explicit \n)
    if (box.style.wrap) {
      this.el.style.width = `${widthPx}px`;
      this.el.style.minWidth = `${widthPx}px`;
      this.el.style.maxWidth = `${widthPx}px`;
      this.el.style.height = "auto";
      this.el.style.minHeight = `${heightPx}px`;
    } else {
      this.el.style.width = "auto";
      this.el.style.minWidth = `${widthPx}px`;
      this.el.style.maxWidth = "none";
      this.el.style.height = "auto";
      this.el.style.minHeight = `${heightPx}px`;
    }

    this.el.style.transform = `rotate(${box.rotationRad}rad)`;
    this.el.style.transformOrigin = "top left";

    const fontPx = box.style.fontSizePx * (cam.scale / Defaults.measureReferenceScalePxPerM);
    this.el.style.fontSize = `${fontPx}px`;
    this.el.style.fontFamily = "system-ui, Arial, sans-serif";
    this.el.style.lineHeight = "1.2";
    this.el.style.color = box.style.textColor;
    this.el.style.background = rgbaFromHex(box.style.bgColor, (box.style.bgAlphaPct || 0) / 100);
    this.el.style.textAlign = box.style.align;
    this.el.style.whiteSpace = box.style.wrap ? "pre-wrap" : "pre";
    this.el.style.overflowWrap = box.style.wrap ? "break-word" : "normal";
    this.el.style.padding = `${6 * (cam.scale / Defaults.measureReferenceScalePxPerM)}px`;
    this.el.style.boxSizing = "border-box";
    this.el.style.overflow = "visible";
    this.el.style.outline = "2px solid rgba(77,163,255,0.45)";
    this.el.style.border = box.style.borderEnabled
      ? `${box.style.borderWidthPx}px solid ${box.style.borderColor}`
      : "none";

    // Toolbar: above the box (in screen space)
    this.toolbarEl.style.position = "absolute";
    const tbLeft = Math.max(8, cs.x - 140);
    const tbTop = Math.max(8, topPx - 44);
    this.toolbarEl.style.left = `${tbLeft}px`;
    this.toolbarEl.style.top = `${tbTop}px`;
  }

  private _applyBoxStyle(box: TextBox) {
    // Sync color picker to box default for new edits
    this.colorInput.value = this._toHexColor(box.style.textColor);
    this.sizeSelect.value = String(Math.round(box.style.fontSizePx));
  }

  private _toHexColor(color: string): string {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    if (computed.startsWith("#")) return computed;
    const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!m) return "#111111";
    return `#${Number(m[1]).toString(16).padStart(2, "0")}${Number(m[2]).toString(16).padStart(2, "0")}${Number(m[3]).toString(16).padStart(2, "0")}`;
  }

  private _placeCaretAtEnd() {
    const range = document.createRange();
    range.selectNodeContents(this.el);
    range.collapse(false);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  private _applyFontSizeToSelection(sizePx: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    try {
      document.execCommand("fontSize", false, "7"); // tagging trick
      const fonts = this.el.querySelectorAll('font[size="7"]');
      fonts.forEach(node => {
        const span = document.createElement("span");
        span.style.fontSize = `${sizePx}px`;
        span.innerHTML = (node as HTMLElement).innerHTML;
        node.replaceWith(span);
      });
    } catch {}
  }

  private _syncToolbarState() {
    let bold = false, italic = false;
    try {
      bold = document.queryCommandState("bold");
      italic = document.queryCommandState("italic");
    } catch {}
    this.boldBtn.classList.toggle("active", bold);
    this.italicBtn.classList.toggle("active", italic);
  }

  commit() {
    if (!this.isActive()) return;
    const box = this.app.scene.getTextBoxById(this.activeBoxId!);
    if (!box) { this.hide(); return; }

    // 1) Persist HTML
    const html = this.el.innerHTML;
    box.html = html;

    // 2) Empty box → auto-delete
    const plain = (this.el.textContent || "").replace(/\u200B/g, "").trim();
    const hasContent = plain.length > 0 || /<img|<br\s*\/?>(?!\s*$)/i.test(html);
    if (!hasContent) {
      this.app.scene.removeTextBox(box);
      this.app.clearSelection();
      this.app.refreshLabelUI();
      this.hide();
      return;
    }

    // 3) Auto-grow box to fit the content using the canvas-renderer measurement
    //    (zoom-independent, source of truth). Top-left stays anchored.
    //    - wrap=true : width fixed, height grows.
    //    - wrap=false: width AND height grow to fit the longest line.
    autoSizeTextBox(box);

    this.hide();
  }

  hide() {
    this.activeBoxId = null;
    this.el.classList.add("hidden");
    this.toolbarEl.classList.add("hidden");
    this.el.innerHTML = "";
    this.app.renderer.setEditingTextBoxId(null);
  }

  destroy() {
    document.removeEventListener("mousedown", this._onDocMouseDown);
    document.removeEventListener("selectionchange", this._onSelectionChange);
  }
}
