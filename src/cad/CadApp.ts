import { Defaults, ToolIds, PointEditAction, SelectionType } from "./constants";
import { clamp, v, Vec2 } from "./geometry";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Scene, AreaLabel, DimensionStyle, TextBoxStyle, TextBox } from "./Scene";
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

import { IdPanel } from "./IdPanel";

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
}

export interface MeasureSettingsRefs {
  panel: HTMLDivElement;
  idSelect: HTMLSelectElement;
  orientation: HTMLSelectElement;
  pointCount: HTMLSelectElement;
  editMode: HTMLSelectElement;
  extensionsToggle: HTMLInputElement;
  freeTextToggle: HTMLInputElement;
  freeTextInput: HTMLInputElement;
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
  defaultHatchFillColor = Defaults.hatchFillColor;
  defaultHatchStrokeColor = Defaults.hatchStrokeColor;
  defaultHatchStrokeWidthPx = Defaults.hatchStrokePx;
  defaultHatchFillAlphaPct = Defaults.hatchFillAlphaPct;

  defaultTextColor = Defaults.textColor;
  defaultTextFontSizePx = Defaults.textFontSizePx;
  defaultTextBgColor = Defaults.textBgColor;
  defaultTextBgAlphaPct = Defaults.textBgAlphaPct;
  defaultTextWrap = Defaults.textWrap;
  defaultTextAlign: "left" | "center" | "right" = Defaults.textAlign;
  defaultTextBorderEnabled = Defaults.textBorderEnabled;
  defaultTextBorderColor = Defaults.textBorderColor;
  defaultTextBorderWidthPx = Defaults.textBorderWidthPx;

  camera: Camera;
  scene: Scene;
  input: Input;
  labelManager: LabelManager;
  topology: TopologyEngine;
  renderer: Renderer;

  selectTool: SelectTool;
  lineTool: LineTool;
  hatchTool: HatchTool;
  measureTool!: MeasureTool;
  textTool!: TextTool;
  pipetteTool!: PipetteTool;
  stickerTool!: StickerTool;
  activeTool: SelectTool | LineTool | HatchTool | MeasureTool | TextTool | PipetteTool | StickerTool;

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
  };

  // Drag state for parallel-shifting a selected dimension
  private _dragDimId: string | null = null;
  private _dragDimOffsetAlongNormal = 0;

  idPanel: IdPanel;

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
    this.input = new Input(canvas);
    this.labelManager = new LabelManager();
    this.topology = new TopologyEngine(this.scene, this.camera, this.labelManager);
    this.renderer = new Renderer(this.ctx, this.camera, this.scene, this.labelManager);

    this.selectTool = new SelectTool(this);
    this.lineTool = new LineTool(this);
    this.hatchTool = new HatchTool(this);
    this.measureTool = new MeasureTool(this);
    this.textTool = new TextTool(this);
    this.pipetteTool = new PipetteTool(this);
    this.stickerTool = new StickerTool(this);
    this.activeTool = this.selectTool;

    this.idPanel = new IdPanel(this, idPanelRoot, idPanelBody, idPanelList, idPanelAddBtn, idPanelToggleBtn);

    this.textEditor = new TextEditorOverlay(
      textEditorRefs.editor, textEditorRefs.toolbar,
      textEditorRefs.boldBtn, textEditorRefs.italicBtn,
      textEditorRefs.colorInput, textEditorRefs.sizeSelect, textEditorRefs.symbolSelect,
      this,
    );

    this.pointEditMenu.bindActivate((action) => {
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
  private _serializeScene(): string {
    return JSON.stringify({
      segments: this.scene.segments.map(s => ({
        id: s.id, a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y },
        color: s.color, thicknessM: s.thicknessM, labelId: s.labelId,
        _stickerEditOwnerId: s._stickerEditOwnerId || null,
      })),
      hatches: this.scene.hatches.map(h => ({
        id: h.id, points: h.points.map(p => ({ x: p.x, y: p.y })),
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: { ...h.areaLabel },
        _stickerEditOwnerId: h._stickerEditOwnerId || null,
      })),
      dimensions: this.scene.dimensions.map(d => ({
        id: d.id,
        p1: { x: d.p1.x, y: d.p1.y }, p2: { x: d.p2.x, y: d.p2.y },
        placementPoint: { x: d.placementPoint.x, y: d.placementPoint.y },
        mode: d.mode, refDir: d.refDir ? { x: d.refDir.x, y: d.refDir.y } : null,
        textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
        decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
        useFreeText: d.useFreeText, freeText: d.freeText,
        textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
        labelId: d.labelId,
        _stickerEditOwnerId: d._stickerEditOwnerId || null,
      })),
      textBoxes: this.scene.textBoxes.map(t => ({
        id: t.id,
        center: { x: t.center.x, y: t.center.y },
        widthM: t.widthM, heightM: t.heightM,
        rotationRad: t.rotationRad, html: t.html,
        style: { ...t.style },
        labelId: t.labelId,
        _stickerEditOwnerId: t._stickerEditOwnerId || null,
      })),
      labels: this.labelManager.list().map(l => ({ ...l })),
      stickers: this.stickers.map(s => ({ id: s.id, name: s.name, items: s.items, createdAt: s.createdAt })),
      stickerInstances: this.scene.stickerInstances.map(si => ({
        id: si.id, defId: si.defId, name: si.name, items: si.items,
        position: { x: si.position.x, y: si.position.y },
        rotationRad: si.rotationRad, scale: si.scale, labelId: si.labelId,
      })),
      _stickerEditInstanceId: this._stickerEditInstanceId,
      _stickerEditSnapshot: this._stickerEditSnapshot,
    });
  }

  private _restoreScene(snapshot: string) {
    const data = JSON.parse(snapshot);
    this._isRestoring = true;
    // Restore labels first
    if (Array.isArray(data.labels) && (this.labelManager as any).restore) {
      try { (this.labelManager as any).restore(data.labels); } catch {}
    }
    // Clear scene
    this.scene.segments = [];
    this.scene.hatches = [];
    this.scene.dimensions = [];
    this.scene.textBoxes = [];
    this.scene.stickerInstances = [];
    (this.scene as any)._rebuildSegIdMap?.();
    (this.scene as any)._rebuildHatchIdMap?.();
    (this.scene as any)._rebuildDimIdMap?.();
    (this.scene as any)._rebuildTextIdMap?.();
    (this.scene as any)._rebuildStickerIdMap?.();
    // Re-add segments
    for (const s of data.segments || []) {
      const seg = this.scene.createSegment(s.a, s.b, { color: s.color, thicknessM: s.thicknessM, labelId: s.labelId });
      if (s._stickerEditOwnerId) seg._stickerEditOwnerId = s._stickerEditOwnerId;
    }
    // Re-add hatches
    for (const h of data.hatches || []) {
      const hatch = this.scene.createHatch(h.points, {
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: h.areaLabel,
      });
      if (h._stickerEditOwnerId) hatch._stickerEditOwnerId = h._stickerEditOwnerId;
    }
    // Re-add dimensions
    for (const d of data.dimensions || []) {
      const dim = this.scene.createDimension(d.p1, d.p2, d.placementPoint, d.mode, d.refDir, {
        textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
        decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
        useFreeText: d.useFreeText, freeText: d.freeText,
        textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
        labelId: d.labelId,
      });
      if (d._stickerEditOwnerId) dim._stickerEditOwnerId = d._stickerEditOwnerId;
    }
    // Re-add text boxes
    for (const t of data.textBoxes || []) {
      const box = this.scene.createTextBox(t.center, t.widthM, t.heightM, { ...(t.style || {}), labelId: t.labelId }, t.html || "", t.rotationRad || 0);
      if (t._stickerEditOwnerId) box._stickerEditOwnerId = t._stickerEditOwnerId;
    }
    // Restore stickers
    if (Array.isArray(data.stickers)) {
      this.stickers = data.stickers.map((s: any) => ({
        id: s.id, name: s.name, items: s.items, createdAt: s.createdAt || Date.now(),
      }));
      this.onStickersChange?.();
    }
    // Restore sticker instances
    if (Array.isArray(data.stickerInstances)) {
      for (const si of data.stickerInstances) {
        const inst = this.scene.createStickerInstance({
          defId: si.defId, name: si.name, items: si.items,
          position: si.position, rotationRad: si.rotationRad || 0,
          scale: si.scale || 1, labelId: si.labelId,
        });
        if (si.id) (inst as any).id = si.id;
      }
      (this.scene as any)._rebuildStickerIdMap?.();
    }
    // Restore Sticker-Edit-Mode (so Undo/Redo while editing works correctly)
    this._stickerEditInstanceId = data._stickerEditInstanceId || null;
    this._stickerEditSnapshot = data._stickerEditSnapshot || null;
    this.clearSelection();
    this.setSelectedLabelId(null);
    this.pointEditMenu.hide();
    this.refreshLabelUI();
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
    this.selection = selection;
    this.renderer.setSelection(selection);
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this._updateSettingsVisibility();
    this._syncStickerInstanceHub();
  }

  clearSelection() { this.setSelection(null); }

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

    // Wenn alles gelöscht wurde: Edit-Mode beenden, Instanz nicht wiederherstellen.
    const totalCount = ownedSegs.length + ownedHatches.length + ownedDims.length + ownedTexts.length;
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

    // Owner-Objekte aus Scene entfernen.
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
    const scalePct = inst.scale * 100;
    const rotDeg = (inst.rotationRad * 180 / Math.PI + 360) % 360;
    this.hub.lenInputEl.value = `${scalePct.toFixed(1)} %`;
    this.hub.angInputEl.value = `${rotDeg.toFixed(1)}°`;
    this.hub.bindCommit((vals) => {
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
      return { color: selected.color || this.defaultLineColor, thicknessM: selected.thicknessM || this.defaultLineThicknessM, labelId: selected.labelId || Defaults.defaultLabelId };
    }
    const groupSegs = this.getSelectedGroupSegments();
    if (groupSegs.length > 0) {
      const ref = groupSegs[0];
      return { color: ref.color || this.defaultLineColor, thicknessM: ref.thicknessM || this.defaultLineThicknessM, labelId: ref.labelId || Defaults.defaultLabelId };
    }
    return { color: this.defaultLineColor, thicknessM: this.defaultLineThicknessM, labelId: this.activeDrawLabelId || Defaults.defaultLabelId };
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
        show: false, textColor: Defaults.areaTextColor, fontSizePx: Defaults.areaFontSizePx,
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
      if (sel) { sel.labelId = nextId; this.setSelectedLabelId(nextId); this.refreshLabelUI(); return; }
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
      if (sel) sel.style.fontSizePx = v;
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
      if (sel) sel.style.wrap = !!r.wrapToggle.checked;
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
      const selectedIds = this.getSelectedObjectIds();
      if (selectedIds.length > 0) {
        this.scene.assignSegmentsToLabel(selectedIds, nextId);
        this.setSelectedLabelId(nextId);
        this.refreshLabelUI();
        return;
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
      const selectedHatchIds = this.getSelectedHatchObjectIds();
      if (selectedHatchIds.length > 0) {
        this.scene.assignHatchesToLabel(selectedHatchIds, nextId);
        this.setSelectedLabelId(nextId);
        this.refreshLabelUI();
        return;
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
      const sel = this.getSelectedHatch();
      if (sel) sel.areaLabel.show = !!this.areaShowInput.checked;
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
      v = clamp(v, 8, 72);
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

      if (e.key === "Escape") {
        if (this.pastePreviewActive) { this.cancelPastePreview(); return; }
        if (this.activeTool === this.lineTool) { this.lineTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.hatchTool) { this.hatchTool.cancel(); this.clearSelection(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.textTool) { this.textTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.measureTool) { this.measureTool.cancel(); this.clearSelection(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.pipetteTool) { this.pipetteTool.cancel(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.stickerTool) {
          // Erst aktive Platzierung abbrechen, sonst Tool wechseln
          if (this.stickerTool.phase !== "idle") { this.stickerTool.cancel(); return; }
          this.setTool(ToolIds.SELECT);
          return;
        }
        if (this.activeTool === this.selectTool) { this.selectTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.pointEditMenu.hide(); return; }
        this.activeTool.cancel();
        this.clearSelection();
        this.setSelectedLabelId(null);
      }

      if (e.key === "Delete" || e.key === "Backspace") {
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
        if (this.selection && (this.selection.type === SelectionType.TEXTBOX || this.selection.type === SelectionType.TEXTBOX_HANDLE)) {
          const box = this.getSelectedTextBox();
          if (box) { this.scene.removeTextBox(box); this.clearSelection(); this.refreshLabelUI(); }
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

  startPastePreview(): boolean {
    if (!this.clipboard || this.clipboard.items.length === 0) return false;
    if (this.textEditor?.isActive()) return false;
    // Switch to select tool but stay in a paste-overlay mode
    if (this.activeTool !== this.selectTool) {
      this._toolBeforePaste = (this.activeTool as any).id || ToolIds.SELECT;
      this.setTool(ToolIds.SELECT);
    } else {
      this._toolBeforePaste = ToolIds.SELECT;
    }
    this.clearSelection();
    this.setSelectedLabelId(null);
    this.pointEditMenu.hide();
    this.pastePreviewActive = true;
    this.canvas.style.cursor = "copy";
    return true;
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
        ctx.lineWidth = Math.max(1, it.thicknessM * cam.scale);
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
    if (id === ToolIds.SELECT) { this.activeTool = this.selectTool; this.selectTool.activate(); }
    else if (id === ToolIds.LINE) { this.activeTool = this.lineTool; this.lineTool.activate(); }
    else if (id === ToolIds.HATCH) { this.activeTool = this.hatchTool; this.hatchTool.activate(); }
    else if (id === ToolIds.MEASURE) { this.activeTool = this.measureTool; this.measureTool.activate(); }
    else if (id === ToolIds.TEXT) { this.activeTool = this.textTool; this.textTool.activate(); }
    else if (id === ToolIds.PIPETTE) { this.activeTool = this.pipetteTool; this.pipetteTool.activate(); }
    else if (id === ToolIds.STICKER) { this.activeTool = this.stickerTool; this.stickerTool.activate(); }
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._updateSettingsVisibility();
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
      if (sel) { sel.labelId = nextId; this.setSelectedLabelId(nextId); this.refreshLabelUI(); return; }
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

    r.editMode.addEventListener("change", () => {
      this.measureSettings.editMode = r.editMode.value as "parallel" | "endpoints";
    });

    r.extensionsToggle.addEventListener("change", () => {
      const val = !!r.extensionsToggle.checked;
      this.measureSettings.showExtensions = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.showExtensions = val;
    });

    r.freeTextToggle.addEventListener("change", () => {
      const val = !!r.freeTextToggle.checked;
      this.measureSettings.useFreeText = val;
      const sel = this.getSelectedDimension();
      if (sel) sel.useFreeText = val;
      r.freeTextInput.classList.toggle("hidden", !val);
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

    this._syncMeasureSettingsFromContext();
  }

  private _syncMeasureSettingsFromContext() {
    const r = this.measureRefs;
    if (!r) return;
    const sel = this.getSelectedDimension();
    const s = sel ? {
      orientation: sel.mode, pointCount: this.measureSettings.pointCount,
      editMode: this.measureSettings.editMode,
      showExtensions: sel.showExtensions, useFreeText: sel.useFreeText, freeText: sel.freeText,
      textColor: sel.textColor, textSizePx: sel.textSizePx, decimals: sel.decimals,
      textBgEnabled: sel.textBgEnabled, textBgColor: sel.textBgColor, textBgAlpha: sel.textBgAlpha,
      lineColor: sel.lineColor, tickLengthM: sel.tickLengthM, labelId: sel.labelId,
    } : { ...this.measureSettings, labelId: this.activeDrawLabelId };

    r.orientation.value = s.orientation;
    r.pointCount.value = s.pointCount;
    r.editMode.value = s.editMode;
    r.extensionsToggle.checked = !!s.showExtensions;
    r.freeTextToggle.checked = !!s.useFreeText;
    r.freeTextInput.value = s.freeText || "";
    r.freeTextInput.classList.toggle("hidden", !s.useFreeText);
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

      if (this.pastePreviewActive) {
        this.canvas.style.cursor = "copy";
        if (this.input.clicked) this._commitPasteAtMouse();
      } else {
        this.activeTool.update(this.input);
      }

      this.renderer.render();
      if (this.pastePreviewActive) this._drawPastePreview(this.ctx);
      this.input.endFrame();
    } catch (err) {
      console.error("CAD tick error:", err);
      try { this.input.endFrame(); } catch (_) {}
    }
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  destroy() {
    this._destroyed = true;
    cancelAnimationFrame(this._rafId);
    if (this._snapshotTimer != null) { clearInterval(this._snapshotTimer); this._snapshotTimer = null; }
    this.input.destroy();
    this.hub.destroy();
    this.textEditor?.destroy();
    if (this._keydownHandler) window.removeEventListener("keydown", this._keydownHandler);
  }
}
