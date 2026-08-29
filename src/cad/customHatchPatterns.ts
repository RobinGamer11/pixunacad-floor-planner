/**
 * customHatchPatterns.ts — benutzerdefinierte Schraffurmuster.
 *
 * Nutzer können eigene Musterkacheln (Bilddateien) hinzufügen. Diese werden
 * lokal persistiert und stehen im Muster-Dropdown zusätzlich zu den
 * eingebauten Vektormustern zur Verfügung. Die technische ID ist stabil
 * (`custom:<zeitstempel>-<zufall>`), sodass gespeicherte Schraffuren,
 * Copy/Paste und Undo/Redo unverändert funktionieren.
 */

export interface CustomHatchPattern {
  id: string;
  label: string;
  /** Data-URL der Kachel. */
  src: string;
}

const STORAGE_KEY = "pixuna:customHatchPatterns:v1";
const CHANGE_EVENT = "pixuna:hatch-patterns-changed";

let cache: CustomHatchPattern[] | null = null;

export function isCustomPatternId(id: string | undefined | null): boolean {
  return !!id && id.startsWith("custom:");
}

export function listCustomPatterns(): CustomHatchPattern[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(arr)
      ? arr.filter((p: any) => p && typeof p.id === "string" && typeof p.src === "string")
      : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function persist(list: CustomHatchPattern[]) {
  cache = list;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* Quota */ }
  notifyPatternsChanged();
}

export function addCustomPattern(label: string, src: string): CustomHatchPattern {
  const p: CustomHatchPattern = {
    id: `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: label.trim() || "Eigenes Muster",
    src,
  };
  persist([...listCustomPatterns(), p]);
  return p;
}

export function removeCustomPattern(id: string): void {
  persist(listCustomPatterns().filter((p) => p.id !== id));
  imageCache.delete(id);
}

export function getCustomPattern(id: string | undefined | null): CustomHatchPattern | undefined {
  if (!id) return undefined;
  return listCustomPatterns().find((p) => p.id === id);
}

export function notifyPatternsChanged(): void {
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* SSR */ }
}

export function onPatternsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

// ── Bild-Cache ────────────────────────────────────────────────────────
const imageCache = new Map<string, HTMLImageElement>();

/** Liefert das geladene Kachelbild oder `null`, solange es noch lädt. */
export function getCustomPatternImage(id: string): HTMLImageElement | null {
  const hit = imageCache.get(id);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
  const def = getCustomPattern(id);
  if (!def) return null;
  const img = new Image();
  img.onload = () => notifyPatternsChanged();
  img.src = def.src;
  imageCache.set(id, img);
  return img.complete && img.naturalWidth > 0 ? img : null;
}
