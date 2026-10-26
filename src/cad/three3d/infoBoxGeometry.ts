import type { Derived3D } from "./geometryDerivation";
import { objectElevationM } from "../objectMeta";

interface InfoBoxShape { id?: string; x?: number; y?: number; sizeM?: number; size3DM?: number; bodyHeightM?: number; thickness3DM?: number; elevationM?: number; kind?: string; status?: string }
export function infoBoxDimensions(box: InfoBoxShape) {
  const width = typeof box.size3DM === "number" && Number.isFinite(box.size3DM) && box.size3DM > 0 ? box.size3DM : Math.max(0.8, (box.sizeM || 0.5) * 1.6);
  const height = typeof box.bodyHeightM === "number" && Number.isFinite(box.bodyHeightM) && box.bodyHeightM > 0 ? box.bodyHeightM : width;
  const thickness = typeof box.thickness3DM === "number" && Number.isFinite(box.thickness3DM) && box.thickness3DM > 0 ? box.thickness3DM : 0.06;
  const elevation = typeof box.elevationM === "number" ? objectElevationM(box) : 0.15;
  return { width, height, thickness, elevation };
}

/** Gedämpfte Farben wie die 2D-Pins: Information beige, Aufgabe offen koralle, erledigt salbei. */
export function infoBoxTone(box: { kind?: string; status?: string }) {
  if (box.kind === "task") return box.status === "done"
    ? { accent: "#6fae84", body: "#dbe9df" }
    : { accent: "#d9857c", body: "#f1dedb" };
  return { accent: "#c2a77f", body: "#ede6da" };
}

export function deriveInfoBox(box: InfoBoxShape & {id:string;x:number;y:number;title?:string}, sheetId: string, base: number): Derived3D[] {
  const { width, height, thickness, elevation } = infoBoxDimensions(box);
  const z = base + elevation;
  const outline = [{x:box.x-width/2,y:box.y-thickness/2},{x:box.x+width/2,y:box.y-thickness/2},{x:box.x+width/2,y:box.y+thickness/2},{x:box.x-width/2,y:box.y+thickness/2}];
  const body: Derived3D = { type:"prism", source:"infobox", sourceId:box.id, sheetId, footprint:outline, holes:[], z0:z, z1:z+height, color:infoBoxTone(box).body, glow:0.12 };
  // Vertical front quad with ordinary UVs, independent of the ground projection.
  const front: Derived3D = { type:"mesh", source:"infobox", sourceId:box.id, sheetId, closed:false, color:"#ffffff", mesh:{ positions:[box.x-width/2,box.y+thickness/2+0.001,z+height,box.x+width/2,box.y+thickness/2+0.001,z+height,box.x+width/2,box.y+thickness/2+0.001,z,box.x-width/2,box.y+thickness/2+0.001,z],indices:[0,1,2,0,2,3] }, texture:{list:"infoBoxes",corners:[]}, uvs:[0,1,1,1,1,0,0,0], glow:0.35 };
  return [body, front];
}