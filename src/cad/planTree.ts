/**
 * planTree.ts — reine Baumlogik für den Exportbereich.
 *
 * Exportseite = erweiterter `Plan`, Ordner = `PlanFolder`. Die sichtbare
 * Baum-Reihenfolge ist zugleich die Export-/PDF-Reihenfolge.
 * Die Exportauswahl ist temporärer UI-Zustand (Set von Seiten-IDs) und wird
 * nie gespeichert.
 */

export interface PlanFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

export interface TreePage {
  id: string;
  parentFolderId: string | null;
  order: number;
}

export type TreeNode =
  | { kind: "folder"; folder: PlanFolder; depth: number; children: TreeNode[] }
  | { kind: "page"; pageId: string; depth: number };

export function buildTree(folders: PlanFolder[], pages: TreePage[]): TreeNode[] {
  const folderIds = new Set(folders.map(f => f.id));
  const build = (parentId: string | null, depth: number, seen: Set<string>): TreeNode[] => {
    const items: { order: number; node: TreeNode }[] = [];
    for (const f of folders) {
      const pid = f.parentId && folderIds.has(f.parentId) ? f.parentId : null;
      if (pid !== parentId || seen.has(f.id)) continue;
      const nextSeen = new Set(seen); nextSeen.add(f.id);
      items.push({ order: f.order, node: { kind: "folder", folder: f, depth, children: build(f.id, depth + 1, nextSeen) } });
    }
    for (const p of pages) {
      const pid = p.parentFolderId && folderIds.has(p.parentFolderId) ? p.parentFolderId : null;
      if (pid !== parentId) continue;
      items.push({ order: p.order, node: { kind: "page", pageId: p.id, depth } });
    }
    items.sort((a, b) => a.order - b.order);
    return items.map(i => i.node);
  };
  return build(null, 0, new Set());
}

/** Alle Seiten-IDs in sichtbarer Baum-Reihenfolge (rekursiv). */
export function flattenPageOrder(tree: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.kind === "page") out.push(n.pageId);
      else walk(n.children);
    }
  };
  walk(tree);
  return out;
}

export function pagesInFolder(node: TreeNode): string[] {
  return node.kind === "page" ? [node.pageId] : flattenPageOrder(node.children);
}

export type CheckState = "none" | "all" | "partial";

export function folderCheckState(node: TreeNode, selected: Set<string>): CheckState {
  const ids = pagesInFolder(node);
  if (ids.length === 0) return "none";
  const n = ids.filter(id => selected.has(id)).length;
  return n === 0 ? "none" : n === ids.length ? "all" : "partial";
}

/** Ordner-Klick: alle wählen, wenn nicht alle gewählt; sonst alle abwählen. */
export function toggleFolder(node: TreeNode, selected: Set<string>): Set<string> {
  const next = new Set(selected);
  const ids = pagesInFolder(node);
  const all = folderCheckState(node, selected) === "all";
  for (const id of ids) { if (all) next.delete(id); else next.add(id); }
  return next;
}

export function togglePage(pageId: string, selected: Set<string>): Set<string> {
  const next = new Set(selected);
  if (next.has(pageId)) next.delete(pageId); else next.add(pageId);
  return next;
}

/** Export-Reihenfolge: nur gewählte Seiten, Baum-Reihenfolge, ohne Duplikate. */
export function orderedSelection(tree: TreeNode[], selected: Set<string>): string[] {
  return flattenPageOrder(tree).filter(id => selected.has(id));
}
