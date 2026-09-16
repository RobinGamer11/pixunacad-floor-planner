/**
 * Datenmodell des PixunaCAD-Bibliothekssystems.
 *
 * Wichtig: Die Bibliothek ist eine zusätzliche Schicht ÜBER den bestehenden
 * Zeichenwerkzeugen. Die Werkzeuge (Linie, Polygon, Schraffur, Freihand, Text,
 * Maße, Wände, Tabellen) wissen nichts von Bibliotheksobjekten und erzeugen
 * weiterhin ausschließlich normale Scene-Objekte.
 *
 * Das Format ist bewusst getrennt vom bestehenden Sticker-System (das
 * unverändert bleibt).
 */

export type LibraryUnits = "mm" | "cm" | "m";

/** Objektarten, die verlustfrei in einer Bibliotheksdefinition liegen dürfen. */
export const LIBRARY_SUPPORTED_KINDS = [
  "segment",
  "hatch",
  "wall",
  "dimension",
  "textBox",
  "table",
  "freeStroke",
] as const;

export type LibraryGeometryKind = (typeof LIBRARY_SUPPORTED_KINDS)[number];

/**
 * Ein vollständiger Objekt-Snapshot in LOKALEN Koordinaten (Einfügepunkt =
 * Ursprung). `data` entspricht exakt dem Serialisierungsformat einer Szene
 * (`SerializedScene`-Eintrag) — dadurch ist die Speicherung verlustfrei und
 * die Wiederherstellung läuft über denselben Pfad wie das Laden einer Szene.
 */
export interface LibraryGeometrySnapshot {
  kind: LibraryGeometryKind;
  data: Record<string, any>;
}

/** Ordner der Bibliotheksverwaltung (reine Organisation, unabhängig von Kategorie/Tags). */
export interface LibraryFolder {
  id: string;
  name: string;
  /** Übergeordneter Ordner oder null für die oberste Ebene. */
  parentId: string | null;
  createdAt: number;
}

export interface LibraryDefinition {
  schemaVersion: 1;
  id: string;
  version: number;
  name: string;
  category: string;
  tags: string[];
  units: LibraryUnits;
  /** Ordnerzuordnung; null/undefiniert = „Nicht zugeordnet“. */
  folderId?: string | null;
  /** Einfügepunkt in lokalen Koordinaten (Meter). */
  insertionPoint: { x: number; y: number };
  metadata: {
    author?: string;
    license?: string;
    source?: string;
  };
  geometry: LibraryGeometrySnapshot[];
  preview?: {
    svg?: string;
    thumbnail?: string;
  };
  createdAt: number;
  updatedAt: number;
}

/** Platzierte Instanz — enthält NUR Referenz und Transformation. */
export interface LibraryObjectInstance {
  id: string;
  definitionId: string;
  definitionVersion: number;
  position: { x: number; y: number };
  rotationRad: number;
  scaleX: number;
  scaleY: number;
  labelId: string;
}

/** Transformationsangaben einer Instanz (ohne Identität). */
export interface LibraryTransform {
  position: { x: number; y: number };
  rotationRad: number;
  scaleX: number;
  scaleY: number;
}

/** Metadaten-Eingaben des Speichern-Dialogs. */
export interface LibraryDefinitionMeta {
  name: string;
  category?: string;
  tags?: string[];
  units?: LibraryUnits;
  author?: string;
  license?: string;
  source?: string;
  folderId?: string | null;
  /**
   * Der Einfügepunkt ist immer der Mittelpunkt der gespeicherten Geometrie.
   * Ein wählbarer Nullpunkt existiert bewusst nicht mehr.
   */
}

/** Dateiformat für den verlustfreien Einzelobjekt-Austausch. */
export const PXOBJ_FORMAT = "pxobj";
export const PXOBJ_SCHEMA_VERSION = 1;
export const PXOBJ_EXTENSION = ".pxobj";

export interface PxObjFile {
  format: typeof PXOBJ_FORMAT;
  schemaVersion: typeof PXOBJ_SCHEMA_VERSION;
  definition: LibraryDefinition;
}
