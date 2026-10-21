import { describe, it, expect } from "vitest";
import { speedFactor, stickFactor } from "./sensitivity";

describe("3D-Empfindlichkeit 1–100 %", () => {
  it("100 % entspricht altem 300 %", () => expect(speedFactor(100)).toBeCloseTo(3));
  it("1 % entspricht altem 10 %", () => expect(speedFactor(1)).toBeCloseTo(0.1));
  it("Joystick 100 % = alt 180 %", () => expect(stickFactor(100)).toBeCloseTo(1.8));
  it("Joystick 1 % = alt 60 %", () => expect(stickFactor(1)).toBeCloseTo(0.6));
});
