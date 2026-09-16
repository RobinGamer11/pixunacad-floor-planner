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

/** Ergebnis eines serverseitig abgesicherten Schreibvorgangs. */
export interface WriteResult {
  /** false = ein anderer Stand war neuer; nur dieses Objekt ist betroffen. */
  accepted: boolean;
  /** Serverseitig vergebene, eindeutige Revision dieses Objekts. */
  revision: number;
  /** Bei Ablehnung: der gültige Stand genau dieses Objekts. */
  payload: Record<string, unknown> | null;
  deleted: boolean;
}

/**
 * Schreibt eine einzelne Objektänderung atomar.
 *
 * Die Revision vergibt die Datenbank – nicht der Browser. Dadurch entsteht bei
 * gleichzeitiger Bearbeitung desselben Objekts in allen Browsern derselbe
 * Endstand; abgewiesen wird höchstens dieses eine Objekt.
 */
export async function writeObject(
  projectId: string,
  op: LocalCadOp,
  baseRevision: number,
): Promise<WriteResult> {
  const client = getNetworkClient();
  if (!client) return { accepted: false, revision: baseRevision, payload: op.payload, deleted: false };
  const { data, error } = await client.rpc("cad_write_object", {
    _project_id: projectId,
    _sheet_id: op.sheetId,
    _object_id: op.objectId,
    _object_kind: op.objectKind,
    _change_type: op.changeType,
    _payload: op.payload,
    _base_revision: baseRevision,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { accepted: boolean; revision: number | string; payload: Record<string, unknown> | null; deleted: boolean }
    | undefined;
  if (!row) return { accepted: true, revision: baseRevision + 1, payload: op.payload, deleted: false };
  return {
    accepted: Boolean(row.accepted),
    revision: Number(row.revision ?? 0),
    payload: row.payload ?? null,
    deleted: Boolean(row.deleted),
  };
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
