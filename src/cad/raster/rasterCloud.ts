/**
 * Cloud-Abgleich der Pixel-Manifeste (Paket 3).
 *
 * - Manifest je Blatt-Key als eigenes Objekt (`sheet_id = __raster__`,
 *   `object_kind = rasterManifest`) über `cad_write_object` mit Revisionsprüfung.
 *   Sitzungen ignorieren diese Seite (keine Szene), `decideOpen` bleibt unberührt.
 * - Kacheln als inhaltsadressierte Assets `<projectId>/<hash>.png` im Bucket
 *   `raster-tiles`; jeder Upload braucht vorher eine Serverreservierung
 *   (`storage_reserve_upload`). Ohne eingetragene Betreiberwerte lehnt der
 *   Server neue Assets ab → das Manifest wird dann NICHT geschrieben
 *   (nie ein Manifest mit fehlenden Kacheln in der Cloud).
 * - Nur Projekte, die in der Cloud existieren und bei denen man Mitglied ist.
 */
import { getNetworkClient } from "@/lib/networkClient";
import { writeObject } from "@/lib/cadCollab/opsRepo";
import { getBlob, hasBlob, putBlobs } from "./LocalProjectStore";
import type { RasterManifest, RasterLayerManifest } from "./rasterManifest";

export const RASTER_SHEET_ID = "__raster__";
export const RASTER_BUCKET = "raster-tiles";
const KIND = "rasterManifest";

export type RasterCloudStatus = "off" | "syncing" | "synced" | "quota" | "unconfigured" | "setup-missing" | "forbidden" | "offline" | "conflict" | "error";

/** Muss mit `storage_quota_settings.file_bytes` / Bucketlimits übereinstimmen. */
export const MAX_UPLOAD_BYTES = 10_000_000;
export const MAX_TILE_UPLOAD_BYTES = 2_000_000;
type L = (s: RasterCloudStatus, detail?: string) => void;
const listeners = new Set<L>();
let status: RasterCloudStatus = "off";
function set(s: RasterCloudStatus, d?: string) { status = s; for (const l of listeners) l(s, d); }
export function onRasterCloudStatus(l: L) { listeners.add(l); l(status); return () => { listeners.delete(l); }; }

/** Bekannte Serverrevision je Projekt/Key. */
const revisions = new Map<string, number>();
/** Bereits bestätigt hochgeladene Hashes je Projekt. */
const uploaded = new Map<string, Set<string>>();
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
    if (q) set(q.status, q.text); else set("error", "Cloud-Status konnte nicht geprüft werden.");
    return false;
  }
  const ok = Array.isArray(data) && data.length > 0;
  cloudProject.set(projectId, ok); // nur bestätigte Mitgliedschaft cachen
  if (!ok) set("forbidden", "Kein Cloud-Zugriff auf dieses Projekt – Pixel bleiben lokal.");
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

let chain: Promise<void> = Promise.resolve();
let queued: { projectId: string; manifest: RasterManifest; revision: number } | null = null;

/** Nach erfolgreichem lokalem Speichern: neuesten Stand gebündelt hochladen. */
export function pushRasterManifestSoon(projectId: string, manifest: RasterManifest | undefined, revision: number) {
  if (!manifest || projectId === "default") return;
  const first = !queued;
  queued = { projectId, manifest, revision };
  if (!first) return;
  chain = chain.then(async () => {
    const job = queued; queued = null;
    if (!job) return;
    try { await pushNow(job.projectId, job.manifest, job.revision); }
    catch (e) {
      const q = quotaMessage(e);
      if (q) set(q.status, q.text); else { console.error("Pixel-Cloudabgleich fehlgeschlagen:", e); set("error", "Pixel konnten nicht in die Cloud übertragen werden."); }
    }
  });
}

async function pushNow(projectId: string, manifest: RasterManifest, revision: number) {
  if (!(await isCloudProject(projectId))) { set("off"); return; }
  set("syncing");
  const done = uploaded.get(projectId) ?? new Set<string>();
  uploaded.set(projectId, done);
  for (const key of Object.keys(manifest)) {
    const layers = manifest[key];
    const assetIds: string[] = [];
    // 1) Alle Kacheln sichern – erst danach das Manifest (nie halbe Stände).
    for (const hash of hashesOf(layers)) {
      if (done.has(hash)) continue;
      const blob = await getBlob(hash);
      if (!blob) throw new Error(`Pixelkachel ${hash} fehlt lokal`);
      assetIds.push(await uploadWithQuota(projectId, RASTER_BUCKET, `${projectId}/${hash}.png`, blob, "raster_tile", hash, "image/png"));
      done.add(hash);
    }
    // 2) Manifest mit Revisionsprüfung schreiben.
    const rk = `${projectId}|${key}`;
    const base = revisions.get(rk) ?? 0;
    const res = await writeObject(projectId, {
      sheetId: RASTER_SHEET_ID, objectId: key, objectKind: KIND as never,
      changeType: base > 0 ? "update" : "create",
      payload: { format: 2, localRevision: revision, layers } as never,
    } as never, base);
    if (!res.accepted) {
      revisions.set(rk, res.revision);
      set("conflict", "Pixelstand wurde auf einem anderen Gerät geändert – bitte Projekt neu öffnen.");
      return;
    }
    revisions.set(rk, res.revision);
    const c = getNetworkClient();
    for (const id of assetIds) await c?.rpc("storage_add_ref", { _asset_id: id, _ref_kind: "raster_manifest", _ref_id: key });
  }
  set("synced");
}

/**
 * Lädt Cloud-Manifeste (paginiert über `cad_object_state`) und fehlende
 * Kacheln in den Gerätespeicher. Liefert null, wenn kein Cloud-Projekt.
 */
export async function pullRasterManifest(projectId: string): Promise<RasterManifest | null> {
  if (!(await isCloudProject(projectId))) return null;
  const c = getNetworkClient()!;
  const out: RasterManifest = {};
  const PAGE = 200;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from("cad_object_state")
      .select("object_id,revision,payload,deleted")
      .eq("project_id", projectId).eq("sheet_id", RASTER_SHEET_ID).eq("object_kind", KIND)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      revisions.set(`${projectId}|${r.object_id}`, Number(r.revision));
      if (r.deleted || !r.payload) continue;
      const p = r.payload as { format?: number; layers?: RasterLayerManifest[] };
      if ((p.format ?? 2) > 2) continue; // neueres Format: nie übernehmen
      out[r.object_id] = p.layers ?? [];
    }
    if (!data || data.length < PAGE) break;
  }
  const fetched = new Map<string, Blob>();
  const done = uploaded.get(projectId) ?? new Set<string>();
  uploaded.set(projectId, done);
  for (const key of Object.keys(out)) for (const hash of hashesOf(out[key])) {
    done.add(hash);
    if (fetched.has(hash) || (await hasBlob(hash))) continue;
    const { data, error } = await c.storage.from(RASTER_BUCKET).download(`${projectId}/${hash}.png`);
    if (error || !data) continue; // fehlt → beim Zusammensetzen als "missing" gemeldet
    fetched.set(hash, data);
  }
  await putBlobs(fetched);
  return out;
}
