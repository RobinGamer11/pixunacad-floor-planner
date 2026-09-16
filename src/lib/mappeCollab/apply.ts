/**
 * Wendet einzelne fremde Änderungen auf die Projektmappe an.
 *
 * Es wird immer nur genau ein Objekt ersetzt, hinzugefügt oder entfernt –
 * niemals die komplette Projektmappe. Die Übernahme läuft über den
 * vorhandenen Weg für Daten aus der gemeinsamen Datenbasis und erzeugt daher
 * keinen eigenen Rückgängig-Schritt.
 */
import type { PageElement, Project, ProjectPage } from "@/lib/projectStore";
import { MAPPE_ROOT_PAGE_ID, type MappeObjectOp } from "./types";

export interface ApplyOptions {
  /**
   * Element, das die Person gerade selbst geöffnet bearbeitet (Textfeld oder
   * Tabelle). Dessen Eingaben werden nicht still überschrieben.
   */
  protectedObjectId?: string | null;
  /** Meldung, wenn eine fremde Änderung an diesem Element eintrifft. */
  onFieldConflict?: (objectId: string) => void;
}

function withPages(project: Project, pages: ProjectPage[]): Project {
  return { ...project, pages };
}

/** Gibt ein neues Projekt zurück oder null, wenn sich nichts geändert hat. */
export function applyMappeOp(
  project: Project,
  op: MappeObjectOp,
  options: ApplyOptions = {},
): Project | null {
  if (op.objectKind === "page") {
    const pages = project.pages ?? [];
    if (op.changeType === "delete") {
      if (!pages.some((p) => p.id === op.objectId)) return null;
      return withPages(project, pages.filter((p) => p.id !== op.objectId));
    }
    const payload = op.payload as (Record<string, unknown> & { __order?: number }) | null;
    if (!payload) return null;
    const { __order: order, ...rest } = payload;
    const existing = pages.find((p) => p.id === op.objectId);
    const next: ProjectPage = {
      ...(existing ?? ({ elements: [] } as unknown as ProjectPage)),
      ...(rest as unknown as ProjectPage),
      id: op.objectId,
      // Elemente bleiben in der Hoheit der Element-Operationen.
      elements: existing?.elements ?? [],
    };
    const list = existing
      ? pages.map((p) => (p.id === op.objectId ? next : p))
      : [...pages, next];
    if (typeof order === "number" && order >= 0 && order < list.length) {
      const idx = list.findIndex((p) => p.id === op.objectId);
      if (idx >= 0 && idx !== order) {
        const [moved] = list.splice(idx, 1);
        list.splice(order, 0, moved);
      }
    }
    return withPages(project, list);
  }

  // Elemente
  if (op.pageId === MAPPE_ROOT_PAGE_ID) return null;
  const page = (project.pages ?? []).find((p) => p.id === op.pageId);
  if (!page) return null;

  if (op.changeType === "delete") {
    if (!(page.elements ?? []).some((e) => e.id === op.objectId)) return null;
    return withPages(
      project,
      project.pages.map((p) =>
        p.id === op.pageId ? { ...p, elements: p.elements.filter((e) => e.id !== op.objectId) } : p,
      ),
    );
  }

  const payload = op.payload as unknown as PageElement | null;
  if (!payload) return null;
  const existing = (page.elements ?? []).find((e) => e.id === op.objectId);
  let incoming: PageElement = { ...payload, id: op.objectId };

  if (existing && options.protectedObjectId === op.objectId) {
    // Die Person tippt gerade selbst in diesem Element: Text- und
    // Tabelleninhalte bleiben erhalten, alles andere wird übernommen.
    incoming = { ...incoming, text: existing.text, tableData: existing.tableData };
    options.onFieldConflict?.(op.objectId);
  }

  const elements = existing
    ? page.elements.map((e) => (e.id === op.objectId ? incoming : e))
    : [...(page.elements ?? []), incoming];

  return withPages(
    project,
    project.pages.map((p) => (p.id === op.pageId ? { ...p, elements } : p)),
  );
}
