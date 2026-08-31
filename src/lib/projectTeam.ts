/**
 * Schlanke Mitgliederliste eines Projekts – nur zum Zuordnen von
 * Verantwortlichen an Beiträgen. Bewusst ohne Präsenz-Heartbeat und ohne
 * Schreibzugriffe (die Verwaltung liegt weiterhin im Netzwerk-Bereich).
 */
import { useEffect, useMemo, useState } from "react";
import { getNetworkClient, networkConfigured } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";

export interface TeamMemberOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Rolle im Projekt bzw. "owner" für den Besitzer. */
  role: string;
}

export function useProjectMemberOptions(projectId: string | undefined) {
  const [members, setMembers] = useState<TeamMemberOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || !networkConfigured) {
      setMembers([]);
      return;
    }
    const load = async () => {
      const client = getNetworkClient();
      const session = authClient.getSession();
      if (!client || !session) return;
      try {
        const [{ data: memberRows }, { data: projectRows }] = await Promise.all([
          client.from("project_members").select("user_id,role").eq("project_id", projectId),
          client.from("network_projects").select("owner_id").eq("id", projectId).maybeSingle(),
        ]);
        const owner = (projectRows as { owner_id?: string } | null)?.owner_id ?? session.user.id;
        const rows = (memberRows ?? []) as { user_id: string; role: string }[];
        const ids = Array.from(new Set([owner, ...rows.map((r) => r.user_id)]));
        const { data: profileRows } = await client
          .from("profiles")
          .select("id,display_name,avatar_url")
          .in("id", ids);
        const profiles = new Map(
          ((profileRows ?? []) as { id: string; display_name?: string; avatar_url?: string | null }[]).map((p) => [p.id, p]),
        );
        const list: TeamMemberOption[] = ids.map((id) => ({
          id,
          name: profiles.get(id)?.display_name?.trim() || (id === session.user.id ? "Ich" : "Unbekannt"),
          avatarUrl: profiles.get(id)?.avatar_url ?? null,
          role: id === owner ? "owner" : rows.find((r) => r.user_id === id)?.role ?? "member",
        }));
        if (!cancelled) setMembers(list);
      } catch {
        if (!cancelled) setMembers([]);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  return useMemo(() => members, [members]);
}
