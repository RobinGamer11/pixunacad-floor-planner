import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Untermenü ("Flyout") der linken Werkzeugleiste.
 *
 * Die Werkzeugleiste scrollt und beschneidet ihren Inhalt (`overflow`), deshalb
 * wird das Menü per Portal an `document.body` gehängt und anhand der
 * Bildschirmposition des zugehörigen Werkzeugsymbols positioniert. Position
 * wird bei Scroll-, Größen- und Orientierungsänderungen aktualisiert.
 *
 * Öffnen/Schließen bleibt Sache des aufrufenden Werkzeugs; hier werden nur
 * ESC und Klick außerhalb an `onClose` gemeldet.
 */
export const RailFlyout: React.FC<{
  onClose?: () => void;
  children: React.ReactNode;
}> = ({ onClose, children }) => {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const measure = useCallback(() => {
    const anchor = markerRef.current?.parentElement;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const menuW = menuRef.current?.offsetWidth ?? 180;
    const menuH = menuRef.current?.offsetHeight ?? 120;
    let left = r.right + 6;
    if (left + menuW > window.innerWidth - 8) left = Math.max(8, r.left - menuW - 6);
    let top = r.top;
    if (top + menuH > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - menuH);
    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    measure();
    const onWin = () => measure();
    window.addEventListener("resize", onWin);
    window.addEventListener("orientationchange", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("orientationchange", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [measure]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (menuRef.current?.contains(t as Node)) return;
      if (markerRef.current?.parentElement?.contains(t as Node)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose]);

  return (
    <>
      <span ref={markerRef} style={{ display: "none" }} />
      {createPortal(
        <div
          ref={menuRef}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[1200] flex flex-col gap-0.5 p-1 rounded-lg shadow-xl max-h-[80vh] overflow-y-auto no-scrollbar"
          style={{
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            visibility: pos ? "visible" : "hidden",
            background: "hsl(var(--surface-card))",
            border: "1px solid hsl(var(--hairline))",
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
};

export default RailFlyout;
