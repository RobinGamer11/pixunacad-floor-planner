/**
 * Datentypen der Live-Zusammenarbeit in der Projektmappe.
 *
 * Bewusst getrennt vom CAD-Modell: Die Projektmappe hat ein eigenes
 * Elementmodell (Seiten und Seitenelemente) und wird nicht in CAD-Objekte
 * umgewandelt.
 */

/** Ein synchronisierbares Objekt der Projektmappe. */
export const MAPPE_KINDS = ["page", "element"] as const;
export type MappeObjectKind = (typeof MAPPE_KINDS)[number];

/** Seiten liegen nicht auf einer Seite – sie nutzen diese Kennung. */
export const MAPPE_ROOT_PAGE_ID = "__project__";

export type MappeChangeType = "create" | "update" | "delete";

/** Lokal erkannte Änderung, bevor sie geschrieben wird. */
export interface LocalMappeOp {
  pageId: string;
  objectId: string;
  objectKind: MappeObjectKind;
  changeType: MappeChangeType;
  payload: Record<string, unknown> | null;
}

/** Gespeicherte Änderung, wie sie aus der Datenbank kommt. */
export interface MappeObjectOp extends LocalMappeOp {
  id: string;
  projectId: string;
  objectVersion: number;
  actorId: string | null;
  createdAt: string;
  seq: number;
}

/** Flüchtige Vorschau während Verschieben, Größe ändern oder Drehen. */
export interface MappePreviewMessage {
  pageId: string;
  objectId: string;
  payload: Record<string, unknown> | null;
  userId: string;
  displayName: string;
}

/** Person, die gerade in derselben Projektmappe arbeitet. */
export interface MappePresenceUser {
  userId: string;
  displayName: string;
  color: string;
  /** Geöffnete Projektmappen-Seite. */
  pageId: string | null;
  editingObjectId: string | null;
}

const COLORS = [
  "#d9a441", "#4f9dde", "#6cc08b", "#e07a5f",
  "#9b8cff", "#3fb8af", "#e8617d", "#c9a227",
];

export function presenceColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
