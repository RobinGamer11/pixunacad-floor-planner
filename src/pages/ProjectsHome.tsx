import { useEffect, useMemo, useRef, useState } from "react";
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
  Pencil,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  Check,
  X,
} from "lucide-react";
import { useProjects, projectStore, type Project, type Task, type TaskPriority } from "@/lib/projectStore";
import { WeatherStrip } from "@/components/project/WeatherStrip";
import { UebersichtView } from "@/components/project/UebersichtView";
import { FileBrowser } from "@/components/project/FileBrowser";

const Pixuna = () => (
  <span className="font-semibold tracking-tight text-base">
    <span style={{ color: "hsl(var(--ink))" }}>Pixuna</span>
    <span style={{ color: "hsl(var(--accent-gold))" }}>CAD</span>
  </span>
);

type Tab = "uebersicht" | "seiten" | "aufgaben" | "dateien" | "fotos" | "infos" | "team";

export default function ProjectsHome() {
  const projects = useProjects();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"projects" | "templates">("projects");
  const visibleProjects = useMemo(
    () => projects.filter((p) => (mode === "templates" ? p.isTemplate : !p.isTemplate)),
    [projects, mode]
  );
  const [selectedId, setSelectedId] = useState<string | undefined>(visibleProjects[0]?.id);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("seiten");
  const [leftOpen, setLeftOpen] = useState(true);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const titleMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!titleMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!titleMenuRef.current?.contains(e.target as Node)) setTitleMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [titleMenuOpen]);

  const filtered = useMemo(
    () =>
      visibleProjects.filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.ort.toLowerCase().includes(search.toLowerCase())
      ),
    [visibleProjects, search]
  );

  const selected =
    visibleProjects.find((p) => p.id === selectedId) ?? visibleProjects[0];

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
          <NavIcon
            icon={<FolderKanban size={18} />}
            label="Projekte"
            active={mode === "projects"}
            onClick={() => {
              setMode("projects");
              setSelectedId(projects.find((p) => !p.isTemplate)?.id);
            }}
          />
          <NavIcon
            icon={<LayoutTemplate size={18} />}
            label="Vorlagen"
            active={mode === "templates"}
            onClick={() => {
              setMode("templates");
              setSelectedId(projects.find((p) => p.isTemplate)?.id);
            }}
          />
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
              {mode === "templates" ? "VORLAGEN" : "PROJEKTE"}
            </div>
            {mode === "projects" && (
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
            )}
            <div
              className="mt-3 flex items-center gap-2 h-9 rounded-md px-2.5"
              style={{ background: "hsl(var(--surface-muted))" }}
            >
              <Search size={14} className="text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={mode === "templates" ? "Vorlagen suchen..." : "Projekte suchen..."}
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
                {renaming ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          projectStore.updateProject(selected.id, { name: nameDraft.trim() || selected.name });
                          setRenaming(false);
                        } else if (e.key === "Escape") {
                          setRenaming(false);
                        }
                      }}
                      className="text-2xl font-semibold tracking-tight bg-transparent border-b outline-none"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                    />
                    <button
                      onClick={() => {
                        projectStore.updateProject(selected.id, { name: nameDraft.trim() || selected.name });
                        setRenaming(false);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Speichern"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setRenaming(false)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Abbrechen"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <h1 className="text-2xl font-semibold tracking-tight">{selected.name}</h1>
                )}
                <Star
                  size={18}
                  fill={selected.favorite ? "hsl(var(--accent-gold))" : "none"}
                  stroke="hsl(var(--accent-gold))"
                  className="cursor-pointer"
                  onClick={() =>
                    projectStore.updateProject(selected.id, { favorite: !selected.favorite })
                  }
                />
                <div className="relative" ref={titleMenuRef}>
                  <button
                    onClick={() => setTitleMenuOpen((v) => !v)}
                    className="text-muted-foreground hover:text-foreground h-7 w-7 rounded-md flex items-center justify-center"
                    title="Mehr"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {titleMenuOpen && (
                    <div
                      className="absolute left-0 top-full mt-1 z-20 min-w-[180px] rounded-md border shadow-md py-1 text-sm"
                      style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
                    >
                      <button
                        onClick={() => {
                          setNameDraft(selected.name);
                          setRenaming(true);
                          setTitleMenuOpen(false);
                        }}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
                      >
                        <Pencil size={14} /> Umbenennen
                      </button>
                      <button
                        onClick={() => {
                          const label = selected.isTemplate ? "Vorlage" : "Projekt";
                          if (confirm(`${label} "${selected.name}" wirklich löschen?`)) {
                            projectStore.deleteProject(selected.id);
                            setTitleMenuOpen(false);
                            const next = projects.find(
                              (p) => p.id !== selected.id && !!p.isTemplate === !!selected.isTemplate
                            );
                            setSelectedId(next?.id);
                          }
                        }}
                        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
                        style={{ color: "hsl(0 70% 50%)" }}
                      >
                        <Trash2 size={14} /> Löschen
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.isTemplate ? (
                  <button
                    onClick={() => {
                      if (confirm("Vorlage zurücksetzen? Alle projektspezifischen Inhalte (Texte, Seiteninhalte, Termine) werden geleert.")) {
                        projectStore.resetTemplate(selected.id);
                      }
                    }}
                    className="h-9 px-3 rounded-md border text-sm flex items-center gap-2"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                  >
                    Reset
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const id = projectStore.duplicateAsTemplate(selected.id);
                      if (id) {
                        setMode("templates");
                        setSelectedId(id);
                      }
                    }}
                    className="h-9 px-3 rounded-md border text-sm flex items-center gap-2"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                    title="Als Vorlage speichern"
                  >
                    <LayoutTemplate size={14} /> Vorlage+
                  </button>
                )}
                <button
                  className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-2"
                  style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
                  onClick={() => navigate(`/project/${selected.id}`)}
                >
                  <Pencil size={14} /> Bearbeiten
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
                  ["aufgaben", "Aufgaben"],
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

            {tab === "uebersicht" && (
              <UebersichtView project={selected} onAddPage={handleAddPage} />
            )}
            {tab === "seiten" && (
              <SeitenView project={selected} onAddPage={handleAddPage} />
            )}
            {tab === "aufgaben" && <AufgabenView project={selected} />}
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
                {selected.customFields?.map((f) => (
                  <KV key={f.id} label={f.label} value={f.value || "—"} />
                ))}
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

function UebersichtView({ project, onAddPage }: { project: Project; onAddPage: () => void }) {
  return (
    <div className="space-y-6">
      <SeitenInhaltGrid project={project} onAddPage={onAddPage} />
      <TaskTimeline project={project} />
    </div>
  );
}

function SeitenView({ project, onAddPage }: { project: Project; onAddPage: () => void }) {
  const [selectedPageId, setSelectedPageId] = useState<string | undefined>(project.pages[0]?.id);
  const selectedPage =
    project.pages.find((p) => p.id === selectedPageId) ?? project.pages[0];

  const isLandscape = (selectedPage?.format ?? "A3-quer").includes("quer");

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6 mt-6">
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
          {project.pages.map((pg) => {
            const active = pg.id === selectedPage?.id;
            return (
              <button
                key={pg.id}
                onClick={() => setSelectedPageId(pg.id)}
                className="w-full flex items-center gap-3 p-2 rounded-md text-left transition border"
                style={{
                  background: active
                    ? "hsl(var(--surface-muted))"
                    : "hsl(var(--surface))",
                  borderColor: active ? "hsl(var(--accent-gold) / 0.4)" : "transparent",
                }}
              >
                <div
                  className="w-10 h-10 rounded bg-white border shrink-0"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                />
                <div className="flex-1 text-sm truncate">{pg.title}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="rounded-2xl p-6 flex flex-col items-center"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        {selectedPage && (
          <>
            <div className="w-full flex items-center justify-between text-xs text-muted-foreground mb-4">
              <span className="font-medium text-sm" style={{ color: "hsl(var(--ink))" }}>
                {selectedPage.title}
              </span>
              <span>{selectedPage.format}</span>
            </div>
            <div
              className="bg-white border shadow-sm"
              style={{
                borderColor: "hsl(var(--hairline))",
                width: isLandscape ? "100%" : "70%",
                aspectRatio: isLandscape ? "1.414 / 1" : "1 / 1.414",
                maxWidth: "100%",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function TaskTimeline({ project }: { project: Project }) {
  const tasks = [...project.tasks].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? "")
  );
  const firstOpenIdx = tasks.findIndex((t) => !t.done);

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div
        className="text-xs font-semibold tracking-[0.18em] mb-5"
        style={{ color: "hsl(var(--accent-gold))" }}
      >
        ZEITSTRAHL
      </div>
      <div className="relative">
        <div
          className="absolute left-0 right-0 top-2 h-px"
          style={{ background: "hsl(var(--hairline))" }}
        />
        <div className="flex justify-between gap-3 relative">
          {tasks.map((t, i) => {
            let dotColor = "hsl(var(--surface-muted))";
            let dotBorder = "hsl(var(--hairline))";
            if (t.done) {
              dotColor = "hsl(var(--accent-gold) / 0.35)";
              dotBorder = "hsl(var(--accent-gold) / 0.5)";
            } else if (i === firstOpenIdx) {
              dotColor = "hsl(var(--accent-gold))";
              dotBorder = "hsl(var(--accent-gold))";
            }
            return (
              <div key={t.id} className="flex-1 flex flex-col items-center text-center min-w-0">
                <span
                  className="w-4 h-4 rounded-full border-2 relative z-10"
                  style={{ background: dotColor, borderColor: dotBorder }}
                />
                <div className="mt-3 text-[11px] text-muted-foreground">
                  {t.date
                    ? new Date(t.date).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                      })
                    : ""}
                </div>
                <div
                  className="mt-1 text-xs leading-tight px-1 truncate w-full"
                  style={{
                    color: t.done
                      ? "hsl(var(--ink-soft))"
                      : i === firstOpenIdx
                      ? "hsl(var(--ink))"
                      : "hsl(var(--ink-soft))",
                    fontWeight: i === firstOpenIdx ? 600 : 400,
                  }}
                  title={t.title}
                >
                  {t.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SeitenInhaltGrid({ project, onAddPage }: { project: Project; onAddPage: () => void }) {
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

function AufgabenView({ project }: { project: Project }) {
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<{ title: string; date: string; time: string; priority: TaskPriority }>({
    title: "",
    date: "",
    time: "",
    priority: "medium",
  });

  const tasks = [...project.tasks].sort((a, b) => {
    const da = `${a.date ?? "9999-99-99"} ${a.time ?? "99:99"}`;
    const db = `${b.date ?? "9999-99-99"} ${b.time ?? "99:99"}`;
    return da.localeCompare(db);
  });

  const filtered = selectedDate ? tasks.filter((t) => t.date === selectedDate) : tasks;

  const addTask = () => {
    if (!draft.title.trim()) return;
    projectStore.addTask(project.id, {
      title: draft.title.trim(),
      date: draft.date || undefined,
      time: draft.time || undefined,
      priority: draft.priority,
    });
    setDraft({ title: "", date: selectedDate ?? "", time: "", priority: "medium" });
  };

  return (
    <div className="mt-6 space-y-5">
      {/* Kalender ganz oben */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          KALENDER
        </div>
        <TaskCalendar
          tasks={project.tasks}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setDraft((s) => ({ ...s, date: d ?? "" }));
          }}
        />
        <div className="mt-3 text-[11px] text-muted-foreground">
          Tipp: Tag im Kalender klicken, dann unten Aufgabe für diesen Tag hinzufügen.
        </div>
      </div>

      {/* Neue Aufgabe */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          NEUE AUFGABE
        </div>
        <div className="grid grid-cols-[1fr_140px_110px_130px_auto] gap-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Titel der Aufgabe…"
            className="h-9 px-3 rounded-md border bg-transparent text-sm outline-none"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className="h-9 px-2 rounded-md border bg-transparent text-sm outline-none"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <input
            type="time"
            value={draft.time}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            className="h-9 px-2 rounded-md border bg-transparent text-sm outline-none"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <select
            value={draft.priority}
            onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
            className="h-9 px-2 rounded-md border bg-transparent text-sm outline-none"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <option value="low">Niedrig</option>
            <option value="medium">Mittel</option>
            <option value="high">Hoch</option>
          </select>
          <button
            onClick={addTask}
            className="h-9 px-4 rounded-md text-sm font-medium flex items-center gap-1"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            <Plus size={14} /> Hinzufügen
          </button>
        </div>
      </div>

      {/* Aufgabenliste */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            AUFGABEN {selectedDate && `· ${new Date(selectedDate).toLocaleDateString("de-DE")}`}
          </div>
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(undefined)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Filter aufheben
            </button>
          )}
        </div>
        <div className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
          {filtered.length === 0 && (
            <div className="text-sm text-muted-foreground italic py-3">
              Keine Aufgaben.
            </div>
          )}
          {filtered.map((t) => (
            <TaskRow key={t.id} task={t} projectId={project.id} />
          ))}
        </div>
      </div>

      <TaskTimeline project={project} />
    </div>
  );
}

function TaskRow({ task, projectId }: { task: Task; projectId: string }) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({
    title: task.title,
    date: task.date ?? "",
    time: task.time ?? "",
    priority: (task.priority ?? "medium") as TaskPriority,
  });
  const prio = task.priority ?? "medium";
  const prioColor =
    prio === "high"
      ? "hsl(0 70% 55%)"
      : prio === "medium"
      ? "hsl(var(--accent-gold))"
      : "hsl(140 35% 55%)";

  if (editing) {
    return (
      <div className="grid grid-cols-[1fr_140px_110px_130px_auto_auto] gap-2 py-2 items-center">
        <input
          value={d.title}
          onChange={(e) => setD({ ...d, title: e.target.value })}
          className="h-8 px-2 rounded-md border bg-transparent text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
        <input
          type="date"
          value={d.date}
          onChange={(e) => setD({ ...d, date: e.target.value })}
          className="h-8 px-2 rounded-md border bg-transparent text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
        <input
          type="time"
          value={d.time}
          onChange={(e) => setD({ ...d, time: e.target.value })}
          className="h-8 px-2 rounded-md border bg-transparent text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
        <select
          value={d.priority}
          onChange={(e) => setD({ ...d, priority: e.target.value as TaskPriority })}
          className="h-8 px-2 rounded-md border bg-transparent text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <option value="low">Niedrig</option>
          <option value="medium">Mittel</option>
          <option value="high">Hoch</option>
        </select>
        <button
          onClick={() => {
            projectStore.updateTask(projectId, task.id, {
              title: d.title,
              date: d.date || undefined,
              time: d.time || undefined,
              priority: d.priority,
            });
            setEditing(false);
          }}
          className="h-8 px-3 rounded-md text-xs font-medium"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
        >
          OK
        </button>
        <button
          onClick={() => setEditing(false)}
          className="h-8 px-2 text-xs text-muted-foreground"
        >
          Abbr.
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5">
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => projectStore.toggleTask(projectId, task.id)}
        className="accent-foreground"
      />
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: prioColor }}
        title={`Priorität: ${prio}`}
      />
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm truncate ${task.done ? "line-through text-muted-foreground" : ""}`}
        >
          {task.title}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {task.date
            ? new Date(task.date).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : "Ohne Datum"}
          {task.time ? ` · ${task.time}` : ""}
        </div>
      </div>
      <button
        onClick={() => setEditing(true)}
        title="Bearbeiten"
        className="text-muted-foreground hover:text-foreground"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={() => projectStore.deleteTask(projectId, task.id)}
        title="Löschen"
        className="text-muted-foreground hover:text-foreground"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TaskCalendar({
  tasks,
  selectedDate,
  onSelectDate,
}: {
  tasks: Task[];
  selectedDate?: string;
  onSelectDate: (date: string | undefined) => void;
}) {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const first = new Date(view.year, view.month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const byDay = new Map<number, Task[]>();
  tasks.forEach((t) => {
    if (!t.date) return;
    const d = new Date(t.date);
    if (d.getFullYear() === view.year && d.getMonth() === view.month) {
      const day = d.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(t);
    }
  });
  const cells: (number | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const fmt = (d: number) =>
    `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const nav = (dir: number) => {
    const m = view.month + dir;
    const y = view.year + Math.floor(m / 12);
    setView({ year: y, month: ((m % 12) + 12) % 12 });
  };

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <button onClick={() => nav(-1)} className="text-muted-foreground hover:text-foreground px-1">
          ‹
        </button>
        <span className="font-medium">
          {first.toLocaleString("de-DE", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => nav(1)} className="text-muted-foreground hover:text-foreground px-1">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground text-center">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mt-1 text-xs">
        {cells.map((c, i) => {
          if (c === null) return <div key={i} className="h-9" />;
          const iso = fmt(c);
          const dayTasks = byDay.get(c) ?? [];
          const isToday =
            today.getFullYear() === view.year &&
            today.getMonth() === view.month &&
            today.getDate() === c;
          const isSelected = iso === selectedDate;
          const hasOpen = dayTasks.some((t) => !t.done);
          const hasHigh = dayTasks.some((t) => !t.done && t.priority === "high");
          return (
            <button
              key={i}
              onClick={() => onSelectDate(isSelected ? undefined : iso)}
              className="h-9 flex flex-col items-center justify-center rounded-md relative"
              style={{
                background: isSelected
                  ? "hsl(var(--accent-gold) / 0.2)"
                  : isToday
                  ? "hsl(var(--ink))"
                  : "transparent",
                color: isToday && !isSelected ? "hsl(var(--surface))" : undefined,
                border: isSelected
                  ? "1px solid hsl(var(--accent-gold))"
                  : "1px solid transparent",
                fontWeight: isToday || isSelected ? 600 : undefined,
              }}
            >
              <span>{c}</span>
              {dayTasks.length > 0 && (
                <span className="flex gap-0.5 absolute bottom-1">
                  <span
                    className="w-1 h-1 rounded-full"
                    style={{
                      background: hasHigh
                        ? "hsl(0 70% 55%)"
                        : hasOpen
                        ? "hsl(var(--accent-gold))"
                        : "hsl(var(--ink-soft))",
                    }}
                  />
                </span>
              )}
            </button>
          );
        })}
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

      {(project.customFields ?? []).map((f) => (
        <CustomFieldEditor key={f.id} projectId={project.id} field={f} />
      ))}

      <div className="col-span-2 flex items-center justify-between">
        <AddCustomFieldControl projectId={project.id} />
        <div className="text-xs text-muted-foreground">
          Änderungen werden automatisch in der rechten Projektinfo übernommen.
        </div>
      </div>
    </div>
  );
}

function CustomFieldEditor({
  projectId,
  field,
}: {
  projectId: string;
  field: { id: string; label: string; value: string };
}) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(field.label);
  return (
    <label className="block">
      <div className="flex items-center gap-1.5 min-h-[18px]">
        {editingLabel ? (
          <>
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  projectStore.updateCustomField(projectId, field.id, {
                    label: labelDraft.trim() || field.label,
                  });
                  setEditingLabel(false);
                } else if (e.key === "Escape") {
                  setLabelDraft(field.label);
                  setEditingLabel(false);
                }
              }}
              className="text-[11px] font-semibold tracking-[0.18em] bg-transparent border-b outline-none flex-1"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
            <button
              type="button"
              onClick={() => {
                projectStore.updateCustomField(projectId, field.id, {
                  label: labelDraft.trim() || field.label,
                });
                setEditingLabel(false);
              }}
              className="text-muted-foreground hover:text-foreground"
              title="Speichern"
            >
              <Check size={12} />
            </button>
          </>
        ) : (
          <>
            <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground flex-1 uppercase">
              {field.label}
            </span>
            <button
              type="button"
              onClick={() => {
                setLabelDraft(field.label);
                setEditingLabel(true);
              }}
              className="text-muted-foreground hover:text-foreground"
              title="Umbenennen"
            >
              <Pencil size={11} />
            </button>
            <button
              type="button"
              onClick={() => projectStore.deleteCustomField(projectId, field.id)}
              className="text-muted-foreground hover:text-foreground"
              title="Feld löschen"
            >
              <Trash2 size={11} />
            </button>
          </>
        )}
      </div>
      <input
        defaultValue={field.value}
        key={field.value}
        onBlur={(e) => projectStore.updateCustomField(projectId, field.id, { value: e.target.value })}
        className="mt-1 w-full h-9 rounded-md border px-3 text-sm bg-transparent outline-none"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
    </label>
  );
}

function AddCustomFieldControl({ projectId }: { projectId: string }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const save = () => {
    const v = label.trim();
    if (!v) return;
    projectStore.addCustomField(projectId, v);
    setLabel("");
    setAdding(false);
  };
  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="h-9 px-3 rounded-md border text-sm flex items-center gap-2"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <Plus size={14} /> Feld
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") {
            setAdding(false);
            setLabel("");
          }
        }}
        placeholder="Feldtitel…"
        className="h-9 px-3 rounded-md border text-sm bg-transparent outline-none"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
      <button
        onClick={save}
        title="Speichern"
        className="h-9 w-9 rounded-md flex items-center justify-center"
        style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
      >
        <Check size={14} />
      </button>
      <button
        onClick={() => {
          setAdding(false);
          setLabel("");
        }}
        title="Abbrechen"
        className="h-9 w-9 rounded-md border flex items-center justify-center text-muted-foreground hover:text-foreground"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}


/* -------- Helpers -------- */

function NavIcon({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
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
