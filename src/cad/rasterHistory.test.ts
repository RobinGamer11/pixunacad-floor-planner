import { describe, it, expect } from "vitest";
import { RasterTileStore } from "./RasterLayers";
import { rasterChunks, RASTER_CHUNK_PIXELS } from "./rasterize";

describe("Pixel-Verlauf: gemeinsamer Kachelspeicher", () => {
  it("Verlaufsstände enthalten nur Referenzen; ungenutzte Versionen werden freigegeben", () => {
    const st = new RasterTileStore();
    const big = "data:image/png;base64," + "A".repeat(200_000);
    const a = st.put(big), b = st.put(big + "B");
    const snapA = JSON.stringify({ tiles: [{ src: RasterTileStore.ref(a) }] });
    const snapB = JSON.stringify({ tiles: [{ src: RasterTileStore.ref(b) }] });
    // 20 Verlaufsschritte mit derselben unveränderten Kachel: kein Bild-Duplikat.
    const history = Array.from({ length: 20 }, (_, i) => (i % 2 ? snapA : snapB));
    expect(history.join("").length).toBeLessThan(2000);
    st.prune([snapA]);
    expect(st.get(a)).toBe(big);
    expect(st.get(b)).toBeUndefined();
    expect(RasterTileStore.parse(RasterTileStore.ref(a))).toBe(a);
    expect(RasterTileStore.parse("data:image/png;base64,x")).toBe(null);
  });
});

describe("Große Rasteroperation in Teilbereichen", () => {
  it("Teilbereiche überdecken das Rechteck lückenlos, liegen auf Kachelgrenzen und bleiben klein", () => {
    const pxPerM = 2000, tileWorld = 512 / pxPerM;
    const b = { x: 0.03, y: -0.4, w: 25, h: 3 };
    const chunks = rasterChunks(b, pxPerM, tileWorld);
    expect(chunks.length).toBeGreaterThan(1);
    let area = 0;
    for (const c of chunks) {
      area += c.w * c.h;
      expect(Math.ceil(c.w * pxPerM) * Math.ceil(c.h * pxPerM)).toBeLessThanOrEqual(RASTER_CHUNK_PIXELS * 1.01);
      for (const edge of [c.x, c.x + c.w]) {
        if (Math.abs(edge - b.x) > 1e-9 && Math.abs(edge - (b.x + b.w)) > 1e-9) {
          expect(Math.abs(edge / tileWorld - Math.round(edge / tileWorld))).toBeLessThan(1e-6);
        }
      }
    }
    expect(area).toBeCloseTo(b.w * b.h, 6);
  });
});
