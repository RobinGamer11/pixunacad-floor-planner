import { useEffect } from "react";
import { classifyCloudError, getNetworkClient, isMissingSchemaError, withAuthRetry } from "./networkClient";
import { projectStore, type Project, type FileNode } from "./projectStore";
import { financeStore, onFinanceWriteError, type FinanceState } from "./financeStore";
import { timelineStore, type TlState } from "./timelineStore";
import { syncProjectPeriod } from "./projectPeriodSync";
import { flushPendingStorageDeletions, readPendingStorageDeletions, syncPendingProjectFiles } from "./projectFileStorage";
import { projectAccessStore } from "./projectAccess";
import { registerProjectSyncSource, reportProjectSyncSource, type ProjectSyncMode } from "./projectSync";
import { accountGeneration, currentAccount, registerLocalFlusher, sessionIsCurrent } from "./accountStorage";
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
    createdAtIso?: string;
    erstelltAm?: string;
    isTemplate?: boolean;
    thumbnail?: string;
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
  timeline?: TlState;
  files: Omit<FileNode, "dataUrl">[];
  finance: FinanceState;
}

export interface HomeDirtyAreas {
  details?: boolean;
  organization?: boolean;
  finance?: boolean;
  documents?: boolean;
}

export interface HomeSyncMeta {
  baseRevision: number;
  lastSavedAt: number | null;
  localSavedAt: number | null;
  dirty: boolean;
  dirtyAreas?: HomeDirtyAreas;
  localWriteError?: string | null;
  areaErrors?: Partial<Record<keyof HomeDirtyAreas, string | null>>;
  cloudError?: string | null;
  loadStatus?: "not_loaded" | "empty" | "local_only" | "in_sync" | "conflict" | "error";
  conflict: boolean;
  updateAvailable: boolean;
  cadRemoteHead?: number;
  cadUpdateAvailable?: boolean;
}

const META_KEY = (id: string) => `pixuna.homestate.meta.${id}`;
const BACKUP_KEY = (id: string) => `pixuna.homestate.backup.${id}`;

const metaMemory = new Map<string, HomeSyncMeta>();
const metaIdentity = (id: string) => `${currentAccount()}:${id}`;
export function readHomeMeta(projectId: string): HomeSyncMeta {
  const cached = metaMemory.get(metaIdentity(projectId));
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(META_KEY(projectId));
    if (raw) return JSON.parse(raw) as HomeSyncMeta;
  } catch {
    return { baseRevision: 0, lastSavedAt: null, localSavedAt: null, dirty: true, conflict: false, updateAvailable: false, loadStatus: "error", localWriteError: "Lokaler Speicherstatus konnte nicht gelesen werden." };
  }
  return { baseRevision: 0, lastSavedAt: null, localSavedAt: null, dirty: false, conflict: false, updateAvailable: false };
}

function writeHomeMeta(projectId: string, meta: HomeSyncMeta) {
  const key = metaIdentity(projectId);
  metaMemory.set(key, meta);
  try { localStorage.setItem(META_KEY(projectId), JSON.stringify(meta)); }
  catch (err) { metaMemory.set(key, { ...meta, localWriteError: err instanceof Error ? err.message : "Lokaler Speicher voll." }); }
}

function hasLocalHomeContent(projectId: string): boolean {
  const p = projectStore.getState().projects.find((x) => x.id === projectId);
  if (!p) return false;
  if (timelineStore.hasLocalData(projectId)) return true;
  if ((p.files?.length ?? 0) > 0) return true;
  if ((p.konzept ?? "").trim().length > 0 || p.customFields?.length || p.tasks.length || p.events.length) return true;
  if ([p.ort, p.bauherr, p.adrStrasse, p.projektStart, p.projektEnde].some(v => !!v)) return true;
  const fin = financeStore.get(projectId);
  if ((fin.nodes?.length ?? 0) > 0 || (fin.positions?.length ?? 0) > 0 || fin.projectEstimate || fin.projectNote) return true;
  return false;
}

/** Extrahiert alle cloudfähigen Startseiteninhalte ohne CAD-Blätter und ohne Base64-Dateisammlungen. */
export function buildHomePayload(projectId: string): HomeProjectPayload | null {
  const p = projectStore.getState().projects.find((x) => x.id === projectId);
  if (!p) return null;
  const files = (p.files ?? []).map(({ dataUrl: _omit, localBlob: _local, ...rest }) => rest);
  const safeThumbnail = p.thumbnail && (!p.thumbnail.startsWith("data:") || p.thumbnail.length <= 64 * 1024)
    ? p.thumbnail
    : undefined;
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
      createdAtIso: p.createdAtIso,
      erstelltAm: p.erstelltAm,
      isTemplate: p.isTemplate,
      thumbnail: safeThumbnail,
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
    timeline: timelineStore.getState(projectId),
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
    const sharedDetails: Partial<HomeProjectPayload["details"]> = payload.details ? { ...payload.details } : {};
    delete sharedDetails.favorite;
    delete sharedDetails.folderId;
    delete sharedDetails.sortIndex;
    projectStore.applySharedProject({
      ...current,
      ...sharedDetails,
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
    if (payload.timeline && Array.isArray(payload.timeline.items)) {
      timelineStore.replaceState(projectId, payload.timeline);
    }
    if (
      (payload.details?.projektStart || payload.details?.projektEnde) &&
      !payload.timeline?.period?.start &&
      !payload.timeline?.period?.end
    ) {
      syncProjectPeriod(projectId, payload.details.projektStart, payload.details.projektEnde);
    }
    const meta = readHomeMeta(projectId);
    const error = meta.localWriteError || Object.values(meta.areaErrors ?? {}).find(Boolean);
    if (error) throw new Error(`Cloudstand konnte nicht vollständig lokal gespeichert werden: ${error}`);
    lastFingerprintByProject.set(metaIdentity(projectId), payloadFingerprint(projectId));
  } finally {
    applyingCloud = false;
  }
}

/** Mutation observers live independently of the selected view. */
function markArea(projectId: string, area: keyof HomeDirtyAreas, error?: string | null) {
  if (applyingCloud) return;
  editSeqByProject.set(projectId, (editSeqByProject.get(projectId) ?? 0) + 1);
  const meta = readHomeMeta(projectId);
  writeHomeMeta(projectId, { ...meta, dirty: true, dirtyAreas: { ...meta.dirtyAreas, [area]: true },
    areaErrors: { ...meta.areaErrors, ...(error !== undefined ? { [area]: error } : {}) },
    localSavedAt: error || meta.areaErrors?.[area] || meta.localWriteError ? meta.localSavedAt : Date.now() });
  publishState(projectId);
}
timelineStore.subscribeAll(id => markArea(id, "organization"));
financeStore.subscribeAll(id => markArea(id, "finance"));
projectStore.onWrite((id, error, fields) => {
  if (applyingCloud) { if (error) handleAreaError(id, "details", error); return; }
  const fingerprint = payloadFingerprint(id);
  const identity = metaIdentity(id);
  if (fingerprint !== lastFingerprintByProject.get(identity) || error) {
    lastFingerprintByProject.set(identity, fingerprint);
    markArea(id, fields?.includes("files") || fields?.includes("photos") ? "documents" : "details", error);
  } else if (error === null) handleAreaError(id, "details", null);
});
function handleAreaError(projectId: string, area: keyof HomeDirtyAreas, error: string | null) {
  const meta = readHomeMeta(projectId);
  writeHomeMeta(projectId, { ...meta, areaErrors: { ...meta.areaErrors, [area]: error } });
  publishState(projectId);
}
timelineStore.onWriteError((id, error) => handleAreaError(id, "organization", error));
onFinanceWriteError((id, error) => handleAreaError(id, "finance", error));

function syncModeFor(projectId: string): ProjectSyncMode {
  const access = projectAccessStore.accessFor(projectId);
  if (!access.cloud) return "off";
  return access.shared ? "standby" : "local";
}

function publishState(projectId: string, extra: Partial<{ saving: boolean; error: string | null }> = {}) {
  const meta = readHomeMeta(projectId);
  const nameMeta = readMetadata(projectId);
  const mode = syncModeFor(projectId);
  if (extra.error !== undefined) writeHomeMeta(projectId, { ...meta, cloudError: extra.error });
  reportProjectSyncSource(projectId, "home", {
    ready: mode === "off" || (!!meta.loadStatus && meta.loadStatus !== "not_loaded" && meta.loadStatus !== "error"),
    mode,
    dirty: meta.dirty || !!nameMeta?.dirty,
    saving: extra.saving ?? false,
    error: meta.localWriteError || Object.values(meta.areaErrors ?? {}).find(Boolean) || extra.error || (extra.error === null ? null : meta.cloudError) || null,
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
    if (!sessionIsCurrent(owner, epoch)) return;
    if (error) throw error;
    const head = Number((data as { seq?: number }[] | null)?.[0]?.seq ?? 0);
    const meta = readHomeMeta(projectId);
    const known = meta.cadRemoteHead ?? 0;
    if (head > known) {
      writeHomeMeta(projectId, { ...meta, cadRemoteHead: head, cadUpdateAvailable: known > 0 });
      publishState(projectId);
    }
  } catch (err) {
    if (sessionIsCurrent(owner, epoch)) throw new Error(classifyCloudError(err, "CAD-Cloudstand konnte nicht geprüft werden.").message);
  }
}

async function refreshHomeProjectOnce(projectId: string): Promise<void> {
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  if (!projectAccessStore.accessFor(projectId).cloud) throw new Error("Cloudberechtigungen sind noch nicht geladen.");
  const owner = currentAccount(), epoch = accountGeneration();
  const data = await withAuthRetry(async () => {
    const res = await client
      .from("project_home_state")
      .select("revision,payload,updated_at")
      .eq("project_id", projectId)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data;
  }).catch((err) => {
    if (isMissingSchemaError(err)) {
      throw new Error("Datenbank-Migration für Startseiteninhalte (`project_home_state`) fehlt noch.");
    }
    throw new Error(classifyCloudError(err, "Startseiteninhalte konnten nicht geladen werden.").message);
  });
  if (!sessionIsCurrent(owner, epoch)) return;
  if (!data) {
    const meta = readHomeMeta(projectId);
    const loadStatus = hasLocalHomeContent(projectId) ? "local_only" : "empty";
    writeHomeMeta(projectId, { ...meta, loadStatus });
    await checkCloudCadHead(projectId);
    publishState(projectId);
    return;
  }
  const remoteRev = Number((data as { revision?: number }).revision ?? 0);
  const remotePayload = ((data as { payload?: Partial<HomeProjectPayload> }).payload ?? {}) as Partial<HomeProjectPayload>;
  const remoteTime = (data as { updated_at?: string }).updated_at ? Date.parse(String((data as { updated_at?: string }).updated_at)) : Date.now();
  const meta = readHomeMeta(projectId);
  if (remoteRev > meta.baseRevision) {
    const firstLoadWithLocalData = meta.baseRevision === 0 && meta.lastSavedAt === null && hasLocalHomeContent(projectId);
    if (meta.dirty || firstLoadWithLocalData) {
      writeHomeMeta(projectId, { ...meta, conflict: true, updateAvailable: true, loadStatus: "conflict" });
    } else {
      applyHomePayload(projectId, remotePayload);
      writeHomeMeta(projectId, {
        ...readHomeMeta(projectId),
        baseRevision: remoteRev,
        lastSavedAt: Number.isFinite(remoteTime) ? remoteTime : Date.now(),
        dirty: false,
        dirtyAreas: {},
        loadStatus: "in_sync",
        conflict: false,
        updateAvailable: false,
      });
    }
  } else if (meta.loadStatus !== "in_sync") {
    writeHomeMeta(projectId, { ...meta, loadStatus: "in_sync" });
  }
  await checkCloudCadHead(projectId);
  publishState(projectId);
}

const pendingLoads = new Map<string, Promise<void>>();
export function refreshHomeProjectFromCloud(projectId: string): Promise<void> {
  const key = metaIdentity(projectId), owner = currentAccount(), epoch = accountGeneration();
  const existing = pendingLoads.get(key);
  if (existing) return existing;
  const job = refreshHomeProjectOnce(projectId).catch(err => {
    if (sessionIsCurrent(owner, epoch)) {
      writeHomeMeta(projectId, { ...readHomeMeta(projectId), loadStatus: "error", cloudError: err instanceof Error ? err.message : "Cloudstand konnte nicht geladen werden." });
      publishState(projectId);
    }
    throw err;
  }).finally(() => { pendingLoads.delete(key); });
  pendingLoads.set(key, job);
  return job;
}

/**
 * Aktualisiert die Startseiten- und Organisationsinhalte mehrerer Projekte mit begrenzter Parallelität,
 * ohne CAD-Editoren zu starten oder Zeichnungen herunterzuladen.
 */
export async function refreshAllHomeProjectsFromCloud(
  projectIds: string[],
  concurrency = 4,
): Promise<{ ok: string[]; failed: Array<{ projectId: string; error: string }> }> {
  const ok: string[] = [];
  const failed: Array<{ projectId: string; error: string }> = [];
  const queue = [...new Set(projectIds)];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      try {
        await refreshHomeProjectFromCloud(id);
        if (readHomeMeta(id).conflict) throw new Error("Lokale Änderungen geschützt; Projektstand muss abgeglichen werden.");
        ok.push(id);
      } catch (err) {
        failed.push({ projectId: id, error: err instanceof Error ? err.message : "Aktualisierung fehlgeschlagen." });
      }
    }
  });
  await Promise.all(workers);
  return { ok, failed };
}

export async function saveHomeProjectDirect(projectId: string): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Offline – Cloud-Sicherung nicht möglich.");
  if (!projectAccessStore.canEdit(projectId)) throw new Error("Keine Schreibberechtigung für dieses Projekt.");
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const owner = currentAccount(), epoch = accountGeneration();
  if (!readHomeMeta(projectId).loadStatus || ["not_loaded", "error"].includes(readHomeMeta(projectId).loadStatus ?? "")) await refreshHomeProjectFromCloud(projectId);
  if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");
  const meta = readHomeMeta(projectId);
  if (meta.localWriteError || Object.values(meta.areaErrors ?? {}).some(Boolean)) throw new Error(meta.localWriteError || Object.values(meta.areaErrors ?? {}).find(Boolean) || "Lokale Speicherung fehlgeschlagen.");
  if (meta.conflict) throw new Error("Geräte- und Cloudstand weichen ab. Bitte zuerst einen Stand wählen.");
  publishState(projectId, { saving: true, error: null });
  try {
    // Ausstehende Projektdateien zuerst quotengeprüft in Storage hochladen.
    const fileSync = await syncPendingProjectFiles(projectId);
    if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt.");
    if (fileSync.failed.length > 0) {
      throw new Error(`Datei-Upload fehlgeschlagen: ${fileSync.failed.join("; ")}`);
    }
    const payload = buildHomePayload(projectId);
    if (!payload) throw new Error("Projekt nicht verfügbar.");
    const acknowledgedSeq = editSeqByProject.get(projectId) ?? 0;
    const pendingDeletes = readPendingStorageDeletions(projectId);
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
    const changedDuringSave = (editSeqByProject.get(projectId) ?? 0) !== acknowledgedSeq;
    const savedAt = row.updated_at ? Date.parse(row.updated_at) : Date.now();
    writeHomeMeta(projectId, {
      ...readHomeMeta(projectId),
      baseRevision: Number(row.revision ?? meta.baseRevision + 1),
      lastSavedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
      dirty: changedDuringSave,
      dirtyAreas: changedDuringSave ? readHomeMeta(projectId).dirtyAreas : {},
      loadStatus: "in_sync",
      conflict: false,
      updateAvailable: false,
    });
    const cleanup = await flushPendingStorageDeletions(projectId, { revision: Number(row.revision), files: payload.files, pending: pendingDeletes });
    if (cleanup.failed.length) throw new Error(`Dateibereinigung ausstehend: ${cleanup.failed.join("; ")}`);
    publishState(projectId, { saving: false, error: null });
  } catch (err) {
    const msg = classifyCloudError(err, "Startseiteninhalte konnten nicht gesichert werden.").message;
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
    try {
      localStorage.setItem(BACKUP_KEY(projectId), JSON.stringify({ at: Date.now(), payload: localPayload }));
    } catch {
      throw new Error("Lokale Sicherheitskopie konnte nicht gespeichert werden (Gerätespeicher voll). Abgebrochen.");
    }
  }
  const { data, error } = await client.from("project_home_state").select("revision").eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(classifyCloudError(error, "Cloudstand konnte nicht geprüft werden.").message);
  const currentRev = Number((data as { revision?: number } | null)?.revision ?? 0);
  writeHomeMeta(projectId, { ...readHomeMeta(projectId), baseRevision: currentRev, conflict: false, updateAvailable: false, dirty: true });
  await saveHomeProjectDirect(projectId);
}

const activeRegistrations = new Map<string, () => void>();

/** Stellt sicher, dass die Startseiten-Speicherquelle für dieses Projekt registriert ist. */
export function ensureHomeProjectSyncSource(projectId: string): () => void {
  const existing = activeRegistrations.get(projectId);
  if (existing) {
    publishState(projectId);
    return existing;
  }
  lastFingerprintByProject.set(metaIdentity(projectId), payloadFingerprint(projectId));
  const unregister = registerProjectSyncSource(projectId, "home", {
    save: () => saveHomeProjectDirect(projectId),
    refresh: () => refreshHomeProjectFromCloud(projectId),
    loadCloud: () => loadCloudHomeProject(projectId),
    keepDevice: () => keepDeviceHomeProject(projectId),
  });
  const unsubAccess = projectAccessStore.subscribe(() => publishState(projectId));
  publishState(projectId);
  const cleanup = () => {
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
    let active = true, requestedAccess = false;
    const check = () => {
      const cloud = projectAccessStore.accessFor(projectId).cloud;
      if (!cloud) { requestedAccess = false; return; }
      if (!active || requestedAccess) return;
      requestedAccess = true;
      // Always check revisions when selecting, including previously loaded projects.
      void refreshHomeProjectFromCloud(projectId).catch(err => {
        if (active) publishState(projectId, { error: err instanceof Error ? err.message : "Cloudstand konnte nicht geladen werden." });
      });
    };
    const unsub = projectAccessStore.subscribe(check);
    check();
    return () => { active = false; unsub(); cleanup(); };
  }, [projectId]);
}

registerLocalFlusher(async () => {
  const prefix = `${currentAccount()}:`;
  for (const [key, meta] of metaMemory) if (key.startsWith(prefix) && meta.localWriteError) {
    const id = key.slice(prefix.length);
    writeHomeMeta(id, { ...meta, localWriteError: null });
    if (readHomeMeta(id).localWriteError) throw new Error("Speicherstatus konnte nicht auf dem Gerät gesichert werden.");
    publishState(id);
  }
});
