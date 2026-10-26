import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { TiltPreview3D } from "./TiltPreview3D";

vi.mock("three", async importOriginal => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement("canvas");
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
  } };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup() {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number; pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? "mouse";
    }
  });
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  const onParentDown = vi.fn(), onPickEdge = vi.fn(), onEdgeDrag = vi.fn();
  const view = render(<div onPointerDown={onParentDown}><TiltPreview3D
    obj={{ id: "test", points: [{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}], heightM:2 }}
    base={0} edge={0} selectable={new Set([0,1,2,3])} onPickEdge={onPickEdge} onEdgeDrag={onEdgeDrag}
  /></div>);
  const canvas = view.container.querySelector("canvas");
  if (!canvas) throw new Error("Missing preview canvas");
  return { canvas, onParentDown, onPickEdge, onEdgeDrag };
}

describe("Tilt preview camera gesture ownership", () => {
  it("middle drag belongs only to the preview and never picks or edits an edge", () => {
    const { canvas, onParentDown, onPickEdge, onEdgeDrag } = setup();
    const down = new MouseEvent("mousedown", { button:1, bubbles:true, cancelable:true });
    canvas.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    fireEvent.pointerDown(canvas, {pointerId:1, pointerType:"mouse", button:1, clientX:130, clientY:90});
    fireEvent.pointerMove(canvas, {pointerId:1, pointerType:"mouse", buttons:4, clientX:160, clientY:110});
    fireEvent.pointerUp(canvas, {pointerId:1, pointerType:"mouse", button:1, clientX:160, clientY:110});
    expect(onParentDown).not.toHaveBeenCalled();
    expect(onPickEdge).not.toHaveBeenCalled();
    expect(onEdgeDrag).not.toHaveBeenCalled();
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("focus loss cancels capture so the next camera gesture can start without Escape", () => {
    const { canvas } = setup();
    fireEvent.pointerDown(canvas, {pointerId:1, pointerType:"mouse", button:1});
    fireEvent.blur(window);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    fireEvent.pointerDown(canvas, {pointerId:2, pointerType:"mouse", button:1});
    expect(canvas.setPointerCapture).toHaveBeenLastCalledWith(2);
    fireEvent.pointerUp(canvas, {pointerId:2, pointerType:"mouse", button:1});
    expect(canvas.releasePointerCapture).toHaveBeenLastCalledWith(2);
  });
});