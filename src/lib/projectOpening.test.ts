import { describe, expect, it } from "vitest";
import { advanceOpening, INITIAL_OPENING } from "./projectOpening";
describe("Verbindliche Projektbereitschaft", () => {
  it("starts at 0 and holds at the completed local phase", () => {
    expect(INITIAL_OPENING.progress).toBe(0);
    expect(advanceOpening(INITIAL_OPENING, "cloud").progress).toBe(35);
  });
  it("reaches 100 only on the ready phase", () => {
    expect(advanceOpening(INITIAL_OPENING, "view").progress).toBe(95);
    expect(advanceOpening(INITIAL_OPENING, "ready").progress).toBe(100);
  });
  it("never advances a failed opening to 100", () => {
    expect(advanceOpening({ ...INITIAL_OPENING, progress: 35, error: "Offline" }, "ready").progress).toBe(35);
  });
  it("keeps conflicts paused", () => {
    expect(advanceOpening({ ...INITIAL_OPENING, progress: 35, conflict: true }, "ready").phase).toBe("access");
  });
  it("never moves backwards within an opening", () => {
    expect(advanceOpening({ ...INITIAL_OPENING, progress: 70 }, "cloud").progress).toBe(70);
  });
});