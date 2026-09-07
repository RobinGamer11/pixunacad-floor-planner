/**
 * Projektbezogene Team-Ansicht (Reiter „Team“ auf der Projektstartseite).
 *
 * Bewusst ohne eigene Datenhaltung: Mitglieder, Rollen und Einzelrechte
 * kommen aus derselben gemeinsamen Datenbasis wie das Netzwerk
 * (`network_projects`, `project_members`, `profiles`, `presence`).
 * Rechteänderungen prüft zusätzlich die serverseitige RLS.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, MoreHorizontal, Search, UserMinus, UserPlus, X } from "lucide-react";
import { useNetwork, presenceColor, presenceLabel, type NetworkPerson } from "@/lib/networkStore";
import {
  ROLE_LABEL,
  effectivePermissions,
  type ProjectPermissionOverrides,
  type ProjectPermissions,
  type ProjectRole,
} from "@/lib/projectAccess";
import { useProjectCommentOverview } from "@/lib/commentsStore";
import { timelineStore, effectiveStatusId } from "@/lib/timelineStore";

type AssignableRole = Exclude<ProjectRole, "owner">;
const ASSIGNABLE: AssignableRole[] = ["admin", "member", "viewer"];

const LINE = "hsl(var(--hairline))";
const CARD = "hsl(var(--surface-card))";
const GOLD = "hsl(var(--accent-gold))";

function Avatar({ name, url, size = 46 }: { name: string; url?: string | null; size?: number }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border"
      style={{ width: size, height: size, background: "hsl(var(--surface-muted))", borderColor: LINE }}
    >
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : <span className="text-base font-semibold text-muted-foreground">{initial}</span>}
    </div>
  );
}

/** Ein Recht als große, gut lesbare Fläche (gesperrt = nur Anzeige). */
function PermissionChip({
  label, checked, disabled, onChange,
}: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-[13px] ${disabled ? "opacity-55" : "cursor-pointer hover:bg-muted/30"}`}
      style={{ borderColor: LINE }}
    >
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="whitespace-nowrap">{label}</span>
    </label>
  );
}

export function ProjectTeamTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const localProjects = useMemo(() => [{ id: projectId, name: projectName }], [projectId, projectName]);
  const net = useNetwork(localProjects);
  const { statsByUser } = useProjectCommentOverview(projectId);

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const sharedRow = net.sharedProjects.find((p) => p.id === projectId);
  /** Besitzer nur aus der Projektfreigabe – niemals lokal geraten. */
  const ownerId = sharedRow?.owner_id ?? null;

  const memberRow = (userId: string) =>
    net.members.find((m) => m.project_id === projectId && m.user_id === userId);

  /** Verwaltungsrechte ausschließlich aus der gemeinsamen Datenbasis. */
  const canManage = useMemo(() => {
    if (!net.ready || !sharedRow) return false;
    if (sharedRow.owner_id === net.myId) return true;
    const mine = net.members.find((m) => m.project_id === projectId && m.user_id === (net.myId ?? ""));
    if (!mine) return false;
    return effectivePermissions(mine.role as ProjectRole, mine.permissions ?? undefined).canManageMembers;
  }, [sharedRow, net.members, net.myId, projectId]);

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

  /** Suche über Benutzername, Rang und Status – Groß-/Kleinschreibung egal. */
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("de-DE");
    if (!term) return people;
    return people.filter(({ person, role }) =>
      [person.name, ROLE_LABEL[role], presenceLabel(person.status)]
        .join(" ")
        .toLocaleLowerCase("de-DE")
        .includes(term));
  }, [people, query]);

  const available = net.contacts.filter((c) => !people.some((p) => p.person.id === c.id));

  /** Mitglied über den bestehenden Weg (`project_members`) aufnehmen. */
  const addMember = async (userId: string, role: AssignableRole, perms: ProjectPermissionOverrides) => {
    await net.addMember(projectId, userId);
    if (role !== "member") await net.setMemberRole(projectId, userId, role);
    if (Object.keys(perms).length > 0) await net.setMemberPermissions(projectId, userId, perms);
  };


  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuFor]);

  const setPerm = (userId: string, key: keyof ProjectPermissionOverrides, value: boolean) => {
    const row = memberRow(userId);
    if (!row) return;
    void net.setMemberPermissions(projectId, userId, { ...(row.permissions ?? {}), [key]: value });
  };

  return (
    <div>
      {/* ------------------------------------------------ Aktionszeile */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={!canManage}
          className="flex h-14 min-h-[44px] items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold disabled:opacity-50"
          style={{ background: GOLD, color: "hsl(var(--ink))" }}
        >
          <UserPlus size={18} /> Mitglied hinzufügen
        </button>
        <label className="relative lg:ml-auto lg:w-[420px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={19} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Team durchsuchen …"
            aria-label="Team durchsuchen"
            className="h-14 w-full rounded-xl border bg-transparent pl-12 pr-4 text-base outline-none focus:ring-1 focus:ring-ring"
            style={{ borderColor: LINE, background: "hsl(var(--surface-muted) / 0.45)" }}
          />
        </label>
      </div>

      {net.error && (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm"
          style={{ background: CARD, borderColor: "hsl(0 70% 55% / 0.4)" }}
        >
          <span className="min-w-0 flex-1">{net.error}</span>
          <button
            type="button"
            onClick={() => net.reload()}
            className="h-11 rounded-lg border px-4 text-sm font-medium"
            style={{ borderColor: LINE }}
          >
            Erneut laden
          </button>
        </div>
      )}

      {!net.error && net.loading && !net.ready && (
        <div className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground" style={{ background: CARD, borderColor: LINE }}>
          Team wird geladen …
        </div>
      )}

      {!net.error && net.ready && !sharedRow && (
        <div className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground" style={{ background: CARD, borderColor: LINE }}>
          Für dieses Projekt liegt noch keine Freigabe vor. Besitzer und Rechte werden angezeigt, sobald das Projekt
          im Netzwerk verfügbar ist.
        </div>
      )}

      {/* ------------------------------------------------- Projektteam */}
      <div className="mt-6 rounded-xl border" style={{ background: CARD, borderColor: LINE }}>
        <div className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: LINE }}>
          <h2 className="text-lg font-semibold">Projektteam</h2>
          <span className="text-sm text-muted-foreground">
            {people.length} {people.length === 1 ? "Person" : "Personen"}
          </span>
        </div>

        <ul>
          {filtered.map(({ person, role }) => {
            const row = memberRow(person.id);
            const isOwner = role === "owner";
            const eff: ProjectPermissions = effectivePermissions(role, row?.permissions ?? undefined);
            const editable = canManage && !isOwner && !!row;
            const isMe = person.id === net.myId;
            return (
              <li key={person.id} className="border-b last:border-b-0" style={{ borderColor: LINE }}>
                <div className="flex flex-col gap-4 px-5 py-4 xl:flex-row xl:items-center">
                  <div className="flex min-w-0 items-center gap-3 xl:w-[280px]">
                    <div className="relative">
                      <Avatar name={person.name} url={person.avatarUrl} />
                      <span
                        className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2"
                        style={{ background: presenceColor(person.status), borderColor: CARD }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold">{person.name}</span>
                        {isOwner && <Crown size={14} style={{ color: GOLD }} />}
                        {isMe && (
                          <span className="rounded border px-1.5 text-[10px] text-muted-foreground" style={{ borderColor: LINE }}>
                            Du
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ background: presenceColor(person.status) }} />
                        {presenceLabel(person.status)}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {openContributions(person.id)} offene Beiträge · {statsByUser.get(person.id)?.open ?? 0} offene Kommentare
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <PermissionChip
                      label="Bearbeiten"
                      checked={eff.canEdit}
                      disabled={!editable}
                      onChange={(v) => setPerm(person.id, "can_edit", v)}
                    />
                    <PermissionChip
                      label="Mitglieder verwalten"
                      checked={eff.canManageMembers}
                      disabled={!editable || role === "member" || role === "viewer"}
                      onChange={(v) => setPerm(person.id, "can_manage_members", v)}
                    />
                    <PermissionChip
                      label="Kommentieren"
                      checked={eff.canComment}
                      disabled={!editable}
                      onChange={(v) => setPerm(person.id, "can_comment", v)}
                    />
                  </div>

                  <div className="flex items-center gap-2 xl:ml-auto">
                    {isOwner ? (
                      <span
                        className="grid h-11 min-w-[150px] place-items-center rounded-lg border px-4 text-sm font-semibold"
                        style={{ borderColor: GOLD, color: GOLD }}
                      >
                        Besitzer
                      </span>
                    ) : (
                      <select
                        value={role}
                        disabled={!editable}
                        onChange={(e) => void net.setMemberRole(projectId, person.id, e.target.value as AssignableRole)}
                        aria-label={`Rang von ${person.name}`}
                        className="h-11 min-w-[150px] rounded-lg border bg-background px-3 text-sm font-medium text-foreground disabled:opacity-55 [&>option]:bg-background [&>option]:text-foreground"
                        style={{ borderColor: LINE }}
                      >
                        {ASSIGNABLE.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    )}

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={`Weitere Aktionen für ${person.name}`}
                        onClick={() => setMenuFor(menuFor === person.id ? null : person.id)}
                        className="grid h-11 w-11 place-items-center rounded-lg border text-muted-foreground hover:text-foreground"
                        style={{ borderColor: LINE }}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {menuFor === person.id && (
                        <div
                          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border text-sm shadow-lg"
                          style={{ background: CARD, borderColor: LINE }}
                        >
                          <button
                            type="button"
                            onClick={() => { setMenuFor(null); setQuery(person.name); }}
                            className="block w-full px-3 py-3 text-left hover:bg-muted/40"
                          >
                            Profil ansehen
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuFor(null);
                              window.dispatchEvent(new CustomEvent("pixuna:open-chat", { detail: { userId: person.id } }));
                            }}
                            className="block w-full px-3 py-3 text-left hover:bg-muted/40"
                          >
                            Direktchat öffnen
                          </button>
                          {editable && (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuFor(null);
                                if (window.confirm(`${person.name} aus dem Projekt entfernen?`)) {
                                  void net.removeMember(projectId, person.id);
                                }
                              }}
                              className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-muted/40"
                              style={{ color: "hsl(0 70% 60%)" }}
                            >
                              <UserMinus size={14} /> Aus Projekt entfernen
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}

          {filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">
              {people.length === 0
                ? "Noch keine Mitglieder. Füge Kontakte über „Mitglied hinzufügen“ hinzu."
                : "Keine passende Person gefunden."}
            </li>
          )}
        </ul>
      </div>

      {/* --------------------------------------- Einladungen (Kurzinfo) */}
      {invites.pending.length === 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border px-5 py-4" style={{ background: CARD, borderColor: LINE }}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border" style={{ borderColor: LINE }}>
            <Mail size={17} className="text-muted-foreground" />
          </div>
          <div>
            <div className="text-sm font-semibold">Keine offenen Einladungen</div>
            <div className="text-xs text-muted-foreground">Es sind derzeit keine Einladungen ausstehend.</div>
          </div>
        </div>
      )}

      {addOpen && (
        <AddMemberDialog
          available={available}
          onClose={() => setAddOpen(false)}
          onInvite={async (userId, role, perms) => {
            await invites.invite(userId, role, perms);
            setAddOpen(false);
          }}
        />
      )}

      {inviteOpen && (
        <InvitationsDialog
          rows={invites.pending}
          canManage={canManage}
          nameOf={nameOf}
          onRevoke={(id) => void invites.revoke(id)}
          onResend={(id) => void invites.resend(id)}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- Dialoge */

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border p-5"
        style={{ background: CARD, borderColor: LINE }}
      >
        <div className="mb-4 flex items-center">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="ml-auto grid h-11 w-11 place-items-center rounded-lg border text-muted-foreground"
            style={{ borderColor: LINE }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddMemberDialog({
  available, onClose, onInvite,
}: {
  available: NetworkPerson[];
  onClose: () => void;
  onInvite: (userId: string, role: AssignableRole, perms: ProjectPermissionOverrides) => Promise<void> | void;
}) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");
  const [perms, setPerms] = useState<ProjectPermissionOverrides>({});
  const base = effectivePermissions(role, perms);

  return (
    <Shell title="Mitglied hinzufügen" onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Person</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-12 w-full rounded-lg border bg-background px-3 text-sm text-foreground [&>option]:bg-background [&>option]:text-foreground"
            style={{ borderColor: LINE }}
          >
            <option value="">Kontakt wählen …</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {available.length === 0 && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Alle Kontakte sind bereits im Projekt oder eingeladen.
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Rang</span>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value as AssignableRole); setPerms({}); }}
            className="h-12 w-full rounded-lg border bg-background px-3 text-sm text-foreground [&>option]:bg-background [&>option]:text-foreground"
            style={{ borderColor: LINE }}
          >
            {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>

        <div>
          <span className="mb-1 block text-xs text-muted-foreground">Einzelberechtigungen</span>
          <div className="flex flex-wrap gap-2">
            <PermissionChip label="Bearbeiten" checked={base.canEdit} disabled={false}
                            onChange={(v) => setPerms((p) => ({ ...p, can_edit: v }))} />
            <PermissionChip label="Mitglieder verwalten" checked={base.canManageMembers} disabled={role !== "admin"}
                            onChange={(v) => setPerms((p) => ({ ...p, can_manage_members: v }))} />
            <PermissionChip label="Kommentieren" checked={base.canComment} disabled={false}
                            onChange={(v) => setPerms((p) => ({ ...p, can_comment: v }))} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-lg border px-4 text-sm" style={{ borderColor: LINE }}>
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!userId}
            onClick={() => void onInvite(userId, role, perms)}
            className="h-12 rounded-lg px-5 text-sm font-semibold disabled:opacity-50"
            style={{ background: GOLD, color: "hsl(var(--ink))" }}
          >
            Einladung absenden
          </button>
        </div>
      </div>
    </Shell>
  );
}

export default ProjectTeamTab;
