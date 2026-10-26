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

/** Circular body in the vertical plane; height/width preserve existing size settings. */
export function infoBoxPinOutline(width: number, height: number, seg = 10): { u: number; v: number }[] {
  return Array.from({length: Math.max(32, seg * 8)}, (_, i) => {
    const a = i * Math.PI * 2 / Math.max(32, seg * 8);
    return {u: Math.cos(a) * width / 2, v: height / 2 + Math.sin(a) * height / 2};
  });
}

export function deriveInfoBox(box: InfoBoxShape & {id:string;x:number;y:number;title?:string}, sheetId: string, base: number): Derived3D[] {
  const { width, height, thickness, elevation } = infoBoxDimensions(box);
  const z = base + elevation;
  const ring = infoBoxPinOutline(width, height), n = ring.length;
  const positions: number[] = [], indices: number[] = [];
  const yF = box.y + thickness / 2, yB = box.y - thickness / 2;
  // 0: front centre, 1..n front ring, n+1: back centre, n+2..2n+1 back ring
  positions.push(box.x, yF, z + height / 2); for (const p of ring) positions.push(box.x + p.u, yF, z + p.v);
  positions.push(box.x, yB, z + height / 2); for (const p of ring) positions.push(box.x + p.u, yB, z + p.v);
  for (let i = 0; i < n; i++) {
    const a = 1 + i, b = 1 + (i + 1) % n, ba = n + 2 + i, bb = n + 2 + (i + 1) % n;
    indices.push(0, a, b, n + 1, bb, ba, a, ba, bb, a, bb, b);
  }
  const tone = infoBoxTone(box);
  const body: Derived3D = { type:"mesh", source:"infobox", sourceId:box.id, sheetId, closed:false, color:tone.body, mesh:{ positions, indices }, glow:0.12 } as Derived3D;
  // The textured face shares the circular boundary; no rectangular overlay or edge spokes.
  const yT = yF + 0.004;
  const facePositions = [box.x,yT,z+height/2], faceIndices:number[] = [], uvs=[.5,.5];
  ring.forEach((p,i)=>{facePositions.push(box.x+p.u,yT,z+p.v);uvs.push(p.u/width+.5,p.v/height);faceIndices.push(0,1+i,1+(i+1)%n);});
  const front: Derived3D = { type:"mesh", source:"infobox", sourceId:box.id, sheetId, closed:false, color:"#ffffff", mesh:{positions:facePositions,indices:faceIndices}, texture:{list:"infoBoxes",corners:[]}, uvs, glow:0.35 };
  return [body, front];
}