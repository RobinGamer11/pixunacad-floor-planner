import { describe, it, expect, beforeAll } from "vitest";
import { RasterLayer } from "../RasterLayers";
import { decideRasterKey, recordHashes } from "./localScenePersist";
import { isLazySrc, registerLazySrc, resolveTileSrc } from "./lazyTileSrc";

describe("Kacheln bedarfsgerecht laden", () => {
  // jsdom hat kein Canvas: Kontext-Attrappe; jedes Zeichnen/Lesen würde hier auffallen.
  beforeAll(() => { (HTMLCanvasElement.prototype as any).getContext = () => ({ getImageData: () => { throw new Error("dekodiert"); } }); });
  it("restore dekodiert nichts: Kacheln sind unbekannt (nie leer) und bleiben gespeichert", () => {
    const l = new RasterLayer("A", 500, 512);
    l.restore({ labelId: "A", pxPerM: 500, tilePx: 512, strokeCount: 1, tiles: [{ tx: 0, ty: 0, src: "data:image/png;base64,AAAA" }, { tx: 5, ty: 5, src: "data:image/png;base64,BBBB" }] } as any);
    expect(l.isLoading()).toBe(false); // nichts angefordert
    expect(l.isOpaqueAt(0.1, 0.1)).toBeNull(); // unbekannt, nicht transparent
    const json = l.serialize()!;
    expect(json.tiles.map((t: any) => t.src)).toEqual(["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"]);
  });

  it("verzögerte Kachelquelle wird erst bei Bedarf und genau einmal zusammengesetzt", async () => {
    let calls = 0;
    const id = registerLazySrc(async () => { calls++; return "blob:x"; });
    expect(isLazySrc(id)).toBe(true);
    expect(calls).toBe(0);
    expect(await resolveTileSrc(id)).toBe("blob:x");
    expect(await resolveTileSrc(id)).toBe("blob:x");
    expect(calls).toBe(1);
  });
});

describe("Cloud- und Lokalstand je Blatt", () => {
  const base = { hasLocal: true, localDirty: false, base: 3, cloudRev: 3, cloudDeleted: false };
  it("unveränderte Cloud → lokal", () => expect(decideRasterKey(base)).toBe("local"));
  it("neuere Cloud ohne lokale Änderung → Cloud übernehmen", () => expect(decideRasterKey({ ...base, cloudRev: 4 })).toBe("cloud"));
  it("neuere Cloud ohne lokale Änderung, auch wenn lokal Pixel vorhanden → Cloud (nicht veraltet lokal)", () => expect(decideRasterKey({ ...base, cloudRev: 9 })).toBe("cloud"));
  it("beidseitig geändert → Konflikt", () => expect(decideRasterKey({ ...base, cloudRev: 4, localDirty: true })).toBe("conflict"));
  it("Cloud gelöscht, lokal unverändert → löschen", () => expect(decideRasterKey({ ...base, cloudRev: 4, cloudDeleted: true })).toBe("delete"));
  it("kein Cloudstand → lokal", () => expect(decideRasterKey({ ...base, cloudRev: undefined })).toBe("local"));
});

describe("lokale Bereinigung", () => {
  it("schützt aktuelle Kacheln, Muster und Konfliktstände", () => {
    const layers = (h: string) => [{ labelId: "A", strokeCount: 1, entries: [{ id: "e", kind: "checkpoint", revision: 1, order: 0, pxPerM: 500, tilePx: 512, tiles: [{ tx: 0, ty: 0, hash: h }], patternHash: h + "p" }] }];
    const rec = { projectId: "p", format: 2, revision: 1, savedAt: 0, sceneJson: JSON.stringify({ rasterManifest: { s1: layers("a") } }), conflicts: { s1: { revision: 5, layers: layers("c") } } };
    expect([...recordHashes(rec as any)].sort()).toEqual(["a", "ap", "c", "cp"]);
  });
});
