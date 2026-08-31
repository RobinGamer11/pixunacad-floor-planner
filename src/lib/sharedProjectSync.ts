/**
 * Synchronisierung geteilter Projekte (Paket 1 / Teilschritt 1).
 *
 * Grundsatz: Ein geteiltes Projekt existiert genau einmal in
 * `public.project_documents`. Alle Berechtigten arbeiten auf demselben
 * Datensatz, nicht auf persönlichen Kopien. Persönliche, nicht geteilte
 * Projekte bleiben unverändert in der bisherigen Workspace-Ablage.
 *
 * Sicherheitsnetze:
 *  - Gespeichert wird nur mit Schreibrecht (zusätzlich serverseitig geprüft).
 *  - Vor dem Schreiben wird die zuletzt geladene Version mitgegeben; ein
 *    veralteter Gesamtstand überschreibt niemals still einen neueren.
 *  - Ein leerer/fehlerhafter Stand wird nie über vorhandene Inhalte gelegt.
 */
import type { Project } from "@/lib/projectStore";
import { projectStore } from "@/lib/projectStore";
import { projectAccessStore } from "@/lib/projectAccess";
import {
  ProjectDocumentConflictError,
  loadProjectDocument,
  saveProjectDocument,
} from "@/lib/projectDocuments";

const SAVE_DEBOUNCE_MS = 2_500;

/** Zuletzt bekannte Serverversion je Projekt. */
const versions = new Map<string, number>();
/** Zuletzt hochgeladener Inhalt je Projekt (verhindert Leerlauf-Uploads). */
const lastSerialized = new Map<string, string>();
const timers = new Map<string, number>();
const inflight = new Set<string>();

export type SharedSyncEvent =
  | { type: "loaded"; projectId: string }
  | { type: "saved"; projectId: string; version: number }
  | { type: "conflict"; projectId: string }
  | { type: "forbidden"; projectId: string }
  | { type: "error"; projectId: string; message: string };

const listeners = new Set<(event: SharedSyncEvent) => void>();
export function onSharedSync(fn: (event: SharedSyncEvent) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const emit = (event: SharedSyncEvent) => listeners.forEach((fn) => fn(event));

function serialize(project: Project): string {
  // `updatedAt` bleibt außen vor, damit reine Zeitstempel keinen Upload auslösen.
  return JSON.stringify({ ...project, updatedAt: "" });
}

function isPlausibleProject(value: unknown): value is Project {
  const p = value as Project | null;
  return Boolean(p && typeof p.id === "string" && Array.isArray(p.pages));
}

/** Holt den gemeinsamen Stand und übernimmt ihn in den lokalen Store. */
export async function hydrateSharedProject(projectId: string): Promise<boolean> {
  const access = projectAccessStore.accessFor(projectId);
  if (!access.shared || access.role === null) return false;
  try {
    const doc = await loadProjectDocument(projectId);
    if (!doc) return false;
    const remote = doc.payload?.project;
    if (!isPlausibleProject(remote)) return false;
    versions.set(projectId, doc.version);
    lastSerialized.set(projectId, serialize(remote));
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

async function pushNow(projectId: string): Promise<void> {
  if (inflight.has(projectId)) return;
  const access = projectAccessStore.accessFor(projectId);
  if (!access.shared || !access.permissions.canEdit) return;
  const project = projectStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const serialized = serialize(project);
  if (lastSerialized.get(projectId) === serialized) return;

  inflight.add(projectId);
  try {
    const expected = versions.has(projectId) ? (versions.get(projectId) as number) : null;
    const version = await saveProjectDocument(
      projectId,
      { project: JSON.parse(JSON.stringify(project)) as Record<string, unknown> },
      expected,
    );
    versions.set(projectId, version);
    lastSerialized.set(projectId, serialized);
    emit({ type: "saved", projectId, version });
  } catch (error) {
    if (error instanceof ProjectDocumentConflictError) {
      emit({ type: "conflict", projectId });
      // Fremde Änderung gewinnt: neu laden statt still überschreiben.
      await hydrateSharedProject(projectId);
    } else if ((error as Error).name === "ProjectDocumentForbiddenError") {
      emit({ type: "forbidden", projectId });
    } else {
      emit({
        type: "error",
        projectId,
        message: error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
      });
    }
  } finally {
    inflight.delete(projectId);
  }
}

/** Plant das Speichern eines geteilten Projekts (gebündelt). */
export function scheduleSharedSave(projectId: string) {
  const access = projectAccessStore.accessFor(projectId);
  if (!access.shared || !access.permissions.canEdit) return;
  window.clearTimeout(timers.get(projectId));
  timers.set(projectId, window.setTimeout(() => { void pushNow(projectId); }, SAVE_DEBOUNCE_MS));
}

/** Merkt sich den aktuellen Stand als „bereits übertragen“ (nach Hydration). */
export function resetSharedSyncState(projectId?: string) {
  if (projectId) {
    versions.delete(projectId);
    lastSerialized.delete(projectId);
    window.clearTimeout(timers.get(projectId));
    timers.delete(projectId);
    return;
  }
  versions.clear();
  lastSerialized.clear();
  timers.forEach((t) => window.clearTimeout(t));
  timers.clear();
}

/** Liste der aktuell geteilten Projekte (für die Workspace-Abgrenzung). */
export function sharedProjectIds(): Set<string> {
  const ids = new Set<string>();
  projectAccessStore.getState().byProject.forEach((access, id) => {
    if (access.shared && access.role !== null) ids.add(id);
  });
  return ids;
}
