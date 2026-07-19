// Zentraler Store für das Notiznetz. Persistiert projektbezogen in localStorage.
// Datenmodell: hierarchische Knoten (Thema / Notiz / Aufgabe).

export type NoteKind = "topic" | "note" | "task" | "file" | "photo";
export type NoteStatus = string; // id aus NotesState.statuses (default: open|wip|done)
export type NotePriority = "low" | "normal" | "high" | "urgent";

export interface NoteStatusDef { id: string; label: string; color: string }

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
}

export interface NotesState {
  categories: string[];
  statuses: NoteStatusDef[];
  nodes: NoteNode[];
}

const DEFAULT_STATUSES: NoteStatusDef[] = [
  { id: "open", label: "Offen", color: "#ef4444" },
  { id: "wip", label: "In Bearbeitung", color: "#f59e0b" },
  { id: "done", label: "Erledigt", color: "#10b981" },
];

const KEY = (projectId: string) => `pixuna.notes.${projectId}`;

function loadState(projectId: string): NotesState {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotesState>;
      return {
        categories: parsed.categories ?? ["Elektro", "Sanitär", "Trockenbau", "Material"],
        statuses: parsed.statuses ?? DEFAULT_STATUSES,
        nodes: parsed.nodes ?? [],
      };
    }
  } catch {}
  return {
    categories: ["Elektro", "Sanitär", "Trockenbau", "Material"],
    statuses: DEFAULT_STATUSES,
    nodes: [],
  };
}

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, NotesState>();

function getState(projectId: string): NotesState {
  let s = cache.get(projectId);
  if (!s) { s = loadState(projectId); cache.set(projectId, s); }
  return s;
}

function commit(projectId: string, next: NotesState) {
  cache.set(projectId, next);
  try { localStorage.setItem(KEY(projectId), JSON.stringify(next)); } catch {}
  listeners.get(projectId)?.forEach((fn) => fn());
}

function subscribe(projectId: string, fn: () => void): () => void {
  let set = listeners.get(projectId);
  if (!set) { set = new Set(); listeners.set(projectId, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const notesStore = {
  getState,
  subscribe,
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
    // Aus allen linkedIds entfernen
    const nextNodes = s.nodes
      .filter((n) => !toRemove.has(n.id))
      .map((n) => n.linkedIds?.some((x) => toRemove.has(x))
        ? { ...n, linkedIds: n.linkedIds.filter((x) => !toRemove.has(x)) }
        : n);
    commit(projectId, { ...s, nodes: nextNodes });
  },
  addCategory(projectId: string, name: string) {
    const s = getState(projectId);
    if (!name.trim() || s.categories.includes(name)) return;
    commit(projectId, { ...s, categories: [...s.categories, name] });
  },
  addStatus(projectId: string, label: string, color: string) {
    const s = getState(projectId);
    if (!label.trim()) return;
    if (s.statuses.some((x) => x.label === label)) return;
    const id = uid();
    commit(projectId, { ...s, statuses: [...s.statuses, { id, label, color }] });
  },
  addComment(projectId: string, nodeId: string, text: string) {
    const s = getState(projectId);
    const node = s.nodes.find((n) => n.id === nodeId);
    if (!node || !text.trim()) return;
    const c = { id: uid(), text: text.trim(), ts: Date.now() };
    notesStore.updateNode(projectId, nodeId, { comments: [...(node.comments ?? []), c] });
  },
  removeComment(projectId: string, nodeId: string, commentId: string) {
    const s = getState(projectId);
    const node = s.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    notesStore.updateNode(projectId, nodeId, { comments: (node.comments ?? []).filter((c) => c.id !== commentId) });
  },
  linkNodes(projectId: string, aId: string, bId: string) {
    if (aId === bId) return;
    const s = getState(projectId);
    const a = s.nodes.find((n) => n.id === aId);
    const b = s.nodes.find((n) => n.id === bId);
    if (!a || !b) return;
    const patchA = a.linkedIds?.includes(bId) ? null : { linkedIds: [...(a.linkedIds ?? []), bId] };
    const patchB = b.linkedIds?.includes(aId) ? null : { linkedIds: [...(b.linkedIds ?? []), aId] };
    let next = s.nodes;
    if (patchA) next = next.map((n) => n.id === aId ? { ...n, ...patchA, updatedAt: Date.now() } : n);
    if (patchB) next = next.map((n) => n.id === bId ? { ...n, ...patchB, updatedAt: Date.now() } : n);
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
export function useNotes(projectId: string | undefined): NotesState {
  return useSyncExternalStore(
    (fn) => (projectId ? subscribe(projectId, fn) : () => {}),
    () => (projectId ? getState(projectId) : { categories: [], statuses: DEFAULT_STATUSES, nodes: [] }),
    () => (projectId ? getState(projectId) : { categories: [], statuses: DEFAULT_STATUSES, nodes: [] }),
  );
}
