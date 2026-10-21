import { describe, it, expect } from "vitest";
import { applyRelations3D } from "./relations";

const sq = (x0: number, y0: number, s: number) => [{ x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }];
const prism = (id: string, fp: any, z0: number, z1: number): any => ({ type: "prism", source: "hatch", sourceId: id, sheetId: "s", color: "#fff", order: 0, footprint: fp, holes: [], z0, z1 });

describe("Durchbricht", () => {
  it("schneidet das Ziel nur im tatsächlichen Schnittvolumen aus, nicht darüber/darunter", () => {
    const target = prism("t", sq(0, 0, 4), 0, 3);
    const source = prism("q", sq(1, 1, 1), 1, 2);
    for (const edge of [undefined, "top", "bottom"] as const) {
      const { items } = applyRelations3D([target, source], [{ sheetId: "s", id: "q", relations3D: [{ type: "cutout", targetSheetId: "s", targetId: "t", ...(edge ? { edge } : {}) } as any] }]);
      const pieces = items.filter((d: any) => d.sourceId === "t") as any[];
      const vol = pieces.reduce((s, p) => s + (p.z1 - p.z0) * Math.abs(p.footprint.reduce((a: number, q: any, i: number) => { const r = p.footprint[(i + 1) % p.footprint.length]; return a + q.x * r.y - r.x * q.y; }, 0) / 2), 0);
      expect(vol).toBeCloseTo(48 - 1, 6);
    }
  });
});
