/**
 * Gemeinsamer Auswahlzustand der Organisation.
 *
 * Projektbezogene und projektübergreifende Organisation verwenden denselben
 * Zustand: Ein im Kalender, Ansichtstrahl, Projektnetz, Gantt oder in der
 * Beitragsliste gewählter Eintrag ist überall derselbe.
 */
import type { TlItem, TlPriority } from "@/lib/timelineStore";

export type OpsSelection =
  | { kind: "item"; projectId: string; itemId: string }
  | { kind: "time"; projectId: string; entryId: string; itemId?: string }
  | null;

export function sameSelection(a: OpsSelection, b: OpsSelection): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "item" && b.kind === "item") return a.projectId === b.projectId && a.itemId === b.itemId;
  if (a.kind === "time" && b.kind === "time") return a.entryId === b.entryId;
  return false;
}

export const isItemSelected = (sel: OpsSelection, projectId: string, itemId: string) =>
  !!sel && sel.kind === "item" && sel.projectId === projectId && sel.itemId === itemId;

export const isTimeSelected = (sel: OpsSelection, entryId: string) =>
  !!sel && sel.kind === "time" && sel.entryId === entryId;

/* ------------------------------------------------------ Sortieren/Filtern */

export type OpsSort = "priority" | "category";

export const OPS_SORTS: { id: OpsSort; label: string }[] = [
  { id: "priority", label: "Priorität" },
  { id: "category", label: "Kategorie" },
];

/**
 * Rang einer Priorität aus dem gespeicherten Prioritätsmodell – nicht
 * alphabetisch. Höherer Prozentwert = weiter oben; bei Gleichstand
 * entscheidet die gespeicherte Reihenfolge.
 */
export function priorityRank(priorities: TlPriority[], priorityId?: string): number {
  const idx = priorities.findIndex((p) => p.id === priorityId);
  if (idx < 0) return Number.MAX_SAFE_INTEGER;
  const p = priorities[idx];
  return (100 - (p.percent ?? 45)) * 1000 + idx;
}

/** Freitextfilter über Titel und Beschreibung, ohne Groß-/Kleinschreibung. */
export function matchesQuery(item: TlItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${item.title ?? ""} ${item.description ?? ""}`.toLowerCase().includes(q);
}

export function sortItems(
  items: TlItem[],
  sort: OpsSort,
  priorities: TlPriority[],
  categoryOrder: { id: string; label: string }[],
): TlItem[] {
  const catIndex = new Map(categoryOrder.map((c, i) => [c.id, i]));
  return [...items].sort((a, b) => {
    if (sort === "priority") {
      const d = priorityRank(priorities, a.priorityId) - priorityRank(priorities, b.priorityId);
      if (d) return d;
    } else {
      const ai = catIndex.get(a.categoryId ?? "") ?? Number.MAX_SAFE_INTEGER;
      const bi = catIndex.get(b.categoryId ?? "") ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
    }
    return (a.startDate ?? "").localeCompare(b.startDate ?? "");
  });
}
