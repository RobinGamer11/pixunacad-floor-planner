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
import { FreeDrawTool } from "../FreeDrawTool";
import { EraserTool } from "../EraserTool";
import { HatchTool, type HatchDrawMode } from "../HatchTool";
import { DocumentTool } from "../DocumentTool";
import { Defaults, SelectionType } from "../constants";
import type { TextBox, TextBoxStyle, FreeLineStyle } from "../Scene";
import { drawRichTextBox } from "../textRichRenderer";
import { autoSizeTextBox } from "../textAutoSize";


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


export type MiniTool = "line" | "text" | "select" | "guide" | "free" | "eraser" | "hatch" | "document" | null;
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


/** Extra CSS pixels around the page on the canvas so edge snap dots and the
 *  blue snap line are fully visible (and not occluded by the page's margin
 *  border). Independent of zoom. */
const FRAME_PAD_PX = 16;

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
  readonly hatchTool: HatchTool;
  readonly documentTool: DocumentTool;

  // Stubs required by tools / editor.
  activeDrawLabelId = Defaults.defaultLabelId;
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
  // Radiergummi-Defaults.
  defaultEraserRadiusM: number = Defaults.eraserRadiusM;
  defaultEraserStrength: number = Defaults.eraserStrength;

  // Schraffur-Defaults (analog CadApp).
  defaultHatchFillColor: string = Defaults.hatchFillColor;
  defaultHatchStrokeColor: string = Defaults.hatchStrokeColor;
  defaultHatchStrokeWidthPx: number = Defaults.hatchStrokePx;
  defaultHatchFillAlphaPct: number = Defaults.hatchFillAlphaPct;
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

  /** Hub-Box-Zustand für Dokument-Ecken (analog CadApp). Wird von SelectTool gesetzt. */
  documentHubState: { visible: boolean; screenX: number; screenY: number; docId: string | null; cornerIndex: number } = {
    visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0,
  };
  /** Compat mit SelectTool aus CadApp — Maßketten gibt es im Embed nicht. */
  dimensionHubMode: "none" | "move" = "none";
  dimensionHubState: { visible: boolean; screenX: number; screenY: number; dimensionId: string | null } = {
    visible: false, screenX: 0, screenY: 0, dimensionId: null,
  };

  /** Map externalId → docId; Snapshot zur Diff-Erkennung. */
  private _externalDocs: Map<string, string> = new Map();
  private _externalDocSnapshots: Map<string, string> = new Map();
  private _externalDocChange: ((id: string, t: { xMM: number; yMM: number; rotationDeg: number; guideEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean } }) => void) | null = null;


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
  private _guideColor: string = "#7DD3FC";

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
    return seg.labelId === this._frameLabelId || seg.labelId === this._extRectLabelId;
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

  /* ===== External DocumentObjects (Projektmappen-PDF/Bild als CAD-Dokument) ===== */

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
    onChange?: (id: string, t: { xMM: number; yMM: number; rotationDeg: number; guideEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean } }) => void,
  ) {
    this._installExtDocLabel();
    this._externalDocChange = onChange ?? null;
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
            rotationDeg: (d.rotationRad * 180) / Math.PI,
            guideEdges: { ...d.guideEdges },
          });
        }
      }
    }
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
      const sel = this.selection;
      if (sel && sel.segmentId) {
        const seg = this.scene.getSegmentById(sel.segmentId);
        if (seg && (this.isFrameSegment(seg) || (seg.isGuide && this._guidesLocked))) {
          this.clearSelection();
          try { this.pointEditMenu.hide(); } catch {}
        }
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
    }
  }

  /** Sperrt/entsperrt alle Hilfslinien (Auswahl, Verschieben, Punktedit). */
  setGuidesLocked(locked: boolean) {
    this._guidesLocked = !!locked;
    // Wenn gerade eine Hilfslinie selektiert ist → Auswahl räumen.
    const sel = this.selection;
    if (sel && sel.segmentId) {
      const seg = this.scene.getSegmentById(sel.segmentId);
      if (seg?.isGuide && this._guidesLocked) {
        try { this.clearSelection(); } catch {}
        try { this.pointEditMenu.hide(); } catch {}
      }
    }
  }

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
    const selected = this.getSelectedSegment();
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
      version: 4,
      segments: this.scene.segments
        .filter((s) => s.labelId !== this._frameLabelId && s.labelId !== this._extRectLabelId)
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
        if (s.labelId === this._frameLabelId || s.labelId === this._extRectLabelId) continue;
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
          });
        } catch (e) { console.error("MiniCad restore hatch:", e); }
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
      if (doc && (doc as any)._snapOnly) return { tool: "document", id: doc.id };
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

  refreshLabelUI() {
    this._changeDirty = true;
    try { this.onLabelsChange?.(); } catch {}
  }

  /** Compat mit CadApp — von FreeDrawSettingsPanel/EraserSettingsPanel benutzt. */
  get canvas(): HTMLCanvasElement { return this.dom.canvas; }

  setActiveDrawLabelId(labelId: string) {
    this.activeDrawLabelId = labelId || Defaults.defaultLabelId;
    this.refreshLabelUI();
  }

  getSelectedFreeStroke() {
    if (!this.selection || this.selection.type !== SelectionType.FREE_STROKE) return null;
    return this.scene.getFreeStrokeById((this.selection as any).freeStrokeId);
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
          this.scene.removeDocumentsByIds([(sel as any).documentId]);
          removed = true;
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
    extras: Array<{ sel: Selection; snapshot: any }>;
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
    const sid = (s as any).stickerInstanceId;
    if (sid) {
      const i = this.scene.getStickerInstanceById(sid);
      if (!i) return null;
      return { x: i.position.x, y: i.position.y };
    }
    const did = (s as any).documentId;
    if (did) {
      const d = this.scene.documents.find((x) => x.id === did);
      if (!d) return null;
      return { x: d.position.x, y: d.position.y };
    }
    const fid = (s as any).freeStrokeId;
    if (fid) {
      const f = this.scene.freeStrokes.find((x) => x.id === fid);
      if (!f || !f.points.length) return null;
      return { x: f.points[0].x, y: f.points[0].y };
    }
    return null;
  }

  private _snapshotSelGeometry(s: Selection): any {
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
        holes: (h as any).holes ? (h as any).holes.map((ring: any[]) => ring.map((p: any) => ({ x: p.x, y: p.y }))) : null,
      };
    }
    if (s.textBoxId) {
      const b = this.scene.getTextBoxById(s.textBoxId);
      if (!b) return null;
      return { kind: "textbox", center: { x: b.center.x, y: b.center.y } };
    }
    const sid = (s as any).stickerInstanceId;
    if (sid) {
      const i = this.scene.getStickerInstanceById(sid);
      if (!i) return null;
      return { kind: "sticker", pos: { x: i.position.x, y: i.position.y } };
    }
    const did = (s as any).documentId;
    if (did) {
      const d = this.scene.documents.find((x) => x.id === did);
      if (!d) return null;
      return { kind: "doc", pos: { x: d.position.x, y: d.position.y } };
    }
    const fid = (s as any).freeStrokeId;
    if (fid) {
      const f = this.scene.freeStrokes.find((x) => x.id === fid);
      if (!f) return null;
      return { kind: "freestroke", pts: f.points.map((p: any) => ({ x: p.x, y: p.y })) };
    }
    return null;
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
      const extras: Array<{ sel: Selection; snapshot: any }> = [];
      for (const s of sels) {
        if (s === primary) continue;
        const snap = this._snapshotSelGeometry(s);
        if (snap) extras.push({ sel: s, snapshot: snap });
      }
      this._groupMoveSnap = { primarySel: primary, primaryAnchor: { x: anchor.x, y: anchor.y }, extras };
    };
    const onUp = () => { this._groupMoveSnap = null; };
    c.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    this._coordCleanups.push(() => c.removeEventListener("mousedown", onDown));
    this._coordCleanups.push(() => window.removeEventListener("mouseup", onUp));
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
      const s = e.sel;
      const sg = e.snapshot;
      if (sg.kind === "segment" && s.segmentId) {
        const seg = this.scene.getSegmentById(s.segmentId);
        if (!seg) continue;
        seg.a.x = sg.a.x + dx; seg.a.y = sg.a.y + dy;
        seg.b.x = sg.b.x + dx; seg.b.y = sg.b.y + dy;
      } else if (sg.kind === "hatch" && s.hatchId) {
        const h = this.scene.getHatchById(s.hatchId);
        if (!h) continue;
        for (let i = 0; i < h.points.length && i < sg.pts.length; i++) {
          h.points[i].x = sg.pts[i].x + dx;
          h.points[i].y = sg.pts[i].y + dy;
        }
        if (sg.holes && (h as any).holes) {
          for (let r = 0; r < (h as any).holes.length && r < sg.holes.length; r++) {
            const ring = (h as any).holes[r];
            for (let i = 0; i < ring.length && i < sg.holes[r].length; i++) {
              ring[i].x = sg.holes[r][i].x + dx;
              ring[i].y = sg.holes[r][i].y + dy;
            }
          }
        }
      } else if (sg.kind === "textbox" && s.textBoxId) {
        const b = this.scene.getTextBoxById(s.textBoxId);
        if (!b) continue;
        b.center.x = sg.center.x + dx;
        b.center.y = sg.center.y + dy;
      } else if (sg.kind === "sticker") {
        const i = this.scene.getStickerInstanceById((s as any).stickerInstanceId);
        if (!i) continue;
        i.position.x = sg.pos.x + dx;
        i.position.y = sg.pos.y + dy;
      } else if (sg.kind === "doc") {
        const d = this.scene.documents.find((x) => x.id === (s as any).documentId);
        if (!d) continue;
        d.position.x = sg.pos.x + dx;
        d.position.y = sg.pos.y + dy;
      } else if (sg.kind === "freestroke") {
        const f = this.scene.freeStrokes.find((x) => x.id === (s as any).freeStrokeId);
        if (!f) continue;
        for (let i = 0; i < f.points.length && i < sg.pts.length; i++) {
          f.points[i].x = sg.pts[i].x + dx;
          f.points[i].y = sg.pts[i].y + dy;
        }
      }
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
    const screenToWorld = (e: MouseEvent) => {
      const r = c.getBoundingClientRect();
      const sx = (e.clientX - r.left) * (c.width / r.width);
      const sy = (e.clientY - r.top) * (c.height / r.height);
      return this.camera.screenToWorld(sx, sy);
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (this._activeTool !== "select" && this._activeTool !== null) return;
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
    const onMove = (e: MouseEvent) => {
      if (!this._marqueeActive) return;
      const w = screenToWorld(e);
      this._marqueeEnd = { x: w.x, y: w.y };
    };
    const onUp = (_e: MouseEvent) => {
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
    c.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    this._coordCleanups.push(() => c.removeEventListener("mousedown", onDown));
    this._coordCleanups.push(() => window.removeEventListener("mousemove", onMove));
    this._coordCleanups.push(() => window.removeEventListener("mouseup", onUp));
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
    const picks: Selection[] = [];
    for (const seg of this.scene.segments) {
      if (this.isFrameSegment(seg)) continue;
      if (seg.isGuide && this._guidesLocked) continue;
      // Eine Linie ist „getroffen", wenn beide Endpunkte im Rechteck liegen.
      if (inRect(seg.a.x, seg.a.y) && inRect(seg.b.x, seg.b.y)) {
        picks.push({ type: SelectionType.SEGMENT, segmentId: seg.id } as any);
      }
    }
    for (const h of this.scene.hatches) {
      if (h.points.every((p) => inRect(p.x, p.y))) {
        picks.push({ type: SelectionType.HATCH, hatchId: h.id, pointIndex: null });
      }
    }
    for (const b of this.scene.textBoxes) {
      if (inRect(b.center.x, b.center.y)) {
        picks.push({ type: SelectionType.TEXTBOX, textBoxId: b.id, handleIndex: null });
      }
    }
    for (const i of this.scene.stickerInstances || []) {
      if (inRect(i.position.x, i.position.y)) {
        picks.push({ type: SelectionType.STICKER_INSTANCE, stickerInstanceId: i.id } as any);
      }
    }
    for (const d of this.scene.documents) {
      const cx = d.position.x + d.widthM / 2;
      const cy = d.position.y + d.heightM / 2;
      if (inRect(cx, cy)) picks.push({ type: SelectionType.DOCUMENT, documentId: d.id } as any);
    }
    for (const f of this.scene.freeStrokes) {
      if (f.points.length && inRect(f.points[0].x, f.points[0].y)) {
        picks.push({ type: SelectionType.FREE_STROKE, freeStrokeId: f.id } as any);
      }
    }
    return picks;
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

      // Multi-Select Group-Move: nach SelectTool-Update das Delta des Primary
      // auf die Snapshot-Positionen der Extras anwenden.
      this._applyGroupTranslate();


      // Geometry change → persist (cover segments AND text boxes AND edits).
      const sig = this._sceneSignature();
      if (sig !== this._lastSig) {
        this._lastSig = sig;
        this._onChange?.();
      } else if (this._changeDirty) {
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
    }
    for (const s of this.scene.freeStrokes) {
      h = (h * 31 + s.points.length + (s.color?.length || 0)) | 0;
    }
    return `${segs}|${texts}|${strokes}|${h}`;
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
