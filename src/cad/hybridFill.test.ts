import { describe, it, expect } from "vitest";
import { vectorizeRasterBoundary } from "./rasterVectorize";
import { findEnclosingFaceFromEdges } from "./hatchFill";
import { polygonAreaAbs } from "./geometry";

/** Zeichnet eine dicke Linie in eine Alpha-Maske (Bresenham + Radius). */
function stroke(a: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number, r = 1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        a[y * w + x] = 255;
      }
    }
  }
}

describe("hybride Face-Erkennung über vektorisierte Pixelgrenzen", () => {
  it("liefert bei überstehenden Pixellinien exakt das Dreieck", () => {
    const w = 260, h = 240;
    const alpha = new Uint8Array(w * h);
    // Dreieck (30,200) (230,200) (130,40) — alle Linien laufen über die Ecken hinaus.
    stroke(alpha, w, h, 10, 200, 250, 200);          // Basis, beidseitig länger
    stroke(alpha, w, h, 10, 224, 160, 8);            // linke Flanke, verlängert
    stroke(alpha, w, h, 250, 224, 100, 8);           // rechte Flanke, verlängert

    const pxPerM = 100;
    const { edges } = vectorizeRasterBoundary(alpha, 16, w, h, 0, 0, pxPerM);
    expect(edges.length).toBeGreaterThan(3);

    const face = findEnclosingFaceFromEdges(edges, { x: 1.3, y: 1.6 });
    expect(face).not.toBeNull();

    const area = polygonAreaAbs(face!);
    // Erwartete Dreiecksfläche ca. 0.5 * 2.0 m * 1.6 m = 1.6 m²
    expect(area).toBeGreaterThan(1.2);
    expect(area).toBeLessThan(2.0);
    // Kein Ausläufer entlang der Verlängerungen: wenige Ecken.
    expect(face!.length).toBeLessThanOrEqual(8);
  });
});
