/**
 * Cloud-Abgleich der Pixel-Manifeste (Paket 3).
 *
 * - Manifest je Blatt-Key als eigenes Objekt (`sheet_id = __raster__`,
 *   `object_kind = rasterManifest`). Alle offenen Keys eines Projekts werden
 *   gemeinsam über `raster_publish_manifests` veröffentlicht: Revisionsprüfung
 *   aller Keys, Schreiben und Assetreferenzen in EINER Transaktion – Referenzen
 *   leitet der Server aus dem gespeicherten Manifest ab (kein Sitzungswissen).
 * - Outbox (`dirtyKeys`) und bestätigte Revision (`cloudBase`) liegen im
 *   lokalen Projektdatensatz und überstehen Neustart/Offline.
 *   Sitzungen ignorieren diese Seite (keine Szene), `decideOpen` bleibt unberührt.
 * - Kacheln als inhaltsadressierte Assets `<projectId>/<hash>.png` im Bucket
 *   `raster-tiles`; jeder Upload braucht vorher eine Serverreservierung
 *   (`storage_reserve_upload`). Ohne eingetragene Betreiberwerte lehnt der
 *   Server neue Assets ab → das Manifest wird dann NICHT geschrieben
 *   (nie ein Manifest mit fehlenden Kacheln in der Cloud).
 * - Nur Projekte, die in der Cloud existieren und bei denen man Mitglied ist.
 */
import { getNetworkClient } from "@/lib/networkClient";
import { getBlob, hasBlob, loadProjectLocal, patchProjectLocal, putBlobs } from "./LocalProjectStore";
import type { RasterManifest, RasterLayerManifest } from "./rasterManifest";

export const RASTER_SHEET_ID = "__raster__";
export const RASTER_BUCKET = "raster-tiles";
const KIND = "rasterManifest";

export type RasterCloudStatus = "off" | "syncing" | "synced" | "quota" | "unconfigured" | "setup-missing" | "forbidden" | "offline" | "conflict" | "error";

/** Muss mit `storage_quota_settings.file_bytes` / Bucketlimits übereinstimmen. */
export const MAX_UPLOAD_BYTES = 10_000_000;
export const MAX_TILE_UPLOAD_BYTES = 2_000_000;
/** Gleiche Werte wie storage_quota_settings (Speicherprobe); Server bleibt maßgeblich. */
export const PROJECT_QUOTA_BYTES = 50_000_000;
export const ACCOUNT_QUOTA_BYTES = 150_000_000;
type L = (s: RasterCloudStatus, detail?: string, projectId?: string) => void;
const listeners = new Set<L>();
/** Status je Projekt; `last` = zuletzt gemeldetes Projekt (Anzeige ohne Filter). */
const statusBy = new Map<string, { s: RasterCloudStatus; d?: string }>();
let last: { s: RasterCloudStatus; d?: string; p?: string } = { s: "off" };
function set(projectId: string, s: RasterCloudStatus, d?: string) {
  statusBy.set(projectId, { s, d }); last = { s, d, p: projectId };
  for (const l of listeners) l(s, d, projectId);
}
/** Mit `projectId` nur Meldungen dieses Projekts. */
export function onRasterCloudStatus(l: L, projectId?: string) {
  const f: L = (s, d, p) => { if (!projectId || p === projectId) l(s, d, p); };
  listeners.add(f);
  const cur = projectId ? statusBy.get(projectId) : last;
  f(cur?.s ?? "off", cur?.d, projectId ?? last.p);
  return () => { listeners.delete(f); };
}
export function getRasterCloudStatus(projectId: string): RasterCloudStatus { return statusBy.get(projectId)?.s ?? "off"; }

/** Bereits bestätigt hochgeladene Hashes je Projekt (nur Sitzungs-Cache; Server bleibt maßgeblich). */
const uploaded = new Map<string, Map<string, string>>(); // hash → asset_id
const cloudProject = new Map<string, boolean>();

export function quotaMessage(err: unknown): { status: RasterCloudStatus; text: string } | null {
  const m = String((err as any)?.message ?? err ?? "");
  if (m.includes("PIXUNA_QUOTA_UNCONFIGURED")) return { status: "unconfigured", text: "Cloud-Speicherlimits sind noch nicht eingerichtet – neue Pixel/Dateien werden nur lokal gespeichert." };
  if (m.includes("PIXUNA_QUOTA_FILE")) return { status: "quota", text: "Datei ist größer als erlaubt." };
  if (m.includes("PIXUNA_QUOTA_PROJECT")) return { status: "quota", text: "Projektspeicher in der Cloud ist voll." };
  if (m.includes("PIXUNA_QUOTA_ACCOUNT")) return { status: "quota", text: "Kontospeicher in der Cloud ist voll." };
  if (m.includes("PIXUNA_QUOTA_GLOBAL")) return { status: "quota", text: "Cloud-Speicher derzeit ausgelastet." };
  if (m.includes("PIXUNA_FORBIDDEN")) return { status: "forbidden", text: "Keine Berechtigung, in diesem Projekt Dateien in der Cloud abzulegen." };
  if (/function .*does not exist|PGRST202|schema cache/i.test(m)) return { status: "setup-missing", text: "Lokal gespeichert – Cloud-Einrichtung fehlt (SQL-Datei noch nicht angewendet)." };
  if (/Failed to fetch|NetworkError|offline/i.test(m) || (typeof navigator !== "undefined" && navigator.onLine === false)) return { status: "offline", text: "Offline – Pixel bleiben lokal und werden später übertragen." };
  if (m.includes("PIXUNA_QUOTA_PAYLOAD")) return { status: "quota", text: "Objekt ist zu groß für die Cloud." };
  return null;
}

async function isCloudProject(projectId: string): Promise<boolean> {
  const hit = cloudProject.get(projectId);
  if (hit !== undefined) return hit;
  const c = getNetworkClient();
  if (!c) return false;
  const { data: sess } = await c.auth.getSession();
  if (!sess.session) return false;
  const { data, error } = await c.rpc("storage_usage", { _project_id: projectId });
  if (error) {
    // Schema-/Netzfehler nie dauerhaft als „kein Cloudprojekt“ merken.
    const q = quotaMessage(error);
    if (q) set(projectId, q.status, q.text); else set(projectId, "error", "Cloud-Status konnte nicht geprüft werden.");
    return false;
  }
  const ok = Array.isArray(data) && data.length > 0;
  cloudProject.set(projectId, ok); // nur bestätigte Mitgliedschaft cachen
  if (!ok) set(projectId, "forbidden", "Kein Cloud-Zugriff auf dieses Projekt – Pixel bleiben lokal.");
  return ok;
}

/**
 * Reserviert, lädt hoch und bestätigt ein Asset. Wirft bei Quotenfehlern.
 * Gemeinsamer Weg für Rasterkacheln und Projektanhänge.
 */
export async function uploadWithQuota(
  projectId: string, bucket: string, path: string, blob: Blob, kind: "raster_tile" | "attachment", hash?: string,
  contentType?: string,
): Promise<string> {
  // Vorab-Grenze: zu große Dateien werden gar nicht erst gesendet. Server
  // (Reservierung der Bucketobergrenze) und Bucketlimit erzwingen dasselbe.
  const limit = kind === "raster_tile" ? MAX_TILE_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (blob.size > limit) throw new Error("PIXUNA_QUOTA_FILE");
  const c = getNetworkClient();
  if (!c) throw new Error("Keine Cloud-Verbindung");
  const { data, error } = await c.rpc("storage_reserve_upload", {
    _project_id: projectId, _bucket: bucket, _path: path, _hash: hash ?? null, _kind: kind, _bytes: blob.size,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { asset_id: string; already_present: boolean };
  if (row.already_present) return row.asset_id;
  const up = await c.storage.from(bucket).upload(path, blob, { upsert: false, contentType: (contentType ?? blob.type) || undefined });
  if (up.error && !/exists|Duplicate/i.test(up.error.message)) {
    await c.rpc("storage_cancel_upload", { _asset_id: row.asset_id });
    throw up.error;
  }
  const conf = await c.rpc("storage_confirm_upload", { _asset_id: row.asset_id });
  if (conf.error) throw conf.error;
  return row.asset_id;
}

function hashesOf(layers: RasterLayerManifest[]): Set<string> {
  const s = new Set<string>();
  for (const l of layers) for (const e of l.entries) {
    for (const t of e.tiles) s.add(t.hash);
    if (e.patternHash) s.add(e.patternHash);
  }
  return s;
}

/** Je Projekt höchstens ein Lauf; Anforderungen währenddessen lösen genau einen Folgelauf aus. */
const runs = new Map<string, { running: boolean; again: boolean }>();

/**
 * Veröffentlicht die persistente Outbox des Projekts (lokaler Datensatz:
 * `dirtyKeys`, `cloudBase`). Kann jederzeit erneut aufgerufen werden – auch
 * nach Neustart, Offline-Phase oder Fehler: offene Keys bleiben gespeichert.
 */
export function pushRasterSoon(projectId: string) {
  if (!projectId || projectId === "default") return;
  const r = runs.get(projectId) ?? { running: false, again: false };
  runs.set(projectId, r);
  if (r.running) { r.again = true; return; }
  r.running = true;
  void (async () => {
    try {
      do {
        r.again = false;
        try { await pushNow(projectId); }
        catch (e) {
          const q = quotaMessage(e);
          if (q) set(projectId, q.status, q.text); else { console.error("Pixel-Cloudabgleich fehlgeschlagen:", e); set(projectId, "error", "Pixel konnten nicht in die Cloud übertragen werden."); }
          break; // Outbox bleibt erhalten; nächster Speichervorgang/Öffnen versucht erneut.
        }
      } while (r.again);
    } finally { r.running = false; }
  })();
}

interface PublishItem { key: string; base: number; layers: RasterLayerManifest[] | null; hashes: string[]; json: string }

async function pushNow(projectId: string) {
  const rec = await loadProjectLocal(projectId);
  const dirty = rec?.dirtyKeys ?? [];
  if (!rec || !dirty.length) return;
  if (!(await isCloudProject(projectId))) return;
  const conflicts = rec.conflicts ?? {};
  const manifest: RasterManifest = (JSON.parse(rec.sceneJson).rasterManifest ?? {}) as RasterManifest;
  const items: PublishItem[] = [];
  for (const key of dirty) {
    if (conflicts[key]) continue; // ungelöster Konflikt: Cloudstand nie überschreiben
    const layers = manifest[key] ?? null;
    const base = rec.cloudBase?.[key] ?? 0;
    if (!layers && base === 0) { items.push({ key, base, layers: null, hashes: [], json: "null" }); continue; }
    items.push({ key, base, layers, hashes: layers ? [...hashesOf(layers)] : [], json: JSON.stringify(layers ?? null) });
  }
  if (!items.length) { if (Object.keys(conflicts).length) set(projectId, "conflict", conflictText); return; }
  set(projectId, "syncing");
  // 1) Alle Kacheln zuerst vollständig sichern (nie ein Manifest mit fehlenden Kacheln).
  for (let attempt = 0; ; attempt++) {
    await uploadAll(projectId, items);
    // 2) Alle Keys dieser Outbox gemeinsam, revisionsgeprüft, inkl. Referenzen veröffentlichen.
    const c = getNetworkClient()!;
    const { data, error } = await c.rpc("raster_publish_manifests", {
      _project_id: projectId,
      _items: items.filter((i) => i.layers || i.base > 0).map((i) => ({ key: i.key, base: i.base, payload: i.layers ? { format: 2, layers: i.layers } : null, hashes: i.hashes })),
    });
    if (error) {
      if (attempt === 0 && /PIXUNA_ASSET_MISSING/.test(error.message)) { uploaded.delete(projectId); await runStorageCleanup(projectId); continue; }
      throw error;
    }
    const rows = (data ?? []) as { key: string; accepted: boolean; conflict: boolean; revision: number }[];
    const rejected = rows.filter((r) => r.conflict);
    if (rows.some((r) => !r.accepted)) {
      // Nichts wurde geschrieben. Beide Stände erhalten: Cloudstand der
      // betroffenen Keys als Konfliktstand ablegen, lokal bleibt maßgeblich.
      const cloud = await fetchCloudKeys(projectId, rejected.map((r) => r.key));
      await patchProjectLocal(projectId, (cur) => {
        if (!cur) return null;
        const cf = { ...(cur.conflicts ?? {}) };
        for (const r of rejected) cf[r.key] = { revision: Number(r.revision), layers: cloud[r.key] ?? null };
        return { ...cur, conflicts: cf };
      });
      set(projectId, "conflict", conflictText);
      runs.get(projectId)!.again = true; // übrige Keys im nächsten Lauf gemeinsam veröffentlichen
      return;
    }
    const revs = new Map(rows.map((r) => [r.key, Number(r.revision)]));
    // 3) Outbox nur für Keys leeren, deren lokaler Stand sich seitdem nicht geändert hat.
    await patchProjectLocal(projectId, (cur) => {
      if (!cur) return null;
      const now = (JSON.parse(cur.sceneJson).rasterManifest ?? {}) as RasterManifest;
      const base = { ...(cur.cloudBase ?? {}) };
      const left = new Set(cur.dirtyKeys ?? []);
      for (const i of items) {
        const rv = revs.get(i.key);
        if (rv != null) base[i.key] = rv;
        if (JSON.stringify(now[i.key] ?? null) === i.json) left.delete(i.key);
      }
      return { ...cur, cloudBase: base, dirtyKeys: [...left] };
    });
    break;
  }
  set(projectId, Object.keys(conflicts).length ? "conflict" : "synced", Object.keys(conflicts).length ? conflictText : undefined);
  void runStorageCleanup(projectId);
}

const conflictText = "Pixelstand wurde auch auf einem anderen Gerät geändert – beide Stände sind erhalten, lokal bleibt maßgeblich.";

async function uploadAll(projectId: string, items: PublishItem[]) {
  const done = uploaded.get(projectId) ?? new Map<string, string>();
  uploaded.set(projectId, done);
  for (const it of items) for (const hash of it.hashes) {
    if (done.has(hash)) continue;
    const blob = await getBlob(hash);
    if (!blob) throw new Error(`Pixelkachel ${hash} fehlt lokal`);
    done.set(hash, await uploadWithQuota(projectId, RASTER_BUCKET, `${projectId}/${hash}.png`, blob, "raster_tile", hash, "image/png"));
  }
}

async function fetchCloudKeys(projectId: string, keys: string[]): Promise<Record<string, RasterLayerManifest[] | null>> {
  const c = getNetworkClient()!;
  const { data } = await c.from("cad_object_state").select("object_id,payload,deleted")
    .eq("project_id", projectId).eq("sheet_id", RASTER_SHEET_ID).in("object_id", keys);
  const out: Record<string, RasterLayerManifest[] | null> = {};
  for (const r of data ?? []) out[r.object_id] = r.deleted ? null : ((r.payload as any)?.layers ?? null);
  return out;
}

/**
 * Physische Bereinigung in begrenzten Batches über die Storage-API.
 * Server liefert Löschkandidaten (Status `deleting`), Client entfernt die
 * Dateien, Server gibt das Budget erst nach geprüfter Entfernung frei.
 */
export async function runStorageCleanup(projectId: string, batch = 50, maxRounds = 20): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxRounds; i++) {
    const n = await cleanupBatch(projectId, batch);
    total += n;
    if (n < batch) break;
  }
  return total;
}

async function cleanupBatch(projectId: string, batch: number): Promise<number> {
  const c = getNetworkClient();
  if (!c) return 0;
  try {
    const { data, error } = await c.rpc("storage_claim_cleanup", { _project_id: projectId, _limit: batch });
    if (error || !Array.isArray(data) || !data.length) return 0;
    const byBucket = new Map<string, { id: string; path: string }[]>();
    for (const r of data as { asset_id: string; bucket: string; path: string }[]) {
      const l = byBucket.get(r.bucket) ?? []; l.push({ id: r.asset_id, path: r.path }); byBucket.set(r.bucket, l);
    }
    let n = 0;
    for (const [bucket, items] of byBucket) {
      const rm = await c.storage.from(bucket).remove(items.map((i) => i.path));
      if (rm.error) continue; // bleibt gezählt, nächster Versuch später
      const fin = await c.rpc("storage_finalize_delete", { _asset_ids: items.map((i) => i.id) });
      if (!fin.error) n += Number(fin.data ?? 0);
      for (const i of items) for (const m of uploaded.values()) for (const [h, id] of m) if (id === i.id) m.delete(h);
    }
    return n;
  } catch (e) { console.warn("Speicherbereinigung übersprungen:", e); return 0; }
}

export interface CloudRaster { layers: RasterManifest; revisions: Record<string, number>; deleted: Set<string> }

/**
 * Lädt Cloud-Manifeste mit Revision (paginiert, stabile Reihenfolge) und
 * fehlende Kacheln portionsweise in den Gerätespeicher. null = kein Cloud-Projekt.
 */
export async function pullRasterManifest(projectId: string): Promise<CloudRaster | null> {
  if (!(await isCloudProject(projectId))) return null;
  const c = getNetworkClient()!;
  const out: RasterManifest = {};
  const revisions: Record<string, number> = {};
  const deleted = new Set<string>();
  const PAGE = 200;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from("cad_object_state")
      .select("object_id,revision,payload,deleted")
      .eq("project_id", projectId).eq("sheet_id", RASTER_SHEET_ID).eq("object_kind", KIND)
      .order("object_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      const p = r.payload as { format?: number; layers?: RasterLayerManifest[] } | null;
      if (p && (p.format ?? 2) > 2) continue; // neueres Format: nie übernehmen
      revisions[r.object_id] = Number(r.revision);
      if (r.deleted || !p) { deleted.add(r.object_id); continue; }
      out[r.object_id] = p.layers ?? [];
    }
    if (!data || data.length < PAGE) break;
  }
  return { layers: out, revisions, deleted };
}

/** Lädt fehlende Kacheln der angegebenen Keys portionsweise in IndexedDB. */
export async function downloadMissingTiles(projectId: string, m: RasterManifest): Promise<void> {
  const c = getNetworkClient();
  if (!c) return;
  const seen = new Set<string>();
  let portion = new Map<string, Blob>();
  for (const key of Object.keys(m)) for (const hash of hashesOf(m[key])) {
    if (seen.has(hash)) continue; seen.add(hash);
    if (await hasBlob(hash)) continue;
    const { data, error } = await c.storage.from(RASTER_BUCKET).download(`${projectId}/${hash}.png`);
    if (error || !data) continue; // fehlt → beim Zusammensetzen als "missing" gemeldet
    portion.set(hash, data);
    if (portion.size >= 16) { await putBlobs(portion); portion = new Map(); }
  }
  if (portion.size) await putBlobs(portion);
}
