/** Parametric CAD openings, generated from the same placement as the 2D drawing. */
import { doorGeometry } from "../doorGeom";
import { objectElevationM } from "../objectMeta";
import type { Derived3D, Prism3D } from "./geometryDerivation";

export function deriveOpening(door: any, wall: any, sheetId: string, base: number): Derived3D[] {
  if (!wall) return [];
  const g = doorGeometry(wall, door);
  if (!g) return [];
  const bottom = Math.max(0, Number(door.breakHeightM) || 0);
  const top = Math.min(Number(wall.heightM) || 0, (Number(door.breakHeightM) || 0) + (Number(door.heightM) || 0));
  if (top <= bottom || !(door.widthM > 0)) return [];
  const z = base + objectElevationM(wall) + bottom, height = top - bottom;
  const frame = door.jambEnabled === false ? 0 : Math.min(Math.max(0, Number(door.jambLenM) || 0.06), door.widthM / 3, height / 3);
  const depth = Math.max(0.005, Number(door.jambThickM) || wall.thicknessM || 0.1);
  const shift = door.edge === "inner" ? wall.thicknessM / 2 - depth / 2 : door.edge === "outer" ? -wall.thicknessM / 2 + depth / 2 : 0;
  const center = { x: g.center.x + g.n.x * shift, y: g.center.y + g.n.y * shift };
  const out: Derived3D[] = [];
  const box = (cx: number, cy: number, ux: number, uy: number, width: number, thick: number, zb: number, zt: number, part: "frame" | "leaf" | "glass", color: string) => {
    if (width <= 0 || zt <= zb) return;
    const nx = -uy, ny = ux;
    const footprint = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => ({ x: cx + ux * a * width / 2 + nx * b * thick / 2, y: cy + uy * a * width / 2 + ny * b * thick / 2 }));
    const item: Prism3D = { type: "prism", source: door.kind === "window" ? "window" : "door", sourceId: door.id, sheetId, footprint, holes: [], z0: zb, z1: zt, color };
    out.push({ ...item, part, ...(part === "glass" ? { surfaceOpacity: 0.25 } : {}) });
  };
  const frameColor = door.jambColor || door.color || "#9aa3ad";
  if (frame > 0) {
    for (const sign of [-1,1]) box(center.x + g.tan.x * sign * (door.widthM-frame)/2, center.y + g.tan.y * sign * (door.widthM-frame)/2, g.tan.x, g.tan.y, frame, depth, z, z+height, "frame", frameColor);
    box(center.x, center.y, g.tan.x, g.tan.y, door.widthM-2*frame, depth, z+height-frame, z+height, "frame", frameColor);
    if (door.kind === "window") box(center.x, center.y, g.tan.x, g.tan.y, door.widthM-2*frame, depth, z, z+frame, "frame", frameColor);
  }
  const width = door.widthM - 2*frame;
  const hinge = g.hinge;
  const end = door.open3D ? g.leafEnd : g.closedEnd;
  const length = Math.hypot(end.x-hinge.x, end.y-hinge.y);
  const ux = length > 1e-9 ? (end.x-hinge.x)/length : g.tan.x, uy = length > 1e-9 ? (end.y-hinge.y)/length : g.tan.y;
  const cx = hinge.x + ux*width/2, cy = hinge.y + uy*width/2;
  if (door.kind === "window") {
    box(cx, cy, ux, uy, width, Math.max(0.005, Number(door.glassThickM) || 0.008), z+frame, z+height-frame, "glass", door.glassFillColor || door.glassColor || "#c8dce2");
  } else if (door.sashEnabled !== false) {
    box(cx, cy, ux, uy, width, Math.min(depth, 0.04), z, z+height-frame, "leaf", door.color || "#d9d4c7");
  }
  return out;
}