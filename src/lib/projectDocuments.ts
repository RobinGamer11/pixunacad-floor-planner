/**
 * Geteilte Projektinhalte (Paket 1 / Teilschritt 1).
 *
 * Ein geteiltes Projekt liegt genau einmal in `public.project_documents`
 * – nicht als persönliche Kopie je Benutzer. Die bisherige persönliche
 * `user_workspaces`-Ablage bleibt unangetastet und wird bewusst NICHT für
 * andere Mitglieder freigegeben (sie enthält auch private Projekte).
 *
 * Format: exakt der bestehende `Project`-Datensatz aus dem Projektstore,
 * ohne Umbau der CAD-/Mappen-Datenformate. Zusätzlich wird die
 * Dokument-Version geführt, damit ein veralteter Gesamtstand einen neueren
 * nicht still überschreibt.
 */
import { getNetworkClient, isMissingSchemaError } from "@/lib/networkClient";

export interface ProjectDocument {
  projectId: string;
  payload: Record<string, unknown>;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export class ProjectDocumentConflictError extends Error {
  constructor(message = "Das Projekt wurde zwischenzeitlich von jemand anderem gespeichert.") {
    super(message);
    this.name = "ProjectDocumentConflictError";
  }
}

export class ProjectDocumentForbiddenError extends Error {
  constructor(message = "Für dieses Projekt besteht kein Schreibrecht.") {
    super(message);
    this.name = "ProjectDocumentForbiddenError";
  }
}

/** True, wenn die Migration für geteilte Projekte noch nicht eingespielt ist. */
export function isProjectDocumentsMissing(error: unknown): boolean {
  return isMissingSchemaError(error);
}

function classify(error: unknown): Error {
  const message = (error as { message?: string } | null)?.message ?? "";
  if (message.includes("PIXUNA_CONFLICT")) return new ProjectDocumentConflictError();
  if (message.includes("PIXUNA_FORBIDDEN")) return new ProjectDocumentForbiddenError();
  return error instanceof Error ? error : new Error("Projekt konnte nicht gespeichert werden.");
}

/** Lädt den gemeinsamen Stand. `null` = für dieses Projekt noch nichts abgelegt. */
export async function loadProjectDocument(projectId: string): Promise<ProjectDocument | null> {
  const client = getNetworkClient();
  if (!client) return null;
  const { data, error } = await client
    .from("project_documents")
    .select("project_id,payload,version,updated_at,updated_by")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw classify(error);
  if (!data) return null;
  return {
    projectId: data.project_id as string,
    payload: (data.payload ?? {}) as Record<string, unknown>,
    version: Number(data.version ?? 0),
    updatedAt: String(data.updated_at ?? ""),
    updatedBy: (data.updated_by as string | null) ?? null,
  };
}

/** Nur die Version lesen – für die günstige Konfliktprüfung vor dem Speichern. */
export async function loadProjectDocumentVersion(projectId: string): Promise<number | null> {
  const client = getNetworkClient();
  if (!client) return null;
  const { data, error } = await client
    .from("project_documents")
    .select("version")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw classify(error);
  return data ? Number(data.version ?? 0) : null;
}

/**
 * Speichert den gemeinsamen Stand.
 * `expectedVersion` ist die zuletzt geladene Version; weicht sie serverseitig
 * ab, wird mit `ProjectDocumentConflictError` abgebrochen, statt zu
 * überschreiben. Schreibrechte prüft zusätzlich die Datenbank.
 */
export async function saveProjectDocument(
  projectId: string,
  payload: Record<string, unknown>,
  expectedVersion: number | null,
): Promise<number> {
  const client = getNetworkClient();
  if (!client) throw new Error("Keine Verbindung zur gemeinsamen Datenbasis.");
  const { data, error } = await client.rpc("save_project_document", {
    _project_id: projectId,
    _payload: payload,
    _expected_version: expectedVersion,
  });
  if (error) throw classify(error);
  return Number(data ?? 0);
}
