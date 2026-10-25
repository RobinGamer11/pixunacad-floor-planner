import { Matrix4, Vector3 } from "three";
import type { CadApp } from "../CadApp";
import { objectElevationM } from "../objectMeta";
import { translateGroup, rotateGroup } from "../groupTransform";
import { pointOnWallAt, wallReferenceLengths } from "../doorGeom";
import { sheetElevationM } from "../SheetManager";
import { deriveProject3D, pieceMesh, type Derived3D } from "./geometryDerivation";
import { applyRelations3D } from "./relations";
import { deriveOpts, findObject, OBJECT_LISTS, deriveFromApp } from "./projectBridge";
import { moveMatrix, ZERO_MOVE, type MoveDelta } from "./spatialTransform";
import type { ObjectRef3D } from "./manualMoveState";

const kinds: Record<string,string> = {walls:"wall",hatches:"hatch",stairs:"stair",documents:"document",textBoxes:"textbox",tables:"table",libraryInstances:"library",segments:"segment",dimensions:"dimension",freeStrokes:"freeStroke",infoBoxes:"infobox",doors:"door"};
export const refKey3D = (r: ObjectRef3D) => `${r.sheetId}::${r.id}`;
export function changedMove(d: MoveDelta) { return Object.values(d).some(v=>Math.abs(v)>1e-9); }
export function editableRef3D(app: CadApp, r: ObjectRef3D) {
  const h=findObject(app,r.sheetId,r.id);return !!h && (!h.obj.labelId || (app.labelManager.isVisible(h.obj.labelId)&&app.labelManager.isEditable(h.obj.labelId)));
}
export interface ManualMoveSession {
  refs: ObjectRef3D[]; pivot: {x:number;y:number;z:number}; delta: MoveDelta;
  baseline: Map<string,string>; revision: number;
}
export function beginManualMove(app: CadApp, refs: ObjectRef3D[], items=deriveFromApp(app).items): ManualMoveSession {
  const unique=refs.filter((r,i)=>refs.findIndex(a=>refKey3D(a)===refKey3D(r))===i);
  if(!unique.length||unique.some(r=>!editableRef3D(app,r)))throw new Error("Bitte sichtbare, entsperrte Objekte auswählen.");
  const keys=new Set(unique.map(refKey3D)), points:number[][]=[];
  for(const d of items)if(keys.has(`${d.sheetId}::${d.sourceId}`)) {
    if(d.spatialPoints)for(const p of d.spatialPoints)points.push([p.x,p.y,p.z]);
    else {const m=pieceMesh(d);if(m)for(let i=0;i<m.positions.length;i+=3)points.push(m.positions.slice(i,i+3));}
  }
  if(!points.length)throw new Error("Keine räumliche Geometrie für die Auswahl.");
  const center=(i:number)=>(Math.min(...points.map(p=>p[i]))+Math.max(...points.map(p=>p[i])))/2;
  const baseline=new Map(unique.map(r=>[refKey3D(r),JSON.stringify(findObject(app,r.sheetId,r.id)?.obj)]));
  return {refs:unique,pivot:{x:center(0),y:center(1),z:center(2)},delta:{...ZERO_MOVE},baseline,revision:app.contentRevision};
}
function sceneFor(app: CadApp,id:string) { return app.resolveCollabScene(id); }
function transformSources(app: CadApp, session: ManualMoveSession, sceneOf: (id:string)=>any) {
  const d=session.delta;
  if(!Object.values(d).every(Number.isFinite))throw new Error("Bitte gültige Zahlen eingeben.");
  const selected=new Set(session.refs.map(refKey3D));
  const world=moveMatrix(d,session.pivot);
  const planar=moveMatrix({...ZERO_MOVE,x:d.x,y:d.y,z:d.z,rz:d.rz},session.pivot);
  for(const ref of session.refs) {
    const sc=sceneOf(ref.sheetId), hit=OBJECT_LISTS.map(list=>({list,obj:sc?.[list]?.find((o:any)=>o.id===ref.id)})).find(h=>h.obj);
    if(!hit)throw new Error("Ein ausgewähltes Objekt fehlt.");
    const o=hit.obj, base=sheetElevationM(app.sheetManager.getById(ref.sheetId));
    if(hit.list==="doors") {
      if(selected.has(`${ref.sheetId}::${o.wallId}`))continue;
      const wall=sc.walls.find((w:any)=>w.id===o.wallId), at=wall&&pointOnWallAt(wall,o.posM);
      if(!at)throw new Error("Die zugehörige Wand fehlt.");
      if(d.rx||d.ry||d.rz||wall.pose3D||wall.tilt3D)throw new Error("Diese Öffnung nur gemeinsam mit ihrer Wand räumlich drehen.");
      const normal=d.x*at.n.x+d.y*at.n.y;
      if(Math.abs(normal)>1e-5)throw new Error("Tür/Fenster kann nur entlang der Wand und in der Höhe bewegt werden.");
      const next=o.posM+d.x*at.t.x+d.y*at.t.y,total=wallReferenceLengths(wall).total;
      if(next-o.widthM/2<0||next+o.widthM/2>total)throw new Error("Die Öffnung muss innerhalb ihrer Wand bleiben.");
      o.posM=next;o.breakHeightM=(Number(o.breakHeightM)||0)+d.z;continue;
    }
    const oldPose=new Matrix4().makeTranslation(0,0,base).multiply(o.pose3D?new Matrix4().fromArray(o.pose3D):new Matrix4()).multiply(new Matrix4().makeTranslation(0,0,-base));
    const facade={scene:sc}, refs=[{kind:kinds[hit.list],id:ref.id}];
    rotateGroup(facade,refs,d.rz*Math.PI/180,session.pivot);
    translateGroup(facade,refs,d.x,d.y);
    o.elevationM=objectElevationM(o)+d.z;
    if(o.tilt3D) {
      const m=moveMatrix({...ZERO_MOVE,x:d.x,y:d.y,rz:d.rz},{...session.pivot,z:0});
      for(const key of ["a","b"]){const p=o.tilt3D[key];if(p){const v=new Vector3(p.x,p.y,0).applyMatrix4(m);p.x=v.x;p.y=v.y;}}
      if(d.rz)delete o.tilt3D.cardinal;
    }
    const residual=new Matrix4().makeTranslation(0,0,-base).multiply(world).multiply(oldPose).multiply(planar.clone().invert()).multiply(new Matrix4().makeTranslation(0,0,base));
    if(residual.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-8))delete o.pose3D;else o.pose3D=residual.toArray();
  }
}
export function previewManualMove(app: CadApp, session: ManualMoveSession): Derived3D[] {
  const scenes=new Map<string,any>();
  for(const sheet of app.sheetManager.list()) {
    const src=sceneFor(app,sheet.id);if(!src)continue;
    const clone=Object.assign(Object.create(Object.getPrototypeOf(src)),src);
    for(const key of OBJECT_LISTS)clone[key]=(src as any)[key]?.map((o:any)=>Object.assign(Object.create(Object.getPrototypeOf(o)),JSON.parse(JSON.stringify(o))))??[];
    scenes.set(sheet.id,clone);
  }
  transformSources(app,session,id=>scenes.get(id));
  const raw=deriveProject3D(app.sheetManager.list(),id=>scenes.get(id),deriveOpts(app));
  const sources:any[]=[];for(const [sheetId,sc]of scenes)for(const key of OBJECT_LISTS)for(const o of sc[key]||[])if(o.relations3D?.length)sources.push({sheetId,id:o.id,relations3D:o.relations3D});
  return applyRelations3D(raw,sources).items;
}
export function commitManualMove(app: CadApp, session: ManualMoveSession): boolean {
  if(!changedMove(session.delta))return false;
  if(session.refs.some(r=>!editableRef3D(app,r)||JSON.stringify(findObject(app,r.sheetId,r.id)?.obj)!==session.baseline.get(refKey3D(r))))throw new Error("Die Auswahl wurde zwischenzeitlich geändert. Bitte neu beginnen.");
  previewManualMove(app,session); // validate all members before mutating any source
  const ok=app.runAction(()=>{transformSources(app,session,id=>sceneFor(app,id));return true;});
  if(!ok)throw new Error("Bewegung konnte nicht übernommen werden; alle Änderungen wurden zurückgenommen.");
  app.renderer?.render();return true;
}