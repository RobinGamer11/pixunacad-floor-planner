import { describe, it, expect } from "vitest";
import { Scene } from "./Scene";
import { normalizeDisplayGradient, isDisplayGradientActive, copyDisplayGradient } from "./displayGradient";

describe("Transparenzverlauf", () => {
  it("ist standardmäßig nicht gesetzt", () => {
    const scene = new Scene();
    const h = scene.createHatch([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect((h as any).displayGradient).toBeUndefined();
    expect(isDisplayGradientActive((h as any).displayGradient)).toBe(false);
  });

  it("übernimmt gesetzte Werte und begrenzt sie", () => {
    const scene = new Scene();
    const h = scene.createHatch([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], {
      displayGradient: { enabled: true, type: "vignette", endOpacity: 5, softness: -20 } as any,
    });
    const g = (h as any).displayGradient!;
    expect(g.enabled).toBe(true);
    expect(g.type).toBe("vignette");
    expect(g.endOpacity).toBe(1);
    expect(g.softness).toBe(0);
  });

  it("liest fehlerhafte Daten robust", () => {
    expect(normalizeDisplayGradient(null)).toBeUndefined();
    expect(copyDisplayGradient(undefined)).toBeUndefined();
    const g = normalizeDisplayGradient({ enabled: true, direction: "quatsch" });
    expect(g?.direction).toBe("left-to-right");
  });
});
