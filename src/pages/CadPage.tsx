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
          background: "linear-gradient(180deg, hsl(222 32% 16%), hsl(222 30% 12%))",
          borderColor: "hsl(var(--cad-toolbar-border))",
        }}
      >
        <div className="flex items-center gap-2">
          {projectId && (
            <button
              onClick={() => navigate(`/project/${projectId}`)}
              className="h-8 px-2.5 rounded-md flex items-center gap-1.5 text-sm"
              style={{
                background: "hsl(222 16% 28%)",
                color: "hsl(220 18% 92%)",
              }}
              title="Zurück zur Projektmappe"
            >
              <ChevronLeft size={16} /> Zurück
            </button>
          )}
          <span className="text-base font-semibold tracking-tight ml-2" style={{ color: "hsl(220 18% 92%)" }}>
            Pixuna<span style={{ color: "hsl(var(--primary-glow))" }}>CAD</span>
          </span>
          {project && (
            <span className="text-xs ml-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              {project.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-[0.18em] font-medium"
            style={{ color: "hsl(var(--cad-toolbar-muted))" }}
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
