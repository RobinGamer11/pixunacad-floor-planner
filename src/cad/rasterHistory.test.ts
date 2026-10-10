import { describe, it, expect } from "vitest";
import { RasterTileStore } from "./RasterLayers";

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
