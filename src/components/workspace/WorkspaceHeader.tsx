import { isExportAreaEnabled } from "@/lib/exportFeature";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import { ScrollEdgeHints } from "@/components/ScrollEdgeHints";
import { WorkspaceSaveStatus } from "./WorkspaceSaveStatus";
import {
  ChevronLeft,
  Undo2,
  Redo2,
  Check,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  AlertTriangle,
  Smartphone,
  Loader2,
  Users,
  Play,
  Printer,
  Trash2,
  Copy,
  Crosshair,
  ClipboardPaste,
  ClipboardPlus,
  HelpCircle,
  TabletSmartphone,
  Wallet,
  Box,
  DraftingCompass,
} from "lucide-react";

export type WorkspaceMode = "cad" | "export" | "3d" | "finance" | "board";

interface Props {
  projectId?: string;
  projectName?: string;
  contextLabel?: string;         // e.g. active sheet or page title
  mode: WorkspaceMode;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  canCopy?: boolean;
  onCopy?: () => void;
  /** Ansicht zentrieren (CAD: Weltursprung). */
  onCenterView?: () => void;
  canPaste?: boolean;
  onPaste?: () => void;
  /** Mehrfach einfügen — Kopie bleibt nach dem Setzen am Mauszeiger. */
  multiPasteActive?: boolean;
  onMultiPaste?: () => void;
  zoomPercent?: number;          // display-only; may be undefined
  onPresent?: () => void;
  onShare?: () => void;
  /** Tablet-Hilfsrad (LMB/RMB/SHIFT/ESC/ENTF) einblenden. */
  tabletAidOn?: boolean;
  onToggleTabletAid?: () => void;
  /** Projektbezogene Schnellhilfe ein- oder ausblenden. */
  helpOn?: boolean;
  onToggleHelp?: () => void;
}

/**
 * Gemeinsamer Kopf für CAD, Export und Board.
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
  onCenterView,
  canPaste = false,
  onPaste,
  multiPasteActive = false,
  onMultiPaste,
  zoomPercent,
  onPresent,
  onShare,
  tabletAidOn = false,
  onToggleTabletAid,
  helpOn = false,
  onToggleHelp,
}: Props) {
  const navigate = useNavigate();
  const headerDrag = useDragScroll<HTMLElement>("x");
  const [headerEl, setHeaderEl] = React.useState<HTMLElement | null>(null);
  const headerRef = React.useCallback((el: HTMLElement | null) => { headerDrag(el); setHeaderEl(el); }, [headerDrag]);

  const goCad = () => projectId && navigate(`/project/${projectId}/cad`);
  const goExport = () => projectId && navigate(`/project/${projectId}/export`);
  const go3d = () => projectId && navigate(`/project/${projectId}/3d`);
  const showExportTab = isExportAreaEnabled() || mode === "export";

  return (
    <>
    <ScrollEdgeHints target={headerEl} axis="x" />
    <header
      ref={headerRef}
      className="workspace-header h-16 flex items-center gap-2 px-3 border-b shrink-0 overflow-x-auto overflow-y-hidden no-scrollbar whitespace-nowrap cursor-grab active:cursor-grabbing"
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

        {(onToggleHelp || onToggleTabletAid) && (
          <div className="ml-1 flex items-center gap-1">
            {onToggleHelp && (
              <HeaderAidToggle
                active={helpOn}
                icon={<HelpCircle size={16} />}
                label="Hilfe"
                title="Bedienungshilfe ein- oder ausblenden"
                onClick={onToggleHelp}
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


        <div className="ml-2 flex items-center gap-1 rounded-lg border p-1 shrink-0" role="group" aria-label="Bereich wählen"
             style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}>

          <ModeButton
            icon={<DraftingCompass size={13} />}
            label="CAD"
            active={mode === "cad"}
            onClick={goCad}
          />
          <ModeDivider />
          <ModeButton icon={<Box size={13} />} label="3D" active={mode === "3d"} onClick={go3d} />
          {showExportTab && (
            <>
              <ModeDivider />
              <ModeButton
                icon={<Printer size={13} />}
                label="Export"
                active={mode === "export"}
                onClick={goExport}
              />
            </>
          )}
        </div>
      </div>


      <div className="shrink-0 w-8 md:flex-1 md:min-w-8" />
      {/* Right: Undo/Redo · Zoom · Präsentieren · Exportieren */}
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 pl-2">

        <WorkspaceSaveStatus key={projectId} projectId={projectId} />


        <button
          onClick={onCenterView}
          disabled={!onCenterView}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          title="Ansicht zentrieren"
        >
          <Crosshair size={16} />
        </button>
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
          onClick={onMultiPaste}
          disabled={(!canPaste && !multiPasteActive) || !onMultiPaste}
          className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={multiPasteActive
            ? { background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }
            : undefined}
          aria-pressed={multiPasteActive}
          title="Mehrfach einfügen – platzierte Kopie bleibt am Mauszeiger"
        >
          <ClipboardPlus size={16} />
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




        {/* Im Export-Bereich ist der Reiter „Export“ die Exportfunktion — dort
            rückt „Präsentieren“ als heller Button an die rechte Position. */}
        {mode === "export" ? (
          <button
            onClick={onPresent}
            className="h-8 px-3 rounded-md border flex items-center gap-1.5 text-xs font-medium"
            style={{
              background: "hsl(var(--surface))",
              color: "hsl(var(--ink))",
              borderColor: "hsl(var(--hairline))",
            }}
            title="Präsentieren"
          >
            <Play size={13} /> Präsentieren
          </button>
        ) : (
          <>
            <button
              onClick={onPresent}
              className="h-8 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium"
              style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
              title="Präsentieren"
            >
              <Play size={13} /> Präsentieren
            </button>
          </>
        )}
      </div>
    </header>
    </>
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
      type="button"
      aria-pressed={active}
      className="workspace-mode-button h-7 px-3 rounded-md border flex items-center gap-1.5 text-[11.5px] font-semibold transition-colors shrink-0"
      style={{
        background: active ? "hsl(var(--accent-gold))" : "hsl(var(--surface-card))",
        color: active ? "hsl(var(--surface))" : "hsl(var(--ink))",
        borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
        boxShadow: active ? "0 1px 3px hsl(var(--accent-gold) / 0.45)" : "0 1px 1px hsl(var(--ink) / 0.08)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ModeDivider() {
  return null;
  return (
    <span
      aria-hidden
      className="mx-0.5 inline-block h-4 w-px"
      style={{ background: "hsl(var(--hairline))" }}
    />
  );
}
