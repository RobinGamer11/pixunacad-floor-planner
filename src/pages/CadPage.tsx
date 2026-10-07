import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import CadEditor, { type CadEditorHandle } from "@/components/CadEditor";
import { projectStore, useProject } from "@/lib/projectStore";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { LocalSaveIndicator } from "@/components/cad/LocalSaveIndicator";
import { TabletAidWheel } from "@/components/TabletAidWheel";
import type { CadApp } from "@/cad/CadApp";
import { getLocalActivePage, setLocalActivePage } from "@/lib/exportLocalState";

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
  const [canPaste, setCanPaste] = useState(false);
  const [multiPaste, setMultiPaste] = useState(false);
  const [cadApp, setCadApp] = useState<CadApp | null>(null);
  // Export ist derselbe CAD-Bereich (dieselbe Engine/Verlauf) mit Exportseite aktiv.
  const exportView = location.pathname.endsWith("/export") || new URLSearchParams(location.search).get("view") === "export";
  useEffect(() => {
    if (!cadApp) return;
    // Geöffnete Exportseite ist lokaler Bedienzustand pro Gerät (nie Verlauf/Cloud).
    const ensurePage = () => {
      if (!exportView) return;
      if (cadApp.activePlanId) { setLocalActivePage(projectId, cadApp.activePlanId); return; }
      const stored = getLocalActivePage(projectId);
      const pick = (stored && cadApp.planManager.getById(stored)) ? stored : cadApp.planManager.list()[0]?.id;
      if (pick) { cadApp.setActivePlanId(pick); return; }
      // Keine Exportseite vorhanden: nach kurzer Wartezeit (Cloud-Stand) eine A4-Seite anlegen.
      if (!createTimer) createTimer = window.setTimeout(() => {
        if (cadApp.planManager.list().length > 0) { ensurePage(); return; }
        let id = "";
        cadApp.mutatePlans(() => { id = cadApp.planManager.createPlan({ formatKey: "a4", name: "Seite 1" }).id; });
        if (id) cadApp.setActivePlanId(id);
      }, 1500);
    };
    let createTimer = 0;
    if (exportView) ensurePage();
    else if (cadApp.activePlanId) cadApp.setActivePlanId(null);
    const off = cadApp.onPlanUiChange(ensurePage);
    const t = window.setTimeout(() => cadApp.resize(), 0);
    return () => { off(); window.clearTimeout(t); if (createTimer) window.clearTimeout(createTimer); };
  }, [cadApp, exportView, projectId]);

  const doCopy = () => {
    const ok = editorRef.current?.copySelection() ?? false;
    if (ok) setCanPaste(true);
    return ok;
  };
  const doPasteShortcut = () => editorRef.current?.pasteClipboard() ?? false;
  const armPasteFromHeader = () => editorRef.current?.armPasteFromHeader() ?? false;
  const doMultiPasteFromHeader = () => { editorRef.current?.toggleMultiPasteFromHeader(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "c") { if (doCopy()) e.preventDefault(); }
       else if (k === "v") { if (doPasteShortcut()) e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [tabletAidOn, setTabletAidOn] = useState<boolean>(() => {
    try { return localStorage.getItem("pixuna.tabletAid") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pixuna.tabletAid", tabletAidOn ? "1" : "0"); } catch {}
  }, [tabletAidOn]);
  const helpOn = project?.settings?.helpOn ?? true;

  const [presenting, setPresenting] = useState(false);
  const handlePresent = () => {
    const el = mainRef.current;
    if (!el) return;
    if (presenting) {
      setPresenting(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } else {
      setPresenting(true);
      el.requestFullscreen?.().catch(() => {});
    }
  };
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setPresenting(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && presenting) setPresenting(false); };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [presenting]);

  return (
    <div className="cad-desktop-density flex flex-col h-[100dvh] min-h-0 w-screen overflow-hidden">
      <WorkspaceHeader
        projectId={projectId}
        projectName={project?.name}
        mode={exportView ? "export" : "cad"}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
        canDelete={canDelete}
        onDelete={() => editorRef.current?.deleteSelection()}
        canCopy={canDelete}
        onCopy={doCopy}
        onCenterView={() => editorRef.current?.centerOnOrigin()}

        canPaste={canPaste}
        onPaste={armPasteFromHeader}
        multiPasteActive={multiPaste}
        onMultiPaste={doMultiPasteFromHeader}
        zoomPercent={zoom}
        onPresent={handlePresent}
        onShare={() => {}}
        helpOn={helpOn}
        onToggleHelp={() => project && projectStore.setHelpOn(project.id, !helpOn)}
        tabletAidOn={tabletAidOn}
        onToggleTabletAid={() => setTabletAidOn((v) => !v)}
      />
      <main
        ref={mainRef}
        className="flex-1 relative min-h-0 bg-background"
      >
        <CadEditor
          ref={editorRef}
          onAppReady={setCadApp}
          projectId={projectId}
          mode={exportView ? "export" : "cad"}
          onOpenSourceSheet={(sheetId) => {
            if (!cadApp) return;
            cadApp.setActivePlanId(null);
            cadApp.setActiveSheetId(sheetId);
            navigate(`/project/${projectId}/cad`);
          }}
          onHistoryChange={(u, r) => { setCanUndo(u); setCanRedo(r); }}
          onZoomChange={setZoom}
          onCanDeleteChange={setCanDelete}
          onMultiPasteChange={setMultiPaste}
          presenting={presenting}
          helpOn={helpOn}
        />
        {!presenting && <LocalSaveIndicator />}
        {presenting && (
          <button
            onClick={() => { setPresenting(false); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }}
            className="absolute top-3 right-3 z-[60] h-9 px-3 rounded-full text-xs font-medium"
            style={{ background: "rgba(0,0,0,0.55)", color: "#fff", backdropFilter: "blur(6px)" }}
            title="Präsentation beenden (ESC)"
          >
            ✕ Präsentation beenden
          </button>
        )}

      </main>
      {tabletAidOn && <TabletAidWheel />}
    </div>
  );
};

export default CadPage;
