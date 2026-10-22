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

  const setup = async (h: any) => {
    vi.useFakeTimers();
    const app = fakeApp(h);
    render(<Object3DSettings app={app} defaultOpen />);
    await act(async () => { vi.advanceTimersByTime(350); });
    vi.useRealTimers();
    return app;
  };
  const typeAngle = (v: string) => {
    const el = screen.getByDisplayValue("0,0") as HTMLInputElement;
    fireEvent.change(el, { target: { value: v } });
    fireEvent.keyDown(el, { key: "Enter" });
  };

  it("Winkel freie Eingabe (Komma), Vorschau bis ✓ – genau ein Undo-Schritt, Kontur unverändert", async () => {
    const h: any = { id: "R", points: sq(0, 0, 4, 2), holes: [], heightM: 0.2 };
    const app = await setup(h);
    typeAngle("27,3");
    expect(app.runAction).not.toHaveBeenCalled();
    expect(h.tilt3D).toBeUndefined();
    fireEvent.click(screen.getByText("Übernehmen"));
    expect(app.runAction).toHaveBeenCalledTimes(1);
    expect(h.tilt3D.angleDeg).toBe(27.3);
    expect(h.tilt3D.edgeIndex).toBe(0);
    expect(h.tilt3D.mode).toBeUndefined();
    expect(h.points).toEqual(sq(0, 0, 4, 2));
  });

  it("Kante neigen + Kanten bündig werden gespeichert", async () => {
    const h: any = { id: "R", points: sq(0, 0, 4, 2), holes: [], heightM: 0.2 };
    const app = await setup(h);
    fireEvent.click(screen.getByText("Kante neigen"));
    typeAngle("10");
    fireEvent.click(screen.getByText("Übernehmen"));
    expect(app.runAction).toHaveBeenCalledTimes(1);
    expect(h.tilt3D.mode).toBe("lift");
  });

  it("Abbrechen/Escape verwirft die Vorschau ohne Verlaufsschritt", async () => {
    const h: any = { id: "R", points: sq(0, 0, 4, 2), holes: [], heightM: 0.2 };
    const app = await setup(h);
    typeAngle("15");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(app.runAction).not.toHaveBeenCalled();
    expect(h.tilt3D).toBeUndefined();
  });

  it("ungültige Zahl wird nicht als 0 gespeichert", async () => {
    const h: any = { id: "R", points: sq(0, 0, 4, 2), holes: [], heightM: 0.2 };
    const app = await setup(h);
    const el = screen.getByDisplayValue("0,20") as HTMLInputElement;
    fireEvent.change(el, { target: { value: "abc" } });
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.blur(el);
    expect(app.runAction).not.toHaveBeenCalled();
    expect(h.heightM).toBe(0.2);
    expect(screen.getByText(/Ungültige Zahl/)).toBeTruthy();
  });

  it("Enter + Verlassen = genau ein Undo-Schritt; negative Höhenlage erlaubt", async () => {
    const h: any = { id: "R", points: sq(0, 0, 4, 2), holes: [], heightM: 0.2 };
    const app = await setup(h);
    const el = screen.getAllByDisplayValue("0,00")[0] as HTMLInputElement;
    fireEvent.change(el, { target: { value: "-0.5" } });
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.blur(el);
    expect(app.runAction).toHaveBeenCalledTimes(1);
    expect(h.elevationM).toBe(-0.5);
  });
});
