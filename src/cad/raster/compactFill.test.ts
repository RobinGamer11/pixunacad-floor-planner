import { describe, it, expect } from "vitest";
import { RasterLayer } from "../RasterLayers";
import { toManifest, fromManifest } from "./rasterManifest";
import { chooseActionScale, RASTER_BUDGET } from "./RasterPolicy";

const square = { id: "f1", rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }]], rule: "evenodd" as const, color: "#ff0000", alpha: 1 };

describe("kompakte Vollfläche", () => {
  it("bleibt ohne Kacheln und kennt Loch und Außenbereich", () => {
    const l = new RasterLayer("A", 500, 512);
    l.addFill(square);
    expect(l.hasContent()).toBe(true);
    expect(l.isOpaqueAt(1, 1)).toBe(true);
    expect(l.isOpaqueAt(5, 5)).toBe(false);
    expect(l.isOpaqueAt(20, 20)).toBe(false);
    const json = l.serialize()!;
    expect(json.tiles).toHaveLength(0);
    expect(json.fills).toHaveLength(1);
  });

  it("Manifest speichert die Fläche als solidFill ohne Pixel und lädt sie zurück", async () => {
    const blobs = new Map<string, Blob>();
    const m = await toManifest({ s1: [{ labelId: "A", pxPerM: 500, tilePx: 512, tiles: [], fills: [square], strokeCount: 1 }] }, 1, blobs);
    expect(blobs.size).toBe(0);
    expect(m.s1[0].entries).toHaveLength(1);
    expect(m.s1[0].entries[0]).toMatchObject({ kind: "solidFill", tiles: [] });
    const back = await fromManifest(m, []);
    expect(back.s1[0].fills[0].rings).toEqual(square.rings);
  });
});

describe("automatische Auflösung neuer Aktionen", () => {
  const budget = RASTER_BUDGET.maxActionAssetBytes;
  it("passt ins Budget → volle Stufe", () => {
    expect(chooseActionScale({ bytesPerTileAtFull: 1000, occupiedTiles: 100, featurePx: 20, reducible: true })).toBe(1);
  });
  it("zu groß → nächste Halbierungsstufe, die passt", () => {
    expect(chooseActionScale({ bytesPerTileAtFull: budget / 100, occupiedTiles: 300, featurePx: 20, reducible: true })).toBe(0.5);
  });
  it("feine Striche, Muster und Text werden nie vergröbert", () => {
    expect(chooseActionScale({ bytesPerTileAtFull: budget / 100, occupiedTiles: 300, featurePx: 4, reducible: true })).toBeNull();
    expect(chooseActionScale({ bytesPerTileAtFull: budget / 100, occupiedTiles: 300, featurePx: 20, reducible: false })).toBeNull();
  });
});

describe("Musterfläche (patternFill)", () => {
  const pat = { id: "f2", rings: [[{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }]], rule: "evenodd" as const, color: "#ffffff", alpha: 0,
    pattern: { id: "mauerwerk", scale: 1, angleDeg: 45, skewDeg: 0, stretch: 1, color: "#000000", lineWidthM: 0.01, ax: 0, ay: 0 } };
  it("große Musterfläche erzeugt keine Bildkacheln und behält die Mustertransformation", () => {
    const l = new RasterLayer("A", 500, 512);
    l.addFill(pat);
    const json = l.serialize()!;
    expect(json.tiles).toHaveLength(0);
    expect(json.fills![0].pattern).toMatchObject({ id: "mauerwerk", angleDeg: 45, lineWidthM: 0.01 });
  });
  it("Manifest speichert patternFill ohne Pixeldaten und lädt es zurück", async () => {
    const m = await toManifest({ s: [{ labelId: "A", pxPerM: 500, tilePx: 512, tiles: [], fills: [pat], strokeCount: 1 }] }, 1, new Map());
    expect(m.s[0].entries[0].kind).toBe("patternFill");
    expect(m.s[0].entries[0].tiles).toHaveLength(0);
    const back = await fromManifest(m, []);
    expect(back.s[0].fills[0].pattern.angleDeg).toBe(45);
  });
});
