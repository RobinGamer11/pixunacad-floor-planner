// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "pixuna.projects.v3";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function projectWithDocuments(files: unknown[], photos: unknown[] = []) {
  return {
    id: "project-documents",
    name: "Dokumententest",
    ort: "Bonn",
    thumbnail: "",
    updatedAt: "2026-08-10T00:00:00.000Z",
    pages: [],
    sheets: [],
    tasks: [],
    events: [],
    files,
    photos,
  };
}

function seedProject(files: unknown[], photos: unknown[] = []) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    projects: [projectWithDocuments(files, photos)],
    folders: [],
    profile: {},
  }));
}

describe("gemeinsame Dokumentenablage", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
    vi.resetModules();
  });

  it("migriert verschachtelte Legacy-Fotos verlustfrei und kollisionssicher", async () => {
    seedProject(
      [{ id: "same", kind: "folder", name: "Dateiordner", createdAt: "1", parentId: null }],
      [
        { id: "same", kind: "folder", name: "Fotoordner", createdAt: "2", parentId: null },
        {
          id: "photo",
          kind: "file",
          name: "bestand.png",
          createdAt: "3",
          parentId: "same",
          dataUrl: "data:image/png;base64,unchanged",
          mimeType: "image/png",
          sizeBytes: 42,
        },
      ]
    );

    const { projectStore } = await import("./projectStore");
    const project = projectStore.getState().projects[0];
    const migratedFolder = project.files?.find((node) => node.name === "Fotoordner");
    const migratedPhoto = project.files?.find((node) => node.id === "photo");

    expect(project.photos).toEqual([]);
    expect(project.files).toHaveLength(3);
    expect(migratedFolder?.id).toBe("legacy-photo-same");
    expect(migratedPhoto?.parentId).toBe("legacy-photo-same");
    expect(migratedPhoto?.dataUrl).toBe("data:image/png;base64,unchanged");
  });

  it("bewahrt bestehende Dokumente und bleibt nach dem Persistieren idempotent", async () => {
    const original = {
      id: "existing-file",
      kind: "file",
      name: "lageplan.pdf",
      createdAt: "1",
      parentId: null,
      dataUrl: "data:application/pdf;base64,unchanged",
      mimeType: "application/pdf",
      sizeBytes: 100,
    };
    seedProject([original]);

    let module = await import("./projectStore");
    expect(module.projectStore.getState().projects[0].files).toEqual([original]);

    module.projectStore.renameNode("project-documents", "files", "existing-file", original.name);
    vi.resetModules();
    module = await import("./projectStore");

    expect(module.projectStore.getState().projects[0].files).toEqual([original]);
    expect(module.projectStore.getState().projects[0].photos).toEqual([]);
  });

  it("vergibt auch bei doppelten Legacy-IDs eindeutige neue IDs", async () => {
    seedProject([], [
      { id: "duplicate", kind: "file", name: "eins.png", createdAt: "1", parentId: null },
      { id: "duplicate", kind: "file", name: "zwei.png", createdAt: "2", parentId: null },
    ]);

    const { projectStore } = await import("./projectStore");
    const ids = projectStore.getState().projects[0].files?.map((node) => node.id) ?? [];

    expect(new Set(ids).size).toBe(2);
  });

  it("übernimmt einen Upload bei ausgeschöpftem Browser-Speicher nicht nur scheinbar", async () => {
    seedProject([]);
    const { projectStore } = await import("./projectStore");
    const rejectingStorage = new MemoryStorage();
    rejectingStorage.setItem = () => { throw new Error("quota exceeded"); };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: rejectingStorage,
    });

    const id = projectStore.addFile("project-documents", "files", null, {
      name: "zu-gross.pdf",
      dataUrl: "data:application/pdf;base64,large",
      mimeType: "application/pdf",
      sizeBytes: 10_000_000,
    });

    expect(id).toBeUndefined();
    expect(projectStore.getState().projects[0].files).toEqual([]);
  });

  it("rollt auch Ordner-, Namens-, Sortier- und Löschänderungen bei Speicherfehlern zurück", async () => {
    seedProject([
      { id: "folder", kind: "folder", name: "Ordner", createdAt: "1", parentId: null },
      { id: "file-a", kind: "file", name: "A.pdf", createdAt: "2", parentId: null },
      { id: "file-b", kind: "file", name: "B.pdf", createdAt: "3", parentId: null },
    ]);
    const { projectStore } = await import("./projectStore");
    const before = projectStore.getState().projects[0].files;
    const rejectingStorage = new MemoryStorage();
    rejectingStorage.setItem = () => { throw new Error("quota exceeded"); };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: rejectingStorage,
    });

    expect(projectStore.addFolder("project-documents", "files", null)).toBeUndefined();
    expect(projectStore.renameNode("project-documents", "files", "file-a", "Neu.pdf")).toBe(false);
    expect(projectStore.moveNodeOrder("project-documents", "files", "file-b", -1)).toBe(false);
    expect(projectStore.moveFileNode("project-documents", "file-b", "folder")).toBe(false);
    expect(projectStore.deleteNode("project-documents", "files", "file-a")).toBe(false);
    expect(projectStore.getState().projects[0].files).toEqual(before);
  });

  it("belässt auch einen fehlgeschlagenen Undo-Schritt vollständig in Zustand und Verlauf", async () => {
    seedProject([
      { id: "file", kind: "file", name: "Plan.pdf", createdAt: "1", parentId: null },
    ]);
    const { projectStore } = await import("./projectStore");
    expect(projectStore.deleteNode("project-documents", "files", "file")).toBe(true);
    expect(projectStore.canUndo("project-documents")).toBe(true);

    const rejectingStorage = new MemoryStorage();
    rejectingStorage.setItem = () => { throw new Error("quota exceeded"); };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: rejectingStorage,
    });

    expect(projectStore.undo("project-documents")).toBe(false);
    expect(projectStore.getState().projects[0].files).toEqual([]);
    expect(projectStore.canUndo("project-documents")).toBe(true);
    expect(projectStore.canRedo("project-documents")).toBe(false);
  });

  it("verschiebt Dokumente und verhindert Ordnerzyklen", async () => {
    seedProject([
      { id: "folder-a", kind: "folder", name: "A", createdAt: "1", parentId: null },
      { id: "folder-b", kind: "folder", name: "B", createdAt: "2", parentId: "folder-a" },
      { id: "file-a", kind: "file", name: "A.pdf", createdAt: "3", parentId: null },
      { id: "file-b", kind: "file", name: "B.pdf", createdAt: "4", parentId: null },
    ]);

    const { projectStore } = await import("./projectStore");

    expect(projectStore.moveFileNode("project-documents", "file-b", null, "file-a")).toBe(true);
    expect(projectStore.getState().projects[0].files?.filter((node) => node.kind === "file").map((node) => node.id))
      .toEqual(["file-b", "file-a"]);

    expect(projectStore.moveFileNode("project-documents", "file-b", "folder-a")).toBe(true);
    expect(projectStore.getState().projects[0].files?.find((node) => node.id === "file-b")?.parentId)
      .toBe("folder-a");

    expect(projectStore.moveFileNode("project-documents", "folder-a", "folder-b")).toBe(false);
    expect(projectStore.getState().projects[0].files?.find((node) => node.id === "folder-a")?.parentId)
      .toBeNull();

    expect(projectStore.moveFileNode("project-documents", "file-b", null)).toBe(true);
    expect(projectStore.getState().projects[0].files?.find((node) => node.id === "file-b")?.parentId)
      .toBeNull();

    expect(projectStore.moveFileNode("project-documents", "folder-b", null, "folder-a")).toBe(true);
    expect(projectStore.getState().projects[0].files?.filter((node) => node.kind === "folder" && node.parentId === null).map((node) => node.id))
      .toEqual(["folder-b", "folder-a"]);
  });
});
