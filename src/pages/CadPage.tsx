import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import CadEditor, { type CadEditorHandle } from "@/components/CadEditor";
import { useProject } from "@/lib/projectStore";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { Check, X } from "lucide-react";
import { bytesToBase64, canvasRegionToPdfBytes, stashPendingSheetPdf } from "@/lib/sheetPdfExport";

/** "1:100" → 100 (Welt-Einheiten pro Papier-Einheit). Fällt auf 100 zurück. */
function parseSheetScale(scale: string | undefined): number {
  if (!scale) return 100;
  const m = String(scale).match(/1\s*:\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return 100;
  const v = parseFloat(m[1].replace(",", "."));
  return v > 0 ? v : 100;
}

const CadPage = () => {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const navigate = useNavigate();
  const location = useLocation();
  const editorRef = useRef<CadEditorHandle | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [zoom, setZoom] = useState<number | undefined>(undefined);

  // "PDF aus CAD-Blatt einfügen": Wenn Query-Parameter gesetzt sind,
  // eine kleine Bestätigungsleiste einblenden.
  const params = new URLSearchParams(location.search);
  const sheetPdfId = params.get("sheetPdf");
  const sheetPdfMode = (params.get("mode") as "view" | "frame" | null) ?? "view";
  const sheetPdfScale = params.get("scale") ?? undefined;
  const sheetPdfPageId = params.get("pageId") ?? undefined;
  const [busy, setBusy] = useState(false);

  // Rahmen-Auswahl (CSS-Pixel im Fenster; wird in Canvas-Koordinaten umgerechnet).
  const [frameStart, setFrameStart] = useState<{ x: number; y: number } | null>(null);
  const [frameRect, setFrameRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Rahmen-Werkzeug ist NICHT dauerhaft aktiv — Nutzer bewegt sich normal
  // in der CAD-Oberfläche und aktiviert das Aufziehen explizit über einen
  // Button ("Rahmen ziehen"). Nach dem PointerUp wird das Werkzeug wieder
  // entwaffnet, damit Pan/Zoom sofort weitergehen.
  const [frameArmed, setFrameArmed] = useState(false);


  const handlePresent = () => {
    const el = mainRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const getCanvas = (): HTMLCanvasElement | null =>
    (mainRef.current?.querySelector("canvas") as HTMLCanvasElement | null) ?? null;

  const confirmSheetPdf = async () => {
    if (!projectId || !sheetPdfId) return;
    const canvas = getCanvas();
    if (!canvas) { alert("CAD-Canvas nicht gefunden"); return; }
    const cRect = canvas.getBoundingClientRect();
    // Ausschnitt in CSS-Pixel-Koordinaten (relativ zum Canvas).
    let cssRect: { x: number; y: number; w: number; h: number };
    if (sheetPdfMode === "frame") {
      if (!frameRect || frameRect.w < 4 || frameRect.h < 4) {
        alert("Bitte zuerst mit der Maus einen Rahmen aufziehen.");
        return;
      }
      cssRect = {
        x: frameRect.x - cRect.left,
        y: frameRect.y - cRect.top,
        w: frameRect.w,
        h: frameRect.h,
      };
    } else {
      cssRect = { x: 0, y: 0, w: cRect.width, h: cRect.height };
    }
    // Auf Canvas-Pixel-Raum umrechnen (dpr / Renderer-Auflösung).
    const sx = canvas.width / Math.max(1, cRect.width);
    const sy = canvas.height / Math.max(1, cRect.height);
    const pxRect = {
      x: Math.max(0, cssRect.x * sx),
      y: Math.max(0, cssRect.y * sy),
      w: Math.min(canvas.width, cssRect.w * sx),
      h: Math.min(canvas.height, cssRect.h * sy),
    };

    // Welt-Meter → Papier-mm über Blatt-Maßstab.
    const camScale = editorRef.current?.getCameraScale() ?? 80; // CSS-px pro Welt-m
    const worldWm = cssRect.w / camScale;
    const worldHm = cssRect.h / camScale;
    const sheet = project?.sheets.find((s) => s.id === sheetPdfId);
    const effectiveScale = sheetPdfScale ?? sheet?.scale;
    const scaleValue = parseSheetScale(effectiveScale);
    const paperWmm = (worldWm * 1000) / scaleValue;
    const paperHmm = (worldHm * 1000) / scaleValue;

    // PNG-Snapshot des Ausschnitts (für verknüpfte cad-view-Ansicht).
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.round(pxRect.w));
    tmp.height = Math.max(1, Math.round(pxRect.h));
    const tctx = tmp.getContext("2d")!;
    tctx.fillStyle = "#ffffff";
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(canvas, pxRect.x, pxRect.y, pxRect.w, pxRect.h, 0, 0, tmp.width, tmp.height);
    const snapshotPng = tmp.toDataURL("image/png");

    setBusy(true);
    try {
      const bytes = await canvasRegionToPdfBytes(canvas, pxRect, paperWmm, paperHmm);
      stashPendingSheetPdf({
        projectId,
        returnPageId: sheetPdfPageId ?? "",
        sheetId: sheetPdfId,
        sheetName: sheet?.name || "CAD-Blatt",
        mode: sheetPdfMode,
        pdfBase64: bytesToBase64(bytes),
        sheetScale: effectiveScale,
        paperWidthMm: paperWmm,
        paperHeightMm: paperHmm,
        snapshotPng,
      });
      navigate(`/project/${projectId}`);
    } catch (err: any) {
      alert("PDF-Export fehlgeschlagen: " + (err?.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  const cancelSheetPdf = () => {
    if (!projectId) return;

    navigate(`/project/${projectId}`);
  };

  // Rahmen-Interaktion: nur aktiv im Rahmen-Modus. Ein transparenter Overlay
  // fängt Maus-Events, damit die CAD-Tools nicht mitlaufen.
  const onFramePointerDown = (e: React.PointerEvent) => {
    if (sheetPdfMode !== "frame") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFrameStart({ x: e.clientX, y: e.clientY });
    setFrameRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    setDragging(true);
  };
  const onFramePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !frameStart) return;
    const x = Math.min(frameStart.x, e.clientX);
    const y = Math.min(frameStart.y, e.clientY);
    const w = Math.abs(e.clientX - frameStart.x);
    const h = Math.abs(e.clientY - frameStart.y);
    setFrameRect({ x, y, w, h });
  };
  const onFramePointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    setFrameArmed(false); // Nach Aufziehen automatisch entwaffnen → Pan/Zoom wieder normal.
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };


  useEffect(() => {
    // Beim Moduswechsel Rahmen zurücksetzen.
    setFrameStart(null);
    setFrameRect(null);
    setDragging(false);
  }, [sheetPdfMode, sheetPdfId]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <WorkspaceHeader
        projectId={projectId}
        projectName={project?.name}
        mode="cad"
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        canDelete={canDelete}
        onDelete={() => editorRef.current?.deleteSelection()}
        zoomPercent={zoom}
        onPresent={handlePresent}
        onShare={() => {}}
        onExport={() => editorRef.current?.openExportPanel()}
      />
      <main ref={mainRef} className="flex-1 relative min-h-0 bg-background">
        <CadEditor
          ref={editorRef}
          projectId={projectId}
          onHistoryChange={(u, r) => { setCanUndo(u); setCanRedo(r); }}
          onZoomChange={setZoom}
          onCanDeleteChange={setCanDelete}
        />

        {/* Rahmen-Overlay: Standardmäßig transparent für Pointer-Events, damit
            der Nutzer sich frei in der CAD-Oberfläche bewegen kann (Pan/Zoom).
            Erst wenn "Rahmen ziehen" gedrückt wurde, fängt das Overlay einen
            einzigen Aufzieh-Vorgang ab. */}
        {sheetPdfId && sheetPdfMode === "frame" && (
          <div
            className="absolute inset-0 z-40"
            style={{
              cursor: frameArmed ? "crosshair" : "default",
              background: frameArmed ? "rgba(0,0,0,0.02)" : "transparent",
              pointerEvents: frameArmed ? "auto" : "none",
            }}
            onPointerDown={onFramePointerDown}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerUp}
          >
            {frameRect && frameRect.w > 0 && frameRect.h > 0 && (() => {
              const cRect = getCanvas()?.getBoundingClientRect();
              const parentRect = mainRef.current?.getBoundingClientRect();
              if (!cRect || !parentRect) return null;
              return (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: frameRect.x - parentRect.left,
                    top: frameRect.y - parentRect.top,
                    width: frameRect.w,
                    height: frameRect.h,
                    border: "1.5px dashed hsl(var(--accent-gold))",
                    background: "hsla(var(--accent-gold), 0.08)",
                  }}
                />
              );
            })()}
          </div>
        )}


        {sheetPdfId && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-md shadow-lg border"
            style={{
              background: "hsl(var(--surface-card))",
              borderColor: "hsl(var(--hairline))",
            }}
          >
            <div className="text-xs">
              <div className="font-semibold">
                PDF-Export → Projektmappe
              </div>
              <div className="text-muted-foreground">
                {sheetPdfMode === "view" && "Aktuelle Ansicht wird im richtigen Maßstab übernommen."}
                {sheetPdfMode === "frame" && (frameRect
                  ? "Rahmen mit Häkchen bestätigen — oder neu aufziehen."
                  : "Bitte einen Rahmen aufziehen und mit Häkchen bestätigen.")}
              </div>
            </div>
            <button
              type="button"
              onClick={confirmSheetPdf}
              disabled={busy || (sheetPdfMode === "frame" && !frameRect)}
              className="h-8 w-8 rounded-md flex items-center justify-center disabled:opacity-50"
              style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }}
              title="Bestätigen"
            >
              <Check size={16} />
            </button>
            <button
              type="button"
              onClick={cancelSheetPdf}
              disabled={busy}
              className="h-8 w-8 rounded-md flex items-center justify-center border"
              style={{ borderColor: "hsl(var(--hairline))" }}
              title="Abbrechen"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default CadPage;
