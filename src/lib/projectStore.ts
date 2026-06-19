// Lightweight client-side project store backed by localStorage.
// Holds the projects shown on the start page and inside the Projektmappe.
// Intentionally framework-free: tiny pub/sub + useSyncExternalStore hook.

import { useSyncExternalStore } from "react";

export type PageFormat = "A3-quer" | "A4-hoch" | "A4-quer" | "A3-hoch" | "frei";
export type ElementKind =
  | "text"
  | "image"
  | "pdf"
  | "table"
  | "note"
  | "timeline"
  | "cad-view"
  | "shape"
  | "line";

export interface PageElement {
  id: string;
  kind: ElementKind;
  x: number; // % of page
  y: number;
  w: number;
  h: number;
  // content payloads — only the fields used per kind are read
  text?: string;
  fontSize?: number;
  color?: string;
  imageUrl?: string;
  opacity?: number;
  shadow?: boolean;
  border?: boolean;
  sheetId?: string;
  rotation?: number;
}

export interface ProjectPage {
  id: string;
  title: string;
  format: PageFormat;
  margins: number;
  background: boolean;
  elements: PageElement[];
  notes?: string;
  columns?: number;
  columnGap?: number;
  guides?: boolean;
}

export interface Sheet {
  id: string;
  name: string;
  scale: string; // e.g. "1:100"
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  date?: string; // ISO date
}

export interface CalendarEvent {
  id: string;
  date: string; // ISO
  time?: string;
  title: string;
  location?: string;
}

export interface Project {
  id: string;
  name: string;
  ort: string;
  thumbnail: string;
  bauherr?: string;
  projektTyp?: string;
  status?: string;
  erstelltAm?: string;
  updatedAt: string;
  favorite?: boolean;
  pages: ProjectPage[];
  sheets: Sheet[];
  tasks: Task[];
  events: CalendarEvent[];
  konzept?: string;
}

const STORAGE_KEY = "pixuna.projects.v2";

const placeholder = (label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 260'><rect width='400' height='260' fill='%23efe9df'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Inter,sans-serif' font-size='22' fill='%238a7a5f'>${label}</text></svg>`
  )}`;

function demoProjects(): Project[] {
  const now = new Date().toISOString();
  const mk = (
    id: string,
    name: string,
    ort: string,
    extra: Partial<Project> = {}
  ): Project => ({
    id,
    name,
    ort,
    thumbnail: placeholder(name),
    updatedAt: now,
    erstelltAm: "03.06.2026",
    bauherr: "Familie Müller",
    projektTyp: "Neubau Einfamilienhaus",
    status: "In Bearbeitung",
    pages: [
      { id: `${id}-p1`, title: "01 Titel", format: "A3-quer", margins: 20, background: false, elements: [] },
      { id: `${id}-p2`, title: "02 Bestand", format: "A3-quer", margins: 20, background: false, elements: [] },
      { id: `${id}-p3`, title: "03 Analyse", format: "A3-quer", margins: 20, background: false, elements: [] },
      { id: `${id}-p4`, title: "04 Variante A", format: "A3-quer", margins: 20, background: false, elements: [] },
      { id: `${id}-p5`, title: "05 Variante B", format: "A3-quer", margins: 20, background: false, elements: [] },
      { id: `${id}-p6`, title: "06 Präsentation", format: "A3-quer", margins: 20, background: false, elements: [] },
      { id: `${id}-p7`, title: "07 Kostenübersicht", format: "A3-quer", margins: 20, background: false, elements: [] },
    ],
    sheets: [
      { id: `${id}-s1`, name: "EG Grundriss", scale: "1:100" },
      { id: `${id}-s2`, name: "OG Grundriss", scale: "1:100" },
      { id: `${id}-s3`, name: "Schnitt A-A", scale: "1:100" },
      { id: `${id}-s4`, name: "Ansicht Süd", scale: "1:100" },
      { id: `${id}-s5`, name: "Lageplan", scale: "1:500" },
    ],
    tasks: [
      { id: `${id}-t1`, title: "Bestandsaufnahme prüfen", done: true, date: "2026-06-03" },
      { id: `${id}-t2`, title: "Entwurf Variante A fertigstellen", done: true, date: "2026-06-07" },
      { id: `${id}-t3`, title: "Variante B ausarbeiten", done: false, date: "2026-06-15" },
      { id: `${id}-t4`, title: "Bauherrengespräch vorbereiten", done: false, date: "2026-06-18" },
      { id: `${id}-t5`, title: "Materialkonzept abstimmen", done: false, date: "2026-06-22" },
    ],
    events: [
      { id: `${id}-e1`, date: "2026-06-12", time: "10:00", title: "Bauherrengespräch", location: "Besprechungsraum 1" },
      { id: `${id}-e2`, date: "2026-06-18", time: "14:00", title: "Materialpräsentation", location: "Showroom" },
    ],
    ...extra,
  });

  return [
    mk("p-wohnhaus", "Wohnhaus am See", "Starnberger See", {
      favorite: true,
      konzept:
        "Die Variante A öffnet den Wohn-, Ess- und Kochbereich zum See hin und schafft eine fließende Verbindung zwischen Innen- und Außenraum.",
    }),
  ];
}

interface State {
  projects: Project[];
}

let state: State = load();
const listeners = new Set<() => void>();

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects) && parsed.projects.length) {
        return parsed as State;
      }
    }
  } catch {
    /* ignore */
  }
  return { projects: demoProjects() };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  listeners.forEach((fn) => fn());
}

function setState(updater: (s: State) => State) {
  state = updater(state);
  emit();
}

export const projectStore = {
  getState: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  createProject: () => {
    const id = `p-${Date.now().toString(36)}`;
    const blank: Project = {
      id,
      name: "Neues Projekt",
      ort: "",
      thumbnail: placeholder("Neues Projekt"),
      updatedAt: new Date().toISOString(),
      pages: [
        { id: `${id}-p1`, title: "01 Titel", format: "A3-quer", margins: 20, background: false, elements: [] },
      ],
      sheets: [],
      tasks: [],
      events: [],
    };
    setState((s) => ({ projects: [blank, ...s.projects] }));
    return id;
  },
  updateProject: (id: string, patch: Partial<Project>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
      ),
    }));
  },
  deleteProject: (id: string) => {
    setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },
  addPage: (projectId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const n = p.pages.length + 1;
        const num = String(n).padStart(2, "0");
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: [
            ...p.pages,
            {
              id: `${projectId}-p${Date.now().toString(36)}`,
              title: `${num} Neue Seite`,
              format: "A3-quer",
              margins: 20,
              background: false,
              elements: [],
            },
          ],
        };
      }),
    }));
  },
  updatePage: (projectId: string, pageId: string, patch: Partial<ProjectPage>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              pages: p.pages.map((pg) => (pg.id === pageId ? { ...pg, ...patch } : pg)),
            }
          : p
      ),
    }));
  },
  deletePage: (projectId: string, pageId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, pages: p.pages.filter((pg) => pg.id !== pageId) } : p
      ),
    }));
  },
  addElement: (projectId: string, pageId: string, el: Omit<PageElement, "id">) => {
    const id = `el-${Date.now().toString(36)}`;
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              pages: p.pages.map((pg) =>
                pg.id === pageId ? { ...pg, elements: [...pg.elements, { ...el, id }] } : pg
              ),
            }
          : p
      ),
    }));
    return id;
  },
  updateElement: (
    projectId: string,
    pageId: string,
    elementId: string,
    patch: Partial<PageElement>
  ) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              pages: p.pages.map((pg) =>
                pg.id === pageId
                  ? {
                      ...pg,
                      elements: pg.elements.map((e) =>
                        e.id === elementId ? { ...e, ...patch } : e
                      ),
                    }
                  : pg
              ),
            }
          : p
      ),
    }));
  },
  deleteElement: (projectId: string, pageId: string, elementId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              pages: p.pages.map((pg) =>
                pg.id === pageId
                  ? { ...pg, elements: pg.elements.filter((e) => e.id !== elementId) }
                  : pg
              ),
            }
          : p
      ),
    }));
  },
  toggleTask: (projectId: string, taskId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) }
          : p
      ),
    }));
  },
  addTask: (projectId: string, title: string, date?: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              tasks: [
                ...p.tasks,
                { id: `t-${Date.now().toString(36)}`, title, done: false, date },
              ],
            }
          : p
      ),
    }));
  },
};

export function useProjects(): Project[] {
  return useSyncExternalStore(
    projectStore.subscribe,
    () => projectStore.getState().projects,
    () => projectStore.getState().projects
  );
}

export function useProject(id: string | undefined): Project | undefined {
  const projects = useProjects();
  return projects.find((p) => p.id === id);
}
