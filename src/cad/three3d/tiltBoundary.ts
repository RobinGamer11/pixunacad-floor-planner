import type { Derived3D } from "./geometryDerivation";
import { spatialFeatures } from "./manipulationSnap";
import type { Vec2 } from "../geometry";
import type { Vec3 } from "./solidMesh";
/** Match an actual 3D boundary segment to its canonical 2D edge, never invent a height. */
export function boundaryRings(flat: Derived3D[], outline: Vec2[], transform: (p:Vec3)=>Vec3) {
  const features=spatialFeatures(flat), top:Vec3[]=[],bottom:Vec3[]=[];
  for(const p of outline){
    const candidates=features.points.filter(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-4).sort((a,b)=>a.z-b.z);
    const low=candidates[0], high=candidates[candidates.length-1];
    if(!low||!high)return undefined;
    bottom.push(transform(low));top.push(transform(high));
  }
  return {top,bottom};
}