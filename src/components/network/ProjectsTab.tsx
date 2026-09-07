/**
 * Projektbereich des Netzwerks: Projektliste links, Details rechts.
 *
 * Gleiche Bedienung wie der Freundebereich – rechts stehen zum gewählten
 * Projekt die Teammitglieder (Rollen und Rechte aus derselben Datenquelle wie
 * der Reiter „Team“ im Projekt) und die Kommentare.
 */
import { useMemo, useState } from "react";
import { Search, MessageSquare, UserMinus, Lock, FolderKanban, StickyNote } from "lucide-react";
import { presenceColor, type NetworkPerson, type LocalProjectRef } from "@/lib/networkStore";
import type { ProjectPermissionOverrides, ProjectRole } from "@/lib/projectAccess";
import { MemberRoleControls } from "@/components/network/MemberRoleControls";
import { CommentsTab } from "@/components/network/CommentsTab";
import { ProjectTimeSummary } from "@/components/network/ProjectTimeSummary";

const surface = { background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" };

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border px-4 py-2.5 min-w-[110px]" style={surface}>
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

export interface ProjectsTabProps {
  projects: LocalProjectRef[];
  /** Mitglieder eines Projekts (ohne mich). */
  membersOf: (projectId: string) => NetworkPerson[];
  memberRow: (projectId: string, userId: string) => { role: string; permissions?: ProjectPermissionOverrides | null } | undefined;
  canManageProject: (projectId: string) => boolean;
  ownerLabel: (projectId: string) => string;
  /** Kontakte, die einem Projekt zugewiesen werden können. */
  contacts: NetworkPerson[];
  peopleNames: Map<string, string>;
  unread: Record<string, boolean>;
  onOpenChat: (project: LocalProjectRef) => void;
  onAddMember: (projectId: string, userId: string) => void;
  onRemoveMember: (projectId: string, userId: string) => void;
  onSetRole: (projectId: string, userId: string, role: Exclude<ProjectRole, "owner">) => void;
  onSetPermissions: (projectId: string, userId: string, o: ProjectPermissionOverrides) => void;
}

export function ProjectsTab(props: ProjectsTabProps) {
  const { projects, membersOf, memberRow, canManageProject, ownerLabel, contacts, peopleNames, unread } = props;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, query]);

  const selected = useMemo(
    () => filtered.find((p) => p.id === selectedId) ?? projects.find((p) => p.id === selectedId) ?? filtered[0] ?? null,
    [filtered, projects, selectedId],
  );

  const teamCount = projects.reduce((sum, p) => sum + membersOf(p.id).length, 0);
  const selectedMembers = selected ? membersOf(selected.id) : [];
  const manage = selected ? canManageProject(selected.id) : false;
  const available = selected ? contacts.filter((c) => !selectedMembers.some((m) => m.id === c.id)) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold tracking-tight">Projekte</div>
          <div className="text-[11px] text-muted-foreground">
            Teammitglieder zuweisen, Rechte verwalten und Kommentare einsehen.
          </div>
        </div>
        <div className="flex-1" />
        <Stat label="Projekte" value={projects.length} />
        <Stat label="Zuordnungen" value={teamCount} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        {/* Liste */}
        <div className="rounded-xl border p-2.5" style={surface}>
          <div
            className="h-9 rounded-md border flex items-center gap-2 px-2.5"
            style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
          >
            <Search size={14} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Projekte suchen …"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mt-2 space-y-1.5">
            {filtered.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">Keine Projekte gefunden.</div>
            )}
            {filtered.map((p) => {
              const active = selected?.id === p.id;
              const team = membersOf(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className="rounded-lg border p-2.5 cursor-pointer hover:bg-[hsl(var(--surface-muted))]"
                  style={{
                    borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                    background: active ? "hsl(var(--accent-gold) / 0.10)" : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-9 w-9 rounded-lg grid place-items-center border shrink-0"
                      style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
                    >
                      <FolderKanban size={16} style={{ color: "hsl(var(--accent-gold))" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        Besitzer: {ownerLabel(p.id)} · {team.length} Mitglied{team.length === 1 ? "" : "er"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); props.onOpenChat(p); }}
                      title="Projektchat öffnen"
                      className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center border ${unread[`p:${p.id}`] ? "animate-pulse" : ""}`}
                      style={
                        unread[`p:${p.id}`]
                          ? { color: "hsl(var(--accent-gold))", borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.16)" }
                          : { color: "hsl(var(--ink-soft))", borderColor: "hsl(var(--hairline))" }
                      }
                    >
                      <MessageSquare size={16} />
                    </button>
                  </div>
                  {team.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-[46px]">
                      {team.map((m) => (
                        <span
                          key={m.id}
                          className="rounded-md border px-1.5 py-0.5 text-[10px]"
                          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
                        >
                          {m.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Details */}
        <div className="rounded-xl border p-3.5 self-start" style={surface}>
          {!selected ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Projekt links auswählen, um Team und Kommentare zu sehen.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div
                  className="h-11 w-11 rounded-lg grid place-items-center border shrink-0"
                  style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
                >
                  <FolderKanban size={20} style={{ color: "hsl(var(--accent-gold))" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{selected.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">Besitzer: {ownerLabel(selected.id)}</div>
                </div>
                <button
                  onClick={() => props.onOpenChat(selected)}
                  className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5"
                  style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--ink))" }}
                >
                  <MessageSquare size={13} /> Projektchat
                </button>
              </div>

              <ProjectTimeSummary projectId={selected.id} peopleById={peopleNames} />

              <div className="mt-4 text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
                Teammitglieder
              </div>
              {!manage && (
                <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-muted-foreground">
                  <Lock size={11} className="mt-0.5 shrink-0" />
                  Du darfst die Projektmitgliedschaft oder Berechtigungen hier nicht ändern.
                </div>
              )}

              <div className="mt-2 space-y-2">
                {selectedMembers.length === 0 && (
                  <div className="rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground"
                       style={{ borderColor: "hsl(var(--hairline))" }}>
                    Noch keine weiteren Mitglieder.
                  </div>
                )}
                {selectedMembers.map((person) => {
                  const row = memberRow(selected.id, person.id);
                  return (
                    <div key={person.id} className="rounded-lg border p-2.5" style={{ borderColor: "hsl(var(--hairline))" }}>
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <Avatar name={person.name} url={person.avatarUrl} />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                            style={{ background: presenceColor(person.status), borderColor: "hsl(var(--surface-card))" }}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{person.name}</div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {person.role?.trim() || "Ohne Funktion"}
                          </div>
                        </div>
                        {manage && (
                          <button
                            onClick={() => props.onRemoveMember(selected.id, person.id)}
                            title="Aus Projekt entfernen (Kontakt bleibt bestehen)"
                            className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground"
                          >
                            <UserMinus size={14} />
                          </button>
                        )}
                      </div>
                      <MemberRoleControls
                        className="mt-2"
                        role={(row?.role as ProjectRole) ?? "member"}
                        overrides={row?.permissions ?? {}}
                        canManage={manage && !!row}
                        onRole={(r) => props.onSetRole(selected.id, person.id, r)}
                        onOverrides={(o) => props.onSetPermissions(selected.id, person.id, o)}
                      />
                    </div>
                  );
                })}
              </div>

              {manage && available.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) props.onAddMember(selected.id, e.target.value);
                    e.target.value = "";
                  }}
                  className="mt-2 h-8 w-full rounded-md border px-2 text-xs bg-background text-foreground [&>option]:bg-background [&>option]:text-foreground"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                >
                  <option value="">Person hinzufügen …</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}

              <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
                <StickyNote size={13} /> Kommentare
              </div>
              <div className="mt-2">
                <CommentsTab
                  projects={[{ id: selected.id, name: selected.name }]}
                  peopleById={peopleNames}
                  initialProjectId={selected.id}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectsTab;
