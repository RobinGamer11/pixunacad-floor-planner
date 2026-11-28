// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deriveInfoBox } from "./infoBoxGeometry";

describe("beidseitige Infobox", () => {
  it("zeigt das gleiche Bild auf beiden Seiten außerhalb des Kreiskörpers", () => {
    const parts = deriveInfoBox({ id: "info", x: 1, y: 2 }, "sheet", 3);
    expect(parts).toHaveLength(3);
    const [body, front, back] = parts;
    if (body.type !== "mesh" || front.type !== "mesh" || back.type !== "mesh") throw new Error("Expected meshes");
    expect(front.texture?.list).toBe("infoBoxes");
    expect(back.texture).toEqual(front.texture);
    const bodyYs = body.mesh.positions.filter((_, i) => i % 3 === 1);
    expect(front.mesh.positions.filter((_, i) => i % 3 === 1).every(y => y > Math.max(...bodyYs))).toBe(true);
    expect(back.mesh.positions.filter((_, i) => i % 3 === 1).every(y => y < Math.min(...bodyYs))).toBe(true);
    expect(back.sourceId).toBe("info");
    expect(back.sheetId).toBe("sheet");
  });

  it("hält das Bild hinten lesbar statt gespiegelt und kehrt die Dreiecksrichtung um", () => {
    const [, front, back] = deriveInfoBox({ id: "info", x: 0, y: 0 }, "sheet", 0);
    if (front.type !== "mesh" || back.type !== "mesh" || !front.uvs || !back.uvs) throw new Error("Expected textured meshes");
    front.uvs.forEach((uv, i) => expect(back.uvs?.[i]).toBeCloseTo(i % 2 === 0 ? 1 - uv : uv));
    expect(front.uvs[2]).toBe(1);
    expect(back.uvs[2]).toBe(0);
    for (let i = 0; i < front.mesh.indices.length; i += 3) {
      expect(back.mesh.indices.slice(i, i + 3)).toEqual([front.mesh.indices[i], front.mesh.indices[i + 2], front.mesh.indices[i + 1]]);
    }
  });
});