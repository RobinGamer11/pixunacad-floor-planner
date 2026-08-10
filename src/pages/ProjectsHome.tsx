import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Network,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  FolderPlus,
  Circle,
  Coins,
  ShoppingBag,
  ListChecks,
  Play,
  Image as ImageIcon,
  Home,
  LogOut,
  PlusCircle,
} from "lucide-react";



import {
  useProjects,
  projectStore,
  useFolders,
  useProfile,
  MAX_PROJECTS,
  type Project,
  type Task,
  type TaskPriority,
  type ProjectFolder,
  type ProfileStatus,
} from "@/lib/projectStore";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import { notesStore, useNotes, QUICK_CATEGORY, type NoteNode, type NoteStatus, type NotePriority } from "@/lib/notesStore";
import { WeatherStrip } from "@/components/project/WeatherStrip";
import { UebersichtView } from "@/components/project/UebersichtView";
import { FileBrowser } from "@/components/project/FileBrowser";
import { PageThumb } from "@/components/project/PageThumb";
import { FinanceProjectOverview } from "@/components/finance/FinanceProjectOverview";
import { geocodeSearch, type GeoHit } from "@/lib/weather";
import { useAuth } from "@/components/auth/AuthProvider";
import { setExternalContentConsent, useExternalContentConsent } from "@/lib/externalContent";

const Pixuna = () => (
  <span className="font-semibold tracking-tight text-base">
    <span style={{ color: "hsl(var(--ink))" }}>Pixuna</span>
    <span style={{ color: "hsl(var(--accent-gold))" }}>CAD</span>
  </span>
);

type Tab = "uebersicht" | "seiten" | "aufgaben" | "finanzen" | "dokumente" | "team";
type DokumenteSubTab = "dateien" | "fotos";

export default function ProjectsHome() {
  const projects = useProjects();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [mode, setMode] = useState<"projects" | "templates">("projects");
  const visibleProjects = useMemo(
    () => projects.filter((p) => (mode === "templates" ? p.isTemplate : !p.isTemplate)),
    [projects, mode]
  );
  // Sidebar zeigt IMMER die Projekte (nicht Vorlagen), egal welche Center-Ansicht aktiv ist
  const sidebarProjects = useMemo(
    () => projects.filter((p) => !p.isTemplate),
    [projects]
  );
  // Startseite öffnet zuerst die projektübergreifende Aufgabenübersicht.
  const [showAllTasks, setShowAllTasks] = useState(true);
  /** Zusätzliche Kopf-Ansichten (Hauptseite, Geteilt, Papierkorb). */
  const [hub, setHub] = useState<null | "home" | "shared" | "trash">(null);
  const [coinsOpen, setCoinsOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const coinsRef = useRef<HTMLDivElement | null>(null);
  const shopRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!coinsOpen && !shopOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (coinsOpen && !coinsRef.current?.contains(e.target as Node)) setCoinsOpen(false);
      if (shopOpen && !shopRef.current?.contains(e.target as Node)) setShopOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [coinsOpen, shopOpen]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("uebersicht");
  const headerScrollRef = useDragScroll<HTMLElement>();
  const tabsScrollRef = useDragScroll<HTMLDivElement>();
  const [dokumenteSubTab, setDokumenteSubTab] = useState<DokumenteSubTab>("dateien");
  const [leftOpen, setLeftOpen] = useState(true);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
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
      sidebarProjects.filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.ort.toLowerCase().includes(search.toLowerCase())
      ),
    [sidebarProjects, search]
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

  const folders = useFolders();
  const profile = useProfile();

  // Ordner-Anlage (Name eingeben vor Erstellung)
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState("");

  // Profil-Dropdown
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!profileOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [profileOpen]);

  // "+ Projekt"-Popup (Neu / Vorlage)
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectMode, setNewProjectMode] = useState<"choice" | "fromTemplate">("choice");
  const newProjectRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!newProjectOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!newProjectRef.current?.contains(e.target as Node)) {
        setNewProjectOpen(false);
        setNewProjectMode("choice");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [newProjectOpen]);

  // "Vorlage +"-Popup im Vorlagen-Hub
  const [saveAsTplOpen, setSaveAsTplOpen] = useState(false);
  const saveAsTplRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!saveAsTplOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!saveAsTplRef.current?.contains(e.target as Node)) setSaveAsTplOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [saveAsTplOpen]);


  // Drag & Drop von Projekten in Ordner
  const [dragProjectId, setDragProjectId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | "root" | null>(null);

  const projectsByFolder = useMemo(() => {
    const map = new Map<string | null, Project[]>();
    for (const p of filtered) {
      const key = p.folderId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [filtered]);

  const rootProjects = projectsByFolder.get(null) ?? [];
  const projectCount = projects.filter((p) => !p.isTemplate).length;
  const canCreateProject = projectCount < MAX_PROJECTS;

  const createProject = () => {
    if (!canCreateProject) {
      alert(`Maximal ${MAX_PROJECTS} Projekte möglich. Lösche zuerst ein bestehendes Projekt.`);
      return;
    }
    // Zuerst Einstellungsfenster zeigen – Projekt wird erst danach angelegt.
    setNewProjectDialogOpen(true);
  };

  const finishCreateProject = (values: {
    name: string;
    bauherr: string;
    ort: string;
    projektTyp: string;
    status: string;
    erstelltAm: string;
  }) => {
    const id = projectStore.createProject();
    projectStore.updateProject(id, values);
    setNewProjectDialogOpen(false);
    setMode("projects");
    setShowAllTasks(false);
    setSelectedId(id);
  };

  const deleteProjectWithConfirm = (p: Project) => {
    const label = p.isTemplate ? "Vorlage" : "Projektmappe";
    const msg = `${label} „${p.name}" wirklich löschen?\n\nAlle Inhalte werden endgültig entfernt:\n• Seiten & Zeichenblätter\n• CAD-Elemente & Bemaßungen\n• Board-Themen, Aufgaben & Notizen\n• Dateien & Fotos\n\nDieser Vorgang kann nicht rückgängig gemacht werden.`;
    if (!confirm(msg)) return;
    projectStore.deleteProject(p.id);
    if (selectedId === p.id) {
      const next = projects.find((x) => x.id !== p.id && !!x.isTemplate === !!p.isTemplate);
      setSelectedId(next?.id);
    }
  };

  const commitNewFolder = () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      setNewFolderName("");
      return;
    }
    projectStore.addProjectFolder(name);
    setCreatingFolder(false);
    setNewFolderName("");
  };

  const handleDropOnFolder = (folderId: string | null) => {
    if (dragProjectId) {
      projectStore.moveProjectToFolder(dragProjectId, folderId);
    }
    setDragProjectId(null);
    setDragOverFolder(null);
  };

  const statusColor = (s: ProfileStatus) =>
    s === "online" ? "hsl(140 60% 45%)" : s === "busy" ? "hsl(0 70% 55%)" : "hsl(0 0% 65%)";
  const statusLabel = (s: ProfileStatus) =>
    s === "online" ? "Online" : s === "busy" ? "Beschäftigt" : "Offline";

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
    >
      {/* ============= TOP HEADER ============= */}
      <header
        ref={headerScrollRef}
        className="h-16 shrink-0 flex items-center gap-4 px-6 border-b overflow-x-auto no-scrollbar touch-pan-x"
        style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
      >
        <div className="relative" ref={newProjectRef}>

          <button
            onClick={() => {
              // Toggle: erneuter Klick schließt das Fenster wieder
              setNewProjectOpen((v) => {
                const next = !v;
                if (!next) setNewProjectMode("choice");
                return next;
              });
              setNewProjectMode("choice");
            }}
            disabled={!canCreateProject}
            className="h-12 px-5 rounded-lg flex items-center gap-2 text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
            title={canCreateProject ? "Neues Projekt anlegen" : `Maximal ${MAX_PROJECTS} Projekte`}
          >
            <Plus size={18} /> Projekt
          </button>

          {newProjectOpen && (
            <div
              /* fixed, damit die horizontal scrollbare Kopfzeile nicht abschneidet */
              className="fixed left-6 top-16 mt-2 w-72 rounded-xl border shadow-lg z-50 p-3"
              style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
            >
              {newProjectMode === "choice" ? (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold tracking-[0.16em] uppercase px-1 pb-1" style={{ color: "hsl(var(--ink-soft))" }}>
                    Neues Projekt
                  </div>
                  <button
                    onClick={() => {
                      createProject();
                      setNewProjectOpen(false);
                      setNewProjectMode("choice");
                    }}
                    className="h-10 rounded-md flex items-center gap-2 px-3 text-sm font-medium hover:opacity-90"
                    style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
                  >
                    <Plus size={14} /> Neu
                  </button>
                  <button
                    onClick={() => setNewProjectMode("fromTemplate")}
                    className="h-10 rounded-md flex items-center gap-2 px-3 text-sm font-medium border hover:bg-muted"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                  >
                    <LayoutTemplate size={14} /> Vorlage
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] font-semibold tracking-[0.16em] uppercase px-1 pb-1" style={{ color: "hsl(var(--ink-soft))" }}>
                    Aus Vorlage
                  </div>
                  {(() => {
                    const tpls = projects.filter((p) => p.isTemplate);
                    if (tpls.length === 0) {
                      return (
                        <div className="text-xs text-muted-foreground p-3 rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
                          Noch keine Vorlagen vorhanden.
                        </div>
                      );
                    }
                    return (
                      <select
                        autoFocus
                        defaultValue=""
                        onChange={(e) => {
                          const tid = e.target.value;
                          if (!tid) return;
                          const id = projectStore.createFromTemplate(tid);
                          if (id) {
                            setMode("projects");
                            setSelectedId(id);
                          }
                          setNewProjectOpen(false);
                          setNewProjectMode("choice");
                        }}
                        className="h-10 rounded-md border px-2 text-sm bg-transparent"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                      >
                        <option value="" disabled>Vorlage wählen…</option>
                        {tpls.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    );
                  })()}
                  <button
                    onClick={() => setNewProjectMode("choice")}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground text-left px-1"
                  >
                    ← Zurück
                  </button>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Nav-Icons mit feinen vertikalen Trennstrichen */}
        <div className="ml-2 flex items-center h-10">
          <NavIcon
            icon={<Home size={18} strokeWidth={1.5} />}
            label="Hauptseite"
            active={hub === "home"}
            onClick={() => { setShowAllTasks(false); setHub(hub === "home" ? null : "home"); }}
          />
          <HeaderDivider />
          <NavIcon
            icon={<ListChecks size={18} strokeWidth={1.5} />}
            label="Alle Aufgaben"
            active={showAllTasks && !hub}
            onClick={() => { setHub(null); setMode("projects"); setShowAllTasks(true); }}
          />

          <HeaderDivider />
          <NavIcon
            icon={<Users size={18} strokeWidth={1.5} />}
            label="Geteilt"
            active={hub === "shared"}
            onClick={() => { setShowAllTasks(false); setHub(hub === "shared" ? null : "shared"); }}
          />
          <HeaderDivider />
          <NavIcon
            icon={<Trash2 size={18} strokeWidth={1.5} />}
            label="Papierkorb"
            active={hub === "trash"}
            onClick={() => { setShowAllTasks(false); setHub(hub === "trash" ? null : "trash"); }}
          />
        </div>

        <div className="flex-1" />

        {/* Münzen-Pill (kompakt) mit + zum Kauf */}
        <div className="relative" ref={coinsRef}>
          <button
            onClick={() => setCoinsOpen((v) => !v)}
            className="flex items-center gap-1.5 h-9 pl-3 pr-1 rounded-full border hover:bg-muted/40 transition"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
            title="Münzen"
          >
            <Coins size={15} strokeWidth={1.5} className="text-muted-foreground" />
            <span className="text-sm font-semibold">26</span>
            <span
              className="ml-1 h-6 w-6 rounded-full border flex items-center justify-center"
              style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}
            >
              <Plus size={12} strokeWidth={2} className="text-muted-foreground" />
            </span>
          </button>
          {coinsOpen && <CoinsPanel />}
        </div>

        {/* Shop (näher am Münzenfenster, ohne Rahmen) */}
        <div className="relative ml-1" ref={shopRef}>
          <button
            onClick={() => setShopOpen((v) => !v)}
            className="h-8 w-8 flex items-center justify-center hover:opacity-80"
            title="Shop"
          >
            <ShoppingBag size={18} strokeWidth={1.5} className="text-muted-foreground" />
          </button>
          {shopOpen && <ShopPanel />}
        </div>

        {/* Profil oben rechts (ohne Rahmen, Text innerhalb Avatar-Höhe) */}
        <div className="relative ml-2" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-3 h-14 pl-1 pr-2 rounded-full hover:bg-muted/40 transition"
            title="Profil"
          >
            <ProfileAvatar
              profile={profile}
              count={projectCount}
              max={MAX_PROJECTS}
              size={52}
            />
            <div className="hidden md:flex flex-col justify-center leading-tight text-left" style={{ height: 52, maxWidth: 160 }}>
              <span className="text-sm font-semibold truncate">{profile.name}</span>
              <span className="text-[11px] text-muted-foreground truncate">{profile.role}</span>
              <span
                className="text-[11px] font-medium truncate"
                style={{ color: statusColor(profile.status) }}
              >
                {statusLabel(profile.status)}
              </span>
            </div>
          </button>

          {profileOpen && (
            <div
              /* fixed statt absolute: die Kopfzeile scrollt horizontal
                 (overflow-x-auto) und würde ein absolutes Panel abschneiden. */
              className="fixed right-6 top-16 mt-2 w-80 rounded-xl border shadow-lg z-50 p-4"
              style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <div className="relative">
                  <ProfileAvatar profile={profile} count={projectCount} max={MAX_PROJECTS} size={72} large />
                  <label
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border shadow flex items-center justify-center cursor-pointer"
                    style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
                    title="Profilbild ändern"
                  >
                    <ImageIcon size={13} className="text-muted-foreground" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const r = new FileReader();
                        r.onload = () => projectStore.updateProfile({ avatarUrl: String(r.result) });
                        r.readAsDataURL(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  </div>
                  <div className="mt-1.5 text-[10px] font-semibold whitespace-nowrap" style={{ color: "hsl(var(--ink-soft))" }}>
                    {projectCount} / {MAX_PROJECTS}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <input
                    value={profile.name}
                    onChange={(e) => projectStore.updateProfile({ name: e.target.value })}
                    className="w-full bg-transparent text-sm font-semibold outline-none border-b pb-1"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                  />
                  <input
                    value={profile.role}
                    onChange={(e) => projectStore.updateProfile({ role: e.target.value })}
                    placeholder="Funktion / Status"
                    className="mt-2 w-full bg-transparent text-xs text-muted-foreground outline-none border-b pb-1"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                  />
                  {profile.avatarUrl && (
                    <button
                      onClick={() => projectStore.updateProfile({ avatarUrl: undefined })}
                      className="mt-2 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Bild entfernen
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <div className="flex gap-2">

                  {(["online", "busy", "offline"] as ProfileStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => projectStore.updateProfile({ status: s })}
                      className="flex-1 h-8 rounded-md border text-xs flex items-center justify-center gap-1.5"
                      style={{
                        borderColor:
                          profile.status === s ? statusColor(s) : "hsl(var(--hairline))",
                        background:
                          profile.status === s ? `${statusColor(s)}20` : "transparent",
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: statusColor(s) }}
                      />
                      {statusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="mt-4 rounded-lg p-3 text-xs flex items-center justify-between"
                style={{ background: "hsl(var(--surface-muted))" }}
              >
                <span className="text-muted-foreground">Projekte</span>
                <span className="font-semibold">
                  {projectCount} / {MAX_PROJECTS}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Logout (ohne Rahmen) */}
        <button
          onClick={async () => {
            await signOut();
            // Store-Module lesen beim Import aus localStorage. Ein Reload verhindert,
            // dass ein nachfolgender Account noch Daten im Arbeitsspeicher des
            // vorherigen Accounts sieht.
            window.location.assign("/login");
          }}
          className="ml-2 h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground transition"
          title="Abmelden"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </header>



      {/* ============= BODY (Left panel + Main) ============= */}
      <div className="flex flex-1 overflow-hidden">
        {leftOpen ? (
          <aside
            className="w-[300px] shrink-0 flex flex-col relative"
            style={{
              background: "#0B0D10",
              color: "#E6E8EB",
              borderRight: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-semibold tracking-[0.22em]" style={{ color: "#8A9099" }}>
                  PROJEKTE
                </div>
                <button
                  onClick={() => setLeftOpen(false)}
                  title="Projekte einklappen"
                  className="hover:opacity-100 opacity-70"
                  style={{ color: "#8A9099" }}
                >
                  <PanelLeftClose size={15} />
                </button>
              </div>
              <div
                className="flex items-center gap-2 h-9 rounded-md px-2.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <Search size={14} style={{ color: "#8A9099" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Projekte suchen..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "#E6E8EB" }}
                />
                <button
                  onClick={() => {
                    setCreatingFolder(true);
                    setNewFolderName("");
                  }}
                  title="Ordner anlegen"
                  className="hover:opacity-100 opacity-70"
                  style={{ color: "#8A9099" }}
                >
                  <FolderPlus size={14} />
                </button>
              </div>
              {creatingFolder && (
                <div
                  className="flex items-center gap-1 mt-2 rounded-md px-2 py-1"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  <FolderIcon size={13} style={{ color: "hsl(var(--accent-gold))" }} />
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitNewFolder();
                      if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                    }}
                    placeholder="Ordnername"
                    className="flex-1 bg-transparent text-xs outline-none"
                    style={{ color: "#E6E8EB" }}
                  />
                  <button onClick={commitNewFolder} title="Anlegen" style={{ color: "#8A9099" }}>
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => { setCreatingFolder(false); setNewFolderName(""); }}
                    title="Abbrechen"
                    style={{ color: "#8A9099" }}
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>

            {folders.length > 0 && (
              <div className="px-5 pb-2 text-[11px] font-semibold tracking-[0.22em]" style={{ color: "#8A9099" }}>
                ORDNER
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
              {/* Ordner */}
              {folders.map((f) => {
                const inside = projectsByFolder.get(f.id) ?? [];
                const collapsed = f.collapsed;
                const isRenaming = renamingFolderId === f.id;
                const dragOver = dragOverFolder === f.id;
                return (
                  <div key={f.id}>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f.id); }}
                      onDragLeave={() => setDragOverFolder((v) => (v === f.id ? null : v))}
                      onDrop={() => handleDropOnFolder(f.id)}
                      className="group flex items-center gap-1.5 h-8 px-2 rounded-md"
                      style={{
                        background: dragOver ? "hsl(var(--accent-gold) / 0.14)" : undefined,
                        color: "#B7BCC2",
                      }}
                    >
                      <button
                        onClick={() => projectStore.toggleProjectFolderCollapsed(f.id)}
                        style={{ color: "#8A9099" }}
                      >
                        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </button>
                      <FolderIcon size={13} style={{ color: "#B7BCC2" }} />
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameFolderDraft}
                          onChange={(e) => setRenameFolderDraft(e.target.value)}
                          onBlur={() => {
                            projectStore.renameProjectFolder(f.id, renameFolderDraft);
                            setRenamingFolderId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              projectStore.renameProjectFolder(f.id, renameFolderDraft);
                              setRenamingFolderId(null);
                            }
                            if (e.key === "Escape") setRenamingFolderId(null);
                          }}
                          className="flex-1 bg-transparent text-xs outline-none border-b"
                          style={{ borderColor: "rgba(255,255,255,0.1)", color: "#E6E8EB" }}
                        />
                      ) : (
                        <button
                          onClick={() => projectStore.toggleProjectFolderCollapsed(f.id)}
                          className="flex-1 text-left text-xs font-medium truncate"
                        >
                          {f.name}
                        </button>
                      )}
                      <span className="text-[10px]" style={{ color: "#8A9099" }}>{inside.length}</span>
                      <button
                        onClick={() => { setRenamingFolderId(f.id); setRenameFolderDraft(f.name); }}
                        className="opacity-0 group-hover:opacity-100"
                        style={{ color: "#8A9099" }}
                        title="Umbenennen"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Ordner „${f.name}" löschen? Projekte bleiben erhalten.`)) {
                            projectStore.deleteProjectFolder(f.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100"
                        style={{ color: "#8A9099" }}
                        title="Löschen"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    {!collapsed && (
                      <div className="pl-4 space-y-1 mt-1">
                        {inside.length === 0 ? (
                          <div className="text-[10px] italic px-2 py-1" style={{ color: "#8A9099" }}>
                            Projekt hierher ziehen
                          </div>
                        ) : (
                          inside.map((p) => (
                            <ProjectCard
                              key={p.id}
                              project={p}
                              active={mode === "projects" && !showAllTasks && selected?.id === p.id}
                              onSelect={() => { setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); }}
                              onOpen={() => navigate(`/project/${p.id}`)}
                              onSettings={() => { setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); setSettingsOpen(true); }}
                              onDelete={() => deleteProjectWithConfirm(p)}
                              onDragStart={() => setDragProjectId(p.id)}
                              onDragEnd={() => setDragProjectId(null)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Root-Projekte (ohne Ordner) */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder("root"); }}
                onDragLeave={() => setDragOverFolder((v) => (v === "root" ? null : v))}
                onDrop={() => handleDropOnFolder(null)}
                className="pt-1 space-y-1"
                style={{
                  background:
                    dragOverFolder === "root" ? "hsl(var(--accent-gold) / 0.06)" : undefined,
                  borderRadius: 6,
                }}
              >
                {rootProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    active={mode === "projects" && !showAllTasks && selected?.id === p.id}
                    onSelect={() => { setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); }}
                    onOpen={() => navigate(`/project/${p.id}`)}
                    onSettings={() => { setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); setSettingsOpen(true); }}
                    onDelete={() => deleteProjectWithConfirm(p)}
                    onDragStart={() => setDragProjectId(p.id)}
                    onDragEnd={() => setDragProjectId(null)}
                  />
                ))}
              </div>
            </div>
            {/* Fuß-Zeile mit Einstellungen-Icon */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <button
                disabled
                className="h-9 w-9 rounded-full flex items-center justify-center opacity-50 cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.05)", color: "#B7BCC2" }}
                title="Einstellungen (bald verfügbar)"
              >
                <Settings size={15} />
              </button>
              <span className="text-[10px]" style={{ color: "#8A9099" }}>
                {projectCount} / {MAX_PROJECTS}
              </span>
            </div>
          </aside>
        ) : (
          <div
            className="w-8 shrink-0 flex items-start justify-center pt-4"
            style={{ background: "#0B0D10", borderRight: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              onClick={() => setLeftOpen(true)}
              title="Projekte ausklappen"
              style={{ color: "#8A9099" }}
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
        )}


        {/* Center */}
        <main className="flex-1 overflow-y-auto">
          {showAllTasks ? (
            <AllTasksView projects={projects} onOpenProject={(id) => { setMode("projects"); setShowAllTasks(false); setSelectedId(id); }} />
          ) : mode === "templates" && !selected ? (
            <div className="px-10 py-7">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">Vorlagen</h1>
              </div>

              <div className="mt-5 relative" ref={saveAsTplRef}>
                <button
                  onClick={() => setSaveAsTplOpen((v) => !v)}
                  className="h-12 px-5 rounded-lg flex items-center gap-2 text-base font-semibold shadow-sm hover:opacity-90 border"
                  style={{ background: "hsl(var(--beige-soft))", color: "hsl(var(--ink))", borderColor: "hsl(var(--hairline))" }}
                  title="Projekt als Vorlage speichern"
                >
                  <Plus size={18} /> Vorlage
                </button>

                {saveAsTplOpen && (
                  <div
                    className="absolute left-0 top-full mt-2 w-80 rounded-xl border shadow-lg z-30 p-3"
                    style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
                  >
                    <div className="text-[11px] font-semibold tracking-[0.16em] uppercase px-1 pb-2" style={{ color: "hsl(var(--ink-soft))" }}>
                      Projekt als Vorlage speichern
                    </div>
                    {(() => {
                      const src = projects.filter((p) => !p.isTemplate);
                      if (src.length === 0) {
                        return (
                          <div className="text-xs text-muted-foreground p-3 rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
                            Kein Projekt zum Übernehmen vorhanden.
                          </div>
                        );
                      }
                      return (
                        <select
                          autoFocus
                          defaultValue=""
                          onChange={(e) => {
                            const pid = e.target.value;
                            if (!pid) return;
                            const id = projectStore.duplicateAsTemplate(pid);
                            if (id) setSelectedId(id);
                            setSaveAsTplOpen(false);
                          }}
                          className="h-10 w-full rounded-md border px-2 text-sm bg-transparent"
                          style={{ borderColor: "hsl(var(--hairline))" }}
                        >
                          <option value="" disabled>Projekt wählen…</option>
                          {src.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Vorlagen-Liste */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {projects.filter((p) => p.isTemplate).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className="text-left rounded-xl border overflow-hidden hover:shadow-md transition"
                    style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
                  >
                    <div className="aspect-[16/9] overflow-hidden" style={{ background: "hsl(var(--surface-muted))" }}>
                      <img src={t.thumbnail} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="px-4 py-3">
                      <div className="text-sm font-semibold truncate">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">Vorlage</div>
                    </div>
                  </button>
                ))}
                {projects.filter((p) => p.isTemplate).length === 0 && (
                  <div className="col-span-full text-sm text-muted-foreground py-10 text-center rounded-xl border" style={{ borderColor: "hsl(var(--hairline))" }}>
                    Noch keine Vorlagen. Speichere ein Projekt als Vorlage über den Button oben.
                  </div>
                )}
              </div>
            </div>
          ) : selected && (

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
                    onClick={() => projectStore.toggleFavorite(selected.id)}
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
                            setSettingsOpen(true);
                            setTitleMenuOpen(false);
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
                        >
                          <Settings size={14} /> Einstellungen
                        </button>
                        <button
                          onClick={() => {
                            const label = selected.isTemplate ? "Vorlage" : "Projektmappe";
                            const msg = `${label} „${selected.name}" wirklich löschen?\n\nAlle Inhalte werden endgültig entfernt:\n• Seiten & Zeichenblätter\n• CAD-Elemente & Bemaßungen\n• Board-Themen, Aufgaben & Notizen\n• Dateien & Fotos\n\nDieser Vorgang kann nicht rückgängig gemacht werden.`;
                            if (confirm(msg)) {
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
                  {selected.isTemplate && (
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
                  )}
                </div>
              </div>

              {settingsOpen && (
                <ProjectSettingsPanel project={selected} onClose={() => setSettingsOpen(false)} />
              )}

              {/* Wetter für Projektort */}
              <WeatherStrip ort={selected.ort} />

              {/* Große Aktion links + Reiter rechts (eine Zeile, Reiter am Unterrand des Buttons ausgerichtet) */}
              <div
                className="mt-4 flex flex-col lg:flex-row lg:items-end gap-4"
              >
                <button
                  onClick={() => navigate(`/project/${selected.id}`)}
                  className="h-11 rounded-lg flex items-center gap-3 pl-3 pr-4 text-sm font-semibold transition hover:opacity-90 shrink-0 self-start lg:-mb-px border"
                  style={{ background: "hsl(var(--beige-soft))", color: "hsl(var(--ink))", borderColor: "hsl(var(--hairline))" }}
                >
                  <span
                    className="h-6 w-6 rounded-full flex items-center justify-center"
                    style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--ink))" }}
                  >
                    <Play size={12} fill="currentColor" />
                  </span>
                  Projekt bearbeiten
                  <ChevronRight size={16} />
                </button>

                <div
                  ref={tabsScrollRef}
                  className="flex items-end gap-x-8 gap-y-1 text-sm flex-1 min-w-0 overflow-x-auto no-scrollbar touch-pan-x"
                >
                  {(
                    [
                      ["uebersicht", "Übersicht", false],
                      ["aufgaben", "Aufgaben", false],
                      ["finanzen", "Finanzen", false],
                      ["dokumente", "Dokumente", false],
                      ["seiten", "Mappe", false],
                      
                      ["team", "Team", true],
                    ] as const
                  ).map(([key, label, disabled]) => (
                    <button
                      key={key}
                      onClick={() => !disabled && setTab(key as Tab)}
                      disabled={disabled}
                      title={disabled ? "Bald verfügbar" : undefined}
                      className="pb-2 relative whitespace-nowrap disabled:cursor-not-allowed"
                      style={{
                        color: disabled
                          ? "hsl(var(--ink-soft) / 0.5)"
                          : tab === key ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
                        fontWeight: tab === key ? 600 : 400,
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      {label}
                      {tab === key && !disabled && (
                        <span
                          className="absolute left-0 right-0 -bottom-px h-[2px]"
                          style={{ background: "hsl(var(--accent-gold))" }}
                        />
                      )}
                    </button>
                  ))}
                </div>

              </div>



              {tab === "uebersicht" && <UebersichtView project={selected} />}
              {tab === "seiten" && (
                <SeitenView project={selected} onAddPage={handleAddPage} />
              )}
              {tab === "aufgaben" && <AufgabenView project={selected} />}
              {tab === "finanzen" && (
                <FinanceProjectOverview projectId={selected.id} projectName={selected.name} />
              )}
              {tab === "dokumente" && (
                <div className="mt-4">
                  <div className="inline-flex items-center gap-1 rounded-md p-0.5 mb-4"
                       style={{ background: "hsl(var(--surface-muted))" }}>
                    {(["dateien", "fotos"] as const).map((sub) => (
                      <button
                        key={sub}
                        onClick={() => setDokumenteSubTab(sub)}
                        className="h-7 px-3 rounded-[5px] text-[12px] font-medium transition-colors"
                        style={{
                          background: dokumenteSubTab === sub ? "hsl(var(--accent-gold))" : "transparent",
                          color: dokumenteSubTab === sub ? "hsl(var(--surface))" : "hsl(var(--ink-soft))",
                        }}
                      >
                        {sub === "dateien" ? "Dateien" : "Fotos"}
                      </button>
                    ))}
                  </div>
                  {dokumenteSubTab === "dateien" ? (
                    <FileBrowser
                      project={selected}
                      kind="files"
                      accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,application/pdf"
                      emptyHint="Noch keine Dateien. Lade PDFs, DWG/DXF oder Dokumente hoch oder lege einen Ordner an."
                    />
                  ) : (
                    <FileBrowser
                      project={selected}
                      kind="photos"
                      accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp"
                      emptyHint="Noch keine Fotos. Lade JPG/PNG-Dateien hoch oder lege einen Ordner an."
                      photoMode
                    />
                  )}
                </div>
              )}
              
            </div>
          )}
        </main>
      </div>

      {newProjectDialogOpen && (
        <NewProjectSettingsDialog
          onCancel={() => setNewProjectDialogOpen(false)}
          onCreate={finishCreateProject}
        />
      )}
    </div>
  );
}

/* -------- ProjectCard (sidebar) -------- */
function ProjectCard({
  project: p,
  active,
  onSelect,
  onOpen,
  onSettings,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  project: Project;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onSettings: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);
  const drawings = (p.pages ?? []).reduce(
    (n, pg: any) => n + ((pg?.elements ?? []).filter((e: any) => e?.type === "cad-view").length || 0),
    0
  );
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className="w-full text-left rounded-lg p-2 flex gap-2.5 transition cursor-pointer"
      style={{
        background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "hsl(var(--accent-gold) / 0.55)" : "rgba(255,255,255,0.04)"}`,
      }}
    >
      <div className="w-12 h-12 shrink-0 group/thumb" style={{ perspective: "300px" }}>
        <div
          className="w-full h-full rounded-md overflow-hidden shadow-lg transition-transform duration-500 group-hover/thumb:[transform:rotateY(0deg)_scale(1.05)]"
          style={{
            background: "#151719",
            transform: "rotateY(-18deg) rotateX(6deg)",
            transformStyle: "preserve-3d",
          }}
        >
          {p.thumbnail && (
            <img src={p.thumbnail} alt="" className="w-full h-full object-cover" />
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold truncate" style={{ color: "#E6E8EB" }}>{p.name}</span>
          {p.favorite && (
            <Star
              size={10}
              className="shrink-0"
              fill="hsl(var(--accent-gold))"
              stroke="hsl(var(--accent-gold))"
            />
          )}
        </div>
        <div className="text-[10px] truncate" style={{ color: "#8A9099" }}>
          {p.pages.length} {p.pages.length === 1 ? "Seite" : "Seiten"} · {drawings} {drawings === 1 ? "Zeichnung" : "Zeichnungen"}
        </div>
      </div>
      <div className="relative self-start" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="opacity-60 hover:opacity-100"
          style={{ color: "#8A9099" }}
          title="Mehr"
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-40 min-w-[160px] rounded-md border shadow-md py-1 text-sm"
            style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setMenuOpen(false); onSettings(); }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
            >
              <Settings size={14} /> Einstellungen
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(); }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
              style={{ color: "hsl(0 70% 50%)" }}
            >
              <Trash2 size={14} /> Löschen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


/* -------- ProfileAvatar (with progress ring) -------- */
function ProfileAvatar({
  profile,
  count,
  max,
  size,
  large,
}: {
  profile: { name: string; avatarUrl?: string; status: ProfileStatus };
  count: number;
  max: number;
  size: number;
  large?: boolean;
}) {
  const ratio = Math.min(1, count / max);
  const stroke = large ? 4 : 2.5;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const initial = (profile.name?.[0] ?? "?").toUpperCase();
  const statusColor =
    profile.status === "online"
      ? "hsl(140 60% 45%)"
      : profile.status === "busy"
        ? "hsl(0 70% 55%)"
        : "hsl(0 0% 65%)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--hairline))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--accent-gold))"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          strokeLinecap="round"
        />
      </svg>
      <div
        className="absolute rounded-full flex items-center justify-center font-semibold overflow-hidden"
        style={{
          inset: stroke + 2,
          background: "hsl(var(--surface-muted))",
          color: "hsl(var(--ink))",
          fontSize: size * 0.36,
        }}
      >
        {profile.avatarUrl ? (
          <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </div>
      <div
        className="absolute rounded-full border-2"
        style={{
          width: size * 0.28,
          height: size * 0.28,
          right: 0,
          bottom: 0,
          background: statusColor,
          borderColor: "hsl(var(--surface-card))",
        }}
        title={profile.status}
      />
    </div>
  );
}

/* -------- Tab views -------- */

// UebersichtView wird nun aus @/components/project/UebersichtView importiert.

function SeitenView({ project, onAddPage }: { project: Project; onAddPage: () => void }) {
  const navigate = useNavigate();
  const mappen = project.mappen ?? [];
  const activeMappe = mappen.find((m) => m.id === project.activeMappeId) ?? mappen[0];
  const mappePages = activeMappe
    ? project.pages.filter((p) => activeMappe.pageIds.includes(p.id))
    : [];
  const [selectedPageId, setSelectedPageId] = useState<string | undefined>(mappePages[0]?.id);
  const selectedPage =
    mappePages.find((p) => p.id === selectedPageId) ?? mappePages[0];
  const isLandscape = (selectedPage?.format ?? "A3-quer").includes("quer");

  return (
    <div className="mt-4 space-y-4">
      {/* Präsentieren-Button (verknüpft mit Projektmappe-Präsentation) */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => navigate(`/project/${project.id}?present=1`)}
          disabled={mappen.length === 0}
          className="h-9 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          title="Präsentieren"
        >
          <Play size={13} fill="currentColor" /> Präsentieren
        </button>
      </div>


      <div className="grid grid-cols-[220px_1fr] gap-6">
        <div
          className="rounded-2xl p-4"
          style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
        >
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
            SEITEN {activeMappe && <span className="normal-case tracking-normal font-normal">· {activeMappe.name}</span>}
          </div>
          {mappePages.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Diese Mappe enthält noch keine Seiten.</div>
          ) : (
            <div className="space-y-2">
              {mappePages.map((pg) => {
                const active = pg.id === selectedPage?.id;
                return (
                  <button
                    key={pg.id}
                    onClick={() => setSelectedPageId(pg.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-md text-left transition border"
                    style={{
                      background: active ? "hsl(var(--surface-muted))" : "hsl(var(--surface))",
                      borderColor: active ? "hsl(var(--accent-gold) / 0.4)" : "transparent",
                    }}
                  >
                    <div className="w-10 h-10 rounded bg-white border shrink-0 overflow-hidden flex items-center justify-center" style={{ borderColor: "hsl(var(--hairline))" }}>
                      <PageThumb page={pg} className="w-full" />
                    </div>
                    <div className="flex-1 text-sm truncate">{pg.title}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="rounded-2xl p-6 flex flex-col items-center"
          style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
        >
          {selectedPage ? (
            <>
              <div className="w-full flex items-center justify-between text-xs text-muted-foreground mb-4">
                <span className="font-medium text-sm" style={{ color: "hsl(var(--ink))" }}>
                  {selectedPage.title}
                </span>
                <span>{selectedPage.format}</span>
              </div>
              <div
                className="bg-white border shadow-sm overflow-hidden"
                style={{
                  borderColor: "hsl(var(--hairline))",
                  width: isLandscape ? "100%" : "70%",
                  maxWidth: "100%",
                }}
              >
                {/* Livevorschau des tatsächlichen Seiteninhalts */}
                <PageThumb page={selectedPage} className="w-full" />
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              Keine Seite ausgewählt. Wähle oben eine Mappe oder lege eine neue Seite an.
            </div>
          )}
        </div>
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
        <div className="mt-3 group" style={{ perspective: "1200px" }}>
        <div
          className="rounded-xl overflow-hidden aspect-[16/9] relative shadow-xl transition-transform duration-700 group-hover:[transform:rotateY(0deg)_rotateX(0deg)_scale(1.01)]"
          style={{
            background: "hsl(var(--surface-muted))",
            transform: "rotateY(-8deg) rotateX(4deg)",
            transformStyle: "preserve-3d",
          }}
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

/**
 * Vereinheitlichte Aufgabenzeile für Kalender/Liste — vereint klassische
 * `project.tasks` und Notiznetz-Knoten (kind === "task").
 */
type UnifiedTask = {
  id: string;
  source: "legacy" | "note";
  title: string;
  date?: string;
  time?: string;
  priority: TaskPriority;
  done: boolean;
  category?: string;
  status?: NoteStatus;
  nodeParentId?: string | null; // nur bei source === "note"
  mappeId?: string;
};

function noteToUnified(n: NoteNode): UnifiedTask {
  const prio: TaskPriority =
    n.priority === "urgent" || n.priority === "high" ? "high"
      : n.priority === "low" ? "low" : "medium";
  return {
    id: n.id,
    source: "note",
    title: n.title,
    date: n.date || n.dueDate,
    time: n.time,
    priority: prio,
    done: n.status === "done",
    category: n.category,
    status: n.status,
    nodeParentId: n.parentId,
  };
}

export function AufgabenView({ project }: { project: Project }) {
  const navigate = useNavigate();
  const notes = useNotes(project.id);
  const allProjects = useProjects();
  const mappen = project.mappen ?? [];
  const defaultMappeId = project.activeMappeId ?? mappen[0]?.id ?? "";
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<{ title: string; description: string; date: string; time: string; priority: TaskPriority; category: string; mappeId: string; projectId: string }>({
    title: "",
    description: "",
    date: "",
    time: "",
    priority: "medium",
    // Schnellablage ist die Standardkategorie für neue Aufgaben.
    category: QUICK_CATEGORY,
    mappeId: defaultMappeId,
    projectId: project.id,
  });

  // Das aktuell geöffnete Projekt (und dessen aktive Mappe) ist immer vorbelegt.
  useEffect(() => {
    setDraft((d) => ({ ...d, projectId: project.id, mappeId: defaultMappeId }));
  }, [project.id, defaultMappeId]);

  const mappeName = useCallback(
    (id?: string) => (id ? (mappen.find((m) => m.id === id)?.name ?? "") : ""),
    [mappen]
  );

  // Board-Tasks + klassische Tasks zusammenführen.
  const combined: UnifiedTask[] = useMemo(() => {
    const legacy: UnifiedTask[] = project.tasks.map((t) => ({
      id: t.id, source: "legacy", title: t.title, date: t.date, time: t.time,
      priority: t.priority ?? "medium", done: t.done,
    }));
    const noteTasks = notes.nodes
      .filter((n) => n.kind === "task")
      .map((n) => ({ ...noteToUnified(n), mappeId: n.mappeId }));
    const prioRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
    return [...legacy, ...noteTasks].sort((a, b) => {
      // Offene zuerst, dann nach Dringlichkeit, dann nach Datum/Zeit.
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      const pr = prioRank[a.priority] - prioRank[b.priority];
      if (pr !== 0) return pr;
      const da = `${a.date ?? "9999-99-99"} ${a.time ?? "99:99"}`;
      const db = `${b.date ?? "9999-99-99"} ${b.time ?? "99:99"}`;
      return da.localeCompare(db);
    });
  }, [project.tasks, notes.nodes]);


  const filtered = selectedDate ? combined.filter((t) => t.date === selectedDate) : combined;

  const addTask = () => {
    if (!draft.title.trim()) return;
    const prio: NotePriority = draft.priority === "high" ? "high" : draft.priority === "low" ? "low" : "normal";
    const targetProjectId = draft.projectId || project.id;
    const isForeign = targetProjectId !== project.id;
    notesStore.addNode(targetProjectId, null, "task", {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      date: draft.date || undefined,
      time: draft.time || undefined,
      priority: prio,
      status: "open",
      // In einem fremden Projekt landet die Aufgabe immer in der Schnellablage.
      category: isForeign ? QUICK_CATEGORY : (draft.category || undefined),
      mappeId: isForeign ? undefined : (draft.mappeId || undefined),
      unseen: true,
    });
    setDraft({
      title: "",
      description: "",
      date: selectedDate ?? "",
      time: "",
      priority: "medium",
      category: draft.category,
      mappeId: draft.mappeId,
      projectId: draft.projectId,
    });
  };

  return (
    <div className="mt-6 space-y-5">
      {/* Kalender ganz oben */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            KALENDER
          </div>
          <button
            onClick={() => navigate(`/project/${project.id}/notes`)}
            className="h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1.5"
            style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
            title="Board öffnen"
          >
            <Network size={13} /> Board
          </button>
        </div>
        <TaskCalendar
          tasks={combined}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setDraft((s) => ({ ...s, date: d ?? "" }));
          }}
        />
        <div className="mt-3 text-[11px] text-muted-foreground">
          Tipp: Neue Aufgaben werden automatisch mit dem Board verknüpft und dort auf der Projekt-Ebene erstellt.
        </div>
      </div>

      {/* Neue Aufgabe */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          NEUE AUFGABE (im Board)
        </div>
        <div className="flex flex-col gap-2">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Titel der Aufgabe…"
            className="h-9 px-3 rounded-md border bg-transparent text-sm outline-none w-full"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Beschreibung (optional)…"
            rows={2}
            className="px-3 py-2 rounded-md border bg-transparent text-sm outline-none w-full resize-none"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className="h-9 min-w-0 px-2 rounded-md border bg-transparent text-sm outline-none"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
            <input
              type="time"
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              className="h-9 min-w-0 px-2 rounded-md border bg-transparent text-sm outline-none"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskPriority })}
              className="h-9 min-w-0 px-2 rounded-md border bg-transparent text-sm outline-none"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
            </select>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              className="h-9 min-w-0 px-2 rounded-md border bg-transparent text-sm outline-none"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value="">Kategorie…</option>
              {notes.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Zielprojekt: standardmäßig das aktuell geöffnete Projekt. Wird ein
              anderes Projekt gewählt, landet die Aufgabe dort in der Schnellablage. */}
          <select
            value={draft.projectId}
            onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
            className="h-9 px-2 rounded-md border bg-transparent text-sm outline-none"
            style={{ borderColor: "hsl(var(--hairline))" }}
            title="Projekt zuordnen"
          >
            {allProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.id === project.id ? " (aktuell)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={addTask}
            className="h-9 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-1 self-end"
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
            <UnifiedTaskRow key={`${t.source}:${t.id}`} task={t} projectId={project.id} mappeName={mappeName(t.mappeId)} onOpenInNotes={() => navigate(`/project/${project.id}/notes`)} />
          ))}
        </div>
      </div>

      <TaskTimeline project={project} />
    </div>
  );
}

function UnifiedTaskRow({
  task, projectId, onOpenInNotes, mappeName,
}: { task: UnifiedTask; projectId: string; onOpenInNotes: () => void; mappeName?: string }) {
  const prio = task.priority;
  const prioColor =
    prio === "high" ? "hsl(0 70% 55%)"
    : prio === "medium" ? "hsl(var(--accent-gold))"
    : "hsl(140 35% 55%)";

  const toggle = () => {
    if (task.source === "legacy") {
      projectStore.toggleTask(projectId, task.id);
    } else {
      notesStore.updateNode(projectId, task.id, { status: task.done ? "open" : "done" });
    }
  };
  const remove = () => {
    if (task.source === "legacy") projectStore.deleteTask(projectId, task.id);
    else notesStore.deleteNode(projectId, task.id);
  };

  return (
    <div className="flex items-center gap-3 py-2.5">
      <input
        type="checkbox"
        checked={task.done}
        onChange={toggle}
        className="accent-foreground"
      />
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: prioColor }}
        title={`Priorität: ${prio}`}
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate flex items-center gap-2 ${task.done ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
          {task.source === "note" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}>
              Board
            </span>
          )}
          {mappeName && (
            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{ background: "hsl(var(--surface-muted))", color: "hsl(var(--ink-soft))" }}>
              {mappeName}
            </span>
          )}
          {task.category && (
            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{ background: "hsl(var(--surface-muted))", color: "hsl(var(--ink-soft))" }}>
              {task.category}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {task.date
            ? new Date(task.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
            : "Ohne Datum"}
          {task.time ? ` · ${task.time}` : ""}
        </div>
      </div>
      {task.source === "note" && (
        <button onClick={onOpenInNotes} title="Im Board öffnen"
          className="text-muted-foreground hover:text-foreground">
          <ExternalLink size={14} />
        </button>
      )}
      <button onClick={remove} title="Löschen" className="text-muted-foreground hover:text-foreground">
        <Trash2 size={14} />
      </button>
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
  tasks: UnifiedTask[];
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

function SettingsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
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
}

/** Einstellungsfenster eines bestehenden Projekts (Name + Informationen). */
function ProjectSettingsPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const update = (patch: Partial<Project>) => projectStore.updateProject(project.id, patch);

  return (
    <div
      className="mt-4 rounded-2xl p-6 max-w-3xl"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: "hsl(var(--accent-gold))" }}>
          Projekteinstellungen
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" title="Schließen">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <SettingsField label="PROJEKTNAME" value={project.name} onChange={(v) => update({ name: v.trim() || project.name })} />
        <SettingsField label="BAUHERR" value={project.bauherr ?? ""} onChange={(v) => update({ bauherr: v })} />
        <div className="col-span-2">
          <AddressField value={project.ort} onChange={(v) => update({ ort: v })} />
        </div>
        <SettingsField label="PROJEKTTYP" value={project.projektTyp ?? ""} onChange={(v) => update({ projektTyp: v })} />
        <SettingsField label="STATUS" value={project.status ?? ""} onChange={(v) => update({ status: v })} />
        <SettingsField label="ERSTELLT AM" value={project.erstelltAm ?? ""} onChange={(v) => update({ erstelltAm: v })} />

        {(project.customFields ?? []).map((f) => (
          <CustomFieldEditor key={f.id} projectId={project.id} field={f} />
        ))}

        <div className="col-span-2 flex items-center justify-between">
          <AddCustomFieldControl projectId={project.id} />
          <div className="text-xs text-muted-foreground">
            Änderungen werden automatisch übernommen.
          </div>
        </div>
      </div>
    </div>
  );
}

/** Einstellungsfenster für ein NEUES Projekt – erst nach „Projekt anlegen" wird es erstellt. */
function NewProjectSettingsDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (values: {
    name: string;
    bauherr: string;
    ort: string;
    projektTyp: string;
    status: string;
    erstelltAm: string;
  }) => void;
}) {
  const [name, setName] = useState("Neues Projekt");
  const [bauherr, setBauherr] = useState("");
  const [ort, setOrt] = useState("");
  const [projektTyp, setProjektTyp] = useState("");
  const [status, setStatus] = useState("");
  const [erstelltAm, setErstelltAm] = useState(new Date().toLocaleDateString("de-DE"));

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-8"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-6 shadow-xl"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: "hsl(var(--accent-gold))" }}>
            Neues Projekt – Einstellungen
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" title="Abbrechen">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <SettingsField label="PROJEKTNAME" value={name} onChange={setName} />
          <SettingsField label="BAUHERR" value={bauherr} onChange={setBauherr} />
          <div className="col-span-2">
            <AddressField value={ort} onChange={setOrt} />
          </div>
          <SettingsField label="PROJEKTTYP" value={projektTyp} onChange={setProjektTyp} />
          <SettingsField label="STATUS" value={status} onChange={setStatus} />
          <SettingsField label="ERSTELLT AM" value={erstelltAm} onChange={setErstelltAm} />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md border text-sm"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            Abbrechen
          </button>
          <button
            onClick={() =>
              onCreate({ name: name.trim() || "Neues Projekt", bauherr, ort, projektTyp, status, erstelltAm })
            }
            className="h-9 px-4 rounded-md text-sm font-semibold"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            Projekt anlegen
          </button>
        </div>
      </div>
    </div>
  );
}


function AddressField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const externalContentEnabled = useExternalContentConsent();
  const [query, setQuery] = useState(value);
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GeoHit | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Sync when project.ort changes externally
  useEffect(() => { setQuery(value); }, [value]);

  // Auto-resolve current value to coordinates for the map (once, on mount / value change)
  useEffect(() => {
    let alive = true;
    if (!externalContentEnabled) { setSelected(null); return; }
    if (!value.trim()) { setSelected(null); return; }
    geocodeSearch(value, 1).then((r) => {
      if (alive && r[0]) setSelected(r[0]);
    });
    return () => { alive = false; };
  }, [externalContentEnabled, value]);

  const runSearch = (q: string) => {
    if (!externalContentEnabled) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      if (q.trim().length < 2) { setHits([]); return; }
      setLoading(true);
      const r = await geocodeSearch(q, 6);
      setHits(r);
      setLoading(false);
    }, 250);
  };

  const pick = (h: GeoHit) => {
    setSelected(h);
    setQuery(h.label);
    setOpen(false);
    setHits([]);
    onChange(h.label);
  };

  const mapSrc = externalContentEnabled && selected
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${selected.lon - 0.02}%2C${selected.lat - 0.01}%2C${selected.lon + 0.02}%2C${selected.lat + 0.01}&layer=mapnik&marker=${selected.lat}%2C${selected.lon}`
    : null;

  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
        PROJEKTADRESSE
      </div>
      {!externalContentEnabled ? (
        <div className="mt-2 rounded-md border px-3 py-3 text-xs text-muted-foreground" style={{ borderColor: "hsl(var(--hairline))" }}>
          <p>Karten- und Ortssuche sind deaktiviert. Bei Aktivierung werden Adressangaben an Open-Meteo und Karteninhalte an OpenStreetMap übermittelt.</p>
          <button type="button" onClick={() => setExternalContentConsent(true)} className="mt-2 font-medium underline underline-offset-4">
            Karten- und Ortssuche aktivieren
          </button>
        </div>
      ) : <div className="relative mt-1">
        <div className="flex items-center gap-2 h-9 rounded-md border px-3 bg-transparent"
             style={{ borderColor: "hsl(var(--hairline))" }}>
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); runSearch(e.target.value); }}
            onFocus={() => { setOpen(true); if (hits.length === 0 && query) runSearch(query); }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Ort, Straße, PLZ suchen…"
            className="flex-1 h-full bg-transparent outline-none text-sm"
          />
          {loading && <span className="text-[11px] text-muted-foreground">…</span>}
        </div>
        {open && hits.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 rounded-md border shadow-md max-h-64 overflow-y-auto"
               style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}>
            {hits.map((h, i) => (
              <button
                key={`${h.lat}-${h.lon}-${i}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(h); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2"
              >
                <span className="text-muted-foreground text-xs mt-0.5">📍</span>
                <span className="flex-1">
                  <div>{h.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {[h.admin1, h.country].filter(Boolean).join(", ")}
                  </div>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>}
      <div
        className="mt-2 rounded-md overflow-hidden border relative"
        style={{ borderColor: "hsl(var(--hairline))", height: 220, background: "hsl(var(--surface-muted))" }}
      >
        {mapSrc ? (
          <iframe
            title="Karte"
            src={mapSrc}
            className="w-full h-full border-0"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            Adresse suchen, um die Karte anzuzeigen.
          </div>
        )}
      </div>
      {selected && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          Aufgelöst: {selected.label} · {selected.lat.toFixed(4)}, {selected.lon.toFixed(4)} — Wetter wird für diesen Ort geladen.
        </div>
      )}
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
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground ${disabled ? "opacity-40 cursor-not-allowed" : "hover:text-foreground"}`}
      style={{
        background: active ? "hsl(var(--surface-muted))" : "transparent",
        color: active ? "hsl(var(--ink))" : undefined,
      }}
    >
      {icon}
    </button>
  );
}

function HeaderDivider() {
  return (
    <span
      aria-hidden
      className="mx-1 inline-block h-5 w-px"
      style={{ background: "hsl(var(--hairline))" }}
    />
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

/* -------- AllTasksView: globale Aufgabenübersicht aller Projekte -------- */
function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 55%)`;
}

function ProjectCarousel({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (projects.length <= 1 || paused) return;
    const t = setInterval(() => setOffset((o) => (o + 1) % projects.length), 5000);
    return () => clearInterval(t);
  }, [projects.length, paused]);

  if (projects.length === 0) return null;

  // Immer 5 Slots: 2 links, Mitte im Vordergrund, 2 rechts (bei wenigen Projekten wird wiederholt)
  const n = projects.length;
  const slots = [-2, -1, 0, 1, 2];
  const visible = slots.map((s) => ({ slot: s, project: projects[(((offset + s) % n) + n) % n] }));



  return (
    <div
      className="mb-6 select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="relative h-44 flex items-center justify-center"
        style={{ perspective: "1000px", perspectiveOrigin: "50% 50%" }}
      >
        {visible.map(({ slot, project: p }) => {
          const abs = Math.abs(slot);
          const translateX = slot * 130;
          const translateZ = -abs * 170;
          const rotateY = slot === 0 ? 0 : slot > 0 ? -38 : 38;
          const scale = 1 - abs * 0.08;
          const opacity = abs >= 2 ? 0.45 : abs === 1 ? 0.8 : 1;
          return (
            <button
              key={slot}

              onClick={() => onOpen(p.id)}
              title={p.name}
              className="absolute group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
              style={{
                transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                transformStyle: "preserve-3d",
                transition: "transform 700ms cubic-bezier(0.22,1,0.36,1), opacity 700ms ease",
                opacity,
                zIndex: 10 - abs,
              }}
            >
              <div
                className="w-44 h-28 rounded-lg overflow-hidden border flex items-center justify-center shadow-lg"
                style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--beige-soft))" }}
              >
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={`Projektbild ${p.name}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-semibold text-muted-foreground">{p.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className={`mt-1.5 text-xs truncate text-center max-w-44 ${slot === 0 ? "font-semibold" : "text-muted-foreground"}`}>
                {p.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}



function AllTasksView({ projects, onOpenProject }: { projects: Project[]; onOpenProject: (id: string) => void }) {
  const navigate = useNavigate();
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(projects.map((p) => p.id)));
  useEffect(() => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      projects.forEach((p) => next.add(p.id));
      return next;
    });
  }, [projects]);

  const toggle = (id: string) =>
    setActiveIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Alle Aufgaben (legacy + board.task) über alle Projekte
  type GTask = { id: string; projectId: string; projectName: string; title: string; date?: string; time?: string; priority: TaskPriority; done?: boolean; color: string };
  const gTasks: GTask[] = useMemo(() => {
    const out: GTask[] = [];
    projects.forEach((p) => {
      const color = projectColor(p.id);
      p.tasks?.forEach((t) =>
        out.push({ id: t.id, projectId: p.id, projectName: p.name, title: t.title, date: t.date, time: t.time, priority: t.priority ?? "medium", done: t.done, color })
      );
      try {
        const notes = notesStore.getState(p.id);
        notes.nodes.filter((n) => n.kind === "task").forEach((n) =>
          out.push({ id: n.id, projectId: p.id, projectName: p.name, title: n.title, date: n.dueDate ?? n.date, time: n.time, priority: (n.priority === "high" || n.priority === "urgent") ? "high" : n.priority === "low" ? "low" : "medium", done: n.status === "done", color })
        );
      } catch {}
    });
    const prio: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
    return out.sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      const pr = prio[a.priority] - prio[b.priority];
      if (pr !== 0) return pr;
      return `${a.date ?? "9999"} ${a.time ?? "99:99"}`.localeCompare(`${b.date ?? "9999"} ${b.time ?? "99:99"}`);
    });
  }, [projects]);

  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const visible = gTasks.filter((t) => activeIds.has(t.projectId) && (!selectedDate || t.date === selectedDate));

  return (
    <div className="px-10 py-7">
      <ProjectCarousel projects={projects} onOpen={onOpenProject} />

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Alle Aufgaben</h1>
        <span className="text-sm text-muted-foreground">projektübergreifend</span>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Aufgaben-Liste */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}>
          <div className="px-4 py-3 border-b text-xs font-semibold tracking-widest text-muted-foreground flex items-center justify-between" style={{ borderColor: "hsl(var(--hairline))" }}>
            <span>AUFGABEN {selectedDate ? `· ${selectedDate}` : `· ${visible.length}`}</span>
            {selectedDate && (
              <button onClick={() => setSelectedDate(undefined)} className="text-[11px] font-normal hover:text-foreground">Filter zurücksetzen</button>
            )}
          </div>
          {visible.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Keine Aufgaben.</div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
              {visible.map((t) => (
                <li
                  key={`${t.projectId}:${t.id}`}
                  onClick={() => navigate(`/project/${t.projectId}`)}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-muted/40 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {t.projectName}{t.date ? ` · ${t.date}` : ""}{t.time ? ` · ${t.time}` : ""}
                    </div>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: t.priority === "high" ? "hsl(0 70% 50% / 0.15)" : t.priority === "low" ? "hsl(var(--surface-muted))" : "hsl(45 90% 50% / 0.15)",
                      color: t.priority === "high" ? "hsl(0 70% 40%)" : t.priority === "low" ? "hsl(var(--ink-soft))" : "hsl(35 80% 35%)",
                    }}
                  >
                    {t.priority === "high" ? "Hoch" : t.priority === "low" ? "Niedrig" : "Mittel"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Kalender + Projekt-Filter */}
        <div className="space-y-4">
          <div className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}>
            <div className="text-xs font-semibold tracking-widest text-muted-foreground mb-3">PROJEKTE</div>
            <div className="space-y-1.5">
              {projects.map((p) => {
                const color = projectColor(p.id);
                const active = activeIds.has(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={active} onChange={() => toggle(p.id)} className="accent-current" />
                    <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                    <span className={`truncate ${active ? "" : "text-muted-foreground"}`}>{p.name}</span>
                  </label>
                );
              })}
              {projects.length === 0 && <div className="text-sm text-muted-foreground">Keine Projekte.</div>}
            </div>
          </div>

          <GlobalCalendar
            tasks={gTasks.filter((t) => activeIds.has(t.projectId))}
            selectedDate={selectedDate}
            onSelect={(d) => setSelectedDate((prev) => (prev === d ? undefined : d))}
          />
        </div>
      </div>
    </div>
  );
}

function GlobalCalendar({
  tasks,
  selectedDate,
  onSelect,
}: {
  tasks: { date?: string; color: string }[];
  selectedDate?: string;
  onSelect: (d: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const startWeekday = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dateStr = (d: number) => `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const colorsForDate = (d: number): string[] => {
    const s = dateStr(d);
    const cols = new Set<string>();
    tasks.forEach((t) => { if (t.date === s) cols.add(t.color); });
    return Array.from(cols).slice(0, 4);
  };

  const monthName = first.toLocaleString("de-DE", { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: (c.m + 11) % 12 }))} className="text-muted-foreground hover:text-foreground text-sm">‹</button>
        <div className="text-sm font-semibold capitalize">{monthName}</div>
        <button onClick={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: (c.m + 1) % 12 }))} className="text-muted-foreground hover:text-foreground text-sm">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] text-muted-foreground mb-1 text-center">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (<div key={d}>{d}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px]">
        {cells.map((c, i) => {
          const s = c ? dateStr(c) : undefined;
          const isSelected = s && s === selectedDate;
          const isToday = s === todayStr;
          const cols = c ? colorsForDate(c) : [];
          return (
            <div
              key={i}
              onClick={() => s && onSelect(s)}
              className={`relative h-8 rounded-md flex items-center justify-center ${c ? "cursor-pointer hover:bg-muted/60" : ""}`}
              style={{
                background: isSelected ? "hsl(var(--accent-gold) / 0.2)" : "transparent",
                border: isSelected ? "1px solid hsl(var(--accent-gold))" : isToday ? "1px solid hsl(var(--hairline))" : "1px solid transparent",
                fontWeight: isToday ? 600 : 400,
              }}
            >
              {c ?? ""}
              {cols.length > 0 && (
                <div className="absolute bottom-0.5 flex gap-0.5">
                  {cols.map((col, idx) => (
                    <span key={idx} className="w-1 h-1 rounded-full" style={{ background: col }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
