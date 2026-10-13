import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

let input: Input;
function setup() {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  input = new Input(canvas);
  const tap = vi.fn();
  input.canvasTapHandler = tap;
  function pointer(type: string, id: number, x: number, y: number, pointerType = "mouse", button = 0) {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType } });
    (type === "pointerup" || type === "pointercancel" ? window : canvas).dispatchEvent(event);
  }
  return { canvas, tap, pointer };
}
afterEach(() => {
  input?.dispose();
  document.body.replaceChildren();
  delete (window as any).__pixunaTabletCommit;
});
describe("Infobox navigation input", () => {
  it("places exactly one draft on a tap and never sends a drawing click", () => {
    const { tap, pointer } = setup();
    pointer("pointerdown", 1, 100, 80);
    pointer("pointerup", 1, 100, 80);
    input.beginFrame();
    expect(tap).toHaveBeenCalledExactlyOnceWith(100, 80);
    expect(input.clicked).toBe(false);
    expect(input.mouse.left).toBe(false);
  });
  it("keeps middle-mouse pan and wheel zoom without placing a box", () => {
    const { canvas, tap, pointer } = setup();
    pointer("pointerdown", 1, 100, 80, "mouse", 1);
    pointer("pointermove", 1, 140, 110, "mouse", 1);
    expect(input.isPanning).toBe(true);
    expect([input.panDX, input.panDY]).toEqual([40, 30]);
    pointer("pointerup", 1, 140, 110, "mouse", 1);
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true }));
    expect(input.wheelDelta).toBeLessThan(0);
    expect(tap).not.toHaveBeenCalled();
  });
  it("pans with one finger and cancels placement even when the finger returns to its start", () => {
    const { tap, pointer } = setup();
    pointer("pointerdown", 1, 100, 80, "touch");
    pointer("pointermove", 1, 160, 100, "touch");
    expect([input.panDX, input.panDY]).toEqual([60, 20]);
    pointer("pointermove", 1, 100, 80, "touch");
    pointer("pointerup", 1, 100, 80, "touch");
    expect(tap).not.toHaveBeenCalled();
    expect(input.isPanning).toBe(false);
  });
  it("pinches without a draft, drawing click or leftover camera gesture", () => {
    const { tap, pointer } = setup();
    pointer("pointerdown", 1, 100, 80, "touch");
    pointer("pointerdown", 2, 200, 80, "touch");
    pointer("pointermove", 2, 240, 80, "touch");
    expect(input.cameraGesture).toBe(true);
    expect(input.wheelDelta).not.toBe(0);
    pointer("pointerup", 2, 240, 80, "touch");
    pointer("pointerup", 1, 100, 80, "touch");
    input.beginFrame();
    expect(input.cameraGesture).toBe(false);
    expect(input.clicked).toBe(false);
    expect(tap).not.toHaveBeenCalled();
  });
  it("keeps the placement callback after a pin tap is cancelled", () => {
    const { tap, pointer } = setup();
    pointer("pointerdown", 1, 100, 80, "touch");
    input.cancelCanvasTap();
    pointer("pointerup", 1, 100, 80, "touch");
    pointer("pointerdown", 2, 200, 180);
    pointer("pointerup", 2, 200, 180);
    expect(tap).toHaveBeenCalledExactlyOnceWith(200, 180);
  });
  it("allows pen placement with the tablet commit gate active", () => {
    const { tap, pointer } = setup();
    (window as any).__pixunaTabletCommit = true;
    pointer("pointerdown", 1, 100, 80, "pen");
    pointer("pointerup", 1, 100, 80, "pen");
    expect(tap).toHaveBeenCalledExactlyOnceWith(100, 80);
    expect(input.tabletDown).toBe(false);
  });
});