import { getNetworkClient, withAuthRetry } from "./networkClient";
import { ATTACHMENT_BUCKET } from "./opsStore";
import { quotaMessage, uploadWithQuota } from "./storageQuota";
import { projectStore, type FileNode } from "./projectStore";
import { accountGeneration, currentAccount, sessionIsCurrent } from "./accountStorage";

const objectUrlCache = new Map<string, string>();
const pendingMemory = new Map<string, PendingStorageDeletion[]>();
const BLOB_DB_NAME = "pixuna_document_blobs";
const BLOB_STORE_NAME = "blobs";
const PENDING_DELETE_KEY = (id: string) => `pixuna.pendingDocDeletes.${id}`;
export interface PendingStorageDeletion { storageBucket: string; storagePath: string; storageAssetId?: string }
function identity() {
  const owner = currentAccount(), epoch = accountGeneration();
  if (!owner) throw new Error("Keine aktive Anmeldung für die Dokumentablage.");
  return { owner, epoch, check: () => { if (!sessionIsCurrent(owner, epoch)) throw new Error("Kontositzung wurde gewechselt."); } };
}
function blobKey(projectId: string, fileId: string, owner = currentAccount()): string {
  if (!owner) throw new Error("Keine aktive Anmeldung für die Dokumentablage.");
  return `${owner}:${projectId}:${fileId}`;
}
function openBlobDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(BLOB_DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(BLOB_STORE_NAME)) req.result.createObjectStore(BLOB_STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
export async function saveLocalDocumentBlob(projectId: string, fileId: string, blob: Blob): Promise<boolean> {
  const session = identity(), key = blobKey(projectId, fileId, session.owner);
  const db = await openBlobDb();
  session.check();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(BLOB_STORE_NAME, "readwrite");
      tx.objectStore(BLOB_STORE_NAME).put(blob, key);
      tx.oncomplete = () => { db.close(); resolve(sessionIsCurrent(session.owner, session.epoch)); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(false); };
    } catch { db.close(); resolve(false); }
  });
}
export async function loadLocalDocumentBlob(projectId: string, fileId: string): Promise<Blob | null> {
  const session = identity(), key = blobKey(projectId, fileId, session.owner);
  const db = await openBlobDb();
  session.check();
  if (!db) return null;
  const blob = await new Promise<Blob | null>(resolve => {
    try {
      const tx = db.transaction(BLOB_STORE_NAME, "readonly");
      const req = tx.objectStore(BLOB_STORE_NAME).get(key);
      let result: Blob | null = null;
      req.onsuccess = () => { result = req.result instanceof Blob ? req.result : null; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
    } catch { db.close(); resolve(null); }
  });
  session.check();
  return blob;
}
export async function deleteLocalDocumentBlob(projectId: string, fileId: string): Promise<void> {
  // Undo and other references may still need this blob. Keep it if it is referenced.
  if (projectStore.hasDocumentReference(projectId, fileId)) return;
  const session = identity(), key = blobKey(projectId, fileId, session.owner);
  const url = objectUrlCache.get(key);
  if (url) { URL.revokeObjectURL(url); objectUrlCache.delete(key); }
  const db = await openBlobDb();
  session.check();
  if (!db) throw new Error("Lokale Dokumentbereinigung konnte nicht gestartet werden.");
  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(BLOB_STORE_NAME, "readwrite");
      tx.objectStore(BLOB_STORE_NAME).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error("Lokale Dokumentbereinigung fehlgeschlagen.")); };
    } catch (err) { db.close(); reject(err); }
  });
  session.check();
}
export function readPendingStorageDeletions(projectId: string): PendingStorageDeletion[] {
  const key = `${currentAccount()}:${projectId}`;
  if (pendingMemory.has(key)) return [...(pendingMemory.get(key) ?? [])];
  const raw = localStorage.getItem(PENDING_DELETE_KEY(projectId));
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Dateibereinigung konnte nicht gelesen werden.");
  return parsed;
}
function writePendingStorageDeletions(projectId: string, items: PendingStorageDeletion[]): void {
  pendingMemory.set(`${currentAccount()}:${projectId}`, items);
  if (!items.length) localStorage.removeItem(PENDING_DELETE_KEY(projectId));
  else localStorage.setItem(PENDING_DELETE_KEY(projectId), JSON.stringify(items));
}
export function queuePendingStorageDeletion(projectId: string, node: FileNode): void {
  if (!node.storagePath) return;
  const current = readPendingStorageDeletions(projectId), bucket = node.storageBucket || ATTACHMENT_BUCKET;
  if (current.some(i => i.storageBucket === bucket && i.storagePath === node.storagePath)) return;
  writePendingStorageDeletions(projectId, [...current, { storageBucket: bucket, storagePath: node.storagePath, storageAssetId: node.storageAssetId }]);
}
export function deleteProjectDocumentNode(projectId: string, nodeId: string): boolean {
  const before = projectStore.getState().projects.find(p => p.id === projectId)?.files ?? [];
  if (!projectStore.deleteNode(projectId, "files", nodeId)) return false;
  const after = new Set(projectStore.getState().projects.find(p => p.id === projectId)?.files?.map(f => f.id));
  // Keep local blobs for Undo; queue every removed descendant, not just its folder.
  for (const node of before) if (!after.has(node.id)) queuePendingStorageDeletion(projectId, node);
  return true;
}
export async function flushPendingStorageDeletions(projectId: string, confirmed?: { revision: number; files: readonly Omit<FileNode, "dataUrl">[]; pending: PendingStorageDeletion[] }): Promise<{ deleted: number; failed: string[] }> {
  // No acknowledgement means no deletion authorization.
  if (!confirmed) return { deleted: 0, failed: [] };
  const session = identity(), client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const done = new Set<string>(), failed: string[] = [];
  let deleted = 0;
  const keyOf = (i: PendingStorageDeletion) => `${i.storageBucket}:${i.storagePath}`;
  for (const item of confirmed.pending) {
    session.check();
    if (confirmed.files.some(f => (f.storageBucket || ATTACHMENT_BUCKET) === item.storageBucket && f.storagePath === item.storagePath)) { done.add(keyOf(item)); continue; }
    try {
      const prepared = await client.rpc("storage_prepare_document_cleanup", { _project_id: projectId, _revision: confirmed.revision, _bucket: item.storageBucket, _path: item.storagePath });
      session.check();
      if (prepared.error) throw prepared.error;
      if (!prepared.data) throw new Error("Datei wird noch durch einen bestätigten Cloudstand benötigt.");
      const claim = await client.rpc("storage_claim_cleanup", { _project_id: projectId, _limit: 200 });
      session.check();
      if (claim.error) throw claim.error;
      const row = (claim.data as { asset_id: string; bucket: string; path: string }[] | null)?.find(r => r.bucket === item.storageBucket && r.path === item.storagePath);
      if (!row) {
        const finished = await withAuthRetry(async () => {
          const res = await client.from("storage_assets").select("status").eq("project_id", projectId)
            .eq("bucket", item.storageBucket).eq("path", item.storagePath).maybeSingle();
          if (res.error) throw res.error;
          return res.data;
        });
        session.check();
        if (finished?.status === "deleted") { done.add(keyOf(item)); continue; }
        throw new Error("Dateibereinigung wurde nicht freigegeben.");
      }
      const removal = await client.storage.from(row.bucket).remove([row.path]);
      session.check();
      if (removal.error) throw removal.error;
      const finalized = await client.rpc("storage_finalize_delete", { _asset_ids: [row.asset_id] });
      session.check();
      if (finalized.error) throw finalized.error;
      if (Number(finalized.data) !== 1) throw new Error("Dateibereinigung noch nicht bestätigt.");
      done.add(keyOf(item)); deleted++;
    } catch (err) { session.check(); failed.push(err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "Dateibereinigung fehlgeschlagen.")); }
  }
  session.check();
  writePendingStorageDeletions(projectId, readPendingStorageDeletions(projectId).filter(i => !done.has(keyOf(i))));
  return { deleted, failed };
}
function dataUrlToBlob(dataUrl: string, fallbackMime?: string): Blob {
  const comma = dataUrl.indexOf(","), header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const binary = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
  return new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: header.match(/data:([^;]+)/i)?.[1] || fallbackMime || "application/octet-stream" });
}
export async function importProjectDocument(projectId: string, parentId: string | null, file: Blob & { name: string }, mimeType = file.type): Promise<string> {
  const session = identity(), id = `n-${crypto.randomUUID()}`;
  if (!await saveLocalDocumentBlob(projectId, id, file)) throw new Error(`„${file.name}“ konnte nicht auf dem Gerät gespeichert werden. Bitte Gerätespeicher prüfen.`);
  session.check();
  const nodeId = projectStore.addFile(projectId, "files", parentId, { id, name: file.name, mimeType, sizeBytes: file.size, localBlob: true });
  if (!nodeId) throw new Error(`„${file.name}“: Dateiangaben konnten nicht gespeichert werden; die lokale Dateikopie bleibt erhalten.`);
  return nodeId;
}
export async function uploadProjectFileNode(projectId: string, node: FileNode): Promise<FileNode> {
  const session = identity();
  if (node.kind !== "file" || (node.storagePath && node.cloudSynced)) return node;
  const blob = node.dataUrl ? dataUrlToBlob(node.dataUrl, node.mimeType) : await loadLocalDocumentBlob(projectId, node.id);
  session.check();
  if (!blob) { if (node.storagePath) return { ...node, cloudSynced: true }; throw new Error(`Datei „${node.name}“ hat keinen lokalen Inhalt zum Hochladen.`); }
  if (!await saveLocalDocumentBlob(projectId, node.id, blob)) throw new Error(`„${node.name}“ konnte nicht auf dem Gerät gespeichert werden; bestehender Inhalt bleibt erhalten.`);
  session.check();
  const path = `${projectId}/docs/${node.id}-${node.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100) || "dokument"}`;
  try {
    const assetId = await uploadWithQuota(projectId, ATTACHMENT_BUCKET, path, blob, node.mimeType || blob.type || undefined);
    session.check();
    return { ...node, storageBucket: ATTACHMENT_BUCKET, storagePath: path, storageAssetId: assetId, cloudSynced: true, localBlob: true, sizeBytes: node.sizeBytes ?? blob.size, mimeType: node.mimeType ?? blob.type };
  } catch (err) { const q = quotaMessage(err); throw new Error(q ? `${node.name}: ${q.text}` : `${node.name}: ${err instanceof Error ? err.message : "Upload fehlgeschlagen."}`); }
}
export async function syncPendingProjectFiles(projectId: string): Promise<{ uploaded: number; failed: string[] }> {
  const session = identity();
  const pending = projectStore.getState().projects.find(p => p.id === projectId)?.files?.filter(f => f.kind === "file" && (!f.storagePath || !f.cloudSynced)) ?? [];
  let uploaded = 0;
  const failed: string[] = [];
  for (const node of pending) {
    try {
      const updated = await uploadProjectFileNode(projectId, node);
      session.check();
      const current = projectStore.getState().projects.find(p => p.id === projectId)?.files?.find(f => f.id === node.id);
      if (!current) { queuePendingStorageDeletion(projectId, updated); continue; }
      if (current.dataUrl !== node.dataUrl || current.storagePath !== node.storagePath) throw new Error(`„${node.name}“ wurde während des Uploads geändert.`);
      if (!projectStore.updateFileNode(projectId, node.id, { storageBucket: updated.storageBucket, storagePath: updated.storagePath, storageAssetId: updated.storageAssetId, cloudSynced: true, localBlob: updated.localBlob, sizeBytes: updated.sizeBytes, mimeType: updated.mimeType, dataUrl: updated.localBlob ? undefined : current.dataUrl })) throw new Error(`„${node.name}“ konnte lokal nicht aktualisiert werden.`);
      uploaded++;
    } catch (err) { session.check(); failed.push(err instanceof Error ? err.message : `${node.name}: Upload fehlgeschlagen.`); }
  }
  return { uploaded, failed };
}
async function resolveBlob(node: FileNode, projectId: string): Promise<Blob | null> {
  const session = identity();
  const local = await loadLocalDocumentBlob(projectId, node.id);
  if (local) return local;
  if (!node.storagePath) return null;
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const path = node.storagePath;
  const result = await withAuthRetry(async () => {
    const res = await client.storage.from(node.storageBucket || ATTACHMENT_BUCKET).download(path);
    if (res.error) throw res.error;
    return res.data;
  });
  session.check();
  if (!result) return null;
  if (!await saveLocalDocumentBlob(projectId, node.id, result)) throw new Error(`„${node.name}“ wurde geladen, konnte aber nicht offline gespeichert werden.`);
  session.check();
  return result;
}
export async function resolveProjectFileUrl(node: FileNode, projectId?: string): Promise<string | null> {
  const session = identity();
  if (node.dataUrl) return node.dataUrl;
  if (!projectId) throw new Error("Projektzuordnung für Dokument fehlt.");
  const key = `${blobKey(projectId, node.id, session.owner)}:${session.epoch}:${node.storagePath ?? "local"}`;
  const cached = objectUrlCache.get(key);
  if (cached) return cached;
  const blob = await resolveBlob(node, projectId);
  session.check();
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrlCache.set(key, url);
  return url;
}
export async function resolveProjectFileDataUrl(node: FileNode, projectId?: string): Promise<string | null> {
  const session = identity();
  if (node.dataUrl) return node.dataUrl;
  if (!projectId) throw new Error("Projektzuordnung für Dokument fehlt.");
  const blob = await resolveBlob(node, projectId);
  if (!blob) return null;
  const result = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(blob);
  });
  session.check();
  return result;
}
export function releaseProjectFileUrl(projectId: string, fileId: string, resolvedUrl?: string): void {
  const prefix = currentAccount() ? `${blobKey(projectId, fileId)}:` : "";
  for (const [key, url] of objectUrlCache) if (resolvedUrl ? url === resolvedUrl : prefix && key.startsWith(prefix)) {
    URL.revokeObjectURL(url); objectUrlCache.delete(key);
  }
}
/** Never authorizes deletion without a confirmed project revision. */
export async function deleteProjectFileFromStorage(_node: FileNode): Promise<void> {
  throw new Error("Dateibereinigung erfordert einen bestätigten Cloudstand.");
}
