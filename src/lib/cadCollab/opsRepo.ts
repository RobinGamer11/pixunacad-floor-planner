/**
 * Datenbankzugriff für einzelne CAD-Objektänderungen.
 *
 * Es wird ausschließlich der bestehende Client mit dem öffentlichen
 * Publishable Key verwendet; die Rechte prüft die Datenbank per RLS.
 */
import { getNetworkClient, isMissingSchemaError } from "@/lib/networkClient";
import type { CadObjectKind, CadObjectOp, LocalCadOp } from "./types";

interface Row {
  id: string;
  project_id: string;
  sheet_id: string;
  object_id: string;
  object_kind: string;
  change_type: string;
  payload: Record<string, unknown> | null;
  object_version: number | string;
  actor_id: string | null;
  created_at: string;
  seq: number | string;
}

export function rowToOp(row: Row): CadObjectOp {
  return {
    id: row.id,
    projectId: row.project_id,
    sheetId: row.sheet_id,
    objectId: row.object_id,
    objectKind: row.object_kind as CadObjectKind,
    changeType: row.change_type as CadObjectOp["changeType"],
    payload: row.payload ?? null,
    objectVersion: Number(row.object_version ?? 1),
    actorId: row.actor_id,
    createdAt: row.created_at,
    seq: Number(row.seq ?? 0),
  };
}

/** True, wenn die Kollaborations-Migration noch nicht eingespielt ist. */
export function isCollabSchemaMissing(error: unknown): boolean {
  return isMissingSchemaError(error);
}

/** Speichert die Objektänderungen als einzelne Datensätze. */
export async function insertOps(
  projectId: string,
  ops: LocalCadOp[],
  actorId: string,
  versionOf: (op: LocalCadOp) => number,
): Promise<void> {
  const client = getNetworkClient();
  if (!client || ops.length === 0) return;
  const rows = ops.map((op) => ({
    project_id: projectId,
    sheet_id: op.sheetId,
    object_id: op.objectId,
    object_kind: op.objectKind,
    change_type: op.changeType,
    payload: op.payload,
    object_version: versionOf(op),
    actor_id: actorId,
  }));
  const { error } = await client.from("cad_object_ops").insert(rows);
  if (error) throw error;
}

/** Lädt alle Änderungen nach einer bekannten Reihenfolge-Nummer. */
export async function fetchOpsSince(projectId: string, sinceSeq: number): Promise<CadObjectOp[]> {
  const client = getNetworkClient();
  if (!client) return [];
  const { data, error } = await client
    .from("cad_object_ops")
    .select("id,project_id,sheet_id,object_id,object_kind,change_type,payload,object_version,actor_id,created_at,seq")
    .eq("project_id", projectId)
    .gt("seq", sinceSeq)
    .order("seq", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(rowToOp);
}

/** Höchste bekannte Reihenfolge-Nummer (Startpunkt nach dem Laden). */
export async function fetchLatestSeq(projectId: string): Promise<number> {
  const client = getNetworkClient();
  if (!client) return 0;
  const { data, error } = await client
    .from("cad_object_ops")
    .select("seq")
    .eq("project_id", projectId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { seq: number }).seq ?? 0) : 0;
}

/** Setzt/verlängert die Bearbeitungsmarkierung für ein Objekt. */
export async function claimObjectLock(
  projectId: string,
  sheetId: string,
  objectId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  const client = getNetworkClient();
  if (!client) return;
  const expires = new Date(Date.now() + 30_000).toISOString();
  await client.from("cad_object_locks").upsert(
    {
      project_id: projectId,
      sheet_id: sheetId,
      object_id: objectId,
      user_id: userId,
      display_name: displayName,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,sheet_id,object_id" },
  );
}

/** Löst die eigene Bearbeitungsmarkierung. */
export async function releaseObjectLock(projectId: string, sheetId: string, objectId: string): Promise<void> {
  const client = getNetworkClient();
  if (!client) return;
  await client
    .from("cad_object_locks")
    .delete()
    .eq("project_id", projectId)
    .eq("sheet_id", sheetId)
    .eq("object_id", objectId);
}
