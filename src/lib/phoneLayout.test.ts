import { describe, it, expect } from "vitest";
import { computeIsPhone, clampWheelScale, phonePanelStore } from "./phoneLayout";

describe("Handy-Erkennung", () => {
  it("Handy hoch (390×844) ist Handy", () => expect(computeIsPhone({ screenW: 390, screenH: 844, innerW: 390, coarse: true })).toBe(true));
  it("Handy quer (844×390) bleibt Handy", () => expect(computeIsPhone({ screenW: 844, screenH: 390, innerW: 844, coarse: true })).toBe(true));
  it("Tablet 1024×768 ist kein Handy", () => expect(computeIsPhone({ screenW: 1024, screenH: 768, innerW: 1024, coarse: true })).toBe(false));
  it("Desktopfenster 1280 breit ist kein Handy", () => expect(computeIsPhone({ screenW: 1920, screenH: 1080, innerW: 1280, coarse: false })).toBe(false));
});
describe("Hilfsrad-Größe", () => {
  it("wird auf 75–150 % begrenzt", () => { expect(clampWheelScale(0.5)).toBe(0.75); expect(clampWheelScale(2)).toBe(1.5); expect(clampWheelScale(1.2)).toBe(1.2); });
});
describe("Bedienfenster schließen", () => {
  it("schließt vollständig und öffnet nach Vollhöhe wieder halbhoch", () => {
    phonePanelStore.set("tools"); phonePanelStore.setSnap("full");
    phonePanelStore.set(null); expect(phonePanelStore.get()).toBeNull();
    phonePanelStore.set("more"); expect(phonePanelStore.getSnap()).toBe("half"); phonePanelStore.set(null);
  });
});
