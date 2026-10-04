import { describe, it, expect } from "vitest";
import { mirrorProxy } from "./multiEdit";

describe("Mehrfachauswahl – gemeinsame Einstellungen", () => {
  it("überträgt nur die geänderte Eigenschaft, Geometrie und andere Werte bleiben individuell", () => {
    const a: any = { id: "a", a: { x: 0, y: 0 }, color: "#000", thicknessM: 0.01, strokePattern: "solid", labelId: "L1" };
    const b: any = { id: "b", a: { x: 5, y: 5 }, color: "#111", thicknessM: 0.05, strokePattern: "dash", labelId: "L2" };
    const p = mirrorProxy(a, [b]);
    p.color = "#f00";
    expect(b.color).toBe("#f00");
    expect(b.thicknessM).toBe(0.05);
    expect(b.strokePattern).toBe("dash");
    p.a = { x: 9, y: 9 };
    expect(b.a).toEqual({ x: 5, y: 5 });
  });

  it("Ebene und Inhalte werden nie über den Spiegel angeglichen", () => {
    const a: any = { id: "a", labelId: "L1", text: "A" };
    const b: any = { id: "b", labelId: "L2", text: "B" };
    const p = mirrorProxy(a, [b]);
    p.labelId = "L9";
    p.text = "X";
    expect(b.labelId).toBe("L2");
    expect(b.text).toBe("B");
  });
});
