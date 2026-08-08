import * as React from "react";

/**
 * Drag-/Wisch-Scroll auf beliebigen scrollbaren Containern. Funktioniert
 * auch, wenn fast die gesamte Fläche mit Buttons belegt ist: solange die
 * Zeigergeste als echtes Ziehen erkannt wird (Schwellwert), wird gescrollt
 * und der nachfolgende Klick unterdrückt. Kurze Klicks/Taps auf Buttons
 * bleiben unverändert nutzbar.
 *
 * Rückgabe ist eine Callback-Ref: dadurch werden die Listener auch dann
 * korrekt gesetzt, wenn der Container erst später erscheint (z. B. Reiter
 * eines Projekts, das erst nach dem Mount ausgewählt wird).
 */
export function useDragScroll<T extends HTMLElement>(axis: "x" | "y" | "both" = "x") {
  const cleanupRef = React.useRef<(() => void) | null>(null);
  const axisRef = React.useRef(axis);
  axisRef.current = axis;

  const attach = React.useCallback((el: T | null) => {
    // Alte Bindung lösen (Unmount oder Element-Wechsel).
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const previousTouchAction = el.style.touchAction;
    const previousOverscrollBehavior = el.style.overscrollBehavior;
    el.style.touchAction = "none";
    el.style.overscrollBehavior = "contain";

    const THRESHOLD = 5;
    let isDown = false;
    let moved = false;
    let startX = 0, startY = 0;
    let startSL = 0, startST = 0;

    const isFormControl = (t: EventTarget | null) => {
      const node = t as HTMLElement | null;
      if (!node || !node.closest) return false;
      return !!node.closest(
        "input,select,textarea,[contenteditable='true'],[role='slider']"
      );
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (isFormControl(e.target)) return;
      isDown = true;
      moved = false;
      startX = e.clientX; startY = e.clientY;
      startSL = el.scrollLeft; startST = el.scrollTop;
      // Pointer-Capture NICHT sofort setzen, sonst gehen Klicks auf Buttons
      // im Container verloren (pointerup wird umgeleitet).
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > THRESHOLD) {
        moved = true;
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
      if (moved) {
        const ax = axisRef.current;
        if (ax !== "y") el.scrollLeft = startSL - dx;
        if (ax !== "x") el.scrollTop = startST - dy;
        e.preventDefault();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (isDown) {
        try { el.releasePointerCapture(e.pointerId); } catch {}
      }
      isDown = false;
    };
    // Nach einem echten Drag den anschließenden Klick unterdrücken.
    const onClickCapture = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };
    // Mausrad / Trackpad: vertikales Wheel auf horizontale Achse mappen.
    const onWheel = (e: WheelEvent) => {
      if (axisRef.current === "y") return;
      if (el.scrollWidth <= el.clientWidth) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      el.scrollLeft += delta;
      e.preventDefault();
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("wheel", onWheel, { passive: false });

    cleanupRef.current = () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("wheel", onWheel);
      el.style.touchAction = previousTouchAction;
      el.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, []);

  React.useEffect(() => () => { cleanupRef.current?.(); }, []);

  return attach;
}
