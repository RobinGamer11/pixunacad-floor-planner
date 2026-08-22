import { Defaults } from "./constants";
import { autoSizeTextBox } from "./textAutoSize";
import type { CadApp } from "./CadApp";
import type { TextBox } from "./Scene";
import { rgbaFromHex } from "./geometry";
import { maybeRasterize } from "./rasterize";
import { ptToCssPx, textStyleFontSizePt } from "./textTypography";
import { normalizeRichTextHtml } from "./textRichRenderer";
import { sanitizePastedHtml, plainTextToHtml } from "./textPasteSanitize";

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
  private _typingStyle: {
    color?: string; fontSizePt?: number;
    bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  } = {};

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
      // Klicks in den seitlichen Werkzeug-Einstellungen dürfen die Text-Markierung
      // NICHT verlieren — sie sollen genau auf die Auswahl wirken.
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest?.("aside")) {
        if (!targetEl.closest("input, textarea, select, [contenteditable='true']")) {
          e.preventDefault();
        } else {
          // Fokus wandert ins Eingabefeld → Markierung als CSS-Highlight sichtbar halten.
          this._paintPersistentHighlight();
          setTimeout(() => this._paintPersistentHighlight(), 0);
        }
        return;
      }

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
      const sel = window.getSelection();
      const inEditor = !!sel && sel.rangeCount > 0 && this.el.contains(sel.getRangeAt(0).commonAncestorContainer);
      this._captureRange();
      // Native Auswahl sichtbar → kein zusätzliches Highlight nötig.
      if (inEditor) this._clearPersistentHighlight();
      this._syncToolbarState();
    };

    document.addEventListener("selectionchange", this._onSelectionChange);
  }

  isActive(): boolean { return this.activeBoxId != null; }

  /* ---------- Zeichen-Auswahl / Caret innerhalb des Editors ---------- */

  /** Zuletzt bekannte Range im Editor — auch kollabiert (Caret). */
  private _savedRange: Range | null = null;

  private _captureRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!this.el.contains(range.commonAncestorContainer)) return;
    this._savedRange = range.cloneRange();
  }

  private _rangeInEditor(): Range | null {
    if (!this.isActive() || !this._savedRange) return null;
    if (!this.el.contains(this._savedRange.commonAncestorContainer)) return null;
    return this._savedRange;
  }

  /** true, wenn im offenen Editor gerade Zeichen markiert sind. */
  hasTextSelection(): boolean {
    const r = this._rangeInEditor();
    return !!r && !r.collapsed;
  }

  /** true, wenn der Editor offen ist und der Caret (ohne Auswahl) darin steht. */
  hasCaret(): boolean {
    const r = this._rangeInEditor();
    return !!r && r.collapsed;
  }

  /** true, wenn eine Formatierung an den Editor (Auswahl oder Caret) gehen muss. */
  ownsTextFormatting(): boolean {
    return this.isActive() && (this.hasTextSelection() || this.hasCaret());
  }

  private _restoreRange(allowCollapsed = false): boolean {
    const r = this._rangeInEditor();
    if (!r) return false;
    if (r.collapsed && !allowCollapsed) return false;
    this.el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  }

  /* ---------- Sichtbare Markierung erhalten, auch ohne Editor-Fokus ---------- */

  private static _highlightCssInjected = false;

  private _ensureHighlightCss() {
    if (TextEditorOverlay._highlightCssInjected) return;
    TextEditorOverlay._highlightCssInjected = true;
    const style = document.createElement("style");
    style.textContent = `::highlight(cad-text-selection){background:rgba(77,163,255,0.35);}`;
    document.head.appendChild(style);
  }

  /** Malt die gespeicherte Auswahl als CSS-Highlight (bleibt bei Fokusverlust sichtbar). */
  private _paintPersistentHighlight() {
    const anyCss = (window as any).CSS;
    if (!anyCss?.highlights || typeof (window as any).Highlight !== "function") return;
    const r = this._rangeInEditor();
    if (!r || r.collapsed) { this._clearPersistentHighlight(); return; }
    this._ensureHighlightCss();
    try {
      anyCss.highlights.set("cad-text-selection", new (window as any).Highlight(r.cloneRange()));
    } catch {}
  }

  private _clearPersistentHighlight() {
    const anyCss = (window as any).CSS;
    try { anyCss?.highlights?.delete?.("cad-text-selection"); } catch {}
  }

  /**
   * Führt eine Formatierung aus, ohne den Fokus (z. B. ein Zahlenfeld im
   * Einstellungs-Panel) dauerhaft zu stehlen — inkl. Caret-Position im Feld.
   */
  private _withPreservedOuterFocus<T>(fn: () => T): T {
    const active = document.activeElement as HTMLElement | null;
    const isOuter = !!active && !this.el.contains(active) && active !== document.body;
    let selStart: number | null = null;
    let selEnd: number | null = null;
    const input = isOuter && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
      ? active
      : null;
    if (input) {
      try { selStart = input.selectionStart; selEnd = input.selectionEnd; } catch {}
    }
    const out = fn();
    if (isOuter && active) {
      this._paintPersistentHighlight();
      try {
        active.focus({ preventScroll: true });
        if (input && selStart != null && selEnd != null) input.setSelectionRange(selStart, selEnd);
      } catch {}
    }
    return out;
  }

  /**
   * Wendet Zeichen-Formatierung kontextabhängig an:
   *  - Auswahl vorhanden → nur der markierte Bereich (Auswahl bleibt erhalten).
   *  - nur Caret         → "Typing Style" für ab hier neu getippten Text.
   * Gibt false zurück, wenn der Editor gar nicht zuständig ist (Objektmodus).
   */
  applyInlineFormat(opts: {
    color?: string;
    fontSizePt?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
  }): boolean {
    if (!this.isActive()) return false;

    if (this.hasTextSelection()) {
      return this._withPreservedOuterFocus(() => {
        if (!this._restoreRange()) return false;
        try { document.execCommand("styleWithCSS", false, "true"); } catch {}

        const setState = (cmd: string, want: boolean) => {
          let cur = false;
          try { cur = document.queryCommandState(cmd); } catch {}
          if (cur !== want) document.execCommand(cmd, false);
        };

        if (opts.color) document.execCommand("foreColor", false, opts.color);
        if (typeof opts.bold === "boolean") setState("bold", opts.bold);
        if (typeof opts.italic === "boolean") setState("italic", opts.italic);
        if (typeof opts.underline === "boolean") setState("underline", opts.underline);
        if (typeof opts.strike === "boolean") setState("strikeThrough", opts.strike);
        if (typeof opts.fontSizePt === "number" && opts.fontSizePt > 0) {
          this._applyFontSizePtToSelection(opts.fontSizePt);
        }

        // Markierung für Folge-Änderungen sichtbar erhalten.
        this._captureRange();
        this._restoreRange();
        this._paintPersistentHighlight();
        this._syncBoxFromEditor();
        return true;
      });
    }

    if (this.hasCaret()) {
      return this._withPreservedOuterFocus(() => {
        this._applyTypingStyle(opts);
        this._syncBoxFromEditor();
        return true;
      });
    }

    return false;
  }


  /** Schaltet einen Zeichenstil für Auswahl/Caret um (Word-Verhalten). */
  toggleInlineStyle(key: "bold" | "italic" | "underline" | "strike"): boolean {
    if (!this.ownsTextFormatting()) return false;
    const cmd = key === "strike" ? "strikeThrough" : key;
    this._restoreRange(true);
    let cur = false;
    try { cur = document.queryCommandState(cmd); } catch {}
    return this.applyInlineFormat({ [key]: !cur } as any);
  }

  /** Word/PowerPoint-Verhalten: Stil gilt ab Caret für neu getippten Text. */
  private _applyTypingStyle(opts: {
    color?: string; fontSizePt?: number;
    bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean;
  }) {
    this._typingStyle = { ...this._typingStyle, ...opts };
  }

  private _createTypingSpan(text: string): HTMLSpanElement {
    const span = document.createElement("span");
    const opts = this._typingStyle;
    if (opts.color) span.style.color = opts.color;
    if (typeof opts.fontSizePt === "number" && opts.fontSizePt > 0) span.dataset.fontSizePt = String(opts.fontSizePt);
    if (typeof opts.bold === "boolean") span.style.fontWeight = opts.bold ? "700" : "400";
    if (typeof opts.italic === "boolean") span.style.fontStyle = opts.italic ? "italic" : "normal";
    const deco: string[] = [];
    if (opts.underline) deco.push("underline");
    if (opts.strike) deco.push("line-through");
    if (typeof opts.underline === "boolean" || typeof opts.strike === "boolean") {
      span.style.textDecoration = deco.length ? deco.join(" ") : "none";
    }
    span.textContent = text;
    return span;
  }

  private _syncBoxFromEditor() {
    const box = this.activeBoxId ? this.app.scene.getTextBoxById(this.activeBoxId) : null;
    if (!box) return;
    box.html = this._documentHtml();
    if ((box.style as any).autoSize !== false) {
      autoSizeTextBox(box, (this.app.renderer as any).referencePxPerM);
      this.reposition(box);
    }
    (this.app as any).requestRender?.();
    (this.app as any).renderer?.render?.();
  }

  /** Entfernt ausschließlich darstellungsabhängige Editor-CSS aus den Daten. */
  private _documentHtml(): string {
    const clone = this.el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>("[data-font-size-pt]").forEach(node => {
      node.style.removeProperty("font-size");
      if (!node.getAttribute("style")) node.removeAttribute("style");
    });
    return normalizeRichTextHtml(clone.innerHTML);
  }

  private _applyFontSizePtToSelection(pt: number) {
    try {
      const range = this._rangeInEditor();
      if (!range || range.collapsed) return;
      const span = document.createElement("span");
      span.dataset.fontSizePt = String(pt);
      span.appendChild(range.extractContents());
      range.insertNode(span);
      const next = document.createRange();
      next.selectNodeContents(span);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(next);
      this._savedRange = next.cloneRange();
    } catch {}
  }




  beginEdit(box: TextBox) {
    this.activeBoxId = box.id;
    this._savedRange = null;
    this._typingStyle = {};
    this.el.classList.remove("hidden");
    // Toolbar im Embed ausgeblendet lassen — Einstellungen liegen bereits
    // im seitlichen Werkzeug-Einstellungs-Panel.
    this.toolbarEl.classList.add("hidden");
    this.el.contentEditable = "true";
    this.el.spellcheck = false;
    this.el.innerHTML = normalizeRichTextHtml(box.html || "");
    this._applyBoxStyle(box);
    this.reposition(box);
    this.app.renderer.setEditingTextBoxId(box.id);
    this.el.focus({ preventScroll: true });
    this._placeCaretAtEnd();
    this._syncToolbarState();
    // Live auto-grow: während des Tippens Rahmen an Inhalt anpassen.
    this.el.oninput = () => {
      const b = this.app.scene.getTextBoxById(this.activeBoxId!);
      if (!b) return;
      b.html = this._documentHtml();
      if ((b.style as any).autoSize !== false) {
        autoSizeTextBox(b, (this.app.renderer as any).referencePxPerM);
        this.reposition(b);
      }
    };
    this.el.onbeforeinput = (event) => {
      if (event.inputType !== "insertText" || !event.data || Object.keys(this._typingStyle).length === 0) return;
      const range = this._rangeInEditor();
      if (!range || !range.collapsed) return;
      event.preventDefault();
      const span = this._createTypingSpan(event.data);
      range.insertNode(span);
      const after = document.createRange();
      after.setStartAfter(span);
      after.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
      this._savedRange = after.cloneRange();
      this._syncBoxFromEditor();
    };
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
    // - autoSize=false: BOTH width and height are fixed → text wraps and is clipped/scrolled.
    // - wrap=true:  fixed width, height grows downward
    // - wrap=false: width and height both grow (single line / explicit \n)
    const autoSize = (box.style as any).autoSize !== false;
    if (!autoSize) {
      this.el.style.width = `${widthPx}px`;
      this.el.style.minWidth = `${widthPx}px`;
      this.el.style.maxWidth = `${widthPx}px`;
      this.el.style.height = `${heightPx}px`;
      this.el.style.minHeight = `${heightPx}px`;
      this.el.style.maxHeight = `${heightPx}px`;
    } else if (box.style.wrap) {
      this.el.style.width = `${widthPx}px`;
      this.el.style.minWidth = `${widthPx}px`;
      this.el.style.maxWidth = `${widthPx}px`;
      this.el.style.height = "auto";
      this.el.style.minHeight = `${heightPx}px`;
      this.el.style.maxHeight = "none";
    } else {
      this.el.style.width = "auto";
      this.el.style.minWidth = `${widthPx}px`;
      this.el.style.maxWidth = "none";
      this.el.style.height = "auto";
      this.el.style.minHeight = `${heightPx}px`;
      this.el.style.maxHeight = "none";
    }

    this.el.style.transform = `rotate(${box.rotationRad}rad)`;
    this.el.style.transformOrigin = "top left";

    // Use the renderer's referencePxPerM (matches the canvas-rendered text 1:1).
    const refPxPerM = (this.app.renderer as any).referencePxPerM || Defaults.measureReferenceScalePxPerM;
    const fontPx = ptToCssPx(textStyleFontSizePt(box.style)) * (cam.scale / refPxPerM);
    this.el.style.fontSize = `${fontPx}px`;
    // Inline-Größen sind Dokumentwerte in pt und erhalten denselben Zoomfaktor
    // wie die Basisgröße. Der Canvas-Renderer verwendet exakt dieselbe Formel.
    this.el.querySelectorAll<HTMLElement>("[data-font-size-pt]").forEach(node => {
      const pt = parseFloat(node.dataset.fontSizePt || "");
      if (Number.isFinite(pt) && pt > 0) node.style.fontSize = `${ptToCssPx(pt) * (cam.scale / refPxPerM)}px`;
    });
    this.el.style.fontFamily = "system-ui, Arial, sans-serif";
    this.el.style.lineHeight = String(Math.max(0.6, ((box.style as any).lineHeightPct ?? 105) / 100));
    this.el.style.fontWeight = (box.style as any).bold ? "700" : "400";
    this.el.style.fontStyle = (box.style as any).italic ? "italic" : "normal";
    {
      const deco: string[] = [];
      if ((box.style as any).underline) deco.push("underline");
      if ((box.style as any).strike) deco.push("line-through");
      this.el.style.textDecoration = deco.length ? deco.join(" ") : "none";
    }
    this.el.style.color = box.style.textColor;
    this.el.style.background = rgbaFromHex(box.style.bgColor, (box.style.bgAlphaPct || 0) / 100);
    this.el.style.textAlign = box.style.align;
    this.el.style.whiteSpace = box.style.wrap ? "pre-wrap" : "pre";
    this.el.style.overflowWrap = box.style.wrap ? "break-word" : "normal";
    this.el.style.padding = `${cam.scale / refPxPerM}px`;
    this.el.style.boxSizing = "border-box";
    this.el.style.overflow = autoSize ? "visible" : "hidden";
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
    // Toolbar zeigt die Größe in pt (Word/PowerPoint); intern px = pt * 4/3.
    this.sizeSelect.value = String(Math.round(textStyleFontSizePt(box.style)));
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

  private _applyFontSizeToSelection(sizePt: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    this._applyFontSizePtToSelection(Math.max(1, parseFloat(sizePt) || 0));
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
    // Typing-Style-Anker (Zero-Width-Spaces) vor dem Speichern entfernen.
    const html = this._documentHtml();
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
    autoSizeTextBox(box, (this.app.renderer as any).referencePxPerM);

    this.hide();

    // 4) Pixelmodus: fertigen Textkasten in ein Bildobjekt rastern.
    maybeRasterize(this.app, { type: "text", obj: box });
  }

  hide() {
    this.activeBoxId = null;
    this._savedRange = null;
    this._typingStyle = {};
    this._clearPersistentHighlight();
    this.el.classList.add("hidden");
    this.toolbarEl.classList.add("hidden");
    this.el.innerHTML = "";
    this.el.onbeforeinput = null;
    this.app.renderer.setEditingTextBoxId(null);
  }

  destroy() {
    this._clearPersistentHighlight();
    document.removeEventListener("mousedown", this._onDocMouseDown);
    document.removeEventListener("selectionchange", this._onSelectionChange);
  }
}

