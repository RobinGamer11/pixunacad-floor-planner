// Zentraler Store für das Notiznetz. Persistiert projektbezogen in localStorage.
// Datenmodell: hierarchische Knoten (Themen/Unterthemen). Blätter sind Einträge
// (Notiz/Aufgabe/Datei/Foto).

export type NoteKind = "topic" | "note" | "task" | "file" | "photo";
export type NoteStatus = "open" | "wip" | "done";
export type NotePriority = "low" | "normal" | "high" | "urgent";

export interface NoteNode {
  id: string;
  parentId: string | null; // null = direkt am Projekt
  kind: NoteKind;
  title: string;
  description?: string;
  category?: string;
  status?: NoteStatus;
  priority?: NotePriority;
  date?: string;    // ISO
  time?: string;    // HH:MM
  dueDate?: string; // ISO
  responsible?: string;
  participants?: string[];
  comments?: { id: string; author?: string; text: string; ts: number }[];
  linkedIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface NotesState {
  categories: string[];
  nodes: NoteNode[];
}

const KEY = (projectId: string) => `pixuna.notes.${projectId}`;

function loadState(projectId: string): NotesState {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (raw) return JSON.parse(raw) as NotesState;
  } catch {}
  return {
    categories: ["Elektro", "Sanitär", "Trockenbau", "Material"],
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
    commit(projectId, { ...s, nodes: s.nodes.filter((n) => !toRemove.has(n.id)) });
  },
  addCategory(projectId: string, name: string) {
    const s = getState(projectId);
    if (!name.trim() || s.categories.includes(name)) return;
    commit(projectId, { ...s, categories: [...s.categories, name] });
  },
};

import { useSyncExternalStore } from "react";
export function useNotes(projectId: string | undefined): NotesState {
  return useSyncExternalStore(
    (fn) => (projectId ? subscribe(projectId, fn) : () => {}),
    () => (projectId ? getState(projectId) : { categories: [], nodes: [] }),
    () => (projectId ? getState(projectId) : { categories: [], nodes: [] }),
  );
}
