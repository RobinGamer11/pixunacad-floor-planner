// Lightweight client-side project store backed by localStorage.
// Holds the projects shown on the start page and in the project workspaces.
// Intentionally framework-free: tiny pub/sub + useSyncExternalStore hook.

import { useSyncExternalStore } from "react";
import { parseScaleDen } from "./paper";
import { stripLegacyMappe } from "./legacyMappeMigration";
import { migrateProjectState, stampVersion, PROJECT_STATE_KIND } from "./persistence";

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
  /** Legacy-Feld (historisch als px gerendert) — kanonisch ist `fontSizePt`. */
  fontSize?: number;
  /** Schriftgröße in typografischen Punkten (1 pt = 25,4/72 mm). */
  fontSizePt?: number;

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
  /** Papier-Ausschnittsgröße (mm) beim Platzieren — Referenz für automatische
   *  Rahmenberechnung nach Maßstabs­änderungen. */
  basePaperMm?: { w: number; h: number };
  /** Maßstabsnenner zum Zeitpunkt der Platzierung — zusammen mit basePaperMm
   *  Grundlage für Recompute des Rahmens. */
  baseScaleDen?: number;
  /** Optionale Layer-Sichtbarkeit (reserviert). */
  visibleLayers?: string[];
  lastSyncAt?: string;
  /** cad-view: Eingefrorene Vorschau (DataURL) — Snapshot der CAD-Oberfläche
   *  zum Zeitpunkt des Einfügens bzw. der Aktualisierung. Fallback bis der
   *  Live-Viewport-Renderer greift. */
  viewSnapshot?: string;
  /** cad-view: Objektart. true = Pixel (eingebranntes Bild), false/undef = Vektor (live). */
  pixelMode?: boolean;
  /** cad-view: Automatische Aktualisierung dieses Objekts (Default: true). */
  autoUpdate?: boolean;
  // generic
  nonPrinting?: boolean;
  // layer / group
  groupId?: string;
  layerName?: string;
  /** Bezeichnungs-ID des Engine-`LabelManager` (identisch zu CAD-Oberfläche).
   *  Wird für cad-viewport-Elemente in der Projektmappe verwendet, um die
   *  Sichtbarkeit/Anzeige über das gemeinsame Bezeichnungs-ID-Panel zu steuern. */
  labelId?: string;
  /** PDF/Bild: Welche Kanten zeigen unendliche Hilfslinien (Toggle per Klick auf Kante im CAD-Layer). */
  guideEdges?: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  /** PDF/Bild: Kanten-Crop in Metern (positiv = Inhalt am Rand abgeschnitten). */
  cropM?: { top: number; right: number; bottom: number; left: number };
  /** Photoshop-artige Ecken-Verzerrung für PDF/JPG/PNG.
   *  Vier Punkte in Fraktionen 0..1, Reihenfolge TL, TR, BR, BL.
   *  Fehlt = keine Verzerrung (Identität). */
  warpCorners?: { x: number; y: number }[];
  /** Verzerr-Achse: `'free'` = beide Achsen frei, `'x'` = nur horizontal
   *  (dx wirkt, dy = 0), `'y'` = nur vertikal. Default `'free'`. */
  warpAxis?: "free" | "x" | "y";
  /** Radiergummi-Spuren auf dem Element (CAD-Blatt/Bild/PDF).
   *  x/y/r in Element-lokalen Papier-Millimetern, s = Weichheit 0..1. */
  eraseCircles?: { x: number; y: number; r: number; s: number; a?: number }[];


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

export interface Sheet {
  id: string;
  name: string;
  scale: string; // e.g. "1:100" (Legacy-String; scaleDen ist die neue kanonische Form)
  /** Nennmaßstab als Zahl (100 für 1:100). */
  defaultScaleDen?: number;
  /** Optionales Vorschau-Bild (PNG-DataURL) — wird nur für Listen-Miniaturen
   *  in Panels/Dropdowns verwendet. Der Projektmappe-Viewport rendert die
   *  Szene stattdessen live aus `sceneJson`, damit der Maßstab exakt bleibt. */
  thumbnail?: string;
  /** Live-Referenz: serialisierte Vektor-Szene dieses Blatts (JSON-String,
   *  Format `CadApp._serializeOneScene`). Wird bei jedem CAD-Persist mit
   *  geschrieben und vom `cad-viewport`-Element in Papier-mm-Genauigkeit
   *  gerendert — niemals als Bitmap skaliert. */
  sceneJson?: string;
  /** Label-/Layer-Definitionen der CAD-Zeichnung (JSON-String). Wird zusammen
   *  mit `sceneJson` gespeichert, damit der Live-Viewport die Sichtbarkeits-
   *  und Reihenfolge-Regeln 1:1 abbilden kann. */
  labelsJson?: string;
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
  /** Projektbezogene Schnellhilfe in CAD, Export und Board. Fehlend bedeutet initial aktiv. */
  helpOn?: boolean;
  /** Zielauflösung für neu erzeugte Pixelobjekte. */
  pixelRenderDpi?: number;
  /** Optionales zusätzliches Supersampling vor dem PNG-Zuschnitt. */
  pixelSupersampling?: boolean;
  pixelSupersamplingFactor?: 2 | 4;
}

export interface Project {
  id: string;
  name: string;
  ort: string;
  thumbnail: string;
  bauherr?: string;
  projektTyp?: string;
  status?: string;
  /** Anzeigetext des Erstellungsdatums (Altbestand). */
  erstelltAm?: string;
  /** Festes Erstellungsdatum (ISO) – nicht manuell veränderbar. */
  createdAtIso?: string;
  /* Projektadresse in Einzelfeldern; `ort` bleibt die zusammengesetzte Adresse. */
  adrStrasse?: string;
  adrHausnummer?: string;
  adrPlz?: string;
  adrOrt?: string;
  adrLand?: string;
  /** Projektzeitraum (ISO "YYYY-MM-DD"), beide Angaben optional. */
  projektStart?: string;
  projektEnde?: string;
  updatedAt: string;
  favorite?: boolean;
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
  /** Zuordnung zu einem benutzerdefinierten Ordner (siehe ProjectFolder). */
  folderId?: string | null;
  /** Manuelle Sortierposition in der Sidebar (klein = weiter oben). */
  sortIndex?: number;
  /** Zeitpunkt der Verschiebung in den Papierkorb (30 Tage Aufbewahrung). */
  deletedAt?: string;
  /** Gemeinsame Dokumentenablage — flache Liste mit parentId für den Ordnerbaum. */
  files?: FileNode[];
  /** @deprecated Legacy-Fotoablage; wird beim Laden verlustfrei nach `files` migriert. */
  photos?: FileNode[];
  settings?: ProjectSettings;
}

export interface ProjectFolder {
  id: string;
  name: string;
  collapsed?: boolean;
  /** Manuelle Sortierposition der Ordner. */
  sortIndex?: number;
}

export type ProfileStatus = "online" | "away" | "busy" | "offline";
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

/** Neue Konten starten bewusst ohne Beispielprojekte. */
function demoProjects(): Project[] {
  return [];
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
      // Zentrale Schema-Migration des gesamten Persistenzstandes.
      const parsed = migrateProjectState(JSON.parse(raw));
      // Auch eine bewusst leere Projektliste bleibt nach dem Neuladen leer.
      if (parsed && Array.isArray(parsed.projects)) {
        const cutoff = Date.now() - 30 * 86400000;
        return {
          projects: parsed.projects
            .filter((p: Project) => !p.deletedAt || new Date(p.deletedAt).getTime() > cutoff)
            .map(migrateProject),
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

function mergeLegacyPhotoNodes(files: FileNode[], photos: FileNode[]): FileNode[] {
  if (photos.length === 0) return files;

  const usedIds = new Set(files.map((node) => node.id));
  const migratedIds = new Map<string, string>();
  const nextPhotoIds: string[] = [];

  for (const node of photos) {
    let nextId = node.id;
    if (usedIds.has(nextId)) {
      const base = `legacy-photo-${nextId}`;
      nextId = base;
      let suffix = 2;
      while (usedIds.has(nextId)) {
        nextId = `${base}-${suffix}`;
        suffix += 1;
      }
    }
    if (!migratedIds.has(node.id)) migratedIds.set(node.id, nextId);
    nextPhotoIds.push(nextId);
    usedIds.add(nextId);
  }

  const migratedPhotos = photos.map((node, index) => ({
    ...node,
    id: nextPhotoIds[index],
    parentId: node.parentId ? (migratedIds.get(node.parentId) ?? null) : null,
  }));

  return [...files, ...migratedPhotos];
}

/** Stellt sicher, dass jedes Projekt eine Dokumentenablage hat und entfernt Altdaten der früheren Projektmappe. */
function migrateProject(p: Project): Project {
  const next: Project = stripLegacyMappe(p);
  const files = Array.isArray(next.files) ? next.files : [];
  const legacyPhotos = Array.isArray(next.photos) ? next.photos : [];
  next.files = mergeLegacyPhotoNodes(files, legacyPhotos);
  next.photos = [];
  if (!next.settings) next.settings = { timelinePosition: "bottom" };
  if (!Array.isArray(next.sheets)) next.sheets = [];
  if (!Array.isArray(next.tasks)) next.tasks = [];
  if (!Array.isArray(next.events)) next.events = [];
  // Stufe 3: Sheet.defaultScaleDen aus Legacy-String ableiten.
  next.sheets = next.sheets.map((s) => (
    typeof s.defaultScaleDen === "number" && s.defaultScaleDen > 0
      ? s
      : { ...s, defaultScaleDen: parseScaleDen(s.scale) }
  ));
  return next;
}



function persistState(candidate: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stampVersion(PROJECT_STATE_KIND, { ...candidate })));
    return true;
  } catch {
    return false;
  }
}

function persist() {
  persistState(state);
}

function emit(shouldPersist = true) {
  if (shouldPersist) persist();
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
/** Hört auf Undo/Redo-Wiederherstellungen (für eingebettete Engines). */
const restoreListeners = new Set<() => void>();
function notifyRestore() { restoreListeners.forEach((fn) => fn()); }
/** Vergleicht zwei Projekt-Snapshots inhaltlich – `updatedAt` wird ignoriert,
 *  damit reine Zeitstempel-Änderungen keinen Undo-Schritt erzeugen. */
function sameProjectContent(a: Project, b: Project): boolean {
  try {
    const strip = (p: Project) => JSON.stringify({ ...p, updatedAt: "" });
    return strip(a) === strip(b);
  } catch {
    return false;
  }
}

/** Zusammenhängende Änderungen (z. B. Drag-Frames einer Geste) werden zu genau
 *  einem Undo-Schritt gebündelt. Gebündelt wird nur, solange *dieselbe* Signatur
 *  geändert wird UND die Geste nicht via `sealHistory()` (Pointer-Up, Enter,
 *  Abbruch, Werkzeugwechsel) abgeschlossen wurde. Dadurch bekommt jede einzelne
 *  Aktion (Text, Trim, Move/Rotate, Zeichnen, Löschen) genau einen Schritt —
 *  auch wenn sie länger als ein Zeitfenster dauert. */
const HIST_COALESCE_MS = 4000;
const lastPushAt: Map<string, number> = new Map();
const lastSig: Map<string, string> = new Map();


/** Grobe Signatur der geänderten Projektfelder. */
function changeSignature(a: Project, b: Project): string {
  try {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const parts: string[] = [];
    for (const k of keys) {
      if (k === "updatedAt") continue;
      const av = (a as any)[k], bv = (b as any)[k];
      if (av !== bv && JSON.stringify(av) !== JSON.stringify(bv)) parts.push(k);
    }
    return parts.length ? parts.sort().join("|") : "other";
  } catch {
    return "other";
  }
}

/* ---------- Schreibschutz (gemeinsamer Projektzugriff) ----------
 * Zentrale Sperre für Projekte, an denen der angemeldete Benutzer kein
 * Schreibrecht hat (z. B. Rolle „Betrachter" oder entzogene Mitgliedschaft).
 * Weil sämtliche Mutationen – auch Tastenkürzel, Einfügen, Löschen und
 * Import – durch `setState` laufen, greift der Schutz an genau einer Stelle.
 * Serverseitig gilt dieselbe Regel zusätzlich per RLS. */
let _writeGuard: ((projectId: string) => boolean) | null = null;
let _systemWrite = false;
/** Meldet lokale Papierkorb-Aktionen an die cloudweite Papierkorb-Synchronisierung. */
let _trashHook: ((op: "delete" | "restore" | "purge", projectId: string) => void) | null = null;
function systemWrite(fn: () => void) {
  _systemWrite = true;
  const prevSuspend = _suspendHistory;
  _suspendHistory = true;
  try { fn(); } finally { _suspendHistory = prevSuspend; _systemWrite = false; }
}
const writeBlockListeners = new Set<(projectId: string) => void>();

function canWriteProject(id: string): boolean {
  if (_systemWrite) return true;
  if (!_writeGuard) return true;
  try {
    return _writeGuard(id);
  } catch {
    return true;
  }
}

function setState(updater: (s: State) => Partial<State>, alreadyPersisted = false) {
  const prev = state;
  const prevById = new Map(prev.projects.map((p) => [p.id, p] as const));
  state = { ...state, ...updater(state) };
  if (_writeGuard) {
    let blocked: string | null = null;
    const guarded = state.projects.map((np) => {
      const op = prevById.get(np.id);
      if (!op || op === np) return np;
      if (canWriteProject(np.id)) return np;
      blocked = np.id;
      return op;
    });
    // Auch das Anlegen/Entfernen gesperrter Projekte wird zurückgenommen.
    const removed = prev.projects.filter(
      (op) => !state.projects.some((np) => np.id === op.id) && !canWriteProject(op.id),
    );
    if (blocked || removed.length) {
      state = { ...state, projects: removed.length ? [...guarded, ...removed] : guarded };
      const id = blocked ?? removed[0]?.id ?? "";
      writeBlockListeners.forEach((fn) => fn(id));
    }
  }
  if (!_suspendHistory) {
    let anyChange = false;
    const now = Date.now();
    for (const np of state.projects) {
      const op = prevById.get(np.id);
      if (op && op !== np) {
        if (sameProjectContent(op, np)) continue;
        const h = getHist(np.id);
        const last = lastPushAt.get(np.id) ?? 0;
        const sig = changeSignature(op, np);
        // Nur identische Folge-Änderungen (Drag-Frames) werden gebündelt.
        if (h.past.length && now - last < HIST_COALESCE_MS && lastSig.get(np.id) === sig) {
          lastPushAt.set(np.id, now);
          h.future.length = 0;
          anyChange = true;
          continue;
        }
        h.past.push(op);
        lastPushAt.set(np.id, now);
        lastSig.set(np.id, sig);
        if (h.past.length > HIST_LIMIT) h.past.shift();
        h.future.length = 0;
        anyChange = true;
      }
    }
    if (anyChange) notifyHistory();
  }
  emit(!alreadyPersisted);
}

/**
 * Dokumente liegen als Data-URLs im Browser-Speicher. Deshalb wird eine
 * Dokumentmutation zuerst vollständig persistiert und erst danach für UI,
 * Verlauf und Cloud-Snapshot übernommen. Bei ausgeschöpftem Speicher bleibt
 * der sichtbare Zustand so identisch mit dem dauerhaft gespeicherten Zustand.
 */
function commitDocumentProjects(projects: Project[]) {
  const candidate = { ...state, projects };
  if (!persistState(candidate)) return false;
  setState(() => ({ projects }), true);
  return true;
}

/** Persistiert reine Projekt-UI-Einstellungen ohne fachlichen Undo-Schritt. */
function commitProjectUiProjects(projects: Project[]) {
  const candidate = { ...state, projects };
  if (!persistState(candidate)) return false;
  _suspendHistory = true;
  try {
    setState(() => ({ projects }), true);
  } finally {
    _suspendHistory = false;
  }
  return true;
}


export const projectStore = {
  getState: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /**
   * Registriert den zentralen Schreibschutz. `guard(projectId)` liefert
   * `false`, wenn der aktuelle Benutzer dieses Projekt nicht ändern darf –
   * jede Mutation daran wird dann verworfen (Server prüft zusätzlich).
   */
  setWriteGuard: (guard: ((projectId: string) => boolean) | null) => {
    _writeGuard = guard;
  },
  canWrite: (projectId: string) => canWriteProject(projectId),
  /** Meldet blockierte Schreibversuche (für Hinweise in der Oberfläche). */
  onWriteBlocked: (fn: (projectId: string) => void) => {
    writeBlockListeners.add(fn);
    return () => { writeBlockListeners.delete(fn); };
  },
  /**
   * Übernahme von Daten aus der gemeinsamen Datenbasis (kein Benutzer-Edit):
   * umgeht den Schreibschutz bewusst und erzeugt keinen Undo-Schritt.
   */
  applySharedProject: (incoming: Project) => {
    _systemWrite = true;
    const prevSuspend = _suspendHistory;
    _suspendHistory = true;
    try {
      setState((s) => {
        const exists = s.projects.some((p) => p.id === incoming.id);
        return {
          projects: exists
            ? s.projects.map((p) => {
                if (p.id !== incoming.id) return p;
                const next = migrateProject(incoming);
                // Papierkorbstatus nie durch einen Cloud-Stand aufheben –
                // nur applyCloudTrash(id, null) nach bewusster Wiederherstellung.
                return p.deletedAt ? { ...next, deletedAt: p.deletedAt } : next;
              })
            : [migrateProject(incoming), ...s.projects],
        };
      });
    } finally {
      _suspendHistory = prevSuspend;
      _systemWrite = false;
    }
  },
  /**
   * Leerer lokaler Platzhalter für ein Projekt, das nur in der Cloud existiert
   * (z. B. auf einem anderen Gerät angelegt). Inhalte kommen beim Öffnen
   * objektweise aus der Cloud; der Platzhalter überschreibt sie nie, weil er
   * keine Inhaltsobjekte enthält.
   */
  ensureCloudStub: (id: string, name: string) => {
    if (state.projects.some((p) => p.id === id)) return;
    const stub: Project = {
      id,
      name: name || "Projekt",
      ort: "",
      thumbnail: placeholder(name || "Projekt"),
      createdAtIso: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sheets: [],
      tasks: [],
      events: [],
      files: [],
      settings: { timelinePosition: "bottom", helpOn: true },
    };
    _systemWrite = true;
    const prevSuspend = _suspendHistory;
    _suspendHistory = true;
    try {
      setState((s) => ({ projects: [...s.projects, { ...migrateProject(stub), sortIndex: nextTopIndex(s.projects, null) }] }));
    } finally {
      _suspendHistory = prevSuspend;
      _systemWrite = false;
    }
  },
  createProject: () => {
    const id = `p-${Date.now().toString(36)}`;
    const blank: Project = {
      id,
      name: "Neues Projekt",
      ort: "",
      thumbnail: placeholder("Neues Projekt"),
      createdAtIso: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sheets: [],
      tasks: [],
      events: [],
      files: [],
      settings: { timelinePosition: "bottom", helpOn: true },
    };
    setState((s) => ({ projects: [{ ...blank, sortIndex: nextTopIndex(s.projects, null) }, ...s.projects] }));
    return id;
  },
  updateProject: (id: string, patch: Partial<Project>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
      ),
    }));
  },
  /** Verschiebt das Projekt in den Papierkorb (30 Tage wiederherstellbar). */
  deleteProject: (id: string) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p
      ),
    }));
    _trashHook?.("delete", id);
  },
  /** Blattszenen aus dem CAD-Cloudstand übernehmen (ohne Verlauf, ohne Upload). */
  applyCloudSheets: (id: string, sheets: Sheet[]) => {
    if (!state.projects.some((p) => p.id === id)) return;
    systemWrite(() => setState((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, sheets } : p)),
    })));
  },
  setTrashHook: (hook: ((op: "delete" | "restore" | "purge", projectId: string) => void) | null) => {
    _trashHook = hook;
  },
  /** Cloudweiten Papierkorbstatus übernehmen (ohne erneute Meldung an die Cloud). */
  applyCloudTrash: (id: string, deletedAt: string | null) => {
    const cur = state.projects.find((p) => p.id === id);
    if (!cur) return;
    if ((cur.deletedAt ?? null) === deletedAt || (!!cur.deletedAt && !!deletedAt)) return;
    systemWrite(() => setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== id) return p;
        return deletedAt
          ? { ...p, deletedAt }
          : { ...p, deletedAt: undefined, sortIndex: nextTopIndex(s.projects, p.folderId ?? null) };
      }),
    })));
  },
  /** Auf einem anderen Gerät endgültig gelöscht → hier ebenfalls entfernen. */
  purgeProjectFromCloud: (id: string) => {
    if (!state.projects.some((p) => p.id === id)) return;
    systemWrite(() => setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) })));
    try {
      import("./timelineStore").then((m) => m.timelineStore.deleteProject(id)).catch(() => {});
    } catch {}
  },
  /**
   * Erstellt eine 1:1-Kopie eines Projekts (Blätter, Aufgaben, Termine,
   * Dateien) inklusive Board- und Finanzdaten.
   * Blatt-IDs bleiben erhalten, damit CAD-Ansichten weiter greifen.
   */
  duplicateProject: (id: string) => {
    const src = state.projects.find((p) => p.id === id);
    if (!src) return undefined;
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const newId = `${src.isTemplate ? "tpl" : "p"}-${Date.now().toString(36)}`;
    const copy: Project = {
      ...clone(src),
      id: newId,
      name: `${src.name} (Kopie)`,
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
      favorite: false,
      tasks: clone(src.tasks ?? []).map((t) => ({ ...t, id: `${newId}-${t.id}` })),
      events: clone(src.events ?? []).map((e) => ({ ...e, id: `${newId}-${e.id}` })),
    };
    // Board- und Finanzdaten mitkopieren (projektbezogene localStorage-Keys).
    try {
      if (typeof window !== "undefined") {
        for (const prefix of ["pixuna.notes.", "pixuna.finance.v2."]) {
          const raw = window.localStorage.getItem(`${prefix}${src.id}`);
          if (raw) window.localStorage.setItem(`${prefix}${newId}`, raw);
        }
      }
    } catch { /* Speicherlimit ignorieren */ }
    setState((s) => ({
      projects: [{ ...copy, sortIndex: nextTopIndex(s.projects, copy.folderId ?? null) }, ...s.projects],
    }));
    return newId;
  },
  duplicateAsTemplate: (id: string) => {
    const src = state.projects.find((p) => p.id === id);
    if (!src) return undefined;
    const newId = `tpl-${Date.now().toString(36)}`;
    const tpl: Project = {
      ...src,
      id: newId,
      name: `${src.name} (Vorlage)`,
      isTemplate: true,
      favorite: false,
      updatedAt: new Date().toISOString(),
      sheets: src.sheets.map((s) => ({ ...s })),
      tasks: src.tasks.map((t) => ({ ...t, id: `${newId}-${t.id}`, done: false })),
      events: src.events.map((e) => ({ ...e, id: `${newId}-${e.id}` })),
      customFields: src.customFields?.map((f) => ({ ...f })),
      settings: { ...(src.settings ?? {}), helpOn: true },
    };
    setState((s) => ({ projects: [tpl, ...s.projects] }));
    return newId;
  },
  /**
   * Erzeugt aus einer Vorlage ein neues eigenständiges Projekt.
   * IDs von Seiten/Elementen/Tasks/Events werden neu vergeben; `isTemplate` wird entfernt.
   */
  createFromTemplate: (templateId: string) => {
    const src = state.projects.find((p) => p.id === templateId);
    if (!src) return undefined;
    const newId = `p-${Date.now().toString(36)}`;
    const proj: Project = {
      ...src,
      id: newId,
      name: src.name.replace(/\s*\(Vorlage\)\s*$/, "") || "Neues Projekt",
      isTemplate: false,
      favorite: false,
      updatedAt: new Date().toISOString(),
      sheets: src.sheets.map((s) => ({ ...s })),
      tasks: src.tasks.map((t) => ({ ...t, id: `${newId}-${t.id}`, done: false })),
      events: src.events.map((e) => ({ ...e, id: `${newId}-${e.id}` })),
      customFields: src.customFields?.map((f) => ({ ...f })),
      settings: { ...(src.settings ?? {}), helpOn: true },
    };
    setState((s) => ({ projects: [proj, ...s.projects] }));
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

  updateProjectSettings: (projectId: string, patch: Partial<ProjectSettings>) => {
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, settings: { ...(p.settings ?? {}), ...patch } } : p
      ),
    }));
  },
  setHelpOn: (projectId: string, helpOn: boolean) => {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return false;
    if (project.settings?.helpOn === helpOn) return true;
    const projects = state.projects.map((p) =>
      p.id === projectId
        ? { ...p, settings: { ...(p.settings ?? {}), helpOn } }
        : p
    );
    return commitProjectUiProjects(projects);
  },

  // ---------- Dokumentenablage ----------
  addFolder: (projectId: string, kind: "files" | "photos", parentId: string | null, name = "Neuer Ordner") => {
    const id = `n-${Date.now().toString(36)}`;
    const node: FileNode = { id, kind: "folder", name, createdAt: new Date().toISOString(), parentId };
    const projects = state.projects.map((p) =>
      p.id === projectId
        ? { ...p, [kind]: [...(p[kind] ?? []), node], updatedAt: new Date().toISOString() } as Project
        : p
    );
    return commitDocumentProjects(projects) ? id : undefined;
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
    const projects = state.projects.map((p) =>
      p.id === projectId
        ? ({ ...p, [kind]: [...(p[kind] ?? []), node], updatedAt: new Date().toISOString() } as Project)
        : p
    );
    return commitDocumentProjects(projects) ? id : undefined;
  },
  renameNode: (projectId: string, kind: "files" | "photos", nodeId: string, name: string) => {
    const projects = state.projects.map((p) =>
      p.id === projectId
        ? ({
            ...p,
            [kind]: (p[kind] ?? []).map((n) => (n.id === nodeId ? { ...n, name } : n)),
            updatedAt: new Date().toISOString(),
          } as Project)
        : p
    );
    return commitDocumentProjects(projects);
  },
  /** Verschiebt einen Knoten in der Reihenfolge seiner Geschwister nach
   *  oben/unten (nur Sortierung, Elternzuordnung bleibt unverändert). */
  moveNodeOrder: (projectId: string, kind: "files" | "photos", nodeId: string, dir: -1 | 1) => {
    let changed = false;
    const projects = state.projects.map((p) => {
      if (p.id !== projectId) return p;
      const arr = [...(p[kind] ?? [])];
      const node = arr.find((n) => n.id === nodeId);
      if (!node) return p;
      // Indizes der Geschwister mit gleichem Typ (Ordner bleiben unter sich).
      const sibIdx = arr
        .map((n, i) => ({ n, i }))
        .filter(({ n }) => n.parentId === node.parentId && n.kind === node.kind)
        .map(({ i }) => i);
      const pos = sibIdx.indexOf(arr.indexOf(node));
      const target = pos + dir;
      if (pos < 0 || target < 0 || target >= sibIdx.length) return p;
      const a = sibIdx[pos];
      const b = sibIdx[target];
      [arr[a], arr[b]] = [arr[b], arr[a]];
      changed = true;
      return { ...p, [kind]: arr, updatedAt: new Date().toISOString() } as Project;
    });
    return changed && commitDocumentProjects(projects);
  },

  /** Verschiebt einen Dokumentenknoten an eine andere Position oder in einen
   *  anderen Ordner. Ordner können niemals in sich selbst oder einen ihrer
   *  Nachfahren verschoben werden. `beforeNodeId = null` hängt den Knoten an
   *  das Ende der gleichartigen Geschwister an. */
  moveFileNode: (
    projectId: string,
    nodeId: string,
    destinationParentId: string | null,
    beforeNodeId: string | null = null
  ) => {
    const project = state.projects.find((candidate) => candidate.id === projectId);
    const nodes = project?.files ?? [];
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!project || !node) return false;

    if (destinationParentId) {
      const destination = nodes.find((candidate) => candidate.id === destinationParentId);
      if (!destination || destination.kind !== "folder") return false;
    }

    if (node.kind === "folder") {
      const visited = new Set<string>();
      let ancestorId = destinationParentId;
      while (ancestorId) {
        if (ancestorId === nodeId || visited.has(ancestorId)) return false;
        visited.add(ancestorId);
        ancestorId = nodes.find((candidate) => candidate.id === ancestorId)?.parentId ?? null;
      }
    }

    const beforeNode = beforeNodeId
      ? nodes.find((candidate) => candidate.id === beforeNodeId)
      : undefined;
    if (
      beforeNodeId &&
      (!beforeNode || beforeNode.id === nodeId || beforeNode.parentId !== destinationParentId || beforeNode.kind !== node.kind)
    ) {
      return false;
    }

    const remaining = nodes.filter((candidate) => candidate.id !== nodeId);
    const movedNode = node.parentId === destinationParentId ? node : { ...node, parentId: destinationParentId };
    let insertAt = remaining.length;

    if (beforeNode) {
      insertAt = remaining.findIndex((candidate) => candidate.id === beforeNode.id);
    } else {
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index];
        if (candidate.parentId === destinationParentId && candidate.kind === node.kind) {
          insertAt = index + 1;
          break;
        }
      }
    }

    remaining.splice(insertAt, 0, movedNode);
    const unchanged = nodes.every(
      (candidate, index) =>
        candidate.id === remaining[index]?.id && candidate.parentId === remaining[index]?.parentId
    );
    if (unchanged) return true;

    const projects = state.projects.map((candidate) =>
      candidate.id === projectId
        ? { ...candidate, files: remaining, updatedAt: new Date().toISOString() }
        : candidate
    );
    return commitDocumentProjects(projects);
  },

  deleteNode: (projectId: string, kind: "files" | "photos", nodeId: string) => {
    let changed = false;
    const projects = state.projects.map((p) => {
      if (p.id !== projectId) return p;
      const arr = p[kind] ?? [];
      // Auch alle Nachfahren löschen.
      const toDelete = new Set<string>([nodeId]);
      let foundDescendant = true;
      while (foundDescendant) {
        foundDescendant = false;
        for (const n of arr) {
          if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
            toDelete.add(n.id);
            foundDescendant = true;
          }
        }
      }
      const next = arr.filter((n) => !toDelete.has(n.id));
      if (next.length === arr.length) return p;
      changed = true;
      return { ...p, [kind]: next, updatedAt: new Date().toISOString() } as Project;
    });
    return changed && commitDocumentProjects(projects);
  },
  /* ---------- Undo / Redo (public API) ---------- */
  /** Schließt die laufende Geste ab: die nächste Änderung startet garantiert
   *  einen neuen Undo-Schritt (Pointer-Up, Enter, Abbruch, Werkzeugwechsel). */
  /** Feuert nach jedem Undo/Redo — eingebettete CAD-Engines laden dann neu. */
  subscribeHistoryRestore: (fn: () => void) => {
    restoreListeners.add(fn);
    return () => restoreListeners.delete(fn);
  },
  sealHistory: (projectId: string) => {
    lastPushAt.delete(projectId);
    lastSig.delete(projectId);
  },
  canUndo: (projectId: string) => (history.get(projectId)?.past.length ?? 0) > 0,

  canRedo: (projectId: string) => (history.get(projectId)?.future.length ?? 0) > 0,
  subscribeHistory: (fn: () => void) => {
    historyListeners.add(fn);
    return () => historyListeners.delete(fn);
  },
  undo: (projectId: string) => {
    const h = getHist(projectId);
    if (!h.past.length) return false;
    const cur = state.projects.find((p) => p.id === projectId);
    if (!cur) return false;
    const prev = h.past[h.past.length - 1];
    const candidate = { ...state, projects: state.projects.map((p) => (p.id === projectId ? prev : p)) };
    if (!persistState(candidate)) return false;
    h.past.pop();
    h.future.push(cur);
    lastPushAt.delete(projectId); lastSig.delete(projectId);
    _suspendHistory = true;
    try {
      state = candidate;
    } finally {
      _suspendHistory = false;
    }
    notifyHistory();
    emit(false);
    notifyRestore();
    return true;
  },
  redo: (projectId: string) => {
    const h = getHist(projectId);
    if (!h.future.length) return false;
    const cur = state.projects.find((p) => p.id === projectId);
    if (!cur) return false;
    const next = h.future[h.future.length - 1];
    const candidate = { ...state, projects: state.projects.map((p) => (p.id === projectId ? next : p)) };
    if (!persistState(candidate)) return false;
    h.future.pop();
    h.past.push(cur);
    lastPushAt.delete(projectId); lastSig.delete(projectId);
    _suspendHistory = true;
    try {
      state = candidate;
    } finally {
      _suspendHistory = false;
    }
    notifyHistory();
    emit(false);
    notifyRestore();
    return true;
  },

  /* ---------- Projekt-Ordner (Sidebar) ---------- */
  addProjectFolder: (name: string) => {
    const id = `f-${Date.now().toString(36)}`;
    setState((s) => ({ folders: [...s.folders, { id, name: name.trim() || "Neuer Ordner", sortIndex: s.folders.length }] }));
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
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, folderId, sortIndex: nextTopIndex(s.projects, folderId) } : p
      ),
    }));
  },
  reorderProjectFolder: (dragId: string, targetId: string, place: "before" | "after" = "before") => {
    setState((s) => {
      const list = [...s.folders].sort(bySortIndex);
      const from = list.findIndex((f) => f.id === dragId);
      if (from < 0) return {};
      const [moved] = list.splice(from, 1);
      let to = list.findIndex((f) => f.id === targetId);
      if (to < 0) to = list.length;
      else if (place === "after") to += 1;
      list.splice(to, 0, moved);
      return { folders: list.map((f, i) => ({ ...f, sortIndex: i })) };
    });
  },
  /** Verschiebt ein Projekt innerhalb seiner Sidebar-Liste vor/hinter ein anderes. */
  reorderProject: (dragId: string, targetId: string, place: "before" | "after" = "before") => {
    setState((s) => {
      const drag = s.projects.find((p) => p.id === dragId);
      const target = s.projects.find((p) => p.id === targetId);
      if (!drag || !target || dragId === targetId) return {};
      const folderId = target.folderId ?? null;
      const group = s.projects
        .filter((p) => !p.isTemplate && !p.deletedAt && (p.folderId ?? null) === folderId)
        .sort(byProjectOrder);
      const from = group.findIndex((p) => p.id === dragId);
      if (from >= 0) group.splice(from, 1);
      let to = group.findIndex((p) => p.id === targetId);
      if (to < 0) to = group.length;
      else if (place === "after") to += 1;
      group.splice(to, 0, { ...drag, folderId });
      const order = new Map(group.map((p, i) => [p.id, i] as const));
      return {
        projects: s.projects.map((p) =>
          order.has(p.id) ? { ...p, folderId, sortIndex: order.get(p.id)! } : p
        ),
      };
    });
  },
  /** Favorit umschalten – die manuelle Position bleibt dabei unverändert. */
  toggleFavorite: (projectId: string) => {
    setState((s) => ({
      projects: s.projects.map((x) =>
        x.id === projectId ? { ...x, favorite: !x.favorite } : x
      ),
    }));
  },

  /* ---------- Papierkorb (30 Tage) ---------- */
  restoreProject: (id: string) => {
    const active = state.projects.filter((p) => !p.isTemplate && !p.deletedAt).length;
    if (active >= MAX_PROJECTS) return false;
    setState((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, deletedAt: undefined, sortIndex: nextTopIndex(s.projects, p.folderId ?? null) } : p
      ),
    }));
    _trashHook?.("restore", id);
    return true;
  },
  purgeProject: (id: string) => {
    setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
    _trashHook?.("purge", id);
    try {
      import("./timelineStore").then((m) => m.timelineStore.deleteProject(id)).catch(() => {});
      localStorage.removeItem(`pixuna.pendingSheetPdf.${id}`);
    } catch {}
  },

  /* ---------- Profile ---------- */
  updateProfile: (patch: Partial<UserProfile>) => {
    setState((s) => ({ profile: { ...s.profile, ...patch } }));
  },
};

function bySortIndex(a: { sortIndex?: number }, b: { sortIndex?: number }) {
  return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
}

/**
 * Ausschließlich die selbst festgelegte Reihenfolge. Favoriten bleiben
 * markiert, verschieben ein Projekt aber nicht mehr automatisch nach oben.
 */
export function byProjectOrder(a: Project, b: Project) {
  return (a.sortIndex ?? 0) - (b.sortIndex ?? 0);
}

function nextTopIndex(projects: Project[], folderId: string | null) {
  const idx = projects
    .filter((p) => !p.isTemplate && !p.deletedAt && (p.folderId ?? null) === folderId)
    .map((p) => p.sortIndex ?? 0);
  return (idx.length ? Math.min(...idx) : 0) - 1;
}

export const TRASH_RETENTION_DAYS = 30;

/** Verbleibende Tage im Papierkorb. */
export function trashDaysLeft(p: Project): number {
  if (!p.deletedAt) return TRASH_RETENTION_DAYS;
  const ms = Date.now() - new Date(p.deletedAt).getTime();
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor(ms / 86400000));
}

let _activeCache: { src: Project[]; out: Project[] } | null = null;
function activeProjects(): Project[] {
  const src = projectStore.getState().projects;
  if (_activeCache && _activeCache.src === src) return _activeCache.out;
  const out = src.filter((p) => !p.deletedAt);
  _activeCache = { src, out };
  return out;
}

let _trashCache: { src: Project[]; out: Project[] } | null = null;
function trashedProjects(): Project[] {
  const src = projectStore.getState().projects;
  if (_trashCache && _trashCache.src === src) return _trashCache.out;
  const out = src
    .filter((p) => !!p.deletedAt)
    .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  _trashCache = { src, out };
  return out;
}

export function useProjects(): Project[] {
  return useSyncExternalStore(projectStore.subscribe, activeProjects, activeProjects);
}

/** Projekte im Papierkorb (max. 30 Tage). */
export function useTrashedProjects(): Project[] {
  return useSyncExternalStore(projectStore.subscribe, trashedProjects, trashedProjects);
}

export function useProject(id: string | undefined): Project | undefined {
  const projects = useProjects();
  return projects.find((p) => p.id === id);
}

/** Reactive Undo/Redo Flags für eine Projekt-ID. */
const _histSnapCache = new Map<string, { canUndo: boolean; canRedo: boolean }>();
// Stabile Referenz für „keine Historie" — sonst liefert getSnapshot bei jedem
// Aufruf ein neues Objekt und useSyncExternalStore läuft in eine Endlosschleife
// (React-Fehler #185), z. B. solange die Projekt-ID noch nicht geladen ist.
const _histEmpty: { canUndo: boolean; canRedo: boolean } = { canUndo: false, canRedo: false };
function _histSnap(id: string | undefined) {
  if (!id) return _histEmpty;
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
    () => _histEmpty,
  );
}

let _folderCache: { src: ProjectFolder[]; out: ProjectFolder[] } | null = null;
function sortedFolders(): ProjectFolder[] {
  const src = projectStore.getState().folders;
  if (_folderCache && _folderCache.src === src) return _folderCache.out;
  const out = [...src].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  _folderCache = { src, out };
  return out;
}

export function useFolders(): ProjectFolder[] {
  return useSyncExternalStore(projectStore.subscribe, sortedFolders, sortedFolders);
}

export function useProfile(): UserProfile {
  return useSyncExternalStore(
    projectStore.subscribe,
    () => projectStore.getState().profile,
    () => projectStore.getState().profile,
  );
}



