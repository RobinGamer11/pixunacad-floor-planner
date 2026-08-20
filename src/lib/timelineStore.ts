// Store für die Board02-Oberfläche (Zeitstrahl).
// Persistiert projektbezogen in localStorage: pixuna.board02.<projectId>

export type TlKind = "task" | "event" | "note";

export interface TlCategory { id: string; label: string; color: string }
/** size = Basisradius des größten Kreises in Pixeln. */
export interface TlPriority { id: string; label: string; size: number }

export interface TlItem {
  id: string;
  kind: TlKind;
  title: string;
  description?: string;
  done?: boolean;
  categoryId?: string;
  priorityId?: string;
  /** ISO "YYYY-MM-DD" */
  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TlState {
  categories: TlCategory[];
  priorities: TlPriority[];
  items: TlItem[];
}

const DEFAULT_CATEGORIES: TlCategory[] = [
  { id: "plan", label: "Planung", color: "#e2703a" },
  { id: "bau", label: "Bauphase", color: "#c9a227" },
  { id: "abn", label: "Abnahme", color: "#4da3ff" },
];

const DEFAULT_PRIORITIES: TlPriority[] = [
  { id: "urgent", label: "Dringend", size: 22 },
  { id: "high", label: "Hoch", size: 17 },
  { id: "normal", label: "Normal", size: 13 },
  { id: "low", label: "Niedrig", size: 9 },
];

const KEY = (projectId: string) => `pixuna.board02.${projectId}`;
const HISTORY_LIMIT = 100;

function loadState(projectId: string): TlState {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<TlState>;
      return {
        categories: p.categories?.length ? p.categories : [...DEFAULT_CATEGORIES],
        priorities: p.priorities?.length ? p.priorities : [...DEFAULT_PRIORITIES],
        items: p.items ?? [],
      };
    }
  } catch {}
  return { categories: [...DEFAULT_CATEGORIES], priorities: [...DEFAULT_PRIORITIES], items: [] };
}

interface HistoryEntry { past: TlState[]; future: TlState[] }
const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, TlState>();
const history = new Map<string, HistoryEntry>();

function getHistory(projectId: string): HistoryEntry {
  let h = history.get(projectId);
  if (!h) { h = { past: [], future: [] }; history.set(projectId, h); }
  return h;
}
function getState(projectId: string): TlState {
  let s = cache.get(projectId);
  if (!s) { s = loadState(projectId); cache.set(projectId, s); }
  return s;
}
function persist(projectId: string, next: TlState) {
  cache.set(projectId, next);
  try { localStorage.setItem(KEY(projectId), JSON.stringify(next)); } catch {}
  listeners.get(projectId)?.forEach((fn) => fn());
}
function commit(projectId: string, next: TlState) {
  const h = getHistory(projectId);
  h.past.push(getState(projectId));
  if (h.past.length > HISTORY_LIMIT) h.past.shift();
  h.future = [];
  persist(projectId, next);
}
function subscribe(projectId: string, fn: () => void): () => void {
  let set = listeners.get(projectId);
  if (!set) { set = new Set(); listeners.set(projectId, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

export const timelineStore = {
  getState,
  subscribe,
  deleteProject(projectId: string) {
    cache.delete(projectId);
    history.delete(projectId);
    try { localStorage.removeItem(KEY(projectId)); } catch {}
    listeners.get(projectId)?.forEach((fn) => fn());
    listeners.delete(projectId);
  },
  canUndo: (projectId: string) => getHistory(projectId).past.length > 0,
  canRedo: (projectId: string) => getHistory(projectId).future.length > 0,
  undo(projectId: string) {
    const h = getHistory(projectId);
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(getState(projectId));
    persist(projectId, prev);
  },
  redo(projectId: string) {
    const h = getHistory(projectId);
    const next = h.future.pop();
    if (!next) return;
    h.past.push(getState(projectId));
    persist(projectId, next);
  },
  addItem(projectId: string, kind: TlKind, patch: Partial<TlItem> = {}): TlItem {
    const s = getState(projectId);
    const now = Date.now();
    const item: TlItem = {
      id: uid(),
      kind,
      title: patch.title ?? (kind === "task" ? "Neue Aufgabe" : kind === "event" ? "Neuer Termin" : "Neue Notiz"),
      description: patch.description ?? "",
      done: patch.done ?? false,
      categoryId: patch.categoryId ?? s.categories[0]?.id,
      priorityId: patch.priorityId ?? "normal",
      startDate: patch.startDate ?? today(),
      startTime: patch.startTime ?? "09:00",
      endDate: patch.endDate,
      endTime: patch.endTime,
      createdAt: now,
      updatedAt: now,
    };
    commit(projectId, { ...s, items: [...s.items, item] });
    return item;
  },
  updateItem(projectId: string, id: string, patch: Partial<TlItem>) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)),
    });
  },
  deleteItem(projectId: string, id: string) {
    const s = getState(projectId);
    commit(projectId, { ...s, items: s.items.filter((i) => i.id !== id) });
  },
  addCategory(projectId: string, label: string, color: string): string | null {
    const s = getState(projectId);
    if (!label.trim()) return null;
    const cat: TlCategory = { id: uid(), label: label.trim(), color };
    commit(projectId, { ...s, categories: [...s.categories, cat] });
    return cat.id;
  },
  removeCategory(projectId: string, id: string) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
      items: s.items.map((i) => (i.categoryId === id ? { ...i, categoryId: undefined } : i)),
    });
  },
  addPriority(projectId: string, label: string, size: number): string | null {
    const s = getState(projectId);
    if (!label.trim()) return null;
    const p: TlPriority = { id: uid(), label: label.trim(), size: Math.max(4, Math.min(40, size)) };
    commit(projectId, { ...s, priorities: [...s.priorities, p] });
    return p.id;
  },
  removePriority(projectId: string, id: string) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      priorities: s.priorities.filter((p) => p.id !== id),
      items: s.items.map((i) => (i.priorityId === id ? { ...i, priorityId: undefined } : i)),
    });
  },
};

import { useSyncExternalStore } from "react";
const EMPTY: TlState = { categories: [], priorities: [], items: [] };

export function useTimeline(projectId: string | undefined): TlState {
  return useSyncExternalStore(
    (fn) => (projectId ? subscribe(projectId, fn) : () => {}),
    () => (projectId ? getState(projectId) : EMPTY),
    () => (projectId ? getState(projectId) : EMPTY),
  );
}

export function useTimelineHistory(projectId: string | undefined) {
  useSyncExternalStore(
    (fn) => (projectId ? subscribe(projectId, fn) : () => {}),
    () => (projectId ? getHistory(projectId).past.length * 1000 + getHistory(projectId).future.length : 0),
    () => 0,
  );
  return {
    canUndo: projectId ? timelineStore.canUndo(projectId) : false,
    canRedo: projectId ? timelineStore.canRedo(projectId) : false,
    undo: () => projectId && timelineStore.undo(projectId),
    redo: () => projectId && timelineStore.redo(projectId),
  };
}

/** Millisekunden-Zeitstempel für Start bzw. Ende eines Eintrags. */
export function itemStartMs(i: TlItem): number {
  return new Date(`${i.startDate}T${i.startTime || "00:00"}:00`).getTime();
}
export function itemEndMs(i: TlItem): number {
  if (!i.endDate) return itemStartMs(i);
  const end = new Date(`${i.endDate}T${i.endTime || i.startTime || "00:00"}:00`).getTime();
  return Math.max(end, itemStartMs(i));
}
/** Fortschritt eines Eintrags: Termine über die Zeit, Aufgaben/Notizen manuell. */
export function itemAchieved(i: TlItem, now = Date.now()): boolean {
  if (i.kind === "event") return itemEndMs(i) <= now;
  return !!i.done;
}
