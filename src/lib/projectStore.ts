// Lightweight client-side project store backed by localStorage.
// Holds the projects shown on the start page and inside the Projektmappe.
// Intentionally framework-free: tiny pub/sub + useSyncExternalStore hook.

import { useSyncExternalStore } from "react";
import { getPageSizeMm, parseScaleDen } from "./paper";
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
  /**
   * Vorlagen-Seite der Finanzen-Oberfläche (z. B. "offer:f-abc123").
   * Solche Seiten sind in der normalen Projektmappe unsichtbar und werden nur
   * im Vorlagen-Modus (Angebot/Rechnung/Nachtrag anlegen) angezeigt.
   */
  templateKey?: string;
}


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
  /** Projektbezogene Schnellhilfe in der Mappe. Fehlend bedeutet initial aktiv. */
  mappeHelpOn?: boolean;
  /** Wenn true (Default), rendern CAD-Viewports in der Projektmappe live aus
   *  der aktuellsten Szene des referenzierten Zeichenblatts. Wenn false,
   *  werden Änderungen erst nach Klick auf „Ansicht aktualisieren" sichtbar. */
  cadAutoUpdate?: boolean;
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
  /** Manuelle Sortierposition in der Sidebar (klein = weiter oben). */
  sortIndex?: number;
  /** Zeitpunkt der Verschiebung in den Papierkorb (30 Tage Aufbewahrung). */
  deletedAt?: string;
  /** Gemeinsame Dokumentenablage — flache Liste mit parentId für den Ordnerbaum. */
  files?: FileNode[];
  /** @deprecated Legacy-Fotoablage; wird beim Laden verlustfrei nach `files` migriert. */
  photos?: FileNode[];
  settings?: ProjectSettings;
  /** „Auf allen Seiten“-Textbox-Vorlagen (Projektmappe).
   *  Jede Vorlage beschreibt den Zustand, mit dem eine neue Seite
   *  automatisch eine eigene, danach individuell bearbeitbare Kopie erhält. */
  textSpanTemplates?: TextSpanTemplate[];
}

/** Gültigkeitsbereich einer „Auf allen Seiten“-Gruppe.
 *  `mappe` = nur Seiten dieser Projektmappe,
 *  `template` = nur Vorlagen-Seiten mit exakt diesem templateKey. */
export type TextSpanScope =
  | { type: "mappe"; id: string }
  | { type: "template"; key: string };

/** Vorlagenzustand einer „Auf allen Seiten“-Textbox. */
export interface TextSpanTemplate {
  /** Stabile Gruppen-/Vorlagen-ID; identisch auf allen Seitenkopien. */
  groupId: string;
  /** Serialisierte Textbox im CAD-Overlay-Format (Weltkoordinaten = Papier-mm/1000). */
  box: any;
  /** Seitenkontext, in dem die Gruppe gilt. Fehlt er (Altprojekte), wird er
   *  aus den vorhandenen Kopien abgeleitet. */
  scope?: TextSpanScope;
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
      // Zentrale Schema-Migration des gesamten Persistenzstandes.
      const parsed = migrateProjectState(JSON.parse(raw));
      if (parsed && Array.isArray(parsed.projects) && parsed.projects.length) {
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

/** Stellt sicher, dass jedes Projekt mindestens eine Mappe und eine Dokumentenablage hat. */
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
  const files = Array.isArray(next.files) ? next.files : [];
  const legacyPhotos = Array.isArray(next.photos) ? next.photos : [];
  next.files = mergeLegacyPhotoNodes(files, legacyPhotos);
  next.photos = [];
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
 *  (scaleDen, modelCenterM, viewportRotationDeg) beim Laden befüllt. Zusätzlich
 *  wird — falls basePaperMm/baseScaleDen vorhanden — der Rahmen (wMm/hMm) aus
 *  dem aktuellen scaleDen automatisch neu berechnet, damit veraltete Größen
 *  aus Legacy-Datenständen nicht zu falschen Papier-Ausschnitten führen. */
function migratePageViewports(page: ProjectPage): ProjectPage {
  const { wMm: pageW, hMm: pageH } = getPageSizeMm(page);
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
    // Basis-Referenz für Rahmenberechnung: fehlt sie (Legacy), aus aktuellen
    // Werten stempeln — künftige Maßstabsänderungen bleiben dann konsistent.
    if (!next.basePaperMm && pageW > 0 && pageH > 0
        && typeof el.w === "number" && typeof el.h === "number") {
      next.basePaperMm = {
        w: (el.w / 100) * pageW,
        h: (el.h / 100) * pageH,
      };
      touched = true;
    }
    if (typeof next.baseScaleDen !== "number" || !(next.baseScaleDen > 0)) {
      next.baseScaleDen = next.scaleDen;
      touched = true;
    }
    // Auto-Recompute Rahmen: aktueller Papier-Ausschnitt = basePaperMm * baseScaleDen / scaleDen.
    if (next.basePaperMm && next.baseScaleDen && next.scaleDen
        && pageW > 0 && pageH > 0) {
      const targetWmm = next.basePaperMm.w * (next.baseScaleDen / next.scaleDen);
      const targetHmm = next.basePaperMm.h * (next.baseScaleDen / next.scaleDen);
      const currentWmm = (typeof el.w === "number") ? (el.w / 100) * pageW : 0;
      const currentHmm = (typeof el.h === "number") ? (el.h / 100) * pageH : 0;
      if (Math.abs(targetWmm - currentWmm) > 0.25 || Math.abs(targetHmm - currentHmm) > 0.25) {
        next.w = Math.max(0.5, Math.min(400, (targetWmm / pageW) * 100));
        next.h = Math.max(0.5, Math.min(400, (targetHmm / pageH) * 100));
        next.wMm = targetWmm;
        next.hMm = targetHmm;
        touched = true;
      }
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


/** Grobe Signatur der geänderten Objekte (Seiten-/Element-IDs, Anzahl). */
function changeSignature(a: Project, b: Project): string {
  try {
    const parts: string[] = [];
    const ap = a.pages ?? [], bp = b.pages ?? [];
    if (ap.length !== bp.length) parts.push(`pages:${ap.length}->${bp.length}`);
    const aById = new Map(ap.map((p) => [p.id, p] as const));
    for (const pg of bp) {
      const op = aById.get(pg.id);
      if (!op) { parts.push(`page+${pg.id}`); continue; }
      if (op === pg) continue;
      const ael = op.elements ?? [], bel = pg.elements ?? [];
      if (ael.length !== bel.length) { parts.push(`page~${pg.id}:count`); continue; }
      const aEl = new Map(ael.map((el) => [el.id, el] as const));
      for (const el of bel) {
        const oe = aEl.get(el.id);
        if (!oe) { parts.push(`el+${el.id}`); }
        else if (oe !== el && JSON.stringify(oe) !== JSON.stringify(el)) parts.push(`el~${el.id}`);
      }
      if (!parts.length) parts.push(`page~${pg.id}`);
    }
    if (!parts.length) parts.push("other");
    return parts.sort().join("|");
  } catch {
    return "other";
  }
}

function setState(updater: (s: State) => Partial<State>, alreadyPersisted = false) {
  const prev = state;
  const prevById = new Map(prev.projects.map((p) => [p.id, p] as const));
  state = { ...state, ...updater(state) };
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



/** Seitenkontext einer Seite: Vorlagen-Seiten zählen ausschließlich zu ihrem
 *  templateKey, alle übrigen zu ihrer Projektmappe. */
export function pageSpanScope(p: Project, pageId: string): TextSpanScope | null {
  const page = p.pages.find((pg) => pg.id === pageId);
  if (!page) return null;
  if (page.templateKey) return { type: "template", key: page.templateKey };
  const mappe = (p.mappen ?? []).find((m) => m.pageIds.includes(pageId));
  return mappe ? { type: "mappe", id: mappe.id } : null;
}

function sameScope(a: TextSpanScope | null, b: TextSpanScope | null): boolean {
  if (!a || !b || a.type !== b.type) return false;
  return a.type === "mappe" ? a.id === (b as any).id : a.key === (b as any).key;
}

/** Scope einer Vorlage — mit Fallback für Altdaten ohne `scope`:
 *  abgeleitet aus der ersten Seite, die bereits eine Kopie der Gruppe trägt. */
function templateScope(p: Project, t: TextSpanTemplate): TextSpanScope | null {
  if (t.scope) return t.scope;
  const carrier = p.pages.find((pg) =>
    ((pg.cadOverlay as any)?.textBoxes ?? []).some((b: any) => b?.style?.spanGroupId === t.groupId),
  );
  return carrier ? pageSpanScope(p, carrier.id) : null;
}

/** Vorlagen, die für den Kontext einer (neuen) Seite gelten. */
function templatesForScope(p: Project, scope: TextSpanScope | null): TextSpanTemplate[] {
  if (!scope) return [];
  return (p.textSpanTemplates ?? []).filter((t) => sameScope(templateScope(p, t), scope));
}

/** Seiten, die von „Auf allen Seiten“ betroffen sind: ausschließlich Seiten im
 *  selben Kontext (Mappe bzw. Vorlagen-Schlüssel) wie die Quellseite. */
export function spanTargetPageIds(p: Project, sourcePageId: string): Set<string> {
  const scope = pageSpanScope(p, sourcePageId);
  if (!scope) return new Set([sourcePageId]);
  return new Set(
    p.pages.filter((pg) => sameScope(pageSpanScope(p, pg.id), scope)).map((pg) => pg.id),
  );
}

/** Ist eine „Auf allen Seiten“-Gruppe im Seitenkontext dieser Seite aktiv?
 *  Gruppen anderer „Bücher“ (andere Mappe / anderer templateKey) zählen nicht. */
export function isSpanGroupActiveForPage(p: Project, pageId: string, groupId: string): boolean {
  const scope = pageSpanScope(p, pageId);
  if (!scope) return false;
  return templatesForScope(p, scope).some((t) => t.groupId === groupId);
}


/** Fügt einem Overlay-Zustand fehlende „Auf allen Seiten“-Kopien hinzu.
 *  Jede Kopie erhält eine eigene Objekt-ID, behält aber die groupId. */
function seedSpanOverlay(
  overlay: any,
  templates: { groupId: string; box: any }[] | undefined,
  pageId: string,
): any {
  if (!templates?.length) return overlay;
  const base = overlay ? { ...overlay } : {};
  const boxes: any[] = Array.isArray(base.textBoxes) ? [...base.textBoxes] : [];
  let added = false;
  for (const t of templates) {
    if (boxes.some((b) => b?.style?.spanGroupId === t.groupId)) continue;
    const clone = JSON.parse(JSON.stringify(t.box));
    clone.id = `${pageId}-span-${t.groupId}-${Math.random().toString(36).slice(2, 7)}`;
    clone.style = { ...(clone.style ?? {}), spanGroupId: t.groupId };
    boxes.push(clone);
    added = true;
  }
  if (!added && overlay) return overlay;
  base.textBoxes = boxes;
  return base;
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
      settings: { timelinePosition: "bottom", mappeHelpOn: true },
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
  },
  /**
   * Erstellt eine 1:1-Kopie eines Projekts (Seiten, Elemente, Mappen, Blätter,
   * Aufgaben, Termine, Dateien) inklusive Board- und Finanzdaten.
   * Blatt-IDs bleiben erhalten, damit CAD-Ansichten weiter greifen.
   */
  duplicateProject: (id: string) => {
    const src = state.projects.find((p) => p.id === id);
    if (!src) return undefined;
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const newId = `${src.isTemplate ? "tpl" : "p"}-${Date.now().toString(36)}`;
    const newPages = clone(src.pages).map((pg) => ({
      ...pg,
      id: `${newId}-${pg.id}`,
      elements: (pg.elements ?? []).map((el) => ({ ...el, id: `${newId}-${el.id}` })),
    }));
    const oldToNewPage = new Map(src.pages.map((pg, i) => [pg.id, newPages[i].id] as const));
    const newMappen = clone(src.mappen ?? []).map((m) => ({
      ...m,
      id: `m-${newId}-${m.id}`,
      pageIds: (m.pageIds ?? []).map((pid) => oldToNewPage.get(pid) ?? pid),
    }));
    const copy: Project = {
      ...clone(src),
      id: newId,
      name: `${src.name} (Kopie)`,
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
      favorite: false,
      pages: newPages,
      mappen: newMappen.length ? newMappen : undefined,
      activeMappeId: newMappen.length
        ? (newMappen.find((m) => m.id === `m-${newId}-${src.activeMappeId}`)?.id ?? newMappen[0].id)
        : undefined,
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
      settings: { ...(src.settings ?? {}), mappeHelpOn: true },
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
    const newPages = src.pages.map((pg) => ({
      ...pg,
      id: `${newId}-${pg.id}`,
      elements: pg.elements.map((el) => ({ ...el, id: `${newId}-${el.id}` })),
    }));
    const oldToNewPage = new Map(src.pages.map((pg, i) => [pg.id, newPages[i].id] as const));
    const newMappen = (src.mappen ?? []).map((m) => ({
      ...m,
      id: `m-${newId}-${m.id}`,
      pageIds: m.pageIds.map((pid) => oldToNewPage.get(pid) ?? pid),
    }));
    const proj: Project = {
      ...src,
      id: newId,
      name: src.name.replace(/\s*\(Vorlage\)\s*$/, "") || "Neues Projekt",
      isTemplate: false,
      favorite: false,
      updatedAt: new Date().toISOString(),
      pages: newPages,
      mappen: newMappen,
      activeMappeId: newMappen[0]?.id,
      sheets: src.sheets.map((s) => ({ ...s })),
      tasks: src.tasks.map((t) => ({ ...t, id: `${newId}-${t.id}`, done: false })),
      events: src.events.map((e) => ({ ...e, id: `${newId}-${e.id}` })),
      customFields: src.customFields?.map((f) => ({ ...f })),
      settings: { ...(src.settings ?? {}), mappeHelpOn: true },
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
              cadOverlay: seedSpanOverlay(
                undefined,
                targetMappe ? templatesForScope(p, { type: "mappe", id: targetMappe }) : [],
                newId,
              ),

            },
          ],
          mappen,
        };
      }),
    }));
    return newId;
  },
  /**
   * Neue Seite innerhalb eines Vorlagenkontexts (Finanzen). Die Seite behält
   * denselben templateKey, gehört zu keiner Mappe und erhält nur die
   * All-Pages-Templates des eigenen Vorlagen-Scopes.
   */
  addTemplatePage: (projectId: string, templateKey: string, title = "Neue Seite") => {
    const newId = `${projectId}-tpl${Date.now().toString(36)}`;
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const siblings = p.pages.filter((pg) => pg.templateKey === templateKey);
        const ref = siblings[siblings.length - 1];
        const tplSpan = templatesForScope(p, { type: "template", key: templateKey });
        const page: ProjectPage = {
          id: newId,
          title: `${title} ${siblings.length + 1}`,
          format: ref?.format ?? "A4-hoch",
          margins: ref?.margins ?? 20,
          background: false,
          elements: [],
          templateKey,
          cadOverlay: seedSpanOverlay(undefined, tplSpan, newId),
        };
        return { ...p, updatedAt: new Date().toISOString(), pages: [...p.pages, page] };
      }),
    }));
    return newId;
  },

  /**
   * Stellt sicher, dass für einen Vorlagen-Schlüssel (Finanzen: Angebot /
   * Rechnung / Nachtrag) mindestens eine Seite existiert. Vorlagen-Seiten
   * gehören zu keiner Mappe und sind im normalen Mappen-Modus unsichtbar.
   * `favorite` ist ein optionaler Satz Vorlagen-Seiten, der geklont wird.
   */
  ensureTemplatePages: (
    projectId: string,
    templateKey: string,
    title: string,
    favorite?: ProjectPage[],
  ) => {
    let ids: string[] = [];
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const existing = p.pages.filter((pg) => pg.templateKey === templateKey);
        if (existing.length) { ids = existing.map((pg) => pg.id); return p; }
        const created = cloneTemplatePages(p, templateKey, title, favorite);
        ids = created.map((pg) => pg.id);
        return { ...p, updatedAt: new Date().toISOString(), pages: [...p.pages, ...created] };
      }),
    }));
    return ids;
  },

  /**
   * Ersetzt sämtliche Seiten eines Vorlagen-Schlüssels durch frische Klone.
   * Wird ausschließlich für die einmalige Migration eines unveränderten
   * leeren Platzhalters der Standard-Mustervorlage benutzt.
   */
  replaceTemplatePages: (
    projectId: string,
    templateKey: string,
    title: string,
    source: ProjectPage[],
  ) => {
    let ids: string[] = [];
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const created = cloneTemplatePages(p, templateKey, title, source);
        ids = created.map((pg) => pg.id);
        const rest = p.pages.filter((pg) => pg.templateKey !== templateKey);
        return { ...p, updatedAt: new Date().toISOString(), pages: [...rest, ...created] };
      }),
    }));
    return ids;
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

  /* ---------- „Auf allen Seiten“ — Textboxen (Projektmappe) ---------- */
  /**
   * Verteilt eine Textbox als eigenständige Kopie auf alle übrigen Seiten der
   * Mappe und hinterlegt den Vorlagenzustand für später erstellte Seiten.
   * Bereits vorhandene Kopien derselben Gruppe bleiben unangetastet
   * (individuelle Änderungen werden nie überschrieben).
   */
  applyTextSpanToPages: (projectId: string, sourcePageId: string, groupId: string, box: any) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        const scope = pageSpanScope(p, sourcePageId);
        const targets = spanTargetPageIds(p, sourcePageId);
        const templates: TextSpanTemplate[] = [
          ...(p.textSpanTemplates ?? []).filter((t) => t.groupId !== groupId),
          ...(scope ? [{ groupId, box: JSON.parse(JSON.stringify(box)), scope }] : []),
        ];

        return {
          ...p,
          updatedAt: new Date().toISOString(),
          textSpanTemplates: templates,
          pages: p.pages.map((pg) => {
            if (pg.id === sourcePageId || !targets.has(pg.id)) return pg;
            return { ...pg, cadOverlay: seedSpanOverlay(pg.cadOverlay, [{ groupId, box }], pg.id) };
          }),
        };
      }),
    }));
  },

  /**
   * Hebt die Verteilung auf: Alle Kopien der Gruppe auf anderen Seiten werden
   * entfernt, die Vorlage wird gelöscht. Die Kopie auf `keepPageId` bleibt
   * bestehen (sie wird vom Aufrufer zu einer normalen Textbox gemacht).
   */
  removeTextSpanGroup: (projectId: string, keepPageId: string, groupId: string) => {
    setState((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          updatedAt: new Date().toISOString(),
          textSpanTemplates: (p.textSpanTemplates ?? []).filter((t) => t.groupId !== groupId),
          pages: p.pages.map((pg) => {
            if (pg.id === keepPageId) return pg;
            const boxes = pg.cadOverlay?.textBoxes;
            if (!Array.isArray(boxes)) return pg;
            const kept = boxes.filter((b: any) => b?.style?.spanGroupId !== groupId);
            if (kept.length === boxes.length) return pg;
            return { ...pg, cadOverlay: { ...pg.cadOverlay, textBoxes: kept } };
          }),
        };
      }),
    }));
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
    const id = `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
                      elements: pg.elements.map((e) => {
                        if (e.id !== elementId) return e;
                        const next: PageElement = { ...e, ...patch };
                        const { wMm: pageW, hMm: pageH } = getPageSizeMm(pg);
                        const patchWritesPct =
                          typeof patch.x === "number" ||
                          typeof patch.y === "number" ||
                          typeof patch.w === "number" ||
                          typeof patch.h === "number";
                        const patchWritesMm =
                          typeof patch.xMm === "number" ||
                          typeof patch.yMm === "number" ||
                          typeof patch.wMm === "number" ||
                          typeof patch.hMm === "number";
                        if (patchWritesPct && !patchWritesMm && pageW > 0 && pageH > 0) {
                          if (typeof next.x === "number") next.xMm = (next.x / 100) * pageW;
                          if (typeof next.y === "number") next.yMm = (next.y / 100) * pageH;
                          if (typeof next.w === "number") next.wMm = (next.w / 100) * pageW;
                          if (typeof next.h === "number") next.hMm = (next.h / 100) * pageH;
                        }
                        return next;
                      }),
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
  setMappeHelpOn: (projectId: string, mappeHelpOn: boolean) => {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return false;
    if (project.settings?.mappeHelpOn === mappeHelpOn) return true;
    const projects = state.projects.map((p) =>
      p.id === projectId
        ? { ...p, settings: { ...(p.settings ?? {}), mappeHelpOn } }
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
  /** Favorit umschalten; beim Entfernen rutscht das Projekt direkt unter die Favoriten. */
  toggleFavorite: (projectId: string) => {
    setState((s) => {
      const p = s.projects.find((x) => x.id === projectId);
      if (!p) return {};
      const nextFav = !p.favorite;
      const folderId = p.folderId ?? null;
      const group = s.projects
        .filter((x) => !x.isTemplate && !x.deletedAt && (x.folderId ?? null) === folderId && x.id !== projectId)
        .sort(byProjectOrder);
      const nonFav = group.filter((x) => !x.favorite);
      const favs = group.filter((x) => x.favorite);
      const ordered = nextFav
        ? [{ ...p, favorite: true }, ...favs, ...nonFav]
        : [...favs, { ...p, favorite: false }, ...nonFav];
      const order = new Map(ordered.map((x, i) => [x.id, i] as const));
      return {
        projects: s.projects.map((x) =>
          x.id === projectId
            ? { ...x, favorite: nextFav, sortIndex: order.get(x.id) ?? 0 }
            : order.has(x.id)
              ? { ...x, sortIndex: order.get(x.id)! }
              : x
        ),
      };
    });
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
    return true;
  },
  purgeProject: (id: string) => {
    setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
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

/** Favoriten immer oben, danach die manuelle Reihenfolge. */
export function byProjectOrder(a: Project, b: Project) {
  const fa = a.favorite ? 0 : 1;
  const fb = b.favorite ? 0 : 1;
  if (fa !== fb) return fa - fb;
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



