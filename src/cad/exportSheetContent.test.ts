import { describe, it, expect } from "vitest";
import { flattenSheetSnapshot, itemsBoundsM } from "./PlanProjections";

/** Serialisierte Sheet-Scene mit allen Objektarten, die der Export früher übersprungen hat. */
function snapshotWithAllKinds(): any {
  return {
    version: 3,
    segments: [
      { id: "s1", labelId: "lbl-seg", a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, color: "#111", thicknessM: 0.005 },
    ],
    walls: [
      {
        id: "w1", labelId: "lbl-wall", kind: "outer", thicknessM: 0.24, referenceSide: "center",
        corners: [{ x: 3, y: 0 }, { x: 4, y: 0 }], hiddenCornerIndices: [], customName: "",
      },
    ],
    stairs: [
      { id: "st1", labelId: "lbl-stair", path: [{ x: 0, y: 2 }, { x: 1, y: 2 }], stairWidthM: 1.0 },
    ],
    freeStrokes: [
      { id: "f1", labelId: "lbl-free", points: [{ x: 0, y: -3 }, { x: 1, y: -3.2 }], thicknessM: 0.01, color: "#333" },
    ],
    tables: [
      { id: "t1", labelId: "lbl-table", center: { x: 10, y: 0 }, widthM: 1.2, heightM: 0.8 },
    ],
    libraryInstances: [
      {
        id: "li1", labelId: "lbl-lib", definitionId: "def-1",
        position: { x: 5, y: 5 }, rotationRad: 0, scaleX: 1, scaleY: 1,
      },
    ],
  };
}

const DEFINITIONS = [
  {
    id: "def-1",
    name: "Baum",
    geometry: [{ kind: "segment", data: { a: { x: 0, y: 0 }, b: { x: 2, y: 0 } } }],
  },
];

describe("Export: vollständiger Sheet-Inhalt in Projektionen", () => {
  it("liefert Bound-Boxes für Wand, Treppe, Freihand, Tabelle und Bibliothekselement", () => {
    const items = flattenSheetSnapshot(snapshotWithAllKinds(), DEFINITIONS as any);
    const labels = new Set(items.map(i => i.labelId));
    expect(labels.has("lbl-wall")).toBe(true);
    expect(labels.has("lbl-stair")).toBe(true);
    expect(labels.has("lbl-free")).toBe(true);
    expect(labels.has("lbl-table")).toBe(true);
    // Bibliothekselemente nur mit Projektdefinitionen.
    expect(labels.has("lbl-lib")).toBe(true);
    expect(flattenSheetSnapshot(snapshotWithAllKinds(), undefined).some(i => i.labelId === "lbl-lib")).toBe(false);
  });

  it("deckt die Bounds aller Objektarten ab (früher fehlten diese im Zuschnitt)", () => {
    const items = flattenSheetSnapshot(snapshotWithAllKinds(), DEFINITIONS as any);
    const b = itemsBoundsM(items);
    // Segment endet bei x=2.
    expect(b.maxX).toBeGreaterThanOrEqual(2);
    // Wand endet bei x=4 (+ Wanddicke).
    expect(b.maxX).toBeGreaterThanOrEqual(4);
    // Tabelle bei x=10 mit Breite 1,2 → rechte Kante 10,6.
    expect(b.maxX).toBeGreaterThanOrEqual(10.6);
    // Freihand reicht bis y=-3,2.
    expect(b.minY).toBeLessThanOrEqual(-3.2);
    // Bibliothekselement 0..2 m lang bei Position (5,5) → bis x=7.
    expect(b.maxX).toBeGreaterThanOrEqual(7);
    // Treppe: Pfad bei y=2, Breite 1,0 → y bis 2,5.
    expect(b.maxY).toBeGreaterThanOrEqual(2.5);
  });

  it("ignoriert unbekannte/gekoppelte Objekte nicht als Fehler", () => {
    const snap = snapshotWithAllKinds();
    snap.doors = [{ id: "d1", labelId: "lbl-door", wallId: "w1", position: 0.5, flipSide: false, flipSwing: false }];
    snap.unknownFoo = [{ x: 1 }];
    const items = flattenSheetSnapshot(snap, DEFINITIONS as any);
    expect(items.some(i => i.labelId === "lbl-door")).toBe(true);
  });
});
