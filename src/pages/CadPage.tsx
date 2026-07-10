import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import CadEditor, { type CadEditorHandle } from "@/components/CadEditor";
import { useProject } from "@/lib/projectStore";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { Check, X } from "lucide-react";
import { bytesToBase64, canvasToPdfBytes, stashPendingSheetPdf } from "@/lib/sheetPdfExport";

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
  const sheetPdfMode = (params.get("mode") as "full" | "view" | "frame" | null) ?? "full";
  const [busy, setBusy] = useState(false);

  const handlePresent = () => {
    const el = mainRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const confirmSheetPdf = async () => {
    if (!projectId || !sheetPdfId) return;
    setBusy(true);
    try {
      const canvas = mainRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) throw new Error("CAD-Canvas nicht gefunden");
      const bytes = await canvasToPdfBytes(canvas);
      const sheet = project?.sheets.find((s) => s.id === sheetPdfId);
      stashPendingSheetPdf({
        projectId,
        returnPageId: "",
        sheetId: sheetPdfId,
        sheetName: sheet?.name || "CAD-Blatt",
        mode: sheetPdfMode,
        pdfBase64: bytesToBase64(bytes),
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

  useEffect(() => {
    // Bei Rahmen-Modus: (noch) keine spezielle Overlay-Logik — der Nutzer
    // richtet den sichtbaren Ausschnitt selbst ein und bestätigt.
  }, [sheetPdfId, sheetPdfMode]);

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
                {sheetPdfMode === "full" && "Gesamtes Zeichenblatt · sichtbaren Bereich anpassen und bestätigen."}
                {sheetPdfMode === "view" && "Aktuelle Ansicht wird übernommen."}
                {sheetPdfMode === "frame" && "Bildausschnitt einrichten (Zoom/Pan) und bestätigen."}
              </div>
            </div>
            <button
              type="button"
              onClick={confirmSheetPdf}
              disabled={busy}
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
