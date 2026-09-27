import React from "react";
import { useNavigate } from "react-router-dom";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import {
  refreshProjectFromCloud,
  resolveProjectConflict,
  saveProjectToCloud,
  useProjectSyncState,
} from "@/lib/projectSync";
import { registerProjectInCloud, useCloudProjectLifecycle } from "@/lib/useCloudProjectLifecycle";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  FolderKanban,
  Compass,
  Trash2,
  Copy,
  Crosshair,
  ClipboardPaste,
  ClipboardPlus,
  HelpCircle,
  TabletSmartphone,
  Wallet,
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
  /** Ansicht zentrieren (CAD: Weltursprung, Mappe: Blatt/100 %). */
  onCenterView?: () => void;
  canPaste?: boolean;
  onPaste?: () => void;
  /** Mehrfach einfügen — Kopie bleibt nach dem Setzen am Mauszeiger. */
  multiPasteActive?: boolean;
  onMultiPaste?: () => void;
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
  onCenterView,
  canPaste = false,
  onPaste,
  multiPasteActive = false,
  onMultiPaste,
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

  return (
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
            icon={<Compass size={13} />}
            label="CAD"
            active={mode === "cad"}
            onClick={goCad}
          />
          <ModeDivider />
          <ModeButton
            icon={<FolderKanban size={13} />}
            label="Mappe"
            active={mode === "workspace"}
            onClick={goWorkspace}
          />

        </div>
      </div>


      <div className="shrink-0 w-8 md:flex-1 md:min-w-8" />
      {/* Right: Undo/Redo · Zoom · Präsentieren · Exportieren */}
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0 pl-2">

        <CloudSaveControl projectId={projectId} />


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




        <button
          onClick={onPresent}
          className="h-8 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium"
          style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
          title="Präsentieren"
        >
          <Play size={13} /> Präsentieren
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

/**
 * Einziger Speicherweg für Projektinhalte: allein arbeiten und per Klick
 * objektweise sichern – oder, sobald jemand anderes im Projekt ist,
 * automatische Live-Synchronisierung.
 */
const chip = "h-8 px-2.5 rounded-md flex items-center gap-1.5 text-[11px] font-medium";
const mutedStyle = { background: "hsl(var(--surface-muted))", color: "hsl(var(--ink-soft))" };
const buttonStyle = {
  background: "hsl(var(--surface-muted))",
  color: "hsl(var(--ink))",
  borderColor: "hsl(var(--hairline))",
};
/** Auffälliger Gold-Stil wie die aktive Bedienungshilfe – für Cloud-Hinweise, die der Nutzer sehen soll. */
const highlightStyle = {
  background: "hsl(var(--accent-gold))",
  color: "hsl(var(--surface))",
  borderColor: "hsl(var(--accent-gold))",
};

function CloudSaveControl({ projectId }: { projectId?: string }) {
  useCloudProjectLifecycle(projectId);
  const sync = useProjectSyncState(projectId);
  const [decisionOpen, setDecisionOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  if (!projectId) return null;

  const decide = async (choice: "cloud" | "device") => {
    setBusy(true);
    try { await resolveProjectConflict(projectId, choice); } finally { setBusy(false); setDecisionOpen(false); }
  };

  const decisionDialog = (
    <AlertDialog open={decisionOpen} onOpenChange={setDecisionOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Welcher Stand soll gelten?</AlertDialogTitle>
          <AlertDialogDescription>
            {sync.conflict
              ? "Auf diesem Gerät und in der Cloud liegen unterschiedliche Stände dieses Projekts. Sie werden nicht vermischt – bitte wähle einen aus."
              : "In der Cloud liegt ein neuerer Stand. Auf diesem Gerät gibt es noch ungesicherte Änderungen."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 text-sm">
          <button
            disabled={busy}
            onClick={() => { void decide("cloud"); }}
            className="rounded-md border p-3 text-left"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <div className="font-medium flex items-center gap-1.5"><CloudDownload size={14} /> Cloudstand laden</div>
            <div className="text-muted-foreground text-xs mt-1">Der gesicherte Cloudstand ersetzt CAD und Mappe auf diesem Gerät. Abweichende Inhalte dieses Geräts werden verworfen.</div>
          </button>
          <button
            disabled={busy}
            onClick={() => { void decide("device"); }}
            className="rounded-md border p-3 text-left"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <div className="font-medium flex items-center gap-1.5"><Smartphone size={14} /> Gerätestand als Hauptstand übernehmen</div>
            <div className="text-muted-foreground text-xs mt-1">Vorher wird eine lokale Sicherheitskopie angelegt. Danach ersetzt der Stand dieses Geräts den Cloudstand für alle Geräte.</div>
          </button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Später entscheiden</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (sync.mode === "off") {
    return (
      <button
        onClick={async () => {
          const res = await registerProjectInCloud(projectId);
          if (!res.ok) toast({ title: "Nur auf diesem Gerät", description: res.message, variant: "destructive" });
        }}
        className={`${chip} border`}
        style={highlightStyle}
        title="Dieses Projekt ist noch nicht mit deinem Konto verbunden. Klicken, um es in der Cloud anzumelden."
      >
        <Smartphone size={14} /> Nur auf diesem Gerät
      </button>
    );
  }

  if (sync.mode === "live") {
    return (
      <span
        className={chip}
        style={highlightStyle}
        title="Alle Änderungen werden direkt mit dem Team synchronisiert."
      >
        <Users size={14} /> Live im Team
      </span>
    );
  }

  if (sync.saving) {
    return (
      <span className={chip} style={highlightStyle}>
        <Loader2 size={14} className="animate-spin" /> Synchronisiere Änderungen …
      </span>
    );
  }

  if (sync.conflict || sync.updateAvailable) {
    return (
      <>
        <button
          onClick={() => setDecisionOpen(true)}
          className={`${chip} border`}
          style={highlightStyle}
          title="Bitte wählen, welcher Stand gelten soll."
        >
          <AlertTriangle size={14} /> {sync.conflict ? "Stände abweichend" : "Aktualisierung verfügbar"}
        </button>
        {decisionDialog}
      </>
    );
  }

  if (sync.error) {
    return (
      <button
        onClick={() => { void saveProjectToCloud(projectId); }}
        className={`${chip} border`}
        style={highlightStyle}
        title={`${sync.error} Erneut versuchen?`}
      >
        <CloudUpload size={14} /> Sicherung fehlgeschlagen
      </button>
    );
  }

  if (!sync.dirty) {
    return (
      <span className="flex items-center gap-1">
        <span className={chip} style={mutedStyle} title="Alle Änderungen sind in der Cloud gesichert.">
          <Check size={14} /> In Cloud gesichert
        </span>
        <button
          onClick={() => { void refreshProjectFromCloud(projectId); }}
          className="h-8 w-8 rounded-md grid place-items-center"
          style={highlightStyle}
          title="Aus Cloud aktualisieren"
          aria-label="Aus Cloud aktualisieren"
        >
          <RefreshCw size={14} />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => { void saveProjectToCloud(projectId); }}
      className={`${chip} border`}
      style={highlightStyle}
      title={sync.deviceOnly
        ? "Noch kein Cloudstand – klicken, um den Stand dieses Geräts vollständig in die Cloud zu übernehmen."
        : "Lokal gespeichert – noch nicht in Cloud gesichert"}
    >
      <CloudUpload size={14} /> {sync.deviceOnly ? "Nur auf diesem Gerät · In Cloud sichern" : "Ungesicherte Änderungen · In Cloud sichern"}
    </button>
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
