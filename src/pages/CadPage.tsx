import { ChevronLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import CadEditor from "@/components/CadEditor";
import { useProject } from "@/lib/projectStore";

const CadPage = () => {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <header
        className="flex items-center justify-between h-12 px-3 border-b shrink-0 relative"
        style={{
          background: "hsl(var(--surface-card))",
          borderColor: "hsl(var(--hairline))",
        }}
      >
        <div className="flex items-center gap-2">
          {projectId && (
            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="h-8 px-2.5 rounded-md flex items-center gap-1.5 text-sm transition-colors"
              style={{
                background: "hsl(var(--surface-muted))",
                color: "hsl(var(--ink))",
              }}
              title="Zurück zur Projektmappe"
            >
              <ChevronLeft size={16} /> Zurück
            </button>
          )}
          {project && (
            <span className="text-sm ml-2 font-medium" style={{ color: "hsl(var(--ink))" }}>
              {project.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-[0.18em] font-medium"
            style={{ color: "hsl(var(--ink-soft))" }}
          >
            CAD-Zeichnen
          </span>
        </div>
      </header>
      <main className="flex-1 relative min-h-0">
        <CadEditor projectId={projectId} />
      </main>
    </div>
  );
};

export default CadPage;
