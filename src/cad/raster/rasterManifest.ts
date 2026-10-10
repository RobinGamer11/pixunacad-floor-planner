/**
 * Rastermanifest (Format 2). Je Ebene eine geordnete Liste von Einträgen mit
 * stabiler ID, Revision und Reihenfolge. Pixel liegen nur als Hash-Referenz vor.
 *
 * Komposition: Einträge werden in `order` angewendet. `paint`/`checkpoint`/
 * `solidFill`/`patternFill` = source-over, `erase` = destination-out und wirkt
 * damit nur auf Einträge davor, nie auf spätere Striche.
 *
 * Gespeichert werden Checkpoints (voll oder nur geänderte Kacheln, verdichtet ab
 * MAX_ENTRIES_PER_LAYER); paint/erase/Fills werden beim Laden zusammengesetzt.
 */
import { getBlob, hasBlob } from "./LocalProjectStore";
import type { CompactFillJSON } from "../RasterLayers";
import { isLazySrc, registerLazySrc, resolveTileSrc } from "./lazyTileSrc";

export const RASTER_FORMAT = 2;

export type RasterEntryKind = "solidFill" | "patternFill" | "paint" | "erase" | "checkpoint";

/** `s` = Auflösungsfaktor der Kachel relativ zu `pxPerM` des Eintrags (fehlt = 1). */
export interface RasterTileRef { tx: number; ty: number; hash: string; s?: number }

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
  /** nur solidFill: kompakte Flächenbeschreibung (Kontur, Löcher, Regel, Farbe, Alpha). */
  fill?: CompactFillJSON;
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
  // Bekannter Hash: Blob kann inzwischen bereinigt sein → dann erneut ablegen.
  if (known && !isLazySrc(src)) {
    if (!newBlobs.has(known) && !(await hasBlob(known))) newBlobs.set(known, await (await fetch(src)).blob());
    return known;
  }
  if (isLazySrc(src)) {
    // Verzögert zusammengesetzte Kachel: erst jetzt (beim Speichern) erzeugen.
    const u = await resolveTileSrc(src);
    if (!u) return null;
    const h = await srcToHash(u, newBlobs);
    return h;
  }
  if (!src.startsWith("data:") && !src.startsWith("blob:")) return null;
  const blob = await (await fetch(src)).blob();
  const hash = await sha256Hex(await blob.arrayBuffer());
  if (dataUrlHash.size > 5000) dataUrlHash.clear();
  dataUrlHash.set(src, hash);
  if (!newBlobs.has(hash) && !(await hasBlob(hash))) newBlobs.set(hash, blob);
  return hash;
}

let entrySeq = 0;
const newEntryId = () => `e-${Date.now().toString(36)}-${(++entrySeq).toString(36)}`;
/** Ab so vielen Einträgen je Ebene wird zu einem Checkpoint verdichtet. */
export const MAX_ENTRIES_PER_LAYER = 8;

type Effective = Map<string, string>; // "tx,ty" -> hash (nur reine Checkpoint-Ketten)
function effectiveTiles(lm: RasterLayerManifest): Effective | null {
  const m: Effective = new Map();
  for (const e of [...lm.entries].sort((a, b) => a.order - b.order)) {
    if (e.kind === "solidFill") continue;
    if (e.kind !== "checkpoint") return null;
    for (const t of e.tiles) m.set(`${t.tx},${t.ty}`, t.hash);
  }
  return m;
}

/**
 * Wandelt `rasterLayersByKey` (Szenen-JSON) in ein Manifest um. Neue Pixel
 * landen in `newBlobs`. Mit `prev` werden nur geänderte Kacheln als neuer
 * Teil-Checkpoint angehängt; entfernte Kacheln, Auflösungswechsel oder zu
 * viele Einträge führen zu einem frischen vollständigen Checkpoint.
 */
export async function toManifest(rasterByKey: Record<string, any[]> | undefined, revision: number, newBlobs: Map<string, Blob>, prev?: RasterManifest): Promise<RasterManifest> {
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
        const sc = t.s ?? (typeof t.ref === "number" ? list[t.ref]?.s : undefined);
        if (hash) tiles.push(sc && sc !== 1 ? { tx: t.tx, ty: t.ty, hash, s: sc } : { tx: t.tx, ty: t.ty, hash });
      }
      const fills: CompactFillJSON[] = Array.isArray(l.fills) ? l.fills : [];
      if (!tiles.length && !fills.length) continue;
      const full = (): RasterManifestEntry[] => tiles.length ? [{ id: newEntryId(), kind: "checkpoint", revision, order: 0, pxPerM: l.pxPerM, tilePx: l.tilePx, tiles }] : [];
      const oldRaw = prev?.[key]?.find((x) => x.labelId === l.labelId);
      const old = oldRaw ? { ...oldRaw, entries: oldRaw.entries.filter((e) => e.kind !== "solidFill") } : undefined;
      let entries = full();
      const eff = old ? effectiveTiles(old) : null;
      const sameRes = old?.entries.every((e) => e.pxPerM === l.pxPerM && e.tilePx === l.tilePx);
      if (old && old.entries.length && tiles.length && eff && sameRes && old.entries.length < MAX_ENTRIES_PER_LAYER) {
        const now = new Set(tiles.map((t) => `${t.tx},${t.ty}`));
        const removed = [...eff.keys()].some((k) => !now.has(k));
        if (!removed) {
          const changed = tiles.filter((t) => eff.get(`${t.tx},${t.ty}`) !== t.hash);
          const maxOrder = Math.max(...old.entries.map((e) => e.order));
          entries = changed.length
            ? [...old.entries, { id: newEntryId(), kind: "checkpoint", revision, order: maxOrder + 1, pxPerM: l.pxPerM, tilePx: l.tilePx, tiles: changed }]
            : old.entries;
        }
      }
      // Kompakte Flächen: je Fläche ein solidFill-Eintrag ohne Pixeldaten.
      const base = entries.length ? Math.max(...entries.map((e) => e.order)) + 1 : 0;
      fills.forEach((f, i) => entries = [...entries, { id: f.id || newEntryId(), kind: "solidFill", revision, order: base + i, pxPerM: l.pxPerM, tilePx: l.tilePx, tiles: [], fill: f }]);
      layers.push({ labelId: l.labelId, strokeCount: l.strokeCount ?? 1, entries });
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

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

/** Ops einer Kachel in Reihenfolge; checkpoint ersetzt, paint/fill = source-over, erase = destination-out. */
type TileOp = { kind: RasterEntryKind; hash: string; s: number };
/** Ergebnis: Bild-URL plus Auflösungsfaktor der zusammengesetzten Kachel. */
async function composeTile(ops: TileOp[], tilePx: number): Promise<{ src: string; s: number } | null> {
  const start = ops.map((o) => o.kind).lastIndexOf("checkpoint");
  const seq = start >= 0 ? ops.slice(start) : ops;
  if (seq.length === 1 && seq[0].kind !== "erase") { const u = await urlFor(seq[0].hash); return u ? { src: u, s: seq[0].s } : null; }
  // Feinste beteiligte Stufe: feinere Einträge werden nie vergröbert.
  const s = Math.max(...seq.map((o) => o.s));
  const px = Math.max(1, Math.round(tilePx * s));
  tilePx = px;
  const cv = document.createElement("canvas"); cv.width = cv.height = tilePx;
  const ctx = cv.getContext("2d"); if (!ctx) return null;
  for (const o of seq) {
    const u = await urlFor(o.hash); if (!u) return null;
    const img = await loadImg(u);
    ctx.globalCompositeOperation = o.kind === "erase" ? "destination-out" : "source-over";
    if (o.kind === "checkpoint") ctx.clearRect(0, 0, tilePx, tilePx);
    ctx.drawImage(img, 0, 0, tilePx, tilePx);
  }
  const blob: Blob | null = await new Promise((r) => cv.toBlob(r, "image/png"));
  return blob ? { src: URL.createObjectURL(blob), s } : null;
}

/**
 * Manifest → `rasterLayersByKey` im Laufzeitformat. Einträge werden je Kachel
 * in Reihenfolge zusammengesetzt. Fehlende Blobs oder unterschiedliche
 * Auflösungen innerhalb einer Ebene werden gemeldet (`missing`), nie still geleert.
 */
export async function fromManifest(m: RasterManifest | undefined, missing: string[]): Promise<Record<string, any[]>> {
  const out: Record<string, any[]> = {};
  for (const key of Object.keys(m ?? {})) {
    const layers: any[] = [];
    for (const lm of m![key]) {
      const all = [...lm.entries].sort((a, b) => a.order - b.order);
      const fills = all.filter((e) => e.kind === "solidFill" && e.fill).map((e) => e.fill!);
      const entries = all.filter((e) => e.kind !== "solidFill");
      if (!entries.length) {
        if (fills.length) layers.push({ labelId: lm.labelId, pxPerM: all[0].pxPerM, tilePx: all[0].tilePx, tiles: [], fills, strokeCount: lm.strokeCount });
        continue;
      }
      // Basis = feinste Auflösung; gröbere Einträge werden als Kachelfaktor
      // geführt. Voraussetzung: identische Kachel-Weltgröße (gleiches Raster).
      const base = entries.reduce((a, e) => (e.pxPerM > a.pxPerM ? e : a), entries[0]);
      const { pxPerM, tilePx } = base;
      const tw = tilePx / pxPerM;
      if (entries.some((e) => Math.abs(e.tilePx / e.pxPerM - tw) > 1e-9 * tw)) { missing.push(`${key}/${lm.labelId}: unvereinbares Kachelraster`); continue; }
      const byTile = new Map<string, { tx: number; ty: number; ops: TileOp[] }>();
      for (const e of entries) for (const t of e.tiles) {
        const k = `${t.tx},${t.ty}`;
        let g = byTile.get(k); if (!g) { g = { tx: t.tx, ty: t.ty, ops: [] }; byTile.set(k, g); }
        g.ops.push({ kind: e.kind, hash: t.hash, s: (t.s ?? 1) * (e.pxPerM / pxPerM) });
      }
      const tiles: any[] = [];
      for (const g of byTile.values()) {
        try {
          const start = g.ops.map((o) => o.kind).lastIndexOf("checkpoint");
          const seq = start >= 0 ? g.ops.slice(start) : g.ops;
          if (seq.length > 1 || seq[0]?.kind === "erase") {
            // Mehrstufige Kachel: NICHT beim Öffnen dekodieren – nur Referenz.
            const ops = seq;
            const s = Math.max(...ops.map((o) => o.s));
            const src = registerLazySrc(async () => (await composeTile(ops, tilePx))?.src ?? null);
            tiles.push(s !== 1 ? { tx: g.tx, ty: g.ty, src, s } : { tx: g.tx, ty: g.ty, src });
            continue;
          }
          const r = await composeTile(g.ops, tilePx);
          if (r) tiles.push(r.s !== 1 ? { tx: g.tx, ty: g.ty, src: r.src, s: r.s } : { tx: g.tx, ty: g.ty, src: r.src }); else missing.push(`${g.tx},${g.ty}`);
        } catch { missing.push(`${g.tx},${g.ty}`); }
      }
      layers.push({ labelId: lm.labelId, pxPerM, tilePx, tiles, ...(fills.length ? { fills } : {}), strokeCount: lm.strokeCount });
    }
    out[key] = layers;
  }
  return out;
}

/** Alle Pixel-Hashes eines Manifests (Kacheln + Muster). */
export function manifestHashes(m: RasterManifest | undefined | null, into = new Set<string>()): Set<string> {
  for (const key of Object.keys(m ?? {})) for (const l of m![key] ?? []) for (const e of l.entries ?? []) {
    for (const t of e.tiles ?? []) into.add(t.hash);
    if (e.patternHash) into.add(e.patternHash);
  }
  return into;
}

/** Hashes, die diese Sitzung im Speicher hält (Undo/Redo, laufende Aktionen, offene Saves). */
export function sessionHashes(): Set<string> {
  return new Set([...urlToHash.values(), ...dataUrlHash.values(), ...pinned]);
}
const pinned = new Set<string>();
/** Schützt Hashes vorübergehend vor der Bereinigung (z. B. während eines Speichervorgangs). */
export function pinHashes(h: Iterable<string>) { for (const x of h) pinned.add(x); }
export function unpinHashes(h: Iterable<string>) { for (const x of h) pinned.delete(x); }
