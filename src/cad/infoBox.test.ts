import { describe, it, expect } from "vitest";
import { Scene, serializeInfoBox } from "./Scene";
import { restoreOneScene } from "./sceneSerde";
import { initialsOf } from "@/lib/infoBoxUi";
import { SelectTool } from "./SelectTool";

describe("Infobox", () => {
  it("Standardbreite 0,50 m, unabhängig vom Zoom", () => {
    for (const scale of [20, 80, 400]) {
      const points = (SelectTool.prototype as any)._elementPoints.call({ app: { camera: { scale } } }, "infobox", { x: 1, y: 2 });
      expect(points[1].x - points[0].x).toBeCloseTo(0.5);
    }
  });
  it("eingestellte Breite wird übernommen und gespeichert", () => {
    const points = (SelectTool.prototype as any)._elementPoints.call({ app: {} }, "infobox", { x: 0, y: 0, sizeM: 2 });
    expect(points[1].x - points[0].x).toBeCloseTo(2);
    const s = new Scene();
    s.createInfoBox({ x: 0, y: 0, sizeM: 1.25 });
    expect(serializeInfoBox(s.infoBoxes[0]).sizeM).toBe(1.25);
  });
  it("neue Infobox ist standardmäßig eine Information", () => {
    const s = new Scene();
    expect(s.createInfoBox({ x: 0, y: 0 }).kind).toBe("info");
  });
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
