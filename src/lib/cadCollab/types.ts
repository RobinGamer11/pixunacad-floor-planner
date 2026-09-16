/**
 * Objektbasierte CAD-Zusammenarbeit – gemeinsame Typen.
 *
 * Diese Schicht liegt bewusst NEBEN dem CAD-Kern: Sie liest nur den ohnehin
 * vorhandenen Serialisierungsstand und schreibt einzelne Objektänderungen.
 * Am Objektmodell, an den Werkzeugen und am Verlauf (Undo/Redo) ändert sie
 * nichts.
 */

/** Objektarten, die einzeln synchronisiert werden (Feldnamen der Szene). */
export const CAD_OBJECT_KINDS = [
  "segments",
  "hatches",
  "walls",
  "dimensions",
  "textBoxes",
  "tables",
  "libraryInstances",
  "documents",
  "freeStrokes",
  "doors",
] as const;

/** Objektarten, die direkt in einer Zeichenszene liegen. */
export type CadSceneKind = (typeof CAD_OBJECT_KINDS)[number];

/**
 * Bibliotheksdaten gehören zum Projekt, nicht zu einer Zeichenseite. Sie
 * laufen deshalb über eine eigene, feste „Seite".
 */
export const CAD_LIBRARY_SHEET_ID = "__library__";

/** Bibliotheksarten, die zusätzlich synchronisiert werden. */
export const CAD_LIBRARY_KINDS = ["libraryDefinitions", "libraryFolders"] as const;

export type CadLibraryKind = (typeof CAD_LIBRARY_KINDS)[number];

export function isLibraryKind(kind: string): kind is CadLibraryKind {
  return kind === "libraryDefinitions" || kind === "libraryFolders";
}

export type CadChangeType = "create" | "update" | "delete";

/** Eine einzelne, dauerhafte Objektänderung. */
export interface CadObjectOp {
  /** Eindeutige Operations-ID. */
  id: string;
  projectId: string;
  /** CAD-Seite (Zeichenblatt). */
  sheetId: string;
  objectId: string;
  objectKind: CadObjectKind;
  changeType: CadChangeType;
  /** Vollständige Objektdaten (bei "delete": null). */
  payload: Record<string, unknown> | null;
  /** Fortlaufende Version je Objekt. */
  objectVersion: number;
  actorId: string | null;
  createdAt: string;
  /** Serverseitige Reihenfolge (für den Nachlauf nach Verbindungsabbruch). */
  seq: number;
}

/** Lokal erkannte Änderung, noch ohne Server-Felder. */
export interface LocalCadOp {
  sheetId: string;
  objectId: string;
  objectKind: CadObjectKind;
  changeType: CadChangeType;
  payload: Record<string, unknown> | null;
}

/** Flüchtige Live-Vorschau während des Ziehens (nie gespeichert). */
export interface CadPreviewMessage {
  sheetId: string;
  objectId: string;
  objectKind: CadObjectKind;
  /** Objektdaten der Vorschau; `null` = Vorschau beenden/verwerfen. */
  payload: Record<string, unknown> | null;
  userId: string;
  displayName: string;
}

/** Präsenz einer Person auf einer CAD-Seite. */
export interface CadPresenceUser {
  userId: string;
  displayName: string;
  sheetId: string | null;
  cursor: { x: number; y: number } | null;
  /** Objekt, das diese Person gerade bearbeitet (weicher Hinweis). */
  editingObjectId: string | null;
  color: string;
}

/** Stabile, dezente Farbe je Person (aus der Benutzer-ID abgeleitet). */
export function presenceColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 58%)`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
