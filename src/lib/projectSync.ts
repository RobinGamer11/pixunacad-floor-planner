/**
 * Zentrale Projekt-Synchronisierungsrichtlinie.
 *
 * Dies ist die einzige Stelle, die entscheidet, wie ein Projekt gesichert wird:
 *
 *  - "off"     – rein persönliches Projekt ohne Cloud-Eintrag: nur lokal.
 *  - "local"   – Projekt in der Cloud, keine weiteren Mitglieder: lokal
 *                arbeiten, Sicherung ausschließlich per Klick („In Cloud sichern“).
 *  - "standby" – geteilt, aber allein online: zusätzlich eine minimale
 *                Anwesenheitsverbindung; Sicherung weiterhin per Klick.
 *  - "live"    – mindestens zwei aktive Personen: objektweise Live-Synchronisierung;
 *                manuelles Speichern entfällt.
 *
 * CAD (inkl. Export) meldet sich hier als Quelle an. Sie behalten ihre
 * eigenen objektweisen Operationen, folgen aber derselben Entscheidung.
 * Es gibt keinen weiteren Weg mehr, über den Projektinhalte in die Cloud
 * geschrieben werden.
 */
import { useSyncExternalStore } from "react";
import { readMetadata, subscribeMetadata } from "./projectMetadataState";

export type ProjectSyncMode = "off" | "local" | "standby" | "live";

export interface ProjectSyncState {
  ready?: boolean;
  mode: ProjectSyncMode;
  /** Lokale Änderungen, die noch nicht in der Cloud bestätigt sind. */
  dirty: boolean;
  saving: boolean;
  error: string | null;
  lastSavedAt: number | null;
  /**
   * Gerätestand und Cloudstand weichen beim ersten Öffnen auf diesem Gerät
   * voneinander ab – es muss ausdrücklich gewählt werden.
   */
  conflict: boolean;
  /** In der Cloud liegt ein neuerer Stand, lokal gibt es aber offene Änderungen. */
  updateAvailable: boolean;
  /** Es liegt noch kein Cloud-Erststand vor (nur auf diesem Gerät). */
  deviceOnly: boolean;
}

export interface ProjectSyncSource {
  /** Überträgt ausschließlich die geänderten Objekte. */
  save(): Promise<void>;
  /** Cloudstand prüfen und – ohne offene lokale Änderungen – übernehmen. */
  refresh?(): Promise<void>;
  /** Ausdrückliche Wahl: Cloudstand laden (lokale Abweichungen verwerfen). */
  loadCloud?(): Promise<void>;
  /** Ausdrückliche Wahl: Gerätestand wird Hauptstand (mit Sicherheitskopie). */
  keepDevice?(): Promise<void>;
}

interface SourceEntry {
  source: ProjectSyncSource;
  state: ProjectSyncState;
}

const EMPTY: ProjectSyncState = {
  mode: "off",
  dirty: false,
  saving: false,
  error: null,
  lastSavedAt: null,
  conflict: false,
  updateAvailable: false,
  deviceOnly: false,
};

const sources = new Map<string, Map<string, SourceEntry>>();
const combined = new Map<string, ProjectSyncState>();
const listeners = new Set<() => void>();

const MODE_RANK: Record<ProjectSyncMode, number> = { off: 0, local: 1, standby: 2, live: 3 };

function recompute(projectId: string) {
  const entries = [...(sources.get(projectId)?.values() ?? [])];
  if (entries.length === 0) {
    combined.delete(projectId);
  } else {
    let mode: ProjectSyncMode = "off";
    let dirty = false;
    let saving = false;
    let error: string | null = null;
    let lastSavedAt: number | null = null;
    let conflict = false;
    let updateAvailable = false;
    let deviceOnly = false;
    let ready = true;
    for (const entry of entries) {
      if (MODE_RANK[entry.state.mode] > MODE_RANK[mode]) mode = entry.state.mode;
      dirty = dirty || entry.state.dirty;
      saving = saving || entry.state.saving;
      error = error ?? entry.state.error;
      conflict = conflict || entry.state.conflict;
      updateAvailable = updateAvailable || entry.state.updateAvailable;
      deviceOnly = deviceOnly || entry.state.deviceOnly;
      ready = ready && entry.state.ready === true;
      if (entry.state.lastSavedAt) lastSavedAt = Math.max(lastSavedAt ?? 0, entry.state.lastSavedAt);
    }
    const metadata = readMetadata(projectId);
    combined.set(projectId, { mode, dirty: dirty || !!metadata?.dirty, saving, error, lastSavedAt, conflict: conflict || !!metadata?.conflict, updateAvailable, deviceOnly, ready });
  }
  listeners.forEach((fn) => fn());
}

/** Meldet eine Quelle (CAD/Export) an. */
export function registerProjectSyncSource(
  projectId: string,
  key: string,
  source: ProjectSyncSource,
): () => void {
  let byKey = sources.get(projectId);
  if (!byKey) { byKey = new Map(); sources.set(projectId, byKey); }
  byKey.set(key, { source, state: { ...EMPTY } });
  recompute(projectId);
  return () => {
    const map = sources.get(projectId);
    map?.delete(key);
    if (map && map.size === 0) sources.delete(projectId);
    recompute(projectId);
  };
}

/** Zustandsmeldung einer Quelle (Modus, offene Änderungen, Fehler). */
export function reportProjectSyncSource(
  projectId: string,
  key: string,
  partial: Partial<ProjectSyncState>,
) {
  const entry = sources.get(projectId)?.get(key);
  if (!entry) return;
  entry.state = { ...entry.state, ...partial };
  recompute(projectId);
}

export function getProjectSyncState(projectId: string | undefined): ProjectSyncState {
  if (!projectId) return EMPTY;
  return combined.get(projectId) ?? EMPTY;
}

export function getRegisteredSyncSourceKeys(projectId: string | undefined): string[] {
  if (!projectId) return [];
  return [...(sources.get(projectId)?.keys() ?? [])];
}

/** Manuelle Sicherung: überträgt nur die geänderten Objekte je Quelle. */
export async function saveProjectToCloud(projectId: string): Promise<void> {
  const { flushAccountWrites } = await import("./accountStorage");
  await flushAccountWrites();
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Offline – Cloud-Sicherung nicht möglich.");
  const { ensureSharedProject } = await import("./projectRegistration");
  const { projectStore } = await import("./projectStore");
  const project = projectStore.getState().projects.find(p => p.id === projectId);
  const registration = await ensureSharedProject(projectId, project?.name);
  if (!registration.ok) throw new Error(registration.message);
  const { saveProjectMetadata } = await import("./projectMetadata");
  await saveProjectMetadata(projectId);
  if (!sources.get(projectId)?.size) {
    // The registration mounts the existing CAD session on the next React pass.
    await new Promise<void>((resolve, reject) => {
      const check = () => { const entries = [...(sources.get(projectId)?.values() ?? [])]; if (entries.length && entries.every(entry => entry.state.ready || entry.state.error || entry.state.conflict)) { clearTimeout(timeout); listeners.delete(check); resolve(); } };
      const timeout = setTimeout(() => { listeners.delete(check); reject(new Error("Keine verfügbare Speicherquelle. Bitte die Zeichnung öffnen und erneut versuchen.")); }, 8000);
      listeners.add(check); check();
    });
  }
  const entries = [...(sources.get(projectId)?.values() ?? [])];
  if (!entries.length) throw new Error("Die Zeichnung ist noch nicht zum Sichern bereit. Bitte Projekt öffnen und erneut versuchen.");
  for (const entry of entries) {
    if (!entry.state.ready) throw new Error("Der Projektstand wird noch geladen oder muss geklärt werden.");
    if (entry.state.conflict || entry.state.updateAvailable) throw new Error("Geräte- und Cloudstand müssen zuerst abgeglichen werden.");
    await entry.source.save();
    if (entry.state.error || entry.state.conflict || !entry.state.lastSavedAt) throw new Error(entry.state.error ?? "Cloud-Sicherung nicht bestätigt.");
  }
}

/** Cloudstand prüfen (Öffnen, Rückkehr in die App, Button „Aus Cloud aktualisieren“). */
export async function refreshProjectFromCloud(projectId: string): Promise<void> {
  const { projectAccessStore } = await import("./projectAccess");
  await projectAccessStore.reload();
  const entries = [...(sources.get(projectId)?.values() ?? [])];
  for (const entry of entries) await entry.source.refresh?.();
}

/** Ausdrückliche Konfliktentscheidung für alle Quellen des Projekts. */
export async function resolveProjectConflict(projectId: string, choice: "cloud" | "device"): Promise<void> {
  const { resolveProjectName } = await import("./projectMetadata");
  await resolveProjectName(projectId, choice);
  const entries = [...(sources.get(projectId)?.values() ?? [])];
  for (const entry of entries) {
    if (!entry.state.conflict && !entry.state.updateAvailable) continue;
    if (choice === "cloud") await entry.source.loadCloud?.();
    else await entry.source.keepDevice?.();
  }
}

export function useProjectSyncState(projectId: string | undefined): ProjectSyncState {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => getProjectSyncState(projectId),
    () => EMPTY,
  );
}

// Metadata changes invalidate the same status subscription, not a second save service.
subscribeMetadata(() => { for (const id of sources.keys()) recompute(id); listeners.forEach(fn => fn()); });
export function projectMetadataDirty(projectId?: string) { return projectId ? !!readMetadata(projectId)?.dirty : false; }
