import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveProjectToCloud, registerProjectSyncSource, reportProjectSyncSource } from "./projectSync";
vi.mock("./projectRegistration", () => ({ ensureSharedProject: async () => ({ ok: true }) }));
vi.mock("./projectStore", () => ({ projectStore: { getState: () => ({ projects: [{ id: "save-test", name: "Mustervorlage" }] }) } }));
vi.mock("./projectMetadata", () => ({ saveProjectMetadata: async () => {} }));
vi.mock("./accountStorage", () => ({ flushAccountWrites: async () => {} }));
beforeEach(() => { vi.useRealTimers(); });
describe("Verbindliches Cloud-Sicherungsresultat", () => {
  it("does not report a loading source as success", async () => {
    const off = registerProjectSyncSource("save-test", "cad", { save: vi.fn(async () => {}) });
    await expect(saveProjectToCloud("save-test")).rejects.toThrow(); off();
  });
  it("propagates a failed content source", async () => {
    const off = registerProjectSyncSource("save-test", "cad", { save: async () => { throw new Error("Übertragung fehlgeschlagen"); } });
    reportProjectSyncSource("save-test", "cad", { ready: true });
    await expect(saveProjectToCloud("save-test")).rejects.toThrow("Übertragung fehlgeschlagen"); off();
  });
  it("requires an actual acknowledgement even when save returns", async () => {
    const off = registerProjectSyncSource("save-test", "cad", { save: async () => {} });
    reportProjectSyncSource("save-test", "cad", { ready: true });
    await expect(saveProjectToCloud("save-test")).rejects.toThrow("Cloud-Sicherung nicht bestätigt"); off();
  });
  it("accepts an already confirmed unchanged source", async () => {
    const off = registerProjectSyncSource("save-test", "cad", { save: async () => {} });
    reportProjectSyncSource("save-test", "cad", { ready: true, lastSavedAt: 123 });
    await expect(saveProjectToCloud("save-test")).resolves.toBeUndefined(); off();
  });
  it("does not succeed without a content source", async () => {
    vi.useFakeTimers();
    const outcome = expect(saveProjectToCloud("missing-source")).rejects.toThrow("Keine verfügbare Speicherquelle");
    await vi.advanceTimersByTimeAsync(8000);
    await outcome;
  });
});