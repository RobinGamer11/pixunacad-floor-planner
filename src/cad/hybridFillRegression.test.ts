/**
 * Regressionstest zur Reihenfolge der Hybrid-Füllung:
 *
 *   Boundary → Schnittpunkte → Segmente → geschlossenes Face → Face FEST
 *   → nur noch optische (Render-)Korrektur.
 *
 * Er sichert ab, dass eine spätere Präzisions-/Haarlinienverbesserung die
 * Face-Geometrie nicht erneut verändert bzw. weiterlaufende Linien aufnimmt.
 */
import { describe, it, expect } from "vitest";
import { findEnclosingFaceFromEdges, type RawEdge } from "./hatchFill";
import { vectorizeRasterBoundary } from "./rasterVectorize";
import { polygonAreaAbs } from "./geometry";
import { sealLineWidthPx, SEAL_MAX_CSS_PX } from "./hatchSeal";

const seg = (ax: number, ay: number, bx: number, by: number): RawEdge =>
  ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });

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

const CLICK = { x: 1.3, y: 1.6 };
/** Bounding-Box des Dreiecks (ohne Ausläufer). */
const TRI_BOX = { minX: 0.25, maxX: 2.35, minY: 0.05, maxY: 2.1 };

function assertNoOvershoot(face: { x: number; y: number }[]) {
  for (const p of face) {
    expect(p.x).toBeGreaterThan(TRI_BOX.minX);
    expect(p.x).toBeLessThan(TRI_BOX.maxX);
    expect(p.y).toBeGreaterThan(TRI_BOX.minY);
    expect(p.y).toBeLessThan(TRI_BOX.maxY);
  }
}

describe("Regression: Face bleibt nach Präzisionskorrektur unverändert", () => {
  it("Vektor/Vektor: nur das Dreieck, keine weiterlaufenden Äste", () => {
    const edges: RawEdge[] = [
      seg(0.1, 2.0, 2.5, 2.0),
      seg(0.1, 2.24, 1.6, 0.08),
      seg(2.5, 2.24, 1.0, 0.08),
      seg(0.0, 2.4, 3.0, 2.4),
      seg(0.0, 0.1, 3.0, 0.1),
    ];
    const face = findEnclosingFaceFromEdges(edges, CLICK)!;
    expect(face).not.toBeNull();
    expect(face.length).toBe(3);
    assertNoOvershoot(face);

    // Zweiter identischer Aufruf liefert exakt dieselbe Geometrie (idempotent,
    // kein nachträglicher Snap-/Expand-Schritt auf globalen Boundaries).
    const again = findEnclosingFaceFromEdges(edges, CLICK)!;
    expect(again).toEqual(face);
  });

  it("Pixel/Vektor: gemischte Begrenzung liefert nur das Dreieck", () => {
    const w = 300, h = 250;
    const alpha = new Uint8Array(w * h);
    stroke(alpha, w, h, 10, 200, 290, 200);
    const { edges: rasterEdges } = vectorizeRasterBoundary(alpha, 16, w, h, 0, 0, 100);

    const all: RawEdge[] = [
      ...rasterEdges,
      seg(0.1, 2.24, 1.6, 0.08),
      seg(2.5, 2.24, 1.0, 0.08),
      seg(0.0, 2.35, 3.0, 2.35),
    ];
    const face = findEnclosingFaceFromEdges(all, CLICK)!;
    expect(face).not.toBeNull();
    const area = polygonAreaAbs(face);
    expect(area).toBeGreaterThan(1.2);
    expect(area).toBeLessThan(2.0);
    assertNoOvershoot(face);
  });

  it("Haarlinien-Versiegelung ist render-only und minimal", () => {
    // Reine Darstellungsgröße: maximal ein CSS-Pixel breit (halbe Breite nach
    // außen) und unabhängig von Zoom/Geometrie.
    expect(sealLineWidthPx(1)).toBeLessThanOrEqual(SEAL_MAX_CSS_PX);
    expect(sealLineWidthPx(3)).toBeLessThanOrEqual(sealLineWidthPx(1));
    expect(sealLineWidthPx(0)).toBeGreaterThan(0);
  });
});
