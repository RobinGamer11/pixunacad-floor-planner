import { describe, it, expect } from "vitest";
import { Scene } from "./Scene";
import { restoreOneScene } from "./sceneSerde";
import { codeFromIndex, ensureObjectCode, formatObjectId, setObjectCode, setObjectName, attachObjectMeta } from "./objectMeta";

const wall = (s: Scene, y = 0) => s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "outer", corners: [{ x: 0, y }, { x: 1, y }] });

describe("Objekt-ID", () => {
  it("nummeriert je Name fortlaufend: A0001, A0002", () => {
    const s = new Scene();
    const a = wall(s), b = wall(s, 1);
    a.objName = "Wand Bestand"; (b as any).objName = "Wand Bestand";
    ensureObjectCode([s], "wall", a); ensureObjectCode([s], "wall", b);
    expect(formatObjectId("wall", a)).toBe("Wand Bestand - #A0001");
    expect(formatObjectId("wall", b)).toBe("Wand Bestand - #A0002");
  });
  it("ohne Namen automatisch nach Werkzeug", () => {
    const s = new Scene(); const a = wall(s);
    ensureObjectCode([s], "wall", a);
    expect(formatObjectId("wall", a)).toBe("Wand - #A0001");
  });
  it("nach 9999 geht es mit B0001 weiter", () => {
    expect(codeFromIndex(9999)).toBe("A9999");
    expect(codeFromIndex(10000)).toBe("B0001");
  });
  it("doppelte ID wird abgelehnt", () => {
    const s = new Scene(); const a = wall(s), b = wall(s, 1);
    ensureObjectCode([s], "wall", a); ensureObjectCode([s], "wall", b);
    expect(setObjectCode([s], "wall", b, "A0001")).not.toBeNull();
    expect(setObjectCode([s], "wall", b, "A0050")).toBeNull();
  });
  it("Umbenennen behält die ID", () => {
    const s = new Scene(); const a = wall(s);
    ensureObjectCode([s], "wall", a);
    setObjectName([s], "wall", a, "Wand Neu");
    expect(formatObjectId("wall", a)).toBe("Wand Neu - #A0001");
  });
  it("Name, ID und Beschreibung überstehen Speichern und Laden", () => {
    const s = new Scene();
    const h = s.createHatch([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    (h as any).objName = "Fläche"; (h as any).objCode = "A0003"; (h as any).objDesc = "Zeile 1\nZeile 2";
    const out: any = { hatches: [{ id: h.id, points: h.points }] };
    attachObjectMeta(out, s);
    const s2 = new Scene(); restoreOneScene(s2, out);
    expect((s2.hatches[0] as any).objName).toBe("Fläche");
    expect((s2.hatches[0] as any).objCode).toBe("A0003");
    expect((s2.hatches[0] as any).objDesc).toBe("Zeile 1\nZeile 2");
  });
});

import { setObjectNameMany, addAttachments, copyObjectMeta, MAX_ATTACHMENT_BYTES_PER_OBJECT } from "./objectMeta";
describe("Mehrfachauswahl & Anlagen", () => {
  it("vergibt bei gemeinsamem Namen fortlaufende IDs", () => {
    const a: any = { id: "a" }, b: any = { id: "b" }, c: any = { id: "c" };
    const scenes = [{ walls: [a, b, c] }];
    setObjectNameMany(scenes, [{ kind: "wall", obj: a }, { kind: "wall", obj: b }, { kind: "wall", obj: c }], "Bestand");
    expect([a.objCode, b.objCode, c.objCode]).toEqual(["A0001", "A0002", "A0003"]);
    expect(b.objName).toBe("Bestand");
  });
  it("begrenzt Anlagen auf 5 MB je Objekt und kopiert sie beim Duplizieren", () => {
    const o: any = {};
    const r = addAttachments(o, [
      { id: "1", name: "a.png", type: "image/png", size: 3 * 1024 * 1024, dataUrl: "x" },
      { id: "2", name: "b.pdf", type: "application/pdf", size: 3 * 1024 * 1024, dataUrl: "y" },
    ]);
    expect(MAX_ATTACHMENT_BYTES_PER_OBJECT).toBe(5 * 1024 * 1024);
    expect(r).toEqual(["b.pdf"]);
    expect(copyObjectMeta(o, { withCode: false }).objAttachments?.length).toBe(1);
  });
});
