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
import { IdPanel } from "../IdPanel";
import { TopologyEngine } from "../TopologyEngine";
import { Renderer, type Selection } from "../Renderer";
import { RasterLayers } from "../RasterLayers";
import { mirrorProxy } from "../multiEdit";
import { LineHub } from "../LineHub";
import { PointEditMenu } from "../PointEditMenu";
import { LineTool } from "../LineTool";
import { TextTool } from "../TextTool";
import { TextEditorOverlay } from "../TextEditorOverlay";
import { SelectTool } from "../SelectTool";
import { FreeDrawTool } from "../FreeDrawTool";
import { EraserTool } from "../EraserTool";
import { PipetteTool } from "../PipetteTool";
import { HatchTool, type HatchDrawMode } from "../HatchTool";
import { DocumentTool } from "../DocumentTool";
import { Defaults, SelectionType, PointEditAction } from "../constants";
import type { TextBox, TextBoxStyle, FreeLineStyle } from "../Scene";
import { drawRichTextBox } from "../textRichRenderer";
import { ptToCssPx, textStyleFontSizePt } from "../textTypography";
import { dominantRichStyle } from "../textDominantStyle";
import { autoSizeTextBox } from "../textAutoSize";
import { isExportMode } from "@/lib/printExport";


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
  /** Called whenever a CAD object selection changes in the embedded editor.
   *  Second argument is the total number of selected objects (>= 1 when info != null). */
  onSelectionChange?: (info: MiniCadSelectionInfo | null, count?: number) => void;
  /** Initial serialized state. */
  initialState?: any;
}

type SelectionGeometrySnapshot =
  | { kind: "segment"; a: { x: number; y: number }; b: { x: number; y: number } }
  | { kind: "hatch"; pts: { x: number; y: number }[]; holes: { x: number; y: number }[][] | null }
  | { kind: "textbox"; center: { x: number; y: number } }
  | { kind: "sticker"; pos: { x: number; y: number } }
  | { kind: "doc"; pos: { x: number; y: number } }
  | { kind: "freestroke"; pts: { x: number; y: number }[] };


export type MiniTool = "line" | "text" | "select" | "guide" | "free" | "eraser" | "hatch" | "document" | "pipette" | null;
export type MiniCadSelectionInfo =
  | {
      tool: "line";
      color: string;
      thicknessMm: number;
      alpha: number;
      isGuide?: boolean;
      midpointSnap?: boolean;
      divisionSnap?: number | null;
    }
  | {
      tool: "free";
    }
  | {
      tool: "document";
      id: string;
    }
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
    }
  | {
      tool: "hatch";
      id: string;
    };


/** Überstand (CSS-Pixel) der Zeichenfläche rings um die Papierseite.
 *  Zweck: Fangpunkte und Hilfslinien am Blattrand bleiben sichtbar UND
 *  Inhalte, die über die Seite hinausragen, werden auf der grauen
 *  Arbeitsfläche weiter dargestellt (der PDF-Export beschneidet weiterhin
 *  exakt an der Papierkante, da er nur die Seitenwurzel erfasst).
 *  Zoomunabhängig. */
export const FRAME_PAD_PX = 96;

/** Zwei Selections referenzieren dasselbe Objekt, wenn eine ihrer ID-Felder
 *  (Segment, Hatch, TextBox, Sticker, FreeStroke, Document, Wall) übereinstimmt. */
function _sameObject(a: Selection, b: Selection): boolean {
  const ids: (keyof Selection | string)[] = [
    "segmentId", "hatchId", "textBoxId", "stickerInstanceId",
    "documentId", "freeStrokeId", "wallId",
  ];
  for (const k of ids) {
    const av = (a as any)[k];
    const bv = (b as any)[k];
    if (av && bv && av === bv) return true;
  }
  return false;
}


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
  readonly freeDrawTool: FreeDrawTool;
  readonly eraserTool: EraserTool;
  readonly pipetteTool: PipetteTool;
  readonly hatchTool: HatchTool;
  readonly documentTool: DocumentTool;

  // Stubs required by tools / editor.
  activeDrawLabelId = Defaults.defaultLabelId;
  /** Aktive Ebenen-Auswahl (mirror of CadApp.selectedLabelId). */
  selectedLabelId: string | null = null;
  /** Optional imperativer IdPanel-Adapter (wenn CadOverlayLayer refs bereitstellt). */
  idPanel: IdPanel | null = null;
  defaultLineColor: string;
  defaultLineThicknessM: number;
  /** 0..1 (1 = vollständig deckend). */
  defaultLineAlpha = 1;

  // Freihand-Defaults (analog CadApp).
  defaultFreeColor: string = Defaults.freeColor;
  defaultFreeThicknessM: number = Defaults.freeThicknessM;
  defaultFreeOpacity: number = Defaults.freeOpacity;
  defaultFreeLineStyle: FreeLineStyle = Defaults.freeLineStyle as FreeLineStyle;
  defaultFreeGapM: number = Defaults.freeGapM;
  defaultFreeImageSrc: string | null = null;
  defaultFreeImageSizeM: number = Defaults.freeImageSizeM;
  defaultFreeImageSpacingM: number = Defaults.freeImageSpacingM;
  defaultFreeImageRotate: boolean = Defaults.freeImageRotate;
  defaultFreeAutoShape: boolean = false;
  /** Zeichenmodus: "vector" oder "pixel" (Rasterung beim Fertigstellen). */
  defaultDrawRasterMode: "vector" | "pixel" = "vector";

  /**
   * Raster-Zeichenebenen der Seite (Pixelmodus). Pro Ebene ein gekachelter
   * Rasterinhalt im selben Papier-Koordinatensystem wie die Vektorobjekte.
   */
  readonly rasterLayers = new RasterLayers();
  /** Projektweite Rasterqualität für neu fertiggestellte Pixelobjekte. */
  pixelRenderDpi: number = 1200;
  pixelSupersampling: boolean = false;
  pixelSupersamplingFactor: 2 | 4 = 2;
  // Radiergummi-Defaults.
  defaultEraserRadiusM: number = Defaults.eraserRadiusM;
  defaultEraserStrength: number = Defaults.eraserStrength;
  defaultEraserMode: "hard" | "smooth" = Defaults.eraserMode;
  defaultEraserSoftness: number = Defaults.eraserSoftness;
  /** Radierseite relativ zum Lineal: links / mittig / rechts. */
  defaultEraserRulerSide: "left" | "center" | "right" = "center";
  /** Hook: wird bei jedem Radier-Stempel aufgerufen (Welt-m). Erlaubt externen
   *  Objekten (z. B. CAD-Blatt in der Projektmappe) mitzuradieren. */
  onEraseStroke: ((centerM: { x: number; y: number }, radiusM: number, mode: "hard" | "smooth", softness: number, strength: number) => void) | null = null;


  // Schraffur-Defaults (analog CadApp).
  defaultHatchFillColor: string = Defaults.hatchFillColor;
  defaultHatchStrokeColor: string = Defaults.hatchStrokeColor;
  defaultHatchStrokeWidthPx: number = Defaults.hatchStrokePx;
  defaultHatchFillAlphaPct: number = Defaults.hatchFillAlphaPct;
  /** Radierte Schraffur-Kanten automatisch glätten. */
  defaultHatchAutoSmooth: boolean = true;
  defaultHatchPatternEnabled: boolean = false;
  defaultHatchPatternId: string = "mauerwerk";
  defaultHatchPatternScale: number = 1;
  defaultHatchPatternAngleDeg: number = 0;
  defaultHatchPatternSkewDeg: number = 0;
  defaultHatchPatternStretch: number = 1;
  defaultAreaShow: boolean = Defaults.areaShow;

  /** Optionaler Callback für React-Panels (Bezeichnungen/Ausgewählter-Stroke-Refresh). */
  onLabelsChange?: () => void;
  /** Parameterloser Selection-Change-Callback für React-Panels (`FreeDrawSettingsPanel` etc.).
   *  Wird nach dem intern getypten `_onSelectionChange` gefeuert. */
  onSelectionChange?: () => void;

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
  defaultTextUnderline = false;
  defaultTextStrike = false;
  defaultTextLineHeightPct = Defaults.textLineHeightPct;
  defaultTextAlpha = 1;
  /** true = Rahmen wächst automatisch (Modus 1). false = fixer Rahmen mit Drag-Create (Modus 2). */
  defaultTextAutoSize = true;

  // Selection (consumed by TextEditorOverlay & TextTool).
  // `selection` ist die "primary" Selection (immer === selections.at(-1)).
  // `selections` ist die volle Liste bei Mehrfach-Auswahl.
  selection: Selection | null = null;
  selections: Selection[] = [];
  /** Pointer to the currently active tool *instance* (TextEditorOverlay
   *  compares against this.app.textTool). */
  activeTool: LineTool | TextTool | null = null;
  /** Multi-Select-Modus: jeder Klick toggelt in/aus der Auswahl (statt zu ersetzen). */
  private _multiSelectMode: boolean = false;
  /** Live Shift-Status; während eines Pointer/Klick-Events read-aktualisiert. */
  private _shiftDown: boolean = false;
  private _lastMarqueeSelectionCount = 0;


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
  /** Special label-ID for invisible external rect segments (Zeichenblatt/PDF/Bild). */
  private _extRectLabelId = "__ext_rect__";
  /** Special label-ID for invisible external DocumentObjects (Projektmappen-PDF/Bild). */
  private _extDocLabelId = "__ext_doc__";
  /** Special label-ID for invisible ghost snap segments from an overlay page. */
  private _ghostLabelId = "__ghost_snap__";
  private _ghostInstalled = false;

  /** Hub-Box-Zustand für Dokument-Ecken (analog CadApp). Wird von SelectTool gesetzt. */
  documentHubState: { visible: boolean; screenX: number; screenY: number; docId: string | null; cornerIndex: number; anchorWorld: { x: number; y: number } | null; cropSide: "top" | "right" | "bottom" | "left" | null } = {
    visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null,
  };
  documentHubMode: "none" | "move" | "rotate" | "scale" | "crop" = "none";
  documentHubFirstClick: { x: number; y: number } | null = null;
  /** Compat mit SelectTool aus CadApp — Maßketten gibt es im Embed nicht. */
  dimensionHubMode: "none" | "move" = "none";
  dimensionHubState: { visible: boolean; screenX: number; screenY: number; dimensionId: string | null } = {
    visible: false, screenX: 0, screenY: 0, dimensionId: null,
  };

  /** Map externalId → docId; Snapshot zur Diff-Erkennung. */
  private _externalDocs: Map<string, string> = new Map();
  private _externalDocSnapshots: Map<string, string> = new Map();
  private _externalDocChange: ((id: string, t: { xMM: number; yMM: number; wMM: number; hMM: number; rotationDeg: number; guideEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean } }) => void) | null = null;
  private _externalDocDelete: ((id: string) => void) | null = null;


  private _activeTool: MiniTool = null;
  private _rafId: number | null = null;
  private _destroyed = false;
  private _changeDirty = false;
  private _onChange?: () => void;
  private _onSelectionChange?: (info: MiniCadSelectionInfo | null, count?: number) => void;
  private _coordCleanups: Array<() => void> = [];
  /** Aktiv während das Hilfslinien-Werkzeug läuft — neue Segmente werden als
   *  Hilfslinien markiert (isGuide=true). */
  private _guideMode: boolean = false;
  /** Wenn true, sind alle Hilfslinien-Segmente nicht auswählbar/editierbar. */
  private _guidesLocked: boolean = false;
  /** Default-Farbe für neue Hilfslinien (überschreibt Linienfarbe im Guide-Modus). */
  private _guideColor: string = "#4DA3FF";

  constructor(init: MiniCadInit) {
    this.dom = init.dom;
    this.pageWidthMm = init.pageWidthMm;
    this.pageHeightMm = init.pageHeightMm;
    this.basePxPerMm = init.basePxPerMm;
    this.pageMarginsMm = init.pageMarginsMm ?? 0;
    this._zoom = init.initialZoom;
    this._onChange = init.onChange;
    this._onSelectionChange = init.onSelectionChange;
    
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
    // Rasterinhalt in die normale Ebenenreihenfolge des Renderers einhängen.
    this.renderer.rasterLayers = this.rasterLayers;
    this.rasterLayers.onReady = () => { try { this.renderer.render(); } catch { /* noop */ } };
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
    this.freeDrawTool = new FreeDrawTool(this as any);
    this.eraserTool = new EraserTool(this as any);
    this.pipetteTool = new PipetteTool(this as any);
    this.hatchTool = new HatchTool(this as any);
    this.documentTool = new DocumentTool(this as any);

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
      if (sel && sel.type === SelectionType.FREE_STROKE && (sel as any).freeStrokeId) {
        (this.selectTool as any).beginFreeStrokeAction?.((sel as any).freeStrokeId, action);
        return;
      }
      if (action === PointEditAction.BULGE && sel) {
        if (sel.type === SelectionType.HATCH && (sel as any).hatchId && (sel as any).edgeIndex != null) {
          (this.selectTool as any).beginHatchEdgeBulge?.((sel as any).hatchId, (sel as any).edgeIndex, (sel as any).holeIndex ?? null);
          return;
        }
        if ((sel as any).hatchId && (sel as any).pointIndex != null) {
          (this.selectTool as any).beginHatchPointBulge?.((sel as any).hatchId, (sel as any).pointIndex, (sel as any).holeIndex ?? null);
          return;
        }
        if ((sel as any).segmentId) {
          (this.selectTool as any).beginSegmentBulge?.((sel as any).segmentId);
          return;
        }
      }
      if (sel && sel.type === SelectionType.HATCH && (sel as any).hatchId && (sel as any).edgeIndex != null) {
        if (action === PointEditAction.INSERT_POINT) {
          (this.selectTool as any).insertHatchEdgePoint?.((sel as any).hatchId, (sel as any).edgeIndex, (sel as any).holeIndex ?? null);
          return;
        }
        if (action === PointEditAction.OFFSET) {
          (this.selectTool as any).beginHatchEdgeOffset?.((sel as any).hatchId, (sel as any).edgeIndex, (sel as any).holeIndex ?? null);
          return;
        }
      }
      this.selectTool.beginPointEdit(action);
    });

    this._installSelectToolFrameFilter();
    this._installGuideSegmentInterceptor();
    this._installCoordRemap();
    this._installDeleteKey();
    this._installShiftTracker();
    this._installGroupMove();
    this._installMarquee();
    this.applyZoom(this._zoom);
    this._installPageFrameSnap();



    
    

    if (init.initialState) this._restore(init.initialState);
    this._changeDirty = false;
    this._lastSig = this._sceneSignature();

    this._tick();
  }

  /* ===== Page-frame snap (invisible segments at page edge + margin edge) ===== */

  isFrameSegment(seg: { labelId?: string }): boolean {
    return seg.labelId === this._frameLabelId || seg.labelId === this._extRectLabelId || seg.labelId === this._ghostLabelId;
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

  /* ===== External-rect snap (Zeichenblatt / PDF / Bild) ===== */

  private _extRectsInstalled = false;
  private _installExtRectSnap() {
    if (this._extRectsInstalled) return;
    const lm: any = this.labelManager;
    if (!lm.groups.find((g: any) => g.id === this._extRectLabelId)) {
      lm.groups.push({ id: this._extRectLabelId, name: "__ext_rect__", locked: true, visible: true });
      const origList = lm.list.bind(lm);
      // already filtered by frame? Re-filter both.
      lm.list = () => origList().filter((g: any) => g.id !== this._extRectLabelId);
    }
    this._extRectsInstalled = true;
  }

  /** Setzt externe Rechtecke (cad-view/pdf/image) als Snap-Quellen. mm-Koords. */
  setExternalRects(rects: Array<{ id: string; xMM: number; yMM: number; wMM: number; hMM: number; rotationRad?: number }>) {
    this._installExtRectSnap();
    this.scene.segments = this.scene.segments.filter((s) => s.labelId !== this._extRectLabelId);
    const style = {
      color: "rgba(0,0,0,0)",
      thicknessM: 0.00001,
      labelId: this._extRectLabelId,
    };
    const seg = (a: { x: number; y: number }, b: { x: number; y: number }, mid = false) => {
      try {
        const s = this.scene.createSegment(a, b, { ...style });
        if (mid && s) (s as any).midpointSnap = true;
      } catch {}
    };
    for (const r of rects) {
      const x0 = r.xMM / 1000;
      const y0 = r.yMM / 1000;
      const x1 = (r.xMM + r.wMM) / 1000;
      const y1 = (r.yMM + r.hMM) / 1000;
      const rot = r.rotationRad ?? 0;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);
      const xf = (px: number, py: number) => ({
        x: cx + (px - cx) * cs - (py - cy) * sn,
        y: cy + (px - cx) * sn + (py - cy) * cs,
      });
      const A = xf(x0, y0);
      const B = xf(x1, y0);
      const C = xf(x1, y1);
      const D = xf(x0, y1);
      // 4 edges (midpointSnap → edge midpoints werden snapbar)
      seg(A, B, true);
      seg(B, C, true);
      seg(C, D, true);
      seg(D, A, true);
      // 2 Diagonalen mit midpointSnap → Mittelpunkt der Box wird snapbar
      seg(A, C, true);
      seg(B, D, true);
    }
    this._changeDirty = true;
  }

  /* ===== Ghost snap (Transparenzpause: Snap-Punkte einer Hintergrundseite) ===== */

  private _installGhostSnap() {
    if (this._ghostInstalled) return;
    const lm: any = this.labelManager;
    if (!lm.groups.find((g: any) => g.id === this._ghostLabelId)) {
      lm.groups.push({ id: this._ghostLabelId, name: "__ghost_snap__", locked: true, visible: true });
      const origList = lm.list.bind(lm);
      lm.list = () => origList().filter((g: any) => g.id !== this._ghostLabelId);
    }
    this._ghostInstalled = true;
  }

  /**
   * Übernimmt die Geometrie einer Hintergrundseite (Transparenzpause) als
   * unsichtbare Snap-Segmente. Es werden Endpunkte/Kanten aller Segmente,
   * Free-Strokes und Hatch-Polygone als transparente Snap-Segmente eingefügt.
   * `null` löscht die Ghost-Snap-Geometrie wieder.
   */
  setGhostSnapState(state: any) {
    this._installGhostSnap();
    // Vorherige Ghost-Segmente entfernen.
    this.scene.segments = this.scene.segments.filter((s) => s.labelId !== this._ghostLabelId);
    if (!state) { this._changeDirty = true; return; }
    const style = {
      color: "rgba(0,0,0,0)",
      thicknessM: 0.00001,
      labelId: this._ghostLabelId,
    };
    const addSeg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      if (!a || !b) return;
      if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) return;
      try { this.scene.createSegment(a, b, { ...style }); } catch { /* noop */ }
    };
    // Segmente 1:1 als Snap-Kanten übernehmen.
    if (Array.isArray(state.segments)) {
      for (const s of state.segments) {
        if (!s?.a || !s?.b) continue;
        if (s.labelId === this._frameLabelId || s.labelId === this._extRectLabelId || s.labelId === this._ghostLabelId) continue;
        addSeg(s.a, s.b);
      }
    }
    // Freihand-Striche: Punktkette als Snap-Segmente.
    if (Array.isArray(state.freeStrokes)) {
      for (const st of state.freeStrokes) {
        const pts = Array.isArray(st?.points) ? st.points : [];
        for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i], pts[i + 1]);
      }
    }
    // Hatch-Polygone: Umrandungs- und Loch-Kanten als Snap-Segmente.
    if (Array.isArray(state.hatches)) {
      for (const h of state.hatches) {
        const rings: any[] = [];
        if (Array.isArray(h?.points)) rings.push(h.points);
        if (Array.isArray(h?.holes)) for (const loop of h.holes) rings.push(loop);
        for (const ring of rings) {
          if (!Array.isArray(ring) || ring.length < 2) continue;
          for (let i = 0; i < ring.length; i++) addSeg(ring[i], ring[(i + 1) % ring.length]);
        }
      }
    }
    this._changeDirty = true;
  }


  private _extDocsInstalled = false;
  private _installExtDocLabel() {
    if (this._extDocsInstalled) return;
    const lm: any = this.labelManager;
    if (!lm.groups.find((g: any) => g.id === this._extDocLabelId)) {
      lm.groups.push({ id: this._extDocLabelId, name: "__ext_doc__", locked: true, visible: true });
      const origList = lm.list.bind(lm);
      lm.list = () => origList().filter((g: any) => g.id !== this._extDocLabelId);
    }
    this._extDocsInstalled = true;
  }

  private _docSnapshot(d: any): string {
    const g = d.guideEdges || {};
    return `${d.position.x.toFixed(6)}|${d.position.y.toFixed(6)}|${d.widthM.toFixed(6)}|${d.heightM.toFixed(6)}|${d.rotationRad.toFixed(6)}|${g.top?1:0}${g.right?1:0}${g.bottom?1:0}${g.left?1:0}`;
  }

  /**
   * Synchronisiert externe Dokumente (Projektmappen-PDF/Bild) als snap-only
   * DocumentObjects in der Szene. Stellt Ecken-Marker, Kanten-Hilfslinien und
   * Hub-Box (Verschieben/Drehen) zur Verfügung. Änderungen werden über
   * `onChange(id, transform)` zurück an den Host gemeldet.
   */
  setExternalDocuments(
    docs: Array<{ id: string; xMM: number; yMM: number; wMM: number; hMM: number; rotationRad?: number; guideEdges?: { top: boolean; right: boolean; bottom: boolean; left: boolean } }>,
    onChange?: (id: string, t: { xMM: number; yMM: number; wMM: number; hMM: number; rotationDeg: number; guideEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean } }) => void,
    onDelete?: (id: string) => void,
  ) {
    this._installExtDocLabel();
    this._externalDocChange = onChange ?? null;
    this._externalDocDelete = onDelete ?? null;
    const keepIds = new Set(docs.map(d => d.id));
    // Entferne snap-only Docs, die nicht mehr im Input sind.
    this.scene.documents = this.scene.documents.filter(d => !(d as any)._snapOnly || keepIds.has(d.id));
    (this.scene as any)._rebuildDocIdMap?.();
    const existing = new Map(
      this.scene.documents.filter(d => (d as any)._snapOnly).map(d => [d.id, d]),
    );
    for (const r of docs) {
      const wM = Math.max(0.001, r.wMM / 1000);
      const hM = Math.max(0.001, r.hMM / 1000);
      const xM = r.xMM / 1000;
      const yM = r.yMM / 1000;
      const rot = r.rotationRad || 0;
      let doc: any = existing.get(r.id);
      if (!doc) {
        doc = this.scene.createDocument({
          src: "",
          position: { x: xM, y: yM },
          widthM: wM,
          heightM: hM,
          rotationRad: rot,
          pixelWidth: 1,
          pixelHeight: 1,
          labelId: this._extDocLabelId,
          guideEdges: r.guideEdges,
        });
        // Stabilen Host-ID übernehmen (für Re-Render-Identität).
        const idMap: any = (this.scene as any)._docIdMap;
        if (idMap) {
          idMap.delete(doc.id);
          doc.id = r.id;
          idMap.set(r.id, doc);
        } else {
          doc.id = r.id;
        }
        doc._snapOnly = true;
      } else {
        // Externe Geometrie-Updates anwenden, ohne erneut nach außen zu melden.
        doc.position.x = xM;
        doc.position.y = yM;
        doc.widthM = wM;
        doc.heightM = hM;
        doc.rotationRad = rot;
        if (r.guideEdges) doc.guideEdges = { ...r.guideEdges };
      }
      this._externalDocs.set(r.id, doc.id);
      this._externalDocSnapshots.set(r.id, this._docSnapshot(doc));
    }
    // Entfernte IDs aus Tracker entfernen.
    for (const id of Array.from(this._externalDocs.keys())) {
      if (!keepIds.has(id)) {
        this._externalDocs.delete(id);
        this._externalDocSnapshots.delete(id);
      }
    }
    this._changeDirty = true;
  }

  private _emitExternalDocChanges() {
    if (!this._externalDocChange) return;
    for (const d of this.scene.documents) {
      if (!(d as any)._snapOnly) continue;
      const last = this._externalDocSnapshots.get(d.id);
      const now = this._docSnapshot(d);
      if (last !== now) {
        this._externalDocSnapshots.set(d.id, now);
        if (last !== undefined) {
          this._externalDocChange(d.id, {
            xMM: d.position.x * 1000,
            yMM: d.position.y * 1000,
            wMM: d.widthM * 1000,
            hMM: d.heightM * 1000,
            rotationDeg: (d.rotationRad * 180) / Math.PI,
            guideEdges: { ...d.guideEdges },
          });
        }
      }
    }
  }


  private _isNonEditableSegmentId(segmentId?: string | null): boolean {
    if (!segmentId) return false;
    const segment = this.scene.getSegmentById(segmentId);
    if (!segment) return false;
    if (!this.labelManager.isEditable(segment.labelId)) return true;
    return this.isFrameSegment(segment) || (segment.isGuide && this._guidesLocked);
  }

  /** Ebene bearbeitbar? Gesperrte Ebenen bleiben sichtbar und fangbar. */
  private _labelEditable(labelId?: string | null): boolean {
    if (!labelId) return true;
    return this.labelManager.isEditable(labelId);
  }

  private _filterNonEditableSegmentSelections(): boolean {
    const previousMarquee = this.selectTool.marqueeSelectedIds;
    const nextMarquee = previousMarquee.filter(
      (ref) => ref.kind !== "segment" || !this._isNonEditableSegmentId(ref.id),
    );
    const nextSelections = this.selections.filter(
      (selection) => !this._isNonEditableSegmentId(selection.segmentId),
    );
    const primaryBlocked = this._isNonEditableSegmentId(this.selection?.segmentId);
    const selectionListChanged = nextSelections.length !== this.selections.length;
    if (nextMarquee.length !== previousMarquee.length) {
      this.selectTool.marqueeSelectedIds = nextMarquee;
    }
    if (primaryBlocked || selectionListChanged) {
      const nextPrimary = primaryBlocked ? (nextSelections[0] ?? null) : this.selection;
      this._applyPrimary(nextPrimary, nextSelections);
    }
    return primaryBlocked || selectionListChanged || nextMarquee.length !== previousMarquee.length;
  }

  private _installSelectToolFrameFilter() {
    // Wir filtern Rahmen-Segmente NICHT mehr aus _segmentsFrontToBack heraus,
    // weil dadurch auch das Snapping (findBestSnap nutzt dieselbe Liste) die
    // Page-Frame-Kanten verloren hätte → Textboxen ließen sich beim Verschieben
    // nicht mehr an Seiten-/Randkanten ausrichten.
    // Stattdessen post-processen wir das Auswahlergebnis: landet eine
    // Auswahl auf einem Rahmen-Segment, wird sie sofort wieder geleert.
    // Genauso: gesperrte Hilfslinien dürfen nicht selektiert werden.
    const origUpdate = this.selectTool.update.bind(this.selectTool);
    (this.selectTool as any).update = (input: any) => {
      const result = origUpdate(input);
      if (this._filterNonEditableSegmentSelections()) {
        try { this.pointEditMenu.hide(); } catch {}
      }
      const marqueeCount = this.selectTool.marqueeSelectedIds.length;
      if (marqueeCount !== this._lastMarqueeSelectionCount) {
        this._lastMarqueeSelectionCount = marqueeCount;
        const count = this.selections.length || (this.selection ? 1 : 0) || marqueeCount;
        try { this._onSelectionChange?.(this._selectionInfo(this.selection), count); } catch {}
        try { this.onSelectionChange?.(); } catch {}
      }
      return result;
    };
  }

  /** Wickelt scene.createSegment so ein, dass im Guide-Modus alle neuen
   *  Segmente als Hilfslinien (isGuide=true) markiert werden. Frame-Segmente
   *  werden nie als Guides markiert. */
  private _installGuideSegmentInterceptor() {
    const orig = this.scene.createSegment.bind(this.scene);
    (this.scene as any).createSegment = (a: any, b: any, style: any = {}) => {
      const s = { ...style };
      if (this._guideMode && style.labelId !== this._frameLabelId && s.isGuide === undefined) {
        s.isGuide = true;
        if (!s.color) s.color = this._guideColor;
      }
      return orig(a, b, s);
    };
  }





  /* ===== Public API ===== */

  /**
   * True, wenn gerade eine Aktion läuft (Zeichnen, Platzieren, Text-Edit,
   * Gruppen-Transformation, Einfüge-Vorschau). Steuert die ESC-Stufe 1.
   */
  hasActiveAction(): boolean {
    try {
      if (this.textEditor?.isActive?.()) return true;
      const st: any = this.selectTool as any;
      if (st?.pasteFloatActive || st?.groupRotateActive || st?.groupDragActive || st?.groupAnchorActive) return true;
      if (this._activeTool === "select" &&
          (st?.editTarget || st?.rotateTextBoxId || st?.dragTextBoxId || st?.dragDocId
            || st?.dragFreeStrokeId || st?.dragDimId)) return true;
      const t: any = this.activeTool as any;
      if (t && typeof t.isDrawing === "function" && t.isDrawing()) return true;
      if (this._activeTool === "document" && (this.documentTool as any)?.phase
          && (this.documentTool as any).phase !== "idle") return true;
      if (this._activeTool === "pipette" && (this.pipetteTool as any)?.hasSource) return true;
    } catch {}
    return false;
  }



  setActiveTool(tool: MiniTool) {
    if (this._activeTool === tool) return;
    // Deactivate previous.
    if (this._activeTool === "line") this.lineTool.cancel();
    if (this._activeTool === "guide") this.lineTool.cancel();
    if (this._activeTool === "text") {
      try { this.textEditor.commit(); } catch {}
      this.textTool.cancel();
    }
    if (this._activeTool === "select") this.selectTool.cancel();
    if (this._activeTool === "free") this.freeDrawTool.cancel();
    if (this._activeTool === "eraser") this.eraserTool.cancel();
    if (this._activeTool === "hatch") this.hatchTool.cancel();
    if (this._activeTool === "document") this.documentTool.cancel();
    if (this._activeTool === "pipette") this.pipetteTool.cancel();
    this._activeTool = tool;
    this.activeTool = null;
    // Guide-Modus aktivieren/deaktivieren — wirkt auf den createSegment-Interceptor.
    this._guideMode = (tool === "guide");
    if (tool === "line" || tool === "guide") {
      this.lineTool.activate();
      this.activeTool = this.lineTool;
    } else if (tool === "text") {
      this.textTool.activate();
      this.activeTool = this.textTool;
    } else if (tool === "select") {
      this.selectTool.activate();
    } else if (tool === "free") {
      this.freeDrawTool.activate();
      this.activeTool = this.freeDrawTool as any;
    } else if (tool === "eraser") {
      this.eraserTool.activate();
      this.activeTool = this.eraserTool as any;
    } else if (tool === "hatch") {
      this.hatchTool.activate();
      this.activeTool = this.hatchTool as any;
    } else if (tool === "document") {
      this.documentTool.activate();
      this.activeTool = this.documentTool as any;
    } else if (tool === "pipette") {
      this.pipetteTool.activate();
      this.activeTool = this.pipetteTool as any;
    }
    try { (window as any).__pixunaActiveTool = tool; } catch {}
  }

  /** Alias für `setActiveTool` — DocumentTool ruft `app.setTool(...)`. */
  setTool(tool: MiniTool) { this.setActiveTool(tool); }

  /** Startet die Dokument-Platzierung (nach erfolgreichem Datei-Import).
   *  Aktiviert das Dokument-Werkzeug und übergibt die Import-Daten. */
  beginDocumentPlacement(opts: {
    src: string; widthM: number; heightM: number;
    pixelWidth: number; pixelHeight: number;
    name: string; kind: "image" | "pdf-page";
    pageIndex: number; importScaleDenom: number;
    pdfSourceB64?: string | null;
  }) {
    if (this._activeTool !== "document") this.setActiveTool("document");
    this.documentTool.beginPlacement(opts);
  }

  /** Sperrt/entsperrt alle Hilfslinien (Auswahl, Verschieben, Punktedit). */
  setGuidesLocked(locked: boolean) {
    this._guidesLocked = !!locked;
    if (!this._guidesLocked) return;

    const pasteContainsGuide = this.selectTool.pasteFloatActive
      && this.selectTool.marqueeSelectedIds.some((ref) =>
        ref.kind === "segment" && !!this.scene.getSegmentById(ref.id)?.isGuide,
      );
    if (pasteContainsGuide) this.selectTool.cancelPasteFloat();

    const cancelLegacyGroupMove = this._legacyGroupMoveIncludesGuide();

    const editTarget = this.selectTool.editTarget;
    if (editTarget?.kind === "segment") {
      const editedSegment = this.scene.getSegmentById(editTarget.segmentId);
      if (editedSegment?.isGuide) this.selectTool.cancelSegmentEdit(editedSegment.id);
    }

    const selectedGuideIsInGroup = this.selectTool.marqueeSelectedIds.some((ref) =>
      ref.kind === "segment" && !!this.scene.getSegmentById(ref.id)?.isGuide,
    );
    if (selectedGuideIsInGroup && (
      this.selectTool.groupAnchorActive || this.selectTool.groupRotateActive || this.selectTool.groupDragActive
    )) {
      this.selectTool.cancelGroupTransform(true);
    }
    // Der ältere Mehrfachauswahl-Pfad besitzt vollständige Geometrie-Snapshots.
    // Er wird zuletzt zurückgesetzt, damit sich zwei parallel laufende Preview-
    // Pfade beim Fixieren nicht gegenseitig überkompensieren.
    if (cancelLegacyGroupMove) this._cancelLegacyGroupMove(true);

    if (this._filterNonEditableSegmentSelections()) {
      try { this.pointEditMenu.hide(); } catch {}
    }
  }

  areGuidesLocked(): boolean { return this._guidesLocked; }

  /** Setzt die Default-Farbe für neu erzeugte Hilfslinien. */
  setGuideColor(color: string) {
    if (color && typeof color === "string") this._guideColor = color;
  }

  setLineDefaults(opts: { color?: string; thicknessM?: number; alpha?: number }) {
    if (opts.color) this.defaultLineColor = opts.color;
    if (typeof opts.thicknessM === "number" && opts.thicknessM > 0) {
      this.defaultLineThicknessM = opts.thicknessM * this._strokeFactor;
    }
    if (typeof opts.alpha === "number" && opts.alpha >= 0 && opts.alpha <= 1) {
      this.defaultLineAlpha = opts.alpha;
    }
    const selected = this.getEditSegment();
    if (selected && !this.isFrameSegment(selected)) {
      selected.color = applyAlphaToColor(this.defaultLineColor, this.defaultLineAlpha);
      selected.thicknessM = this.defaultLineThicknessM;
      this.refreshLabelUI();
    }
  }

  /** Schaltet Mittelpunkt-/Teilungs-Snap auf der/den aktuell selektierten
   *  Linie(n) und Hilfslinie(n) um. `divisionSnap`: ≥2 setzen, null/0 löschen. */
  setSelectedSegmentSnapSettings(opts: { midpointSnap?: boolean; divisionSnap?: number | null }) {
    const ids = new Set<string>();
    for (const sel of this.selections) {
      if ((sel as any)?.segmentId) ids.add((sel as any).segmentId);
    }
    if (this.selection && (this.selection as any).segmentId) ids.add((this.selection as any).segmentId);
    let changed = false;
    for (const id of ids) {
      const seg = this.scene.getSegmentById(id);
      if (!seg || this.isFrameSegment(seg)) continue;
      if (typeof opts.midpointSnap === "boolean") { seg.midpointSnap = !!opts.midpointSnap; changed = true; }
      if (opts.divisionSnap !== undefined) {
        if (opts.divisionSnap == null || opts.divisionSnap < 2) {
          seg.divisionSnap = undefined;
        } else {
          seg.divisionSnap = Math.floor(opts.divisionSnap);
        }
        changed = true;
      }
    }
    if (changed) {
      this._changeDirty = true;
      // Selection-Info neu emittieren, damit Inspector aktuelle Werte zeigt.
      this._onSelectionChange?.(this._selectionInfo(this.selection), this.selections.length);
    }
  }

  /** Dupliziert die aktuell selektierte(n) Linien/Hilfslinien mit einem kleinen
   *  Versatz und selektiert die Kopien. Übernimmt Farbe, Stärke, labelId,
   *  midpointSnap, divisionSnap und isGuide. */
  duplicateSelectedSegments(offsetMm: number = 5): number {
    const ids = new Set<string>();
    for (const sel of this.selections) {
      if ((sel as any)?.segmentId) ids.add((sel as any).segmentId);
    }
    if (this.selection && (this.selection as any).segmentId) ids.add((this.selection as any).segmentId);
    if (ids.size === 0) return 0;
    const dx = offsetMm / 1000;
    const dy = offsetMm / 1000;
    const newIds: string[] = [];
    for (const id of ids) {
      const seg = this.scene.getSegmentById(id);
      if (!seg || this.isFrameSegment(seg)) continue;
      const copy = this.scene.createSegment(
        { x: seg.a.x + dx, y: seg.a.y + dy },
        { x: seg.b.x + dx, y: seg.b.y + dy },
        {
          color: seg.color,
          thicknessM: seg.thicknessM,
          labelId: seg.labelId,
          isGuide: !!seg.isGuide,
          midpointSnap: !!seg.midpointSnap,
          divisionSnap: seg.divisionSnap,
          arrowStart: !!seg.arrowStart,
          arrowEnd: !!seg.arrowEnd,
          arrowScale: seg.arrowScale,
        },
      );
      newIds.push(copy.id);
    }
    if (newIds.length === 0) return 0;
    // Selektion auf die Kopien setzen.
    const first = newIds[0];
    this.selections = newIds.map((sid) => ({ type: (this.selection as any)?.type ?? 0, segmentId: sid } as any));
    try {
      this.setSelection({ type: (this.selection as any)?.type ?? 0, segmentId: first } as any);
    } catch {}
    this._changeDirty = true;
    this._onSelectionChange?.(this._selectionInfo(this.selection), this.selections.length);
    return newIds.length;
  }


  private _lastTextDefaults: any = null;

  setTextDefaults(opts: {
    color?: string;
    fontSizePx?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    lineHeightPct?: number;
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
    if (typeof opts.fontSizePx === "number" && opts.fontSizePx > 0) this.defaultTextFontSizePx = ptToCssPx(opts.fontSizePx);
    if (typeof opts.bold === "boolean") this.defaultTextBold = opts.bold;
    if (typeof opts.italic === "boolean") this.defaultTextItalic = opts.italic;
    if (typeof opts.underline === "boolean") this.defaultTextUnderline = opts.underline;
    if (typeof opts.strike === "boolean") this.defaultTextStrike = opts.strike;
    if (typeof opts.lineHeightPct === "number" && opts.lineHeightPct > 0) {
      this.defaultTextLineHeightPct = Math.max(60, Math.min(400, opts.lineHeightPct));
    }
    if (typeof opts.alpha === "number" && opts.alpha >= 0 && opts.alpha <= 1) this.defaultTextAlpha = opts.alpha;
    if (opts.align) this.defaultTextAlign = opts.align;
    if (opts.bgColor) this.defaultTextBgColor = opts.bgColor;
    if (typeof opts.bgAlphaPct === "number") this.defaultTextBgAlphaPct = Math.max(0, Math.min(100, opts.bgAlphaPct));
    if (typeof opts.wrap === "boolean") this.defaultTextWrap = opts.wrap;
    if (typeof opts.autoSize === "boolean") this.defaultTextAutoSize = opts.autoSize;
    if (typeof opts.borderEnabled === "boolean") this.defaultTextBorderEnabled = opts.borderEnabled;
    if (opts.borderColor) this.defaultTextBorderColor = opts.borderColor;
    if (typeof opts.borderWidthPx === "number" && opts.borderWidthPx >= 0) this.defaultTextBorderWidthPx = opts.borderWidthPx;
    // --- Nur tatsächliche Benutzeränderungen dürfen ein Objekt anfassen ---
    // Das Panel ruft setTextDefaults auch beim reinen Auswählen/Öffnen einer
    // Textbox auf. Würden dabei alle Werte pauschal geschrieben, überschriebe
    // der zuletzt im Panel gehaltene Zustand den Basisstil der Box
    // (z. B. fett → normal). Deshalb wird nur die Differenz angewendet.
    const selected = this.getEditTextBox();
    const selId = selected?.id ?? null;
    const selectionChanged = selId !== this._lastTextDefaultsBoxId;
    this._lastTextDefaultsBoxId = selId;
    const prev = this._lastTextDefaults;
    this._lastTextDefaults = { ...opts };
    const changedKey = <K extends keyof typeof opts>(k: K) =>
      !!prev && !selectionChanged && opts[k] !== undefined && opts[k] !== prev[k];

    if (prev && !selectionChanged && this.textEditor?.ownsTextFormatting?.()) {
      const changed: any = {};
      if (changedKey("color") && opts.color) {
        changed.color = applyAlphaToColor(opts.color, this.defaultTextAlpha);
      }
      if (changedKey("fontSizePx") && typeof opts.fontSizePx === "number") {
        changed.fontSizePt = opts.fontSizePx;
      }
      for (const k of ["bold", "italic", "underline", "strike"] as const) {
        if (changedKey(k)) changed[k] = opts[k];
      }
      if (Object.keys(changed).length > 0 && this.textEditor.applyInlineFormat(changed)) {
        this._changeDirty = true;
        return;
      }
    }

    if (selected && prev && !selectionChanged) {
      if (changedKey("color") || changedKey("alpha")) {
        selected.style.textColor = applyAlphaToColor(this.defaultTextColor, this.defaultTextAlpha);
      }
      if (changedKey("fontSizePx") && typeof opts.fontSizePx === "number") {
        selected.style.fontSizePt = opts.fontSizePx;
        selected.style.fontSizePx = ptToCssPx(selected.style.fontSizePt);
      }
      if (changedKey("bgColor")) selected.style.bgColor = this.defaultTextBgColor;
      if (changedKey("bgAlphaPct")) selected.style.bgAlphaPct = this.defaultTextBgAlphaPct;
      if (changedKey("wrap") || changedKey("autoSize")) {
        selected.style.wrap = this.defaultTextAutoSize ? this.defaultTextWrap : true;
      }
      if (changedKey("align")) selected.style.align = this.defaultTextAlign;
      if (changedKey("bold")) selected.style.bold = this.defaultTextBold;
      if (changedKey("italic")) selected.style.italic = this.defaultTextItalic;
      if (changedKey("underline")) selected.style.underline = this.defaultTextUnderline;
      if (changedKey("strike")) selected.style.strike = this.defaultTextStrike;
      if (changedKey("lineHeightPct")) selected.style.lineHeightPct = this.defaultTextLineHeightPct;
      if (changedKey("borderEnabled")) selected.style.borderEnabled = this.defaultTextBorderEnabled;
      if (changedKey("borderColor")) selected.style.borderColor = this.defaultTextBorderColor;
      if (changedKey("borderWidthPx")) selected.style.borderWidthPx = this.defaultTextBorderWidthPx;
      if (changedKey("autoSize")) (selected.style as any).autoSize = this.defaultTextAutoSize;
      autoSizeTextBox(selected, (this.renderer as any).referencePxPerM);
      if (this.textEditor.isActive()) this.textEditor.reposition(selected);
      this.refreshLabelUI();
    }
  }


  /**
   * Interner Supersampling-Faktor der Zeichenfläche (nur für PDF-Export).
   * 1 = normal (CSS-Pixel). Größere Werte erhöhen die Backing-Store-Auflösung,
   * ohne die CSS-Größe zu verändern — dadurch wird der html2canvas-Snapshot
   * scharf statt verpixelt.
   */
  private _renderScale = 1;

  setRenderScale(k: number) {
    const v = Math.max(1, Math.min(8, k || 1));
    if (v === this._renderScale) return;
    this._renderScale = v;
    this.applyZoom(this._zoom);
    // Das Ändern der Backing-Store-Größe leert die Zeichenfläche. Ohne
    // sofortiges Neuzeichnen bliebe der Export-Snapshot leer, wenn der
    // rAF-Tick (z.B. in einem Hintergrund-Tab) nicht rechtzeitig läuft.
    this.renderNow();
  }

  /** Erzwingt sofort einen Renderdurchlauf (unabhängig vom rAF-Tick). */
  renderNow() {
    if (this._destroyed) return;
    try {
      this.camera.offsetX = FRAME_PAD_PX;
      this.camera.offsetY = FRAME_PAD_PX;
      this.camera.scale = this.basePxPerMm * 1000 * this._zoom;
      this.renderer.render();
    } catch (err) {
      console.error("MiniCad renderNow error:", err);
    }
  }

  applyZoom(zoom: number) {
    this._zoom = zoom;
    const k = this._renderScale;
    const pageW = this.pageWidthMm * this.basePxPerMm * zoom;
    const pageH = this.pageHeightMm * this.basePxPerMm * zoom;
    const cssW = pageW + FRAME_PAD_PX * 2;
    const cssH = pageH + FRAME_PAD_PX * 2;
    const c = this.dom.canvas;
    const wPx = Math.max(1, Math.round(cssW * k));
    const hPx = Math.max(1, Math.round(cssH * k));
    if (c.width !== wPx) c.width = wPx;
    if (c.height !== hPx) c.height = hPx;
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    // Wrapper-Div in CadOverlayLayer ist bereits um -FRAME_PAD_PX verschoben,
    // daher Canvas hier bei (0,0) lassen — sonst doppelter Offset.
    c.style.left = `0px`;
    c.style.top = `0px`;


    this.renderer.setViewport(c.width, c.height);
    this.camera.scale = this.basePxPerMm * 1000 * zoom * k;
    this.camera.offsetX = FRAME_PAD_PX * k;
    this.camera.offsetY = FRAME_PAD_PX * k;

    // Re-position any open text editor.
    if (this.textEditor.isActive() && this.selection?.textBoxId) {
      const box = this.scene.getTextBoxById(this.selection.textBoxId);
      if (box) this.textEditor.reposition(box);
    }
  }

  serialize(): any {
    const f = this._strokeFactor || 1;
    return {
      version: 4,
      labels: this.labelManager.list(),
      // Rasterebenen (Pixelmodus) — leere Ebenen entfallen automatisch.
      rasterLayers: this.rasterLayers.serialize(),
      segments: this.scene.segments
        .filter((s) => s.labelId !== this._frameLabelId && s.labelId !== this._extRectLabelId && s.labelId !== this._ghostLabelId)
        .map((s) => ({
          id: s.id,
          a: { x: s.a.x, y: s.a.y },
          b: { x: s.b.x, y: s.b.y },
          color: s.color,
          // Speichern in "echten Metern" (intern wird mit _strokeFactor multipliziert).
          thicknessM: s.thicknessM / f,
          labelId: s.labelId,
          isGuide: !!s.isGuide,
          midpointSnap: !!s.midpointSnap,
          divisionSnap: s.divisionSnap,
          arrowStart: !!s.arrowStart,
          arrowEnd: !!s.arrowEnd,
          arrowScale: s.arrowScale,
          bulge: (s as any).bulge || 0,
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

      freeStrokes: this.scene.freeStrokes.map((s) => ({
        id: s.id,
        points: s.points.map((p) => ({ x: p.x, y: p.y })),
        color: s.color,
        thicknessM: s.thicknessM,
        opacity: s.opacity,
        lineStyle: s.lineStyle,
        gapM: s.gapM,
        blobSpacingM: s.blobSpacingM,
        blobSizeM: s.blobSizeM,
        smoothing: s.smoothing,
        labelId: s.labelId,
        imageSrc: s.imageSrc,
        imageSizeM: s.imageSizeM,
        imageSpacingM: s.imageSpacingM,
        imageRotateAlongPath: s.imageRotateAlongPath,
      })),

      hatches: this.scene.hatches.map((h) => ({
        id: h.id,
        points: h.points.map((p) => ({ x: p.x, y: p.y })),
        holes: Array.isArray(h.holes) ? h.holes.map((loop) => loop.map((p) => ({ x: p.x, y: p.y }))) : undefined,
        fillColor: h.fillColor,
        strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct,
        strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId,
        areaLabel: h.areaLabel ? { ...h.areaLabel } : undefined,
        patternEnabled: h.patternEnabled,
        patternId: h.patternId,
        patternScale: h.patternScale,
        patternAngleDeg: h.patternAngleDeg,
        patternSkewDeg: h.patternSkewDeg,
        patternStretch: h.patternStretch, patternOffsetX: h.patternOffsetX, patternOffsetY: h.patternOffsetY,
        bulges: Array.isArray((h as any).bulges) ? [...(h as any).bulges] : undefined,
        holeBulges: Array.isArray((h as any).holeBulges) ? (h as any).holeBulges.map((l: number[]) => [...l]) : undefined,
      })),

      documents: this.scene.documents
        .filter((d) => !(d as any)._snapOnly && d.labelId !== this._extDocLabelId)
        .map((d) => ({
          id: d.id,
          name: d.name,
          kind: d.kind,
          src: d.src,
          pageIndex: d.pageIndex,
          position: { x: d.position.x, y: d.position.y },
          widthM: d.widthM,
          heightM: d.heightM,
          rotationRad: d.rotationRad,
          pixelWidth: d.pixelWidth,
          pixelHeight: d.pixelHeight,
          labelId: d.labelId,
          importScaleDenom: d.importScaleDenom,
          eraseMaskDataUrl: d.eraseMaskDataUrl,
          pdfSourceB64: d.pdfSourceB64 || null,
          guideEdges: { ...d.guideEdges },
          cropM: { ...d.cropM },
          opacity: d.opacity,
          filters: d.filters ? d.filters.map((f) => ({ ...f })) : [],
          activeFilterId: d.activeFilterId,
          bgRemoval: d.bgRemoval,
          anchors: (d.anchors || []).map((a) => ({ x: a.x, y: a.y })),
          warpCorners: (d as any).warpCorners ? (d as any).warpCorners.map((c: any) => ({ x: c.x, y: c.y })) : null,
          flipX: !!(d as any).flipX,
          flipY: !!(d as any).flipY,
        })),
    };
  }

  private _restore(data: any) {
    if (!data) return;
    // Rasterinhalt zuerst wiederherstellen (lädt Kacheln asynchron nach).
    try { this.rasterLayers.restore(data.rasterLayers); } catch (e) { console.error("MiniCad raster restore:", e); }
    if (Array.isArray(data.labels) && data.labels.length > 0) {
      try { this.labelManager.restore(data.labels); } catch {}
    }
    const f = this._strokeFactor || 1;
    // Vor v3 wurden Strichbreiten bereits intern (in der alten,
    // überdimensionierten Skala) gespeichert → nicht erneut skalieren.
    const segScale = (data.version ?? 1) >= 3 ? f : 1;
    if (Array.isArray(data.segments)) {
      for (const s of data.segments) {
        if (s.labelId === this._frameLabelId || s.labelId === this._extRectLabelId || s.labelId === this._ghostLabelId) continue;
        try {
          this.scene.createSegment(
            { x: s.a.x, y: s.a.y },
            { x: s.b.x, y: s.b.y },
            {
              color: s.color || this.defaultLineColor,
              thicknessM: (s.thicknessM || (this.defaultLineThicknessM / f)) * segScale,
              labelId: s.labelId || Defaults.defaultLabelId,
              isGuide: !!s.isGuide,
              midpointSnap: !!s.midpointSnap,
              divisionSnap: typeof s.divisionSnap === "number" && s.divisionSnap >= 2 ? Math.floor(s.divisionSnap) : undefined,
              arrowStart: !!s.arrowStart,
              arrowEnd: !!s.arrowEnd,
              arrowScale: s.arrowScale,
              bulge: s.bulge,
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
    if (Array.isArray(data.freeStrokes)) {
      for (const s of data.freeStrokes) {
        try {
          this.scene.createFreeStroke(s.points || [], {
            color: s.color, thicknessM: s.thicknessM, opacity: s.opacity,
            lineStyle: s.lineStyle, gapM: s.gapM,
            blobSpacingM: s.blobSpacingM, blobSizeM: s.blobSizeM,
            smoothing: s.smoothing, labelId: s.labelId || Defaults.defaultLabelId,
            imageSrc: s.imageSrc || null, imageSizeM: s.imageSizeM,
            imageSpacingM: s.imageSpacingM, imageRotateAlongPath: s.imageRotateAlongPath,
          });
        } catch (e) { console.error("MiniCad restore freeStroke:", e); }
      }
    }
    if (Array.isArray(data.hatches)) {
      for (const h of data.hatches) {
        try {
          this.scene.createHatch(h.points || [], {
            holes: h.holes,
            fillColor: h.fillColor, strokeColor: h.strokeColor,
            fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
            labelId: h.labelId || Defaults.defaultLabelId,
            areaLabel: h.areaLabel,
            patternEnabled: h.patternEnabled, patternId: h.patternId, patternScale: h.patternScale, patternAngleDeg: h.patternAngleDeg, patternSkewDeg: h.patternSkewDeg, patternStretch: h.patternStretch, patternOffsetX: h.patternOffsetX, patternOffsetY: h.patternOffsetY,
            bulges: h.bulges, holeBulges: h.holeBulges,
          });
        } catch (e) { console.error("MiniCad restore hatch:", e); }
      }
    }
    if (Array.isArray(data.documents)) {
      for (const d of data.documents) {
        try {
          this.scene.createDocument({
            name: d.name,
            kind: d.kind,
            src: d.src,
            pageIndex: d.pageIndex,
            position: { x: d.position?.x || 0, y: d.position?.y || 0 },
            widthM: d.widthM,
            heightM: d.heightM,
            rotationRad: d.rotationRad || 0,
            pixelWidth: d.pixelWidth || 0,
            pixelHeight: d.pixelHeight || 0,
            labelId: d.labelId || Defaults.defaultLabelId,
            importScaleDenom: d.importScaleDenom || 100,
            eraseMaskDataUrl: d.eraseMaskDataUrl || null,
            pdfSourceB64: d.pdfSourceB64 || null,
            guideEdges: d.guideEdges,
            cropM: d.cropM,
            opacity: d.opacity,
            filters: d.filters,
            activeFilterId: d.activeFilterId,
            bgRemoval: d.bgRemoval,
            anchors: Array.isArray(d.anchors) ? d.anchors : undefined,
            warpCorners: Array.isArray((d as any).warpCorners) ? (d as any).warpCorners : null,
            flipX: !!(d as any).flipX,
            flipY: !!(d as any).flipY,
          });
        } catch (e) { console.error("MiniCad restore document:", e); }
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
    const color = this._guideMode
      ? this._guideColor
      : applyAlphaToColor(this.defaultLineColor, this.defaultLineAlpha);
    return {
      color,
      thicknessM: this.defaultLineThicknessM,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
      isGuide: this._guideMode,
    };
  }

  getCurrentTextStyle(): TextBoxStyle {
    const sel = this.getSelectedTextBox();
    if (sel) {
      // Überwiegender Stil des Inhalts (Rich-Text) hat Vorrang vor dem Basisstil.
      const dom = dominantRichStyle(sel.html || "", sel.style as any);
      return {
        textColor: dom.color ?? sel.style.textColor,
        fontSizePt: dom.fontSizePt ?? textStyleFontSizePt(sel.style),
        fontSizePx: sel.style.fontSizePx,
        bgColor: sel.style.bgColor,
        bgAlphaPct: sel.style.bgAlphaPct,
        wrap: sel.style.wrap,
        align: sel.style.align,
        bold: dom.bold ?? sel.style.bold,
        italic: dom.italic ?? sel.style.italic,
        underline: dom.underline ?? sel.style.underline,
        strike: dom.strike ?? sel.style.strike,
        lineHeightPct: sel.style.lineHeightPct,
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
      bold: this.defaultTextBold,
      italic: this.defaultTextItalic,
      underline: this.defaultTextUnderline,
      strike: this.defaultTextStrike,
      lineHeightPct: this.defaultTextLineHeightPct,
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

  /** TextBox ODER Tabelle — gemeinsame Box-Infrastruktur (Auswahl/HUB/Fangpunkte).
   *  Wird vom SelectTool für die Eckpunkt-Menüs (Verschieben/Drehen) benötigt. */
  getSelectedBox(): any {
    if (!this.selection) return null;
    if (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE) return null;
    const id = (this.selection as any).textBoxId;
    if (!id) return null;
    const scene = this.scene as any;
    return scene.getBoxById ? scene.getBoxById(id) : scene.getTextBoxById(id);
  }

  private _selectionInfo(selection: Selection | null): MiniCadSelectionInfo | null {
    if (!selection) return null;
    const box = this.getSelectedTextBox();
    if (box) {
      const textColor = splitColorAlpha(box.style.textColor, this.defaultTextColor);
      return {
        tool: "text",
        color: textColor.color,
        fontSize: Math.round(textStyleFontSizePt(box.style)),
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
          isGuide: !!seg.isGuide,
          midpointSnap: !!seg.midpointSnap,
          divisionSnap: typeof seg.divisionSnap === "number" ? seg.divisionSnap : null,
        };
      }
    }
    if ((selection as any).freeStrokeId) {
      const stroke = this.scene.getFreeStrokeById((selection as any).freeStrokeId);
      if (stroke) return { tool: "free" };
    }
    if ((selection as any).hatchId) {
      const h = this.scene.getHatchById((selection as any).hatchId);
      if (h) return { tool: "hatch", id: h.id };
    }
    if ((selection as any).documentId) {
      const doc = this.scene.getDocumentById((selection as any).documentId);
      if (doc) return { tool: "document", id: doc.id };
    }

    return null;
  }

  setSelection(selection: Selection | null) {
    // Während einer aktiven Marquee gehört die Selection-Hoheit dem Marquee.
    if (this._suppressSetSelection || this._marqueeActive) return;
    if (selection === null) {
      if ((this._multiSelectMode || this._shiftDown) && this.selections.length > 0) return;
      this._applyPrimary(null, []);
      return;
    }
    const wantMulti = this._multiSelectMode || this._shiftDown;
    if (wantMulti && this.selections.length > 0) {
      const idx = this.selections.findIndex((s) => _sameObject(s, selection));
      if (idx >= 0) {
        const next = this.selections.slice();
        next.splice(idx, 1);
        const primary = next[next.length - 1] ?? null;
        this._applyPrimary(primary, next);
        return;
      }
      this._applyPrimary(selection, [...this.selections, selection]);
      return;
    }
    this._applyPrimary(selection, [selection]);
  }



  /** Setzt primary + Liste; aktualisiert Renderer & feuert onSelectionChange. */
  private _applyPrimary(primary: Selection | null, list: Selection[]) {
    this.selection = primary;
    this.selections = list;
    this.renderer.setSelection(primary);
    (this.renderer as any).setExtraSelections?.(list.filter((s) => s !== primary));
    this._onSelectionChange?.(this._selectionInfo(primary), list.length);
    try { this.onSelectionChange?.(); } catch {}
  }


  clearSelection() {
    this._applyPrimary(null, []);
  }

  /**
   * Lädt einen extern gelieferten Szenen-Stand (z. B. nach Undo/Redo aus der
   * Projekt-Historie) in die laufende Engine. Interne Hilfsobjekte
   * (Seitenrahmen, Ghost-Snap, externe Dokument-Platzhalter) bleiben erhalten.
   * Löst bewusst KEIN onChange aus, damit kein neuer Undo-Schritt entsteht.
   */
  loadState(data: any) {
    try { this.clearSelection(); } catch {}
    const keepSeg = (s: any) =>
      s.labelId === this._frameLabelId || s.labelId === this._extRectLabelId || s.labelId === this._ghostLabelId;
    const keepDoc = (d: any) => !!(d as any)._snapOnly || d.labelId === this._extDocLabelId;
    this.scene.segments = this.scene.segments.filter(keepSeg);
    this.scene.textBoxes = [];
    this.scene.freeStrokes = [];
    this.scene.hatches = [];
    this.scene.documents = this.scene.documents.filter(keepDoc);
    this.rasterLayers.clear();
    try { this._restore(data); } catch (e) { console.error("MiniCad loadState:", e); }
    this._changeDirty = false;
    this._lastSig = this._sceneSignature();
  }


  hasDeletableSelection(): boolean {
    if (this._activeTool === "select" && this.selectTool.marqueeSelectedIds.length > 0) return true;
    if (this.selections && this.selections.length > 0) return true;
    if (this.selection) return true;
    return false;
  }

  /** Programmgesteuertes Löschen der aktuellen Auswahl (identisch mit Entf). */
  deleteSelection(): boolean {
    const ev = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
    try { Object.defineProperty(ev, "target", { value: document.body }); } catch {}
    window.dispatchEvent(ev);
    return true;
  }

  /* ===== Kopieren / Einfügen von CAD-Objekten (Mappe) ===================== */
  private _miniClipboard: { kind: string; data: any }[] = [];
  private _miniPasteRound = 0;

  hasCopyableSelection(): boolean { return this.hasDeletableSelection(); }

  /** Wird vom SelectTool nach Gruppen-Verschieben/-Drehen aufgerufen. */
  commitHistorySnapshot(): void { this._changeDirty = true; }

  /** Verwirft eine rein lokale Vorschau, ohne einen fachlichen Undo-Schritt
   *  oder einen Host-Snapshot zu erzeugen. */
  discardHistoryPreview(): void {
    this._lastSig = this._sceneSignature();
    this._changeDirty = false;
  }

  private _flushHistorySnapshot(): void {
    try {
      this._onChange?.();
      this._lastSig = this._sceneSignature();
      this._changeDirty = false;
    } catch {
      this._changeDirty = true;
    }
  }

  hasClipboard(): boolean { return this._miniClipboard.length > 0; }

  /** Sammelt IDs der aktuellen Auswahl (Marquee + Einzel/Mehrfach). */
  private _selectedRefs(): { kind: string; id: string }[] {
    const out: { kind: string; id: string }[] = [];
    const push = (kind: string, id?: string | null) => {
      if (!id) return;
      if (!out.some((o) => o.kind === kind && o.id === id)) out.push({ kind, id });
    };
    if (this._activeTool === "select") {
      for (const m of this.selectTool.marqueeSelectedIds) {
        push(m.kind === "textbox" ? "textBox" : m.kind, m.id);
      }
    }
    const list: Selection[] = this.selections?.length
      ? this.selections
      : (this.selection ? [this.selection] : []);
    for (const s of list) {
      push("segment", s.segmentId);
      push("hatch", s.hatchId);
      push("textBox", s.textBoxId);
      push("freeStroke", s.freeStrokeId);
      push("dimension", s.dimensionId);
      push("document", s.documentId);
    }
    return out;
  }

  copySelection(): boolean {
    const refs = this._selectedRefs();
    const clip: { kind: string; data: any }[] = [];
    const clone = (o: any) => JSON.parse(JSON.stringify(o));
    for (const { kind, id } of refs) {
      try {
        if (kind === "segment") {
          const s = this.scene.getSegmentById(id); if (!s) continue;
          if (this.isFrameSegment(s) || (s.isGuide && this._guidesLocked)) continue;
          clip.push({ kind, data: {
            a: clone(s.a), b: clone(s.b), color: s.color, thicknessM: s.thicknessM, labelId: s.labelId,
            isGuide: !!s.isGuide, midpointSnap: !!s.midpointSnap, divisionSnap: s.divisionSnap,
            arrowStart: !!s.arrowStart, arrowEnd: !!s.arrowEnd, arrowScale: s.arrowScale, bulge: (s as any).bulge || 0,
          } });
        } else if (kind === "hatch") {
          const h = this.scene.getHatchById(id); if (!h) continue;
          clip.push({ kind, data: { points: clone(h.points), holes: clone(h.holes ?? []), fillColor: h.fillColor,
            strokeColor: h.strokeColor, fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
            labelId: h.labelId, areaLabel: clone(h.areaLabel), patternEnabled: h.patternEnabled,
            patternId: h.patternId, patternScale: h.patternScale, patternAngleDeg: h.patternAngleDeg,
            patternSkewDeg: h.patternSkewDeg, patternStretch: h.patternStretch, patternOffsetX: h.patternOffsetX, patternOffsetY: h.patternOffsetY,
            bulges: Array.isArray((h as any).bulges) ? [...(h as any).bulges] : undefined,
            holeBulges: Array.isArray((h as any).holeBulges) ? (h as any).holeBulges.map((l: number[]) => [...l]) : undefined } });
        } else if (kind === "textBox") {
          const t = this.scene.getTextBoxById(id); if (!t) continue;
          clip.push({ kind, data: { center: clone(t.center), widthM: t.widthM, heightM: t.heightM,
            rotationRad: t.rotationRad, html: t.html, style: { ...clone(t.style), labelId: t.labelId } } });
        } else if (kind === "freeStroke") {
          const f = this.scene.getFreeStrokeById(id); if (!f) continue;
          clip.push({ kind, data: { points: clone(f.points), color: f.color, thicknessM: f.thicknessM,
            opacity: f.opacity, lineStyle: f.lineStyle, gapM: f.gapM, blobSpacingM: f.blobSpacingM,
            blobSizeM: f.blobSizeM, smoothing: f.smoothing, labelId: f.labelId, imageSrc: f.imageSrc,
            imageSizeM: f.imageSizeM, imageSpacingM: f.imageSpacingM, imageRotateAlongPath: f.imageRotateAlongPath } });
        } else if (kind === "dimension") {
          const d: any = (this.scene as any).getDimensionById?.(id); if (!d) continue;
          clip.push({ kind, data: clone({
            p1: d.p1, p2: d.p2, placementPoint: d.placementPoint, mode: d.mode, refDir: d.refDir,
            style: { textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
              decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
              useFreeText: d.useFreeText, freeText: d.freeText, textBgEnabled: d.textBgEnabled,
              textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
              extensionStyle: d.extensionStyle, extensionColor: d.extensionColor, extensionAlpha: d.extensionAlpha,
              freeTextBold: d.freeTextBold, freeTextItalic: d.freeTextItalic, freeTextColor: d.freeTextColor,
              showUnit: d.showUnit, unit: d.unit, textGapPx: d.textGapPx,
              doorHeightText: d.doorHeightText, mirror: d.mirror, labelId: d.labelId },
            doorRefId: d.doorRefId }) });
        } else if (kind === "document") {
          const d = this.scene.getDocumentById(id); if (!d || d._snapOnly) continue;
          clip.push({ kind, data: clone({
            name: d.name, kind: d.kind, src: d.src, pageIndex: d.pageIndex,
            position: d.position, widthM: d.widthM, heightM: d.heightM, rotationRad: d.rotationRad,
            pixelWidth: d.pixelWidth, pixelHeight: d.pixelHeight, labelId: d.labelId,
            importScaleDenom: d.importScaleDenom, eraseMaskDataUrl: d.eraseMaskDataUrl,
            pdfSourceB64: d.pdfSourceB64, guideEdges: d.guideEdges, cropM: d.cropM,
            opacity: d.opacity, filters: d.filters, activeFilterId: d.activeFilterId,
            bgRemoval: d.bgRemoval, anchors: d.anchors, warpCorners: d.warpCorners,
            flipX: d.flipX, flipY: d.flipY,
          }) });
        }
      } catch { /* einzelne Objekte überspringen */ }
    }
    if (clip.length === 0) return false;
    this._miniClipboard = clip;
    this._miniPasteRound = 0;
    return true;
  }

  /**
   * Fügt die Zwischenablage exakt an der Ursprungsposition ein. Die Kopie ist
   * sofort als Gruppe ausgewählt, verschiebbar und wird per Häkchen bestätigt.
   */
  pasteClipboard(): boolean {
    if (this._miniClipboard.length === 0) return false;
    // Eine bereits schwebende Kopie wird vor dem nächsten Einfügen bestätigt;
    // sonst würde ihre Auswahl beim Aufbau der neuen Kopie verloren gehen.
    if (this.selectTool.pasteFloatActive) {
      this.selectTool.confirmPasteFloat();
      this._flushHistorySnapshot();
    }
    else this.selectTool.cancelGroupTransform?.(true);
    const mv = (p: any) => ({ x: p.x, y: p.y });
    const created: { kind: string; id: string }[] = [];
    for (const it of this._miniClipboard) {
      const o = it.data;
      try {
        if (it.kind === "segment") {
          if (o.isGuide && this._guidesLocked) continue;
          const n = this.scene.createSegment(mv(o.a), mv(o.b), {
            color: o.color, thicknessM: o.thicknessM, labelId: o.labelId,
            isGuide: !!o.isGuide, midpointSnap: !!o.midpointSnap, divisionSnap: o.divisionSnap,
            arrowStart: !!o.arrowStart, arrowEnd: !!o.arrowEnd, arrowScale: o.arrowScale, bulge: o.bulge,
          });
          if (n) created.push({ kind: "segment", id: n.id });
        } else if (it.kind === "hatch") {
          const n = this.scene.createHatch(o.points.map(mv), {
            holes: (o.holes ?? []).map((h: any[]) => h.map(mv)),
            fillColor: o.fillColor, strokeColor: o.strokeColor, fillAlphaPct: o.fillAlphaPct,
            strokeWidthPx: o.strokeWidthPx, labelId: o.labelId, areaLabel: o.areaLabel,
            patternEnabled: o.patternEnabled, patternId: o.patternId, patternScale: o.patternScale, patternAngleDeg: o.patternAngleDeg, patternSkewDeg: o.patternSkewDeg, patternStretch: o.patternStretch, patternOffsetX: o.patternOffsetX, patternOffsetY: o.patternOffsetY,
            bulges: o.bulges, holeBulges: o.holeBulges, });
          if (n) created.push({ kind: "hatch", id: n.id });
        } else if (it.kind === "textBox") {
          const n = this.scene.createTextBox(mv(o.center), o.widthM, o.heightM, o.style, o.html, o.rotationRad);
          if (n) created.push({ kind: "textbox", id: n.id });
        } else if (it.kind === "freeStroke") {
          const { points, ...style } = o;
          const n = this.scene.createFreeStroke(points.map(mv), style);
          if (n) created.push({ kind: "freeStroke", id: (n as any).id });
        } else if (it.kind === "dimension") {
          const n = this.scene.createDimension(mv(o.p1), mv(o.p2), mv(o.placementPoint), o.mode, o.refDir, o.style, o.doorRefId);
          if (n) created.push({ kind: "dimension", id: n.id });
        } else if (it.kind === "document") {
          const data = JSON.parse(JSON.stringify(o));
          const n = this.scene.createDocument({ ...data, position: mv(o.position) });
          if (n) created.push({ kind: "document", id: n.id });
        }
      } catch { /* einzelne Objekte überspringen */ }
    }
    // Eine vor dem Fixieren gefüllte Guide-Zwischenablage wird bewusst
    // konsumiert, erzeugt aber keine neue, anschließend bewegliche Hilfslinie.
    if (created.length === 0) return true;
    if (created.length) {
      try {
        if (this._activeTool !== "select") this.setTool("select");
        this.clearSelection?.();
        this.selectTool.beginPasteFloat(created);
      } catch { /* Auswahl optional */ }
    }
    this._changeDirty = true;
    try { this.refreshLabelUI(); } catch {}
    try { (this.renderer as any).requestDraw?.(); } catch {}
    return true;
  }


  /** API: wird vom React-Layer aus dem "Einzel/Mehrfach"-Toggle bedient. */
  setMultiSelectMode(on: boolean) {
    this._multiSelectMode = !!on;
  }



  getSelections(): Selection[] {
    return this.selections.slice();
  }

  private _installShiftTracker() {
    const onDown = (e: KeyboardEvent) => { if (e.key === "Shift") this._shiftDown = true; };
    const onUp = (e: KeyboardEvent) => { if (e.key === "Shift") this._shiftDown = false; };
    // Pointer-Events tragen den exakten shiftKey-Stand → noch zuverlässiger als
    // Keyboard-Listener (z.B. wenn Fokus wechselt).
    const onPointer = (e: PointerEvent | MouseEvent) => { this._shiftDown = !!(e as any).shiftKey; };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("pointerdown", onPointer, true);
    this._coordCleanups.push(() => window.removeEventListener("keydown", onDown));
    this._coordCleanups.push(() => window.removeEventListener("keyup", onUp));
    this._coordCleanups.push(() => window.removeEventListener("pointerdown", onPointer, true));
  }


  beginTextEdit(box: TextBox) {
    this.textEditor.beginEdit(box);
  }

  /** Optionale externe Objektzähler pro Bezeichnungs-ID (z.B. Projektmappen-PageElements).
   *  Wird vom IdPanel zu den Scene-Zählern addiert, damit CAD-Blatt-Viewports & Co.
   *  in der jeweiligen ID-Zeile mitgezählt werden — kein Parallelsystem nötig. */
  externalLabelCounter: ((labelId: string) => number) | null = null;

  refreshLabelUI() {
    this._changeDirty = true;
    try { this.idPanel?.render(); } catch {}
    try { this.onLabelsChange?.(); } catch {}
  }

  /** Compat mit CadApp — von FreeDrawSettingsPanel/EraserSettingsPanel benutzt. */
  get canvas(): HTMLCanvasElement { return this.dom.canvas; }

  setActiveDrawLabelId(labelId: string) {
    this.activeDrawLabelId = labelId || Defaults.defaultLabelId;
    this.refreshLabelUI();
  }

  setSelectedLabelId(labelId: string | null) {
    this.selectedLabelId = labelId || null;
    try { (this.renderer as any).setSelectedLabelId?.(this.selectedLabelId); } catch {}
    this.refreshLabelUI();
  }

  selectLabelGroup(labelId: string) {
    this.setActiveDrawLabelId(labelId);
    this.setSelectedLabelId(labelId);
  }

  /** Liefert die labelId der Primärauswahl (oder null). */
  getSelectionLabelId(): string | null {
    const sel: any = this.selection;
    if (!sel) return null;
    if (sel.segmentId) { const s = this.scene.getSegmentById(sel.segmentId); return s?.labelId ?? null; }
    if (sel.textBoxId) { const b = this.scene.getTextBoxById(sel.textBoxId); return b?.labelId ?? null; }
    if (sel.hatchId) { const h = this.scene.getHatchById(sel.hatchId); return h?.labelId ?? null; }
    if (sel.freeStrokeId) { const f = this.scene.getFreeStrokeById(sel.freeStrokeId); return f?.labelId ?? null; }
    if (sel.dimensionId) { const d = (this.scene as any).getDimensionById?.(sel.dimensionId); return d?.labelId ?? null; }
    if (sel.documentId) { const d = this.scene.getDocumentById(sel.documentId); return d?.labelId ?? null; }
    return null;
  }

  /** Weist allen aktuell selektierten Objekten die neue Ebene zu. */
  setSelectionLabelId(labelId: string): boolean {
    const list = this.selections.length ? this.selections : (this.selection ? [this.selection] : []);
    if (!list.length) return false;
    let changed = false;
    for (const sel of list as any[]) {
      if (sel.segmentId)      { const o = this.scene.getSegmentById(sel.segmentId);   if (o) { o.labelId = labelId; changed = true; } }
      else if (sel.textBoxId) { const o = this.scene.getTextBoxById(sel.textBoxId);   if (o) { o.labelId = labelId; changed = true; } }
      else if (sel.hatchId)   { const o = this.scene.getHatchById(sel.hatchId);       if (o) { o.labelId = labelId; changed = true; } }
      else if (sel.freeStrokeId) { const o = this.scene.getFreeStrokeById(sel.freeStrokeId); if (o) { o.labelId = labelId; changed = true; } }
      else if (sel.dimensionId)  { const o = (this.scene as any).getDimensionById?.(sel.dimensionId); if (o) { o.labelId = labelId; changed = true; } }
      else if (sel.documentId)   { const o = this.scene.getDocumentById(sel.documentId); if (o) { o.labelId = labelId; changed = true; } }
    }
    if (changed) {
      this._changeDirty = true;
      this.refreshLabelUI();
      try { this._onSelectionChange?.(this._selectionInfo(this.selection), this.selections.length); } catch {}
    }
    return changed;
  }

  /** Mount the imperativen IdPanel gegen ein DOM-Skeleton (analog CadApp). */
  attachIdPanel(refs: {
    root: HTMLDivElement;
    body: HTMLDivElement;
    list: HTMLDivElement;
    addBtn: HTMLButtonElement;
    toggleBtn: HTMLButtonElement;
  }) {
    if (this.idPanel) return;
    this.idPanel = new IdPanel(this as any, refs.root, refs.body, refs.list, refs.addBtn, refs.toggleBtn);
    this.idPanel.render();
  }

  detachIdPanel() {
    // IdPanel hat kein destroy(); wir lösen einfach die Referenz.
    // Event-Listener bleiben am (bald unmounteten) DOM hängen und werden mit
    // dem Garbage-Collected DOM aufgeräumt.
    this.idPanel = null;
  }

  getSelectedFreeStroke() {
    if (!this.selection || this.selection.type !== SelectionType.FREE_STROKE) return null;
    return this.scene.getFreeStrokeById((this.selection as any).freeStrokeId);
  }

  /* ---- Mehrfachauswahl: Einstellungen auf alle gleichartigen Objekte ---- */

  private _panelMirror<T extends object>(primary: T | null | undefined, kind: string, lookup: (id: string) => T | null | undefined): T | null {
    if (!primary) return null;
    const sibs: T[] = [];
    for (const ref of this._selectedRefs()) {
      if (ref.kind !== kind) continue;
      const o = lookup(ref.id);
      if (o && o !== primary) sibs.push(o);
    }
    return sibs.length ? mirrorProxy(primary, sibs) : primary;
  }

  /** Von den Werkzeugeinstellungen genutzte Getter — spiegeln Änderungen bei
   *  Mehrfachauswahl automatisch auf alle Objekte derselben Art. */
  getEditSegment() {
    return this._panelMirror(this.getSelectedSegment(), "segment", (id) => this.scene.getSegmentById(id));
  }
  getEditHatch() {
    return this._panelMirror(this.getSelectedHatch(), "hatch", (id) => this.scene.getHatchById(id));
  }
  getEditTextBox() {
    return this._panelMirror(this.getSelectedTextBox(), "textBox", (id) => this.scene.getTextBoxById(id));
  }
  getEditFreeStroke() {
    return this._panelMirror(this.getSelectedFreeStroke() as any, "freeStroke", (id) => this.scene.getFreeStrokeById(id));
  }
  getEditDimension() { return null; }

  /* ===== CadApp surface stubs (required by SelectTool) ===== */

  getSelectedSegment() {
    if (!this.selection || !this.selection.segmentId) return null;
    return this.scene.getSegmentById(this.selection.segmentId);
  }

  getSelectedHatch() {
    if (!this.selection || !this.selection.hatchId) return null;
    return this.scene.getHatchById(this.selection.hatchId);
  }

  /** Für getCurrentHatchStyle — im Embed nutzen wir keine Gruppen-Auswahl. */
  getSelectedGroupHatches(): any[] { return []; }

  getCurrentHatchStyle() {
    const sel = this.getSelectedHatch();
    if (sel) {
      return {
        fillColor: sel.fillColor || this.defaultHatchFillColor,
        strokeColor: sel.strokeColor || this.defaultHatchStrokeColor,
        fillAlphaPct: sel.fillAlphaPct ?? this.defaultHatchFillAlphaPct,
        strokeWidthPx: (typeof sel.strokeWidthPx === "number") ? sel.strokeWidthPx : this.defaultHatchStrokeWidthPx,
        patternEnabled: !!sel.patternEnabled,
        patternId: sel.patternId || this.defaultHatchPatternId,
        patternScale: sel.patternScale ?? this.defaultHatchPatternScale,
        patternAngleDeg: sel.patternAngleDeg ?? this.defaultHatchPatternAngleDeg,
        patternSkewDeg: sel.patternSkewDeg ?? this.defaultHatchPatternSkewDeg, patternStretch: sel.patternStretch ?? this.defaultHatchPatternStretch, patternOffsetX: sel.patternOffsetX ?? 0, patternOffsetY: sel.patternOffsetY ?? 0,
        labelId: sel.labelId || Defaults.defaultLabelId,
        areaLabel: {
          show: !!sel.areaLabel?.show,
          textColor: sel.areaLabel?.textColor || Defaults.areaTextColor,
          fontSizePx: sel.areaLabel?.fontSizePx ?? Defaults.areaFontSizePx,
          bgColor: sel.areaLabel?.bgColor || Defaults.areaBgColor,
          bgAlphaPct: sel.areaLabel?.bgAlphaPct ?? Defaults.areaBgAlphaPct,
          offsetX: sel.areaLabel?.offsetX || 0,
          offsetY: sel.areaLabel?.offsetY || 0,
        } as any,
      };
    }
    return {
      fillColor: this.defaultHatchFillColor,
      strokeColor: this.defaultHatchStrokeColor,
      fillAlphaPct: this.defaultHatchFillAlphaPct,
      strokeWidthPx: this.defaultHatchStrokeWidthPx,
      patternEnabled: this.defaultHatchPatternEnabled,
      patternId: this.defaultHatchPatternId,
      patternScale: this.defaultHatchPatternScale,
      patternAngleDeg: this.defaultHatchPatternAngleDeg,
      patternSkewDeg: this.defaultHatchPatternSkewDeg, patternStretch: this.defaultHatchPatternStretch, patternOffsetX: 0, patternOffsetY: 0,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
      areaLabel: {
        show: this.defaultAreaShow, textColor: Defaults.areaTextColor, fontSizePx: Defaults.areaFontSizePx,
        bgColor: Defaults.areaBgColor, bgAlphaPct: Defaults.areaBgAlphaPct, offsetX: 0, offsetY: 0,
      } as any,
    };
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
      // Im PDF-/Druckmodus bleibt nur die echte Geometrie sichtbar. Selektion,
      // Fangpunkte, Hub-Vorschauen und Werkzeug-Overlays sind reine Editorhilfen.
      if (isExportMode()) {
        ctx.restore();
        return;
      }
      // Selection-Highlights 1:1 wie in der CAD-Oberfläche.
      try { this._drawHatchSelection?.(); } catch {}
      try { this._drawSegmentSelection?.(); } catch {}
      try { this._drawTextBoxSelection?.(); } catch {}
      try { this._drawStickerInstanceSelection?.(); } catch {}
      try { this._drawDocumentSelection?.(); } catch {}
      try { this._drawFreeStrokeSelection?.(); } catch {}
      try { this._drawHoverSegmentPoints?.(); } catch {}
      // Sekundäre Auswahlen (Multi-Select) mit identischen Passes zeichnen.
      if (this.extraSelections && this.extraSelections.length > 0) {
        const original = this.selection;
        for (const extra of this.extraSelections) {
          if (!extra || extra === original) continue;
          this.selection = extra;
          try { this._drawHatchSelection?.(); } catch {}
          try { this._drawSegmentSelection?.(); } catch {}
          try { this._drawTextBoxSelection?.(); } catch {}
          try { this._drawStickerInstanceSelection?.(); } catch {}
          try { this._drawDocumentSelection?.(); } catch {}
          try { this._drawFreeStrokeSelection?.(); } catch {}
        }
        this.selection = original;
      }
      if (this.overlay && this.overlay.draw) {
        try { this.overlay.draw(ctx, this.camera); } catch (e) { console.error(e); }
      }
      ctx.restore();
    };
  }

  /** Override paddingPx auf 1 für eingebettete Textboxen, damit der Rahmen
   *  sehr knapp am Text sitzt, ohne Buchstaben optisch anzuschneiden. */
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
        baseFontSizePt: textStyleFontSizePt(box.style),
        displayScale: cam.scale / r.referencePxPerM,
        baseColor: box.style.textColor,
        bgColor: box.style.bgColor,
        bgAlpha: (box.style.bgAlphaPct || 0) / 100,
        align: box.style.align,
        wrap: box.style.wrap,
        baseBold: box.style.bold,
        baseItalic: box.style.italic,
        baseUnderline: box.style.underline,
        baseStrike: box.style.strike,
        lineHeightPct: box.style.lineHeightPct,
        borderEnabled: box.style.borderEnabled,
        borderColor: box.style.borderColor,
        borderWidthPx: box.style.borderWidthPx,
        paddingPx: 1 * (cam.scale / r.referencePxPerM),
      });
    };
  }

  private _installDeleteKey() {
    const onKey = (e: KeyboardEvent) => {
      if (this._destroyed) return;
      const tgt = e.target as HTMLElement | null;
      const inField = !!(tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)));

      // Gruppen-Drehen der Mehrfachauswahl: R starten, Enter bestätigen, Esc abbrechen.
      if (!inField && !this.textEditor.isActive() && this._activeTool === "select") {
        if (e.key === "Enter" && this.selectTool.pasteFloatActive) {
          e.preventDefault();
          this.selectTool.confirmPasteFloat();
          this._changeDirty = true;
          return;
        }
        if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey
            && this.selectTool.marqueeSelectedIds.length > 0 && !this.selectTool.groupRotateActive) {
          if (this.selectTool.startGroupRotate()) { e.preventDefault(); return; }
        }
        if (e.key === "Enter" && this.selectTool.groupRotateActive) {
          e.preventDefault();
          this.selectTool.cancelGroupTransform(false);
          this._changeDirty = true;
          return;
        }
        if (e.key === "Enter" && this.selectTool.groupAnchorActive) {
          e.preventDefault();
          this.selectTool.confirmGroupAction();
          this._changeDirty = true;
          return;
        }
        if (e.key === "Escape" && !this.selectTool.pasteFloatActive
            && (this.selectTool.groupRotateActive || this.selectTool.groupDragActive
            || this.selectTool.groupAnchorActive)) {
          e.preventDefault();
          this.selectTool.cancelGroupTransform(true);
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && this.selectTool.groupAnchorActive) {
          e.preventDefault();
          this.selectTool.cancelGroupTransform(true);
        }
        if ((e.key === "Delete" || e.key === "Backspace")
            && (this.selectTool.groupRotateActive || this.selectTool.groupDragActive)) {
          e.preventDefault();
          this.selectTool.cancelGroupTransform(true);
        }
      }

      // ENTER platziert ein schwebendes Dokument (PNG/JPG/PDF) endgültig.
      if (e.key === "Enter" && !inField && this._activeTool === "document") {
        if ((this.documentTool as any).finishFromKey?.()) {
          e.preventDefault();
          this._changeDirty = true;
          try { this.onSelectionChange?.(); } catch {}
          return;
        }
      }

      // ESC in zwei Stufen: 1× bricht die laufende Aktion ab (Werkzeug bleibt),
      // 2× (nichts läuft) räumt Auswahl/Modi auf — der Werkzeugwechsel selbst
      // passiert in der React-Schicht (PageCanvas).
      if (e.key === "Escape" && !inField) {
        try { if (this.textEditor.isActive()) { this.textEditor.commit(); return; } } catch {}
        let pasteCancelled = false;
        try { pasteCancelled = this.selectTool.cancelPasteFloat(); } catch {}
        if (pasteCancelled) return;
        if (this.hasActiveAction()) {
          try { (this.activeTool as any)?.cancel?.(); } catch {}
          try { this.selectTool.cancelGroupTransform(true); } catch {}
          try { this.selectTool.cancel(); } catch {}
          try { this.onSelectionChange?.(); } catch {}
          return;
        }
        try { this.selectTool.cancelGroupTransform(true); } catch {}
        try { (this.activeTool as any)?.cancel?.(); } catch {}
        try { (this.lineTool as any)?.cancel?.(); (this.hatchTool as any)?.cancel?.();
              (this.freeDrawTool as any)?.cancel?.(); (this.eraserTool as any)?.cancel?.();
              (this.documentTool as any)?.cancel?.(); } catch {}
        try { this.selectTool.cancel(); } catch {}
        try { this.clearSelection(); } catch {}
        try { this.pointEditMenu.hide(); } catch {}
        try { this.onSelectionChange?.(); } catch {}
        return;
      }

      if (e.key !== "Delete" && e.key !== "Backspace") return;
      // Tabelle im Zellmodus: Entf betrifft nur den Zellinhalt.
      {
        const kt = e.target as HTMLElement | null;
        if (kt && typeof kt.closest === "function" && kt.closest("[data-table-cellmode]")) return;
      }
      // Niemals löschen, während Text bearbeitet wird.
      if (this.textEditor.isActive()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Eine laufende Bearbeitung zuerst beenden, danach aber in derselben
      // Tastaturaktion die weiterhin ausgewählte Geometrie löschen.
      const st: any = this.selectTool as any;
      if (this._activeTool === "select" &&
          (st.editTarget || st.rotateTextBoxId || st.dragTextBoxId || st.dragDocId || st.dragFreeStrokeId || st.dragDimId)) {
        e.preventDefault();
        e.stopPropagation();
        this.selectTool.cancel();
        this.pointEditMenu.hide();
        try { this.onSelectionChange?.(); } catch {}
      }
      if (this._activeTool === "select" && this.selectTool.marqueeSelectedIds.length > 0) {
        for (const ref of this.selectTool.marqueeSelectedIds) {
          if (ref.kind !== "document") continue;
          const document = this.scene.getDocumentById(ref.id);
          if (document?._snapOnly) this._externalDocDelete?.(document.id);
        }
        const removed = this.selectTool.deleteMarqueeSelection();
        if (removed) {
          this.clearSelection();
          this.pointEditMenu.hide();
          this.refreshLabelUI();
          this._changeDirty = true;
          this._lastMarqueeSelectionCount = 0;
          try { this._onSelectionChange?.(null, 0); } catch {}
          try { this.onSelectionChange?.(); } catch {}
          e.preventDefault();
        }
        return;
      }
      const sels = this.selections.length > 0 ? this.selections : (this.selection ? [this.selection] : []);
      if (sels.length === 0) return;
      let removed = false;
      for (const sel of sels) {
        if (sel.segmentId) {
          const s = this.scene.getSegmentById(sel.segmentId);
          if (s) { this.scene.removeSegment(s); removed = true; }
        } else if (sel.type === SelectionType.TEXTBOX || sel.type === SelectionType.TEXTBOX_HANDLE) {
          if (sel.textBoxId) {
            const box = this.scene.getTextBoxById(sel.textBoxId);
            if (box) { this.scene.removeTextBox(box); removed = true; }
          }
        } else if (sel.hatchId) {
          const h = this.scene.getHatchById(sel.hatchId);
          if (h) { this.scene.removeHatch(h); removed = true; }
        } else if ((sel as any).stickerInstanceId) {
          const sid = (sel as any).stickerInstanceId as string;
          const inst = this.scene.stickerInstances?.find?.((i: any) => i.id === sid);
          if (inst) { this.scene.removeStickerInstance(inst); removed = true; }
        } else if ((sel as any).freeStrokeId) {
          this.scene.removeFreeStrokesByIds([(sel as any).freeStrokeId]);
          removed = true;
        } else if ((sel as any).documentId) {
          const documentId = sel.documentId;
          if (!documentId) continue;
          const document = this.scene.getDocumentById(documentId);
          if (document) {
            if (document._snapOnly) this._externalDocDelete?.(document.id);
            this.scene.removeDocumentsByIds([documentId]);
            removed = true;
          }
        }
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

  /* ===== Multi-Select Group-Move ============================================
   * Während eines Drag-Vorgangs am primary-Selection-Objekt werden alle weiteren
   * Selektionen mit demselben Delta verschoben. Die Geometrie der Extras wird
   * beim Pointer-Down snapshotted und bei jedem Tick auf (snapshot + delta) gesetzt
   * — so vermeiden wir Eingriffe in das SelectTool. */
  private _groupMoveSnap: null | {
    primarySel: Selection;
    primaryAnchor: { x: number; y: number };
    primarySnapshot: SelectionGeometrySnapshot;
    extras: Array<{ sel: Selection; snapshot: SelectionGeometrySnapshot }>;
  } = null;

  private _isTranslationSel(s: Selection): boolean {
    if (!s) return false;
    if (s.type === SelectionType.POINT) return false;
    if (s.type === SelectionType.TEXTBOX_HANDLE) return false;
    if (s.type === SelectionType.AREA_LABEL_HANDLE) return false;
    if (s.type === SelectionType.DIMENSION) return false;
    if (s.type === SelectionType.WALL && (s as any).edgeIndex != null) return false;
    return true;
  }

  private _getSelAnchor(s: Selection): { x: number; y: number } | null {
    if (s.segmentId) {
      const seg = this.scene.getSegmentById(s.segmentId);
      if (!seg) return null;
      return { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
    }
    if (s.hatchId) {
      const h = this.scene.getHatchById(s.hatchId);
      if (!h || !h.points.length) return null;
      return { x: h.points[0].x, y: h.points[0].y };
    }
    if (s.textBoxId) {
      const b = this.scene.getTextBoxById(s.textBoxId);
      if (!b) return null;
      return { x: b.center.x, y: b.center.y };
    }
    const sid = s.stickerInstanceId;
    if (sid) {
      const i = this.scene.getStickerInstanceById(sid);
      if (!i) return null;
      return { x: i.position.x, y: i.position.y };
    }
    const did = s.documentId;
    if (did) {
      const d = this.scene.documents.find((x) => x.id === did);
      if (!d) return null;
      return { x: d.position.x, y: d.position.y };
    }
    const fid = s.freeStrokeId;
    if (fid) {
      const f = this.scene.freeStrokes.find((x) => x.id === fid);
      if (!f || !f.points.length) return null;
      return { x: f.points[0].x, y: f.points[0].y };
    }
    return null;
  }

  private _snapshotSelGeometry(s: Selection): SelectionGeometrySnapshot | null {
    if (s.segmentId) {
      const seg = this.scene.getSegmentById(s.segmentId);
      if (!seg) return null;
      return { kind: "segment", a: { x: seg.a.x, y: seg.a.y }, b: { x: seg.b.x, y: seg.b.y } };
    }
    if (s.hatchId) {
      const h = this.scene.getHatchById(s.hatchId);
      if (!h) return null;
      return {
        kind: "hatch",
        pts: h.points.map((p) => ({ x: p.x, y: p.y })),
        holes: h.holes ? h.holes.map((ring) => ring.map((p) => ({ x: p.x, y: p.y }))) : null,
      };
    }
    if (s.textBoxId) {
      const b = this.scene.getTextBoxById(s.textBoxId);
      if (!b) return null;
      return { kind: "textbox", center: { x: b.center.x, y: b.center.y } };
    }
    const sid = s.stickerInstanceId;
    if (sid) {
      const i = this.scene.getStickerInstanceById(sid);
      if (!i) return null;
      return { kind: "sticker", pos: { x: i.position.x, y: i.position.y } };
    }
    const did = s.documentId;
    if (did) {
      const d = this.scene.documents.find((x) => x.id === did);
      if (!d) return null;
      return { kind: "doc", pos: { x: d.position.x, y: d.position.y } };
    }
    const fid = s.freeStrokeId;
    if (fid) {
      const f = this.scene.freeStrokes.find((x) => x.id === fid);
      if (!f) return null;
      return { kind: "freestroke", pts: f.points.map((p) => ({ x: p.x, y: p.y })) };
    }
    return null;
  }

  private _applySelectionGeometrySnapshot(s: Selection, snapshot: SelectionGeometrySnapshot, dx = 0, dy = 0) {
    if (snapshot.kind === "segment" && s.segmentId) {
      const segment = this.scene.getSegmentById(s.segmentId);
      if (!segment) return;
      segment.a.x = snapshot.a.x + dx;
      segment.a.y = snapshot.a.y + dy;
      segment.b.x = snapshot.b.x + dx;
      segment.b.y = snapshot.b.y + dy;
    } else if (snapshot.kind === "hatch" && s.hatchId) {
      const hatch = this.scene.getHatchById(s.hatchId);
      if (!hatch) return;
      for (let i = 0; i < hatch.points.length && i < snapshot.pts.length; i++) {
        hatch.points[i].x = snapshot.pts[i].x + dx;
        hatch.points[i].y = snapshot.pts[i].y + dy;
      }
      if (snapshot.holes && hatch.holes) {
        for (let ringIndex = 0; ringIndex < hatch.holes.length && ringIndex < snapshot.holes.length; ringIndex++) {
          const ring = hatch.holes[ringIndex];
          for (let i = 0; i < ring.length && i < snapshot.holes[ringIndex].length; i++) {
            ring[i].x = snapshot.holes[ringIndex][i].x + dx;
            ring[i].y = snapshot.holes[ringIndex][i].y + dy;
          }
        }
      }
    } else if (snapshot.kind === "textbox" && s.textBoxId) {
      const box = this.scene.getTextBoxById(s.textBoxId);
      if (!box) return;
      box.center.x = snapshot.center.x + dx;
      box.center.y = snapshot.center.y + dy;
    } else if (snapshot.kind === "sticker") {
      const sticker = this.scene.getStickerInstanceById(s.stickerInstanceId ?? "");
      if (!sticker) return;
      sticker.position.x = snapshot.pos.x + dx;
      sticker.position.y = snapshot.pos.y + dy;
    } else if (snapshot.kind === "doc") {
      const document = this.scene.documents.find((item) => item.id === s.documentId);
      if (!document) return;
      document.position.x = snapshot.pos.x + dx;
      document.position.y = snapshot.pos.y + dy;
    } else if (snapshot.kind === "freestroke") {
      const stroke = this.scene.freeStrokes.find((item) => item.id === s.freeStrokeId);
      if (!stroke) return;
      for (let i = 0; i < stroke.points.length && i < snapshot.pts.length; i++) {
        stroke.points[i].x = snapshot.pts[i].x + dx;
        stroke.points[i].y = snapshot.pts[i].y + dy;
      }
    }
  }

  private _legacyGroupMoveIncludesGuide(): boolean {
    const move = this._groupMoveSnap;
    if (!move) return false;
    return [move.primarySel, ...move.extras.map((entry) => entry.sel)].some((selection) => {
      if (!selection.segmentId) return false;
      return !!this.scene.getSegmentById(selection.segmentId)?.isGuide;
    });
  }

  private _cancelLegacyGroupMove(revert: boolean) {
    const move = this._groupMoveSnap;
    if (!move) return;
    if (revert) {
      this._applySelectionGeometrySnapshot(move.primarySel, move.primarySnapshot);
      for (const entry of move.extras) {
        this._applySelectionGeometrySnapshot(entry.sel, entry.snapshot);
      }
    }
    this._groupMoveSnap = null;
  }

  private _installGroupMove() {
    const c = this.dom.canvas;
    const onDown = () => {
      if (this._activeTool !== "select" && this._activeTool !== null) {
        this._groupMoveSnap = null;
        return;
      }
      const sels = this.selections;
      if (sels.length < 2) { this._groupMoveSnap = null; return; }
      const primary = sels[sels.length - 1];
      if (!this._isTranslationSel(primary)) { this._groupMoveSnap = null; return; }
      const anchor = this._getSelAnchor(primary);
      if (!anchor) { this._groupMoveSnap = null; return; }
      const primarySnapshot = this._snapshotSelGeometry(primary);
      if (!primarySnapshot) { this._groupMoveSnap = null; return; }
      const extras: Array<{ sel: Selection; snapshot: SelectionGeometrySnapshot }> = [];
      for (const s of sels) {
        if (s === primary) continue;
        const snap = this._snapshotSelGeometry(s);
        if (snap) extras.push({ sel: s, snapshot: snap });
      }
      this._groupMoveSnap = {
        primarySel: primary,
        primaryAnchor: { x: anchor.x, y: anchor.y },
        primarySnapshot,
        extras,
      };
    };
    const onUp = () => { this._cancelLegacyGroupMove(false); };
    c.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    this._coordCleanups.push(() => c.removeEventListener("pointerdown", onDown));
    this._coordCleanups.push(() => window.removeEventListener("pointerup", onUp));
    this._coordCleanups.push(() => window.removeEventListener("pointercancel", onUp));
  }

  private _applyGroupTranslate() {
    const snap = this._groupMoveSnap;
    if (!snap) return;
    // Wenn das primary-Objekt nicht mehr Teil der aktuellen Selektion ist
    // (z.B. weil ein Plain-Klick ohne Shift sie ersetzt hat), Snap verwerfen.
    if (!this.selections.some((s) => _sameObject(s, snap.primarySel))) {
      this._groupMoveSnap = null;
      return;
    }
    const cur = this._getSelAnchor(snap.primarySel);

    if (!cur) return;
    const dx = cur.x - snap.primaryAnchor.x;
    const dy = cur.y - snap.primaryAnchor.y;
    if (dx === 0 && dy === 0) return;
    for (const e of snap.extras) {
      this._applySelectionGeometrySnapshot(e.sel, e.snapshot, dx, dy);
    }
  }

  /* ===== Multi-Select Marquee (Drag-Rect) =====================================
   * Wenn der User mit gehaltener Shift-Taste (oder im Mehrfach-Modus) auf eine
   * leere Stelle klickt und zieht, wird ein gestricheltes Auswahlrechteck
   * gezeichnet. Beim Loslassen werden alle Objekte (Linien, Hatches, TextBoxen,
   * Sticker, Documents, FreeStrokes) deren Anker im Rechteck liegt, gewählt. */
  private _marqueeActive = false;
  private _marqueeStart: { x: number; y: number } | null = null; // Welt
  private _marqueeEnd: { x: number; y: number } | null = null;   // Welt
  /** Während aktiver Marquee werden setSelection-Aufrufe (z.B. vom SelectTool
   *  für „Klick ins Leere") ignoriert — die Marquee bestimmt die Auswahl. */
  private _suppressSetSelection = false;

  private _installMarquee() {
    const c = this.dom.canvas;
    const screenToWorld = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const sx = (e.clientX - r.left) * (c.width / r.width);
      const sy = (e.clientY - r.top) * (c.height / r.height);
      return this.camera.screenToWorld(sx, sy);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (this._activeTool !== "select" && this._activeTool !== null) return;
      // Im "click"-Modus keine Marquee — nur einfaches Anklicken.
      if (this.selectTool.marqueeMode === "click") return;
      const wantMulti = e.shiftKey || this._multiSelectMode;
      if (!wantMulti) return;
      // Nur starten wenn der Klick wirklich in den leeren Raum geht — wir
      // erkennen das vereinfachend so: kein vorhandenes Objekt unter der Maus.
      const w = screenToWorld(e);
      if (this._hitAnyObject(w.x, w.y)) return;
      this._marqueeActive = true;
      this._marqueeStart = { x: w.x, y: w.y };
      this._marqueeEnd = { x: w.x, y: w.y };
      this._installMarqueeOverlay();
    };
    const onMove = (e: PointerEvent) => {
      if (!this._marqueeActive) return;
      const w = screenToWorld(e);
      this._marqueeEnd = { x: w.x, y: w.y };
    };
    const onUp = (_e: PointerEvent) => {
      if (!this._marqueeActive) return;
      this._marqueeActive = false;
      this._suppressSetSelection = true;
      try {
        const a = this._marqueeStart!;
        const b = this._marqueeEnd!;
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        // Mindestgröße — sonst war's nur ein Klick ohne Drag.
        const minSize = 0.005; // 5 mm in Welt-Metern
        if (x1 - x0 > minSize || y1 - y0 > minSize) {
          const picks = this._marqueePick(x0, y0, x1, y1);
          // Bestehende Selektionen bleiben erhalten (Marquee additiv im Multi/Shift-Modus).
          const current = this.selections.slice();
          for (const p of picks) {
            if (!current.some((s) => _sameObject(s, p))) current.push(p);
          }
          const primary = current[current.length - 1] ?? null;
          this._applyPrimary(primary, current);
        }
      } finally {
        this._marqueeStart = null;
        this._marqueeEnd = null;
        // SetSelection-Sperre erst im NÄCHSTEN Tick lösen, damit das SelectTool
        // (das nach mouseup ebenfalls setSelection(null) auslösen könnte) noch
        // unterdrückt wird.
        setTimeout(() => { this._suppressSetSelection = false; }, 0);
        this.renderer.overlay = null;
      }
    };
    c.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    this._coordCleanups.push(() => c.removeEventListener("pointerdown", onDown));
    this._coordCleanups.push(() => window.removeEventListener("pointermove", onMove));
    this._coordCleanups.push(() => window.removeEventListener("pointerup", onUp));
    this._coordCleanups.push(() => window.removeEventListener("pointercancel", onUp));
  }

  private _installMarqueeOverlay() {
    this.renderer.overlay = {
      draw: (ctx, cam) => {
        if (!this._marqueeStart || !this._marqueeEnd) return;
        const a = cam.worldToScreen(this._marqueeStart.x, this._marqueeStart.y);
        const b = cam.worldToScreen(this._marqueeEnd.x, this._marqueeEnd.y);
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
        ctx.save();
        ctx.fillStyle = "rgba(56, 132, 255, 0.10)";
        ctx.strokeStyle = "rgba(56, 132, 255, 0.85)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.restore();
      },
    } as any;
  }

  /** Liefert true, wenn an Welt-Position (wx,wy) irgendein selektierbares Objekt liegt.
   *  Sehr grobe Heuristik (Bbox-Test mit Toleranz). */
  private _hitAnyObject(wx: number, wy: number): boolean {
    const tol = 5 / this.camera.scale; // 5 px in Welt-Einheiten
    for (const seg of this.scene.segments) {
      if (this.isFrameSegment(seg)) continue;
      if (seg.isGuide && this._guidesLocked) continue;
      if (!this._labelEditable(seg.labelId)) continue;
      const x0 = Math.min(seg.a.x, seg.b.x) - tol, x1 = Math.max(seg.a.x, seg.b.x) + tol;
      const y0 = Math.min(seg.a.y, seg.b.y) - tol, y1 = Math.max(seg.a.y, seg.b.y) + tol;
      if (wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1) {
        // Segment-Abstand grob
        const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y;
        const L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((wx - seg.a.x) * dx + (wy - seg.a.y) * dy) / L2));
        const px = seg.a.x + t * dx, py = seg.a.y + t * dy;
        if (Math.hypot(px - wx, py - wy) <= tol) return true;
      }
    }
    for (const h of this.scene.hatches) {
      if (!this._labelEditable(h.labelId)) continue;
      const xs = h.points.map((p) => p.x), ys = h.points.map((p) => p.y);
      if (wx >= Math.min(...xs) && wx <= Math.max(...xs) && wy >= Math.min(...ys) && wy <= Math.max(...ys)) return true;
    }
    for (const b of this.scene.textBoxes) {
      if (Math.abs(wx - b.center.x) <= b.widthM / 2 && Math.abs(wy - b.center.y) <= b.heightM / 2) return true;
    }
    for (const i of this.scene.stickerInstances || []) {
      if (Math.hypot(wx - i.position.x, wy - i.position.y) <= 0.05) return true;
    }
    for (const d of this.scene.documents) {
      if (wx >= d.position.x && wx <= d.position.x + d.widthM && wy >= d.position.y && wy <= d.position.y + d.heightM) return true;
    }
    return false;
  }

  private _marqueePick(x0: number, y0: number, x1: number, y1: number): Selection[] {
    const inRect = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const rectsOverlap = (a: { minX: number; minY: number; maxX: number; maxY: number }) =>
      !(a.maxX < x0 || a.minX > x1 || a.maxY < y0 || a.minY > y1);
    const mode = this.selectTool.marqueeMode;
    const picks: Selection[] = [];
    for (const seg of this.scene.segments) {
      if (this.isFrameSegment(seg)) continue;
      if (seg.isGuide && this._guidesLocked) continue;
      if (!this._labelEditable(seg.labelId)) continue;
      const inside = inRect(seg.a.x, seg.a.y) && inRect(seg.b.x, seg.b.y);
      const touched = rectsOverlap({ minX: Math.min(seg.a.x, seg.b.x), minY: Math.min(seg.a.y, seg.b.y), maxX: Math.max(seg.a.x, seg.b.x), maxY: Math.max(seg.a.y, seg.b.y) });
      if (mode === "enclose" ? inside : touched) {
        picks.push({ type: SelectionType.SEGMENT, segmentId: seg.id } as any);
      }
    }
    for (const h of this.scene.hatches) {
      const xs = h.points.map((p) => p.x), ys = h.points.map((p) => p.y);
      if (mode === "enclose" ? h.points.every((p) => inRect(p.x, p.y)) : rectsOverlap({ minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) })) {
        picks.push({ type: SelectionType.HATCH, hatchId: h.id, pointIndex: null });
      }
    }
    for (const b of this.scene.textBoxes) {
      if (!this._labelEditable(b.labelId)) continue;
      const halfW = b.widthM / 2, halfH = b.heightM / 2;
      const box = { minX: b.center.x - halfW, minY: b.center.y - halfH, maxX: b.center.x + halfW, maxY: b.center.y + halfH };
      if (mode === "enclose" ? (box.minX >= x0 && box.minY >= y0 && box.maxX <= x1 && box.maxY <= y1) : rectsOverlap(box)) {
        picks.push({ type: SelectionType.TEXTBOX, textBoxId: b.id, handleIndex: null });
      }
    }
    for (const i of this.scene.stickerInstances || []) {
      if (!this._labelEditable((i as any).labelId)) continue;
      if (inRect(i.position.x, i.position.y)) {
        picks.push({ type: SelectionType.STICKER_INSTANCE, stickerInstanceId: i.id } as any);
      }
    }
    for (const d of this.scene.documents) {
      if (!this._labelEditable(d.labelId)) continue;
      const cx = d.position.x + d.widthM / 2;
      const cy = d.position.y + d.heightM / 2;
      const box = { minX: d.position.x, minY: d.position.y, maxX: d.position.x + d.widthM, maxY: d.position.y + d.heightM };
      if (mode === "enclose" ? (box.minX >= x0 && box.minY >= y0 && box.maxX <= x1 && box.maxY <= y1) : rectsOverlap(box)) picks.push({ type: SelectionType.DOCUMENT, documentId: d.id } as any);
    }
    for (const f of this.scene.freeStrokes) {
      if (!f.points.length) continue;
      if (!this._labelEditable(f.labelId)) continue;
      const xs = f.points.map((p) => p.x), ys = f.points.map((p) => p.y);
      const box = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
      if (mode === "enclose" ? f.points.every((p) => inRect(p.x, p.y)) : rectsOverlap(box)) {
        picks.push({ type: SelectionType.FREE_STROKE, freeStrokeId: f.id } as any);
      }
    }
    return picks;
  }

  private _installCoordRemap() {
    const c = this.dom.canvas;

    const remap = (e: PointerEvent | MouseEvent) => {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const sxScale = c.width / r.width;
      const syScale = c.height / r.height;
      this.input.mouse.sx = (e.clientX - r.left) * sxScale;
      this.input.mouse.sy = (e.clientY - r.top) * syScale;
    };
    // Pointer-Events (touch- & pen-tauglich) statt Mouse-Only. Löst das
    // "Startpunkt liegt an der letzten Mausposition"-Problem auf Tablets.
    c.addEventListener("pointermove", remap as any);
    c.addEventListener("pointerdown", remap as any);
    this._coordCleanups.push(() => c.removeEventListener("pointermove", remap as any));
    this._coordCleanups.push(() => c.removeEventListener("pointerdown", remap as any));
  }

  private _tick = () => {
    if (this._destroyed) return;
    try {
      this.input.wheelDelta = 0;

      // Embed-Modus: Kein Kamera-Pan und kein Wheel-Zoom. Die Projektmappe
      // steuert Zoom/Position ausschließlich über die React-Wrapper-Ebene.
      // Kamera-Offset bleibt fix an FRAME_PAD_PX gebunden, damit Objekte
      // und Hilfslinien auf dem Blatt an ihrer Position kleben.
      this.camera.offsetX = FRAME_PAD_PX;
      this.camera.offsetY = FRAME_PAD_PX;
      this.camera.scale = this.basePxPerMm * 1000 * this._zoom;

      this.input.update(this.camera);

      if (this._activeTool === "line" || this._activeTool === "guide") this.lineTool.update(this.input);
      else if (this._activeTool === "text") this.textTool.update(this.input);
      else if (this._activeTool === "select") this.selectTool.update(this.input);
      else if (this._activeTool === "free") this.freeDrawTool.update(this.input);
      else if (this._activeTool === "eraser") this.eraserTool.update(this.input);
      else if (this._activeTool === "hatch") this.hatchTool.update(this.input);
      else if (this._activeTool === "document") this.documentTool.update(this.input);
      else if (this._activeTool === "pipette") this.pipetteTool.update(this.input);

      // Multi-Select Group-Move: nach SelectTool-Update das Delta des Primary
      // auf die Snapshot-Positionen der Extras anwenden.
      this._applyGroupTranslate();


      // Geometry change → persist (cover segments AND text boxes AND edits).
      // Während eines aktiven Punkt-Edits (Verschieben/Drehen einer Textbox)
      // bleibt das Objekt im Vorschau-Modus: erst nach dem Setzen wird
      // persistiert → genau ein Undo/Redo-Schritt im Kopf.
      const editingPreview = !!this.selectTool?.isEditing?.();
      const sig = this._sceneSignature();
      if (sig !== this._lastSig) {
        this._lastSig = sig;
        if (editingPreview) this._changeDirty = true;
        else this._onChange?.();
      } else if (this._changeDirty && !editingPreview) {
        this._changeDirty = false;
        this._onChange?.();
      }

      // Externe Dokument-Änderungen (Hub-Box) an Host melden.
      this._emitExternalDocChanges();

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
    const strokes = this.scene.freeStrokes.length;
    // Include a coarse text snapshot so edits to HTML also fire onChange.
    let h = 0;
    for (const t of this.scene.textBoxes) {
      h = (h * 31 + (t.html?.length || 0) + Math.round(t.center.x * 1000) + Math.round(t.center.y * 1000)) | 0;
      // Rotation + Größe mit aufnehmen — sonst landen Drehungen/Resize nicht
      // im Undo/Redo-Verlauf der Projektmappe.
      h = (h * 31 + Math.round((t.rotationRad || 0) * 10000) + Math.round((t.widthM || 0) * 1000) + Math.round((t.heightM || 0) * 1000)) | 0;
    }
    for (const s of this.scene.freeStrokes) {
      h = (h * 31 + s.points.length + (s.color?.length || 0)) | 0;
    }
    // Dokument-Anker + Transform (Position/Größe/Rotation) in Signatur einbeziehen —
    // Änderungen (z. B. Skalieren einer PDF) müssen persistiert werden.
    for (const d of this.scene.documents as any[]) {
      const anchors = d.anchors as { x: number; y: number }[] | undefined;
      const n = anchors?.length || 0;
      h = (h * 31 + n) | 0;
      if (anchors) for (const a of anchors) {
        h = (h * 31 + Math.round(a.x * 1000) + Math.round(a.y * 1000)) | 0;
      }
      h = (h * 31 + Math.round((d.widthM ?? 0) * 10000)) | 0;
      h = (h * 31 + Math.round((d.heightM ?? 0) * 10000)) | 0;
      h = (h * 31 + Math.round((d.position?.x ?? 0) * 10000)) | 0;
      h = (h * 31 + Math.round((d.position?.y ?? 0) * 10000)) | 0;
      h = (h * 31 + Math.round((d.rotationRad ?? 0) * 10000)) | 0;
    }
    return `${segs}|${texts}|${strokes}|${this.scene.documents.length}|${h}`;
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
