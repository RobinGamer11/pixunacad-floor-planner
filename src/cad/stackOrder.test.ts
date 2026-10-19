import { describe, it, expect } from "vitest";
import { moveStack, orderedLabelItems, normalizeStackOrder, hasExplicitStackOrder } from "./stackOrder";
import { copyObjectMeta } from "./objectMeta";

const mk = () => ({
  documents: [{ id: "d1", labelId: "L" }],
  hatches: [{ id: "h1", labelId: "L" }, { id: "h2", labelId: "L" }],
  segments: [{ id: "s1", labelId: "L" }, { id: "s2", labelId: "M" }],
});
const ids = (sc: any, l = "L") => orderedLabelItems(sc, l).map((i) => i.obj.id);

describe("Stapelreihenfolge", () => {
  it("Altprojekt ohne Werte behält die typbasierte Ordnung", () => {
    const sc = mk();
    expect(hasExplicitStackOrder(sc, "L")).toBe(false);
    expect(ids(sc)).toEqual(["d1", "h1", "h2", "s1"]);
  });

  it("Dokument in den Vordergrund liegt über Linien", () => {
    const sc = mk();
    expect(moveStack(sc, [{ kind: "document", id: "d1" }], "front")).toBe(true);
    expect(ids(sc)).toEqual(["h1", "h2", "s1", "d1"]);
  });

  it("Mehrfachauswahl behält relative Reihenfolge", () => {
    const sc = mk();
    moveStack(sc, [{ kind: "segment", id: "s1" }, { kind: "hatch", id: "h1" }], "back");
    expect(ids(sc)).toEqual(["h1", "s1", "d1", "h2"]);
  });

  it("schon ganz vorne = keine Änderung", () => {
    const sc = mk();
    expect(moveStack(sc, [{ kind: "segment", id: "s1" }], "front")).toBe(false);
  });

  it("gesperrte Ebene wird nicht verschoben", () => {
    const sc = mk();
    expect(moveStack(sc, [{ kind: "document", id: "d1" }], "front", () => false)).toBe(false);
  });

  it("Ebenenwechsel und neue Objekte landen vorne", () => {
    const sc: any = mk();
    normalizeStackOrder(sc);
    sc.segments[1].labelId = "L";
    sc.documents.push({ id: "d2", labelId: "L" });
    normalizeStackOrder(sc);
    const order = ids(sc);
    expect(order.slice(-2).sort()).toEqual(["d2", "s2"]);
  });

  it("Kopien übernehmen die Reihenfolge nicht, Speichern schon", () => {
    expect(copyObjectMeta({ stackOrder: 5 }).stackOrder).toBe(5);
    expect(copyObjectMeta({ stackOrder: 5 }, { withCode: false }).stackOrder).toBeUndefined();
  });
});
