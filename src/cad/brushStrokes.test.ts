// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { clearBrushCache, endLiveBrush, renderBrushStroke } from "./brushStrokes";

type FakeContext = CanvasRenderingContext2D & { fillCalls: number };

function fakeContext(canvas: HTMLCanvasElement): FakeContext {
  const ctx: Partial<FakeContext> & Record<string, unknown> = {
    canvas,
    fillCalls: 0,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    strokeStyle: "#000000",
    fillStyle: "#000000",
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, d: 1, e: 0, f: 0 } as DOMMatrix)),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(() => { ctx.fillCalls = Number(ctx.fillCalls) + 1; }),
  };
  return ctx as FakeContext;
}

afterEach(() => {
  vi.restoreAllMocks();
  clearBrushCache();
});

describe("incremental brush rendering", () => {
  it("does not paint the last spray stamp again when the path did not grow", () => {
    const contexts = new Map<HTMLCanvasElement, FakeContext>();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
      let ctx = contexts.get(this);
      if (!ctx) {
        ctx = fakeContext(this);
        contexts.set(this, ctx);
      }
      return ctx;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext);

    const target = document.createElement("canvas");
    target.width = 400;
    target.height = 200;
    const targetCtx = target.getContext("2d") as FakeContext;
    const request = {
      worldPts: [{ x: 20, y: 40 }, { x: 26, y: 40 }],
      closed: false,
      project: (p: { x: number; y: number }) => p,
      liveKey: "test:live-spray",
      style: {
        preset: "spray" as const,
        character: 55,
        seed: 17,
        sizePx: 46,
        color: "#111111",
        opacity: 1,
        closed: false,
      },
    };

    renderBrushStroke(request, targetCtx);
    const liveCtx = [...contexts.values()].find((ctx) => ctx.canvas !== target);
    expect(liveCtx).toBeDefined();
    const fillsAfterFirstRender = liveCtx!.fillCalls;
    expect(fillsAfterFirstRender).toBeGreaterThan(0);

    renderBrushStroke(request, targetCtx);
    expect(liveCtx!.fillCalls).toBe(fillsAfterFirstRender);

    endLiveBrush(request.liveKey);
  });
});
