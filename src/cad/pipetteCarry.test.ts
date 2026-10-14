import { describe, it, expect, afterEach } from "vitest";
import { Scene, styleCarry } from "./Scene";
import { v } from "./geometry";

afterEach(() => { styleCarry.tool = null; styleCarry.kind = null; styleCarry.snap = null; });

describe("Pipette – Weiterzeichnen", () => {
  it("neue Linie übernimmt Farbe und Dicke der aufgenommenen Linie", () => {
    const s = new Scene();
    styleCarry.tool = "line"; styleCarry.kind = "segment"; styleCarry.snap = { color: "#0000ff", thicknessM: 0.05 };
    const seg: any = s.createSegment(v(0, 0), v(1, 0), { color: "#000000", thicknessM: 0.01 });
    expect(seg.color).toBe("#0000ff");
    expect(seg.thicknessM).toBe(0.05);
  });

  it("ohne aufgenommene Quelle bleibt der normale Stil", () => {
    const s = new Scene();
    const seg: any = s.createSegment(v(0, 0), v(1, 0), { color: "#000000", thicknessM: 0.01 });
    expect(seg.color).toBe("#000000");
  });
});
