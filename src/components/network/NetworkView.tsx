import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  FolderKanban,
  UserPlus,
  MessageSquare,
  StickyNote,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Search,
  UserMinus,
  GripVertical,
  Wrench,
  FolderPlus,

} from "lucide-react";
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
import { isPlaceholderName } from "@/lib/accountProfile";
import { projectStore, useProfile } from "@/lib/projectStore";
import ChatPanel from "@/components/network/ChatPanel";
import { MemberRoleControls } from "@/components/network/MemberRoleControls";
import { PeopleTab } from "@/components/network/PeopleTab";

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

function ChatButton({
  unread,
  active,
  onClick,
  title,
}: { unread?: boolean; active?: boolean; onClick: () => void; title: string }) {
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
          : active
            ? {
                color: "hsl(var(--accent-gold))",
                borderColor: "hsl(var(--accent-gold))",
                background: "hsl(var(--accent-gold) / 0.14)",
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

/** Kommentare eines Projekts – gleiches Format wie der Chat, klar anderes Symbol. */
function CommentsButton({
  onClick,
  title,
  active,
}: { onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className="h-9 w-9 shrink-0 rounded-lg grid place-items-center border hover:bg-[hsl(var(--surface-muted))]"
      style={
        active
          ? {
              color: "hsl(var(--accent-gold))",
              borderColor: "hsl(var(--accent-gold))",
              background: "hsl(var(--accent-gold) / 0.14)",
            }
          : { color: "hsl(var(--ink-soft))", borderColor: "hsl(var(--hairline))" }
      }
    >
      <StickyNote size={19} />
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

type TabId = "contacts" | "teams" | "requests" | "devices" | "comments";

export function NetworkView({
  projects,
  folders = [],
  profile,
}: {
  projects: LocalProjectRef[];
  /** Bestehende Projektordner der Startseite (nur Anzeige, keine zweite Pflege). */
  folders?: { id: string; name: string }[];
  /** Lokales Profil – wird als Anzeigename/Funktion ins Netzwerk gespiegelt. */
  profile?: { name: string; role?: string; avatarUrl?: string };
}) {
  const net = useNetwork(projects);
  const lastPushed = useRef("");

  // Anzeigename/Funktion/Avatar in die gemeinsame Profiltabelle spiegeln.
  useEffect(() => {
    if (!net.ready || !profile) return;
    // Ein Platzhaltername darf einen echten Kontonamen niemals überschreiben.
    if (isPlaceholderName(profile.name)) return;
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

  const [tab, setTab] = useState<TabId>("teams");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NetworkProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [chat, setChat] = useState<ChatTarget | null>(null);
  /** Kommentarübersicht eines Projekts (aus den Projektzeilen heraus geöffnet). */
  const [commentsProject, setCommentsProject] = useState<string | undefined>();
  const openComments = (id: string) => { setCommentsProject(id); setTab("comments"); };
  /** Chat bzw. Kommentare direkt unter dem Projektnamen in „Projekte / Teams“. */
  const [projectPanel, setProjectPanel] = useState<{ id: string; kind: "chat" | "comments" } | null>(null);
  const toggleProjectPanel = (id: string, kind: "chat" | "comments") =>
    setProjectPanel((cur) => (cur && cur.id === id && cur.kind === kind ? null : { id, kind }));

  const [details, setDetails] = useState<NetworkPerson | null>(null);
  const [confirmContact, setConfirmContact] = useState<{ person: NetworkPerson; projects: string[] } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const { unread, refreshUnread } = useUnreadChats(net.myId, net.ready);

  /** Ordneranlage – exakt derselbe Ordnerbestand wie in der Projektliste links. */
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const commitNewFolder = () => {
    const name = newFolderName.trim();
    if (name) projectStore.addProjectFolder(name);
    setCreatingFolder(false);
    setNewFolderName("");
  };

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

  /** Offene Kontaktanfragen – nur Kennzeichnung, kein Personenstatus. */
  const pendingContactIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of net.incoming) s.add(r.person.id);
    for (const r of net.outgoing) s.add(r.person.id);
    return s;
  }, [net.incoming, net.outgoing]);

  /** Lokale und geteilte Projekte, die ich sehen darf (auch als reines Mitglied). */
  const visibleProjects = useMemo<LocalProjectRef[]>(() => {
    const map = new Map<string, LocalProjectRef>();
    for (const p of projects) map.set(p.id, p);
    for (const p of net.sharedProjects) {
      if (map.has(p.id)) continue;
      const mine = p.owner_id === net.myId || net.members.some((m) => m.project_id === p.id && m.user_id === net.myId);
      if (mine) map.set(p.id, { id: p.id, name: p.name || "Projekt" });
    }
    return [...map.values()];
  }, [projects, net.sharedProjects, net.members, net.myId]);

  const projectsOfPerson = (userId: string) =>
    net.members
      .filter((m) => m.user_id === userId)
      .map((m) => projects.find((p) => p.id === m.project_id)?.name)
      .filter(Boolean) as string[];

  const openDirect = (person: NetworkPerson) => {
    setChat({ kind: "direct", userId: person.id, title: person.name, avatarUrl: person.avatarUrl });
  };
  const openProject = (p: LocalProjectRef) => {
    setChat({ kind: "project", projectId: p.id, title: p.name });
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
    return groups;
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
      <div className="flex flex-wrap items-center gap-2">
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

      {/* Netzwerk ist ein vollwertiger Hauptbereich – volle Contentbreite, einspaltig auf Mobil. */}
      <div
        className={`mt-4 grid gap-4 grid-cols-1 ${chat ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]" : ""}`}
      >

        <div className="rounded-xl border p-3" style={surface}>
          {net.loading && <div className="p-6 text-center text-sm text-muted-foreground">Netzwerk wird geladen …</div>}

          {!net.loading && tab === "contacts" && (
            <PeopleTab
              people={net.contacts}
              pendingIds={pendingContactIds}
              projects={visibleProjects}
              memberRow={memberRow}
              canManageProject={canManageProject}
              unread={unread}
              onOpenChat={openDirect}
              onRemoveContact={(person) => setConfirmContact({ person, projects: projectsOfPerson(person.id) })}
              onAddMember={(projectId, userId) => void net.addMember(projectId, userId)}
              onRemoveMember={(projectId, userId) => void net.removeMember(projectId, userId)}
              onSetRole={(projectId, userId, role) => void net.setMemberRole(projectId, userId, role)}
              onSetPermissions={(projectId, userId, o) => void net.setMemberPermissions(projectId, userId, o)}
            />
          )}

          {!net.loading && tab === "teams" && (
            <ProjectsTab
              projects={visibleProjects}
              membersOf={membersOf}
              memberRow={memberRow}
              canManageProject={canManageProject}
              ownerLabel={(id) => ownerOf(id).label}
              contacts={net.contacts}
              peopleNames={peopleNameMap}
              unread={unread}
              onOpenChat={(p) => openProject(p)}
              onAddMember={(projectId, userId) => void net.addMember(projectId, userId)}
              onRemoveMember={(projectId, userId) => void net.removeMember(projectId, userId)}
              onSetRole={(projectId, userId, role) => void net.setMemberRole(projectId, userId, role)}
              onSetPermissions={(projectId, userId, o) => void net.setMemberPermissions(projectId, userId, o)}
            />
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



        </div>

        {chat && (
          <ChatPanel
            target={chat}
            people={peopleById}
            onRead={() => void refreshUnread()}
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

