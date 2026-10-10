/**
 * Lokales Speichern/Laden des CAD-Stands.
 * - IndexedDB = maßgeblicher lokaler Stand (Format 2, Pixel als Blob-Manifest).
 * - localStorage-Schlüssel bleibt als lesbarer Vektorstand für ältere Clients,
 *   aber OHNE Pixeldaten (`rasterLayersByKey` leer, Hinweis `rasterFormat`).
 * - Versionsschutz: Ein Stand mit höherem Format wird weder geladen noch überschrieben.
 * - Warteschlange, legacyKey, Manifest und Status je Projekt: ein Wechsel A → B
 *   verdrängt nie den noch nicht gespeicherten Stand von A.
 */
import { RASTER_FORMAT, fromManifest, manifestHashes, pinHashes, sessionHashes, toManifest, unpinHashes, type RasterManifest } from "./rasterManifest";
import { downloadMissingTiles, pullRasterManifest, pushRasterSoon } from "./rasterCloud";
import { gcBlobs, isQuotaError, loadProjectLocal, localStoreAvailable, patchProjectLocal, saveProjectLocal, saveProjectLocalMerge, type LocalProjectRecord } from "./LocalProjectStore";

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

export interface LoadResult { snapshot: string; missing: string[]; conflicts: string[] }

/** Entscheidung je Blatt-Key zwischen lokalem und Cloud-Pixelstand. */
export type RasterKeyDecision = "local" | "cloud" | "delete" | "conflict";
/**
 * - keine Cloudänderung seit bestätigter Basis → lokal
 * - Cloud neuer, lokal ohne ungesendete Änderung → Cloud übernehmen (bzw. löschen)
 * - Cloud neuer UND lokal ungesendet geändert → Konflikt: beide erhalten, lokal bleibt
 */
export function decideRasterKey(o: { hasLocal: boolean; localDirty: boolean; base: number; cloudRev: number | undefined; cloudDeleted: boolean }): RasterKeyDecision {
  if (o.cloudRev == null || o.cloudRev <= o.base) return "local";
  if (o.localDirty && o.hasLocal) return "conflict";
  if (o.localDirty && !o.hasLocal && o.cloudDeleted) return "local";
  if (o.localDirty) return "conflict";
  return o.cloudDeleted ? "delete" : "cloud";
}

/**
 * Lädt den IndexedDB-Stand und gleicht ihn mit dem Cloud-Pixelstand ab
 * (Revisionen + lokale Outbox, siehe `decideRasterKey`). Ohne lokalen
 * Datensatz liefert die Funktion nur den Cloudstand (`cloudOnly`).
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
  const local: RasterManifest = data.rasterManifest ?? {};
  const missing: string[] = [];
  const conflicts: string[] = Object.keys(rec?.conflicts ?? {});
  let changed = false;
  let cloud: Awaited<ReturnType<typeof pullRasterManifest>> = null;
  try { cloud = await pullRasterManifest(projectId); } catch (e) { console.warn("Pixel aus der Cloud nicht geladen:", e); }
  const base = { ...(rec?.cloudBase ?? {}) };
  const dirty = new Set(rec?.dirtyKeys ?? []);
  const newConflicts: Record<string, { revision: number; layers: unknown }> = { ...(rec?.conflicts ?? {}) };
  if (cloud) {
    const take: RasterManifest = {};
    for (const key of new Set([...Object.keys(cloud.revisions), ...Object.keys(local)])) {
      const d = decideRasterKey({ hasLocal: !!local[key]?.length, localDirty: dirty.has(key), base: base[key] ?? 0, cloudRev: cloud.revisions[key], cloudDeleted: cloud.deleted.has(key) });
      if (d === "cloud") { take[key] = cloud.layers[key]; local[key] = cloud.layers[key]; base[key] = cloud.revisions[key]; changed = true; }
      else if (d === "delete") { delete local[key]; base[key] = cloud.revisions[key]; changed = true; }
      else if (d === "conflict" && !newConflicts[key]) { newConflicts[key] = { revision: cloud.revisions[key], layers: cloud.layers[key] ?? null }; conflicts.push(key); changed = true; }
    }
    try { await downloadMissingTiles(projectId, take); } catch (e) { console.warn("Cloudkacheln nicht geladen:", e); }
  }
  if (!rec && !changed) return null;
  data.rasterManifest = local;
  // Übernahme sofort lokal festhalten (gleiche Entscheidung beim nächsten Öffnen).
  if (rec && changed) {
    await patchProjectLocal(projectId, (cur) => cur && cur.format <= RASTER_FORMAT ? { ...cur, sceneJson: JSON.stringify(data), cloudBase: base, conflicts: newConflicts } : null);
  } else if (!rec && changed) {
    await saveProjectLocal({ projectId, format: RASTER_FORMAT, revision: 0, savedAt: Date.now(), sceneJson: JSON.stringify({ rasterManifest: local }), cloudBase: base, dirtyKeys: [], conflicts: newConflicts }, new Map());
  }
  lastManifest.set(projectId, local);
  data.rasterLayersByKey = await fromManifest(local, missing);
  delete data.rasterManifest;
  // Persistente Outbox aus früheren Sitzungen fortsetzen.
  if (dirty.size) pushRasterSoon(projectId);
  scheduleGc();
  return { snapshot: JSON.stringify(data), missing, conflicts, cloudOnly: !rec };
}

/** Pixel-Hashes, auf die ein gespeicherter Datensatz verweist (aktuell + Konfliktstände). */
export function recordHashes(rec: LocalProjectRecord): Set<string> {
  const out = manifestHashes(JSON.parse(rec.sceneJson).rasterManifest);
  for (const c of Object.values(rec.conflicts ?? {})) manifestHashes({ c: (c.layers ?? []) as any }, out);
  return out;
}

let gcTimer: ReturnType<typeof setTimeout> | null = null;
/** Lokale Bereinigung gebündelt, nur wenn kein Speichervorgang läuft. */
function scheduleGc() {
  if (gcTimer || typeof setTimeout === "undefined") return;
  gcTimer = setTimeout(async () => {
    gcTimer = null;
    if (pendingByProject.size || activeWrites > 0) { scheduleGc(); return; }
    try { await gcBlobs(sessionHashes(), recordHashes); } catch (e) { console.warn("Lokale Pixelbereinigung übersprungen:", e); }
  }, 30_000);
}
let activeWrites = 0;

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
    activeWrites++;
    let manifest: RasterManifest;
    try {
      data.rasterManifest = await toManifest(raster, job.revision, blobs, lastManifest.get(projectId));
      manifest = data.rasterManifest;
      pinHashes(blobs.keys());
      const sceneJson = JSON.stringify(data);
      const m = manifest;
      const ok = await saveProjectLocalMerge(projectId, blobs, (prev) => {
        if (prev && prev.format > RASTER_FORMAT) return null;
        // Outbox: jeder Key, dessen Manifest sich gegenüber dem gespeicherten Stand ändert.
        const before: RasterManifest = prev ? (JSON.parse(prev.sceneJson).rasterManifest ?? {}) : {};
        const dirty = new Set(prev?.dirtyKeys ?? []);
        for (const k of new Set([...Object.keys(before), ...Object.keys(m)])) {
          if (JSON.stringify(before[k] ?? null) !== JSON.stringify(m[k] ?? null)) dirty.add(k);
        }
        return { projectId, format: RASTER_FORMAT, revision: job.revision, savedAt: Date.now(), sceneJson, cloudBase: prev?.cloudBase ?? {}, dirtyKeys: [...dirty], conflicts: prev?.conflicts ?? {} };
      });
      if (!ok) { blocked.add(projectId); setStatus("blocked", "Neuerer Stand vorhanden – wird nicht überschrieben."); return false; }
    } finally { activeWrites--; unpinHashes(blobs.keys()); }
    lastManifest.set(projectId, manifest);
    pushRasterSoon(projectId);
    scheduleGc();
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
