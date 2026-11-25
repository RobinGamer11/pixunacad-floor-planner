import { getNetworkClient, withAuthRetry } from "./networkClient";
import { ATTACHMENT_BUCKET } from "./opsStore";
import { quotaMessage, uploadWithQuota } from "./storageQuota";
import { projectStore, type FileNode } from "./projectStore";

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

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
  if (!node.dataUrl) {
    if (node.storagePath) return { ...node, cloudSynced: true };
    throw new Error(`Datei „${node.name}“ hat keinen lokalen Inhalt zum Hochladen.`);
  }
  const blob = dataUrlToBlob(node.dataUrl, node.mimeType);
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
  const pending = (project.files ?? []).filter((f) => f.kind === "file" && (!f.storagePath || !f.cloudSynced) && Boolean(f.dataUrl));
  if (!pending.length) return { uploaded: 0, failed: [] };

  let uploaded = 0;
  const failed: string[] = [];
  for (const node of pending) {
    try {
      const updated = await uploadProjectFileNode(projectId, node);
      projectStore.updateFileNode(projectId, node.id, {
        storageBucket: updated.storageBucket,
        storagePath: updated.storagePath,
        storageAssetId: updated.storageAssetId,
        cloudSynced: true,
        sizeBytes: updated.sizeBytes,
        mimeType: updated.mimeType,
        // Große Base64-Inhalte nach bestätigtem Cloud-Upload aus localStorage entlasten.
        dataUrl: undefined,
      });
      uploaded += 1;
    } catch (err) {
      failed.push(err instanceof Error ? err.message : `${node.name}: Upload fehlgeschlagen.`);
    }
  }
  return { uploaded, failed };
}

/** Lädt eine Dokument-URL erst bei Bedarf (Vorschau oder Download). */
export async function resolveProjectFileUrl(node: FileNode): Promise<string | null> {
  if (node.dataUrl) return node.dataUrl;
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
export async function resolveProjectFileDataUrl(node: FileNode): Promise<string | null> {
  if (node.dataUrl) return node.dataUrl;
  const url = await resolveProjectFileUrl(node);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (${res.status}).`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(blob);
  });
}

/** Entfernt eine gespeicherte Projektdatei aus dem Cloud-Storage, wenn sie gelöscht wurde. */
export async function deleteProjectFileFromStorage(node: FileNode): Promise<void> {
  if (!node.storagePath) return;
  const client = getNetworkClient();
  if (!client) return;
  const bucket = node.storageBucket || ATTACHMENT_BUCKET;
  signedUrlCache.delete(`${bucket}:${node.storagePath}`);
  try {
    await client.storage.from(bucket).remove([node.storagePath]);
  } catch {
    // Storage-Bereinigung darf das lokale Löschen nicht blockieren.
  }
}