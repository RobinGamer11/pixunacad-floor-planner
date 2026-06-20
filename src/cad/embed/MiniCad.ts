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
import { drawRichTextBox } from "../textRichRenderer";
import { autoSizeTextBox } from "../textAutoSize";
import { ParallelGuideHub } from "../ParallelGuideHub";

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
  /** Called whenever a CAD object selection changes in the embedded editor. */
  onSelectionChange?: (info: MiniCadSelectionInfo | null) => void;
  /** Called when the user requests a parallel guide line via right-click on a
   *  CAD segment. Coordinates are in page-percent (0..100). */
  onCreateParallelGuide?: (p1: { x: number; y: number }, p2: { x: number; y: number }) => void;
  /** Initial serialized state. */
  initialState?: any;
}

export type MiniTool = "line" | "text" | "select" | null;
export type MiniCadSelectionInfo =
  | { tool: "line"; color: string; thicknessMm: number; alpha: number }
  | {
      tool: "text";
      color: string;
      fontSize: number;
      alpha: number;
      align: "left" | "center" | "right";
      bgColor: string;
      bgAlphaPct: number;
      wrap: boolean;
      autoSize: boolean;
      borderEnabled: boolean;
      borderColor: string;
      borderWidthPx: number;
    };

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
  private _onSelectionChange?: (info: MiniCadSelectionInfo | null) => void;
  private _onCreateParallelGuide?: (p1: { x: number; y: number }, p2: { x: number; y: number }) => void;
  private _parallelGuideHub: import("../ParallelGuideHub").ParallelGuideHub | null = null;
  private _coordCleanups: Array<() => void> = [];

  constructor(init: MiniCadInit) {
    this.dom = init.dom;
    this.pageWidthMm = init.pageWidthMm;
    this.pageHeightMm = init.pageHeightMm;
    this.basePxPerMm = init.basePxPerMm;
    this.pageMarginsMm = init.pageMarginsMm ?? 0;
    this._zoom = init.initialZoom;
    this._onChange = init.onChange;
    this._onSelectionChange = init.onSelectionChange;
    this._onCreateParallelGuide = init.onCreateParallelGuide;
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
    this._patchRendererTextPadding();

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
      // Duplicate: TextBox 1:1 mit Inhalt + Style klonen, leicht versetzt einfügen,
      // Klon selektieren — verschieben/ändern erfolgt mit dem Auswahlwerkzeug.
      if (action === "duplicate" && sel &&
          (sel.type === SelectionType.TEXTBOX || sel.type === SelectionType.TEXTBOX_HANDLE) &&
          (sel as any).textBoxId) {
        const src = this.scene.getTextBoxById((sel as any).textBoxId);
        if (src) {
          const offsetM = 0.15;
          const styleClone = JSON.parse(JSON.stringify(src.style || {}));
          const newBox = this.scene.createTextBox(
            { x: src.center.x + offsetM, y: src.center.y + offsetM },
            src.widthM,
            src.heightM,
            { ...styleClone, labelId: src.labelId },
            src.html || "",
            src.rotationRad || 0,
          );
          try { this.pointEditMenu.hide(); } catch {}
          this.setSelection({ type: SelectionType.TEXTBOX, textBoxId: newBox.id, handleIndex: null } as any);
          this._changeDirty = true;
        }
        return;
      }
      if (sel && sel.type === SelectionType.TEXTBOX_HANDLE && (sel as any).textBoxId && sel.handleIndex != null) {
        this.selectTool.beginTextBoxHandleEdit((sel as any).textBoxId, sel.handleIndex, action);
        return;
      }
      this.selectTool.beginPointEdit(action);
    });

    this._installSelectToolFrameFilter();
    this._installCoordRemap();
    this._installDeleteKey();
    this.applyZoom(this._zoom);
    this._installPageFrameSnap();
    this._installParallelGuideContextMenu();

    if (init.initialState) this._restore(init.initialState);
    this._changeDirty = false;
    this._lastSig = this._sceneSignature();

    this._tick();
  }

  /* ===== Page-frame snap (invisible segments at page edge + margin edge) ===== */

  isFrameSegment(seg: { labelId?: string }): boolean {
    return seg.labelId === this._frameLabelId;
  }

  private _installPageFrameSnap() {
    const lm: any = this.labelManager;
    if (!lm.groups.find((g: any) => g.id === this._frameLabelId)) {
      lm.groups.push({ id: this._frameLabelId, name: "__page_frame__", locked: true, visible: true });
      const origList = lm.list.bind(lm);
      lm.list = () => origList().filter((g: any) => g.id !== this._frameLabelId);
    }
    this._rebuildPageFrame();
  }

  private _rebuildPageFrame() {
    this.scene.segments = this.scene.segments.filter((s) => s.labelId !== this._frameLabelId);
    const wM = this.pageWidthMm / 1000;
    const hM = this.pageHeightMm / 1000;
    const mM = Math.max(0, this.pageMarginsMm) / 1000;
    // Unsichtbare Snap-Segmente — Fang funktioniert, gezeichnet wird nichts.
    const style = {
      color: "rgba(0,0,0,0)",
      thicknessM: 0.00001,
      labelId: this._frameLabelId,
    };
    const seg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      try { this.scene.createSegment(a, b, style); } catch {}
    };
    // Outer page frame.
    seg({ x: 0, y: 0 }, { x: wM, y: 0 });
    seg({ x: wM, y: 0 }, { x: wM, y: hM });
    seg({ x: wM, y: hM }, { x: 0, y: hM });
    seg({ x: 0, y: hM }, { x: 0, y: 0 });
    // Inner margin frame (only if margins > 0 and fits).
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

  private _installSelectToolFrameFilter() {
    // Wir filtern Rahmen-Segmente NICHT mehr aus _segmentsFrontToBack heraus,
    // weil dadurch auch das Snapping (findBestSnap nutzt dieselbe Liste) die
    // Page-Frame-Kanten verloren hätte → Textboxen ließen sich beim Verschieben
    // nicht mehr an Seiten-/Randkanten ausrichten.
    // Stattdessen post-processen wir das Auswahlergebnis: landet eine
    // Auswahl auf einem Rahmen-Segment, wird sie sofort wieder geleert.
    const origUpdate = this.selectTool.update.bind(this.selectTool);
    (this.selectTool as any).update = (input: any) => {
      const result = origUpdate(input);
      const sel = this.selection;
      if (sel && sel.segmentId) {
        const seg = this.scene.getSegmentById(sel.segmentId);
        if (seg && this.isFrameSegment(seg)) {
          this.clearSelection();
          try { this.pointEditMenu.hide(); } catch {}
        }
      }
      return result;
    };
  }

  /* ===== Parallel-Hilfslinie per Rechtsklick auf eine CAD-Linie ===== */

  private _installParallelGuideContextMenu() {
    const c = this.dom.canvas;
    const mount = c.parentElement;
    if (!mount) return;
    // Hub lazy erzeugen (DOM wird an den Canvas-Wrapper angehängt).
    const hub = new ParallelGuideHub(mount);
    this._parallelGuideHub = hub;

    const onCtx = (e: MouseEvent) => {
      if (this._destroyed) return;
      // Rechtsklick: contextmenu wird bereits von Input.ts unterdrückt.
      const r = c.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const w = this.camera.screenToWorld(sx, sy);

      // Hit-Test: nächstes nicht-Frame-Segment innerhalb 12 CSS-px.
      const hitPx = 12;
      let bestSeg: any = null;
      let bestDistPx = Infinity;
      for (const seg of this.scene.segments) {
        if (this.isFrameSegment(seg)) continue;
        const a = seg.a, b = seg.b;
        const dxw = b.x - a.x, dyw = b.y - a.y;
        const len2 = dxw * dxw + dyw * dyw;
        if (len2 < 1e-12) continue;
        const t = Math.max(0, Math.min(1, ((w.x - a.x) * dxw + (w.y - a.y) * dyw) / len2));
        const px = a.x + t * dxw, py = a.y + t * dyw;
        const dPx = Math.hypot(w.x - px, w.y - py) * this.camera.scale;
        if (dPx < hitPx && dPx < bestDistPx) {
          bestDistPx = dPx;
          bestSeg = seg;
        }
      }
      if (!bestSeg) return;

      // Side (links/rechts der Quelllinie) anhand der Mausposition bestimmen.
      const a = bestSeg.a, b = bestSeg.b;
      const dxw = b.x - a.x, dyw = b.y - a.y;
      const len = Math.hypot(dxw, dyw) || 1;
      const nx = -dyw / len;
      const ny = dxw / len;
      const signed = (w.x - a.x) * nx + (w.y - a.y) * ny;
      const side = signed >= 0 ? 1 : -1;

      hub.bindCommit((mm) => {
        if (mm == null || !Number.isFinite(mm) || mm < 0) return;
        const dM = mm / 1000;
        const ox = nx * side * dM;
        const oy = ny * side * dM;
        const p1W = { x: a.x + ox, y: a.y + oy };
        const p2W = { x: b.x + ox, y: b.y + oy };
        const toPct = (pt: { x: number; y: number }) => ({
          x: (pt.x * 1000) / this.pageWidthMm * 100,
          y: (pt.y * 1000) / this.pageHeightMm * 100,
        });
        try { this._onCreateParallelGuide?.(toPct(p1W), toPct(p2W)); } catch {}
        hub.hide();
      });
      hub.bindCancel(() => { hub.hide(); });
      hub.showAt(sx, sy, 100);
    };
    c.addEventListener("contextmenu", onCtx);
    this._coordCleanups.push(() => c.removeEventListener("contextmenu", onCtx));
    this._coordCleanups.push(() => { try { hub.destroy(); } catch {} });
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
    const selected = this.getSelectedSegment();
    if (selected && !this.isFrameSegment(selected)) {
      selected.color = applyAlphaToColor(this.defaultLineColor, this.defaultLineAlpha);
      selected.thicknessM = this.defaultLineThicknessM;
      this.refreshLabelUI();
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
    // Schriftgrößen werden in Word/PowerPoint als Punkt (pt) eingegeben.
    // 1pt = 4/3 CSS-Pixel — Umrechnung damit "11" so groß rendert wie in Word.
    if (typeof opts.fontSizePx === "number" && opts.fontSizePx > 0) this.defaultTextFontSizePx = opts.fontSizePx * (4 / 3);
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
    const selected = this.getSelectedTextBox();
    if (selected) {
      selected.style.textColor = applyAlphaToColor(this.defaultTextColor, this.defaultTextAlpha);
      selected.style.fontSizePx = this.defaultTextFontSizePx;
      selected.style.bgColor = this.defaultTextBgColor;
      selected.style.bgAlphaPct = this.defaultTextBgAlphaPct;
      selected.style.wrap = this.defaultTextAutoSize ? this.defaultTextWrap : true;
      selected.style.align = this.defaultTextAlign;
      selected.style.borderEnabled = this.defaultTextBorderEnabled;
      selected.style.borderColor = this.defaultTextBorderColor;
      selected.style.borderWidthPx = this.defaultTextBorderWidthPx;
      (selected.style as any).autoSize = this.defaultTextAutoSize;
      autoSizeTextBox(selected, (this.renderer as any).referencePxPerM);
      if (this.textEditor.isActive()) this.textEditor.reposition(selected);
      this.refreshLabelUI();
    }
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
    // Wrapper-Div in CadOverlayLayer ist bereits um -FRAME_PAD_PX verschoben,
    // daher Canvas hier bei (0,0) lassen — sonst doppelter Offset.
    c.style.left = `0px`;
    c.style.top = `0px`;


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

  private _selectionInfo(selection: Selection | null): MiniCadSelectionInfo | null {
    if (!selection) return null;
    const box = this.getSelectedTextBox();
    if (box) {
      const textColor = splitColorAlpha(box.style.textColor, this.defaultTextColor);
      return {
        tool: "text",
        color: textColor.color,
        fontSize: Math.round(box.style.fontSizePx * (3 / 4)),
        alpha: Math.round(textColor.alpha * 100),
        align: box.style.align,
        bgColor: box.style.bgColor,
        bgAlphaPct: box.style.bgAlphaPct,
        wrap: box.style.wrap,
        autoSize: (box.style as any).autoSize !== false,
        borderEnabled: box.style.borderEnabled,
        borderColor: box.style.borderColor,
        borderWidthPx: box.style.borderWidthPx,
      };
    }
    if (selection.segmentId) {
      const seg = this.scene.getSegmentById(selection.segmentId);
      if (seg && !this.isFrameSegment(seg)) {
        const lineColor = splitColorAlpha(seg.color, this.defaultLineColor);
        return {
          tool: "line",
          color: lineColor.color,
          thicknessMm: Math.max(0.1, Number(((seg.thicknessM / (this._strokeFactor || 1)) * 1000).toFixed(2))),
          alpha: Math.round(lineColor.alpha * 100),
        };
      }
    }
    return null;
  }

  setSelection(selection: Selection | null) {
    this.selection = selection;
    this.renderer.setSelection(selection);
    this._onSelectionChange?.(this._selectionInfo(selection));
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
      ctx.restore();
    };
  }

  /** Override paddingPx auf 0 für eingebettete Textboxen, damit Text exakt
   *  am Platzierungspunkt beginnt (kein 6-px-Versatz nach innen). */
  private _patchRendererTextPadding() {
    const r: any = this.renderer;
    if (typeof r._drawSingleTextBox !== "function") return;
    r._drawSingleTextBox = (box: any) => {
      if (r.editingTextBoxId === box.id) return;
      const cam = r.camera;
      const cs = cam.worldToScreen(box.center.x, box.center.y);
      const widthPx = box.widthM * cam.scale;
      const heightPx = box.heightM * cam.scale;
      drawRichTextBox({
        ctx: r.ctx,
        centerScreenX: cs.x,
        centerScreenY: cs.y,
        widthPx, heightPx,
        rotationRad: box.rotationRad,
        html: box.html || "",
        baseFontSizePx: box.style.fontSizePx * (cam.scale / r.referencePxPerM),
        baseColor: box.style.textColor,
        bgColor: box.style.bgColor,
        bgAlpha: (box.style.bgAlphaPct || 0) / 100,
        align: box.style.align,
        wrap: box.style.wrap,
        borderEnabled: box.style.borderEnabled,
        borderColor: box.style.borderColor,
        borderWidthPx: box.style.borderWidthPx,
        paddingPx: 0,
      });
    };
  }

  private _installDeleteKey() {
    const onKey = (e: KeyboardEvent) => {
      if (this._destroyed) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Niemals löschen, während Text bearbeitet wird.
      if (this.textEditor.isActive()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const sel = this.selection;
      if (!sel) return;
      let removed = false;
      if (sel.segmentId) {
        const s = this.scene.getSegmentById(sel.segmentId);
        if (s) { this.scene.removeSegment(s); removed = true; }
      } else if (sel.type === SelectionType.TEXTBOX || sel.type === SelectionType.TEXTBOX_HANDLE) {
        const box = this.getSelectedTextBox();
        if (box) { this.scene.removeTextBox(box); removed = true; }
      } else if (sel.hatchId) {
        const h = this.scene.getHatchById(sel.hatchId);
        if (h) { this.scene.removeHatch(h); removed = true; }
      }
      if (removed) {
        this.clearSelection();
        this.pointEditMenu.hide();
        this.refreshLabelUI();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    this._coordCleanups.push(() => window.removeEventListener("keydown", onKey));
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

function splitColorAlpha(color: string, fallback: string): { color: string; alpha: number } {
  const c = (color || "").trim();
  let m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (m) {
    const hex = `#${Number(m[1]).toString(16).padStart(2, "0")}${Number(m[2]).toString(16).padStart(2, "0")}${Number(m[3]).toString(16).padStart(2, "0")}`;
    const alpha = m[4] == null ? 1 : Math.max(0, Math.min(1, Number(m[4])));
    return { color: hex, alpha };
  }
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m) return { color: `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase(), alpha: 1 };
  if (/^#[0-9a-f]{6}$/i.test(c)) return { color: c.toLowerCase(), alpha: 1 };
  return { color: fallback, alpha: 1 };
}
