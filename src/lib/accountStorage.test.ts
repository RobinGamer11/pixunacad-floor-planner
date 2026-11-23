import { beforeEach, describe, expect, it } from "vitest";
import { activateAccount, accountGeneration, sessionIsCurrent, scopedStorageKey, accountRecordKey } from "./accountStorage";
import { loadLocalScene, saveLocalScene } from "@/cad/persist/localScenePersist";
import { mergeWorkspace } from "./workspaceStorage";
beforeEach(() => { activateAccount("test-account-A"); });
describe("Vollständige lokale Kontotrennung", () => {
  it("keeps project directories private when switching accounts", () => {
    localStorage.setItem("pixuna.projects.v3", "A-projekte");
    activateAccount("test-account-B");
    expect(localStorage.getItem("pixuna.projects.v3")).toBeNull();
    localStorage.setItem("pixuna.projects.v3", "B-projekte");
    activateAccount("test-account-A");
    expect(localStorage.getItem("pixuna.projects.v3")).toBe("A-projekte");
  });
  it("does not assign unowned legacy keys to the next account", () => {
    expect(localStorage.getItem("pixuna.account.unknown.pixuna.projects.v3")).toBeNull();
    expect(scopedStorageKey("A", "pixuna.cad.p1")).not.toBe("pixuna.cad.p1");
    expect(accountRecordKey("A", "p1")).not.toBe(accountRecordKey("B", "p1"));
  });
  it("rejects late session results", () => {
    const epoch = accountGeneration(); activateAccount("test-account-B");
    expect(sessionIsCurrent("test-account-A", epoch)).toBe(false);
  });
  it("keeps CAD snapshots in the originating account", async () => {
    await saveLocalScene("same-id", '{"segments":[{"id":"A"}]}', 1, "pixuna.cad.same-id");
    activateAccount("test-account-B");
    expect(await loadLocalScene("same-id")).toBeNull();
    activateAccount("test-account-A");
    expect(JSON.parse((await loadLocalScene("same-id"))?.snapshot ?? "{}").segments[0].id).toBe("A");
  });
  it("never replays old project lists through normal settings merge", () => {
    localStorage.setItem("pixuna.projects.v3", "aktuell");
    mergeWorkspace({ localStorage: { "pixuna.projects.v3": "alt", "pixuna.theme": "dark" } });
    expect(localStorage.getItem("pixuna.projects.v3")).toBe("aktuell");
    expect(localStorage.getItem("pixuna.theme")).toBe("dark");
  });
});