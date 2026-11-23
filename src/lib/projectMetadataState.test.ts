import { describe, expect, it } from "vitest";
import { metadataDecision } from "./projectMetadataState";
describe("Projektnamen gegen alte Geräte schützen", () => {
  it("detects a newer remote name instead of overwriting", () => {
    expect(metadataDecision({ name: "Alt", updatedAt: "v1", dirty: true }, "Lokal", "Neuer", "v2")).toBe("conflict");
  });
  it("only uploads an actual dirty change against its known baseline", () => {
    expect(metadataDecision({ name: "Alt", updatedAt: "v1", dirty: true }, "Mustervorlage", "Alt", "v1")).toBe("keep");
  });
  it("does not replace a named project with a generic placeholder", () => {
    expect(metadataDecision(null, "Mustervorlage", "Neues Projekt", "v1")).not.toBe("adopt");
  });
  it("adopts an unchanged confirmed cloud name", () => {
    expect(metadataDecision({ name: "Alt", updatedAt: "v1", dirty: false }, "Alt", "Aktuell", "v2")).toBe("adopt");
  });
});