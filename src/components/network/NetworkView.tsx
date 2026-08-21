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
  Trash2,
} from "lucide-react";
import {
  useNetwork,
  presenceColor,
  presenceLabel,
  type NetworkProfile,
  type NetworkPerson,
  type PresenceStatus,
  type LocalProjectRef,
} from "@/lib/networkStore";

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

function PersonRow({
  person,
  right,
}: {
  person: NetworkPerson;
  right?: React.ReactNode;
}) {
  const offline = person.status === "offline";
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[hsl(var(--surface-muted))]">
      <div className="relative">
        <Avatar name={person.name} url={person.avatarUrl} />
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
          style={{ background: presenceColor(person.status), borderColor: "hsl(var(--surface-card))" }}
        />
      </div>
      <div className="min-w-0 flex-1" style={{ opacity: offline ? 0.6 : 1 }}>
        <div className="text-sm font-medium truncate">{person.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {person.role?.trim() || presenceLabel(person.status)}
        </div>
      </div>
      {right ?? (
        <button
          title="Chat folgt im nächsten Schritt"
          disabled
          className="h-7 w-7 rounded-md grid place-items-center opacity-40 cursor-not-allowed"
        >
          <MessageSquare size={14} />
        </button>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  total,
  children,
}: {
  title: string;
  count: number;
  total: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-1 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="truncate">{title}</span>
        <span className="ml-1 opacity-70">({count}/{total})</span>
      </button>
      {open && <div className="pl-1">{children}</div>}
    </div>
  );
}

type TabId = "contacts" | "teams" | "requests";

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

  const [tab, setTab] = useState<TabId>("contacts");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NetworkProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const contactsById = useMemo(
    () => new Map(net.contacts.map((c) => [c.id, c])),
    [net.contacts]
  );

  const byProject = useMemo(() => {
    const map = new Map<string, NetworkPerson[]>();
    for (const p of projects) map.set(p.id, []);
    const assigned = new Set<string>();
    for (const m of net.members) {
      if (!map.has(m.project_id)) continue;
      const person = contactsById.get(m.user_id);
      if (!person) continue;
      map.get(m.project_id)!.push(person);
      assigned.add(person.id);
    }
    const general = net.contacts.filter((c) => !assigned.has(c.id));
    return { map, general };
  }, [contactsById, net.contacts, net.members, projects]);

  const runSearch = async () => {
    setSearching(true);
    setResults(await net.searchUsers(query));
    setSearching(false);
  };

  const tabs: { id: TabId; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "contacts", label: "Kontakte", icon: Users },
    { id: "teams", label: "Projekte / Teams", icon: FolderKanban },
    { id: "requests", label: "Kontaktanfragen", icon: UserPlus, badge: net.incoming.length },
  ];

  return (
    <div className="mt-6">
      {/* Statuswahl */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">MEIN STATUS</span>
        {(["online", "away", "busy", "offline"] as PresenceStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => net.setStatus(s)}
            className="h-7 px-2.5 rounded-md border text-xs flex items-center gap-1.5"
            style={{
              borderColor: net.myStatus === s ? presenceColor(s) : "hsl(var(--hairline))",
              background: net.myStatus === s ? `${presenceColor(s)}22` : "transparent",
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: presenceColor(s) }} />
            {presenceLabel(s)}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="mt-4 flex items-center gap-2">
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
        <div
          className="mt-4 rounded-lg border p-3 text-xs"
          style={{ ...surface, borderColor: "hsl(0 70% 55% / 0.4)" }}
        >
          {net.error}
        </div>
      )}

      <div className="mt-4 rounded-xl border p-3 max-w-xl" style={surface}>
        {net.loading && <div className="p-6 text-center text-sm text-muted-foreground">Netzwerk wird geladen …</div>}

        {!net.loading && tab === "contacts" && (
          <>
            {projects.map((p) => {
              const list = byProject.map.get(p.id) ?? [];
              return (
                <Group key={p.id} title={p.name} count={list.filter((x) => x.status !== "offline").length} total={list.length}>
                  {list.length === 0 ? (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Keine Personen zugeordnet.</div>
                  ) : (
                    list.map((person) => <PersonRow key={person.id} person={person} />)
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
                byProject.general.map((person) => <PersonRow key={person.id} person={person} />)
              )}
            </Group>
          </>
        )}

        {!net.loading && tab === "teams" && (
          <div className="space-y-3">
            {projects.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Noch keine Projekte vorhanden.</div>
            )}
            {projects.map((p) => {
              const list = byProject.map.get(p.id) ?? [];
              const available = net.contacts.filter((c) => !list.some((m) => m.id === c.id));
              return (
                <div key={p.id} className="rounded-lg border p-2.5" style={{ borderColor: "hsl(var(--hairline))" }}>
                  <div className="flex items-center gap-2">
                    <FolderKanban size={14} className="text-muted-foreground" />
                    <span className="text-sm font-semibold truncate">{p.name}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{list.length} Mitglieder</span>
                  </div>
                  <div className="mt-1.5">
                    {list.map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        right={
                          <button
                            onClick={() => net.removeMember(p.id, person.id)}
                            title="Aus Projekt entfernen"
                            className="h-7 w-7 rounded-md grid place-items-center text-muted-foreground hover:text-foreground"
                          >
                            <Trash2 size={14} />
                          </button>
                        }
                      />
                    ))}
                  </div>
                  {available.length > 0 && (
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
    </div>
  );
}

export default NetworkView;
