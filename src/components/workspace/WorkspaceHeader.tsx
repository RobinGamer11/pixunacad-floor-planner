import React from "react";
import { useNavigate } from "react-router-dom";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Share2,
  Play,
  FolderKanban,
  Compass,
  Trash2,
  Copy,
  ClipboardPaste,
  HelpCircle,
  TabletSmartphone,
  Wallet,
  GanttChartSquare,
} from "lucide-react";

export type WorkspaceMode = "workspace" | "cad" | "finance" | "board";

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
  canCopy?: boolean;
  onCopy?: () => void;
  canPaste?: boolean;
  onPaste?: () => void;
  zoomPercent?: number;          // display-only; may be undefined
  onPresent?: () => void;
  onShare?: () => void;
  onExport?: () => void;
  /** Tablet-Hilfsrad (LMB/RMB/SHIFT/ESC/ENTF) einblenden. */
  tabletAidOn?: boolean;
  onToggleTabletAid?: () => void;
  /** Projektbezogene Schnellhilfe ein- oder ausblenden. */
  mappeHelpOn?: boolean;
  onToggleMappeHelp?: () => void;
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
  canCopy = false,
  onCopy,
  canPaste = false,
  onPaste,
  zoomPercent,
  onPresent,
  onShare,
  onExport,
  tabletAidOn = false,
  onToggleTabletAid,
  mappeHelpOn = false,
  onToggleMappeHelp,
}: Props) {
  const navigate = useNavigate();
  const headerRef = useDragScroll<HTMLElement>("x");

  const goWorkspace = () => projectId && navigate(`/project/${projectId}`);
  const goCad = () => projectId && navigate(`/project/${projectId}/cad`);
  const goFinance = () => projectId && navigate(`/project/${projectId}/finance`);
  const goBoard = () => projectId && navigate(`/project/${projectId}/board`);

  return (
    <header
      ref={headerRef}
      className="h-16 flex items-center gap-2 px-3 border-b shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar whitespace-nowrap cursor-grab active:cursor-grabbing"
      style={{
        borderColor: "hsl(var(--hairline))",
        background: "hsl(var(--surface-card))",
        touchAction: "none",
      }}
    >
      {/* Left: Zurück + Titel + Modus-Umschalter */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate("/")}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted"
          title="Zurück zur Projektübersicht"
        >
          <ChevronLeft size={18} />
        </button>

        {projectName && (
          <div
            className="text-sm font-semibold truncate max-w-[180px]"
            title={projectName}
          >
            {projectName}
          </div>
        )}
        {contextLabel && (
          <>
            <span className="text-xs text-muted-foreground">›</span>
            <div className="text-sm truncate max-w-[160px]" title={contextLabel}>
              {contextLabel}
            </div>
          </>
        )}

        {(onToggleMappeHelp || onToggleTabletAid) && (
          <div className="ml-1 flex items-center gap-1">
            {onToggleMappeHelp && (
              <HeaderAidToggle
                active={mappeHelpOn}
                icon={<HelpCircle size={16} />}
                label="Hilfe"
                title="Bedienungshilfe ein- oder ausblenden"
                onClick={onToggleMappeHelp}
              />
            )}
            {onToggleTabletAid && (
              <HeaderAidToggle
                active={tabletAidOn}
                icon={<TabletSmartphone size={16} />}
                label="Tablet"
                title="Tablet-Hilfsrad (Maus/Tastatur-Ersatz für Touch-Geräte)"
                onClick={onToggleTabletAid}
              />
            )}
          </div>
        )}


        <div className="ml-2 flex items-center gap-1 rounded-md p-0.5 shrink-0"
             style={{ background: "hsl(var(--surface-muted))" }}>

          <ModeButton
            icon={<FolderKanban size={13} />}
            label="Mappe"
            active={mode === "workspace"}
            onClick={goWorkspace}
          />
          <ModeDivider />
          <ModeButton
            icon={<Compass size={13} />}
            label="CAD"
            active={mode === "cad"}
            onClick={goCad}
          />
          <ModeDivider />
          <ModeButton
            icon={<GanttChartSquare size={13} />}
            label="Orga"
            active={mode === "board"}
            onClick={goBoard}
          />
          <ModeDivider />
          <ModeButton
            icon={<Wallet size={13} />}
            label="Finanzen"
            active={mode === "finance"}
            onClick={goFinance}
          />

        </div>
      </div>


      <div className="shrink-0 w-8 md:flex-1 md:min-w-8" />
      {/* Right: Undo/Redo · Zoom · Präsentieren · Teilen · Exportieren */}
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 pl-2">

        <button
          onClick={onCopy}
          disabled={!canCopy || !onCopy}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          title="Kopieren (Shift+C / Strg+C)"
        >
          <Copy size={16} />
        </button>
        <button
          onClick={onPaste}
          disabled={!canPaste || !onPaste}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          title="Einfügen (Shift+V / Strg+V)"
        >
          <ClipboardPaste size={16} />
        </button>

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

function HeaderAidToggle({
  active,
  icon,
  label,
  title,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 px-2 rounded-md flex items-center gap-1.5 border text-[11px] font-medium transition-colors"
      style={
        active
          ? {
              background: "hsl(var(--accent-gold))",
              color: "hsl(var(--surface))",
              borderColor: "hsl(var(--accent-gold))",
            }
          : {
              background: "hsl(var(--surface-muted))",
              color: "hsl(var(--ink-soft))",
              borderColor: "hsl(var(--hairline))",
            }
      }
      title={title}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
    </button>
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
      className="h-7 px-2.5 rounded-[5px] flex items-center gap-1.5 text-[11px] font-medium transition-colors shrink-0"
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

function ModeDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 inline-block h-4 w-px"
      style={{ background: "hsl(var(--hairline))" }}
    />
  );
}
