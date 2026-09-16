/**
 * Merkzettel des zuletzt in der Cloud bestätigten Objektstands.
 *
 * Gespeichert werden ausschließlich kurze Prüfsummen je Objekt – niemals
 * Projektinhalte. Daraus ergibt sich zweierlei ohne jede Netzanfrage:
 *  - ob es lokale, noch nicht gesicherte Änderungen gibt,
 *  - welche einzelnen Objekte beim Sichern übertragen werden müssen.
 */
export type BaselineHashes = Map<string, string>;

const PREFIX = "pixuna.cloudbase.";
/** Trennzeichen innerhalb eines Objektschlüssels (kommt in IDs nicht vor). */
export const BASELINE_SEP = "\u0001";

export function baselineKey(scope: "cad" | "mappe", projectId: string): string {
  return `${PREFIX}${scope}.${projectId}`;
}

/** Kurze, stabile Prüfsumme (djb2 + Länge). */
export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${(hash >>> 0).toString(36)}.${text.length.toString(36)}`;
}

export function loadBaseline(key: string): BaselineHashes {
  const out: BaselineHashes = new Map();
  if (typeof window === "undefined") return out;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, string>;
    Object.entries(parsed).forEach(([k, v]) => { if (typeof v === "string") out.set(k, v); });
  } catch { /* beschädigter Merkzettel: gilt als „nichts gesichert“ */ }
  return out;
}

export function hasBaseline(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) !== null;
}

export function saveBaseline(key: string, hashes: BaselineHashes): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(hashes)));
  } catch { /* der Merkzettel ist entbehrlich – lokale Arbeit geht weiter */ }
}
