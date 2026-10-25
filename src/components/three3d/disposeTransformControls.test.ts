import { describe, expect, it, vi } from "vitest";
import { Object3D, PerspectiveCamera, Scene, type Mesh } from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { disposeTransformControls } from "./disposeTransformControls";

describe("TransformControls cleanup with Three r169", () => {
  it("disconnects, detaches and releases the helper without traversing the controller", () => {
    const canvas = document.createElement("canvas");
    const controls = new TransformControls(new PerspectiveCamera(), canvas);
    const scene = new Scene();
    const target = new Object3D();
    scene.add(target, controls.getHelper());
    controls.attach(target);
    const disconnect = vi.spyOn(controls, "disconnect");
    const disposal = new Set<ReturnType<typeof vi.spyOn>>();
    const resources = new Set<{ dispose(): void }>();
    controls.getHelper().traverse(child => {
      const mesh = child as Mesh;
      if (mesh.geometry) resources.add(mesh.geometry);
      if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(m);
    });
    for (const resource of resources) disposal.add(vi.spyOn(resource, "dispose"));
    expect(resources.size).toBeGreaterThan(0);
    expect(() => disposeTransformControls(controls)).not.toThrow();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(controls.object).toBeUndefined();
    expect(controls.getHelper().parent).toBeNull();
    for (const spy of disposal) expect(spy).toHaveBeenCalledOnce();
  });
});