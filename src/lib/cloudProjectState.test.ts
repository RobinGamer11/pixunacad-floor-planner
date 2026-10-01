import { describe, expect, it } from "vitest";
import { decideOpen } from "./cloudProjectState";
import { indexSnapshot } from "./cadCollab/sceneDiff";
import { CAD_STRUCTURE_SHEET_ID } from "./cadCollab/types";

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

});
