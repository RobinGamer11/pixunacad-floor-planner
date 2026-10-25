import { describe, expect, it } from "vitest";
import { CadApp } from "../CadApp";
import { Scene } from "../Scene";
import { attachObjectMeta, copyObjectMeta, restoreObjectMeta, sceneObjectCounts } from "../objectMeta";
import { beginManualMove, commitManualMove, previewManualMove } from "./manualMoveSession";
import { deriveFromApp } from "./projectBridge";
import { enter3DEditor } from "./manualMoveState";
import { ZERO_MOVE, moveMatrix, posePiece } from "./spatialTransform";
import { Vector3 } from "three";

function makeApp() {
  const scenes=new Map<string,Scene>([["a",new Scene()],["b",new Scene()]]);
  const sheets=[{id:"a",name:"A",elevationM:0,participatesIn3D:true},{id:"b",name:"B",elevationM:4,participatesIn3D:true}];
  const app:any=Object.assign(Object.create(CadApp.prototype),{
    activeSheetId:"a",scenesById:scenes,scene:scenes.get("a"),
    sheetManager:{list:()=>sheets,getById:(id:string)=>sheets.find(s=>s.id===id)},
    labelManager:{list:()=>[],isVisible:()=>true,isEditable:()=>true},renderer:{render:()=>{}},
    _history:[],_historyIndex:0,_historyMax:21,_lastSnapshot:"",_actionDepth:0,_actionPrevSuspend:false,_actionStartSnapshot:null,
    _isRestoring:false,_destroyed:false,suspendHistory:false,contentRevision:0,input:{mouse:{},isPanning:false},
    selectTool:{isEditing:()=>false},documentTool:{},stairTool:{undoStep:()=>false},activeTool:null,
    _serializeScene:()=>JSON.stringify([...scenes].map(([id,s])=>[id,Object.fromEntries(["hatches","walls","doors","segments"].map(k=>[k,(s as any)[k]]))])),
    _restoreScene:(raw:string)=>{for(const [id,data] of JSON.parse(raw))Object.assign(scenes.get(id),data);},
    _emitHistoryChange:()=>{},
  });
  return {app,scenes,init:()=>{app._lastSnapshot=app._serializeScene();app._history=[app._lastSnapshot];}};
}
function hatch(id:string,x=0){return {id,labelId:"l",points:[{x,y:0},{x:x+2,y:0},{x:x+2,y:1},{x,y:1}],holes:[],heightM:1,elevationM:0};}
describe("Manuell bewegen: echte CAD-Objekte und gemeinsame Historie",()=>{
  it("Vorschau mutiert weder Punkte noch Verlauf; Loslassen benötigt keinen Commit",()=>{
    const {app,scenes,init}=makeApp();scenes.get("a")?.hatches.push(hatch("h") as any);init();const before=app._serializeScene();
    const s=beginManualMove(app,[{sheetId:"a",id:"h"}]);s.delta={...ZERO_MOVE,x:3,z:2};
    const first=previewManualMove(app,s);expect(first.length).toBeGreaterThan(0);expect(previewManualMove(app,s)).toEqual(first);
    expect(app._serializeScene()).toBe(before);expect(app._history).toHaveLength(1);expect(app.contentRevision).toBe(0);
  });
  it("blattübergreifende Gruppe: gleicher Weltversatz, ein Undo und vollständiges Redo",()=>{
    const {app,scenes,init}=makeApp();scenes.get("a")?.hatches.push(hatch("h") as any);scenes.get("b")?.hatches.push(hatch("j",5) as any);init();const before=app._serializeScene();
    const s=beginManualMove(app,[{sheetId:"a",id:"h"},{sheetId:"b",id:"j"}]);s.delta={...ZERO_MOVE,x:3,y:-2,z:2};expect(commitManualMove(app,s)).toBe(true);
    expect(scenes.get("a")?.hatches[0].points[0]).toEqual({x:3,y:-2});expect((scenes.get("b")?.hatches[0] as any).elevationM).toBe(2);expect(app.activeSheetId).toBe("a");expect(app._history).toHaveLength(2);
    const after=app._serializeScene();app.undo();expect(app._serializeScene()).toBe(before);app.redo();expect(app._serializeScene()).toBe(after);
  });
  it("Gruppenrotation erhält gemeinsame Abstände und rotiert gespeicherte Neigungsachsen",()=>{
    const {app,scenes,init}=makeApp();const h:any=hatch("h"),j=hatch("j",4);h.tilt3D={a:{x:0,y:0},b:{x:2,y:0},angleDeg:20,count:4,edgeIndex:0,basis:"actual",opposite:true};scenes.get("a")?.hatches.push(h,j as any);init();
    const s=beginManualMove(app,[{sheetId:"a",id:"h"},{sheetId:"a",id:"j"}]);s.delta={...ZERO_MOVE,rz:90};
    const expected=new Vector3(0,0,0).applyMatrix4(moveMatrix(s.delta,s.pivot));commitManualMove(app,s);
    expect(h.points[0].x).toBeCloseTo(expected.x);expect(h.points[0].y).toBeCloseTo(expected.y);expect(Math.hypot(h.points[0].x-j.points[0].x,h.points[0].y-j.points[0].y)).toBeCloseTo(4);
    expect(h.tilt3D.a.x).toBeCloseTo(expected.x);expect(h.tilt3D.angleDeg).toBe(20);
  });
  it("freie XYZ-Drehungen zusammensetzen statt bestehenden Neigungswinkel überschreiben",()=>{
    const {app,scenes,init}=makeApp();scenes.get("a")?.hatches.push(hatch("h") as any);init();
    const s=beginManualMove(app,[{sheetId:"a",id:"h"}]);s.delta={...ZERO_MOVE,rx:45,ry:30};const preview=previewManualMove(app,s);commitManualMove(app,s);const actual=deriveFromApp(app).items;
    expect(actual[0].type).toBe("mesh");expect(actual).toEqual(preview);expect((scenes.get("a")?.hatches[0] as any).pose3D).toHaveLength(16);
    const next=beginManualMove(app,[{sheetId:"a",id:"h"}]);next.delta={...ZERO_MOVE,ry:-20,z:1};const nextPreview=previewManualMove(app,next);commitManualMove(app,next);expect(deriveFromApp(app).items).toEqual(nextPreview);
  });
  it("Wand und Öffnung nicht doppelt bewegen; Brüstung bleibt wandrelativ",()=>{
    const {app,scenes,init}=makeApp();const sc=scenes.get("a");if(!sc)throw new Error();
    const w:any={id:"w",labelId:"l",corners:[{x:0,y:0},{x:5,y:0}],thicknessM:.2,heightM:3,elevationM:0};const door:any={id:"d",wallId:"w",posM:2,widthM:1,heightM:2,breakHeightM:0,kind:"door",labelId:"l"};sc.walls.push(w);sc.doors.push(door);init();
    const s=beginManualMove(app,[{sheetId:"a",id:"w"},{sheetId:"a",id:"d"}]);s.delta={...ZERO_MOVE,x:2,z:1,rx:20};const preview=previewManualMove(app,s);commitManualMove(app,s);
    expect(w.corners[0].x).toBe(2);expect(w.elevationM).toBe(1);expect(door.posM).toBe(2);expect(door.breakHeightM).toBe(0);expect(deriveFromApp(app).items).toEqual(preview);
  });
  it("unzulässige Öffnungsbewegung nimmt keine Teiländerung vor",()=>{
    const {app,scenes,init}=makeApp();const sc=scenes.get("a");if(!sc)throw new Error();sc.hatches.push(hatch("h") as any);sc.walls.push({id:"w",corners:[{x:0,y:0},{x:5,y:0}],thicknessM:.2,heightM:3} as any);sc.doors.push({id:"d",wallId:"w",posM:2,widthM:1,heightM:2} as any);init();const before=app._serializeScene();
    const s=beginManualMove(app,[{sheetId:"a",id:"h"},{sheetId:"a",id:"d"}]);s.delta={...ZERO_MOVE,y:2};expect(()=>commitManualMove(app,s)).toThrow("entlang der Wand");expect(app._serializeScene()).toBe(before);expect(app._history).toHaveLength(1);
  });
  it("Undo einer Vorschau umgeht lokale 2D-Punktketten ohne ältere Aktion zurückzunehmen",()=>{
    const {app,scenes,init}=makeApp();scenes.get("a")?.hatches.push(hatch("h") as any);init();app.activeTool={pointUndo:()=>{throw new Error("2D tool intercepted");}};
    let draft=true;const leave=enter3DEditor(app,()=>{if(!draft)return false;draft=false;return true;},()=>{});app.undo();expect(draft).toBe(false);expect(app._historyIndex).toBe(0);leave();
  });
  it("Identität erzeugt keinen leeren Undo-Schritt",()=>{
    const {app,scenes,init}=makeApp();scenes.get("a")?.hatches.push(hatch("h") as any);init();expect(commitManualMove(app,beginManualMove(app,[{sheetId:"a",id:"h"}]))).toBe(false);expect(app._history).toHaveLength(1);
  });
  it("räumliche Orientierung überlebt Metadata-Serialisierung/Laden und Kopie",()=>{
    const pose=moveMatrix({...ZERO_MOVE,rx:45},{x:1,y:2,z:3}).toArray();const src={id:"h",pose3D:pose};const out={hatches:[{id:"h"}]};attachObjectMeta(out,{hatches:[src]});const sc={hatches:[{id:"h"}]};restoreObjectMeta(sc,out,{...sceneObjectCounts({}),hatches:0});expect((sc.hatches[0] as any).pose3D).toEqual(pose);expect(copyObjectMeta(src,{withCode:false}).pose3D).toEqual(pose);
  });
});