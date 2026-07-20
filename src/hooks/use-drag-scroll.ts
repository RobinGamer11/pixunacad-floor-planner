import * as React from "react";

/**
 * Ermöglicht horizontales „Scrollen" per Maus-Drag oder Touch-Wisch auf
 * einem beliebigen scrollbaren Container. Klicks auf interaktive Elemente
 * (Buttons, Links, Inputs) werden nicht blockiert — nur echte Drag-Gesten
 * auf leerer Fläche verschieben den Scrollbereich.
 */
export function useDragScroll<T extends HTMLElement>(axis: "x" | "y" | "both" = "x") {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let moved = false;
    let startX = 0, startY = 0;
    let startSL = 0, startST = 0;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target as HTMLElement;
      if (target.closest("button,a,input,select,textarea,label,[role='button'],[role='slider'],[contenteditable='true']")) return;
      isDown = true;
      moved = false;
      startX = e.clientX; startY = e.clientY;
      startSL = el.scrollLeft; startST = el.scrollTop;
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 4) moved = true;
      if (moved) {
        if (axis !== "y") el.scrollLeft = startSL - dx;
        if (axis !== "x") el.scrollTop = startST - dy;
        e.preventDefault();
      }
    };
    const onUp = () => { isDown = false; };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [axis]);

  return ref;
}
