// Zentraler Store für das Notiznetz. Persistiert projektbezogen in localStorage.
// Datenmodell: hierarchische Knoten (Thema / Notiz / Aufgabe) + History (Undo/Redo).

export type NoteKind = "topic" | "note" | "task" | "file" | "photo";
export type NoteStatus = string;   // id aus NotesState.statuses
export type NotePriority = string; // id aus NotesState.priorities

export interface NoteStatusDef { id: string; label: string; color: string }
export interface NotePriorityDef { id: string; label: string; color: string }

export interface NoteNode {
  id: string;
  parentId: string | null;
  kind: NoteKind;
  title: string;
  description?: string;
  category?: string;
  status?: NoteStatus;
  priority?: NotePriority;
  date?: string;
  time?: string;
  dueDate?: string;
  responsible?: string;
  participants?: string[];
  comments?: { id: string; author?: string; text: string; ts: number }[];
  linkedIds?: string[];
  createdAt: number;
  updatedAt: number;
  /** Sortierindex innerhalb des Elternteils (für Drag&Drop). */
  order?: number;
  /** Neu erstellte Aufgabe/Notiz aus Startseite – bis zum ersten Öffnen im Netz hellblau markiert. */
  unseen?: boolean;
  /** Zuordnung zu einer Projektmappe (id). Für Aufgaben-Übersicht/Filter. */
  mappeId?: string;
}

export interface NotesState {
  categories: string[];
  statuses: NoteStatusDef[];
  priorities: NotePriorityDef[];
  nodes: NoteNode[];
}


const DEFAULT_STATUSES: NoteStatusDef[] = [
  { id: "open", label: "Offen", color: "#ef4444" },
  { id: "wip", label: "In Bearbeitung", color: "#f59e0b" },
  { id: "done", label: "Erledigt", color: "#10b981" },
];

const DEFAULT_PRIORITIES: NotePriorityDef[] = [
  { id: "low", label: "Niedrig", color: "#94a3b8" },
  { id: "normal", label: "Normal", color: "#3b82f6" },
  { id: "high", label: "Hoch", color: "#f59e0b" },
  { id: "urgent", label: "Dringend", color: "#ef4444" },
];

const KEY = (projectId: string) => `pixuna.notes.${projectId}`;
const HISTORY_LIMIT = 100;

/** "Schnellablage" ist die Standardkategorie und steht immer an erster Stelle. */
export const QUICK_CATEGORY = "Schnellablage";
const DEFAULT_CATEGORIES = [QUICK_CATEGORY, "Elektro", "Sanitär", "Trockenbau", "Material"];

/** Stellt sicher, dass "Schnellablage" existiert und ganz vorne steht. */
function withQuickCategory(list: string[]): string[] {
  const rest = list.filter((c) => c !== QUICK_CATEGORY);
  return [QUICK_CATEGORY, ...rest];
}

function loadState(projectId: string): NotesState {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotesState>;
      return {
        categories: withQuickCategory(parsed.categories ?? DEFAULT_CATEGORIES),
        statuses: parsed.statuses ?? DEFAULT_STATUSES,
        priorities: parsed.priorities ?? DEFAULT_PRIORITIES,
        nodes: (parsed.nodes ?? []).map((n, i) => ({ ...n, order: n.order ?? i })),
      };
    }
  } catch {}
  return {
    categories: [...DEFAULT_CATEGORIES],
    statuses: DEFAULT_STATUSES,
    priorities: DEFAULT_PRIORITIES,
    nodes: [],
  };
}

interface HistoryEntry { past: NotesState[]; future: NotesState[] }

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, NotesState>();
const history = new Map<string, HistoryEntry>();

function getHistory(projectId: string): HistoryEntry {
  let h = history.get(projectId);
  if (!h) { h = { past: [], future: [] }; history.set(projectId, h); }
  return h;
}

function getState(projectId: string): NotesState {
  let s = cache.get(projectId);
  if (!s) { s = loadState(projectId); cache.set(projectId, s); }
  return s;
}

function persist(projectId: string, next: NotesState) {
  cache.set(projectId, next);
  try { localStorage.setItem(KEY(projectId), JSON.stringify(next)); } catch {}
  listeners.get(projectId)?.forEach((fn) => fn());
}

function commit(projectId: string, next: NotesState) {
  const prev = getState(projectId);
  const h = getHistory(projectId);
  h.past.push(prev);
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

function siblingsMaxOrder(state: NotesState, parentId: string | null): number {
  let max = -1;
  state.nodes.forEach((n) => {
    if (n.parentId === parentId && (n.order ?? 0) > max) max = n.order ?? 0;
  });
  return max;
}

export const notesStore = {
  getState,
  subscribe,
  /** Alle Board-Daten eines Projekts vollständig entfernen (Cache, Historie, localStorage). */
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
  addNode(projectId: string, parentId: string | null, kind: NoteKind, patch: Partial<NoteNode> = {}): NoteNode {
    const s = getState(projectId);
    const now = Date.now();
    const node: NoteNode = {
      id: uid(),
      parentId,
      kind,
      title: patch.title ?? (kind === "topic" ? "Neues Thema" : kind === "task" ? "Neue Aufgabe" : "Neue Notiz"),
      description: patch.description ?? "",
      status: kind === "task" ? (patch.status ?? "open") : patch.status,
      priority: patch.priority ?? "normal",
      category: patch.category,
      date: patch.date,
      time: patch.time,
      dueDate: patch.dueDate,
      responsible: patch.responsible,
      participants: patch.participants ?? [],
      comments: patch.comments ?? [],
      linkedIds: patch.linkedIds ?? [],
      createdAt: now,
      updatedAt: now,
      order: siblingsMaxOrder(s, parentId) + 1,
      unseen: patch.unseen,
      mappeId: patch.mappeId,

    };
    commit(projectId, { ...s, nodes: [...s.nodes, node] });
    return node;
  },
  updateNode(projectId: string, id: string, patch: Partial<NoteNode>) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)),
    });
  },
  deleteNode(projectId: string, id: string) {
    const s = getState(projectId);
    const toRemove = new Set<string>();
    const collect = (nid: string) => {
      toRemove.add(nid);
      s.nodes.filter((c) => c.parentId === nid).forEach((c) => collect(c.id));
    };
    collect(id);
    const nextNodes = s.nodes
      .filter((n) => !toRemove.has(n.id))
      .map((n) => n.linkedIds?.some((x) => toRemove.has(x))
        ? { ...n, linkedIds: n.linkedIds.filter((x) => !toRemove.has(x)) }
        : n);
    commit(projectId, { ...s, nodes: nextNodes });
  },
  /** Verschiebt einen Knoten unter ein neues Elternteil (oder Root, wenn null). */
  moveNode(projectId: string, id: string, newParentId: string | null) {
    const s = getState(projectId);
    const node = s.nodes.find((n) => n.id === id);
    if (!node) return;
    if (newParentId === id) return;
    // Verhindern, dass ein Knoten in einen eigenen Nachfahren verschoben wird
    const isDescendant = (candidate: string | null): boolean => {
      if (!candidate) return false;
      if (candidate === id) return true;
      const p = s.nodes.find((n) => n.id === candidate);
      return p ? isDescendant(p.parentId) : false;
    };
    if (isDescendant(newParentId)) return;
    if (node.parentId === newParentId) return;
    const nextOrder = siblingsMaxOrder(s, newParentId) + 1;
    commit(projectId, {
      ...s,
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, parentId: newParentId, order: nextOrder, updatedAt: Date.now() } : n),
    });
  },
  addCategory(projectId: string, name: string) {
    const s = getState(projectId);
    if (!name.trim() || s.categories.includes(name)) return;
    commit(projectId, { ...s, categories: [...s.categories, name] });
  },
  removeCategory(projectId: string, name: string) {
    const s = getState(projectId);
    if (!s.categories.includes(name)) return;
    commit(projectId, {
      ...s,
      categories: s.categories.filter((c) => c !== name),
      nodes: s.nodes.map((n) => n.category === name ? { ...n, category: undefined, updatedAt: Date.now() } : n),
    });
  },
  addStatus(projectId: string, label: string, color: string) {
    const s = getState(projectId);
    if (!label.trim()) return;
    if (s.statuses.some((x) => x.label === label)) return;
    commit(projectId, { ...s, statuses: [...s.statuses, { id: uid(), label, color }] });
  },
  removeStatus(projectId: string, id: string) {
    const s = getState(projectId);
    if (!s.statuses.some((x) => x.id === id)) return;
    commit(projectId, {
      ...s,
      statuses: s.statuses.filter((x) => x.id !== id),
      nodes: s.nodes.map((n) => n.status === id ? { ...n, status: undefined, updatedAt: Date.now() } : n),
    });
  },
  addPriority(projectId: string, label: string, color: string) {
    const s = getState(projectId);
    if (!label.trim()) return;
    if (s.priorities.some((x) => x.label === label)) return;
    commit(projectId, { ...s, priorities: [...s.priorities, { id: uid(), label, color }] });
  },
  removePriority(projectId: string, id: string) {
    const s = getState(projectId);
    if (!s.priorities.some((x) => x.id === id)) return;
    commit(projectId, {
      ...s,
      priorities: s.priorities.filter((x) => x.id !== id),
      nodes: s.nodes.map((n) => n.priority === id ? { ...n, priority: undefined, updatedAt: Date.now() } : n),
    });
  },
  markSeen(projectId: string, id: string) {
    const s = getState(projectId);
    const node = s.nodes.find((n) => n.id === id);
    if (!node || !node.unseen) return;
    // Nicht in History – "gesehen" ist reine UI-Markierung.
    persist(projectId, {
      ...s,
      nodes: s.nodes.map((n) => n.id === id ? { ...n, unseen: false } : n),
    });
  },

  addComment(projectId: string, nodeId: string, text: string) {
    const s = getState(projectId);
    const node = s.nodes.find((n) => n.id === nodeId);
    if (!node || !text.trim()) return;
    const c = { id: uid(), text: text.trim(), ts: Date.now() };
    commit(projectId, {
      ...s,
      nodes: s.nodes.map((n) => n.id === nodeId
        ? { ...n, comments: [...(n.comments ?? []), c], updatedAt: Date.now() } : n),
    });
  },
  removeComment(projectId: string, nodeId: string, commentId: string) {
    const s = getState(projectId);
    commit(projectId, {
      ...s,
      nodes: s.nodes.map((n) => n.id === nodeId
        ? { ...n, comments: (n.comments ?? []).filter((c) => c.id !== commentId), updatedAt: Date.now() } : n),
    });
  },
  linkNodes(projectId: string, aId: string, bId: string) {
    if (aId === bId) return;
    const s = getState(projectId);
    const a = s.nodes.find((n) => n.id === aId);
    const b = s.nodes.find((n) => n.id === bId);
    if (!a || !b) return;
    if (a.linkedIds?.includes(bId) && b.linkedIds?.includes(aId)) return;
    const next = s.nodes.map((n) => {
      if (n.id === aId && !(n.linkedIds ?? []).includes(bId))
        return { ...n, linkedIds: [...(n.linkedIds ?? []), bId], updatedAt: Date.now() };
      if (n.id === bId && !(n.linkedIds ?? []).includes(aId))
        return { ...n, linkedIds: [...(n.linkedIds ?? []), aId], updatedAt: Date.now() };
      return n;
    });
    commit(projectId, { ...s, nodes: next });
  },
  unlinkNodes(projectId: string, aId: string, bId: string) {
    const s = getState(projectId);
    const next = s.nodes.map((n) => {
      if (n.id === aId) return { ...n, linkedIds: (n.linkedIds ?? []).filter((x) => x !== bId), updatedAt: Date.now() };
      if (n.id === bId) return { ...n, linkedIds: (n.linkedIds ?? []).filter((x) => x !== aId), updatedAt: Date.now() };
      return n;
    });
    commit(projectId, { ...s, nodes: next });
  },
};

import { useSyncExternalStore } from "react";
const EMPTY: NotesState = { categories: [], statuses: DEFAULT_STATUSES, priorities: DEFAULT_PRIORITIES, nodes: [] };
export function useNotes(projectId: string | undefined): NotesState {
  return useSyncExternalStore(
    (fn) => (projectId ? subscribe(projectId, fn) : () => {}),
    () => (projectId ? getState(projectId) : EMPTY),
    () => (projectId ? getState(projectId) : EMPTY),
  );
}

/** Zwingt Rerender wenn sich die Undo/Redo-Verfügbarkeit ändert (subscribed am gleichen Store). */
export function useNotesHistory(projectId: string | undefined) {
  useSyncExternalStore(
    (fn) => (projectId ? subscribe(projectId, fn) : () => {}),
    () => (projectId ? getHistory(projectId).past.length * 1000 + getHistory(projectId).future.length : 0),
    () => 0,
  );
  return {
    canUndo: projectId ? notesStore.canUndo(projectId) : false,
    canRedo: projectId ? notesStore.canRedo(projectId) : false,
    undo: () => projectId && notesStore.undo(projectId),
    redo: () => projectId && notesStore.redo(projectId),
  };
}
