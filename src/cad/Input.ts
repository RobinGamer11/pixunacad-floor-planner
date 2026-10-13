import { EMPTY_WHEEL_ZOOM_BURST, nextSmartWheelZoom } from "@/lib/projectZoom";
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
function isTabletDrawGate(e: PointerEvent): boolean {
  if (typeof window === "undefined") return false;
  const commit = !!(window as any).__pixunaTabletCommit;
  if (!commit) return false;
  if ((e as any).__virtual) return false;
  const tool = String((window as any).__pixunaActiveTool || "");
  // Freihand & Radiergummi zeichnen direkt mit dem Stift (Strich-Geste).
  if (tool === "free" || tool === "eraser") return false;
  // Auswahl-Werkzeug: nur während laufender Fangpunkt-Aktion (Verschieben/
  // Drehen/…) gaten — sonst bleiben Objekte direkt antippbar.
  if (tool === "select") {
    return !!(window as any).__pixunaSkipFirstDraw
      || !!(window as any).__pixunaSelectionTransformActive
      || !!(window as any).__pixunaDocumentTransformActive;
  }
  // Alle Zeichenwerkzeuge: Stift bewegt nur den Cursor, gesetzt wird per
  // LMB im Hilfsrad, abgeschlossen per ENTER.
  return true;
}

/**
 * Aktive Fangpunkt-Transformation im Auswahlwerkzeug (Verschieben/Drehen/…).
 * Unabhängig vom Point-Edit-Menü; nur SelectTool setzt/löscht den Status.
 */
export function setSelectionTransformActive(on: boolean) {
  if (typeof window === "undefined") return;
  (window as any).__pixunaSelectionTransformActive = !!on;
}

/**
 * "Vorerfasster Punkt": Der Stift hat im Tablet-Gate die Fläche berührt, der
 * Punkt ist aber noch nicht gesetzt. Das Hilfsrad hebt dann LMB hervor.
 */
export function setLmbHint(on: boolean) {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (!!w.__pixunaLmbHint === !!on) return;
  w.__pixunaLmbHint = !!on;
  try { window.dispatchEvent(new CustomEvent("pixuna-lmb-hint", { detail: !!on })); } catch {}
}





/**
 * Pointer-Druck wie in der Stift-Referenz: echter Druck nur bei Stiften,
 * sonst der neutrale Ersatzwert.
 */
function readPointerPressure(e: PointerEvent): number {
  if (e.pointerType === "pen" && typeof e.pressure === "number" && e.pressure > 0) {
    return Math.max(0.01, Math.min(1, e.pressure));
  }
  if (e.pointerType === "touch" && typeof e.pressure === "number" && e.pressure > 0 && e.pressure !== 0.5) {
    return Math.max(0.01, Math.min(1, e.pressure));
  }
  return 0.55;
}

export class Input {
  canvas: HTMLCanvasElement;
  mouse = { sx: 0, sy: 0, wx: 0, wy: 0, left: false, mid: false, right: false, pressure: 0.55 };
  private _keys = { shift: false, space: false };
  /** Shift/Space — das Tablet-Hilfsrad kann Shift sticky halten (globales Flag). */
  get keys() {
    const virtualShift = typeof window !== "undefined" && !!(window as any).__pixunaVirtualShift;
    return { shift: this._keys.shift || virtualShift, space: this._keys.space };
  }


  /**
   * Der Zeiger befindet sich real über der Zeichenfläche. Wird für das
   * Einfügen über die Kopfzeile gebraucht: Solange false, gibt es keine
   * gültige Cursorposition und die Kopie darf noch nicht erzeugt werden.
   */
  pointerInside = false;
  /**
   * Laufende Nummer echter Canvas-Zeigerereignisse. Ein wartender Vorgang kann
   * damit eindeutig auf ein Ereignis NACH seiner Aktivierung reagieren, statt
   * aus dem allgemeinen Hover-Zustand auf eine gültige Position zu schließen.
   */
  pointerEventSeq = 0;

  clicked = false;
  /** Echter Stift-/Finger-Kontakt, der vom Tablet-Gate abgefangen wurde. */
  tabletTapped = false;
  /** Abgefangener Stift-/Finger-Kontakt liegt gerade auf (nur Vorschau, nie Klick). */
  tabletDown = false;
  private _tabletPointerId: number | null = null;
  private _tabletTapQueued = false;
  rightClicked = false;
  doubleClicked = false;
  wheelDelta = 0;
  private _wheelBurst = { ...EMPTY_WHEEL_ZOOM_BURST };
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
  /** Pointer, der aktuell die "linke Maustaste" hält (Stift/Finger/Maus). */
  private _drawPointerId: number | null = null;
  /** Wird beim Start einer Zwei-Finger-Geste (Pinch) aufgerufen, damit die App
   *  einen laufenden Zeichenvorgang verwerfen kann statt ihn zu committen. */
  onPinchStart: (() => void) | null = null;
  /** Optional DOM annotation mode: navigation stays in Input, taps never draw. */
  canvasTapHandler: ((sx: number, sy: number) => void) | null = null;
  private _annotationTap: { id: number; x: number; y: number } | null = null;
  /**
   * Laufende Kamerageste (zwei Finger): ab dem zweiten Finger bis alle Finger
   * gelöst sind. Währenddessen werden weder Punkte gesetzt noch Aktionen
   * bestätigt; der Zeichen-Cursor bleibt an seiner Position (kein Springen).
   */
  cameraGesture = false;
  /** Drehpunkt des Pinch-Zooms (Bildschirm); null = Mausposition. */
  zoomPivot: { sx: number; sy: number } | null = null;
  /** Cursorposition vor dem ersten Fingerkontakt der Geste. */
  private _preTouchPos: { sx: number; sy: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Verhindert iOS-Default-Gesten (Pinch, Doppeltipp-Zoom, Scroll).
    try { canvas.style.touchAction = "none"; } catch {}
    this._bind();
  }

  private _bind() {
    const c = this.canvas;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") this._keys.shift = true;
      if (e.code === "Space") this._keys.space = true;
      if (e.key === "Escape" || e.key === "Enter") setLmbHint(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") this._keys.shift = false;
      if (e.code === "Space") this._keys.space = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this._cleanups.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });

    const onPointerEnter = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      this.mouse.sx = e.clientX - r.left;
      this.mouse.sy = e.clientY - r.top;
      this.pointerInside = true;
      this.pointerEventSeq += 1;
    };
    const onPointerLeave = () => { this.pointerInside = false; };
    c.addEventListener("pointerenter", onPointerEnter);
    c.addEventListener("pointerleave", onPointerLeave);
    this._cleanups.push(() => c.removeEventListener("pointerenter", onPointerEnter));
    this._cleanups.push(() => c.removeEventListener("pointerleave", onPointerLeave));

    const onPointerMove = (e: PointerEvent) => {
      // Finger einer Kamerageste bewegen nie den Zeichen-Cursor.
      if (e.pointerType === "touch" && this._touches.has(e.pointerId) && (this.cameraGesture || this._touches.size >= 2)) {
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this._handlePinchMove(c);
        return;
      }
      const r = c.getBoundingClientRect();
      this.mouse.sx = e.clientX - r.left;
      this.mouse.sy = e.clientY - r.top;
      this.mouse.pressure = readPointerPressure(e);
      this.pointerInside = true;
      this.pointerEventSeq += 1;

      // Multi-Touch: Pinch/Two-Finger-Pan
      if (e.pointerType === "touch" && this._touches.has(e.pointerId)) {
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    // (Pinch-Bewegung siehe _handlePinchMove)
    this._cleanups.push(() => c.removeEventListener("pointermove", onPointerMove));

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isZoomLocked()) return;
      // deltaMode normalisieren (Firefox meldet Zeilen/Seiten statt Pixel).
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= c.clientHeight || 800;
      if (dy === 0) return;
      const dir: 1 | -1 = dy < 0 ? 1 : -1;
      const smart = nextSmartWheelZoom(this._wheelBurst, dir, performance.now());
      this._wheelBurst = smart.burst;
      // Prozent pro Ereignis: 1 % Basis, progressiv bis 8 % — mit Deckel gegen
      // „explodierenden“ Zoom bei sehr großen Trackpad-Deltas.
      const percent = Math.abs(smart.step) * Math.min(1, Math.abs(dy) / 100);
      if (percent <= 0) return;
      this.wheelDelta += -dir * Math.log(1 + percent / 100) / Math.log(1.0015);
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
      if (e.pointerType === "touch" && this.cameraGesture) {
        // Weitere Finger während einer laufenden Geste: nur mitzählen.
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { c.setPointerCapture(e.pointerId); } catch {}
        return;
      }
      if (e.pointerType === "touch" && this._touches.size === 0) {
        this._preTouchPos = { sx: this.mouse.sx, sy: this.mouse.sy };
      }
      {
        const r = c.getBoundingClientRect();
        this.mouse.sx = e.clientX - r.left;
        this.mouse.sy = e.clientY - r.top;
        this.mouse.pressure = readPointerPressure(e);
        this.pointerInside = true;
        this.pointerEventSeq += 1;
      }

      // ── Stift-Kontakt bei aktivem Tablet-Hilfsrad: IMMER die aktuelle
      // Position als "vorgemerkten Punkt" speichern (gelbes Visier + gelbe
      // Hervorhebung von L-Klick/Enter). Muss VOR der Touch-/Pen-Only-Logik
      // stehen, damit der Kontakt nicht vorher im Pan-Zweig verschluckt wird.
      if (e.pointerType === "pen" && isTabletDrawGate(e)) {
        try { c.setPointerCapture(e.pointerId); } catch {}
        this._tabletTapQueued = true;
        this.tabletDown = true; this._tabletPointerId = e.pointerId;
        return;
      }

      // ---- Touch (Finger) ----
      if (this.canvasTapHandler && e.button === 0) {
        this._annotationTap = this._touches.size === 0
          ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
      }
      if (e.pointerType === "touch") {
        this._touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { c.setPointerCapture(e.pointerId); } catch {}

        // Zweiter Finger → Pinch/Pan-Modus starten, ggf. laufenden Draw abbrechen.
        if (this._touches.size >= 2) {
          this._annotationTap = null;
          this.mouse.left = false;
          this._drawPointerId = null;
          this._clickQueued = false;
          this._dblQueued = false;
          this._tabletTapQueued = false;
          this.tabletDown = false; this._tabletPointerId = null;
          this.cameraGesture = true;
          setLmbHint(false);
          // Cursor auf die Position vor der Geste zurück – nichts springt.
          if (this._preTouchPos) { this.mouse.sx = this._preTouchPos.sx; this.mouse.sy = this._preTouchPos.sy; }
          // Laufenden Draw verwerfen (z. B. Freihand): ein Pinch darf nie
          // einen Strich erzeugen.
          this.onPinchStart?.();
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
        if (isPenOnly() || this.canvasTapHandler) {
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
      if (this.canvasTapHandler && (e.button === 0 || e.pointerType === "pen")) {
        try { c.setPointerCapture(e.pointerId); } catch {}
        return;
      }
      if (isTabletDrawGate(e)) {
        try { c.setPointerCapture(e.pointerId); } catch {}
        this._tabletTapQueued = true;
        this.tabletDown = true; this._tabletPointerId = e.pointerId;
        return;
      }

      try { c.setPointerCapture(e.pointerId); } catch {}
      if (e.button === 0 || (e.pointerType === "touch" && e.button === -1) || e.pointerType === "pen") {
        this.mouse.left = true;
        this._drawPointerId = e.pointerId;
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
      const tap = this._annotationTap;
      if (tap?.id === e.pointerId) {
        this._annotationTap = null;
        if (e.type !== "pointercancel" && !this.cameraGesture && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 6) {
          const rect = c.getBoundingClientRect();
          this.canvasTapHandler?.(e.clientX - rect.left, e.clientY - rect.top);
        }
      }
      // Kontakte, die auf dem Tablet-Hilfsrad (oder anderer Overlay-UI) enden,
      // dürfen einen laufenden Stift-Strich nicht abbrechen.
      const tgt = e.target as Element | null;
      // Der zeichnende Pointer selbst muss aber IMMER loslassen dürfen –
      // sonst bleibt die linke Taste dauerhaft „gedrückt“ und der Verlauf hängt.
      if (tgt && typeof tgt.closest === "function" && tgt.closest('[data-tablet-aid="true"]')
        && e.pointerId !== this._drawPointerId) return;

      if (e.pointerId === this._tabletPointerId) { this.tabletDown = false; this._tabletPointerId = null; }
      if (e.pointerType === "touch") {
        this._touches.delete(e.pointerId);
        if (this._touches.size < 2) {
          this._pinchLastDist = 0;
          this.zoomPivot = null;
        }
        if (this._touches.size === 0) {
          this.cameraGesture = false;
          this._preTouchPos = null;
        }
        if (this._touchPanId === e.pointerId) {
          this._touchPanId = null;
          this._panning = false;
          this.isPanning = false;
        }
      }
      // Nur der Pointer, der die "linke Maustaste" hält, darf sie loslassen —
      // sonst beendet ein zweiter Finger den laufenden Stift-Strich.
      const isDrawRelease =
        this._drawPointerId === null || this._drawPointerId === e.pointerId || !!(e as any).__virtual;
      if (isDrawRelease && (e.button === 0 || e.pointerType === "touch" || e.pointerType === "pen")) {
        this.mouse.left = false;
        this._drawPointerId = null;
      }
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
    // Fokusverlust / verlorener Pointer-Capture: keinen gedrückten Zustand zurücklassen.
    const releaseAll = () => {
      this._annotationTap = null;
      this.mouse.left = false; this.mouse.mid = false; this.mouse.right = false;
      this._drawPointerId = null; this._touches.clear(); this._touchPanId = null;
      this._pinchLastDist = 0; this._panning = false; this.isPanning = false;
      this.cameraGesture = false; this.zoomPivot = null; this._preTouchPos = null;
      this.tabletDown = false; this._tabletPointerId = null;
    };
    const onLostCapture = (e: PointerEvent) => { if (e.pointerId === this._drawPointerId) { this.mouse.left = false; this._drawPointerId = null; } };
    const onVis = () => { if (document.hidden) releaseAll(); };
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVis);
    c.addEventListener("lostpointercapture", onLostCapture);
    this._cleanups.push(() => window.removeEventListener("blur", releaseAll));
    this._cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
    this._cleanups.push(() => c.removeEventListener("lostpointercapture", onLostCapture));
    this._cleanups.push(() => window.removeEventListener("pointercancel", onPointerUp));

    const onAux = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    c.addEventListener("auxclick", onAux);
    this._cleanups.push(() => c.removeEventListener("auxclick", onAux));

  }

  /** Zwei-Finger-Pan + Pinch-Zoom; verändert nur die Kamera, nie den Cursor. */
  private _handlePinchMove(c: HTMLCanvasElement) {
    if (this._touches.size < 2) return;
    const pts = Array.from(this._touches.values()).slice(0, 2);
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    if (this._pinchLastDist > 0 && !isZoomLocked()) {
      this.panDX += center.x - this._pinchLastCenter.x;
      this.panDY += center.y - this._pinchLastCenter.y;
      this.isPanning = true;
      // wheelDelta positiv = herauszoomen; Camera.zoomAt nutzt Math.pow(1.0015,-delta)
      this.wheelDelta += -Math.log(dist / this._pinchLastDist) / Math.log(1.0015);
      const rect = c.getBoundingClientRect();
      this.zoomPivot = { sx: center.x - rect.left, sy: center.y - rect.top };
    }
    this._pinchLastDist = dist;
    this._pinchLastCenter = center;
  }

  update(camera: Camera) {
    const w = camera.screenToWorld(this.mouse.sx, this.mouse.sy);
    this.mouse.wx = w.x;
    this.mouse.wy = w.y;

    this.clicked = false;
    this.rightClicked = false;
    this.doubleClicked = false;
    this.tabletTapped = this._tabletTapQueued;
    this._tabletTapQueued = false;
    // Vorerfasster Punkt: Stift-Kontakt im Gate → LMB im Rad leuchtet.
    if (this.tabletTapped) setLmbHint(true);

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
    // Während einer Kamerageste: keine Punkte, keine Bestätigungen.
    if (this.cameraGesture) {
      this.clicked = false; this.doubleClicked = false; this.tabletTapped = false;
      this.mouse.left = false;
      return;
    }
    if (this.clicked || this.doubleClicked) setLmbHint(false);
  }


  endFrame() {
    this.wheelDelta = 0;
    if (!this.cameraGesture) this.isPanning = this._panning;
    this.panDX = 0;
    this.panDY = 0;
  }

  destroy() {
    for (const fn of this._cleanups) fn();
    this._cleanups = [];
  }
}
