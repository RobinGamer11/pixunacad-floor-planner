/**
 * Lokales Speichern/Laden des CAD-Stands.
 * - IndexedDB = maßgeblicher lokaler Stand (Format 2, Pixel als Blob-Manifest).
 * - localStorage-Schlüssel bleibt als lesbarer Vektorstand für ältere Clients,
 *   aber OHNE Pixeldaten (`rasterLayersByKey` leer, Hinweis `rasterFormat`).
 * - Versionsschutz: Ein Stand mit höherem Format wird weder geladen noch überschrieben.
 * - Warteschlange, legacyKey, Manifest und Status je Projekt: ein Wechsel A → B
 *   verdrängt nie den noch nicht gespeicherten Stand von A.
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
export function isLocalSaveBlocked(projectId: string) { return blocked.has(projectId); }
/** Zuletzt gespeichertes/geladenes Manifest je Projekt (Basis für Teil-Checkpoints). */
const lastManifest = new Map<string, any>();

export interface LoadResult { snapshot: string; missing: string[] }

/**
 * Lädt den IndexedDB-Stand. Ohne lokalen Datensatz wird trotzdem der
 * berechtigte Cloud-Pixelstand geholt (frisches Gerät): dann liefert die
 * Funktion nur `cloudRaster`, der Vektorstand kommt weiter über `decideOpen`.
 * Höheres Format → blockiert (nie leer gemeldet, nie überschrieben).
 */
export async function loadLocalScene(projectId: string): Promise<(LoadResult & { cloudOnly?: boolean }) | null> {
  if (!localStoreAvailable()) return null;
  const rec = await loadProjectLocal(projectId);
  if (rec && rec.format > RASTER_FORMAT) {
    blocked.add(projectId);
    setStatus("blocked", "Dieser Stand stammt aus einer neueren Programmversion und wird nicht überschrieben.");
    throw new Error("PIXUNA_FORMAT_NEWER");
  }
  const data = rec ? JSON.parse(rec.sceneJson) : {};
  const missing: string[] = [];
  // Cloud ergänzt nur Blätter ohne lokalen Pixelstand – keine Vermischung je Blatt.
  let cloudAdded = false;
  try {
    const cloud = await pullRasterManifest(projectId);
    if (cloud) {
      data.rasterManifest ||= {};
      for (const k of Object.keys(cloud)) if (!data.rasterManifest[k]?.length) { data.rasterManifest[k] = cloud[k]; cloudAdded = true; }
    }
  } catch (e) { console.warn("Pixel aus der Cloud nicht geladen:", e); }
  if (!rec && !cloudAdded) return null;
  lastManifest.set(projectId, data.rasterManifest);
  data.rasterLayersByKey = await fromManifest(data.rasterManifest, missing);
  delete data.rasterManifest;
  return { snapshot: JSON.stringify(data), missing, cloudOnly: !rec };
}

interface Job { snap: string; revision: number; legacyKey: string; waiters: Array<(ok: boolean) => void> }
const pendingByProject = new Map<string, Job>();
const chainByProject = new Map<string, Promise<void>>();

/**
 * Gebündelt je Projekt: nur der neueste Stand wird geschrieben. Das Promise
 * meldet den tatsächlichen Abschluss (true = in IndexedDB bestätigt). Bei
 * false darf dieselbe Revision erneut gesichert werden.
 */
export function saveLocalScene(projectId: string, snap: string, revision: number, legacyKey: string): Promise<boolean> {
  if (blocked.has(projectId)) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const prev = pendingByProject.get(projectId);
    if (prev) { prev.snap = snap; prev.revision = revision; prev.legacyKey = legacyKey; prev.waiters.push(resolve); return; }
    pendingByProject.set(projectId, { snap, revision, legacyKey, waiters: [resolve] });
    const chain = (chainByProject.get(projectId) ?? Promise.resolve()).then(async () => {
      const job = pendingByProject.get(projectId); pendingByProject.delete(projectId);
      if (!job) return;
      const ok = await writeJob(projectId, job);
      for (const w of job.waiters) w(ok);
    });
    chainByProject.set(projectId, chain);
  });
}

async function writeJob(projectId: string, job: Job): Promise<boolean> {
  setStatus("saving");
  try {
    const data = JSON.parse(job.snap);
    const raster = data.rasterLayersByKey;
    delete data.rasterLayersByKey;
    const hasPixels = !!raster && Object.values(raster).some((l: any) => Array.isArray(l) && l.length);
    if (!localStoreAvailable()) {
      // Kein IndexedDB: Pixel nie als Text in localStorage. Ein vorhandener
      // Altstand mit Pixeln wird dann gar nicht angefasst (kein Ersetzen durch
      // ein leeres Rasterfeld); nur reine Vektorstände werden geschrieben.
      let prev: any = null;
      try { prev = JSON.parse(localStorage.getItem(job.legacyKey) || "null"); } catch {}
      const prevHasPixels = !!prev?.rasterLayersByKey && Object.values(prev.rasterLayersByKey).some((l: any) => Array.isArray(l) && l.length);
      if (prevHasPixels || hasPixels) {
        setStatus("error", "Pixel können in diesem Browser nicht dauerhaft gespeichert werden (kein Gerätespeicher verfügbar). Vorhandener Stand bleibt unverändert.");
        return false;
      }
      try { localStorage.setItem(job.legacyKey, JSON.stringify({ ...data, rasterLayersByKey: {} })); }
      catch (e) { setStatus(isQuotaError(e) ? "quota" : "error", "Gerätespeicher voll."); return false; }
      setStatus("saved");
      return true;
    }
    const blobs = new Map<string, Blob>();
    data.rasterManifest = await toManifest(raster, job.revision, blobs, lastManifest.get(projectId));
    const manifest = data.rasterManifest;
    await saveProjectLocal({ projectId, format: RASTER_FORMAT, revision: job.revision, savedAt: Date.now(), sceneJson: JSON.stringify(data) }, blobs);
    lastManifest.set(projectId, manifest);
    pushRasterManifestSoon(projectId, manifest, job.revision);
    // Erst nach erfolgreichem IndexedDB-Commit: lesbarer Vektorstand ohne Pixel.
    delete data.rasterManifest;
    try { localStorage.setItem(job.legacyKey, JSON.stringify({ ...data, rasterLayersByKey: {}, rasterFormat: RASTER_FORMAT })); }
    catch { /* Vektor-Fallback optional */ }
    setStatus("saved");
    return true;
  } catch (e) {
    console.error("Lokales Speichern fehlgeschlagen:", e);
    setStatus(isQuotaError(e) ? "quota" : "error", isQuotaError(e) ? "Gerätespeicher voll – Pixelstand nicht gespeichert." : "Lokales Speichern fehlgeschlagen.");
    return false;
  }
}
