/**
 * Gemeinsame Zoom- und Verschiebefläche für Ansichtstrahl und Gantt.
 *
 * Bedienung: Mausrad zoomt zum Zeiger, gedrücktes Mausrad (mittlere Taste)
 * verschiebt, zwei Finger zoomen und verschieben. Zoom und Position bleiben
 * bei normalen Datenaktualisierungen erhalten, weil der Zustand hier liegt.
 * Gesten werden ausschließlich innerhalb der Fläche abgefangen – die Seite
 * bleibt außerhalb normal scrollbar.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";

const LINE = "hsl(var(--hairline))";
const MIN_K = 0.4;
const MAX_K = 8;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function OpsZoomPane({
  children,
  height = 320,
  hint,
}: {
  children: ReactNode;
  height?: number;
  hint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ on: boolean; sx: number; sy: number } | null>(null);
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  const fit = useCallback(() => setView({ k: 1, tx: 0, ty: 0 }), []);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const cur = viewRef.current;
    const nk = clamp(cur.k * factor, MIN_K, MAX_K);
    if (nk === cur.k) return;
    const r = nk / cur.k;
    setView({ k: nk, tx: px - (px - cur.tx) * r, ty: py - (py - cur.ty) * r });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dy * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
      }
      return;
    }
    // Nur die mittlere Maustaste verschiebt – Klicks auf Einträge bleiben erhalten.
    if (e.button !== 1) return;
    e.preventDefault();
    pan.current = { on: true, sx: e.clientX - view.tx, sy: e.clientY - view.ty };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size !== 2 || !pinch.current) return;
      e.preventDefault();
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rect = ref.current?.getBoundingClientRect();
      const prev = pinch.current;
      pinch.current = { dist, cx, cy };
      // Verschieben mit zwei Fingern …
      setView((v) => ({ ...v, tx: v.tx + (cx - prev.cx), ty: v.ty + (cy - prev.cy) }));
      // … und gleichzeitig Pinch-Zoom.
      if (rect && prev.dist > 0) zoomAt(cx - rect.left, cy - rect.top, dist / prev.dist);
      return;
    }
    if (!pan.current?.on) return;
    setView((v) => ({ ...v, tx: e.clientX - pan.current!.sx, ty: e.clientY - pan.current!.sy }));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    if (pan.current?.on) {
      pan.current.on = false;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* egal */ }
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={fit}
          className="h-8 px-2.5 rounded-md border text-[11px] flex items-center gap-1.5"
          style={{ borderColor: LINE }}
        >
          <Maximize2 size={12} /> Ansicht einpassen
        </button>
        <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(view.k * 100)}%</span>
        <span className="text-[11px] text-muted-foreground">
          {hint ?? "Mausrad zoomt · gedrücktes Mausrad verschiebt · zwei Finger auf dem Tablet"}
        </span>
      </div>
      <div
        ref={ref}
        className="relative overflow-hidden rounded-lg border"
        style={{ borderColor: LINE, height, touchAction: "none", overscrollBehavior: "contain" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onAuxClick={(e) => e.preventDefault()}
      >
        <div
          className="absolute left-0 top-0 w-full"
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`, transformOrigin: "0 0" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default OpsZoomPane;
