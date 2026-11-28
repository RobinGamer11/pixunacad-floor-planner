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
import { readHomeMeta } from "./homeProjectSync";
import { accountGeneration, currentAccount, sessionIsCurrent } from "./accountStorage";

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
const retained = new Map<string, Map<string, ProjectSyncState>>();
const combined = new Map<string, ProjectSyncState>();
const listeners = new Set<() => void>();

const MODE_RANK: Record<ProjectSyncMode, number> = { off: 0, local: 1, standby: 2, live: 3 };

let knownIdentity = "";
function checkIdentity() {
  const key = `${currentAccount()}:${accountGeneration()}`;
  if (knownIdentity !== key) { knownIdentity = key; sources.clear(); retained.clear(); combined.clear(); }
}
const stateKey = (id: string) => `pixuna.sync.sources.${id}`;
function recompute(projectId: string) {
  checkIdentity();
  const active = sources.get(projectId) ?? new Map<string, SourceEntry>();
  let inactive = retained.get(projectId);
  if (!inactive) {
    try { inactive = new Map(Object.entries(JSON.parse(localStorage.getItem(stateKey(projectId)) ?? "{}"))); }
    catch { inactive = new Map(); }
    retained.set(projectId, inactive);
  }
  const states = new Map(inactive);
  active.forEach((entry, key) => states.set(key, entry.state));
  const home = readHomeMeta(projectId), metadata = readMetadata(projectId);
  let mode: ProjectSyncMode = "off", dirty = home.dirty || !!metadata?.dirty, saving = false;
  let error = home.localWriteError || Object.values(home.areaErrors ?? {}).find(Boolean) || home.cloudError || null;
  let lastSavedAt: number | null = home.lastSavedAt, conflict = home.conflict || !!metadata?.conflict;
  let updateAvailable = home.updateAvailable || !!home.cadUpdateAvailable, deviceOnly = false, ready = true;
  states.forEach(state => {
    if (MODE_RANK[state.mode] > MODE_RANK[mode]) mode = state.mode;
    dirty ||= state.dirty; saving ||= state.saving; error ||= state.error;
    conflict ||= state.conflict; updateAvailable ||= state.updateAvailable; deviceOnly ||= state.deviceOnly;
    ready &&= state.ready === true;
    if (state.lastSavedAt !== null) lastSavedAt = lastSavedAt === null ? state.lastSavedAt : Math.min(lastSavedAt, state.lastSavedAt);
  });
  combined.set(projectId, { mode, dirty, saving, error, lastSavedAt, conflict, updateAvailable, deviceOnly, ready });
  try { localStorage.setItem(stateKey(projectId), JSON.stringify(Object.fromEntries([...states].map(([key, state]) => [key, { ...state, saving: false }])))); }
  catch { /* In-memory states/errors remain authoritative if browser storage is full. */ }
  listeners.forEach(fn => fn());
}

/** Meldet eine Quelle (CAD/Export) an. */
export function registerProjectSyncSource(
  projectId: string,
  key: string,
  source: ProjectSyncSource,
): () => void {
  checkIdentity();
  let byKey = sources.get(projectId);
  if (!byKey) { byKey = new Map(); sources.set(projectId, byKey); }
  byKey.set(key, { source, state: { ...EMPTY, ...retained.get(projectId)?.get(key) } });
  recompute(projectId);
  return () => {
    const map = sources.get(projectId);
    const entry = map?.get(key);
    if (entry) {
      let states = retained.get(projectId);
      if (!states) { states = new Map(); retained.set(projectId, states); }
      states.set(key, { ...entry.state, saving: false });
    }
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
  checkIdentity();
  const entry = sources.get(projectId)?.get(key);
  if (entry) entry.state = { ...entry.state, ...partial };
  else {
    let states = retained.get(projectId);
    if (!states) { states = new Map(); retained.set(projectId, states); }
    states.set(key, { ...EMPTY, ...states.get(key), ...partial });
  }
  recompute(projectId);
}

export function getProjectSyncState(projectId: string | undefined): ProjectSyncState {
  checkIdentity();
  if (!projectId) return EMPTY;
  if (!combined.has(projectId)) recompute(projectId);
  return combined.get(projectId) ?? EMPTY;
}

export function getProjectAreaSyncState(projectId: string, key: string): ProjectSyncState | undefined {
  getProjectSyncState(projectId);
  return sources.get(projectId)?.get(key)?.state ?? retained.get(projectId)?.get(key);
}

export function getRegisteredSyncSourceKeys(projectId: string | undefined): string[] {
  checkIdentity();
  if (!projectId) return [];
  return [...(sources.get(projectId)?.keys() ?? [])];
}

/** Manuelle Sicherung: überträgt nur die geänderten Objekte je Quelle. */
export async function saveProjectToCloud(projectId: string): Promise<void> {
  const owner = currentAccount(), epoch = accountGeneration();
  const assertSession = () => { if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt."); };
  const { flushAccountWrites } = await import("./accountStorage");
  await flushAccountWrites();
  assertSession();
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Offline – Cloud-Sicherung nicht möglich.");
  const { ensureSharedProject } = await import("./projectRegistration");
  const { projectStore } = await import("./projectStore");
  const project = projectStore.getState().projects.find(p => p.id === projectId);
  const registration = await ensureSharedProject(projectId, project?.name);
  if (!registration.ok) throw new Error(registration.message);
  assertSession();
  const { saveProjectMetadata } = await import("./projectMetadata");
  await saveProjectMetadata(projectId);
  assertSession();
  const registeredKeys = new Set(sources.get(projectId)?.keys() ?? []);
  const { saveHomeProjectDirect, refreshHomeProjectFromCloud } = await import("./homeProjectSync");
  if (!registeredKeys.has("home")) {
    await refreshHomeProjectFromCloud(projectId);
    assertSession();
    await saveHomeProjectDirect(projectId);
  }
  for (const entry of [...(sources.get(projectId)?.values() ?? [])]) {
    assertSession();
    // Home may be waiting for its first revision check; its save performs that check.
    if (!entry.state.ready && entry !== sources.get(projectId)?.get("home")) throw new Error("Der Projektstand wird noch geladen oder muss geklärt werden.");
    if (entry.state.conflict || entry.state.updateAvailable) throw new Error("Geräte- und Cloudstand müssen zuerst abgeglichen werden.");
    await entry.source.save();
    assertSession();
    if (entry.state.error || entry.state.conflict || !entry.state.lastSavedAt) throw new Error(entry.state.error ?? "Cloud-Sicherung nicht bestätigt.");
  }
  if (!registeredKeys.has("cad")) {
    const { syncLocalCadToCloud } = await import("./cadCollab/headlessCadSync");
    try {
      await syncLocalCadToCloud(projectId);
      assertSession();
      reportProjectSyncSource(projectId, "cad", { ready: true, mode: "local", lastSavedAt: Date.now(), dirty: false, error: null, conflict: false, updateAvailable: false, deviceOnly: false });
    } catch (err) {
      if (sessionIsCurrent(owner, epoch)) reportProjectSyncSource(projectId, "cad", { ready: true, mode: "local", dirty: true, error: err instanceof Error ? err.message : "CAD-Sicherung fehlgeschlagen." });
      throw err;
    }
  }
  recompute(projectId);
  if (getProjectSyncState(projectId).dirty) throw new Error("Während der Sicherung sind weitere Änderungen entstanden. Bitte erneut sichern.");

}

/** Cloudstand prüfen (Öffnen, Rückkehr in die App, Button „Aus Cloud aktualisieren“). */
export async function refreshProjectFromCloud(projectId: string): Promise<void> {
  const { projectAccessStore } = await import("./projectAccess");
  const owner = currentAccount(), epoch = accountGeneration();
  await projectAccessStore.reload();
  if (!sessionIsCurrent(owner, epoch)) return;
  const { refreshHomeProjectFromCloud } = await import("./homeProjectSync");
  if (!sources.get(projectId)?.has("home")) await refreshHomeProjectFromCloud(projectId);
  if (!sessionIsCurrent(owner, epoch)) return;
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
