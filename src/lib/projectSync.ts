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
 * CAD und Projektmappe melden sich hier als Quellen an. Sie behalten ihre
 * eigenen objektweisen Operationen, folgen aber derselben Entscheidung.
 * Es gibt keinen weiteren Weg mehr, über den Projektinhalte in die Cloud
 * geschrieben werden.
 */
import { useSyncExternalStore } from "react";

export type ProjectSyncMode = "off" | "local" | "standby" | "live";

export interface ProjectSyncState {
  mode: ProjectSyncMode;
  /** Lokale Änderungen, die noch nicht in der Cloud bestätigt sind. */
  dirty: boolean;
  saving: boolean;
  error: string | null;
  lastSavedAt: number | null;
}

export interface ProjectSyncSource {
  /** Überträgt ausschließlich die geänderten Objekte. */
  save(): Promise<void>;
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
    for (const entry of entries) {
      if (MODE_RANK[entry.state.mode] > MODE_RANK[mode]) mode = entry.state.mode;
      dirty = dirty || entry.state.dirty;
      saving = saving || entry.state.saving;
      error = error ?? entry.state.error;
      if (entry.state.lastSavedAt) lastSavedAt = Math.max(lastSavedAt ?? 0, entry.state.lastSavedAt);
    }
    combined.set(projectId, { mode, dirty, saving, error, lastSavedAt });
  }
  listeners.forEach((fn) => fn());
}

/** Meldet CAD bzw. Projektmappe als Quelle an. */
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

/** Manuelle Sicherung: überträgt nur die geänderten Objekte je Quelle. */
export async function saveProjectToCloud(projectId: string): Promise<void> {
  const entries = [...(sources.get(projectId)?.values() ?? [])];
  for (const entry of entries) {
    await entry.source.save();
  }
}

export function useProjectSyncState(projectId: string | undefined): ProjectSyncState {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => getProjectSyncState(projectId),
    () => EMPTY,
  );
}
