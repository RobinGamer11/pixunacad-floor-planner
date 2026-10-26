/**
 * 3D-Oberflächen leiten sich ausschließlich aus Farbe + 2D-Muster des Objekts ab.
 * Gleiche Farbe und gleiches Muster ergeben genau ein Exportmaterial.
 */
import { PATTERN_BASE_TILE_M, isWallBoundPattern } from "../hatchPatterns";

export interface Pattern3D { id: string; color: string; tileM: number; angleDeg: number }

/** Muster eines CAD-Objekts (oder undefined). `pattern3D === false` blendet es in 3D aus. */
export function patternOf(o: any, list: "walls" | "other"): Pattern3D | undefined {
  if (!o || o.pattern3D === false) return undefined;
  if (list === "walls") {
    const id = o.patternId;
    if (!id || id === "none" || isWallBoundPattern(id)) return undefined;
    const tileM = Math.max(0.02, (o.thicknessM ?? 0.2) / 3) * Math.max(0.1, o.patternScale ?? 1);
    return { id, color: o.color || "#111111", tileM, angleDeg: Number.isFinite(o.patternAngleDeg) ? o.patternAngleDeg : 0 };
  }
  if (!o.patternEnabled || !o.patternId) return undefined;
  return { id: o.patternId, color: o.strokeColor || "#111111", tileM: PATTERN_BASE_TILE_M * Math.max(0.02, o.patternScale ?? 1), angleDeg: o.patternAngleDeg ?? 0 };
}

export function hasPattern(o: any, list: string): boolean {
  return !!patternOf({ ...o, pattern3D: true }, list === "walls" ? "walls" : "other");
}

/** Eindeutiger Materialschlüssel: Farbe + Muster (inkl. Größe/Drehung). */
export function materialKey(color: string, p?: Pattern3D, extra = ""): string {
  const c = (color || "").toLowerCase();
  return p ? `${c}|${p.id}|${p.color.toLowerCase()}|${p.tileM.toFixed(4)}|${Math.round(p.angleDeg)}${extra}` : `${c}${extra}`;
}

export function materialName(color: string, p?: Pattern3D): string {
  return p ? `${color} + ${p.id}` : color;
}
