import { describe, expect, it } from "vitest";
import { workspaceSaveStatus } from "./workspaceSaveStatus";
import { getProjectSyncState, registerProjectSyncSource, reportProjectSyncSource } from "./projectSync";
import { getLocalProjectSaveState, saveLocalScene } from "@/cad/persist/localScenePersist";

const local = { status: "saved" as const, savedAt: 100 };
const cloud = { mode: "local" as const, dirty: false, saving: false, error: null, lastSavedAt: 100, conflict: false, updateAvailable: false, deviceOnly: false };
describe("Gemeinsamer Speicherstatus", () => {
  it("zeigt Erfolg nur mit Geräte- und Cloudbestätigung", () => { expect(workspaceSaveStatus(local, cloud).complete).toBe(true); expect(workspaceSaveStatus({ status: "idle", savedAt: null }, cloud).complete).toBe(false); });
  it("leitet aus lokaler Speicherung keinen Cloud-Erfolg ab", () => { expect(workspaceSaveStatus(local, { ...cloud, lastSavedAt: null }).complete).toBe(false); });
  it("kennzeichnet ausstehende Änderungen", () => { expect(workspaceSaveStatus(local, { ...cloud, dirty: true }).complete).toBe(false); });
  it("zeigt bei laufender Übertragung keinen vollständigen Erfolg", () => { const s = workspaceSaveStatus(local, { ...cloud, saving: true }); expect(s.busy).toBe(true); expect(s.complete).toBe(false); });
  it("versteckt Gerätefehler nicht hinter Cloud-Erfolg", () => { const s = workspaceSaveStatus({ status: "quota", savedAt: 100 }, cloud); expect(s.localError).toBe(true); expect(s.complete).toBe(false); });
  it("zeigt Cloudfehler und Konflikt nicht als Erfolg", () => { expect(workspaceSaveStatus(local, { ...cloud, error: "Fehler" }).complete).toBe(false); expect(workspaceSaveStatus(local, { ...cloud, conflict: true }).complete).toBe(false); });
  it("interpretiert Live-Modus nicht als Bestätigung", () => { expect(workspaceSaveStatus(local, { ...cloud, mode: "live", lastSavedAt: null }).complete).toBe(false); });
  it("übernimmt nach Projektwechsel keine alte Cloudbestätigung", () => {
    const off = registerProjectSyncSource("status-A", "cad", { save: async () => {} });
    reportProjectSyncSource("status-A", "cad", cloud);
    expect(getProjectSyncState("status-A").lastSavedAt).toBe(100);
    expect(getProjectSyncState("status-B").lastSavedAt).toBeNull(); off();
  });
  it("ordnet auch lokale Speicherfehler nur dem betroffenen Projekt zu", async () => {
    await saveLocalScene("invalid-status-A", "invalid-json", 1, "test-local");
    expect(getLocalProjectSaveState("invalid-status-A").status).toBe("error");
    expect(getLocalProjectSaveState("status-B").status).toBe("idle");
  });
});