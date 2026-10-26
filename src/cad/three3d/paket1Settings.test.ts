import { describe, expect, it } from "vitest";
import { deriveWall, openingCutters, tiltOpeningWithWall } from "./geometryDerivation";
import { deriveOpening } from "./openingGeometry";
import { deriveInfoBox, infoBoxTone } from "./infoBoxGeometry";
import { sharedFields3D } from "./multiEdit3D";
import { pieceMesh } from "./geometryDerivation";
import type { Door, Wall } from "../Scene";

const wall = { id: "w", corners: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessM: 0.3, heightM: 3, referenceSide: "center" } as unknown as Wall;
const door = { id: "d", kind: "window", wallId: "w", posM: 2, widthM: 1.2, heightM: 1.2, breakHeightM: 0.9, side: "inner", hand: "left", edge: "center", jambEnabled: true, jambLenM: 0.06 } as Door;

const extent = (parts: any[]) => {
  const pts: number[][] = [];
  for (const d of parts) { const m = pieceMesh(d); if (m) for (let i = 0; i < m.positions.length; i += 3) pts.push([m.positions[i], m.positions[i + 1], m.positions[i + 2]]); }
  let maxD = 0;
  for (const a of pts) for (const b of pts) maxD = Math.max(maxD, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  return maxD;
};

describe("Paket 1 – 3D-Einstellungen", () => {
  it("Fenster bleibt bei höherer Wand gleich groß und an gleicher Stelle", () => {
    const low = deriveOpening(door, wall, "s", 0);
    const high = deriveOpening(door, { ...wall, heightM: 6 } as Wall, "s", 0);
    expect(extent(high)).toBeCloseTo(extent(low), 9);
    expect((high[0] as any).z0).toBeCloseTo((low[0] as any).z0, 9);
  });

  it.each([{ mode: "lift" }, { plumb: true }, {}])("Fenster wird bei geneigter Wand (%o) nie gedehnt", (extra) => {
    const tw: any = { ...wall, heightM: 6, tilt3D: { edgeIndex: -1, a: { x: 0, y: -0.15 }, b: { x: 5, y: -0.15 }, count: 4, cardinal: "bottom", angleDeg: 30, ...extra } };
    const parts = deriveOpening(door, tw, "s", 0);
    const tilted = tiltOpeningWithWall(tw, deriveWall(tw, [door], "s", 0), parts, 0);
    expect(extent(tilted)).toBeCloseTo(extent(parts), 6);
  });

  it("Kante neigen: Fenster bleibt exakt an seinem Platz, Aussparung folgt dem Fenster", () => {
    const tw: any = { ...wall, tilt3D: { edgeIndex: -1, a: { x: 0, y: -0.15 }, b: { x: 5, y: -0.15 }, count: 4, cardinal: "bottom", angleDeg: 30, mode: "lift" } };
    const parts = deriveOpening(door, tw, "s", 0);
    expect(tiltOpeningWithWall(tw, deriveWall(tw, [], "s", 0), parts, 0)).toBe(parts);
    const [c] = openingCutters(tw, [door], "s", 0, deriveWall(tw, [], "s", 0));
    const zs = c.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(0.9, 9); expect(Math.max(...zs)).toBeCloseTo(2.1, 9);
  });

  it("Mehrfachauswahl: gleiche Wandhöhe wird angezeigt und gemeinsam gesetzt", () => {
    const a = { heightM: 2.5 }, b = { heightM: 2.5 };
    const [f] = sharedFields3D([{ kind: "wall", obj: a }, { kind: "wall", obj: b }]);
    expect(f.label).toBe("Körperhöhe (Wandhöhe)");
    expect(f.value).toBe(2.5);
    f.write(3);
    expect(a.heightM).toBe(3); expect(b.heightM).toBe(3);
  });

  it("Mehrfachauswahl: abweichende Werte = Verschieden, fehlende Eigenschaft = kein Feld", () => {
    expect(sharedFields3D([{ kind: "wall", obj: { heightM: 2 } }, { kind: "hatch", obj: { heightM: 1 } }])[0].value).toBeNull();
    expect(sharedFields3D([{ kind: "wall", obj: { heightM: 2 } }, { kind: "segment", obj: {} }])).toHaveLength(0);
  });

  it("Infobox nutzt gedämpfte Farben und leuchtet leicht", () => {
    const [body, face] = deriveInfoBox({ id: "i", x: 0, y: 0, kind: "task", status: "open" }, "s", 0);
    expect(body.color).toBe(infoBoxTone({ kind: "task", status: "open" }).body);
    expect(face.glow).toBeGreaterThan(0); expect(face.glow).toBeLessThan(0.5);
  });
});
