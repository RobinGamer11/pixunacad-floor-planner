/**
 * Datenbankzugriff für einzelne Projektmappen-Änderungen.
 *
 * Es wird ausschließlich der bestehende Client mit dem öffentlichen
 * Publishable Key verwendet; die Rechte prüft die Datenbank per RLS.
 */
import { getNetworkClient, isMissingSchemaError } from "@/lib/networkClient";
import type { LocalMappeOp, MappeObjectKind, MappeObjectOp } from "./types";

interface Row {
  id: string;
  project_id: string;
  page_id: string;
  object_id: string;
  object_kind: string;
  change_type: string;
  payload: Record<string, unknown> | null;
  object_version: number | string;
  actor_id: string | null;
  created_at: string;
  seq: number | string;
}

export function rowToOp(row: Row): MappeObjectOp {
  return {
    id: row.id,
    projectId: row.project_id,
    pageId: row.page_id,
    objectId: row.object_id,
    objectKind: row.object_kind as MappeObjectKind,
    changeType: row.change_type as MappeObjectOp["changeType"],
    payload: row.payload ?? null,
    objectVersion: Number(row.object_version ?? 1),
    actorId: row.actor_id,
    createdAt: row.created_at,
    seq: Number(row.seq ?? 0),
  };
}

export function isCollabSchemaMissing(error: unknown): boolean {
  return isMissingSchemaError(error);
}

export interface WriteResult {
  accepted: boolean;
  revision: number;
  payload: Record<string, unknown> | null;
  deleted: boolean;
}

/** Schreibt eine einzelne Änderung atomar; die Revision vergibt der Server. */
export async function writeObject(
  projectId: string,
  op: LocalMappeOp,
  baseRevision: number,
): Promise<WriteResult> {
  const client = getNetworkClient();
  if (!client) return { accepted: false, revision: baseRevision, payload: op.payload, deleted: false };
  const { data, error } = await client.rpc("mappe_write_object", {
    _project_id: projectId,
    _page_id: op.pageId,
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

export async function fetchOpsSince(projectId: string, sinceSeq: number): Promise<MappeObjectOp[]> {
  const client = getNetworkClient();
  if (!client) return [];
  const { data, error } = await client
    .from("mappe_object_ops")
    .select("id,project_id,page_id,object_id,object_kind,change_type,payload,object_version,actor_id,created_at,seq")
    .eq("project_id", projectId)
    .gt("seq", sinceSeq)
    .order("seq", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(rowToOp);
}

export async function fetchLatestSeq(projectId: string): Promise<number> {
  const client = getNetworkClient();
  if (!client) return 0;
  const { data, error } = await client
    .from("mappe_object_ops")
    .select("seq")
    .eq("project_id", projectId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { seq: number }).seq ?? 0) : 0;
}

export async function fetchObjectRevisions(projectId: string): Promise<Map<string, number>> {
  const client = getNetworkClient();
  const out = new Map<string, number>();
  if (!client) return out;
  const { data, error } = await client
    .from("mappe_object_state")
    .select("page_id,object_id,revision")
    .eq("project_id", projectId)
    .limit(20000);
  if (error) throw error;
  for (const row of (data ?? []) as { page_id: string; object_id: string; revision: number | string }[]) {
    out.set(`${row.page_id}|${row.object_id}`, Number(row.revision ?? 0));
  }
  return out;
}

export interface RemoteLock {
  pageId: string;
  objectId: string;
  userId: string;
  displayName: string;
  expiresAt: string;
}

export async function fetchObjectLocks(projectId: string): Promise<RemoteLock[]> {
  const client = getNetworkClient();
  if (!client) return [];
  const { data, error } = await client
    .from("mappe_object_locks")
    .select("page_id,object_id,user_id,display_name,expires_at")
    .eq("project_id", projectId)
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return ((data ?? []) as {
    page_id: string; object_id: string; user_id: string; display_name: string | null; expires_at: string;
  }[]).map((r) => ({
    pageId: r.page_id,
    objectId: r.object_id,
    userId: r.user_id,
    displayName: r.display_name ?? "Unbekannt",
    expiresAt: r.expires_at,
  }));
}

export async function claimObjectLock(
  projectId: string,
  pageId: string,
  objectId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  const client = getNetworkClient();
  if (!client) return;
  await client.from("mappe_object_locks").upsert(
    {
      project_id: projectId,
      page_id: pageId,
      object_id: objectId,
      user_id: userId,
      display_name: displayName,
      expires_at: new Date(Date.now() + 30_000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,page_id,object_id" },
  );
}

export async function releaseObjectLock(projectId: string, pageId: string, objectId: string): Promise<void> {
  const client = getNetworkClient();
  if (!client) return;
  await client
    .from("mappe_object_locks")
    .delete()
    .eq("project_id", projectId)
    .eq("page_id", pageId)
    .eq("object_id", objectId);
}

/** Aktueller gemeinsamer Stand aller Elemente – ohne Änderungshistorie. */
export async function fetchObjectState(projectId: string): Promise<MappeObjectOp[]> {
  const client = getNetworkClient();
  if (!client) return [];
  const { data, error } = await client
    .from("mappe_object_state")
    .select("page_id,object_id,object_kind,payload,deleted,revision,updated_at")
    .eq("project_id", projectId)
    .limit(20000);
  if (error) throw error;
  return ((data ?? []) as {
    page_id: string; object_id: string; object_kind: string;
    payload: Record<string, unknown> | null; deleted: boolean;
    revision: number | string; updated_at: string;
  }[]).map((row) => ({
    id: `state-${row.page_id}-${row.object_id}`,
    projectId,
    pageId: row.page_id,
    objectId: row.object_id,
    objectKind: row.object_kind as MappeObjectOp["objectKind"],
    changeType: row.deleted ? "delete" : "update",
    payload: row.payload ?? null,
    objectVersion: Number(row.revision ?? 0),
    actorId: null,
    createdAt: row.updated_at,
    seq: 0,
  }));
}
