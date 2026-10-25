import type { BufferGeometry, Material, Mesh } from "three";
import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

/** Three r169's dispose traverses the controller, but its scene graph is getHelper(). */
export function disposeTransformControls(controls: TransformControls): void {
  controls.disconnect();
  controls.detach();
  const helper = controls.getHelper();
  helper.removeFromParent();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  helper.traverse(child => {
    const mesh = child as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}