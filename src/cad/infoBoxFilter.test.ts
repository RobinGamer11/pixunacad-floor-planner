import { describe, it, expect } from "vitest";
import { objectMatchesFilter } from "./selectionFilter";

const task = { kind: "task", status: "open", categoryId: "c1", labelId: "l" };
const info = { kind: "info", status: "open", categoryId: null, labelId: "l" };

describe("Infobox-Filter", () => {
  it("Aufgabe/Information", () => {
    const st = { types: [], criteria: [{ key: "a", propId: "infoboxKind", values: ["task"] }] };
    expect(objectMatchesFilter(st as any, "infobox", task)).toBe(true);
    expect(objectMatchesFilter(st as any, "infobox", info)).toBe(false);
  });
  it("Offen trifft nur Aufgaben", () => {
    const st = { types: [], criteria: [{ key: "a", propId: "infoboxStatus", values: ["open"] }] };
    expect(objectMatchesFilter(st as any, "infobox", task)).toBe(true);
    expect(objectMatchesFilter(st as any, "infobox", info)).toBe(false);
  });
  it("Kategorie", () => {
    const st = { types: [], criteria: [{ key: "a", propId: "infoboxCategory", values: ["c1"] }] };
    expect(objectMatchesFilter(st as any, "infobox", task)).toBe(true);
    expect(objectMatchesFilter(st as any, "infobox", info)).toBe(false);
  });
});
