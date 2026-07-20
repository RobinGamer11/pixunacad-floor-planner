import * as React from "react";

/**
 * Ermöglicht horizontales „Scrollen" per Maus-Drag oder Touch-Wisch auf
 * einem beliebigen scrollbaren Container. Klicks auf interaktive Elemente
 * (Buttons, Links, Inputs) werden nicht blockiert — nur echte Drag-Gesten
 * auf leerer Fläche verschieben den Scrollbereich.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let moved = false;
    let startX = 0;
    let startScroll = 0;

    const onDown = (e: PointerEvent) => {
      // Nur mit Primärtaste oder Touch/Pen. Buttons/Inputs nicht kapern.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target as HTMLElement;
      if (target.closest("button,a,input,select,textarea,[role='button']")) return;
      isDown = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      if (moved) {
        el.scrollLeft = startScroll - dx;
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
  }, []);

  return ref;
}
