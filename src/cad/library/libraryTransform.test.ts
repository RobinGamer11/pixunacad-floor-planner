import { describe, expect, it, vi } from "vitest";
import { SelectionType, ToolIds, PointEditAction } from "../constants";
import { v } from "../geometry";
import { Scene } from "../Scene";
import { SelectTool } from "../SelectTool";
import { LibraryPlacementTool } from "./LibraryPlacementTool";
import type { LibraryDefinition } from "./types";

const definition: LibraryDefinition = {
  schemaVersion: 1,
  id: "library-definition",
  version: 1,
  name: "Testobjekt",
  category: "Test",
  tags: [],
  units: "m",
  insertionPoint: { x: 0, y: 0 },
  metadata: {},
  geometry: [{
    kind: "hatch",
    data: {
      points: [v(-1, -1), v(1, -1), v(1, 1), v(-1, 1)],
      holes: [],
    },
  }],
  createdAt: 1,
  updatedAt: 1,
};

function makeTransformHarness() {
  const scene = new Scene();
  const hubCommit = { current: null as null | ((values: { lengthM: number | null; angleDeg: number | null }) => void) };
  const app = {
    scene,
    libraryDefinitions: [definition],
    input: { mouse: { sx: 0, sy: 0, wx: 0, wy: 0 } },
    pointEditMenu: { hide: vi.fn() },
    renderer: {
      setHoverSegmentId: vi.fn(),
      setHoverTextBoxId: vi.fn(),
      setHoverHatchId: vi.fn(),
      setHoverWallId: vi.fn(),
    },
    hub: {
      bindCommit: vi.fn((callback) => { hubCommit.current = callback; }),
      showAt: vi.fn(),
      updateDisplay: vi.fn(),
      setValues: vi.fn(),
      enterEditMode: vi.fn(),
      hide: vi.fn(),
    },
  };
  const selectTool = new SelectTool(app as unknown as import("../CadApp").CadApp);
  const instance = scene.createLibraryInstance({
    definitionId: definition.id,
    definitionVersion: definition.version,
    position: v(5, 5),
    rotationRad: 0,
    scaleX: 1,
    scaleY: 1,
    labelId: "default-line",
  });
  return { app, selectTool, instance, hubCommit };
}

describe("Bibliotheksobjekt-Platzierung und -Transformation", () => {
  it("beendet die normale Platzierung nach genau einer Instanz und wählt sie aus", () => {
    const scene = new Scene();
    const setTool = vi.fn();
    const setSelection = vi.fn();
    const commitHistorySnapshot = vi.fn();
    const app = {
      scene,
      activeDrawLabelId: "default-line",
      setTool,
      setSelection,
      commitHistorySnapshot,
      refreshLabelUI: vi.fn(),
      pointEditMenu: { hide: vi.fn() },
      hub: { hide: vi.fn() },
      renderer: { overlay: null },
    };
    const tool = new LibraryPlacementTool(app as unknown as import("../CadApp").CadApp);
    tool.activeDef = definition;
    tool.phase = "rotating";
    tool.anchor = v(3, 4);
    tool.rotationRad = Math.PI / 3;

    tool.commit();

    expect(scene.libraryInstances).toHaveLength(1);
    const placed = scene.libraryInstances[0];
    expect(tool.phase).toBe("idle");
    expect(tool.activeDef).toBeNull();
    expect(setTool).toHaveBeenCalledWith(ToolIds.SELECT);
    expect(setSelection).toHaveBeenCalledWith({
      type: SelectionType.LIBRARY_INSTANCE,
      libraryInstanceId: placed.id,
      handleIndex: null,
    });
    expect(commitHistorySnapshot).toHaveBeenCalledTimes(1);
  });

  it("verschiebt nur die Instanz vom gewählten Fangpunkt aus", () => {
    const { selectTool, instance } = makeTransformHarness();
    selectTool.beginLibraryHandleEdit(instance.id, 0, PointEditAction.MOVE);
    const applyMove = Reflect.get(selectTool, "_applyLibraryMove").bind(selectTool) as (point: { x: number; y: number }) => boolean;

    expect(applyMove(v(10, 20))).toBe(true);
    expect(instance.position).toEqual(v(11, 21));
    expect(definition.geometry[0].data.points[0]).toEqual(v(-1, -1));

    selectTool.cancel();
    expect(instance.position).toEqual(v(5, 5));
  });

  it("skaliert per Längen-Hub proportional und lässt die Definition unverändert", () => {
    const { selectTool, instance, hubCommit } = makeTransformHarness();
    selectTool.beginLibraryHandleEdit(instance.id, 0, PointEditAction.SCALE);
    const commit = hubCommit.current;
    expect(commit).not.toBeNull();

    commit?.({ lengthM: 2 * Math.SQRT2, angleDeg: null });

    expect(instance.scaleX).toBeCloseTo(2, 8);
    expect(instance.scaleY).toBeCloseTo(2, 8);
    expect(definition.geometry[0].data.points[0]).toEqual(v(-1, -1));

    selectTool.cancel();
    expect(instance.scaleX).toBe(1);
    expect(instance.scaleY).toBe(1);
  });

  it("skaliert per 2-Punkt-Aktion um den festen Fangpunkt", () => {
    const { selectTool, instance, hubCommit } = makeTransformHarness();
    selectTool.beginLibraryHandleEdit(instance.id, 0, PointEditAction.SCALE_2PT);
    const fixed = selectTool.fixedPoint!;
    const commit = hubCommit.current;
    expect(commit).not.toBeNull();

    commit?.({ lengthM: 4 * Math.SQRT2, angleDeg: null });

    expect(instance.scaleX).toBeCloseTo(2, 8);
    expect(instance.scaleY).toBeCloseTo(2, 8);
    // Der angeklickte Fangpunkt bleibt exakt liegen.
    expect(selectTool.fixedPoint).toEqual(fixed);
    expect(instance.position.x).toBeCloseTo(fixed.x + (5 - fixed.x) * 2, 8);
    expect(definition.geometry[0].data.points[0]).toEqual(v(-1, -1));

    selectTool.cancel();
    expect(instance.scaleX).toBe(1);
    expect(instance.position).toEqual(v(5, 5));
  });
});