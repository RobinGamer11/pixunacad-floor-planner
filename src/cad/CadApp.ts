import { Defaults, ToolIds, PointEditAction, SelectionType } from "./constants";
import { clamp } from "./geometry";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Scene } from "./Scene";
import { LabelManager } from "./LabelManager";
import { TopologyEngine } from "./TopologyEngine";
import { Renderer, Selection } from "./Renderer";
import { LineHub } from "./LineHub";
import { PointEditMenu } from "./PointEditMenu";
import { SelectTool } from "./SelectTool";
import { LineTool } from "./LineTool";
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

  defaultLineColor = Defaults.lineColor;
  defaultLineThicknessM = Defaults.lineThicknessM;

  camera: Camera;
  scene: Scene;
  input: Input;
  labelManager: LabelManager;
  topology: TopologyEngine;
  renderer: Renderer;

  selectTool: SelectTool;
  lineTool: LineTool;
  activeTool: SelectTool | LineTool;

  idPanel: IdPanel;

  selection: Selection | null = null;
  selectedLabelId: string | null = null;
  activeDrawLabelId: string = Defaults.defaultLabelId;

  private _btnMap = new Map<string, HTMLButtonElement>();
  private _rafId = 0;
  private _destroyed = false;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  onToolChange?: (toolId: string) => void;

  constructor(
    canvas: HTMLCanvasElement,
    hubRoot: HTMLDivElement,
    hubLenInput: HTMLInputElement,
    hubAngInput: HTMLInputElement,
    pointEditRoot: HTMLDivElement,
    pointEditButtons: Record<string, HTMLButtonElement>,
    lineSettingsPanel: HTMLDivElement,
    lineIdSelect: HTMLSelectElement,
    lineColorInput: HTMLInputElement,
    lineColorPreview: HTMLDivElement,
    lineThicknessInput: HTMLInputElement,
    idPanelRoot: HTMLDivElement,
    idPanelBody: HTMLDivElement,
    idPanelList: HTMLDivElement,
    idPanelAddBtn: HTMLButtonElement,
    idPanelToggleBtn: HTMLButtonElement,
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

    this.camera = new Camera();
    this.scene = new Scene();
    this.input = new Input(canvas);
    this.labelManager = new LabelManager();
    this.topology = new TopologyEngine(this.scene, this.camera, this.labelManager);
    this.renderer = new Renderer(this.ctx, this.camera, this.scene, this.labelManager);

    this.selectTool = new SelectTool(this);
    this.lineTool = new LineTool(this);
    this.activeTool = this.selectTool;

    this.idPanel = new IdPanel(this, idPanelRoot, idPanelBody, idPanelList, idPanelAddBtn, idPanelToggleBtn);

    this.pointEditMenu.bindActivate((action) => {
      this.selectTool.beginPointEdit(action);
    });

    this._setupSettingsPanel();
    this._setupShortcuts();

    this.refreshLabelUI();

    this._resize();
    this.camera.center(canvas.getBoundingClientRect());

    this._tick();
  }

  /* ---- Selection ---- */
  setSelection(selection: Selection | null) {
    this.selection = selection;
    this.renderer.setSelection(selection);
    this._syncSettingsFromContext();
    this._updateLineSettingsVisibility();
  }

  clearSelection() { this.setSelection(null); }

  getSelectedSegment() {
    if (!this.selection || !this.selection.segmentId) return null;
    return this.scene.getSegmentById(this.selection.segmentId);
  }

  /* ---- Label Selection ---- */
  setSelectedLabelId(labelId: string | null) {
    this.selectedLabelId = labelId || null;
    this.renderer.setSelectedLabelId(this.selectedLabelId);
    this.idPanel.render();
    this._syncSettingsFromContext();
    this._updateLineSettingsVisibility();
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
    this.idPanel.render();
    this._syncSettingsFromContext();
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

  /* ---- Selected objects ---- */
  getSelectedObjectIds(): string[] {
    const selected = this.getSelectedSegment();
    if (selected) return [selected.id];
    if (this.selectedLabelId) {
      return this.scene.getSegmentsByLabelId(this.selectedLabelId).map(s => s.id);
    }
    return [];
  }

  getSelectedGroupSegments() {
    if (!this.selectedLabelId) return [];
    return this.scene.getSegmentsByLabelId(this.selectedLabelId);
  }

  getCurrentLineStyle() {
    const selected = this.getSelectedSegment();
    if (selected) {
      return {
        color: selected.color || this.defaultLineColor,
        thicknessM: selected.thicknessM || this.defaultLineThicknessM,
        labelId: selected.labelId || Defaults.defaultLabelId,
      };
    }

    const groupSegs = this.getSelectedGroupSegments();
    if (groupSegs.length > 0) {
      const ref = groupSegs[0];
      return {
        color: ref.color || this.defaultLineColor,
        thicknessM: ref.thicknessM || this.defaultLineThicknessM,
        labelId: ref.labelId || Defaults.defaultLabelId,
      };
    }

    return {
      color: this.defaultLineColor,
      thicknessM: this.defaultLineThicknessM,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  showLineSettingsPanel(shouldShow: boolean) {
    this.lineSettingsPanel.classList.toggle("hidden", !shouldShow);
  }

  private _updateLineSettingsVisibility() {
    const shouldShow = (this.activeTool === this.lineTool) || !!(this.selection && this.selection.segmentId) || !!this.selectedLabelId;
    this.showLineSettingsPanel(shouldShow);
  }

  /* ---- Settings Panel ---- */
  private _setupSettingsPanel() {
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

    this.lineColorInput.addEventListener("input", () => {
      this._applyLineColor(this.lineColorInput.value);
    });
    this.lineThicknessInput.addEventListener("input", () => {
      this._applyLineThicknessFromInput();
    });
    this.lineThicknessInput.addEventListener("blur", () => {
      this._syncSettingsFromContext();
    });
    this._syncSettingsFromContext();
    this._updateLineSettingsVisibility();
  }

  private _applyLineColor(color: string) {
    const selected = this.getSelectedSegment();
    if (selected) { selected.color = color; }
    else {
      const groupSegs = this.getSelectedGroupSegments();
      if (groupSegs.length > 0) {
        for (const seg of groupSegs) seg.color = color;
      } else {
        this.defaultLineColor = color;
      }
    }
    this._syncSettingsFromContext();
  }

  private _applyLineThicknessFromInput() {
    let value = parseFloat((this.lineThicknessInput.value || "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    value = clamp(value, 0.001, 1);
    const selected = this.getSelectedSegment();
    if (selected) { selected.thicknessM = value; return; }
    const groupSegs = this.getSelectedGroupSegments();
    if (groupSegs.length > 0) {
      for (const seg of groupSegs) seg.thicknessM = value;
      return;
    }
    this.defaultLineThicknessM = value;
  }

  private _syncSettingsFromContext() {
    const style = this.getCurrentLineStyle();
    this.lineColorInput.value = this._toHexColor(style.color || Defaults.lineColor);
    this.lineColorPreview.style.background = this.lineColorInput.value;
    this.lineThicknessInput.value = String((style.thicknessM || Defaults.lineThicknessM).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));

    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId))
        ? this.selectedLabelId
        : (style.labelId || this.activeDrawLabelId || Defaults.defaultLabelId);

    if (this.labelManager.getById(labelForDisplay)) {
      this.lineIdSelect.value = labelForDisplay;
    } else {
      this.lineIdSelect.value = Defaults.defaultLabelId;
    }
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
      if ((tag === "input" || tag === "textarea" || tag === "select") && !isHubInput) return;

      if (this.activeTool === this.selectTool) {
        if (e.key === "Tab" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.cyclePointMenu(); return; }
        if (e.key === "Enter" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.activatePointMenu(); return; }
      }

      if (e.key === "Tab") {
        if (this.activeTool === this.lineTool) {
          const handled = this.lineTool.onTabRequest();
          if (handled) { e.preventDefault(); return; }
        }
      }

      if (e.key === "v" || e.key === "V") this.setTool(ToolIds.SELECT);
      if (e.key === "l" || e.key === "L") this.setTool(ToolIds.LINE);

      if (e.key === "Escape") {
        if (this.activeTool === this.lineTool) {
          this.lineTool.cancel();
          this.clearSelection();
          this.setSelectedLabelId(null);
          this.setTool(ToolIds.SELECT);
          return;
        }
        if (this.activeTool === this.selectTool) {
          this.selectTool.cancel();
          this.clearSelection();
          this.setSelectedLabelId(null);
          this.pointEditMenu.hide();
          return;
        }
        this.activeTool.cancel();
        this.clearSelection();
        this.setSelectedLabelId(null);
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.selection && this.selection.segmentId) {
          const seg = this.scene.getSegmentById(this.selection.segmentId);
          if (seg) {
            this.scene.removeSegment(seg);
            this.clearSelection();
            this.pointEditMenu.hide();
            this.refreshLabelUI();
          }
          return;
        }
        if (this.selectedLabelId) {
          this.scene.removeSegmentsByLabelId(this.selectedLabelId);
          this.setSelectedLabelId(null);
          this.refreshLabelUI();
        }
      }
    };
    window.addEventListener("keydown", this._keydownHandler);
  }

  setTool(id: string) {
    if (this.activeTool && this.activeTool.cancel) this.activeTool.cancel();

    if (id === ToolIds.SELECT) {
      this.activeTool = this.selectTool;
      this.selectTool.activate();
    } else if (id === ToolIds.LINE) {
      this.activeTool = this.lineTool;
      this.lineTool.activate();
    }

    this._syncSettingsFromContext();
    this._updateLineSettingsVisibility();
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
    this.input.destroy();
    this.hub.destroy();
    if (this._keydownHandler) {
      window.removeEventListener("keydown", this._keydownHandler);
    }
  }
}
