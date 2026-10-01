// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { stripLegacyMappe } from "./legacyMappeMigration";

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

const SHEETS = [{ id: "s1", name: "EG", scale: "1:100", sceneJson: "{\"segments\":[{\"id\":\"a\"}]}" }];

/** Altbestand (ohne Versionsstempel) mit früheren Mappenfeldern. */
function seedLegacy(settings: Record<string, unknown> = {}, isTemplate = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    projects: [{
      id: "p-old",
      name: isTemplate ? "Alt (Vorlage)" : "Alt",
      ort: "", thumbnail: "", updatedAt: "2026-08-10T00:00:00.000Z",
      pages: [{ id: "pg1", title: "01", format: "A4-hoch", margins: 20, background: false, elements: [] }],
      mappen: [{ id: "m1", name: "Hauptmappe", pageIds: ["pg1"] }],
      activeMappeId: "m1",
      textSpanTemplates: [{ groupId: "g", box: {} }],
      sheets: SHEETS, tasks: [], events: [], isTemplate,
      settings,
    }],
    folders: [], profile: {},
  }));
}

describe("Entfernung der früheren Projektmappe", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
    vi.resetModules();
  });

  it("entfernt alte Mappenfelder beim Laden, CAD-Blätter bleiben unverändert", async () => {
    seedLegacy();
    const { projectStore } = await import("./projectStore");
    const p = projectStore.getState().projects[0] as unknown as Record<string, unknown>;
    expect(p).not.toHaveProperty("pages");
    expect(p).not.toHaveProperty("mappen");
    expect(p).not.toHaveProperty("activeMappeId");
    expect(p).not.toHaveProperty("textSpanTemplates");
    const sheet = (p.sheets as typeof SHEETS)[0];
    expect(sheet.id).toBe("s1");
    expect(JSON.parse(sheet.sceneJson).segments[0].id).toBe("a");
  });

  it("übernimmt die alte Hilfe-Einstellung einmalig als helpOn", async () => {
    seedLegacy({ mappeHelpOn: false });
    const { projectStore } = await import("./projectStore");
    const settings = projectStore.getState().projects[0].settings as Record<string, unknown>;
    expect(settings.helpOn).toBe(false);
    expect(settings).not.toHaveProperty("mappeHelpOn");
  });

  it("neue Projekte erzeugen keine Mappe", async () => {
    const { projectStore } = await import("./projectStore");
    const id = projectStore.createProject();
    const p = projectStore.getState().projects.find((x) => x.id === id) as unknown as Record<string, unknown>;
    expect(p).not.toHaveProperty("pages");
    expect(p).not.toHaveProperty("mappen");
    expect((p.settings as Record<string, unknown>).helpOn).toBe(true);
  });

  it("ein alter Cloud-Stand bringt die Mappe nicht zurück", async () => {
    const { projectStore } = await import("./projectStore");
    projectStore.applySharedProject({
      id: "p-cloud", name: "Cloud", ort: "", thumbnail: "", updatedAt: "",
      sheets: SHEETS, tasks: [], events: [],
      pages: [{ id: "x" }], mappen: [{ id: "m" }], activeMappeId: "m",
    } as never);
    const p = projectStore.getState().projects.find((x) => x.id === "p-cloud") as unknown as Record<string, unknown>;
    expect(p).not.toHaveProperty("pages");
    expect(p).not.toHaveProperty("mappen");
    expect(p.sheets).toMatchObject(SHEETS);
  });

  it("speichert die Hilfe dauerhaft ohne Undo-Schritt", async () => {
    seedLegacy();
    let mod = await import("./projectStore");
    expect(mod.projectStore.setHelpOn("p-old", false)).toBe(true);
    expect(mod.projectStore.canUndo("p-old")).toBe(false);
    vi.resetModules();
    mod = await import("./projectStore");
    expect(mod.projectStore.getState().projects[0].settings?.helpOn).toBe(false);
  });

  it("aktiviert die Hilfe für ein neu aus einer Vorlage erzeugtes Projekt", async () => {
    seedLegacy({ helpOn: false }, true);
    const { projectStore } = await import("./projectStore");
    const newId = projectStore.createFromTemplate("p-old");
    expect(projectStore.getState().projects.find((p) => p.id === newId)?.settings?.helpOn).toBe(true);
  });

  it("Bereinigung ist idempotent und lässt CAD-/Exportfelder unberührt", () => {
    const cad = { scenesById: { s1: {} }, planScenesById: { e1: {} }, sheets: SHEETS };
    const once = stripLegacyMappe({ ...cad, pages: [], settings: { mappeHelpOn: true } });
    expect(stripLegacyMappe(once)).toEqual(once);
    expect(once).toMatchObject(cad);
  });
});
