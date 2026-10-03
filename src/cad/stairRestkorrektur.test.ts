import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { computeStairGeometry, extendStairPath, simplifyStairPath, stairOuterPointIndex, moveStairBoundary, type StairParams } from "./stairGeometry";

const base = (path: { x: number; y: number }[]): StairParams => ({
  mode: "straight", path, referenceSide: "left", treadDepthM: 0.28, stairWidthM: 1, riserHeightM: 0.175, direction: "up",
});

describe("Treppe – Restkorrekturen", () => {
  it("gerade Verlängerung erzeugt kein Podest", () => {
    const p = extendStairPath(base([{ x: 0, y: 0 }, { x: 2.8, y: 0 }]), [{ x: 4.2, y: 0 }]);
    expect(p.path.length).toBe(2);
    expect(computeStairGeometry(p).landings.length).toBe(0);
    expect(simplifyStairPath([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]).length).toBe(2);
  });

  it("gerade Treppe nachträglich zur L- und U-Treppe ergänzen", () => {
    const L = extendStairPath(base([{ x: 0, y: 0 }, { x: 3, y: 0 }]), [{ x: 3, y: -3 }]);
    const gL = computeStairGeometry(L);
    expect(L.mode).toBe("landing");
    expect(gL.valid).toBe(true);
    expect(gL.landings.length).toBe(1);
    const U = extendStairPath(L, [{ x: 0, y: -3 }]);
    expect(computeStairGeometry(U).landings.length).toBe(2);
  });

  it("Differenz: Standard + Differenz = Stufentiefe (gleiche Funktion wie Kante bewegen)", () => {
    const p = base([{ x: 0, y: 0 }, { x: 0.28 * 4, y: 0 }]);
    const g = computeStairGeometry(p);
    const r = moveStairBoundary(p, 1, p.treadDepthM + 0.05 - g.treads[1].depth)!;
    expect(computeStairGeometry(r).treads[1].depth).toBeCloseTo(0.33);
  });

  it("Außenpunkt am Laufende gehört zum Referenzendpunkt; Bewegen verschiebt nur diesen", () => {
    const p = base([{ x: 0, y: 0 }, { x: 2.8, y: 0 }]);
    const g = computeStairGeometry(p);
    const outerEnd = g.treads[g.treads.length - 1].poly[2];
    const idx = stairOuterPointIndex(p, outerEnd);
    expect(idx).toBe(1);
    const moved = { ...p, path: p.path.map((q, i) => (i === idx ? { x: q.x + 0.28, y: q.y } : q)) };
    expect(moved.path[0]).toEqual(p.path[0]);
    expect(computeStairGeometry(moved).treadCount).toBe(11);
  });

  it("Geschosshöhe steht unter Schrittmaßregel; Warnung nur oben mit Dark-Mode-Farbe", () => {
    const src = readFileSync("src/components/cad/StairSettingsPanel.tsx", "utf8");
    expect(src.indexOf("Schrittmaßregel")).toBeLessThan(src.indexOf("floor-manual"));
    expect(src.indexOf("floor-manual")).toBeLessThan(src.indexOf("floor-auto"));
    expect(src).toContain('>Geschosshöhe</span>');
    expect(src).not.toContain('<SectionTitle>Geschosshöhe</SectionTitle>');
    expect(src).not.toContain('<SectionTitle>Knickausbildung</SectionTitle>');
    expect(src.match(/warnings\.map\(\(w\)/g)).toHaveLength(2); // Platzieren oder Bearbeiten, nie beide
    expect(src).not.toContain("text-destructive");
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/\.dark \.cad-stair-warning \{ color: hsl\(0 92% 76%\)/);
  });
});
