import { describe, expect, it } from "vitest";
import { metersToUnit, rulerTickStep, unitToMeters } from "./rulerModel";

describe("ruler model", () => {
  it("converts ruler lengths independently of camera zoom", () => {
    expect(metersToUnit(1.25, "mm")).toBe(1250);
    expect(metersToUnit(1.25, "cm")).toBe(125);
    expect(metersToUnit(1.25, "m")).toBe(1.25);
    expect(unitToMeters(125, "cm")).toBe(1.25);
  });

  it("derives stable nice tick steps from length and unit only", () => {
    expect(rulerTickStep(1250, 100)).toBe(20);
    expect(rulerTickStep(125, 100)).toBe(2);
    expect(rulerTickStep(1.25, 100)).toBe(0.02);
    expect(rulerTickStep(0, 100)).toBe(1);
  });
});