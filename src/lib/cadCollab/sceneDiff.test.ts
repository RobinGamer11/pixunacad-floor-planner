import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./sceneDiff";

function snap(segments: Array<Record<string, unknown>>) {
  return JSON.stringify({ activeSheetId: "s1", scenesById: { s1: { segments } } });
}

describe("CAD-Zusammenarbeit: Änderungserkennung", () => {
  it("meldet nur das neu erstellte Objekt", () => {
    const ops = diffSnapshots(snap([{ id: "a" }]), snap([{ id: "a" }, { id: "b" }]));
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ objectId: "b", changeType: "create", sheetId: "s1" });
  });

  it("meldet nur das veränderte Objekt", () => {
    const ops = diffSnapshots(snap([{ id: "a", x: 1 }, { id: "b" }]), snap([{ id: "a", x: 2 }, { id: "b" }]));
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ objectId: "a", changeType: "update" });
  });

  it("meldet ein gelöschtes Objekt ohne Daten", () => {
    const ops = diffSnapshots(snap([{ id: "a" }, { id: "b" }]), snap([{ id: "a" }]));
    expect(ops).toEqual([
      { sheetId: "s1", objectId: "b", objectKind: "segments", changeType: "delete", payload: null },
    ]);
  });

  it("meldet nichts, wenn sich nichts geändert hat", () => {
    expect(diffSnapshots(snap([{ id: "a" }]), snap([{ id: "a" }]))).toEqual([]);
  });
});
