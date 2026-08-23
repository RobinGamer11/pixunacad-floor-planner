/**
 * cadTableStore — Persistenz für Tabellenobjekte der CAD-Oberfläche.
 *
 * Die Tabellen sind (wie in der Projektmappe) semantische Tabellenobjekte und
 * werden als DOM-Overlay über dem CAD-Canvas dargestellt. Sie liegen bewusst
 * NEBEN der Zeichen-Engine (Scene/Renderer bleiben unberührt) und werden je
 * Projekt und Zeichenblatt in localStorage gespeichert.
 */
import type { PageElement } from "@/lib/projectStore";
import { migrateCadTables, stampVersion, CAD_TABLES_KIND } from "@/lib/persistence";

export interface CadTableElement extends PageElement {
  /** Weltposition der linken oberen Ecke in Metern. */
  xM: number;
  yM: number;
}

type Store = Record<string, CadTableElement[]>; // sheetId → Tabellen

const cache = new Map<string, Store>(); // projectId → Store
const listeners = new Set<() => void>();
let version = 0;

const keyFor = (projectId: string) => `pixuna.cadTables.${projectId}`;

function load(projectId: string): Store {
  const hit = cache.get(projectId);
  if (hit) return hit;
  let data: Store = {};
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") data = migrateCadTables(parsed) as Store;
    }
  } catch { /* noop */ }
  cache.set(projectId, data);
  return data;
}

function save(projectId: string) {
  try {
    localStorage.setItem(keyFor(projectId), JSON.stringify(stampVersion(CAD_TABLES_KIND, { ...load(projectId) })));
  } catch { /* noop */ }
  version++;
  listeners.forEach((l) => l());
}

export const cadTableStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  getVersion() { return version; },
  list(projectId: string, sheetId: string): CadTableElement[] {
    return load(projectId)[sheetId] ?? [];
  },
  add(projectId: string, sheetId: string, el: CadTableElement) {
    const store = load(projectId);
    store[sheetId] = [...(store[sheetId] ?? []), el];
    save(projectId);
  },
  patch(projectId: string, sheetId: string, id: string, patch: Partial<CadTableElement>) {
    const store = load(projectId);
    store[sheetId] = (store[sheetId] ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t));
    save(projectId);
  },
  remove(projectId: string, sheetId: string, id: string) {
    const store = load(projectId);
    store[sheetId] = (store[sheetId] ?? []).filter((t) => t.id !== id);
    save(projectId);
  },
};
