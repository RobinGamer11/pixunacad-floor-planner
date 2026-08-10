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

function seedProject(mappeHelpOn?: boolean, isTemplate = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    projects: [{
      id: "project-help",
      name: isTemplate ? "Hilfetest (Vorlage)" : "Hilfetest",
      ort: "",
      thumbnail: "",
      updatedAt: "2026-08-10T00:00:00.000Z",
      pages: [],
      sheets: [],
      tasks: [],
      events: [],
      isTemplate,
      settings: mappeHelpOn === undefined ? {} : { mappeHelpOn },
    }],
    folders: [],
    profile: {},
  }));
}

describe("projektbezogene Mappenhilfe", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
    vi.resetModules();
  });

  it("speichert die manuelle Auswahl dauerhaft, ohne einen Undo-Schritt anzulegen", async () => {
    seedProject();
    let module = await import("./projectStore");

    expect(module.projectStore.setMappeHelpOn("project-help", false)).toBe(true);
    expect(module.projectStore.getState().projects[0].settings?.mappeHelpOn).toBe(false);
    expect(module.projectStore.canUndo("project-help")).toBe(false);

    vi.resetModules();
    module = await import("./projectStore");
    expect(module.projectStore.getState().projects[0].settings?.mappeHelpOn).toBe(false);
  });

  it("aktiviert die Hilfe für ein neu aus einer Vorlage erzeugtes Projekt", async () => {
    seedProject(false, true);
    const { projectStore } = await import("./projectStore");

    const newId = projectStore.createFromTemplate("project-help");
    const created = projectStore.getState().projects.find((project) => project.id === newId);

    expect(created?.settings?.mappeHelpOn).toBe(true);
  });
});
