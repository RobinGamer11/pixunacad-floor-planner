import { Defaults, ToolIds, PointEditAction, SelectionType } from "./constants";
import { clamp } from "./geometry";
import { Camera } from "./Camera";
import { Input } from "./Input";
import { Scene } from "./Scene";
import { TopologyEngine } from "./TopologyEngine";
import { Renderer, Selection } from "./Renderer";
import { LineHub } from "./LineHub";
import { PointEditMenu } from "./PointEditMenu";
import { SelectTool } from "./SelectTool";
import { LineTool } from "./LineTool";

export class CadApp {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  hub: LineHub;
  pointEditMenu: PointEditMenu;

  lineSettingsPanel: HTMLDivElement;
  lineColorInput: HTMLInputElement;
  lineColorPreview: HTMLDivElement;
  lineThicknessInput: HTMLInputElement;

  defaultLineColor = Defaults.lineColor;
  defaultLineThicknessM = Defaults.lineThicknessM;

  camera: Camera;
  scene: Scene;
  input: Input;
  topology: TopologyEngine;
  renderer: Renderer;

  selectTool: SelectTool;
  lineTool: LineTool;
  activeTool: SelectTool | LineTool;

  selection: Selection | null = null;
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
    lineColorInput: HTMLInputElement,
    lineColorPreview: HTMLDivElement,
    lineThicknessInput: HTMLInputElement,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    this.hub = new LineHub(hubRoot, hubLenInput, hubAngInput);
    this.pointEditMenu = new PointEditMenu(pointEditRoot, pointEditButtons);

    this.lineSettingsPanel = lineSettingsPanel;
    this.lineColorInput = lineColorInput;
    this.lineColorPreview = lineColorPreview;
    this.lineThicknessInput = lineThicknessInput;

    this.camera = new Camera();
    this.scene = new Scene();
    this.input = new Input(canvas);
    this.topology = new TopologyEngine(this.scene, this.camera);
    this.renderer = new Renderer(this.ctx, this.camera, this.scene);

    this.selectTool = new SelectTool(this);
    this.lineTool = new LineTool(this);
    this.activeTool = this.selectTool;

    this.pointEditMenu.bindActivate((action) => {
      this.selectTool.beginPointEdit(action);
    });

    this._setupSettingsPanel();
    this._setupShortcuts();

    this._resize();
    this.camera.center(canvas.getBoundingClientRect());

    this._tick();
  }

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

  getCurrentLineStyle() {
    const selected = this.getSelectedSegment();
    if (selected) {
      return { color: selected.color || this.defaultLineColor, thicknessM: selected.thicknessM || this.defaultLineThicknessM };
    }
    return { color: this.defaultLineColor, thicknessM: this.defaultLineThicknessM };
  }

  showLineSettingsPanel(shouldShow: boolean) {
    this.lineSettingsPanel.classList.toggle("hidden", !shouldShow);
  }

  private _updateLineSettingsVisibility() {
    const shouldShow = (this.activeTool === this.lineTool) || !!(this.selection && this.selection.segmentId);
    this.showLineSettingsPanel(shouldShow);
  }

  private _setupSettingsPanel() {
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
    if (selected) { selected.color = color; } else { this.defaultLineColor = color; }
    this._syncSettingsFromContext();
  }

  private _applyLineThicknessFromInput() {
    let value = parseFloat((this.lineThicknessInput.value || "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    value = clamp(value, 0.001, 1);
    const selected = this.getSelectedSegment();
    if (selected) { selected.thicknessM = value; } else { this.defaultLineThicknessM = value; }
  }

  private _syncSettingsFromContext() {
    const style = this.getCurrentLineStyle();
    this.lineColorInput.value = this._toHexColor(style.color || Defaults.lineColor);
    this.lineColorPreview.style.background = this.lineColorInput.value;
    this.lineThicknessInput.value = String((style.thicknessM || Defaults.lineThicknessM).toFixed(3).replace(/0+$/, "").replace(/\.$/, ""));
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
          this.setTool(ToolIds.SELECT);
          return;
        }
        if (this.activeTool === this.selectTool) {
          this.selectTool.cancel();
          this.clearSelection();
          this.pointEditMenu.hide();
          return;
        }
        this.activeTool.cancel();
        this.clearSelection();
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.selection && this.selection.segmentId) {
          const seg = this.scene.getSegmentById(this.selection.segmentId);
          if (seg) {
            this.scene.removeSegment(seg);
            this.clearSelection();
            this.pointEditMenu.hide();
          }
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
