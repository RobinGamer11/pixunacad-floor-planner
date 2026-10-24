/** Persisted PBR values; image bytes stay in the existing project file storage. */
export interface Material3D {
  id: string;
  name: string;
  imageFileId?: string;
  /** Texture tile size in metres. */
  scaleM: number;
  opacity: number;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
}

export const DEFAULT_MATERIAL: Material3D = { id: "", name: "Material", scaleM: 1, opacity: 1, emissiveIntensity: 0, roughness: 0.8, metalness: 0 };
export const MATERIAL_DRAG_TYPE = "application/x-pixuna-material";

export function normalizeMaterial(value: unknown): Material3D | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<Material3D>;
  if (typeof v.id !== "string" || typeof v.name !== "string") return undefined;
  const finite = (n: unknown, fallback: number, min: number, max: number) => typeof n === "number" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  return { id: v.id, name: v.name, ...(typeof v.imageFileId === "string" ? { imageFileId: v.imageFileId } : {}), scaleM: finite(v.scaleM, 1, 0.001, 10000), opacity: finite(v.opacity, 1, 0, 1), emissiveIntensity: finite(v.emissiveIntensity, 0, 0, 100), roughness: finite(v.roughness, 0.8, 0, 1), metalness: finite(v.metalness, 0, 0, 1) };
}