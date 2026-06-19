/**
 * MiniCad — lightweight host for the CAD engine inside the page editor.
 *
 * Reuses the *exact* CAD engine modules (Scene, Camera, Input, TopologyEngine,
 * Renderer, LineHub, PointEditMenu, LineTool) so that drawing behavior on the
 * page canvas is 1:1 identical to the standalone CAD editor — same snapping,
 * ortho, hub (length/angle input), guides, point-edit.
 *
 * The fat surroundings of the full CadApp (toolbar, IdPanel, SheetPanel,
 * PlanPanel, TextEditor, sticker library, undo history, etc.) are deliberately
 * NOT instantiated. LineTool only touches a small handful of CadApp fields;
 * MiniCad provides those (`scene`, `camera`, `input`, `topology`, `renderer`,
 * `hub`, `pointEditMenu`, `getCurrentLineStyle()`, `clearSelection()`,
 * `refreshLabelUI()`) and stubs out anything else so the tool runs unmodified.
 *
 * Coordinate convention (matches CAD engine): 1 world unit = 1 meter.
 * The page is laid out so that page top-left = world (0, 0), and 1 mm on the
 * page = 1/1000 world units. The page-editor's view zoom is applied via CSS
 * on the parent element; the canvas itself is sized to the *scaled* page
 * pixel dimensions so geometry stays crisp.
 */

import { Camera } from "../Camera";
import { Scene } from "../Scene";
import { Input } from "../Input";
import { LabelManager } from "../LabelManager";
import { TopologyEngine } from "../TopologyEngine";
import { Renderer } from "../Renderer";
import { LineHub } from "../LineHub";
import { PointEditMenu } from "../PointEditMenu";
import { LineTool } from "../LineTool";
import { Defaults } from "../constants";

export interface MiniCadDom {
  canvas: HTMLCanvasElement;
  hubRoot: HTMLDivElement;
  hubLenInput: HTMLInputElement;
  hubAngInput: HTMLInputElement;
  pointEditRoot: HTMLDivElement;
  pointEditButtons: Record<string, HTMLButtonElement>;
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
  /** Initial line color / thickness defaults. */
  defaultLineColor?: string;
  defaultLineThicknessM?: number;
  /** Called whenever scene geometry changes (debounced caller's choice). */
  onChange?: () => void;
  /** Initial serialized state. */
  initialState?: any;
}

export type MiniTool = "line" | null;

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

  // Stubs required by tools but not used in the page editor.
  activeDrawLabelId = Defaults.defaultLabelId;
  defaultLineColor: string;
  defaultLineThicknessM: number;
  /** Linien-Transparenz 0..1 (1 = vollständig deckend). */
  defaultLineAlpha = 1;

  // Page geometry.
  pageWidthMm: number;
  pageHeightMm: number;
  basePxPerMm: number;
  private _zoom: number;

  /** Spezielle Label-ID für die unsichtbaren Page-Frame-Segmente (Snap-Ziel). */
  private _frameLabelId = "__page_frame__";

  private _activeTool: MiniTool = null;
  private _rafId: number | null = null;
  private _destroyed = false;
  private _segmentCountLast = 0;
  private _onChange?: () => void;
  private _coordCleanups: Array<() => void> = [];

  constructor(init: MiniCadInit) {
    this.dom = init.dom;
    this.pageWidthMm = init.pageWidthMm;
    this.pageHeightMm = init.pageHeightMm;
    this.basePxPerMm = init.basePxPerMm;
    this._zoom = init.initialZoom;
    this._onChange = init.onChange;
    this.defaultLineColor = init.defaultLineColor ?? Defaults.lineColor;
    this.defaultLineThicknessM = init.defaultLineThicknessM ?? Defaults.lineThicknessM;

    // Core engine — identical to CadApp wiring (CadApp.ts lines 347–357).
    this.camera = new Camera();
    this.scene = new Scene();
    this.input = new Input(this.dom.canvas);
    this.labelManager = new LabelManager();
    this.topology = new TopologyEngine(this.scene, this.camera, this.labelManager);
    const ctx = this.dom.canvas.getContext("2d")!;
    this.renderer = new Renderer(ctx, this.camera, this.scene, this.labelManager);

    // Strip the renderer's white background + grid + plan stuff. We want a
    // transparent overlay that draws only geometry + tool preview overlay.
    this._patchRendererTransparent();

    // UI hubs (also identical to CadApp).
    this.hub = new LineHub(this.dom.hubRoot, this.dom.hubLenInput, this.dom.hubAngInput);
    this.pointEditMenu = new PointEditMenu(this.dom.pointEditRoot, this.dom.pointEditButtons);

    // The tool.
    this.lineTool = new LineTool(this as any);

    // Coordinate mapping: the canvas can be CSS-scaled by the parent. Override
    // Input's last-known mouse position with the canvas-internal pixel value
    // after every mousemove the browser fires on the canvas.
    this._installCoordRemap();

    // Resize + camera setup.
    this.applyZoom(this._zoom);

    // Register the invisible page-frame as snap geometry (4 segments at the
    // page edges). The frame is hidden from rendering by filtering its label
    // out of labelManager.list(), but stays visible to TopologyEngine because
    // isVisible(frameLabelId) still returns true.
    this._installPageFrameSnap();

    // Restore state, if any.
    if (init.initialState) this._restore(init.initialState);
    this._segmentCountLast = this.scene.segments.length;

    // Start the animation loop.
    this._tick();
  }

  /** Returns true if a segment is part of the invisible page frame. */
  isFrameSegment(seg: { labelId?: string }): boolean {
    return seg.labelId === this._frameLabelId;
  }

  private _installPageFrameSnap() {
    // 1) Register a dedicated label that *exists* and is *visible* (so the
    //    topology engine includes its segments in snap queries), but hide it
    //    from labelManager.list() so the renderer never iterates it.
    const lm: any = this.labelManager;
    lm.groups.push({ id: this._frameLabelId, name: "__page_frame__", locked: true, visible: true });
    const origList = lm.list.bind(lm);
    lm.list = () => origList().filter((g: any) => g.id !== this._frameLabelId);

    // 2) Build the 4 frame segments.
    this._rebuildPageFrame();
  }

  private _rebuildPageFrame() {
    // Remove any previously created frame segs.
    this.scene.segments = this.scene.segments.filter((s) => s.labelId !== this._frameLabelId);
    const wM = this.pageWidthMm / 1000;
    const hM = this.pageHeightMm / 1000;
    const style = {
      color: "rgba(0,0,0,0)",
      thicknessM: 0.0001,
      labelId: this._frameLabelId,
    };
    try {
      this.scene.createSegment({ x: 0, y: 0 }, { x: wM, y: 0 }, style);
      this.scene.createSegment({ x: wM, y: 0 }, { x: wM, y: hM }, style);
      this.scene.createSegment({ x: wM, y: hM }, { x: 0, y: hM }, style);
      this.scene.createSegment({ x: 0, y: hM }, { x: 0, y: 0 }, style);
    } catch (e) {
      console.error("MiniCad: page-frame segment creation failed:", e);
    }
  }

  /* ===== Public API ===== */

  setActiveTool(tool: MiniTool) {
    if (this._activeTool === tool) return;
    // Deactivate previous.
    if (this._activeTool === "line") this.lineTool.cancel();
    this._activeTool = tool;
    if (tool === "line") this.lineTool.activate();
  }

  setLineDefaults(opts: { color?: string; thicknessM?: number; alpha?: number }) {
    if (opts.color) this.defaultLineColor = opts.color;
    if (typeof opts.thicknessM === "number" && opts.thicknessM > 0) {
      this.defaultLineThicknessM = opts.thicknessM;
    }
    if (typeof opts.alpha === "number" && opts.alpha >= 0 && opts.alpha <= 1) {
      this.defaultLineAlpha = opts.alpha;
    }
  }

  applyZoom(zoom: number) {
    this._zoom = zoom;
    const cssW = this.pageWidthMm * this.basePxPerMm * zoom;
    const cssH = this.pageHeightMm * this.basePxPerMm * zoom;
    const c = this.dom.canvas;
    // Set both internal pixel buffer and CSS size; no DPR scaling for simplicity.
    if (c.width !== Math.round(cssW)) c.width = Math.max(1, Math.round(cssW));
    if (c.height !== Math.round(cssH)) c.height = Math.max(1, Math.round(cssH));
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;

    this.renderer.setViewport(c.width, c.height);
    // Camera: world origin (0,0) at top-left; 1m world = basePxPerMm * 1000 * zoom screen px.
    this.camera.scale = this.basePxPerMm * 1000 * zoom;
    this.camera.offsetX = 0;
    this.camera.offsetY = 0;
  }

  serialize(): any {
    return {
      version: 1,
      // Filter out invisible page-frame segments — they are regenerated on mount.
      segments: this.scene.segments
        .filter((s) => s.labelId !== this._frameLabelId)
        .map((s) => ({
          id: s.id,
          a: { x: s.a.x, y: s.a.y },
          b: { x: s.b.x, y: s.b.y },
          color: s.color,
          thicknessM: s.thicknessM,
          labelId: s.labelId,
        })),
    };
  }

  private _restore(data: any) {
    if (!data || !Array.isArray(data.segments)) return;
    for (const s of data.segments) {
      // Defensive: never restore frame segments — they live only in memory.
      if (s.labelId === this._frameLabelId) continue;
      try {
        this.scene.createSegment(
          { x: s.a.x, y: s.a.y },
          { x: s.b.x, y: s.b.y },
          { color: s.color || this.defaultLineColor, thicknessM: s.thicknessM || this.defaultLineThicknessM, labelId: s.labelId || Defaults.defaultLabelId },
        );
      } catch (e) {
        console.error("MiniCad restore segment failed:", e);
      }
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._rafId != null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
    try { this.input.destroy(); } catch {}
    try { this.hub.destroy(); } catch {}
    for (const fn of this._coordCleanups) {
      try { fn(); } catch {}
    }
    this._coordCleanups = [];
  }

  /* ===== Required CadApp surface for LineTool / Renderer ===== */

  getCurrentLineStyle() {
    // Encode the line alpha into the color (rgba), so we don't need to patch
    // the renderer — strokeStyle honors the alpha channel directly.
    const color = applyAlphaToColor(this.defaultLineColor, this.defaultLineAlpha);
    return {
      color,
      thicknessM: this.defaultLineThicknessM,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  clearSelection() {
    // No selection model in the page-embedded engine yet.
  }

  refreshLabelUI() {
    // No label panel in the page editor. Trigger persistence on geometry change.
    if (this.scene.segments.length !== this._segmentCountLast) {
      this._segmentCountLast = this.scene.segments.length;
      this._onChange?.();
    }
  }

  /* ===== Internals ===== */

  private _patchRendererTransparent() {
    const r: any = this.renderer;
    r.render = function () {
      const ctx: CanvasRenderingContext2D = this.ctx;
      ctx.save();
      ctx.clearRect(0, 0, this.vw, this.vh);
      // Reuse the renderer's internals to draw geometry the same way the
      // standalone editor does. These are private TS methods but exist at
      // runtime — we deliberately call them by name to stay 1:1 visually.
      try { this._drawByLabelOrder?.(); } catch (e) { console.error(e); }
      try { this._drawSegmentSelection?.(); } catch {}
      try { this._drawHoverSegmentPoints?.(); } catch {}
      if (this.overlay && this.overlay.draw) {
        try { this.overlay.draw(ctx, this.camera); } catch (e) { console.error(e); }
      }
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
    // Fires AFTER Input's own mousemove handler (Input binds in its constructor,
    // which we called before this), so our values overwrite the visual-pixel
    // ones with canvas-internal pixels.
    c.addEventListener("mousemove", remap);
    c.addEventListener("mousedown", remap);
    this._coordCleanups.push(() => c.removeEventListener("mousemove", remap));
    this._coordCleanups.push(() => c.removeEventListener("mousedown", remap));
  }

  private _tick = () => {
    if (this._destroyed) return;
    try {
      // Suppress engine pan/zoom — page zoom is owned by the React parent.
      this.input.wheelDelta = 0;
      this.input.panDX = 0;
      this.input.panDY = 0;

      this.input.update(this.camera);

      if (this._activeTool === "line") {
        this.lineTool.update(this.input);
      }

      // Persist on geometry change.
      if (this.scene.segments.length !== this._segmentCountLast) {
        this._segmentCountLast = this.scene.segments.length;
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
}

/* ============ Helpers ============ */

/**
 * Applies an alpha (0..1) to any CSS color string and returns an rgba(...)
 * string. Supports #rgb / #rrggbb / rgb(...) / rgba(...). Falls back to the
 * original color if parsing fails (so behavior matches the CAD engine).
 */
function applyAlphaToColor(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  const a = Math.max(0, Math.min(1, alpha));
  const c = (color || "").trim();
  // #rgb
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (m) {
    const r = parseInt(m[1] + m[1], 16);
    const g = parseInt(m[2] + m[2], 16);
    const b = parseInt(m[3] + m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  // #rrggbb
  m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (m) {
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
  }
  // rgb(r,g,b) or rgba(r,g,b,a) — replace/append alpha
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(c);
  if (m) {
    return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  }
  return c;
}
