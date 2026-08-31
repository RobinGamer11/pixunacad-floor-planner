/**
 * Projektbezogene Team-Ansicht (Reiter „Team“ auf der Startseite).
 *
 * Bewusst kompakt und ohne eigene Datenhaltung: die Mitglieder kommen aus
 * derselben gemeinsamen Datenbasis (`project_members`, Ownership aus
 * `network_projects`) wie das Netzwerk. Rollen/Rechte lassen sich nur mit
 * der bestehenden Berechtigung ändern.
 */
import { useMemo } from "react";
import { UserMinus, Crown } from "lucide-react";
import { useNetwork, presenceColor, presenceLabel, type NetworkPerson } from "@/lib/networkStore";
import { effectivePermissions, ROLE_LABEL, type ProjectRole } from "@/lib/projectAccess";
import { MemberRoleControls } from "@/components/network/MemberRoleControls";
import { useProjectCommentOverview } from "@/lib/commentsStore";
import { timelineStore, effectiveStatusId } from "@/lib/timelineStore";

function Avatar({ name, url, size = 34 }: { name: string; url?: string | null; size?: number }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 grid place-items-center border"
      style={{ width: size, height: size, background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
    >
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" />
           : <span className="text-xs font-semibold text-muted-foreground">{initial}</span>}
    </div>
  );
}

export function ProjectTeamTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const localProjects = useMemo(() => [{ id: projectId, name: projectName }], [projectId, projectName]);
  const net = useNetwork(localProjects);
  const { statsByUser } = useProjectCommentOverview(projectId);

  const sharedRow = net.sharedProjects.find((p) => p.id === projectId);
  const ownerId = sharedRow?.owner_id ?? net.myId ?? null;

  const memberRow = (userId: string) =>
    net.members.find((m) => m.project_id === projectId && m.user_id === userId);

  const canManage = useMemo(() => {
    if (!sharedRow) return true; // rein lokales Projekt gehört mir.
    if (sharedRow.owner_id === net.myId) return true;
    const mine = memberRow(net.myId ?? "");
    if (!mine) return false;
    return effectivePermissions(mine.role as ProjectRole, mine.permissions ?? undefined).canManageMembers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedRow, net.members, net.myId]);

  const openContributions = (userId: string) =>
    timelineStore
      .getState(projectId)
      .items.filter((i) => (i.assignees ?? []).includes(userId) && effectiveStatusId(i) !== "done").length;

  const people: { person: NetworkPerson; role: ProjectRole }[] = useMemo(() => {
    const out: { person: NetworkPerson; role: ProjectRole }[] = [];
    const seen = new Set<string>();
    const personOf = (id: string): NetworkPerson =>
      net.peopleById.get(id) ??
      (id === net.myId
        ? { id, name: net.myProfile?.display_name?.trim() || "Ich", avatarUrl: net.myProfile?.avatar_url, role: net.myProfile?.role, status: net.myStatus }
        : { id, name: "Unbekannt", status: "offline" });

    if (ownerId) { out.push({ person: personOf(ownerId), role: "owner" }); seen.add(ownerId); }
    for (const m of net.members) {
      if (m.project_id !== projectId || seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      const role = (m.role === "admin" || m.role === "viewer" ? m.role : "member") as ProjectRole;
      out.push({ person: personOf(m.user_id), role });
    }
    return out;
  }, [net.members, net.peopleById, net.myId, net.myProfile, net.myStatus, ownerId, projectId]);

  const available = net.contacts.filter((c) => !people.some((p) => p.person.id === c.id));

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Projektteam</h2>
        <span className="text-[11px] text-muted-foreground">
          {people.length} {people.length === 1 ? "Person" : "Personen"}
        </span>
        <div className="flex-1" />
        {canManage && available.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) void net.addMember(projectId, e.target.value); e.currentTarget.value = ""; }}
            className="h-8 rounded-md border px-2 text-xs"
            style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
          >
            <option value="">+ Kontakte hinzufügen …</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {net.error && (
        <div className="mt-3 rounded-lg border p-3 text-xs"
             style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(0 70% 55% / 0.4)" }}>
          {net.error}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {people.map(({ person, role }) => {
          const row = memberRow(person.id);
          const comments = statsByUser.get(person.id)?.open ?? 0;
          return (
            <div key={person.id} className="rounded-xl border p-3"
                 style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Avatar name={person.name} url={person.avatarUrl} />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                        style={{ background: presenceColor(person.status), borderColor: "hsl(var(--surface-card))" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{person.name}</span>
                    {role === "owner" && <Crown size={12} style={{ color: "hsl(var(--accent-gold))" }} />}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {ROLE_LABEL[role]} · {presenceLabel(person.status)}
                  </div>
                </div>
                {canManage && role !== "owner" && (
                  <button
                    onClick={() => void net.removeMember(projectId, person.id)}
                    title="Aus Projekt entfernen (Kontakt bleibt bestehen)"
                    className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground"
                  >
                    <UserMinus size={14} />
                  </button>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded border px-1.5 py-0.5" style={{ borderColor: "hsl(var(--hairline))" }}>
                  {openContributions(person.id)} offene Beiträge
                </span>
                <span className="rounded border px-1.5 py-0.5" style={{ borderColor: "hsl(var(--hairline))" }}>
                  {comments} offene Kommentare
                </span>
              </div>

              <MemberRoleControls
                className="mt-2"
                role={role}
                overrides={row?.permissions ?? {}}
                canManage={canManage && !!row && role !== "owner"}
                onRole={(r) => net.setMemberRole(projectId, person.id, r)}
                onOverrides={(o) => net.setMemberPermissions(projectId, person.id, o)}
              />
            </div>
          );
        })}
      </div>

      {people.length === 0 && (
        <div className="mt-3 rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground"
             style={{ borderColor: "hsl(var(--hairline))" }}>
          Noch keine Mitglieder. Kontakte lassen sich im Netzwerk unter „Projekte / Teams“ zuordnen.
        </div>
      )}
    </div>
  );
}

export default ProjectTeamTab;
