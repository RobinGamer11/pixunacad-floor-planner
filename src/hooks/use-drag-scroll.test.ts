import { describe, it, expect } from "vitest";
import { dragExceedsThreshold } from "./use-drag-scroll";

const header = { scrollWidth: 900, clientWidth: 400, scrollHeight: 40, clientHeight: 40 };
describe("Kopfzeilen-Geste", () => {
  it("leichte senkrechte Fingerbewegung beim Tippen bleibt ein Klick", () => {
    expect(dragExceedsThreshold("x", 2, 14, header)).toBe(false);
    expect(dragExceedsThreshold("x", 6, 3, header)).toBe(false);
  });
  it("echtes waagerechtes Wischen scrollt (Klick wird unterdrückt)", () => {
    expect(dragExceedsThreshold("x", 25, 4, header)).toBe(true);
  });
  it("nicht scrollbare Kopfzeile scrollt nie", () => {
    expect(dragExceedsThreshold("x", 40, 0, { ...header, scrollWidth: 400 })).toBe(false);
  });
});
