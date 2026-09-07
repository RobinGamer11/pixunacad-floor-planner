/**
 * Personenbereich des Netzwerks: Liste links, Details rechts.
 *
 * Bewusst ohne eigene Datenhaltung – Personen, Projekte, Rollen und
 * Berechtigungen stammen aus derselben Quelle wie der Reiter „Team“ eines
 * Projekts (`useNetwork` → `project_members` / `network_projects`).
 */
import { useMemo, useState } from "react";
import { Search, MessageSquare, UserMinus, Lock, FolderKanban } from "lucide-react";
import {
  presenceColor,
  presenceLabel,
  type NetworkPerson,
  type LocalProjectRef,
} from "@/lib/networkStore";
import {
  effectivePermissions,
  type ProjectPermissionOverrides,
  type ProjectRole,
} from "@/lib/projectAccess";
import { MemberRoleControls } from "@/components/network/MemberRoleControls";

const surface = { background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" };

function Avatar({ name, url, size = 38 }: { name: string; url?: string | null; size?: number }) {
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

function StatusBadge({ status }: { status: NetworkPerson["status"] }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: presenceColor(status), color: presenceColor(status) }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: presenceColor(status) }} />
      {presenceLabel(status)}
    </span>
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

export interface PeopleTabProps {
  /** Kontakte inkl. Live-Status. */
  people: NetworkPerson[];
  /** Offene Kontaktanfragen (nur Kennzeichnung, kein Personenstatus). */
  pendingIds: Set<string>;
  /** Sichtbare Projekte (lokale + geteilte, in denen ich Mitglied bin). */
  projects: LocalProjectRef[];
  /** Rollenzeile eines Mitglieds. */
  memberRow: (projectId: string, userId: string) => { role: string; permissions?: ProjectPermissionOverrides | null } | undefined;
  /** Darf ich in diesem Projekt Mitglieder verwalten? */
  canManageProject: (projectId: string) => boolean;
  unread: Record<string, boolean>;
  onOpenChat: (person: NetworkPerson) => void;
  onRemoveContact: (person: NetworkPerson) => void;
  onAddMember: (projectId: string, userId: string) => void;
  onRemoveMember: (projectId: string, userId: string) => void;
  onSetRole: (projectId: string, userId: string, role: Exclude<ProjectRole, "owner">) => void;
  onSetPermissions: (projectId: string, userId: string, o: ProjectPermissionOverrides) => void;
}

export function PeopleTab(props: PeopleTabProps) {
  const { people, pendingIds, projects, memberRow, canManageProject, unread } = props;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [people, query]);

  const selected = useMemo(
    () => filtered.find((p) => p.id === selectedId) ?? people.find((p) => p.id === selectedId) ?? filtered[0] ?? null,
    [filtered, people, selectedId],
  );

  const projectsOf = (userId: string) =>
    projects.filter((p) => !!memberRow(p.id, userId));

  const assignedCount = people.filter((p) => projectsOf(p.id).length > 0).length;

  return (
    <div className="space-y-4">
      {/* Kopf: echte Zahlen aus den geladenen Daten */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold tracking-tight">Personen</div>
          <div className="text-[11px] text-muted-foreground">
            Kontakte ansehen und Projektzuordnung verwalten.
          </div>
        </div>
        <div className="flex-1" />
        <Stat label="Kontakte" value={people.length} />
        <Stat label="Projekte" value={projects.length} />
        <Stat label="Zugewiesen" value={assignedCount} />
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
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
              placeholder="Personen suchen …"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mt-2 space-y-1.5">
            {filtered.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                Keine Personen gefunden.
              </div>
            )}
            {filtered.map((person) => {
              const active = selected?.id === person.id;
              const chips = projectsOf(person.id);
              return (
                <div
                  key={person.id}
                  onClick={() => setSelectedId(person.id)}
                  className="rounded-lg border p-2.5 cursor-pointer hover:bg-[hsl(var(--surface-muted))]"
                  style={{
                    borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                    background: active ? "hsl(var(--accent-gold) / 0.10)" : undefined,
                  }}
                >
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
                    <StatusBadge status={person.status} />
                    {pendingIds.has(person.id) && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: "hsl(var(--accent-gold) / 0.18)", color: "hsl(var(--ink))" }}
                        title="Kontaktanfrage noch offen"
                      >
                        Anfrage offen
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); props.onOpenChat(person); }}
                      title="Direktchat öffnen"
                      className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center border ${unread[`d:${person.id}`] ? "animate-pulse" : ""}`}
                      style={
                        unread[`d:${person.id}`]
                          ? { color: "hsl(var(--accent-gold))", borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.16)" }
                          : { color: "hsl(var(--ink-soft))", borderColor: "hsl(var(--hairline))" }
                      }
                    >
                      <MessageSquare size={16} />
                    </button>
                  </div>
                  {chips.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-[48px]">
                      {chips.map((p) => (
                        <span
                          key={p.id}
                          className="rounded-md border px-1.5 py-0.5 text-[10px]"
                          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
                        >
                          {p.name}
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
              Person links auswählen, um Details und Projektzuordnung zu sehen.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Avatar name={selected.name} url={selected.avatarUrl} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{selected.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {selected.role?.trim() || "Ohne Funktion"}
                  </div>
                  <div className="mt-1"><StatusBadge status={selected.status} /></div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => props.onOpenChat(selected)}
                  className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5"
                  style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--ink))" }}
                >
                  <MessageSquare size={13} /> Direktchat
                </button>
                <button
                  onClick={() => props.onRemoveContact(selected)}
                  className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                >
                  <UserMinus size={13} /> Kontakt entfernen
                </button>
              </div>

              <div className="mt-4 text-[11px] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
                Projektzuordnung
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Mitgliedschaft und Rechte – identisch mit dem Reiter „Team“ im Projekt.
              </p>

              <div className="mt-2 space-y-2">
                {projects.length === 0 && (
                  <div className="rounded-md border border-dashed px-3 py-4 text-center text-[11px] text-muted-foreground"
                       style={{ borderColor: "hsl(var(--hairline))" }}>
                    Keine gemeinsamen Projekte vorhanden.
                  </div>
                )}
                {projects.map((p) => {
                  const row = memberRow(p.id, selected.id);
                  const manage = canManageProject(p.id);
                  const isMember = !!row;
                  const role = (row?.role as ProjectRole) ?? "member";
                  const eff = effectivePermissions(role, row?.permissions ?? undefined);
                  return (
                    <div
                      key={p.id}
                      className="rounded-lg border p-2.5"
                      style={{ borderColor: "hsl(var(--hairline))", opacity: manage ? 1 : 0.75 }}
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isMember}
                          disabled={!manage}
                          onChange={(e) => {
                            if (e.target.checked) props.onAddMember(p.id, selected.id);
                            else props.onRemoveMember(p.id, selected.id);
                          }}
                        />
                        <FolderKanban size={14} className="text-muted-foreground" />
                        <span className="truncate">{p.name}</span>
                        {!manage && <Lock size={12} className="ml-auto text-muted-foreground" />}
                      </label>

                      {isMember && (
                        <MemberRoleControls
                          className="mt-2"
                          role={role}
                          overrides={row?.permissions ?? {}}
                          canManage={manage}
                          onRole={(r) => props.onSetRole(p.id, selected.id, r)}
                          onOverrides={(o) => props.onSetPermissions(p.id, selected.id, o)}
                        />
                      )}
                      {isMember && !manage && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Sichtbare Rechte: {eff.canEdit ? "Bearbeiten" : "Nur Ansicht"}
                          {eff.canComment ? " · Kommentieren" : ""}
                          {eff.canManageMembers ? " · Mitglieder" : ""}
                        </div>
                      )}
                      {!manage && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-[10px] text-muted-foreground">
                          <Lock size={11} className="mt-0.5 shrink-0" />
                          Du darfst die Projektmitgliedschaft oder Berechtigungen hier nicht ändern.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PeopleTab;
