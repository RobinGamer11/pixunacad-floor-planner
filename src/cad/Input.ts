import { Camera } from "./Camera";

/**
 * Globale Flags aus dem Tablet-Hilfsrad:
 *  - __pixunaPenOnly:  true  → nur Stift zeichnet, Finger dient zum Pan/Pinch/Auswählen
 *  - __pixunaZoomLock: true  → Kamera ist eingefroren (kein Pan, kein Zoom)
 */
function isPenOnly(): boolean {
  return typeof window !== "undefined" && !!(window as any).__pixunaPenOnly;
}
function isZoomLocked(): boolean {
  return typeof window !== "undefined" && !!(window as any).__pixunaZoomLock;
}
/**
 * Tablet-Commit-Gate: Wenn das Tablet-Hilfsrad aktiv ist, sollen echte Stift-
 * oder Finger-Berührungen im Zeichenwerkzeug NUR die Cursor-Position aktua-
 * lisieren. Ein Punkt wird erst gesetzt, wenn im Rad "LMB" oder "Enter"
 * gedrückt wird (das feuert einen `__virtual`-PointerEvent, der hier durch-
 * gelassen wird). Für das Auswahl-Werkzeug greift der Gate nicht, damit
 * Objekte weiterhin direkt anklickbar bleiben.
 */
// Modulweiter Zustand für den "erster Klick fließt durch"-Bypass.
let _prevTabletCommit = false;
let _lastToolForGate: any = null;
let _firstDrawConsumed = false;
function isTabletDrawGate(e: PointerEvent): boolean {
  if (typeof window === "undefined") return false;
  const commit = !!(window as any).__pixunaTabletCommit;
  // Beim Einschalten des Hilfsrads oder Werkzeugwechsel wird der erste
  // reale Klick wieder freigegeben (setzt Startpunkt exakt am Stift/Finger).
  if (commit && !_prevTabletCommit) _firstDrawConsumed = false;
  _prevTabletCommit = commit;
  if (!commit) return false;
  if ((e as any).__virtual) return false;
  const t = (window as any).__pixunaActiveTool;
  if (t === "select" || t === "pipette") return false;
  if (t !== _lastToolForGate) { _lastToolForGate = t; _firstDrawConsumed = false; }
  if (!_firstDrawConsumed) { _firstDrawConsumed = true; return false; }
  return true;
}

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

  // Multi-Touch (iPad-Gesten)
  private _touches = new Map<number, { x: number; y: number }>();
  private _pinchLastDist = 0;
  private _pinchLastCenter = { x: 0, y: 0 };
  private _touchPanId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Verhindert iOS-Default-Gesten (Pinch, Doppeltipp-Zoom, Scroll).
    try { canvas.style.touchAction = "none"; } catch {}
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

    const onPointerMove = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      this.mouse.sx = e.clientX - r.left;
      this.mouse.sy = e.clientY - r.top;

      // Multi-Touch: Pinch/Two-Finger-Pan
      if (e.pointerType === "touch" && this._touches.has(e.pointerId)) {
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this._touches.size >= 2) {
          const pts = Array.from(this._touches.values()).slice(0, 2);
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          if (this._pinchLastDist > 0 && !isZoomLocked()) {
            // Zwei-Finger-Pan (Center-Bewegung)
            const dx = center.x - this._pinchLastCenter.x;
            const dy = center.y - this._pinchLastCenter.y;
            this.panDX += dx;
            this.panDY += dy;
            this.isPanning = true;
            // Pinch-Zoom als Wheel-Delta emulieren (Vorzeichen wie MouseWheel)
            const ratio = dist / this._pinchLastDist;
            // wheelDelta positiv = herauszoomen; Camera.zoomAt nutzt Math.pow(1.0015,-delta)
            const delta = -Math.log(ratio) / Math.log(1.0015);
            this.wheelDelta += delta;
            // Pivot auf Pinch-Center (relativ zu Canvas) setzen — hierfür sx/sy überschreiben.
            const rect = c.getBoundingClientRect();
            this.mouse.sx = center.x - rect.left;
            this.mouse.sy = center.y - rect.top;
          }
          this._pinchLastDist = dist;
          this._pinchLastCenter = center;
          return;
        }
        // Ein-Finger-Pan (Pen-Only-Modus)
        if (this._touchPanId === e.pointerId && this._panning) {
          this.panDX = this.mouse.sx - this._panLast.x;
          this.panDY = this.mouse.sy - this._panLast.y;
          this._panLast.x = this.mouse.sx;
          this._panLast.y = this.mouse.sy;
          if (isZoomLocked()) { this.panDX = 0; this.panDY = 0; }
        }
        return;
      }

      if (this._panning) {
        this.panDX = this.mouse.sx - this._panLast.x;
        this.panDY = this.mouse.sy - this._panLast.y;
        this._panLast.x = this.mouse.sx;
        this._panLast.y = this.mouse.sy;
        if (isZoomLocked()) { this.panDX = 0; this.panDY = 0; }
      }
    };
    c.addEventListener("pointermove", onPointerMove);
    this._cleanups.push(() => c.removeEventListener("pointermove", onPointerMove));

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isZoomLocked()) return;
      this.wheelDelta += e.deltaY;
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    this._cleanups.push(() => c.removeEventListener("wheel", onWheel));

    const onCtx = (e: MouseEvent) => e.preventDefault();
    c.addEventListener("contextmenu", onCtx);
    this._cleanups.push(() => c.removeEventListener("contextmenu", onCtx));

    const onPointerDown = (e: PointerEvent) => {
      // ── Exakte Startposition: `sx`/`sy` DIREKT aus dem Down-Event ableiten.
      // Ohne diesen Recompute nutzt Input.ts noch die alte Position vom letzten
      // pointermove. Beim ersten Touch/Pen-Kontakt gab es aber keinen vorherigen
      // Move — der Startpunkt landete an der letzten Maus-Position. Damit
      // starten Werkzeuge jetzt exakt dort, wo Stift/Finger den Bildschirm
      // berühren.
      {
        const r = c.getBoundingClientRect();
        this.mouse.sx = e.clientX - r.left;
        this.mouse.sy = e.clientY - r.top;
      }

      // ---- Touch (Finger) ----
      if (e.pointerType === "touch") {
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { c.setPointerCapture(e.pointerId); } catch {}

        // Zweiter Finger → Pinch/Pan-Modus starten, ggf. laufenden Draw abbrechen.
        if (this._touches.size >= 2) {
          this.mouse.left = false;
          this._clickQueued = false;
          this._dblQueued = false;
          if (this._touchPanId !== null) {
            this._panning = false;
            this.isPanning = false;
            this._touchPanId = null;
          }
          const pts = Array.from(this._touches.values()).slice(0, 2);
          this._pinchLastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this._pinchLastCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          return;
        }

        // Ein Finger im Pen-Only-Modus → pannen statt zeichnen.
        if (isPenOnly()) {
          this._touchPanId = e.pointerId;
          this._panning = true;
          this.isPanning = true;
          this._panLast.x = this.mouse.sx;
          this._panLast.y = this.mouse.sy;
          this.panDX = 0;
          this.panDY = 0;
          return;
        }
        // Sonst: normale "linke Maustaste"-Emulation (fällt in Block unten).
      }

      // ── Tablet-Commit-Gate: keine automatische Klick-Emission.
      if (isTabletDrawGate(e)) {
        try { c.setPointerCapture(e.pointerId); } catch {}
        return;
      }

      try { c.setPointerCapture(e.pointerId); } catch {}
      if (e.button === 0 || (e.pointerType === "touch" && e.button === -1) || e.pointerType === "pen") {
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
      if (e.pointerType === "touch") {
        this._touches.delete(e.pointerId);
        if (this._touches.size < 2) {
          this._pinchLastDist = 0;
        }
        if (this._touchPanId === e.pointerId) {
          this._touchPanId = null;
          this._panning = false;
          this.isPanning = false;
        }
      }
      if (e.button === 0 || e.pointerType === "touch" || e.pointerType === "pen") this.mouse.left = false;
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
