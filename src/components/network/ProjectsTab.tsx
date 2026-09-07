/**
 * Projektbereich des Netzwerks: Projektliste links, Details rechts.
 *
 * Reine Darstellung – Projekte, Mitglieder, Rollen und Rechte stammen
 * unverändert aus derselben Datenquelle wie der Reiter „Team“ im Projekt.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, MessageSquare, UserMinus, Lock, FolderKanban, StickyNote,
  MoreHorizontal, X, UserPlus, ExternalLink, Crown,
} from "lucide-react";
import { presenceColor, presenceLabel, type NetworkPerson, type LocalProjectRef } from "@/lib/networkStore";
import { effectivePermissions, type ProjectPermissionOverrides, type ProjectRole } from "@/lib/projectAccess";
import { MemberRoleControls } from "@/components/network/MemberRoleControls";
import { CommentsTab } from "@/components/network/CommentsTab";
import { ProjectTimeSummary } from "@/components/network/ProjectTimeSummary";

const surface = { background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" };
const hairline = { borderColor: "hsl(var(--hairline))" };

const ROLE_LABEL: Record<string, string> = {
  owner: "Besitzer",
  admin: "Admin",
  member: "Mitglied",
  viewer: "Betrachter",
};

function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 grid place-items-center border"
      style={{ width: size, height: size, background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
    >
      {url ? <img src={url} alt={name} className="h-full w-full object-cover" />
           : <span className="font-semibold text-muted-foreground" style={{ fontSize: size / 2.6 }}>{initial}</span>}
    </div>
  );
}

function ProjectMark({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  return (
    <div
      className="rounded-xl overflow-hidden grid place-items-center border shrink-0"
      style={{ width: size, height: size, background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <FolderKanban size={Math.round(size * 0.42)} style={{ color: "hsl(var(--accent-gold))" }} />
      )}
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
  /** Eigener Rang im Projekt (optional – rein zur Anzeige). */
  myRoleOf?: (projectId: string) => ProjectRole;
  /** Kontakte, die einem Projekt zugewiesen werden können. */
  contacts: NetworkPerson[];
  peopleNames: Map<string, string>;
  unread: Record<string, boolean>;
  onOpenChat: (project: LocalProjectRef) => void;
  onOpenProject?: (project: LocalProjectRef) => void;
  onAddMember: (projectId: string, userId: string) => void;
  onRemoveMember: (projectId: string, userId: string) => void;
  onSetRole: (projectId: string, userId: string, role: Exclude<ProjectRole, "owner">) => void;
  onSetPermissions: (projectId: string, userId: string, o: ProjectPermissionOverrides) => void;
}

export function ProjectsTab(props: ProjectsTabProps) {
  const { projects, membersOf, memberRow, canManageProject, ownerLabel, contacts, peopleNames, unread } = props;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, query]);

  const selected = useMemo(
    () => filtered.find((p) => p.id === selectedId) ?? projects.find((p) => p.id === selectedId) ?? filtered[0] ?? null,
    [filtered, projects, selectedId],
  );

  const roleLabelOf = (projectId: string) => {
    const role = props.myRoleOf?.(projectId);
    return role ? ROLE_LABEL[role] ?? role : ownerLabel(projectId) === "Du" || ownerLabel(projectId) === "Du (lokal)" ? "Besitzer" : "Mitglied";
  };

  const selectedMembers = selected ? membersOf(selected.id) : [];
  const manage = selected ? canManageProject(selected.id) : false;
  const available = selected ? contacts.filter((c) => !selectedMembers.some((m) => m.id === c.id)) : [];

  const pick = (p: LocalProjectRef) => {
    setSelectedId(p.id);
    setMenuOpen(false);
    setAddOpen(false);
    if (window.matchMedia("(max-width: 1279px)").matches) setSheetOpen(true);
  };

  const details = selected && (
    <div className="space-y-5">
      {/* Kopf */}
      <div className="flex items-start gap-4">
        <ProjectMark name={selected.name} url={selected.thumbnail} size={64} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold truncate">{selected.name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1" style={hairline}>
              <Crown size={13} style={{ color: "hsl(var(--accent-gold))" }} /> Besitzer: {ownerLabel(selected.id)}
            </span>
            <span className="rounded-md border px-2 py-1" style={hairline}>Dein Rang: {roleLabelOf(selected.id)}</span>
            <span className="rounded-md border px-2 py-1" style={hairline}>
              {selectedMembers.length} Teammitglied{selectedMembers.length === 1 ? "" : "er"}
            </span>
          </div>
        </div>
      </div>

      {/* Hauptaktionen */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => props.onOpenChat(selected)}
          className="h-12 min-h-[44px] flex-1 min-w-[160px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2"
          style={{ borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.12)" }}
        >
          <MessageSquare size={17} /> Projektchat
        </button>
        {props.onOpenProject && (
          <button
            onClick={() => props.onOpenProject?.(selected)}
            className="h-12 min-h-[44px] flex-1 min-w-[160px] rounded-xl border text-sm font-semibold flex items-center justify-center gap-2"
            style={hairline}
          >
            <ExternalLink size={16} /> Projekt öffnen
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Weitere Aktionen"
            className="h-12 w-12 min-w-[44px] rounded-xl border grid place-items-center"
            style={hairline}
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-[52px] z-30 w-60 rounded-xl border p-1.5 shadow-lg" style={surface}>
              {props.onOpenProject && (
                <button
                  onClick={() => { setMenuOpen(false); props.onOpenProject?.(selected); }}
                  className="w-full h-10 px-3 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-[hsl(var(--surface-muted))]"
                >
                  <ExternalLink size={15} /> Projekt öffnen
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); props.onOpenChat(selected); }}
                className="w-full h-10 px-3 rounded-lg text-left text-sm flex items-center gap-2 hover:bg-[hsl(var(--surface-muted))]"
              >
                <MessageSquare size={15} /> Projektchat öffnen
              </button>
            </div>
          )}
        </div>
      </div>

      <ProjectTimeSummary projectId={selected.id} peopleById={peopleNames} />

      {/* Teammitglieder */}
      <div>
        <div className="text-base font-semibold">Teammitglieder</div>
        {!manage && (
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock size={13} className="mt-0.5 shrink-0" />
            Du darfst die Mitglieder dieses Projekts nicht verwalten.
          </div>
        )}

        <div className="mt-3 space-y-3">
          {selectedMembers.length === 0 && (
            <div className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground" style={hairline}>
              Noch keine weiteren Mitglieder.
            </div>
          )}
          {selectedMembers.map((person) => {
            const row = memberRow(selected.id, person.id);
            const role = (row?.role as ProjectRole) ?? "member";
            const eff = effectivePermissions(role, row?.permissions ?? undefined);
            return (
              <div key={person.id} className="rounded-xl border p-3" style={hairline}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar name={person.name} url={person.avatarUrl} size={44} />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2"
                      style={{ background: presenceColor(person.status), borderColor: "hsl(var(--surface-card))" }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{person.name}</div>
                    <div className="text-xs" style={{ color: presenceColor(person.status) }}>
                      {presenceLabel(person.status)}
                    </div>
                  </div>
                  <span className="hidden sm:inline rounded-md border px-2 py-1 text-[11px] text-muted-foreground" style={hairline}>
                    {ROLE_LABEL[role] ?? role}
                  </span>
                  {manage && (
                    <button
                      onClick={() => props.onRemoveMember(selected.id, person.id)}
                      title="Aus Projekt entfernen (Kontakt bleibt bestehen)"
                      className="h-11 w-11 min-w-[44px] rounded-xl border grid place-items-center text-muted-foreground hover:text-foreground"
                      style={hairline}
                    >
                      <UserMinus size={16} />
                    </button>
                  )}
                </div>
                <MemberRoleControls
                  className="mt-3"
                  role={role}
                  overrides={row?.permissions ?? {}}
                  canManage={manage && !!row}
                  onRole={(r) => props.onSetRole(selected.id, person.id, r)}
                  onOverrides={(o) => props.onSetPermissions(selected.id, person.id, o)}
                />
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded-md border px-2 py-0.5" style={hairline}>
                    {eff.canEdit ? "Bearbeiten" : "Nur Ansicht"}
                  </span>
                  {eff.canManageMembers && (
                    <span className="rounded-md border px-2 py-0.5" style={hairline}>Mitglieder verwalten</span>
                  )}
                  {eff.canComment && (
                    <span className="rounded-md border px-2 py-0.5" style={hairline}>Kommentieren</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Person hinzufügen */}
        <div className="mt-3">
          <button
            disabled={!manage}
            onClick={() => setAddOpen((v) => !v)}
            className="h-12 min-h-[44px] w-full rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              borderColor: manage ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
              background: manage ? "hsl(var(--accent-gold) / 0.12)" : undefined,
            }}
          >
            <UserPlus size={17} /> Person hinzufügen
          </button>
          {manage && addOpen && (
            <div className="mt-2 rounded-xl border p-2" style={hairline}>
              {available.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground">
                  Alle deine Kontakte sind bereits Mitglied.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                  {available.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { props.onAddMember(selected.id, c.id); setAddOpen(false); }}
                      className="w-full h-12 min-h-[44px] px-2.5 rounded-lg flex items-center gap-3 text-left hover:bg-[hsl(var(--surface-muted))]"
                    >
                      <Avatar name={c.name} url={c.avatarUrl} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">Hinzufügen</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Kommentare */}
      <div>
        <div className="flex items-center gap-2 text-base font-semibold">
          <StickyNote size={16} /> Projektkommentare
        </div>
        <div className="mt-3">
          <CommentsTab
            projects={[{ id: selected.id, name: selected.name }]}
            peopleById={peopleNames}
            initialProjectId={selected.id}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      {/* Liste */}
      <div className="rounded-2xl border p-4 sm:p-5" style={surface}>
        <div className="text-2xl font-semibold tracking-tight">Projekte</div>
        <p className="mt-1 text-sm text-muted-foreground">Gemeinsame und eigene Projekte verwalten.</p>

        <div
          className="mt-4 h-12 rounded-xl border flex items-center gap-2.5 px-3.5"
          style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
        >
          <Search size={17} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Projekte durchsuchen …"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-4 space-y-2.5">
          {filtered.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">Keine Projekte gefunden.</div>
          )}
          {filtered.map((p) => {
            const active = selected?.id === p.id;
            const team = membersOf(p.id);
            return (
              <div
                key={p.id}
                onClick={() => pick(p)}
                className="rounded-xl border p-3 sm:p-3.5 cursor-pointer hover:bg-[hsl(var(--surface-muted))]"
                style={{
                  borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  background: active ? "hsl(var(--accent-gold) / 0.10)" : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <ProjectMark name={p.name} url={p.thumbnail} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold truncate">{p.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Crown size={12} style={{ color: "hsl(var(--accent-gold))" }} /> {roleLabelOf(p.id)}
                      </span>
                      <span>{team.length} Mitglied{team.length === 1 ? "" : "er"}</span>
                      <span className="truncate">Besitzer: {ownerLabel(p.id)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); props.onOpenChat(p); }}
                    title="Projektchat öffnen"
                    className={`h-11 w-11 min-w-[44px] shrink-0 rounded-xl grid place-items-center border ${unread[`p:${p.id}`] ? "animate-pulse" : ""}`}
                    style={
                      unread[`p:${p.id}`]
                        ? { color: "hsl(var(--accent-gold))", borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.16)" }
                        : { color: "hsl(var(--ink-soft))", borderColor: "hsl(var(--hairline))" }
                    }
                  >
                    <MessageSquare size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Details – ab XL fest, darunter als Fenster */}
      <div className="hidden xl:block rounded-2xl border p-5 self-start" style={surface}>
        {selected ? details : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Projekt links auswählen, um Team und Kommentare zu sehen.
          </div>
        )}
      </div>

      {sheetOpen && selected && (
        <div className="xl:hidden fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center sm:justify-center"
             onClick={() => setSheetOpen(false)}>
          <div
            className="w-full sm:max-w-[560px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border p-5"
            style={surface}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => setSheetOpen(false)}
                className="h-11 w-11 min-w-[44px] rounded-xl border grid place-items-center"
                style={hairline}
                aria-label="Schließen"
              >
                <X size={18} />
              </button>
            </div>
            {details}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectsTab;
