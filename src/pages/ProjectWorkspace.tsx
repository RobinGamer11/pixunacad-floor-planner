import React, { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Type,
  Minus,
  Compass,
  FileText,
  Image as ImageIcon,
  StickyNote,
  Shapes,
  Table as TableIcon,
  Clock,
  Layers as LayersIcon,
  LayoutTemplate,
  Eye,
  EyeOff,
  Settings,
  Wrench,
  CheckSquare,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  Share2,
  Play,
  Maximize2,
  Move,
  Pencil,
  Check,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Compass as CompassIcon,
  MousePointer2,
  ExternalLink,
  Hash,
  FolderPlus,
  Folder,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from "lucide-react";

import {
  projectStore,
  useProject,
  type PageElement,
  type ElementKind,
  type PageFormat,
  type PunchPattern,
  type PunchSide,
} from "@/lib/projectStore";
import CadOverlayLayer from "@/components/page/CadOverlayLayer";

const FORMAT_SIZES: Record<PageFormat, { w: number; h: number; label: string }> = {
  "A3-quer": { w: 420, h: 297, label: "A3 Querformat (420 × 297 mm)" },
  "A3-hoch": { w: 297, h: 420, label: "A3 Hochformat (297 × 420 mm)" },
  "A4-quer": { w: 297, h: 210, label: "A4 Querformat (297 × 210 mm)" },
  "A4-hoch": { w: 210, h: 297, label: "A4 Hochformat (210 × 297 mm)" },
  frei: { w: 400, h: 300, label: "Freies Format" },
};

export type PageTool = "guide" | "line" | "text" | "cad" | null;

export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const navigate = useNavigate();
  const [activePageId, setActivePageId] = useState<string | undefined>(project?.pages[0]?.id);
  const [selectedElementId, setSelectedElementId] = useState<string | undefined>();
  const [rightTab, setRightTab] = useState<"settings" | "tools" | "layers">("settings");
  const [activeTool, setActiveTool] = useState<PageTool>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [renamingPageId, setRenamingPageId] = useState<string | undefined>();
  const [pageNameDraft, setPageNameDraft] = useState("");
  const [pageActionsSticky, setPageActionsSticky] = useState(false);
  const [dragPageIdx, setDragPageIdx] = useState<number | null>(null);
  const [bgOverlay, setBgOverlay] = useState<{ pageId?: string; opacity: number; visible: boolean }>({
    opacity: 0.35,
    visible: true,
  });
  const [zoom, setZoom] = useState(77);
  const setZoomClamped = (v: number) => setZoom(Math.max(10, Math.min(400, Math.round(v))));
  const setActiveToolAndTab = (t: PageTool) => {
    setActiveTool(t);
    if (t) setRightTab("tools");
  };

  // Per-tool settings (live in workspace state; persist could come later).
  const [toolSettings, setToolSettings] = useState({
    guide: { color: "#7DD3FC", strokeWidth: 1 },
    line: { color: "#111111", thicknessMm: 0.5, alpha: 100 },
    text: { fontSize: 16, color: "#111111", bold: false, italic: false, alpha: 100 },
  });
  const updateToolSettings = <K extends keyof typeof toolSettings>(k: K, patch: Partial<(typeof toolSettings)[K]>) =>
    setToolSettings((s) => ({ ...s, [k]: { ...s[k], ...patch } }));



  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <div className="text-lg">Projekt nicht gefunden.</div>
          <button onClick={() => navigate("/")} className="mt-3 underline">
            Zurück zur Startseite
          </button>
        </div>
      </div>
    );
  }

  const activePage = project.pages.find((p) => p.id === activePageId) ?? project.pages[0];
  const selectedElement = activePage?.elements.find((e) => e.id === selectedElementId);
  const bgPage = bgOverlay.pageId ? project.pages.find((p) => p.id === bgOverlay.pageId) : undefined;

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
    >
      {/* Far-left tool rail */}
      <aside
        className="flex flex-col items-center py-3 w-14 shrink-0 border-r gap-1"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <ToolRailButton
          icon={<MousePointer2 size={18} />}
          label="Auswahl"
          active={activeTool === null}
          onClick={() => setActiveTool(null)}
        />
        <ToolRailButton
          icon={<ExternalLink size={18} />}
          label="CAD öffnen"
          onClick={() => navigate(`/project/${project.id}/cad`)}
          accent
        />
        <ToolRailButton
          icon={<CompassIcon size={18} />}
          label="CAD-Blatt"
          active={activeTool === "cad"}
          onClick={() => setActiveToolAndTab(activeTool === "cad" ? null : "cad")}
        />
        <ToolRailButton
          icon={<Type size={18} />}
          label="Text"
          active={activeTool === "text"}
          onClick={() => setActiveToolAndTab(activeTool === "text" ? null : "text")}
        />
        <ToolRailButton
          icon={<Minus size={18} style={{ strokeDasharray: "3 2" }} />}
          label="Hilfslinie"
          active={activeTool === "guide"}
          onClick={() => setActiveToolAndTab(activeTool === "guide" ? null : "guide")}
        />
        <ToolRailButton
          icon={<Minus size={18} />}
          label="Linie"
          active={activeTool === "line"}
          onClick={() => setActiveToolAndTab(activeTool === "line" ? null : "line")}
        />
        <ToolRailButton icon={<Hash size={18} />} label="Schraffur" />
        <ToolRailButton icon={<FileText size={18} />} label="PDF einfügen" />
        <ToolRailButton icon={<ImageIcon size={18} />} label="Bild" />
        <ToolRailButton icon={<TableIcon size={18} />} label="Tabelle" />
        <ToolRailButton icon={<StickyNote size={18} />} label="Notiz" />
        <ToolRailButton icon={<Clock size={18} />} label="Zeitstrahl" />
        <ToolRailButton icon={<Shapes size={18} />} label="Formen" />
        <div className="mt-auto flex flex-col items-center gap-1">
          <ToolRailButton icon={<LayersIcon size={18} />} label="Ebenen" onClick={() => setRightTab("layers")} />
          <ToolRailButton icon={<LayoutTemplate size={18} />} label="Vorlagen" />
        </div>
      </aside>

      {/* Top header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="h-12 flex items-center justify-between px-4 border-b shrink-0"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/")}
              className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted"
              title="Zurück zur Projektübersicht"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-sm font-semibold truncate">{project.name}</div>
            <span className="text-xs text-muted-foreground">›</span>
            <div className="text-sm truncate">{activePage?.title}</div>
            <span
              className="ml-1 text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
            >
              Bearbeiten
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <button className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted" title="Rückgängig">
              <Undo2 size={16} />
            </button>
            <button className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted" title="Wiederherstellen">
              <Redo2 size={16} />
            </button>
            <span className="text-xs px-2 tabular-nums">{zoom}%</span>
            <button className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-muted" title="Vollbild">
              <Maximize2 size={16} />
            </button>
            <button className="h-8 px-3 rounded-md border text-sm flex items-center gap-1.5" style={{ borderColor: "hsl(var(--hairline))" }}>
              <Share2 size={14} /> Teilen
            </button>
            <button
              className="h-8 w-8 rounded-md flex items-center justify-center"
              style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
              title="Präsentieren"
            >
              <Play size={14} />
            </button>
            <button
              className="h-8 px-3 rounded-md text-sm font-medium"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
            >
              Exportieren
            </button>
          </div>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Pages sidebar (collapsible) */}
          {leftOpen ? (
            <aside
              className="w-[240px] shrink-0 border-r flex flex-col relative"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">SEITEN</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => projectStore.addPage(project.id)} title="Seite hinzufügen">
                    <Plus size={14} className="text-muted-foreground" />
                  </button>
                  <button onClick={() => setLeftOpen(false)} title="Einklappen">
                    <PanelLeftClose size={14} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {project.pages.map((pg, idx) => {
                  const active = pg.id === activePage?.id;
                  const isRenaming = renamingPageId === pg.id;
                  const showActions = active && pageActionsSticky;
                  return (
                    <div
                      key={pg.id}
                      draggable={!isRenaming}
                      onDragStart={(e) => {
                        setDragPageIdx(idx);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        if (dragPageIdx !== null && dragPageIdx !== idx) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragPageIdx !== null && dragPageIdx !== idx) {
                          projectStore.reorderPage(project.id, dragPageIdx, idx);
                        }
                        setDragPageIdx(null);
                      }}
                      onDragEnd={() => setDragPageIdx(null)}
                      onClick={() => {
                        if (isRenaming) return;
                        if (active) {
                          // re-click the active page toggles sticky action icons
                          setPageActionsSticky((v) => !v);
                          return;
                        }
                        setActivePageId(pg.id);
                        setSelectedElementId(undefined);
                        setPageActionsSticky(false);
                      }}
                      className="group w-full text-left rounded-lg p-2 flex gap-2.5 transition cursor-pointer"
                      style={{
                        background: active ? "hsl(var(--surface-card))" : "transparent",
                        border: active ? "1px solid hsl(var(--accent-gold) / 0.4)" : "1px solid transparent",
                        opacity: dragPageIdx === idx ? 0.5 : 1,
                      }}
                    >
                      <div className="flex flex-col items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition cursor-grab">
                        <GripVertical size={12} />
                      </div>
                      <div
                        className="w-12 h-9 rounded shrink-0 border"
                        style={{ background: "white", borderColor: "hsl(var(--hairline))" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                          <span>{String(idx + 1).padStart(2, "0")}</span>
                          {!isRenaming && (
                            <span
                              className={`flex items-center gap-1 transition ${
                                showActions ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newId = projectStore.duplicatePage(project.id, pg.id);
                                  if (newId) setActivePageId(newId);
                                }}
                                title="Duplizieren"
                                className="hover:text-foreground"
                              >
                                <Copy size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingPageId(pg.id);
                                  setPageNameDraft(pg.title.replace(/^\d+\s*/, ""));
                                }}
                                title="Umbenennen"
                                className="hover:text-foreground"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (project.pages.length <= 1) return;
                                  if (!confirm(`Seite "${pg.title}" löschen?`)) return;
                                  projectStore.deletePage(project.id, pg.id);
                                  if (activePageId === pg.id) {
                                    setActivePageId(project.pages.find((p) => p.id !== pg.id)?.id);
                                  }
                                }}
                                title="Löschen"
                                className="hover:text-destructive"
                              >
                                <Trash2 size={11} />
                              </button>
                            </span>
                          )}
                        </div>
                        {isRenaming ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              autoFocus
                              value={pageNameDraft}
                              onChange={(e) => setPageNameDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  projectStore.updatePage(project.id, pg.id, { title: pageNameDraft.trim() || pg.title });
                                  setRenamingPageId(undefined);
                                } else if (e.key === "Escape") {
                                  setRenamingPageId(undefined);
                                }
                              }}
                              className="flex-1 min-w-0 text-sm h-6 px-1 rounded border bg-background"
                              style={{ borderColor: "hsl(var(--hairline))" }}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                projectStore.updatePage(project.id, pg.id, { title: pageNameDraft.trim() || pg.title });
                                setRenamingPageId(undefined);
                              }}
                              title="Speichern"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingPageId(undefined);
                              }}
                              title="Abbrechen"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="text-sm truncate">{pg.title.replace(/^\d+\s*/, "")}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Background overlay */}
              <div
                className="border-t p-3"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
                  HINTERGRUND (TRANSPARENZ)
                  <button onClick={() => setBgOverlay((o) => ({ ...o, visible: !o.visible }))}>
                    <Eye size={13} style={{ opacity: bgOverlay.visible ? 1 : 0.4 }} />
                  </button>
                </div>
                <select
                  value={bgOverlay.pageId ?? ""}
                  onChange={(e) => setBgOverlay((o) => ({ ...o, pageId: e.target.value || undefined }))}
                  className="w-full text-sm h-8 px-2 rounded bg-transparent border"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                >
                  <option value="">— Keine —</option>
                  {project.pages
                    .filter((p) => p.id !== activePage?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(bgOverlay.opacity * 100)}
                    onChange={(e) =>
                      setBgOverlay((o) => ({ ...o, opacity: Number(e.target.value) / 100 }))
                    }
                    className="flex-1 accent-foreground"
                  />
                  <span className="text-xs w-8 text-right">
                    {Math.round(bgOverlay.opacity * 100)} %
                  </span>
                </div>
              </div>
            </aside>
          ) : (
            <div
              className="w-7 shrink-0 border-r flex items-start justify-center pt-3"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <button
                onClick={() => setLeftOpen(true)}
                title="Seiten einblenden"
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted"
              >
                <PanelLeftOpen size={14} className="text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Canvas */}
          <main
            className="flex-1 relative flex flex-col min-w-0"
            style={{ background: "hsl(var(--surface))" }}
          >
            <div
              className="flex-1 overflow-auto"
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey || !e.shiftKey) {
                  // mouse wheel zooms; allow scroll only with shift
                  if (e.shiftKey) return;
                  e.preventDefault();
                  const delta = -e.deltaY;
                  setZoomClamped(zoom + (delta > 0 ? 5 : -5));
                }
              }}
              onMouseDown={(e) => {
                // Pan via:
                //  • Middle-mouse / Alt+Left (always works, even with a tool active)
                //  • Plain Left click on empty surface when no tool is active
                //    (clicks on page elements call stopPropagation, so they don't reach here)
                const isMiddle = e.button === 1 || (e.button === 0 && (e as any).altKey);
                const isPlainLeftIdle = e.button === 0 && !(e as any).altKey && activeTool === null;
                if (!isMiddle && !isPlainLeftIdle) return;
                e.preventDefault();
                const container = e.currentTarget as HTMLDivElement;
                const startX = e.clientX;
                const startY = e.clientY;
                const startScrollL = container.scrollLeft;
                const startScrollT = container.scrollTop;
                const prevCursor = container.style.cursor;
                container.style.cursor = "grabbing";
                const onMove = (ev: MouseEvent) => {
                  container.scrollLeft = startScrollL - (ev.clientX - startX);
                  container.scrollTop = startScrollT - (ev.clientY - startY);
                };
                const onUp = () => {
                  container.style.cursor = prevCursor;
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            >
              {activePage && (
                <PageCanvas
                  projectId={project.id}
                  page={activePage}
                  overlayPage={bgOverlay.visible ? bgPage : undefined}
                  overlayOpacity={bgOverlay.opacity}
                  selectedElementId={selectedElementId}
                  zoom={zoom}
                  activeTool={activeTool}
                  toolSettings={toolSettings}
                  onCommitTool={() => setActiveTool(null)}
                  onSelect={(id) => {
                    setSelectedElementId(id);
                    if (id) setRightTab("tools");
                  }}
                />
              )}
            </div>
            <ZoomBar zoom={zoom} setZoom={setZoomClamped} />
          </main>

          {/* Right inspector (collapsible) */}
          {rightOpen ? (
            <RightInspector
              projectId={project.id}
              page={activePage}
              element={selectedElement}
              tab={rightTab}
              setTab={setRightTab}
              project={project}
              activeTool={activeTool}
              setActiveTool={setActiveToolAndTab}
              selectedElementId={selectedElementId}
              setSelectedElementId={setSelectedElementId}
              toolSettings={toolSettings}
              updateToolSettings={updateToolSettings}
              onJumpCad={(sheetId) => navigate(`/project/${project.id}/cad${sheetId ? `/${sheetId}` : ""}`)}
              onCollapse={() => setRightOpen(false)}
            />

          ) : (
            <div
              className="w-7 shrink-0 border-l flex items-start justify-center pt-3"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <button
                onClick={() => setRightOpen(true)}
                title="Inspector einblenden"
                className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted"
              >
                <PanelRightOpen size={14} className="text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function ToolRailButton({
  icon,
  label,
  active,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[9px] gap-0.5 hover:bg-muted"
      style={{
        background: active ? "hsl(var(--surface-muted))" : "transparent",
        color: accent
          ? "hsl(var(--accent-gold))"
          : active
          ? "hsl(var(--ink))"
          : "hsl(var(--ink-soft))",
      }}
    >
      {icon}
      <span className="leading-none">{label.length > 8 ? label.slice(0, 6) + "…" : label}</span>
    </button>
  );
}

const PUNCH_PATTERNS: Record<Exclude<PunchPattern, "none">, { label: string; offsets: number[]; diameter: number }> = {
  // offsets are distances (mm) of each hole center measured from the start of the bound edge (page corner)
  "2-fach": { label: "2-fach (DIN 5005, 80 mm)", offsets: [-40, 40], diameter: 6 },
  "4-fach": { label: "4-fach (8/8/8 cm)", offsets: [-120, -40, 40, 120], diameter: 6 },
  "6-fach-a5": { label: "6-fach A5 Ringbuch", offsets: [-79, -47.5, -15.8, 15.8, 47.5, 79], diameter: 5.5 },
};

type ToolSettings = {
  guide: { color: string; strokeWidth: number };
  line: { color: string; thicknessMm: number; alpha: number };
  text: { fontSize: number; color: string; bold: boolean; italic: boolean; alpha: number };
};

function PageCanvas({
  projectId,
  page,
  overlayPage,
  overlayOpacity,
  selectedElementId,
  zoom,
  activeTool,
  toolSettings,
  onCommitTool,
  onSelect,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
  overlayPage?: import("@/lib/projectStore").ProjectPage;
  overlayOpacity: number;
  selectedElementId?: string;
  zoom: number;
  activeTool: PageTool;
  toolSettings: ToolSettings;
  onCommitTool: () => void;
  onSelect: (id?: string) => void;
}) {
  const fmt = FORMAT_SIZES[page.format];
  const aspect = fmt.w / fmt.h;
  // The sheet is rendered at a FIXED real size (mm-defined). Zoom is a pure
  // view transform applied via CSS scale, like PowerPoint / CAD — page, holes,
  // margins, frame and strokes all scale together with the view.
  const baseWidth = 1100;
  const width = baseWidth;
  const height = width / aspect;
  const mmToPx = width / fmt.w;
  const marginPx = (page.margins ?? 0) * mmToPx;
  const scale = zoom / 100;

  // Tool drawing state (click-click). Coordinates in % of page.
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [hoverPt, setHoverPt] = useState<{ x: number; y: number } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const toPct = (clientX: number, clientY: number) => {
    const r = pageRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * 100,
      y: ((clientY - r.top) / r.height) * 100,
    };
  };

  // Click-to-draw is used ONLY for the lightweight "Hilfslinie" (guide) and
  // "Text" tools. The real "Linie" tool is handled by the embedded CAD engine
  // (CadOverlayLayer) — see below — so it provides 1:1 snap/ortho/hub.
  const drawingTool = activeTool === "guide";
  const cursorStyle = drawingTool ? "crosshair" : activeTool === "text" ? "text" : undefined;

  const handlePageMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !drawingTool && activeTool !== "text") return;
    if (activeTool === "text") {
      const p = toPct(e.clientX, e.clientY);
      projectStore.addElement(projectId, page.id, {
        kind: "text",
        x: Math.max(0, p.x),
        y: Math.max(0, p.y - 2),
        w: 25,
        h: 6,
        text: "Text",
        fontSize: toolSettings.text.fontSize,
        color: toolSettings.text.color,
        bold: toolSettings.text.bold,
        italic: toolSettings.text.italic,
      });
      onCommitTool();
      return;
    }
    if (drawingTool) {
      const p = toPct(e.clientX, e.clientY);
      if (!pendingStart) {
        setPendingStart(p);
        setHoverPt(p);
      } else {
        const pts = [pendingStart, p];
        const minX = Math.min(pts[0].x, pts[1].x);
        const minY = Math.min(pts[0].y, pts[1].y);
        const maxX = Math.max(pts[0].x, pts[1].x);
        const maxY = Math.max(pts[0].y, pts[1].y);
        projectStore.addElement(projectId, page.id, {
          kind: "guide",
          x: minX,
          y: minY,
          w: Math.max(0.2, maxX - minX),
          h: Math.max(0.2, maxY - minY),
          points: pts,
          color: toolSettings.guide.color,
          strokeWidth: toolSettings.guide.strokeWidth,
          nonPrinting: true,
        });
        setPendingStart(null);
        setHoverPt(null);
      }
      return;
    }
    // not drawing: deselect
    if (e.target === e.currentTarget) onSelect(undefined);
  };

  const handlePageMouseMove = (e: React.MouseEvent) => {
    if (!drawingTool || !pendingStart) return;
    setHoverPt(toPct(e.clientX, e.clientY));
  };

  // Escape cancels pending draw
  React.useEffect(() => {
    if (!pendingStart && activeTool === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPendingStart(null);
        setHoverPt(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingStart, activeTool]);

  const punchSide: PunchSide = page.punchSide ?? "left";
  const punchPattern = page.punchPattern ?? "none";
  const punchCfg = punchPattern !== "none" ? PUNCH_PATTERNS[punchPattern] : undefined;
  const edgeInsetMm = 12;
  const holes: { left: number; top: number; size: number }[] = [];
  if (punchCfg) {
    const sizePx = punchCfg.diameter * mmToPx;
    const inset = edgeInsetMm * mmToPx;
    if (punchSide === "left" || punchSide === "right") {
      const cx = punchSide === "left" ? inset : width - inset;
      punchCfg.offsets.forEach((o) => {
        const cy = height / 2 + o * mmToPx;
        if (cy > sizePx / 2 && cy < height - sizePx / 2) {
          holes.push({ left: cx - sizePx / 2, top: cy - sizePx / 2, size: sizePx });
        }
      });
    } else {
      const cy = punchSide === "top" ? inset : height - inset;
      punchCfg.offsets.forEach((o) => {
        const cx = width / 2 + o * mmToPx;
        if (cx > sizePx / 2 && cx < width - sizePx / 2) {
          holes.push({ left: cx - sizePx / 2, top: cy - sizePx / 2, size: sizePx });
        }
      });
    }
  }

  const lineEls = page.elements.filter((e) => e.kind === "line" || e.kind === "guide");
  const otherEls = page.elements.filter((e) => e.kind !== "line" && e.kind !== "guide");

  return (
    <div
      className="min-h-full flex items-start justify-center"
      style={{ padding: "60vh 60vw" }}
    >
      <div
        className="relative"
        style={{
          width: width * scale,
          height: height * scale,
        }}
      >
        <div
          ref={pageRef}
          className="relative shadow-xl"
          style={{
            width,
            height,
            background: "white",
            border: "1px solid hsl(var(--hairline))",
            cursor: cursorStyle,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          onMouseDown={handlePageMouseDown}
          onMouseMove={handlePageMouseMove}
        >
        {/* Margin overlay (light grey ring) */}
        {marginPx > 0 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderTop: `${marginPx}px solid hsl(0 0% 92%)`,
              borderBottom: `${marginPx}px solid hsl(0 0% 92%)`,
              borderLeft: `${marginPx}px solid hsl(0 0% 92%)`,
              borderRight: `${marginPx}px solid hsl(0 0% 92%)`,
              boxSizing: "border-box",
            }}
          />
        )}
        {overlayPage && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ opacity: overlayOpacity }}
          >
            {overlayPage.elements
              .filter((e) => e.kind !== "line" && e.kind !== "guide")
              .map((el) => (
                <ElementView key={el.id} el={el} readOnly />
              ))}
            <div className="absolute inset-0 bg-amber-100/10" />
          </div>
        )}
        {otherEls.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            selected={el.id === selectedElementId}
            onSelect={() => onSelect(el.id)}
            onDrag={(dx, dy) => {
              projectStore.updateElement(projectId, page.id, el.id, {
                x: Math.max(0, Math.min(95, el.x + (dx / scale / width) * 100)),
                y: Math.max(0, Math.min(95, el.y + (dy / scale / height) * 100)),
              });
            }}
          />
        ))}

        {/* Lines and guides (SVG layer in page-% coords) */}
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%" }}
        >
          {lineEls.map((el) => {
            const pts = el.points ?? [];
            if (pts.length < 2) return null;
            const isGuide = el.kind === "guide";
            return (
              <line
                key={el.id}
                x1={pts[0].x}
                y1={pts[0].y}
                x2={pts[1].x}
                y2={pts[1].y}
                stroke={el.color ?? (isGuide ? "#7DD3FC" : "#1a1a1a")}
                strokeWidth={(el.strokeWidth ?? (isGuide ? 1 : 1.5)) * 0.15}
                strokeDasharray={isGuide ? "1.2 0.8" : undefined}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelect(el.id);
                }}
                opacity={el.id === selectedElementId ? 1 : 0.95}
              />
            );
          })}
          {/* Preview of line being drawn */}
          {drawingTool && pendingStart && hoverPt && (
            <line
              x1={pendingStart.x}
              y1={pendingStart.y}
              x2={hoverPt.x}
              y2={hoverPt.y}
              stroke={activeTool === "guide" ? "#7DD3FC" : "#1a1a1a"}
              strokeWidth={0.2}
              strokeDasharray={activeTool === "guide" ? "1.2 0.8" : "0.6 0.6"}
              vectorEffect="non-scaling-stroke"
              opacity={0.7}
            />
          )}
        </svg>

        {/* Punch holes overlay */}
        {holes.map((h, i) => (
          <div
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: h.left,
              top: h.top,
              width: h.size,
              height: h.size,
              background: "hsl(0 0% 88%)",
              border: "1px solid hsl(0 0% 75%)",
            }}
          />
        ))}
        </div>
        {/*
          Embedded CAD engine overlay — sibling of the scaled page so the
          canvas itself is rendered at the *visual* size (no double-scale)
          while reusing the standalone CAD engine for 1:1 snap/ortho/hub.
        */}
        <CadOverlayLayer
          key={page.id}
          pageWidthMm={fmt.w}
          pageHeightMm={fmt.h}
          basePxPerMm={baseWidth / fmt.w}
          zoom={scale}
          activeTool={activeTool === "line" ? "line" : null}
          enabled={activeTool === "line"}
          initialState={page.cadOverlay}
          lineColor={toolSettings.line.color}
          lineThicknessMm={toolSettings.line.thicknessMm}
          onChange={(state) =>
            projectStore.updatePage(projectId, page.id, { cadOverlay: state })
          }
        />
      </div>
    </div>
  );
}


function ZoomBar({ zoom, setZoom }: { zoom: number; setZoom: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div
      className="h-10 shrink-0 border-t flex items-center justify-center gap-3 px-4"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <button
        onClick={() => setZoom(zoom - 10)}
        className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground"
        title="Verkleinern"
      >
        <ZoomOut size={14} />
      </button>
      <input
        type="range"
        min={10}
        max={400}
        step={1}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="w-64 accent-foreground"
      />
      <button
        onClick={() => setZoom(zoom + 10)}
        className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground"
        title="Vergrößern"
      >
        <ZoomIn size={14} />
      </button>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={10}
          max={400}
          value={draft ?? zoom}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null) {
              const n = Number(draft);
              if (!Number.isNaN(n)) setZoom(n);
              setDraft(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-14 h-7 px-2 rounded border bg-transparent text-sm text-right tabular-nums"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <button
        onClick={() => setZoom(100)}
        className="text-xs text-muted-foreground hover:text-foreground ml-2"
        title="Auf 100 %"
      >
        100 %
      </button>
    </div>
  );
}

function ElementView({
  el,
  selected,
  readOnly,
  onSelect,
  onDrag,
}: {
  el: PageElement;
  selected?: boolean;
  readOnly?: boolean;
  onSelect?: () => void;
  onDrag?: (dx: number, dy: number) => void;
}) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    onSelect?.();
    dragRef.current = { x: e.clientX, y: e.clientY };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      dragRef.current = { x: ev.clientX, y: ev.clientY };
      onDrag?.(dx, dy);
    };
    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute"
      style={{
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.w}%`,
        height: `${el.h}%`,
        outline: selected ? "2px solid hsl(var(--accent-gold))" : "none",
        cursor: readOnly ? "default" : "move",
        opacity: el.opacity ?? 1,
        boxShadow: el.shadow ? "0 8px 24px -8px rgba(0,0,0,0.25)" : undefined,
        border: el.border ? "1px solid hsl(var(--ink))" : undefined,
      }}
    >
      {el.kind === "text" && (
        <div
          style={{
            fontSize: el.fontSize ?? 16,
            color: el.color ?? "hsl(var(--ink))",
            fontWeight: el.bold ? 700 : 400,
            fontStyle: el.italic ? "italic" : "normal",
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          {el.text || "Text"}
        </div>
      )}
      {el.kind === "image" && (
        <img
          src={el.imageUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{ background: "hsl(var(--surface-muted))" }}
        />
      )}
      {el.kind === "note" && (
        <div
          className="w-full h-full p-3 text-sm"
          style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--ink))" }}
        >
          {el.text || "Notiz"}
        </div>
      )}
      {el.kind === "cad-view" && (
        <div
          className="w-full h-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}
        >
          CAD-Ansicht{el.sheetId ? ` · ${el.sheetId}` : ""}
        </div>
      )}
      {(el.kind === "shape" || el.kind === "line" || el.kind === "table" || el.kind === "pdf" || el.kind === "timeline") && (
        <div
          className="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
          style={{ background: "hsl(var(--surface-muted))" }}
        >
          {el.kind}
        </div>
      )}
    </div>
  );
}

function RightInspector({
  projectId,
  page,
  element,
  tab,
  setTab,
  project,
  activeTool,
  setActiveTool,
  selectedElementId,
  setSelectedElementId,
  toolSettings,
  updateToolSettings,
  onJumpCad,
  onCollapse,
}: {
  projectId: string;
  page?: import("@/lib/projectStore").ProjectPage;
  element?: PageElement;
  tab: "settings" | "tools" | "layers";
  setTab: (t: "settings" | "tools" | "layers") => void;
  project: import("@/lib/projectStore").Project;
  activeTool: PageTool;
  setActiveTool: (t: PageTool) => void;
  selectedElementId?: string;
  setSelectedElementId: (id?: string) => void;
  toolSettings: ToolSettings;
  updateToolSettings: <K extends keyof ToolSettings>(k: K, patch: Partial<ToolSettings[K]>) => void;
  onJumpCad: (sheetId?: string) => void;
  onCollapse?: () => void;
}) {
  const layerCount = page?.elements.length ?? 0;
  return (
    <aside
      className="w-[340px] shrink-0 border-l flex flex-col relative"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <button
        onClick={onCollapse}
        title="Einklappen"
        className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted z-10"
      >
        <PanelRightClose size={14} className="text-muted-foreground" />
      </button>
      <div className="grid grid-cols-3 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={14} />} label="Seiteneinstellung" />
        <TabButton active={tab === "tools"} onClick={() => setTab("tools")} icon={<Wrench size={14} />} label="Werkzeugeinstellung" />
        <TabButton
          active={tab === "layers"}
          onClick={() => setTab("layers")}
          icon={<LayersIcon size={14} />}
          label="Ebenen"
          badge={layerCount > 0 ? layerCount : undefined}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {tab === "settings" && page && <PageSettings projectId={projectId} page={page} />}
        {tab === "tools" && (
          <ToolsTab
            projectId={projectId}
            pageId={page?.id}
            element={element}
            project={project}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            selectedElementId={selectedElementId}
            setSelectedElementId={setSelectedElementId}
            toolSettings={toolSettings}
            updateToolSettings={updateToolSettings}
            onJumpCad={onJumpCad}
          />
        )}
        {tab === "layers" && page && (
          <LayersTab
            projectId={projectId}
            page={page}
            selectedElementId={selectedElementId}
            setSelectedElementId={setSelectedElementId}
          />
        )}
      </div>
    </aside>
  );
}


function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="py-3 flex flex-col items-center gap-1 text-[11px] relative"
      style={{
        color: active ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
        fontWeight: active ? 600 : 400,
        background: active ? "hsl(var(--surface))" : "transparent",
      }}
    >
      <span className="flex items-center gap-1">
        {icon}
        {badge !== undefined && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: "hsl(var(--accent-gold))", color: "white" }}
          >
            {badge}
          </span>
        )}
      </span>
      <span className="text-center leading-tight">{label}</span>
      {active && (
        <span
          className="absolute left-2 right-2 -bottom-px h-[2px]"
          style={{ background: "hsl(var(--accent-gold))" }}
        />
      )}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function PageSettings({
  projectId,
  page,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
}) {
  const update = (patch: Partial<typeof page>) => projectStore.updatePage(projectId, page.id, patch);
  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          SEITENEINSTELLUNGEN
        </div>
        <div className="space-y-3">
          <Row label="Seitentitel">
            <input
              value={page.title}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Format">
            <select
              value={page.format}
              onChange={(e) => update({ format: e.target.value as PageFormat })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              {(Object.entries(FORMAT_SIZES) as [PageFormat, typeof FORMAT_SIZES[PageFormat]][]).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                )
              )}
            </select>
          </Row>
          <Row label="Ausrichtung">
            <div className="flex gap-2">
              <button
                onClick={() => update({ format: page.format.includes("hoch") ? (page.format.replace("hoch", "quer") as PageFormat) : page.format })}
                className="h-8 w-8 rounded border flex items-center justify-center"
                style={{ borderColor: "hsl(var(--hairline))" }}
                title="Querformat"
              >
                ▭
              </button>
              <button
                onClick={() => update({ format: page.format.includes("quer") ? (page.format.replace("quer", "hoch") as PageFormat) : page.format })}
                className="h-8 w-8 rounded border flex items-center justify-center"
                style={{ borderColor: "hsl(var(--hairline))" }}
                title="Hochformat"
              >
                ▯
              </button>
            </div>
          </Row>
          <Row label="Ränder">
            <select
              value={page.margins}
              onChange={(e) => update({ margins: Number(e.target.value) })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value={10}>Schmal (10 mm)</option>
              <option value={20}>Normal (20 mm)</option>
              <option value={30}>Breit (30 mm)</option>
            </select>
          </Row>
          <Row label="Hintergrund">
            <input
              type="checkbox"
              checked={page.background}
              onChange={(e) => update({ background: e.target.checked })}
            />
          </Row>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          ABHEFTUNG
        </div>
        <div className="space-y-3">
          <Row label="Lochung">
            <select
              value={page.punchPattern ?? "none"}
              onChange={(e) => update({ punchPattern: e.target.value as PunchPattern })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value="none">Keine</option>
              <option value="2-fach">2-fach (DIN 5005, 80 mm)</option>
              <option value="4-fach">4-fach (8/8/8 cm)</option>
              <option value="6-fach-a5">6-fach A5 Ringbuch</option>
            </select>
          </Row>
          <Row label="Position">
            <select
              value={page.punchSide ?? "left"}
              onChange={(e) => update({ punchSide: e.target.value as PunchSide })}
              disabled={(page.punchPattern ?? "none") === "none"}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm disabled:opacity-50"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value="left">Links</option>
              <option value="right">Rechts</option>
              <option value="top">Oben</option>
              <option value="bottom">Unten</option>
            </select>
          </Row>
        </div>
      </div>
    </div>
  );
}

function ToolsTab({
  projectId,
  pageId,
  element,
  project,
  activeTool,
  setActiveTool,
  selectedElementId,
  setSelectedElementId,
  toolSettings,
  updateToolSettings,
  onJumpCad,
}: {
  projectId: string;
  pageId?: string;
  element?: PageElement;
  project: import("@/lib/projectStore").Project;
  activeTool: PageTool;
  setActiveTool: (t: PageTool) => void;
  selectedElementId?: string;
  setSelectedElementId: (id?: string) => void;
  toolSettings: ToolSettings;
  updateToolSettings: <K extends keyof ToolSettings>(k: K, patch: Partial<ToolSettings[K]>) => void;
  onJumpCad: (sheetId?: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* Active tool header */}
      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          AKTIVES WERKZEUG
        </div>
        {!activeTool ? (
          <div className="text-xs text-muted-foreground">
            Wähle links in der Werkzeugleiste ein Werkzeug (Hilfslinie, Linie, Text, CAD-Blatt) — die zugehörigen Einstellungen erscheinen hier.
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "hsl(var(--hairline))" }}>
            <div className="text-sm font-medium">
              {activeTool === "guide" && "Hilfslinie"}
              {activeTool === "line" && "Linie (CAD)"}
              {activeTool === "text" && "Text (CAD)"}
              {activeTool === "cad" && "CAD-Zeichenblatt"}
            </div>
            <button
              onClick={() => setActiveTool(null)}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Beenden
            </button>
          </div>
        )}
        {activeTool && activeTool !== "cad" && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {activeTool === "text"
              ? "Klick auf die Seite, um Text einzufügen. ESC = abbrechen."
              : activeTool === "line"
              ? "Klicken setzt Punkte (Snap/Ortho/Hub wie in CAD). ESC = abbrechen."
              : "Zwei Klicks setzen Start- und Endpunkt. ESC = abbrechen."}
          </div>
        )}
      </div>

      {/* Per-tool settings */}
      {activeTool === "guide" && (
        <GuideSettings
          settings={toolSettings.guide}
          onChange={(p) => updateToolSettings("guide", p)}
        />
      )}
      {activeTool === "line" && (
        <LineSettings
          settings={toolSettings.line}
          onChange={(p) => updateToolSettings("line", p)}
        />
      )}
      {activeTool === "text" && (
        <TextSettings
          settings={toolSettings.text}
          onChange={(p) => updateToolSettings("text", p)}
        />
      )}

      {/* CAD section */}
      {activeTool === "cad" && (
        <CadToolSection
          project={project}
          projectId={projectId}
          pageId={pageId}
          selectedElementId={selectedElementId}
          setSelectedElementId={setSelectedElementId}
          onJumpCad={onJumpCad}
        />
      )}

      {/* Element inspector (only when an element is selected and no tool is active) */}
      {!activeTool && element && pageId && (
        <ElementInspector
          element={element}
          projectId={projectId}
          pageId={pageId}
          onJumpCad={onJumpCad}
        />
      )}
    </div>
  );
}

function GuideSettings({
  settings,
  onChange,
}: {
  settings: ToolSettings["guide"];
  onChange: (p: Partial<ToolSettings["guide"]>) => void;
}) {
  return (
    <SettingsBlock title="HILFSLINIE">
      <Row label="Farbe">
        <ColorInput value={settings.color} onChange={(v) => onChange({ color: v })} />
      </Row>
      <Row label="Strichstärke">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.5}
            max={4}
            step={0.1}
            value={settings.strokeWidth}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
            className="flex-1 accent-foreground"
          />
          <span className="text-xs tabular-nums w-10 text-right">{settings.strokeWidth.toFixed(1)} px</span>
        </div>
      </Row>
      <div className="text-[11px] text-muted-foreground">
        Hilfslinien werden hellblau gestrichelt angezeigt und beim Druck nicht ausgegeben.
      </div>
    </SettingsBlock>
  );
}

function LineSettings({
  settings,
  onChange,
}: {
  settings: ToolSettings["line"];
  onChange: (p: Partial<ToolSettings["line"]>) => void;
}) {
  return (
    <SettingsBlock title="LINIE">
      <Row label="Farbe">
        <ColorInput value={settings.color} onChange={(v) => onChange({ color: v })} />
      </Row>
      <Row label="Stärke (mm)">
        <input
          type="number"
          step={0.1}
          min={0.1}
          value={settings.thicknessMm}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v) && v > 0) onChange({ thicknessMm: v });
          }}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm tabular-nums"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>
      <Row label="Transparenz">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={settings.alpha}
            onChange={(e) => onChange({ alpha: Number(e.target.value) })}
            className="flex-1 accent-foreground"
          />
          <span className="text-xs tabular-nums w-10 text-right">{settings.alpha}%</span>
        </div>
      </Row>
      <div className="text-[11px] text-muted-foreground">
        Zeichnet 1:1 mit CAD-Engine: Snap, Ortho (Shift), Hub-Eingabe für Länge/Winkel. Snap auch an Seitenränder.
      </div>
    </SettingsBlock>
  );
}

function TextSettings({
  settings,
  onChange,
}: {
  settings: ToolSettings["text"];
  onChange: (p: Partial<ToolSettings["text"]>) => void;
}) {
  return (
    <SettingsBlock title="TEXT">
      <Row label="Schriftgröße">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={8}
            max={64}
            step={1}
            value={settings.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="flex-1 accent-foreground"
          />
          <span className="text-xs tabular-nums w-10 text-right">{settings.fontSize} px</span>
        </div>
      </Row>
      <Row label="Farbe">
        <ColorInput value={settings.color} onChange={(v) => onChange({ color: v })} />
      </Row>
      <Row label="Stil">
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ bold: !settings.bold })}
            className="h-8 w-8 rounded border text-sm font-bold"
            style={{
              borderColor: "hsl(var(--hairline))",
              background: settings.bold ? "hsl(var(--accent-gold-soft))" : "transparent",
            }}
            title="Fett"
          >
            B
          </button>
          <button
            onClick={() => onChange({ italic: !settings.italic })}
            className="h-8 w-8 rounded border text-sm italic"
            style={{
              borderColor: "hsl(var(--hairline))",
              background: settings.italic ? "hsl(var(--accent-gold-soft))" : "transparent",
            }}
            title="Kursiv"
          >
            I
          </button>
        </div>
      </Row>
    </SettingsBlock>
  );
}

function SettingsBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 rounded border bg-transparent cursor-pointer"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-8 px-2 rounded bg-transparent border text-sm tabular-nums"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
    </div>
  );
}


function ToolPickButton({
  label,
  sub,
  icon,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg p-3 text-left transition border"
      style={{
        borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
        background: active ? "hsl(var(--accent-gold-soft))" : "hsl(var(--surface))",
        color: "hsl(var(--ink))",
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: active ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))" }}>
          {icon}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </button>
  );
}

function CadToolSection({
  project,
  projectId,
  pageId,
  selectedElementId,
  setSelectedElementId,
  onJumpCad,
}: {
  project: import("@/lib/projectStore").Project;
  projectId: string;
  pageId?: string;
  selectedElementId?: string;
  setSelectedElementId: (id?: string) => void;
  onJumpCad: (sheetId?: string) => void;
}) {
  const page = project.pages.find((p) => p.id === pageId);
  const placed = (page?.elements ?? []).filter((e) => e.kind === "cad-view");
  const [chosenSheet, setChosenSheet] = useState<string>("");

  const placeSheet = () => {
    if (!pageId || !chosenSheet) return;
    const sheet = project.sheets.find((s) => s.id === chosenSheet);
    if (!sheet) return;
    const id = projectStore.addElement(projectId, pageId, {
      kind: "cad-view",
      x: 20,
      y: 20,
      w: 50,
      h: 35,
      sheetId: sheet.id,
      scale: sheet.scale,
      lastSyncAt: new Date().toISOString(),
    });
    setSelectedElementId(id);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => onJumpCad()}
        className="w-full h-9 rounded-md text-sm font-medium flex items-center justify-center gap-2"
        style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
      >
        <ExternalLink size={14} /> Zur CAD-Oberfläche
      </button>

      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
          ZEICHENBLATT WÄHLEN
        </div>
        <div className="flex gap-2">
          <select
            value={chosenSheet}
            onChange={(e) => setChosenSheet(e.target.value)}
            className="flex-1 h-8 px-2 rounded bg-transparent border text-sm"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <option value="">— Zeichenblatt —</option>
            {project.sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.scale}
              </option>
            ))}
          </select>
          <button
            disabled={!chosenSheet || !pageId}
            onClick={placeSheet}
            className="h-8 px-3 rounded text-sm font-medium disabled:opacity-40"
            style={{ background: "hsl(var(--accent-gold))", color: "white" }}
          >
            Einfügen
          </button>
        </div>
        {project.sheets.length === 0 && (
          <div className="text-[11px] text-muted-foreground mt-2">
            Noch keine Zeichenblätter vorhanden — wechsle in die CAD-Oberfläche.
          </div>
        )}
      </div>

      {placed.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
            AUF DIESER SEITE
          </div>
          <div className="space-y-2">
            {placed.map((el) => {
              const sheet = project.sheets.find((s) => s.id === el.sheetId);
              const isSelected = el.id === selectedElementId;
              return (
                <div
                  key={el.id}
                  onClick={() => setSelectedElementId(el.id)}
                  className="rounded-lg p-2.5 border cursor-pointer transition"
                  style={{
                    borderColor: isSelected ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                    background: isSelected
                      ? "hsl(var(--accent-gold-soft))"
                      : "hsl(var(--surface))",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-10 h-7 rounded bg-white border shrink-0 flex items-center justify-center"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                    >
                      <CompassIcon size={12} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{sheet?.name ?? "Unbekanntes Blatt"}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Auf Seite · Stand{" "}
                        {el.lastSyncAt
                          ? new Date(el.lastSyncAt).toLocaleDateString("de-DE")
                          : "—"}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!pageId) return;
                        projectStore.updateElement(projectId, pageId, el.id, {
                          lastSyncAt: new Date().toISOString(),
                        });
                      }}
                      title="Aktualisieren (aus CAD übernehmen)"
                      className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
                    >
                      <RefreshCw size={13} className="text-muted-foreground" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-muted-foreground">Maßstab</span>
                    <input
                      value={el.scale ?? sheet?.scale ?? "1:100"}
                      onChange={(ev) => {
                        if (!pageId) return;
                        projectStore.updateElement(projectId, pageId, el.id, {
                          scale: ev.target.value,
                        });
                      }}
                      onClick={(ev) => ev.stopPropagation()}
                      className="flex-1 h-7 px-2 rounded bg-transparent border text-sm"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                    />
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (!pageId) return;
                        if (!confirm("CAD-Ansicht entfernen?")) return;
                        projectStore.deleteElement(projectId, pageId, el.id);
                      }}
                      title="Entfernen"
                      className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
                    >
                      <Trash2 size={13} className="text-muted-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ElementInspector({
  element,
  projectId,
  pageId,
  onJumpCad,
}: {
  element: PageElement;
  projectId: string;
  pageId: string;
  onJumpCad: (sheetId?: string) => void;
}) {
  const update = (patch: Partial<PageElement>) =>
    projectStore.updateElement(projectId, pageId, element.id, patch);

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-1">
        {element.kind.toUpperCase()}
      </div>
      <Row label="Breite">
        <input
          type="number"
          value={Math.round(element.w)}
          onChange={(e) => update({ w: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>
      <Row label="Höhe">
        <input
          type="number"
          value={Math.round(element.h)}
          onChange={(e) => update({ h: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>
      <Row label="Position X">
        <input
          type="number"
          value={Math.round(element.x)}
          onChange={(e) => update({ x: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>
      <Row label="Position Y">
        <input
          type="number"
          value={Math.round(element.y)}
          onChange={(e) => update({ y: Number(e.target.value) })}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </Row>

      {element.kind === "text" && (
        <>
          <Row label="Inhalt">
            <textarea
              value={element.text ?? ""}
              onChange={(e) => update({ text: e.target.value })}
              rows={3}
              className="w-full text-sm p-2 rounded border bg-transparent"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Größe">
            <input
              type="number"
              value={element.fontSize ?? 16}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Farbe">
            <input
              type="color"
              value={element.color ?? "#1a1a1a"}
              onChange={(e) => update({ color: e.target.value })}
              className="h-8 w-full rounded border bg-transparent"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
        </>
      )}

      {(element.kind === "line" || element.kind === "guide") && (
        <>
          <Row label="Farbe">
            <input
              type="color"
              value={element.color ?? (element.kind === "guide" ? "#7DD3FC" : "#1a1a1a")}
              onChange={(e) => update({ color: e.target.value })}
              className="h-8 w-full rounded border bg-transparent"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <Row label="Stärke">
            <input
              type="number"
              step={0.1}
              value={element.strokeWidth ?? (element.kind === "guide" ? 1 : 1.5)}
              onChange={(e) => update({ strokeWidth: Number(e.target.value) })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          {element.kind === "guide" && (
            <div className="text-[11px] text-muted-foreground">
              Hilfslinien werden beim späteren Druck/Export nicht angezeigt.
            </div>
          )}
        </>
      )}

      {element.kind === "image" && (
        <Row label="Bild-URL">
          <input
            value={element.imageUrl ?? ""}
            onChange={(e) => update({ imageUrl: e.target.value })}
            className="w-full h-8 px-2 rounded bg-transparent border text-sm"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
        </Row>
      )}

      <Row label="Transparenz">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((element.opacity ?? 1) * 100)}
          onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </Row>

      {element.kind === "cad-view" && (
        <>
          <Row label="Maßstab">
            <input
              value={element.scale ?? "1:100"}
              onChange={(e) => update({ scale: e.target.value })}
              className="w-full h-8 px-2 rounded bg-transparent border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
          </Row>
          <button
            onClick={() => onJumpCad(element.sheetId)}
            className="w-full h-9 rounded-md text-sm font-medium flex items-center justify-center gap-2"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            <ExternalLink size={14} /> Im CAD öffnen
          </button>
        </>
      )}

      <button
        onClick={() => projectStore.deleteElement(projectId, pageId, element.id)}
        className="w-full h-9 rounded-md text-sm border flex items-center justify-center gap-2 mt-2"
        style={{ borderColor: "hsl(var(--hairline))", color: "hsl(0 60% 50%)" }}
      >
        <Trash2 size={14} /> Element löschen
      </button>
    </div>
  );
}


function TasksTab({ project }: { project: import("@/lib/projectStore").Project }) {
  const [draft, setDraft] = useState("");
  const today = new Date();
  const inDays = (date?: string) => {
    if (!date) return Infinity;
    const d = new Date(date);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  };
  const groups = useMemo(() => {
    const heute: typeof project.tasks = [];
    const woche: typeof project.tasks = [];
    const spaeter: typeof project.tasks = [];
    for (const t of project.tasks) {
      const d = inDays(t.date);
      if (d <= 0) heute.push(t);
      else if (d <= 7) woche.push(t);
      else spaeter.push(t);
    }
    return { heute, woche, spaeter };
  }, [project.tasks]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Aufgaben</div>
        <button
          onClick={() => {
            if (!draft.trim()) return;
            projectStore.addTask(project.id, { title: draft.trim() });
            setDraft("");
          }}
          className="text-xs"
          style={{ color: "hsl(var(--accent-gold))" }}
        >
          + Aufgabe
        </button>
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            projectStore.addTask(project.id, { title: draft.trim() });
            setDraft("");
          }
        }}
        placeholder="Neue Aufgabe…"
        className="w-full h-9 px-2 rounded border bg-transparent text-sm"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
      {(["heute", "woche", "spaeter"] as const).map((g) => {
        const list = groups[g];
        if (!list.length) return null;
        const label = g === "heute" ? "HEUTE" : g === "woche" ? "DIESE WOCHE" : "GEPLANTE TERMINE";
        return (
          <div key={g}>
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
              {label}
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => projectStore.toggleTask(project.id, t.id)}
                    className="accent-foreground"
                  />
                  <span className={`flex-1 ${t.done ? "line-through text-muted-foreground" : ""}`}>
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LayersTab({
  projectId,
  page,
  selectedElementId,
  setSelectedElementId,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
  selectedElementId?: string;
  setSelectedElementId: (id?: string) => void;
}) {
  const [multi, setMulti] = useState<Set<string>>(new Set());
  const groups = page.groups ?? [];
  const els = page.elements;

  const layerLabel = (el: PageElement) => {
    if (el.layerName) return el.layerName;
    const kindMap: Record<string, string> = {
      text: "Text",
      line: "Linie",
      guide: "Hilfslinie",
      image: "Bild",
      pdf: "PDF",
      table: "Tabelle",
      note: "Notiz",
      timeline: "Zeitstrahl",
      "cad-view": "CAD-Ansicht",
      shape: "Form",
    };
    const base = kindMap[el.kind] ?? el.kind;
    return el.kind === "text" && el.text ? `${base}: ${el.text.slice(0, 16)}` : base;
  };

  const toggleMulti = (id: string, ev: React.MouseEvent) => {
    setMulti((prev) => {
      const next = new Set(prev);
      if (ev.shiftKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
    setSelectedElementId(id);
  };

  const moveZ = (elementId: string, dir: -1 | 1) => {
    const idx = els.findIndex((e) => e.id === elementId);
    if (idx < 0) return;
    // "Up" in the panel (top of list) = foreground = higher index in array
    projectStore.reorderElement(projectId, page.id, idx, idx + (dir === 1 ? 1 : -1));
  };

  const doGroup = () => {
    const ids = Array.from(multi);
    if (ids.length < 2) return;
    const name = prompt("Gruppenname", "Neue Gruppe") ?? "Neue Gruppe";
    projectStore.groupElements(projectId, page.id, ids, name);
    setMulti(new Set());
  };

  // Build display list — highest index first (foreground at top).
  const order = els.map((e, i) => ({ el: e, idx: i })).reverse();

  // Group items by groupId, but preserve order; first group occurrence wins position.
  const renderedGroups = new Set<string>();
  const rows: React.ReactNode[] = [];

  const renderItem = (el: PageElement, idx: number, indent = false) => {
    const isSelected = el.id === selectedElementId || multi.has(el.id);
    return (
      <div
        key={el.id}
        onClick={(e) => toggleMulti(el.id, e)}
        className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm"
        style={{
          background: isSelected ? "hsl(var(--accent-gold-soft))" : "transparent",
          marginLeft: indent ? 18 : 0,
          border: isSelected ? "1px solid hsl(var(--accent-gold) / 0.6)" : "1px solid transparent",
        }}
      >
        <GripVertical size={12} className="text-muted-foreground shrink-0" />
        <span className="flex-1 truncate">{layerLabel(el)}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            moveZ(el.id, 1);
          }}
          title="Nach vorne"
          className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            moveZ(el.id, -1);
          }}
          title="Nach hinten"
          className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
        >
          <ChevronDown size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!confirm("Ebene löschen?")) return;
            projectStore.deleteElement(projectId, page.id, el.id);
          }}
          title="Löschen"
          className="h-6 w-6 rounded hover:bg-muted flex items-center justify-center text-muted-foreground"
        >
          <Trash2 size={12} />
        </button>
      </div>
    );
  };

  for (const { el, idx } of order) {
    if (el.groupId) {
      if (renderedGroups.has(el.groupId)) continue;
      renderedGroups.add(el.groupId);
      const group = groups.find((g) => g.id === el.groupId);
      const members = els
        .map((e, i) => ({ e, i }))
        .filter((x) => x.e.groupId === el.groupId)
        .reverse();
      rows.push(
        <div key={`g-${el.groupId}`} className="rounded border" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/40">
            <Folder size={13} className="text-muted-foreground" />
            <input
              defaultValue={group?.name ?? "Gruppe"}
              onBlur={(e) =>
                projectStore.renameGroup(projectId, page.id, el.groupId!, e.target.value || "Gruppe")
              }
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <button
              onClick={() => projectStore.ungroup(projectId, page.id, el.groupId!)}
              title="Gruppierung aufheben"
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Auflösen
            </button>
          </div>
          <div className="py-1">{members.map((m) => renderItem(m.e, m.i, true))}</div>
        </div>
      );
    } else {
      rows.push(renderItem(el, idx));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
          EBENEN
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={doGroup}
            disabled={multi.size < 2}
            title="Auswahl gruppieren (Shift+Klick zum Mehrfachauswählen)"
            className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted disabled:opacity-40"
          >
            <FolderPlus size={14} className="text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Oben = Vordergrund. Shift+Klick wählt mehrere Ebenen aus, dann gruppieren.
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Noch keine Ebenen auf dieser Seite.</div>
      ) : (
        <div className="space-y-1">{rows}</div>
      )}
    </div>
  );
}

// re-export helpful types
export type { PageElement, ElementKind };
