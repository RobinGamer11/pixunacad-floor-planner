import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const service = vi.hoisted(() => ({ account: "A", epoch: 1, files: [] as unknown[], rpc: vi.fn(), remove: vi.fn(), download: vi.fn(), upload: vi.fn(), update: vi.fn(), status: "active" }));
vi.mock("./accountStorage", () => ({ currentAccount: () => service.account, accountGeneration: () => service.epoch, sessionIsCurrent: (id: string, epoch: number) => id === service.account && epoch === service.epoch }));
vi.mock("./projectStore", () => ({ projectStore: {
  getState: () => ({ projects: [{ id: "p", files: service.files }] }),
  updateFileNode: service.update, hasDocumentReference: () => false,
  addFile: (projectId: string, _kind: string, parentId: string | null, file: Record<string, unknown>) => { service.files.push({ ...file, parentId, kind: "file", createdAt: "2026-11-28" }); return file.id; },
  deleteNode: (_p: string, _kind: string, id: string) => { service.files = service.files.filter(f => { const n = f as { id: string; parentId?: string }; return n.id !== id && n.parentId !== id; }); return true; },
} }));
vi.mock("./storageQuota", () => ({ quotaMessage: () => null, uploadWithQuota: service.upload }));
vi.mock("./networkClient", () => ({ withAuthRetry: async (fn: () => Promise<unknown>) => fn(), getNetworkClient: () => ({
  rpc: service.rpc, storage: { from: () => ({ remove: service.remove, download: service.download }) },
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: service.status }, error: null }) }) }) }) }) }),
}) }));
function memoryIdb() {
  const blobs = new Map<string, Blob>();
  vi.stubGlobal("indexedDB", { open: () => {
    const req: Record<string, unknown> = {};
    queueMicrotask(() => { req.result = {
      objectStoreNames: { contains: () => true }, close: () => {},
      transaction: () => {
        const tx: Record<string, unknown> = {};
        tx.objectStore = () => ({
          get: (key: string) => { const read: Record<string, unknown> = {}; queueMicrotask(() => { read.result = blobs.get(key); (read.onsuccess as (() => void) | undefined)?.(); (tx.oncomplete as (() => void) | undefined)?.(); }); return read; },
          put: (blob: Blob, key: string) => { queueMicrotask(() => { blobs.set(key, blob); (tx.oncomplete as (() => void) | undefined)?.(); }); },
        }); return tx;
      },
    }; (req.onsuccess as (() => void) | undefined)?.(); }); return req;
  } });
}
async function api() { vi.resetModules(); return import("./projectFileStorage"); }
beforeEach(() => {
  localStorage.clear(); service.account = "A"; service.epoch++; service.files = []; service.status = "active";
  service.rpc.mockReset(); service.remove.mockReset().mockResolvedValue({ error: null });
  service.download.mockReset(); service.upload.mockReset().mockResolvedValue("asset-1"); service.update.mockReset().mockReturnValue(true);
  vi.stubGlobal("indexedDB", undefined);
});
afterEach(() => { vi.unstubAllGlobals(); });
const node = { id: "doc", kind: "file" as const, name: "plan.pdf", parentId: null, createdAt: "2026-11-28", storagePath: "p/docs/plan.pdf", storageBucket: "project-attachments" };
const candidate = { storageBucket: "project-attachments", storagePath: "p/docs/plan.pdf" };
describe("Dokumentablage und bestätigte Cloud-Bereinigung", () => {
  it("behält die einzige Base64-Kopie bei fehlgeschlagener IndexedDB-Ablage", async () => {
    const docs = await api();
    service.files = [{ ...node, storagePath: undefined, dataUrl: "data:application/pdf;base64,YQ==" }];
    const result = await docs.syncPendingProjectFiles("p");
    expect(result.failed).toHaveLength(1); expect(service.upload).not.toHaveBeenCalled(); expect(service.update).not.toHaveBeenCalled();
    expect((service.files[0] as { dataUrl: string }).dataUrl).toBe("data:application/pdf;base64,YQ==");
  });
  it("importiert Blob zuerst, bestätigt Upload separat und öffnet auf zweitem Konto durch Download", async () => {
    memoryIdb(); const docs = await api();
    const file = new File(["document-body"], "plan.pdf", { type: "application/pdf" });
    const id = await docs.importProjectDocument("p", null, file);
    const local = service.files[0] as typeof node;
    expect(local).not.toHaveProperty("dataUrl"); expect(await docs.loadLocalDocumentBlob("p", id)).not.toBeNull();
    const uploaded = await docs.uploadProjectFileNode("p", local);
    expect(uploaded.storageAssetId).toBe("asset-1"); expect(uploaded.localBlob).toBe(true);
    service.account = "B"; service.epoch++;
    expect(await docs.loadLocalDocumentBlob("p", id)).toBeNull();
    service.download.mockResolvedValue({ data: new Blob(["document-body"], { type: "application/pdf" }), error: null });
    const raw = await docs.resolveProjectFileDataUrl(uploaded, "p");
    expect(raw).toBe("data:application/pdf;base64,ZG9jdW1lbnQtYm9keQ=="); expect(service.download).toHaveBeenCalledOnce();
    service.download.mockRejectedValue(new Error("Offline"));
    expect(await docs.resolveProjectFileDataUrl(uploaded, "p")).toBe(raw);
    expect(service.download).toHaveBeenCalledOnce();
  });
  it("zeigt fehlgeschlagene lokale Ablage nach Cloud-Download statt Offline-Erfolg", async () => {
    const docs = await api(); service.download.mockResolvedValue({ data: new Blob(["pdf"]), error: null });
    await expect(docs.resolveProjectFileDataUrl(node, "p")).rejects.toThrow("offline gespeichert");
  });
  it("verwirft einen verspäteten Cloud-Download nach Kontowechsel", async () => {
    const docs = await api(); service.download.mockImplementation(async () => { service.account = "B"; service.epoch++; return { data: new Blob(["private"]), error: null }; });
    await expect(docs.resolveProjectFileDataUrl(node, "p")).rejects.toThrow("Kontositzung");
  });
  it("bewahrt Dateien ohne erfolgreiche Speicherbestätigung", async () => {
    const docs = await api(); docs.queuePendingStorageDeletion("p", node);
    expect(await docs.flushPendingStorageDeletions("p")).toEqual({ deleted: 0, failed: [] });
    expect(docs.readPendingStorageDeletions("p")).toEqual([candidate]); expect(service.rpc).not.toHaveBeenCalled(); expect(service.remove).not.toHaveBeenCalled();
  });
  it("löscht nur den bestätigten Snapshot und bewahrt neue währenddessen vorgemerkte Löschungen", async () => {
    const docs = await api(); docs.queuePendingStorageDeletion("p", node); const pending = docs.readPendingStorageDeletions("p");
    docs.queuePendingStorageDeletion("p", { ...node, id: "new", storagePath: "p/docs/new.pdf" });
    service.rpc.mockImplementation(async (name: string) => ({ data: name === "storage_prepare_document_cleanup" ? true : name === "storage_claim_cleanup" ? [{ asset_id: "asset-1", ...candidate, bucket: candidate.storageBucket, path: candidate.storagePath }] : 1, error: null }));
    const result = await docs.flushPendingStorageDeletions("p", { revision: 4, files: [], pending });
    expect(result).toEqual({ deleted: 1, failed: [] });
    expect(service.rpc.mock.calls.map(c => c[0])).toEqual(["storage_prepare_document_cleanup", "storage_claim_cleanup", "storage_finalize_delete"]);
    expect(service.rpc.mock.calls[0]?.[1]).toMatchObject({ _revision: 4 });
    expect(docs.readPendingStorageDeletions("p")[0]?.storagePath).toBe("p/docs/new.pdf");
  });
  it("behält referenzierte oder nicht physisch gelöschte Dateien mit wiederholbarem Fehler", async () => {
    const docs = await api(); docs.queuePendingStorageDeletion("p", node);
    service.rpc.mockResolvedValue({ data: false, error: null });
    const result = await docs.flushPendingStorageDeletions("p", { revision: 1, files: [], pending: docs.readPendingStorageDeletions("p") });
    expect(result.failed).toHaveLength(1); expect(service.remove).not.toHaveBeenCalled(); expect(docs.readPendingStorageDeletions("p")).toHaveLength(1);
  });
  it("holt verlorene Löschbestätigungen über serverseitigen Endstatus nach", async () => {
    const docs = await api(); docs.queuePendingStorageDeletion("p", node); service.status = "deleted";
    service.rpc.mockImplementation(async name => ({ data: name === "storage_prepare_document_cleanup" ? true : [], error: null }));
    const result = await docs.flushPendingStorageDeletions("p", { revision: 7, files: [], pending: docs.readPendingStorageDeletions("p") });
    expect(result.failed).toEqual([]); expect(docs.readPendingStorageDeletions("p")).toEqual([]); expect(service.remove).not.toHaveBeenCalled();
  });
  it("merkt alle Dateien eines gelöschten Ordners vor", async () => {
    const docs = await api(); service.files = [{ ...node, id: "folder", kind: "folder", storagePath: undefined }, { ...node, parentId: "folder" }];
    expect(docs.deleteProjectDocumentNode("p", "folder")).toBe(true); expect(docs.readPendingStorageDeletions("p")).toEqual([candidate]);
  });
});
