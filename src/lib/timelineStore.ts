// Store für die Board02-Oberfläche (Zeitstrahl).
// Persistiert projektbezogen in localStorage: pixuna.board02.<projectId>

export type TlKind = "task" | "event" | "note";

export interface TlCategory { id: string; label: string; color: string }
/** percent = Priorität in Prozent (1–100). Bestimmt die Kreisgröße. */
export interface TlPriority { id: string; label: string; percent: number }
export interface TlStatus { id: string; label: string; color: string }

export interface TlItem {
  id: string;
  kind: TlKind;
  title: string;
  description?: string;
  done?: boolean;
  /** Status-Id aus TlState.statuses (aus Board übernommen). */
  statusId?: string;
  /** true, sobald der Status manuell gesetzt wurde – dann greift die Automatik nicht mehr. */
  statusManual?: boolean;
  responsible?: string;
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
  statuses: TlStatus[];
  items: TlItem[];
}

const DEFAULT_CATEGORIES: TlCategory[] = [
  { id: "plan", label: "Planung", color: "#e2703a" },
  { id: "bau", label: "Bauphase", color: "#c9a227" },
  { id: "abn", label: "Abnahme", color: "#4da3ff" },
];

const DEFAULT_PRIORITIES: TlPriority[] = [
  { id: "urgent", label: "Dringend", percent: 100 },
  { id: "high", label: "Hoch", percent: 70 },
  { id: "normal", label: "Normal", percent: 45 },
  { id: "low", label: "Niedrig", percent: 20 },
];

export const DEFAULT_STATUSES: TlStatus[] = [
  { id: "open", label: "Offen", color: "#ef4444" },
  { id: "wip", label: "In Bearbeitung", color: "#f59e0b" },
  { id: "done", label: "Erledigt", color: "#10b981" },
];

/** Radius eines Kreises aus der Priorität (Prozent). */
export function priorityRadius(percent: number | undefined): number {
  const p = Math.max(1, Math.min(100, percent ?? 45));
  return 5 + (p / 100) * 20;
}

const KEY = (projectId: string) => `pixuna.board02.${projectId}`;
const HISTORY_LIMIT = 100;

function normPriorities(list: unknown): TlPriority[] {
  const arr = Array.isArray(list) ? list : [];
  const out = arr.map((raw) => {
    const p = raw as Partial<TlPriority> & { size?: number };
    const percent = typeof p.percent === "number"
      ? p.percent
      : typeof p.size === "number"
        ? Math.max(1, Math.min(100, Math.round(((p.size - 4) / 36) * 100)))
        : 45;
    return { id: String(p.id ?? uid()), label: String(p.label ?? "Priorität"), percent };
  });
  return out.length ? out : [...DEFAULT_PRIORITIES];
}

function loadState(projectId: string): TlState {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<TlState>;
      return {
        categories: p.categories?.length ? p.categories : [...DEFAULT_CATEGORIES],
        priorities: normPriorities(p.priorities),
        statuses: p.statuses?.length ? p.statuses : [...DEFAULT_STATUSES],
        items: (p.items ?? []).map((i) => ({
          ...i,
          statusId: i.statusId ?? (i.done ? "done" : "open"),
        })),
      };
    }
  } catch {}
  return {
    categories: [...DEFAULT_CATEGORIES],
    priorities: [...DEFAULT_PRIORITIES],
    statuses: [...DEFAULT_STATUSES],
    items: [],
  };
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
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export const timelineStore = {
  getState,
  subscribe,
  /** Legt beim ersten Öffnen eines Projekts den Default-Termin „Projektverlauf" an. */
  ensureDefaults(projectId: string) {
    const s = getState(projectId);
    if (s.items.length) return;
    const now = Date.now();
    const item: TlItem = {
      id: uid(),
      kind: "event",
      title: "Projektverlauf",
      description: "",
      done: false,
      statusId: "open",
      categoryId: s.categories[0]?.id,
      priorityId: "normal",
      startDate: today(),
      startTime: "09:00",
      endDate: plusDays(10),
      endTime: "17:00",
      createdAt: now,
      updatedAt: now,
    };
    persist(projectId, { ...s, items: [item] });
  },
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
      statusId: patch.statusId ?? "open",
      responsible: patch.responsible ?? "",
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
  updateCategory(projectId: string, id: string, patch: Partial<Omit<TlCategory, "id">>) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  },
  removeCategory(projectId: string, id: string) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
      items: s.items.map((i) => (i.categoryId === id ? { ...i, categoryId: undefined } : i)),
    });
  },
  addPriority(projectId: string, label: string, percent: number): string | null {
    const s = getState(projectId);
    if (!label.trim()) return null;
    const p: TlPriority = { id: uid(), label: label.trim(), percent: Math.max(1, Math.min(100, percent)) };
    commit(projectId, { ...s, priorities: [...s.priorities, p] });
    return p.id;
  },
  updatePriority(projectId: string, id: string, patch: Partial<Omit<TlPriority, "id">>) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      priorities: s.priorities.map((p) => (p.id === id
        ? { ...p, ...patch, percent: Math.max(1, Math.min(100, patch.percent ?? p.percent)) }
        : p)),
    });
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
const EMPTY: TlState = { categories: [], priorities: [], statuses: DEFAULT_STATUSES, items: [] };

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
/** Fortschritt eines Eintrags: Termine über die Zeit, Aufgaben/Notizen über den Status. */
export function itemAchieved(i: TlItem, now = Date.now()): boolean {
  if (i.statusId === "done" || i.done) return true;
  if (i.kind === "event") return itemEndMs(i) <= now;
  return false;
}
