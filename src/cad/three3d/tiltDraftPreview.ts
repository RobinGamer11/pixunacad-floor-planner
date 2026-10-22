/**
 * Flüchtige Neigungsvorschau für die 3D-Ansicht („Neigung bearbeiten“ offen, noch nicht übernommen).
 * Nie gespeichert, nie Undo – der echte Körper bleibt bis „Übernehmen“ unverändert.
 */
import type { MeshData, Vec3 } from "./solidMesh";

export interface TiltDraftPreview { mesh: MeshData; edge?: [Vec3, Vec3] }

let current: TiltDraftPreview | null = null;
const subs = new Set<() => void>();

export function setTiltDraftPreview(p: TiltDraftPreview | null) {
  current = p;
  subs.forEach(f => f());
}
export const getTiltDraftPreview = () => current;
export function subscribeTiltDraftPreview(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
