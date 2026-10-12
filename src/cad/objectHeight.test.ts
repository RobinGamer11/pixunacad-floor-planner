import { describe, it, expect } from "vitest";
import { Scene } from "./Scene";
import { restoreOneScene } from "./sceneSerde";

describe("Objekthöhe (3D-Information)", () => {
  it("neue Wand hat 2,5 m, neue Schraffur 0 m", () => {
    const s = new Scene();
    const w = s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "outer", corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    const h = s.createHatch([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(w.heightM).toBe(2.5);
    expect(h.heightM).toBe(0);
  });

  it("gespeicherte Höhen werden wieder geladen, alte Projekte ohne Höhe bleiben lesbar", () => {
    const s = new Scene();
    restoreOneScene(s, {
      hatches: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], heightM: 1.2 }],
      walls: [
        { kind: "outer", thicknessM: 0.3, referenceSide: "outer", corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }], heightM: 3.1 },
        { kind: "inner", thicknessM: 0.1, referenceSide: "outer", corners: [{ x: 0, y: 1 }, { x: 1, y: 1 }] },
      ],
    } as any);
    expect(s.hatches[0].heightM).toBe(1.2);
    expect(s.walls[0].heightM).toBe(3.1);
    expect(s.walls[1].heightM).toBe(2.5);
  });
});
