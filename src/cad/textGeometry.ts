import { Vec2, v, add } from "./geometry";
import type { TextBox } from "./Scene";

/** Local (un-rotated) corners of a box centered at origin, in world meters. Order: TL, TR, BR, BL. */
export function boxLocalCorners(widthM: number, heightM: number): Vec2[] {
  const hw = widthM * 0.5;
  const hh = heightM * 0.5;
  return [v(-hw, -hh), v(hw, -hh), v(hw, hh), v(-hw, hh)];
}

export function rotateVector(vec: Vec2, angleRad: number): Vec2 {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return v(vec.x * c - vec.y * s, vec.x * s + vec.y * c);
}

export function inverseRotateVector(vec: Vec2, angleRad: number): Vec2 {
  return rotateVector(vec, -angleRad);
}

export function rotatePointAround(point: Vec2, pivot: Vec2, angleRad: number): Vec2 {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  return v(pivot.x + dx * c - dy * s, pivot.y + dx * s + dy * c);
}

export function worldFromBoxLocal(box: { center: Vec2; rotationRad: number }, localPoint: Vec2): Vec2 {
  return add(box.center, rotateVector(localPoint, box.rotationRad));
}

export function boxCornersWorld(box: TextBox): Vec2[] {
  return boxLocalCorners(box.widthM, box.heightM).map(lp => worldFromBoxLocal(box, lp));
}

export function pointInOrientedBox(worldPoint: Vec2, box: TextBox): boolean {
  const rel = { x: worldPoint.x - box.center.x, y: worldPoint.y - box.center.y };
  const local = inverseRotateVector(rel, box.rotationRad);
  return Math.abs(local.x) <= box.widthM * 0.5 && Math.abs(local.y) <= box.heightM * 0.5;
}

export function centerFromTopLeft(anchorWorld: Vec2, widthM: number, heightM: number, rotationRad: number = 0): Vec2 {
  return add(anchorWorld, rotateVector(v(widthM * 0.5, heightM * 0.5), rotationRad));
}
