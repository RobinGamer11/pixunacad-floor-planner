import { useState, useSyncExternalStore } from "react";
import { Save, Info, AlertTriangle, Loader2, CloudUpload, RefreshCw } from "lucide-react";
import { getLocalProjectSaveState, subscribeLocalProjectSaveState } from "@/cad/persist/localScenePersist";
import { useProjectSyncState, saveProjectToCloud, refreshProjectFromCloud, resolveProjectConflict, getRegisteredSyncSourceKeys } from "@/lib/projectSync";
import { registerProjectInCloud, useCloudProjectLifecycle } from "@/lib/useCloudProjectLifecycle";
import { workspaceSaveStatus } from "@/lib/workspaceSaveStatus";
import { readHomeMeta } from "@/lib/homeProjectSync";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

export function WorkspaceSaveStatus({ projectId, compact }: { projectId?: string; compact?: boolean }) {
  useCloudProjectLifecycle(projectId);
  const cloud = useProjectSyncState(projectId);
  const rawLocal = useSyncExternalStore(subscribeLocalProjectSaveState, () => getLocalProjectSaveState(projectId));
  const homeMeta = projectId ? readHomeMeta(projectId) : null;
  const sourceKeys = getRegisteredSyncSourceKeys(projectId);
  const homeOnly = sourceKeys.includes("home") && !sourceKeys.includes("cad");
  const local = homeOnly
    ? homeMeta?.localWriteError
      ? { ...rawLocal, status: "error" as const, detail: homeMeta.localWriteError, savedAt: homeMeta.localSavedAt ?? rawLocal.savedAt }
      : homeMeta?.localSavedAt
        ? { ...rawLocal, status: "saved" as const, savedAt: homeMeta.localSavedAt }
        : rawLocal
    : rawLocal;
  const state = workspaceSaveStatus(local, cloud, projectId);
  const pendingAreas: string[] = [];
  if (homeMeta?.dirtyAreas?.details) pendingAreas.push("Projektangaben");
  if (homeMeta?.dirtyAreas?.organization) pendingAreas.push("Organisation");
  if (homeMeta?.dirtyAreas?.finance) pendingAreas.push("Finanzen");
  if (homeMeta?.dirtyAreas?.documents) pendingAreas.push("Dokumente");
  if (sourceKeys.includes("cad") && cloud.dirty) pendingAreas.push("CAD/Export");
  const [decision, setDecision] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await fn(); } catch (error) { setActionError(error instanceof Error ? error.message : "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  };
  const date = (at: number | null) => at ? new Date(at).toLocaleString("de-DE") : "Noch nicht bestätigt";
  return <>
    <Popover key={projectId}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Speicherstatus" title="Speicherstatus" className={`relative shrink-0 ${compact ? "h-8 w-8 [&_svg]:size-4 " : ""}${state.complete ? "workspace-save-complete" : "workspace-save-pending"}`}>
          {state.busy ? <Loader2 className="animate-spin" /> : <><Save /><span className="workspace-save-badge">{state.complete ? <Info /> : <AlertTriangle />}</span></>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[100] max-w-[calc(100vw-24px)] space-y-3 text-sm" onPointerDown={e => e.stopPropagation()}>
        <h2 className="font-semibold">Speicherstatus</h2>
        <dl className="space-y-2">
          <div><dt className="font-medium">Auf dem Gerät</dt><dd className="text-xs text-muted-foreground">{local.status === "saved" ? "Gespeichert" : local.status === "saving" ? "Speicherung läuft …" : state.localError ? local.detail || "Speicherung fehlgeschlagen" : "Stand wird ermittelt …"}</dd><dd className="text-xs text-muted-foreground">{date(local.savedAt)}</dd></div>
          <div><dt className="font-medium">In der Cloud</dt><dd className="text-xs text-muted-foreground">{cloud.saving ? "Übertragung läuft …" : cloud.conflict ? "Geräte- und Cloudstand weichen ab. Bitte einen Stand wählen." : cloud.updateAvailable ? "Ein neuerer Cloudstand ist verfügbar." : cloud.error ? cloud.error : cloud.mode === "off" || cloud.deviceOnly ? "Nur auf diesem Gerät – kein bestätigter Cloudstand" : cloud.dirty ? "Änderungen warten auf Übertragung" : state.cloudSaved ? "Gespeichert" : "Speicherung noch nicht bestätigt"}</dd><dd className="text-xs text-muted-foreground">{date(cloud.lastSavedAt)}</dd></div>
        </dl>
        {homeOnly && <p className="text-[11px] text-muted-foreground">Startseiteninhalte (Angaben, Aufgaben, Finanzen, Dokumente).{homeMeta?.cadUpdateAvailable ? " Für die CAD-Zeichnung liegt ein neuerer Cloudstand vor." : ""}</p>}
        {pendingAreas.length > 0 && (
          <p className="text-[11px] text-muted-foreground">Ausstehend: {pendingAreas.join(", ")}</p>
        )}
        {actionError && <p role="alert" className="text-xs text-destructive">{actionError}</p>}
        {projectId && <div className="flex flex-wrap gap-2">
          {cloud.conflict || cloud.updateAvailable ? <Button size="sm" variant="outline" onClick={() => setDecision(true)}>Stand wählen</Button> : <Button size="sm" disabled={busy || cloud.saving} onClick={() => void run(async () => {
            await saveProjectToCloud(projectId);
          })}><CloudUpload />In Cloud sichern</Button>}
          {cloud.mode !== "off" && <Button size="sm" variant="outline" disabled={busy || cloud.saving} onClick={() => void run(() => refreshProjectFromCloud(projectId))}><RefreshCw />Aus Cloud aktualisieren</Button>}
        </div>}
      </PopoverContent>
    </Popover>
    <AlertDialog open={decision} onOpenChange={setDecision}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Welcher Stand soll gelten?</AlertDialogTitle><AlertDialogDescription>Die Stände werden nicht vermischt. Der gewählte Stand ersetzt den anderen; beim Übernehmen des Gerätestands wird vorher eine lokale Sicherheitskopie angelegt.</AlertDialogDescription></AlertDialogHeader>
      <div className="grid gap-2"><Button variant="outline" disabled={busy} onClick={() => projectId && void run(async () => { await resolveProjectConflict(projectId, "cloud"); setDecision(false); })}>Cloudstand laden</Button><Button variant="outline" disabled={busy} onClick={() => projectId && void run(async () => { await resolveProjectConflict(projectId, "device"); setDecision(false); })}>Gerätestand übernehmen</Button></div>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Später entscheiden</AlertDialogCancel></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}