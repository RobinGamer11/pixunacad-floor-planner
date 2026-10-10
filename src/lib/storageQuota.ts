/**
 * Kontrollierter Cloud-Speicher für Projektanhänge:
 * Vorab-Größengrenze → Serverreservierung → Upload → Bestätigung.
 * Grenzwerte müssen mit `db/migrations/20261010120000_storage_quotas_v2.sql` übereinstimmen.
 */
import { getNetworkClient } from "@/lib/networkClient";

/** Muss mit `storage_quota_settings.file_bytes` / Bucketlimit übereinstimmen. */
export const MAX_UPLOAD_BYTES = 10_000_000;
/** Gleiche Werte wie storage_quota_settings; Server bleibt maßgeblich. */
export const PROJECT_QUOTA_BYTES = 50_000_000;
export const ACCOUNT_QUOTA_BYTES = 150_000_000;

export function quotaMessage(err: unknown): { text: string } | null {
  const m = String((err as any)?.message ?? err ?? "");
  if (m.includes("PIXUNA_QUOTA_UNCONFIGURED")) return { text: "Cloud-Speicherlimits sind noch nicht eingerichtet." };
  if (m.includes("PIXUNA_QUOTA_FILE")) return { text: "Datei ist größer als erlaubt." };
  if (m.includes("PIXUNA_QUOTA_PROJECT")) return { text: "Projektspeicher in der Cloud ist voll." };
  if (m.includes("PIXUNA_QUOTA_ACCOUNT")) return { text: "Kontospeicher in der Cloud ist voll." };
  if (m.includes("PIXUNA_QUOTA_GLOBAL")) return { text: "Cloud-Speicher derzeit ausgelastet." };
  if (m.includes("PIXUNA_FORBIDDEN")) return { text: "Keine Berechtigung, in diesem Projekt Dateien in der Cloud abzulegen." };
  if (/function .*does not exist|PGRST202|schema cache/i.test(m)) return { text: "Cloud-Einrichtung fehlt (SQL-Datei noch nicht angewendet)." };
  if (/Failed to fetch|NetworkError|offline/i.test(m) || (typeof navigator !== "undefined" && navigator.onLine === false)) return { text: "Offline – bitte später erneut versuchen." };
  return null;
}

/** Reserviert, lädt hoch und bestätigt einen Anhang. Wirft bei Quotenfehlern. */
export async function uploadWithQuota(projectId: string, bucket: string, path: string, blob: Blob, contentType?: string): Promise<string> {
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("PIXUNA_QUOTA_FILE");
  const c = getNetworkClient();
  if (!c) throw new Error("Keine Cloud-Verbindung");
  const { data, error } = await c.rpc("storage_reserve_upload", {
    _project_id: projectId, _bucket: bucket, _path: path, _hash: null, _kind: "attachment", _bytes: blob.size,
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
