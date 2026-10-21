import { describe, it, expect } from "vitest";
import { deriveHatch } from "./geometryDerivation";
import { topSurfaceArea } from "./tiltGeometry";
import { copyObjectMeta } from "../objectMeta";

const sq = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }];
const tilt = (mode?: "lift", plumb?: boolean) => ({ edgeIndex: 0, a: sq[0], b: sq[1], count: 4, angleDeg: 30, mode, plumb });
const zs = (d: any) => { const p = d.mesh.positions; const o: number[] = []; for (let i = 2; i < p.length; i += 3) o.push(p[i]); return o; };
const xs = (d: any) => { const p = d.mesh.positions; const o: number[] = []; for (let i = 0; i < p.length; i += 3) o.push(p[i], p[i + 1]); return o; };

describe("Neigungsmodi", () => {
  it("Kante anheben: Unterseite bleibt auf 0, Grundriss unverändert, Kante steigt um D·tan", () => {
    const d: any = deriveHatch({ id: "h", points: sq, heightM: 0.2, tilt3D: tilt("lift") }, "s", 0);
    expect(Math.min(...zs(d))).toBeCloseTo(0);
    expect(Math.max(...zs(d))).toBeCloseTo(0.2 + 2 * Math.tan(Math.PI / 6));
    for (const v of xs(d)) expect([0, 2, 4].some(k => Math.abs(v - k) < 1e-9)).toBe(true);
  });
  it("Kanten bündig: Körper wird nicht länger (Ausdehnung quer zur Achse ≤ Grundriss)", () => {
    const d: any = deriveHatch({ id: "h", points: sq, heightM: 0.2, tilt3D: tilt(undefined, true) }, "s", 0);
    const ys = xs(d).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2);
  });
  it("Kante unter die Unterseite → Meldung, letzte gültige (flache) Form", () => {
    const d: any = deriveHatch({ id: "h", points: sq, heightM: 0.2, tilt3D: { ...tilt("lift"), angleDeg: -30 } }, "s", 0);
    expect(d.note).toMatch(/Unterseite/);
    expect(d.type).toBe("prism");
  });
  it("tatsächliche Fläche: starre Drehung unverändert, Verformung = Fläche/cos", () => {
    expect(topSurfaceArea(sq, [], undefined, false, 30)).toBeCloseTo(8);
    expect(topSurfaceArea(sq, [], "lift", false, 60)).toBeCloseTo(16);
  });
  it("Kopieren übernimmt Modus und Kanten bündig", () => {
    const m = copyObjectMeta({ tilt3D: tilt("lift", true) }, { withCode: false });
    expect(m.tilt3D!.mode).toBe("lift");
    expect(m.tilt3D!.plumb).toBe(true);
  });
});
