import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Share2,
  Play,
  FolderKanban,
  Compass,
  Trash2,
  TabletSmartphone,
  Network,
} from "lucide-react";

export type WorkspaceMode = "workspace" | "cad" | "notes";

interface Props {
  projectId?: string;
  projectName?: string;
  contextLabel?: string;         // e.g. active page title / mappe name
  mode: WorkspaceMode;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  zoomPercent?: number;          // display-only; may be undefined
  onPresent?: () => void;
  onShare?: () => void;
  onExport?: () => void;
  /** Tablet-Hilfsrad (LMB/RMB/SHIFT/ESC/ENTF) einblenden. */
  tabletAidOn?: boolean;
  onToggleTabletAid?: () => void;
}

/**
 * Gemeinsamer Kopf für Projektmappenbearbeitung und CAD-Oberfläche.
 * Layout ist in beiden Modi identisch — schnelles Umschalten via Modus-Buttons.
 */
export function WorkspaceHeader({
  projectId,
  projectName,
  contextLabel,
  mode,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  canDelete = false,
  onDelete,
  zoomPercent,
  onPresent,
  onShare,
  onExport,
  tabletAidOn = false,
  onToggleTabletAid,
}: Props) {
  const navigate = useNavigate();

  const goWorkspace = () => projectId && navigate(`/project/${projectId}`);
  const goCad = () => projectId && navigate(`/project/${projectId}/cad`);

  return (
    <header
      className="h-12 flex items-center justify-between px-3 border-b shrink-0"
      style={{
        borderColor: "hsl(var(--hairline))",
        background: "hsl(var(--surface-card))",
      }}
    >
      {/* Left: Zurück + Titel + Modus-Umschalter */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => navigate("/")}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted"
          title="Zurück zur Projektübersicht"
        >
          <ChevronLeft size={18} />
        </button>

        {projectName && (
          <div className="text-sm font-semibold truncate max-w-[220px]" title={projectName}>
            {projectName}
          </div>
        )}
        {contextLabel && (
          <>
            <span className="text-xs text-muted-foreground">›</span>
            <div className="text-sm truncate max-w-[220px]" title={contextLabel}>
              {contextLabel}
            </div>
          </>
        )}

        {onToggleTabletAid && (
          <button
            onClick={onToggleTabletAid}
            className="ml-2 h-8 px-2.5 rounded-md flex items-center gap-1.5 text-[11px] font-semibold border transition-colors"
            style={
              tabletAidOn
                ? { background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))", borderColor: "hsl(var(--accent-gold))" }
                : { background: "hsl(var(--surface))", color: "hsl(var(--ink))", borderColor: "hsl(var(--accent-gold))" }
            }
            title="Tablet-Hilfsrad (Maus/Tastatur-Ersatz für Touch-Geräte)"
            aria-pressed={tabletAidOn}
          >
            <TabletSmartphone size={16} />
            <span className="hidden sm:inline">Tablet</span>
          </button>
        )}

        <div className="ml-2 flex items-center gap-1 rounded-md p-0.5"
             style={{ background: "hsl(var(--surface-muted))" }}>
          <ModeButton
            icon={<FolderKanban size={13} />}
            label="Projektmappe"
            active={mode === "workspace"}
            onClick={goWorkspace}
          />
          <ModeButton
            icon={<Compass size={13} />}
            label="CAD-Oberfläche"
            active={mode === "cad"}
            onClick={goCad}
          />
        </div>
      </div>


      {/* Right: Undo/Redo · Zoom · Präsentieren · Teilen · Exportieren */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <button
          onClick={onDelete}
          disabled={!canDelete}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          title="Auswahl löschen (Entf)"
        >
          <Trash2 size={16} />
        </button>
        {/* Tablet-Toggle wurde nach links (neben Modus-Umschalter) verlegt. */}

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          title="Rückgängig (Strg+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          title="Wiederherstellen (Strg+Y)"
        >
          <Redo2 size={16} />
        </button>

        {typeof zoomPercent === "number" && (
          <span
            className="text-xs px-2 tabular-nums"
            style={{ color: "hsl(var(--ink-soft))" }}
            title="Aktueller Zoom"
          >
            {Math.round(zoomPercent)}%
          </span>
        )}

        <button
          onClick={onPresent}
          className="h-8 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium"
          style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
          title="Präsentieren"
        >
          <Play size={13} /> Präsentieren
        </button>
        <button
          disabled
          className="h-8 px-2.5 rounded-md border text-xs flex items-center gap-1.5 opacity-50 cursor-not-allowed"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
          title="Teilen — kommt später (wird mit Team-Funktion kombiniert)"
        >
          <Share2 size={13} /> Teilen
        </button>
        <button
          onClick={onExport}
          className="h-8 px-3 rounded-md text-xs font-medium"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          title="Exportieren"
        >
          Exportieren
        </button>
      </div>
    </header>
  );
}

function ModeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="h-7 px-2.5 rounded-[5px] flex items-center gap-1.5 text-[11px] font-medium transition-colors"
      style={{
        background: active ? "hsl(var(--accent-gold))" : "transparent",
        color: active ? "hsl(var(--surface))" : "hsl(var(--ink-soft))",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
