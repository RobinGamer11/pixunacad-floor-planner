/**
 * Lokales Speichern/Laden des CAD-Stands.
 * - IndexedDB = maßgeblicher lokaler Stand (Format 2, Pixel als Blob-Manifest).
 * - localStorage-Schlüssel bleibt als lesbarer Vektorstand für ältere Clients,
 *   aber OHNE Pixeldaten (`rasterLayersByKey` leer, Hinweis `rasterFormat`).
 * - Versionsschutz: Ein Stand mit höherem Format wird weder geladen noch überschrieben.
 */
import { RASTER_FORMAT, fromManifest, toManifest } from "./rasterManifest";
import { pullRasterManifest, pushRasterManifestSoon } from "./rasterCloud";
import { isQuotaError, loadProjectLocal, localStoreAvailable, saveProjectLocal } from "./LocalProjectStore";

export type LocalSaveStatus = "idle" | "saving" | "saved" | "quota" | "error" | "blocked";
type Listener = (s: LocalSaveStatus, detail?: string) => void;
const listeners = new Set<Listener>();
let status: LocalSaveStatus = "idle";
export function onLocalSaveStatus(l: Listener) { listeners.add(l); l(status); return () => { listeners.delete(l); }; }
function setStatus(s: LocalSaveStatus, detail?: string) { status = s; for (const l of listeners) l(s, detail); }
export function getLocalSaveStatus() { return status; }

const blocked = new Set<string>();
/** Zuletzt gespeichertes/geladenes Manifest je Projekt (Basis für Teil-Checkpoints). */
const lastManifest = new Map<string, any>();

export interface LoadResult { snapshot: string; missing: string[] }

/** Lädt den IndexedDB-Stand (oder null). Höheres Format → blockiert. */
export async function loadLocalScene(projectId: string): Promise<LoadResult | null> {
  if (!localStoreAvailable()) return null;
  const rec = await loadProjectLocal(projectId);
  if (!rec) return null;
  if (rec.format > RASTER_FORMAT) {
    blocked.add(projectId);
    setStatus("blocked", "Dieser Stand stammt aus einer neueren Programmversion und wird nicht überschrieben.");
    return null;
  }
  const data = JSON.parse(rec.sceneJson);
  const missing: string[] = [];
  // Cloud ergänzt nur Blätter ohne lokalen Pixelstand – keine Vermischung je Blatt.
  try {
    const cloud = await pullRasterManifest(projectId);
    if (cloud) {
      data.rasterManifest ||= {};
      for (const k of Object.keys(cloud)) if (!data.rasterManifest[k]?.length) data.rasterManifest[k] = cloud[k];
    }
  } catch (e) { console.warn("Pixel aus der Cloud nicht geladen:", e); }
  lastManifest.set(projectId, data.rasterManifest);
  data.rasterLayersByKey = await fromManifest(data.rasterManifest, missing);
  delete data.rasterManifest;
  return { snapshot: JSON.stringify(data), missing };
}

let chain: Promise<void> = Promise.resolve();
let pending: { projectId: string; snap: string; revision: number } | null = null;

/** Gebündelt: nur der jeweils neueste Stand wird geschrieben. */
export function saveLocalScene(projectId: string, snap: string, revision: number, legacyKey: string) {
  if (blocked.has(projectId)) return;
  const first = !pending;
  pending = { projectId, snap, revision };
  if (!first) return;
  chain = chain.then(async () => {
    const job = pending; pending = null;
    if (!job) return;
    setStatus("saving");
    try {
      const data = JSON.parse(job.snap);
      const raster = data.rasterLayersByKey;
      delete data.rasterLayersByKey;
      if (!localStoreAvailable()) {
        // Kein IndexedDB: bisheriger Weg (vollständiger Stand in localStorage).
        try { localStorage.setItem(legacyKey, job.snap); setStatus("saved"); }
        catch (e) { setStatus(isQuotaError(e) ? "quota" : "error", "Gerätespeicher voll."); }
        return;
      }
      const blobs = new Map<string, Blob>();
      data.rasterManifest = await toManifest(raster, job.revision, blobs, lastManifest.get(job.projectId));
      const manifest = data.rasterManifest;
      await saveProjectLocal({ projectId: job.projectId, format: RASTER_FORMAT, revision: job.revision, savedAt: Date.now(), sceneJson: JSON.stringify(data) }, blobs);
      lastManifest.set(job.projectId, manifest);
      pushRasterManifestSoon(job.projectId, manifest, job.revision);
      // Erst nach erfolgreichem IndexedDB-Commit: lesbarer Vektorstand ohne Pixel.
      delete data.rasterManifest;
      try { localStorage.setItem(legacyKey, JSON.stringify({ ...data, rasterLayersByKey: {}, rasterFormat: RASTER_FORMAT })); }
      catch { /* Vektor-Fallback optional */ }
      setStatus("saved");
    } catch (e) {
      console.error("Lokales Speichern fehlgeschlagen:", e);
      setStatus(isQuotaError(e) ? "quota" : "error", isQuotaError(e) ? "Gerätespeicher voll – Pixelstand nicht gespeichert." : "Lokales Speichern fehlgeschlagen.");
    }
  });
}
