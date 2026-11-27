// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";

const mem = new Map<string, string>();
const storageStub = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  get length() { return mem.size; },
};
(globalThis as any).localStorage = storageStub;
(globalThis as any).window = { localStorage: storageStub };

import { Scene } from "@/cad/Scene";
import { applyOpToScene } from "./cadCollab/applyOps";
import {
  flushPendingStorageDeletions,
  queuePendingStorageDeletion,
  readPendingStorageDeletions,
} from "./projectFileStorage";
import { projectStore } from "./projectStore";
import { timelineStore } from "./timelineStore";
import { applyHomePayload, buildHomePayload } from "./homeProjectSync";

describe("Regression: Cloud-Korrekturen", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("erhält bestehende infoBoxCategories bei Einzel-Operationen auf anderen Objekten", () => {
    const scene = new Scene();
    (scene as any).infoBoxCategories = [
      { id: "cat-1", name: "Mangel", color: "#ef4444" },
      { id: "cat-2", name: "Hinweis", color: "#3b82f6" },
    ];

    applyOpToScene(scene, "segments", "seg-1", "create", {
      id: "seg-1",
      a: { x: 0, y: 0 },
      b: { x: 1, y: 0 },
    });

    expect((scene as any).infoBoxCategories).toHaveLength(2);
    expect((scene as any).infoBoxCategories.map((c: any) => c.id)).toEqual(["cat-1", "cat-2"]);
  });

  it("pflegt infoBoxCategories per create, update und delete gezielt nach ID ein", () => {
    const scene = new Scene();
    (scene as any).infoBoxCategories = [{ id: "cat-1", name: "Alt", color: "#111111" }];

    applyOpToScene(scene, "infoBoxCategories", "cat-2", "create", {
      id: "cat-2",
      name: "Neu",
      color: "#22c55e",
    });
    expect((scene as any).infoBoxCategories).toHaveLength(2);

    applyOpToScene(scene, "infoBoxCategories", "cat-1", "update", {
      id: "cat-1",
      name: "Aktualisiert",
      color: "#f59e0b",
    });
    expect((scene as any).infoBoxCategories.find((c: any) => c.id === "cat-1")?.name).toBe("Aktualisiert");
    expect((scene as any).infoBoxCategories).toHaveLength(2);

    applyOpToScene(scene, "infoBoxCategories", "cat-2", "delete", null);
    expect((scene as any).infoBoxCategories.map((c: any) => c.id)).toEqual(["cat-1"]);
  });

  it("übernimmt bewusst geleerte Organisationslisten und schützt fehlende Altdatenfelder", () => {
    const id = projectStore.createProject();
    timelineStore.replaceState(id, {
      items: [
        {
          id: "t1",
          title: "Baustellenbesuch",
          kind: "task",
          status: "offen",
          priority: "normal",
          categoryId: "allgemein",
          start: "2026-11-27",
          end: "2026-11-27",
        } as any,
      ],
      categories: [],
      priorities: [],
      statuses: [],
      period: {},
    });
    expect(timelineStore.getState(id).items).toHaveLength(1);

    // Fehlendes timeline-Feld (Altbestand) lässt lokale Daten unberührt
    applyHomePayload(id, { details: { ort: "Hamburg" } });
    expect(timelineStore.getState(id).items).toHaveLength(1);

    // Explizit leere Liste übernimmt die Löschung
    applyHomePayload(id, {
      timeline: { items: [], categories: [], priorities: [], statuses: [], period: {} },
    });
    expect(timelineStore.getState(id).items).toHaveLength(0);
  });

  it("trennt persönliche Projektstruktur (favorite/folderId/sortIndex) vom gemeinsamen Payload", () => {
    const id = projectStore.createProject();
    projectStore.updateProject(id, { favorite: true, folderId: "folder-a", sortIndex: 3 });

    const payload = buildHomePayload(id);
    expect(payload?.details.favorite).toBeUndefined();
    expect(payload?.details.folderId).toBeUndefined();
    expect(payload?.details.sortIndex).toBeUndefined();

    applyHomePayload(id, {
      details: { ort: "Köln", favorite: false, folderId: null, sortIndex: 99 },
    });
    const updated = projectStore.getState().projects.find((p) => p.id === id);
    expect(updated?.ort).toBe("Köln");
    expect(updated?.favorite).toBe(true);
    expect(updated?.folderId).toBe("folder-a");
    expect(updated?.sortIndex).toBe(3);
  });

  it("merkt Cloud-Dateilöschungen vor und löscht noch referenzierte Pfade nicht", async () => {
    const id = projectStore.createProject();
    const node = {
      id: "f1",
      kind: "file" as const,
      name: "plan.pdf",
      parentId: null,
      createdAt: "2026-11-27T00:00:00Z",
      storageBucket: "attachments",
      storagePath: `${id}/docs/f1-plan.pdf`,
      cloudSynced: true,
    };
    projectStore.applySharedProject({
      ...projectStore.getState().projects.find((p) => p.id === id)!,
      files: [node],
    });

    queuePendingStorageDeletion(id, node);
    expect(readPendingStorageDeletions(id)).toHaveLength(1);

    // Da die Datei noch im Projekt referenziert ist, wird sie nicht aus Storage entfernt
    const res = await flushPendingStorageDeletions(id);
    expect(res.deleted).toBe(0);
    expect(res.failed).toEqual([]);
    expect(readPendingStorageDeletions(id)).toHaveLength(0);
  });
});