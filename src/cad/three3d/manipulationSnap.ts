/** Transient, axis-constrained snapping. No source writes or persisted contacts. */
import { BufferGeometry, EdgesGeometry, Float32BufferAttribute, Vector3 } from "three";
import { pieceMesh, type Derived3D } from "./geometryDerivation";
import { moveMatrix, type MoveDelta } from "./spatialTransform";
import type { Vec3 } from "./solidMesh";

export type WorldAxis = "x" | "y" | "z";
export interface SnapSettings3D { enabled: boolean; grid: boolean; stepM: number; angleDeg: number; size: number }
export const DEFAULT_SNAP_3D: SnapSettings3D = { enabled: true, grid: true, stepM: .1, angleDeg: 15, size: 1.15 };
export function normalizeSnapSettings(raw: Partial<SnapSettings3D> | null): SnapSettings3D {
  const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return { enabled: typeof raw?.enabled === "boolean" ? raw.enabled : true, grid: typeof raw?.grid === "boolean" ? raw.grid : true,
    stepM: num(raw?.stepM, .1, .001, 10), angleDeg: num(raw?.angleDeg, 15, 1, 90), size: num(raw?.size, 1.15, .5, 2) };
}
export interface SpatialFeatures { points: Vec3[]; edges: [Vec3, Vec3][] }
/** Sharp mesh edges, never triangulation diagonals or hypothetical bounding-box edges. */
export function spatialFeatures(items: Derived3D[]): SpatialFeatures {
  const points = new Map<string, Vec3>(), edges: [Vec3, Vec3][] = [];
  const add = (p: Vec3) => { const key = [p.x,p.y,p.z].map(v=>Math.round(v*1e5)).join(":"); points.set(key,p); };
  for (const d of items) {
    if (d.type === "line") {
      const ps = d.spatialPoints ?? d.points.map(p=>({...p,z:d.z}));
      ps.forEach(add); for(let i=1;i<ps.length;i++)edges.push([ps[i-1],ps[i]]); continue;
    }
    const m = pieceMesh(d); if (!m) continue;
    const geo = new BufferGeometry(); geo.setAttribute("position", new Float32BufferAttribute(m.positions,3)); geo.setIndex(m.indices);
    const boundary = new EdgesGeometry(geo, 20), p = boundary.getAttribute("position");
    for(let i=0;i+1<p.count;i+=2){ const a={x:p.getX(i),y:p.getY(i),z:p.getZ(i)}, b={x:p.getX(i+1),y:p.getY(i+1),z:p.getZ(i+1)};add(a);add(b);edges.push([a,b]); }
    boundary.dispose();geo.dispose();
  }
  return {points:[...points.values()],edges};
}
export interface SnapContact { key: string; value: number; moving: Vec3; target: Vec3; kind: "point"|"edge"|"grid" }
const distance = (a: Vec3,b: Vec3) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
/** Only the dragged world axis changes; retained contacts release at 1.6× acquisition tolerance. */
export function snapAxisMove(delta: MoveDelta, axis: WorldAxis, pivot: Vec3, moving: Vec3[], targets: SpatialFeatures,
  settings: SnapSettings3D, tolerance: number, previous: SnapContact | null): {delta: MoveDelta; contact: SnapContact|null} {
  if (!settings.enabled) return {delta,contact:null};
  const matrix=moveMatrix({...delta,[axis]:0},pivot);
  const sources=moving.map(p=>{const v=new Vector3(p.x,p.y,p.z).applyMatrix4(matrix);return {x:v.x,y:v.y,z:v.z};});
  if(previous&&Math.abs(delta[axis]-previous.value)<=tolerance*1.6)return {delta:{...delta,[axis]:previous.value},contact:previous};
  let best: SnapContact|null=null, score=tolerance;
  const consider=(source:Vec3,target:Vec3,key:string,kind:SnapContact["kind"])=>{
    const value=target[axis]-source[axis], shifted={...source,[axis]:source[axis]+delta[axis]};
    const off={...shifted,[axis]:target[axis]};
    const miss=distance(off,target), gap=Math.abs(value-delta[axis]);
    if(miss>tolerance||gap>=score)return;
    score=gap;best={key,value,moving:{...source,[axis]:target[axis]},target,kind};
  };
  sources.forEach((source,i)=>{
    targets.points.forEach((target,j)=>consider(source,target,`p:${i}:${j}`,"point"));
    targets.edges.forEach(([a,b],j)=>{
      const others=(["x","y","z"] as const).filter(k=>k!==axis);
      const den=others.reduce((s,k)=>s+(b[k]-a[k])**2,0);
      const t=den>1e-12?Math.max(0,Math.min(1,others.reduce((s,k)=>s+(source[k]-a[k])*(b[k]-a[k]),0)/den)):0;
      consider(source,{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},`e:${i}:${j}`,"edge");
    });
  });
  if(best)return {delta:{...delta,[axis]:best.value},contact:best};
  const absolute=pivot[axis]+delta[axis], rounded=Math.round(absolute/settings.stepM)*settings.stepM;
  // Helper grid catches generously (but never more than 40 % of a step, so free values stay reachable).
  if(settings.grid&&Math.abs(rounded-absolute)<=Math.min(tolerance*2,settings.stepM*.4)){
    const target={x:pivot.x+delta.x,y:pivot.y+delta.y,z:pivot.z+delta.z,[axis]:rounded};
    const contact:SnapContact={key:`g:${axis}:${rounded}`,value:rounded-pivot[axis],moving:target,target,kind:"grid"};
    return {delta:{...delta,[axis]:contact.value},contact};
  }
  return {delta,contact:null};
}
export function snapRotationAngle(angle:number,step:number,previous:number|null): {angle:number; contact:number|null} {
  const tolerance=Math.min(2,step*.2);
  if(previous!==null&&Math.abs(angle-previous)<=tolerance*1.6)return {angle:previous,contact:previous};
  const nearest=Math.round(angle/step)*step;
  return Math.abs(angle-nearest)<=tolerance?{angle:nearest,contact:nearest}:{angle,contact:null};
}