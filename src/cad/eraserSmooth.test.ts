import { describe, it, expect } from "vitest";
import { smoothCutRing } from "./EraserTool";

describe("Radierer Kanten glätten", () => {
  it("reduziert die Punkte einer radierten Kante und behält Original-Ecken", () => {
    const ring = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
    for (let i = 1; i < 40; i++) ring.push({ x: 4 - i * 0.1, y: 4 + Math.sin(i) * 0.0002 });
    ring.push({ x: 0, y: 4 });
    const isCut = ring.map((_, i) => i > 2 && i < ring.length - 1);
    const out = smoothCutRing(ring, isCut, 0.01);
    expect(out.length).toBeLessThan(ring.length);
    expect(out).toContainEqual({ x: 0, y: 0 });
    expect(out).toContainEqual({ x: 4, y: 0 });
  });
});
