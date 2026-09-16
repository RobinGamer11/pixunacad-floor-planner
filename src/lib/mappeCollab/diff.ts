/**
 * Vergleich zweier Projektmappen-Stände je Objekt.
 *
 * Verglichen werden ausschließlich einzelne Seiten und einzelne Elemente –
 * niemals die komplette Projektmappe. Dadurch überträgt jede Bearbeitung nur
 * das tatsächlich betroffene Objekt.
 */
import type { PageElement, Project, ProjectPage } from "@/lib/projectStore";
import { MAPPE_ROOT_PAGE_ID, type LocalMappeOp, type MappeObjectKind } from "./types";

/** pageId → objectId → { kind, json } */
export type MappeIndex = Map<string, Map<string, { kind: MappeObjectKind; json: string }>>;

function put(index: MappeIndex, pageId: string, objectId: string, kind: MappeObjectKind, value: unknown) {
  let byId = index.get(pageId);
  if (!byId) { byId = new Map(); index.set(pageId, byId); }
  byId.set(objectId, { kind, json: JSON.stringify(value) });
}

/** Erzeugt den Vergleichsindex eines Projekts. */
export function indexProject(project: Project | null | undefined): MappeIndex {
  const index: MappeIndex = new Map();
  if (!project) return index;
  (project.pages ?? []).forEach((page: ProjectPage, order: number) => {
    // Seite ohne ihre Elemente: Titel, Format, Reihenfolge, Überlagerungen.
    const { elements: _elements, ...rest } = page as ProjectPage & { elements?: PageElement[] };
    put(index, MAPPE_ROOT_PAGE_ID, page.id, "page", { ...rest, __order: order });
    (page.elements ?? []).forEach((el: PageElement) => {
      put(index, page.id, el.id, "element", el);
    });
  });
  return index;
}

/** Ermittelt die einzelnen Änderungen zwischen zwei Ständen. */
export function diffMappeIndexes(before: MappeIndex, after: MappeIndex): LocalMappeOp[] {
  const ops: LocalMappeOp[] = [];

  for (const [pageId, byId] of after) {
    const old = before.get(pageId);
    for (const [objectId, entry] of byId) {
      const prev = old?.get(objectId);
      if (prev && prev.json === entry.json) continue;
      ops.push({
        pageId,
        objectId,
        objectKind: entry.kind,
        changeType: prev ? "update" : "create",
        payload: JSON.parse(entry.json) as Record<string, unknown>,
      });
    }
  }

  for (const [pageId, byId] of before) {
    const next = after.get(pageId);
    for (const [objectId, entry] of byId) {
      if (next?.has(objectId)) continue;
      ops.push({ pageId, objectId, objectKind: entry.kind, changeType: "delete", payload: null });
    }
  }

  // Seiten zuerst: ein Element darf nie vor seiner Seite ankommen.
  ops.sort((a, b) => Number(b.objectKind === "page") - Number(a.objectKind === "page"));
  return ops;
}
