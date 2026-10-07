/**
 * Temporäre Ablage laufender Rasterjobs (IndexedDB, Blob je Kachel).
 *
 * Inhalte sind KEIN Projektstand: Sie gehören genau einer Action-ID, werden
 * nach Abschluss oder Abbruch gelöscht und beim Programmstart von verwaisten
 * Jobs bereinigt. Ohne IndexedDB meldet `available()` false – dann dürfen nur
 * Aktionen innerhalb des RAM-Jobbudgets laufen (siehe RasterPolicy).
 */
const DB_NAME = "pixuna-raster-temp";
const STORE = "tiles";

let dbPromise: Promise<IDBDatabase> | null = null;

export function rasterTempStoreAvailable(): boolean {
  return typeof indexedDB !== "undefined" && typeof Blob !== "undefined";
}

function open(): Promise<IDBDatabase> {
  if (!rasterTempStoreAvailable()) return Promise.reject(new Error("IndexedDB nicht verfügbar"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: ["actionId", "key"] });
          st.createIndex("actionId", "actionId");
        }
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

export async function tempPut(actionId: string, key: string, blob: Blob): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put({ actionId, key, blob, at: Date.now() });
  await done(tx);
}

export async function tempGet(actionId: string, key: string): Promise<Blob | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get([actionId, key]);
    req.onsuccess = () => resolve((req.result?.blob as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function tempDeleteAction(actionId: string): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    const idx = tx.objectStore(STORE).index("actionId");
    const req = idx.openKeyCursor(IDBKeyRange.only(actionId));
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      tx.objectStore(STORE).delete(cur.primaryKey);
      cur.continue();
    };
    await done(tx);
  } catch { /* temporär – beim nächsten Start bereinigt */ }
}

/**
 * Entfernt Reste nicht mehr aktiver Jobs (z. B. nach Absturz/Neuladen).
 * Einträge jünger als `keepRecentMs` bleiben (ein anderer Tab kann sie nutzen).
 */
export async function tempCleanup(activeIds: Set<string>, keepRecentMs = 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - keepRecentMs;
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const v = cur.value as any;
      if (!activeIds.has(v.actionId) && !(v.at > cutoff)) cur.delete();
      cur.continue();
    };
    await done(tx);
  } catch { /* optional */ }
}
