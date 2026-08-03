import { useEffect, useRef, useState } from "react";
import { loadPdfDocFromB64 } from "@/cad/documentImport";

interface Props {
  sourceB64: string;
  pageIndex: number;
  /** Anzeige-Pixelbreite im DOM (nicht skaliert). Höhe wird über das Seitenverhältnis bestimmt. */
  className?: string;
  /** Projektmappe: PDF erst nach einer laufenden Viewport-Zoomgeste neu rastern. */
  deferDuringWorkspaceZoom?: boolean;
  /** Radier-Maske (CSS mask-image) – wird direkt auf Canvas/Hintergrund gelegt. */
  maskStyle?: React.CSSProperties;
}


let workspaceZoomActive = false;
const workspaceZoomListeners = new Set<() => void>();

/** Entkoppelt den Projektmappen-Zoom vom teuren PDF.js-Raster-Render. */
export function setWorkspacePdfZoomActive(active: boolean) {
  if (workspaceZoomActive === active) return;
  workspaceZoomActive = active;
  if (!active) workspaceZoomListeners.forEach((listener) => listener());
}

/**
 * Vektorbasierter PDF-Seiten-Renderer: rendert die PDF-Seite über pdfjs
 * auf ein <canvas> und re-rendert adaptiv bei Größenänderung (Zoom),
 * damit beim Reinzoomen kein Bitmap-Geblurre entsteht.
 */
export function PdfPageView({ sourceB64, pageIndex, className, deferDuringWorkspaceZoom = false, maskStyle }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const renderToken = useRef(0);
  const lastRenderedWidth = useRef(0);
  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!sourceB64) return;
    const el = containerRef.current;
    if (!el) return;

    const doRender = async (cssWidth: number) => {
      if (cssWidth <= 0) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const targetPx = Math.ceil(cssWidth * dpr);
      // Re-Render-Schwelle: nur wenn deutlich größer/kleiner
      const last = lastRenderedWidth.current;
      if (last > 0 && targetPx <= last * 1.25 && targetPx >= last * 0.6) return;
      const token = ++renderToken.current;
      try {
        const pdf = await loadPdfDocFromB64(sourceB64);
        const page = await pdf.getPage(pageIndex + 1);
        const base = page.getViewport({ scale: 1 });
        const scale = targetPx / base.width;
        const viewport = page.getViewport({ scale });
        if (token !== renderToken.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (token !== renderToken.current) return;
        lastRenderedWidth.current = targetPx;
        setError(null);
      } catch (e: any) {
        if (token !== renderToken.current) return;
        setError(e?.message || "PDF-Render fehlgeschlagen.");
      }
    };

    const schedule = () => {
      if (!el) return;
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      // Träge genug, damit ein Zoom-Gesten-Burst (Wheel/Pinch) keinen
      // teuren PDF-Re-Render pro Frame auslöst → flüssiges Zoomen.
      debounceTimer.current = window.setTimeout(() => {
        // Während die Projektmappe zoomt bleibt das bereits gerasterte Canvas
        // eine reine GPU-skalierte Bitmap. PDF.js wird erst nach Gestenende aktiv.
        if (deferDuringWorkspaceZoom && workspaceZoomActive) return;
        const w = el.getBoundingClientRect().width;
        const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: any) => number);
        if (idle) idle(() => doRender(w), { timeout: 600 });
        else doRender(w);
      }, 320);
    };


    schedule();
    const onWorkspaceZoomEnd = () => schedule();
    if (deferDuringWorkspaceZoom) workspaceZoomListeners.add(onWorkspaceZoomEnd);
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      workspaceZoomListeners.delete(onWorkspaceZoomEnd);
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      renderToken.current++;
    };
  }, [sourceB64, pageIndex, deferDuringWorkspaceZoom]);

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}>
      {error ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground p-2">
          PDF: {error}
        </div>
      ) : (
        <div style={{ width: "100%", height: "100%", background: "white", ...(maskStyle ?? {}) }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
        </div>
      )}

    </div>
  );
}
