import { describe, it, expect } from "vitest";
import { objectMatchesFilter, suggestFilters, registerFilterProperty, type SelectionFilterState } from "./selectionFilter";

const red = { id: "a", color: "#FF0000", thicknessM: 0.0005, labelId: "L1" };
const blue = { id: "b", color: "#0000ff", thicknessM: 0.0005, labelId: "L2" };
const wall = { id: "w", color: "#ff0000", thicknessM: 0.24, labelId: "L1" };
const st = (s: Partial<SelectionFilterState>): SelectionFilterState => ({ types: [], criteria: [], ...s });

describe("Auswahlfilter", () => {
  it("ODER innerhalb einer Kategorie", () => {
    const f = st({ criteria: [{ key: "1", propId: "color", values: ["#ff0000"] }, { key: "2", propId: "color", values: ["#0000ff"] }] });
    expect(objectMatchesFilter(f, "segment", red)).toBe(true);
    expect(objectMatchesFilter(f, "segment", blue)).toBe(true);
  });
  it("UND zwischen Kategorien", () => {
    const f = st({ criteria: [{ key: "1", propId: "color", values: ["#ff0000"] }, { key: "2", propId: "layer", values: ["L2"] }] });
    expect(objectMatchesFilter(f, "segment", red)).toBe(false);
  });
  it("Objekttyp-Filter", () => {
    expect(objectMatchesFilter(st({ types: ["wall"] }), "segment", red)).toBe(false);
    expect(objectMatchesFilter(st({ types: ["wall", "line"] }), "segment", red)).toBe(true);
  });
  it("Linienstärke und Wanddicke getrennt; fehlende Eigenschaft erfüllt nicht", () => {
    const f = st({ criteria: [{ key: "1", propId: "wallThickness", min: 20, max: 30 }] });
    expect(objectMatchesFilter(f, "wall", wall)).toBe(true);
    expect(objectMatchesFilter(f, "segment", red)).toBe(false);
    const g = st({ criteria: [{ key: "1", propId: "lineWidth", min: 0.4, max: 0.6 }] });
    expect(objectMatchesFilter(g, "segment", red)).toBe(true);
    expect(objectMatchesFilter(g, "wall", wall)).toBe(false);
  });
  it("leerer Baustein wirkt nicht", () => {
    expect(objectMatchesFilter(st({ criteria: [{ key: "1", propId: "color" }] }), "segment", blue)).toBe(true);
  });
  it("Vorschläge tolerieren Tippfehler und Werte", () => {
    const ctx = { layers: [{ id: "L1", name: "Erdgeschoss" }] };
    expect(suggestFilters("Wandicke", ctx)[0].propId).toBe("wallThickness");
    expect(suggestFilters("erdgesch", ctx).some((s) => s.value === "L1")).toBe(true);
  });
  it("neue Eigenschaften per Registrierung", () => {
    registerFilterProperty({ id: "idx", label: "Index", synonyms: [], type: "text", types: [], read: (o) => o.idx });
    const f = st({ criteria: [{ key: "1", propId: "idx", text: "A1" }] });
    expect(objectMatchesFilter(f, "segment", { ...red, idx: "A12" })).toBe(true);
    expect(objectMatchesFilter(f, "segment", red)).toBe(false);
  });
});
