/**
 * Erststand geteilter Projekte.
 *
 * Wichtig: Hier wird NICHTS mehr automatisch in die Cloud geschrieben. Der
 * frühere Hintergrund-Upload des kompletten Projektstands ist entfallen.
 * Projektinhalte laufen ausschließlich über die zentrale
 * Synchronisierungsrichtlinie (`src/lib/projectSync.ts`): lokal arbeiten,
 * manuell objektweise sichern oder – bei zwei aktiven Personen – objektweise
 * live synchronisieren.
 *
 * Der vollständige Projektstand in `public.project_documents` bleibt reine
 * Wiederherstellungsbasis und wird nur beim erstmaligen Öffnen auf einem
 * Gerät gelesen, solange dort noch kein objektbasierter Stand bekannt ist.
 */
import type { Project } from "@/lib/projectStore";
import { projectStore } from "@/lib/projectStore";
import { projectAccessStore } from "@/lib/projectAccess";
import { baselineKey, hasBaseline } from "@/lib/cloudBaseline";
import { loadProjectDocument } from "@/lib/projectDocuments";

export type SharedSyncEvent =
  | { type: "loaded"; projectId: string }
  | { type: "conflict"; projectId: string }
  | { type: "forbidden"; projectId: string }
  | { type: "error"; projectId: string; message: string };

const listeners = new Set<(event: SharedSyncEvent) => void>();
export function onSharedSync(fn: (event: SharedSyncEvent) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const emit = (event: SharedSyncEvent) => listeners.forEach((fn) => fn(event));

function isPlausibleProject(value: unknown): value is Project {
  const p = value as Project | null;
  return Boolean(p && typeof p.id === "string" && Array.isArray(p.pages));
}

/**
 * Holt den gespeicherten Gesamtstand – nur beim erstmaligen Öffnen auf diesem
 * Gerät. Sobald ein objektbasierter Stand bekannt ist, bleibt die lokale
 * Arbeit unangetastet.
 */
export async function hydrateSharedProject(projectId: string): Promise<boolean> {
  const access = projectAccessStore.accessFor(projectId);
  if (!access.shared || access.role === null) return false;
  if (hasBaseline(baselineKey("mappe", projectId)) || hasBaseline(baselineKey("cad", projectId))) return false;
  try {
    const doc = await loadProjectDocument(projectId);
    if (!doc) return false;
    const remote = doc.payload?.project;
    if (!isPlausibleProject(remote)) return false;
    projectStore.applySharedProject(remote);
    emit({ type: "loaded", projectId });
    return true;
  } catch (error) {
    emit({
      type: "error",
      projectId,
      message: error instanceof Error ? error.message : "Gemeinsamer Stand konnte nicht geladen werden.",
    });
    return false;
  }
}

/** Platzhalter für den Abmeldevorgang (es gibt keinen Upload-Zustand mehr). */
export function resetSharedSyncState(_projectId?: string) {
  void _projectId;
}

/** Liste der aktuell geteilten Projekte (für die Workspace-Abgrenzung). */
export function sharedProjectIds(): Set<string> {
  const ids = new Set<string>();
  projectAccessStore.getState().byProject.forEach((access, id) => {
    if (access.shared && access.role !== null) ids.add(id);
  });
  return ids;
}
