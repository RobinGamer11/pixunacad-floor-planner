import { describe, it, expect } from "vitest";
import { Scene } from "../Scene";
import { deriveScene3D, deriveWalls, deriveHatch } from "./geometryDerivation";
import { applyRelations3D, topOfItems } from "./relations";
import { copyObjectMeta, applyObjectMeta, attachObjectMeta, restoreObjectMeta, sceneObjectCounts } from "../objectMeta";
import { meshVolume, slabMesh, meshBounds } from "./solidMesh";
import type { Derived3D, Prism3D, Mesh3D } from "./geometryDerivation";

const sheet = { id: "s1", name: "EG" } as any;
const sq = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const vol = (d: Derived3D) => d.type === "prism" ? (slabMesh(d.footprint, d.holes, () => d.z0, () => d.z1) ? meshVolume(slabMesh(d.footprint, d.holes, () => d.z0, () => d.z1)!) : 0) : d.type === "mesh" ? meshVolume(d.mesh) : 0;
const sumVol = (l: Derived3D[]) => l.reduce((s, d) => s + vol(d), 0);

describe("Automatische Wandanschlüsse in 3D", () => {
  it("L-Ecke mit verschiedenen Dicken: Gehrung wie 2D, kein doppeltes Volumen, Wände einzeln", () => {
    const s = new Scene();
    const a = s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "center", corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }] });
    const b = s.createWall({ kind: "outer", thicknessM: 0.2, referenceSide: "center", corners: [{ x: 4, y: 0 }, { x: 4, y: 3 }] });
    const m = deriveWalls(s, [], "s1", 0);
    const pa = m.get(a)!, pb = m.get(b)!;
    expect(pa.length).toBeGreaterThan(0); expect(pb.length).toBeGreaterThan(0);
    expect(pa.every(p => p.sourceId === a.id)).toBe(true);
    expect(pb.every(p => p.sourceId === b.id)).toBe(true);
    // Ecke geschlossen: der Außeneckpunkt (4.1/4.15, -0.15) liegt im Wandkörper
    const xs = [...pa, ...pb].flatMap(p => p.footprint.map(q => q.x));
    expect(Math.max(...xs)).toBeGreaterThan(4.09);
    // Summe der Einzelvolumina = Volumen der Vereinigung (keine Überlappung)
    const h = 2.5;
    const total = sumVol([...pa, ...pb]);
    const ideal = (4 * 0.3 + 3 * 0.2) * h; // grob: Gehrung fügt ≤ Eckquadrat hinzu
    expect(total).toBeGreaterThan(ideal - 0.3 * 0.2 * h);
    expect(total).toBeLessThan(ideal + 0.3 * 0.3 * h + 1e-6);
  });

  it("Unterschiedliche Höhen: nur der gemeinsame Höhenbereich wird bereinigt", () => {
    const s = new Scene();
    const a = s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "center", corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }] });
    const b = s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "center", corners: [{ x: 2, y: 0 }, { x: 2, y: 3 }] });
    (a as any).heightM = 1; (b as any).heightM = 3;
    const pb = deriveWalls(s, [], "s1", 0).get(b)!;
    // T-Anschluss: B behält oberhalb von A (1 … 3 m) den vollen Anschluss
    expect(pb.some(p => p.z0 <= 1 + 1e-9 && p.z1 >= 3 - 1e-9 && p.footprint.some(q => q.y < 0.1))).toBe(true);
    expect(Math.max(...pb.map(p => p.z1))).toBeCloseTo(3);
  });

  it("Fenster schneidet in den geheilten Körper, ohne den Anschluss zu zerstören", () => {
    const s = new Scene();
    const a = s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "center", corners: [{ x: 0, y: 0 }, { x: 4, y: 0 }] });
    s.createWall({ kind: "outer", thicknessM: 0.3, referenceSide: "center", corners: [{ x: 4, y: 0 }, { x: 4, y: 3 }] });
    const win = { wallId: a.id, posM: 2, widthM: 1, heightM: 1.2, breakHeightM: 0.9 };
    const pa = deriveWalls(s, [win], "s1", 0).get(a)!;
    expect(pa.some(p => Math.abs(p.z1 - 0.9) < 1e-9)).toBe(true);
    expect(pa.some(p => Math.abs(p.z0 - 2.1) < 1e-9)).toBe(true);
    expect(Math.max(...pa.flatMap(p => p.footprint.map(q => q.x)))).toBeGreaterThan(4.1);
  });
});

describe("Geneigte Schraffur", () => {
  const roof = (angle: number) => ({ id: "R", points: sq(0, 0, 4, 2), holes: [sq(1, 0.5, 2, 1.5)], heightM: 0.2, elevationM: 3, tilt3D: { edgeIndex: 0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, count: 4, angleDeg: angle } });

  it("Neigung ändert keine 2D-Punkte, behält Aussparungen und starres Volumen", () => {
    const h = roof(30);
    const before = JSON.stringify(h.points);
    const d = deriveHatch(h, "s1", 0) as Mesh3D;
    expect(d.type).toBe("mesh");
    expect(JSON.stringify(h.points)).toBe(before);
    expect(meshVolume(d.mesh)).toBeCloseTo((8 - 1) * 0.2, 5);
    // Achse durch die gegenüberliegende Kante y = 2 bleibt auf Höhenlage 3
    expect(meshBounds(d.mesh).minZ).toBeCloseTo(3, 6);
  });

  it("Zurücksetzen (Winkel 0 / ohne tilt3D) ergibt wieder das senkrechte Prisma", () => {
    const h: any = roof(30); delete h.tilt3D;
    expect(deriveHatch(h, "s1", 0)!.type).toBe("prism");
  });

  it("Gelöschte Bezugskante wird gemeldet, keine andere Kante verwendet", () => {
    const h: any = roof(30); h.points = [{ x: 0.5, y: -0.5 }, ...h.points.slice(1), { x: -1, y: 1 }];
    const [d] = deriveScene3D({ hatches: [h] }, sheet);
    expect(d.type).toBe("prism");
    expect(d.note).toMatch(/nicht mehr eindeutig/);
  });

  it("Kopieren übernimmt die Neigung, Speichern/Laden erhält sie", () => {
    const h: any = roof(20);
    expect(copyObjectMeta(h, { withCode: false }).tilt3D!.angleDeg).toBe(20);
    const lib: any = { bodyHeightM: 1.8 };
    expect(copyObjectMeta(lib).bodyHeightM).toBe(1.8);
    const out: any = { hatches: [{ id: "R" }] };
    attachObjectMeta(out, { hatches: [h] });
    const target: any = { hatches: [{ id: "R" }] };
    restoreObjectMeta(target, out, sceneObjectCounts({ hatches: [] }));
    expect(target.hatches[0].tilt3D.angleDeg).toBe(20);
    const o: any = {}; applyObjectMeta(o, h, { withCode: false });
    expect(o.tilt3D.edgeIndex).toBe(0);
  });
});

describe("Beziehungen mit geneigten Körpern", () => {
  const wallBox = (): Prism3D => ({ type: "prism", source: "wall", sourceId: "W", sheetId: "s1", footprint: sq(0, 0.9, 4, 1.1), holes: [], z0: 0, z1: 5, color: "#ccc" });

  it("Wand an Unterseite einer geneigten Fläche begrenzen ergibt schräge Oberkante (Giebel)", () => {
    // Dach über y ∈ [0,2], Achse bei y = 2 auf Höhe 3, Kante y = 0 hebt sich
    const roof: any = { id: "R", points: sq(-1, 0, 5, 2), holes: [], heightM: 0.2, elevationM: 3, tilt3D: { edgeIndex: 0, a: { x: -1, y: 0 }, b: { x: 5, y: 0 }, count: 4, angleDeg: 30 } };
    const items: Derived3D[] = [wallBox(), deriveHatch(roof, "s1", 0)!];
    const { items: out, issues } = applyRelations3D(items, [{ sheetId: "s1", id: "W", relations3D: [{ type: "limitToSurface", targetSheetId: "s1", targetId: "R", face: "bottom", keep: "below" }] }]);
    expect(issues).toHaveLength(0);
    const w = out.filter(d => d.sourceId === "W");
    const top = topOfItems(w)!;
    // Höchste Stelle bei y = 0.9: Unterseite z = 3 + (2 - 0.9)·tan(30°) (Achse fest, starr gekippt)
    const expected = 3 + (2 - 0.9) * Math.tan(Math.PI / 6);
    expect(top).toBeGreaterThan(3.3);
    expect(top).toBeLessThan(expected + 0.05);
    expect(top).toBeLessThan(5);
  });

  it("Außerhalb des Wirkbereichs bleibt die Wand unverändert", () => {
    const roof: Prism3D = { type: "prism", source: "hatch", sourceId: "R", sheetId: "s1", footprint: sq(0, 0, 2, 2), holes: [], z0: 3, z1: 3.2, color: "#ccc" };
    const { items } = applyRelations3D([wallBox(), roof], [{ sheetId: "s1", id: "W", relations3D: [{ type: "limitToSurface", targetSheetId: "s1", targetId: "R", face: "bottom", keep: "below" }] }]);
    const w = items.filter(d => d.sourceId === "W") as Prism3D[];
    expect(w.some(p => p.z1 === 5)).toBe(true);
    expect(w.some(p => p.z1 === 3)).toBe(true);
  });

  it("Durchbricht mit geneigtem Körper zieht das echte Volumen ab", () => {
    const slab: any = { id: "C", points: sq(0, 0, 2, 2), holes: [], heightM: 0.5, elevationM: 0, tilt3D: { edgeIndex: 0, a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, count: 4, angleDeg: 20 } };
    const cutter = deriveHatch(slab, "s1", 0)!;
    const target: Prism3D = { type: "prism", source: "hatch", sourceId: "T", sheetId: "s1", footprint: sq(-1, -1, 3, 3), holes: [], z0: 0, z1: 3, color: "#ccc" };
    const { items } = applyRelations3D([cutter, target], [{ sheetId: "s1", id: "C", relations3D: [{ type: "cutout", targetSheetId: "s1", targetId: "T" }] }]);
    const t = items.filter(d => d.sourceId === "T");
    expect(t[0].type).toBe("mesh");
    // Geneigte Platte ragt teils unter z = 0 → abgezogen wird nur der Teil im Zielkörper
    const removed = 16 * 3 - sumVol(t);
    expect(removed).toBeGreaterThan(0.5 * 4 * 0.6);
    expect(removed).toBeLessThan(0.5 * 4 + 1e-3);
  });
});
