import { useEffect } from "react";
import { getNetworkClient, isMissingSchemaError } from "./networkClient";
import { projectStore, type Project, type FileNode } from "./projectStore";
import { financeStore, type FinanceState } from "./financeStore";
import { projectAccessStore } from "./projectAccess";
import { registerProjectSyncSource, reportProjectSyncSource, type ProjectSyncMode } from "./projectSync";
import { accountGeneration, currentAccount, sessionIsCurrent } from "./accountStorage";
import { readMetadata } from "./projectMetadataState";

export interface HomeProjectPayload {
  details: {
    ort: string;
    bauherr?: string;
    projektTyp?: string;
    status?: string;
    adrStrasse?: string;
    adrHausnummer?: string;
    adrPlz?: string;
    adrOrt?: string;
    adrLand?: string;
    projektStart?: string;
    projektEnde?: string;
    favorite?: boolean;
    folderId?: string | null;
    sortIndex?: number;
  };
  overview: {
    konzept?: string;
    konzeptTitle?: string;
    konzeptCollapsed?: boolean;
    customFields?: Project["customFields"];
    settings?: Project["settings"];
  };
  tasks: Project["tasks"];
  events: Project["events"];
  files: Omit<FileNode, "dataUrl">[];
  finance: FinanceState;
}

export interface HomeSyncMeta {
  baseRevision: number;
  lastSavedAt: number | null;
  localSavedAt: number | null;
  dirty: boolean;
  conflict: boolean;
  updateAvailable: boolean;
  cadRemoteHead?: number;
  cadUpdateAvailable?: boolean;
}

const META_KEY = (id: string) => `pixuna.homestate.meta.${id}`;
const BACKUP_KEY = (id: string) => `pixuna.homestate.backup.${id}`;

export function readHomeMeta(projectId: string): HomeSyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY(projectId));
    if (raw) return JSON.parse(raw) as HomeSyncMeta;
  } catch {}
  return { baseRevision: 0, lastSavedAt: null, localSavedAt: null, dirty: false, conflict: false, updateAvailable: false };
}

function writeHomeMeta(projectId: string, meta: HomeSyncMeta) {
  try { localStorage.setItem(META_KEY(projectId), JSON.stringify(meta)); } catch {}
}

/** Extrahiert alle cloudfähigen Startseiteninhalte ohne CAD-Blätter und ohne Base64-Dateisammlungen. */
export function buildHomePayload(projectId: string): HomeProjectPayload | null {
  const p = projectStore.getState().projects.find((x) => x.id === projectId);
  if (!p) return null;
  const files = (p.files ?? []).map(({ dataUrl: _omit, ...rest }) => rest);
  return {
    details: {
      ort: p.ort,
      bauherr: p.bauherr,
      projektTyp: p.projektTyp,
      status: p.status,
      adrStrasse: p.adrStrasse,
      adrHausnummer: p.adrHausnummer,
      adrPlz: p.adrPlz,
      adrOrt: p.adrOrt,
      adrLand: p.adrLand,
      projektStart: p.projektStart,
      projektEnde: p.projektEnde,
      favorite: p.favorite,
      folderId: p.folderId,
      sortIndex: p.sortIndex,
    },
    overview: {
      konzept: p.konzept,
      konzeptTitle: p.konzeptTitle,
      konzeptCollapsed: p.konzeptCollapsed,
      customFields: p.customFields ?? [],
      settings: p.settings,
    },
    tasks: p.tasks ?? [],
    events: p.events ?? [],
    files,
    finance: financeStore.get(projectId),
  };
}

let applyingCloud = false;
const editSeqByProject = new Map<string, number>();
const lastFingerprintByProject = new Map<string, string>();

function payloadFingerprint(projectId: string): string {
  const payload = buildHomePayload(projectId);
  return payload ? JSON.stringify(payload) : "";
}

/** Wendet einen Startseiten-Cloudstand an, ohne bestehende CAD-Blätter oder lokale Dateiinhalte zu verlieren. */
export function applyHomePayload(projectId: string, payload: Partial<HomeProjectPayload>) {
  const current = projectStore.getState().projects.find((x) => x.id === projectId);
  if (!current) return;
  applyingCloud = true;
  try {
    const localDataUrls = new Map<string, string>();
    for (const f of current.files ?? []) if (f.dataUrl) localDataUrls.set(f.id, f.dataUrl);
    const mergedFiles: FileNode[] | undefined = Array.isArray(payload.files)
      ? payload.files.map((f) => ({ ...f, dataUrl: localDataUrls.get(f.id) }))
      : current.files;
    projectStore.applySharedProject({
      ...current,
      ...(payload.details ?? {}),
      ...(payload.overview ?? {}),
      tasks: Array.isArray(payload.tasks) ? payload.tasks : current.tasks,
      events: Array.isArray(payload.events) ? payload.events : current.events,
      files: mergedFiles,
      // CAD-Blätter niemals durch Startseiten-Sync überschreiben.
      sheets: current.sheets,
    });
    if (payload.finance) {
      financeStore.replaceState(projectId, payload.finance);
    }
    lastFingerprintByProject.set(projectId, payloadFingerprint(projectId));
  } finally {
    applyingCloud = false;
  }
}

function syncModeFor(projectId: string): ProjectSyncMode {
  const access = projectAccessStore.accessFor(projectId);
  if (!access.cloud) return "off";
  return access.shared ? "standby" : "local";
}

function publishState(projectId: string, extra: Partial<{ saving: boolean; error: string | null }> = {}) {
  const meta = readHomeMeta(projectId);
  const nameMeta = readMetadata(projectId);
  const mode = syncModeFor(projectId);
  reportProjectSyncSource(projectId, "home", {
    ready: true,
    mode,
    dirty: meta.dirty || !!nameMeta?.dirty,
    saving: extra.saving ?? false,
    error: extra.error ?? null,
    lastSavedAt: meta.lastSavedAt,
    conflict: meta.conflict || !!nameMeta?.conflict,
    updateAvailable: meta.updateAvailable || !!meta.cadUpdateAvailable,
    deviceOnly: mode === "off" && meta.lastSavedAt === null,
  });
}

/** Prüft leichtgewichtig, ob in der Cloud eine neuere CAD-Revision vorliegt (ohne Zeichnungen herunterzuladen). */
export async function checkCloudCadHead(projectId: string): Promise<void> {
  const client = getNetworkClient();
  if (!client || !projectAccessStore.accessFor(projectId).cloud) return;
  const owner = currentAccount(), epoch = accountGeneration();
  try {
    const { data, error } = await client
      .from("cad_object_ops")
      .select("seq")
      .eq("project_id", projectId)
      .order("seq", { ascending: false })
      .limit(1);
    if (error || !sessionIsCurrent(owner, epoch)) return;
    const head = Number((data as { seq?: number }[] | null)?.[0]?.seq ?? 0);
    const meta = readHomeMeta(projectId);
    const known = meta.cadRemoteHead ?? 0;
    if (head > known) {
      writeHomeMeta(projectId, { ...meta, cadRemoteHead: head, cadUpdateAvailable: known > 0 });
      publishState(projectId);
    }
  } catch {}
}

export async function refreshHomeProjectFromCloud(projectId: string): Promise<void> {
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  if (!projectAccessStore.accessFor(projectId).cloud) return;
  const owner = currentAccount(), epoch = accountGeneration();
  const { data, error } = await client
    .from("project_home_state")
    .select("revision,payload,updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!sessionIsCurrent(owner, epoch)) return;
  if (error) {
    if (isMissingSchemaError(error)) return;
    throw new Error(error.message);
  }
  if (!data) {
    await checkCloudCadHead(projectId);
    publishState(projectId);
    return;
  }
  const remoteRev = Number((data as { revision?: number }).revision ?? 0);
  const remotePayload = ((data as { payload?: Partial<HomeProjectPayload> }).payload ?? {}) as Partial<HomeProjectPayload>;
  const remoteTime = (data as { updated_at?: string }).updated_at ? Date.parse(String((data as { updated_at?: string }).updated_at)) : Date.now();
  const meta = readHomeMeta(projectId);
  if (remoteRev > meta.baseRevision) {
    if (meta.dirty) {
      writeHomeMeta(projectId, { ...meta, conflict: true, updateAvailable: true });
    } else {
      applyHomePayload(projectId, remotePayload);
      writeHomeMeta(projectId, {
        ...meta,
        baseRevision: remoteRev,
        lastSavedAt: Number.isFinite(remoteTime) ? remoteTime : Date.now(),
        dirty: false,
        conflict: false,
        updateAvailable: false,
      });
    }
  }
  await checkCloudCadHead(projectId);
  publishState(projectId);
}

async function saveHomeProject(projectId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Offline – Cloud-Sicherung nicht möglich.");
  if (!projectAccessStore.canEdit(projectId)) throw new Error("Keine Schreibberechtigung für dieses Projekt.");
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const payload = buildHomePayload(projectId);
  if (!payload) throw new Error("Projekt nicht verfügbar.");
  const owner = currentAccount(), epoch = accountGeneration();
  const meta = readHomeMeta(projectId);
  if (meta.conflict) throw new Error("Geräte- und Cloudstand weichen ab. Bitte zuerst einen Stand wählen.");
  const startSeq = editSeqByProject.get(projectId) ?? 0;
  publishState(projectId, { saving: true, error: null });
  try {
    const { data, error } = await client.rpc("save_project_home_state", {
      _project_id: projectId,
      _payload: payload,
      _base_revision: meta.baseRevision,
    });
    if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");
    if (error) {
      if (isMissingSchemaError(error)) {
        throw new Error("Datenbank-Migration für Startseiteninhalte (`project_home_state`) fehlt noch.");
      }
      throw new Error(error.message);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { accepted?: boolean; revision?: number; updated_at?: string } | undefined;
    if (!row) throw new Error("Keine Speicherbestätigung empfangen.");
    if (!row.accepted) {
      writeHomeMeta(projectId, { ...meta, conflict: true, updateAvailable: true });
      publishState(projectId, { saving: false });
      throw new Error("Ein anderes Gerät hat Startseiteninhalte geändert. Bitte Stand wählen.");
    }
    const changedDuringSave = (editSeqByProject.get(projectId) ?? 0) !== startSeq;
    const savedAt = row.updated_at ? Date.parse(row.updated_at) : Date.now();
    writeHomeMeta(projectId, {
      ...meta,
      baseRevision: Number(row.revision ?? meta.baseRevision + 1),
      lastSavedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
      dirty: changedDuringSave,
      conflict: false,
      updateAvailable: false,
    });
    publishState(projectId, { saving: false, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Startseiteninhalte konnten nicht gesichert werden.";
    publishState(projectId, { saving: false, error: msg });
    throw err;
  }
}

async function loadCloudHomeProject(projectId: string): Promise<void> {
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const owner = currentAccount(), epoch = accountGeneration();
  const { data, error } = await client
    .from("project_home_state")
    .select("revision,payload,updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!sessionIsCurrent(owner, epoch)) return;
  if (error) throw new Error(error.message);
  if (data) {
    const remoteRev = Number((data as { revision?: number }).revision ?? 0);
    const remotePayload = ((data as { payload?: Partial<HomeProjectPayload> }).payload ?? {}) as Partial<HomeProjectPayload>;
    const savedAt = (data as { updated_at?: string }).updated_at ? Date.parse(String((data as { updated_at?: string }).updated_at)) : Date.now();
    applyHomePayload(projectId, remotePayload);
    writeHomeMeta(projectId, {
      ...readHomeMeta(projectId),
      baseRevision: remoteRev,
      lastSavedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
      dirty: false,
      conflict: false,
      updateAvailable: false,
    });
  }
  publishState(projectId, { error: null });
}

async function keepDeviceHomeProject(projectId: string): Promise<void> {
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const localPayload = buildHomePayload(projectId);
  if (localPayload) {
    try { localStorage.setItem(BACKUP_KEY(projectId), JSON.stringify({ at: Date.now(), payload: localPayload })); } catch {}
  }
  const { data, error } = await client.from("project_home_state").select("revision").eq("project_id", projectId).maybeSingle();
  if (error && !isMissingSchemaError(error)) throw new Error(error.message);
  const currentRev = Number((data as { revision?: number } | null)?.revision ?? 0);
  writeHomeMeta(projectId, { ...readHomeMeta(projectId), baseRevision: currentRev, conflict: false, updateAvailable: false, dirty: true });
  await saveHomeProject(projectId);
}

const activeRegistrations = new Map<string, () => void>();

/** Stellt sicher, dass die Startseiten-Speicherquelle für dieses Projekt registriert ist. */
export function ensureHomeProjectSyncSource(projectId: string): () => void {
  const existing = activeRegistrations.get(projectId);
  if (existing) {
    publishState(projectId);
    return existing;
  }
  lastFingerprintByProject.set(projectId, payloadFingerprint(projectId));
  const unregister = registerProjectSyncSource(projectId, "home", {
    save: () => saveHomeProject(projectId),
    refresh: () => refreshHomeProjectFromCloud(projectId),
    loadCloud: () => loadCloudHomeProject(projectId),
    keepDevice: () => keepDeviceHomeProject(projectId),
  });
  const checkChange = () => {
    if (applyingCloud) return;
    const nextFp = payloadFingerprint(projectId);
    const prevFp = lastFingerprintByProject.get(projectId);
    if (prevFp !== undefined && nextFp !== prevFp) {
      lastFingerprintByProject.set(projectId, nextFp);
      editSeqByProject.set(projectId, (editSeqByProject.get(projectId) ?? 0) + 1);
      const meta = readHomeMeta(projectId);
      writeHomeMeta(projectId, { ...meta, dirty: true, localSavedAt: Date.now() });
      publishState(projectId);
    }
  };
  const unsubProject = projectStore.subscribe(checkChange);
  const unsubFinance = financeStore.subscribe(checkChange);
  const unsubAccess = projectAccessStore.subscribe(() => publishState(projectId));
  publishState(projectId);
  const cleanup = () => {
    unsubProject();
    unsubFinance();
    unsubAccess();
    unregister();
    activeRegistrations.delete(projectId);
  };
  activeRegistrations.set(projectId, cleanup);
  return cleanup;
}

/** Hook für die Startseite: bindet die Startseiten-Speicherquelle an das ausgewählte Projekt. */
export function useHomeProjectSync(projectId: string | undefined) {
  useEffect(() => {
    if (!projectId) return;
    const cleanup = ensureHomeProjectSyncSource(projectId);
    return () => { cleanup(); };
  }, [projectId]);
}