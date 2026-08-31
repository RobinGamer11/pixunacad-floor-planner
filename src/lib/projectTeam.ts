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

/**
 * Mitglieder mehrerer Projekte auf einmal – für die projektübergreifende
 * Organisationsansicht. Nutzt dieselben Tabellen wie `useProjectMemberOptions`
 * (keine zweite Verwaltung).
 */
export function useProjectsMemberOptions(projectIds: string[]) {
  const key = useMemo(() => projectIds.slice().sort().join("|"), [projectIds]);
  const [byProject, setByProject] = useState<Record<string, TeamMemberOption[]>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split("|") : [];
    if (!ids.length || !networkConfigured) { setByProject({}); return; }
    const load = async () => {
      const client = getNetworkClient();
      const session = authClient.getSession();
      if (!client || !session) return;
      try {
        const [{ data: memberRows }, { data: projectRows }] = await Promise.all([
          client.from("project_members").select("project_id,user_id,role").in("project_id", ids),
          client.from("network_projects").select("id,owner_id").in("id", ids),
        ]);
        const rows = (memberRows ?? []) as { project_id: string; user_id: string; role: string }[];
        const owners = new Map(
          ((projectRows ?? []) as { id: string; owner_id: string }[]).map((p) => [p.id, p.owner_id]),
        );
        const allIds = Array.from(new Set([session.user.id, ...owners.values(), ...rows.map((r) => r.user_id)]));
        const { data: profileRows } = await client
          .from("profiles")
          .select("id,display_name,avatar_url")
          .in("id", allIds);
        const profiles = new Map(
          ((profileRows ?? []) as { id: string; display_name?: string; avatar_url?: string | null }[]).map((p) => [p.id, p]),
        );
        const next: Record<string, TeamMemberOption[]> = {};
        for (const projectId of ids) {
          const owner = owners.get(projectId) ?? session.user.id;
          const memberIds = Array.from(new Set([owner, ...rows.filter((r) => r.project_id === projectId).map((r) => r.user_id)]));
          next[projectId] = memberIds.map((id) => ({
            id,
            name: profiles.get(id)?.display_name?.trim() || (id === session.user.id ? "Ich" : "Unbekannt"),
            avatarUrl: profiles.get(id)?.avatar_url ?? null,
            role: id === owner ? "owner" : rows.find((r) => r.project_id === projectId && r.user_id === id)?.role ?? "member",
          }));
        }
        if (!cancelled) setByProject(next);
      } catch {
        if (!cancelled) setByProject({});
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [key]);

  return useMemo(() => {
    const namesById = new Map<string, string>();
    for (const list of Object.values(byProject)) {
      for (const m of list) namesById.set(m.id, m.name);
    }
    return { byProject, namesById };
  }, [byProject]);
}

