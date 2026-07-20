import * as React from "react";

/**
 * Drag-/Wisch-Scroll auf beliebigen scrollbaren Containern. Funktioniert
 * auch, wenn fast die gesamte Fläche mit Buttons belegt ist: solange die
 * Zeigergeste als echtes Ziehen erkannt wird (Schwellwert), wird gescrollt
 * und der nachfolgende Klick unterdrückt. Kurze Klicks/Taps auf Buttons
 * bleiben unverändert nutzbar.
 */
export function useDragScroll<T extends HTMLElement>(axis: "x" | "y" | "both" = "x") {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    const el = ref.current;
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
      const el = t as HTMLElement | null;
      if (!el || !el.closest) return false;
      return !!el.closest(
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
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > THRESHOLD) moved = true;
      if (moved) {
        if (axis !== "y") el.scrollLeft = startSL - dx;
        if (axis !== "x") el.scrollTop = startST - dy;
        e.preventDefault();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (isDown) {
        try { el.releasePointerCapture(e.pointerId); } catch {}
      }
      isDown = false;
    };
    // Nach einem echten Drag den anschließenden Klick unterdrücken,
    // damit Buttons im Header/Panel nicht aus Versehen ausgelöst werden.
    const onClickCapture = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClickCapture, true);
      el.style.touchAction = previousTouchAction;
      el.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [axis]);

  return ref;
}
