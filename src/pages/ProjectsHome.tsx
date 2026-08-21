import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LegalMenuPopover } from "@/components/legal/LegalMenu";
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
  Copy,
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
  useTrashedProjects,
  projectStore,
  useFolders,
  useProfile,
  byProjectOrder,
  trashDaysLeft,
  MAX_PROJECTS,
  type Project,
  type Task,
  type TaskPriority,
  type ProjectFolder,
  type ProfileStatus,
  type UserProfile,
} from "@/lib/projectStore";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import {
  timelineStore,
  useTimeline,
  addQuickItem,
  itemAchieved,
  taskAlert,
  projectProgress,
  type TlKind,
} from "@/lib/timelineStore";
import { WeatherStrip } from "@/components/project/WeatherStrip";
import { UebersichtView } from "@/components/project/UebersichtView";
import { FileBrowser } from "@/components/project/FileBrowser";
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

type Tab = "uebersicht" | "aufgaben" | "finanzen" | "dokumente" | "team";

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
  /** Zusätzliche Kopf-Ansichten (Hauptseite, Netzwerk, Papierkorb). */
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
  const [leftOpen, setLeftOpen] = useState(true);
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
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
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [dragOverFolderSlot, setDragOverFolderSlot] = useState<string | null>(null);

  const projectsByFolder = useMemo(() => {
    const map = new Map<string | null, Project[]>();
    for (const p of filtered) {
      const key = p.folderId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    // Favoriten immer oben, danach manuelle Reihenfolge.
    for (const [k, arr] of map) map.set(k, [...arr].sort(byProjectOrder));
    return map;
  }, [filtered]);

  const rootProjects = projectsByFolder.get(null) ?? [];
  const draggedProject = dragProjectId
    ? projects.find((project) => project.id === dragProjectId)
    : undefined;
  const draggingProjectFromFolder = Boolean(draggedProject?.folderId);
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
    const msg = `${label} „${p.name}" wirklich löschen?\n\nAlle Inhalte werden endgültig entfernt:\n• Seiten & Zeichenblätter\n• CAD-Elemente & Bemaßungen\n• Board-Themen, Aufgaben & Notizen\n• Dokumente\n\nDieser Vorgang kann nicht rückgängig gemacht werden.`;
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

  const resetProjectDrag = () => {
    setDragProjectId(null);
    setDragOverFolder(null);
    setDragOverProjectId(null);
  };

  const handleDropOnFolder = (folderId: string | null) => {
    if (dragProjectId) {
      const sourceFolderId = projects.find((project) => project.id === dragProjectId)?.folderId ?? null;
      if (sourceFolderId !== folderId) {
        projectStore.moveProjectToFolder(dragProjectId, folderId);
      }
    }
    resetProjectDrag();
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
            label="Netzwerk"
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
          {coinsOpen && <CoinsPanel anchor={coinsRef} />}
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
          {shopOpen && <ShopPanel anchor={shopRef} />}
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
              <ProfileEditor profile={profile} projectCount={projectCount} />
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
              </div>
              <button
                type="button"
                disabled={creatingFolder}
                onClick={() => {
                  setCreatingFolder(true);
                  setNewFolderName("");
                }}
                aria-expanded={creatingFolder}
                className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border text-xs font-semibold transition disabled:cursor-default disabled:opacity-50"
                style={{
                  background: "hsl(var(--accent-gold) / 0.14)",
                  borderColor: "hsl(var(--accent-gold) / 0.4)",
                  color: "#E6E8EB",
                }}
              >
                <FolderPlus size={14} style={{ color: "hsl(var(--accent-gold))" }} />
                + Ordner
              </button>
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

            <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-1">
              {/* Ordner */}
              {folders.map((f) => {
                const inside = projectsByFolder.get(f.id) ?? [];
                const collapsed = f.collapsed;
                const isRenaming = renamingFolderId === f.id;
                const dragOver = dragOverFolder === f.id;
                const folderDropLine = dragFolderId && dragOverFolderSlot === f.id;
                return (
                  <div key={f.id}>
                    {folderDropLine && (
                      <div style={{ height: 2, background: "hsl(var(--accent-gold))", borderRadius: 2, margin: "2px 4px" }} />
                    )}
                    <div
                      draggable={!isRenaming}
                      onDragStart={(e) => { setDragFolderId(f.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragFolderId(null); setDragOverFolderSlot(null); }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragFolderId) setDragOverFolderSlot(f.id);
                        else setDragOverFolder(f.id);
                      }}
                      onDragLeave={() => {
                        setDragOverFolder((v) => (v === f.id ? null : v));
                        setDragOverFolderSlot((v) => (v === f.id ? null : v));
                      }}
                      onDrop={() => {
                        if (dragFolderId && dragFolderId !== f.id) {
                          projectStore.reorderProjectFolder(dragFolderId, f.id, "before");
                          setDragFolderId(null);
                          setDragOverFolderSlot(null);
                          return;
                        }
                        handleDropOnFolder(f.id);
                      }}
                      className="group flex items-center gap-1.5 h-8 px-2 rounded-md cursor-grab active:cursor-grabbing"
                      style={{
                        background: dragOver ? "hsl(var(--accent-gold) / 0.14)" : "rgba(255,255,255,0.03)",
                        color: "#B7BCC2",
                      }}
                    >
                      <button
                        onClick={() => projectStore.toggleProjectFolderCollapsed(f.id)}
                        style={{ color: "#8A9099" }}
                      >
                        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </button>
                      <FolderIcon size={13} style={{ color: "hsl(var(--accent-gold))" }} />
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
                          {f.name} <span style={{ color: "#8A9099" }}>({inside.length})</span>
                        </button>
                      )}
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
                      <div
                        className="relative ml-3 pl-4 space-y-1 mt-1 mb-2"
                        style={{ borderLeft: "1px solid hsl(var(--accent-gold) / 0.35)" }}
                        onDragOver={(e) => { e.preventDefault(); if (!dragFolderId) setDragOverFolder(f.id); }}
                        onDrop={() => { if (!dragFolderId) handleDropOnFolder(f.id); }}
                      >
                        {inside.length === 0 ? (
                          <div className="text-[10px] italic px-2 py-1" style={{ color: "#8A9099" }}>
                            Projekt hierher ziehen
                          </div>
                        ) : (
                          inside.map((p) => (
                            <ProjectCard
                              key={p.id}
                              project={p}
                              active={mode === "projects" && !showAllTasks && !hub && selected?.id === p.id}
                              dropIndicator={dragProjectId && dragProjectId !== p.id && dragOverProjectId === p.id}
                              onSelect={() => { setHub(null); setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); }}
                              onOpen={() => navigate(`/project/${p.id}`)}
                              onSettings={() => { setHub(null); setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); setSettingsOpen(true); }}
                              onDuplicate={() => { const nid = projectStore.duplicateProject(p.id); if (nid) setSelectedId(nid); }}
                              onDelete={() => deleteProjectWithConfirm(p)}
                              onDragStart={() => setDragProjectId(p.id)}
                              onDragEnd={resetProjectDrag}
                              onDragOverCard={() => setDragOverProjectId(p.id)}
                              onDropOnCard={() => {
                                if (dragProjectId && dragProjectId !== p.id) {
                                  projectStore.reorderProject(dragProjectId, p.id, "before");
                                }
                                resetProjectDrag();
                              }}
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
                onDragOver={(e) => { e.preventDefault(); if (!dragFolderId) setDragOverFolder("root"); }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setDragOverFolder((v) => (v === "root" ? null : v));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!dragFolderId) handleDropOnFolder(null);
                }}
                className="pt-1 space-y-1"
                style={{
                  background:
                    dragOverFolder === "root" ? "hsl(var(--accent-gold) / 0.06)" : undefined,
                  borderRadius: 6,
                }}
              >
                {draggingProjectFromFolder && (
                  <div
                    className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-dashed px-3 text-center text-[11px] font-medium"
                    style={{
                      background: dragOverFolder === "root"
                        ? "hsl(var(--accent-gold) / 0.16)"
                        : "rgba(255,255,255,0.03)",
                      borderColor: dragOverFolder === "root"
                        ? "hsl(var(--accent-gold) / 0.75)"
                        : "rgba(255,255,255,0.18)",
                      color: dragOverFolder === "root" ? "#E6E8EB" : "#B7BCC2",
                    }}
                  >
                    <FolderIcon size={14} style={{ color: "hsl(var(--accent-gold))" }} />
                    Ohne Ordner ablegen
                  </div>
                )}
                {rootProjects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    active={mode === "projects" && !showAllTasks && !hub && selected?.id === p.id}
                    dropIndicator={dragProjectId && dragProjectId !== p.id && dragOverProjectId === p.id}
                    onSelect={() => { setHub(null); setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); }}
                    onOpen={() => navigate(`/project/${p.id}`)}
                    onSettings={() => { setHub(null); setMode("projects"); setShowAllTasks(false); setSelectedId(p.id); setSettingsOpen(true); }}
                    onDuplicate={() => { const nid = projectStore.duplicateProject(p.id); if (nid) setSelectedId(nid); }}
                    onDelete={() => deleteProjectWithConfirm(p)}
                    onDragStart={() => setDragProjectId(p.id)}
                    onDragEnd={resetProjectDrag}
                    onDragOverCard={() => setDragOverProjectId(p.id)}
                    onDropOnCard={() => {
                      if (dragProjectId && dragProjectId !== p.id) {
                        projectStore.reorderProject(dragProjectId, p.id, "before");
                      }
                      resetProjectDrag();
                    }}
                  />
                ))}
              </div>
            </div>
            {/* Fuß-Zeile mit Einstellungen-Icon */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="relative">
                {legalOpen && (
                  <div className="absolute bottom-11 left-0 z-50">
                    <LegalMenuPopover onClose={() => setLegalOpen(false)} />
                  </div>
                )}
                <button
                  onClick={() => setLegalOpen((v) => !v)}
                  aria-expanded={legalOpen}
                  className="h-9 w-9 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.05)", color: "#B7BCC2" }}
                  title="Impressum & Datenschutz"
                >
                  <Settings size={15} />
                </button>
              </div>
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
          {hub === "home" ? (
            <div className="px-10 py-7">
              <h1 className="text-2xl font-semibold tracking-tight">Hauptseite</h1>
              <p className="mt-3 text-sm text-muted-foreground">Inhalte folgen in Kürze.</p>
            </div>
          ) : hub === "shared" ? (
            <SharedView profile={profile} projectCount={projectCount} />
          ) : hub === "trash" ? (
            <TrashView activeCount={projectCount} />
          ) : showAllTasks ? (
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
                            const nid = projectStore.duplicateProject(selected.id);
                            setTitleMenuOpen(false);
                            if (nid) setSelectedId(nid);
                          }}
                          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
                        >
                          <Copy size={14} /> Duplizieren
                        </button>
                        <button
                          onClick={() => {
                            const label = selected.isTemplate ? "Vorlage" : "Projektmappe";
                            const msg = `${label} „${selected.name}" wirklich löschen?\n\nAlle Inhalte werden endgültig entfernt:\n• Seiten & Zeichenblätter\n• CAD-Elemente & Bemaßungen\n• Board-Themen, Aufgaben & Notizen\n• Dokumente\n\nDieser Vorgang kann nicht rückgängig gemacht werden.`;
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
                      ["aufgaben", "Aufgaben/Notizen", false],
                      ["finanzen", "Finanzen", false],
                      ["dokumente", "Dokumente", false],
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
              {tab === "aufgaben" && <AufgabenView project={selected} />}
              {tab === "finanzen" && (
                <FinanceProjectOverview projectId={selected.id} projectName={selected.name} />
              )}
              {tab === "dokumente" && (
                <FileBrowser key={selected.id} project={selected} />
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
  dropIndicator,
  onSelect,
  onOpen,
  onSettings,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
}: {
  project: Project;
  active: boolean;
  dropIndicator?: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onSettings: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard?: () => void;
  onDropOnCard?: () => void;
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
      onDragOver={(e) => { if (onDragOverCard) { e.preventDefault(); e.stopPropagation(); onDragOverCard(); } }}
      onDrop={(e) => { if (onDropOnCard) { e.preventDefault(); e.stopPropagation(); onDropOnCard(); } }}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className="w-full text-left rounded-lg p-2 flex gap-2.5 transition cursor-pointer"
      style={{
        background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${active ? "hsl(var(--accent-gold) / 0.55)" : "rgba(255,255,255,0.04)"}`,
        borderTop: dropIndicator ? "2px solid hsl(var(--accent-gold))" : undefined,
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
              onClick={() => { setMenuOpen(false); onDuplicate(); }}
              className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-muted text-left"
            >
              <Copy size={14} /> Duplizieren
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
  source: "board";
  title: string;
  date?: string;
  time?: string;
  priority: TaskPriority;
  done: boolean;
  category?: string;
  kind: TlKind;
  /** Offene Aufgabe, deren letztes Datum überschritten ist. */
  alert?: boolean;
};

export function AufgabenView({ project }: { project: Project }) {
  const navigate = useNavigate();
  const board = useTimeline(project.id);
  useEffect(() => { timelineStore.ensureDefaults(project.id); }, [project.id]);

  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [kind, setKind] = useState<TlKind>("task");
  const [draft, setDraft] = useState({ title: "", description: "" });

  const catMap = useMemo(
    () => new Map(board.categories.map((c) => [c.id, c])),
    [board.categories],
  );

  /** Board-Einträge (Aufgaben + Notizen) für Kalender und Liste. */
  const rows: UnifiedTask[] = useMemo(() => {
    const now = Date.now();
    return board.items
      .filter((i) => i.kind === "task" || i.kind === "note")
      .map((i) => ({
        id: i.id,
        source: "board" as const,
        title: i.title,
        date: i.endDate || i.startDate,
        time: i.endTime || i.startTime,
        priority: "medium" as TaskPriority,
        done: itemAchieved(i, now),
        category: catMap.get(i.categoryId ?? "")?.label,
        kind: i.kind,
        alert: taskAlert(i, now),
      }))
      .sort((a, b) => {
        if (!!a.done !== !!b.done) return a.done ? 1 : -1;
        return `${a.date ?? "9999-99-99"} ${a.time ?? "99:99"}`.localeCompare(
          `${b.date ?? "9999-99-99"} ${b.time ?? "99:99"}`,
        );
      });
  }, [board.items, catMap]);

  const filtered = selectedDate ? rows.filter((t) => t.date === selectedDate) : rows;

  const addEntry = () => {
    if (!draft.title.trim()) return;
    addQuickItem(project.id, kind, {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      date: selectedDate || undefined,
    });
    setDraft({ title: "", description: "" });
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
            onClick={() => navigate(`/project/${project.id}/board`)}
            className="h-7 px-2.5 rounded-md text-[11px] font-medium flex items-center gap-1.5"
            style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
            title="Board öffnen"
          >
            <ListChecks size={13} /> Board
          </button>
        </div>
        <TaskCalendar
          tasks={rows}
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d)}
        />
        <div className="mt-3 text-[11px] text-muted-foreground">
          Aufgaben und Notizen sind direkt mit dem Board verknüpft.
        </div>
      </div>

      {/* Neuer Eintrag */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          NEUER EINTRAG (im Board)
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {(["task", "note"] as TlKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="h-9 px-4 rounded-md text-sm font-medium border flex items-center gap-1.5"
                style={{
                  background: kind === k ? "hsl(var(--accent-gold-soft))" : "transparent",
                  borderColor: kind === k ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  color: kind === k ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))",
                }}
              >
                <Plus size={14} /> {k === "task" ? "Aufgabe" : "Notiz"}
              </button>
            ))}
          </div>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
            placeholder={kind === "task" ? "Titel der Aufgabe…" : "Titel der Notiz…"}
            className="h-9 px-3 rounded-md border bg-transparent text-sm outline-none w-full"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Beschreibung…"
            className="px-3 py-2 rounded-md border bg-transparent text-sm outline-none w-full resize-y min-h-[220px]"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              Kategorie „Schnellablage“ · {selectedDate ? selectedDate : "heutiges Datum"} · Priorität „Normal“
            </span>
            <div className="flex-1" />
            <button
              onClick={addEntry}
              className="h-9 px-4 rounded-md text-sm font-medium flex items-center justify-center gap-1"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
            >
              <Plus size={14} /> Hinzufügen
            </button>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            AUFGABEN / NOTIZEN {selectedDate && `· ${new Date(selectedDate).toLocaleDateString("de-DE")}`}
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
              Keine Einträge.
            </div>
          )}
          {filtered.map((t) => (
            <UnifiedTaskRow
              key={t.id}
              task={t}
              projectId={project.id}
              onOpenInBoard={() => navigate(`/project/${project.id}/board`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UnifiedTaskRow({
  task, projectId, onOpenInBoard,
}: { task: UnifiedTask; projectId: string; onOpenInBoard: () => void }) {
  const dotColor = task.alert ? "hsl(0 70% 55%)" : task.done ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))";

  const toggle = () =>
    timelineStore.updateItem(projectId, task.id, {
      statusId: task.done ? "open" : "done",
      done: !task.done,
      statusManual: true,
    });
  const remove = () => timelineStore.deleteItem(projectId, task.id);

  return (
    <div className="flex items-center gap-3 py-2.5">
      <input type="checkbox" checked={task.done} onChange={toggle} className="accent-foreground" />
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate flex items-center gap-2 ${task.done ? "line-through text-muted-foreground" : ""}`}>
          {task.title}
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}>
            {task.kind === "task" ? "Aufgabe" : "Notiz"}
          </span>
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
      <button onClick={onOpenInBoard} title="Im Board öffnen" className="text-muted-foreground hover:text-foreground">
        <ExternalLink size={14} />
      </button>
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

const PROJECT_CAROUSEL_SLOTS = [-3, -2, -1, 0, 1, 2, 3] as const;
const PROJECT_CAROUSEL_INTERVAL_MS = 5000;
const PROJECT_CAROUSEL_CARD_WIDTH = 240;
const PROJECT_CAROUSEL_MAX_SPACING = 180;
const PROJECT_CAROUSEL_MIN_SPACING = 60;

/**
 * Kreisdiagramm zum Stand eines Projekts – live aus der Board-Oberfläche.
 * Ring = erledigter Anteil, Segmente = Kategorien.
 */
function ProjectDonut({ projectId, size = 96 }: { projectId: string; size?: number }) {
  const state = useTimeline(projectId);
  const now = Date.now();
  const total = state.items.length;
  const percent = total
    ? Math.round((state.items.filter((i) => itemAchieved(i, now)).length / total) * 100)
    : 0;
  const stroke = size * 0.16;
  const R = size / 2;
  const r = R - stroke / 2 - 1;
  const circ = 2 * Math.PI * r;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={R} cy={R} r={r} fill="none" stroke="hsl(var(--surface-muted))" strokeWidth={stroke} />
      <circle
        cx={R} cy={R} r={r} fill="none"
        stroke="hsl(var(--accent-gold))" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * circ} ${circ}`}
        transform={`rotate(-90 ${R} ${R})`}
      />
      <text x={R} y={R + size * 0.075} textAnchor="middle"
            fontSize={size * 0.24} fontWeight={700} fill="hsl(var(--ink))">
        {percent}%
      </text>
    </svg>
  );
}

function ProjectCarousel({ projects, onOpen }: { projects: Project[]; onOpen: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [cardSpacing, setCardSpacing] = useState(PROJECT_CAROUSEL_MAX_SPACING);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" || document.visibilityState === "visible"
  );
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const hasProjects = projects.length > 0;
  const paused = hovered || focusWithin;

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!hasProjects) return;
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;

    const updateSpacing = (width: number) => {
      const fittedSpacing = (width - PROJECT_CAROUSEL_CARD_WIDTH) / 4;
      const nextSpacing = Math.round(Math.max(
        PROJECT_CAROUSEL_MIN_SPACING,
        Math.min(PROJECT_CAROUSEL_MAX_SPACING, fittedSpacing)
      ));
      setCardSpacing((current) => current === nextSpacing ? current : nextSpacing);
    };

    updateSpacing(viewport.clientWidth);
    const observer = new ResizeObserver(([entry]) => updateSpacing(entry.contentRect.width));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [hasProjects]);

  useEffect(() => {
    if (projects.length <= 1 || paused || !pageVisible || reducedMotion) return;
    const t = window.setInterval(() => setOffset((current) => current + 1), PROJECT_CAROUSEL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pageVisible, paused, projects.length, reducedMotion]);

  if (!hasProjects) return null;

  const n = projects.length;
  const visible = PROJECT_CAROUSEL_SLOTS.map((slot) => {
    const absoluteIndex = offset + slot;
    return {
      absoluteIndex,
      slot,
      project: projects[((absoluteIndex % n) + n) % n],
    };
  });

  return (
    <div
      className="mb-8 select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      <div
        ref={viewportRef}
        className="relative flex h-64 items-center justify-center overflow-hidden"
        style={{ perspective: "1200px", perspectiveOrigin: "50% 50%" }}
      >
        {visible.map(({ absoluteIndex, slot, project: p }) => {
          const abs = Math.abs(slot);
          const buffered = abs >= 3;
          const translateX = slot * cardSpacing;
          const translateZ = -abs * 190;
          const rotateY = slot === 0 ? 0 : slot > 0 ? -38 : 38;
          const scale = 1 - abs * 0.08;
          const opacity = buffered ? 0 : abs === 2 ? 0.45 : abs === 1 ? 0.8 : 1;
          return (
            <button
              key={absoluteIndex}
              onClick={() => onOpen(p.id)}
              title={`${p.name} — Projektstand`}
              aria-hidden={buffered}
              tabIndex={buffered ? -1 : 0}
              className="absolute group outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              style={{
                transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                transformStyle: "preserve-3d",
                transition: reducedMotion
                  ? "none"
                  : "transform 700ms cubic-bezier(0.22,1,0.36,1), opacity 700ms ease",
                opacity,
                zIndex: 10 - abs,
                pointerEvents: buffered ? "none" : undefined,
              }}
            >
              <div
                className="w-60 h-40 rounded-xl overflow-hidden border flex items-center justify-center shadow-lg"
                style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
              >
                <ProjectDonut projectId={p.id} size={126} />
              </div>
              <div className={`mt-2 text-sm truncate text-center max-w-60 ${slot === 0 ? "font-semibold" : "text-muted-foreground"}`}>
                {p.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Kompakte Vorschau der Board-Oberfläche eines Projekts (Ansichtstrahl oder Projektnetz). */
function BoardPreview({ project }: { project: Project }) {
  const navigate = useNavigate();
  const state = useTimeline(project.id);
  const now = Date.now();
  const total = state.items.length;
  const percent = total
    ? Math.round((state.items.filter((i) => itemAchieved(i, now)).length / total) * 100)
    : 0;

  return (
    <div className="mt-3 rounded-xl p-4" style={{ background: "#141110", border: "1px solid #332c26" }}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-semibold" style={{ color: "#efe7de" }}>Board-Vorschau</span>
        <span className="text-[11px] tabular-nums" style={{ color: "#8b837b" }}>{percent}% · {total} Einträge</span>
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/project/${project.id}/board`)}
          className="h-7 px-2.5 rounded-md text-[11px] font-medium"
          style={{ background: "#e2703a", color: "#fff" }}
        >
          Board öffnen
        </button>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden mb-3" style={{ background: "#241f1b" }}>
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "#e2703a" }} />
      </div>
      <BoardMiniPreview projectId={project.id} projectName={project.name} />
    </div>
  );
}

function AllTasksView({ projects, onOpenProject }: { projects: Project[]; onOpenProject: (id: string) => void }) {
  const navigate = useNavigate();
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(projects.map((p) => p.id)));
  const [previewId, setPreviewId] = useState<string | null>(null);
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

  // Offene Aufgaben aus der Board-Oberfläche über alle Projekte hinweg.
  type GTask = {
    id: string; projectId: string; projectName: string; title: string;
    date?: string; time?: string; done: boolean; alert: boolean; color: string; category?: string;
  };
  const gTasks: GTask[] = useMemo(() => {
    const now = Date.now();
    const out: GTask[] = [];
    projects.forEach((p) => {
      const color = projectColor(p.id);
      try {
        const st = timelineStore.getState(p.id);
        const cats = new Map(st.categories.map((c) => [c.id, c.label]));
        st.items
          .filter((i) => i.kind === "task")
          .forEach((i) =>
            out.push({
              id: i.id,
              projectId: p.id,
              projectName: p.name,
              title: i.title,
              date: i.endDate || i.startDate,
              time: i.endTime || i.startTime,
              done: itemAchieved(i, now),
              alert: taskAlert(i, now),
              color,
              category: cats.get(i.categoryId ?? ""),
            })
          );
      } catch {}
    });
    return out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.alert !== b.alert) return a.alert ? -1 : 1;
      return `${a.date ?? "9999"} ${a.time ?? "99:99"}`.localeCompare(`${b.date ?? "9999"} ${b.time ?? "99:99"}`);
    });
  }, [projects]);

  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const visible = gTasks.filter(
    (t) => !t.done && activeIds.has(t.projectId) && (!selectedDate || t.date === selectedDate)
  );

  return (
    <div className="px-10 py-7">
      <ProjectCarousel projects={projects} onOpen={onOpenProject} />

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Alle Aufgaben</h1>
        <span className="text-sm text-muted-foreground">projektübergreifend · offen</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Aufgaben-Liste */}
        <div className="space-y-6">
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}>
            <div className="px-4 py-3 border-b text-xs font-semibold tracking-widest text-muted-foreground flex items-center justify-between" style={{ borderColor: "hsl(var(--hairline))" }}>
              <span>AUFGABEN {selectedDate ? `· ${selectedDate}` : `· ${visible.length}`}</span>
              {selectedDate && (
                <button onClick={() => setSelectedDate(undefined)} className="text-[11px] font-normal hover:text-foreground">Filter zurücksetzen</button>
              )}
            </div>
            {visible.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Keine offenen Aufgaben.</div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
                {visible.map((t) => (
                  <li
                    key={`${t.projectId}:${t.id}`}
                    onClick={() => navigate(`/project/${t.projectId}/board`)}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-muted/40 cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {t.projectName}{t.category ? ` · ${t.category}` : ""}{t.date ? ` · ${t.date}` : ""}{t.time ? ` · ${t.time}` : ""}
                      </div>
                    </div>
                    {t.alert && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: "hsl(0 70% 50% / 0.15)", color: "hsl(0 70% 40%)" }}>
                        Überfällig
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Projekte mit Kreisdiagramm + Board-Vorschau */}
          <div className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}>
            <div className="text-xs font-semibold tracking-widest text-muted-foreground mb-3">PROJEKTSTÄNDE</div>
            <div className="space-y-2">
              {projects.map((p) => (
                <div key={p.id}>
                  <button
                    onClick={() => setPreviewId((cur) => (cur === p.id ? null : p.id))}
                    className="w-full flex items-center gap-4 rounded-lg px-3 py-2 hover:bg-muted/40 text-left"
                    style={{ border: "1px solid hsl(var(--hairline))" }}
                  >
                    <ProjectDonut projectId={p.id} size={64} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {p.ort || "Ohne Ort"} · {previewId === p.id ? "Vorschau schließen" : "Board-Vorschau öffnen"}
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground shrink-0 transition-transform"
                      style={{ transform: previewId === p.id ? "rotate(90deg)" : undefined }}
                    />
                  </button>
                  {previewId === p.id && <BoardPreview project={p} />}
                </div>
              ))}
              {projects.length === 0 && <div className="text-sm text-muted-foreground">Keine Projekte.</div>}
            </div>
          </div>
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
            tasks={gTasks.filter((t) => !t.done && activeIds.has(t.projectId))}
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

/* ---------------- Münzen / Shop / Netzwerk / Papierkorb ---------------- */

const statusColorOf = (s: ProfileStatus) =>
  s === "online" ? "hsl(140 60% 45%)" : s === "busy" ? "hsl(0 70% 55%)" : "hsl(0 0% 65%)";
const statusLabelOf = (s: ProfileStatus) =>
  s === "online" ? "Online" : s === "busy" ? "Beschäftigt" : "Offline";

/**
 * Gemeinsamer Profil-Editor für das Kopf-Dropdown und die Netzwerk-Seite.
 * Beide schreiben in denselben Store, dadurch sind sie immer synchron.
 */
function ProfileEditor({ profile, projectCount }: { profile: UserProfile; projectCount: number }) {
  return (
    <>
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
      <div className="mt-4 flex gap-2">
        {(["online", "busy", "offline"] as ProfileStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => projectStore.updateProfile({ status: s })}
            className="flex-1 h-8 rounded-md border text-xs flex items-center justify-center gap-1.5"
            style={{
              borderColor: profile.status === s ? statusColorOf(s) : "hsl(var(--hairline))",
              background: profile.status === s ? `${statusColorOf(s)}20` : "transparent",
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: statusColorOf(s) }} />
            {statusLabelOf(s)}
          </button>
        ))}
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
    </>
  );
}

/**
 * Positioniert ein Popup fix unterhalb seines Ankers. Nötig, weil die Kopfzeile
 * horizontal scrollt (overflow-x-auto) und absolute Panels dort abgeschnitten werden.
 */
function useAnchorPos(anchor: React.RefObject<HTMLElement>, width: number) {
  const [pos, setPos] = useState({ top: 68, left: 0 });
  useEffect(() => {
    const update = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.min(Math.max(12, r.right - width), window.innerWidth - width - 12);
      setPos({ top: r.bottom + 8, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchor, width]);
  return pos;
}

const popupStyle: React.CSSProperties = {
  background: "hsl(var(--surface))",
  border: "1px solid hsl(var(--hairline))",
  boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
};

/** Münzen-Popup – Kaufoptionen sind vorbereitet, aber deaktiviert. */
function CoinsPanel({ anchor }: { anchor: React.RefObject<HTMLElement> }) {
  const pos = useAnchorPos(anchor, 288);
  return (
    <div
      className="fixed z-[60] w-72 rounded-xl p-4"
      style={{ ...popupStyle, top: pos.top, left: pos.left }}
    >
      <div className="flex items-center gap-2">
        <Coins size={16} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Münzen</span>
        <span className="ml-auto text-sm font-semibold">26</span>
      </div>
      <div className="mt-3 opacity-40 pointer-events-none select-none">
        <button
          className="w-full h-9 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          disabled
        >
          <Plus size={13} /> Coins
        </button>
        <div
          className="mt-3 rounded-lg p-3 text-xs space-y-1"
          style={{ background: "hsl(var(--surface-muted))", border: "1px solid hsl(var(--hairline))" }}
        >
          <div className="font-medium">Währungsumrechner</div>
          <div className="text-muted-foreground">1 Coin = 1,50 €</div>
          <div className="text-muted-foreground">10 Coins = 15,00 €</div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Kauf von Coins ist bald verfügbar.</p>
    </div>
  );
}

/** Shop-Popup – Abos und Einzelkapazitäten, vollständig ausgegraut. */
function ShopPanel({ anchor }: { anchor: React.RefObject<HTMLElement> }) {
  const pos = useAnchorPos(anchor, 320);
  const items = [
    { title: "Pro-Version", desc: "10 Projekte · je 5 GB", price: "5 Coins pro Monat" },
    { title: "Premium-Version", desc: "20 Projekte · je 10 GB", price: "10 Coins pro Monat" },
    { title: "+1 Projekt", desc: "1 zusätzliches Projekt · 5 GB", price: "1 Coin pro Monat" },
  ];
  return (
    <div
      className="fixed z-[60] w-80 rounded-xl p-4"
      style={{ ...popupStyle, top: pos.top, left: pos.left }}
    >
      <div className="flex items-center gap-2">
        <ShoppingBag size={16} className="text-muted-foreground" />
        <span className="text-sm font-semibold">Projektkapazitäten</span>
      </div>
      <div className="mt-3 space-y-2 opacity-40 pointer-events-none select-none">
        {items.map((it) => (
          <div
            key={it.title}
            className="rounded-lg p-3 flex items-center gap-3"
            style={{ background: "hsl(var(--surface-muted))", border: "1px solid hsl(var(--hairline))" }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold">{it.title}</div>
              <div className="text-[11px] text-muted-foreground">{it.desc}</div>
            </div>
            <span className="text-xs font-semibold whitespace-nowrap">{it.price}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Shop ist bald verfügbar.</p>
    </div>
  );
}

/** Netzwerk-Ansicht: eigenes Profil oben (identisch zum Kopf-Dropdown), Kontakte darunter. */
function SharedView({ profile, projectCount }: { profile: UserProfile; projectCount: number }) {
  return (
    <div className="px-10 py-7">
      <h1 className="text-2xl font-semibold tracking-tight">Netzwerk</h1>

      <div className="mt-5 max-w-xl">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">MEIN PROFIL</div>
        <div
          className="mt-2 rounded-xl border p-4"
          style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}
        >
          <ProfileEditor profile={profile} projectCount={projectCount} />
        </div>
      </div>

      <div className="mt-8 max-w-xl">
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">KONTAKTE</div>
          <button
            disabled
            className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5 opacity-40 cursor-not-allowed"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <Plus size={12} /> Kontakte
          </button>
        </div>
        <div
          className="mt-2 rounded-xl p-10 text-center text-sm text-muted-foreground"
          style={{ background: "hsl(var(--surface-card))", border: "1px dashed hsl(var(--hairline))" }}
        >
          Noch keine Kontakte hinterlegt.
        </div>
      </div>
    </div>
  );
}

/** Papierkorb: gelöschte Projekte 30 Tage lang wiederherstellbar. */
function TrashView({ activeCount }: { activeCount: number }) {
  const trashed = useTrashedProjects();
  const full = activeCount >= MAX_PROJECTS;
  return (
    <div className="px-10 py-7">
      <h1 className="text-2xl font-semibold tracking-tight">Papierkorb</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gelöschte Projekte bleiben 30 Tage erhalten und können wiederhergestellt werden.
      </p>
      <div className="mt-5 max-w-2xl">
        {full && (
          <div
            className="mb-3 rounded-lg px-4 py-3 text-xs"
            style={{ background: "hsl(var(--surface-muted))", border: "1px solid hsl(var(--hairline))" }}
          >
            Maximale Projektanzahl ({MAX_PROJECTS}) erreicht – lösche zuerst ein laufendes Projekt.
          </div>
        )}
        {trashed.length === 0 ? (
          <div
            className="rounded-xl p-10 text-center text-sm text-muted-foreground"
            style={{ background: "hsl(var(--surface-card))", border: "1px dashed hsl(var(--hairline))" }}
          >
            Der Papierkorb ist leer.
          </div>
        ) : (
          <div
            className="rounded-xl divide-y overflow-hidden border"
            style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}
          >
            {trashed.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3" style={{ borderColor: "hsl(var(--hairline))" }}>
                <div className="h-10 w-10 rounded-md overflow-hidden shrink-0" style={{ background: "hsl(var(--surface-muted))" }}>
                  {p.thumbnail && <img src={p.thumbnail} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Noch {trashDaysLeft(p)} Tage wiederherstellbar
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!projectStore.restoreProject(p.id)) {
                      alert(`Maximal ${MAX_PROJECTS} Projekte möglich. Lösche zuerst ein bestehendes Projekt.`);
                    }
                  }}
                  disabled={full}
                  className="h-8 px-3 rounded-md text-xs font-medium disabled:opacity-40"
                  style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
                >
                  Wiederherstellen
                </button>
                <button
                  onClick={() => { if (confirm(`„${p.name}" endgültig löschen?`)) projectStore.purgeProject(p.id); }}
                  className="h-8 px-2 rounded-md border text-xs"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                  title="Endgültig löschen"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
