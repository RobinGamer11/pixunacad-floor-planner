import { Camera } from "./Camera";

export class Input {
  canvas: HTMLCanvasElement;
  mouse = { sx: 0, sy: 0, wx: 0, wy: 0, left: false, mid: false, right: false };
  keys = { shift: false, space: false };

  clicked = false;
  rightClicked = false;
  doubleClicked = false;
  wheelDelta = 0;
  isPanning = false;
  panDX = 0;
  panDY = 0;

  private _lastClickT = 0;
  private _doubleMs = 260;
  private _clickQueued = false;
  private _rightQueued = false;
  private _dblQueued = false;
  private _panning = false;
  private _panLast = { x: 0, y: 0 };
  private _cleanups: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this._bind();
  }

  private _bind() {
    const c = this.canvas;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") this.keys.shift = true;
      if (e.code === "Space") this.keys.space = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") this.keys.shift = false;
      if (e.code === "Space") this.keys.space = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this._cleanups.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });

    // Aktive Touch-Pointer zählen, damit Ein-Finger-Drag als Klick/Draw wirkt,
    // aber Multi-Touch (Pinch/Pan) an höhere Handler durchgereicht wird.
    const activePointers = new Set<number>();

    const onPointerMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      this.mouse.sx = e.clientX - r.left;
      this.mouse.sy = e.clientY - r.top;
      if (this._panning) {
        this.panDX = this.mouse.sx - this._panLast.x;
        this.panDY = this.mouse.sy - this._panLast.y;
        this._panLast.x = this.mouse.sx;
        this._panLast.y = this.mouse.sy;
      }
    };
    c.addEventListener("pointermove", onPointerMove);
    this._cleanups.push(() => c.removeEventListener("pointermove", onPointerMove));

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    this._cleanups.push(() => c.removeEventListener("wheel", onWheel));

    const onCtx = (e: MouseEvent) => e.preventDefault();
    c.addEventListener("contextmenu", onCtx);
    this._cleanups.push(() => c.removeEventListener("contextmenu", onCtx));

    const onPointerDown = (e: PointerEvent) => {
      // Zwei-Finger-Geste: an Pinch/Pan-Handler abgeben.
      if (e.pointerType === "touch") {
        activePointers.add(e.pointerId);
        if (activePointers.size > 1) {
          // Wenn bereits ein Ein-Finger-Drag lief, abbrechen.
          this.mouse.left = false;
          this._clickQueued = false;
          this._dblQueued = false;
          return;
        }
      }
      try { c.setPointerCapture(e.pointerId); } catch {}
      if (e.button === 0 || (e.pointerType === "touch" && e.button === -1)) {
        this.mouse.left = true;
        const now = performance.now();
        if (now - this._lastClickT <= this._doubleMs) {
          this._dblQueued = true;
          this._clickQueued = false;
        } else {
          this._clickQueued = true;
        }
        this._lastClickT = now;
      }
      if (e.button === 1) {
        this.mouse.mid = true;
        this._panning = true;
        this.isPanning = true;
        this._panLast.x = this.mouse.sx;
        this._panLast.y = this.mouse.sy;
        this.panDX = 0;
        this.panDY = 0;
      }
      if (e.button === 2) {
        this.mouse.right = true;
        this._rightQueued = true;
        e.preventDefault();
      }
    };
    c.addEventListener("pointerdown", onPointerDown);
    this._cleanups.push(() => c.removeEventListener("pointerdown", onPointerDown));

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") activePointers.delete(e.pointerId);
      if (e.button === 0 || e.pointerType === "touch") this.mouse.left = false;
      if (e.button === 1) {
        this.mouse.mid = false;
        this._panning = false;
        this.isPanning = false;
      }
      if (e.button === 2) this.mouse.right = false;
      try { c.releasePointerCapture(e.pointerId); } catch {}
    };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    this._cleanups.push(() => window.removeEventListener("pointerup", onPointerUp));
    this._cleanups.push(() => window.removeEventListener("pointercancel", onPointerUp));

    const onAux = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    c.addEventListener("auxclick", onAux);
    this._cleanups.push(() => c.removeEventListener("auxclick", onAux));

  }

  update(camera: Camera) {
    const w = camera.screenToWorld(this.mouse.sx, this.mouse.sy);
    this.mouse.wx = w.x;
    this.mouse.wy = w.y;

    this.clicked = false;
    this.rightClicked = false;
    this.doubleClicked = false;

    if (this._dblQueued) {
      this.doubleClicked = true;
      this._dblQueued = false;
      this._clickQueued = false;
    } else if (this._clickQueued) {
      this.clicked = true;
      this._clickQueued = false;
    }
    if (this._rightQueued) {
      this.rightClicked = true;
      this._rightQueued = false;
    }
  }

  endFrame() {
    this.wheelDelta = 0;
    this.panDX = 0;
    this.panDY = 0;
  }

  destroy() {
    for (const fn of this._cleanups) fn();
    this._cleanups = [];
  }
}
