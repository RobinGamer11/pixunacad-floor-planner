// @vitest-environment node
import { describe, expect, it } from "vitest";
import { materialKey, patternOf } from "./pattern3D";

const hatch = (color: string, pattern?: string, extra: any = {}) => ({ fillColor: color, strokeColor: "#111111", patternEnabled: !!pattern, patternId: pattern, patternScale: 60, ...extra });
const key = (o: any) => materialKey(o.fillColor, patternOf(o, "other"));

describe("3D-Materialien aus Farbe und Muster", () => {
  it("zwei blaue Objekte ohne Muster ergeben ein Material", () => {
    expect(key(hatch("#3355ff"))).toBe(key(hatch("#3355ff")));
  });
  it("blau und blau+Mauerwerk ergeben zwei Materialien", () => {
    expect(key(hatch("#3355ff"))).not.toBe(key(hatch("#3355ff", "mauerwerk")));
  });
  it("ausgeschaltetes Muster zählt wie ohne Muster", () => {
    expect(patternOf(hatch("#3355ff", "mauerwerk", { pattern3D: false }), "other")).toBeUndefined();
  });
});
