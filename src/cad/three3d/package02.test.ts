import { describe, expect, it, vi } from "vitest";
import { deriveScene3D, applyGenericTilt } from "./geometryDerivation";
import { frameForCardinal, genericVertex, projectionCos, scaleAcrossAxis } from "./tiltGeometry";
import { deriveInfoBox, infoBoxDimensions } from "./infoBoxGeometry";
import { deriveOpening } from "./openingGeometry";
import { DEFAULT_MATERIAL } from "./materials";
import { copyObjectMeta, attachObjectMeta, restoreObjectMeta, sceneObjectCounts } from "../objectMeta";
import { findObject, selectInCad, setObjectMaterial, setOpeningState, deriveFromApp, clearCadSelection } from "./projectBridge";
import { infoBoxUi } from "@/lib/infoBoxUi";
import { Scene } from "../Scene";
import { restoreOneScene } from "../sceneSerde";

const square=[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}];
const sheet={id:"s",name:"EG",elevationM:3} as any;
const wall={id:"w",corners:[{x:0,y:0},{x:5,y:0}],thicknessM:0.3,heightM:3,referenceSide:"center",elevationM:0.2};
const door={id:"d",kind:"door",wallId:"w",posM:2,widthM:1,heightM:2.1,breakHeightM:0,side:"inner",hand:"left",edge:"center",jambEnabled:true,jambLenM:0.06,jambColor:"#eeeeee",color:"#123456",sashEnabled:true};
function appFor(scene:any){return {scene,activeSheetId:"s",scenesById:new Map([["s",scene]]),sheetManager:{list:()=>[sheet],getById:()=>sheet},labelManager:{isEditable:()=>true,isVisible:()=>true,list:()=>[]},getLibraryDefinition:()=>null,runAction:vi.fn((fn:()=>unknown)=>fn()),setSelection:vi.fn(),clearSelection:vi.fn(),setActiveSheetId:vi.fn()} as any;}

describe("Paket 02",()=>{
  it.each([90,-90])("stellt sämtliche Neigungsformen bei %s° endlich und senkrecht auf",angle=>{
    const frame=frameForCardinal(square,"bottom",angle,0).frame;
    expect(frame).toBeDefined();if(!frame)return;
    for(const settings of [{basis:"plan"},{basis:"actual",projDeg:0},{mode:"lift"},{plumb:true,anchor:"top"},{plumb:true,anchor:"bottom"}] as const){
      const v=genericVertex(0,2,0,frame,{...settings,angleDeg:angle},0.2);
      expect(v.y).toBeCloseTo(0,8);expect(Math.abs(v.z)).toBeCloseTo(2,8);expect(Object.values(v).every(Number.isFinite)).toBe(true);
    }
  });
  it("behält die reale Ausdehnung bei 90° und stellt die 2D-Punkte reversibel zurück",()=>{
    const f=frameForCardinal(square,"bottom",90,0).frame;if(!f)throw Error();
    const projected=scaleAcrossAxis(square,f,projectionCos(90));
    const restored=scaleAcrossAxis(projected,f,1/projectionCos(90));
    restored.forEach((p,i)=>{expect(p.x).toBeCloseTo(square[i].x,7);expect(p.y).toBeCloseTo(square[i].y,7);});
    const v=genericVertex(projected[2].x,projected[2].y,0,f,{angleDeg:90,basis:"actual"},0);
    expect(v.z).toBeCloseTo(2,7);
  });
  it("erhält Bildinhalt und UV-Koordinaten beim Neigen",()=>{
    const item:any={type:"plane",source:"document",sourceId:"pic",sheetId:"s",outline:square,holes:[],z:0,color:"#ffffff",texture:{list:"documents"}};
    const [d]=applyGenericTilt({tilt3D:{cardinal:"bottom",angleDeg:90,basis:"actual",projDeg:0}},[item],0);
    expect(d.type).toBe("mesh");expect(d.texture?.list).toBe("documents");expect(d.uvs).toHaveLength(8);
    if(d.type==='mesh')expect(d.mesh.positions[8]).toBeCloseTo(2);
  });
  it("Infobox schwebt vertikal, ist größer/dicker und enthält eine Inhaltsfläche",()=>{
    const [body,face]=deriveInfoBox({id:"i",x:1,y:2,sizeM:0.5,title:"Baustelle"},"s",3);
    expect(infoBoxDimensions({sizeM:0.5})).toEqual({width:0.8,height:0.8,thickness:0.06,elevation:0.15});
    expect(body.type).toBe("prism");if(body.type==='prism'){expect(body.z0).toBe(3.15);expect(body.z1).toBeCloseTo(3.95);}
    expect(face.texture?.list).toBe("infoBoxes");expect(face.uvs).toHaveLength(8);
  });
  it("Türmaße folgen Laibung, Wandhöhenlage und Öffnungshöhe; geschlossen ist Standard",()=>{
    const parts=deriveOpening(door,wall,"s",3);
    expect(parts.filter(p=>p.part==='frame')).toHaveLength(3);
    const leaf=parts.find(p=>p.part==='leaf');expect(leaf?.type).toBe('prism');
    if(leaf?.type==='prism'){expect(leaf.z0).toBeCloseTo(3.2);expect(leaf.z1).toBeCloseTo(5.24);expect(Math.max(...leaf.footprint.map(p=>p.x))-Math.min(...leaf.footprint.map(p=>p.x))).toBeCloseTo(0.88);}
    const open=deriveOpening({...door,open3D:true},wall,"s",3).find(p=>p.part==='leaf');
    if(open?.type==='prism')expect(Math.max(...open.footprint.map(p=>p.y))-Math.min(...open.footprint.map(p=>p.y))).toBeCloseTo(0.88);
  });
  it("Fenster hat Rahmen und transparentes Glas auf Brüstungshöhe",()=>{
    const parts=deriveOpening({...door,kind:'window',breakHeightM:0.9,heightM:1.2},wall,'s',3);
    expect(parts.filter(p=>p.part==='frame')).toHaveLength(4);
    const glass=parts.find(p=>p.part==='glass');expect(glass?.surfaceOpacity).toBe(0.25);
    if(glass?.type==='prism')expect(glass.z0).toBeCloseTo(4.16);
  });
  it("Materialien, Öffnungszustand und Infoboxmaße überstehen Serialisierung und Kopie",()=>{
    const scene=new Scene();const box:any=scene.createInfoBox({id:'i',x:0,y:0});
    Object.assign(box,{material3D:{...DEFAULT_MATERIAL,id:'m',name:'Stein',imageFileId:'f',scaleM:2,opacity:0.6,emissiveIntensity:2},frameMaterial3D:{...DEFAULT_MATERIAL,id:'frame',name:'Rahmen'},open3D:true,size3DM:1.2,thickness3DM:0.08,elevationM:0,bodyHeightM:1.4});
    const serialized:any={infoBoxes:[{id:'i',x:0,y:0}]};attachObjectMeta(serialized,scene);
    const loaded=new Scene();restoreOneScene(loaded,serialized);
    const copy=copyObjectMeta(loaded.infoBoxes[0],{withCode:false});
    expect(copy.material3D).toEqual(box.material3D);expect(copy.frameMaterial3D?.name).toBe('Rahmen');expect(copy.open3D).toBe(true);expect(copy.size3DM).toBe(1.2);expect(copy.thickness3DM).toBe(0.08);expect(copy.elevationM).toBe(0);expect(copy.bodyHeightM).toBe(1.4);
  });
  it("Materialzuordnung und Öffnen ergeben genau eine Handlung; gesperrte Ebene bleibt unverändert",()=>{
    const sc={doors:[{...door,labelId:'L'}]};const app=appFor(sc);
    expect(setObjectMaterial(app,'s','d',{...DEFAULT_MATERIAL,id:'m',name:'Holz'})).toBe(true);expect(app.runAction).toHaveBeenCalledTimes(1);
    expect(setOpeningState(app,'s','d',true)).toBe(true);expect(app.runAction).toHaveBeenCalledTimes(2);expect(sc.doors[0].open3D).toBe(true);
    app.labelManager.isEditable=()=>false;expect(setOpeningState(app,'s','d',false)).toBe(false);expect(app.runAction).toHaveBeenCalledTimes(2);
  });
  it("Bilder und Infoboxen sind auswählbar, Leerklick löscht beide Auswahlen",()=>{
    const app=appFor({documents:[{id:'image'}],infoBoxes:[{id:'i'}]});
    selectInCad(app,'s','image');expect(app.setSelection).toHaveBeenCalledWith(expect.objectContaining({documentId:'image'}));
    selectInCad(app,'s','i');expect(infoBoxUi.get().selectedId).toBe('i');clearCadSelection(app);expect(infoBoxUi.get().selectedId).toBe(null);
  });
  it("Bibliothekskörper folgen den Vektoren statt einem Rechteckblock und der richtigen Blatthöhe",()=>{
    const li={id:'li',definitionId:'def',position:{x:2,y:4},scaleX:1,scaleY:1,rotationRad:0,elevationM:0.5};
    const app=appFor({libraryInstances:[li]});app.getLibraryDefinition=()=>({geometry:[{kind:'hatch',data:{points:[{x:0,y:0},{x:1,y:0},{x:0,y:1}],heightM:0.2}}]});
    const [d]=deriveFromApp(app).items;expect(d.sourceId).toBe('li');expect(d.sheetId).toBe('s');
    if(d.type==='prism'){expect(d.footprint).toHaveLength(3);expect(d.z0).toBeCloseTo(3.5);}else throw Error('Expected prism');
  });
});