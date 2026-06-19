import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Settings,
  Star,
  FolderKanban,
  LayoutTemplate,
  Users,
  Trash2,
  Share2,
  Pencil,
} from "lucide-react";
import { useProjects, projectStore } from "@/lib/projectStore";

const Pixuna = () => (
  <span className="font-semibold tracking-tight text-base">
    <span style={{ color: "hsl(var(--ink))" }}>Pixuna</span>
    <span style={{ color: "hsl(var(--accent-gold))" }}>CAD</span>
  </span>
);

export default function ProjectsHome() {
  const projects = useProjects();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | undefined>(projects[0]?.id);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"uebersicht" | "seiten" | "zeichnungen" | "notizen" | "varianten" | "team">(
    "seiten"
  );

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.ort.toLowerCase().includes(search.toLowerCase())
      ),
    [projects, search]
  );

  const selected = projects.find((p) => p.id === selectedId) ?? projects[0];

  const allTasks = useMemo(
    () =>
      projects.flatMap((p) =>
        p.tasks.map((t) => ({ ...t, projectName: p.name, projectId: p.id }))
      ),
    [projects]
  );

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
    >
      {/* Far-left nav rail */}
      <aside
        className="flex flex-col items-center justify-between py-4 w-14 shrink-0 border-r"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <div className="flex flex-col items-center gap-5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            A
          </div>
          <NavIcon icon={<FolderKanban size={18} />} label="Projekte" active />
          <NavIcon icon={<LayoutTemplate size={18} />} label="Vorlagen" />
          <NavIcon icon={<Star size={18} />} label="Favoriten" />
          <NavIcon icon={<Users size={18} />} label="Geteilt" />
          <NavIcon icon={<Trash2 size={18} />} label="Papierkorb" />
        </div>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-200 to-amber-400"
            title="Profil"
          />
          <button
            className="text-muted-foreground hover:text-foreground"
            title="Einstellungen"
          >
            <Settings size={18} />
          </button>
        </div>
      </aside>

      {/* Left projects column */}
      <aside
        className="w-[300px] shrink-0 flex flex-col border-r"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <div className="px-5 pt-5 pb-3">
          <Pixuna />
          <div className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            PROJEKTE
          </div>
          <button
            onClick={() => {
              const id = projectStore.createProject();
              setSelectedId(id);
            }}
            className="mt-3 w-full h-10 rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            <Plus size={15} /> Neues Projekt
          </button>
          <div
            className="mt-3 flex items-center gap-2 h-9 rounded-md px-2.5"
            style={{ background: "hsl(var(--surface-muted))" }}
          >
            <Search size={14} className="text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Projekte suchen..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {filtered.map((p) => {
            const active = selected?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                onDoubleClick={() => navigate(`/project/${p.id}`)}
                className="w-full text-left rounded-xl p-2.5 flex gap-3 transition border"
                style={{
                  background: active ? "hsl(var(--surface-card))" : "hsl(var(--surface))",
                  borderColor: active ? "hsl(var(--accent-gold) / 0.4)" : "transparent",
                  boxShadow: active ? "0 1px 0 hsl(var(--accent-gold) / 0.1)" : "none",
                }}
              >
                <img
                  src={p.thumbnail}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover shrink-0"
                  style={{ background: "hsl(var(--surface-muted))" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{p.name}</span>
                    {p.favorite && (
                      <Star size={12} className="shrink-0" fill="hsl(var(--accent-gold))" stroke="hsl(var(--accent-gold))" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{p.ort}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {p.pages.length} Seiten · {p.sheets.length} Zeichnungen
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div
          className="px-5 py-3 text-[11px] text-muted-foreground border-t"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          {projects.length} Projekte
        </div>
      </aside>

      {/* Center quick view */}
      <main className="flex-1 overflow-y-auto">
        {selected && (
          <div className="px-10 py-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{selected.name}</h1>
                <Star
                  size={18}
                  fill={selected.favorite ? "hsl(var(--accent-gold))" : "none"}
                  stroke="hsl(var(--accent-gold))"
                  className="cursor-pointer"
                  onClick={() =>
                    projectStore.updateProject(selected.id, { favorite: !selected.favorite })
                  }
                />
                <button className="text-muted-foreground" title="Mehr">···</button>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-9 px-3 rounded-md border text-sm flex items-center gap-2"
                  style={{ borderColor: "hsl(var(--hairline))" }}>
                  <Share2 size={14} /> Teilen
                </button>
                <button
                  className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-2"
                  style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
                  onClick={() => navigate(`/project/${selected.id}`)}
                >
                  <Pencil size={14} /> Öffnen
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div
              className="mt-5 flex items-center gap-7 text-sm border-b"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              {(
                [
                  ["uebersicht", "Übersicht"],
                  ["seiten", "Seiten"],
                  ["zeichnungen", "Zeichnungen"],
                  ["notizen", "Notizen"],
                  ["varianten", "Varianten"],
                  ["team", "Team"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className="py-3 relative"
                  style={{
                    color: tab === key ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
                    fontWeight: tab === key ? 600 : 400,
                  }}
                >
                  {label}
                  {tab === key && (
                    <span
                      className="absolute left-0 right-0 -bottom-px h-[2px]"
                      style={{ background: "hsl(var(--accent-gold))" }}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[260px_1fr] gap-6 mt-6">
              {/* Seitenliste */}
              <div
                className="rounded-2xl p-4"
                style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
                  SEITEN
                  <button className="text-muted-foreground"><Plus size={14} /></button>
                </div>
                <div className="mt-3 space-y-2">
                  {selected.pages.map((pg) => (
                    <div
                      key={pg.id}
                      className="flex items-center gap-3 p-2 rounded-md"
                      style={{ background: "hsl(var(--surface-muted))" }}
                    >
                      <div className="w-10 h-10 rounded bg-white border" style={{ borderColor: "hsl(var(--hairline))" }} />
                      <div className="flex-1 text-sm">{pg.title}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
                  ZEICHNUNGSBLÄTTER
                </div>
                <div className="mt-3 space-y-2">
                  {selected.sheets.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted">
                      <div className="w-10 h-10 rounded bg-white border" style={{ borderColor: "hsl(var(--hairline))" }} />
                      <div className="flex-1">
                        <div className="text-sm">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground">{s.scale}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Hero / Konzept */}
              <div
                className="rounded-2xl p-6"
                style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>04 Variante A</span>
                  <span>Geändert: {new Date(selected.updatedAt).toLocaleString("de-DE")}</span>
                </div>
                <div
                  className="mt-3 rounded-xl overflow-hidden aspect-[16/9]"
                  style={{ background: "hsl(var(--surface-muted))" }}
                >
                  <img src={selected.thumbnail} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="mt-5">
                  <div
                    className="text-xs font-semibold tracking-[0.18em]"
                    style={{ color: "hsl(var(--accent-gold))" }}
                  >
                    KONZEPT
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-xl">
                    Die Variante A öffnet den Wohn-, Ess- und Kochbereich zum See hin und schafft
                    eine fließende Verbindung zwischen Innen- und Außenraum.
                  </p>
                </div>
              </div>
            </div>

            {/* Zeitstrahl */}
            <div
              className="mt-6 rounded-2xl p-5"
              style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
            >
              <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
                ZEITSTRAHL
              </div>
              <div className="mt-5 flex items-center justify-between">
                {["03.06", "05.06", "07.06", "10.06", "12.06"].map((d, i) => (
                  <div key={d} className="flex-1 flex flex-col items-center text-center">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        background: i === 2 ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                      }}
                    />
                    <div className="text-[11px] mt-2 text-muted-foreground">{d}.2026</div>
                    <div className="text-xs mt-1">
                      {["Projekt angelegt", "Pläne hochgeladen", "Variante A", "Variante B", "Präsentation"][i]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Right dashboard */}
      <aside
        className="w-[300px] shrink-0 border-l overflow-y-auto"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        {selected && (
          <div className="p-5 space-y-5">
            <Card title="PROJEKTINFO">
              <KV label="Bauherr" value={selected.bauherr ?? "—"} />
              <KV label="Projektadresse" value={selected.ort ?? "—"} />
              <KV label="Projekttyp" value={selected.projektTyp ?? "—"} />
              <KV
                label="Status"
                value={
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: "hsl(140 55% 45%)" }} />
                    {selected.status}
                  </span>
                }
              />
              <KV label="Erstellt am" value={selected.erstelltAm ?? "—"} />
              <KV
                label="Zuletzt geändert"
                value={new Date(selected.updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
              />
            </Card>

            <Card title="AUFGABEN" action="+ Aufgabe">
              {allTasks.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => projectStore.toggleTask(t.projectId, t.id)}
                    className="accent-foreground"
                  />
                  <span className={`flex-1 truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>
                    {t.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.date ? new Date(t.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
                  </span>
                </div>
              ))}
            </Card>

            <Card title="KALENDER" action="Alle anzeigen">
              <MiniCalendar events={selected.events.map((e) => e.date)} />
              <div className="mt-3 space-y-3">
                {selected.events.map((e) => (
                  <div key={e.id}>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(e.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    <div className="text-sm font-medium">
                      {e.time} {e.title}
                    </div>
                    {e.location && (
                      <div className="text-xs text-muted-foreground">{e.location}</div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </aside>
    </div>
  );
}

function NavIcon({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button
      title={label}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground"
      style={{
        background: active ? "hsl(var(--surface-muted))" : "transparent",
        color: active ? "hsl(var(--ink))" : undefined,
      }}
    >
      {icon}
    </button>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
          {title}
        </div>
        {action && (
          <button className="text-xs" style={{ color: "hsl(var(--accent-gold))" }}>
            {action}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function MiniCalendar({ events }: { events: string[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const eventDays = new Set(events.map((d) => new Date(d).getDate()));
  const cells: (number | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="font-medium">
          {first.toLocaleString("de-DE", { month: "long", year: "numeric" })}
        </span>
        <span className="text-muted-foreground">‹ ›</span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground text-center">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mt-1 text-xs text-center">
        {cells.map((c, i) => {
          const isToday = c === today.getDate();
          const hasEvent = c && eventDays.has(c);
          return (
            <div
              key={i}
              className="h-7 flex items-center justify-center rounded-full relative"
              style={{
                background: isToday ? "hsl(var(--ink))" : "transparent",
                color: isToday ? "hsl(var(--surface))" : undefined,
                fontWeight: isToday ? 600 : undefined,
              }}
            >
              {c ?? ""}
              {hasEvent && !isToday && (
                <span
                  className="absolute -bottom-0 w-1 h-1 rounded-full"
                  style={{ background: "hsl(var(--accent-gold))" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
