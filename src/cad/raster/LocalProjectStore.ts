/**
 * Lokale Projektablage (IndexedDB): Pixelkacheln als Blob (inhaltsadressiert,
 * je Hash genau einmal) und der lokale Szenenstand mit Formatversion.
 * localStorage enthält keine Pixeldaten mehr.
 */
const DB_NAME = "pixuna-project-local";
const BLOBS = "blobs";
const PROJECTS = "projects";

export interface LocalProjectRecord {
  projectId: string;
  format: number;
  revision: number;
  savedAt: number;
  /** Szene ohne Pixeldaten; Rasterinhalt als Manifest mit Hash-Referenzen. */
  sceneJson: string;
  /** Zuletzt bestätigte Cloudrevision je Blatt-Key (Basis der Konfliktprüfung). */
  cloudBase?: Record<string, number>;
  /** Persistente Outbox: Keys mit lokalen, noch nicht veröffentlichten Änderungen. */
  dirtyKeys?: string[];
  /** Bei beidseitiger Änderung erhaltener Cloudstand je Key (lokal bleibt maßgeblich). */
  conflicts?: Record<string, { revision: number; layers: unknown }>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function localStoreAvailable(): boolean {
  return typeof indexedDB !== "undefined" && typeof Blob !== "undefined";
}

function open(): Promise<IDBDatabase> {
  if (!localStoreAvailable()) return Promise.reject(new Error("IndexedDB nicht verfügbar"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "projectId" });
      };
      req.onsuccess = () => resolve(req.result);
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

function getOne<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  }));
}

export function isQuotaError(e: unknown): boolean {
  const n = (e as any)?.name;
  return n === "QuotaExceededError" || n === "NS_ERROR_DOM_QUOTA_REACHED";
}

/** Schreibt alle neuen Blobs und danach den Projektstand in EINER Transaktion. */
export async function saveProjectLocal(rec: LocalProjectRecord, blobs: Map<string, Blob>): Promise<void> {
  const db = await open();
  const tx = db.transaction([BLOBS, PROJECTS], "readwrite");
  const bs = tx.objectStore(BLOBS);
  for (const [hash, blob] of blobs) bs.put(blob, hash);
  tx.objectStore(PROJECTS).put(rec);
  await done(tx);
}

export async function hasBlob(hash: string): Promise<boolean> {
  return (await getOne<Blob>(BLOBS, hash)) != null;
}

export function getBlob(hash: string): Promise<Blob | undefined> {
  return getOne<Blob>(BLOBS, hash);
}

export function loadProjectLocal(projectId: string): Promise<LocalProjectRecord | undefined> {
  return getOne<LocalProjectRecord>(PROJECTS, projectId);
}

/** Legt heruntergeladene Blobs ab (inhaltsadressiert, idempotent). */
export async function putBlobs(blobs: Map<string, Blob>): Promise<void> {
  if (!blobs.size) return;
  const db = await open();
  const tx = db.transaction(BLOBS, "readwrite");
  for (const [hash, blob] of blobs) tx.objectStore(BLOBS).put(blob, hash);
  await done(tx);
}

/** Liest, ändert und schreibt einen Projektdatensatz in EINER Transaktion. */
export async function patchProjectLocal(projectId: string, fn: (rec: LocalProjectRecord | undefined) => LocalProjectRecord | null): Promise<LocalProjectRecord | null> {
  const db = await open();
  const tx = db.transaction(PROJECTS, "readwrite");
  const st = tx.objectStore(PROJECTS);
  let out: LocalProjectRecord | null = null;
  const req = st.get(projectId);
  req.onsuccess = () => { out = fn(req.result as LocalProjectRecord | undefined); if (out) st.put(out); };
  await done(tx);
  return out;
}

/**
 * Löscht Blobs, auf die kein gespeicherter Projektstand (inkl. Outbox und
 * Konfliktstände) und nichts aus `keep` (Sitzung: Undo/Redo, laufende Jobs,
 * offene Speichervorgänge) mehr verweist. Läuft in einer Transaktion über
 * beide Speicher – parallele Speichervorgänge werden davor oder danach serialisiert.
 */
export async function gcBlobs(keep: Set<string>, hashesOfRecord: (rec: LocalProjectRecord) => Iterable<string>): Promise<number> {
  const db = await open();
  const tx = db.transaction([BLOBS, PROJECTS], "readwrite");
  let removed = 0;
  const all = tx.objectStore(PROJECTS).getAll();
  all.onsuccess = () => {
    const used = new Set(keep);
    for (const rec of all.result as LocalProjectRecord[]) { try { for (const h of hashesOfRecord(rec)) used.add(h); } catch { return tx.abort(); } }
    const keys = tx.objectStore(BLOBS).getAllKeys();
    keys.onsuccess = () => {
      for (const k of keys.result) if (!used.has(String(k))) { tx.objectStore(BLOBS).delete(k); removed++; }
    };
  };
  await done(tx);
  return removed;
}
