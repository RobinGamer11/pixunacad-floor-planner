import { describe, expect, it } from "vitest";
import { StairTool } from "./StairTool";
import type { CadApp } from "./CadApp";
import type { Input } from "./Input";

describe("Treppe – gegenüberliegender Fangpunkt in Schritt 02", () => {
  it("richtet die Startkante am gefangenen Gegenpunkt aus, ohne die Laufbreite zu ändern", () => {
    const target = { x: 1, y: 0 };
    const app = {
      camera: { scale: 100, worldToScreen: (x: number, y: number) => ({ x: x * 100, y: y * 100 }) },
      topology: { findBestSnap: (screen: { x: number; y: number }) =>
        Math.hypot(screen.x - 100, screen.y) < 10 ? { world: target } : null },
      canvas: { style: { cursor: "" } },
    } as unknown as CadApp;
    const tool = new StairTool(app);
    const input = (x: number, y: number, clicked: boolean) => ({
      mouse: { wx: x, wy: y, sx: x * 100, sy: y * 100 }, clicked,
      keys: { shift: false }, rightClicked: false,
    }) as unknown as Input;
    tool.update(input(0, 0, true));
    expect(tool.phase).toBe("dir");
    // Nahe am Gegenpunkt: der Richtungs-Pfeil wird senkrecht zur Startkante gefangen.
    tool.update(input(1.02, 0, false));
    expect((tool as any)._dir.x).toBeCloseTo(0);
    expect((tool as any)._dir.y).toBeCloseTo(1);
    expect((tool as any)._startEdge()[1]).toEqual({ x: 1, y: 0 });
    // Auch bei Zeiger auf der Laufrichtung kann die gegenüberliegende Ecke einrasten.
    tool.update(input(0.04, 0.8, false));
    expect((tool as any)._startEdge()[1].x).toBeCloseTo(1);
    // Fingerheben erzeugt keinen Bestätigungsklick.
    expect(tool.phase).toBe("dir");
  });
});