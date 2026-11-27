import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyHomePayload, buildHomePayload, ensureHomeProjectSyncSource, readHomeMeta, refreshHomeProjectFromCloud } from "./homeProjectSync";
import { saveProjectToCloud, getProjectSyncState } from "./projectSync";
import { projectStore } from "./projectStore";
import { financeStore } from "./financeStore";

const identity = vi.hoisted(() => ({ generation: 1 }));
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("./networkClient", () => ({
  getNetworkClient: () => ({ rpc: mockRpc, from: mockFrom }),
  isMissingSchemaError: () => false,
  withAuthRetry: async (fn: () => Promise<unknown>) => fn(),
  classifyCloudError: (err: Error) => ({ message: err.message }),
}));
vi.mock("./projectAccess", () => ({
  projectAccessStore: {
    accessFor: () => ({ cloud: true, shared: false, role: "owner", permissions: { canEdit: true, canManageMembers: true, canComment: true }, overrides: {}, deviations: [], projectId: "p-home-1" }),
    canEdit: () => true,
    subscribe: () => () => {},
    reload: async () => {},
  },
}));
vi.mock("./projectRegistration", () => ({
  ensureSharedProject: async () => ({ ok: true }),
}));
vi.mock("./cadCollab/headlessCadSync", () => ({ syncLocalCadToCloud: async () => ({ pushed: 0 }) }));
vi.mock("./projectMetadata", () => ({
  saveProjectMetadata: async () => {},
}));
vi.mock("./accountStorage", () => ({
  flushAccountWrites: async () => {},
  activateAccount: () => {},
  currentAccount: () => `user-${identity.generation}`,
  accountGeneration: () => identity.generation,
  sessionIsCurrent: () => true,
  registerLocalFlusher: () => () => {},
  accountRecordKey: (id: string, projectId: string) => `${id}\u0001${projectId}`,
}));

const memStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
})();
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: memStorage, configurable: true });
}
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });

beforeEach(() => {
  identity.generation++;
  localStorage.clear();
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockFrom.mockImplementation((table: string) => table === "project_home_state"
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    : { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) });
  // Ensure project exists with a CAD sheet and a file with dataUrl
  projectStore.applySharedProject({
    id: "p-home-1",
    name: "Haus Nord",
    ort: "Berlin",
    thumbnail: "",
    updatedAt: "2026-11-24",
    sheets: [{ id: "sheet-1", name: "EG", sceneJson: '{"walls":[1]}' } as never],
    tasks: [{ id: "t1", title: "Aufgabe 1", done: false }],
    events: [],
    files: [{ id: "f1", kind: "file", name: "Plan.pdf", createdAt: "2026-11-24", parentId: null, storagePath: "p-home-1/docs/f1.pdf", cloudSynced: true }],
  });
  financeStore.replaceState("p-home-1", { nodes: [], positions: [], projectEstimate: 120000, projectNote: "Budget" });
});

describe("Startseiten-Cloudsync ohne CAD-Editor", () => {
  it("omits raw base64 dataUrl from payload and preserves CAD sheets when applying remote state", () => {
    const payload = buildHomePayload("p-home-1");
    expect(payload?.finance.projectEstimate).toBe(120000);
    expect(payload?.files[0]).not.toHaveProperty("dataUrl");

    applyHomePayload("p-home-1", {
      details: { ort: "Hamburg" },
      tasks: [{ id: "t2", title: "Remote Aufgabe", done: true }],
      finance: { nodes: [], positions: [], projectEstimate: 250000, projectNote: "Neu" },
    });
    const updated = projectStore.getState().projects.find((p) => p.id === "p-home-1");
    expect(updated?.ort).toBe("Hamburg");
    expect(updated?.tasks).toEqual([{ id: "t2", title: "Remote Aufgabe", done: true }]);
    expect(updated?.sheets[0]?.sceneJson).toBe('{"walls":[1]}');
    expect(financeStore.get("p-home-1").projectEstimate).toBe(250000);
  });

  it("saves start-page changes without opening the CAD editor", async () => {
    mockRpc.mockResolvedValue({ data: [{ accepted: true, revision: 1, updated_at: "2026-11-24T19:00:00Z" }], error: null });
    const off = ensureHomeProjectSyncSource("p-home-1");
    try {
      financeStore.setProjectEstimate("p-home-1", 150000);
      expect(getProjectSyncState("p-home-1").dirty).toBe(true);
      await saveProjectToCloud("p-home-1");
      expect(mockRpc).toHaveBeenCalledWith("save_project_home_state", expect.objectContaining({ _project_id: "p-home-1", _base_revision: 0 }));
      expect(getProjectSyncState("p-home-1").dirty).toBe(false);
      expect(readHomeMeta("p-home-1").baseRevision).toBe(1);
    } finally {
      off();
    }
  });

  it("marks conflict instead of overwriting dirty local changes on refresh", async () => {
    const off = ensureHomeProjectSyncSource("p-home-1");
    try {
      financeStore.setProjectEstimate("p-home-1", 175000);
      mockFrom.mockImplementation((table: string) => {
        if (table === "project_home_state") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { revision: 3, payload: { details: { ort: "München" } }, updated_at: "2026-11-24T19:10:00Z" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
      });
      await refreshHomeProjectFromCloud("p-home-1");
      expect(getProjectSyncState("p-home-1").conflict).toBe(true);
      expect(financeStore.get("p-home-1").projectEstimate).toBe(175000);
    } finally {
      off();
    }
  });
});