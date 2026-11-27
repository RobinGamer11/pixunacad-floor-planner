import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CadObjectOp, LocalCadOp } from "./cadCollab/types";
const service = vi.hoisted(() => ({
  account: "A", epoch: 1, canRead: true, revision: 0, payload: null as unknown,
  snapshot: null as string | null, objects: [] as CadObjectOp[],
  failAt: -1, writes: 0, schemaError: false,
  rpc: vi.fn(), read: vi.fn(),
}));
vi.mock("./accountStorage", () => ({
  currentAccount: () => service.account, accountGeneration: () => service.epoch,
  sessionIsCurrent: (id: string, epoch: number) => id === service.account && epoch === service.epoch,
  accountRecordKey: (id: string, project: string) => `${id}\u0001${project}`,
  registerLocalFlusher: () => () => {}, flushAccountWrites: async () => {},
}));
vi.mock("./projectAccess", () => ({ projectAccessStore: {
  accessFor: () => ({ cloud: service.canRead, role: "owner", shared: false, permissions: { canEdit: service.canRead } }),
  canEdit: () => service.canRead, otherMemberCount: () => 0, subscribe: () => () => {}, reload: async () => {},
} }));
vi.mock("./networkClient", () => ({
  getNetworkClient: () => ({ rpc: service.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: service.read, order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
  withAuthRetry: async (fn: () => Promise<unknown>) => fn(),
  classifyCloudError: (err: Error) => ({ message: err.message }),
  isMissingSchemaError: (err: { code?: string }) => err?.code === "42P01",
}));
vi.mock("@/cad/persist/localScenePersist", () => ({
  flushLocalSceneWrites: async () => {},
  loadLocalScene: async () => service.snapshot ? { snapshot: service.snapshot } : null,
}));
vi.mock("./cadCollab/opsRepo", () => ({
  fetchLatestSeq: async () => service.writes,
  fetchObjectRevisions: async () => new Map(service.objects.map(o => [`${o.sheetId}|${o.objectId}`, o.objectVersion])),
  fetchObjectState: async () => { if (service.schemaError) throw { code: "42P01", message: "CAD-Schema fehlt" }; return service.objects; },
  isCollabSchemaMissing: (err: { code?: string }) => err?.code === "42P01",
  writeObject: async (_id: string, op: LocalCadOp) => {
    const n = service.writes++;
    if (n === service.failAt) throw new Error("Netzwerk getrennt");
    const prior = service.objects.find(o => o.sheetId === op.sheetId && o.objectKind === op.objectKind && o.objectId === op.objectId);
    service.objects = service.objects.filter(o => o !== prior);
    const version = (prior?.objectVersion ?? 0) + 1;
    service.objects.push({ ...op, id: `op-${n}`, projectId: _id, objectVersion: version, actorId: "A", seq: n, createdAt: "2026-11-27" });
    return { accepted: true, revision: version };
  },
}));
vi.mock("./sharedProjectSync", () => ({ hydrateSharedProject: async () => false }));
vi.mock("./projectRegistration", () => ({ ensureSharedProject: async () => ({ ok: true }) }));
vi.mock("./projectMetadata", () => ({ saveProjectMetadata: async () => {} }));
async function device() {
  vi.resetModules();
  return {
    home: await import("./homeProjectSync"),
    project: (await import("./projectStore")).projectStore,
    timeline: (await import("./timelineStore")).timelineStore,
    finance: (await import("./financeStore")).financeStore,
    sync: await import("./projectSync"),
    cad: await import("./cadCollab/headlessCadSync"),
  };
}
function freshProfile() { localStorage.clear(); service.epoch++; }
afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => {
  freshProfile(); service.account = "A"; service.canRead = true; service.revision = 0;
  service.payload = null; service.snapshot = null; service.objects = []; service.failAt = -1;
  service.writes = 0; service.schemaError = false;
  service.read.mockReset().mockImplementation(async () => ({ data: service.payload ? { payload: service.payload, revision: service.revision } : null, error: null }));
  service.rpc.mockReset().mockImplementation(async (_name: string, args: { _base_revision: number; _payload: unknown }) => {
    if (args._base_revision !== service.revision) return { data: [{ accepted: false, revision: service.revision }], error: null };
    service.payload = JSON.parse(JSON.stringify(args._payload)); service.revision++;
    return { data: [{ accepted: true, revision: service.revision, updated_at: "2026-11-27T20:00:00Z" }], error: null };
  });
});
describe("Cloud-Abschluss: vollständige Abläufe mit simulierten Serverbestätigungen", () => {
  it("stellt Angaben, Organisation, Finanzen und Dokumentstruktur in einem leeren Profil wieder her", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus");
    await a.home.refreshHomeProjectFromCloud("p");
    a.project.updateProject("p", { ort: "Berlin" });
    a.timeline.addItem("p", "task", { title: "Statik", startDate: "2026-12-01" });
    a.finance.setProjectEstimate("p", 175000);
    a.project.addFolder("p", "files", null, "Pläne");
    a.project.addFile("p", "files", null, { id: "doc", name: "Plan.pdf", mimeType: "application/pdf", sizeBytes: 123 });
    a.project.updateFileNode("p", "doc", { storagePath: "p/docs/doc.pdf", storageBucket: "project-attachments", cloudSynced: true });
    await a.sync.saveProjectToCloud("p");
    freshProfile(); const b = await device(); b.project.ensureCloudStub("p", "Haus");
    await b.home.refreshHomeProjectFromCloud("p");
    expect(b.project.getState().projects.find(p => p.id === "p")?.ort).toBe("Berlin");
    expect(b.timeline.getState("p").items[0]?.title).toBe("Statik");
    expect(b.finance.get("p").projectEstimate).toBe(175000);
    expect(b.project.getState().projects.find(p => p.id === "p")?.files?.some(f => f.storagePath === "p/docs/doc.pdf")).toBe(true);
    expect(b.home.readHomeMeta("p").loadStatus).toBe("in_sync");
  });
  it("wendet persönliche Anordnung auf später geladene Cloudplatzhalter an", async () => {
    const a = await device();
    localStorage.setItem("pixuna.personal.projectLayout", JSON.stringify({ folders: [{ id: "folder", name: "Bau" }], items: { p: { folderId: "folder", favorite: true, sortIndex: 4 } } }));
    a.project.applyPersonalLayout(); a.project.ensureCloudStub("p", "Haus");
    expect(a.project.getState().projects.find(p => p.id === "p")).toMatchObject({ folderId: "folder", favorite: true, sortIndex: 4 });
    expect(a.home.buildHomePayload("p")?.details).not.toHaveProperty("favorite");
  });
  it("übernimmt bestätigte Organisationslöschungen im zweiten leeren Profil", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus"); await a.home.refreshHomeProjectFromCloud("p");
    const item = a.timeline.addItem("p", "task", { title: "Löschen" });
    await a.home.saveHomeProjectDirect("p"); a.timeline.deleteItem("p", item.id); await a.home.saveHomeProjectDirect("p");
    freshProfile(); const b = await device(); b.project.ensureCloudStub("p", "Haus"); await b.home.refreshHomeProjectFromCloud("p");
    expect(b.timeline.getState("p").items).toEqual([]);
  });
  it("lädt nach verspäteter Berechtigung erneut und verwirft Konto-Wechsel-Ergebnisse", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus"); service.canRead = false;
    await expect(a.home.refreshHomeProjectFromCloud("p")).rejects.toThrow("Cloudberechtigungen"); expect(a.home.readHomeMeta("p").loadStatus).not.toBe("in_sync");
    service.canRead = true; service.payload = { details: { ort: "Hamburg" } }; service.revision = 1;
    await a.home.refreshHomeProjectFromCloud("p"); expect(a.project.getState().projects.find(p => p.id === "p")?.ort).toBe("Hamburg");
    let finish: ((result: unknown) => void) | undefined;
    service.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const delayed = a.home.refreshHomeProjectFromCloud("p"); await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    service.epoch++; service.account = "B"; localStorage.clear();
    finish?.({ data: { payload: { details: { ort: "Fremd" } }, revision: 2 }, error: null }); await delayed;
    expect(a.project.getState().projects.find(p => p.id === "p")?.ort).toBe("Hamburg");
    expect(a.home.readHomeMeta("p").loadStatus).not.toBe("in_sync");
  });
  it("behält Fehler und Änderungen nach Ansichtsschließen und erneutem Laden", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus"); const off = a.home.ensureHomeProjectSyncSource("p");
    a.finance.setProjectEstimate("p", 210000); service.read.mockRejectedValueOnce(new Error("Offline"));
    await expect(a.home.saveHomeProjectDirect("p")).rejects.toThrow("Offline"); off();
    expect(a.sync.getProjectSyncState("p")).toMatchObject({ dirty: true, error: "Offline" });
    service.epoch++; const b = await device();
    expect(b.home.readHomeMeta("p").dirtyAreas?.finance).toBe(true);
    expect(b.sync.getProjectSyncState("p").error).toBe("Offline");
    await b.sync.saveProjectToCloud("p"); expect(b.home.readHomeMeta("p").dirty).toBe(false);
  });
  it("meldet lokale Schreibfehler, erhält Finanzwerte und lässt keinen Cloud-Erfolg zu", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Speicher voll"); });
    a.finance.setProjectEstimate("p", 199000);
    expect(a.finance.get("p").projectEstimate).toBe(199000);
    expect(a.home.readHomeMeta("p").areaErrors?.finance).toBe("Speicher voll");
    await expect(a.home.saveHomeProjectDirect("p")).rejects.toThrow("Speicher voll");
    expect(service.rpc).not.toHaveBeenCalled(); spy.mockRestore();
  });
  it("schützt den lokalen Stand bei einem konkurrierenden Serverstand", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus"); await a.home.refreshHomeProjectFromCloud("p");
    a.finance.setProjectEstimate("p", 111000); service.payload = { finance: { projectEstimate: 222000 } }; service.revision = 2;
    await a.home.refreshHomeProjectFromCloud("p");
    expect(a.home.readHomeMeta("p").conflict).toBe(true); expect(a.finance.get("p").projectEstimate).toBe(111000);
    expect(service.rpc).not.toHaveBeenCalled();
  });
  it("speichert CAD und Export ohne Editor und wiederholt nur noch nicht bestätigte Teiloperationen", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus");
    service.snapshot = JSON.stringify({ sheets: [{ id: "s", name: "EG" }], scenesById: { s: { walls: [{ id: "w", heightM: 2.8 }], infoBoxCategories: [{ id: "category", name: "Hinweise" }] } }, plans: [{ id: "plan", name: "Plan" }], sheetOverlays: [{ id: "overlay", sheetId: "s" }], planScenesById: { plan: { textBoxes: [{ id: "label", text: "Export" }] } } });
    service.failAt = 1; await expect(a.sync.saveProjectToCloud("p")).rejects.toThrow("Netzwerk getrennt");
    const acceptedId = service.objects[0]?.objectId; service.failAt = -1;
    await a.sync.saveProjectToCloud("p");
    expect(service.objects.find(o => o.objectId === acceptedId)?.objectVersion).toBe(1);
    expect(service.objects.some(o => o.objectKind === "plans" && o.objectId === "plan")).toBe(true);
    expect(service.objects.some(o => o.sheetId === "plan:plan" && o.objectId === "label")).toBe(true);
    expect(service.objects.some(o => o.objectKind === "sheetOverlays")).toBe(true);
    expect(service.objects.some(o => o.objectKind === "infoBoxCategories")).toBe(true);
    expect((await a.cad.syncLocalCadToCloud("p")).pushed).toBe(0);
  });
  it("sperrt beschädigte oder fehlende CAD-Ausgangsstände und fehlendes Schema", async () => {
    const a = await device(); service.schemaError = true;
    await expect(a.cad.syncLocalCadToCloud("p")).rejects.toThrow("CAD-Schema fehlt");
    service.schemaError = false; service.snapshot = JSON.stringify({ sheets: [{ id: "s" }], scenesById: { s: { walls: [{ id: "w" }] } } });
    const { baselineKey } = await import("./cloudBaseline"); localStorage.setItem(baselineKey("cad", "p"), "invalid");
    await expect(a.cad.syncLocalCadToCloud("p")).rejects.toThrow("Beschädigte CAD-Ausgangsbasis"); expect(service.writes).toBe(0);
    localStorage.removeItem(baselineKey("cad", "p"));
    await a.cad.syncLocalCadToCloud("p"); localStorage.removeItem(baselineKey("cad", "p"));
    await expect(a.cad.syncLocalCadToCloud("p")).rejects.toThrow("keine gemeinsame Ausgangsbasis");
  });
  it("schützt neuere CAD-Arbeit beider Geräte sowie Cloud-Löschzustände ohne Baseline", async () => {
    const a = await device();
    service.snapshot = JSON.stringify({ sheets: [{ id: "s" }], scenesById: { s: { segments: [{ id: "line", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }] } } });
    await a.cad.syncLocalCadToCloud("p");
    const line = service.objects.find(o => o.objectId === "line");
    if (!line?.payload) throw new Error("missing confirmed line");
    line.payload = { ...line.payload, b: { x: 8, y: 8 } }; line.objectVersion++;
    service.snapshot = JSON.stringify({ sheets: [{ id: "s" }], scenesById: { s: { segments: [{ id: "line", a: { x: 0, y: 0 }, b: { x: 2, y: 2 } }] } } });
    const writes = service.writes;
    await expect(a.cad.syncLocalCadToCloud("p")).rejects.toThrow("weicht vom Cloudstand");
    expect(service.writes).toBe(writes); expect(line.payload.b).toEqual({ x: 8, y: 8 });
    const { baselineKey } = await import("./cloudBaseline"); localStorage.removeItem(baselineKey("cad", "p"));
    service.objects.forEach(o => { o.changeType = "delete"; o.payload = null; });
    await expect(a.cad.syncLocalCadToCloud("p")).rejects.toThrow("keine gemeinsame Ausgangsbasis");
    expect(service.writes).toBe(writes);
  });
  it("behält Änderungen, die während der Home-Speicherbestätigung entstehen", async () => {
    const a = await device(); a.project.ensureCloudStub("p", "Haus"); await a.home.refreshHomeProjectFromCloud("p");
    a.finance.setProjectEstimate("p", 120000);
    service.rpc.mockImplementationOnce(async (_name, args) => {
      service.payload = args._payload; service.revision++;
      a.finance.setProjectEstimate("p", 140000);
      return { data: [{ accepted: true, revision: service.revision }], error: null };
    });
    await a.home.saveHomeProjectDirect("p");
    expect(a.home.readHomeMeta("p").dirtyAreas?.finance).toBe(true);
    expect((service.payload as { finance: { projectEstimate: number } }).finance.projectEstimate).toBe(120000);
    await a.home.saveHomeProjectDirect("p");
    expect((service.payload as { finance: { projectEstimate: number } }).finance.projectEstimate).toBe(140000);
    expect(a.home.readHomeMeta("p").dirty).toBe(false);
  });
  it("stellt Bibliothek, Export und Vektorobjekte über die echte CAD-Sitzung wieder her", async () => {
    const a = await device();
    service.snapshot = JSON.stringify({
      sheets: [{ id: "s", name: "EG", sheetElevationM: 3.2, scaleValue: 50 }], labels: [{ id: "level", name: "Tragwerk" }],
      scenesById: { s: { segments: [{ id: "line", a: { x: 1, y: 2 }, b: { x: 5, y: 2 }, labelId: "level", heightM: 0.1, objectElevationM: 1.2, pose3D: { rotation: { x: 0, y: 0, z: 0.4 } } }], infoBoxCategories: [{ id: "category", name: "Hinweise" }] } },
      libraryFolders: [{ id: "libfolder", name: "Möbel" }],
      libraryDefinitions: [{ id: "definition", name: "Stuhl", folderId: "libfolder", geometry: [{ kind: "segment", data: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } }], createdAt: 1, updatedAt: 1 }],
      plans: [{ id: "plan", name: "Ausgabe", projections: [{ id: "projection", sourceSheetId: "s", scale: 50, x: 0.12, y: 0.2 }] }],
      planFolders: [{ id: "pf", name: "Ausgaben" }],
      planOverlays: { plan: { mode: "stamp", opacity: 0.35 } }, sheetOverlays: { s: { opacity: 0.6 } }, spreadLayouts: { spread: { gap: 0.02 } },
      planScenesById: { plan: { segments: [{ id: "export-line", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }] } },
    });
    await a.cad.syncLocalCadToCloud("p");
    freshProfile(); const b = await device();
    const { Scene } = await import("@/cad/Scene");
    const { CadCollabSession } = await import("./cadCollab/session");
    const fields: Record<string, unknown> = {};
    const scenes = new Map<string, InstanceType<typeof Scene>>();
    const app = {
      scenesById: scenes, activeSheetId: "s", libraryDefinitions: [] as unknown[], libraryFolders: [] as unknown[],
      applyCollabStructure(kind: string, rows: Record<string, unknown>[]) {
        fields[kind] = rows;
        if (kind === "sheets" || kind === "plans") rows.forEach(row => { const id = `${kind === "plans" ? "plan:" : ""}${row.id}`; if (!scenes.has(id)) scenes.set(id, new Scene()); });
      },
      resolveCollabScene: (id: string) => scenes.get(id) ?? null,
      serializeForCollab: () => JSON.stringify({ ...fields, libraryDefinitions: app.libraryDefinitions, libraryFolders: app.libraryFolders,
        scenesById: Object.fromEntries([...scenes].filter(([id]) => !id.startsWith("plan:")).map(([id, scene]) => [id, { segments: scene.segments, infoBoxCategories: scene.infoBoxCategories }])),
        planScenesById: Object.fromEntries([...scenes].filter(([id]) => id.startsWith("plan:")).map(([id, scene]) => [id.slice(5), { segments: scene.segments }])) }),
    };
    const session = new CadCollabSession({ projectId: "p", userId: "A", displayName: "Test", app, requestRender: () => {} });
    try {
      await session.start();
      expect(scenes.get("s")?.segments[0]).toMatchObject({ id: "line", a: { x: 1, y: 2 }, b: { x: 5, y: 2 }, objectElevationM: 1.2 });
      expect(scenes.get("s")?.infoBoxCategories.some(c => c.id === "category")).toBe(true);
      expect(app.libraryDefinitions).toHaveLength(1); expect(app.libraryFolders).toHaveLength(1);
      expect(fields.sheets).toMatchObject([{ sheetElevationM: 3.2, scaleValue: 50 }]);
      expect(fields.plans).toMatchObject([{ projections: [{ scale: 50, x: 0.12, y: 0.2 }] }]);
      expect(fields.planOverlays).toMatchObject([{ opacity: 0.35 }]); expect(fields.sheetOverlays).toMatchObject([{ opacity: 0.6 }]);
      expect(scenes.get("plan:plan")?.segments[0]?.id).toBe("export-line");
      expect(b.sync.getProjectAreaSyncState("p", "cad")?.dirty).toBe(false);
    } finally { session.destroy(); }
  });

});
