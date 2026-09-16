/**
 * Eingehende Bibliotheksänderungen anwenden.
 *
 * Bibliotheksdefinitionen und deren Ordner gehören zum Projekt, nicht zu einer
 * Zeichenseite. Sie werden deshalb getrennt von den Szenenobjekten angewandt –
 * immer vor den zugehörigen Instanzen, damit eine platzierte Instanz nie ohne
 * Geometrie ankommt.
 */
import { restoreDefinitions, restoreFolders } from "@/cad/library/librarySerde";
import type { CadChangeType, CadLibraryKind } from "./types";

interface LibraryHost {
  libraryDefinitions: unknown[];
  libraryFolders: unknown[];
  onLibraryChange?: () => void;
}

/** Wendet eine einzelne Bibliotheksänderung an. Rückgabe: true bei Änderung. */
export function applyLibraryOp(
  app: LibraryHost,
  kind: CadLibraryKind,
  objectId: string,
  changeType: CadChangeType,
  payload: Record<string, unknown> | null,
): boolean {
  const isDef = kind === "libraryDefinitions";
  const list = (isDef ? app.libraryDefinitions : app.libraryFolders) as { id?: string }[];
  const index = list.findIndex((entry) => entry?.id === objectId);

  if (changeType === "delete") {
    if (index < 0) return false;
    list.splice(index, 1);
    app.onLibraryChange?.();
    return true;
  }
  if (!payload) return false;

  const restored = isDef ? restoreDefinitions([payload]) : restoreFolders([payload]);
  const next = restored[0] as { id?: string } | undefined;
  if (!next) return false;
  next.id = objectId; // Identität bleibt über alle Geräte gleich.
  if (index >= 0) list[index] = next;
  else list.push(next);
  app.onLibraryChange?.();
  return true;
}
