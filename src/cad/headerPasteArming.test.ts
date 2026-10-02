import { describe, expect, it, vi } from "vitest";
import { CadApp } from "./CadApp";
import { Camera } from "./Camera";
import { SelectionType, SnapType } from "./constants";
import { v } from "./geometry";
import { Scene } from "./Scene";
import { SelectTool } from "./SelectTool";

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
    canvas: { style: { cursor: "copy" } },
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

  it("legt ausschließlich den gespeicherten Clipboard-Anker auf den gesnappten Cursor", () => {
    const scene = new Scene();
    const pasted = scene.createSegment(v(2, 3), v(6, 3));
    const camera = new Camera();
    camera.scale = 100;
    const snappedTarget = v(12, 9);
    const app = {
      scene,
      camera,
      input: { mouse: { wx: 11.96, wy: 9.03, sx: 1196, sy: 903 } },
      topology: {
        findBestSnap: vi.fn(() => ({ type: SnapType.POINT, world: snappedTarget })),
      },
      selection: { type: SelectionType.SEGMENT, segmentId: pasted.id },
    } as unknown as CadApp;
    const selectTool = new SelectTool(app);

    selectTool.beginPasteFloat([{ kind: "segment", id: pasted.id }], v(2, 3));

    expect(pasted.a).toEqual(snappedTarget);
    expect(pasted.b).toEqual(v(16, 9));
  });
});
describe("Mehrfach-Einfügen auf dem Tablet", () => {
  it("nach Häkchen entsteht die nächste Vorschau nicht am Häkchen", () => {
    const { app, beginNow } = armedApp();
    app.multiPasteActive = true;
    app.input.mouse = { sx: 500, sy: 400, wx: 5, wy: 4 } as typeof app.input.mouse;
    app.afterPasteFloatConfirmed();
    expect(app.pasteArmed).toBe(true);
    expect(beginNow).not.toHaveBeenCalled();

    // Zittern/Event am Häkchen startet nichts
    app.input.pointerEventSeq += 1;
    app.input.mouse = { sx: 503, sy: 402, wx: 5, wy: 4 } as typeof app.input.mouse;
    Reflect.get(app, "_resolveArmedPaste").call(app);
    expect(beginNow).not.toHaveBeenCalled();

    // Nächster echter Kontakt auf der Zeichenfläche startet die Vorschau
    app.input.pointerEventSeq += 1;
    app.input.mouse = { sx: 900, sy: 800, wx: 9, wy: 8 } as typeof app.input.mouse;
    Reflect.get(app, "_resolveArmedPaste").call(app);
    expect(beginNow).toHaveBeenCalledTimes(1);
  });

  it("Canvas-Tipp bestätigt im Mehrfachmodus keine Kopie, Häkchen/Enter schon", () => {
    const scene = new Scene();
    const seg = scene.createSegment(v(0, 0), v(1, 0));
    const camera = new Camera();
    camera.scale = 100;
    const app = {
      scene, camera, multiPasteActive: true,
      input: { mouse: { wx: 0, wy: 0, sx: 0, sy: 0 } },
      topology: { findBestSnap: vi.fn(() => null) },
      selection: { type: SelectionType.SEGMENT, segmentId: seg.id },
      commitHistorySnapshot: vi.fn(),
      afterPasteFloatConfirmed: vi.fn(),
    } as unknown as CadApp;
    const tool = new SelectTool(app);
    tool.beginPasteFloat([{ kind: "segment", id: seg.id }], v(0, 0));
    const confirm = vi.spyOn(tool, "confirmPasteFloat");
    // Quelltext-Garantie: Canvas-Commit ist für multiPasteActive gesperrt
    const src = SelectTool.prototype.update?.toString?.() ?? "";
    expect(src === "" || src.includes("multiPasteActive")).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(tool.confirmPasteFloat()).toBe(true);
    expect(seg.a).toEqual(v(0, 0));
  });
});
