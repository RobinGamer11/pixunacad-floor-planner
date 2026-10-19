import { describe, it, expect } from "vitest";
import { Scene } from "../Scene";
import { SheetManager } from "../SheetManager";
import { restoreOneScene } from "../sceneSerde";
import { copyObjectMeta } from "../objectMeta";
import { deriveScene3D, deriveProject3D, deriveWall } from "./geometryDerivation";

const sheet = (extra: any = {}) => ({ id: "s1", name: "EG", ...extra });

describe("3D-Ableitung", () => {
  it("Blatthöhe + Objekthöhe ergibt Welthöhe, auch negativ", () => {
    const s = new Scene();
    const h = s.createHatch([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }]);
    h.heightM = 0.5; (h as any).elevationM = 0.2;
    const [d] = deriveScene3D(s, sheet({ elevationM: -3 })) as any[];
    expect(d.type).toBe("prism");
    expect(d.z0).toBeCloseTo(-2.8);
    expect(d.z1).toBeCloseTo(-2.3);
  });

  it("Schraffur mit Körperhöhe 0 wird flache Fläche, Löcher bleiben erhalten", () => {
    const s = new Scene();
    const h = s.createHatch([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
    (h as any).holes = [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }]];
    const [d] = deriveScene3D(s, sheet()) as any[];
    expect(d.type).toBe("plane");
    expect(d.holes).toHaveLength(1);
  });

  it("Wand ohne Öffnung = ein Körper 2,5 m; Fenster erzeugt Brüstung und Sturz", () => {
    const s = new Scene();
    const w = s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "center", corners: [{ x: 0, y: 0 }, { x: 5, y: 0 }] });
    expect(deriveWall(w, [], "s1", 0)).toHaveLength(1);
    const win = { wallId: w.id, posM: 2.5, widthM: 1, heightM: 1.2, breakHeightM: 0.9 };
    const parts = deriveWall(w, [win], "s1", 0);
    // links, Brüstung, Sturz, rechts
    expect(parts).toHaveLength(4);
    expect(parts.some(p => p.z0 === 0 && Math.abs(p.z1 - 0.9) < 1e-9)).toBe(true);
    expect(parts.some(p => Math.abs(p.z0 - 2.1) < 1e-9 && p.z1 === 2.5)).toBe(true);
  });

  it("Tür bis Wandoberkante lässt keinen Sturz übrig", () => {
    const s = new Scene();
    const w = s.createWall({ kind: "inner", thicknessM: 0.1, referenceSide: "center", corners: [{ x: 0, y: 0 }, { x: 3, y: 0 }] });
    const parts = deriveWall(w, [{ wallId: w.id, posM: 1.5, widthM: 1, heightM: 2.5, breakHeightM: 0 }], "s1", 0);
    expect(parts).toHaveLength(2);
  });

  it("Blätter ohne 3D-Teilnahme werden ausgelassen", () => {
    const s = new Scene();
    s.createHatch([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(deriveProject3D([sheet({ participatesIn3D: false })], () => s)).toHaveLength(0);
    expect(deriveProject3D([sheet()], () => s)).toHaveLength(1);
  });
});

describe("3D-Datenmodell", () => {
  it("Blatthöhe und Teilnahme überstehen toJSON/restore; Altdaten bleiben Standard", () => {
    const m = new SheetManager();
    const id = m.list()[0].id;
    m.setElevation(id, -2.75); m.setParticipatesIn3D(id, false);
    const m2 = new SheetManager(); m2.restore(m.toJSON());
    expect(m2.getById(id)!.elevationM).toBe(-2.75);
    expect(m2.getById(id)!.participatesIn3D).toBe(false);
    const m3 = new SheetManager(); m3.restore([{ id: "a", name: "Alt" }]);
    expect(m3.getById("a")!.elevationM).toBeUndefined();
    expect(m3.getById("a")!.participatesIn3D).toBeUndefined();
  });

  it("Objekthöhe läuft über die Objektdaten mit", () => {
    expect(copyObjectMeta({ elevationM: 1.5 }).elevationM).toBe(1.5);
    expect(copyObjectMeta({}).elevationM).toBeUndefined();
    const s = new Scene();
    restoreOneScene(s, { hatches: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], elevationM: -0.4 }] } as any);
    // restoreOneScene selbst kennt nur Geometrie; Metadaten setzt restoreObjectMeta (CadApp)
    expect(s.hatches).toHaveLength(1);
  });
});
