import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  FolderKanban,
  UserPlus,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Search,
  UserMinus,
  GripVertical,
  CalendarDays,
  Wrench,
} from "lucide-react";
import { OpsCalendarTab } from "@/components/network/OpsCalendarTab";
import { DevicesTab } from "@/components/network/DevicesTab";
import { CommentsTab } from "@/components/network/CommentsTab";
import { ProjectTimeSummary } from "@/components/network/ProjectTimeSummary";
import {
  useNetwork,
  presenceColor,
  presenceLabel,
  type NetworkProfile,
  type NetworkPerson,
  type PresenceStatus,
  type LocalProjectRef,
} from "@/lib/networkStore";
import { useUnreadChats, type ChatTarget } from "@/lib/chatStore";
import {
  ROLE_LABEL,
  effectivePermissions,
  permissionsForRole,
  type ProjectPermissionOverrides,
  type ProjectRole,
} from "@/lib/projectAccess";
import { timelineStore, effectiveStatusId } from "@/lib/timelineStore";
import { projectStore, useProfile } from "@/lib/projectStore";
import ChatPanel from "@/components/network/ChatPanel";

const surface = { background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" };

function Avatar({ name, url, size = 34 }: { name: string; url?: string | null; size?: number }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 grid place-items-center border"
      style={{ width: size, height: size, background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">{initial}</span>
      )}
    </div>
  );
}

function ChatButton({ unread, onClick, title }: { unread?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={unread ? `${title} · neue Nachricht` : title}
      className={`relative h-9 w-9 shrink-0 rounded-lg grid place-items-center border hover:bg-[hsl(var(--surface-muted))] ${
        unread ? "animate-pulse" : ""
      }`}
      style={
        unread
          ? {
              color: "hsl(var(--accent-gold))",
              borderColor: "hsl(var(--accent-gold))",
              background: "hsl(var(--accent-gold) / 0.16)",
              boxShadow: "0 0 0 3px hsl(var(--accent-gold) / 0.18)",
            }
          : { color: "hsl(var(--ink-soft))", borderColor: "hsl(var(--hairline))" }
      }
    >
      <MessageSquare size={20} />
      {unread && (
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full border"
          style={{ background: "hsl(var(--accent-gold))", borderColor: "hsl(var(--surface-card))" }}
        />
      )}
    </button>
  );
}

function PersonRow({
  person,
  chat,
  right,
  onClick,
  draggable,
  onDragStart,
  handle,
}: {
  person: NetworkPerson;
  /** Chat-Symbol – steht direkt neben dem Namen. */
  chat?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  handle?: boolean;
}) {
  const offline = person.status === "offline";
  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[hsl(var(--surface-muted))]"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      style={{ cursor: draggable ? "grab" : onClick ? "pointer" : undefined }}
    >
      {handle && <GripVertical size={13} className="text-muted-foreground shrink-0" />}
      <div className="relative">
        <Avatar name={person.name} url={person.avatarUrl} />
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
          style={{ background: presenceColor(person.status), borderColor: "hsl(var(--surface-card))" }}
        />
      </div>
      <div className="min-w-0 flex-1" style={{ opacity: offline ? 0.6 : 1 }}>
        <div className="text-sm font-medium truncate flex items-center gap-2">
          <span className="truncate">{person.name}</span>
          {chat}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {person.role?.trim() || presenceLabel(person.status)}
        </div>
      </div>
      {right}
    </div>
  );
}

function Group({
  title,
  count,
  total,
  actions,
  children,
}: {
  title: string;
  count: number;
  total: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <div className="w-full flex items-center gap-1.5 px-1 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground hover:text-foreground min-w-0"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="truncate">{title}</span>
          <span className="ml-1 opacity-70">({count}/{total})</span>
        </button>
        {/* Chat-Symbol direkt neben dem Projektnamen. */}
        <div className="flex items-center gap-1">{actions}</div>
      </div>

      {open && <div className="pl-1">{children}</div>}
    </div>
  );
}

type TabId = "contacts" | "teams" | "requests" | "calendar" | "devices" | "comments";

export function NetworkView({
  projects,
  profile,
}: {
  projects: LocalProjectRef[];
  /** Lokales Profil – wird als Anzeigename/Funktion ins Netzwerk gespiegelt. */
  profile?: { name: string; role?: string; avatarUrl?: string };
}) {
  const net = useNetwork(projects);
  const lastPushed = useRef("");

  // Anzeigename/Funktion/Avatar in die gemeinsame Profiltabelle spiegeln.
  useEffect(() => {
    if (!net.ready || !profile) return;
    const avatar = profile.avatarUrl && profile.avatarUrl.length < 200_000 ? profile.avatarUrl : null;
    const key = `${profile.name}|${profile.role ?? ""}|${avatar ? avatar.length : 0}`;
    if (key === lastPushed.current) return;
    lastPushed.current = key;
    const timer = window.setTimeout(() => {
      void net.saveProfile({ display_name: profile.name ?? "", role: profile.role ?? "", avatar_url: avatar });
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net.ready, profile?.name, profile?.role, profile?.avatarUrl]);

  // Status ist mit dem lokalen Profil (Kopfzeile / „Mein Profil“) verbunden.
  const localProfile = useProfile();
  const myStatus = localProfile.status;
  useEffect(() => {
    if (!net.ready) return;
    net.setStatus(myStatus as PresenceStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net.ready, myStatus]);

  const [tab, setTab] = useState<TabId>("contacts");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NetworkProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [chat, setChat] = useState<ChatTarget | null>(null);
  const [details, setDetails] = useState<NetworkPerson | null>(null);
  const [confirmContact, setConfirmContact] = useState<{ person: NetworkPerson; projects: string[] } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const { unread, refreshUnread } = useUnreadChats(net.myId, net.ready);

  const contactsById = useMemo(() => new Map(net.contacts.map((c) => [c.id, c])), [net.contacts]);

  /** Alle bekannten Personen inkl. eigenem Profil – für Absenderanzeige im Chat. */
  const peopleById = useMemo(() => {
    const map = new Map<string, NetworkPerson>(contactsById);
    if (net.myId) {
      map.set(net.myId, {
        id: net.myId,
        name: net.myProfile?.display_name?.trim() || "Ich",
        avatarUrl: net.myProfile?.avatar_url,
        role: net.myProfile?.role,
        status: net.myStatus,
      });
    }
    return map;
  }, [contactsById, net.myId, net.myProfile, net.myStatus]);

  const byProject = useMemo(() => {
    const map = new Map<string, NetworkPerson[]>();
    for (const p of projects) map.set(p.id, []);
    const assigned = new Set<string>();
    for (const m of net.members) {
      if (!map.has(m.project_id)) continue;
      if (m.user_id === net.myId) continue;
      // Auch Projektmitglieder ohne persönlichen Kontakt gehören ins Team.
      const person = contactsById.get(m.user_id) ?? net.peopleById.get(m.user_id);
      if (!person) continue;
      map.get(m.project_id)!.push(person);
      assigned.add(person.id);
    }
    const general = net.contacts.filter((c) => !assigned.has(c.id));
    return { map, general };
  }, [contactsById, net.contacts, net.members, net.myId, net.peopleById, projects]);

  /* Namensauflösung für die gemeinsamen Übersichten (Kalender, Geräte). */
  const projectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    for (const p of net.sharedProjects) if (!map.has(p.id)) map.set(p.id, p.name || "Projekt");
    return map;
  }, [projects, net.sharedProjects]);

  const peopleNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [id, person] of peopleById) map.set(id, person.name);
    return map;
  }, [peopleById]);


  /** Mitgliedszeile (Rolle + Abweichungen) je Projekt/Person. */
  const memberRow = (projectId: string, userId: string) =>
    net.members.find((m) => m.project_id === projectId && m.user_id === userId);

  /** Echter Besitzer laut gemeinsamer Datenbasis – keine Annahme „Du". */
  const ownerOf = (projectId: string) => {
    const row = net.sharedProjects.find((p) => p.id === projectId);
    if (!row) return { id: null as string | null, label: "Du (lokal)" };
    if (row.owner_id === net.myId) return { id: row.owner_id, label: "Du" };
    return { id: row.owner_id, label: net.peopleById.get(row.owner_id)?.name ?? "Unbekannt" };
  };

  /** Darf ich in diesem Projekt Mitglieder verwalten? */
  const canManageProject = (projectId: string) => {
    const row = net.sharedProjects.find((p) => p.id === projectId);
    if (!row) return true; // rein lokales Projekt gehört mir.
    if (row.owner_id === net.myId) return true;
    const mine = memberRow(projectId, net.myId ?? "");
    if (!mine) return false;
    return effectivePermissions(mine.role as ProjectRole, mine.permissions ?? undefined).canManageMembers;
  };

  /** Offene Beiträge einer Person in einem Projekt. */
  const openContributions = (projectId: string, userId: string) =>
    timelineStore
      .getState(projectId)
      .items.filter((i) => (i.assignees ?? []).includes(userId) && effectiveStatusId(i) !== "done").length;

  const projectsOfPerson = (userId: string) =>
    net.members
      .filter((m) => m.user_id === userId)
      .map((m) => projects.find((p) => p.id === m.project_id)?.name)
      .filter(Boolean) as string[];

  const openDirect = (person: NetworkPerson) => {
    setChat({ kind: "direct", userId: person.id, title: person.name, avatarUrl: person.avatarUrl });
    setTimeout(() => void refreshUnread(), 800);
  };
  const openProject = (p: LocalProjectRef) => {
    setChat({ kind: "project", projectId: p.id, title: p.name });
    setTimeout(() => void refreshUnread(), 800);
  };

  const runSearch = async () => {
    setSearching(true);
    setResults(await net.searchUsers(query));
    setSearching(false);
  };

  /* ------------------------------ Drag & Drop ----------------------------- */
  const onDragStartPerson = (userId: string, fromProjectId: string | null) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ userId, from: fromProjectId }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (toProjectId: string | null) => async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const { userId, from } = JSON.parse(e.dataTransfer.getData("text/plain")) as {
        userId: string;
        from: string | null;
      };
      if (from === toProjectId) return;
      if (toProjectId) await net.addMember(toProjectId, userId);
      if (from) await net.removeMember(from, userId);
    } catch {
      // Ungültiger Drop – ignorieren.
    }
  };

  /** Ordner der Startseite – dieselbe Struktur, keine zweite Pflege. */
  const folderGroups = useMemo(() => {
    const groups = folders.map((f) => ({
      key: f.id,
      name: f.name,
      items: projects.filter((p) => p.folderId === f.id),
    }));
    const rest = projects.filter((p) => !p.folderId || !folders.some((f) => f.id === p.folderId));
    if (rest.length) groups.push({ key: "__root", name: "Ohne Ordner", items: rest });
    return groups.filter((g) => g.items.length > 0);
  }, [folders, projects]);

  const tabs: { id: TabId; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "teams", label: "Projekte / Teams", icon: FolderKanban },
    { id: "contacts", label: "Kontakte", icon: Users },
    { id: "requests", label: "Kontaktanfragen", icon: UserPlus, badge: net.incoming.length },
    { id: "devices", label: "Geräte & Werkzeuge", icon: Wrench },
    { id: "comments", label: "Kommentare", icon: MessageSquare },
  ];


  return (
    <div className="mt-6">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-2"
            style={{
              borderColor: tab === t.id ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
              background: tab === t.id ? "hsl(var(--accent-gold) / 0.14)" : "hsl(var(--surface-card))",
            }}
          >
            <t.icon size={14} />
            {t.label}
            {!!t.badge && (
              <span
                className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] grid place-items-center"
                style={{ background: "hsl(0 70% 55%)", color: "#fff" }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {net.error && (
        <div className="mt-4 rounded-lg border p-3 text-xs" style={{ ...surface, borderColor: "hsl(0 70% 55% / 0.4)" }}>
          {net.error}
        </div>
      )}

      <div
        className="mt-4 grid gap-4"
        style={{
          gridTemplateColumns: chat ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)",
          // Kalender und Geräte brauchen mehr Breite als die Personenlisten.
          maxWidth: chat ? 1040 : tab === "calendar" || tab === "devices" || tab === "comments" ? 880 : 576,
        }}
      >
        <div className="rounded-xl border p-3" style={surface}>
          {net.loading && <div className="p-6 text-center text-sm text-muted-foreground">Netzwerk wird geladen …</div>}

          {!net.loading && tab === "contacts" && (
            <>
              {projects.map((p) => {
                const list = byProject.map.get(p.id) ?? [];
                return (
                  <Group
                    key={p.id}
                    title={p.name}
                    count={list.filter((x) => x.status !== "offline").length}
                    total={list.length}
                    actions={
                      <ChatButton
                        unread={unread[`p:${p.id}`]}
                        onClick={() => openProject(p)}
                        title="Projektchat öffnen"
                      />
                    }
                  >
                    {list.length === 0 ? (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Keine Personen zugeordnet.</div>
                    ) : (
                      list.map((person) => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          onClick={() => setDetails(person)}
                          chat={
                            <ChatButton
                              unread={unread[`d:${person.id}`]}
                              onClick={() => openDirect(person)}
                              title="Direktchat öffnen"
                            />
                          }
                        />
                      ))
                    )}
                  </Group>
                );
              })}
              <Group
                title="Allgemein"
                count={byProject.general.filter((x) => x.status !== "offline").length}
                total={byProject.general.length}
              >
                {byProject.general.length === 0 ? (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Keine weiteren Kontakte.</div>
                ) : (
                  byProject.general.map((person) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      onClick={() => setDetails(person)}
                      chat={
                        <ChatButton
                          unread={unread[`d:${person.id}`]}
                          onClick={() => openDirect(person)}
                          title="Direktchat öffnen"
                        />
                      }
                    />
                  ))
                )}
              </Group>
            </>
          )}

          {!net.loading && tab === "teams" && (
            <div className="space-y-4">
              {/* Zentrale projektübergreifende Übersicht – Projekte einzeln ein-/ausschaltbar. */}
              <div className="rounded-lg border p-2.5" style={{ borderColor: "hsl(var(--hairline))" }}>
                <div className="flex items-center gap-2 mb-2">
                  <CalendarDays size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold">Projektübergreifender Kalender</span>
                </div>
                <OpsCalendarTab
                  projectIds={projects.map((p) => p.id)}
                  projectNames={projectNameMap}
                  peopleById={peopleNameMap}
                />
              </div>

              <div className="text-[11px] text-muted-foreground px-1">
                Personen per Drag &amp; Drop zwischen Projekten und „Allgemein“ verschieben – oder die Auswahl unten
                verwenden. Mitglieder verwalten darf nur der Projektbesitzer.
              </div>
              {projects.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">Noch keine Projekte vorhanden.</div>
              )}
              {folderGroups.map((g) => (
                <div key={g.key} className="space-y-2">
                  <div className="px-1 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
                    {g.name} ({g.items.length})
                  </div>
                  {g.items.map((p) => {
                const list = byProject.map.get(p.id) ?? [];
                const available = net.contacts.filter((c) => !list.some((m) => m.id === c.id));
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border p-2.5"
                    style={{
                      borderColor: dragOver === p.id ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                      background: dragOver === p.id ? "hsl(var(--accent-gold) / 0.08)" : undefined,
                    }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(p.id); }}
                    onDragLeave={() => setDragOver((v) => (v === p.id ? null : v))}
                    onDrop={handleDrop(p.id)}
                  >
                    <div className="flex items-center gap-2">
                      <FolderKanban size={14} className="text-muted-foreground" />
                      <span className="text-sm font-semibold truncate">{p.name} ({list.length})</span>
                      <ChatButton
                        unread={unread[`p:${p.id}`]}
                        onClick={() => openProject(p)}
                        title="Projektchat öffnen"
                      />
                      <div className="ml-auto flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          Besitzer: {ownerOf(p.id).label}
                        </span>
                      </div>
                    </div>
                    <ProjectTimeSummary projectId={p.id} peopleById={peopleNameMap} />
                    <div className="mt-1.5">
                      {list.length === 0 && (
                        <div className="px-2 py-3 text-[11px] text-muted-foreground border border-dashed rounded-md text-center"
                          style={{ borderColor: "hsl(var(--hairline))" }}>
                          Person hierher ziehen
                        </div>
                      )}
                      {list.map((person) => {
                        const row = memberRow(p.id, person.id);
                        const manage = canManageProject(p.id);
                        return (
                          <div key={person.id}>
                            <PersonRow
                              person={person}
                              handle
                              draggable
                              onDragStart={onDragStartPerson(person.id, p.id)}
                              right={
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {openContributions(p.id, person.id)} offen
                                  </span>
                                  {manage && (
                                    <button
                                      onClick={() => net.removeMember(p.id, person.id)}
                                      title="Aus Projekt entfernen (Kontakt bleibt bestehen)"
                                      className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground"
                                    >
                                      <UserMinus size={14} />
                                    </button>
                                  )}
                                </div>
                              }
                            />
                            <MemberRoleControls
                              role={(row?.role as ProjectRole) ?? "member"}
                              overrides={row?.permissions ?? {}}
                              canManage={manage && !!row}
                              onRole={(role) => net.setMemberRole(p.id, person.id, role)}
                              onOverrides={(o) => net.setMemberPermissions(p.id, person.id, o)}
                            />
                          </div>
                        );
                      })}
                    </div>
                    {canManageProject(p.id) && available.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) net.addMember(p.id, e.target.value);
                          e.target.value = "";
                        }}
                        className="mt-2 h-8 w-full rounded-md border px-2 text-xs"
                        style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
                      >
                        <option value="">Person hinzufügen …</option>
                        {available.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
                </div>
              ))}


              <div
                className="rounded-lg border p-2.5"
                style={{
                  borderColor: dragOver === "__general" ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  background: dragOver === "__general" ? "hsl(var(--accent-gold) / 0.08)" : undefined,
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver("__general"); }}
                onDragLeave={() => setDragOver((v) => (v === "__general" ? null : v))}
                onDrop={handleDrop(null)}
              >
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold">Allgemein ({byProject.general.length})</span>
                </div>
                <div className="mt-1.5">
                  {byProject.general.length === 0 ? (
                    <div className="px-2 py-3 text-[11px] text-muted-foreground border border-dashed rounded-md text-center"
                      style={{ borderColor: "hsl(var(--hairline))" }}>
                      Person hierher ziehen, um sie aus allen Projekten zu nehmen.
                    </div>
                  ) : (
                    byProject.general.map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        handle
                        draggable
                        onDragStart={onDragStartPerson(person.id, null)}
                        right={
                          <button
                            onClick={() => setConfirmContact({ person, projects: projectsOfPerson(person.id) })}
                            title="Kontakt entfernen"
                            className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground"
                          >
                            <X size={14} />
                          </button>
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {!net.loading && tab === "requests" && (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
                  Eingehende Anfragen
                </div>
                {net.incoming.length === 0 ? (
                  <div className="mt-1 px-2 py-1.5 text-[11px] text-muted-foreground">Keine offenen Anfragen.</div>
                ) : (
                  net.incoming.map((r) => (
                    <div key={r.contactId} className="flex items-center gap-2.5 px-2 py-1.5">
                      <Avatar name={r.person.display_name} url={r.person.avatar_url} />
                      <span className="flex-1 min-w-0 text-sm font-medium truncate">
                        {r.person.display_name || "Unbekannt"}
                      </span>
                      <button
                        onClick={() => net.acceptRequest(r.contactId)}
                        className="h-7 px-2 rounded-md border text-xs flex items-center gap-1"
                        style={{ borderColor: "hsl(140 60% 45%)", color: "hsl(140 60% 40%)" }}
                      >
                        <Check size={13} /> Annehmen
                      </button>
                      <button
                        onClick={() => net.declineRequest(r.contactId)}
                        className="h-7 px-2 rounded-md border text-xs flex items-center gap-1"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                      >
                        <X size={13} /> Ablehnen
                      </button>
                    </div>
                  ))
                )}
              </div>

              {net.outgoing.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
                    Gesendete Anfragen
                  </div>
                  {net.outgoing.map((r) => (
                    <div key={r.contactId} className="flex items-center gap-2.5 px-2 py-1.5">
                      <Avatar name={r.person.display_name} url={r.person.avatar_url} />
                      <span className="flex-1 min-w-0 text-sm truncate">{r.person.display_name || "Unbekannt"}</span>
                      <button
                        onClick={() => net.declineRequest(r.contactId)}
                        className="h-7 px-2 rounded-md border text-xs"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                      >
                        Zurückziehen
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
                  Personen suchen
                </div>
                <div className="mt-1.5 flex gap-2">
                  <div
                    className="flex-1 h-9 rounded-md border flex items-center gap-2 px-2.5"
                    style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
                  >
                    <Search size={14} className="text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                      placeholder="Anzeigename (min. 2 Zeichen)"
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                  <button
                    onClick={() => void runSearch()}
                    className="h-9 px-3 rounded-md border text-xs font-medium"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                  >
                    Suchen
                  </button>
                </div>
                {searching && <div className="mt-2 text-[11px] text-muted-foreground">Suche läuft …</div>}
                {!searching && results.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5 px-2 py-1.5">
                    <Avatar name={r.display_name} url={r.avatar_url} />
                    <span className="flex-1 min-w-0 text-sm truncate">{r.display_name || "Unbekannt"}</span>
                    <button
                      onClick={() => net.sendRequest(r.id)}
                      className="h-7 px-2 rounded-md border text-xs flex items-center gap-1"
                      style={{ borderColor: "hsl(var(--accent-gold))" }}
                    >
                      <UserPlus size={13} /> Anfragen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}




          {!net.loading && tab === "devices" && (
            <DevicesTab projectNames={projectNameMap} peopleById={peopleNameMap} />
          )}

          {!net.loading && tab === "comments" && (
            <CommentsTab
              projects={Array.from(projectNameMap.entries()).map(([id, name]) => ({ id, name }))}
              peopleById={peopleNameMap}
            />
          )}
        </div>

        {chat && (
          <ChatPanel
            target={chat}
            people={peopleById}
            onClose={() => { setChat(null); void refreshUnread(); }}
          />
        )}
      </div>

      {/* Personendetails */}
      {details && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDetails(null)}>
          <div className="rounded-xl border p-4 w-[320px]" style={surface} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <Avatar name={details.name} url={details.avatarUrl} size={48} />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{details.name}</div>
                <div className="text-[11px] text-muted-foreground">{details.role?.trim() || "Ohne Funktion"}</div>
                <div className="text-[11px]" style={{ color: presenceColor(details.status) }}>
                  {presenceLabel(details.status)}
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">
              Projekte: {projectsOfPerson(details.id).join(", ") || "keine"}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { openDirect(details); setDetails(null); }}
                className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5"
                style={{ borderColor: "hsl(var(--accent-gold))" }}
              >
                <MessageSquare size={13} /> Direktchat
              </button>
              <button
                onClick={() => { setConfirmContact({ person: details, projects: projectsOfPerson(details.id) }); setDetails(null); }}
                className="h-8 px-3 rounded-md border text-xs"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                Kontakt entfernen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kontakt entfernen – Bestätigung, Projektmitgliedschaften bleiben erhalten */}
      {confirmContact && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setConfirmContact(null)}>
          <div className="rounded-xl border p-4 w-[360px]" style={surface} onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">Kontakt entfernen?</div>
            <div className="mt-2 text-xs text-muted-foreground">
              {confirmContact.person.name} wird aus deiner Kontaktliste entfernt.
              {confirmContact.projects.length > 0 && (
                <>
                  {" "}Die Person bleibt weiterhin Mitglied in: <b>{confirmContact.projects.join(", ")}</b>. Wenn du das
                  nicht möchtest, entferne sie vorher im Tab „Projekte / Teams“ aus dem Projekt.
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmContact(null)}
                className="h-8 px-3 rounded-md border text-xs"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => { void net.removeContact(confirmContact.person.id); setConfirmContact(null); }}
                className="h-8 px-3 rounded-md border text-xs"
                style={{ borderColor: "hsl(0 70% 55%)", color: "hsl(0 70% 50%)" }}
              >
                Entfernen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NetworkView;

