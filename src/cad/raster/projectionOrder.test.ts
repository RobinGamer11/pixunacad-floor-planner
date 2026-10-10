import { describe, it, expect } from "vitest";
import { projectionDrawSteps, withRasterBounds, computeProjectionLayout, type ProjectionItem, type ProjectionRaster } from "../PlanProjections";

const fakeRaster = (order: string[], hidden: string[], bounds: { x: number; y: number; w: number; h: number } | null): ProjectionRaster => ({
  layers: { contentBoundsWorld: () => bounds, get: () => null } as any,
  order,
  visible: (id) => !hidden.includes(id),
});

describe("Ausschnitt: Ebenenreihenfolge und Pixelgröße", () => {
  const items: ProjectionItem[] = [
    { kind: "segment", labelId: "A", a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
    { kind: "segment", labelId: "B", a: { x: 0, y: 1 }, b: { x: 1, y: 1 } },
  ];

  it("zeichnet hinten → vorne, je Ebene erst Pixel, dann Vektoren", () => {
    // LabelManager-Liste: Index 0 = vorne.
    const steps = projectionDrawSteps(items, fakeRaster(["A", "B"], [], null));
    expect(steps.map((s) => s.rasterLabel)).toEqual(["B", "A", null]);
    expect(steps[0].items.map((i) => i.labelId)).toEqual(["B"]);
    expect(steps[1].items.map((i) => i.labelId)).toEqual(["A"]);
  });

  it("übernimmt die Sichtbarkeit: ausgeblendete Ebene ohne Pixel", () => {
    const steps = projectionDrawSteps(items, fakeRaster(["A", "B"], ["B"], null));
    expect(steps[0].rasterLabel).toBeNull();
  });

  it("reines Pixelblatt bekommt die Größe des Rasterinhalts", () => {
    const withPx = withRasterBounds([], fakeRaster(["A"], [], { x: 2, y: 3, w: 4, h: 5 }));
    expect(withPx).toHaveLength(1);
    const layout = computeProjectionLayout(withPx, { x: 0, y: 0, rotation: 0, scaleDen: 100, clip: { left: 0, right: 0, top: 0, bottom: 0 } });
    // 4 m bei 1:100 = 40 mm + 2 × 12 mm Rand.
    expect(layout.bboxLocalMm.right - layout.bboxLocalMm.left).toBeCloseTo(64);
  });

  it("Ausschnittsgröße umfasst Pixel außerhalb der Linien", () => {
    const all = withRasterBounds(items, fakeRaster(["A"], [], { x: -1, y: 0, w: 3, h: 1 }));
    const layout = computeProjectionLayout(all, { x: 0, y: 0, rotation: 0, scaleDen: 100, clip: { left: 0, right: 0, top: 0, bottom: 0 } });
    expect(layout.bboxLocalMm.right - layout.bboxLocalMm.left).toBeCloseTo(54);
  });
});

import { RasterLayer } from "../RasterLayers";

describe("fehlendes Muster", () => {
  it("bricht die Ausgabe ab statt unvollständig zu zeichnen", async () => {
    const l = new RasterLayer("A", 500, 512);
    l.addFill({ id: "p", rings: [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]], rule: "evenodd", color: "#fff", alpha: 1,
      pattern: { id: "img:x", scale: 1, angleDeg: 0, skewDeg: 0, stretch: 1, color: "#000", lineWidthM: 0.01, ax: 0, ay: 0, src: "blob:missing" } });
    const ctx = { canvas: { width: 10, height: 10 }, save() {}, restore() {} } as any;
    const orig = Date.now;
    let t = orig();
    Date.now = () => (t += 20_000);
    try {
      await expect(l.drawRegionAsync(ctx, { x: 0, y: 0, w: 1, h: 1 }, 10, 0, 0)).rejects.toThrow("PIXUNA_PATTERN_MISSING");
    } finally { Date.now = orig; }
  });
});
