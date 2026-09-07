/**
 * Projekteinladungen – serverseitig in derselben Datenbasis wie Netzwerk und
 * Projektfreigabe (`project_invitations`, siehe
 * db/migrations/20260907150000_project_invitations.sql).
 *
 * Es entsteht bewusst keine zweite, rein lokale Teamliste: Rang und
 * Einzelberechtigungen der Einladung werden beim Annehmen unverändert in
 * `project_members` übernommen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getNetworkClient, isMissingSchemaError, networkConfigured } from "@/lib/networkClient";
import type { ProjectPermissionOverrides, ProjectRole } from "@/lib/projectAccess";

export type InvitationStatus = "pending" | "accepted" | "declined" | "revoked";

export interface ProjectInvitation {
  id: string;
  project_id: string;
  invitee_id: string;
  role: Exclude<ProjectRole, "owner">;
  permissions: ProjectPermissionOverrides | null;
  status: InvitationStatus;
  created_at: string;
  updated_at: string;
}

export function useProjectInvitations(projectId: string | undefined) {
  const [rows, setRows] = useState<ProjectInvitation[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = getNetworkClient();
    if (!projectId || !networkConfigured || !client) {
      setRows([]);
      return;
    }
    const { data, error: err } = await client
      .from("project_invitations")
      .select("id,project_id,invitee_id,role,permissions,status,created_at,updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (err) {
      setRows([]);
      setReady(false);
      // Fehlende Migration darf die Oberfläche nicht blockieren.
      setError(isMissingSchemaError(err)
        ? "Einladungen sind noch nicht eingerichtet. Bitte die Migration db/migrations/20260907150000_project_invitations.sql einmalig ausführen."
        : err.message);
      return;
    }
    setError(null);
    setReady(true);
    setRows((data ?? []) as ProjectInvitation[]);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const actions = useMemo(() => {
    const run = async (fn: (client: NonNullable<ReturnType<typeof getNetworkClient>>) => Promise<void>) => {
      const client = getNetworkClient();
      if (!client) return;
      try {
        await fn(client);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      }
    };
    return {
      invite: (userId: string, role: Exclude<ProjectRole, "owner">, permissions: ProjectPermissionOverrides) =>
        run(async (client) => {
          if (!projectId) return;
          const { error: err } = await client
            .from("project_invitations")
            .upsert(
              {
                project_id: projectId,
                invitee_id: userId,
                role,
                permissions,
                status: "pending",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "project_id,invitee_id" },
            );
          if (err) throw err;
        }),
      revoke: (invitationId: string) =>
        run(async (client) => {
          const { error: err } = await client.from("project_invitations").delete().eq("id", invitationId);
          if (err) throw err;
        }),
      resend: (invitationId: string) =>
        run(async (client) => {
          const { error: err } = await client
            .from("project_invitations")
            .update({ status: "pending", updated_at: new Date().toISOString() })
            .eq("id", invitationId);
          if (err) throw err;
        }),
      accept: (invitationId: string) =>
        run(async (client) => {
          const { error: err } = await client.rpc("accept_project_invitation", { _invitation_id: invitationId });
          if (err) throw err;
        }),
      reload: () => { void load(); },
    };
  }, [load, projectId]);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);

  return { rows, pending, ready, error, ...actions };
}

export const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: "Ausstehend",
  accepted: "Angenommen",
  declined: "Abgelehnt",
  revoked: "Zurückgezogen",
};
