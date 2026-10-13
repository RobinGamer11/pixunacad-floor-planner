import { describe, it, expect } from "vitest";
import { Scene, serializeInfoBox } from "./Scene";
import { restoreOneScene } from "./sceneSerde";
import { initialsOf } from "@/lib/infoBoxUi";

describe("Infobox", () => {
  it("wird gespeichert und geladen (Ebene, Art, Status, Größe)", () => {
    const s = new Scene();
    s.createInfoBox({ x: 1, y: 2, labelId: "L1", kind: "task", status: "done", title: "T", sizePx: 240 });
    const data = { infoBoxes: s.infoBoxes.map(serializeInfoBox) } as any;
    const r = new Scene();
    restoreOneScene(r, data);
    expect(r.infoBoxes).toHaveLength(1);
    expect(r.infoBoxes[0]).toMatchObject({ x: 1, y: 2, labelId: "L1", kind: "task", status: "done", title: "T", sizePx: 240 });
  });
  it("alte Szenen ohne Infoboxen laden leer", () => {
    const r = new Scene();
    restoreOneScene(r, {} as any);
    expect(r.infoBoxes).toEqual([]);
  });
  it("Kürzel aus Name oder E-Mail", () => {
    expect(initialsOf("Phil Maier")).toBe("PM");
    expect(initialsOf("phil@x.de")).toBe("PH");
  });
});
