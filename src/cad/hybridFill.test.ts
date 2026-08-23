import { describe, it, expect } from "vitest";
import { vectorizeRasterBoundary } from "./rasterVectorize";
import { findEnclosingFaceFromEdges, type RawEdge } from "./hatchFill";
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

const seg = (ax: number, ay: number, bx: number, by: number): RawEdge =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

/** Dreieck (0.3,2.0) (2.3,2.0) (1.3,0.4) — alle Linien laufen über die Ecken hinaus. */
const TRI_AREA = 1.6;

describe("Face-Erkennung: Schnittpunkte begrenzen das Face", () => {
  it("Vektor + Vektor: nur das Dreieck, trotz weiterlaufender Linien", () => {
    const edges: RawEdge[] = [
      seg(0.1, 2.0, 2.5, 2.0),   // Basis, beidseitig verlängert
      seg(0.1, 2.24, 1.6, 0.08), // linke Flanke, verlängert
      seg(2.5, 2.24, 1.0, 0.08), // rechte Flanke, verlängert
      // Zusätzliches Objekt, das die Verlängerungen kreuzt.
      seg(0.0, 2.4, 3.0, 2.4),
      seg(0.0, 0.1, 3.0, 0.1),
    ];
    const face = findEnclosingFaceFromEdges(edges, { x: 1.3, y: 1.6 });
    expect(face).not.toBeNull();
    const area = polygonAreaAbs(face!);
    expect(area).toBeGreaterThan(TRI_AREA * 0.8);
    expect(area).toBeLessThan(TRI_AREA * 1.25);
    expect(face!.length).toBe(3);
  });

  it("Pixel + Pixel: liefert bei überstehenden Pixellinien exakt das Dreieck", () => {
    const w = 300, h = 250;
    const alpha = new Uint8Array(w * h);
    stroke(alpha, w, h, 10, 200, 250, 200);
    stroke(alpha, w, h, 10, 224, 160, 8);
    stroke(alpha, w, h, 250, 224, 100, 8);
    stroke(alpha, w, h, 0, 240, 299, 240); // weiteres Objekt kreuzt die Ausläufer

    const { edges } = vectorizeRasterBoundary(alpha, 16, w, h, 0, 0, 100);
    expect(edges.length).toBeGreaterThan(3);

    const face = findEnclosingFaceFromEdges(edges, { x: 1.3, y: 1.6 });
    expect(face).not.toBeNull();
    const area = polygonAreaAbs(face!);
    expect(area).toBeGreaterThan(1.2);
    expect(area).toBeLessThan(2.0);
    expect(face!.length).toBeLessThanOrEqual(8);
  });

  it("Pixel + Vektor: gemischte Begrenzung liefert nur das Dreieck", () => {
    const w = 300, h = 250;
    const alpha = new Uint8Array(w * h);
    // Nur die Basis als Pixellinie, beidseitig weiterlaufend.
    stroke(alpha, w, h, 10, 200, 290, 200);
    const { edges: rasterEdges } = vectorizeRasterBoundary(alpha, 16, w, h, 0, 0, 100);

    const all: RawEdge[] = [
      ...rasterEdges,
      seg(0.1, 2.24, 1.6, 0.08),  // Vektor-Flanke links, verlängert
      seg(2.5, 2.24, 1.0, 0.08),  // Vektor-Flanke rechts, verlängert
      seg(0.0, 2.35, 3.0, 2.35),  // fremdes Objekt hinter den Schnittpunkten
    ];
    const face = findEnclosingFaceFromEdges(all, { x: 1.3, y: 1.6 });
    expect(face).not.toBeNull();
    const area = polygonAreaAbs(face!);
    expect(area).toBeGreaterThan(1.2);
    expect(area).toBeLessThan(2.0);
  });
});
