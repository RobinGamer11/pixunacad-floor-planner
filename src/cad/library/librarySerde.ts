/**
 * (De-)Serialisierung von Bibliotheksdefinitionen und -instanzen.
 *
 * Masterformat für den Dateiaustausch ist `.pxobj` — ein verlustfreier
 * Container, der genau eine vollständige `LibraryDefinition` transportiert.
 * Import-/Export-Adapter für SVG/DXF/DWG docken später an derselben Stelle an
 * (Adapter → LibraryGeometrySnapshot → LibraryDefinition → Adapter).
 */
import {
  LIBRARY_SUPPORTED_KINDS,
  PXOBJ_FORMAT,
  PXOBJ_SCHEMA_VERSION,
  type LibraryDefinition,
  type LibraryGeometryKind,
  type LibraryGeometrySnapshot,
  type LibraryObjectInstance,
  type LibraryUnits,
  type PxObjFile,
} from "./types";

export function newLibraryId(): string {
  return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
}

const UNITS: LibraryUnits[] = ["mm", "cm", "m"];

function normalizeGeometry(raw: any): LibraryGeometrySnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: LibraryGeometrySnapshot[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    const kind = g.kind as LibraryGeometryKind;
    if (!LIBRARY_SUPPORTED_KINDS.includes(kind)) continue;
    if (!g.data || typeof g.data !== "object") continue;
    out.push({ kind, data: JSON.parse(JSON.stringify(g.data)) });
  }
  return out;
}

/** Hebt beliebige (auch fremde) Rohdaten auf eine gültige Definition. */
export function normalizeDefinition(raw: any, opts: { newId?: boolean } = {}): LibraryDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const geometry = normalizeGeometry(raw.geometry);
  if (geometry.length === 0) return null;
  const now = Date.now();
  return {
    schemaVersion: 1,
    id: opts.newId || typeof raw.id !== "string" || !raw.id ? newLibraryId() : raw.id,
    version: Number.isFinite(raw.version) && raw.version > 0 ? Math.floor(raw.version) : 1,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Bibliotheksobjekt",
    category: typeof raw.category === "string" ? raw.category : "",
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t: any) => typeof t === "string") : [],
    units: UNITS.includes(raw.units) ? raw.units : "m",
    insertionPoint: {
      x: Number.isFinite(raw?.insertionPoint?.x) ? raw.insertionPoint.x : 0,
      y: Number.isFinite(raw?.insertionPoint?.y) ? raw.insertionPoint.y : 0,
    },
    metadata: {
      author: typeof raw?.metadata?.author === "string" ? raw.metadata.author : undefined,
      license: typeof raw?.metadata?.license === "string" ? raw.metadata.license : undefined,
      source: typeof raw?.metadata?.source === "string" ? raw.metadata.source : undefined,
    },
    geometry,
    preview: raw.preview && typeof raw.preview === "object" ? { ...raw.preview } : undefined,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

export function serializeDefinition(def: LibraryDefinition): LibraryDefinition {
  return JSON.parse(JSON.stringify(def));
}

export function serializeDefinitions(defs: LibraryDefinition[]): LibraryDefinition[] {
  return (defs || []).map(serializeDefinition);
}

export function restoreDefinitions(raw: any): LibraryDefinition[] {
  if (!Array.isArray(raw)) return [];
  const out: LibraryDefinition[] = [];
  for (const d of raw) {
    const def = normalizeDefinition(d);
    if (def) out.push(def);
  }
  return out;
}

/* --------------------------------------------------------------- .pxobj */

export function exportDefinitionToPxobj(def: LibraryDefinition): string {
  const file: PxObjFile = {
    format: PXOBJ_FORMAT,
    schemaVersion: PXOBJ_SCHEMA_VERSION,
    definition: serializeDefinition(def),
  };
  return JSON.stringify(file, null, 2);
}

/** Liest eine .pxobj-Datei. Es entsteht immer eine NEUE lokale Definition. */
export function importDefinitionFromPxobj(json: string): LibraryDefinition | null {
  let data: any;
  try { data = JSON.parse(json); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  if (data.format !== PXOBJ_FORMAT) return null;
  return normalizeDefinition(data.definition, { newId: true });
}

/* ------------------------------------------------------------- Instanzen */

export function serializeLibraryInstance(inst: any): LibraryObjectInstance {
  return {
    id: inst.id,
    definitionId: inst.definitionId,
    definitionVersion: inst.definitionVersion,
    position: { x: inst.position.x, y: inst.position.y },
    rotationRad: inst.rotationRad || 0,
    scaleX: inst.scaleX || 1,
    scaleY: inst.scaleY || 1,
    labelId: inst.labelId,
  };
}
