/**
 * Rastermanifest (Format 2). Je Ebene eine geordnete Liste von Einträgen mit
 * stabiler ID, Revision und Reihenfolge. Pixel liegen nur als Hash-Referenz vor.
 *
 * Komposition: Einträge werden in `order` angewendet. `paint`/`checkpoint`/
 * `solidFill`/`patternFill` = source-over, `erase` = destination-out und wirkt
 * damit nur auf Einträge davor, nie auf spätere Striche.
 *
 * Aktuell schreibt die App je Ebene einen `checkpoint` (vollständiger Stand);
 * die übrigen Arten sind im Format vorgesehen und werden gelesen.
 */
import { getBlob, hasBlob } from "./LocalProjectStore";

export const RASTER_FORMAT = 2;

export type RasterEntryKind = "solidFill" | "patternFill" | "paint" | "erase" | "checkpoint";

export interface RasterTileRef { tx: number; ty: number; hash: string }

export interface RasterManifestEntry {
  id: string;
  kind: RasterEntryKind;
  revision: number;
  order: number;
  pxPerM: number;
  tilePx: number;
  tiles: RasterTileRef[];
  /** nur patternFill: Muster einmal referenziert. */
  patternHash?: string;
}

export interface RasterLayerManifest { labelId: string; strokeCount: number; entries: RasterManifestEntry[] }
/** Schlüssel = Blatt/Druckplan-Key wie in `rasterLayersByKey`. */
export type RasterManifest = Record<string, RasterLayerManifest[]>;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  try {
    const d = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0x811c9dc5; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); }
    return "fnv" + (h >>> 0).toString(16) + "-" + u.length;
  }
}

/** Bekannte Objekt-URLs geladener Kacheln → Hash (keine Neukodierung). */
const urlToHash = new Map<string, string>();
const hashToUrl = new Map<string, string>();
/** data:-URL → Hash (vermeidet erneutes Hashen gleicher Kacheln). */
const dataUrlHash = new Map<string, string>();

async function srcToHash(src: string, newBlobs: Map<string, Blob>): Promise<string | null> {
  const known = urlToHash.get(src) ?? dataUrlHash.get(src);
  if (known) return known;
  if (!src.startsWith("data:")) return null;
  const blob = await (await fetch(src)).blob();
  const hash = await sha256Hex(await blob.arrayBuffer());
  if (dataUrlHash.size > 5000) dataUrlHash.clear();
  dataUrlHash.set(src, hash);
  if (!newBlobs.has(hash) && !(await hasBlob(hash))) newBlobs.set(hash, blob);
  return hash;
}

let entrySeq = 0;
/**
 * Wandelt `rasterLayersByKey` (Szenen-JSON) in ein Manifest um. Neue Pixel
 * landen in `newBlobs`; die Szene selbst enthält danach keine Pixeldaten.
 */
export async function toManifest(rasterByKey: Record<string, any[]> | undefined, revision: number, newBlobs: Map<string, Blob>): Promise<RasterManifest> {
  const out: RasterManifest = {};
  for (const key of Object.keys(rasterByKey ?? {})) {
    const layers: RasterLayerManifest[] = [];
    for (const l of rasterByKey![key] ?? []) {
      const list = l?.tiles ?? [];
      const tiles: RasterTileRef[] = [];
      for (const t of list) {
        const src = t.src ?? (typeof t.ref === "number" ? list[t.ref]?.src : undefined);
        if (typeof src !== "string") continue;
        const hash = await srcToHash(src, newBlobs);
        if (hash) tiles.push({ tx: t.tx, ty: t.ty, hash });
      }
      if (!tiles.length) continue;
      layers.push({
        labelId: l.labelId, strokeCount: l.strokeCount ?? 1,
        entries: [{ id: `cp-${Date.now().toString(36)}-${(++entrySeq).toString(36)}`, kind: "checkpoint", revision, order: 0, pxPerM: l.pxPerM, tilePx: l.tilePx, tiles }],
      });
    }
    if (layers.length) out[key] = layers;
  }
  return out;
}

async function urlFor(hash: string): Promise<string | null> {
  const hit = hashToUrl.get(hash);
  if (hit) return hit;
  const blob = await getBlob(hash);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  hashToUrl.set(hash, url); urlToHash.set(url, hash);
  return url;
}

/**
 * Manifest → `rasterLayersByKey` im bisherigen Laufzeitformat.
 * Fehlende Blobs = Kachel fehlt (gemeldet über `missing`), nie stilles Leeren.
 * Unterstützt derzeit nur Ebenen mit genau einem Checkpoint bzw. reinen
 * Mal-Einträgen gleicher Auflösung; sonst wird die Ebene als nicht ladbar gemeldet.
 */
export async function fromManifest(m: RasterManifest | undefined, missing: string[]): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  for (const key of Object.keys(m ?? {})) {
    const layers: any[] = [];
    for (const lm of m![key]) {
      const entries = [...lm.entries].sort((a, b) => a.order - b.order);
      const simple = entries.length === 1 && (entries[0].kind === "checkpoint" || entries[0].kind === "paint");
      if (!simple) { missing.push(`${key}/${lm.labelId}: Mehrfacheinträge`); continue; }
      const e = entries[0];
      const tiles: any[] = [];
      for (const t of e.tiles) {
        const src = await urlFor(t.hash);
        if (src) tiles.push({ tx: t.tx, ty: t.ty, src });
        else missing.push(t.hash);
      }
      layers.push({ labelId: lm.labelId, pxPerM: e.pxPerM, tilePx: e.tilePx, tiles, strokeCount: lm.strokeCount });
    }
    out[key] = layers;
  }
  return out;
}
