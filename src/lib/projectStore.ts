// Lightweight client-side project store backed by localStorage.
// Holds the projects shown on the start page and inside the Projektmappe.
// Intentionally framework-free: tiny pub/sub + useSyncExternalStore hook.

import { useSyncExternalStore } from "react";
import { getPageSizeMm, parseScaleDen } from "./paper";

export type PageFormat = "A3-quer" | "A4-hoch" | "A4-quer" | "A3-hoch" | "frei";
export type ElementKind =
  | "text"
  | "image"
  | "pdf"
  | "table"
  | "note"
  | "timeline"
  | "cad-view"        // Legacy: Bitmap-Snapshot eines CAD-Blatts (bleibt lesbar).
  | "cad-viewport"    // Stufe 3: echter Live-Viewport auf ein CAD-Sheet.
  | "shape"
  | "line"
  | "guide";


export interface PageElement {
  id: string;
  kind: ElementKind;
  /* Legacy Prozent-Koordinaten (Paper-Space, in % der Seite).
   * Bleiben als Kompatibilitätsschicht erhalten, bis alle UI-Pfade auf mm
   * umgestellt sind. Die kanonische Quelle wird schrittweise `*Mm`. */
  x: number; // % of page
  y: number;
  w: number;
  h: number;
  /** Kanonisch (Stufe 2): Position/Größe in Papier-Millimetern.
   *  Wird beim Laden migriert und bei jeder Änderung aus %/Seitenformat
   *  synchron gehalten. Später (Stufe 8) verschwindet %. */
  xMm?: number;
  yMm?: number;
  wMm?: number;
  hMm?: number;
  // content payloads — only the fields used per kind are read
  text?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  imageUrl?: string;
  /** PDF-Rohdaten als Base64 (für vektorbasiertes Re-Rendering bei kind === "pdf"). */
  pdfSourceB64?: string;
  /** PDF: 0-basierter Seitenindex. */
  pdfPageIndex?: number;
  /** PDF: Seitenverhältnis (Breite/Höhe) für initial korrektes Aspect-Ratio. */
  pdfAspect?: number;
  opacity?: number;
  shadow?: boolean;
  border?: boolean;
  sheetId?: string;
  rotation?: number;
  // line / guide: two endpoints in % of page
  points?: { x: number; y: number }[];
  /** Kanonisch (Stufe 2): Endpunkte in Papier-Millimetern. */
  pointsMm?: { x: number; y: number }[];
  strokeWidth?: number;
  // cad-view (CAD-Viewport auf Papier)
  scale?: string;
  /** Maßstabsnenner (100 für 1:100). Wird künftig anstelle des Strings geführt. */
  scaleDen?: number;
  /** Modell-Mittelpunkt des sichtbaren Ausschnitts, in Metern. */
  modelCenterM?: { x: number; y: number };
  /** Viewport-Rotation gegenüber dem Papier, in Grad. */
  viewportRotationDeg?: number;
  /** Optionale Layer-Sichtbarkeit (reserviert). */
  visibleLayers?: string[];
  lastSyncAt?: string;
  /** cad-view: Eingefrorene Vorschau (DataURL) — Snapshot der CAD-Oberfläche
   *  zum Zeitpunkt des Einfügens bzw. der Aktualisierung. Fallback bis der
   *  Live-Viewport-Renderer greift. */
  viewSnapshot?: string;
  // generic
  nonPrinting?: boolean;
  // layer / group
  groupId?: string;
  layerName?: string;
  /** PDF/Bild: Welche Kanten zeigen unendliche Hilfslinien (Toggle per Klick auf Kante im CAD-Layer). */
  guideEdges?: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  /** PDF/Bild: Kanten-Crop in Metern (positiv = Inhalt am Rand abgeschnitten). */
  cropM?: { top: number; right: number; bottom: number; left: number };

  /** Tabellen-Datenmodell (kind === "table"). */
  tableData?: {
    /** Zeilen × Spalten Raster von Zellinhalten (Rohtext, evtl. Formel "=..."). */
    cells: string[][];
    /** Optional pro Spalte in mm; falls fehlend, gleichmäßig verteilt. */
    colWidths?: number[];
    /** Optional pro Zeile in mm; falls fehlend, Standardhöhe. */
    rowHeights?: number[];
    /** Aktive Filterwerte pro Spaltenindex (nur Zeilen, deren Wert in Liste steht, sichtbar). */
    filters?: Record<number, string[]>;
    /** Erste Zeile ist Kopfzeile (fett, filterbar). */
    headerRow?: boolean;
    /** Rahmenfarbe (CSS-Farbe / hsl-Referenz). */
    borderColor?: string;
    /** Rahmenbreite in px (0 = kein Rahmen). */
    borderWidthPx?: number;
    /** Hintergrundfarbe der Tabelle. */
    background?: string;
    /** Optionale Hintergrundfarbe der Kopfzeile. */
    headerBackground?: string;
  };


}


export type PunchPattern = "none" | "2-fach" | "4-fach" | "6-fach-a5";
export type PunchSide = "left" | "right" | "top" | "bottom";

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
  punchPattern?: PunchPattern;
  punchSide?: PunchSide;
  /**
   * Serialized CAD overlay scene for the page-embedded CAD engine.
   * Holds geometry drawn with the embedded CAD tools (Line, later Text/Hatch).
   * Opaque JSON.
   */
  cadOverlay?: any;
  /** Named groups for the layers panel. */
  groups?: { id: string; name: string; collapsed?: boolean }[];

  /* ---------- Seiten-Verbund (Spreads) ---------- */
  /** Gruppen-ID. Mehrere Pages mit derselben spreadId bilden einen Spread
   *  (Doppelseite / freie Anordnung). Fehlt = Einzelseite. */
  spreadId?: string;
  /** Reihenfolge der Seite innerhalb ihres Spreads (0 = ganz links). */
  spreadIndex?: number;
  /** Layout-Modus des Spreads: "grid" = nebeneinander, "free" = frei positioniert. */
  spreadLayoutMode?: "grid" | "free";
  /** Nur bei "free"-Modus: Offset der Seite in mm, rel. zur ersten Seite des Spreads. */
  spreadOffset?: { xMm: number; yMm: number; rotationDeg?: number };
  /** Bei true wird diese Seite von „Muster übernehmen" übersprungen. */
  spreadExcluded?: boolean;
  /** UI: Spread im Seiten-Panel eingeklappt anzeigen. */
  spreadCollapsed?: boolean;
  /** Nur bei "free"-Modus: Anordnung gesperrt (kein Ziehen, kein Griff sichtbar). */
  spreadLayoutLocked?: boolean;
  /** Freie Papiergröße (nur bei format === "frei"). Werte in mm. */
  customWidthMm?: number;
  customHeightMm?: number;
}


export interface Sheet {
  id: string;
  name: string;
  scale: string; // e.g. "1:100" (Legacy-String; scaleDen ist die neue kanonische Form)
  /** Nennmaßstab als Zahl (100 für 1:100). */
  defaultScaleDen?: number;
  /** Optionales Vorschau-Bild (PNG-DataURL) — wird beim Speichern aus dem
   *  CAD-Editor-Canvas erzeugt und im `cad-view`-Element angezeigt. */
  thumbnail?: string;
}

export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  date?: string; // ISO date YYYY-MM-DD
  time?: string; // HH:MM
  priority?: TaskPriority;
}

export interface CalendarEvent {
  id: string;
  date: string; // ISO
  time?: string;
  title: string;
  location?: string;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

/**
 * Projektmappe: übergeordnete Sammlung innerhalb eines Projekts, die eigene
 * Seiten und eine eigene Konzept-Beschreibung besitzt. Pages leben weiterhin
 * in `project.pages`; die Mappe referenziert sie per ID.
 */
export interface Mappe {
  id: string;
  name: string;
  konzept?: string;
  pageIds: string[];
}

export type FileKind = "folder" | "file";

export interface FileNode {
  id: string;
  kind: FileKind;
  name: string;
  createdAt: string;
  parentId: string | null;
  /** Nur für Dateien: Base64-DataURL (Achtung: localStorage-Limit ~5MB gesamt). */
  dataUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface ProjectSettings {
  /** Position des Zeitstrahls im Übersichts-Tab. Default: "bottom". */
  timelinePosition?: "top" | "bottom";
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
  /** Anzeigename für den Konzept-Abschnitt (default: "Konzept"). */
  konzeptTitle?: string;
  /** Ist der Konzept-Abschnitt aufgeklappt? Default: true. */
  konzeptCollapsed?: boolean;
  customFields?: CustomField[];
  isTemplate?: boolean;
  /** Projektmappen (falls fehlend, wird beim Laden eine "Hauptmappe" erzeugt). */
  mappen?: Mappe[];
  activeMappeId?: string;
  /** Zuordnung zu einem benutzerdefinierten Ordner (siehe ProjectFolder). */
  folderId?: string | null;
  /** Dateien-Reiter (dwg/dxf/pdf/…) — flache Liste mit parentId für Ordnerbaum. */
  files?: FileNode[];
  /** Fotos-Reiter (jpg/png/…). */
  photos?: FileNode[];
  settings?: ProjectSettings;
}

export interface ProjectFolder {
  id: string;
  name: string;
  collapsed?: boolean;
}

export type ProfileStatus = "online" | "offline" | "busy";
export interface UserProfile {
  name: string;
  role: string;
  avatarUrl?: string;
  status: ProfileStatus;
}

export const MAX_PROJECTS = 10;

const STORAGE_KEY = "pixuna.projects.v3";

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
    sheets: [],
    tasks: [
      { id: `${id}-t1`, title: "Bestandsaufnahme prüfen", done: true, date: "2026-06-03", time: "09:00", priority: "medium" },
      { id: `${id}-t2`, title: "Entwurf Variante A fertigstellen", done: true, date: "2026-06-07", time: "14:00", priority: "high" },
      { id: `${id}-t3`, title: "Variante B ausarbeiten", done: false, date: "2026-06-15", time: "10:00", priority: "high" },
      { id: `${id}-t4`, title: "Bauherrengespräch vorbereiten", done: false, date: "2026-06-18", time: "11:30", priority: "medium" },
      { id: `${id}-t5`, title: "Materialkonzept abstimmen", done: false, date: "2026-06-22", time: "15:00", priority: "low" },
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
  folders: ProjectFolder[];
  profile: UserProfile;
}

const DEFAULT_PROFILE: UserProfile = {
  name: "Benutzer",
  role: "PixunaCAD Benutzer",
  status: "online",
};

let state: State = load();
const listeners = new Set<() => void>();

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects) && parsed.projects.length) {
        return {
          projects: parsed.projects.map(migrateProject),
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
          profile: parsed.profile ? { ...DEFAULT_PROFILE, ...parsed.profile } : DEFAULT_PROFILE,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {
    projects: demoProjects().map(migrateProject),
    folders: [],
    profile: DEFAULT_PROFILE,
  };
}

/** Stellt sicher, dass jedes Projekt mindestens eine Mappe + Files/Photos-Arrays hat. */
function migrateProject(p: Project): Project {
  const next: Project = { ...p };
  if (!Array.isArray(next.mappen) || next.mappen.length === 0) {
    const defaultId = `m-${next.id}-main`;
    next.mappen = [{
      id: defaultId,
      name: "Hauptmappe",
      konzept: "",
      pageIds: next.pages.map((pg) => pg.id),
    }];
    next.activeMappeId = defaultId;
  } else if (!next.activeMappeId || !next.mappen.find((m) => m.id === next.activeMappeId)) {
    next.activeMappeId = next.mappen[0].id;
  }
  // Alle noch nicht zugeordneten Seiten kommen in die erste Mappe.
  const assigned = new Set(next.mappen.flatMap((m) => m.pageIds));
  const orphan = next.pages.filter((pg) => !assigned.has(pg.id)).map((pg) => pg.id);
  if (orphan.length) {
    next.mappen = next.mappen.map((m, i) => (i === 0 ? { ...m, pageIds: [...m.pageIds, ...orphan] } : m));
  }
  if (!Array.isArray(next.files)) next.files = [];
  if (!Array.isArray(next.photos)) next.photos = [];
  if (!next.settings) next.settings = { timelinePosition: "bottom" };
  // Stufe 3: Sheet.defaultScaleDen aus Legacy-String ableiten.
  if (Array.isArray(next.sheets)) {
    next.sheets = next.sheets.map((s) => (
      typeof s.defaultScaleDen === "number" && s.defaultScaleDen > 0
        ? s
        : { ...s, defaultScaleDen: parseScaleDen(s.scale) }
    ));
  }
  // Stufe 2: mm-Koordinaten auf jedem Element sicherstellen.
  // Stufe 3: Viewport-Metadaten (scaleDen, modelCenterM, viewportRotationDeg)
  //          auf jedem cad-view/cad-viewport-Element sicherstellen.
  next.pages = next.pages.map((pg) => syncPageElementUnits(migratePageViewports(pg)));
  return next;
}

/** Stufe 3: Legacy `cad-view`-Elemente bekommen die neuen Viewport-Felder
 *  (scaleDen, modelCenterM, viewportRotationDeg) beim Laden befüllt, damit
 *  der Stufe-4-Live-Renderer sie ohne Sonderfälle konsumieren kann. Der Kind
 *  bleibt vorerst `cad-view` (Renderer-Kompat); erst wenn der Live-Renderer
 *  aktiv ist, wird beim ersten Schreiben auf `cad-viewport` umgestellt. */
function migratePageViewports(page: ProjectPage): ProjectPage {
  let changed = false;
  const elements = page.elements.map((el) => {
    if (el.kind !== "cad-view" && el.kind !== "cad-viewport") return el;
    const next: PageElement = { ...el };
    let touched = false;
    if (typeof next.scaleDen !== "number" || !(next.scaleDen > 0)) {
      next.scaleDen = parseScaleDen(el.scale);
      touched = true;
    }
    if (!next.modelCenterM) {
      next.modelCenterM = { x: 0, y: 0 };
      touched = true;
    }
    if (typeof next.viewportRotationDeg !== "number") {
      next.viewportRotationDeg = typeof el.rotation === "number" ? el.rotation : 0;
      touched = true;
    }
    if (touched) changed = true;
    return touched ? next : el;
  });
  return changed ? { ...page, elements } : page;
}


/** Hält Prozent- und Millimeter-Koordinaten der Seitenelemente konsistent.
 *  Regel (Stufe 2, Kompatibilitätsphase):
 *   – Fehlt `*Mm`, wird es aus % + Seitenformat abgeleitet (einmalige Migration).
 *   – Weichen % und mm voneinander ab, gewinnt der zuletzt geschriebene Wert:
 *     Da UI aktuell noch % schreibt, folgen mm dem %-Wert. Wird künftig `xMm`
 *     direkt geschrieben, so aktualisiert diese Funktion ebenfalls das %-Feld
 *     (sofern der Aufrufer `x/y/w/h` nicht selbst neu setzt).
 */
export function syncPageElementUnits(page: ProjectPage): ProjectPage {
  const { wMm: pageW, hMm: pageH } = getPageSizeMm(page);
  if (!(pageW > 0 && pageH > 0)) return page;
  let changed = false;
  const elements = page.elements.map((el) => {
    const next = { ...el } as PageElement;
    let touched = false;
    // Box: % ↔ mm
    const hasPct = typeof el.x === "number" && typeof el.y === "number"
                 && typeof el.w === "number" && typeof el.h === "number";
    const hasMm = typeof el.xMm === "number" && typeof el.yMm === "number"
                && typeof el.wMm === "number" && typeof el.hMm === "number";
    if (hasPct && !hasMm) {
      next.xMm = (el.x / 100) * pageW;
      next.yMm = (el.y / 100) * pageH;
      next.wMm = (el.w / 100) * pageW;
      next.hMm = (el.h / 100) * pageH;
      touched = true;
    } else if (hasPct && hasMm) {
      // Beide vorhanden: erkennen, welche Achse zuletzt geschrieben wurde.
      // Wenn %-Wert mit alter mm-Ableitung übereinstimmt → mm wurde neu geschrieben → % nachziehen.
      // Sonst → % neu → mm nachziehen.
      const pctFromMm = {
        x: (el.xMm! / pageW) * 100,
        y: (el.yMm! / pageH) * 100,
        w: (el.wMm! / pageW) * 100,
        h: (el.hMm! / pageH) * 100,
      };
      const mmFromPct = {
        x: (el.x / 100) * pageW,
        y: (el.y / 100) * pageH,
        w: (el.w / 100) * pageW,
        h: (el.h / 100) * pageH,
      };
      const pctDrift = Math.abs(pctFromMm.x - el.x) + Math.abs(pctFromMm.y - el.y)
                     + Math.abs(pctFromMm.w - el.w) + Math.abs(pctFromMm.h - el.h);
      const mmDrift = Math.abs(mmFromPct.x - el.xMm!) + Math.abs(mmFromPct.y - el.yMm!)
                    + Math.abs(mmFromPct.w - el.wMm!) + Math.abs(mmFromPct.h - el.hMm!);
      if (mmDrift < 1e-3 && pctDrift < 1e-3) {
        // konsistent, nichts zu tun
      } else if (pctDrift < mmDrift) {
        // mm ist neu → % aus mm ableiten
        next.x = pctFromMm.x; next.y = pctFromMm.y; next.w = pctFromMm.w; next.h = pctFromMm.h;
        touched = true;
      } else {
        // % ist neu → mm aus % ableiten
        next.xMm = mmFromPct.x; next.yMm = mmFromPct.y; next.wMm = mmFromPct.w; next.hMm = mmFromPct.h;
        touched = true;
      }
    } else if (!hasPct && hasMm) {
      next.x = (el.xMm! / pageW) * 100;
      next.y = (el.yMm! / pageH) * 100;
      next.w = (el.wMm! / pageW) * 100;
      next.h = (el.hMm! / pageH) * 100;
      touched = true;
    }

    // Points: % ↔ mm (Linien / Guides)
    if (Array.isArray(el.points) && el.points.length && !Array.isArray(el.pointsMm)) {
      next.pointsMm = el.points.map((p) => ({ x: (p.x / 100) * pageW, y: (p.y / 100) * pageH }));
      touched = true;
    } else if (Array.isArray(el.points) && Array.isArray(el.pointsMm)
            && el.points.length === el.pointsMm.length) {
      const derived = el.points.map((p) => ({ x: (p.x / 100) * pageW, y: (p.y / 100) * pageH }));
      const drift = derived.some((p, i) =>
        Math.abs(p.x - el.pointsMm![i].x) > 1e-4 || Math.abs(p.y - el.pointsMm![i].y) > 1e-4);
      if (drift) { next.pointsMm = derived; touched = true; }
    } else if (!Array.isArray(el.points) && Array.isArray(el.pointsMm) && el.pointsMm.length) {
      next.points = el.pointsMm.map((p) => ({ x: (p.x / pageW) * 100, y: (p.y / pageH) * 100 }));
      touched = true;
    }
    if (touched) changed = true;
    return touched ? next : el;
  });
  return changed ? { ...page, elements } : page;
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

/* ---------- Undo / Redo ----------
 * Snapshot-basiert pro Projekt. Vor jedem setState wird pro Projekt-ID der
 * bisherige Projekt-Snapshot gemerkt; falls sich die Referenz danach ändert
 * (echte Mutation), wird der alte Snapshot in die `past`-Liste geschoben. */
type HistoryEntry = { past: Project[]; future: Project[] };
const HIST_LIMIT = 50;
const history: Map<string, HistoryEntry> = new Map();
let _suspendHistory = false;
const historyListeners = new Set<() => void>();
function getHist(id: string): HistoryEntry {
  let h = history.get(id);
  if (!h) { h = { past: [], future: [] }; history.set(id, h); }
  return h;
}
function notifyHistory() { historyListeners.forEach((fn) => fn()); }

function setState(updater: (s: State) => Partial<State>) {
  const prev = state;
  const prevById = new Map(prev.projects.map((p) => [p.id, p] as const));
  state = { ...state, ...updater(state) };
  if (!_suspendHistory) {
    let anyChange = false;
    for (const np of state.projects) {
      const op = prevById.get(np.id);
      if (op && op !== np) {
        const h = getHist(np.id);
        h.past.push(op);
        if (h.past.length > HIST_LIMIT) h.past.shift();
        h.future.length = 0;
        anyChange = true;
      }
    }
    if (anyChange) notifyHistory();
  }
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
    const firstPageId = `${id}-p1`;
    const mappeId = `m-${id}-main`;
    const blank: Project = {
      id,
      name: "Neues Projekt",
      ort: "",
      thumbnail: placeholder("Neues Projekt"),
      updatedAt: new Date().toISOString(),
      pages: [
        { id: firstPageId, title: "01 Titel", format: "A3-quer", margins: 20, background: false, elements: [] },
      ],
      sheets: [],
      tasks: [],
      events: [],
      mappen: [{ id: mappeId, name: "Hauptmappe", konzept: "", pageIds: [firstPageId] }],
      activeMappeId: mappeId,
      files: [],
      photos: [],
      settings: { timelinePosition: "bottom" },
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
    // Sämtliche projektbezogenen Nebenstores mitleeren, damit gelöschte Projekte
    // keinerlei Inhalte zurücklassen (Board-Themen, ausstehende PDF-Uploads …).
    try {
      // Board-/Notiznetz-Daten
      import("./notesStore").then((m) => m.notesStore.deleteProject(id)).catch(() => {});
      // Ausstehende Sheet-PDF-Übernahme
      localStorage.removeItem(`pixuna.pendingSheetPdf.${id}`);
    } catch {}
  },
  duplicateAsTemplate: (id: string) => {
    const src = state.projects.find((p) => p.id === id);
    if (!src) return undefined;
    const newId = `tpl-${Date.now().toString(36)}`;
    const remap: Record<string, string> = {};
    const newPages = src.pages.map((pg) => {
      const nid = `${newId}-${pg.id}`;
      remap[pg.id] = nid;
      return {
        ...pg,
        id: nid,
        elements: pg.elements.map((el) => ({ ...el, id: `${newId}-${el.id}` })),
      };
    });
    const tpl: Project = {
      ...src,
      id: newId,
      name: `${src.name} (Vorlage)`,
      isTemplate: true,
      favorite: false,
      updatedAt: new Date().toISOString(),
      pages: newPages,
      sheets: src.sheets.map((s) => ({ ...s })),
      tasks: src.tasks.map((t) => ({ ...t, id: `${newId}-${t.id}`, done: false })),
      events: src.events.map((e) => ({ ...e, id: `${newId}-${e.id}` })),
      customFields: src.customFields?.map((f) => ({ ...f })),
    };
    setState((s) => ({ projects: [tpl, ...s.projects] }));
    return newId;
  },
  resetTemplate: (id: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          bauherr: "",
          ort: "",
          projektTyp: "",
          status: "",
          erstelltAm: "",
          konzept: "",
          updatedAt: new Date().toISOString(),
          pages: p.pages.map((pg) => ({ ...pg, elements: [], notes: "" })),
          tasks: p.tasks.map((t) => ({ ...t, date: undefined, time: undefined, done: false })),
          events: [],
          customFields: p.customFields?.map((f) => ({ ...f, value: "" })),
        };
      }),
    }));
  },
  addCustomField: (projectId: string, label = "Neues Feld") => {
    const id = `cf-${Date.now().toString(36)}`;
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              customFields: [...(p.customFields ?? []), { id, label, value: "" }],
            }
          : p
      ),
    }));
    return id;
  },
  updateCustomField: (projectId: string, fieldId: string, patch: Partial<CustomField>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              customFields: (p.customFields ?? []).map((f) =>
                f.id === fieldId ? { ...f, ...patch } : f
              ),
            }
          : p
      ),
    }));
  },
  deleteCustomField: (projectId: string, fieldId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, customFields: (p.customFields ?? []).filter((f) => f.id !== fieldId) }
          : p
      ),
    }));
  },
  addPage: (projectId: string, mappeId?: string) => {
    const newId = `${projectId}-p${Date.now().toString(36)}`;
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const n = p.pages.length + 1;
        const num = String(n).padStart(2, "0");
        const targetMappe = mappeId || p.activeMappeId || p.mappen?.[0]?.id;
        const mappen = (p.mappen ?? []).map((m) =>
          m.id === targetMappe ? { ...m, pageIds: [...m.pageIds, newId] } : m
        );
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: [
            ...p.pages,
            {
              id: newId,
              title: `${num} Neue Seite`,
              format: "A3-quer",
              margins: 20,
              background: false,
              elements: [],
            },
          ],
          mappen,
        };
      }),
    }));
    return newId;
  },
  updatePage: (projectId: string, pageId: string, patch: Partial<ProjectPage>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              pages: p.pages.map((pg) =>
                pg.id === pageId ? syncPageElementUnits({ ...pg, ...patch }) : pg
              ),
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
  reorderPage: (projectId: string, fromIndex: number, toIndex: number) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const pages = [...p.pages];
        if (fromIndex < 0 || fromIndex >= pages.length) return p;
        const [moved] = pages.splice(fromIndex, 1);
        const insertAt = Math.max(0, Math.min(pages.length, toIndex));
        pages.splice(insertAt, 0, moved);
        return { ...p, updatedAt: new Date().toISOString(), pages };
      }),
    }));
  },
  duplicatePage: (projectId: string, pageId: string) => {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return undefined;
    const src = project.pages.find((pg) => pg.id === pageId);
    if (!src) return undefined;
    const newId = `${projectId}-p${Date.now().toString(36)}`;
    const stripNum = src.title.replace(/^\d+\s*/, "");
    const copy: ProjectPage = {
      ...src,
      id: newId,
      title: `${stripNum} (Kopie)`,
      elements: src.elements.map((e) => ({ ...e, id: `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` })),
      groups: src.groups?.map((g) => ({ ...g })),
    };
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const idx = p.pages.findIndex((pg) => pg.id === pageId);
        const pages = [...p.pages];
        pages.splice(idx + 1, 0, copy);
        return { ...p, updatedAt: new Date().toISOString(), pages };
      }),
    }));
    return newId;
  },

  // ---------- Spreads (Seiten-Verbund) ----------
  /** Zwei oder mehr benachbarte Pages zu einem neuen Spread verbinden. */
  linkPagesToSpread: (projectId: string, pageIds: string[]) => {
    if (pageIds.length < 2) return;
    const spreadId = `sp-${Date.now().toString(36)}`;
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        // Alle bereits vorhandenen Zuordnungen für diese Pages neu setzen.
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: p.pages.map((pg) => {
            const idx = pageIds.indexOf(pg.id);
            if (idx < 0) return pg;
            return {
              ...pg,
              spreadId,
              spreadIndex: idx,
              spreadLayoutMode: pg.spreadLayoutMode ?? "grid",
              spreadExcluded: false,
              spreadCollapsed: false,
            };
          }),
        };
      }),
    }));
  },
  /** Eine Page an einen bestehenden Spread anhängen (ans Ende). */
  addPageToSpread: (projectId: string, spreadId: string, pageId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const members = p.pages.filter((pg) => pg.spreadId === spreadId);
        const nextIndex = members.length;
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: p.pages.map((pg) =>
            pg.id === pageId
              ? { ...pg, spreadId, spreadIndex: nextIndex, spreadLayoutMode: pg.spreadLayoutMode ?? "grid" }
              : pg
          ),
        };
      }),
    }));
  },
  /** Page aus ihrem Spread entfernen (wird wieder Einzelseite). */
  removePageFromSpread: (projectId: string, pageId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const target = p.pages.find((pg) => pg.id === pageId);
        const spreadId = target?.spreadId;
        if (!spreadId) return p;
        // Zielseite lösen und übrige Members neu indexieren.
        const others = p.pages
          .filter((pg) => pg.spreadId === spreadId && pg.id !== pageId)
          .sort((a, b) => (a.spreadIndex ?? 0) - (b.spreadIndex ?? 0));
        const indexMap = new Map<string, number>();
        others.forEach((pg, i) => indexMap.set(pg.id, i));
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: p.pages.map((pg) => {
            if (pg.id === pageId) {
              const { spreadId: _s, spreadIndex: _i, spreadOffset: _o, spreadCollapsed: _c, ...rest } = pg;
              return { ...rest };
            }
            if (indexMap.has(pg.id)) return { ...pg, spreadIndex: indexMap.get(pg.id)! };
            return pg;
          }),
        };
      }),
    }));
  },
  setSpreadLayoutMode: (projectId: string, spreadId: string, mode: "grid" | "free") => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id !== projectId ? p : {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: p.pages.map((pg) => (pg.spreadId === spreadId ? { ...pg, spreadLayoutMode: mode } : pg)),
        }
      ),
    }));
  },
  setSpreadCollapsed: (projectId: string, spreadId: string, collapsed: boolean) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id !== projectId ? p : {
          ...p,
          pages: p.pages.map((pg) => (pg.spreadId === spreadId ? { ...pg, spreadCollapsed: collapsed } : pg)),
        }
      ),
    }));
  },
  setSpreadLayoutLocked: (projectId: string, spreadId: string, locked: boolean) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id !== projectId ? p : {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: p.pages.map((pg) => (pg.spreadId === spreadId ? { ...pg, spreadLayoutLocked: locked } : pg)),
        }
      ),
    }));
  },
  setSpreadOffset: (
    projectId: string,
    pageId: string,
    offset: { xMm: number; yMm: number; rotationDeg?: number }
  ) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id !== projectId ? p : {
          ...p,
          updatedAt: new Date().toISOString(),
          pages: p.pages.map((pg) => (pg.id === pageId ? { ...pg, spreadOffset: offset } : pg)),
        }
      ),
    }));
  },
  /** Musterlänge des Spreads (N Seiten) auf alle weiteren Pages ohne spreadId
   *  fortlaufend anwenden — überspringt spreadExcluded. */
  applySpreadPatternToRest: (projectId: string, spreadId: string): number => {
    let count = 0;
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const src = p.pages.filter((pg) => pg.spreadId === spreadId);
        const N = src.length;
        if (N < 2) return p;
        const layoutMode = src[0]?.spreadLayoutMode ?? "grid";
        const firstIdx = p.pages.findIndex((pg) => pg.spreadId === spreadId);
        const lastIdx = firstIdx + N - 1;
        const rest = p.pages.slice(lastIdx + 1);
        // Neue Spread-IDs pro Chunk.
        const patched = [...p.pages];
        let i = 0;
        while (i + N <= rest.length) {
          const chunk = rest.slice(i, i + N);
          if (chunk.some((pg) => pg.spreadId || pg.spreadExcluded)) { i += 1; continue; }
          const newSid = `sp-${Date.now().toString(36)}-${count}`;
          chunk.forEach((pg, k) => {
            const globalIdx = lastIdx + 1 + i + k;
            patched[globalIdx] = {
              ...patched[globalIdx],
              spreadId: newSid,
              spreadIndex: k,
              spreadLayoutMode: layoutMode,
            };
          });
          count += 1;
          i += N;
        }
        return { ...p, updatedAt: new Date().toISOString(), pages: patched };
      }),
    }));
    return count;
  },

  reorderElement: (projectId: string, pageId: string, fromIndex: number, toIndex: number) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              pages: p.pages.map((pg) => {
                if (pg.id !== pageId) return pg;
                const els = [...pg.elements];
                if (fromIndex < 0 || fromIndex >= els.length) return pg;
                const [moved] = els.splice(fromIndex, 1);
                els.splice(Math.max(0, Math.min(els.length, toIndex)), 0, moved);
                return { ...pg, elements: els };
              }),
            }
          : p
      ),
    }));
  },
  groupElements: (projectId: string, pageId: string, elementIds: string[], name = "Gruppe") => {
    if (!elementIds.length) return undefined;
    const groupId = `g-${Date.now().toString(36)}`;
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
                      groups: [...(pg.groups ?? []), { id: groupId, name }],
                      elements: pg.elements.map((e) =>
                        elementIds.includes(e.id) ? { ...e, groupId } : e
                      ),
                    }
                  : pg
              ),
            }
          : p
      ),
    }));
    return groupId;
  },
  renameGroup: (projectId: string, pageId: string, groupId: string, name: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              pages: p.pages.map((pg) =>
                pg.id === pageId
                  ? { ...pg, groups: (pg.groups ?? []).map((g) => (g.id === groupId ? { ...g, name } : g)) }
                  : pg
              ),
            }
          : p
      ),
    }));
  },
  ungroup: (projectId: string, pageId: string, groupId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              pages: p.pages.map((pg) =>
                pg.id === pageId
                  ? {
                      ...pg,
                      groups: (pg.groups ?? []).filter((g) => g.id !== groupId),
                      elements: pg.elements.map((e) =>
                        e.groupId === groupId ? { ...e, groupId: undefined } : e
                      ),
                    }
                  : pg
              ),
            }
          : p
      ),
    }));
  },
  renameLayer: (projectId: string, pageId: string, elementId: string, layerName: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              pages: p.pages.map((pg) =>
                pg.id === pageId
                  ? {
                      ...pg,
                      elements: pg.elements.map((e) =>
                        e.id === elementId ? { ...e, layerName } : e
                      ),
                    }
                  : pg
              ),
            }
          : p
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
                pg.id === pageId
                  ? syncPageElementUnits({ ...pg, elements: [...pg.elements, { ...el, id }] })
                  : pg
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
                  ? syncPageElementUnits({
                      ...pg,
                      elements: pg.elements.map((e) =>
                        e.id === elementId ? { ...e, ...patch } : e
                      ),
                    })
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
  addTask: (projectId: string, task: Omit<Task, "id" | "done"> & { done?: boolean }) => {
    const id = `t-${Date.now().toString(36)}`;
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              tasks: [
                ...p.tasks,
                { done: false, ...task, id },
              ],
            }
          : p
      ),
    }));
    return id;
  },
  updateTask: (projectId: string, taskId: string, patch: Partial<Task>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
          : p
      ),
    }));
  },
  deleteTask: (projectId: string, taskId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) } : p
      ),
    }));
  },

  // ---------- Mappen ----------
  addMappe: (projectId: string, name = "Neue Mappe") => {
    const id = `m-${Date.now().toString(36)}`;
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              mappen: [...(p.mappen ?? []), { id, name, konzept: "", pageIds: [] }],
              activeMappeId: id,
            }
          : p
      ),
    }));
    return id;
  },
  renameMappe: (projectId: string, mappeId: string, name: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              mappen: (p.mappen ?? []).map((m) => (m.id === mappeId ? { ...m, name } : m)),
            }
          : p
      ),
    }));
  },
  updateMappeKonzept: (projectId: string, mappeId: string, konzept: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              updatedAt: new Date().toISOString(),
              mappen: (p.mappen ?? []).map((m) => (m.id === mappeId ? { ...m, konzept } : m)),
            }
          : p
      ),
    }));
  },
  deleteMappe: (projectId: string, mappeId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const mappen = p.mappen ?? [];
        if (mappen.length <= 1) return p; // mindestens eine Mappe muss bleiben
        const target = mappen.find((m) => m.id === mappeId);
        if (!target) return p;
        const rest = mappen.filter((m) => m.id !== mappeId);
        // Verwaiste Seiten in die erste verbleibende Mappe verschieben.
        rest[0] = { ...rest[0], pageIds: [...rest[0].pageIds, ...target.pageIds] };
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          mappen: rest,
          activeMappeId: p.activeMappeId === mappeId ? rest[0].id : p.activeMappeId,
        };
      }),
    }));
  },
  reorderMappe: (projectId: string, mappeId: string, direction: -1 | 1) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const mappen = [...(p.mappen ?? [])];
        const idx = mappen.findIndex((m) => m.id === mappeId);
        if (idx < 0) return p;
        const target = idx + direction;
        if (target < 0 || target >= mappen.length) return p;
        [mappen[idx], mappen[target]] = [mappen[target], mappen[idx]];
        return { ...p, mappen, updatedAt: new Date().toISOString() };
      }),
    }));
  },
  moveMappeToIndex: (projectId: string, mappeId: string, toIndex: number) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const mappen = [...(p.mappen ?? [])];
        const from = mappen.findIndex((m) => m.id === mappeId);
        if (from < 0) return p;
        const clamped = Math.max(0, Math.min(mappen.length - 1, toIndex));
        if (clamped === from) return p;
        const [item] = mappen.splice(from, 1);
        mappen.splice(clamped, 0, item);
        return { ...p, mappen, updatedAt: new Date().toISOString() };
      }),
    }));
  },
  setActiveMappe: (projectId: string, mappeId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, activeMappeId: mappeId } : p)),
    }));
  },
  updateProjectSettings: (projectId: string, patch: Partial<ProjectSettings>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, settings: { ...(p.settings ?? {}), ...patch } } : p
      ),
    }));
  },

  // ---------- Dateien & Fotos ----------
  addFolder: (projectId: string, kind: "files" | "photos", parentId: string | null, name = "Neuer Ordner") => {
    const id = `n-${Date.now().toString(36)}`;
    const node: FileNode = { id, kind: "folder", name, createdAt: new Date().toISOString(), parentId };
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, [kind]: [...(p[kind] ?? []), node] } as Project : p
      ),
    }));
    return id;
  },
  addFile: (
    projectId: string,
    kind: "files" | "photos",
    parentId: string | null,
    file: { name: string; dataUrl: string; mimeType: string; sizeBytes: number }
  ) => {
    const id = `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const node: FileNode = {
      id,
      kind: "file",
      name: file.name,
      createdAt: new Date().toISOString(),
      parentId,
      dataUrl: file.dataUrl,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
    };
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? ({ ...p, [kind]: [...(p[kind] ?? []), node] } as Project) : p
      ),
    }));
    return id;
  },
  renameNode: (projectId: string, kind: "files" | "photos", nodeId: string, name: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? ({
              ...p,
              [kind]: (p[kind] ?? []).map((n) => (n.id === nodeId ? { ...n, name } : n)),
            } as Project)
          : p
      ),
    }));
  },
  deleteNode: (projectId: string, kind: "files" | "photos", nodeId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const arr = p[kind] ?? [];
        // Auch alle Nachfahren löschen.
        const toDelete = new Set<string>([nodeId]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const n of arr) {
            if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
              toDelete.add(n.id);
              changed = true;
            }
          }
        }
        return { ...p, [kind]: arr.filter((n) => !toDelete.has(n.id)) } as Project;
      }),
    }));
  },
  /* ---------- Undo / Redo (public API) ---------- */
  canUndo: (projectId: string) => (history.get(projectId)?.past.length ?? 0) > 0,
  canRedo: (projectId: string) => (history.get(projectId)?.future.length ?? 0) > 0,
  subscribeHistory: (fn: () => void) => {
    historyListeners.add(fn);
    return () => historyListeners.delete(fn);
  },
  undo: (projectId: string) => {
    const h = getHist(projectId);
    if (!h.past.length) return;
    const cur = state.projects.find((p) => p.id === projectId);
    if (!cur) return;
    const prev = h.past.pop()!;
    h.future.push(cur);
    _suspendHistory = true;
    try {
      state = { ...state, projects: state.projects.map((p) => (p.id === projectId ? prev : p)) };
    } finally {
      _suspendHistory = false;
    }
    notifyHistory();
    emit();
  },
  redo: (projectId: string) => {
    const h = getHist(projectId);
    if (!h.future.length) return;
    const cur = state.projects.find((p) => p.id === projectId);
    if (!cur) return;
    const next = h.future.pop()!;
    h.past.push(cur);
    _suspendHistory = true;
    try {
      state = { ...state, projects: state.projects.map((p) => (p.id === projectId ? next : p)) };
    } finally {
      _suspendHistory = false;
    }
    notifyHistory();
    emit();
  },

  /* ---------- Projekt-Ordner (Sidebar) ---------- */
  addProjectFolder: (name: string) => {
    const id = `f-${Date.now().toString(36)}`;
    setState((s) => ({ folders: [...s.folders, { id, name: name.trim() || "Neuer Ordner" }] }));
    return id;
  },
  renameProjectFolder: (id: string, name: string) => {
    setState((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)),
    }));
  },
  deleteProjectFolder: (id: string) => {
    setState((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      projects: s.projects.map((p) => (p.folderId === id ? { ...p, folderId: null } : p)),
    }));
  },
  toggleProjectFolderCollapsed: (id: string) => {
    setState((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, collapsed: !f.collapsed } : f)),
    }));
  },
  moveProjectToFolder: (projectId: string, folderId: string | null) => {
    setState((s) => ({
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, folderId } : p)),
    }));
  },

  /* ---------- Profile ---------- */
  updateProfile: (patch: Partial<UserProfile>) => {
    setState((s) => ({ profile: { ...s.profile, ...patch } }));
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

/** Reactive Undo/Redo Flags für eine Projekt-ID. */
const _histSnapCache = new Map<string, { canUndo: boolean; canRedo: boolean }>();
function _histSnap(id: string | undefined) {
  if (!id) return { canUndo: false, canRedo: false };
  const cu = projectStore.canUndo(id);
  const cr = projectStore.canRedo(id);
  const prev = _histSnapCache.get(id);
  if (prev && prev.canUndo === cu && prev.canRedo === cr) return prev;
  const next = { canUndo: cu, canRedo: cr };
  _histSnapCache.set(id, next);
  return next;
}
export function useProjectHistory(id: string | undefined): { canUndo: boolean; canRedo: boolean } {
  return useSyncExternalStore(
    (fn) => projectStore.subscribeHistory(fn),
    () => _histSnap(id),
    () => ({ canUndo: false, canRedo: false }),
  );
}

export function useFolders(): ProjectFolder[] {
  return useSyncExternalStore(
    projectStore.subscribe,
    () => projectStore.getState().folders,
    () => projectStore.getState().folders,
  );
}

export function useProfile(): UserProfile {
  return useSyncExternalStore(
    projectStore.subscribe,
    () => projectStore.getState().profile,
    () => projectStore.getState().profile,
  );
}



