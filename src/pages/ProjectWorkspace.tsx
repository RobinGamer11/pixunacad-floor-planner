import React, { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
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
  RotateCw,
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
  Pipette,
  Eraser,
  Spline,
  RectangleHorizontal,
  Circle as CircleIcon,
  PaintBucket,
  FileImage,
} from "lucide-react";

import {
  projectStore,
  useProject,
  useProjects,
  type PageElement,
  type ElementKind,
  type PageFormat,
  type PunchPattern,
  type PunchSide,
} from "@/lib/projectStore";
import CadOverlayLayer from "@/components/page/CadOverlayLayer";
import { PdfPageView } from "@/components/page/PdfPageView";
import { importFile } from "@/cad/documentImport";
import type { MiniCadSelectionInfo } from "@/cad/embed/MiniCad";
import type { HatchDrawMode } from "@/cad/HatchTool";
import { FreeDrawSettingsPanel } from "@/components/cad/FreeDrawSettingsPanel";
import { EraserSettingsPanel } from "@/components/cad/EraserSettingsPanel";
import { HatchSettingsPanel } from "@/components/cad/HatchSettingsPanel";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";

const FORMAT_SIZES: Record<PageFormat, { w: number; h: number; label: string }> = {
  "A3-quer": { w: 420, h: 297, label: "A3 Querformat (420 × 297 mm)" },
  "A3-hoch": { w: 297, h: 420, label: "A3 Hochformat (297 × 420 mm)" },
  "A4-quer": { w: 297, h: 210, label: "A4 Querformat (297 × 210 mm)" },
  "A4-hoch": { w: 210, h: 297, label: "A4 Hochformat (210 × 297 mm)" },
  frei: { w: 400, h: 300, label: "Freies Format" },
};

export type PageTool = "guide" | "line" | "free" | "eraser" | "text" | "cad" | "pipette" | "hatch" | null;
type LinePageTool = "line" | "free" | "eraser";

const LINE_TOOL_VARIANTS: Array<{ id: LinePageTool; label: string; icon: React.ElementType }> = [
  { id: "line", label: "Linie", icon: Minus },
  { id: "free", label: "Freihand", icon: Pencil },
  { id: "eraser", label: "Radiergummi", icon: Eraser },
];

const HATCH_MODE_VARIANTS: Array<{ id: HatchDrawMode; label: string; icon: React.ElementType }> = [
  { id: "polygon", label: "Polygon", icon: Spline },
  { id: "rectangle", label: "Rechteck", icon: RectangleHorizontal },
  { id: "circle", label: "Kreis", icon: CircleIcon },
  { id: "fill", label: "Füllung", icon: PaintBucket },
];

const isLinePageTool = (tool: PageTool): tool is LinePageTool =>
  tool === "line" || tool === "free" || tool === "eraser";

export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const project = useProject(projectId);
  const navigate = useNavigate();
  const [activePageId, setActivePageId] = useState<string | undefined>(project?.pages[0]?.id);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  // `selectedElementId` ist das ZULETZT angeklickte Element — alle bestehenden
  // Lese-Stellen (Inspector etc.) benutzen es weiterhin. Bei Multi-Auswahl
  // beschreibt die volle Liste `selectedElementIds`.
  const selectedElementId = selectedElementIds[selectedElementIds.length - 1];
  const setSelectedElementId = (id?: string) => setSelectedElementIds(id ? [id] : []);
  const [rightTab, setRightTabState] = useState<"settings" | "tools" | "layers">("settings");
  const [printMode, setPrintMode] = useState(false);
  const setRightTab = (t: "settings" | "tools" | "layers") => {
    setPrintMode(false);
    setRightTabState(t);
  };
  const [activeTool, setActiveTool] = useState<PageTool>(null);
  const [selectedCadTool, setSelectedCadTool] = useState<"line" | "free" | "text" | "hatch" | undefined>();
  const [cadSelectionCount, setCadSelectionCount] = useState<number>(0);
  const [cadSelectedLineSnap, setCadSelectedLineSnap] = useState<{ midpoint: boolean; division: number | null; isGuide: boolean } | null>(null);
  const [lineToolVariant, setLineToolVariant] = useState<LinePageTool>("line");
  const [lineToolFlyoutOpen, setLineToolFlyoutOpen] = useState(false);
  const [hatchDrawMode, setHatchDrawMode] = useState<HatchDrawMode>("polygon");
  const [hatchToolFlyoutOpen, setHatchToolFlyoutOpen] = useState(false);
  const cadEngineApiRef = useRef<{
    setSelectedSegmentSnap: (opts: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
    duplicateSelectedSegments: (offsetMm?: number) => number;
    engine: import("@/cad/embed/MiniCad").MiniCad;
  } | null>(null);
  // Force-re-render der ToolsTab, sobald die Engine bereit ist (für Panel-Wiring).
  const [, forceEngineTick] = useState(0);



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
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const setZoomClamped = (v: number) => setZoom(Math.max(10, Math.min(400, Math.round(v))));
  const setActiveToolAndTab = (t: PageTool) => {
    setPrintMode(false);
    setActiveTool(t);
    if (isLinePageTool(t)) setLineToolVariant(t);
    if (!isLinePageTool(t)) setLineToolFlyoutOpen(false);
    if (t !== "hatch") setHatchToolFlyoutOpen(false);
    if (t) setSelectedCadTool(undefined);
    if (t) setRightTabState("tools");
  };

  const activateLineTool = (tool: LinePageTool) => {
    setLineToolVariant(tool);
    setActiveToolAndTab(tool);
  };

  const activateHatchTool = (mode: HatchDrawMode) => {
    setHatchDrawMode(mode);
    setActiveToolAndTab("hatch");
  };

  // Per-tool settings (live in workspace state; persist could come later).
  const [toolSettings, setToolSettings] = useState({
    select: { multi: false },
    guide: { color: "#7DD3FC", strokeWidth: 1, locked: false },
    line: { color: "#111111", thicknessMm: 0.5, alpha: 100 },
    text: {
      fontSize: 16,
      color: "#111111",
      bold: false,
      italic: false,
      alpha: 100,
      align: "left" as "left" | "center" | "right",
      bgColor: "#ffffff",
      bgAlphaPct: 0,
      wrap: true,
      autoSize: true,
      borderEnabled: false,
      borderColor: "#111111",
      borderWidthPx: 1,
    },
  });
  const updateToolSettings = <K extends keyof typeof toolSettings>(k: K, patch: Partial<(typeof toolSettings)[K]>) =>
    setToolSettings((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  const activePage = project?.pages.find((p) => p.id === activePageId) ?? project?.pages[0];
  const selectedElement = activePage?.elements.find((e) => e.id === selectedElementId);
  const bgPage = bgOverlay.pageId ? project?.pages.find((p) => p.id === bgOverlay.pageId) : undefined;

  useLayoutEffect(() => {
    if (!activePage || !canvasViewportRef.current) return;
    const fitPage = () => {
      const fmt = FORMAT_SIZES[activePage.format];
      const baseWidth = 1100;
      const baseHeight = baseWidth / (fmt.w / fmt.h);
      const box = canvasViewportRef.current!;
      const nextZoom = Math.max(10, Math.min(100, Math.floor(Math.min(
        ((box.clientWidth - 96) / baseWidth) * 100,
        ((box.clientHeight - 96) / baseHeight) * 100,
      ))));
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2);
          box.scrollTop = Math.max(0, (box.scrollHeight - box.clientHeight) / 2);
        });
      });
    };
    fitPage();
  }, [activePage?.id, activePage?.format]);

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

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
    >
      <WorkspaceHeader
        projectId={project.id}
        projectName={project.name}
        
        mode="workspace"
        zoomPercent={zoom}
        onPresent={() => {}}
        onShare={() => {}}
        onExport={() => setPrintMode((v) => !v)}
      />
      <div className="flex-1 flex min-h-0">
      {/* Far-left tool rail */}
      <aside
        className="flex flex-col items-center gap-0.5 py-1.5 shrink-0 border-r"
        style={{
          width: 56,
          borderColor: "hsl(var(--hairline))",
          background: "hsl(var(--surface-card))",
        }}
      >

        <ToolRailButton
          icon={<Minus size={18} style={{ strokeDasharray: "3 2" }} />}
          label="Hilfslinie"
          active={activeTool === "guide"}
          onClick={() => setActiveToolAndTab(activeTool === "guide" ? null : "guide")}
          showLabel
        />
        <ToolRailButton
          icon={<Pipette size={18} />}
          label="Pipette"
          active={activeTool === "pipette"}
          onClick={() => setActiveToolAndTab(activeTool === "pipette" ? null : "pipette")}
          showLabel
        />

        <div className="my-1 w-8 border-t" style={{ borderColor: "hsl(var(--hairline))" }} />

        <ToolRailButton
          icon={<MousePointer2 size={18} />}
          label="Auswahl"
          active={activeTool === null}
          onClick={() => { setLineToolFlyoutOpen(false); setActiveTool(null); }}
        />
        <ToolRailButton
          icon={<CompassIcon size={18} />}
          label="CAD-Blatt"
          active={activeTool === "cad"}
          onClick={() => setActiveToolAndTab(activeTool === "cad" ? null : "cad")}
          showLabel
        />
        <ToolRailButton
          icon={<Type size={18} />}
          label="Text"
          active={activeTool === "text"}
          onClick={() => setActiveToolAndTab(activeTool === "text" ? null : "text")}
        />
        <div className="relative w-full flex justify-center">
          <ToolRailButton
            icon={<Minus size={18} />}
            label="Linie"
            active={isLinePageTool(activeTool)}
            onClick={() => {
              if (!isLinePageTool(activeTool)) {
                activateLineTool(lineToolVariant);
                setLineToolFlyoutOpen(true);
              }
              else setLineToolFlyoutOpen((open) => !open);
              setRightTabState("tools");
            }}
            showLabel
          />
          {lineToolFlyoutOpen && (
            <div
              className="absolute top-0 left-full ml-1 flex flex-col gap-0.5 p-1 rounded-lg shadow-lg z-40"
              style={{
                background: "hsl(var(--surface-card))",
                border: "1px solid hsl(var(--hairline))",
              }}
            >
              {LINE_TOOL_VARIANTS.map((variant) => {
                const Icon = variant.icon;
                return (
                  <ToolRailButton
                    key={variant.id}
                    icon={<Icon size={18} />}
                    label={variant.label}
                    active={activeTool === variant.id}
                    onClick={() => {
                      activateLineTool(variant.id);
                      setLineToolFlyoutOpen(false);
                    }}
                    showLabel
                  />
                );
              })}
            </div>
          )}
        </div>
        <div className="relative w-full flex justify-center">
          <ToolRailButton
            icon={<Hash size={18} />}
            label="Schraffur"
            active={activeTool === "hatch"}
            onClick={() => {
              if (activeTool !== "hatch") {
                activateHatchTool(hatchDrawMode);
                setHatchToolFlyoutOpen(true);
              } else {
                setHatchToolFlyoutOpen((open) => !open);
              }
              setRightTabState("tools");
            }}
            showLabel
          />
          {hatchToolFlyoutOpen && (
            <div
              className="absolute top-0 left-full ml-1 flex flex-col gap-0.5 p-1 rounded-lg shadow-lg z-40"
              style={{
                background: "hsl(var(--surface-card))",
                border: "1px solid hsl(var(--hairline))",
              }}
            >
              {HATCH_MODE_VARIANTS.map((variant) => {
                const Icon = variant.icon;
                return (
                  <ToolRailButton
                    key={variant.id}
                    icon={<Icon size={18} />}
                    label={variant.label}
                    active={activeTool === "hatch" && hatchDrawMode === variant.id}
                    onClick={() => {
                      activateHatchTool(variant.id);
                      setHatchToolFlyoutOpen(false);
                    }}
                    showLabel
                  />
                );
              })}
            </div>
          )}
        </div>
        <ToolRailButton
          icon={<FileText size={18} />}
          label="PDF einfügen"
          showLabel
          onClick={() => pdfFileInputRef.current?.click()}
        />
        <input
          ref={pdfFileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !projectId || !activePage) return;
            try {
              const pages = await importFile(f);
              if (pages.length === 0) return;
              const fmt = FORMAT_SIZES[activePage.format];
              let lastId: string | undefined;
              for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                const aspect = (p.widthM > 0 && p.heightM > 0) ? p.widthM / p.heightM : (p.pixelWidth / p.pixelHeight) || 1;
                const wPct = 50;
                const pageAspect = fmt.w / fmt.h;
                const hPct = wPct / aspect * pageAspect;
                lastId = projectStore.addElement(projectId, activePage.id, {
                  kind: "pdf",
                  x: 10 + (i * 3),
                  y: 10 + (i * 3),
                  w: wPct,
                  h: Math.min(80, hPct),
                  pdfSourceB64: p.pdfSourceB64,
                  pdfPageIndex: p.pageIndex,
                  pdfAspect: aspect,
                });
              }
              if (lastId) setSelectedElementIds([lastId]);
            } catch (err: any) {
              window.alert("PDF-Import fehlgeschlagen: " + (err?.message || err));
            }
          }}
        />
        <ToolRailButton
          icon={<ImageIcon size={18} />}
          label="Bild"
          showLabel
          onClick={() => imgFileInputRef.current?.click()}
        />
        <input
          ref={imgFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !projectId || !activePage) return;
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = String(reader.result || "");
              if (!dataUrl) return;
              const img = new Image();
              img.onload = () => {
                const fmt = FORMAT_SIZES[activePage.format];
                const aspect = img.width && img.height ? img.width / img.height : 1;
                const wPct = 40;
                const pageAspect = fmt.w / fmt.h;
                const hPct = Math.min(80, wPct / aspect * pageAspect);
                const id = projectStore.addElement(projectId, activePage.id, {
                  kind: "image",
                  x: 15,
                  y: 15,
                  w: wPct,
                  h: hPct,
                  imageUrl: dataUrl,
                });
                setSelectedElementIds([id]);
              };
              img.onerror = () => window.alert("Bild konnte nicht geladen werden.");
              img.src = dataUrl;
            };
            reader.onerror = () => window.alert("Bild konnte nicht gelesen werden.");
            reader.readAsDataURL(f);
          }}
        />
        <ToolRailButton icon={<TableIcon size={18} />} label="Tabelle" />
        <ToolRailButton icon={<StickyNote size={18} />} label="Notiz" />
        <ToolRailButton icon={<Clock size={18} />} label="Zeitstrahl" />
        <ToolRailButton icon={<Shapes size={18} />} label="Formen" />
        <div className="mt-auto flex flex-col items-center gap-1">
          <ToolRailButton icon={<LayersIcon size={18} />} label="Ebenen" onClick={() => setRightTab("layers")} />
          <ToolRailButton icon={<LayoutTemplate size={18} />} label="Vorlagen" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">



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
                        setSelectedCadTool(undefined);
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
              ref={canvasViewportRef}
              className="flex-1 overflow-hidden relative"
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey || !e.shiftKey) {
                  if (e.shiftKey) return;
                  e.preventDefault();
                  const delta = -e.deltaY;
                  setZoomClamped(zoom + (delta > 0 ? 5 : -5));
                }
              }}
              onMouseDown={(e) => {
                // Pan nur via Mittelmaus oder Alt+Links — sonst würde ein Links-Klick
                // im Auswahlmodus die Auswahl der eingebetteten CAD-Engine abfangen.
                const isMiddle = e.button === 1 || (e.button === 0 && (e as any).altKey);
                if (!isMiddle) return;
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
                  hatchDrawMode={hatchDrawMode}
                  toolSettings={toolSettings}
                  onCommitTool={() => setActiveTool(null)}
                  selectedElementIds={selectedElementIds}
                  onSelect={(id, opts) => {
                    if (!id) {
                      setSelectedElementIds([]);
                      return;
                    }
                    const multi = toolSettings.select.multi || !!opts?.shift;
                    setSelectedElementIds((prev) => {
                      if (!multi) return [id];
                      const idx = prev.indexOf(id);
                      if (opts?.shift && idx >= 0) {
                        // Shift-Klick auf bereits selektiertes → entfernen
                        return prev.filter((x) => x !== id);
                      }
                      // Multi: nach hinten (= zuletzt selektiert) verschieben
                      const rest = prev.filter((x) => x !== id);
                      return [...rest, id];
                    });
                    setSelectedCadTool(undefined);
                    setRightTab("tools");
                  }}
                  onCadSelectionChange={(info, count) => {
                    setCadSelectionCount(count ?? (info ? 1 : 0));
                    if (!info) {
                      if ((count ?? 0) === 0) setSelectedElementIds([]);
                      setSelectedCadTool(undefined);
                      setCadSelectedLineSnap(null);
                      return;
                    }
                    if (info.tool === "document") {
                      setSelectedElementIds([info.id]);
                      setSelectedCadTool(undefined);
                      setCadSelectedLineSnap(null);
                      setRightTab("tools");
                      return;
                    }
                    setSelectedElementIds([]);
                    setSelectedCadTool(info.tool);
                    setRightTab("tools");

                    if (info.tool === "line") {
                      updateToolSettings("line", {
                        color: info.color,
                        thicknessMm: info.thicknessMm,
                        alpha: info.alpha,
                      });
                      setCadSelectedLineSnap({
                        midpoint: !!info.midpointSnap,
                        division: typeof info.divisionSnap === "number" ? info.divisionSnap : null,
                        isGuide: !!info.isGuide,
                      });
                    } else if (info.tool === "free") {
                      setCadSelectedLineSnap(null);
                    } else if (info.tool === "text") {
                      setCadSelectedLineSnap(null);
                      updateToolSettings("text", {
                        color: info.color,
                        fontSize: info.fontSize,
                        alpha: info.alpha,
                        align: info.align,
                        bgColor: info.bgColor,
                        bgAlphaPct: info.bgAlphaPct,
                        wrap: info.wrap,
                        autoSize: info.autoSize,
                        borderEnabled: info.borderEnabled,
                        borderColor: info.borderColor,
                        borderWidthPx: info.borderWidthPx,
                      });
                    }
                  }}
                  onCadEngineReady={(api) => { cadEngineApiRef.current = api; forceEngineTick(t => t + 1); }}

                />
              )}
            </div>
            <ZoomBar zoom={zoom} setZoom={setZoomClamped} />
          </main>

          {/* Right inspector (collapsible) */}
          {rightOpen ? (
            printMode ? (
              <PrintPanel
                project={project}
                onClose={() => setPrintMode(false)}
              />
            ) : (
            <RightInspector
              projectId={project.id}
              page={activePage}
              element={selectedElement}
              tab={rightTab}
              setTab={setRightTab}
              project={project}
              activeTool={activeTool}
              setActiveTool={setActiveToolAndTab}
              selectedCadTool={selectedCadTool}
              selectedElementId={selectedElementId}
              selectedElementIds={selectedElementIds}
              setSelectedElementId={setSelectedElementId}
              toolSettings={toolSettings}
              cadSelectionCount={cadSelectionCount}
              cadSelectedLineSnap={cadSelectedLineSnap}
              onCadLineSnapChange={(patch) => {
                cadEngineApiRef.current?.setSelectedSegmentSnap(patch);
                setCadSelectedLineSnap((prev) => prev ? {
                  midpoint: typeof patch.midpointSnap === "boolean" ? patch.midpointSnap : prev.midpoint,
                  division: patch.divisionSnap !== undefined ? (patch.divisionSnap == null || patch.divisionSnap < 2 ? null : Math.floor(patch.divisionSnap)) : prev.division,
                  isGuide: prev.isGuide,
                } : prev);
              }}
              onCadDuplicateSegments={() => { cadEngineApiRef.current?.duplicateSelectedSegments(5); }}
              cadEngine={cadEngineApiRef.current?.engine ?? null}

              updateToolSettings={updateToolSettings}

              onJumpCad={(sheetId) => navigate(`/project/${project.id}/cad${sheetId ? `/${sheetId}` : ""}`)}
              onCollapse={() => setRightOpen(false)}
            />
            )



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
    </div>
  );
}


function ToolRailButton({
  icon,
  label,
  active,
  accent,
  onClick,
  showLabel,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick?: () => void;
  showLabel?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="cad-rail-btn"
      style={{
        background: active ? "hsl(var(--surface-muted))" : "transparent",
        color: accent
          ? "hsl(var(--accent-gold))"
          : active
          ? "hsl(var(--accent-gold))"
          : "hsl(var(--ink-soft))",
      }}
    >
      {icon}
      <span className="leading-none">
        {showLabel ? label : label.length > 8 ? label.slice(0, 6) + "…" : label}
      </span>
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
  select: { multi: boolean };
  guide: { color: string; strokeWidth: number; locked: boolean };
  line: { color: string; thicknessMm: number; alpha: number };
  text: {
    fontSize: number;
    color: string;
    bold: boolean;
    italic: boolean;
    alpha: number;
    align: "left" | "center" | "right";
    bgColor: string;
    bgAlphaPct: number;
    wrap: boolean;
    autoSize: boolean;
    borderEnabled: boolean;
    borderColor: string;
    borderWidthPx: number;
  };
};

function PageCanvas({
  projectId,
  page,
  overlayPage,
  overlayOpacity,
  selectedElementId,
  selectedElementIds,
  zoom,
  activeTool,
  toolSettings,
  onCommitTool,
  onSelect,
  onCadSelectionChange,
  onCadEngineReady,
  hatchDrawMode,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
  overlayPage?: import("@/lib/projectStore").ProjectPage;
  overlayOpacity: number;
  selectedElementId?: string;
  selectedElementIds: string[];
  zoom: number;
  activeTool: PageTool;
  toolSettings: ToolSettings;
  onCommitTool: () => void;
  onSelect: (id?: string, opts?: { shift?: boolean }) => void;
  onCadSelectionChange: (info: MiniCadSelectionInfo | null, count?: number) => void;
  onCadEngineReady?: (api: { setSelectedSegmentSnap: (opts: { midpointSnap?: boolean; divisionSnap?: number | null }) => void; duplicateSelectedSegments: (offsetMm?: number) => number; engine: import("@/cad/embed/MiniCad").MiniCad }) => void;
  hatchDrawMode?: HatchDrawMode;
}) {

  const fmt = FORMAT_SIZES[page.format];
  const aspect = fmt.w / fmt.h;
  // The sheet is rendered at a FIXED real size (mm-defined). Zoom is a pure
  // view transform applied via CSS scale, like PowerPoint / CAD — page, holes,
  // margins, frame and strokes all scale together with the view.
  const baseWidth = 1100;
  const width = baseWidth;
  const height = width / aspect;
  const scale = zoom / 100;
  const displayWidth = width * scale;
  const displayHeight = height * scale;
  const mmToPx = displayWidth / fmt.w;
  const marginPx = (page.margins ?? 0) * mmToPx;

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

  // Click-to-draw was used for the lightweight SVG "Hilfslinie" tool — now
  // routed through the embedded CAD engine (1:1 wie Linienwerkzeug), so kein
  // separater Draw-Modus mehr in der React-Schicht.
  const drawingTool = false;
  const cursorStyle = undefined;

  const handlePageMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    // not drawing: deselect
    onSelect(undefined);
  };

  const handlePageMouseMove = (_e: React.MouseEvent) => {
    /* no-op */
  };

  // Escape cancels pending draw and resets back to the select tool.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable);
      if (e.key === "Escape") {
        if (inField) return;
        setPendingStart(null);
        setHoverPt(null);
        if (activeTool !== null) onCommitTool();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !inField) {
        if (selectedElementIds.length === 0) return;
        // Bei Backspace: nur reagieren wenn KEINE Texteingabe — sonst würde
        // das Tippen in Inspector-Inputs Elemente löschen.
        if (e.key === "Backspace" && document.activeElement && (document.activeElement as HTMLElement).tagName !== "BODY") return;
        e.preventDefault();
        for (const id of selectedElementIds) {
          projectStore.deleteElement(projectId, page.id, id);
        }
        onSelect(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingStart, activeTool, selectedElementIds, projectId, page.id]);


  const punchSide: PunchSide = page.punchSide ?? "left";
  const punchPattern = page.punchPattern ?? "none";
  const punchCfg = punchPattern !== "none" ? PUNCH_PATTERNS[punchPattern] : undefined;
  const edgeInsetMm = 12;
  const holes: { left: number; top: number; size: number }[] = [];
  if (punchCfg) {
      const sizePx = punchCfg.diameter * mmToPx;
      const inset = edgeInsetMm * mmToPx;
    if (punchSide === "left" || punchSide === "right") {
      const cx = punchSide === "left" ? inset : displayWidth - inset;
      punchCfg.offsets.forEach((o) => {
        const cy = displayHeight / 2 + o * mmToPx;
        if (cy > sizePx / 2 && cy < displayHeight - sizePx / 2) {
          holes.push({ left: cx - sizePx / 2, top: cy - sizePx / 2, size: sizePx });
        }
      });
    } else {
      const cy = punchSide === "top" ? inset : displayHeight - inset;
      punchCfg.offsets.forEach((o) => {
        const cx = displayWidth / 2 + o * mmToPx;
        if (cx > sizePx / 2 && cx < displayWidth - sizePx / 2) {
          holes.push({ left: cx - sizePx / 2, top: cy - sizePx / 2, size: sizePx });
        }
      });
    }
  }

  const otherEls = page.elements.filter((e) => e.kind !== "line" && e.kind !== "guide");

  return (
    <div
      className="min-h-full flex items-start justify-center"
      style={{ padding: "60vh 60vw" }}
    >
      <div
        className="relative"
        style={{
          width: displayWidth,
          height: displayHeight,
        }}
      >
        <div
          ref={pageRef}
          className="relative shadow-xl"
          style={{
            width: displayWidth,
            height: displayHeight,
            background: "white",
            border: "1px solid hsl(var(--hairline))",
            cursor: cursorStyle,
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
            selected={selectedElementIds.includes(el.id)}
            elevated={activeTool === null && el.kind !== "cad-view" && el.kind !== "pdf" && el.kind !== "image"}
            onSelect={(opts) => onSelect(el.id, opts)}
            onDrag={(dx, dy) => {
              const dxPct = (dx / displayWidth) * 100;
              const dyPct = (dy / displayHeight) * 100;
              // Wenn dieses Element Teil einer Mehrfachauswahl ist, alle
              // ausgewählten Elemente (auch unterschiedlicher Typen) mitziehen.
              const ids = selectedElementIds.includes(el.id) && selectedElementIds.length > 1
                ? selectedElementIds
                : [el.id];
              for (const id of ids) {
                const target = page.elements.find((x) => x.id === id);
                if (!target) continue;
                if (target.kind === "line" || target.kind === "guide") {
                  // SVG-Linien (kind="line"/"guide" in der React-Schicht) haben
                  // points[] — diese werden hier nicht mitbewegt, da sie in der
                  // CAD-Engine leben. Stattdessen Position-Felder nicht antasten.
                  continue;
                }
                projectStore.updateElement(projectId, page.id, target.id, {
                  x: Math.max(0, Math.min(95, target.x + dxPct)),
                  y: Math.max(0, Math.min(95, target.y + dyPct)),
                });
              }
            }}
            onRotate={(deg, absolute) => {
              const next = absolute ? deg : (el.rotation ?? 0) + deg;
              projectStore.updateElement(projectId, page.id, el.id, { rotation: next });
            }}
            onDuplicate={() => {
              const { id: _id, ...rest } = el as any;
              const newId = projectStore.addElement(projectId, page.id, {
                ...rest,
                x: Math.min(95, (el.x ?? 0) + 2),
                y: Math.min(95, (el.y ?? 0) + 2),
              });
              onSelect(newId);
            }}
            onDelete={() => {
              projectStore.deleteElement(projectId, page.id, el.id);
              onSelect(undefined);
            }}
            onEdgeDrag={(edge, dx, dy) => {
              const dxPct = (dx / displayWidth) * 100;
              const dyPct = (dy / displayHeight) * 100;
              const patch: Partial<PageElement> = {};
              const minPct = 2;
              if (edge === "left") {
                const newX = Math.max(0, el.x + dxPct);
                const newW = Math.max(minPct, el.w - (newX - el.x));
                patch.x = newX;
                patch.w = newW;
              } else if (edge === "right") {
                patch.w = Math.max(minPct, Math.min(100 - el.x, el.w + dxPct));
              } else if (edge === "top") {
                const newY = Math.max(0, el.y + dyPct);
                const newH = Math.max(minPct, el.h - (newY - el.y));
                patch.y = newY;
                patch.h = newH;
              } else if (edge === "bottom") {
                patch.h = Math.max(minPct, Math.min(100 - el.y, el.h + dyPct));
              }
              projectStore.updateElement(projectId, page.id, el.id, patch);
            }}
          />
        ))}

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
          pageMarginsMm={page.margins ?? 0}
          zoom={scale}
          activeTool={
            activeTool === "line" ? "line"
            : activeTool === "text" ? "text"
            : activeTool === "guide" ? "guide"
            : activeTool === "free" ? "free"
            : activeTool === "eraser" ? "eraser"
            : activeTool === "hatch" ? "hatch"
            : activeTool === null ? "select"
            : null
          }
          hatchDrawMode={hatchDrawMode}
          enabled={activeTool === "line" || activeTool === "text" || activeTool === "guide" || activeTool === "free" || activeTool === "eraser" || activeTool === "hatch" || activeTool === null}
          initialState={page.cadOverlay}
          lineColor={activeTool === "guide" ? toolSettings.guide.color : toolSettings.line.color}
          lineThicknessMm={activeTool === "guide" ? Math.max(0.1, toolSettings.guide.strokeWidth * 0.2) : toolSettings.line.thicknessMm}
          lineAlpha={toolSettings.line.alpha / 100}
          guideColor={toolSettings.guide.color}
          guidesLocked={toolSettings.guide.locked}
          multiSelectMode={toolSettings.select.multi}

          textColor={toolSettings.text.color}
          textFontSizePx={toolSettings.text.fontSize}
          textBold={toolSettings.text.bold}
          textItalic={toolSettings.text.italic}
          textAlpha={toolSettings.text.alpha / 100}
          textAlign={toolSettings.text.align}
          textBgColor={toolSettings.text.bgColor}
          textBgAlphaPct={toolSettings.text.bgAlphaPct}
         textWrap={toolSettings.text.wrap}
         textAutoSize={toolSettings.text.autoSize}
         textBorderEnabled={toolSettings.text.borderEnabled}
         textBorderColor={toolSettings.text.borderColor}
         textBorderWidthPx={toolSettings.text.borderWidthPx}
          onChange={(state) =>
            projectStore.updatePage(projectId, page.id, { cadOverlay: state })
          }
          onSelectionChange={onCadSelectionChange}
          onEngineReady={onCadEngineReady}
          externalDocs={page.elements
            .filter((e) => e.kind === "cad-view" || e.kind === "pdf" || e.kind === "image")
            .map((e) => ({
              id: e.id,
              xMM: ((e.x ?? 0) / 100) * fmt.w,
              yMM: ((e.y ?? 0) / 100) * fmt.h,
              wMM: ((e.w ?? 0) / 100) * fmt.w,
              hMM: ((e.h ?? 0) / 100) * fmt.h,
              rotationRad: e.rotation ? (e.rotation * Math.PI) / 180 : 0,
              guideEdges: e.guideEdges ?? { top: false, right: false, bottom: false, left: false },
            }))}
          onExternalDocChange={(id, t) => {
            // mm → % der Seite zurückrechnen.
            const xPct = (t.xMM / fmt.w) * 100;
            const yPct = (t.yMM / fmt.h) * 100;
            const rot = ((t.rotationDeg % 360) + 360) % 360;
            projectStore.updateElement(projectId, page.id, id, {
              x: xPct,
              y: yPct,
              rotation: rot,
              guideEdges: t.guideEdges,
            });
          }}

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
  elevated,
  onSelect,
  onDrag,
  onDuplicate,
  onDelete,
  onRotate,
  onEdgeDrag,
}: {
  el: PageElement;
  selected?: boolean;
  readOnly?: boolean;
  elevated?: boolean;
  onSelect?: (opts?: { shift?: boolean }) => void;
  onDrag?: (dx: number, dy: number) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onRotate?: (deltaDeg: number, absolute?: boolean) => void;
  onEdgeDrag?: (edge: "top" | "right" | "bottom" | "left", dx: number, dy: number) => void;
}) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const rotateRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    // Don't start a drag when the user clicks an interactive control inside the hub.
    const t = e.target as HTMLElement;
    if (t.closest("[data-hub-control]")) return;
    e.stopPropagation();
    onSelect?.({ shift: e.shiftKey });
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

  const handleRotateStart = (e: React.MouseEvent) => {
    if (readOnly || !onRotate) return;
    e.stopPropagation();
    e.preventDefault();
    const node = rotateRef.current?.parentElement;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const startRot = el.rotation ?? 0;
    const handleMove = (ev: MouseEvent) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      const deg = startRot + ((a - startAngle) * 180) / Math.PI;
      onRotate(deg, true);
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const hubKinds = new Set(["cad-view", "pdf", "image"]);
  const showHub = !readOnly && selected && hubKinds.has(el.kind);

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
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: "center center",
        zIndex: elevated ? 30 : undefined,
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
      {el.kind === "cad-view" && <CadViewThumb sheetId={el.sheetId} />}
      {(el.kind === "shape" || el.kind === "line" || el.kind === "table" || el.kind === "pdf" || el.kind === "timeline") && el.kind !== "pdf" && (
        <div
          className="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
          style={{ background: "hsl(var(--surface-muted))" }}
        >
          {el.kind}
        </div>
      )}
      {el.kind === "pdf" && (
        el.pdfSourceB64 ? (
          <PdfPageView sourceB64={el.pdfSourceB64} pageIndex={el.pdfPageIndex ?? 0} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground" style={{ background: "hsl(var(--surface-muted))" }}>PDF</div>
        )
      )}

      {showHub && (
        <>
          {/* Rotation handle: small circle above the element */}
          <div
            ref={rotateRef}
            data-hub-control
            onMouseDown={handleRotateStart}
            title="Drehen (ziehen)"
            className="absolute"
            style={{
              left: "50%",
              top: -28,
              transform: "translateX(-50%)",
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "hsl(var(--accent-gold))",
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              cursor: "grab",
            }}
          />
          {/* Connector line from element top to rotation handle */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: "50%",
              top: -14,
              width: 1,
              height: 14,
              background: "hsl(var(--accent-gold))",
              transform: "translateX(-50%)",
            }}
          />
          {/* Hub action bar */}
          <div
            data-hub-control
            className="absolute flex items-center gap-1 rounded-md shadow-md"
            style={{
              right: 0,
              top: -36,
              background: "white",
              border: "1px solid hsl(var(--hairline))",
              padding: 3,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              data-hub-control
              onClick={(e) => { e.stopPropagation(); onRotate?.(15); }}
              title="Drehen +15°"
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
            >
              <RotateCw size={14} />
            </button>
            <button
              data-hub-control
              onClick={(e) => { e.stopPropagation(); onDuplicate?.(); }}
              title="Duplizieren"
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
            >
              <Copy size={14} />
            </button>
            <button
              data-hub-control
              onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
              title="Löschen"
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
              style={{ color: "hsl(0 65% 50%)" }}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Edge-Drag-Handles (wie Schraffur-Werkzeug) — eine Kante reinziehen/rausziehen */}
          {(["top", "right", "bottom", "left"] as const).map((edge) => {
            const isHor = edge === "top" || edge === "bottom";
            const startEdgeDrag = (e: React.MouseEvent) => {
              if (!onEdgeDrag) return;
              e.stopPropagation();
              e.preventDefault();
              let last = { x: e.clientX, y: e.clientY };
              const move = (ev: MouseEvent) => {
                const dx = ev.clientX - last.x;
                const dy = ev.clientY - last.y;
                last = { x: ev.clientX, y: ev.clientY };
                onEdgeDrag(edge, dx, dy);
              };
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            };
            const baseStyle: React.CSSProperties = {
              position: "absolute",
              background: "transparent",
              cursor: isHor ? "ns-resize" : "ew-resize",
              zIndex: 5,
            };
            const sizeStyle: React.CSSProperties = isHor
              ? { left: 0, right: 0, height: 8, [edge === "top" ? "top" : "bottom"]: -4 }
              : { top: 0, bottom: 0, width: 8, [edge === "left" ? "left" : "right"]: -4 };
            return (
              <div
                key={edge}
                data-hub-control
                onMouseDown={startEdgeDrag}
                title={`Kante ${edge} ziehen`}
                style={{ ...baseStyle, ...sizeStyle }}
              >
                {/* Sichtbarer Strich auf der Kante (subtil) */}
                <div
                  className="absolute"
                  style={
                    isHor
                      ? { left: 0, right: 0, top: "50%", height: 2, transform: "translateY(-50%)", background: "hsl(var(--accent-gold))", opacity: 0.7 }
                      : { top: 0, bottom: 0, left: "50%", width: 2, transform: "translateX(-50%)", background: "hsl(var(--accent-gold))", opacity: 0.7 }
                  }
                />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Vorschau-Bild eines CAD-Sheets. Liest live aus dem projectStore und
 *  zeigt den `thumbnail` (PNG aus dem CAD-Editor). Fallback: dezenter
 *  Platzhalter, wenn das Sheet noch nie im CAD geöffnet wurde. */
function CadViewThumb({ sheetId }: { sheetId?: string }) {
  const projects = useProjects();
  const sheet = React.useMemo(() => {
    if (!sheetId) return undefined;
    for (const p of projects) {
      const s = p.sheets.find((x) => x.id === sheetId);
      if (s) return s;
    }
    return undefined;
  }, [projects, sheetId]);
  if (sheet?.thumbnail) {
    return (
      <img
        src={sheet.thumbnail}
        alt={sheet.name}
        className="w-full h-full object-contain"
        style={{ background: "white" }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="w-full h-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}
    >
      {sheet ? `${sheet.name} — noch keine Vorschau (Sheet im CAD öffnen)` : "Kein Zeichenblatt"}
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
  selectedCadTool,
  selectedElementId,
  selectedElementIds,
  setSelectedElementId,
  toolSettings,
  cadSelectionCount,
  cadSelectedLineSnap,
  onCadLineSnapChange,
  onCadDuplicateSegments,
  updateToolSettings,

  onJumpCad,
  onCollapse,
  cadEngine,
}: {
  projectId: string;
  page?: import("@/lib/projectStore").ProjectPage;
  element?: PageElement;
  tab: "settings" | "tools" | "layers";
  setTab: (t: "settings" | "tools" | "layers") => void;
  project: import("@/lib/projectStore").Project;
  activeTool: PageTool;
  setActiveTool: (t: PageTool) => void;
  selectedCadTool?: "line" | "free" | "text" | "hatch";
  selectedElementId?: string;
  selectedElementIds?: string[];
  setSelectedElementId: (id?: string) => void;
  toolSettings: ToolSettings;
  cadSelectionCount?: number;
  cadSelectedLineSnap?: { midpoint: boolean; division: number | null; isGuide: boolean } | null;
  onCadLineSnapChange?: (patch: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
  onCadDuplicateSegments?: () => void;
  updateToolSettings: <K extends keyof ToolSettings>(k: K, patch: Partial<ToolSettings[K]>) => void;

  onJumpCad: (sheetId?: string) => void;
  onCollapse?: () => void;
  cadEngine?: import("@/cad/embed/MiniCad").MiniCad | null;
}) {

  const layerCount = page?.elements.length ?? 0;
  return (
    <aside
      className="w-[340px] shrink-0 border-l flex flex-col"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={<Settings size={14} />} label="Seiteneinstellung" />
        <TabButton active={tab === "tools"} onClick={() => setTab("tools")} icon={<Wrench size={14} />} label="Werkzeugeinstellung" />
        <TabButton
          active={tab === "layers"}
          onClick={() => setTab("layers")}
          icon={<LayersIcon size={14} />}
          label="Ebenen"
          badge={layerCount > 0 ? layerCount : undefined}
        />
        <button
          onClick={onCollapse}
          title="Einklappen"
          className="w-8 flex items-center justify-center hover:bg-muted border-l"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <PanelRightClose size={14} className="text-muted-foreground" />
        </button>
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
            selectedCadTool={selectedCadTool}
            selectedElementId={selectedElementId}
            selectedElementIds={selectedElementIds}
            setSelectedElementId={setSelectedElementId}
            toolSettings={toolSettings}
            cadSelectionCount={cadSelectionCount}
            cadSelectedLineSnap={cadSelectedLineSnap}
            onCadLineSnapChange={onCadLineSnapChange}
            onCadDuplicateSegments={onCadDuplicateSegments}
            updateToolSettings={updateToolSettings}
            onJumpCad={onJumpCad}
            cadEngine={cadEngine ?? null}


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
            <div className="flex items-center gap-2 w-full">
              <input
                type="checkbox"
                checked={(page.margins ?? 0) > 0}
                onChange={(e) => update({ margins: e.target.checked ? (page.margins && page.margins > 0 ? page.margins : 20) : 0 })}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={page.margins ?? 0}
                disabled={(page.margins ?? 0) === 0}
                onChange={(e) => update({ margins: Math.max(0, Number(e.target.value) || 0) })}
                className="flex-1 h-8 px-2 rounded bg-transparent border text-sm disabled:opacity-50"
                style={{ borderColor: "hsl(var(--hairline))" }}
              />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>
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
  selectedCadTool,
  selectedElementId,
  selectedElementIds,
  setSelectedElementId,
  toolSettings,
  cadSelectionCount,
  cadSelectedLineSnap,
  onCadLineSnapChange,
  onCadDuplicateSegments,
  updateToolSettings,
  onJumpCad,
  cadEngine,
}: {
  projectId: string;
  pageId?: string;
  element?: PageElement;
  project: import("@/lib/projectStore").Project;
  activeTool: PageTool;
  setActiveTool: (t: PageTool) => void;
  selectedCadTool?: "line" | "free" | "text" | "hatch";
  selectedElementId?: string;
  selectedElementIds?: string[];
  setSelectedElementId: (id?: string) => void;
  toolSettings: ToolSettings;
  cadSelectionCount?: number;
  cadSelectedLineSnap?: { midpoint: boolean; division: number | null; isGuide: boolean } | null;
  onCadLineSnapChange?: (patch: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
  onCadDuplicateSegments?: () => void;
  updateToolSettings: <K extends keyof ToolSettings>(k: K, patch: Partial<ToolSettings[K]>) => void;

  onJumpCad: (sheetId?: string) => void;
  cadEngine?: import("@/cad/embed/MiniCad").MiniCad | null;
}) {

  const settingsTool = activeTool ?? selectedCadTool ?? null;
  return (
    <div className="space-y-5">
      {/* Active tool header */}
      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          AKTIVES WERKZEUG
        </div>
        {!settingsTool ? (
          <div className="text-xs text-muted-foreground">
            Auswahlwerkzeug aktiv — klicke ein Objekt zum Auswählen. Mit <kbd className="px-1 rounded border" style={{ borderColor: "hsl(var(--hairline))" }}>Shift</kbd>-Klick mehrere Objekte gleichzeitig auswählen.
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-md border px-3 py-2" style={{ borderColor: "hsl(var(--hairline))" }}>
            <div className="text-sm font-medium">
              {settingsTool === "guide" && "Hilfslinie"}
              {settingsTool === "line" && "Linie (CAD)"}
              {settingsTool === "free" && "Freihand (CAD)"}
              {settingsTool === "eraser" && "Radiergummi (CAD)"}
              {settingsTool === "hatch" && "Schraffur (CAD)"}
              {settingsTool === "text" && "Text (CAD)"}
              {settingsTool === "cad" && "CAD-Zeichenblatt"}
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
              : activeTool === "free"
              ? "Maus gedrückt halten → Freihand-Strich zeichnen. Lineal-Snap unterstützt."
              : activeTool === "eraser"
              ? "Maus gedrückt halten → radiert Linien und Freihand-Striche entlang Pfad."
              : activeTool === "hatch"
              ? "Modus im Panel wählen — Polygon: Klicks + Doppelklick · Rechteck: 3 Klicks · Kreis: Zentrum→Radius · Füllung: in Fläche klicken."
              : "Zwei Klicks setzen Start- und Endpunkt. ESC = abbrechen."}
          </div>
        )}
      </div>

      {/* Per-tool settings */}
      {!activeTool && (
        <SelectSettings
          settings={toolSettings.select}
          onChange={(p) => updateToolSettings("select", p)}
          selectedCount={Math.max(selectedElementIds?.length ?? 0, cadSelectionCount ?? 0)}
        />
      )}
      {settingsTool === "guide" && (
        <GuideSettings
          settings={toolSettings.guide}
          onChange={(p) => updateToolSettings("guide", p)}
        />
      )}
      {settingsTool === "line" && (
        <LineSettings
          settings={toolSettings.line}
          onChange={(p) => updateToolSettings("line", p)}
        />
      )}
      {settingsTool === "free" && cadEngine && (
        <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <FreeDrawSettingsPanel app={cadEngine} />
        </div>
      )}
      {settingsTool === "eraser" && cadEngine && (
        <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <EraserSettingsPanel app={cadEngine} />
        </div>
      )}
      {settingsTool === "hatch" && cadEngine && (
        <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <HatchSettingsPanel app={cadEngine} />
        </div>
      )}
      {cadSelectedLineSnap && onCadLineSnapChange && (
        <LineSnapSettings
          isGuide={cadSelectedLineSnap.isGuide}
          midpoint={cadSelectedLineSnap.midpoint}
          division={cadSelectedLineSnap.division}
          onChange={onCadLineSnapChange}
          onDuplicate={onCadDuplicateSegments}
        />
      )}

      {settingsTool === "text" && (
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
          siblingIds={(selectedElementIds ?? []).filter((id) => id !== element.id)}
          onJumpCad={onJumpCad}
        />
      )}
    </div>
  );
}

function SelectSettings({
  selectedCount,
}: {
  settings: ToolSettings["select"];
  onChange: (p: Partial<ToolSettings["select"]>) => void;
  selectedCount: number;
}) {
  return (
    <SettingsBlock title="AUSWAHLWERKZEUG">
      <div className="text-[11px] text-muted-foreground">
        Klicke ein Objekt zum Auswählen. Mit <kbd className="px-1 rounded border" style={{ borderColor: "hsl(var(--hairline))" }}>Shift</kbd>-Klick mehrere Objekte gleichzeitig auswählen oder aus der Auswahl entfernen. Aufziehen mit gedrückter Maustaste selektiert alle Objekte im Rahmen.
        {selectedCount > 0 && (
          <div className="mt-1">Aktuell ausgewählt: <strong className="text-foreground">{selectedCount}</strong></div>
        )}
      </div>
    </SettingsBlock>
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
      <Row label="Fixiert">
        <button
          type="button"
          onClick={() => onChange({ locked: !settings.locked })}
          className="h-7 px-2 rounded-md border text-xs flex items-center gap-1.5"
          style={{
            borderColor: "hsl(var(--hairline))",
            background: settings.locked ? "hsl(var(--surface-strong))" : "transparent",
          }}
          title={settings.locked ? "Hilfslinien sind gesperrt — klicken zum Entsperren" : "Klicken um alle Hilfslinien zu sperren"}
        >
          <span aria-hidden>{settings.locked ? "🔒" : "🔓"}</span>
          <span>{settings.locked ? "Gesperrt" : "Frei"}</span>
        </button>
      </Row>
      <div className="text-[11px] text-muted-foreground">
        Hilfslinien werden hellblau gestrichelt angezeigt und beim Druck nicht ausgegeben.
        Bei „Gesperrt" können sie weder ausgewählt, verschoben noch gelöscht werden.
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

function LineSnapSettings({
  isGuide,
  midpoint,
  division,
  onChange,
  onDuplicate,
}: {
  isGuide: boolean;
  midpoint: boolean;
  division: number | null;
  onChange: (patch: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
  onDuplicate?: () => void;
}) {
  const [draft, setDraft] = useState<string>(division ? String(division) : "");
  // Keep draft in sync when selection switches to another line.
  useEffect(() => {
    setDraft(division ? String(division) : "");
  }, [division]);
  return (
    <SettingsBlock title={isGuide ? "HILFSLINIEN-SNAPS" : "LINIEN-SNAPS"}>
      <Row label="Mittelpunkt">
        <button
          type="button"
          onClick={() => onChange({ midpointSnap: !midpoint })}
          className="h-7 px-2 rounded-md border text-xs"
          style={{
            borderColor: "hsl(var(--hairline))",
            background: midpoint ? "hsl(var(--surface-strong))" : "transparent",
          }}
        >
          {midpoint ? "Ein" : "Aus"}
        </button>
      </Row>
      <Row label="Teilung (N)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={2}
            max={64}
            step={1}
            value={draft}
            placeholder="–"
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              if (raw.trim() === "") { onChange({ divisionSnap: null }); return; }
              const n = Math.floor(Number(raw));
              if (Number.isFinite(n) && n >= 2) onChange({ divisionSnap: n });
            }}
            className="w-20 h-7 px-2 rounded bg-transparent border text-sm tabular-nums"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          {division ? (
            <button
              type="button"
              onClick={() => { setDraft(""); onChange({ divisionSnap: null }); }}
              className="h-7 px-2 rounded-md border text-[11px] text-muted-foreground"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              Aus
            </button>
          ) : null}
        </div>
      </Row>
      {onDuplicate && (
        <Row label="Aktion">
          <button
            type="button"
            onClick={onDuplicate}
            className="h-7 px-2 rounded-md border text-xs inline-flex items-center gap-1"
            style={{ borderColor: "hsl(var(--hairline))" }}
            title="Auswahl duplizieren (leichter Versatz)"
          >
            <Copy size={12} /> Duplizieren
          </button>
        </Row>
      )}
      <div className="text-[11px] text-muted-foreground">
        Mittelpunkt = Halbierungs-Snap (50 %). Teilung N (z. B. 3, 4) erzeugt N-1
        zusätzliche Snap-Punkte für gleiche Abschnitte. Beide Optionen sind
        kombinierbar.
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
      <Row label="Modus">
        <div className="flex flex-col gap-1 w-full">
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name="text-mode"
              checked={settings.autoSize !== false}
              onChange={() => onChange({ autoSize: true })}
              className="mt-0.5"
            />
            <span>Rahmen passt sich Text an</span>
          </label>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name="text-mode"
              checked={settings.autoSize === false}
              onChange={() => onChange({ autoSize: false, wrap: true })}
              className="mt-0.5"
            />
            <span>Rahmen zeichnen — Text passt sich an</span>
          </label>
        </div>
      </Row>
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
      <Row label="Ausrichtung">
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              onClick={() => onChange({ align: a })}
              className="h-8 flex-1 rounded border text-xs"
              style={{
                borderColor: "hsl(var(--hairline))",
                background: settings.align === a ? "hsl(var(--accent-gold-soft))" : "transparent",
              }}
              title={a === "left" ? "Links" : a === "center" ? "Zentriert" : "Rechts"}
            >
              {a === "left" ? "⯇" : a === "center" ? "≡" : "⯈"}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Transparenz">
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={100} step={1}
            value={settings.alpha}
            onChange={(e) => onChange({ alpha: Number(e.target.value) })}
            className="flex-1 accent-foreground"
          />
          <span className="text-xs tabular-nums w-10 text-right">{settings.alpha}%</span>
        </div>
      </Row>
      <Row label="Umbruch">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={settings.wrap}
            onChange={(e) => onChange({ wrap: e.target.checked })}
          />
          Auto-Umbruch (Breite fix, Höhe wächst)
        </label>
      </Row>
      <Row label="Hintergrund">
        <ColorInput value={settings.bgColor} onChange={(v) => onChange({ bgColor: v })} />
      </Row>
      <Row label="Hintergrund-Alpha">
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={100} step={1}
            value={settings.bgAlphaPct}
            onChange={(e) => onChange({ bgAlphaPct: Number(e.target.value) })}
            className="flex-1 accent-foreground"
          />
          <span className="text-xs tabular-nums w-10 text-right">{settings.bgAlphaPct}%</span>
        </div>
      </Row>
      <Row label="Rahmen">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={settings.borderEnabled}
            onChange={(e) => onChange({ borderEnabled: e.target.checked })}
          />
          Rahmen anzeigen
        </label>
      </Row>
      {settings.borderEnabled && (
        <>
          <Row label="Rahmenfarbe">
            <ColorInput value={settings.borderColor} onChange={(v) => onChange({ borderColor: v })} />
          </Row>
          <Row label="Rahmenstärke">
            <div className="flex items-center gap-2">
              <input
                type="range" min={0.5} max={8} step={0.5}
                value={settings.borderWidthPx}
                onChange={(e) => onChange({ borderWidthPx: Number(e.target.value) })}
                className="flex-1 accent-foreground"
              />
              <span className="text-xs tabular-nums w-10 text-right">{settings.borderWidthPx} px</span>
            </div>
          </Row>
        </>
      )}
      <div className="text-[11px] text-muted-foreground">
        Text wird mit CAD-Engine erstellt: Snap an Linien, Texte und Seitenränder. Doppelklick zum Editieren.
      </div>
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
  siblingIds,
  onJumpCad,
}: {
  element: PageElement;
  projectId: string;
  pageId: string;
  /** Weitere selektierte Elemente (ohne `element.id`). Patches werden auf alle
   *  Geschwister mit gleichem `kind` mit angewendet. Größen-/Geometrie-Felder
   *  (x/y/w/h) bleiben jedoch lokal — Multi-Move geschieht über Drag. */
  siblingIds?: string[];
  onJumpCad: (sheetId?: string) => void;
}) {
  const update = (patch: Partial<PageElement>) => {
    // Felder, die NICHT auf gleichartige Geschwister mitübertragen werden,
    // weil sie pro Objekt individuell sein müssen.
    const geometryKeys = new Set(["x", "y", "w", "h", "points"]);
    const isGeometryOnly = Object.keys(patch).every((k) => geometryKeys.has(k));
    projectStore.updateElement(projectId, pageId, element.id, patch);
    if (!isGeometryOnly && siblingIds && siblingIds.length > 0) {
      const project = projectStore.getState().projects.find((p) => p.id === projectId);
      const page = project?.pages.find((p) => p.id === pageId);
      const sameKindSiblings = (page?.elements ?? []).filter(
        (e) => siblingIds.includes(e.id) && e.kind === element.kind,
      );
      for (const sib of sameKindSiblings) {
        const cleaned: any = {};
        for (const k of Object.keys(patch)) {
          if (!geometryKeys.has(k)) cleaned[k] = (patch as any)[k];
        }
        projectStore.updateElement(projectId, pageId, sib.id, cleaned);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-1">
        {element.kind.toUpperCase()}
        {siblingIds && siblingIds.length > 0 && (
          <span className="ml-2 text-muted-foreground font-normal normal-case tracking-normal">
            (+{siblingIds.length} weitere ausgewählt — gleiche Einstellungen werden auf gleichartige Objekte angewendet)
          </span>
        )}
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

type PrintColorMode = "original" | "bw" | "gray" | "custom";
type PrintPageMode = "all" | "range" | "current";

function PrintPanel({
  project,
  onClose,
}: {
  project: import("@/lib/projectStore").Project;
  onClose: () => void;
}) {
  const [pageMode, setPageMode] = useState<PrintPageMode>("all");
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(project.pages.length);
  const [colorMode, setColorMode] = useState<PrintColorMode>("original");
  const [customColor, setCustomColor] = useState("#111111");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(project.pages.map(p => p.id)));

  const toggleId = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <aside
      className="w-[340px] shrink-0 border-l flex flex-col relative"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-6 w-6 rounded-md flex items-center justify-center"
            style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}
          >
            🖨
          </span>
          <div className="text-sm font-semibold">Druckmodus</div>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground"
          title="Druckmodus schließen"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <section>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
            SEITEN
          </div>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={pageMode === "all"} onChange={() => setPageMode("all")} />
              Alle Seiten ({project.pages.length})
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={pageMode === "current"} onChange={() => setPageMode("current")} />
              Nur aktuelle Seite
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={pageMode === "range"} onChange={() => setPageMode("range")} />
              Bereich
            </label>
            {pageMode === "range" && (
              <div className="flex items-center gap-2 pl-6">
                <input
                  type="number" min={1} max={project.pages.length}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Number(e.target.value) || 1)}
                  className="w-14 h-7 px-2 rounded border bg-transparent text-sm"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                />
                <span className="text-muted-foreground">bis</span>
                <input
                  type="number" min={1} max={project.pages.length}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Number(e.target.value) || project.pages.length)}
                  className="w-14 h-7 px-2 rounded border bg-transparent text-sm"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                />
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
            AUSWAHL
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {project.pages.map((p, i) => (
              <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={() => toggleId(p.id)}
                />
                <span className="text-muted-foreground w-6 text-right">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate">{p.title}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
            FARBE
          </div>
          <div className="space-y-2 text-sm">
            {([
              ["original", "Originalfarben"],
              ["bw", "Schwarz / Weiß"],
              ["gray", "Graustufen"],
              ["custom", "Eigene Farbe"],
            ] as [PrintColorMode, string][]).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={colorMode === v} onChange={() => setColorMode(v)} />
                {l}
              </label>
            ))}
            {colorMode === "custom" && (
              <div className="flex items-center gap-2 pl-6">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="h-7 w-10 rounded border bg-transparent"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                />
                <span className="text-xs text-muted-foreground">{customColor}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <div
        className="border-t p-3 flex gap-2"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <button
          onClick={onClose}
          className="flex-1 h-9 rounded-md text-sm border"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
        >
          Abbrechen
        </button>
        <button
          onClick={() => window.print()}
          className="flex-1 h-9 rounded-md text-sm font-medium"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
        >
          PDF erstellen
        </button>
      </div>
    </aside>
  );
}


// re-export helpful types
export type { PageElement, ElementKind };
