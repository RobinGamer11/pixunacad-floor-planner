import { useMemo, useRef, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useProjects, projectStore, type Project } from "@/lib/projectStore";

const Pixuna = () => (
  <span className="font-semibold tracking-tight text-base">
    <span style={{ color: "hsl(var(--ink))" }}>Pixuna</span>
    <span style={{ color: "hsl(var(--accent-gold))" }}>CAD</span>
  </span>
);

type Tab = "uebersicht" | "seiten" | "infos" | "team";

export default function ProjectsHome() {
  const projects = useProjects();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | undefined>(projects[0]?.id);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("seiten");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

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

  const handleAddPage = () => {
    if (!selected) return;
    const pageId = projectStore.addPage(selected.id);
    navigate(`/project/${selected.id}?page=${pageId}`);
  };

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
          <button className="text-muted-foreground hover:text-foreground" title="Einstellungen">
            <Settings size={18} />
          </button>
        </div>
      </aside>

      {/* Left projects column (collapsible) */}
      {leftOpen ? (
        <aside
          className="w-[300px] shrink-0 flex flex-col border-r relative"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <button
            onClick={() => setLeftOpen(false)}
            title="Projekte einklappen"
            className="absolute top-4 right-3 text-muted-foreground hover:text-foreground"
          >
            <PanelLeftClose size={16} />
          </button>
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
                        <Star
                          size={12}
                          className="shrink-0"
                          fill="hsl(var(--accent-gold))"
                          stroke="hsl(var(--accent-gold))"
                        />
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
      ) : (
        <div
          className="w-8 shrink-0 border-r flex items-start justify-center pt-4"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <button
            onClick={() => setLeftOpen(true)}
            title="Projekte ausklappen"
            className="text-muted-foreground hover:text-foreground"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      {/* Center */}
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
                <button
                  className="h-9 px-3 rounded-md border text-sm flex items-center gap-2"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                >
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
                  ["infos", "Infos"],
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

            {(tab === "seiten" || tab === "uebersicht") && (
              <SeitenView project={selected} onAddPage={handleAddPage} />
            )}
            {tab === "infos" && <InfosView project={selected} />}
            {tab === "team" && (
              <div className="mt-6 text-sm text-muted-foreground">
                Team-Verwaltung folgt.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Right dashboard (collapsible) */}
      {rightOpen ? (
        <aside
          className="w-[300px] shrink-0 border-l overflow-y-auto relative"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <button
            onClick={() => setRightOpen(false)}
            title="Projektinfo einklappen"
            className="absolute top-4 left-3 text-muted-foreground hover:text-foreground z-10"
          >
            <PanelRightClose size={16} />
          </button>
          {selected && (
            <div className="p-5 pt-10 space-y-5">
              <Card title="PROJEKTINFO">
                <KV label="Bauherr" value={selected.bauherr || "—"} />
                <KV label="Projektadresse" value={selected.ort || "—"} />
                <KV label="Projekttyp" value={selected.projektTyp || "—"} />
                <KV
                  label="Status"
                  value={
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: "hsl(140 55% 45%)" }}
                      />
                      {selected.status || "—"}
                    </span>
                  }
                />
                <KV label="Erstellt am" value={selected.erstelltAm || "—"} />
                <KV
                  label="Zuletzt geändert"
                  value={new Date(selected.updatedAt).toLocaleString("de-DE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
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
                    <span
                      className={`flex-1 truncate ${
                        t.done ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.date
                        ? new Date(t.date).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                          })
                        : ""}
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
                        {new Date(e.date).toLocaleDateString("de-DE", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
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
      ) : (
        <div
          className="w-8 shrink-0 border-l flex items-start justify-center pt-4"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <button
            onClick={() => setRightOpen(true)}
            title="Projektinfo ausklappen"
            className="text-muted-foreground hover:text-foreground"
          >
            <PanelRightOpen size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/* -------- Tab views -------- */

function SeitenView({ project, onAddPage }: { project: Project; onAddPage: () => void }) {
  const thumbInput = useRef<HTMLInputElement | null>(null);
  const [editKonzept, setEditKonzept] = useState(false);
  const [konzeptDraft, setKonzeptDraft] = useState(project.konzept ?? "");

  // Sheets actually placed onto a page (cad-view elements)
  const usedSheetIds = new Set<string>();
  project.pages.forEach((pg) =>
    pg.elements.forEach((el) => {
      if (el.kind === "cad-view" && el.sheetId) usedSheetIds.add(el.sheetId);
    })
  );
  const usedSheets = project.sheets.filter((s) => usedSheetIds.has(s.id));

  const handleThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      projectStore.updateProject(project.id, { thumbnail: String(r.result) });
    };
    r.readAsDataURL(f);
  };

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6 mt-6">
      {/* Seitenliste */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
          SEITEN
          <button
            onClick={onAddPage}
            title="Neue Seite hinzufügen"
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {project.pages.map((pg) => (
            <div
              key={pg.id}
              className="flex items-center gap-3 p-2 rounded-md"
              style={{ background: "hsl(var(--surface-muted))" }}
            >
              <div
                className="w-10 h-10 rounded bg-white border"
                style={{ borderColor: "hsl(var(--hairline))" }}
              />
              <div className="flex-1 text-sm truncate">{pg.title}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
          ZEICHNUNGSBLÄTTER
        </div>
        <div className="mt-3 space-y-2">
          {usedSheets.length === 0 && (
            <div className="text-xs text-muted-foreground italic px-1">
              Noch keine Zeichnungsblätter platziert.
            </div>
          )}
          {usedSheets.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted">
              <div
                className="w-10 h-10 rounded bg-white border"
                style={{ borderColor: "hsl(var(--hairline))" }}
              />
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
          <span>Projekttitelbild</span>
          <span>Geändert: {new Date(project.updatedAt).toLocaleString("de-DE")}</span>
        </div>
        <div
          className="mt-3 rounded-xl overflow-hidden aspect-[16/9] relative group"
          style={{ background: "hsl(var(--surface-muted))" }}
        >
          <img src={project.thumbnail} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => thumbInput.current?.click()}
            title="Titelbild ändern"
            className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center shadow"
            style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
          >
            <Pencil size={14} />
          </button>
          <input
            ref={thumbInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleThumb}
          />
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <div
              className="text-xs font-semibold tracking-[0.18em]"
              style={{ color: "hsl(var(--accent-gold))" }}
            >
              KONZEPT
            </div>
            {!editKonzept && (
              <button
                onClick={() => {
                  setKonzeptDraft(project.konzept ?? "");
                  setEditKonzept(true);
                }}
                title="Konzept bearbeiten"
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
          {editKonzept ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={konzeptDraft}
                onChange={(e) => setKonzeptDraft(e.target.value)}
                rows={4}
                className="w-full text-sm rounded-md border p-2 bg-transparent outline-none"
                style={{ borderColor: "hsl(var(--hairline))" }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditKonzept(false)}
                  className="h-8 px-3 rounded-md border text-xs"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => {
                    projectStore.updateProject(project.id, { konzept: konzeptDraft });
                    setEditKonzept(false);
                  }}
                  className="h-8 px-3 rounded-md text-xs font-medium"
                  style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
                >
                  Speichern
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground max-w-xl whitespace-pre-wrap">
              {project.konzept ||
                "Noch keine Beschreibung. Klicke auf das Stift-Symbol, um ein kurzes Konzept hinzuzufügen."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InfosView({ project }: { project: Project }) {
  const update = (patch: Partial<Project>) => projectStore.updateProject(project.id, patch);
  const Field = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <label className="block">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <input
        defaultValue={value}
        onBlur={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 rounded-md border px-3 text-sm bg-transparent outline-none"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
    </label>
  );

  return (
    <div
      className="mt-6 rounded-2xl p-6 grid grid-cols-2 gap-5 max-w-3xl"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <Field label="Projektname" value={project.name} onChange={(v) => update({ name: v })} />
      <Field label="Bauherr" value={project.bauherr ?? ""} onChange={(v) => update({ bauherr: v })} />
      <Field label="Projektadresse" value={project.ort} onChange={(v) => update({ ort: v })} />
      <Field
        label="Projekttyp"
        value={project.projektTyp ?? ""}
        onChange={(v) => update({ projektTyp: v })}
      />
      <Field
        label="Status"
        value={project.status ?? ""}
        onChange={(v) => update({ status: v })}
      />
      <Field
        label="Erstellt am"
        value={project.erstelltAm ?? ""}
        onChange={(v) => update({ erstelltAm: v })}
      />
      <div className="col-span-2 text-xs text-muted-foreground">
        Änderungen werden automatisch in der rechten Projektinfo übernommen.
      </div>
    </div>
  );
}

/* -------- Helpers -------- */

function NavIcon({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
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
