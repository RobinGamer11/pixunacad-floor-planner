import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { Object3DSettings, snapTiltAngle } from "./Object3DSettings";

// jsdom kennt keine PointerEvents – minimal nachbilden (Maus-Koordinaten + pointerId).
if (typeof (window as any).PointerEvent === "undefined") {
  (window as any).PointerEvent = class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: any = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  };
}

const sq = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

function fakeApp(obj: any) {
  return {
    selection: { hatchId: obj.id },
    scene: { hatches: [obj] },
    selectTool: { marqueeSelectedIds: [] },
    activeSheetId: "s1",
    sheetManager: { getById: () => ({ id: "s1", name: "EG" }) },
    labelManager: { isEditable: () => true },
    runAction: vi.fn((fn: () => void) => fn()),
  };
}

const ptr = (el: Element, type: "pointerDown" | "pointerMove" | "pointerUp", x: number, y: number) =>
  fireEvent[type](el, { pointerId: 1, clientX: x, clientY: y, bubbles: true });

describe("3D-Einstellungen – Neigen", () => {
  it("fängt übliche Winkel, freie Winkel bleiben", () => {
    expect(snapTiltAngle(29.4)).toBe(30);
    expect(snapTiltAngle(27.3)).toBe(27.3);
    expect(snapTiltAngle(120)).toBe(85);
  });

  it("Ziehen: Anheben hält Vorschau, erneuter Kontakt ohne Sprung, ✓ = genau ein Undo-Schritt", async () => {
    vi.useFakeTimers();
    const h: any = { id: "R", points: sq(0, 0, 4, 2), holes: [], heightM: 0.2 };
    const app = fakeApp(h);
    const { container } = render(<Object3DSettings app={app} defaultOpen />);
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();
    // Kante 0 wählen – ändert noch nichts
    const hit = container.querySelector('line[stroke-width="14"]')!;
    fireEvent.pointerDown(hit);
    expect(app.runAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Neigen"));
    const svg = container.querySelector('svg[viewBox="0 0 240 150"]')!;
    const angleText = () => Number((svg.querySelector("text")?.textContent || "").split("°")[0].replace(",", "."));
    // erster Kontakt startet ohne Sprung
    ptr(svg, "pointerDown", 100, 100);
    expect(angleText()).toBe(0);
    ptr(svg, "pointerMove", 100, 99.95);
    ptr(svg, "pointerUp", 100, 99.95);
    const a1 = angleText();
    expect(Math.abs(a1)).toBeGreaterThan(1);
    // Finger angehoben: nichts gespeichert, Vorschau bleibt
    expect(app.runAction).not.toHaveBeenCalled();
    expect(h.tilt3D).toBeUndefined();
    // erneuter Kontakt an anderer Stelle: kein Sprung
    ptr(svg, "pointerDown", 20, 20);
    expect(angleText()).toBe(a1);
    ptr(svg, "pointerMove", 20, 19.95);
    ptr(svg, "pointerUp", 20, 19.95);
    const a2 = angleText();
    expect(Math.abs(a2)).toBeGreaterThan(Math.abs(a1));
    // Übernehmen-Knopf: Koordinaten des Knopfs spielen keine Rolle
    fireEvent.click(screen.getByText("Übernehmen"));
    expect(app.runAction).toHaveBeenCalledTimes(1);
    expect(h.tilt3D.angleDeg).toBeCloseTo(a2, 1);
    expect(h.tilt3D.edgeIndex).toBe(0);
    expect(h.points).toEqual(sq(0, 0, 4, 2));
  });

  it("Abbrechen verwirft die Vorschau ohne Verlaufsschritt", async () => {
    vi.useFakeTimers();
    const h: any = { id: "R", points: sq(0, 0, 4, 2), holes: [], heightM: 0.2 };
    const app = fakeApp(h);
    const { container } = render(<Object3DSettings app={app} defaultOpen />);
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();
    fireEvent.pointerDown(container.querySelector('line[stroke-width="14"]')!);
    fireEvent.click(screen.getByText("Neigen"));
    const svg = container.querySelector('svg[viewBox="0 0 240 150"]')!;
    ptr(svg, "pointerDown", 10, 10); ptr(svg, "pointerMove", 10, 9.95); ptr(svg, "pointerUp", 10, 9.95);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(app.runAction).not.toHaveBeenCalled();
    expect(h.tilt3D).toBeUndefined();
  });
});
