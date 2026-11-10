import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

type Edges = { a: boolean; b: boolean; rect: DOMRect | null };

/**
 * Dezente Scroll-Hinweise (Verlauf + Pfeil) am Rand eines scrollbaren Containers.
 * Rein visuell (pointer-events: none), als fixierte Ebene über dem Container,
 * damit Buttons darunter bedienbar bleiben und Wischen unverändert funktioniert.
 */
export function ScrollEdgeHints({ target, axis }: { target: HTMLElement | null; axis: "x" | "y" }) {
  const [s, setS] = useState<Edges>({ a: false, b: false, rect: null });
  useEffect(() => {
    if (!target) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = target.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && getComputedStyle(target).display !== "none";
        const pos = axis === "x" ? target.scrollLeft : target.scrollTop;
        const max = axis === "x" ? target.scrollWidth - target.clientWidth : target.scrollHeight - target.clientHeight;
        const a = visible && max > 1 && pos > 1;
        const b = visible && max > 1 && pos < max - 1;
        setS((p) => (p.a === a && p.b === b && p.rect && p.rect.x === r.x && p.rect.y === r.y && p.rect.width === r.width && p.rect.height === r.height ? p : { a, b, rect: r }));
      });
    };
    update();
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(target);
    Array.from(target.children).forEach((c) => ro.observe(c));
    const mo = new MutationObserver(() => { Array.from(target.children).forEach((c) => ro.observe(c)); update(); });
    mo.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    return () => {
      cancelAnimationFrame(raf);
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      ro.disconnect(); mo.disconnect();
    };
  }, [target, axis]);
  const r = s.rect;
  if (!r || (!s.a && !s.b)) return null;
  const T = 22;
  const base: React.CSSProperties = { position: "fixed", pointerEvents: "none", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--accent-gold))", transition: "opacity 150ms" };
  const bg = (dir: string) => `linear-gradient(${dir}, hsl(var(--surface-card)) 35%, hsl(var(--surface-card) / 0))`;
  const hint = (side: "a" | "b") => {
    if (axis === "x") {
      const st: React.CSSProperties = { ...base, top: r.top, height: r.height, width: T, left: side === "a" ? r.left : r.right - T, background: bg(side === "a" ? "to right" : "to left") };
      return <div key={side} aria-hidden="true" style={st}>{side === "a" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}</div>;
    }
    const st: React.CSSProperties = { ...base, left: r.left, width: r.width, height: T - 6, top: side === "a" ? r.top : r.bottom - (T - 6), background: bg(side === "a" ? "to bottom" : "to top") };
    return <div key={side} aria-hidden="true" style={st}>{side === "a" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</div>;
  };
  return createPortal(<>{s.a && hint("a")}{s.b && hint("b")}</>, document.body);
}
