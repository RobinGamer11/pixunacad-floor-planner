import { expect, it } from "vitest";
import { Object3D, PerspectiveCamera } from "three";
import { combinedGizmo } from "./combinedGizmo";
import { disposeTransformControls } from "./disposeTransformControls";
it("translation and rotation share one pivot, allow only world axes and dispose safely",()=>{
  const element=document.createElement("div"),pivot=new Object3D();
  const gizmo=combinedGizmo(new PerspectiveCamera(),element,pivot);gizmo.attach();
  expect(gizmo.translate.object).toBe(pivot);expect(gizmo.rotate.object).toBe(pivot);
  expect(gizmo.translate.mode).toBe("translate");expect(gizmo.rotate.mode).toBe("rotate");
  for(const c of gizmo.controls){expect(c.space).toBe("world");
    const internal=c as unknown as {_gizmo:{picker:Record<string,Object3D>}};
    for(const part of internal._gizmo.picker[c.mode].children){
      if(!["X","Y","Z"].includes(part.name))expect(part.layers.mask).toBe(0);
    }
  }
  gizmo.detach();expect(gizmo.translate.enabled).toBe(false);expect(gizmo.rotate.enabled).toBe(false);
  for(const c of gizmo.controls)expect(()=>disposeTransformControls(c)).not.toThrow();
});