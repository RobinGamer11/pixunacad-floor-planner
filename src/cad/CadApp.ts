import { Defaults, ToolIds, PointEditAction, SelectionType } from "./constants";
import { clamp, v, Vec2 } from "./geometry";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Scene, AreaLabel, DimensionStyle, TextBoxStyle, TextBox } from "./Scene";
import { autoSizeTextBox } from "./textAutoSize";
import { LabelManager } from "./LabelManager";
import { TopologyEngine } from "./TopologyEngine";
import { Renderer, Selection } from "./Renderer";
import { LineHub } from "./LineHub";
import { PointEditMenu } from "./PointEditMenu";
import { SelectTool } from "./SelectTool";
import { LineTool } from "./LineTool";
import { HatchTool } from "./HatchTool";
import { MeasureTool } from "./MeasureTool";
import { TextTool } from "./TextTool";
import { TextEditorOverlay } from "./TextEditorOverlay";
import { PipetteTool } from "./PipetteTool";
import { Clipboard, buildClipboardFromSelection, commitClipboardAt, translatedItems, ClipboardItem } from "./ClipboardManager";
import { StickerTool } from "./StickerTool";
import { StickerDefinition, buildStickerFromSelection, buildStickerFromIds, StickerIdSet, exportStickersToJson, importStickersFromJson, instanceBoundingCornersWorld, transformedInstanceItems, pointInInstance, localItemsBounds } from "./StickerManager";
import { DocumentTool } from "./DocumentTool";
import { FreeDrawTool } from "./FreeDrawTool";
import { EraserTool } from "./EraserTool";
import { WallTool } from "./WallTool";
import { DoorTool } from "./DoorTool";

import { IdPanel } from "./IdPanel";
import { SheetManager, SheetOverlayStore, SheetDefaults } from "./SheetManager";
import { PlanManager, getPlanPaperSize } from "./PlanManager";
import { PlanPanel } from "./PlanPanel";
import { PlanController } from "./PlanController";
import { drawProjection as drawPlanProjection } from "./PlanProjections";
import { SheetPanel } from "./SheetPanel";

export interface TextSettingsRefs {
  panel: HTMLDivElement;
  idSelect: HTMLSelectElement;
  textColor: HTMLInputElement;
  textColorPreview: HTMLDivElement;
  fontSize: HTMLInputElement;
  alignLeftBtn: HTMLButtonElement;
  alignCenterBtn: HTMLButtonElement;
  alignRightBtn: HTMLButtonElement;
  bgColor: HTMLInputElement;
  bgColorPreview: HTMLDivElement;
  bgAlpha: HTMLInputElement;
  wrapToggle: HTMLInputElement;
  borderToggle: HTMLInputElement;
  borderGroup: HTMLDivElement;
  borderColor: HTMLInputElement;
  borderColorPreview: HTMLDivElement;
  borderWidth: HTMLInputElement;
}

export interface TextEditorRefs {
  editor: HTMLDivElement;
  toolbar: HTMLDivElement;
  boldBtn: HTMLButtonElement;
  italicBtn: HTMLButtonElement;
  colorInput: HTMLInputElement;
  sizeSelect: HTMLSelectElement;
  symbolSelect: HTMLSelectElement;
}

export interface MeasureSettings {
  orientation: "parallel" | "diagonal";
  pointCount: "two" | "multi";
  /** Achsen-Richtung der Maßkette. "free" wird aus den ersten zwei Punkten abgeleitet. */
  direction: "horizontal" | "vertical" | "free";
  editMode: "parallel" | "endpoints";
  textColor: string;
  textSizePx: number;
  lineColor: string;
  decimals: number;
  tickLengthM: number;
  showExtensions: boolean;
  useFreeText: boolean;
  freeText: string;
  textBgEnabled: boolean;
  textBgColor: string;
  textBgAlpha: number;
  extensionStyle: "dashed" | "solid";
  extensionColor: string;
  extensionAlpha: number;
  freeTextBold: boolean;
  freeTextItalic: boolean;
  freeTextColor: string;
  showUnit: boolean;
  unit: "mm" | "cm" | "m";
  textGapPx: number;
  doorHeightText: string;
}


export interface MeasureSettingsRefs {
  panel: HTMLDivElement;
  idSelect: HTMLSelectElement;
  orientation: HTMLSelectElement;
  pointCount: HTMLSelectElement;
  direction: HTMLSelectElement;
  editMode: HTMLSelectElement;

  extensionsToggle: HTMLInputElement;
  extensionsGroup: HTMLDivElement;
  extensionStyle: HTMLSelectElement;
  extensionColor: HTMLInputElement;
  extensionColorPreview: HTMLDivElement;
  extensionAlpha: HTMLInputElement;

  freeTextToggle: HTMLInputElement;
  freeTextInput: HTMLInputElement;
  freeTextGroup: HTMLDivElement;
  freeTextBold: HTMLButtonElement;
  freeTextItalic: HTMLButtonElement;
  freeTextColor: HTMLInputElement;
  freeTextColorPreview: HTMLDivElement;

  textColor: HTMLInputElement;
  textColorPreview: HTMLDivElement;
  textSize: HTMLInputElement;
  decimals: HTMLInputElement;
  textBgToggle: HTMLInputElement;
  textBgGroup: HTMLDivElement;
  textBgColor: HTMLInputElement;
  textBgColorPreview: HTMLDivElement;
  textBgAlpha: HTMLInputElement;
  lineColor: HTMLInputElement;
  lineColorPreview: HTMLDivElement;
  tickLength: HTMLInputElement;
  showUnit: HTMLInputElement;
  unit: HTMLSelectElement;
  textGap?: HTMLInputElement;
  doorHeightText?: HTMLInputElement;
}

export class CadApp {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  hub: LineHub;
  pointEditMenu: PointEditMenu;

  lineSettingsPanel: HTMLDivElement;
  lineIdSelect: HTMLSelectElement;
  lineColorInput: HTMLInputElement;
  lineColorPreview: HTMLDivElement;
  lineThicknessInput: HTMLInputElement;

  hatchSettingsPanel: HTMLDivElement;
  hatchIdSelect: HTMLSelectElement;
  hatchFillColorInput: HTMLInputElement;
  hatchFillColorPreview: HTMLDivElement;
  hatchStrokeColorInput: HTMLInputElement;
  hatchStrokeColorPreview: HTMLDivElement;
  hatchStrokeWidthInput: HTMLInputElement;
  hatchAlphaInput: HTMLInputElement;
  areaShowInput: HTMLInputElement;
  areaSettingsGroup: HTMLDivElement;
  areaTextColorInput: HTMLInputElement;
  areaTextColorPreview: HTMLDivElement;
  areaFontSizeInput: HTMLInputElement;
  areaBgColorInput: HTMLInputElement;
  areaBgColorPreview: HTMLDivElement;
  areaBgAlphaInput: HTMLInputElement;

  measureRefs!: MeasureSettingsRefs;
  textRefs!: TextSettingsRefs;
  textEditorRefs!: TextEditorRefs;
  textEditor!: TextEditorOverlay;

  defaultLineColor = Defaults.lineColor;
  defaultLineThicknessM = Defaults.lineThicknessM;
  defaultArrowStart = false;
  defaultArrowEnd = false;
  defaultArrowScale = 1;

  defaultHatchFillColor = Defaults.hatchFillColor;
  defaultHatchStrokeColor = Defaults.hatchStrokeColor;
  defaultHatchStrokeWidthPx = Defaults.hatchStrokePx;
  defaultHatchFillAlphaPct = Defaults.hatchFillAlphaPct;
  /** Radierte Schraffur-Kanten automatisch glätten. */
  defaultHatchAutoSmooth = true;
  defaultAreaShow = Defaults.areaShow;
  defaultAreaBorderEnabled = Defaults.areaBorderEnabled;
  defaultAreaBorderColor = Defaults.areaBorderColor;
  defaultAreaBorderWidthPx = Defaults.areaBorderWidthPx;

  defaultTextColor = Defaults.textColor;
  defaultTextFontSizePx = Defaults.textFontSizePx;
  defaultTextBgColor = Defaults.textBgColor;
  defaultTextBgAlphaPct = Defaults.textBgAlphaPct;
  defaultTextWrap = Defaults.textWrap;
  defaultTextAlign: "left" | "center" | "right" = Defaults.textAlign;
  defaultTextBorderEnabled = Defaults.textBorderEnabled;
  defaultTextBorderColor = Defaults.textBorderColor;
  defaultTextBorderWidthPx = Defaults.textBorderWidthPx;

  // Freihand-Defaults
  defaultFreeColor = Defaults.freeColor;
  defaultFreeThicknessM = Defaults.freeThicknessM;
  defaultFreeOpacity = Defaults.freeOpacity;
  defaultFreeLineStyle: "solid" | "dashed" | "dotted" | "dashdot" | "blob" | "image" = Defaults.freeLineStyle;
  defaultFreeGapM = Defaults.freeGapM;
  defaultFreeImageSrc: string | null = null;
  defaultFreeImageSizeM = Defaults.freeImageSizeM;
  defaultFreeImageSpacingM = Defaults.freeImageSpacingM;
  defaultFreeImageRotate = Defaults.freeImageRotate;
  defaultFreeAutoShape = false;

  // Eraser-Defaults
  defaultEraserRadiusM = Defaults.eraserRadiusM;
  defaultEraserStrength = Defaults.eraserStrength;
  defaultEraserMode: "hard" | "smooth" = Defaults.eraserMode;
  defaultEraserSoftness = Defaults.eraserSoftness;

  camera: Camera;
  scene: Scene;
  input: Input;
  labelManager: LabelManager;
  topology: TopologyEngine;
  /** Globale Hilfslinien (Rechtsklick auf Fangpunkt) — für alle Werkzeuge. */
  globalGuides: GlobalGuides;
  renderer: Renderer;

  /**
   * Aktueller Ansichtsmaßstab (Nenner, z. B. 100 für 1:100).
   * REIN visuell: beeinflusst NUR die Darstellung von Dokumenten (Renderer)
   * und den Kamera-Zoom. Verändert NIE Modellgeometrie oder reale Maße.
   */
  drawingScale: number = 100;

  selectTool: SelectTool;
  lineTool: LineTool;
  hatchTool: HatchTool;
  measureTool!: MeasureTool;
  textTool!: TextTool;
  pipetteTool!: PipetteTool;
  stickerTool!: StickerTool;
  documentTool!: DocumentTool;
  freeDrawTool!: FreeDrawTool;
  eraserTool!: EraserTool;
  wallTool!: WallTool;
  doorTool!: DoorTool;
  activeTool: SelectTool | LineTool | HatchTool | MeasureTool | TextTool | PipetteTool | StickerTool | DocumentTool | FreeDrawTool | EraserTool | WallTool | DoorTool;

  /** Hub-Box-State für ausgewähltes Dokument (Verschieben/Drehen/Crop). Geschrieben von SelectTool, gelesen von CadEditor. */
  documentHubState: { visible: boolean; screenX: number; screenY: number; docId: string | null; cornerIndex: number; anchorWorld: { x: number; y: number } | null; cropSide: "top" | "right" | "bottom" | "left" | null } = {
    visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null,
  };

  /** Aktive Maus-Operation der PDF-/Bild-Hub-Box. Wird von CadEditor (React) gesetzt
   *  und von SelectTool gelesen, damit Canvas-Klicks bei aktivem Modus den Ankerpunkt
   *  verschieben/drehen/skalieren. */
  documentHubMode: "none" | "move" | "rotate" | "scale" | "crop" = "none";

  /** Aktive Hintergrund-Ausschnitt-Interaktion (aus DocumentFilterPanel gesetzt).
   *  Wird von SelectTool bei Klick/Drag über dem Ziel-Dokument verarbeitet. */
  bgRemoveInteraction: null | {
    docId: string;
    tool: "wand" | "brush";
    target: "fg" | "bg";
  } = null;
  /** Erster Referenz-Klick für Rotate/Scale (Welt-Koordinate). */
  documentHubFirstClick: { x: number; y: number } | null = null;

  /** Kleiner "Maßkette fertig"-Button (Häkchen), den der MeasureTool im Sammel-Modus anzeigt. */
  measureFinishHubState: { visible: boolean; screenX: number; screenY: number } = {
    visible: false, screenX: 0, screenY: 0,
  };

  /** Hub-Box für eine ausgewählte Maßkette (Verschieben mit Snap). */
  dimensionHubState: { visible: boolean; screenX: number; screenY: number; dimensionId: string | null } = {
    visible: false, screenX: 0, screenY: 0, dimensionId: null,
  };
  /** Aktiver Modus der Dimension-Hub-Box. "move" = nächster Klick setzt PlacementPoint (mit Snap). */
  dimensionHubMode: "none" | "move" = "none";

  // Clipboard + Paste-Vorschau
  clipboard: Clipboard | null = null;
  pastePreviewActive = false;
  private _toolBeforePaste: string | null = null;

  // Sticker library (per project, included in undo/redo)
  stickers: StickerDefinition[] = [];
  onStickersChange?: () => void;

  measureSettings: MeasureSettings = {
    orientation: Defaults.measureOrientation,
    pointCount: Defaults.measurePointCount,
    direction: Defaults.measureDirection,
    editMode: Defaults.measureEditMode,

    textColor: Defaults.measureTextColor,
    textSizePx: Defaults.measureTextSizePx,
    lineColor: Defaults.measureLineColor,
    decimals: Defaults.measureDecimals,
    tickLengthM: Defaults.measureTickLengthM,
    showExtensions: Defaults.measureShowExtensions,
    useFreeText: Defaults.measureUseFreeText,
    freeText: Defaults.measureFreeText,
    textBgEnabled: Defaults.measureTextBgEnabled,
    textBgColor: Defaults.measureTextBgColor,
    textBgAlpha: Defaults.measureTextBgAlpha,
    extensionStyle: Defaults.measureExtensionStyle,
    extensionColor: Defaults.measureExtensionColor,
    extensionAlpha: Defaults.measureExtensionAlpha,
    freeTextBold: Defaults.measureFreeTextBold,
    freeTextItalic: Defaults.measureFreeTextItalic,
    freeTextColor: Defaults.measureFreeTextColor,
    showUnit: Defaults.measureShowUnit,
    unit: Defaults.measureUnit,
    textGapPx: Defaults.measureTextGapPx,
    doorHeightText: Defaults.measureDoorHeightText,
  };

  // Drag state for parallel-shifting a selected dimension
  private _dragDimId: string | null = null;
  private _dragDimOffsetAlongNormal = 0;

  idPanel: IdPanel;

  /** Zeichnungs-IDs (Blätter) — pro Blatt eine eigene Scene. */
  sheetManager: SheetManager = new SheetManager();
  sheetOverlayStore: SheetOverlayStore = new SheetOverlayStore();
  activeSheetId: string = SheetDefaults.defaultSheetId;
  sheetPanel: SheetPanel | null = null;
  /** Map: sheetId → eigene Scene. Default-Sheet teilt sich die initiale `this.scene`. */
  scenesById: Map<string, Scene> = new Map();

  /** Druckpläne (Layout-Blätter mit Papierformat). */
  planManager: PlanManager = new PlanManager();
  planPanel: PlanPanel | null = null;
  /** Aktiver Plan (null = Zeichnungsmodus, kein Plan-Hintergrund). */
  activePlanId: string | null = null;
  /** Plan-Modus Controller (Drop / Selektion / Drag / HUB). */
  planController: PlanController | null = null;
  /** Map: planId → eigene Annotation-Scene (Werkzeuge zeichnen darauf im Plan-Modus). */
  planScenesById: Map<string, Scene> = new Map();
  /** Transparentpause-States pro Plan (analog SheetOverlayStore). */
  planOverlayStore: SheetOverlayStore = new SheetOverlayStore();
  /** Pro Sheet/Plan gespeicherter Camera-State (Zoom + Pan), um beim Wechsel zurückzukehren. */
  private _camStateBySheetId: Map<string, { scale: number; offsetX: number; offsetY: number }> = new Map();
  private _camStateByPlanId: Map<string, { scale: number; offsetX: number; offsetY: number }> = new Map();
  /** Default-Linienstärke (m) speziell im Plan-Modus, damit Werkzeuge der Plangröße entsprechen. */
  private _planDefaultLineThicknessM: Map<string, number> = new Map();
  /** Default-Schriftgröße (px) speziell im Plan-Modus. */
  private _planDefaultTextFontSizePx: Map<string, number> = new Map();
  /** Gespeicherte Sheet-Defaults, damit beim Verlassen des Plan-Modus wiederhergestellt werden kann. */
  private _savedSheetDefaults: { lineThicknessM: number; textFontSizePx: number; tickLengthM: number } | null = null;

  selection: Selection | null = null;
  selectedLabelId: string | null = null;
  activeDrawLabelId: string = Defaults.defaultLabelId;

  private _btnMap = new Map<string, HTMLButtonElement>();
  private _rafId = 0;
  private _destroyed = false;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  // History (Undo/Redo)
  private _history: string[] = [];
  private _historyIndex = -1;
  private _historyMax = 100;
  private _lastSnapshot = "";
  private _snapshotTimer: number | null = null;
  private _isRestoring = false;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;

  onToolChange?: (toolId: string) => void;

  onSelectionChange?: () => void;
  onLabelsChange?: () => void;

  // ---- Sticker Edit Mode ("Ghost Scene") ----
  /** ID der Sticker-Instanz, die gerade im Edit-Mode ist. null = kein Edit-Mode. */
  _stickerEditInstanceId: string | null = null;
  /** Snapshot der Instanz-Daten beim Enter (für inverse Transform beim Exit). */
  private _stickerEditSnapshot: { name: string; defId: string | null; labelId: string; position: Vec2; rotationRad: number; scale: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    hubRoot: HTMLDivElement, hubLenInput: HTMLInputElement, hubAngInput: HTMLInputElement,
    pointEditRoot: HTMLDivElement, pointEditButtons: Record<string, HTMLButtonElement>,
    lineSettingsPanel: HTMLDivElement, lineIdSelect: HTMLSelectElement,
    lineColorInput: HTMLInputElement, lineColorPreview: HTMLDivElement, lineThicknessInput: HTMLInputElement,
    idPanelRoot: HTMLDivElement, idPanelBody: HTMLDivElement, idPanelList: HTMLDivElement,
    idPanelAddBtn: HTMLButtonElement, idPanelToggleBtn: HTMLButtonElement,
    hatchSettingsPanel: HTMLDivElement,
    hatchIdSelect: HTMLSelectElement,
    hatchFillColorInput: HTMLInputElement, hatchFillColorPreview: HTMLDivElement,
    hatchStrokeColorInput: HTMLInputElement, hatchStrokeColorPreview: HTMLDivElement,
    hatchStrokeWidthInput: HTMLInputElement, hatchAlphaInput: HTMLInputElement,
    areaShowInput: HTMLInputElement, areaSettingsGroup: HTMLDivElement,
    areaTextColorInput: HTMLInputElement, areaTextColorPreview: HTMLDivElement,
    areaFontSizeInput: HTMLInputElement,
    areaBgColorInput: HTMLInputElement, areaBgColorPreview: HTMLDivElement, areaBgAlphaInput: HTMLInputElement,
    measureRefs: MeasureSettingsRefs,
    textRefs: TextSettingsRefs,
    textEditorRefs: TextEditorRefs,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    this.hub = new LineHub(hubRoot, hubLenInput, hubAngInput);
    this.pointEditMenu = new PointEditMenu(pointEditRoot, pointEditButtons);

    this.lineSettingsPanel = lineSettingsPanel;
    this.lineIdSelect = lineIdSelect;
    this.lineColorInput = lineColorInput;
    this.lineColorPreview = lineColorPreview;
    this.lineThicknessInput = lineThicknessInput;

    this.hatchSettingsPanel = hatchSettingsPanel;
    this.hatchIdSelect = hatchIdSelect;
    this.hatchFillColorInput = hatchFillColorInput;
    this.hatchFillColorPreview = hatchFillColorPreview;
    this.hatchStrokeColorInput = hatchStrokeColorInput;
    this.hatchStrokeColorPreview = hatchStrokeColorPreview;
    this.hatchStrokeWidthInput = hatchStrokeWidthInput;
    this.hatchAlphaInput = hatchAlphaInput;
    this.areaShowInput = areaShowInput;
    this.areaSettingsGroup = areaSettingsGroup;
    this.areaTextColorInput = areaTextColorInput;
    this.areaTextColorPreview = areaTextColorPreview;
    this.areaFontSizeInput = areaFontSizeInput;
    this.areaBgColorInput = areaBgColorInput;
    this.areaBgColorPreview = areaBgColorPreview;
    this.areaBgAlphaInput = areaBgAlphaInput;
    this.measureRefs = measureRefs;
    this.textRefs = textRefs;
    this.textEditorRefs = textEditorRefs;

    this.camera = new Camera();
    this.scene = new Scene();
    // Brücke für den Renderer: ermöglicht visuelles Skalieren von Dokumenten
    // mit dem aktuellen Ansichtsmaßstab, ohne CadApp direkt zu importieren.
    (this.scene as any)._drawingScaleRef = () => this.drawingScale;
    // Default-Sheet teilt sich die initiale Scene.
    this.scenesById.set(SheetDefaults.defaultSheetId, this.scene);
    this.input = new Input(canvas);
    this.labelManager = new LabelManager();
    this.topology = new TopologyEngine(this.scene, this.camera, this.labelManager);
    this.globalGuides = new GlobalGuides();
    this.topology.guides = this.globalGuides;
    this.renderer = new Renderer(this.ctx, this.camera, this.scene, this.labelManager);

    // Plan-Modus Controller (Step 4): Drop, Selektion, Drag, HUB.
    this.planController = new PlanController(this);
    this.renderer.planOverlayDraw = (ctx) => this.planController?.drawAll(ctx);

    // Drop von Sheet-Drags auf den Canvas (nur im Plan-Modus relevant).
    this.canvas.addEventListener("dragover", (e) => {
      if (!this.activePlanId) return;
      const types = Array.from(e.dataTransfer?.types || []);
      if (!types.includes("application/x-pixuna-sheet")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    this.canvas.addEventListener("drop", (e) => {
      if (!this.activePlanId) return;
      const sheetId = e.dataTransfer?.getData("application/x-pixuna-sheet");
      if (!sheetId) return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      this.planController?.createProjectionFromSheet(sheetId, sx, sy);
    });

    this.selectTool = new SelectTool(this);
    this.lineTool = new LineTool(this);
    this.hatchTool = new HatchTool(this);
    this.measureTool = new MeasureTool(this);
    this.textTool = new TextTool(this);
    this.pipetteTool = new PipetteTool(this);
    this.stickerTool = new StickerTool(this);
    this.documentTool = new DocumentTool(this);
    this.freeDrawTool = new FreeDrawTool(this);
    this.eraserTool = new EraserTool(this);
    this.wallTool = new WallTool(this);
    this.doorTool = new DoorTool(this);
    this.activeTool = this.selectTool;
    try { (window as any).__pixunaActiveTool = ToolIds.SELECT; } catch {}

    this.idPanel = new IdPanel(this, idPanelRoot, idPanelBody, idPanelList, idPanelAddBtn, idPanelToggleBtn);

    this.textEditor = new TextEditorOverlay(
      textEditorRefs.editor, textEditorRefs.toolbar,
      textEditorRefs.boldBtn, textEditorRefs.italicBtn,
      textEditorRefs.colorInput, textEditorRefs.sizeSelect, textEditorRefs.symbolSelect,
      this,
    );

    this.pointEditMenu.bindActivate((action) => {
      const sel = this.selection;
      if (sel && sel.type === SelectionType.TEXTBOX_HANDLE && (sel as any).textBoxId && sel.handleIndex != null) {
        this.selectTool.beginTextBoxHandleEdit((sel as any).textBoxId, sel.handleIndex, action);
        return;
      }
      if (sel && sel.type === SelectionType.AREA_LABEL_HANDLE && (sel as any).hatchId && (sel as any).handleIndex != null) {
        this.selectTool.beginAreaLabelHandleEdit((sel as any).hatchId, (sel as any).handleIndex, action);
        return;
      }
      if (action === PointEditAction.OFFSET && sel && sel.type === SelectionType.HATCH && (sel as any).hatchId && (sel as any).edgeIndex != null) {
        this.selectTool.beginHatchEdgeOffset((sel as any).hatchId, (sel as any).edgeIndex, (sel as any).holeIndex ?? null);
        return;
      }
      if (sel && sel.type === SelectionType.WALL && (sel as any).wallId && (sel as any).edgeIndex != null) {
        this.selectTool.beginWallEdgeAction((sel as any).wallId, (sel as any).edgeIndex, action);
        return;
      }
      if (sel && sel.type === SelectionType.FREE_STROKE && (sel as any).freeStrokeId) {
        this.selectTool.beginFreeStrokeAction((sel as any).freeStrokeId, action);
        return;
      }
      this.selectTool.beginPointEdit(action);
    });

    this._setupLineSettingsPanel();
    this._setupHatchSettingsPanel();
    this._setupMeasureSettingsPanel();
    this._setupTextSettingsPanel();
    this._setupShortcuts();
    this.refreshLabelUI();
    this._resize();
    this.camera.center(canvas.getBoundingClientRect());
    this._tick();
    this._initHistory();
  }

  /* ---- History (Undo / Redo) ---- */
  private _serializeOneScene(scene: Scene) {
    return {
      segments: scene.segments.map(s => ({
        id: s.id, a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y },
        color: s.color, thicknessM: s.thicknessM, labelId: s.labelId,
        arrowStart: !!s.arrowStart, arrowEnd: !!s.arrowEnd, arrowScale: s.arrowScale || 1,
        _stickerEditOwnerId: s._stickerEditOwnerId || null,
      })),

      hatches: scene.hatches.map(h => ({
        id: h.id, points: h.points.map(p => ({ x: p.x, y: p.y })),
        holes: (h.holes || []).map(loop => loop.map(p => ({ x: p.x, y: p.y }))),
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: { ...h.areaLabel },
        _stickerEditOwnerId: h._stickerEditOwnerId || null,
      })),
      walls: scene.walls.map(w => ({
        id: w.id,
        kind: w.kind,
        thicknessM: w.thicknessM,
        referenceSide: w.referenceSide,
        corners: w.corners.map(p => ({ x: p.x, y: p.y })),
        hiddenCornerIndices: [...(w.hiddenCornerIndices || [])],
        cornerAnchors: (w.cornerAnchors || []).map(a => a ? { ...a } : null),

        customName: w.customName,
        color: w.color,
        fillColor: w.fillColor,
        labelId: w.labelId,
        priority: w.priority,
        _stickerEditOwnerId: w._stickerEditOwnerId || null,
      })),
      dimensions: scene.dimensions.map(d => ({
        id: d.id,
        p1: { x: d.p1.x, y: d.p1.y }, p2: { x: d.p2.x, y: d.p2.y },
        placementPoint: { x: d.placementPoint.x, y: d.placementPoint.y },
        mode: d.mode, refDir: d.refDir ? { x: d.refDir.x, y: d.refDir.y } : null,
        textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
        decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
        useFreeText: d.useFreeText, freeText: d.freeText,
        textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
        extensionStyle: d.extensionStyle, extensionColor: d.extensionColor, extensionAlpha: d.extensionAlpha,
        freeTextBold: d.freeTextBold, freeTextItalic: d.freeTextItalic, freeTextColor: d.freeTextColor,
        labelId: d.labelId,
        doorRefId: d.doorRefId || null,
        mirror: !!d.mirror,
        textGapPx: d.textGapPx,
        doorHeightText: d.doorHeightText,
        _textSideBase: (d as any)._textSideBase ?? null,
        _stickerEditOwnerId: d._stickerEditOwnerId || null,
      })),

      textBoxes: scene.textBoxes.map(t => ({
        id: t.id,
        center: { x: t.center.x, y: t.center.y },
        widthM: t.widthM, heightM: t.heightM,
        rotationRad: t.rotationRad, html: t.html,
        style: { ...t.style },
        labelId: t.labelId,
        _stickerEditOwnerId: t._stickerEditOwnerId || null,
      })),
      stickerInstances: scene.stickerInstances.map(si => ({
        id: si.id, defId: si.defId, name: si.name, items: si.items,
        position: { x: si.position.x, y: si.position.y },
        rotationRad: si.rotationRad, scale: si.scale, labelId: si.labelId,
      })),
      documents: scene.documents
        .filter(d => !(d as any)._snapOnly)
        .map(d => {
        // Falls Maske dirty ist, vor Serialisierung in DataUrl exportieren.
        let maskUrl = d.eraseMaskDataUrl;
        if (d._eraseMaskDirty && d._eraseMask) {
          try { maskUrl = d._eraseMask.toDataURL("image/png"); d.eraseMaskDataUrl = maskUrl; d._eraseMaskDirty = false; }
          catch { /* ignore */ }
        }
        // BgRemoval-Maske ebenfalls exportieren.
        let bgClone: any = undefined;
        const anyD = d as any;
        if (anyD.bgRemoval) {
          bgClone = { ...anyD.bgRemoval };
          if (anyD._bgFgMask) {
            try { bgClone.fgMaskDataUrl = (anyD._bgFgMask as HTMLCanvasElement).toDataURL("image/png"); }
            catch { /* ignore */ }
          }
        }
        return {
          id: d.id, name: d.name, kind: d.kind, src: d.src, pageIndex: d.pageIndex,
          position: { x: d.position.x, y: d.position.y },
          widthM: d.widthM, heightM: d.heightM, rotationRad: d.rotationRad,
          pixelWidth: d.pixelWidth, pixelHeight: d.pixelHeight, labelId: d.labelId,
          eraseMaskDataUrl: maskUrl || null,
          pdfSourceB64: d.pdfSourceB64 || null,
          guideEdges: { ...d.guideEdges },
          cropM: { ...(d as any).cropM },
          opacity: (d as any).opacity,
          filters: ((d as any).filters || []).map((f: any) => ({ ...f })),
          activeFilterId: (d as any).activeFilterId || null,
          bgRemoval: bgClone,
          anchors: ((d as any).anchors || []).map((a: any) => ({ x: a.x, y: a.y })),
          warpCorners: (d as any).warpCorners ? (d as any).warpCorners.map((c: any) => ({ x: c.x, y: c.y })) : null,
          flipX: !!(d as any).flipX,
          flipY: !!(d as any).flipY,
        };
      }),

      freeStrokes: scene.freeStrokes.map(s => ({
        id: s.id, points: s.points.map(p => ({ x: p.x, y: p.y })),
        color: s.color, thicknessM: s.thicknessM, opacity: s.opacity,
        lineStyle: s.lineStyle, gapM: s.gapM,
        blobSpacingM: s.blobSpacingM, blobSizeM: s.blobSizeM,
        smoothing: s.smoothing, labelId: s.labelId,
        imageSrc: s.imageSrc, imageSizeM: s.imageSizeM,
        imageSpacingM: s.imageSpacingM, imageRotateAlongPath: s.imageRotateAlongPath,
        _stickerEditOwnerId: s._stickerEditOwnerId || null,
      })),
      rulerGuide: scene.rulerGuide ? {
        a: { x: scene.rulerGuide.a.x, y: scene.rulerGuide.a.y },
        b: { x: scene.rulerGuide.b.x, y: scene.rulerGuide.b.y },
      } : null,
      doors: scene.doors.map(d => ({
        id: d.id, wallId: d.wallId, posM: d.posM, widthM: d.widthM, heightM: d.heightM,
        breakHeightM: d.breakHeightM,
        breakHeightVisible: d.breakHeightVisible,
        kind: d.kind,
        side: d.side, hand: d.hand, edge: d.edge, color: d.color,
        jambEnabled: d.jambEnabled, jambColor: d.jambColor, jambLenM: d.jambLenM, jambThickM: d.jambThickM,
        sashEnabled: d.sashEnabled, glassColor: d.glassColor, glassThickM: d.glassThickM, glassFillColor: d.glassFillColor,
        labelId: d.labelId,
      })),

    };
  }

  private _restoreOneScene(scene: Scene, data: any) {
    scene.segments = [];
    scene.hatches = [];
    scene.dimensions = [];
    scene.textBoxes = [];
    scene.stickerInstances = [];
    scene.documents = [];
    scene.freeStrokes = [];
    scene.walls = [];
    scene.doors = [];
    scene.rulerGuide = null;
    scene.markWallsDirty();
    (scene as any)._rebuildSegIdMap?.();
    (scene as any)._rebuildHatchIdMap?.();
    (scene as any)._rebuildDimIdMap?.();
    (scene as any)._rebuildTextIdMap?.();
    (scene as any)._rebuildStickerIdMap?.();
    (scene as any)._rebuildDocIdMap?.();
    (scene as any)._rebuildFreeIdMap?.();
    if (!data) return;
    for (const s of data.freeStrokes || []) {
      const stroke = scene.createFreeStroke(s.points || [], {
        color: s.color, thicknessM: s.thicknessM, opacity: s.opacity,
        lineStyle: s.lineStyle, gapM: s.gapM,
        blobSpacingM: s.blobSpacingM, blobSizeM: s.blobSizeM,
        smoothing: s.smoothing, labelId: s.labelId,
        imageSrc: s.imageSrc || null, imageSizeM: s.imageSizeM,
        imageSpacingM: s.imageSpacingM, imageRotateAlongPath: s.imageRotateAlongPath,
      });
      if (s._stickerEditOwnerId) stroke._stickerEditOwnerId = s._stickerEditOwnerId;
    }
    if (data.rulerGuide && data.rulerGuide.a && data.rulerGuide.b) {
      scene.rulerGuide = {
        a: { x: data.rulerGuide.a.x, y: data.rulerGuide.a.y },
        b: { x: data.rulerGuide.b.x, y: data.rulerGuide.b.y },
      };
    }
    for (const s of data.segments || []) {
      const seg = scene.createSegment(s.a, s.b, { color: s.color, thicknessM: s.thicknessM, labelId: s.labelId, arrowStart: !!s.arrowStart, arrowEnd: !!s.arrowEnd, arrowScale: typeof s.arrowScale === "number" ? s.arrowScale : 1 });
      if (s._stickerEditOwnerId) seg._stickerEditOwnerId = s._stickerEditOwnerId;
    }
    for (const h of data.hatches || []) {
      const hatch = scene.createHatch(h.points, {
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: h.areaLabel,
        holes: h.holes || [],
      });
      if (h._stickerEditOwnerId) hatch._stickerEditOwnerId = h._stickerEditOwnerId;
    }
    for (const w of data.walls || []) {
      const wall = scene.createWall({
        kind: w.kind === "inner" ? "inner" : "outer",
        thicknessM: w.thicknessM,
        referenceSide: w.referenceSide === "inner" ? "inner" : w.referenceSide === "center" ? "center" : "outer",
        corners: w.corners || [],
        hiddenCornerIndices: Array.isArray(w.hiddenCornerIndices) ? w.hiddenCornerIndices : [],
        cornerAnchors: Array.isArray(w.cornerAnchors) ? w.cornerAnchors : undefined,

        customName: w.customName || "",
        color: w.color,
        fillColor: w.fillColor,
        labelId: w.labelId,
        priority: w.priority,
      });
      if (w.id) (wall as any).id = w.id;
      if (w._stickerEditOwnerId) wall._stickerEditOwnerId = w._stickerEditOwnerId;
    }
    for (const d of data.dimensions || []) {
      const dim = scene.createDimension(d.p1, d.p2, d.placementPoint, d.mode, d.refDir, {
        textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
        decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
        useFreeText: d.useFreeText, freeText: d.freeText,
        textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
        extensionStyle: d.extensionStyle, extensionColor: d.extensionColor, extensionAlpha: d.extensionAlpha,
        freeTextBold: d.freeTextBold, freeTextItalic: d.freeTextItalic, freeTextColor: d.freeTextColor,
        textGapPx: d.textGapPx, doorHeightText: d.doorHeightText,
        mirror: !!d.mirror,
        labelId: d.labelId,
      }, d.doorRefId || null);
      if (d._stickerEditOwnerId) dim._stickerEditOwnerId = d._stickerEditOwnerId;
    }

    for (const t of data.textBoxes || []) {
      const box = scene.createTextBox(t.center, t.widthM, t.heightM, { ...(t.style || {}), labelId: t.labelId }, t.html || "", t.rotationRad || 0);
      if (t._stickerEditOwnerId) box._stickerEditOwnerId = t._stickerEditOwnerId;
    }
    if (Array.isArray(data.stickerInstances)) {
      for (const si of data.stickerInstances) {
        const inst = scene.createStickerInstance({
          defId: si.defId, name: si.name, items: si.items,
          position: si.position, rotationRad: si.rotationRad || 0,
          scale: si.scale || 1, labelId: si.labelId,
        });
        if (si.id) (inst as any).id = si.id;
      }
      (scene as any)._rebuildStickerIdMap?.();
    }
    for (const d of data.documents || []) {
      const doc = scene.createDocument({
        name: d.name, kind: d.kind, src: d.src, pageIndex: d.pageIndex,
        position: d.position, widthM: d.widthM, heightM: d.heightM, rotationRad: d.rotationRad,
        pixelWidth: d.pixelWidth, pixelHeight: d.pixelHeight, labelId: d.labelId,
        eraseMaskDataUrl: d.eraseMaskDataUrl || null,
        pdfSourceB64: d.pdfSourceB64 || null,
        guideEdges: d.guideEdges || undefined,
        cropM: (d as any).cropM || undefined,
        opacity: typeof d.opacity === "number" ? d.opacity : undefined,
        filters: Array.isArray(d.filters) ? d.filters : undefined,
        activeFilterId: d.activeFilterId || null,
        bgRemoval: d.bgRemoval || undefined,
        anchors: Array.isArray(d.anchors) ? d.anchors : undefined,
        warpCorners: Array.isArray((d as any).warpCorners) ? (d as any).warpCorners : null,
        flipX: !!(d as any).flipX,
        flipY: !!(d as any).flipY,
      });
      if (d.id) (doc as any).id = d.id;
    }
    (scene as any)._rebuildDocIdMap?.();
    for (const d of data.doors || []) {
      const door = scene.createDoor({
        wallId: d.wallId, posM: d.posM, widthM: d.widthM, heightM: d.heightM,
        breakHeightM: d.breakHeightM,
        breakHeightVisible: !!d.breakHeightVisible,
        kind: d.kind,
        side: d.side, hand: d.hand, edge: d.edge, color: d.color,
        jambEnabled: d.jambEnabled, jambColor: d.jambColor, jambLenM: d.jambLenM, jambThickM: d.jambThickM,
        sashEnabled: d.sashEnabled, glassColor: d.glassColor, glassThickM: d.glassThickM, glassFillColor: d.glassFillColor,
        labelId: d.labelId,
      });
      if (d.id) (door as any).id = d.id;
    }

  }

  private _serializeScene(): string {
    const scenesObj: Record<string, any> = {};
    for (const [id, sc] of this.scenesById.entries()) {
      scenesObj[id] = this._serializeOneScene(sc);
    }
    return JSON.stringify({
      // Backwards-compat: aktive Scene flach.
      ...this._serializeOneScene(this.scene),
      labels: this.labelManager.list().map(l => ({ ...l })),
      stickers: this.stickers.map(s => ({ id: s.id, name: s.name, items: s.items, createdAt: s.createdAt })),
      _stickerEditInstanceId: this._stickerEditInstanceId,
      _stickerEditSnapshot: this._stickerEditSnapshot,
      // Multi-Sheet-State
      sheets: this.sheetManager.toJSON(),
      activeSheetId: this.activeSheetId,
      sheetOverlays: this.sheetOverlayStore.toJSON(),
      scenesById: scenesObj,
      // Druckpläne
      plans: this.planManager.toJSON(),
      activePlanId: this.activePlanId,
      planScenesById: (() => {
        const out: Record<string, any> = {};
        for (const [id, sc] of this.planScenesById.entries()) {
          out[id] = this._serializeOneScene(sc);
        }
        return out;
      })(),
      planOverlays: this.planOverlayStore.toJSON(),
    });
  }

  private _restoreScene(snapshot: string) {
    const data = JSON.parse(snapshot);
    this._isRestoring = true;
    // Restore labels first
    if (Array.isArray(data.labels) && (this.labelManager as any).restore) {
      try { (this.labelManager as any).restore(data.labels); } catch {}
    }
    // Restore stickers
    if (Array.isArray(data.stickers)) {
      this.stickers = data.stickers.map((s: any) => ({
        id: s.id, name: s.name, items: s.items, createdAt: s.createdAt || Date.now(),
      }));
      this.onStickersChange?.();
    }
    // Restore sheets list (falls vorhanden).
    if (Array.isArray(data.sheets)) {
      this.sheetManager.restore(data.sheets);
    }
    if (data.sheetOverlays && typeof data.sheetOverlays === "object") {
      this.sheetOverlayStore.restore(data.sheetOverlays);
    }
    // Druckpläne wiederherstellen.
    if (Array.isArray(data.plans)) {
      this.planManager.restore(data.plans);
    } else {
      this.planManager.restore([]);
    }
    // PlanController-Cache invalidieren (Snapshot-Items neu flatten).
    this.planController?.invalidateCache();
    // Plan-Annotation-Scenes wiederherstellen.
    this._syncPlanSceneMap();
    if (data.planScenesById && typeof data.planScenesById === "object") {
      for (const planId of [...this.planScenesById.keys()]) {
        const sc = this.planScenesById.get(planId)!;
        this._restoreOneScene(sc, data.planScenesById[planId] || null);
      }
    } else {
      // Keine Daten → alle Plan-Scenes leeren.
      for (const sc of this.planScenesById.values()) {
        this._restoreOneScene(sc, null);
      }
    }
    if (data.planOverlays && typeof data.planOverlays === "object") {
      this.planOverlayStore.restore(data.planOverlays);
    }
    if (data.scenesById && typeof data.scenesById === "object") {
      // Map auf gültige Sheet-Liste reduzieren / ergänzen.
      const validIds = new Set(this.sheetManager.list().map(s => s.id));
      // Verwaiste Scenes löschen.
      for (const id of [...this.scenesById.keys()]) {
        if (!validIds.has(id) && id !== SheetDefaults.defaultSheetId) this.scenesById.delete(id);
      }
      for (const id of validIds) {
        let sc = this.scenesById.get(id);
        if (!sc) {
          sc = new Scene();
          (sc as any)._drawingScaleRef = () => this.drawingScale;
          this.scenesById.set(id, sc);
        }
        this._restoreOneScene(sc, data.scenesById[id] || null);
      }
    } else {
      // Backwards-compat: nur aktive Scene aus flachen Feldern wiederherstellen.
      this._restoreOneScene(this.scene, data);
    }
    // Aktives Sheet wiederherstellen.
    const nextActive = (typeof data.activeSheetId === "string" && this.sheetManager.getById(data.activeSheetId))
      ? data.activeSheetId
      : SheetDefaults.defaultSheetId;
    this.activeSheetId = nextActive;
    const activeScene = this.scenesById.get(nextActive);
    if (activeScene) {
      this.scene = activeScene;
      this.renderer.scene = activeScene;
      this.topology.scene = activeScene;
    }
    // Restore Sticker-Edit-Mode
    this._stickerEditInstanceId = data._stickerEditInstanceId || null;
    this._stickerEditSnapshot = data._stickerEditSnapshot || null;
    this.clearSelection();
    this.setSelectedLabelId(null);
    this.pointEditMenu.hide();
    this._syncOverlayScenes();
    this.refreshLabelUI();
    this.refreshSheetUI();
    // Aktiven Plan wiederherstellen (löst auch Plan-Modus-Renderer-Sync aus).
    const restoredPlanId = (typeof data.activePlanId === "string" && this.planManager.getById(data.activePlanId))
      ? data.activePlanId : null;
    this.activePlanId = restoredPlanId;
    this._applyPlanModeToRenderer();
    this.refreshPlanUI();
    this._lastSnapshot = this._serializeScene();
    this._isRestoring = false;
  }

  private _initHistory() {
    this._lastSnapshot = this._serializeScene();
    this._history = [this._lastSnapshot];
    this._historyIndex = 0;
    this._emitHistoryChange();
    // Poll for scene changes (cheap: short string compare on JSON)
    this._snapshotTimer = window.setInterval(() => this._maybeSnapshot(), 250);
  }

  private _maybeSnapshot() {
    if (this._isRestoring || this._destroyed) return;
    // Don't snapshot mid-drag
    if (this.input.mouse.left || this.input.mouse.mid || this.input.mouse.right || this.input.isPanning) return;
    // Don't snapshot during an active point edit (Bewegen/Verschieben/Drehen/Offset),
    // damit Undo den gesamten Edit als einen Schritt zurücknimmt.
    if (this.selectTool && this.selectTool.isEditing()) return;

    const snap = this._serializeScene();
    if (snap === this._lastSnapshot) return;
    // Drop redo branch
    if (this._historyIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
    }
    this._history.push(snap);
    if (this._history.length > this._historyMax) this._history.shift();
    this._historyIndex = this._history.length - 1;
    this._lastSnapshot = snap;
    this._emitHistoryChange();
  }

  /** Erzwingt einen History-Push der aktuellen Scene (für Plan-Operationen). */
  commitHistorySnapshot() {
    if (this._isRestoring || this._destroyed) return;
    const snap = this._serializeScene();
    if (snap === this._lastSnapshot) return;
    if (this._historyIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
    }
    this._history.push(snap);
    if (this._history.length > this._historyMax) this._history.shift();
    this._historyIndex = this._history.length - 1;
    this._lastSnapshot = snap;
    this._emitHistoryChange();
  }

  private _emitHistoryChange() {
    this.onHistoryChange?.(this._historyIndex > 0, this._historyIndex < this._history.length - 1);
  }

  undo() {
    this._maybeSnapshot();
    if (this._historyIndex <= 0) return;
    this._historyIndex--;
    this._restoreScene(this._history[this._historyIndex]);
    this._emitHistoryChange();
  }

  redo() {
    if (this._historyIndex >= this._history.length - 1) return;
    this._historyIndex++;
    this._restoreScene(this._history[this._historyIndex]);
    this._emitHistoryChange();
  }

  /* ---- Selection ---- */
  setSelection(selection: Selection | null) {
    // Hintergrund-Ausschnitt-Interaktion beenden, sobald die Auswahl das
    // zugehörige Dokument verlässt (oder komplett verschwindet). So kann der
    // User das Bild frei an- und abwählen, ohne dass jeder Klick weiter malt.
    if (this.bgRemoveInteraction) {
      const stillOnSameDoc = !!selection
        && (selection as any).type === "document"
        && (selection as any).documentId === this.bgRemoveInteraction.docId;
      if (!stillOnSameDoc) this.bgRemoveInteraction = null;
    }
    this.selection = selection;
    this.renderer.setSelection(selection);
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this._updateSettingsVisibility();
    this._syncStickerInstanceHub();
    this.onSelectionChange?.();
  }

  clearSelection() { this.setSelection(null); }

  /** True, wenn eine Löschung per Entf-Taste etwas entfernen würde. */
  hasDeletableSelection(): boolean {
    if (this.activePlanId && (this.planController as any)?.hasSelection?.()) return true;
    if (this.activeTool === this.selectTool && this.selectTool.marqueeSelectedIds.length > 0) return true;
    if (this.selection) return true;
    if (this.selectedLabelId) return true;
    return false;
  }

  /** Programmgesteuertes Löschen der aktuellen Auswahl — identisches Verhalten
   *  wie die Entf/Backspace-Taste. */
  deleteSelection(): boolean {
    const ev = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
    try { Object.defineProperty(ev, "target", { value: document.body }); } catch {}
    window.dispatchEvent(ev);
    return true;
  }

  getSelectedSegment() {
    if (!this.selection || !this.selection.segmentId) return null;
    return this.scene.getSegmentById(this.selection.segmentId);
  }

  getSelectedHatch() {
    if (!this.selection || !this.selection.hatchId) return null;
    return this.scene.getHatchById(this.selection.hatchId);
  }

  getSelectedDimension() {
    if (!this.selection || this.selection.type !== SelectionType.DIMENSION) return null;
    return this.scene.getDimensionById((this.selection as any).dimensionId);
  }

  getSelectedTextBox(): TextBox | null {
    if (!this.selection) return null;
    if (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE) return null;
    const id = (this.selection as any).textBoxId;
    if (!id) return null;
    return this.scene.getTextBoxById(id);
  }

  getSelectedStickerInstance() {
    if (!this.selection || this.selection.type !== SelectionType.STICKER_INSTANCE) return null;
    return this.scene.getStickerInstanceById((this.selection as any).stickerInstanceId);
  }

  getSelectedWall() {
    if (!this.selection) return null;
    const wallId = (this.selection as any).wallId;
    if (!wallId) return null;
    return this.scene.getWallById(wallId);
  }

  getSelectedFreeStroke() {
    if (!this.selection || this.selection.type !== SelectionType.FREE_STROKE) return null;
    return this.scene.getFreeStrokeById((this.selection as any).freeStrokeId);
  }

  /* ===== Sticker Edit Mode ("Ghost Scene") ===== */
  isStickerEditing(): boolean { return !!this._stickerEditInstanceId; }
  getStickerEditInstanceId(): string | null { return this._stickerEditInstanceId; }
  getStickerEditSnapshot() { return this._stickerEditSnapshot; }

  /** Materialisiert die Items einer Sticker-Instanz als echte Scene-Objekte (World-Space) und entfernt die Instanz. */
  enterStickerEdit(inst: { id: string; name: string; defId: string | null; labelId: string; position: Vec2; rotationRad: number; scale: number; items: any[] }) {
    if (this._stickerEditInstanceId) return; // schon im Edit
    const editId = inst.id;
    this._stickerEditInstanceId = editId;
    this._stickerEditSnapshot = {
      name: inst.name, defId: inst.defId, labelId: inst.labelId,
      position: { x: inst.position.x, y: inst.position.y },
      rotationRad: inst.rotationRad, scale: inst.scale,
    };

    // Items in World-Space transformieren und als echte Scene-Objekte materialisieren.
    const worldItems = transformedInstanceItems(inst.items as any, inst.position, inst.rotationRad, inst.scale);
    this.scene._currentEditOwnerId = editId;
    try {
      for (const it of worldItems) {
        if (it.kind === "segment") {
          this.scene.createSegment(it.a, it.b, { color: it.color, thicknessM: it.thicknessM, labelId: it.labelId });
        } else if (it.kind === "hatch") {
          this.scene.createHatch(it.points, {
            fillColor: it.fillColor, strokeColor: it.strokeColor,
            fillAlphaPct: it.fillAlphaPct, strokeWidthPx: it.strokeWidthPx,
            labelId: it.labelId, areaLabel: it.areaLabel,
          });
        } else if (it.kind === "dimension") {
          this.scene.createDimension(it.p1, it.p2, it.placementPoint, it.mode, it.refDir, {
            textColor: it.textColor, textSizePx: it.textSizePx, lineColor: it.lineColor,
            decimals: it.decimals, tickLengthM: it.tickLengthM, showExtensions: it.showExtensions,
            useFreeText: it.useFreeText, freeText: it.freeText,
            textBgEnabled: it.textBgEnabled, textBgColor: it.textBgColor, textBgAlpha: it.textBgAlpha,
            labelId: it.labelId,
          });
        } else if (it.kind === "wall") {
          this.scene.createWall({
            kind: it.wallKind as any, thicknessM: it.thicknessM,
            referenceSide: it.referenceSide as any,
            corners: it.corners, color: it.color, fillColor: it.fillColor,
            priority: it.priority, labelId: it.labelId,
          });
        } else if (it.kind === "textbox") {
          this.scene.createTextBox(it.center, it.widthM, it.heightM, { ...(it.style || {}), labelId: it.labelId }, it.html || "", it.rotationRad || 0);
        }
      }
    } finally {
      this.scene._currentEditOwnerId = null;
    }

    // Original-Instanz aus Scene entfernen (sie lebt nun als Ghost-Objekte).
    const original = this.scene.getStickerInstanceById(editId);
    if (original) this.scene.removeStickerInstance(original);

    this.clearSelection();
    this.pointEditMenu.hide();
    this.refreshLabelUI();
    // Snapshot direkt nach Enter, damit Undo den Edit-Mode nicht zerschießt.
    this._lastSnapshot = this._serializeScene();
  }

  /** Sammelt alle Owner-Objekte, transformiert sie zurück in lokale Items und erzeugt eine neue Sticker-Instanz. */
  exitStickerEdit() {
    const editId = this._stickerEditInstanceId;
    const snap = this._stickerEditSnapshot;
    if (!editId || !snap) return;

    // Sammle alle Owner-Objekte
    const ownedSegs = this.scene.segments.filter(s => s._stickerEditOwnerId === editId);
    const ownedHatches = this.scene.hatches.filter(h => h._stickerEditOwnerId === editId);
    const ownedDims = this.scene.dimensions.filter(d => d._stickerEditOwnerId === editId);
    const ownedTexts = this.scene.textBoxes.filter(t => t._stickerEditOwnerId === editId);
    const ownedWalls = this.scene.walls.filter(w => w._stickerEditOwnerId === editId);

    // Wenn alles gelöscht wurde: Edit-Mode beenden, Instanz nicht wiederherstellen.
    const totalCount = ownedSegs.length + ownedHatches.length + ownedDims.length + ownedTexts.length + ownedWalls.length;
    if (totalCount === 0) {
      this._stickerEditInstanceId = null;
      this._stickerEditSnapshot = null;
      this._lastSnapshot = this._serializeScene();
      return;
    }

    // Berechne neue Center (Centroid der Owner-Objekte in World-Space).
    let sx = 0, sy = 0, n = 0;
    for (const s of ownedSegs) { sx += (s.a.x + s.b.x) / 2; sy += (s.a.y + s.b.y) / 2; n++; }
    for (const h of ownedHatches) {
      let cx = 0, cy = 0;
      for (const p of h.points) { cx += p.x; cy += p.y; }
      sx += cx / h.points.length; sy += cy / h.points.length; n++;
    }
    for (const d of ownedDims) { sx += (d.p1.x + d.p2.x) / 2; sy += (d.p1.y + d.p2.y) / 2; n++; }
    for (const t of ownedTexts) { sx += t.center.x; sy += t.center.y; n++; }
    for (const w of ownedWalls) {
      let cx = 0, cy = 0;
      for (const p of w.corners) { cx += p.x; cy += p.y; }
      sx += cx / w.corners.length; sy += cy / w.corners.length; n++;
    }
    const newPos = (n > 0) ? { x: sx / n, y: sy / n } : { x: snap.position.x, y: snap.position.y };

    // Neue Items in lokalen Koordinaten = Translation zurück um newPos (Rotation/Scale = identity, da User die Geometrie direkt bearbeitet hat).
    const newItems: any[] = [];
    for (const s of ownedSegs) {
      newItems.push({
        kind: "segment",
        a: { x: s.a.x - newPos.x, y: s.a.y - newPos.y },
        b: { x: s.b.x - newPos.x, y: s.b.y - newPos.y },
        color: s.color, thicknessM: s.thicknessM, labelId: s.labelId,
      });
    }
    for (const h of ownedHatches) {
      newItems.push({
        kind: "hatch",
        points: h.points.map(p => ({ x: p.x - newPos.x, y: p.y - newPos.y })),
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: { ...h.areaLabel },
      });
    }
    for (const d of ownedDims) {
      newItems.push({
        kind: "dimension",
        p1: { x: d.p1.x - newPos.x, y: d.p1.y - newPos.y },
        p2: { x: d.p2.x - newPos.x, y: d.p2.y - newPos.y },
        placementPoint: { x: d.placementPoint.x - newPos.x, y: d.placementPoint.y - newPos.y },
        mode: d.mode, refDir: d.refDir ? { x: d.refDir.x, y: d.refDir.y } : null,
        textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
        decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
        useFreeText: d.useFreeText, freeText: d.freeText,
        textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
        labelId: d.labelId,
      });
    }
    for (const t of ownedTexts) {
      newItems.push({
        kind: "textbox",
        center: { x: t.center.x - newPos.x, y: t.center.y - newPos.y },
        widthM: t.widthM, heightM: t.heightM, rotationRad: t.rotationRad,
        html: t.html, style: { ...t.style }, labelId: t.labelId,
      });
    }

    for (const w of ownedWalls) {
      newItems.push({
        kind: "wall",
        corners: w.corners.map(p => ({ x: p.x - newPos.x, y: p.y - newPos.y })),
        wallKind: w.kind, thicknessM: w.thicknessM, referenceSide: w.referenceSide,
        color: w.color, fillColor: w.fillColor, priority: w.priority, labelId: w.labelId,
      });
    }

    // Owner-Objekte aus Scene entfernen.
    for (const w of ownedWalls) this.scene.removeWall(w);
    this.scene.removeSegmentsByIds(ownedSegs.map(s => s.id));
    this.scene.removeHatchesByIds(ownedHatches.map(h => h.id));
    this.scene.removeDimensionsByIds(ownedDims.map(d => d.id));
    this.scene.removeTextBoxesByIds(ownedTexts.map(t => t.id));

    // Neue Sticker-Instanz mit identischer ID anlegen — wir stellen die alte ID wieder her,
    // indem wir createStickerInstance aufrufen und die ID anschließend überschreiben.
    const newInst = this.scene.createStickerInstance({
      defId: snap.defId, name: snap.name, items: newItems,
      position: newPos, rotationRad: 0, scale: 1, labelId: snap.labelId,
    });
    // Behalte die ursprüngliche Instanz-ID, damit Selektion + Hub konsistent bleiben.
    (newInst as any).id = editId;
    (this.scene as any)._rebuildStickerIdMap?.();

    this._stickerEditInstanceId = null;
    this._stickerEditSnapshot = null;
    this.refreshLabelUI();
    this._lastSnapshot = this._serializeScene();
  }

  /** Liefert die World-Space-AABB der aktuellen Sticker-Edit-Owner-Objekte (oder null). */
  getStickerEditWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const editId = this._stickerEditInstanceId;
    if (!editId) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const acc = (x: number, y: number) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
    for (const s of this.scene.segments) if (s._stickerEditOwnerId === editId) { acc(s.a.x, s.a.y); acc(s.b.x, s.b.y); }
    for (const h of this.scene.hatches) if (h._stickerEditOwnerId === editId) for (const p of h.points) acc(p.x, p.y);
    for (const d of this.scene.dimensions) if (d._stickerEditOwnerId === editId) { acc(d.p1.x, d.p1.y); acc(d.p2.x, d.p2.y); }
    for (const t of this.scene.textBoxes) if (t._stickerEditOwnerId === editId) {
      const w2 = t.widthM / 2, h2 = t.heightM / 2;
      acc(t.center.x - w2, t.center.y - h2); acc(t.center.x + w2, t.center.y + h2);
    }
    for (const w of this.scene.walls) if (w._stickerEditOwnerId === editId) {
      const t2 = w.thicknessM / 2;
      for (const p of w.corners) { acc(p.x - t2, p.y - t2); acc(p.x + t2, p.y + t2); }
    }
    if (!isFinite(minX)) return null;
    // Etwas Padding (Welt-Einheiten) damit "Klick außerhalb" nicht direkt am Rand triggert.
    const pad = 0.2;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  /** Prüft, ob der Mausklick außerhalb der aktuellen Edit-Bounding-Box liegt (zum Verlassen). */
  isPointOutsideStickerEdit(mouseW: Vec2): boolean {
    const b = this.getStickerEditWorldBounds();
    if (!b) return true;
    return mouseW.x < b.minX || mouseW.x > b.maxX || mouseW.y < b.minY || mouseW.y > b.maxY;
  }

  /** Public alias: Tools können den Sticker-Hub nach Live-Updates (Drag) refreshen. */
  syncStickerInstanceHub() { this._syncStickerInstanceHub(); }

  /** Hub für Sticker-Instanz: Länge = Skalierung %, Winkel = Rotation °. */
  private _syncStickerInstanceHub() {
    const inst = this.getSelectedStickerInstance();
    if (!inst) {
      // Hub nur ausblenden, wenn er gerade als Sticker-Hub aktiv war
      if ((this.hub as any)._stickerMode) {
        this.hub.hide();
        this.hub.bindCommit(null);
        (this.hub as any)._stickerMode = false;
      }
      return;
    }
    (this.hub as any)._stickerMode = true;
    const corners = instanceBoundingCornersWorld(inst.items as any, inst.position, inst.rotationRad, inst.scale);
    let cx = 0, cy = 0;
    for (const c of corners) { cx += c.x; cy += c.y; }
    cx /= corners.length; cy /= corners.length;
    const screen = this.camera.worldToScreen(cx, cy);
    this.hub.showAt(screen.x, screen.y);
    // Inputs editierbar machen, damit der User Werte eintippen kann
    this.hub.enterEditMode();
    const scalePct = inst.scale * 100;
    const rotDeg = (inst.rotationRad * 180 / Math.PI + 360) % 360;
    // Aktuell fokussiertes Input NICHT überschreiben (sonst kann man nicht tippen)
    if (document.activeElement !== this.hub.lenInputEl) {
      this.hub.lenInputEl.value = `${scalePct.toFixed(1)} %`;
    }
    if (document.activeElement !== this.hub.angInputEl) {
      this.hub.angInputEl.value = `${rotDeg.toFixed(1)}°`;
    }
    this.hub.bindCommit(() => {
      const cur = this.getSelectedStickerInstance();
      if (!cur) return;
      // lenInput hier als Skalierung in % interpretiert
      const rawLen = parseFloat(this.hub.lenInputEl.value);
      const rawAng = parseFloat(this.hub.angInputEl.value);
      if (Number.isFinite(rawLen) && rawLen > 0) cur.scale = rawLen / 100;
      if (Number.isFinite(rawAng)) cur.rotationRad = rawAng * Math.PI / 180;
      this._syncStickerInstanceHub();
    });
  }


  /* ---- Label Selection ---- */
  setSelectedLabelId(labelId: string | null) {
    this.selectedLabelId = labelId || null;
    this.renderer.setSelectedLabelId(this.selectedLabelId);
    this.idPanel.render();
    this._syncLineSettingsFromContext();
    this._updateSettingsVisibility();
  }

  selectLabelGroup(labelId: string) {
    this.clearSelection();
    this.setSelectedLabelId(labelId);
    this.showLineSettingsPanel(true);
  }

  setActiveDrawLabelId(labelId: string) {
    this.activeDrawLabelId = labelId || Defaults.defaultLabelId;
    this._syncLabelSelect();
  }

  refreshLabelUI() {
    this._syncLabelSelect();
    this._syncHatchLabelSelect();
    this._syncMeasureLabelSelect();
    this._syncTextLabelSelect();
    this.idPanel.render();
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this.onLabelsChange?.();
  }

  private _syncLabelSelect() {
    const groups = this.labelManager.list();
    const currentValue = this.lineIdSelect.value;
    this.lineIdSelect.innerHTML = "";
    for (const group of groups) {
      const opt = document.createElement("option");
      opt.value = group.id;
      opt.textContent = group.name;
      this.lineIdSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(currentValue) ? currentValue : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.activeDrawLabelId = preferred;
    this.lineIdSelect.value = preferred;
  }

  private _syncHatchLabelSelect() {
    const groups = this.labelManager.list();
    const currentValue = this.hatchIdSelect.value;
    this.hatchIdSelect.innerHTML = "";
    for (const group of groups) {
      const opt = document.createElement("option");
      opt.value = group.id;
      opt.textContent = group.name;
      this.hatchIdSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(currentValue) ? currentValue : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.hatchIdSelect.value = preferred;
  }

  /* ---- Selected objects ---- */
  getSelectedObjectIds(): string[] {
    const selected = this.getSelectedSegment();
    if (selected) return [selected.id];
    if (this.selectedLabelId) return this.scene.getSegmentsByLabelId(this.selectedLabelId).map(s => s.id);
    return [];
  }

  getSelectedHatchObjectIds(): string[] {
    const selected = this.getSelectedHatch();
    if (selected) return [selected.id];
    if (this.selectedLabelId) return this.scene.getHatchesByLabelId(this.selectedLabelId).map(h => h.id);
    return [];
  }

  getSelectedGroupSegments() {
    if (!this.selectedLabelId) return [];
    return this.scene.getSegmentsByLabelId(this.selectedLabelId);
  }

  getSelectedGroupHatches() {
    if (!this.selectedLabelId) return [];
    return this.scene.getHatchesByLabelId(this.selectedLabelId);
  }

  getCurrentLineStyle() {
    const selected = this.getSelectedSegment();
    if (selected) {
      return {
        color: selected.color || this.defaultLineColor,
        thicknessM: selected.thicknessM || this.defaultLineThicknessM,
        labelId: selected.labelId || Defaults.defaultLabelId,
        arrowStart: !!selected.arrowStart,
        arrowEnd: !!selected.arrowEnd,
        arrowScale: (typeof selected.arrowScale === "number" && selected.arrowScale > 0) ? selected.arrowScale : 1,
      };
    }
    const groupSegs = this.getSelectedGroupSegments();
    if (groupSegs.length > 0) {
      const ref = groupSegs[0];
      return {
        color: ref.color || this.defaultLineColor,
        thicknessM: ref.thicknessM || this.defaultLineThicknessM,
        labelId: ref.labelId || Defaults.defaultLabelId,
        arrowStart: !!ref.arrowStart,
        arrowEnd: !!ref.arrowEnd,
        arrowScale: (typeof ref.arrowScale === "number" && ref.arrowScale > 0) ? ref.arrowScale : 1,
      };
    }
    return {
      color: this.defaultLineColor,
      thicknessM: this.defaultLineThicknessM,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
      arrowStart: this.defaultArrowStart,
      arrowEnd: this.defaultArrowEnd,
      arrowScale: this.defaultArrowScale,
    };
  }


  getCurrentHatchStyle() {
    const selected = this.getSelectedHatch();
    if (selected) {
      return {
        fillColor: selected.fillColor || this.defaultHatchFillColor,
        strokeColor: selected.strokeColor || this.defaultHatchStrokeColor,
        fillAlphaPct: selected.fillAlphaPct ?? this.defaultHatchFillAlphaPct,
        strokeWidthPx: (typeof selected.strokeWidthPx === "number") ? selected.strokeWidthPx : this.defaultHatchStrokeWidthPx,
        labelId: selected.labelId || Defaults.defaultLabelId,
        areaLabel: {
          show: !!selected.areaLabel?.show,
          textColor: selected.areaLabel?.textColor || Defaults.areaTextColor,
          fontSizePx: selected.areaLabel?.fontSizePx ?? Defaults.areaFontSizePx,
          bgColor: selected.areaLabel?.bgColor || Defaults.areaBgColor,
          bgAlphaPct: selected.areaLabel?.bgAlphaPct ?? Defaults.areaBgAlphaPct,
          offsetX: selected.areaLabel?.offsetX || 0,
          offsetY: selected.areaLabel?.offsetY || 0,
        } as Partial<AreaLabel>,
      };
    }
    const groupHatches = this.getSelectedGroupHatches();
    if (groupHatches.length > 0) {
      const ref = groupHatches[0];
      return {
        fillColor: ref.fillColor || this.defaultHatchFillColor,
        strokeColor: ref.strokeColor || this.defaultHatchStrokeColor,
        fillAlphaPct: ref.fillAlphaPct ?? this.defaultHatchFillAlphaPct,
        strokeWidthPx: (typeof ref.strokeWidthPx === "number") ? ref.strokeWidthPx : this.defaultHatchStrokeWidthPx,
        labelId: ref.labelId || Defaults.defaultLabelId,
        areaLabel: {
          show: !!ref.areaLabel?.show,
          textColor: ref.areaLabel?.textColor || Defaults.areaTextColor,
          fontSizePx: ref.areaLabel?.fontSizePx ?? Defaults.areaFontSizePx,
          bgColor: ref.areaLabel?.bgColor || Defaults.areaBgColor,
          bgAlphaPct: ref.areaLabel?.bgAlphaPct ?? Defaults.areaBgAlphaPct,
          offsetX: ref.areaLabel?.offsetX || 0,
          offsetY: ref.areaLabel?.offsetY || 0,
        } as Partial<AreaLabel>,
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
      } as Partial<AreaLabel>,
    };
  }

  getCurrentMeasureStyle(): DimensionStyle {
    const sel = (this.selection && this.selection.type === SelectionType.DIMENSION)
      ? this.scene.getDimensionById((this.selection as any).dimensionId) : null;
    if (sel) {
      return {
        textColor: sel.textColor, textSizePx: sel.textSizePx, lineColor: sel.lineColor,
        decimals: sel.decimals, tickLengthM: sel.tickLengthM, showExtensions: sel.showExtensions,
        useFreeText: sel.useFreeText, freeText: sel.freeText,
        textBgEnabled: sel.textBgEnabled, textBgColor: sel.textBgColor, textBgAlpha: sel.textBgAlpha,
        extensionStyle: sel.extensionStyle, extensionColor: sel.extensionColor, extensionAlpha: sel.extensionAlpha,
        freeTextBold: sel.freeTextBold, freeTextItalic: sel.freeTextItalic, freeTextColor: sel.freeTextColor,
        showUnit: sel.showUnit, unit: sel.unit,
        labelId: sel.labelId,
      };
    }
    return {
      textColor: this.measureSettings.textColor, textSizePx: this.measureSettings.textSizePx,
      lineColor: this.measureSettings.lineColor, decimals: this.measureSettings.decimals,
      tickLengthM: this.measureSettings.tickLengthM, showExtensions: this.measureSettings.showExtensions,
      useFreeText: this.measureSettings.useFreeText, freeText: this.measureSettings.freeText,
      textBgEnabled: this.measureSettings.textBgEnabled, textBgColor: this.measureSettings.textBgColor,
      textBgAlpha: this.measureSettings.textBgAlpha,
      extensionStyle: this.measureSettings.extensionStyle, extensionColor: this.measureSettings.extensionColor,
      extensionAlpha: this.measureSettings.extensionAlpha,
      freeTextBold: this.measureSettings.freeTextBold, freeTextItalic: this.measureSettings.freeTextItalic,
      freeTextColor: this.measureSettings.freeTextColor,
      showUnit: this.measureSettings.showUnit, unit: this.measureSettings.unit,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  showLineSettingsPanel(shouldShow: boolean) { this.lineSettingsPanel.classList.toggle("hidden", !shouldShow); }
  showHatchSettingsPanel(shouldShow: boolean) { this.hatchSettingsPanel.classList.toggle("hidden", !shouldShow); }
  showMeasureSettingsPanel(shouldShow: boolean) { this.measureRefs.panel.classList.toggle("hidden", !shouldShow); }
  showTextSettingsPanel(shouldShow: boolean) { this.textRefs.panel.classList.toggle("hidden", !shouldShow); }

  getCurrentTextStyle(): TextBoxStyle {
    const sel = this.getSelectedTextBox();
    if (sel) {
      return {
        textColor: sel.style.textColor, fontSizePx: sel.style.fontSizePx,
        bgColor: sel.style.bgColor, bgAlphaPct: sel.style.bgAlphaPct,
        wrap: sel.style.wrap, align: sel.style.align,
        borderEnabled: sel.style.borderEnabled, borderColor: sel.style.borderColor,
        borderWidthPx: sel.style.borderWidthPx,
        labelId: sel.labelId,
      };
    }
    return {
      textColor: this.defaultTextColor, fontSizePx: this.defaultTextFontSizePx,
      bgColor: this.defaultTextBgColor, bgAlphaPct: this.defaultTextBgAlphaPct,
      wrap: this.defaultTextWrap, align: this.defaultTextAlign,
      borderEnabled: this.defaultTextBorderEnabled, borderColor: this.defaultTextBorderColor,
      borderWidthPx: this.defaultTextBorderWidthPx,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  beginTextEdit(box: TextBox) {
    this.showTextSettingsPanel(true);
    this.textEditor.beginEdit(box);
  }

  private _updateSettingsVisibility() {
    const isMeasureCtx = this.activeTool === this.measureTool || !!this.getSelectedDimension();
    const isHatchCtx = this.activeTool === this.hatchTool || !!(this.selection && this.selection.hatchId);
    const isLineCtx = this.activeTool === this.lineTool || !!(this.selection && this.selection.segmentId);
    const isTextCtx = this.activeTool === this.textTool || !!this.getSelectedTextBox();
    const showLine = isLineCtx || (!!this.selectedLabelId && !isMeasureCtx && !isTextCtx);
    const showHatch = isHatchCtx || (!!this.selectedLabelId && !isMeasureCtx && !isTextCtx);
    const showMeasure = isMeasureCtx;
    const showText = isTextCtx;
    this.showLineSettingsPanel(showLine);
    this.showHatchSettingsPanel(showHatch);
    this.showMeasureSettingsPanel(showMeasure);
    this.showTextSettingsPanel(showText);
  }

  /* ---- Text Settings Panel ---- */
  private _syncTextLabelSelect() {
    if (!this.textRefs?.idSelect) return;
    const groups = this.labelManager.list();
    const cur = this.textRefs.idSelect.value;
    this.textRefs.idSelect.innerHTML = "";
    for (const g of groups) {
      const opt = document.createElement("option");
      opt.value = g.id; opt.textContent = g.name;
      this.textRefs.idSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(cur) ? cur : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.textRefs.idSelect.value = preferred;
  }

  private _setupTextSettingsPanel() {
    const r = this.textRefs;
    if (!r) return;

    r.idSelect.addEventListener("change", () => {
      const nextId = r.idSelect.value || Defaults.defaultLabelId;
      const sel = this.getSelectedTextBox();
      if (sel) { sel.labelId = nextId; this.refreshLabelUI(); return; }
      if (this.selectedLabelId) {
        const groupIds = this.scene.getTextBoxesByLabelId(this.selectedLabelId).map(t => t.id);
        if (groupIds.length > 0) {
          this.scene.assignTextBoxesToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });

    r.textColor.addEventListener("input", () => {
      const sel = this.getSelectedTextBox();
      if (sel) sel.style.textColor = r.textColor.value;
      else this.defaultTextColor = r.textColor.value;
      r.textColorPreview.style.background = r.textColor.value;
    });

    r.fontSize.addEventListener("input", () => {
      let v = parseFloat((r.fontSize.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      v = clamp(v, 6, 200);
      const sel = this.getSelectedTextBox();
      if (sel) { sel.style.fontSizePx = v; autoSizeTextBox(sel); }
      else this.defaultTextFontSizePx = v;
    });
    r.fontSize.addEventListener("blur", () => this._syncTextSettingsFromContext());

    const setAlign = (a: "left" | "center" | "right") => {
      const sel = this.getSelectedTextBox();
      if (sel) sel.style.align = a;
      else this.defaultTextAlign = a;
      this._syncTextSettingsFromContext();
    };
    r.alignLeftBtn.addEventListener("click", () => setAlign("left"));
    r.alignCenterBtn.addEventListener("click", () => setAlign("center"));
    r.alignRightBtn.addEventListener("click", () => setAlign("right"));

    r.bgColor.addEventListener("input", () => {
      const sel = this.getSelectedTextBox();
      if (sel) sel.style.bgColor = r.bgColor.value;
      else this.defaultTextBgColor = r.bgColor.value;
      this._syncTextSettingsFromContext();
    });

    r.bgAlpha.addEventListener("input", () => {
      let v = parseFloat((r.bgAlpha.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(v, 0, 100);
      const sel = this.getSelectedTextBox();
      if (sel) sel.style.bgAlphaPct = v;
      else this.defaultTextBgAlphaPct = v;
      this._syncTextSettingsFromContext();
    });

    r.wrapToggle.addEventListener("change", () => {
      const sel = this.getSelectedTextBox();
      if (sel) { sel.style.wrap = !!r.wrapToggle.checked; autoSizeTextBox(sel); }
      else this.defaultTextWrap = !!r.wrapToggle.checked;
    });

    r.borderToggle.addEventListener("change", () => {
      const v = !!r.borderToggle.checked;
      const sel = this.getSelectedTextBox();
      if (sel) sel.style.borderEnabled = v;
      else this.defaultTextBorderEnabled = v;
      r.borderGroup.classList.toggle("hidden", !v);
    });

    r.borderColor.addEventListener("input", () => {
      const sel = this.getSelectedTextBox();
      if (sel) sel.style.borderColor = r.borderColor.value;
      else this.defaultTextBorderColor = r.borderColor.value;
      r.borderColorPreview.style.background = r.borderColor.value;
    });

    r.borderWidth.addEventListener("input", () => {
      let v = parseFloat((r.borderWidth.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v < 0) return;
      v = clamp(v, 0, 30);
      const sel = this.getSelectedTextBox();
      if (sel) sel.style.borderWidthPx = v;
      else this.defaultTextBorderWidthPx = v;
    });
    r.borderWidth.addEventListener("blur", () => this._syncTextSettingsFromContext());

    this._syncTextSettingsFromContext();
  }

  private _syncTextSettingsFromContext() {
    const r = this.textRefs;
    if (!r) return;
    const s = this.getCurrentTextStyle();
    r.textColor.value = this._toHexColor(s.textColor || Defaults.textColor);
    r.textColorPreview.style.background = r.textColor.value;
    r.fontSize.value = String(Math.round(s.fontSizePx ?? Defaults.textFontSizePx));
    r.bgColor.value = this._toHexColor(s.bgColor || Defaults.textBgColor);
    r.bgColorPreview.style.background = `${r.bgColor.value}`;
    r.bgAlpha.value = String(Math.round(s.bgAlphaPct ?? Defaults.textBgAlphaPct));
    r.wrapToggle.checked = !!s.wrap;
    r.alignLeftBtn.classList.toggle("active", s.align === "left");
    r.alignCenterBtn.classList.toggle("active", s.align === "center");
    r.alignRightBtn.classList.toggle("active", s.align === "right");
    r.borderToggle.checked = !!s.borderEnabled;
    r.borderGroup.classList.toggle("hidden", !s.borderEnabled);
    r.borderColor.value = this._toHexColor(s.borderColor || Defaults.textBorderColor);
    r.borderColorPreview.style.background = r.borderColor.value;
    r.borderWidth.value = String((s.borderWidthPx ?? Defaults.textBorderWidthPx).toFixed(1).replace(/\.0$/, ""));
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (s.labelId && this.labelManager.getById(s.labelId)) ? s.labelId
        : (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    r.idSelect.value = labelForDisplay;
  }

  /* ---- Line Settings Panel ---- */
  private _setupLineSettingsPanel() {
    this.lineIdSelect.addEventListener("change", () => {
      const nextId = this.lineIdSelect.value || Defaults.defaultLabelId;
      // Einzel-Objekt-Auswahl: nur dieses Objekt umhängen, keine Gruppen-Selektion auslösen.
      const singleSel = this.getSelectedSegment();
      if (singleSel) {
        this.scene.assignSegmentsToLabel([singleSel.id], nextId);
        singleSel.labelId = nextId;
        this.refreshLabelUI();
        return;
      }
      // Gruppen-Auswahl (über IdPanel-Klick) → ganze Gruppe umhängen.
      if (this.selectedLabelId) {
        const groupIds = this.scene.getSegmentsByLabelId(this.selectedLabelId).map(s => s.id);
        if (groupIds.length > 0) {
          this.scene.assignSegmentsToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });
    this.lineColorInput.addEventListener("input", () => this._applyLineColor(this.lineColorInput.value));
    this.lineThicknessInput.addEventListener("input", () => this._applyLineThicknessFromInput());
    this.lineThicknessInput.addEventListener("blur", () => this._syncLineSettingsFromContext());
    this._syncLineSettingsFromContext();
  }

  private _applyLineColor(color: string) {
    const selected = this.getSelectedSegment();
    if (selected) { selected.color = color; }
    else {
      const groupSegs = this.getSelectedGroupSegments();
      if (groupSegs.length > 0) { for (const seg of groupSegs) seg.color = color; }
      else { this.defaultLineColor = color; }
    }
    this._syncLineSettingsFromContext();
  }

  private _applyLineThicknessFromInput() {
    let value = parseFloat((this.lineThicknessInput.value || "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    value = clamp(value, 0.001, 1);
    const selected = this.getSelectedSegment();
    if (selected) { selected.thicknessM = value; return; }
    const groupSegs = this.getSelectedGroupSegments();
    if (groupSegs.length > 0) { for (const seg of groupSegs) seg.thicknessM = value; return; }
    this.defaultLineThicknessM = value;
  }

  private _syncLineSettingsFromContext() {
    const style = this.getCurrentLineStyle();
    this.lineColorInput.value = this._toHexColor(style.color || Defaults.lineColor);
    this.lineColorPreview.style.background = this.lineColorInput.value;
    this.lineThicknessInput.value = String((style.thicknessM || Defaults.lineThicknessM).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (style.labelId || this.activeDrawLabelId || Defaults.defaultLabelId);
    if (this.labelManager.getById(labelForDisplay)) this.lineIdSelect.value = labelForDisplay;
    else this.lineIdSelect.value = Defaults.defaultLabelId;
  }

  /* ---- Hatch Settings Panel ---- */
  private _setupHatchSettingsPanel() {
    this.hatchIdSelect.addEventListener("change", () => {
      const nextId = this.hatchIdSelect.value || Defaults.defaultLabelId;
      const singleSel = this.getSelectedHatch();
      if (singleSel) {
        this.scene.assignHatchesToLabel([singleSel.id], nextId);
        singleSel.labelId = nextId;
        this.refreshLabelUI();
        return;
      }
      if (this.selectedLabelId) {
        const groupIds = this.scene.getHatchesByLabelId(this.selectedLabelId).map(h => h.id);
        if (groupIds.length > 0) {
          this.scene.assignHatchesToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });
    this.hatchFillColorInput.addEventListener("input", () => {
      const sel = this.getSelectedHatch();
      if (sel) sel.fillColor = this.hatchFillColorInput.value;
      else this.defaultHatchFillColor = this.hatchFillColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.hatchStrokeColorInput.addEventListener("input", () => {
      const sel = this.getSelectedHatch();
      if (sel) sel.strokeColor = this.hatchStrokeColorInput.value;
      else this.defaultHatchStrokeColor = this.hatchStrokeColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.hatchStrokeWidthInput.addEventListener("input", () => {
      let v = parseFloat((this.hatchStrokeWidthInput.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v < 0) return;
      v = clamp(v, 0, 30);
      const sel = this.getSelectedHatch();
      if (sel) sel.strokeWidthPx = v; else this.defaultHatchStrokeWidthPx = v;
    });
    this.hatchStrokeWidthInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());
    this.hatchAlphaInput.addEventListener("input", () => {
      let v = parseFloat((this.hatchAlphaInput.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(v, 0, 100);
      const sel = this.getSelectedHatch();
      if (sel) sel.fillAlphaPct = v; else this.defaultHatchFillAlphaPct = v;
    });
    this.hatchAlphaInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());
    this.areaShowInput.addEventListener("change", () => {
      const checked = !!this.areaShowInput.checked;
      // Persist als Default für neue Schraffuren
      this.defaultAreaShow = checked;
      const sel = this.getSelectedHatch();
      if (sel) {
        sel.areaLabel.show = checked;
      } else {
        // Keine Auswahl → auf alle bestehenden Schraffuren anwenden
        for (const h of this.scene.hatches) h.areaLabel.show = checked;
      }
      this._syncHatchSettingsFromContext();
    });
    this.areaTextColorInput.addEventListener("input", () => {
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.textColor = this.areaTextColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.areaFontSizeInput.addEventListener("input", () => {
      let v = parseFloat((this.areaFontSizeInput.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      v = clamp(v, 6, 72);
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.fontSizePx = v;
    });
    this.areaFontSizeInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());
    this.areaBgColorInput.addEventListener("input", () => {
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.bgColor = this.areaBgColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.areaBgAlphaInput.addEventListener("input", () => {
      let v = parseFloat((this.areaBgAlphaInput.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(v, 0, 100);
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.bgAlphaPct = v;
    });
    this.areaBgAlphaInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());

    // Border (Rahmen) für Flächenanzeige
    const borderToggle = document.getElementById("cad-area-border") as HTMLInputElement | null;
    const borderColor = document.querySelector<HTMLInputElement>("[data-area-border-color]");
    const borderWidth = document.querySelector<HTMLInputElement>("[data-area-border-width]");
    const borderPreview = document.querySelector<HTMLDivElement>("[data-area-border-preview]");
    const borderGroup = document.querySelector<HTMLDivElement>("[data-area-border-group]");
    const syncBorderUI = () => {
      const sel = this.getSelectedHatch();
      const enabled = sel ? !!sel.areaLabel.borderEnabled : this.defaultAreaBorderEnabled;
      const col = sel ? sel.areaLabel.borderColor : this.defaultAreaBorderColor;
      const wpx = sel ? sel.areaLabel.borderWidthPx : this.defaultAreaBorderWidthPx;
      if (borderToggle) borderToggle.checked = enabled;
      if (borderGroup) borderGroup.classList.toggle("hidden", !enabled);
      if (borderColor) borderColor.value = this._toHexColor(col);
      if (borderPreview) borderPreview.style.background = this._toHexColor(col);
      if (borderWidth) borderWidth.value = String(wpx);
    };
    borderToggle?.addEventListener("change", () => {
      const checked = !!borderToggle.checked;
      this.defaultAreaBorderEnabled = checked;
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.borderEnabled = checked;
      else for (const h of this.scene.hatches) h.areaLabel.borderEnabled = checked;
      syncBorderUI();
    });
    borderColor?.addEventListener("input", () => {
      const c = borderColor.value;
      this.defaultAreaBorderColor = c;
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.borderColor = c;
      if (borderPreview) borderPreview.style.background = c;
    });
    borderWidth?.addEventListener("input", () => {
      let w = parseFloat((borderWidth.value || "").replace(",", "."));
      if (!Number.isFinite(w)) return;
      w = clamp(w, 0, 20);
      this.defaultAreaBorderWidthPx = w;
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.borderWidthPx = w;
    });
    // Hook in den bestehenden Sync-Pfad: nach jedem _syncHatchSettingsFromContext aktualisieren
    const origSync = this._syncHatchSettingsFromContext.bind(this);
    this._syncHatchSettingsFromContext = () => { origSync(); syncBorderUI(); };

    this._syncHatchSettingsFromContext();
  }

  private _syncHatchSettingsFromContext() {
    const style = this.getCurrentHatchStyle();
    this.hatchFillColorInput.value = this._toHexColor(style.fillColor);
    this.hatchFillColorPreview.style.background = `rgba(77,163,255,${(style.fillAlphaPct ?? 35) / 100})`;
    this.hatchStrokeColorInput.value = this._toHexColor(style.strokeColor);
    this.hatchStrokeColorPreview.style.background = this.hatchStrokeColorInput.value;
    this.hatchStrokeWidthInput.value = String((style.strokeWidthPx ?? Defaults.hatchStrokePx).toFixed(1).replace(/\.0$/, ""));
    this.hatchAlphaInput.value = String(Math.round(style.fillAlphaPct ?? Defaults.hatchFillAlphaPct));
    const area = style.areaLabel;
    this.areaShowInput.checked = !!area?.show;
    this.areaSettingsGroup.classList.toggle("hidden", !this.areaShowInput.checked);
    this.areaTextColorInput.value = this._toHexColor(area?.textColor || Defaults.areaTextColor);
    this.areaTextColorPreview.style.background = this.areaTextColorInput.value;
    this.areaFontSizeInput.value = String(Math.round(area?.fontSizePx ?? Defaults.areaFontSizePx));
    this.areaBgColorInput.value = this._toHexColor(area?.bgColor || Defaults.areaBgColor);
    this.areaBgColorPreview.style.background = this.areaBgColorInput.value;
    this.areaBgAlphaInput.value = String(Math.round(area?.bgAlphaPct ?? Defaults.areaBgAlphaPct));
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (style.labelId || this.activeDrawLabelId || Defaults.defaultLabelId);
    if (this.labelManager.getById(labelForDisplay)) this.hatchIdSelect.value = labelForDisplay;
    else this.hatchIdSelect.value = Defaults.defaultLabelId;
  }

  private _toHexColor(color: string): string {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    if (computed.startsWith("#")) return computed;
    const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!m) return "#111111";
    const r = Number(m[1]).toString(16).padStart(2, "0");
    const g = Number(m[2]).toString(16).padStart(2, "0");
    const b = Number(m[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  /* ---- Shortcuts ---- */
  private _setupShortcuts() {
    this._keydownHandler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      const isHubInput = document.activeElement === this.hub.lenInputEl || document.activeElement === this.hub.angInputEl;

      // Undo / Redo (also work while inputs focused except hub)
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
        if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); this.redo(); return; }
      }

      if ((tag === "input" || tag === "textarea" || tag === "select") && !isHubInput) return;

      // Copy / Paste — Shift+C / Shift+V (zusätzlich zu Strg+C/V)
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "c" && this.copySelection()) { e.preventDefault(); return; }
        if (k === "v" && this.startPastePreview()) { e.preventDefault(); return; }
      }

      // Copy / Paste (after early-return for inputs)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === "c") {
          if (this.copySelection()) { e.preventDefault(); return; }
        }
        if (k === "v") {
          if (this.startPastePreview()) { e.preventDefault(); return; }
        }
      }

      if (this.activeTool === this.selectTool) {
        if (e.key === "Tab" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.cyclePointMenu(); return; }
        if (e.key === "Enter" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.activatePointMenu(); return; }
      }

      if (e.key === "Tab") {
        if (this.activeTool === this.lineTool) { const h = this.lineTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
        if (this.activeTool === this.hatchTool) { const h = this.hatchTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
        if (this.activeTool === this.wallTool) { const h = this.wallTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
      }

      if (e.key === "Enter" && this.activeTool === this.hatchTool && !isHubInput) {
        if (this.hatchTool.drawMode === "circle" && this.hatchTool.circleState === "arc") {
          e.preventDefault();
          this.hatchTool.finishCircleFromKey();
          return;
        }
      }

      if (e.key === "Enter" && this.activeTool === this.stickerTool && !isHubInput) {
        if (this.stickerTool.handleEnterKey()) { e.preventDefault(); return; }
      }

      if (e.key === "Enter" && this.activeTool === this.measureTool && !isHubInput) {
        if (this.measureTool.finishCollect()) { e.preventDefault(); return; }
      }

      // Don't trigger tool shortcuts while text editor is active
      const isTextEditing = this.textEditor?.isActive();
      if (isTextEditing) {
        if (e.key === "Escape") { e.preventDefault(); this.textEditor.commit(); return; }
        return;
      }

      if (e.key === "v" || e.key === "V") this.setTool(ToolIds.SELECT);
      if (e.key === "l" || e.key === "L") this.setTool(ToolIds.LINE);
      if (e.key === "h" || e.key === "H") this.setTool(ToolIds.HATCH);
      if (e.key === "m" || e.key === "M") this.setTool(ToolIds.MEASURE);
      if (e.key === "t" || e.key === "T") this.setTool(ToolIds.TEXT);
      if (e.key === "p" || e.key === "P") this.setTool(ToolIds.PIPETTE);
      if (e.key === "o" || e.key === "O") this.setTool(ToolIds.STICKER);
      if (e.key === "d" || e.key === "D") this.setTool(ToolIds.DOCUMENT);
      if (e.key === "f" || e.key === "F") this.setTool(ToolIds.FREE);
      if (e.key === "e" || e.key === "E") this.setTool(ToolIds.ERASER);
      if (e.key === "w" || e.key === "W") this.setTool(ToolIds.WALL);
      if (e.key === "u" || e.key === "U") this.setTool(ToolIds.DOOR);

      // 'B' = Bezugslinie einer selektierten Wand an gegenüberliegender Kante koppeln
      // (cycelt outer → center → inner → outer, Wandkörper bleibt sichtbar gleich).
      if ((e.key === "b" || e.key === "B") && this.selection && (this.selection as any).wallId) {
        const wall = this.scene.getWallById((this.selection as any).wallId);
        if (wall) {
          e.preventDefault();
          this.scene.flipWallReferenceSide(wall);
          this.scene.markWallsDirty();
          return;
        }
      }

      // Enter bestätigt eine laufende Gruppen-Aktion am Fangpunkt.
      if (e.key === "Enter" && this.selectTool.groupAnchorActive) {
        e.preventDefault();
        this.selectTool.confirmGroupAction();
        return;
      }

      // Enter bestätigt eine laufende Gruppen-Drehung.
      if (e.key === "Enter" && this.selectTool.groupRotateActive) {
        e.preventDefault();
        this.selectTool.cancelGroupTransform(false);
        this.commitHistorySnapshot();
        return;
      }

      // "R" → Mehrfachauswahl um ihren Schwerpunkt drehen.
      if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey
          && this.activeTool === this.selectTool
          && this.selectTool.marqueeSelectedIds.length > 0
          && !this.selectTool.groupRotateActive) {
        if (this.selectTool.startGroupRotate()) { e.preventDefault(); return; }
      }

      // Enter → eingefügte Kopie festsetzen.
      if (e.key === "Enter" && this.selectTool.pasteFloatActive) {
        e.preventDefault(); this.selectTool.confirmPasteFloat(); return;
      }

      if (e.key === "Escape") {
        // ESC bricht ALLES ab — unabhängig von Werkzeug und Objekt:
        // laufende Hub-Interaktionen, Sonder-Modi und Rahmen-Auswahl.
        this.dimensionHubMode = "none";
        this.documentHubMode = "none";
        this.bgRemoveInteraction = null;
        this.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
        try { this.hub?.hide?.(); } catch {}
        try { this.pointEditMenu?.hide?.(); } catch {}
        if (this.selectTool.pasteFloatActive) {
          e.preventDefault();
          this.selectTool.cancelGroupTransform(true);
          this.selectTool.deleteMarqueeSelection();
          this.selectTool.pasteFloatActive = false;
          return;
        }
        if (this.selectTool.groupRotateActive || this.selectTool.groupDragActive
            || this.selectTool.groupAnchorActive) {
          e.preventDefault(); this.selectTool.cancelGroupTransform(true); return;
        }

        if (this.isStickerEditing()) { this.exitStickerEdit(); this.clearSelection(); return; }
        if (this.pastePreviewActive) { this.cancelPastePreview(); return; }
        if (this.activeTool === this.lineTool) { this.lineTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.hatchTool) { this.hatchTool.cancel(); this.clearSelection(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.textTool) { this.textTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.measureTool) { this.measureTool.cancel(); this.clearSelection(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.pipetteTool) { this.pipetteTool.cancel(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.wallTool) { this.wallTool.cancel(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.doorTool) {
          if (this.doorTool.selectedDoorId) { this.doorTool.selectDoor(null); return; }
          this.doorTool.cancel(); this.setTool(ToolIds.SELECT); return;
        }
        if (this.activeTool === this.stickerTool) {
          // Erst aktive Platzierung abbrechen, sonst Tool wechseln
          if (this.stickerTool.phase !== "idle") { this.stickerTool.cancel(); return; }
          this.setTool(ToolIds.SELECT);
          return;
        }
        if (this.activeTool === this.documentTool) {
          if (this.documentTool.phase !== "idle") { this.documentTool.cancel(); return; }
          this.setTool(ToolIds.SELECT);
          return;
        }
        if (this.activeTool === this.selectTool) { this.selectTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.pointEditMenu.hide(); return; }
        // Jedes andere Werkzeug (z. B. Radiergummi): abbrechen und zurück zur Auswahl.
        this.activeTool.cancel();
        this.clearSelection();
        this.setSelectedLabelId(null);
        this.setTool(ToolIds.SELECT);
        return;
      }


      if (e.key === "Delete" || e.key === "Backspace") {
        // Laufende Gruppen-Transformation → abbrechen statt löschen.
        if (this.selectTool.groupRotateActive || this.selectTool.groupDragActive) {
          e.preventDefault();
          this.selectTool.cancelGroupTransform(true);
          return;
        }
        // Läuft gerade eine Bearbeitung (Verschieben/Drehen/Resize)? Dann bricht
        // ENTF diese Aktion ab (wie ESC) statt etwas zu löschen.
        // Radiergummi: ENTF hebt das Werkzeug auf (zurück zur Auswahl).
        if (this.activeTool === this.eraserTool) {
          e.preventDefault();
          e.stopPropagation();
          this.eraserTool.cancel();
          this.setTool(ToolIds.SELECT);
          return;
        }
        const st: any = this.selectTool as any;
        if (this.activeTool === this.selectTool &&

            (st.editTarget || st.rotateTextBoxId || st.dragTextBoxId || st.dragDocId || st.dragFreeStrokeId || st.dragDimId)) {
          e.preventDefault();
          e.stopPropagation();
          this.selectTool.cancel();
          this.pointEditMenu.hide();
          return;
        }
        // Textwerkzeug mit laufender Platzierung: Vorschau verwerfen.
        if (this.activeTool === this.textTool && (this.textTool as any).phase !== undefined
            && (this.textTool as any).phase !== "idle") {
          e.preventDefault();
          this.textTool.cancel();
          return;
        }
        // Marquee-Auswahl hat Vorrang: mehrere Elemente in einem Rutsch löschen.

        if (this.activeTool === this.selectTool && this.selectTool.marqueeSelectedIds.length > 0) {
          this.selectTool.deleteMarqueeSelection();
          return;
        }
        // Plan-Modus: zuerst Projektion-Selektion versuchen zu löschen.
        if (this.activePlanId && this.planController?.deleteSelected()) {
          return;
        }
        if (this.selection && (this.selection as any).wallId) {
          const wall = this.scene.getWallById((this.selection as any).wallId);
          if (wall) { this.scene.removeWall(wall); this.clearSelection(); this.pointEditMenu.hide(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.segmentId) {
          const seg = this.scene.getSegmentById(this.selection.segmentId);
          if (seg) { this.scene.removeSegment(seg); this.clearSelection(); this.pointEditMenu.hide(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.DIMENSION) {
          const dim = this.getSelectedDimension();
          if (dim) { this.scene.removeDimension(dim); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.STICKER_INSTANCE) {
          const inst = this.scene.getStickerInstanceById((this.selection as any).stickerInstanceId);
          if (inst) { this.scene.removeStickerInstance(inst); this.clearSelection(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.DOCUMENT) {
          const doc = this.scene.getDocumentById((this.selection as any).documentId);
          if (doc) { this.scene.removeDocument(doc); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && (this.selection.type === SelectionType.TEXTBOX || this.selection.type === SelectionType.TEXTBOX_HANDLE)) {
          const box = this.getSelectedTextBox();
          if (box) { this.scene.removeTextBox(box); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.FREE_STROKE) {
          const stroke = this.scene.getFreeStrokeById((this.selection as any).freeStrokeId);
          if (stroke) { this.scene.removeFreeStroke(stroke); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.hatchId) {
          const hatch = this.scene.getHatchById(this.selection.hatchId);
          if (hatch) {
            if (this.selection.type === SelectionType.POINT && hatch.points.length > 3) {
              this.scene.removePointFromHatch(hatch, this.selection.pointIndex!);
              this.setSelection({ type: SelectionType.HATCH, hatchId: hatch.id, pointIndex: null });
            } else {
              this.scene.removeHatch(hatch);
              this.clearSelection();
              this.pointEditMenu.hide();
            }
          }
          return;
        }
        if (this.selectedLabelId) {
          this.scene.removeSegmentsByLabelId(this.selectedLabelId);
          this.scene.removeHatchesByLabelId(this.selectedLabelId);
          this.scene.removeDimensionsByLabelId(this.selectedLabelId);
          this.scene.removeTextBoxesByLabelId(this.selectedLabelId);
          this.scene.removeDocumentsByLabelId(this.selectedLabelId);
          this.setSelectedLabelId(null);
          this.refreshLabelUI();
        }
      }
    };
    window.addEventListener("keydown", this._keydownHandler);
  }

  /* ---- Copy / Paste ---- */
  copySelection(): boolean {
    // Anker: ausgewählter Segment-Endpunkt > Mausposition
    let anchor: { x: number; y: number } | null = null;
    const sel = this.selection;
    if (sel && sel.type === SelectionType.POINT) {
      const seg = this.scene.getSegmentById(sel.segmentId);
      if (seg) {
        const p = sel.pointIndex === 0 ? seg.a : seg.b;
        anchor = { x: p.x, y: p.y };
      }
    }
    if (!anchor) anchor = { x: this.input.mouse.wx, y: this.input.mouse.wy };
    const clip = buildClipboardFromSelection(this, anchor);
    if (!clip) return false;
    this.clipboard = clip;
    return true;
  }

  /**
   * Fügt die Zwischenablage exakt an der Ursprungsposition ein. Die Kopie ist
   * sofort als Gruppe ausgewählt, frei verschiebbar und wird per Häkchen-
   * Symbol (oder Enter) gesetzt.
   */
  startPastePreview(): boolean {
    if (!this.clipboard || this.clipboard.items.length === 0) return false;
    if (this.textEditor?.isActive()) return false;
    if (this.activeTool !== this.selectTool) {
      this._toolBeforePaste = (this.activeTool as any).id || ToolIds.SELECT;
      this.setTool(ToolIds.SELECT);
    } else {
      this._toolBeforePaste = ToolIds.SELECT;
    }
    this.clearSelection();
    this.setSelectedLabelId(null);
    this.pointEditMenu.hide();
    this.pastePreviewActive = false;
    const created = commitClipboardAt(this, this.clipboard, v(this.clipboard.anchor.x, this.clipboard.anchor.y));
    if (!created.length) return false;
    this.selectTool.beginPasteFloat(created);
    this.refreshLabelUI();
    return true;
  }

  /** Häkchen / Enter: eingefügte Kopie festsetzen. */
  confirmPasteFloat(): boolean {
    return this.selectTool.confirmPasteFloat();
  }

  cancelPastePreview() {
    this.pastePreviewActive = false;
    this._toolBeforePaste = null;
    this.canvas.style.cursor = "";
  }

  /* ---- Sticker library ---- */
  createStickerFromSelection(name: string): StickerDefinition | null {
    const def = buildStickerFromSelection(this, name);
    if (!def) return null;
    this.stickers.push(def);
    this.onStickersChange?.();
    return def;
  }

  createStickerFromIds(ids: StickerIdSet, name: string): StickerDefinition | null {
    const def = buildStickerFromIds(this, ids, name);
    if (!def) return null;
    this.stickers.push(def);
    this.onStickersChange?.();
    return def;
  }

  renameSticker(id: string, name: string): boolean {
    const s = this.stickers.find(x => x.id === id);
    if (!s) return false;
    s.name = name.trim() || s.name;
    this.onStickersChange?.();
    return true;
  }

  removeSticker(id: string): boolean {
    const before = this.stickers.length;
    this.stickers = this.stickers.filter(s => s.id !== id);
    if (this.stickers.length === before) return false;
    if (this.stickerTool.activeDef?.id === id) this.stickerTool.cancel();
    this.onStickersChange?.();
    return true;
  }

  beginStickerPlacement(id: string) {
    const def = this.stickers.find(s => s.id === id);
    if (!def) return;
    if (this.activeTool !== this.stickerTool) this.setTool(ToolIds.STICKER);
    this.stickerTool.beginPlacement(def);
    this.onStickersChange?.();
  }

  /** Öffnet Edit-Mode für die erste platzierte Instanz dieses Stickers (oder gibt false zurück). */
  openStickerEditByDefId(defId: string): boolean {
    if (this.isStickerEditing()) return false;
    const inst = this.scene.stickerInstances.find(si => si.defId === defId);
    if (!inst) return false;
    this.setTool(ToolIds.SELECT);
    this.enterStickerEdit(inst as any);
    return true;
  }

  /** Öffnet Edit-Mode für eine konkrete Instanz-ID. */
  openStickerEditByInstanceId(instanceId: string): boolean {
    if (this.isStickerEditing()) return false;
    const inst = this.scene.getStickerInstanceById(instanceId);
    if (!inst) return false;
    this.setTool(ToolIds.SELECT);
    this.enterStickerEdit(inst as any);
    return true;
  }


  exportStickers(): string {
    return exportStickersToJson(this.stickers);
  }

  importStickers(json: string): number {
    const incoming = importStickersFromJson(json);
    if (incoming.length === 0) return 0;
    this.stickers.push(...incoming);
    this.onStickersChange?.();
    return incoming.length;
  }

  private _commitPasteAtMouse() {
    if (!this.clipboard) { this.cancelPastePreview(); return; }
    const mw = v(this.input.mouse.wx, this.input.mouse.wy);
    commitClipboardAt(this, this.clipboard, mw);
    this.pastePreviewActive = false;
    this.canvas.style.cursor = "";
    this.refreshLabelUI();
  }

  private _drawPastePreview(ctx: CanvasRenderingContext2D) {
    if (!this.pastePreviewActive || !this.clipboard) return;
    const dx = this.input.mouse.wx - this.clipboard.anchor.x;
    const dy = this.input.mouse.wy - this.clipboard.anchor.y;
    const items = translatedItems(this.clipboard.items, dx, dy);
    const cam = this.camera;

    ctx.save();
    ctx.globalAlpha = 0.55;
    let primary = "#4da3ff";
    try { primary = (getComputedStyle(document.documentElement).getPropertyValue("--primary") || "").trim() || primary; } catch {}

    for (const it of items) {
      if (it.kind === "segment") {
        const a = cam.worldToScreen(it.a.x, it.a.y);
        const b = cam.worldToScreen(it.b.x, it.b.y);
        ctx.strokeStyle = it.color || primary;
        ctx.lineWidth = (this.renderer as any)._segStrokePx?.(it.thicknessM) ?? Math.max(1, it.thicknessM * cam.scale);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else if (it.kind === "hatch") {
        ctx.beginPath();
        for (let i = 0; i < it.points.length; i++) {
          const p = cam.worldToScreen(it.points[i].x, it.points[i].y);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = it.fillColor;
        ctx.globalAlpha = 0.3 * (it.fillAlphaPct / 100 + 0.5);
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = it.strokeColor;
        ctx.lineWidth = Math.max(1, it.strokeWidthPx);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
      } else if (it.kind === "textbox") {
        const cx = it.center.x, cy = it.center.y;
        const w = it.widthM, h = it.heightM;
        const rot = it.rotationRad || 0;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const corners = [
          { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
        ].map(p => cam.worldToScreen(cx + p.x * cs - p.y * sn, cy + p.x * sn + p.y * cs));
        ctx.strokeStyle = primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
      } else if (it.kind === "dimension") {
        const a = cam.worldToScreen(it.p1.x, it.p1.y);
        const b = cam.worldToScreen(it.p2.x, it.p2.y);
        ctx.strokeStyle = it.lineColor || primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  setTool(id: string) {
    if (this.pastePreviewActive) this.cancelPastePreview();
    if (this.activeTool && this.activeTool.cancel) this.activeTool.cancel();
    // Wand-Helfer ausschalten, wenn das Wandwerkzeug verlassen wird.
    if (this.activeTool === this.wallTool && id !== ToolIds.WALL) {
      this.renderer.showWallHelpers = false;
    }
    if (id === ToolIds.SELECT) { this.activeTool = this.selectTool; this.selectTool.activate(); }
    else if (id === ToolIds.LINE) { this.activeTool = this.lineTool; this.lineTool.activate(); }
    else if (id === ToolIds.HATCH) { this.activeTool = this.hatchTool; this.hatchTool.activate(); }
    else if (id === ToolIds.MEASURE) { this.activeTool = this.measureTool; this.measureTool.activate(); }
    else if (id === ToolIds.TEXT) { this.activeTool = this.textTool; this.textTool.activate(); }
    else if (id === ToolIds.PIPETTE) { this.activeTool = this.pipetteTool; this.pipetteTool.activate(); }
    else if (id === ToolIds.STICKER) { this.activeTool = this.stickerTool; this.stickerTool.activate(); }
    else if (id === ToolIds.DOCUMENT) { this.activeTool = this.documentTool; this.documentTool.activate(); }
    else if (id === ToolIds.FREE) { this.activeTool = this.freeDrawTool; this.freeDrawTool.activate(); }
    else if (id === ToolIds.ERASER) { this.activeTool = this.eraserTool; this.eraserTool.activate(); }
    else if (id === ToolIds.WALL) { this.activeTool = this.wallTool; this.wallTool.activate(); }
    else if (id === ToolIds.DOOR) { this.activeTool = this.doorTool; this.doorTool.activate(); }
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._updateSettingsVisibility();
    try { (window as any).__pixunaActiveTool = id; } catch {}
    this.onToolChange?.(id);
  }

  /* ---- Measure Settings Panel ---- */
  private _syncMeasureLabelSelect() {
    if (!this.measureRefs?.idSelect) return;
    const groups = this.labelManager.list();
    const cur = this.measureRefs.idSelect.value;
    this.measureRefs.idSelect.innerHTML = "";
    for (const g of groups) {
      const opt = document.createElement("option");
      opt.value = g.id; opt.textContent = g.name;
      this.measureRefs.idSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(cur) ? cur : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.measureRefs.idSelect.value = preferred;
  }

  private _setupMeasureSettingsPanel() {
    const r = this.measureRefs;
    if (!r) return;

    r.idSelect.addEventListener("change", () => {
      const nextId = r.idSelect.value || Defaults.defaultLabelId;
      const sel = this.getSelectedDimension();
      if (sel) { sel.labelId = nextId; this.refreshLabelUI(); return; }
      if (this.selectedLabelId) {
        const groupIds = this.scene.getDimensionsByLabelId(this.selectedLabelId).map(d => d.id);
        if (groupIds.length > 0) {
          this.scene.assignDimensionsToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });

    r.orientation.addEventListener("change", () => {
      const val = r.orientation.value as "parallel" | "diagonal";
      this.measureSettings.orientation = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.mode = val;
    });

    r.pointCount.addEventListener("change", () => {
      this.measureSettings.pointCount = r.pointCount.value as "two" | "multi";
    });

    r.direction.addEventListener("change", () => {
      const val = r.direction.value as "horizontal" | "vertical" | "free";
      this.measureSettings.direction = val;
      // Im "frei"-Modus ist Endpunkt-Editierung sinnvoller als Parallel-Verschiebung.
      if (val === "free") {
        this.measureSettings.editMode = "endpoints";
        r.editMode.value = "endpoints";
      }
    });


    r.editMode.addEventListener("change", () => {
      this.measureSettings.editMode = r.editMode.value as "parallel" | "endpoints";
    });

    r.extensionsToggle.addEventListener("change", () => {
      const val = !!r.extensionsToggle.checked;
      this.measureSettings.showExtensions = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.showExtensions = val;
      r.extensionsGroup.classList.toggle("hidden", !val);
    });

    r.extensionStyle.addEventListener("change", () => {
      const val = r.extensionStyle.value as "dashed" | "solid";
      this.measureSettings.extensionStyle = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.extensionStyle = val;
    });

    r.extensionColor.addEventListener("input", () => {
      const val = r.extensionColor.value;
      this.measureSettings.extensionColor = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.extensionColor = val;
      r.extensionColorPreview.style.background = val;
    });

    r.extensionAlpha.addEventListener("input", () => {
      const v = parseFloat((r.extensionAlpha.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 1);
      this.measureSettings.extensionAlpha = c;
      const sel = this.getSelectedDimension();
      if (sel) sel.extensionAlpha = c;
    });

    r.freeTextToggle.addEventListener("change", () => {
      const val = !!r.freeTextToggle.checked;
      this.measureSettings.useFreeText = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.useFreeText = val;
      r.freeTextInput.classList.toggle("hidden", !val);
      r.freeTextGroup.classList.toggle("hidden", !val);
    });

    const toggleFreeTextBtn = (btn: HTMLButtonElement, get: () => boolean, set: (v: boolean) => void) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const next = !get();
        set(next);
        btn.classList.toggle("active", next);
      });
    };
    toggleFreeTextBtn(
      r.freeTextBold,
      () => this.measureSettings.freeTextBold,
      (v) => {
        this.measureSettings.freeTextBold = v;
        const sel = this.getSelectedDimension();
        if (sel) sel.freeTextBold = v;
      },
    );
    toggleFreeTextBtn(
      r.freeTextItalic,
      () => this.measureSettings.freeTextItalic,
      (v) => {
        this.measureSettings.freeTextItalic = v;
        const sel = this.getSelectedDimension();
        if (sel) sel.freeTextItalic = v;
      },
    );

    r.freeTextColor.addEventListener("input", () => {
      const val = r.freeTextColor.value;
      this.measureSettings.freeTextColor = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.freeTextColor = val;
      r.freeTextColorPreview.style.background = val;
    });

    r.freeTextInput.addEventListener("input", () => {
      const val = r.freeTextInput.value;
      this.measureSettings.freeText = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.freeText = val;
    });

    r.textColor.addEventListener("input", () => {
      const val = r.textColor.value;
      this.measureSettings.textColor = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.textColor = val;
      r.textColorPreview.style.background = val;
    });

    r.textSize.addEventListener("input", () => {
      const v = parseFloat((r.textSize.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      const c = clamp(v, 1, 200);
      this.measureSettings.textSizePx = c;
      const sel = this.getSelectedDimension();
      if (sel) sel.textSizePx = c;
    });

    r.decimals.addEventListener("input", () => {
      const v = parseInt(r.decimals.value || "0", 10);
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 6);
      this.measureSettings.decimals = c;
      const sel = this.getSelectedDimension();
      if (sel) sel.decimals = c;
    });

    r.textBgToggle.addEventListener("change", () => {
      const val = !!r.textBgToggle.checked;
      this.measureSettings.textBgEnabled = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.textBgEnabled = val;
      r.textBgGroup.classList.toggle("hidden", !val);
    });

    r.textBgColor.addEventListener("input", () => {
      const val = r.textBgColor.value;
      this.measureSettings.textBgColor = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.textBgColor = val;
      r.textBgColorPreview.style.background = val;
    });

    r.textBgAlpha.addEventListener("input", () => {
      const v = parseFloat((r.textBgAlpha.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 1);
      this.measureSettings.textBgAlpha = c;
      const sel = this.getSelectedDimension();
      if (sel) sel.textBgAlpha = c;
    });

    r.lineColor.addEventListener("input", () => {
      const val = r.lineColor.value;
      this.measureSettings.lineColor = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.lineColor = val;
      r.lineColorPreview.style.background = val;
    });

    r.tickLength.addEventListener("input", () => {
      const v = parseFloat((r.tickLength.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      const c = clamp(v, 0.001, 10);
      this.measureSettings.tickLengthM = c;
      const sel = this.getSelectedDimension();
      if (sel) sel.tickLengthM = c;
    });

    if (r.showUnit) r.showUnit.addEventListener("change", () => {
      const val = !!r.showUnit.checked;
      this.measureSettings.showUnit = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.showUnit = val;
    });

    if (r.unit) r.unit.addEventListener("change", () => {
      const val = (r.unit.value === "mm" || r.unit.value === "cm" || r.unit.value === "m") ? r.unit.value : "m";
      this.measureSettings.unit = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.unit = val;
    });

    if (r.textGap) r.textGap.addEventListener("input", () => {
      const v = parseFloat((r.textGap!.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 200);
      this.measureSettings.textGapPx = c;
      const sel = this.getSelectedDimension();
      if (sel) sel.textGapPx = c;
    });

    if (r.doorHeightText) r.doorHeightText.addEventListener("input", () => {
      const val = r.doorHeightText!.value;
      this.measureSettings.doorHeightText = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.doorHeightText = val;
    });

    this._syncMeasureSettingsFromContext();
  }

  private _syncMeasureSettingsFromContext() {
    const r = this.measureRefs;
    if (!r) return;
    const sel = this.getSelectedDimension();
    const s = sel ? {
      orientation: sel.mode, pointCount: this.measureSettings.pointCount, direction: this.measureSettings.direction,
      editMode: this.measureSettings.editMode,
      showExtensions: sel.showExtensions, useFreeText: sel.useFreeText, freeText: sel.freeText,
      textColor: sel.textColor, textSizePx: sel.textSizePx, decimals: sel.decimals,
      textBgEnabled: sel.textBgEnabled, textBgColor: sel.textBgColor, textBgAlpha: sel.textBgAlpha,
      lineColor: sel.lineColor, tickLengthM: sel.tickLengthM, labelId: sel.labelId,
      extensionStyle: sel.extensionStyle, extensionColor: sel.extensionColor, extensionAlpha: sel.extensionAlpha,
      freeTextBold: sel.freeTextBold, freeTextItalic: sel.freeTextItalic, freeTextColor: sel.freeTextColor,
      showUnit: sel.showUnit, unit: sel.unit,
      textGapPx: sel.textGapPx, doorHeightText: sel.doorHeightText,
    } : { ...this.measureSettings, labelId: this.activeDrawLabelId };

    r.orientation.value = s.orientation;
    r.pointCount.value = s.pointCount;
    r.direction.value = s.direction;
    r.editMode.value = s.editMode;
    r.extensionsToggle.checked = !!s.showExtensions;
    r.extensionsGroup.classList.toggle("hidden", !s.showExtensions);
    r.extensionStyle.value = s.extensionStyle || "dashed";
    r.extensionColor.value = this._toHexColor(s.extensionColor);
    r.extensionColorPreview.style.background = r.extensionColor.value;
    r.extensionAlpha.value = String(s.extensionAlpha ?? 1);
    r.freeTextToggle.checked = !!s.useFreeText;
    r.freeTextInput.value = s.freeText || "";
    r.freeTextInput.classList.toggle("hidden", !s.useFreeText);
    r.freeTextGroup.classList.toggle("hidden", !s.useFreeText);
    r.freeTextBold.classList.toggle("active", !!s.freeTextBold);
    r.freeTextItalic.classList.toggle("active", !!s.freeTextItalic);
    r.freeTextColor.value = this._toHexColor(s.freeTextColor);
    r.freeTextColorPreview.style.background = r.freeTextColor.value;
    r.textColor.value = this._toHexColor(s.textColor);
    r.textColorPreview.style.background = r.textColor.value;
    r.textSize.value = String(s.textSizePx);
    r.decimals.value = String(s.decimals);
    r.textBgToggle.checked = !!s.textBgEnabled;
    r.textBgGroup.classList.toggle("hidden", !s.textBgEnabled);
    r.textBgColor.value = this._toHexColor(s.textBgColor);
    r.textBgColorPreview.style.background = r.textBgColor.value;
    r.textBgAlpha.value = String(s.textBgAlpha);
    r.lineColor.value = this._toHexColor(s.lineColor);
    r.lineColorPreview.style.background = r.lineColor.value;
    r.tickLength.value = String(s.tickLengthM);
    if (r.showUnit) r.showUnit.checked = !!s.showUnit;
    if (r.unit) r.unit.value = s.unit || "m";
    if (r.textGap) r.textGap.value = String((s as any).textGapPx ?? Defaults.measureTextGapPx);
    if (r.doorHeightText) r.doorHeightText.value = (s as any).doorHeightText ?? "";
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (s.labelId && this.labelManager.getById(s.labelId)) ? s.labelId
        : (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    r.idSelect.value = labelForDisplay;
  }

  resize() { this._resize(); }

  private _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderer.setViewport(rect.width, rect.height);
  }

  private _tick() {
    if (this._destroyed) return;
    try {
      if (this.input.isPanning) this.camera.panBy(this.input.panDX, this.input.panDY);
      if (this.input.wheelDelta !== 0) this.camera.zoomAt(this.input.wheelDelta, this.input.mouse.sx, this.input.mouse.sy);
      this.input.update(this.camera);

      if (this.activePlanId) {
        // Plan-Modus: PlanController bekommt Vorrang (Selektion / Drag / HUB),
        // Werkzeuge bleiben aber zusätzlich nutzbar (Annotation auf dem Plan).
        const planConsumed = this.planController?.update() ?? false;
        if (!planConsumed) {
          if (this.pastePreviewActive) {
            this.canvas.style.cursor = "copy";
            if (this.input.clicked) this._commitPasteAtMouse();
          } else {
            this.activeTool.update(this.input);
          }
        }
      } else if (this.pastePreviewActive) {
        this.canvas.style.cursor = "copy";
        if (this.input.clicked) this._commitPasteAtMouse();
      } else {
        this.activeTool.update(this.input);
      }

      this.renderer.wallEditActive = !!(this.selectTool && this.selectTool.isEditing());
      this.topology.priorityWallId = this.selectTool?.getPriorityWallId?.() || null;


      this.renderer.render();
      if (this.pastePreviewActive) this._drawPastePreview(this.ctx);
      this.input.endFrame();
    } catch (err) {
      console.error("CAD tick error:", err);
      try { this.input.endFrame(); } catch (_) {}
    }
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  /**
   * Verdrahtet das Zeichnungs-ID-Panel (Blätter + Transparentpause).
   * Wird vom React-Wrapper nach dem Mount aufgerufen.
   */
  attachSheetPanel(
    root: HTMLDivElement,
    body: HTMLDivElement,
    list: HTMLDivElement,
    addBtn: HTMLButtonElement,
    toggleBtn: HTMLButtonElement,
  ) {
    this.sheetPanel = new SheetPanel(
      this.sheetManager,
      this.sheetOverlayStore,
      root, body, list, addBtn, toggleBtn,
      {
        getActiveSheetId: () => this.activeSheetId,
        setActiveSheetId: (id: string) => this.setActiveSheetId(id),
        onChange: () => {
          this._syncSheetSceneMap();
          this._syncOverlayScenes();
          this.refreshSheetUI();
        },
      },
    );
    this.sheetPanel.render();
  }

  refreshSheetUI() {
    this.sheetPanel?.render();
  }

  /**
   * Verdrahtet das Druckpläne-Panel.
   * Wird vom React-Wrapper nach dem Mount aufgerufen.
   */
  attachPlanPanel(
    root: HTMLDivElement,
    body: HTMLDivElement,
    list: HTMLDivElement,
    addBtn: HTMLButtonElement,
    printBtn: HTMLButtonElement,
    toggleBtn: HTMLButtonElement,
  ) {
    this.planPanel = new PlanPanel(
      this.planManager,
      this.planOverlayStore,
      root, body, list, addBtn, printBtn, toggleBtn,
      {
        getActivePlanId: () => this.activePlanId,
        setActivePlanId: (id: string | null) => this.setActivePlanId(id),
        printSelected: () => this.printSelectedPlans(),
        onChange: () => {
          // Verwaiste Plan-Scenes/Overlays aufräumen.
          this._syncPlanSceneMap();
          // Falls Format des aktiven Plans geändert wurde → Renderer aktualisieren.
          if (this.activePlanId) this._applyPlanModeToRenderer();
          // Tracing-Layer (andere Pläne) neu aufbauen.
          this._syncPlanTracingLayers();
          this.refreshPlanUI();
          // Snapshot, damit Plan-Änderungen in Undo/Redo landen.
          this.commitHistorySnapshot();
        },
      },
    );
    this.planPanel.render();
  }

  refreshPlanUI() {
    this.planPanel?.render();
  }

  /** Setzt aktiven Plan (null = zurück zur Zeichnungsoberfläche). */
  setActivePlanId(id: string | null) {
    if (id != null && !this.planManager.getById(id)) return;
    if (id === this.activePlanId) { this.refreshPlanUI(); return; }
    // Aktuellen Camera-State sichern (für Sheet bzw. den vorherigen Plan).
    this._saveCurrentCameraState();
    this.activePlanId = id;
    this._applyPlanModeToRenderer();
    this.refreshPlanUI();
  }

  /** Wendet den aktuellen Plan-Status auf Renderer + Scene an. */
  private _applyPlanModeToRenderer() {
    if (this.activePlanId) {
      const plan = this.planManager.getById(this.activePlanId);
      if (plan) {
        const size = getPlanPaperSize(plan);
        this.renderer.planMode = { widthMm: size.width, heightMm: size.height };
        // Annotation-Scene des Plans als aktive Scene swappen, damit Werkzeuge
        // direkt auf dem Plan zeichnen können.
        const planScene = this._ensurePlanScene(this.activePlanId);
        this.scene = planScene;
        (this.renderer as any).scene = planScene;
        this.topology.scene = planScene;
        // Selection / Hover zurücksetzen.
        this.selection = null;
        this.renderer.setSelection(null);
        this.renderer.setHoverSegmentId(null);
        this.renderer.setHoverHatchId(null);
        this.renderer.setHoverTextBoxId(null);
        // Sheet-Overlays im Plan-Modus aus (Sheets gehören nicht auf Pläne).
        this.renderer.overlayScenes = [];
        // Plan-Tracing (andere Pläne als Transparentpause) berechnen.
        this._syncPlanTracingLayers();
        // Tools/HUDs sauber beenden.
        try { (this.activeTool as any)?.cancel?.(); } catch { /* noop */ }
        try { (this.activeTool as any)?.reset?.(); } catch { /* noop */ }
        this.pointEditMenu.hide();
        this.hub.hide();
        // Kamera: gespeicherten Zustand wiederherstellen — sonst Fit auf Papier.
        const cached = this._camStateByPlanId.get(this.activePlanId);
        if (cached) {
          this.camera.scale = cached.scale;
          this.camera.offsetX = cached.offsetX;
          this.camera.offsetY = cached.offsetY;
        } else {
          this._fitCameraToPaper(size.width, size.height);
        }
        // Referenz-Skalierung für Werkzeuge/Texte: an Plan-Fit-Größe binden,
        // damit Werkzeuge nicht überdimensional auf dem Papier wirken.
        const fitRef = this._computePlanFitScale(size.width, size.height);
        this.renderer.referencePxPerM = fitRef;
        // Plan-spezifische Defaults (Linienstärke, Schriftgröße) aktivieren.
        // Plan-spezifische Defaults (Linienstärke, Schriftgröße, Maßketten-Tick) aktivieren.
        if (!this._savedSheetDefaults) {
          this._savedSheetDefaults = {
            lineThicknessM: this.defaultLineThicknessM,
            textFontSizePx: this.defaultTextFontSizePx,
            tickLengthM: this.measureSettings.tickLengthM,
          };
        }
        const planScale = Defaults.strokeWidthBaseScale / fitRef;
        const planLine = this._planDefaultLineThicknessM.get(this.activePlanId)
          ?? Defaults.lineThicknessM * planScale;
        const planFont = this._planDefaultTextFontSizePx.get(this.activePlanId)
          ?? Defaults.textFontSizePx;
        this._planDefaultLineThicknessM.set(this.activePlanId, planLine);
        this._planDefaultTextFontSizePx.set(this.activePlanId, planFont);
        this.defaultLineThicknessM = planLine;
        this.defaultTextFontSizePx = planFont;
        // Maßketten-Ticks: in m gespeichert → mit Plan-Skalierung anpassen.
        this.measureSettings.tickLengthM = Defaults.measureTickLengthM * planScale;
      }
    } else {
      this.renderer.planMode = null;
      this.renderer.planTracingLayers = [];
      // Referenz-Skalierung zurück auf Sheet-Default.
      this.renderer.referencePxPerM = Defaults.strokeWidthBaseScale;
      // Aktive Sheet-Scene wiederherstellen.
      const activeScene = this.scenesById.get(this.activeSheetId) || this.scene;
      this.scene = activeScene;
      (this.renderer as any).scene = activeScene;
      this.topology.scene = activeScene;
      // Overlay-Sheets wiederherstellen.
      this._syncOverlayScenes();
      // Plan-Controller-State zurücksetzen (HUB ausblenden).
      this.planController?.onExitPlanMode();
      this.canvas.style.cursor = "";
      // Sheet-Defaults zurückholen, falls wir aus einem Plan kommen.
      if (this._savedSheetDefaults) {
        this.defaultLineThicknessM = this._savedSheetDefaults.lineThicknessM;
        this.defaultTextFontSizePx = this._savedSheetDefaults.textFontSizePx;
        this.measureSettings.tickLengthM = this._savedSheetDefaults.tickLengthM;
        this._savedSheetDefaults = null;
      }
    }
    // Beim Plan-Wechsel Auswahl/Hover des Plan-Controllers zurücksetzen.
    if (this.planController && this.activePlanId) {
      this.planController.selectedProjectionId = null;
      this.planController.hoverProjectionId = null;
    }
  }

  /** Berechnet den Fit-Zoom (px/m) für ein Plan-Papier mit gegebener mm-Größe. */
  private _computePlanFitScale(widthMm: number, heightMm: number): number {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return Defaults.strokeWidthBaseScale;
    const wM = widthMm / 1000;
    const hM = heightMm / 1000;
    const marginPx = 40;
    const sx = (rect.width - marginPx * 2) / wM;
    const sy = (rect.height - marginPx * 2) / hM;
    return Math.max(1, Math.min(sx, sy));
  }

  /** Speichert den aktuellen Camera-State für die zuletzt aktive Ansicht. */
  private _saveCurrentCameraState() {
    const snap = { scale: this.camera.scale, offsetX: this.camera.offsetX, offsetY: this.camera.offsetY };
    if (this.activePlanId) {
      this._camStateByPlanId.set(this.activePlanId, snap);
    } else if (this.activeSheetId) {
      this._camStateBySheetId.set(this.activeSheetId, snap);
    }
  }

  /** Stellt die Annotation-Scene für einen Plan sicher. */
  private _ensurePlanScene(planId: string): Scene {
    let sc = this.planScenesById.get(planId);
    if (!sc) {
      sc = new Scene();
      (sc as any)._drawingScaleRef = () => this.drawingScale;
      this.planScenesById.set(planId, sc);
    }
    return sc;
  }

  /**
   * Baut die Tracing-Pause-Layer für den aktiven Plan zusammen.
   * Jeder andere Plan mit aktiver Transparentpause liefert seine
   * Projektionen + Annotation-Scene als ein Layer.
   */
  private _syncPlanTracingLayers() {
    if (!this.activePlanId) {
      this.renderer.planTracingLayers = [];
      return;
    }
    const layers: Renderer["planTracingLayers"] = [];
    for (const plan of this.planManager.list()) {
      if (plan.id === this.activePlanId) continue;
      const state = this.planOverlayStore.get(plan.id);
      if (!state || state.mode === "none") continue;
      const annotationScene = this._ensurePlanScene(plan.id);
      // Projektionen via PlanController-Hilfen + Annotation-Scene via Renderer-Pfad.
      const drawCb = (offCtx: CanvasRenderingContext2D) => {
        // 1) Projektionen dieses Plans zeichnen
        for (const proj of plan.projections) {
          const items = this.planController?.getItems(proj) ?? [];
          try {
            drawPlanProjection(offCtx, this.camera, items, proj, false, false);
          } catch { /* noop */ }
        }
        // 2) Annotation-Scene über bestehenden Renderer-Pfad.
        // Wir swappen Renderer.scene + ctx temporär.
        const r = this.renderer;
        const realScene = (r as any).scene;
        const realCtx = (r as any).ctx;
        try {
          (r as any).scene = annotationScene;
          (r as any).ctx = offCtx;
          (r as any)._drawByLabelOrder?.();
        } finally {
          (r as any).scene = realScene;
          (r as any).ctx = realCtx;
        }
      };
      layers.push({
        drawCb,
        mode: state.mode === "tint" ? "tint" : "stamp",
        color: state.color,
        opacity: state.opacity,
      });
    }
    this.renderer.planTracingLayers = layers;
  }

  /** Cached leere Scene als Anzeige-Backing im Plan-Modus (legacy, ungenutzt). */
  private _planEmptyScene: Scene | null = null;

  /** Zentriert Kamera auf (0,0) und zoomt so, dass das Papier mit Rand passt. */
  private _fitCameraToPaper(widthMm: number, heightMm: number) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const wM = widthMm / 1000;
    const hM = heightMm / 1000;
    const marginPx = 40;
    const sx = (rect.width - marginPx * 2) / wM;
    const sy = (rect.height - marginPx * 2) / hM;
    const scale = Math.max(1, Math.min(sx, sy));
    (this.camera as any).scale = scale;
    this.camera.center(rect);
  }

  /** Sammel-PDF-Druck via pdf-lib (Multi-Page). */
  async printSelectedPlans() {
    const sel = this.planManager.getSelected();
    if (sel.length === 0) {
      alert("Bitte mindestens einen Plan auswählen (Häkchen rechts neben dem Plannamen).");
      return;
    }
    try {
      const { exportPlansToPdf, downloadPdfBytes } = await import("./PlanPdfExport");
      const resolveSheet = (sheetId: string): unknown | null => {
        const sc = this.scenesById.get(sheetId);
        if (!sc) return null;
        return this._serializeOneScene(sc);
      };
      const bytes = await exportPlansToPdf(sel, resolveSheet);
      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}`;
      const fname = sel.length === 1
        ? `${sel[0].name.replace(/[^\w\-]+/g, "_")}_${stamp}.pdf`
        : `Druckplaene_${stamp}.pdf`;
      downloadPdfBytes(bytes, fname);
    } catch (err) {
      console.error("[printSelectedPlans] PDF-Export fehlgeschlagen:", err);
      alert("PDF-Export fehlgeschlagen. Details in der Browser-Konsole.");
    }
  }

  /** Stellt sicher, dass für jeden Plan eine Annotation-Scene existiert; entfernt verwaiste. */
  private _syncPlanSceneMap() {
    const validIds = new Set(this.planManager.list().map(p => p.id));
    for (const id of validIds) {
      if (!this.planScenesById.has(id)) {
        const sc = new Scene();
        (sc as any)._drawingScaleRef = () => this.drawingScale;
        this.planScenesById.set(id, sc);
      }
    }
    for (const id of [...this.planScenesById.keys()]) {
      if (!validIds.has(id)) {
        this.planScenesById.delete(id);
        this.planOverlayStore.delete(id);
      }
    }
  }

  /** Stellt sicher, dass für jedes Blatt eine Scene existiert; entfernt verwaiste Scenes. */
  private _syncSheetSceneMap() {
    const validIds = new Set(this.sheetManager.list().map(s => s.id));
    // Neue Sheets → leere Scene anlegen.
    for (const id of validIds) {
      if (!this.scenesById.has(id)) {
        const sc = new Scene();
        (sc as any)._drawingScaleRef = () => this.drawingScale;
        this.scenesById.set(id, sc);
      }
    }
    // Verwaiste Scenes löschen (nicht das Default-Sheet).
    for (const id of [...this.scenesById.keys()]) {
      if (!validIds.has(id) && id !== SheetDefaults.defaultSheetId) {
        this.scenesById.delete(id);
      }
    }
    // Falls aktives Blatt gelöscht wurde → auf Default zurück.
    if (!validIds.has(this.activeSheetId)) {
      this.setActiveSheetId(SheetDefaults.defaultSheetId);
    }
  }

  /** Wechselt das aktive Blatt: Scene swappen, UI/Selektion zurücksetzen, Overlay neu binden. */
  setActiveSheetId(id: string) {
    if (!this.sheetManager.getById(id)) return;
    // Aktuellen Camera-State der bisherigen Ansicht (Sheet ODER Plan) sichern.
    this._saveCurrentCameraState();
    // Falls wir gerade im Plan-Modus sind: zurück in den Zeichenmodus.
    if (this.activePlanId) {
      this.activePlanId = null;
      this._applyPlanModeToRenderer();
      this.refreshPlanUI();
    }
    if (id === this.activeSheetId) {
      // Selber Sheet → ggf. gespeicherten Camera-State wiederherstellen.
      const cached = this._camStateBySheetId.get(id);
      if (cached) {
        this.camera.scale = cached.scale;
        this.camera.offsetX = cached.offsetX;
        this.camera.offsetY = cached.offsetY;
      }
      this.refreshSheetUI();
      return;
    }
    // Scene sicherstellen.
    if (!this.scenesById.has(id)) {
      const sc = new Scene();
      (sc as any)._drawingScaleRef = () => this.drawingScale;
      this.scenesById.set(id, sc);
    }
    // Tools/Selektion sauber beenden.
    this.clearSelection();
    this.pointEditMenu.hide();
    this.hub.hide();
    // Aktives Tool zurücksetzen, damit kein halb-fertiger State (z. B. laufende Linie) bleibt.
    try { (this.activeTool as any)?.cancel?.(); } catch { /* noop */ }
    try { (this.activeTool as any)?.reset?.(); } catch { /* noop */ }

    this.activeSheetId = id;
    const next = this.scenesById.get(id)!;
    this.scene = next;
    this.renderer.scene = next;
    this.topology.scene = next;

    this._syncOverlayScenes();
    this.refreshLabelUI();
    this.refreshSheetUI();
    // Camera-State des neuen Sheets wiederherstellen, falls vorhanden.
    const cached = this._camStateBySheetId.get(id);
    if (cached) {
      this.camera.scale = cached.scale;
      this.camera.offsetX = cached.offsetX;
      this.camera.offsetY = cached.offsetY;
    }
    // History-Snapshot triggern, damit Sheetwechsel nicht als "keine Änderung" gewertet wird.
    this._lastSnapshot = this._serializeScene();
  }

  /** Aktualisiert die Liste der Overlay-Scenes für Renderer & Topology. */
  private _syncOverlayScenes() {
    const overlays: { scene: Scene; mode: "stamp" | "tint"; color: string | null; opacity: number }[] = [];
    const topoOverlays: Scene[] = [];
    for (const sheet of this.sheetManager.list()) {
      if (sheet.id === this.activeSheetId) continue;
      const state = this.sheetOverlayStore.get(sheet.id);
      if (!state || state.mode === "none") continue;
      const sc = this.scenesById.get(sheet.id);
      if (!sc) continue;
      overlays.push({
        scene: sc,
        mode: state.mode === "tint" ? "tint" : "stamp",
        color: state.color,
        opacity: state.opacity,
      });
      topoOverlays.push(sc);
    }
    this.renderer.overlayScenes = overlays;
    this.topology.overlayScenes = topoOverlays;
  }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._rafId);
    if (this._snapshotTimer != null) { clearInterval(this._snapshotTimer); this._snapshotTimer = null; }
    this.input.destroy();
    this.hub.destroy();
    this.textEditor?.destroy();
    this.planController?.destroy();
    if (this._keydownHandler) window.removeEventListener("keydown", this._keydownHandler);
  }
}
