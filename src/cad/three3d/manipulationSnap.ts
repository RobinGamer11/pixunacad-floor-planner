/** Transient, axis-constrained snapping. No source writes or persisted contacts. */
import { BufferGeometry, EdgesGeometry, Float32BufferAttribute, Vector3 } from "three";
import { pieceMesh, type Derived3D } from "./geometryDerivation";
import { moveMatrix, type MoveDelta } from "./spatialTransform";
import type { Vec3 } from "./solidMesh";

export type WorldAxis = "x" | "y" | "z";
export interface SnapSettings3D { enabled: boolean; grid: boolean; stepM: number; angleDeg: number; size: number }
export const DEFAULT_SNAP_3D: SnapSettings3D = { enabled: true, grid: true, stepM: .1, angleDeg: 45, size: 1.15 };
export function normalizeSnapSettings(raw: Partial<SnapSettings3D> | null): SnapSettings3D {
  const num = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return { enabled: typeof raw?.enabled === "boolean" ? raw.enabled : true, grid: typeof raw?.grid === "boolean" ? raw.grid : true,
    stepM: num(raw?.stepM, .1, .001, 10), angleDeg: num(raw?.angleDeg, 45, 1, 90), size: num(raw?.size, 1.15, .5, 2) };
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
export interface Box3 { x0:number;x1:number;y0:number;y1:number;z0:number;z1:number }
export function boxOf(points: Vec3[]): Box3|null {
  if(!points.length)return null;
  const b={x0:Infinity,x1:-Infinity,y0:Infinity,y1:-Infinity,z0:Infinity,z1:-Infinity};
  for(const p of points){b.x0=Math.min(b.x0,p.x);b.x1=Math.max(b.x1,p.x);b.y0=Math.min(b.y0,p.y);b.y1=Math.max(b.y1,p.y);b.z0=Math.min(b.z0,p.z);b.z1=Math.max(b.z1,p.z);}
  return b;
}
/** Face contact of the moving box with another body: plane axis and coordinate. */
export interface FaceContact { axis: WorldAxis; at: number; box: Box3 }
export function faceContacts(moving: Box3, others: Box3[], eps=.01): FaceContact[] {
  const out: FaceContact[]=[], ov=(a0:number,a1:number,b0:number,b1:number)=>Math.min(a1,b1)-Math.max(a0,b0)>-eps;
  const strict=(a0:number,a1:number,b0:number,b1:number)=>Math.min(a1,b1)-Math.max(a0,b0)>eps;
  for(const o of others){
    const ox=strict(moving.x0,moving.x1,o.x0,o.x1),oy=strict(moving.y0,moving.y1,o.y0,o.y1),oz=strict(moving.z0,moving.z1,o.z0,o.z1);
    void ov;
    if(ox&&oy)for(const at of [o.z1,o.z0])if(Math.abs(moving.z0-at)<eps||Math.abs(moving.z1-at)<eps){out.push({axis:"z",at,box:moving});break;}
    if(oy&&oz)for(const at of [o.x1,o.x0])if(Math.abs(moving.x0-at)<eps||Math.abs(moving.x1-at)<eps){out.push({axis:"x",at,box:moving});break;}
    if(ox&&oz)for(const at of [o.y1,o.y0])if(Math.abs(moving.y0-at)<eps||Math.abs(moving.y1-at)<eps){out.push({axis:"y",at,box:moving});break;}
  }
  return out;
}
/** Level (sheet or 3D ground) on which the moving body rests; earlier entries (sheets) win at equal height. */
export function restingLevel<T extends {z:number}>(moving: Box3, levels: T[], eps=.005): T|null {
  return levels.find(l=>Math.abs(moving.z0-l.z)<eps)??null;
}
