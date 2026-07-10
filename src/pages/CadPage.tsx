import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import CadEditor, { type CadEditorHandle } from "@/components/CadEditor";
import { useProject } from "@/lib/projectStore";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";

const CadPage = () => {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const editorRef = useRef<CadEditorHandle | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState<number | undefined>(undefined);

  const handlePresent = () => {
    const el = mainRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  };

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
        />
      </main>
    </div>
  );
};

export default CadPage;

