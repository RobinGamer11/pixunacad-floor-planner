/**
 * Personenbereich des Netzwerks: Liste links, Details rechts.
 *
 * Bewusst ohne eigene Datenhaltung – Personen, Projekte, Rollen und
 * Berechtigungen stammen aus derselben Quelle wie der Reiter „Team“ eines
 * Projekts (`useNetwork` → `project_members` / `network_projects`).
 *
 * Diese Datei enthält ausschließlich Layout/Darstellung – alle Aktionen laufen
 * unverändert über die übergebenen Handler.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MessageSquare, UserMinus, Lock, MoreHorizontal, X } from "lucide-react";
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

function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
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

function StatusDot({ status, withLabel }: { status: NetworkPerson["status"]; withLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" style={{ color: presenceColor(status) }}>
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: presenceColor(status) }} />
      {withLabel !== false && presenceLabel(status)}
    </span>
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

const ROLE_LABEL: Record<string, string> = {
  owner: "Besitzer",
  admin: "Admin",
  member: "Mitglied",
  viewer: "Betrachter",
};

export function PeopleTab(props: PeopleTabProps) {
  const { people, pendingIds, projects, memberRow, canManageProject, unread } = props;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Auf Handy/Tablet werden Details als eigenes Fenster geöffnet. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const projectsOf = (userId: string) => projects.filter((p) => !!memberRow(p.id, userId));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (p: NetworkPerson) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.role ?? "").toLowerCase().includes(q) ||
      presenceLabel(p.status).toLowerCase().includes(q) ||
      projectsOf(p.id).some((pr) => pr.name.toLowerCase().includes(q));
    return [...people.filter(match)].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, query, projects]);

  const selected = useMemo(
    () => filtered.find((p) => p.id === selectedId) ?? people.find((p) => p.id === selectedId) ?? filtered[0] ?? null,
    [filtered, people, selectedId],
  );

  const pick = (person: NetworkPerson) => {
    setSelectedId(person.id);
    setMenuOpen(false);
    if (window.matchMedia("(max-width: 1279px)").matches) setSheetOpen(true);
  };

  const details = selected && (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={selected.name} url={selected.avatarUrl} size={72} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold truncate">{selected.name}</div>
          <div className="text-sm text-muted-foreground truncate">{selected.role?.trim() || "Ohne Funktion"}</div>
          <div className="mt-1.5"><StatusDot status={selected.status} /></div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => props.onOpenChat(selected)}
          className="h-12 min-h-[44px] flex-1 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2"
          style={{ borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.12)" }}
        >
          <MessageSquare size={17} /> Direktchat
        </button>
      </div>

      <div>
        <div className="text-base font-semibold">Gemeinsame Projekte</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ränge und Rechte sind identisch mit dem Reiter „Team“ im Projekt.
        </p>

        <div className="mt-3 space-y-3">
          {projects.length === 0 && (
            <div className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground"
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
              <div key={p.id} className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--hairline))" }}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {isMember ? ROLE_LABEL[role] ?? role : "Kein Mitglied"}
                    </div>
                  </div>
                  {manage ? (
                    <button
                      onClick={() => (isMember ? props.onRemoveMember(p.id, selected.id) : props.onAddMember(p.id, selected.id))}
                      className="h-10 min-h-[44px] px-3 rounded-lg border text-xs font-medium"
                      style={{ borderColor: isMember ? "hsl(var(--hairline))" : "hsl(var(--accent-gold))" }}
                    >
                      {isMember ? "Entfernen" : "Hinzufügen"}
                    </button>
                  ) : (
                    <Lock size={14} className="text-muted-foreground" />
                  )}
                </div>

                {isMember && (
                  <>
                    <MemberRoleControls
                      className="mt-3"
                      role={role}
                      overrides={row?.permissions ?? {}}
                      canManage={manage}
                      onRole={(r) => props.onSetRole(p.id, selected.id, r)}
                      onOverrides={(o) => props.onSetPermissions(p.id, selected.id, o)}
                    />
                  </>
                )}
                {!manage && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Rang und Rechte kannst du hier nur ansehen.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      {/* Liste */}
      <div className="rounded-2xl border p-4 sm:p-5" style={surface}>
        <div className="text-2xl font-semibold tracking-tight">Freunde</div>
        <div
          className="mt-4 h-12 rounded-xl border flex items-center gap-2.5 px-3.5"
          style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
        >
          <Search size={17} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Freunde durchsuchen …"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-4 space-y-2.5">
          {filtered.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">Keine Personen gefunden.</div>
          )}
          {filtered.map((person) => {
            const active = selected?.id === person.id;
            const chips = projectsOf(person.id);
            return (
              <div
                key={person.id}
                onClick={() => pick(person)}
                className="rounded-xl border p-3 sm:p-3.5 cursor-pointer hover:bg-[hsl(var(--surface-muted))]"
                style={{
                  borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  background: active ? "hsl(var(--accent-gold) / 0.10)" : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={person.name} url={person.avatarUrl} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold truncate">{person.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {person.role?.trim() || "Ohne Funktion"}
                    </div>
                  </div>
                  <div className="hidden sm:block shrink-0"><StatusDot status={person.status} /></div>
                  <div className="hidden lg:flex max-w-[240px] flex-wrap justify-end gap-1.5">
                    {chips.slice(0, 2).map((p) => (
                      <span key={p.id} className="rounded-md border px-2 py-1 text-[11px]"
                            style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
                        {p.name}
                      </span>
                    ))}
                    {chips.length > 2 && (
                      <span className="rounded-md border px-2 py-1 text-[11px]"
                            style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
                        +{chips.length - 2}
                      </span>
                    )}
                  </div>
                  {pendingIds.has(person.id) && (
                    <span
                      className="rounded-full px-2 py-1 text-[11px] font-medium"
                      style={{ background: "hsl(var(--accent-gold) / 0.18)", color: "hsl(var(--ink))" }}
                      title="Kontaktanfrage noch offen"
                    >
                      Anfrage offen
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); props.onOpenChat(person); }}
                    title="Direktchat öffnen"
                    className={`h-11 w-11 min-w-[44px] shrink-0 rounded-xl grid place-items-center border ${unread[`d:${person.id}`] ? "animate-pulse" : ""}`}
                    style={
                      unread[`d:${person.id}`]
                        ? { color: "hsl(var(--accent-gold))", borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.16)" }
                        : { color: "hsl(var(--ink-soft))", borderColor: "hsl(var(--hairline))" }
                    }
                  >
                    <MessageSquare size={18} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">
                  <StatusDot status={person.status} />
                  {chips.slice(0, 3).map((p) => (
                    <span key={p.id} className="rounded-md border px-2 py-0.5 text-[11px]"
                          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
                      {p.name}
                    </span>
                  ))}
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
            Person links auswählen, um Details und gemeinsame Projekte zu sehen.
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
                style={{ borderColor: "hsl(var(--hairline))" }}
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

export default PeopleTab;
