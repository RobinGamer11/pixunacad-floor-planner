import { describe, expect, it, vi } from "vitest";
import { CadApp } from "./CadApp";

function armedApp(pointerEventSeq = 7) {
  const beginNow = vi.fn(() => true);
  const app = Object.assign(Object.create(CadApp.prototype), {
    clipboard: { items: [{ kind: "segment", data: {} }], anchor: { x: 4, y: 2 } },
    input: {
      pointerInside: true,
      pointerEventSeq,
      mouse: { sx: 900, sy: 700, wx: 99, wy: 88 },
    },
    textEditor: { isActive: () => false },
    pasteArmed: false,
    multiPasteActive: false,
    onMultiPasteChange: vi.fn(),
    _beginPasteFloatNow: beginNow,
  }) as CadApp;
  return { app, beginNow };
}

describe("Einfügen aus der Kopfzeile", () => {
  it("erzeugt trotz pointerInside keine Kopie und wartet auf ein neues Canvas-Ereignis", () => {
    const { app, beginNow } = armedApp();

    expect(app.armPasteFromHeader()).toBe(true);
    expect(app.pasteArmed).toBe(true);
    expect(beginNow).not.toHaveBeenCalled();

    Reflect.get(app, "_resolveArmedPaste").call(app);
    expect(beginNow).not.toHaveBeenCalled();
  });

  it("startet genau beim ersten echten Canvas-Ereignis", () => {
    const { app, beginNow } = armedApp();
    app.armPasteFromHeader();

    app.input.pointerEventSeq += 1;
    app.input.mouse = { sx: 1200, sy: 950, wx: 15, wy: -8 } as typeof app.input.mouse;
    Reflect.get(app, "_resolveArmedPaste").call(app);

    expect(beginNow).toHaveBeenCalledTimes(1);
    expect(app.pasteArmed).toBe(false);
    Reflect.get(app, "_resolveArmedPaste").call(app);
    expect(beginNow).toHaveBeenCalledTimes(1);
  });

  it("wartet beim Tastenkürzel außerhalb ebenfalls auf ein neues Canvas-Ereignis", () => {
    const { app, beginNow } = armedApp();
    app.input.pointerInside = false;

    expect(app.startPastePreview()).toBe(true);
    Reflect.get(app, "_resolveArmedPaste").call(app);
    expect(beginNow).not.toHaveBeenCalled();

    app.input.pointerEventSeq += 1;
    Reflect.get(app, "_resolveArmedPaste").call(app);
    expect(beginNow).toHaveBeenCalledTimes(1);
  });

  it("schaltet Mehrfach-Einfügen aus dem Kopf ebenfalls nur scharf", () => {
    const { app, beginNow } = armedApp();

    expect(app.toggleMultiPasteFromHeader()).toBe(true);
    expect(app.multiPasteActive).toBe(true);
    expect(app.pasteArmed).toBe(true);
    expect(beginNow).not.toHaveBeenCalled();
  });

  it("bricht einen wartenden Mehrfach-Vorgang vollständig ab", () => {
    const { app } = armedApp();
    app.toggleMultiPasteFromHeader();

    app.cancelPastePreview();

    expect(app.pasteArmed).toBe(false);
    expect(app.multiPasteActive).toBe(false);
    expect(app.onMultiPasteChange).toHaveBeenLastCalledWith(false);
  });
});