import { describe, it, expect } from "vitest";
import { StairTool } from "./StairTool";

const fakeApp: any = { hub: null, pointEditMenu: null, renderer: { render() {} }, canvas: null, setTool() {} };

describe("Treppe – Undo-Schritte und Winkel", () => {
  it("Strg+Z nimmt Referenzpunkte und Phasen einzeln zurück", () => {
    const t: any = Object.create(StairTool.prototype);
    t.app = fakeApp; t._angleText = "";
    t.phase = "path"; t._start = { x: 0, y: 0 }; t._dir = { x: 1, y: 0 };
    t._path = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }];
    expect(t.undoStep()).toBe(true); expect(t._path.length).toBe(2);
    t.undoStep(); expect(t._path.length).toBe(1);
    t.undoStep(); expect(t.phase).toBe("side");
    t.undoStep(); expect(t.phase).toBe("dir");
    t.undoStep(); expect(t.phase).toBe("start");
    expect(t.undoStep()).toBe(false);
  });

  it("Winkeleingabe in Schritt 02 setzt die Laufrichtung", () => {
    const t: any = Object.create(StairTool.prototype);
    t._angleText = ""; t.phase = "dir"; t._start = { x: 0, y: 0 }; t._dir = { x: 1, y: 0 };
    t.angleKey("9"); t.angleKey("0");
    expect(t.dirAngleDeg()).toBeCloseTo(90);
    expect(t.angleKey("x")).toBe(false);
  });
});
