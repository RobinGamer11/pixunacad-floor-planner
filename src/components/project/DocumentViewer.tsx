import { useEffect, useRef, useState } from "react";
import { Hand, Move, Search, X } from "lucide-react";
import type { FileNode } from "@/lib/projectStore";

function isPdfNode(node: FileNode) {
  return node.mimeType === "application/pdf" || node.name.toLowerCase().endsWith(".pdf");
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Vollbild-Vorschau eines Dokuments mit Zoom (Rad/Pinch) und Pan (Rad-Taste/Finger). */
export function DocumentViewer({ node, onClose }: { node: FileNode; onClose: () => void }) {
  const [src, setSrc] = useState<string>(isPdfNode(node) ? "" : node.dataUrl ?? "");
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    if (!isPdfNode(node)) { setSrc(node.dataUrl ?? ""); return; }
    let cancelled = false;
    (async () => {
      try {
        const raw = node.dataUrl ?? "";
        const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
        const { renderPdfPageToCanvas } = await import("@/cad/documentImport");
        const canvas = await renderPdfPageToCanvas(base64, 0, 2000);
        if (!cancelled) setSrc(canvas.toDataURL("image/png"));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [node]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Zoom am Cursor — nicht-passiver Wheel-Listener, damit Seiten-Scroll blockiert wird.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setView((v) => {
        const next = clamp(v.zoom * Math.exp(-dy * 0.0015), MIN_ZOOM, MAX_ZOOM);
        const k = next / v.zoom;
        return { zoom: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      const rect = containerRef.current!.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2 - rect.left,
        cy: (a.y + b.y) / 2 - rect.top,
      };
      panRef.current = null;
      return;
    }
    // Maus: nur mittlere Taste pannt. Touch/Stift: direktes Ziehen.
    if (e.pointerType === "mouse" && e.button !== 1) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const prev = pinchRef.current;
      if (prev.dist > 0) {
        const px = prev.cx;
        const py = prev.cy;
        setView((v) => {
          const next = clamp(v.zoom * (dist / prev.dist), MIN_ZOOM, MAX_ZOOM);
          const k = next / v.zoom;
          return { zoom: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
        });
      }
      pinchRef.current = { ...prev, dist };
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.id !== e.pointerId) return;
    const dx = e.clientX - pan.x;
    const dy = e.clientY - pan.y;
    panRef.current = { id: pan.id, x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const endPointer = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (panRef.current?.id === e.pointerId) panRef.current = null;
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "hsl(var(--surface))" }}>
      <div
        className="flex items-center gap-3 border-b px-4 py-2"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</div>
        <div className="text-xs text-muted-foreground">{Math.round(view.zoom * 100)}%</div>
        <button
          type="button"
          onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          className="h-8 rounded-md border px-2 text-xs"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          100%
        </button>
        <button type="button" onClick={onClose} aria-label="Vorschau schließen" className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center">
          <X size={16} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ background: "hsl(var(--surface-muted))", touchAction: "none", cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onAuxClick={(e) => e.preventDefault()}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          {src ? (
            <img src={src} alt={node.name} draggable={false} className="max-w-none select-none" />
          ) : (
            <div className="p-8 text-sm text-muted-foreground">Vorschau wird geladen…</div>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground opacity-60">
          <span className="flex items-center gap-1"><Search size={13} /> Zoomen</span>
          <span className="flex items-center gap-1"><Move size={13} /> Mausrad</span>
          <span className="flex items-center gap-1"><Hand size={13} /> Bewegen</span>
        </div>
      </div>
    </div>
  );
}
