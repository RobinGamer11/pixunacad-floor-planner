import { Defaults, ToolIds, PointEditAction, SelectionType } from "./constants";
import { clamp } from "./geometry";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Scene, AreaLabel } from "./Scene";
import { LabelManager } from "./LabelManager";
import { TopologyEngine } from "./TopologyEngine";
import { Renderer, Selection } from "./Renderer";
import { LineHub } from "./LineHub";
import { PointEditMenu } from "./PointEditMenu";
import { SelectTool } from "./SelectTool";
import { LineTool } from "./LineTool";
import { HatchTool } from "./HatchTool";
import { IdPanel } from "./IdPanel";

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

  defaultLineColor = Defaults.lineColor;
  defaultLineThicknessM = Defaults.lineThicknessM;
  defaultHatchFillColor = Defaults.hatchFillColor;
  defaultHatchStrokeColor = Defaults.hatchStrokeColor;
  defaultHatchStrokeWidthPx = Defaults.hatchStrokePx;
  defaultHatchFillAlphaPct = Defaults.hatchFillAlphaPct;

  camera: Camera;
  scene: Scene;
  input: Input;
  labelManager: LabelManager;
  topology: TopologyEngine;
  renderer: Renderer;

  selectTool: SelectTool;
  lineTool: LineTool;
  hatchTool: HatchTool;
  activeTool: SelectTool | LineTool | HatchTool;

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

    this.camera = new Camera();
    this.scene = new Scene();
    this.input = new Input(canvas);
    this.labelManager = new LabelManager();
    this.topology = new TopologyEngine(this.scene, this.camera, this.labelManager);
    this.renderer = new Renderer(this.ctx, this.camera, this.scene, this.labelManager);

    this.selectTool = new SelectTool(this);
    this.lineTool = new LineTool(this);
    this.hatchTool = new HatchTool(this);
    this.activeTool = this.selectTool;

    this.idPanel = new IdPanel(this, idPanelRoot, idPanelBody, idPanelList, idPanelAddBtn, idPanelToggleBtn);

    this.pointEditMenu.bindActivate((action) => {
      this.selectTool.beginPointEdit(action);
    });

    this._setupLineSettingsPanel();
    this._setupHatchSettingsPanel();
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
      })),
      hatches: this.scene.hatches.map(h => ({
        id: h.id, points: h.points.map(p => ({ x: p.x, y: p.y })),
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: { ...h.areaLabel },
      })),
      labels: this.labelManager.list().map(l => ({ ...l })),
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
    (this.scene as any)._rebuildSegIdMap?.();
    (this.scene as any)._rebuildHatchIdMap?.();
    // Re-add segments
    for (const s of data.segments || []) {
      this.scene.createSegment(s.a, s.b, { color: s.color, thicknessM: s.thicknessM, labelId: s.labelId });
    }
    // Re-add hatches
    for (const h of data.hatches || []) {
      this.scene.createHatch(h.points, {
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: h.areaLabel,
      });
    }
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
    this._updateSettingsVisibility();
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
    this.idPanel.render();
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
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

  showLineSettingsPanel(shouldShow: boolean) { this.lineSettingsPanel.classList.toggle("hidden", !shouldShow); }
  showHatchSettingsPanel(shouldShow: boolean) { this.hatchSettingsPanel.classList.toggle("hidden", !shouldShow); }

  private _updateSettingsVisibility() {
    const showLine = (this.activeTool === this.lineTool) || !!(this.selection && this.selection.segmentId) || !!this.selectedLabelId;
    const showHatch = (this.activeTool === this.hatchTool) || !!(this.selection && this.selection.hatchId) || !!this.selectedLabelId;
    this.showLineSettingsPanel(showLine);
    this.showHatchSettingsPanel(showHatch);
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

      if (this.activeTool === this.selectTool) {
        if (e.key === "Tab" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.cyclePointMenu(); return; }
        if (e.key === "Enter" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.activatePointMenu(); return; }
      }

      if (e.key === "Tab") {
        if (this.activeTool === this.lineTool) { const h = this.lineTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
        if (this.activeTool === this.hatchTool) { const h = this.hatchTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
      }

      if (e.key === "v" || e.key === "V") this.setTool(ToolIds.SELECT);
      if (e.key === "l" || e.key === "L") this.setTool(ToolIds.LINE);
      if (e.key === "h" || e.key === "H") this.setTool(ToolIds.HATCH);

      if (e.key === "Escape") {
        if (this.activeTool === this.lineTool) { this.lineTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.hatchTool) { this.hatchTool.cancel(); this.clearSelection(); this.setTool(ToolIds.SELECT); return; }
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
          this.setSelectedLabelId(null);
          this.refreshLabelUI();
        }
      }
    };
    window.addEventListener("keydown", this._keydownHandler);
  }

  setTool(id: string) {
    if (this.activeTool && this.activeTool.cancel) this.activeTool.cancel();
    if (id === ToolIds.SELECT) { this.activeTool = this.selectTool; this.selectTool.activate(); }
    else if (id === ToolIds.LINE) { this.activeTool = this.lineTool; this.lineTool.activate(); }
    else if (id === ToolIds.HATCH) { this.activeTool = this.hatchTool; this.hatchTool.activate(); }
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._updateSettingsVisibility();
    this.onToolChange?.(id);
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
      this.activeTool.update(this.input);
      this.renderer.render();
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
    if (this._keydownHandler) window.removeEventListener("keydown", this._keydownHandler);
  }
}
