import { describe, it, expect } from "vitest";
import { coveredTiles } from "./rasterCoverage";
import { planRasterAction, RASTER_BUDGET } from "./RasterPolicy";

describe("Sparse Kachelermittlung", () => {
  it("diagonaler Strich belegt nur seinen Verlauf, nicht das ganze Rechteck", () => {
    const tiles = coveredTiles({ polylines: [{ pts: [{ x: 0, y: 0 }, { x: 100, y: 100 }], pad: 0.05 }], polygons: [] }, 1, 100000)!;
    expect(tiles.length).toBeLessThan(400); // Rechteck wären 10 201 Kacheln
    expect(tiles.length).toBeGreaterThanOrEqual(101);
  });

  it("zwei entfernte Striche erzeugen keine Kacheln im Zwischenraum", () => {
    const tiles = coveredTiles({
      polylines: [
        { pts: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }], pad: 0.01 },
        { pts: [{ x: 500.2, y: 0.2 }, { x: 500.4, y: 0.2 }], pad: 0.01 },
      ], polygons: [],
    }, 1, 100000)!;
    expect(tiles.map((t) => t.tx).sort((a, b) => a - b)).toEqual([0, 500]);
  });

  it("negative Koordinaten und Flächeninneres werden erfasst", () => {
    const sq = [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 3, y: 3 }, { x: -3, y: 3 }];
    const tiles = coveredTiles({ polylines: [], polygons: [{ pts: sq, pad: 0 }] }, 1, 1000)!;
    expect(tiles.length).toBe(49);
    expect(tiles.some((t) => t.tx === 0 && t.ty === 0)).toBe(true);
  });

  it("Überlauf wird vor jeder Allokation erkannt", () => {
    const huge = [{ x: 0, y: 0 }, { x: 1e6, y: 0 }, { x: 1e6, y: 1e6 }, { x: 0, y: 1e6 }];
    expect(coveredTiles({ polylines: [], polygons: [{ pts: huge, pad: 0 }] }, 1, 100)).toBeNull();
  });
});

describe("RasterPolicy", () => {
  it("klein = sofort, groß = Job, zu groß = ausdrücklich abgelehnt", () => {
    const base = { layerPxPerM: 500, tilePx: 512, hasTempStore: true, supportsJobs: true };
    expect(planRasterAction({ ...base, touchedTiles: 4 })).toMatchObject({ ok: true, mode: "sync" });
    expect(planRasterAction({ ...base, touchedTiles: 200 })).toMatchObject({ ok: true, mode: "job" });
    expect(planRasterAction({ ...base, touchedTiles: RASTER_BUDGET.maxActionTiles + 1 })).toMatchObject({ ok: false, reason: "too-large" });
    expect(planRasterAction({ ...base, touchedTiles: 200, hasTempStore: false })).toMatchObject({ ok: false });
    expect(planRasterAction({ ...base, touchedTiles: 200, supportsJobs: false })).toMatchObject({ ok: false });
  });
});
