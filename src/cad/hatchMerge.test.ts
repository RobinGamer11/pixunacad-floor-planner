import { describe, it, expect } from "vitest";
import { mergeHatchGeometry } from "./hatchMerge";

const sq = (x: number, y: number, s: number) => ({
  points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }],
  bulges: [], holes: [], holeBulges: [],
});

describe("mergeHatchGeometry", () => {
  it("verbindet überlappende Schraffuren zu einer Fläche", () => {
    const r = mergeHatchGeometry([sq(0, 0, 2), sq(1, 0, 2)]);
    expect(r).not.toBeNull();
    const xs = r!.outer.map((p) => p.x);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(3);
  });
  it("lehnt getrennte Flächen ab", () => {
    expect(mergeHatchGeometry([sq(0, 0, 1), sq(5, 5, 1)])).toBeNull();
  });
});
