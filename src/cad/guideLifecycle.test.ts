import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PointEditAction, SelectionType, SnapType } from "./constants";
import { Camera } from "./Camera";
import { LabelManager } from "./LabelManager";
import { PointEditMenu } from "./PointEditMenu";
import { Scene } from "./Scene";
import { SelectTool } from "./SelectTool";
import { TopologyEngine } from "./TopologyEngine";
import { v } from "./geometry";
import { restoreOneScene } from "./sceneSerde";
import { setExportMode } from "@/lib/printExport";

let RendererClass: typeof import("./Renderer").Renderer;
let MiniCadClass: typeof import("./embed/MiniCad").MiniCad;
let rasterizeObject: typeof import("./rasterize").rasterizeObject;

function fakeElement<T extends HTMLElement>(): T {
  const classes = new Set<string>();
  return {
    style: {},
    dataset: {},
    parentElement: null,
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
        return next;
      },
      contains: (name: string) => classes.has(name),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    appendChild: vi.fn(),
    getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }),
  } as unknown as T;
}

beforeAll(async () => {
  const documentElement = fakeElement<HTMLElement>();
  const head = fakeElement<HTMLHeadElement>();
  const body = fakeElement<HTMLBodyElement>();
  Reflect.set(globalThis, "document", {
    createElement: (tagName: string) => {
      const element = fakeElement<HTMLElement>() as HTMLElement & { getContext?: () => null };
      if (tagName.toLowerCase() === "canvas") element.getContext = () => null;
      return element;
    },
    documentElement,
    head,
    body,
    createTextNode: (text: string) => ({ textContent: text }),
    getElementsByTagName: (tagName: string) => tagName.toLowerCase() === "head" ? [head] : [],
  });
  ({ Renderer: RendererClass } = await import("./Renderer"));
  ({ MiniCad: MiniCadClass } = await import("./embed/MiniCad"));
  ({ rasterizeObject } = await import("./rasterize"));
});

afterEach(() => {
  setExportMode(false);
  Reflect.deleteProperty(globalThis, "window");
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("Hilfslinien-Lebenszyklus", () => {
  it("rastert Hilfslinien auch im Pixelmodus niemals", () => {
    const scene = new Scene();
    const guide = scene.createSegment(v(0, 0), v(2, 0), { isGuide: true });
    const app = { defaultDrawRasterMode: "pixel", scene, renderer: {} };

    expect(rasterizeObject(app, { type: "segment", obj: guide })).toBeNull();
    expect(scene.segments).toEqual([guide]);
    expect(scene.documents).toHaveLength(0);
    expect(guide.isGuide).toBe(true);
  });

  it("bewahrt Guide-, Fang- und Pfeilattribute beim Wiederherstellen und Teilen", () => {
    const scene = new Scene();
    restoreOneScene(scene, {
      segments: [{
        a: v(0, 0),
        b: v(4, 0),
        color: "#7DD3FC",
        thicknessM: 0.003,
        isGuide: true,
        midpointSnap: true,
        divisionSnap: 4,
        arrowStart: true,
        arrowEnd: true,
        arrowScale: 1.5,
        _stickerEditOwnerId: "sticker-1",
      }],
    });

    const restored = scene.segments[0];
    const result = scene.splitSegmentAtT(restored, 0.5);

    expect(result.didSplit).toBe(true);
    expect(result.newSegments).toHaveLength(2);
    expect(result.newSegments[0]).toMatchObject({
      color: "#7DD3FC",
      thicknessM: 0.003,
      isGuide: true,
      midpointSnap: true,
      divisionSnap: 4,
      arrowStart: true,
      arrowEnd: false,
      arrowScale: 1.5,
      _stickerEditOwnerId: "sticker-1",
    });
    expect(result.newSegments[1]).toMatchObject({
      color: "#7DD3FC",
      thicknessM: 0.003,
      isGuide: true,
      midpointSnap: true,
      divisionSnap: 4,
      arrowStart: false,
      arrowEnd: true,
      arrowScale: 1.5,
      _stickerEditOwnerId: "sticker-1",
    });
  });

  it("kopiert und fügt eine Hilfslinie mit ihrer Identität wieder ein", () => {
    const scene = new Scene();
    const guide = scene.createSegment(v(1, 2), v(5, 2), {
      color: "#7DD3FC",
      thicknessM: 0.004,
      isGuide: true,
      midpointSnap: true,
      divisionSnap: 3,
      arrowStart: true,
      arrowEnd: false,
      arrowScale: 1.25,
    });
    const beginPasteFloat = vi.fn();
    const app = Object.assign(Object.create(MiniCadClass.prototype), {
      scene,
      _activeTool: "select",
      selectTool: { marqueeSelectedIds: [], beginPasteFloat },
      selection: { type: SelectionType.SEGMENT, segmentId: guide.id },
      selections: [],
      _miniClipboard: [],
      _miniPasteRound: 0,
      clearSelection: vi.fn(),
      refreshLabelUI: vi.fn(),
      renderer: { requestDraw: vi.fn() },
      _onChange: vi.fn(),
    }) as import("./embed/MiniCad").MiniCad;

    expect(app.copySelection()).toBe(true);
    expect(app.pasteClipboard()).toBe(true);

    const pasted = scene.segments[scene.segments.length - 1];
    expect(scene.segments).toHaveLength(2);
    expect(pasted).not.toBe(guide);
    expect(pasted).toMatchObject({
      color: "#7DD3FC",
      thicknessM: 0.004,
      isGuide: true,
      midpointSnap: true,
      divisionSnap: 3,
      arrowStart: true,
      arrowEnd: false,
      arrowScale: 1.25,
    });
    expect(beginPasteFloat).toHaveBeenCalledWith([
      { kind: "segment", id: pasted?.id },
    ]);
    expect(Reflect.get(app, "_onChange")).not.toHaveBeenCalled();

    const confirmPasteFloat = vi.fn(() => true);
    Reflect.set(app.selectTool, "pasteFloatActive", true);
    Reflect.set(app.selectTool, "confirmPasteFloat", confirmPasteFloat);
    expect(app.pasteClipboard()).toBe(true);
    expect(confirmPasteFloat).toHaveBeenCalledTimes(1);
    expect(Reflect.get(app, "_onChange")).toHaveBeenCalledTimes(1);

    Reflect.set(app.selectTool, "pasteFloatActive", false);
    Reflect.set(app, "_guidesLocked", true);
    beginPasteFloat.mockClear();
    const segmentCount = scene.segments.length;
    expect(app.pasteClipboard()).toBe(true);
    expect(scene.segments).toHaveLength(segmentCount);
    expect(beginPasteFloat).not.toHaveBeenCalled();
  });

  it("zeichnet Hilfslinien im Exportpfad nicht", () => {
    const scene = new Scene();
    const normal = scene.createSegment(v(0, 0), v(1, 0));
    const guide = scene.createSegment(v(0, 1), v(1, 1), { isGuide: true });
    const drawSegment = vi.fn();
    const renderer = Object.assign(Object.create(RendererClass.prototype), {
      scene,
      labels: new LabelManager(),
      _drawSingleSegment: drawSegment,
    }) as import("./Renderer").Renderer;

    const drawSegmentsForLabel = Reflect.get(renderer, "_drawSegmentsForLabel")
      .bind(renderer) as (labelId: string) => void;
    drawSegmentsForLabel(normal.labelId);
    expect(drawSegment).toHaveBeenCalledWith(normal);
    expect(drawSegment).toHaveBeenCalledWith(guide);

    drawSegment.mockClear();
    setExportMode(true);
    drawSegmentsForLabel(normal.labelId);

    expect(drawSegment).toHaveBeenCalledTimes(1);
    expect(drawSegment).toHaveBeenCalledWith(normal);
    expect(drawSegment).not.toHaveBeenCalledWith(guide);
  });

  it("unterdrückt im Mappe-Export Selektion und Werkzeug-Overlay", () => {
    const drawGeometry = vi.fn();
    const drawSelection = vi.fn();
    const drawOverlay = vi.fn();
    const context = {
      save: vi.fn(),
      clearRect: vi.fn(),
      restore: vi.fn(),
    };
    const renderer = {
      ctx: context,
      vw: 800,
      vh: 600,
      camera: {},
      selection: null,
      extraSelections: [],
      overlay: { draw: drawOverlay },
      render: vi.fn(),
      _drawByLabelOrder: drawGeometry,
      _drawSegmentSelection: drawSelection,
    };
    const app = Object.assign(
      Object.create(MiniCadClass.prototype),
      { renderer },
    ) as import("./embed/MiniCad").MiniCad;
    const patchRenderer = Reflect.get(app, "_patchRendererTransparent")
      .bind(app) as () => void;
    patchRenderer();

    setExportMode(true);
    renderer.render();
    expect(drawGeometry).toHaveBeenCalledTimes(1);
    expect(drawSelection).not.toHaveBeenCalled();
    expect(drawOverlay).not.toHaveBeenCalled();

    drawGeometry.mockClear();
    setExportMode(false);
    renderer.render();
    expect(drawGeometry).toHaveBeenCalledTimes(1);
    expect(drawSelection).toHaveBeenCalledTimes(1);
    expect(drawOverlay).toHaveBeenCalledTimes(1);
  });

  it("durchläuft im Bearbeitungs-Hub nur tatsächlich angebotene Aktionen", () => {
    Reflect.set(globalThis, "window", {
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const root = fakeElement<HTMLDivElement>();
    const buttons = {
      [PointEditAction.MOVE]: fakeElement<HTMLButtonElement>(),
      [PointEditAction.TRANSLATE]: fakeElement<HTMLButtonElement>(),
      [PointEditAction.ROTATE]: fakeElement<HTMLButtonElement>(),
    } as Record<string, HTMLButtonElement>;
    const menu = new PointEditMenu(root, buttons);
    const activated: string[] = [];
    menu.bindActivate((action) => activated.push(action));
    menu.showAt(100, 100, [
      PointEditAction.MOVE,
      PointEditAction.TRANSLATE,
      PointEditAction.ROTATE,
      PointEditAction.DELETE,
    ]);

    for (let i = 0; i < 6; i += 1) {
      menu.next();
      menu.activateCurrent();
    }

    expect(activated).toEqual([
      PointEditAction.MOVE,
      PointEditAction.TRANSLATE,
      PointEditAction.ROTATE,
      PointEditAction.MOVE,
      PointEditAction.TRANSLATE,
      PointEditAction.ROTATE,
    ]);
    expect(activated).not.toContain(PointEditAction.DELETE);
  });

  it("findet beim Gruppenfang ein fremdes Ziel hinter dem eigenen Fangpunkt", () => {
    const scene = new Scene();
    const selected = scene.createSegment(v(0, 0), v(0, 1));
    const foreign = scene.createSegment(v(-1, 0), v(1, 0));
    const camera = new Camera();
    camera.scale = 100;
    const topology = new TopologyEngine(scene, camera, new LabelManager());

    const unfiltered = topology.findBestSnap(v(0, 0), v(0, 0));
    expect(unfiltered).toMatchObject({ type: SnapType.POINT, segment: selected });

    const filtered = topology.findBestSnap(v(0, 0), v(0, 0), {
      segmentIds: new Set([selected.id]),
    });
    expect(filtered).toMatchObject({ type: SnapType.LINE, segment: foreign });
  });

  it("behält beim Punktedit den festen Eigenpunkt als Fangziel", () => {
    const scene = new Scene();
    const edited = scene.createSegment(v(0, 0), v(2, 0));
    const camera = new Camera();
    camera.scale = 100;
    const topology = new TopologyEngine(scene, camera, new LabelManager());

    const fixedPoint = topology.findBestSnap(v(200, 0), v(2, 0), {
      segmentPoint: { segmentId: edited.id, pointIndex: 0 },
      segmentLineIds: new Set([edited.id]),
    });

    expect(fixedPoint).toMatchObject({
      type: SnapType.POINT,
      segment: edited,
      pointIndex: 1,
    });
  });

  it("nutzt R-Klick-Hilfslinien auch im gemeinsamen direkten Transformpfad", () => {
    const scene = new Scene();
    const selected = scene.createSegment(v(0, -1), v(0, 1));
    scene.createSegment(v(-2, 0), v(2, 0));
    const camera = new Camera();
    camera.scale = 100;
    const topology = new TopologyEngine(scene, camera, new LabelManager());
    const selectTool = new SelectTool({
      scene,
      camera,
      topology,
      renderer: { vw: 800, vh: 600 },
    } as unknown as import("./CadApp").CadApp);
    const toggleGuide = Reflect.get(selectTool, "_tryToggleTransformGuide")
      .bind(selectTool) as (
        input: unknown,
        exclusions: { segmentIds: Set<string> },
        origin: { x: number; y: number },
      ) => boolean;
    const findTransformSnap = Reflect.get(selectTool, "_findTransformSnap")
      .bind(selectTool) as (
        input: unknown,
        exclusions: { segmentIds: Set<string> },
      ) => { type: string; world: { x: number; y: number } } | null;

    expect(toggleGuide({
      rightClicked: true,
      mouse: { sx: 0, sy: 0, wx: 0, wy: 0 },
    }, { segmentIds: new Set([selected.id]) }, v(0, 2))).toBe(true);
    expect(selectTool.editParallelGuides).toHaveLength(1);

    const snap = findTransformSnap({
      mouse: { sx: 30, sy: 202, wx: 0.3, wy: 2.02 },
    }, { segmentIds: new Set([selected.id]) });
    expect(snap?.type).toBe(SnapType.GUIDE);
    expect(snap?.world.y).toBeCloseTo(2, 6);
  });

  it("behält ausgeschlossene Wände im Heilungs-Kontext anderer Fangwände", () => {
    const scene = new Scene();
    const excluded = scene.createWall({
      kind: "outer",
      thicknessM: 0.2,
      referenceSide: "center",
      corners: [v(0, 0), v(2, 0)],
    });
    const candidate = scene.createWall({
      kind: "outer",
      thicknessM: 0.2,
      referenceSide: "center",
      corners: [v(2, 0), v(2, 2)],
    });
    const camera = new Camera();
    camera.scale = 100;
    const topology = new TopologyEngine(scene, camera, new LabelManager());
    const getHealed = vi.fn((wall: typeof candidate, others: typeof scene.walls) => ({
      mainCorners: wall.corners,
      subCorners: wall.corners,
      otherCount: others.length,
    }));
    Reflect.set(topology, "_getHealed", getHealed);

    topology.findBestSnap(v(200, 100), v(2, 1), {
      wallIds: new Set([excluded.id]),
    });

    expect(getHealed).toHaveBeenCalledWith(candidate, [excluded]);
  });

  it("lässt eine eingefügte Kopie sofort schweben und bestätigt oder verwirft sie", () => {
    const scene = new Scene();
    const camera = new Camera();
    camera.scale = 100;
    const topology = new TopologyEngine(scene, camera, new LabelManager());
    const commitHistorySnapshot = vi.fn();
    const discardHistoryPreview = vi.fn();
    const app = {
      scene,
      camera,
      topology,
      input: { mouse: { wx: 10, wy: 10, sx: 1000, sy: 1000 } },
      commitHistorySnapshot,
      discardHistoryPreview,
      refreshLabelUI: vi.fn(),
    };
    const selectTool = new SelectTool(app as unknown as import("./CadApp").CadApp);
    const confirmed = scene.createSegment(v(0, 0), v(2, 0));
    selectTool.groupAnchor = v(99, 99);
    selectTool.editGuideAnchors = [{ key: "alt", point: v(99, 99) }];

    selectTool.beginPasteFloat([{ kind: "segment", id: confirmed.id }]);

    expect(selectTool.pasteFloatActive).toBe(true);
    expect(selectTool.groupDragActive).toBe(true);
    expect(selectTool.groupAnchor).toBeNull();
    expect(selectTool.editGuideAnchors).toEqual([]);
    expect(confirmed.a).toEqual(v(8, 10));
    expect(confirmed.b).toEqual(v(10, 10));
    expect(selectTool.confirmPasteFloat()).toBe(true);
    expect(selectTool.pasteFloatActive).toBe(false);
    expect(selectTool.groupDragActive).toBe(false);
    expect(scene.getSegmentById(confirmed.id)).toBe(confirmed);

    const cancelled = scene.createSegment(v(0, 0), v(1, 0));
    selectTool.beginPasteFloat([{ kind: "segment", id: cancelled.id }]);
    expect(selectTool.cancelPasteFloat()).toBe(true);
    expect(scene.getSegmentById(cancelled.id)).toBeNull();
    expect(selectTool.pasteFloatActive).toBe(false);
    expect(selectTool.groupDragActive).toBe(false);
    expect(commitHistorySnapshot).toHaveBeenCalledTimes(1);
    expect(discardHistoryPreview).toHaveBeenCalledTimes(1);
  });

  it("verwirft eine schwebende Kopie mit Escape vor dem normalen Gruppenabbruch", () => {
    let keyHandler: ((event: KeyboardEvent) => void) | null = null;
    Reflect.set(globalThis, "window", {
      addEventListener: (type: string, listener: EventListener) => {
        if (type === "keydown") keyHandler = listener as (event: KeyboardEvent) => void;
      },
      removeEventListener: vi.fn(),
    });
    const cancelPasteFloat = vi.fn(() => true);
    const cancelGroupTransform = vi.fn();
    const app = Object.assign(Object.create(MiniCadClass.prototype), {
      _destroyed: false,
      _activeTool: "select",
      _coordCleanups: [],
      selectTool: {
        pasteFloatActive: true,
        groupDragActive: true,
        groupRotateActive: false,
        groupAnchorActive: false,
        cancelPasteFloat,
        cancelGroupTransform,
        cancel: vi.fn(),
      },
      textEditor: { isActive: () => false },
      activeTool: { cancel: vi.fn() },
      lineTool: { cancel: vi.fn() },
      hatchTool: { cancel: vi.fn() },
      freeDrawTool: { cancel: vi.fn() },
      eraserTool: { cancel: vi.fn() },
      documentTool: { cancel: vi.fn() },
      clearSelection: vi.fn(),
      pointEditMenu: { hide: vi.fn() },
      hub: { hide: vi.fn() },
      renderer: { setHoverSegmentId: vi.fn(), setSelection: vi.fn() },
      setActiveTool: vi.fn(),
    }) as import("./embed/MiniCad").MiniCad;
    const installDeleteKey = Reflect.get(app, "_installDeleteKey")
      .bind(app) as () => void;
    installDeleteKey();

    keyHandler?.({
      key: "Escape",
      target: document.body,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    } as unknown as KeyboardEvent);

    expect(cancelPasteFloat).toHaveBeenCalledTimes(1);
    expect(cancelGroupTransform).not.toHaveBeenCalled();
  });

  it("beendet einen laufenden Guide-Edit beim Fixieren und filtert die Auswahl", () => {
    const scene = new Scene();
    const guide = scene.createSegment(v(0, 0), v(2, 0), { isGuide: true });
    const normal = scene.createSegment(v(0, 1), v(2, 1));
    const guideSelection = { type: SelectionType.POINT, segmentId: guide.id, pointIndex: 0 };
    const normalSelection = { type: SelectionType.SEGMENT, segmentId: normal.id };
    const renderer = {
      setSelection: vi.fn(),
      setExtraSelections: vi.fn(),
      setHoverSegmentId: vi.fn(),
    };
    const app = Object.assign(Object.create(MiniCadClass.prototype), {
      scene,
      renderer,
      pointEditMenu: { hide: vi.fn() },
      hub: { hide: vi.fn(), bindCommit: vi.fn() },
      selection: guideSelection,
      selections: [guideSelection, normalSelection],
      _guidesLocked: false,
      _frameLabelId: "__frame__",
      _extRectLabelId: "__external__",
      _ghostLabelId: "__ghost__",
    }) as import("./embed/MiniCad").MiniCad;
    const selectTool = new SelectTool(app as unknown as import("./CadApp").CadApp);
    Reflect.set(app, "selectTool", selectTool);
    selectTool.marqueeSelectedIds = [
      { kind: "segment", id: guide.id },
      { kind: "segment", id: normal.id },
    ];
    selectTool.activeEditAction = PointEditAction.TRANSLATE;
    selectTool.editTarget = { kind: "segment", segmentId: guide.id, pointIndex: 0 };
    selectTool.fixedPoint = v(2, 0);
    selectTool.otherPointOriginal = v(0, 0);
    guide.a = v(1, 1);
    guide.b = v(3, 1);

    app.setGuidesLocked(true);

    expect(guide.a).toEqual(v(0, 0));
    expect(guide.b).toEqual(v(2, 0));
    expect(selectTool.editTarget).toBeNull();
    expect(selectTool.marqueeSelectedIds).toEqual([{ kind: "segment", id: normal.id }]);
    expect(app.selection).toBe(normalSelection);
    expect(app.selections).toEqual([normalSelection]);
  });

  it("verwirft eine schwebend eingefügte Hilfslinie beim Fixieren", () => {
    const scene = new Scene();
    const pastedGuide = scene.createSegment(v(0, 0), v(2, 0), { isGuide: true });
    const renderer = {
      setSelection: vi.fn(),
      setExtraSelections: vi.fn(),
      setHoverSegmentId: vi.fn(),
    };
    const app = Object.assign(Object.create(MiniCadClass.prototype), {
      scene,
      renderer,
      pointEditMenu: { hide: vi.fn() },
      hub: { hide: vi.fn(), bindCommit: vi.fn() },
      selection: null,
      selections: [],
      _guidesLocked: false,
      _frameLabelId: "__frame__",
      _extRectLabelId: "__external__",
      _ghostLabelId: "__ghost__",
    }) as import("./embed/MiniCad").MiniCad;
    const selectTool = new SelectTool(app as unknown as import("./CadApp").CadApp);
    Reflect.set(app, "selectTool", selectTool);
    selectTool.marqueeSelectedIds = [{ kind: "segment", id: pastedGuide.id }];
    selectTool.pasteFloatActive = true;
    selectTool.groupDragActive = true;

    app.setGuidesLocked(true);

    expect(scene.getSegmentById(pastedGuide.id)).toBeNull();
    expect(selectTool.pasteFloatActive).toBe(false);
    expect(selectTool.groupDragActive).toBe(false);
    expect(selectTool.marqueeSelectedIds).toEqual([]);
  });

  it("setzt den älteren Mehrfachverschiebe-Pfad beim Fixieren vollständig zurück", () => {
    const scene = new Scene();
    const guide = scene.createSegment(v(0, 0), v(2, 0), { isGuide: true });
    const normal = scene.createSegment(v(0, 1), v(2, 1));
    const guideSelection = { type: SelectionType.SEGMENT, segmentId: guide.id };
    const normalSelection = { type: SelectionType.SEGMENT, segmentId: normal.id };
    const renderer = {
      setSelection: vi.fn(),
      setExtraSelections: vi.fn(),
      setHoverSegmentId: vi.fn(),
    };
    const app = Object.assign(Object.create(MiniCadClass.prototype), {
      scene,
      renderer,
      pointEditMenu: { hide: vi.fn() },
      hub: { hide: vi.fn(), bindCommit: vi.fn() },
      selection: guideSelection,
      selections: [normalSelection, guideSelection],
      _guidesLocked: false,
      _frameLabelId: "__frame__",
      _extRectLabelId: "__external__",
      _ghostLabelId: "__ghost__",
    }) as import("./embed/MiniCad").MiniCad;
    const selectTool = new SelectTool(app as unknown as import("./CadApp").CadApp);
    Reflect.set(app, "selectTool", selectTool);
    guide.a = v(5, 5);
    guide.b = v(7, 5);
    normal.a = v(5, 6);
    normal.b = v(7, 6);
    Reflect.set(app, "_groupMoveSnap", {
      primarySel: guideSelection,
      primaryAnchor: { x: 1, y: 0 },
      primarySnapshot: { kind: "segment", a: v(0, 0), b: v(2, 0) },
      extras: [{
        sel: normalSelection,
        snapshot: { kind: "segment", a: v(0, 1), b: v(2, 1) },
      }],
    });

    app.setGuidesLocked(true);

    expect(guide.a).toEqual(v(0, 0));
    expect(guide.b).toEqual(v(2, 0));
    expect(normal.a).toEqual(v(0, 1));
    expect(normal.b).toEqual(v(2, 1));
    expect(Reflect.get(app, "_groupMoveSnap")).toBeNull();
    expect(app.selection).toBe(normalSelection);
    expect(app.selections).toEqual([normalSelection]);
  });

  it("löscht ein Objekt trotz geöffnetem Bearbeitungs-Hub mit einem ENTF-Druck", () => {
    let keyHandler: ((event: KeyboardEvent) => void) | null = null;
    Reflect.set(globalThis, "window", {
      addEventListener: (type: string, listener: EventListener) => {
        if (type === "keydown") keyHandler = listener as (event: KeyboardEvent) => void;
      },
      removeEventListener: vi.fn(),
    });
    const scene = new Scene();
    const guide = scene.createSegment(v(0, 0), v(2, 0), { isGuide: true });
    const cancel = vi.fn();
    const selection = { type: SelectionType.POINT, segmentId: guide.id, pointIndex: 0 };
    const app = Object.assign(Object.create(MiniCadClass.prototype), {
      _destroyed: false,
      _activeTool: "select",
      _coordCleanups: [],
      scene,
      selection,
      selections: [],
      selectTool: {
        editTarget: { kind: "segment", segmentId: guide.id, pointIndex: 0 },
        rotateTextBoxId: null,
        dragTextBoxId: null,
        dragDocId: null,
        dragFreeStrokeId: null,
        dragDimId: null,
        marqueeSelectedIds: [],
        groupAnchorActive: false,
        groupRotateActive: false,
        groupDragActive: false,
        cancel,
      },
      textEditor: { isActive: () => false },
      pointEditMenu: { hide: vi.fn() },
      clearSelection: vi.fn(),
      refreshLabelUI: vi.fn(),
    }) as import("./embed/MiniCad").MiniCad;
    const installDeleteKey = Reflect.get(app, "_installDeleteKey")
      .bind(app) as () => void;
    installDeleteKey();

    expect(keyHandler).not.toBeNull();
    keyHandler?.({
      key: "Delete",
      target: document.body,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ctrlKey: false,
      metaKey: false,
      altKey: false,
    } as unknown as KeyboardEvent);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(scene.getSegmentById(guide.id)).toBeNull();
  });
});
