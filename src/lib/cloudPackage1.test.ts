// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";

const memStorage = new Map<string, string>();
if (typeof globalThis.localStorage === "undefined") {
  const storage: Storage = {
    get length() { return memStorage.size; },
    clear: () => memStorage.clear(),
    getItem: (k: string) => memStorage.get(k) ?? null,
    key: (i: number) => Array.from(memStorage.keys())[i] ?? null,
    removeItem: (k: string) => { memStorage.delete(k); },
    setItem: (k: string, v: string) => { memStorage.set(k, String(v)); },
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = storage;
  if (typeof globalThis.window === "undefined") {
    (globalThis as unknown as { window: { localStorage: Storage } }).window = { localStorage: storage };
  }
}

import { classifyCloudError, isAuthExpiredError } from "./networkClient";
import { applyHomePayload, buildHomePayload, readHomeMeta } from "./homeProjectSync";
import { projectStore } from "./projectStore";
import { timelineStore } from "./timelineStore";

describe("Paket 1: Cloud-Auth, Organisation, Dokumente & Status", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("erkennt abgelaufene Anmeldung (401 / PGRST303) und trennt Fehlerursachen", () => {
    expect(isAuthExpiredError({ code: "PGRST303", message: "JWT expired" })).toBe(true);
    expect(isAuthExpiredError({ status: 401 })).toBe(true);
    expect(classifyCloudError({ code: "PGRST303", message: "JWT expired" }).kind).toBe("auth");
    expect(classifyCloudError({ status: 403, message: "permission denied" }).kind).toBe("forbidden");
    expect(classifyCloudError(new Error("Failed to fetch")).kind).toBe("offline");
    expect(classifyCloudError({ code: "42P01", message: "relation does not exist" }).kind).toBe("schema");
  });

  it("markiert ein nicht ausgewähltes Projekt sofort als geändert, wenn Organisationsdaten bearbeitet werden", () => {
    const pid = "p-org-unselected";
    timelineStore.addItem(pid, "task", { title: "Statik prüfen", startDate: "2026-11-26" });
    const meta = readHomeMeta(pid);
    expect(meta.dirty).toBe(true);
    expect(meta.dirtyAreas?.organization).toBe(true);
    expect(meta.localSavedAt).not.toBeNull();
  });

  it("überträgt tatsächliche Organisationsdaten und Dateireferenzen ohne Base64 im Home-Payload", () => {
    const pid = "p-cloud-pkg1-test";
    projectStore.ensureCloudStub(pid, "Testprojekt Cloud");
    timelineStore.addItem(pid, "contribution", { title: "Baustellenbesprechung", startDate: "2026-12-01" });
    const existing = projectStore.getState().projects.find((p) => p.id === pid)!;
    const fileId = "fn-test-1";
    projectStore.applySharedProject({
      ...existing,
      files: [
        {
          id: fileId,
          kind: "file",
          name: "plan.pdf",
          createdAt: "2026-11-25T20:00:00.000Z",
          parentId: null,
          dataUrl: "data:application/pdf;base64,JVBERi0xLjQ=",
          mimeType: "application/pdf",
          sizeBytes: 1234,
          storageBucket: "project-attachments",
          storagePath: `${pid}/docs/${fileId}-plan.pdf`,
          cloudSynced: true,
        },
      ],
    });

    const payload = buildHomePayload(pid);
    expect(payload).not.toBeNull();
    expect(payload?.timeline?.items.some((i) => i.title === "Baustellenbesprechung")).toBe(true);
    expect(payload?.files[0]?.storagePath).toBe(`${pid}/docs/${fileId}-plan.pdf`);
    expect((payload?.files[0] as Record<string, unknown>)?.dataUrl).toBeUndefined();
  });

  it("überschreibt bestehende lokale Organisationsdaten nicht durch einen leeren Cloudstand", () => {
    const pid = "p-cloud-pkg1-protect";
    projectStore.ensureCloudStub(pid, "Lokal geschützt");
    timelineStore.addItem(pid, "task", { title: "Lokale Aufgabe", startDate: "2026-11-28" });
    applyHomePayload(pid, {
      timeline: { categories: [], priorities: [], statuses: [], items: [], period: {} },
    });
    expect(timelineStore.getState(pid).items.some((i) => i.title === "Lokale Aufgabe")).toBe(true);
  });
});