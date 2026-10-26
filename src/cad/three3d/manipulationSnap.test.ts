import { describe, expect, it } from "vitest";
import { DEFAULT_SNAP_3D, normalizeSnapSettings, snapAxisMove, snapRotationAngle, spatialFeatures } from "./manipulationSnap";
import { ZERO_MOVE } from "./spatialTransform";
const p={x:0,y:0,z:0}, settings={...DEFAULT_SNAP_3D,grid:false};
describe("3D world-axis snapping",()=>{
  it("snaps a contact without changing the two other axes or rotation",()=>{
    const delta={...ZERO_MOVE,x:1.96,y:3,z:4,rz:20};
    const result=snapAxisMove(delta,"x",p,[p],{points:[{x:2,y:3,z:4}],edges:[]},settings,.1,null);
    expect(result.delta).toEqual({...delta,x:2});expect(result.contact?.kind).toBe("point");
  });
  it("retains then releases a contact with hysteresis",()=>{
    const target={points:[{x:2,y:0,z:0}],edges:[]};
    const first=snapAxisMove({...ZERO_MOVE,x:1.96},"x",p,[p],target,settings,.1,null);
    expect(snapAxisMove({...ZERO_MOVE,x:2.14},"x",p,[p],target,settings,.1,first.contact).delta.x).toBe(2);
    expect(snapAxisMove({...ZERO_MOVE,x:2.18},"x",p,[p],target,settings,.1,first.contact).delta.x).toBe(2.18);
  });
  it("catches an edge contact between its vertices",()=>{
    const result=snapAxisMove({...ZERO_MOVE,x:1.95,y:1},"x",p,[p],{points:[],edges:[[{x:2,y:0,z:0},{x:2,y:2,z:0}]]},settings,.1,null);
    expect(result.delta.x).toBe(2);expect(result.contact?.target).toEqual({x:2,y:1,z:0});
  });
  it("does not attract an object on a different height",()=>{
    expect(snapAxisMove({...ZERO_MOVE,x:1.98},"x",p,[p],{points:[{x:2,y:0,z:1}],edges:[]},settings,.1,null).contact).toBeNull();
  });
  it("snaps a world coordinate to the local helper grid only near a line",()=>{
    const result=snapAxisMove({...ZERO_MOVE,x:.295},"x",{x:.2,y:0,z:0},[],{points:[],edges:[]},DEFAULT_SNAP_3D,.03,null);
    expect(result.delta.x).toBeCloseTo(.3);expect(result.contact?.kind).toBe("grid");
  });
  it("disabled snapping leaves all values untouched",()=>{
    const delta={...ZERO_MOVE,x:1.99};expect(snapAxisMove(delta,"x",p,[p],{points:[{x:2,y:0,z:0}],edges:[]},{...settings,enabled:false},.1,null).delta).toBe(delta);
  });
  it("catches 15 degree rotation, keeps a free angle and releases hysteresis",()=>{
    expect(snapRotationAngle(29,15,null)).toEqual({angle:30,contact:30});
    expect(snapRotationAngle(26,15,null).angle).toBe(26);
    expect(snapRotationAngle(32.5,15,30).angle).toBe(30);
    expect(snapRotationAngle(33.5,15,30).angle).toBe(33.5);
  });
  it("extracts 12 physical cube edges without triangulation diagonals",()=>{
    const features=spatialFeatures([{type:"prism",source:"wall",sourceId:"w",sheetId:"s",footprint:[{x:0,y:0},{x:2,y:0},{x:2,y:1},{x:0,y:1}],holes:[],z0:0,z1:3,color:"#ffffff"}]);
    expect(features.edges).toHaveLength(12);expect(features.points).toHaveLength(8);
  });
  it("validates local controls without permitting scaling or invalid intervals",()=>{
    expect(normalizeSnapSettings({stepM:0,angleDeg:Infinity,size:3})).toEqual({...DEFAULT_SNAP_3D,stepM:.001,size:2});
  });
});import { faceContacts, restingLevel } from "./manipulationSnap";
describe("contact helper grid",()=>{
  const m={x0:0,x1:1,y0:0,y1:1,z0:1,z1:2};
  it("detects a body resting on top of another",()=>{expect(faceContacts(m,[{x0:0,x1:2,y0:0,y1:2,z0:0,z1:1}])[0]).toMatchObject({axis:"z",at:1});});
  it("detects a side contact and ignores distant bodies",()=>{
    expect(faceContacts(m,[{x0:1,x1:2,y0:0,y1:1,z0:1,z1:2}])[0]).toMatchObject({axis:"x",at:1});
    expect(faceContacts(m,[{x0:3,x1:4,y0:0,y1:1,z0:1,z1:2}])).toHaveLength(0);
  });
  it("rests on a sheet at exactly 0,00 m above it, preferring the sheet over the ground",()=>{
    const levels=[{z:1,label:"Seite 2"},{z:0,label:"Seite 1"},{z:0,label:"3D-Oberfläche"}];
    expect(restingLevel(m,levels)?.label).toBe("Seite 2");
    expect(restingLevel({...m,z0:0},levels)?.label).toBe("Seite 1");
    expect(restingLevel({...m,z0:.3},levels)).toBeNull();
  });
});
