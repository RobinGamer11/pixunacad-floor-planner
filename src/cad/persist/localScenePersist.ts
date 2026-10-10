/**
 * Lokales Speichern/Laden des CAD-Stands (reiner Vektorstand).
 * - IndexedDB (`pixuna-project-local`) = maßgeblicher lokaler Stand mit Formatversion.
 * - localStorage-Schlüssel bleibt als lesbarer Fallback/Altstand.
 * - Versionsschutz: Ein Stand mit höherem Format wird weder geladen noch überschrieben.
 * - Warteschlange je Projekt: ein Wechsel A → B verdrängt nie den ungespeicherten Stand von A.
 * - Frühere Pixelinhalte (`rasterManifest`, `rasterLayersByKey`) werden beim Laden verworfen.
 */
const DB_NAME = "pixuna-project-local";
const PROJECTS = "projects";
const LEGACY_BLOBS = "blobs";
/** Formatversion des lokalen Datensatzes (2 = früheres Pixelformat, lesbar). */
export const LOCAL_FORMAT = 2;

interface LocalProjectRecord { projectId: string; format: number; revision: number; savedAt: number; sceneJson: string }

export type LocalSaveStatus = "idle" | "saving" | "saved" | "quota" | "error" | "blocked";
type Listener = (s: LocalSaveStatus, detail?: string) => void;
const listeners = new Set<Listener>();
let status: LocalSaveStatus = "idle";
export function onLocalSaveStatus(l: Listener) { listeners.add(l); l(status); return () => { listeners.delete(l); }; }
function setStatus(s: LocalSaveStatus, detail?: string) { status = s; for (const l of listeners) l(s, detail); }

const blocked = new Set<string>();

function available() { return typeof indexedDB !== "undefined"; }
function isQuotaError(e: unknown) { const n = (e as any)?.name; return n === "QuotaExceededError" || n === "NS_ERROR_DOM_QUOTA_REACHED"; }

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!available()) return Promise.reject(new Error("IndexedDB nicht verfügbar"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(PROJECTS)) req.result.createObjectStore(PROJECTS, { keyPath: "projectId" });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Frühere Pixelkacheln freigeben (werden nicht mehr verwendet).
        if (db.objectStoreNames.contains(LEGACY_BLOBS)) {
          try { db.transaction(LEGACY_BLOBS, "readwrite").objectStore(LEGACY_BLOBS).clear(); } catch { /* optional */ }
        }
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Speichern abgebrochen"));
  });
}

/** Entfernt frühere Pixelfelder aus einem Szenen-JSON. */
export function stripLegacyRaster(data: any): any {
  if (data && typeof data === "object") { delete data.rasterManifest; delete data.rasterLayersByKey; delete data.rasterFormat; }
  return data;
}

export async function loadLocalScene(projectId: string): Promise<{ snapshot: string } | null> {
  if (!available()) return null;
  const db = await open();
  const rec = await new Promise<LocalProjectRecord | undefined>((resolve, reject) => {
    const req = db.transaction(PROJECTS, "readonly").objectStore(PROJECTS).get(projectId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!rec) return null;
  if (rec.format > LOCAL_FORMAT) {
    blocked.add(projectId);
    setStatus("blocked", "Dieser Stand stammt aus einer neueren Programmversion und wird nicht überschrieben.");
    throw new Error("PIXUNA_FORMAT_NEWER");
  }
  return { snapshot: JSON.stringify(stripLegacyRaster(JSON.parse(rec.sceneJson))) };
}

interface Job { snap: string; revision: number; legacyKey: string; waiters: Array<(ok: boolean) => void> }
const pendingByProject = new Map<string, Job>();
const chainByProject = new Map<string, Promise<void>>();

/** Gebündelt je Projekt: nur der neueste Stand wird geschrieben; true = bestätigt gespeichert. */
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
    const sceneJson = JSON.stringify(stripLegacyRaster(JSON.parse(job.snap)));
    if (available()) {
      const db = await open();
      const tx = db.transaction(PROJECTS, "readwrite");
      const st = tx.objectStore(PROJECTS);
      let ok = true;
      const req = st.get(projectId);
      req.onsuccess = () => {
        const prev = req.result as LocalProjectRecord | undefined;
        if (prev && prev.format > LOCAL_FORMAT) { ok = false; return; }
        st.put({ projectId, format: LOCAL_FORMAT, revision: job.revision, savedAt: Date.now(), sceneJson });
      };
      await done(tx);
      if (!ok) { blocked.add(projectId); setStatus("blocked", "Neuerer Stand vorhanden – wird nicht überschrieben."); return false; }
      try { localStorage.setItem(job.legacyKey, sceneJson); } catch { /* Fallback optional */ }
    } else {
      localStorage.setItem(job.legacyKey, sceneJson);
    }
    setStatus("saved");
    return true;
  } catch (e) {
    console.error("Lokales Speichern fehlgeschlagen:", e);
    setStatus(isQuotaError(e) ? "quota" : "error", isQuotaError(e) ? "Gerätespeicher voll." : String((e as any)?.message ?? e));
    return false;
  }
}
