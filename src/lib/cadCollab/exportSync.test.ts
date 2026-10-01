import { describe, it, expect } from "vitest";
import { diffSnapshots, indexSnapshot } from "./sceneDiff";
import { CAD_STRUCTURE_SHEET_ID } from "./types";

const base = {
  scenesById: { s1: { segments: [] } },
  sheets: [{ id: "s1", name: "EG" }],
  labels: [],
  plans: [] as unknown[],
  planFolders: [] as unknown[],
  planOverlays: {} as Record<string, unknown>,
  planScenesById: {} as Record<string, unknown>,
};

describe("Export-Strukturen in der objektweisen Synchronisierung", () => {
  it("erzeugt Einzeloperationen für Seiten, Ordner, Transparenzpause und Anmerkungen", () => {
    const next = {
      ...base,
      plans: [{ id: "p1", name: "Seite 1", projections: [{ id: "x", sourceSheetId: "s1", mode: "linked", sceneSnapshot: null }] }],
      planFolders: [{ id: "f1", name: "Ordner" }],
      planOverlays: { p1: { mode: "stamp", color: null, opacity: 0.4 } },
      planScenesById: { p1: { textBoxes: [{ id: "t1", text: "Hinweis" }] } },
    };
    const ops = diffSnapshots(JSON.stringify(base), JSON.stringify(next));
    const keys = ops.map(o => `${o.sheetId}/${o.objectKind}/${o.objectId}/${o.changeType}`).sort();
    expect(keys).toEqual([
      `${CAD_STRUCTURE_SHEET_ID}/planFolders/f1/create`,
      `${CAD_STRUCTURE_SHEET_ID}/planOverlays/p1/create`,
      `${CAD_STRUCTURE_SHEET_ID}/plans/p1/create`,
      "plan:p1/textBoxes/t1/create",
    ].sort());
    // Verknüpfte Ausschnitte übertragen keine Geometriekopie.
    const plan = ops.find(o => o.objectKind === "plans")!.payload as any;
    expect(plan.projections[0].sceneSnapshot).toBeNull();
  });

  it("zweites Gerät: gleicher Stand ergibt keine Operationen, Löschen einer Seite wird übertragen", () => {
    const a = { ...base, plans: [{ id: "p1" }, { id: "p2" }], planScenesById: { p1: {}, p2: {} } };
    expect(diffSnapshots(JSON.stringify(a), JSON.stringify(a))).toHaveLength(0);
    const b = { ...base, plans: [{ id: "p1" }], planScenesById: { p1: {} } };
    const ops = diffSnapshots(JSON.stringify(a), JSON.stringify(b));
    expect(ops.some(o => o.objectKind === "plans" && o.objectId === "p2" && o.changeType === "delete")).toBe(true);
    expect(indexSnapshot(JSON.stringify(b)).has("plan:p1")).toBe(true);
  });
});

describe("Lokaler Export-Bedienzustand geht nie in die Cloud", () => {
  it("Wechsel der geöffneten Seite (activePlanId) erzeugt keine Operation", () => {
    const a = { ...base, plans: [{ id: "p1" }, { id: "p2" }], activePlanId: "p1" };
    const b = { ...a, activePlanId: "p2" };
    expect(diffSnapshots(JSON.stringify(a), JSON.stringify(b))).toHaveLength(0);
  });

  it("PlanManager-Serialisierung enthält weder selected noch collapsed", async () => {
    const { PlanManager } = await import("@/cad/PlanManager");
    const pm = new PlanManager();
    const p = pm.createPlan({ name: "A" });
    pm.createFolder("F");
    const before = { ...base, plans: pm.toJSON(), planFolders: pm.foldersToJSON() };
    void p; // Druckauswahl existiert nicht mehr; Serialisierung bleibt stabil.
    const after = { ...base, plans: pm.toJSON(), planFolders: pm.foldersToJSON() };
    expect(diffSnapshots(JSON.stringify(before), JSON.stringify(after))).toHaveLength(0);
    expect(JSON.stringify(after)).not.toMatch(/selected|collapsed/);
  });
});
