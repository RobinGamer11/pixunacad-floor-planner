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

/** Pin outline in the vertical plane (u across, v up): three round corners, one sharper bottom-left tip like the 2D pin. */
export function infoBoxPinOutline(width: number, height: number, seg = 10): { u: number; v: number }[] {
  const m = Math.min(width, height), R = m / 2, r = m * 0.19, hw = width / 2;
  const corners: [number, number, number, number][] = [
    [hw - R, R, R, -Math.PI / 2],          // bottom-right
    [hw - R, height - R, R, 0],            // top-right
    [-hw + R, height - R, R, Math.PI / 2], // top-left
    [-hw + r, r, r, Math.PI],              // bottom-left (tip)
  ];
  const out: { u: number; v: number }[] = [];
  for (const [cu, cv, rad, a0] of corners) for (let i = 0; i <= seg; i++) {
    const a = a0 + (i / seg) * (Math.PI / 2); out.push({ u: cu + Math.cos(a) * rad, v: cv + Math.sin(a) * rad });
  }
  return out;
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
  // Vertical front quad with ordinary UVs; the pin texture is transparent outside its outline.
  const yT = yF + 0.004;
  const front: Derived3D = { type:"mesh", source:"infobox", sourceId:box.id, sheetId, closed:false, color:"#ffffff", mesh:{ positions:[box.x-width/2,yT,z+height,box.x+width/2,yT,z+height,box.x+width/2,yT,z,box.x-width/2,yT,z],indices:[0,1,2,0,2,3] }, texture:{list:"infoBoxes",corners:[]}, uvs:[0,1,1,1,1,0,0,0], glow:0.35 };
  return [body, front];
}