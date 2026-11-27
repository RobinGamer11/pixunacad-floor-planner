import { getNetworkClient, withAuthRetry } from "./networkClient";
import { ATTACHMENT_BUCKET } from "./opsStore";
import { quotaMessage, uploadWithQuota } from "./storageQuota";
import { projectStore, type FileNode } from "./projectStore";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const objectUrlCache = new Map<string, string>();
const BLOB_DB_NAME = "pixuna_document_blobs";
const BLOB_STORE_NAME = "blobs";
const PENDING_DELETE_KEY = (projectId: string) => `pixuna.pendingDocDeletes.${projectId}`;

export interface PendingStorageDeletion {
  storageBucket: string;
  storagePath: string;
  storageAssetId?: string;
}

function openBlobDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(BLOB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
          db.createObjectStore(BLOB_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function blobKey(projectId: string, fileId: string): string {
  return `${projectId}:${fileId}`;
}

/** Speichert einen Dokumentinhalt dauerhaft als Blob in IndexedDB für Offline-Zugriff. */
export async function saveLocalDocumentBlob(projectId: string, fileId: string, blob: Blob): Promise<boolean> {
  const db = await openBlobDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BLOB_STORE_NAME, "readwrite");
      tx.objectStore(BLOB_STORE_NAME).put(blob, blobKey(projectId, fileId));
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); resolve(false); };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

/** Liest einen lokal in IndexedDB gespeicherten Dokument-Blob. */
export async function loadLocalDocumentBlob(projectId: string, fileId: string): Promise<Blob | null> {
  const db = await openBlobDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(BLOB_STORE_NAME, "readonly");
      const req = tx.objectStore(BLOB_STORE_NAME).get(blobKey(projectId, fileId));
      req.onsuccess = () => { db.close(); resolve(req.result instanceof Blob ? req.result : null); };
      req.onerror = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** Entfernt einen lokal gecachten Dokument-Blob aus IndexedDB. */
export async function deleteLocalDocumentBlob(projectId: string, fileId: string): Promise<void> {
  const key = blobKey(projectId, fileId);
  const cachedUrl = objectUrlCache.get(key);
  if (cachedUrl) {
    try { URL.revokeObjectURL(cachedUrl); } catch {}
    objectUrlCache.delete(key);
  }
  const db = await openBlobDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(BLOB_STORE_NAME, "readwrite");
      tx.objectStore(BLOB_STORE_NAME).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch {
      db.close();
      resolve();
    }
  });
}

export function readPendingStorageDeletions(projectId: string): PendingStorageDeletion[] {
  try {
    const raw = localStorage.getItem(PENDING_DELETE_KEY(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingStorageDeletions(projectId: string, items: PendingStorageDeletion[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(PENDING_DELETE_KEY(projectId));
    else localStorage.setItem(PENDING_DELETE_KEY(projectId), JSON.stringify(items));
  } catch {}
}

/**
 * Merkt eine gelöschte Cloud-Datei zur späteren Storage-Bereinigung vor.
 * Die physische Löschung erfolgt erst nach bestätigter Cloud-Sicherung des Projekts.
 */
export function queuePendingStorageDeletion(projectId: string, node: FileNode): void {
  if (!node.storagePath) return;
  const bucket = node.storageBucket || ATTACHMENT_BUCKET;
  const current = readPendingStorageDeletions(projectId);
  if (current.some((item) => item.storageBucket === bucket && item.storagePath === node.storagePath)) return;
  writePendingStorageDeletions(projectId, [
    ...current,
    { storageBucket: bucket, storagePath: node.storagePath, storageAssetId: node.storageAssetId },
  ]);
}

/**
 * Führt vorgemerkte Storage-Löschungen erst nach bestätigter Cloud-Sicherung aus,
 * sofern keine verbleibende Projektdatei den Pfad noch referenziert.
 */
export async function flushPendingStorageDeletions(projectId: string): Promise<{ deleted: number; failed: string[] }> {
  const pending = readPendingStorageDeletions(projectId);
  if (pending.length === 0) return { deleted: 0, failed: [] };
  const project = projectStore.getState().projects.find((p) => p.id === projectId);
  const activePaths = new Set((project?.files ?? []).map((f) => f.storagePath).filter(Boolean));
  const remaining: PendingStorageDeletion[] = [];
  const failed: string[] = [];
  let deleted = 0;
  for (const item of pending) {
    if (activePaths.has(item.storagePath)) continue;
    try {
      await deleteProjectFileFromStorage({
        id: "",
        kind: "file",
        name: item.storagePath,
        parentId: null,
        createdAt: "",
        storageBucket: item.storageBucket,
        storagePath: item.storagePath,
        storageAssetId: item.storageAssetId,
      });
      deleted += 1;
    } catch (err) {
      remaining.push(item);
      failed.push(err instanceof Error ? err.message : `Storage-Bereinigung fehlgeschlagen (${item.storagePath}).`);
    }
  }
  writePendingStorageDeletions(projectId, remaining);
  return { deleted, failed };
}

function dataUrlToBlob(dataUrl: string, fallbackMime?: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mimeMatch = header.match(/data:([^;]+)/i);
  const mime = mimeMatch?.[1] || fallbackMime || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100) || "dokument";
}

/**
 * Lädt eine einzelne lokale Projektdatei über den quotengeprüften Storage-Weg hoch.
 * Gibt die aktualisierte Dateireferenz zurück (erst nach bestätigtem Upload).
 */
export async function uploadProjectFileNode(projectId: string, node: FileNode): Promise<FileNode> {
  if (node.kind !== "file") return node;
  if (node.storagePath && node.cloudSynced) return node;
  let blob: Blob | null = null;
  if (node.dataUrl) {
    blob = dataUrlToBlob(node.dataUrl, node.mimeType);
  } else {
    blob = await loadLocalDocumentBlob(projectId, node.id);
  }
  if (!blob) {
    if (node.storagePath) return { ...node, cloudSynced: true };
    throw new Error(`Datei „${node.name}“ hat keinen lokalen Inhalt zum Hochladen.`);
  }
  await saveLocalDocumentBlob(projectId, node.id, blob);
  const path = `${projectId}/docs/${node.id}-${sanitizeFileName(node.name)}`;
  try {
    const assetId = await uploadWithQuota(projectId, ATTACHMENT_BUCKET, path, blob, node.mimeType || blob.type || undefined);
    return {
      ...node,
      storageBucket: ATTACHMENT_BUCKET,
      storagePath: path,
      storageAssetId: assetId,
      cloudSynced: true,
      sizeBytes: node.sizeBytes ?? blob.size,
      mimeType: node.mimeType ?? (blob.type || undefined),
    };
  } catch (err) {
    const q = quotaMessage(err);
    throw new Error(q ? `${node.name}: ${q.text}` : `${node.name}: ${err instanceof Error ? err.message : "Upload fehlgeschlagen."}`);
  }
}

/**
 * Lädt alle ausstehenden lokalen Dateien eines Projekts vor der Cloud-Sicherung hoch.
 * Fehlgeschlagene Uploads behalten ihren lokalen Inhalt, damit sie wiederholt werden können.
 */
export async function syncPendingProjectFiles(projectId: string): Promise<{ uploaded: number; failed: string[] }> {
  const project = projectStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return { uploaded: 0, failed: [] };
  const pending = (project.files ?? []).filter((f) => f.kind === "file" && (!f.storagePath || !f.cloudSynced));
  if (!pending.length) return { uploaded: 0, failed: [] };

  let uploaded = 0;
  const failed: string[] = [];
  for (const node of pending) {
    try {
      const updated = await uploadProjectFileNode(projectId, node);
      const persisted = projectStore.updateFileNode(projectId, node.id, {
        storageBucket: updated.storageBucket,
        storagePath: updated.storagePath,
        storageAssetId: updated.storageAssetId,
        cloudSynced: true,
        sizeBytes: updated.sizeBytes,
        mimeType: updated.mimeType,
        // Große Base64-Inhalte nach bestätigtem Cloud-Upload & IndexedDB-Ablage aus localStorage entlasten.
        dataUrl: undefined,
      });
      if (!persisted) {
        throw new Error(`Datei „${node.name}“ konnte lokal nicht aktualisiert werden.`);
      }
      uploaded += 1;
    } catch (err) {
      failed.push(err instanceof Error ? err.message : `${node.name}: Upload fehlgeschlagen.`);
    }
  }
  return { uploaded, failed };
}

/** Lädt eine Dokument-URL erst bei Bedarf (Vorschau oder Download). */
export async function resolveProjectFileUrl(node: FileNode, projectId?: string): Promise<string | null> {
  if (node.dataUrl) return node.dataUrl;
  if (projectId) {
    const key = blobKey(projectId, node.id);
    const cachedObjUrl = objectUrlCache.get(key);
    if (cachedObjUrl) return cachedObjUrl;
    const localBlob = await loadLocalDocumentBlob(projectId, node.id);
    if (localBlob && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(localBlob);
      objectUrlCache.set(key, url);
      return url;
    }
  }
  if (!node.storagePath) return null;
  const bucket = node.storageBucket || ATTACHMENT_BUCKET;
  const cacheKey = `${bucket}:${node.storagePath}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 15_000) return cached.url;

  const client = getNetworkClient();
  if (!client) return null;
  const signedUrl = await withAuthRetry(async () => {
    const { data, error } = await client.storage.from(bucket).createSignedUrl(node.storagePath!, 300);
    if (error) throw error;
    return data?.signedUrl ?? null;
  });
  if (signedUrl) {
    signedUrlCache.set(cacheKey, { url: signedUrl, expiresAt: Date.now() + 280_000 });
  }
  return signedUrl;
}

/** Lädt den Inhalt einer Datei bei Bedarf als Base64-DataURL (z. B. für PDF-Vorschau). */
export async function resolveProjectFileDataUrl(node: FileNode, projectId?: string): Promise<string | null> {
  if (node.dataUrl) return node.dataUrl;
  let blob: Blob | null = projectId ? await loadLocalDocumentBlob(projectId, node.id) : null;
  if (!blob) {
    const url = await resolveProjectFileUrl(node, projectId);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (${res.status}).`);
    blob = await res.blob();
    if (projectId) {
      void saveLocalDocumentBlob(projectId, node.id, blob);
    }
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(blob!);
  });
}

/** Entfernt eine gespeicherte Projektdatei aus dem Cloud-Storage, wenn sie gelöscht wurde. */
export async function deleteProjectFileFromStorage(node: FileNode): Promise<void> {
  if (!node.storagePath) return;
  const client = getNetworkClient();
  if (!client) throw new Error("Cloud nicht erreichbar.");
  const bucket = node.storageBucket || ATTACHMENT_BUCKET;
  signedUrlCache.delete(`${bucket}:${node.storagePath}`);
  const { error } = await client.storage.from(bucket).remove([node.storagePath]);
  if (error) {
    throw new Error(error.message || `Datei „${node.name}“ konnte nicht aus dem Cloud-Storage entfernt werden.`);
  }
}