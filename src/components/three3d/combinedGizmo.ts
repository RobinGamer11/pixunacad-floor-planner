import { Object3D, Raycaster, Vector2, type Camera } from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

type Axis = "X"|"Y"|"Z";
/** r169 accepts normalized coordinates; @types still declares browser PointerEvent. */
export function controlPointer(x:number,y:number,button:number):PointerEvent { return {x,y,button} as PointerEvent; }
type Internals = TransformControls & { _gizmo: {picker:Record<"translate"|"rotate",Object3D>;gizmo:Record<"translate"|"rotate",Object3D>;helper:Record<"translate"|"rotate",Object3D>} };
/** Two official Three.js controls share one pivot, but exactly one owns each gesture. */
export function combinedGizmo(camera:Camera,element:HTMLElement,pivot:Object3D) {
  const translate=new TransformControls(camera,element),rotate=new TransformControls(camera,element);
  translate.disconnect();rotate.disconnect();element.style.touchAction="none";
  translate.setMode("translate");rotate.setMode("rotate");
  const controls=[translate,rotate];
  for(const control of controls){
    control.setSpace("world");control.enabled=false;
    const internal=control as Internals;
    for(const mode of ["translate","rotate"] as const){
      for(const part of [internal._gizmo.picker[mode],internal._gizmo.gizmo[mode],internal._gizmo.helper[mode]])
        part.children.filter(child=>!["X","Y","Z"].includes(child.name)).forEach(child=>{child.raycast=()=>{};child.visible=false; child.layers.disableAll();});
    }
  }
  const ray=new Raycaster();
  const pick=(x:number,y:number,preferred:"translate"|"rotate")=>{
    const r=element.getBoundingClientRect();ray.setFromCamera(new Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),camera);
    const candidates=controls.flatMap(control=>{
      if(!control.enabled)return [];
      const internal=control as Internals;
      return ray.intersectObject(internal._gizmo.picker[control.mode as "translate"|"rotate"],true)
        .filter(hit=>hit.object.visible&&["X","Y","Z"].includes(hit.object.name))
        .map(hit=>({control,axis:hit.object.name as Axis,distance:hit.distance}));
    }).sort((a,b)=>a.distance-b.distance);
    const first=candidates[0];if(!first)return null;
    return candidates.find(c=>c.control.mode===preferred&&Math.abs(c.distance-first.distance)<.025)??first;
  };
  return {translate,rotate,controls,pick,attach:()=>{for(const c of controls){c.enabled=true;c.attach(pivot);}},detach:()=>{for(const c of controls){c.detach();c.enabled=false;}}};
}