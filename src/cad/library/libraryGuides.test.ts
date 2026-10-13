import { describe, expect, it } from "vitest";
import { Scene } from "../Scene";
import { Camera } from "../Camera";
import { LabelManager } from "../LabelManager";
import { TopologyEngine } from "../TopologyEngine";
import { GlobalGuides } from "../globalGuides";
import { GuideInteractionController } from "../GuideInteractionController";
import { LibrarySnapSource } from "./librarySnapSource";
import type { LibraryDefinition } from "./types";

function harness(rotationRad = 0, scaleX = 1) {
  const scene = new Scene();
  const camera = new Camera();
  const labels = new LabelManager();
  const geometry: LibraryDefinition["geometry"] = Array.from({ length: 100 }, (_, i) => ({
    kind: "segment", data: { a: { x: 0, y: 0 }, b: { x: Math.cos(i * Math.PI / 50), y: Math.sin(i * Math.PI / 50) } },
  }));
  const def: LibraryDefinition = { schemaVersion: 1, id: "tree", version: 1, name: "Tree", category: "", tags: [], units: "m", insertionPoint: { x: 0, y: 0 }, metadata: {}, geometry, createdAt: 1, updatedAt: 1 };
  const inst = scene.createLibraryInstance({ definitionId: def.id, definitionVersion: 1, labelId: labels.list()[0].id, position: { x: 3, y: 4 }, rotationRad, scaleX, scaleY: 2 });
  const source = new LibrarySnapSource();
  source.definitions = () => [def];
  const topo = new TopologyEngine(scene, camera, labels);
  topo.librarySnaps = source;
  return { scene, camera, topo, source, inst };
}

describe("Bibliotheks-Fangpunkte und Rechtsklick", () => {
  it("erzeugt bei 100 anliegenden Bibliothekskanten nur die zwei Hauptachsen und toggelt sie", () => {
    const { camera, topo, inst } = harness();
    const guides = new GlobalGuides();
    const controller = new GuideInteractionController(guides, topo, camera);
    const world = inst.position;
    expect(controller.handleRightClick(camera.worldToScreen(world.x, world.y), world)).toBe(true);
    expect(guides.lines).toHaveLength(2);
    controller.handleRightClick(camera.worldToScreen(world.x, world.y), world);
    expect(guides.lines).toHaveLength(0);
  });
  it.each([[0, 1], [Math.PI / 4, -2]])("fängt alle vier Rahmenecken auch gedreht/gespiegelt (%s, %s)", (rotation, scale) => {
    const { camera, topo, source, scene } = harness(rotation, scale);
    const entry = source.scenesFor(scene, () => true)[0];
    const guides = new GlobalGuides();
    const controller = new GuideInteractionController(guides, topo, camera);
    expect(entry.frame).toHaveLength(4);
    for (const world of entry.frame) {
      const screen = camera.worldToScreen(world.x, world.y);
      expect(topo.findBestSnap(screen, world)?.world).toEqual(world);
      expect(controller.handleRightClick(screen, world)).toBe(true);
    }
  });
  it("schließt ausgeblendete und gerade transformierte Instanzen aus", () => {
    const { scene, source, topo, camera, inst } = harness();
    expect(source.scenesFor(scene, () => false)).toEqual([]);
    const world = source.scenesFor(scene, () => true)[0].frame[0];
    expect(topo.findBestSnap(camera.worldToScreen(world.x, world.y), world, { libraryInstanceIds: new Set([inst.id]) })).toBeNull();
  });
});