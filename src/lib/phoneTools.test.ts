import { describe, it, expect } from "vitest";
import { pushRecent } from "@/components/mobile/MobileShell";
describe("Zuletzt verwendet", () => {
  it("neuestes vorn, ohne Doppelte, höchstens 4", () => {
    expect(pushRecent(["Wand", "Text", "Linie", "Polygon"], "Text")).toEqual(["Text", "Wand", "Linie", "Polygon"]);
    expect(pushRecent(["A", "B", "C", "D"], "E")).toEqual(["E", "A", "B", "C"]);
  });
});
