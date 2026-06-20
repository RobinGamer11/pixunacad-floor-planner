/**
 * MiniCad — lightweight host for the CAD engine inside the page editor.
 *
 * Wires Camera, Scene, Input, TopologyEngine, Renderer, LineHub,
 * PointEditMenu, LineTool, TextTool and TextEditorOverlay so the embedded
 * page editor behaves 1:1 like the standalone CAD editor (snap, ortho,
 * hub, text editing).
 *
 * Coordinate convention: 1 world unit = 1 meter. Page top-left = world (0,0)
 * + a small constant CSS-pixel padding so snap visualizations at the page
 * edges (and at the page margins) are not clipped or hidden under the grey
 * margin ring.
 */

import { Camera } from "../Camera";
import { Scene } from "../Scene";
import { Input } from "../Input";
import { LabelManager } from "../LabelManager";
import { TopologyEngine } from "../TopologyEngine";
import { Renderer, type Selection } from "../Renderer";
import { LineHub } from "../LineHub";
import { PointEditMenu } from "../PointEditMenu";
import { LineTool } from "../LineTool";
import { TextTool } from "../TextTool";
import { TextEditorOverlay } from "../TextEditorOverlay";
import { SelectTool } from "../SelectTool";
import { Defaults, SelectionType } from "../constants";
import type { TextBox, TextBoxStyle } from "../Scene";

export interface MiniCadTextEditorDom {
  editor: HTMLDivElement;
  toolbar: HTMLDivElement;
  boldBtn: HTMLButtonElement;
  italicBtn: HTMLButtonElement;
  colorInput: HTMLInputElement;
  sizeSelect: HTMLSelectElement;
  symbolSelect: HTMLSelectElement;
}

export interface MiniCadDom {
  canvas: HTMLCanvasElement;
  hubRoot: HTMLDivElement;
  hubLenInput: HTMLInputElement;
  hubAngInput: HTMLInputElement;
  pointEditRoot: HTMLDivElement;
  pointEditButtons: Record<string, HTMLButtonElement>;
  textEditor: MiniCadTextEditorDom;
}

export interface MiniCadInit {
  dom: MiniCadDom;
  /** Page width in millimeters (real paper size). */
  pageWidthMm: number;
  /** Page height in millimeters. */
  pageHeightMm: number;
  /** Base pixels per millimeter at 100% zoom (constant per page). */
  basePxPerMm: number;
  /** Current view zoom (1.0 = 100%). */
  initialZoom: number;
  /** Margin width in millimeters (also exposed as inner snap frame). */
  pageMarginsMm?: number;
  /** Initial line color / thickness defaults. */
  defaultLineColor?: string;
  defaultLineThicknessM?: number;
  /** Called whenever scene geometry changes. */
  onChange?: () => void;
  /** Initial serialized state. */
  initialState?: any;
}

export type MiniTool = "line" | "text" | "select" | null;

/** Extra CSS pixels around the page on the canvas so edge snap dots and the
 *  blue snap line are fully visible (and not occluded by the page's margin
 *  border). Independent of zoom. */
const FRAME_PAD_PX = 16;

export class MiniCad {
  readonly dom: MiniCadDom;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly input: Input;
  readonly topology: TopologyEngine;
  readonly renderer: Renderer;
  readonly hub: LineHub;
  readonly pointEditMenu: PointEditMenu;
  readonly labelManager: LabelManager;
  readonly lineTool: LineTool;
  readonly textTool: TextTool;
  readonly textEditor: TextEditorOverlay;
  readonly selectTool: SelectTool;

  // Stubs required by tools / editor.
  activeDrawLabelId = Defaults.defaultLabelId;
  defaultLineColor: string;
  defaultLineThicknessM: number;
  /** 0..1 (1 = vollständig deckend). */
  defaultLineAlpha = 1;

  // Text defaults (mirror of CadApp).
  defaultTextColor = Defaults.textColor;
  defaultTextFontSizePx = Defaults.textFontSizePx;
  defaultTextBgColor = Defaults.textBgColor;
  defaultTextBgAlphaPct = Defaults.textBgAlphaPct;
  defaultTextWrap = Defaults.textWrap;
  defaultTextAlign: "left" | "center" | "right" = Defaults.textAlign;
  defaultTextBorderEnabled = Defaults.textBorderEnabled;
  defaultTextBorderColor = Defaults.textBorderColor;
  defaultTextBorderWidthPx = Defaults.textBorderWidthPx;
  defaultTextBold = false;
  defaultTextItalic = false;
  defaultTextAlpha = 1;
  /** true = Rahmen wächst automatisch (Modus 1). false = fixer Rahmen mit Drag-Create (Modus 2). */
  defaultTextAutoSize = true;

  // Selection (consumed by TextEditorOverlay & TextTool).
  selection: Selection | null = null;
  /** Pointer to the currently active tool *instance* (TextEditorOverlay
   *  compares against this.app.textTool). */
  activeTool: LineTool | TextTool | null = null;

  // Page geometry.
  pageWidthMm: number;
  pageHeightMm: number;
  basePxPerMm: number;
  pageMarginsMm: number;
  private _zoom: number;
  /** Skaliert "echte Meter"-Strichbreiten auf die internen, von der
   *  CAD-Engine erwarteten thicknessM-Werte. Notwendig, weil wir
   *  `renderer.referencePxPerM` auf `basePxPerMm * 1000` (statt 80 px/m)
   *  setzen, damit Text-Schriftgrößen und Textbox-Defaults auf einer
   *  realen Papierseite vernünftig dimensioniert sind.
   *  Faktor = referencePxPerM / 80. */
  private _strokeFactor: number;

  /** Special label-ID for invisible page-frame segments (snap-only). */
  private _frameLabelId = "__page_frame__";

  private _activeTool: MiniTool = null;
  private _rafId: number | null = null;
  private _destroyed = false;
  private _changeDirty = false;
  private _onChange?: () => void;
  private _coordCleanups: Array<() => void> = [];

  constructor(init: MiniCadInit) {
    this.dom = init.dom;
    this.pageWidthMm = init.pageWidthMm;
    this.pageHeightMm = init.pageHeightMm;
    this.basePxPerMm = init.basePxPerMm;
    this.pageMarginsMm = init.pageMarginsMm ?? 0;
    this._zoom = init.initialZoom;
    this._onChange = init.onChange;
    this._strokeFactor = (this.basePxPerMm * 1000) / 80;
    this.defaultLineColor = init.defaultLineColor ?? Defaults.lineColor;
    this.defaultLineThicknessM = (init.defaultLineThicknessM ?? Defaults.lineThicknessM) * this._strokeFactor;

    this.camera = new Camera();
    this.scene = new Scene();
    this.input = new Input(this.dom.canvas);
    this.labelManager = new LabelManager();
    this.topology = new TopologyEngine(this.scene, this.camera, this.labelManager);
    const ctx = this.dom.canvas.getContext("2d")!;
    this.renderer = new Renderer(ctx, this.camera, this.scene, this.labelManager);
    // Wichtig: Text/Stroke-Skalierung an Seitengröße (echte mm) ausrichten,
    // damit ein 16-px-Text auch 16 px auf der Seite ist (statt riesig).
    this.renderer.referencePxPerM = this.basePxPerMm * 1000;

    this._patchRendererTransparent();

    this.hub = new LineHub(this.dom.hubRoot, this.dom.hubLenInput, this.dom.hubAngInput);
    this.pointEditMenu = new PointEditMenu(this.dom.pointEditRoot, this.dom.pointEditButtons);

    this.lineTool = new LineTool(this as any);
    this.textTool = new TextTool(this as any);
    this.textEditor = new TextEditorOverlay(
      this.dom.textEditor.editor,
      this.dom.textEditor.toolbar,
      this.dom.textEditor.boldBtn,
      this.dom.textEditor.italicBtn,
      this.dom.textEditor.colorInput,
      this.dom.textEditor.sizeSelect,
      this.dom.textEditor.symbolSelect,
      this as any,
    );
    this.selectTool = new SelectTool(this as any);

    // Wire PointEditMenu activation identisch zur CadApp-Oberfläche.
    this.pointEditMenu.bindActivate((action) => {
      const sel = this.selection;
      if (sel && sel.type === SelectionType.TEXTBOX_HANDLE && (sel as any).textBoxId && sel.handleIndex != null) {
        this.selectTool.beginTextBoxHandleEdit((sel as any).textBoxId, sel.handleIndex, action);
        return;
      }
      this.selectTool.beginPointEdit(action);
    });

    // Frame-Segmente (Seitenrand/Innenrahmen) sollen NICHT auswählbar sein.
    // Snap soll an ihnen weiterhin funktionieren → wir filtern nur, wenn der
    // SelectTool die Liste konsultiert.
    this._installSelectToolFrameFilter();

    this._installCoordRemap();
    this.applyZoom(this._zoom);
    this._installPageFrameSnap();

    if (init.initialState) this._restore(init.initialState);
    this._changeDirty = false;
    this._lastSig = this._sceneSignature();

    this._tick();
  }

  /* ===== Frame snap (page edges + margin edges, invisible) ===== */

  isFrameSegment(seg: { labelId?: string }): boolean {
    return seg.labelId === this._frameLabelId;
  }

  private _installPageFrameSnap() {
    const lm: any = this.labelManager;
    lm.groups.push({ id: this._frameLabelId, name: "__page_frame__", locked: true, visible: true });
    const origList = lm.list.bind(lm);
    lm.list = () => origList().filter((g: any) => g.id !== this._frameLabelId);
    this._rebuildPageFrame();
  }

  private _rebuildPageFrame() {
    this.scene.segments = this.scene.segments.filter((s) => s.labelId !== this._frameLabelId);
    const wM = this.pageWidthMm / 1000;
    const hM = this.pageHeightMm / 1000;
    const mM = Math.max(0, this.pageMarginsMm) / 1000;
    const style = {
      color: "rgba(0,0,0,0)",
      thicknessM: 0.0001,
      labelId: this._frameLabelId,
    };
    const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      try { this.scene.createSegment(a, b, style); }
      catch (e) { console.error("MiniCad: frame seg failed:", e); }
    };
    // Outer page frame.
    seg({ x: 0, y: 0 }, { x: wM, y: 0 });
    seg({ x: wM, y: 0 }, { x: wM, y: hM });
    seg({ x: wM, y: hM }, { x: 0, y: hM });
    seg({ x: 0, y: hM }, { x: 0, y: 0 });
    // Inner margin frame (only if margins > 0 and fits inside the page).
    if (mM > 0 && wM - 2 * mM > 1e-4 && hM - 2 * mM > 1e-4) {
      seg({ x: mM, y: mM }, { x: wM - mM, y: mM });
      seg({ x: wM - mM, y: mM }, { x: wM - mM, y: hM - mM });
      seg({ x: wM - mM, y: hM - mM }, { x: mM, y: hM - mM });
      seg({ x: mM, y: hM - mM }, { x: mM, y: mM });
    }
  }

  setPageMargins(mm: number) {
    if (this.pageMarginsMm === mm) return;
    this.pageMarginsMm = mm;
    this._rebuildPageFrame();
  }

  /* ===== Public API ===== */

  setActiveTool(tool: MiniTool) {
    if (this._activeTool === tool) return;
    // Deactivate previous.
    if (this._activeTool === "line") this.lineTool.cancel();
    if (this._activeTool === "text") {
      try { this.textEditor.commit(); } catch {}
      this.textTool.cancel();
    }
    if (this._activeTool === "select") this.selectTool.cancel();
    this._activeTool = tool;
    this.activeTool = null;
    if (tool === "line") {
      this.lineTool.activate();
      this.activeTool = this.lineTool;
    } else if (tool === "text") {
      this.textTool.activate();
      this.activeTool = this.textTool;
    } else if (tool === "select") {
      this.selectTool.activate();
    }
  }

  setLineDefaults(opts: { color?: string; thicknessM?: number; alpha?: number }) {
    if (opts.color) this.defaultLineColor = opts.color;
    if (typeof opts.thicknessM === "number" && opts.thicknessM > 0) {
      this.defaultLineThicknessM = opts.thicknessM * this._strokeFactor;
    }
    if (typeof opts.alpha === "number" && opts.alpha >= 0 && opts.alpha <= 1) {
      this.defaultLineAlpha = opts.alpha;
    }
  }

  setTextDefaults(opts: {
    color?: string;
    fontSizePx?: number;
    bold?: boolean;
    italic?: boolean;
    alpha?: number;
    align?: "left" | "center" | "right";
    bgColor?: string;
    bgAlphaPct?: number;
    wrap?: boolean;
    autoSize?: boolean;
    borderEnabled?: boolean;
    borderColor?: string;
    borderWidthPx?: number;
  }) {
    if (opts.color) this.defaultTextColor = opts.color;
    if (typeof opts.fontSizePx === "number" && opts.fontSizePx > 0) this.defaultTextFontSizePx = opts.fontSizePx;
    if (typeof opts.bold === "boolean") this.defaultTextBold = opts.bold;
    if (typeof opts.italic === "boolean") this.defaultTextItalic = opts.italic;
    if (typeof opts.alpha === "number" && opts.alpha >= 0 && opts.alpha <= 1) this.defaultTextAlpha = opts.alpha;
    if (opts.align) this.defaultTextAlign = opts.align;
    if (opts.bgColor) this.defaultTextBgColor = opts.bgColor;
    if (typeof opts.bgAlphaPct === "number") this.defaultTextBgAlphaPct = Math.max(0, Math.min(100, opts.bgAlphaPct));
    if (typeof opts.wrap === "boolean") this.defaultTextWrap = opts.wrap;
    if (typeof opts.autoSize === "boolean") this.defaultTextAutoSize = opts.autoSize;
    if (typeof opts.borderEnabled === "boolean") this.defaultTextBorderEnabled = opts.borderEnabled;
    if (opts.borderColor) this.defaultTextBorderColor = opts.borderColor;
    if (typeof opts.borderWidthPx === "number" && opts.borderWidthPx >= 0) this.defaultTextBorderWidthPx = opts.borderWidthPx;
  }

  applyZoom(zoom: number) {
    this._zoom = zoom;
    const pageW = this.pageWidthMm * this.basePxPerMm * zoom;
    const pageH = this.pageHeightMm * this.basePxPerMm * zoom;
    const cssW = pageW + FRAME_PAD_PX * 2;
    const cssH = pageH + FRAME_PAD_PX * 2;
    const c = this.dom.canvas;
    const wPx = Math.max(1, Math.round(cssW));
    const hPx = Math.max(1, Math.round(cssH));
    if (c.width !== wPx) c.width = wPx;
    if (c.height !== hPx) c.height = hPx;
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    // Position the canvas so world (0,0) (page top-left) is at FRAME_PAD_PX,FRAME_PAD_PX
    // visually, by shifting the canvas itself.
    c.style.left = `${-FRAME_PAD_PX}px`;
    c.style.top = `${-FRAME_PAD_PX}px`;

    this.renderer.setViewport(c.width, c.height);
    this.camera.scale = this.basePxPerMm * 1000 * zoom;
    this.camera.offsetX = FRAME_PAD_PX;
    this.camera.offsetY = FRAME_PAD_PX;

    // Re-position any open text editor.
    if (this.textEditor.isActive() && this.selection?.textBoxId) {
      const box = this.scene.getTextBoxById(this.selection.textBoxId);
      if (box) this.textEditor.reposition(box);
    }
  }

  serialize(): any {
    const f = this._strokeFactor || 1;
    return {
      version: 3,
      segments: this.scene.segments
        .filter((s) => s.labelId !== this._frameLabelId)
        .map((s) => ({
          id: s.id,
          a: { x: s.a.x, y: s.a.y },
          b: { x: s.b.x, y: s.b.y },
          color: s.color,
          // Speichern in "echten Metern" (intern wird mit _strokeFactor multipliziert).
          thicknessM: s.thicknessM / f,
          labelId: s.labelId,
        })),
      textBoxes: this.scene.textBoxes.map((t) => ({
        id: t.id,
        center: { x: t.center.x, y: t.center.y },
        widthM: t.widthM,
        heightM: t.heightM,
        rotationRad: t.rotationRad,
        html: t.html,
        style: { ...t.style },
        labelId: t.labelId,
      })),
    };
  }

  private _restore(data: any) {
    if (!data) return;
    const f = this._strokeFactor || 1;
    // Vor v3 wurden Strichbreiten bereits intern (in der alten,
    // überdimensionierten Skala) gespeichert → nicht erneut skalieren.
    const segScale = (data.version ?? 1) >= 3 ? f : 1;
    if (Array.isArray(data.segments)) {
      for (const s of data.segments) {
        if (s.labelId === this._frameLabelId) continue;
        try {
          this.scene.createSegment(
            { x: s.a.x, y: s.a.y },
            { x: s.b.x, y: s.b.y },
            {
              color: s.color || this.defaultLineColor,
              thicknessM: (s.thicknessM || (this.defaultLineThicknessM / f)) * segScale,
              labelId: s.labelId || Defaults.defaultLabelId,
            },
          );
        } catch (e) { console.error("MiniCad restore segment:", e); }
      }
    }
    if (Array.isArray(data.textBoxes)) {
      for (const t of data.textBoxes) {
        try {
          this.scene.createTextBox(
            { x: t.center.x, y: t.center.y },
            t.widthM, t.heightM,
            { ...(t.style || {}), labelId: t.labelId || Defaults.defaultLabelId },
            t.html || "",
            t.rotationRad || 0,
          );
        } catch (e) { console.error("MiniCad restore textBox:", e); }
      }
    }
  }


  destroy() {
    this._destroyed = true;
    if (this._rafId != null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    try { this.input.destroy(); } catch {}
    try { this.hub.destroy(); } catch {}
    try { this.textEditor.destroy(); } catch {}
    for (const fn of this._coordCleanups) { try { fn(); } catch {} }
    this._coordCleanups = [];
  }

  /* ===== Required CadApp surface for LineTool / TextTool / TextEditor ===== */

  getCurrentLineStyle() {
    const color = applyAlphaToColor(this.defaultLineColor, this.defaultLineAlpha);
    return {
      color,
      thicknessM: this.defaultLineThicknessM,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  getCurrentTextStyle(): TextBoxStyle {
    const sel = this.getSelectedTextBox();
    if (sel) {
      return {
        textColor: sel.style.textColor,
        fontSizePx: sel.style.fontSizePx,
        bgColor: sel.style.bgColor,
        bgAlphaPct: sel.style.bgAlphaPct,
        wrap: sel.style.wrap,
        align: sel.style.align,
        borderEnabled: sel.style.borderEnabled,
        borderColor: sel.style.borderColor,
        borderWidthPx: sel.style.borderWidthPx,
        autoSize: (sel.style as any).autoSize !== false,
        labelId: sel.labelId,
      } as any;
    }
    return {
      textColor: applyAlphaToColor(this.defaultTextColor, this.defaultTextAlpha),
      fontSizePx: this.defaultTextFontSizePx,
      bgColor: this.defaultTextBgColor,
      bgAlphaPct: this.defaultTextBgAlphaPct,
      wrap: this.defaultTextAutoSize ? this.defaultTextWrap : true,
      align: this.defaultTextAlign,
      borderEnabled: this.defaultTextBorderEnabled,
      borderColor: this.defaultTextBorderColor,
      borderWidthPx: this.defaultTextBorderWidthPx,
      autoSize: this.defaultTextAutoSize,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    } as any;
  }

  getSelectedTextBox(): TextBox | null {
    if (!this.selection) return null;
    if (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE) return null;
    if (!this.selection.textBoxId) return null;
    return this.scene.getTextBoxById(this.selection.textBoxId);
  }

  setSelection(selection: Selection | null) {
    this.selection = selection;
    this.renderer.setSelection(selection);
  }

  clearSelection() { this.setSelection(null); }

  beginTextEdit(box: TextBox) {
    this.textEditor.beginEdit(box);
  }

  refreshLabelUI() {
    this._changeDirty = true;
  }

  /* ===== CadApp surface stubs (required by SelectTool) ===== */

  getSelectedSegment() {
    if (!this.selection || !this.selection.segmentId) return null;
    return this.scene.getSegmentById(this.selection.segmentId);
  }

  getSelectedHatch() {
    if (!this.selection || !this.selection.hatchId) return null;
    return this.scene.getHatchById(this.selection.hatchId);
  }

  getSelectedDimension() { return null; }

  // Sticker-Edit ist im Embed nicht verfügbar — feste No-Op-Werte.
  isStickerEditing(): boolean { return false; }
  enterStickerEdit(_inst: any) {}
  exitStickerEdit() {}
  isPointOutsideStickerEdit(_mouseW: any): boolean { return true; }

  // Settings-Panels existieren im Embed nicht.
  showLineSettingsPanel(_show: boolean) {}
  showHatchSettingsPanel(_show: boolean) {}

  /* ===== Internals ===== */

  private _patchRendererTransparent() {
    const r: any = this.renderer;
    r.render = function () {
      const ctx: CanvasRenderingContext2D = this.ctx;
      ctx.save();
      ctx.clearRect(0, 0, this.vw, this.vh);
      try { this._drawByLabelOrder?.(); } catch (e) { console.error(e); }
      try { this._drawSegmentSelection?.(); } catch {}
      try { this._drawHoverSegmentPoints?.(); } catch {}
      try { this._drawTextBoxSelection?.(); } catch {}
      if (this.overlay && this.overlay.draw) {
        try { this.overlay.draw(ctx, this.camera); } catch (e) { console.error(e); }
  }

  private _installSelectToolFrameFilter() {
    const topo: any = this.topology;
    const origSegs = topo._segmentsFrontToBack.bind(topo);
    const isFrame = (s: any) => this.isFrameSegment(s);
    // Während selectTool.update läuft, blenden wir Rahmen-Segmente aus.
    let filtering = false;
    topo._segmentsFrontToBack = () => {
      const all = origSegs();
      return filtering ? all.filter((s: any) => !isFrame(s)) : all;
    };
    const origUpdate = this.selectTool.update.bind(this.selectTool);
    this.selectTool.update = (input: any) => {
      filtering = true;
      try { return origUpdate(input); }
      finally { filtering = false; }
    };
      ctx.restore();
    };
  }

  private _installCoordRemap() {
    const c = this.dom.canvas;
    const remap = (e: MouseEvent) => {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const sxScale = c.width / r.width;
      const syScale = c.height / r.height;
      this.input.mouse.sx = (e.clientX - r.left) * sxScale;
      this.input.mouse.sy = (e.clientY - r.top) * syScale;
    };
    c.addEventListener("mousemove", remap);
    c.addEventListener("mousedown", remap);
    this._coordCleanups.push(() => c.removeEventListener("mousemove", remap));
    this._coordCleanups.push(() => c.removeEventListener("mousedown", remap));
  }

  private _tick = () => {
    if (this._destroyed) return;
    try {
      this.input.wheelDelta = 0;

      // Panning (Mittlere Maustaste) — identisch zur CAD-Oberfläche.
      if (this.input.isPanning) this.camera.panBy(this.input.panDX, this.input.panDY);

      this.input.update(this.camera);

      if (this._activeTool === "line") this.lineTool.update(this.input);
      else if (this._activeTool === "text") this.textTool.update(this.input);
      else if (this._activeTool === "select") this.selectTool.update(this.input);

      // Geometry change → persist (cover segments AND text boxes AND edits).
      const sig = this._sceneSignature();
      if (sig !== this._lastSig) {
        this._lastSig = sig;
        this._onChange?.();
      } else if (this._changeDirty) {
        this._changeDirty = false;
        this._onChange?.();
      }

      this.renderer.render();
      this.input.endFrame();
    } catch (err) {
      console.error("MiniCad tick error:", err);
      try { this.input.endFrame(); } catch {}
    }
    this._rafId = requestAnimationFrame(this._tick);
  };

  private _lastSig = "";
  private _sceneSignature(): string {
    const segs = this.scene.segments.length;
    const texts = this.scene.textBoxes.length;
    // Include a coarse text snapshot so edits to HTML also fire onChange.
    let h = 0;
    for (const t of this.scene.textBoxes) {
      h = (h * 31 + (t.html?.length || 0) + Math.round(t.center.x * 1000) + Math.round(t.center.y * 1000)) | 0;
    }
    return `${segs}|${texts}|${h}`;
  }
}

/* ============ Helpers ============ */

function applyAlphaToColor(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  const a = Math.max(0, Math.min(1, alpha));
  const c = (color || "").trim();
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m) {
    const r = parseInt(m[1] + m[1], 16);
    const g = parseInt(m[2] + m[2], 16);
    const b = parseInt(m[3] + m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (m) return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(c);
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  return c;
}
