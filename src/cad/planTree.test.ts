import { describe, it, expect } from "vitest";
import { buildTree, flattenPageOrder, folderCheckState, toggleFolder, togglePage, orderedSelection, type PlanFolder, type TreePage } from "./planTree";
import { PlanManager } from "./PlanManager";

const folders: PlanFolder[] = [
  { id: "f1", name: "EG", parentId: null, order: 1, collapsed: false },
  { id: "f2", name: "Details", parentId: "f1", order: 2, collapsed: false },
];
const pages: TreePage[] = [
  { id: "p0", parentFolderId: null, order: 0 },
  { id: "p1", parentFolderId: "f1", order: 0 },
  { id: "p2", parentFolderId: "f2", order: 0 },
  { id: "p3", parentFolderId: null, order: 5 },
];

describe("planTree", () => {
  const tree = buildTree(folders, pages);
  it("flattens in visible order recursively", () => {
    expect(flattenPageOrder(tree)).toEqual(["p0", "p1", "p2", "p3"]);
  });
  it("folder tri-state and no duplicates", () => {
    const f1 = tree[1];
    let sel = toggleFolder(f1, new Set());
    expect(folderCheckState(f1, sel)).toBe("all");
    sel = togglePage("p2", sel);
    expect(folderCheckState(f1, sel)).toBe("partial");
    sel = togglePage("p2", sel); sel = togglePage("p3", sel);
    expect(orderedSelection(tree, sel)).toEqual(["p1", "p2", "p3"]);
  });
});

describe("PlanManager export tree", () => {
  it("serializes folders and new page fields, restores legacy plans", () => {
    const m = new PlanManager();
    const f = m.createFolder("Ordner");
    const p = m.createPlan({ formatKey: "a3", landscape: true, name: "Grundriss" });
    m.movePage(p.id, f.id, 0);
    const json = m.toJSON();
    const fj = m.foldersToJSON();
    const m2 = new PlanManager();
    m2.restore(json, fj);
    expect(m2.getById(p.id)?.parentFolderId).toBe(f.id);
    expect(m2.getById(p.id)?.name).toBe("Grundriss");
    expect(m2.listFolders()).toHaveLength(1);
    const legacy = new PlanManager();
    legacy.restore([{ id: "x", name: "Alt", formatKey: "a4", landscape: false, freeWidth: 1, freeHeight: 1, projections: [], selected: true } as any]);
    expect(legacy.getById("x")?.marginsMm).toBe(10);
    expect(legacy.getById("x")?.parentFolderId).toBeNull();
  });
  it("deleting a folder moves its content to the parent", () => {
    const m = new PlanManager();
    const f = m.createFolder("A");
    const p = m.createPlan({});
    m.movePage(p.id, f.id, 0);
    m.deleteFolder(f.id);
    expect(m.getById(p.id)?.parentFolderId).toBeNull();
  });
});
