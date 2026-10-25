/** CAD-space rigid transforms: (x, y, z) = plan X, plan Y, elevation. */
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Derived3D } from "./geometryDerivation";
import { faceMesh, slabMesh } from "./solidMesh";

export type MatrixData = number[];
export type MoveDelta = { x: number; y: number; z: number; rx: number; ry: number; rz: number };
export const ZERO_MOVE: MoveDelta = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
export const CAD_TO_THREE = new Matrix4().set(1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,1);
/** Moving a copied source also moves its orientation frame; no shared mutable matrix. */
export function translatedPose(pose: unknown, dx:number, dy:number): MatrixData|undefined {
  const data=normalizedPose(pose);if(!data)return;
  return new Matrix4().makeTranslation(dx,dy,0).multiply(new Matrix4().fromArray(data)).multiply(new Matrix4().makeTranslation(-dx,-dy,0)).toArray();
}
export function normalizedPose(raw: unknown): MatrixData | undefined {
  if (!Array.isArray(raw) || raw.length !== 16 || !raw.every(v => typeof v === "number" && Number.isFinite(v))) return;
  const m = new Matrix4().fromArray(raw), p = new Vector3(), q = new Quaternion(), s = new Vector3();
  m.decompose(p,q,s);
  const rebuilt=new Matrix4().compose(p,q.normalize(),new Vector3(1,1,1));
  if(rebuilt.elements.some((v,i)=>Math.abs(v-raw[i])>1e-8))return;
  if (Math.abs(m.determinant()-1)>1e-5 || s.distanceTo(new Vector3(1,1,1))>1e-5 || Math.abs(raw[3])+Math.abs(raw[7])+Math.abs(raw[11])+Math.abs(raw[15]-1)>1e-8) return;
  return m.toArray();
}
export function moveMatrix(delta: MoveDelta, pivot: {x:number;y:number;z:number}): Matrix4 {
  const k = Math.PI / 180;
  const rotation = new Matrix4().makeRotationFromEuler(new Euler(delta.rx*k,delta.ry*k,delta.rz*k,"XYZ"));
  return new Matrix4().makeTranslation(pivot.x+delta.x,pivot.y+delta.y,pivot.z+delta.z)
    .multiply(rotation).multiply(new Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
}
export function posePiece(d: Derived3D, matrix: Matrix4): Derived3D {
  const point = (p: {x:number;y:number;z:number}) => { const v = new Vector3(p.x,p.y,p.z).applyMatrix4(matrix); return {x:v.x,y:v.y,z:v.z}; };
  if (d.type === "line") return { ...d, spatialPoints: (d.spatialPoints??d.points.map(p=>({...p,z:d.z}))).map(point) };
  const mesh = d.type === "mesh" ? d.mesh : d.type === "prism" ? slabMesh(d.footprint,d.holes,()=>d.z0,()=>d.z1) : faceMesh(d.outline,d.holes,()=>d.z);
  if (!mesh) return d;
  const positions: number[] = [];
  for (let i=0;i<mesh.positions.length;i+=3) { const v=point({x:mesh.positions[i],y:mesh.positions[i+1],z:mesh.positions[i+2]}); positions.push(v.x,v.y,v.z); }
  let uvs = d.uvs;
  if (!uvs && d.type === "plane" && d.texture && d.outline.length===4) {
    const [a,b,,e]=d.outline, ux=b.x-a.x,uy=b.y-a.y,vx=e.x-a.x,vy=e.y-a.y,det=ux*vy-uy*vx;
    uvs=[];
    for(let i=0;i<mesh.positions.length;i+=3){const x=mesh.positions[i]-a.x,y=mesh.positions[i+1]-a.y;uvs.push((x*vy-y*vx)/det,1-(ux*y-uy*x)/det);}
  }
  const texture=d.texture ? {...d.texture,corners:d.texture.corners ?? (d.type==="plane"?d.outline:undefined)}:undefined;
  const faces=d.type==="mesh"&&d.faces ? Object.fromEntries(Object.entries(d.faces).map(([k,r])=>[k,{outer:r.outer.map(point),holes:r.holes.map(h=>h.map(point))}])) as NonNullable<Extract<Derived3D,{type:"mesh"}>["faces"]> : undefined;
  return {...d,type:"mesh",mesh:{positions,indices:mesh.indices.slice()},closed:d.type==="prism"||(d.type==="mesh"&&d.closed),uvs,texture,faces};
}
export function applySpatialPose(items: Derived3D[], pose: unknown, base: number): Derived3D[] {
  const data=normalizedPose(pose); if(!data)return items;
  const matrix=new Matrix4().makeTranslation(0,0,base).multiply(new Matrix4().fromArray(data)).multiply(new Matrix4().makeTranslation(0,0,-base));
  return items.map(d=>posePiece(d,matrix));
}