import { describe, expect, it } from "vitest";
import {
  EMPTY_WHEEL_ZOOM_BURST,
  nextSmartWheelZoom,
  type WheelZoomBurst,
} from "./projectZoom";

function advance(
  burst: WheelZoomBurst,
  direction: -1 | 1,
  now: number,
) {
  return nextSmartWheelZoom(burst, direction, now);
}

describe("nextSmartWheelZoom", () => {
  it("beschleunigt eine gleichgerichtete Serie erst ab dem vierten Impuls", () => {
    let burst = EMPTY_WHEEL_ZOOM_BURST;
    const steps: number[] = [];

    for (const now of [0, 80, 160, 240, 320]) {
      const next = advance(burst, 1, now);
      burst = next.burst;
      steps.push(next.step);
    }

    expect(steps).toEqual([1, 1, 1, 2, 2]);
  });

  it("startet nach Richtungswechsel oder Pause wieder mit einem Prozent", () => {
    let burst = EMPTY_WHEEL_ZOOM_BURST;
    for (const now of [0, 60, 120, 180]) burst = advance(burst, -1, now).burst;

    const changedDirection = advance(burst, 1, 220);
    expect(changedDirection.step).toBe(1);

    const afterPause = advance(changedDirection.burst, 1, 600);
    expect(afterPause.step).toBe(1);
  });
});
