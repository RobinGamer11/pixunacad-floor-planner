import { describe, expect, it } from "vitest";
import { decideOpen } from "./cloudProjectState";
import { indexSnapshot } from "./cadCollab/sceneDiff";
import { CAD_STRUCTURE_SHEET_ID } from "./cadCollab/types";
import { indexProject } from "./mappeCollab/diff";
import { applyMappeOp } from "./mappeCollab/apply";
import { MAPPE_META_ID, MAPPE_ROOT_PAGE_ID } from "./mappeCollab/types";
import type { Project } from "./projectStore";

const base = { hasBaseline: false, localContent: 0, remoteLive: 0, pending: 0, remoteChanged: false };

describe("decideOpen – zwei Geräte, dasselbe Konto", () => {
  it("neues Gerät mit Leerstand übernimmt den Cloudstand", () => {
    expect(decideOpen({ ...base, remoteLive: 5, pending: 1 })).toBe("apply");
  });
  it("lokaler Leerstand überschreibt nie den Cloudstand", () => {
    expect(decideOpen({ ...base, remoteLive: 5 })).not.toBe("deviceOnly");
  });
  it("altes lokales Projekt ohne Cloudstand bleibt 'nur auf diesem Gerät'", () => {
    expect(decideOpen({ ...base, localContent: 3, pending: 3 })).toBe("deviceOnly");
  });
  it("zwei unterschiedliche Stände werden nie automatisch vermischt", () => {
    expect(decideOpen({ ...base, localContent: 3, remoteLive: 4, pending: 3 })).toBe("conflict");
  });
  it("Gerät B lädt nach Sicherung auf Gerät A, wenn lokal nichts offen ist", () => {
    expect(decideOpen({ ...base, hasBaseline: true, localContent: 3, remoteLive: 4, remoteChanged: true })).toBe("apply");
  });
  it("offene Änderungen werden nie still überschrieben", () => {
    expect(decideOpen({ ...base, hasBaseline: true, localContent: 3, remoteLive: 4, pending: 1, remoteChanged: true }))
      .toBe("updateAvailable");
  });
  it("leerer Cloudstand gilt nie als verbindlich", () => {
    expect(decideOpen({ ...base })).toBe("apply");
    expect(decideOpen({ ...base, localContent: 1, pending: 1 })).toBe("deviceOnly");
  });
});

describe("Strukturobjekte", () => {
  it("CAD: Blätter und Ebenen werden objektweise erfasst", () => {
    const idx = indexSnapshot(JSON.stringify({
      scenesById: { s1: {}, s2: {} },
      sheets: [{ id: "s1", name: "A" }, { id: "s2", name: "B" }],
      labels: [{ id: "l1", name: "Wände" }],
    }));
    const st = idx.get(CAD_STRUCTURE_SHEET_ID);
    expect([...(st?.get("sheets")?.keys() ?? [])]).toEqual(["s1", "s2"]);
    expect(st?.get("labels")?.has("l1")).toBe(true);
  });

  it("Mappe: Projektmetadaten ohne Geräteoberfläche", () => {
    const project = {
      id: "p", name: "Haus", ort: "", thumbnail: "x", updatedAt: "", pages: [], sheets: [],
      tasks: [], events: [], activeMappeId: "m1", sortIndex: 3, favorite: true,
    } as unknown as Project;
    const meta = JSON.parse(indexProject(project).get(MAPPE_ROOT_PAGE_ID)!.get(MAPPE_META_ID)!.json);
    expect(meta.name).toBe("Haus");
    expect(meta).not.toHaveProperty("activeMappeId");
    expect(meta).not.toHaveProperty("sortIndex");
    expect(meta).not.toHaveProperty("thumbnail");

    const next = applyMappeOp(project, {
      id: "o", projectId: "p", pageId: MAPPE_ROOT_PAGE_ID, objectId: MAPPE_META_ID, objectKind: "meta",
      changeType: "update", payload: { name: "Neu" }, objectVersion: 1, actorId: null, createdAt: "", seq: 1,
    });
    expect(next?.name).toBe("Neu");
    expect(next?.activeMappeId).toBe("m1");
  });
});
