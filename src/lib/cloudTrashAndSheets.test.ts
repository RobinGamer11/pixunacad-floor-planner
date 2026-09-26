import { describe, expect, it } from "vitest";
import { decideTrash } from "@/lib/cloudTrash";
import { buildSheetsFromCloud, hasUnsavedLocalCad } from "@/lib/cadCollab/cloudSheetPreview";
import { BASELINE_SEP, hashText } from "@/lib/cloudBaseline";
import type { CadObjectOp } from "@/lib/cadCollab/types";

const base = {
  cloudPresent: true, cloudDeletedAt: null, localPresent: true,
  localDeletedAt: null, pending: null, knownOwned: true,
} as const;

describe("cloudweiter Papierkorb (Gerät A → Gerät B)", () => {
  it("auf A gelöscht → B verschiebt in den Papierkorb, kein normaler Platzhalter", () => {
    expect(decideTrash({ ...base, cloudDeletedAt: "2026-09-26T10:00:00Z" }))
      .toEqual({ type: "mirror", deletedAt: "2026-09-26T10:00:00Z" });
  });
  it("auf A wiederhergestellt → B holt aus dem Papierkorb", () => {
    expect(decideTrash({ ...base, localDeletedAt: "2026-09-26T10:00:00Z" }))
      .toEqual({ type: "mirror", deletedAt: null });
  });
  it("auf A endgültig gelöscht → B entfernt es ebenfalls", () => {
    expect(decideTrash({ ...base, cloudPresent: false })).toEqual({ type: "purgeLocal" });
  });
  it("offene eigene Aktion wird nie vom Abgleich zurückgesetzt", () => {
    expect(decideTrash({ ...base, localDeletedAt: "x", pending: "delete" })).toEqual({ type: "none" });
  });
  it("nie als eigenes Cloudprojekt bekannt → lokales Projekt bleibt unberührt", () => {
    expect(decideTrash({ ...base, cloudPresent: false, knownOwned: false })).toEqual({ type: "none" });
  });
});

const op = (sheetId: string, objectKind: string, objectId: string, payload: Record<string, unknown> | null, changeType: "create" | "delete" = "create") =>
  ({ id: objectId, projectId: "p", sheetId, objectId, objectKind, changeType, payload, objectVersion: 1 }) as unknown as CadObjectOp;

describe("CAD-Ausschnitte in der Mappe aus dem Cloudstand", () => {
  it("baut Blätter in Reihenfolge samt Szene und Ebenen, ohne gelöschte Objekte", () => {
    const res = buildSheetsFromCloud([
      op("__structure__", "sheets", "s2", { id: "s2", name: "OG", scaleValue: 50, __order: 1 }),
      op("__structure__", "sheets", "s1", { id: "s1", name: "EG", scaleValue: 100, __order: 0 }),
      op("__structure__", "labels", "l1", { id: "l1", name: "Wände", __order: 0 }),
      op("s1", "segments", "a", { id: "a" }),
      op("s1", "segments", "b", null, "delete"),
      op("__library__", "libraryDefinitions", "d", { id: "d" }),
    ]);
    expect(res.sheets.map((s) => [s.id, s.name, s.scale])).toEqual([["s1", "EG", "1:100"], ["s2", "OG", "1:50"]]);
    expect(JSON.parse(res.sheets[0].sceneJson!)).toEqual({ segments: [{ id: "a" }] });
    expect(res.sheets[1].sceneJson).toBeUndefined();
    expect(JSON.parse(res.labelsJson!)).toEqual([{ id: "l1", name: "Wände" }]);
  });

  it("erkennt ungesicherte CAD-Arbeit dieses Geräts", () => {
    const snap = JSON.stringify({ scenesById: { s1: { segments: [{ id: "a", x: 1 }] } } });
    const key = `s1${BASELINE_SEP}segments${BASELINE_SEP}a`;
    const saved = new Map([[key, hashText(JSON.stringify({ id: "a", x: 1 }))]]);
    expect(hasUnsavedLocalCad(snap, saved, true)).toBe(false);
    expect(hasUnsavedLocalCad(snap, new Map([[key, "anders"]]), true)).toBe(true);
    expect(hasUnsavedLocalCad(snap, new Map(), false)).toBe(true);
    expect(hasUnsavedLocalCad(null, new Map(), false)).toBe(false);
  });
});
