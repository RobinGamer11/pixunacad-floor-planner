import React, { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { DragScrollDiv } from "@/components/DragScrollDiv";
import { ToolHelpNotes } from "@/components/cad/ToolHelpNotes";
import { PipetteSettingsPanel } from "@/components/cad/PipetteSettingsPanel";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  Eye,
  EyeOff,
  Settings,
  Wrench,
  CheckSquare,
  Square,
  Trash2,
  Copy,
  RotateCw,
  Maximize2,
  Undo2,
  Redo2,
  Share2,
  Play,
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
  Crosshair,
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
  Link2,
  Link2Off,
  BookOpen,
  Lock as LockIcon,
  Unlock as UnlockIcon,
  BoxSelect,
  Scissors,
  ChevronsUpDown,
  ChevronsLeftRight,
  SquareDashed,
  FolderOpen,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough as StrikethroughIcon,
  Frame as FrameIcon,
  Scan as ScanIcon,
  Layers,
  Star,
} from "lucide-react";

import {
  projectStore,
  useProject,
  useProjects,
  useProjectHistory,
  type PageElement,
  type ElementKind,
  type PageFormat,
  type PunchPattern,
  type PunchSide,
  type ProjectPage,
} from "@/lib/projectStore";
import {
  TEMPLATE_LABEL, parseTemplateKey, getFavoriteTemplate, setFavoriteTemplate,
} from "@/lib/financeStore";
import { buildDefaultTemplatePages } from "@/lib/financeTemplates";
import { EMPTY_WHEEL_ZOOM_BURST, nextSmartWheelZoom } from "@/lib/projectZoom";
import CadOverlayLayer from "@/components/page/CadOverlayLayer";
import { CadDocumentInspector } from "@/components/page/CadDocumentInspector";
import { CadIdPanelHost } from "@/components/page/CadIdPanelHost";
import { PdfPageView, setWorkspacePdfZoomActive } from "@/components/page/PdfPageView";
import { TableElementView, TableModifyContext, TableFormulaPickContext, type FormulaFn } from "@/components/page/TableElementView";
import { TableToolSettings } from "@/components/page/TableToolSettings";

import { CadViewportView } from "@/components/page/CadViewportView";
import { renderSceneRegionToCanvas } from "@/cad/SceneRegionRenderer";
import { buildEraseMaskCss } from "@/lib/eraseMask";

import { importFile, type ImportedPage } from "@/cad/documentImport";
import { popPendingSheetPdf } from "@/lib/sheetPdfExport";
import { setExportMode } from "@/lib/printExport";
import type { MiniCadSelectionInfo } from "@/cad/embed/MiniCad";
import type { HatchDrawMode } from "@/cad/HatchTool";
import { FreeDrawSettingsPanel } from "@/components/cad/FreeDrawSettingsPanel";
import { EraserSettingsPanel, EraserModeSelect } from "@/components/cad/EraserSettingsPanel";
import { ProjectFilePickerDialog } from "@/components/cad/ProjectFilePickerDialog";
import { HatchSettingsPanel, HatchModeSelect } from "@/components/cad/HatchSettingsPanel";
import { LineModeSelect as LineShapeModeSelect } from "@/components/cad/LineModeSelect";

import { RasterModeToggle } from "@/components/cad/RasterModeToggle";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { MappeHelpOverlay } from "@/components/workspace/MappeHelpOverlay";
import { ToolColorPicker } from "@/components/workspace/ToolColorPicker";
import { TabletAidWheel } from "@/components/TabletAidWheel";

// Papierformate: kanonische Quelle ist src/lib/paper.ts.
// Für "frei" enthält diese Tabelle nur die Default-Größe; individuelle Werte
// aus page.customWidthMm/customHeightMm werden dort abgefragt, wo die reale
// Seitengröße gebraucht wird (getPageSizeMm).
import { PAPER_FORMATS as FORMAT_SIZES, getPageSizeMm, parseScaleDen } from "@/lib/paper";
import {
  guideStrokeMmToPx,
  guideStrokePxToMm,
  mappePagePxPerMm,
  MAPPE_PAGE_BASE_WIDTH_PX,
} from "@/lib/guideStrokeWidth";
import { getPageSnapRegistry, buildRectSnapEntry } from "@/lib/pageSnap";
import { registerCadEngineSnap, queryCadEngineSnap } from "@/lib/cadEngineSnap";
import { Defaults } from "@/cad/constants";
import {
  IDENTITY_WARP,
  computeWarpMatrix3d,
  edgeMidpoints,
  isWarped,
  setWarpTarget,
  useWarpTarget,
  type WarpCorners,
} from "@/lib/warpMatrix";

export type PageTool = "guide" | "line" | "free" | "eraser" | "text" | "cad" | "pipette" | "hatch" | "document" | "table" | null;
type LinePageTool = "line" | "free";

const LINE_TOOL_VARIANTS: Array<{ id: LinePageTool; label: string; icon: React.ElementType }> = [
  { id: "line", label: "Linie", icon: Minus },
  { id: "free", label: "Freihand", icon: Pencil },
];

const HATCH_MODE_VARIANTS: Array<{ id: HatchDrawMode; label: string; icon: React.ElementType }> = [
  { id: "polygon", label: "Polygon", icon: Spline },
  { id: "rectangle", label: "Rechteck", icon: RectangleHorizontal },
  { id: "circle", label: "Kreis", icon: CircleIcon },
  { id: "fill", label: "Füllung", icon: PaintBucket },
];

const isLinePageTool = (tool: PageTool): tool is LinePageTool =>
  tool === "line" || tool === "free";

/** Registry laufender HUB-/Transform-Aktionen. ENTF/ESC brechen darüber jede
 *  aktive Vorschau (Verschieben, Drehen, Trimmen) sofort ab und verwerfen sie. */
const activeAborts = new Set<() => void>();
function registerAbort(fn: () => void): () => void {
  activeAborts.add(fn);
  return () => { activeAborts.delete(fn); };
}
function runActiveAborts(): boolean {
  if (!activeAborts.size) return false;
  const list = Array.from(activeAborts);
  activeAborts.clear();
  for (const fn of list) { try { fn(); } catch { /* ignore */ } }
  return true;
}

const PROJECT_ZOOM_MIN = 5;
const PROJECT_ZOOM_MAX = 1600;
const PROJECT_ZOOM_SLIDER_STEPS = 1000;
const clampProjectZoom = (v: number) => Math.max(PROJECT_ZOOM_MIN, Math.min(PROJECT_ZOOM_MAX, v));
const clampUnit = (v: number) => Math.max(0, Math.min(1, v));

const zoomToSliderValue = (zoom: number) => {
  const min = Math.log(PROJECT_ZOOM_MIN);
  const max = Math.log(PROJECT_ZOOM_MAX);
  return Math.round(((Math.log(clampProjectZoom(zoom)) - min) / (max - min)) * PROJECT_ZOOM_SLIDER_STEPS);
};

const sliderValueToZoom = (value: number) => {
  const min = Math.log(PROJECT_ZOOM_MIN);
  const max = Math.log(PROJECT_ZOOM_MAX);
  return Math.exp(min + (clampUnit(value / PROJECT_ZOOM_SLIDER_STEPS) * (max - min)));
};

type ProjectZoomAnchor =
  | { kind: "page"; pageId: string; xRatio: number; yRatio: number; clientX: number; clientY: number }
  | { kind: "viewport"; contentX: number; contentY: number; mx: number; my: number };

export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const rawProject = useProject(projectId);
  const navigate = useNavigate();

  /* ---------- Vorlagen-Modus (Finanzen: Angebot / Rechnung / Nachtrag) ---------- */
  const [tplParams] = useSearchParams();
  const templateKey = tplParams.get("tpl") ?? null;
  const templateBackNode = tplParams.get("back") ?? "";
  const templateInfo = templateKey ? parseTemplateKey(templateKey) : null;
  const templateLabel = templateInfo ? TEMPLATE_LABEL[templateInfo.type] : "";

  useEffect(() => {
    if (!templateKey || !projectId || !templateInfo) return;
    const title = `${TEMPLATE_LABEL[templateInfo.type]} Vorlage`;
    // Favorit hat Vorrang, sonst die mitgelieferte Standard-Mustervorlage.
    const favorite = getFavoriteTemplate<ProjectPage>(projectId, templateInfo.type);
    projectStore.ensureTemplatePages(
      projectId,
      templateKey,
      title,
      favorite?.length ? favorite : buildDefaultTemplatePages(templateInfo.type, title),
    );
  }, [templateKey, projectId, templateInfo?.type]);

  // Im Vorlagen-Modus sind ausschließlich die Vorlagenseiten sichtbar,
  // sonst ausschließlich die normalen Mappenseiten.
  const project = useMemo(() => {
    if (!rawProject) return rawProject;
    const pages = rawProject.pages.filter((pg) =>
      templateKey ? pg.templateKey === templateKey : !pg.templateKey);
    return { ...rawProject, pages };
  }, [rawProject, templateKey]);

  const [activePageId, setActivePageId] = useState<string | undefined>(project?.pages[0]?.id);
  useEffect(() => {
    if (!project) return;
    if (!project.pages.some((pg) => pg.id === activePageId)) setActivePageId(project.pages[0]?.id);
  }, [project, activePageId]);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const [docImporting, setDocImporting] = useState(false);
  const [docPickerPages, setDocPickerPages] = useState<ImportedPage[] | null>(null);
  const [docPickerSelected, setDocPickerSelected] = useState<Set<number>>(new Set());
  // Zugriff auf die Dokumentenablage des Projekts auf der Startseite.
  const [docLibraryOpen, setDocLibraryOpen] = useState(false);
  // Ausgabemaßstab für neu importierte Dokumente. Wird rechts im
  // "Dokument"-Werkzeug-Panel als Dropdown ausgewählt (wie beim CAD-Blatt).
  const [docScale, setDocScale] = useState<string>("1:100");
  // "Frei platzieren": Bei aktivem Toggle wird der Import-Maßstab beim Import
  // automatisch so gewählt, dass das Dokument vollständig mit reichlich Rand
  // auf der aktiven Seite liegt (überschreibt docScale nur für diesen Import).
  const [docFreePlace, setDocFreePlace] = useState<boolean>(true);
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
  const [selectedCadTool, setSelectedCadTool] = useState<"line" | "free" | "text" | "hatch" | "guide" | undefined>();
  const [cadSelectionCount, setCadSelectionCount] = useState<number>(0);
  const [cadSelectedLineSnap, setCadSelectedLineSnap] = useState<{ midpoint: boolean; division: number | null; isGuide: boolean } | null>(null);
  const [lineToolVariant, setLineToolVariant] = useState<LinePageTool>("line");
  const [lineToolFlyoutOpen, setLineToolFlyoutOpen] = useState(false);
  const [hatchDrawMode, setHatchDrawMode] = useState<HatchDrawMode>("polygon");
  const [hatchToolFlyoutOpen, setHatchToolFlyoutOpen] = useState(false);
  // Flyout am Auswahl-Symbol für die Rahmen-Modi (Berühren / Umschließen).
  const [selectToolFlyoutOpen, setSelectToolFlyoutOpen] = useState(false);
  // Tabellen-Werkzeug: Placement-Preview vor Bestätigen.
  const [pendingTableId, setPendingTableId] = useState<string | null>(null);
  const [tableModifyMode, setTableModifyMode] = useState(false);
  const [tableFormulaFn, setTableFormulaFn] = useState<FormulaFn | null>(null);
  const cadEngineApiRef = useRef<{
    setSelectedSegmentSnap: (opts: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
    duplicateSelectedSegments: (offsetMm?: number) => number;
    engine: import("@/cad/embed/MiniCad").MiniCad;
  } | null>(null);
  // Force-re-render der ToolsTab, sobald die Engine bereit ist (für Panel-Wiring).
  const [, forceEngineTick] = useState(0);
  /** Engine übernehmen + Fangpunkt-Brücke registrieren (Linien, Texte,
   *  Freihand, Schraffuren, Dokumente werden so auch für CAD-Blätter fangbar). */
  const attachCadEngine = (api: {
    setSelectedSegmentSnap: (opts: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
    duplicateSelectedSegments: (offsetMm?: number) => number;
    engine: import("@/cad/embed/MiniCad").MiniCad;
  }) => {
    cadEngineApiRef.current = api;
    // Modus-Wechsel aus den Werkzeugeinstellungen ins linke Werkzeug-Symbol spiegeln.
    const ht: any = (api.engine as any)?.hatchTool;
    if (ht) {
      const prevMode = ht.onDrawModeChange;
      ht.onDrawModeChange = (m: HatchDrawMode) => { prevMode?.(m); setHatchDrawMode(m); };
    }
    registerCadEngineSnap((clientX, clientY, pageRect, tol = 12) => {
      const engine = cadEngineApiRef.current?.engine as any;
      if (!engine?.canvas || !engine.camera || !engine.topology) return null;
      const cr = engine.canvas.getBoundingClientRect();
      const sx = clientX - cr.left;
      const sy = clientY - cr.top;
      const w = engine.camera.screenToWorld(sx, sy);
      const snap = engine.topology.findBestSnap({ x: sx, y: sy }, w);
      if (!snap?.world) return null;
      const s = engine.camera.worldToScreen(snap.world.x, snap.world.y);
      const cx = cr.left + s.x;
      const cy = cr.top + s.y;
      if (Math.hypot(cx - clientX, cy - clientY) > tol) return null;
      return {
        x: ((cx - pageRect.left) / Math.max(1, pageRect.width)) * 100,
        y: ((cy - pageRect.top) / Math.max(1, pageRect.height)) * 100,
      };
    });
    forceEngineTick((t) => t + 1);
  };
  useEffect(() => () => registerCadEngineSnap(null), []);

  const [presenting, setPresenting] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("present") === "1"; } catch { return false; }
  });
  // Wenn Präsentation via ?present=1 automatisch gestartet wird, Param nach Aktivierung aus der URL entfernen.
  useEffect(() => {
    if (!presenting) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("present")) {
        url.searchParams.delete("present");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
    // Nur einmal beim Mount interessant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Während der Präsentation gelten dieselben Regeln wie beim Drucken/Export:
  // Seitenränder-Overlay und CAD-Hilfslinien werden ausgeblendet.
  useEffect(() => {
    setExportMode(presenting);
    return () => setExportMode(false);
  }, [presenting]);
  const [tabletAidOn, setTabletAidOn] = useState<boolean>(() => {
    try { return localStorage.getItem("pixuna.tabletAid") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pixuna.tabletAid", tabletAidOn ? "1" : "0"); } catch {}
  }, [tabletAidOn]);
  const mappeHelpOn = project?.settings?.mappeHelpOn ?? true;
  const hist = useProjectHistory(project?.id);



  // Auf schmalen Viewports (iPad Portrait, kleine Tablets) beide Panels
  // initial einklappen — sonst bleibt für die Canvas kein Platz.
  const isNarrowInitial = typeof window !== "undefined" && window.innerWidth < 1024;
  const [leftOpen, setLeftOpen] = useState(!isNarrowInitial);
  const [rightOpen, setRightOpen] = useState(!isNarrowInitial);
  // Wenn beim Verkleinern (z.B. iPad-Rotation) der Viewport unter 1024px
  // fällt und beide Panels offen sind, automatisch das rechte Panel schließen.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 900 && leftOpen && rightOpen) {
        setRightOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [leftOpen, rightOpen]);
  const [renamingPageId, setRenamingPageId] = useState<string | undefined>();
  const [pageNameDraft, setPageNameDraft] = useState("");
  const [pageActionsSticky, setPageActionsSticky] = useState(false);
  const [dragPageIdx, setDragPageIdx] = useState<number | null>(null);
  const [bgOverlay, setBgOverlay] = useState<{ pageId?: string; opacity: number; visible: boolean; color: string; tintEnabled: boolean }>({
    opacity: 0.45,
    visible: true,
    color: "#ffffff",
    tintEnabled: true,
  });
  const [zoom, setZoom] = useState(60);
  const didAutoFitRef = useRef(false);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  // Zoom-Anker: merkt sich den echten Punkt auf der Seite unter Maus/Fingern.
  // Dadurch bleibt der Zielpunkt auch bei großen Mappe-Paddings und Spreads stabil.
  const zoomAnchorRef = useRef<ProjectZoomAnchor | null>(null);
  const setZoomClamped = (v: number) => setZoom(clampProjectZoom(v));

  const captureZoomAnchor = (clientX: number, clientY: number): ProjectZoomAnchor | null => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return null;

    const hit = document.elementFromPoint(clientX, clientY);
    const hitPage = hit instanceof HTMLElement ? hit.closest<HTMLElement>("[data-page-id]") : null;
    const pageEl = hitPage ?? viewport.querySelector<HTMLElement>("[data-page-id]");

    if (pageEl) {
      const r = pageEl.getBoundingClientRect();
      // Freier Zoom: Ratios werden NICHT auf das Blatt geklemmt. Liegt der
      // Cursor außerhalb der Seite (graue Fläche), bleibt trotzdem exakt der
      // Punkt unter der Maus stehen, statt an die Blattkante zu springen.
      return {
        kind: "page",
        pageId: pageEl.dataset.pageId ?? "",
        xRatio: r.width > 0 ? (clientX - r.left) / r.width : 0.5,
        yRatio: r.height > 0 ? (clientY - r.top) / r.height : 0.5,
        clientX,
        clientY,
      };
    }

    const r = viewport.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    return {
      kind: "viewport",
      contentX: viewport.scrollLeft + mx,
      contentY: viewport.scrollTop + my,
      mx,
      my,
    };
  };


  const applyZoomAnchor = () => {
    const viewport = canvasViewportRef.current;
    const anchor = zoomAnchorRef.current;
    if (!viewport || !anchor) return;

    if (anchor.kind === "page") {
      const pages = Array.from(viewport.querySelectorAll<HTMLElement>("[data-page-id]"));
      const pageEl = pages.find((el) => el.dataset.pageId === anchor.pageId) ?? pages[0];
      if (pageEl) {
        const r = pageEl.getBoundingClientRect();
        const anchoredClientX = r.left + r.width * anchor.xRatio;
        const anchoredClientY = r.top + r.height * anchor.yRatio;
        viewport.scrollLeft += anchoredClientX - anchor.clientX;
        viewport.scrollTop += anchoredClientY - anchor.clientY;
      }
    } else {
      viewport.scrollLeft = anchor.contentX - anchor.mx;
      viewport.scrollTop = anchor.contentY - anchor.my;
    }

    zoomAnchorRef.current = null;
  };

  useLayoutEffect(() => {
    applyZoomAnchor();
  }, [zoom]);

  // Auto-Fit siehe unten (nach activePage-Definition).



  // Aktueller Zoom als Ref, damit iPad-Touch-Handler ihn ohne Rerender lesen.
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const wheelStepRef = useRef(0);
  const wheelBurstRef = useRef({ ...EMPTY_WHEEL_ZOOM_BURST });
  const wheelAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const wheelRafRef = useRef(0);
  const wheelEndTimerRef = useRef<number | null>(null);

  // iPad: Zwei-Finger-Pinch = Zoom, Zwei-Finger-Drag = Pan. Ein Finger auf
  // dem Canvas bleibt der aktiven CAD-/Werkzeug-Interaktion vorbehalten.
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    let mode: "idle" | "gesture" | "pan1" = "idle";
    let startDist = 0;
    let startZoom = 1;
    let startAnchor: ProjectZoomAnchor | null = null;
    let pan1Last: { x: number; y: number } | null = null;
    let pan1Id: number | null = null;
    const pts = new Map<number, { x: number; y: number }>();
    const midOf = () => {
      const arr = [...pts.values()];
      if (arr.length < 2) return { x: 0, y: 0 };
      return { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 };
    };
    const distOf = () => {
      const arr = [...pts.values()];
      if (arr.length < 2) return 0;
      return Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
    };
    // Wenn Pen-Only aktiv ist, sollen Apple-Pencil-Touches (touchType==="stylus")
    // KEIN Pan/Zoom im Projektmappen-Viewport auslösen — nur Finger dürfen das.
    // Analog zur CAD-Oberfläche (Input.ts).
    const isStylusTouch = (t: Touch) =>
      typeof (t as any).touchType === "string" && (t as any).touchType === "stylus";
    const acceptTouch = (t: Touch) => {
      if ((window as any).__pixunaPenOnly && isStylusTouch(t)) return false;
      return true;
    };
    const onTouchStart = (e: TouchEvent) => {
      if ((window as any).__pixunaZoomLock) return;
      for (const t of Array.from(e.touches)) {
        if (!acceptTouch(t)) continue;
        pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (pts.size >= 2) {
        const m = midOf();
        mode = "gesture";
        startDist = distOf();
        startZoom = zoomRef.current;
        startAnchor = captureZoomAnchor(m.x, m.y);
        pan1Last = null;
        pan1Id = null;
        e.preventDefault();
      } else if (pts.size === 1 && (window as any).__pixunaTabletCommit) {
        // Tablet-Hilfsrad aktiv: Ein-Finger-Bewegung schwenkt die Mappe
        // (statt zu zeichnen — Commit passiert nur per Wheel-ENTER/LMB).
        // Im Pen-Only-Modus wurden Stylus-Touches bereits oben ausgefiltert.
        const t = Array.from(e.touches).find((tt) => pts.has(tt.identifier));
        if (t) {
          pan1Id = t.identifier;
          pan1Last = { x: t.clientX, y: t.clientY };
          mode = "pan1";
        }
      }
    };
    let rafPending = 0;
    let pendingNextZoom: number | null = null;
    let pendingAnchor: ProjectZoomAnchor | null = null;
    const flush = () => {
      rafPending = 0;
      if (pendingNextZoom == null) return;
      if (pendingAnchor) zoomAnchorRef.current = pendingAnchor;
      setZoom(pendingNextZoom);
      pendingNextZoom = null;
      pendingAnchor = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if ((window as any).__pixunaZoomLock) { mode = "idle"; return; }
      for (const t of Array.from(e.touches)) {
        if (!acceptTouch(t)) continue;
        pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (mode === "gesture" && pts.size >= 2) {
        const m = midOf();
        const dist = distOf();
        if (startDist > 4 && dist > 4) {
          const factor = dist / startDist;
          pendingNextZoom = clampProjectZoom(startZoom * factor);
          pendingAnchor = startAnchor?.kind === "page"
            ? { ...startAnchor, clientX: m.x, clientY: m.y }
            : captureZoomAnchor(m.x, m.y);
          if (!rafPending) rafPending = requestAnimationFrame(flush);
        }
        e.preventDefault();
      } else if (mode === "pan1" && pan1Id !== null && pan1Last) {
        const t = Array.from(e.touches).find((tt) => tt.identifier === pan1Id);
        if (!t) return;
        const dx = t.clientX - pan1Last.x;
        const dy = t.clientY - pan1Last.y;
        pan1Last = { x: t.clientX, y: t.clientY };
        el.scrollLeft -= dx;
        el.scrollTop -= dy;
        e.preventDefault();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) pts.delete(t.identifier);
      if (pts.size < 2) mode = pts.size === 1 && (window as any).__pixunaTabletCommit ? "pan1" : "idle";
      if (mode === "pan1" && pts.size === 0) { mode = "idle"; pan1Id = null; pan1Last = null; }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Wheel-Zoom: nativer, NICHT-passiver Listener in der CAPTURE-Phase.
  // Dadurch (a) greift preventDefault zuverlässig (React-onWheel ist passiv)
  // und (b) schlucken eingebettete CAD-Canvas/Objekte das Event nicht mehr,
  // was bisher zu hakeligem Zoom über Objekten führte.
  useEffect(() => {
    const el = canvasViewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if ((window as any).__pixunaZoomLock) return;
      if (e.shiftKey && !e.altKey) return;
      setWorkspacePdfZoomActive(true);
      if (wheelEndTimerRef.current !== null) window.clearTimeout(wheelEndTimerRef.current);
      wheelEndTimerRef.current = window.setTimeout(() => {
        wheelEndTimerRef.current = null;
        setWorkspacePdfZoomActive(false);
      }, 240);
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      if (e.deltaMode === 2) dy *= el.clientHeight;
      if (dy === 0) return;
      const direction = dy < 0 ? 1 : -1;
      const smartZoom = nextSmartWheelZoom(wheelBurstRef.current, direction, performance.now());
      wheelBurstRef.current = smartZoom.burst;
      wheelStepRef.current = smartZoom.step;
      wheelAnchorRef.current = { x: e.clientX, y: e.clientY };
      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(() => {
          wheelRafRef.current = 0;
          const step = wheelStepRef.current;
          wheelStepRef.current = 0;
          const a = wheelAnchorRef.current;
          const current = zoomRef.current;
          const next = clampProjectZoom(current + step);
          if (Math.abs(next - current) < 0.0005) return;
          if (a) zoomAnchorRef.current = captureZoomAnchor(a.x, a.y);
          zoomRef.current = next;
          setZoom(next);
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true } as any);
      if (wheelRafRef.current) { cancelAnimationFrame(wheelRafRef.current); wheelRafRef.current = 0; }
      wheelStepRef.current = 0;
      wheelBurstRef.current = { ...EMPTY_WHEEL_ZOOM_BURST };
      wheelAnchorRef.current = null;
      if (wheelEndTimerRef.current !== null) window.clearTimeout(wheelEndTimerRef.current);
      setWorkspacePdfZoomActive(false);
    };
  }, []);

  const setActiveToolAndTab = (t: PageTool) => {
    setPrintMode(false);
    setActiveTool(t);
    if (isLinePageTool(t)) setLineToolVariant(t);
    if (!isLinePageTool(t)) setLineToolFlyoutOpen(false);
    if (t !== "hatch") setHatchToolFlyoutOpen(false);
    if (t !== null) setSelectToolFlyoutOpen(false);
    if (t) setSelectedCadTool(undefined);
    // Auswahl-Werkzeug (t === null) → Seiteneinstellungen automatisch öffnen.
    setRightTabState(t ? "tools" : "settings");
  };

  // Auswahl eines bestehenden Objekts → automatisch in die Werkzeug-
  // einstellungen wechseln; ohne Auswahl und ohne aktives Werkzeug zurück
  // zu den Seiteneinstellungen.
  React.useEffect(() => {
    if (selectedElementIds.length > 0) {
      setPrintMode(false);
      setRightTabState("tools");
    } else if (!activeTool && !selectedCadTool) {
      setRightTabState("settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds.length, selectedCadTool]);

  // Werkzeug-Modi links schließen sich automatisch, sobald das jeweilige
  // Werkzeug nicht mehr aktiv ist (auch bei ESC oder Wechsel von außen).
  React.useEffect(() => {
    if (!isLinePageTool(activeTool)) setLineToolFlyoutOpen(false);
    if (activeTool !== "hatch") setHatchToolFlyoutOpen(false);
    if (activeTool !== null) setSelectToolFlyoutOpen(false);
  }, [activeTool]);


  const activateLineTool = (tool: LinePageTool) => {
    setLineToolVariant(tool);
    setActiveToolAndTab(tool);
  };

  const activateHatchTool = (mode: HatchDrawMode) => {
    setHatchDrawMode(mode);
    setActiveToolAndTab("hatch");
  };

  // Per-tool settings (live in workspace state; persist could come later).
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    select: { multi: false, marqueeMode: "click" },
    guide: { color: "#4DA3FF", strokeWidth: 1, locked: false },
    line: { color: "#111111", thicknessMm: 0.19, alpha: 100 },
    text: {
      fontSize: 11,
      color: "#111111",
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      lineHeightPct: 105,
      alpha: 100,
      align: "left" as "left" | "center" | "right",
      bgColor: "#ffffff",
      bgAlphaPct: 0,
      wrap: false,
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

  // Auto-open das „CAD-Blatt"-Werkzeug, sobald ein platziertes CAD-Blatt
  // (cad-view / cad-viewport) angeklickt wird. Maßstab, Aktualisieren usw.
  // werden ausschließlich dort verwaltet — kein separates Viewport-Inspektor-
  // Panel mehr.
  useEffect(() => {
    if (!selectedElement) {
      // Deselektiert → wenn CAD-Blatt-Werkzeug offen war, zurück auf Auswahl.
      if (activeTool === "cad") setActiveTool(null);
      return;
    }
    const isCadViewport = selectedElement.kind === "cad-view" || selectedElement.kind === "cad-viewport";
    if (isCadViewport) {
      if (activeTool !== "cad") setActiveTool("cad");
      setPrintMode(false);
      setRightTabState("tools");
    } else if (activeTool === "cad") {
      // Wechsel zu Nicht-CAD-Element → CAD-Blatt-Werkzeug schließen,
      // damit der normale Element-Inspektor wieder erscheint.
      setActiveTool(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElement?.id, selectedElement?.kind]);

  // Zentriert das Blatt exakt im Viewport (misst das gerenderte Blatt, damit
  // Zoom-Änderungen im selben Frame korrekt berücksichtigt werden).
  const centerActiveSheet = () => {
    const v = canvasViewportRef.current;
    if (!v) return;
    const pages = Array.from(v.querySelectorAll<HTMLElement>("[data-page-id]"));
    const el = pages.find((page) => page.dataset.pageId === activePage?.id) ?? pages[0] ?? null;
    if (el) {
      const vr = v.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      v.scrollLeft = Math.max(0, v.scrollLeft + (er.left + er.width / 2) - (vr.left + vr.width / 2));
      v.scrollTop = Math.max(0, v.scrollTop + (er.top + er.height / 2) - (vr.top + vr.height / 2));
    } else {
      v.scrollLeft = Math.max(0, (v.scrollWidth - v.clientWidth) / 2);
      v.scrollTop = Math.max(0, (v.scrollHeight - v.clientHeight) / 2);
    }
  };
  /** Zentriert über mehrere Frames — Layout/Zoom brauchen ein bis zwei Ticks. */
  const centerActiveSheetSoon = () => {
    requestAnimationFrame(() => {
      centerActiveSheet();
      requestAnimationFrame(() => {
        centerActiveSheet();
        setTimeout(centerActiveSheet, 60);
      });
    });
  };

  const resetZoomAndCenter = () => {
    if (wheelRafRef.current) {
      cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = 0;
    }
    wheelStepRef.current = 0;
    wheelBurstRef.current = { ...EMPTY_WHEEL_ZOOM_BURST };
    wheelAnchorRef.current = null;
    zoomAnchorRef.current = null;
    zoomRef.current = 100;
    setZoom(100);
    centerActiveSheetSoon();
  };

  // Beim ersten Anzeigen: komplettes Blatt mittig, leicht rausgezoomt.
  useLayoutEffect(() => {
    if (didAutoFitRef.current) return;
    const vp = canvasViewportRef.current;
    if (!vp || !activePage) return;
    const w = vp.clientWidth, h = vp.clientHeight;
    if (w < 80 || h < 80) return;
    const fmt = getPageSizeMm(activePage);
    const aspect = fmt.wMm / fmt.hMm;
    const pageW = 1100;
    const pageH = pageW / aspect;
    const fit = Math.min(w / pageW, h / pageH) * 100 * 0.88;
    setZoom(clampProjectZoom(fit));
    didAutoFitRef.current = true;
    centerActiveSheetSoon();
  });


  // Legt die importierten Seiten mit dem aktuell im rechten Panel
  // gewählten Maßstab (docScale, z. B. "1:100") direkt im Modellbereich ab.
  // Kein Modal mehr — der Nutzer wählt den Maßstab wie beim CAD-Blatt vor
  // dem Import rechts über das Dropdown.
  const placeImportedPages = (pages: ImportedPage[], stacked = false) => {
    const engine = cadEngineApiRef.current?.engine;
    if (!engine || pages.length === 0) return;
    const m = docScale.match(/^1\s*:\s*(\d+(?:[.,]\d+)?)$/);
    const parsed = m ? parseFloat(m[1].replace(",", ".")) : NaN;
    let denom = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    const [first, ...rest] = pages;
    // "Frei platzieren": Maßstab so berechnen, dass die erste Seite mit ~30 %
    // Rand auf die aktive Seite passt. Wirkt für den gesamten Batch.
    if (docFreePlace && activePage) {
      const fmt = getPageSizeMm(activePage);
      const pageWm = (activePage.customWidthMm ?? fmt.wMm) / 1000;
      const pageHm = (activePage.customHeightMm ?? fmt.hMm) / 1000;
      const targetWm = pageWm * 0.7;
      const targetHm = pageHm * 0.7;
      const scaleW = first.widthM > 0 ? targetWm / first.widthM : denom;
      const scaleH = first.heightM > 0 ? targetHm / first.heightM : denom;
      const fit = Math.min(scaleW, scaleH);
      if (Number.isFinite(fit) && fit > 0) denom = fit;
    }
    const firstW = first.widthM * denom;
    const firstH = first.heightM * denom;
    setActiveToolAndTab("document");
    engine.beginDocumentPlacement({
      src: first.src,
      widthM: firstW,
      heightM: firstH,
      pixelWidth: first.pixelWidth,
      pixelHeight: first.pixelHeight,
      name: first.name,
      kind: first.kind,
      pageIndex: first.pageIndex,
      importScaleDenom: denom,
      pdfSourceB64: first.pdfSourceB64 || null,
    });
    // "Gesamt": alle Seiten leicht versetzt übereinander stapeln, damit sie
    // anschließend einzeln verschoben/positioniert werden können.
    const step = stacked ? Math.max(0.02, firstW * 0.04) : 0;
    let offX = stacked ? step : firstW + 0.5;
    let offY = 0;
    let i = 0;
    for (const p of rest) {
      i++;
      const pw = p.widthM * denom;
      const ph = p.heightM * denom;
      engine.scene.createDocument({
        name: p.name,
        kind: p.kind,
        src: p.src,
        pageIndex: p.pageIndex,
        position: { x: offX, y: offY },
        widthM: pw,
        heightM: ph,
        pixelWidth: p.pixelWidth,
        pixelHeight: p.pixelHeight,
        labelId: engine.activeDrawLabelId,
        importScaleDenom: denom,
        pdfSourceB64: p.pdfSourceB64 || null,
      });
      if (stacked) { offX = step * (i + 1); offY = step * (i + 1); }
      else offX += pw + 0.5;
    }
    engine.refreshLabelUI();
  };

  const importPickedFile = async (f: File) => {
    setDocImporting(true);
    try {
      const pages = await importFile(f);
      if (pages.length === 0) { window.alert("Keine Seiten gefunden."); return; }
      if (pages.length === 1) {
        placeImportedPages(pages);
      } else {
        setDocPickerSelected(new Set([0]));
        setDocPickerPages(pages);
      }
    } catch (err: any) {
      window.alert("Dokument-Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      setDocImporting(false);
    }
  };

  const handleDocumentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await importPickedFile(f);
  };

  // Nach Rückkehr aus der CAD-Oberfläche: falls dort ein Zeichenblatt
  // übergeben wurde, fügen wir es als verknüpfte cad-view-Ansicht auf die
  // ursprünglich aktive Seite ein (kein statisches PDF). Die Ansicht kann
  // später über den "Aktualisieren"-Knopf im Inspector erneut aus der
  // aktuellen CAD-Zeichnung eingefroren werden. Größe/Position/Maßstab
  // bleiben dabei erhalten (Archicad-typisch).
  useEffect(() => {
    if (!projectId) return;
    const pending = popPendingSheetPdf(projectId);
    if (!pending) return;
    try {
      const targetPageId = pending.returnPageId || project?.pages[0]?.id;
      if (!targetPageId) return;
      const targetPage = project?.pages.find((p) => p.id === targetPageId);
      const fmt = targetPage
        ? getPageSizeMm(targetPage)
        : { wMm: FORMAT_SIZES["A3-quer"].w, hMm: FORMAT_SIZES["A3-quer"].h };
      const paperW = pending.paperWidthMm ?? 100;
      const paperH = pending.paperHeightMm ?? 100;
      const wPct = Math.max(2, Math.min(95, (paperW / fmt.wMm) * 100));
      const hPct = Math.max(2, Math.min(95, (paperH / fmt.hMm) * 100));
      const xPct = Math.max(0, (100 - wPct) / 2);
      const yPct = Math.max(0, (100 - hPct) / 2);
      const newElId = projectStore.addElement(projectId, targetPageId, {
        // Stufe 6: neue Einfügungen sind echte Paper-Space-Viewports
        // (Legacy-Datensätze mit kind "cad-view" bleiben rückwärtskompatibel).
        kind: "cad-viewport",
        sheetId: pending.sheetId,
        scale: pending.sheetScale,
        scaleDen: pending.scaleDen,
        modelCenterM: pending.modelCenterM,
        viewportRotationDeg: pending.viewportRotationDeg ?? 0,
        viewSnapshot: pending.snapshotPng,
        lastSyncAt: new Date().toISOString(),
        x: xPct,
        y: yPct,
        w: wPct,
        h: hPct,
        // Referenz für automatische Rahmen-Recompute nach Maßstabs­änderungen.
        basePaperMm: { w: paperW, h: paperH },
        baseScaleDen: pending.scaleDen,
        // Neue CAD-Blätter landen zunächst auf der Ebene "Default".
        labelId: Defaults.defaultLabelId,
      });
      setActivePageId(targetPageId);
      // Direkt zur Weiterbearbeitung auswählen (Werkzeug-Einstellungen öffnen sich).
      if (newElId) setSelectedElementIds([newElId]);
    } catch (err: any) {
      window.alert("Einfügen des CAD-Blatts fehlgeschlagen: " + (err?.message || err));
    }
  }, [projectId]);


  const confirmDocumentPagePicker = (mode: "single" | "all") => {
    if (!docPickerPages) return;
    const all = docPickerPages;
    const idx = docPickerSelected.values().next().value ?? 0;
    setDocPickerPages(null);
    setDocPickerSelected(new Set());
    if (mode === "all") placeImportedPages(all, true);
    else placeImportedPages([all[idx]]);
  };


  // Merkt sich das zuletzt eingepasste Layout — verhindert erneutes Recenter
  // beim Umschalten der aktiven Seite innerhalb desselben Verbunds.
  const lastFitKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!activePage || !canvasViewportRef.current) return;
    // Innerhalb eines Verbunds identifiziert die spreadId das gemeinsame Layout;
    // Einzelseiten werden per pageId identifiziert.
    const fitKey = `${activePage.spreadId ?? activePage.id}|${activePage.format}|${activePage.customWidthMm ?? ""}x${activePage.customHeightMm ?? ""}`;
    if (lastFitKeyRef.current === fitKey) return;
    lastFitKeyRef.current = fitKey;
    const fitPage = () => {
      const fmt = getPageSizeMm(activePage);
      const baseWidth = 1100;
      const baseHeight = baseWidth / (fmt.wMm / fmt.hMm);
      const box = canvasViewportRef.current!;
      const nextZoom = Math.max(10, Math.min(100, Math.floor(Math.min(
        ((box.clientWidth - 96) / baseWidth) * 100,
        ((box.clientHeight - 96) / baseHeight) * 100,
      ))));
      setZoom(nextZoom);
      centerActiveSheetSoon();
    };
    fitPage();
  }, [activePage?.id, activePage?.spreadId, activePage?.format]);


  // Löscht die aktuelle Auswahl — funktioniert für Seiten-Elemente wie auch
  // für die eingebettete CAD-Auswahl. Wird sowohl vom Papierkorb-Button im
  // Header als auch vom Entf-Shortcut ausgelöst.
  const runDeleteSelection = () => {
    if (!project) return;
    let did = false;
    if (selectedElementIds.length > 0) {
      const idSet = new Set(selectedElementIds);
      // Marquee-Auswahl kann Elemente aus mehreren Seiten (Spread) enthalten —
      // wir suchen die Trägerseite jedes Elements und löschen dort.
      for (const pg of project.pages) {
        for (const el of pg.elements) {
          if (idSet.has(el.id)) {
            projectStore.deleteElement(project.id, pg.id, el.id);
            did = true;
          }
        }
      }
      setSelectedElementIds([]);
    }
    const eng = cadEngineApiRef.current?.engine;
    if (eng && (eng as any).hasDeletableSelection?.()) {
      (eng as any).deleteSelection?.();
      did = true;
    }
    return did;
  };

  // ---- Kopieren / Einfügen von Seiten-Elementen -------------------------
  const elementClipboardRef = useRef<any[]>([]);
  const clipSourceRef = useRef<"cad" | "elements" | null>(null);
  const [canPasteElements, setCanPasteElements] = useState(false);

  const runCopySelection = () => {
    const eng = cadEngineApiRef.current?.engine as any;
    if (eng?.hasCopyableSelection?.() && eng.copySelection?.()) {
      clipSourceRef.current = "cad";
      setCanPasteElements(true);
      return true;
    }
    if (!project || selectedElementIds.length === 0) return false;
    const idSet = new Set(selectedElementIds);
    const snaps: any[] = [];
    for (const pg of project.pages) {
      for (const el of pg.elements) {
        if (idSet.has(el.id)) snaps.push(JSON.parse(JSON.stringify(el)));
      }
    }
    if (snaps.length === 0) return false;
    elementClipboardRef.current = snaps;
    clipSourceRef.current = "elements";
    setCanPasteElements(true);
    return true;
  };

  const runPasteClipboard = () => {
    const eng = cadEngineApiRef.current?.engine as any;
    if (clipSourceRef.current !== "elements" && eng?.hasClipboard?.() && eng.pasteClipboard?.()) return true;
    if (!project || !activePage) return false;
    const snaps = elementClipboardRef.current;
    if (!snaps || snaps.length === 0) return false;
    const newIds: string[] = [];
    for (const snap of snaps) {
      const { id: _omit, ...rest } = snap as any;
      const clone: any = { ...rest };
      if (typeof clone.x === "number") clone.x = Math.max(0, Math.min(98, clone.x + 2));
      if (typeof clone.y === "number") clone.y = Math.max(0, Math.min(98, clone.y + 2));
      if (Array.isArray(clone.points)) {
        clone.points = clone.points.map((pt: any) =>
          pt && typeof pt === "object"
            ? { ...pt, x: (pt.x ?? 0) + 2, y: (pt.y ?? 0) + 2 }
            : pt
        );
      }
      const nid = projectStore.addElement(project.id, activePage.id, clone);
      if (nid) newIds.push(nid);
    }
    if (newIds.length > 0) setSelectedElementIds(newIds);
    return newIds.length > 0;
  };


  // Shift+C / Shift+V (und Strg+C / Strg+V) für Seiten-Elemente.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return;
      const mod = e.shiftKey !== (e.ctrlKey || e.metaKey); // genau eine Variante
      if (!mod) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "c") { if (runCopySelection()) e.preventDefault(); }
      else if (k === "v") { if (runPasteClipboard()) e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds, activePage?.id, project?.id]);

  // Entf-Shortcut auf Fenster-Ebene: nur reagieren, wenn kein Textfeld fokussiert
  // ist und tatsächlich etwas ausgewählt ist. So bleibt der Trash-Button 1:1
  // per Tastatur bedienbar (Projektmappe und CAD gleichermaßen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Läuft eine Vorschau-Aktion (Verschieben/Drehen/Trimmen)? Dann bricht
      // ENTF/ESC diese immer sofort ab und verwirft alle Vorschau-Änderungen.
      if (runActiveAborts()) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key !== "Delete") return;
      if (selectedElementIds.length === 0 && cadSelectionCount === 0) return;
      // Wenn ausschließlich CAD-Auswahl existiert, überlassen wir es dem
      // MiniCad-eigenen Handler (der bereits den passenden Scene-Kontext hat).
      if (selectedElementIds.length === 0) return;
      e.preventDefault();
      runDeleteSelection();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementIds, cadSelectionCount, activePage?.id, project?.id]);

  // Undo / Redo Shortcuts (Ctrl/Cmd+Z, Ctrl+Shift+Z / Ctrl+Y).
  useEffect(() => {
    if (!project?.id) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); projectStore.undo(project.id); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); projectStore.redo(project.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project?.id]);

  // Gesten-Grenzen für die Historie: jede abgeschlossene Interaktion (Maus/Stift
  // losgelassen, Enter/Escape/Entf, Werkzeugwechsel) versiegelt den aktuellen
  // Undo-Schritt. So ergibt jede einzelne Aktion – auch Text, Trim und
  // Move/Rotate über mehrere Frames – genau einen sauberen Undo-Eintrag.
  useEffect(() => {
    if (!project?.id) return;
    const pid = project.id;
    const seal = () => projectStore.sealHistory(pid);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === "Delete") seal();
    };
    window.addEventListener("pointerup", seal, true);
    window.addEventListener("pointercancel", seal, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", seal);
    return () => {
      window.removeEventListener("pointerup", seal, true);
      window.removeEventListener("pointercancel", seal, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", seal);
    };
  }, [project?.id]);

  // Werkzeugwechsel beendet ebenfalls die laufende Geste.
  useEffect(() => {
    if (project?.id) projectStore.sealHistory(project.id);
  }, [activeTool, project?.id]);


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
    <TableModifyContext.Provider value={tableModifyMode}>
    <TableFormulaPickContext.Provider value={{ fn: tableFormulaFn, setFn: setTableFormulaFn }}>
    <>
    <div
      className="flex flex-col h-[100dvh] w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
    >
      <WorkspaceHeader
        projectId={project.id}
        projectName={project.name}
        
        mode="workspace"
        zoomPercent={Math.round(zoom)}
        canUndo={hist.canUndo}
        canRedo={hist.canRedo}
        onUndo={() => projectStore.undo(project.id)}
        onRedo={() => projectStore.redo(project.id)}
        canDelete={selectedElementIds.length > 0 || cadSelectionCount > 0}
        onDelete={runDeleteSelection}
        canCopy={selectedElementIds.length > 0 || cadSelectionCount > 0}
        onCopy={runCopySelection}
        canPaste={canPasteElements}
        onPaste={runPasteClipboard}
        onPresent={() => setPresenting(true)}
        onShare={() => {}}
        onExport={() => setPrintMode((v) => !v)}
        mappeHelpOn={mappeHelpOn}
        onToggleMappeHelp={() => projectStore.setMappeHelpOn(project.id, !mappeHelpOn)}
        tabletAidOn={tabletAidOn}
        onToggleTabletAid={() => setTabletAidOn((v) => !v)}
      />
      {templateKey && templateInfo && (
        <div
          className="flex items-center gap-3 px-4 py-2 border-b"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--muted))" }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/project/${projectId}/finance?node=${templateBackNode}`)}
              className="h-9 px-4 rounded-lg text-sm font-semibold"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
            >
              Speichern
            </button>
            <button
              onClick={() => navigate(`/project/${projectId}/finance?node=${templateBackNode}`)}
              className="h-9 px-3 rounded-lg border text-sm font-medium hover:bg-background"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              Abbrechen
            </button>
            <button
              onClick={() => {
                const pages = (rawProject?.pages ?? []).filter((pg) => pg.templateKey === templateKey);
                setFavoriteTemplate(projectId!, templateInfo.type, pages.map((pg) => ({ ...pg, id: "", templateKey: undefined })));
              }}
              className="h-9 px-3 rounded-lg border text-sm font-medium flex items-center gap-1.5 hover:bg-background"
              style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}
              title={`Als Favorit-Vorlage für neue ${templateLabel}e speichern`}
            >
              <Star size={15} /> Favorit
            </button>
          </div>
          <div className="text-sm font-semibold">
            {templateLabel}-Vorlage bearbeiten
            <span className="ml-2 text-xs font-normal" style={{ color: "hsl(var(--ink-soft))" }}>
              Nur die Vorlagenseiten sind sichtbar und werden exportiert.
            </span>
          </div>
        </div>
      )}
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
          icon={<Eraser size={18} />}
          label="Radierer"
          active={activeTool === "eraser"}
          onClick={() => setActiveToolAndTab(activeTool === "eraser" ? null : "eraser")}
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

        <div className="relative w-full flex justify-center">
          <ToolRailButton
            icon={<MousePointer2 size={18} />}
            label="Auswahl"
            active={activeTool === null}
            onClick={() => {
              setLineToolFlyoutOpen(false);
              setHatchToolFlyoutOpen(false);
              if (activeTool !== null) {
                setActiveTool(null);
                setSelectToolFlyoutOpen(true);
              } else {
                setSelectToolFlyoutOpen((open) => !open);
              }
            }}
          />
          {selectToolFlyoutOpen && (
            <div
              className="absolute top-0 left-full ml-1 flex flex-col gap-0.5 p-1 rounded-lg shadow-lg z-40"
              style={{
                background: "hsl(var(--surface-card))",
                border: "1px solid hsl(var(--hairline))",
              }}
            >
              <ToolRailButton
                icon={<MousePointer2 size={18} />}
                label="Klick"
                active={activeTool === null && toolSettings.select.marqueeMode === "click"}
                onClick={() => {
                  updateToolSettings("select", { marqueeMode: "click" });
                  setActiveTool(null);
                  setSelectToolFlyoutOpen(false);
                }}
                showLabel
              />
              <ToolRailButton
                icon={<SquareDashed size={18} />}
                label="Berühren"
                active={activeTool === null && toolSettings.select.marqueeMode === "touch"}
                onClick={() => {
                  updateToolSettings("select", { marqueeMode: "touch" });
                  setActiveTool(null);
                  setSelectToolFlyoutOpen(false);
                }}
                showLabel
              />
              <ToolRailButton
                icon={<BoxSelect size={18} />}
                label="Umschließen"
                active={activeTool === null && toolSettings.select.marqueeMode === "enclose"}
                onClick={() => {
                  updateToolSettings("select", { marqueeMode: "enclose" });
                  setActiveTool(null);
                  setSelectToolFlyoutOpen(false);
                }}
                showLabel
              />
            </div>
          )}
        </div>
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
            icon={<Square size={18} />}
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
          icon={<FileImage size={18} />}
          label="Dokument"
          active={activeTool === "document"}
          showLabel
          onClick={() => setActiveToolAndTab(activeTool === "document" ? null : "document")}
        />
        <input
          ref={documentFileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={handleDocumentFileChange}
        />
        {docPickerPages && (
          <DocumentPagePickerDialog
            pages={docPickerPages}
            selectedIndex={docPickerSelected.values().next().value ?? 0}
            onSelect={(i) => setDocPickerSelected(new Set([i]))}
            onCancel={() => setDocPickerPages(null)}
            onConfirm={confirmDocumentPagePicker}
          />
        )}
        {docLibraryOpen && projectId && (
          <ProjectFilePickerDialog
            projectId={projectId}
            onCancel={() => setDocLibraryOpen(false)}
            onPick={(f) => { setDocLibraryOpen(false); void importPickedFile(f); }}
          />
        )}
        {/* Maßstab-Modal entfernt — Maßstab wird jetzt rechts im "Dokument"-
            Werkzeug-Panel per Dropdown vor dem Import gewählt. */}

        {/* Tabellen-Werkzeug in der Projektmappe entfernt. */}


        

        <div className="mt-auto flex flex-col items-center gap-1">
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
                  // Spread-Kontext berechnen: gehört pg zu einem Spread mit ≥ 2 Mitgliedern?
                  const spreadId = pg.spreadId;
                  const spreadMembers = spreadId
                    ? project.pages
                        .filter((x) => x.spreadId === spreadId)
                        .sort((a, b) => (a.spreadIndex ?? 0) - (b.spreadIndex ?? 0))
                    : [];
                  const inSpread = spreadMembers.length >= 2;
                  const spreadPosIdx = inSpread ? spreadMembers.findIndex((x) => x.id === pg.id) : -1;
                  const isFirstInSpread = inSpread && spreadPosIdx === 0;
                  const isLastInSpread = inSpread && spreadPosIdx === spreadMembers.length - 1;
                  const collapsed = inSpread ? !!spreadMembers[0].spreadCollapsed : false;
                  // Wenn Spread eingeklappt ist: nur die erste Seite (mit Chip „+N") zeigen.
                  if (inSpread && collapsed && !isFirstInSpread) return null;
                  // „Nächste Seite" für Link-Button.
                  const nextPage = project.pages[idx + 1];
                  const canLinkToNext = nextPage && !inSpread && !nextPage.spreadId;
                  const canLinkAppend = nextPage && inSpread && isLastInSpread && !nextPage.spreadId;

                  return (
                    <div key={pg.id} className="flex gap-1.5">
                      {/* Spread-Verbindungsbalken links */}
                      <div className="w-[6px] shrink-0 relative flex flex-col items-center">
                        {inSpread && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              projectStore.setSpreadCollapsed(project.id, spreadId!, !collapsed);
                            }}
                            title={collapsed ? `Verbund öffnen (${spreadMembers.length} Seiten)` : "Verbund einklappen"}
                            className="absolute inset-0 w-full h-full rounded"
                            style={{
                              background: collapsed
                                ? "hsl(var(--accent-gold) / 0.35)"
                                : "hsl(var(--accent-gold) / 0.7)",
                              // In geklapptem Zustand: gesamter Balken. Sonst
                              // Ober/Unter-Radius nur an den Enden des Spreads.
                              borderTopLeftRadius: isFirstInSpread || collapsed ? 4 : 0,
                              borderTopRightRadius: isFirstInSpread || collapsed ? 4 : 0,
                              borderBottomLeftRadius: isLastInSpread || collapsed ? 4 : 0,
                              borderBottomRightRadius: isLastInSpread || collapsed ? 4 : 0,
                            }}
                          />
                        )}
                      </div>
                      <div
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
                            setPageActionsSticky((v) => !v);
                            return;
                          }
                          setActivePageId(pg.id);
                          setSelectedElementId(undefined);
                          setSelectedCadTool(undefined);
                          setPageActionsSticky(false);
                        }}
                        className="group flex-1 min-w-0 text-left rounded-lg p-2 flex gap-2.5 transition cursor-pointer"
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
                          className="w-12 h-9 rounded shrink-0 border relative"
                          style={{ background: "white", borderColor: "hsl(var(--hairline))" }}
                        >
                          {inSpread && isFirstInSpread && collapsed && (
                            <span
                              className="absolute -right-1 -top-1 h-4 min-w-4 px-1 rounded-full text-[9px] font-semibold flex items-center justify-center"
                              style={{ background: "hsl(var(--accent-gold))", color: "white" }}
                              title={`${spreadMembers.length} Seiten im Verbund`}
                            >
                              +{spreadMembers.length - 1}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1">
                              <span>{String(idx + 1).padStart(2, "0")}</span>
                              {inSpread && (
                                <BookOpen size={9} className="opacity-70" />
                              )}
                            </span>
                            {!isRenaming && (
                              <span
                                className={`flex items-center gap-1 transition ${
                                  showActions ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                }`}
                              >
                                {(canLinkToNext || canLinkAppend) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (canLinkAppend) {
                                        projectStore.addPageToSpread(project.id, spreadId!, nextPage!.id);
                                      } else if (canLinkToNext) {
                                        projectStore.linkPagesToSpread(project.id, [pg.id, nextPage!.id]);
                                      }
                                    }}
                                    title="Mit nächster Seite verbinden"
                                    className="hover:text-foreground"
                                  >
                                    <Link2 size={11} />
                                  </button>
                                )}
                                {inSpread && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      projectStore.removePageFromSpread(project.id, pg.id);
                                    }}
                                    title="Aus Verbund lösen"
                                    className="hover:text-destructive"
                                  >
                                    <Link2Off size={11} />
                                  </button>
                                )}
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
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBgOverlay((o) => ({ ...o, tintEnabled: !o.tintEnabled }))}
                    className="text-[11px] px-1.5 py-0.5 rounded border"
                    style={{
                      borderColor: "hsl(var(--hairline))",
                      background: bgOverlay.tintEnabled ? "transparent" : "hsl(var(--accent-gold-soft))",
                      color: bgOverlay.tintEnabled ? "hsl(var(--ink-soft))" : "hsl(var(--accent-gold))",
                    }}
                    title={bgOverlay.tintEnabled ? "Zurzeit eingefärbt — Klick zeigt Originalfarben" : "Zurzeit Originalfarben — Klick färbt ein"}
                  >
                    {bgOverlay.tintEnabled ? "Farbe: Tint" : "Farbe: Original"}
                  </button>
                  <input
                    type="color"
                    value={bgOverlay.color}
                    disabled={!bgOverlay.tintEnabled}
                    onChange={(e) => setBgOverlay((o) => ({ ...o, color: e.target.value }))}
                    className="h-6 w-8 rounded border cursor-pointer bg-transparent disabled:opacity-40"
                    style={{ borderColor: "hsl(var(--hairline))" }}
                    title="Tintfarbe der Transparenzpause"
                  />
                  <button
                    type="button"
                    onClick={() => setBgOverlay((o) => ({ ...o, color: "#ffffff" }))}
                    className="text-[11px] text-muted-foreground underline"
                    title="Farbe zurücksetzen"
                  >
                    Reset
                  </button>
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
            // Optik wie in der CAD-Oberfläche beim Plandruck: mittelgrauer
            // Hintergrund, das weiße Blatt hebt sich per Schatten ab.
            style={{ background: presenting ? "hsl(var(--surface))" : "hsl(220 9% 46%)" }}
          >
            <div
              ref={canvasViewportRef}
              className="flex-1 overflow-hidden relative"
              style={{ touchAction: "pan-x pan-y" }}
              onPointerDown={(e) => {
                // Pan nur via Mittelmaus oder Alt+Links — sonst würde ein Links-Klick
                // im Auswahlmodus die Auswahl der eingebetteten CAD-Engine abfangen.
                const isMiddle = e.button === 1 || (e.button === 0 && (e as any).altKey);
                if (!isMiddle) return;
                e.preventDefault();
                try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
                const container = e.currentTarget as HTMLDivElement;
                const startX = e.clientX;
                const startY = e.clientY;
                const startScrollL = container.scrollLeft;
                const startScrollT = container.scrollTop;
                const prevCursor = container.style.cursor;
                container.style.cursor = "grabbing";
                const onMove = (ev: PointerEvent) => {
                  container.scrollLeft = startScrollL - (ev.clientX - startX);
                  container.scrollTop = startScrollT - (ev.clientY - startY);
                };
                const onUp = (ev: PointerEvent) => {
                  try { container.releasePointerCapture(ev.pointerId); } catch {}
                  container.style.cursor = prevCursor;
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                  window.removeEventListener("pointercancel", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
                window.addEventListener("pointercancel", onUp);
              }}
            >


              {activePage && (() => {
                // Wenn die aktive Seite Teil eines Spreads mit ≥2 Mitgliedern
                // ist, alle Mitglieder nebeneinander rendern; sonst nur die
                // aktive Seite (bisheriges Verhalten).
                const spreadMembers = activePage.spreadId
                  ? project.pages
                      .filter((p) => p.spreadId === activePage.spreadId)
                      .sort((a, b) => (a.spreadIndex ?? 0) - (b.spreadIndex ?? 0))
                  : [];
                const pages = spreadMembers.length >= 2 ? spreadMembers : [activePage];
                const layoutMode = spreadMembers.length >= 2 ? (spreadMembers[0].spreadLayoutMode ?? "grid") : "grid";

                const handleSelect = (id?: string, opts?: { shift?: boolean }) => {
                  if (!id) { setSelectedElementIds([]); return; }
                  const multi = toolSettings.select.multi || !!opts?.shift;
                  setSelectedElementIds((prev) => {
                    if (!multi) return [id];
                    const idx = prev.indexOf(id);
                    if (opts?.shift && idx >= 0) return prev.filter((x) => x !== id);
                    const rest = prev.filter((x) => x !== id);
                    // Das ZUERST gewählte Objekt bleibt führend (= letzter Eintrag).
                    // Weitere Objekte werden davor eingereiht, damit Anker,
                    // Verschieben und Drehen am ersten Objekt bestehen bleiben.
                    if (opts?.shift && rest.length > 0) return [id, ...rest];
                    return [...rest, id];
                  });

                  setSelectedCadTool(undefined);
                  setRightTab("tools");
                };
                const handleCadSelection: React.ComponentProps<typeof PageCanvas>["onCadSelectionChange"] = (info, count) => {
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
                    if (info.isGuide) {
                      // Hilfslinien haben ein eigenes Einstellungs-Set — sie dürfen
                      // die Default-Linienfarbe des Linienwerkzeugs nicht überschreiben.
                      setSelectedCadTool("guide");
                      updateToolSettings("guide", { color: info.color });
                    } else {
                      updateToolSettings("line", {
                        color: info.color,
                        thicknessMm: info.thicknessMm,
                        alpha: info.alpha,
                      });
                    }
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
                };

                if (pages.length === 1) {
                  const p = pages[0];
                  return (
                    <PageCanvas
                      projectId={project.id}
                      page={p}
                      overlayPage={bgOverlay.visible ? bgPage : undefined}
                      overlayOpacity={bgOverlay.opacity}
                      overlayColor={bgOverlay.tintEnabled ? bgOverlay.color : undefined}
                      selectedElementId={selectedElementId}
                      zoom={zoom}
                      activeTool={activeTool}
                      hatchDrawMode={hatchDrawMode}
                      toolSettings={toolSettings}
                      onCommitTool={() => setActiveTool(null)}
                      selectedElementIds={selectedElementIds}
                      onSelect={handleSelect}
                      onMultiSelect={(ids) => { setSelectedElementIds(ids); setSelectedCadTool(undefined); setRightTab("tools"); }}
                      onCadSelectionChange={handleCadSelection}
                      onCadEngineReady={(api) => attachCadEngine(api)}
                      onJumpCad={(sheetId) => navigate(`/project/${project.id}/cad${sheetId ? `/${sheetId}` : ""}`)}
                    />

                  );
                }

                // Spread mit ≥2 Seiten — als flex-row rendern.
                // Free-Layout: absolute Positionierung anhand spreadOffset (mm → px).
                const isFree = layoutMode === "free";
                // Einheitlicher px/mm-Faktor für alle Free-Layout-Offsets, damit
                // Kanten benachbarter Seiten wirklich passgenau snappen.
                const refFmt = getPageSizeMm(pages[0]);
                const pxPerMm = (1100 / refFmt.wMm) * (zoom / 100);
                return (
                  <div
                    className="min-h-full flex items-start justify-start"
                    style={{ padding: "200vh 200vw" }}

                  >
                    <div
                      className={isFree ? "relative" : "flex items-start"}
                      style={isFree ? { minWidth: 800, minHeight: 400 } : undefined}
                    >
                      {isFree && (() => {
                        const locked = !!pages[0].spreadLayoutLocked;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              projectStore.setSpreadLayoutLocked(
                                project.id,
                                pages[0].spreadId!,
                                !locked,
                              )
                            }
                            title={locked ? "Anordnung gesperrt — Klick zum Entsperren" : "Anordnung sperren"}
                            className="absolute -top-8 left-0 z-30 h-7 px-2 rounded-md flex items-center gap-1.5 text-[11px] font-medium shadow-md"
                            style={{
                              background: locked ? "hsl(var(--accent-gold))" : "hsl(var(--surface-card))",
                              color: locked ? "white" : "hsl(var(--ink))",
                              border: "1px solid hsl(var(--hairline))",
                            }}
                          >
                            {locked ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
                            {locked ? "Gesperrt" : "Sperren"}
                          </button>
                        );
                      })()}
                      {pages.map((p, i) => {
                        const isActiveMember = p.id === activePage.id;
                        const offset = isFree
                          ? (p.spreadOffset ?? { xMm: i * 20, yMm: 0 })
                          : { xMm: 0, yMm: 0 };
                        const style: React.CSSProperties = isFree
                          ? {
                              position: "absolute",
                              left: `${offset.xMm * pxPerMm}px`,
                              top: `${offset.yMm * pxPerMm}px`,
                            }
                          : {};
                        return (
                          <div
                            key={p.id}
                            style={{
                              ...style,
                              outline: isActiveMember && pages.length > 1 ? "2px solid hsl(var(--accent-gold) / 0.6)" : undefined,
                              outlineOffset: -1,
                            }}
                            onClickCapture={(e) => {
                              // Klick in fremdes Spread-Mitglied → aktivieren.
                              if (!isActiveMember) {
                                setActivePageId(p.id);
                              }
                              void e;
                            }}
                          >
                            {isFree && !p.spreadLayoutLocked && (
                              <SpreadPageDragHandle
                                page={p}
                                otherPages={pages.filter((x) => x.id !== p.id)}
                                pxPerMm={pxPerMm}
                                projectId={project.id}
                                formatSizes={FORMAT_SIZES}
                              />
                            )}
                            <PageCanvas
                              projectId={project.id}
                              page={p}
                              overlayPage={undefined}
                              overlayOpacity={0}
                              selectedElementId={isActiveMember ? selectedElementId : undefined}
                              zoom={zoom}
                              activeTool={isActiveMember ? activeTool : null}
                              hatchDrawMode={hatchDrawMode}
                              toolSettings={toolSettings}
                              onCommitTool={() => setActiveTool(null)}
                              selectedElementIds={isActiveMember ? selectedElementIds : []}
                              onSelect={handleSelect}
                              onCadSelectionChange={isActiveMember ? handleCadSelection : () => {}}
                              onCadEngineReady={isActiveMember
                                ? (api) => attachCadEngine(api)
                                : undefined}
                              bare
                              onJumpCad={(sheetId) => navigate(`/project/${project.id}/cad${sheetId ? `/${sheetId}` : ""}`)}
                            />

                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
            {mappeHelpOn && !presenting && !printMode && (
              <MappeHelpOverlay
                guideActive={activeTool === "guide"}
                lineActive={isLinePageTool(activeTool)}
                hatchActive={activeTool === "hatch"}
                textActive={activeTool === "text"}
                multiSelectActive={selectedElementIds.length > 1}
              />
            )}
            <ZoomBar zoom={zoom} setZoom={setZoomClamped} onResetZoom={resetZoomAndCenter} />
          </main>

          {/* Right inspector (collapsible) */}
          {rightOpen ? (
            printMode ? (
              <PrintPanel
                project={project}
                activePageId={activePage?.id ?? project.pages[0]?.id ?? ""}
                setActivePageId={setActivePageId}
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
              documentImporting={docImporting}
              onDocumentImport={() => documentFileInputRef.current?.click()}
              onDocumentLibrary={() => setDocLibraryOpen(true)}
              docScale={docScale}
              onDocScaleChange={setDocScale}
              docFreePlace={docFreePlace}
              onDocFreePlaceChange={setDocFreePlace}
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

              pendingTableId={pendingTableId}
              tableModifyMode={tableModifyMode}
              setTableModifyMode={setTableModifyMode}
              tableFormulaFn={tableFormulaFn}
              setTableFormulaFn={setTableFormulaFn}
              onConfirmTable={() => {
                setPendingTableId(null);
                setActiveTool(null);
              }}
              onCancelTable={() => {
                if (activePage && pendingTableId) {
                  projectStore.deleteElement(project.id, activePage.id, pendingTableId);
                }
                setPendingTableId(null);
                setSelectedElementId(undefined);
                setActiveTool(null);
                setTableModifyMode(false);
              }}

              onJumpCad={(sheetId) => navigate(`/project/${project.id}/cad${sheetId ? `/${sheetId}` : ""}`)}
              onCollapse={() => setRightOpen(false)}
              helpOn={mappeHelpOn}
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
    {presenting && project && (
      <PresenterOverlay
        pages={project.pages}
        initialIndex={Math.max(0, project.pages.findIndex((p) => p.id === activePageId))}
        projectId={project.id}
        onClose={() => setPresenting(false)}
        onSelectPage={(id) => setActivePageId(id)}
      />
    )}
    {tabletAidOn && <TabletAidWheel />}
    </>
    </TableFormulaPickContext.Provider>
    </TableModifyContext.Provider>
  );
}


function ToolRailButton({
  icon,
  label,
  active,
  accent,
  onClick,
  showLabel,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick?: () => void;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      title={disabled ? `${label} — noch nicht verfügbar` : label}
      disabled={disabled}
      data-active={active ? "true" : undefined}
      className="cad-rail-btn"
      style={{
        background: active ? "hsl(var(--surface-muted))" : "transparent",
        color: disabled
          ? "hsl(0 0% 75%)"
          : accent
          ? "hsl(var(--accent-gold))"
          : active
          ? "hsl(var(--accent-gold))"
          : "hsl(var(--ink-soft))",
        cursor: disabled ? "not-allowed" : undefined,
        opacity: disabled ? 0.55 : undefined,
      }}
    >
      {icon}
      <span className="leading-none">
        {showLabel ? label : label.length > 8 ? label.slice(0, 6) + "…" : label}
      </span>
    </button>
  );
}

function DocumentPagePickerDialog({
  pages,
  selectedIndex,
  onSelect,
  onCancel,
  onConfirm,
}: {
  pages: ImportedPage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCancel: () => void;
  onConfirm: (mode: "single" | "all") => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ background: "hsl(var(--ink) / 0.32)" }}>
      <div className="w-full max-w-2xl rounded-md border p-4 shadow-xl" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
        <div className="text-sm font-semibold mb-1">Seite auswählen</div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Dieses PDF hat {pages.length} Seiten. Wähle genau eine Seite — oder importiere das
          gesamte Dokument: alle Seiten werden leicht versetzt übereinander abgelegt.
        </p>
        <div className="max-h-[60vh] overflow-y-auto grid grid-cols-3 gap-3 p-1">
          {pages.map((p, i) => {
            const checked = selectedIndex === i;
            return (
              <button key={`${p.name}-${i}`} type="button" onClick={() => onSelect(i)} className="relative rounded-md border-2 overflow-hidden" style={{ borderColor: checked ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))" }}>
                <img src={p.src} alt={p.name} className="w-full h-32 object-contain" style={{ background: "hsl(var(--surface-muted))" }} />
                <div className="text-[10px] p-1 text-center truncate" style={{ background: "hsl(var(--surface-muted))" }}>Seite {i + 1}</div>
                {checked && <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface-card))" }}>✓</div>}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>Abbrechen</button>
          <button type="button" onClick={() => onConfirm("all")} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>Gesamtes Dokument ({pages.length} Seiten)</button>
          <button type="button" onClick={() => onConfirm("single")} className="h-8 px-3 rounded-md text-xs font-semibold" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface-card))" }}>Seite {selectedIndex + 1} importieren</button>
        </div>
      </div>
    </div>
  );
}

function DocumentScaleDialog({
  choice,
  custom,
  onChoice,
  onCustom,
  onCancel,
  onConfirm,
}: {
  choice: string;
  custom: string;
  onChoice: (value: string) => void;
  onCustom: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const options = [
    { v: "50", label: "1 : 50" },
    { v: "100", label: "1 : 100" },
    { v: "200", label: "1 : 200" },
    { v: "500", label: "1 : 500" },
    { v: "1", label: "1 : 1" },
    { v: "custom", label: "Frei…" },
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ background: "hsl(var(--ink) / 0.32)" }}>
      <div className="w-full max-w-sm rounded-md border p-4 shadow-xl" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
        <div className="text-sm font-semibold mb-3">Maßstab des Dokuments</div>
        <div className="grid grid-cols-3 gap-1.5">
          {options.map((opt) => {
            const active = choice === opt.v;
            return (
              <button key={opt.v} type="button" onClick={() => onChoice(opt.v)} className="rounded-md h-9 text-xs font-semibold border" style={{ background: active ? "hsl(var(--accent-gold))" : "hsl(var(--surface-muted))", color: active ? "hsl(var(--surface-card))" : "hsl(var(--ink))", borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))" }}>
                {opt.label}
              </button>
            );
          })}
        </div>
        {choice === "custom" && (
          <div className="flex items-center gap-2 pt-3">
            <span className="text-xs">1 :</span>
            <input value={custom} onChange={(e) => onCustom(e.target.value)} className="flex-1 h-8 px-2 rounded border bg-transparent text-xs" style={{ borderColor: "hsl(var(--hairline))" }} autoFocus />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>Abbrechen</button>
          <button type="button" onClick={onConfirm} className="h-8 px-3 rounded-md text-xs font-semibold" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface-card))" }}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}

/** Auswahl-Maßstäbe beim Ablegen eines CAD-Blatts in einen Plan. */
const PAGE_PLAN_SCALES: readonly string[] = ["1:1", "1:20", "1:50", "1:100", "1:200", "1:1000", "1:2000"] as const;

/** Öffnet einen kleinen Prompt-Dialog zur Maßstabs-Wahl. */
function askPlanScale(current?: string): string | null {
  const listed = PAGE_PLAN_SCALES.join(", ");
  const raw = window.prompt(
    `In welchem Maßstab soll das Blatt eingefügt werden?\n\nAuswahl: ${listed} (oder frei, z.B. "1:75")`,
    current || "1:100",
  );
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  // Normalisieren "1 : 75" → "1:75"
  const m = s.match(/^1\s*:\s*(\d+(?:[.,]\d+)?)$/);
  if (!m) { window.alert("Ungültiger Maßstab. Bitte im Format 1:100 eingeben."); return null; }
  return `1:${m[1].replace(",", ".")}`;
}

const PUNCH_PATTERNS: Record<Exclude<PunchPattern, "none">, { label: string; offsets: number[]; diameter: number }> = {
  // offsets are distances (mm) of each hole center measured from the start of the bound edge (page corner)
  "2-fach": { label: "2-fach (DIN 5005, 80 mm)", offsets: [-40, 40], diameter: 6 },
  "4-fach": { label: "4-fach (8/8/8 cm)", offsets: [-120, -40, 40, 120], diameter: 6 },
  "6-fach-a5": { label: "6-fach A5 Ringbuch", offsets: [-79, -47.5, -15.8, 15.8, 47.5, 79], diameter: 5.5 },
};

type ToolSettings = {
  select: { multi: boolean; marqueeMode: "touch" | "enclose" | "click" };
  guide: { color: string; strokeWidth: number; locked: boolean };
  line: { color: string; thicknessMm: number; alpha: number };
  text: {
    fontSize: number;
    color: string;
    bold: boolean;
    italic: boolean;
    alpha: number;
    underline: boolean;
    strike: boolean;
    lineHeightPct: number;
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

const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  select: { multi: false, marqueeMode: "click" },
  guide: { color: "#4DA3FF", strokeWidth: 1, locked: false },
  line: { color: "#111111", thicknessMm: 0.19, alpha: 100 },
  text: {
    fontSize: 11,
    color: "#111111",
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    lineHeightPct: 105,
    alpha: 100,
    align: "left",
    bgColor: "#ffffff",
    bgAlphaPct: 0,
    wrap: false,
    autoSize: true,
    borderEnabled: false,
    borderColor: "#111111",
    borderWidthPx: 1,
  },
};

/**
 * Kleiner Griff oben auf jeder Seite im Free-Spread-Modus.
 * Ermöglicht Ziehen der Seite in mm mit Snap zu Kanten benachbarter Seiten.
 */
function SpreadPageDragHandle({
  page,
  otherPages,
  pxPerMm,
  projectId,
  formatSizes,
}: {
  page: import("@/lib/projectStore").ProjectPage;
  otherPages: import("@/lib/projectStore").ProjectPage[];
  pxPerMm: number;
  projectId: string;
  formatSizes: typeof FORMAT_SIZES;
}) {
  const [dragging, setDragging] = useState(false);
  const [snapHint, setSnapHint] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const stateRef = useRef<{
    startClientX: number;
    startClientY: number;
    origXMm: number;
    origYMm: number;
  } | null>(null);

  const fmt = formatSizes[page.format];

  // Kanten der anderen Seiten (in mm, relativ zum Spread-Ursprung).
  const otherEdges = otherPages.map((op) => {
    const of = op.spreadOffset ?? { xMm: 0, yMm: 0 };
    const ofmt = formatSizes[op.format];
    return {
      xLeft: of.xMm,
      xRight: of.xMm + ofmt.w,
      yTop: of.yMm,
      yBottom: of.yMm + ofmt.h,
    };
  });

  const snap = (candXMm: number, candYMm: number) => {
    const thresholdMm = 6;
    const selfLeft = candXMm;
    const selfRight = candXMm + fmt.w;
    const selfTop = candYMm;
    const selfBottom = candYMm + fmt.h;
    let bestDx = Infinity, snapX = candXMm, hitX = false;
    let bestDy = Infinity, snapY = candYMm, hitY = false;
    for (const e of otherEdges) {
      const xTargets: [number, number][] = [
        [selfLeft, e.xLeft], [selfLeft, e.xRight],
        [selfRight, e.xLeft], [selfRight, e.xRight],
      ];
      for (const [self, target] of xTargets) {
        const d = target - self;
        if (Math.abs(d) < thresholdMm && Math.abs(d) < bestDx) {
          bestDx = Math.abs(d); snapX = candXMm + d; hitX = true;
        }
      }
      const yTargets: [number, number][] = [
        [selfTop, e.yTop], [selfTop, e.yBottom],
        [selfBottom, e.yTop], [selfBottom, e.yBottom],
      ];
      for (const [self, target] of yTargets) {
        const d = target - self;
        if (Math.abs(d) < thresholdMm && Math.abs(d) < bestDy) {
          bestDy = Math.abs(d); snapY = candYMm + d; hitY = true;
        }
      }
    }
    return { xMm: snapX, yMm: snapY, hitX, hitY };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const cur = page.spreadOffset ?? { xMm: 0, yMm: 0 };
    stateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      origXMm: cur.xMm,
      origYMm: cur.yMm,
    };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = stateRef.current;
    if (!st) return;
    const dxMm = (e.clientX - st.startClientX) / pxPerMm;
    const dyMm = (e.clientY - st.startClientY) / pxPerMm;
    const raw = { xMm: st.origXMm + dxMm, yMm: st.origYMm + dyMm };
    const snapped = snap(raw.xMm, raw.yMm);
    setSnapHint({ x: snapped.hitX, y: snapped.hitY });
    projectStore.setSpreadOffset(projectId, page.id, {
      xMm: snapped.xMm,
      yMm: snapped.yMm,
      rotationDeg: page.spreadOffset?.rotationDeg,
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    stateRef.current = null;
    setDragging(false);
    setSnapHint({ x: false, y: false });
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const cur = page.spreadOffset ?? { xMm: 0, yMm: 0 };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Ziehen, um Seite im Verbund zu verschieben (Snap zu Nachbarkanten)"
      className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 h-5 rounded-t-md text-[10px] font-medium select-none"
      style={{
        background: dragging ? "hsl(var(--accent-gold))" : "hsl(var(--ink))",
        color: "hsl(var(--surface))",
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
        boxShadow: (snapHint.x || snapHint.y) ? "0 0 0 2px hsl(var(--accent-gold))" : undefined,
      }}
    >
      <GripVertical size={10} />
      <span>{page.title}</span>
      {dragging && (
        <span className="ml-1 opacity-80">
          {cur.xMm.toFixed(0)},{cur.yMm.toFixed(0)}mm
        </span>
      )}
    </div>
  );
}



function PageCanvas({
  projectId,
  page,
  overlayPage,
  overlayOpacity,
  overlayColor,
  selectedElementId,
  selectedElementIds,
  zoom,
  activeTool,
  toolSettings,
  onCommitTool,
  onSelect,
  onMultiSelect,
  onCadSelectionChange,
  onCadEngineReady,
  hatchDrawMode,
  bare,
  onJumpCad,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
  overlayPage?: import("@/lib/projectStore").ProjectPage;
  overlayOpacity: number;
  overlayColor?: string;
  selectedElementId?: string;
  selectedElementIds: string[];
  zoom: number;
  activeTool: PageTool;
  toolSettings: ToolSettings;
  onCommitTool: () => void;
  onSelect: (id?: string, opts?: { shift?: boolean }) => void;
  onMultiSelect?: (ids: string[]) => void;
  onCadSelectionChange: (info: MiniCadSelectionInfo | null, count?: number) => void;
  onCadEngineReady?: (api: { setSelectedSegmentSnap: (opts: { midpointSnap?: boolean; divisionSnap?: number | null }) => void; duplicateSelectedSegments: (offsetMm?: number) => number; engine: import("@/cad/embed/MiniCad").MiniCad }) => void;
  hatchDrawMode?: HatchDrawMode;
  /** Wenn true, wird die 60vh/60vw-Padding-Hülle weggelassen (für Spread-Layouts). */
  bare?: boolean;
  /** Springt vom CAD-Blatt-Hub in den CAD-Editor. */
  onJumpCad?: (sheetId?: string) => void;
}) {


  const _pageSize = getPageSizeMm(page);
  const fmt = { w: _pageSize.wMm, h: _pageSize.hMm, label: FORMAT_SIZES[page.format]?.label ?? "" };
  const aspect = fmt.w / fmt.h;
  // The sheet is rendered at a FIXED real size (mm-defined). Zoom is a pure
  // view transform applied via CSS scale, like PowerPoint / CAD — page, holes,
  // margins, frame and strokes all scale together with the view.
  const baseWidth = MAPPE_PAGE_BASE_WIDTH_PX;
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
  /** Lokale Referenz auf die eingebettete CAD-Engine (für ESC-Stufen). */
  const localEngineRef = useRef<import("@/cad/embed/MiniCad").MiniCad | null>(null);

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

  // Rahmen-Auswahl (Marquee) auf freier Blattfläche — nur wenn Auswahl-
  // Werkzeug aktiv ist. Modus kommt aus toolSettings.select.marqueeMode:
  //   "touch"   → alle Objekte, die den Rahmen berühren
  //   "enclose" → nur Objekte, die vollständig im Rahmen liegen
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeMode = toolSettings.select.marqueeMode;

  const handlePagePointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    if (activeTool !== null) { onSelect(undefined); return; }
    if (e.button !== 0) { onSelect(undefined); return; }
    // Klick-Modus: kein Rahmen, nur Deselektion beim Klick ins Leere.
    if (marqueeMode === "click") { onSelect(undefined); return; }
    const start = toPct(e.clientX, e.clientY);
    setMarquee({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
    let dragged = false;
    const onMove = (ev: PointerEvent) => {
      const cur = toPct(ev.clientX, ev.clientY);
      if (Math.abs(cur.x - start.x) > 0.3 || Math.abs(cur.y - start.y) > 0.3) dragged = true;
      setMarquee({ x1: start.x, y1: start.y, x2: cur.x, y2: cur.y });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setMarquee(null);
      if (!dragged) { onSelect(undefined); return; }

      // Marquee-Auswahl anhand der TATSÄCHLICHEN DOM-Rects der gerenderten
      // Elemente auswerten. Damit ist die Auswahl robust gegen unterschiedliche
      // Einheiten/Rotations-Transforms und liefert "Umschließen" korrekt
      // (nur vollständig innen liegende Rects), unabhängig davon, wie ein
      // Element seine Größe intern kodiert.
      const mx1 = Math.min(e.clientX, ev.clientX);
      const my1 = Math.min(e.clientY, ev.clientY);
      const mx2 = Math.max(e.clientX, ev.clientX);
      const my2 = Math.max(e.clientY, ev.clientY);

      const hit: string[] = [];
      const root = pageRef.current;
      if (root) {
        const nodes = root.querySelectorAll<HTMLElement>("[data-marquee-id]");
        nodes.forEach((node) => {
          const id = node.getAttribute("data-marquee-id");
          if (!id) return;
          const el = page.elements.find((p) => p.id === id);
          if (!el) return;
          if (el.kind === "line" || el.kind === "guide") return;
          const r = node.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          if (marqueeMode === "enclose") {
            if (r.left >= mx1 && r.top >= my1 && r.right <= mx2 && r.bottom <= my2) hit.push(id);
          } else {
            if (r.left <= mx2 && r.right >= mx1 && r.top <= my2 && r.bottom >= my1) hit.push(id);
          }
        });
      }

      if (onMultiSelect) onMultiSelect(hit);
      else if (hit.length === 1) onSelect(hit[0]);
      else onSelect(undefined);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const handlePagePointerMove = (_e: React.PointerEvent) => {
    /* no-op */
  };


  // ESC in zwei Stufen: Läuft gerade eine Aktion (z. B. Linie im Zeichnen),
  // bricht ESC nur diese ab — das Werkzeug bleibt aktiv. Läuft nichts, wechselt
  // ESC zurück zum Auswahl-Werkzeug.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable);
      if (e.key === "Escape") {
        if (inField) return;
        // Capture-Phase: Zustand VOR dem Abbruch durch die CAD-Engine lesen.
        const busy = !!pendingStart || !!localEngineRef.current?.hasActiveAction();
        setPendingStart(null);
        setHoverPt(null);
        if (busy) return;
        if (activeTool === null) return;
        onCommitTool();
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
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
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

  const inner = (
    <div
      className="relative"
      // Capture-Wurzel für den PDF-Export: enthält das Papier UND die
      // darüberliegende CAD-Engine-Ebene (Linien, Texte, Schraffuren).
      data-page-capture={page.id}
      style={{
        width: displayWidth,
        height: displayHeight,
      }}
    >
      <div
        ref={pageRef}
        data-page-id={page.id}
          className={`relative ${bare ? "" : "shadow-xl"} page-sheet`}
          style={{
            width: displayWidth,
            height: displayHeight,
            background: "white",
            border: bare ? "none" : "1px solid hsl(var(--hairline))",
            cursor: cursorStyle,
          }}
          onPointerDown={handlePagePointerDown}
          onPointerMove={handlePagePointerMove}
        >
        {/* Marquee-Overlay (Rahmen-Auswahl). Farbe je nach Modus:
            touch=orange (Crossing), enclose=blau (Window) — Archicad-Konvention. */}
        {marquee && (() => {
          const rx1 = Math.min(marquee.x1, marquee.x2);
          const ry1 = Math.min(marquee.y1, marquee.y2);
          const rx2 = Math.max(marquee.x1, marquee.x2);
          const ry2 = Math.max(marquee.y1, marquee.y2);
          const stroke = marqueeMode === "enclose" ? "hsl(210 90% 55%)" : "hsl(28 95% 55%)";
          const fill = marqueeMode === "enclose" ? "hsl(210 90% 55% / 0.10)" : "hsl(28 95% 55% / 0.10)";
          const dash = marqueeMode === "enclose" ? "none" : "6 4";
          return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${rx1}%`, top: `${ry1}%`,
                width: `${rx2 - rx1}%`, height: `${ry2 - ry1}%`,
                background: fill,
                outline: `1px ${dash === "none" ? "solid" : "dashed"} ${stroke}`,
              }}
            />
          );
        })()}
        {/* Margin overlay (light grey ring) */}
        {marginPx > 0 && (
          <div
            data-page-margin-overlay=""
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
        {overlayPage && (() => {
          const _ofs = getPageSizeMm(overlayPage);
          const ofmt = { w: _ofs.wMm, h: _ofs.hMm };
          const tint = overlayColor;
          return (
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden"
              style={{ opacity: overlayOpacity, zIndex: 0 }}
            >
              {/* CAD-Ebene der Hintergrundseite als read-only Ghost */}
              <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                <CadOverlayLayer
                  key={`ghost-${overlayPage.id}`}
                  pageWidthMm={ofmt.w}
                  pageHeightMm={ofmt.h}
                  basePxPerMm={baseWidth / ofmt.w}
                  pageMarginsMm={overlayPage.margins ?? 0}
                  zoom={scale * (fmt.w / ofmt.w)}
                  activeTool="select"
                  enabled={false}
                  initialState={overlayPage.cadOverlay}
                  onChange={() => {}}
                />
              </div>
              {/* Nicht-CAD Elemente (Text, Bilder, PDFs …) der Hintergrundseite */}
              {overlayPage.elements
                .filter((e) => e.kind !== "line" && e.kind !== "guide")
                .map((el) => (
                  <ElementView key={el.id} el={el} readOnly />
                ))}
              {/* Farb-Tint (Multiply) — nur wenn eine Tintfarbe gesetzt ist.
                  Wenn undefined, werden die Originalfarben der Hintergrundseite gezeigt. */}
              {tint && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: tint, mixBlendMode: "multiply" }}
                />
              )}
            </div>
          );
        })()}

        {otherEls.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            onJumpCad={onJumpCad}
            toolActive={activeTool !== null && activeTool !== "cad"}
            selected={selectedElementIds.includes(el.id)}
            elevated={activeTool === null && el.kind !== "cad-view" && el.kind !== "cad-viewport" && el.kind !== "pdf" && el.kind !== "image"}
            onSelect={(opts) => onSelect(el.id, opts)}
            onDrag={(dx, dy, alt) => {
              const dxPct = (dx / displayWidth) * 100;
              const dyPct = (dy / displayHeight) * 100;
              // Alt-Drag auf CAD-Viewport: nicht das Papier-Rechteck bewegen,
              // sondern den Modell-Mittelpunkt hinter dem Papierfenster
              // verschieben (Paper-Space bleibt fix, Model-Space wandert).
              if (alt && (el.kind === "cad-view" || el.kind === "cad-viewport")) {
                const scaleDen = el.scaleDen ?? 100;
                const dxMmPaper = dx / mmToPx;
                const dyMmPaper = dy / mmToPx;
                // paperMm -> modelM: modelM = paperMm * scaleDen / 1000.
                // Ziehen nach rechts zeigt weiter links liegende Modellinhalte
                // → modelCenter.x wandert nach links.
                const dxM = -(dxMmPaper * scaleDen) / 1000;
                const dyM = -(dyMmPaper * scaleDen) / 1000;
                const c = el.modelCenterM ?? { x: 0, y: 0 };
                projectStore.updateElement(projectId, page.id, el.id, {
                  modelCenterM: { x: c.x + dxM, y: c.y + dyM },
                });
                return;
              }
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
            onEdgeDrag={(edge, dx, dy) => {
              const dxPct = (dx / displayWidth) * 100;
              const dyPct = (dy / displayHeight) * 100;
              const patch: Partial<PageElement> = {};
              const minPct = 2;
              const scaleDen = el.scaleDen ?? parseScaleDen(el.scale) ?? 100;
              const center = el.modelCenterM ?? { x: 0, y: 0 };
              let x = el.x;
              let y = el.y;
              let w = el.w;
              let h = el.h;
              if (edge === "left") {
                const maxX = el.x + el.w - minPct;
                const newX = Math.max(0, Math.min(maxX, el.x + dxPct));
                x = newX;
                w = Math.max(minPct, el.w - (newX - el.x));
              } else if (edge === "right") {
                w = Math.max(minPct, Math.min(100 - el.x, el.w + dxPct));
              } else if (edge === "top") {
                const maxY = el.y + el.h - minPct;
                const newY = Math.max(0, Math.min(maxY, el.y + dyPct));
                y = newY;
                h = Math.max(minPct, el.h - (newY - el.y));
              } else if (edge === "bottom") {
                h = Math.max(minPct, Math.min(100 - el.y, el.h + dyPct));
              }
              patch.x = x;
              patch.y = y;
              patch.w = w;
              patch.h = h;
              if (el.kind === "cad-view" || el.kind === "cad-viewport") {
                const oldLeftMm = (el.x / 100) * fmt.w;
                const oldRightMm = ((el.x + el.w) / 100) * fmt.w;
                const oldTopMm = (el.y / 100) * fmt.h;
                const oldBottomMm = ((el.y + el.h) / 100) * fmt.h;
                const newLeftMm = (x / 100) * fmt.w;
                const newRightMm = ((x + w) / 100) * fmt.w;
                const newTopMm = (y / 100) * fmt.h;
                const newBottomMm = ((y + h) / 100) * fmt.h;
                const deltaCenterMmX = ((newLeftMm + newRightMm) - (oldLeftMm + oldRightMm)) / 2;
                const deltaCenterMmY = ((newTopMm + newBottomMm) - (oldTopMm + oldBottomMm)) / 2;
                const nextWMm = (w / 100) * fmt.w;
                const nextHMm = (h / 100) * fmt.h;
                patch.modelCenterM = {
                  x: center.x + (deltaCenterMmX * scaleDen) / 1000,
                  y: center.y + (deltaCenterMmY * scaleDen) / 1000,
                };
                patch.basePaperMm = { w: nextWMm, h: nextHMm };
                patch.baseScaleDen = scaleDen;
                patch.wMm = nextWMm;
                patch.hMm = nextHMm;
                patch.xMm = (x / 100) * fmt.w;
                patch.yMm = (y / 100) * fmt.h;
                patch.lastSyncAt = new Date().toISOString();
              }
              projectStore.updateElement(projectId, page.id, el.id, patch);
            }}
            onCornerDrag={(corner, dx, dy, shift) => {
              const dxPct = (dx / displayWidth) * 100;
              const dyPct = (dy / displayHeight) * 100;
              const minPct = 2;
              // Anker = gegenüberliegende Ecke → nur die gezogene Ecke bewegt sich.
              let x = el.x;
              let y = el.y;
              let w = el.w;
              let h = el.h;
              if (corner === "br") {
                w = Math.max(minPct, Math.min(100 - el.x, el.w + dxPct));
                h = Math.max(minPct, Math.min(100 - el.y, el.h + dyPct));
              } else if (corner === "tr") {
                w = Math.max(minPct, Math.min(100 - el.x, el.w + dxPct));
                const newY = Math.max(0, el.y + dyPct);
                h = Math.max(minPct, el.h - (newY - el.y));
                y = newY;
              } else if (corner === "bl") {
                const newX = Math.max(0, el.x + dxPct);
                w = Math.max(minPct, el.w - (newX - el.x));
                x = newX;
                h = Math.max(minPct, Math.min(100 - el.y, el.h + dyPct));
              } else if (corner === "tl") {
                const newX = Math.max(0, el.x + dxPct);
                w = Math.max(minPct, el.w - (newX - el.x));
                x = newX;
                const newY = Math.max(0, el.y + dyPct);
                h = Math.max(minPct, el.h - (newY - el.y));
                y = newY;
              }
              if (shift && el.w > 0 && el.h > 0) {
                // Seitenverhältnis halten — größere relative Änderung gewinnt.
                const ratio = el.h / el.w;
                const changedW = Math.abs(w - el.w) >= Math.abs((h - el.h) / ratio);
                if (changedW) {
                  const newH = w * ratio;
                  if (corner === "tl" || corner === "tr") y = y + (h - newH);
                  h = newH;
                } else {
                  const newW = h / ratio;
                  if (corner === "tl" || corner === "bl") x = x + (w - newW);
                  w = newW;
                }
              }
              projectStore.updateElement(projectId, page.id, el.id, { x, y, w, h });
            }}
            onTransform={(patch) => {
              projectStore.updateElement(projectId, page.id, el.id, patch);
            }}
          />
        ))}

        {/* Punch holes overlay */}
        {holes.map((h, i) => (
          <div
            key={i}
            data-page-punch-hole=""
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
            : activeTool === "document" ? "document"
            : activeTool === "pipette" ? "pipette"
            : activeTool === null ? "select"
            : null
          }
          hatchDrawMode={hatchDrawMode}
          enabled={activeTool === "line" || activeTool === "text" || activeTool === "guide" || activeTool === "free" || activeTool === "eraser" || activeTool === "hatch" || activeTool === "document" || activeTool === "pipette" || activeTool === null}
          initialState={page.cadOverlay}
          ghostSnapState={overlayPage ? overlayPage.cadOverlay : null}
          onEraseWorld={(c, rM, mode, soft, strength) => {
            // Welt-Meter → Papier-mm; trifft CAD-Blatt-Elemente auf dieser Seite.
            const mmX = c.x * 1000, mmY = c.y * 1000, rMm = rM * 1000;
            for (const el of page.elements) {
              if (el.kind !== "cad-view" && el.kind !== "cad-viewport" && el.kind !== "pdf" && el.kind !== "image") continue;
              // Fallback: Dokumente/Bilder liegen teils nur in %-Geometrie vor.
              const ex = typeof el.xMm === "number" ? el.xMm : ((el.x ?? 0) / 100) * fmt.w;
              const ey = typeof el.yMm === "number" ? el.yMm : ((el.y ?? 0) / 100) * fmt.h;
              const ew = typeof el.wMm === "number" && el.wMm > 0 ? el.wMm : ((el.w ?? 0) / 100) * fmt.w;
              const eh = typeof el.hMm === "number" && el.hMm > 0 ? el.hMm : ((el.h ?? 0) / 100) * fmt.h;
              if (ew <= 0 || eh <= 0) continue;
              // Inverse Rotation um den Elementmittelpunkt.
              const rot = ((el.rotation ?? 0) * Math.PI) / 180;
              const cx = ex + ew / 2, cy = ey + eh / 2;
              const dx = mmX - cx, dy = mmY - cy;
              const cos = Math.cos(-rot), sin = Math.sin(-rot);
              const lx = dx * cos - dy * sin + ew / 2;
              const ly = dx * sin + dy * cos + eh / 2;
              if (lx + rMm < 0 || lx - rMm > ew || ly + rMm < 0 || ly - rMm > eh) continue;
              const prev = el.eraseCircles ?? [];
              const last = prev[prev.length - 1];
              // Smooth wirkt nur auf Rasterbilder (PNG/JPG).
              const smooth = mode === "smooth" && el.kind === "image";
              const s = smooth ? soft : 0;
              const str = Math.max(0.1, Math.min(1, strength ?? 1));
              // Smooth: pro Stempel nur minimal abtragen → Verweilen radiert voll.
              const a = smooth ? Math.max(0.015, 0.12 * str * (1 - 0.7 * s)) : 1;

              // Nur exakte Doppelstempel überspringen; Überlappung darf akkumulieren.
              const minStep = smooth ? rMm * 0.08 : rMm * 0.4;
              if (last && Math.hypot(last.x - lx, last.y - ly) < minStep && Math.abs(last.r - rMm) < 0.01) continue;
              projectStore.updateElement(projectId, page.id, el.id, {
                // mm-Geometrie sicherstellen, damit die Maske exakt im selben
                // Koordinatenraum gerendert wird wie die Radier-Kreise.
                xMm: ex, yMm: ey, wMm: ew, hMm: eh,
                eraseCircles: [...prev.slice(-600), { x: lx, y: ly, r: rMm, s, a }],
              });
            }
          }}


          // Hilfslinien beziehen ihre Farbe aus `guideColor` (MiniCad-Guide-Modus).
          // Die Linien-Default-Farbe darf davon NICHT überschrieben werden.
          lineColor={toolSettings.line.color}
          lineThicknessMm={activeTool === "guide"
            ? guideStrokePxToMm(toolSettings.guide.strokeWidth, baseWidth / fmt.w)
            : toolSettings.line.thicknessMm}
          lineAlpha={toolSettings.line.alpha / 100}
          guideColor={toolSettings.guide.color}
          guidesLocked={toolSettings.guide.locked}
          multiSelectMode={toolSettings.select.multi}
          selectMarqueeMode={toolSettings.select.marqueeMode}

          textColor={toolSettings.text.color}
          textFontSizePx={toolSettings.text.fontSize}
          textBold={toolSettings.text.bold}
          textItalic={toolSettings.text.italic}
          textUnderline={toolSettings.text.underline}
          textStrike={toolSettings.text.strike}
          textLineHeightPct={toolSettings.text.lineHeightPct}
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
          onEngineReady={(api) => { localEngineRef.current = api.engine; onCadEngineReady?.(api); }}
          externalDocs={page.elements
            // CAD-Blatt (cad-view/cad-viewport) NICHT als externalDoc an die
            // Engine übergeben — sonst rendert die Engine eigene blaue Snap-
            // Marker über den ElementView-Handles und blockiert deren Klicks.
            // Die Snap-Ziele der CAD-Blätter werden ausschließlich über
            // pageSnap (buildRectSnapEntry) publiziert und durch die
            // (nun blau gestylten) ElementView-Handles visuell dargestellt.
            .filter((e) => e.kind === "pdf" || e.kind === "image")
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
            const wPct = (t.wMM / fmt.w) * 100;
            const hPct = (t.hMM / fmt.h) * 100;
            const rot = ((t.rotationDeg % 360) + 360) % 360;
            projectStore.updateElement(projectId, page.id, id, {
              x: xPct,
              y: yPct,
              w: wPct,
              h: hPct,
              rotation: rot,
              guideEdges: t.guideEdges,
            });
          }}
          onExternalDocDelete={(id) => {
            projectStore.deleteElement(projectId, page.id, id);
            onSelect(undefined);
          }}

        />


      </div>
  );
  if (bare) return inner;
  return (
    <div
      className="min-h-full flex items-start justify-start"
      style={{ padding: "200vh 200vw" }}

    >
      {inner}
    </div>
  );
}


function ZoomBar({
  zoom,
  setZoom,
  onResetZoom,
}: {
  zoom: number;
  setZoom: (v: number) => void;
  onResetZoom: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const sliderValue = zoomToSliderValue(zoom);
  return (
    <div
      className="h-10 shrink-0 border-t flex items-center justify-center gap-2 px-2 sm:gap-3 sm:px-4 overflow-hidden"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <button
        onClick={() => setZoom(clampProjectZoom(zoom / 1.02))}
        className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground"
        title="Verkleinern (−2 %)"
      >
        <ZoomOut size={14} />
      </button>
      <input
        type="range"
        min={0}
        max={PROJECT_ZOOM_SLIDER_STEPS}
        step={1}
        value={sliderValue}
        onChange={(e) => setZoom(sliderValueToZoom(Number(e.target.value)))}
        className="min-w-[70px] flex-1 max-w-64 accent-foreground"
      />
      <button
        onClick={() => setZoom(clampProjectZoom(zoom * 1.02))}
        className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted text-muted-foreground"
        title="Vergrößern (+2 %)"
      >
        <ZoomIn size={14} />
      </button>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={PROJECT_ZOOM_MIN}
          max={PROJECT_ZOOM_MAX}
          step={0.1}
          value={draft ?? (zoom < 100 ? zoom.toFixed(1) : Math.round(zoom))}
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
          className="w-12 sm:w-14 h-7 px-1.5 rounded border bg-transparent text-sm text-right tabular-nums shrink-0"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <button
        type="button"
        onClick={onResetZoom}
        className="ml-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="Auf 100 % setzen und Blatt zentrieren"
      >
        <Crosshair size={14} />
        100 %
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Warp/Verzerren-Hülle: rendert Kinder mit CSS-matrix3d gemäß warpCorners.
// Bei Identität (keine echte Verzerrung) wird die Hülle transparent — keine
// Transformation, kein Overflow-Impact. Übergeordnete Container-Größe bleibt
// stabil (el.w × el.h), damit Selektion/Handles unverändert positioniert sind.
function WarpedContent({
  corners,
  children,
}: {
  corners?: WarpCorners;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const warped = isWarped(corners);
  useLayoutEffect(() => {
    // Unverzerrte Dokumente brauchen keinerlei Größen-/Pointer-Tracking.
    // Insbesondere beim Projektmappen-Zoom würde der ResizeObserver sonst für
    // jede PDF-/Bildseite einen zusätzlichen React-Render pro Zoomframe auslösen.
    if (!warped) {
      setSize((current) => current.w === 0 && current.h === 0 ? current : { w: 0, h: 0 });
      return;
    }
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width * 100) / 100;
      const h = Math.round(r.height * 100) / 100;
      // Nur bei echter Änderung setzen — sonst löst der ResizeObserver mit
      // Subpixel-Schwankungen eine Endlos-Renderschleife aus (React #185).
      setSize((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [warped]);
  const active = warped && size.w > 0 && size.h > 0;
  const matrix = active ? computeWarpMatrix3d(size.w, size.h, corners!) : "";
  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: active ? "visible" : "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          transform: active ? matrix : undefined,
          willChange: active ? "transform" : undefined,
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Handles für den „Verzerren"-Modus: 4 Ecken + 4 Kanten-Mittelpunkte.
// Ziehen ändert warpCorners in Fraktionen (0..1). Rotationskompensation ist
// nicht enthalten — bei rotierten Elementen wird die Verzerrung noch relativ
// zur unrotierten Achse berechnet.
function WarpHandles({
  corners,
  containerRef,
  onCommit,
  axis = "free",
}: {
  corners: WarpCorners;
  containerRef: React.RefObject<HTMLElement>;
  onCommit: (next: WarpCorners) => void;
  axis?: "free" | "x" | "y";
}) {
  const mids = edgeMidpoints(corners);
  const startDrag = (kind: "corner" | "edge", idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startCorners = corners.map((c) => ({ ...c })) as WarpCorners;
    // Bewusst KEIN setPointerCapture auf dem Handle: React ersetzt das
    // DOM-Element beim Re-Render nach onCommit — die Capture ginge verloren.
    // document-Listener (capture-Phase) sind resilient dagegen.
    const w = rect.width, h = rect.height;
    // Tablet-Hilfsrad: Der Griff wird angetippt, folgt danach dem Stift als
    // Vorschau (auch nach dem Abheben) und wird erst mit ENTER final gesetzt.
    const tabletMode = !!(window as any).__pixunaTabletCommit;
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      let dx = (ev.clientX - startX) / w;
      let dy = (ev.clientY - startY) / h;
      if (axis === "x") dy = 0;
      else if (axis === "y") dx = 0;
      const next = startCorners.map((c) => ({ ...c })) as WarpCorners;
      if (kind === "corner") {
        next[idx] = {
          x: Math.max(-0.5, Math.min(1.5, startCorners[idx].x + dx)),
          y: Math.max(-0.5, Math.min(1.5, startCorners[idx].y + dy)),
        };
      } else {
        const pair: [number, number] =
          idx === 0 ? [0, 1] : idx === 1 ? [1, 2] : idx === 2 ? [2, 3] : [3, 0];
        for (const p of pair) {
          next[p] = {
            x: Math.max(-0.5, Math.min(1.5, startCorners[p].x + dx)),
            y: Math.max(-0.5, Math.min(1.5, startCorners[p].y + dy)),
          };
        }
      }
      onCommit(next);
    };
    const stop = () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter") { ev.preventDefault(); ev.stopPropagation(); stop(); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); onCommit(startCorners); stop(); }
    };
    const onUp = () => {
      // Ohne Tablet-Hilfsrad beendet das Abheben die Verzerrung wie gewohnt.
      if (!tabletMode) stop();
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    if (tabletMode) document.addEventListener("keydown", onKey, true);

  };
  const handleStyle = (frac: { x: number; y: number }, isEdge: boolean): React.CSSProperties => ({
    position: "absolute",
    left: `${frac.x * 100}%`,
    top: `${frac.y * 100}%`,
    width: isEdge ? 10 : 12,
    height: isEdge ? 10 : 12,
    marginLeft: isEdge ? -5 : -6,
    marginTop: isEdge ? -5 : -6,
    background: isEdge ? "hsl(var(--accent-gold-soft))" : "hsl(var(--accent-gold))",
    border: "1.5px solid white",
    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
    borderRadius: isEdge ? 999 : 2,
    cursor: "grab",
    touchAction: "none",
    pointerEvents: "auto",
    zIndex: 120,
  });
  return (
    <>
      {corners.map((c, i) => (
        <div
          key={`c${i}`}
          data-hub-control
          onPointerDown={(e) => startDrag("corner", i, e)}
          style={handleStyle(c, false)}
        />
      ))}
      {mids.map((c, i) => (
        <div
          key={`m${i}`}
          data-hub-control
          onPointerDown={(e) => startDrag("edge", i, e)}
          style={handleStyle(c, true)}
        />
      ))}
    </>
  );
}

// Subscribed Wrapper: rendert die Warp-Handles nur, wenn dieses Element im
// globalen Warp-Store als aktiv markiert ist (Toggle im ElementInspector).
function WarpTargetHandles({
  elementId,
  corners,
  axis,
  containerRef,
  onCommit,
}: {
  elementId: string;
  corners?: WarpCorners;
  axis?: "free" | "x" | "y";
  containerRef: React.RefObject<HTMLElement>;
  onCommit: (next: WarpCorners) => void;
}) {
  const active = useWarpTarget();
  if (active !== elementId) return null;
  const c = (corners && corners.length === 4 ? corners : IDENTITY_WARP) as WarpCorners;
  return <WarpHandles corners={c} containerRef={containerRef} onCommit={onCommit} axis={axis ?? "free"} />;
}

// Kleiner Toggle-Button für die HUB-Actionbar: schaltet den Verzerren-Modus
// für dieses Element ein/aus, ohne Umweg über den Inspector.
function WarpHubButton({ elementId }: { elementId: string }) {
  const active = useWarpTarget();
  const isActive = active === elementId;
  return (
    <button
      data-hub-control
      onClick={(e) => { e.stopPropagation(); setWarpTarget(isActive ? null : elementId); }}
      title={isActive ? "Verzerren beenden" : "Verzerren aktivieren"}
      className={`h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))] ${isActive ? "bg-[hsl(var(--accent-gold-soft))]" : ""}`}
      style={{ color: isActive ? "hsl(var(--accent-gold))" : undefined }}
    >
      <Spline size={14} />
    </button>
  );
}




function ElementView({
  el,
  selected,
  readOnly,
  elevated,
  toolActive,
  onSelect,
  onDrag,
  onDuplicate,
  onRotate,
  onEdgeDrag,
  onCornerDrag,
  onTransform,
  onJumpCad,
}: {
  el: PageElement;
  selected?: boolean;
  readOnly?: boolean;
  elevated?: boolean;
  toolActive?: boolean;
  onSelect?: (opts?: { shift?: boolean }) => void;
  onDrag?: (dx: number, dy: number, alt?: boolean) => void;

  onDuplicate?: () => void;
  onRotate?: (deltaDeg: number, absolute?: boolean) => void;
  onEdgeDrag?: (edge: "top" | "right" | "bottom" | "left", dx: number, dy: number) => void;
  onCornerDrag?: (corner: "tl" | "tr" | "bl" | "br", dx: number, dy: number, shift: boolean) => void;
  onTransform?: (patch: Partial<PageElement>) => void;
  onJumpCad?: (sheetId?: string) => void;
}) {

  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rotateRef = useRef<HTMLDivElement | null>(null);
  const rotateMovedRef = useRef(false);
  const modeStartClientRef = useRef<{ x: number; y: number } | null>(null);
  /** Zuletzt geklickter Punkt — als Fraktion (0..1) INNERHALB des Elements.
   *  Bleibt bei Zoom/Pan stabil, da wir clientX/Y erst zur Commit-/Move-Zeit
   *  aus dem aktuellen Element-Rect ableiten. Als State, damit HUB neu
   *  positioniert wird, wenn ein anderer Anker gewählt wurde. */
  const [anchorFracState, setAnchorFracState] = useState<{ fx: number; fy: number; key: string } | null>(null);
  const anchorFracRef = useRef<{ fx: number; fy: number; key: string } | null>(null);
  const setAnchor = (a: { fx: number; fy: number; key: string } | null) => {
    anchorFracRef.current = a;
    setAnchorFracState(a);
  };

  const isCadView = el.kind === "cad-view" || el.kind === "cad-viewport";
  // CAD-Blätter: blaue Optik, unveränderter Cursor und Bedienung
  // ausschließlich über HUB-Symbole (Verschieben / Drehen / Kanten schneiden)
  // mit Commit per Linksklick + ENTER bzw. Häkchen (Tablet).
  const cadHubUx = isCadView;
  const hubBlue = "#4da3ff";
  // Portal-Ziel (Seitenfläche) für die Bedien-Overlays der CAD-Blätter.
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalHost((rootRef.current?.parentElement as HTMLElement | null) ?? null);
  }, []);


  // Explizite HUB-Modi für CAD-Blatt: erst nach Klick auf das Symbol wird
  // Bewegen / Drehen aktiv. Preview läuft mit Fadenkreuz-Cursor; ein weiterer
  // Klick auf der Seite commited an aktueller Position. Bei aktivem
  // Tablet-Hilfsrad erscheint ein Häkchen-Button, der ebenfalls commited.
  const [hubMode, setHubMode] = useState<null | "move" | "rotate">(null);
  const [preview, setPreview] = useState<{
    dxPx: number; dyPx: number; deltaDeg: number;
    anchorFrac: { x: number; y: number };
  }>({ dxPx: 0, dyPx: 0, deltaDeg: 0, anchorFrac: { x: 0.5, y: 0.5 } });
  const previewRef = useRef(preview);
  previewRef.current = preview;
  // Pointer-Geste bleibt über Re-Renders (z. B. Ankerwechsel bei pointerdown)
  // erhalten. Lokale Variablen gingen dabei verloren und blockierten den
  // anschließenden Linksklick-Commit.
  const hubDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const hubSettledRef = useRef(false);
  // "Carrying" = Objekt folgt aktiv der Maus. Linksklick während einer HUB-
  // Aktion togglet diesen Zustand: dropt das Objekt an aktueller Preview-
  // Position (carrying=false) bzw. nimmt es wieder auf (carrying=true).
  // Commit passiert ausschließlich per ENTER oder Häkchen (Tablet).
  const [carrying, setCarrying] = useState<boolean>(true);
  const carryingRef = useRef(true);
  carryingRef.current = carrying;
  // Rechtsklick-Hilfslinien während einer HUB-Aktion (nur Preview, werden
  // beim Commit/Cancel wieder verworfen). Koordinaten in Prozent der Seite.
  const [guides, setGuides] = useState<Array<{ id: number; xPct: number; yPct: number }>>([]);
  /** Rechtsklick-Strahlen: Hilfslinie vom angeklickten (Fremd-)Fangpunkt zum
   *  aktuell gewählten Fangpunkt dieses Elements. Alle Werte in Prozent der Seite. */
  const [rayGuides, setRayGuides] = useState<Array<{ id: number; ax: number; ay: number; bx: number; by: number }>>([]);
  const rayGuidesRef = useRef(rayGuides);
  rayGuidesRef.current = rayGuides;
  /** CAD-Blatt-Drehen: Achse durch die beiden oberen Fangpunkte + fixierte
   *  Cursor-Position auf dieser Achse. Alle Werte in Prozent der Seite. */
  const [rotAxis, setRotAxis] = useState<
    { ax: number; ay: number; bx: number; by: number; mx: number; my: number; deg: number } | null
  >(null);

  /** Projiziert einen Client-Punkt auf die nächstgelegene Hilfslinie (Toleranz 10px). */
  const snapToRayGuides = (cx: number, cy: number, pageRect: DOMRect) => {
    let best: { x: number; y: number; d: number } | null = null;
    for (const g of rayGuidesRef.current) {
      const ax = pageRect.left + (g.ax / 100) * pageRect.width;
      const ay = pageRect.top + (g.ay / 100) * pageRect.height;
      const bx = pageRect.left + (g.bx / 100) * pageRect.width;
      const by = pageRect.top + (g.by / 100) * pageRect.height;
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1e-6) continue;
      const t = ((cx - ax) * vx + (cy - ay) * vy) / len2;
      const px = ax + vx * t, py = ay + vy * t;
      const d = Math.hypot(cx - px, cy - py);
      if (d <= 10 && (!best || d < best.d)) best = { x: px, y: py, d };
    }
    return best;
  };

  /** Fangpunkt-Suche über BEIDE Quellen: Seiten-Elemente (pageSnap) und die
   *  eingebettete CAD-Engine (Linien, Freihand, Texte, Schraffuren, Dokumente). */
  const findSnap = (cx: number, cy: number, pageRect: DOMRect, tol = 12) => {
    const m = getPageSnapRegistry().queryNearest(cx, cy, pageRect, tol, [el.id]);
    if (m) return { x: m.x, y: m.y, match: m };
    const e = queryCadEngineSnap(cx, cy, pageRect, tol);
    if (e) return { x: e.x, y: e.y, match: null };
    return null;
  };

  // Edge-Trim: reine Vorschau (dxPx/dyPx). Commit erst bei Pointerup bzw.
  // — bei aktivem Tablet-Hilfsrad — beim Klick auf das Häkchen.
  const [edgeTrim, setEdgeTrim] = useState<{
    edge: "top" | "right" | "bottom" | "left";
    dxPx: number; dyPx: number;
  } | null>(null);
  const edgeTrimRef = useRef(edgeTrim);
  edgeTrimRef.current = edgeTrim;
  const actionCommitRef = useRef<(() => void) | null>(null);
  const actionCancelRef = useRef<(() => void) | null>(null);
  const [activeEdge, setActiveEdge] = useState<"top" | "right" | "bottom" | "left" | null>(null);
  const [tabletActive, setTabletActive] = useState<boolean>(
    () => typeof window !== "undefined" && !!(window as any).__pixunaTabletCommit
  );
  useEffect(() => {
    const t = setInterval(() => {
      setTabletActive(!!(window as any).__pixunaTabletCommit);
    }, 300);
    return () => clearInterval(t);
  }, []);

  // Snap-Ziele publizieren: Ecken + Kanten-Mittelpunkte + Kanten-Segmente.
  // Andere Werkzeuge greifen via getPageSnapRegistry().queryNearest(...) drauf zu.
  useEffect(() => {
    if (readOnly) return;
    const reg = getPageSnapRegistry();
    // CAD-Blätter: NUR Ecken sind Fangpunkte (keine Kantenmitten).
    reg.publish(el.id, buildRectSnapEntry(el.kind, el.x, el.y, el.w, el.h, !isCadView));
    return () => { try { reg.unpublish(el.id); } catch {} };
  }, [el.id, el.kind, el.x, el.y, el.w, el.h, readOnly, isCadView]);

  // Hover-Highlight: welcher Snap-Handle dieses Elements ist gerade „gefangen"?
  const [hoveredSnapKey, setHoveredSnapKey] = useState<string | null>(null);
  useEffect(() => {
    const onHover = (ev: Event) => {
      const m = (ev as CustomEvent).detail as { elementId?: string; key?: string } | null;
      if (!m || m.elementId !== el.id) { setHoveredSnapKey((k) => (k ? null : k)); return; }
      setHoveredSnapKey(m.key ?? null);
    };
    window.addEventListener("pixuna:page-snap-hover", onHover as EventListener);
    return () => window.removeEventListener("pixuna:page-snap-hover", onHover as EventListener);
  }, [el.id]);

  // Rechtsklick auf einen (fremden) Fangpunkt → Hilfslinie von diesem Punkt
  // zum aktuell gewählten Fangpunkt dieses Elements. Dient als Orientierungs-
  // und Fanglinie beim Verschieben/Drehen. ESC/ENTF verwerfen die Linien.
  const hubModeRef = useRef<null | "move" | "rotate">(null);
  hubModeRef.current = hubMode;
  useEffect(() => {
    if (readOnly || !selected) return;
    const onContext = (ev: MouseEvent) => {
      if (hubModeRef.current) return; // während HUB-Aktion übernimmt der Hub-Handler
      const parent = rootRef.current?.parentElement as HTMLElement | null;
      if (!parent) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest("[data-hub-control]")) return;
      const pageRect = parent.getBoundingClientRect();
      if (
        ev.clientX < pageRect.left || ev.clientX > pageRect.right ||
        ev.clientY < pageRect.top || ev.clientY > pageRect.bottom
      ) return;
      ev.preventDefault();
      ev.stopPropagation();
      const m = findSnap(ev.clientX, ev.clientY, pageRect, 14);
      const ax = m ? m.x : ((ev.clientX - pageRect.left) / Math.max(1, pageRect.width)) * 100;
      const ay = m ? m.y : ((ev.clientY - pageRect.top) / Math.max(1, pageRect.height)) * 100;
      const frac = anchorFracRef.current ?? { fx: 0.5, fy: 0.5, key: "interior" };
      const bx = el.x + frac.fx * el.w;
      const by = el.y + frac.fy * el.h;
      setRayGuides((g) => [...g.slice(-3), { id: Date.now() + Math.random(), ax, ay, bx, by }]);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" || ev.key === "Delete") setRayGuides([]);
    };
    window.addEventListener("contextmenu", onContext, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("contextmenu", onContext, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [readOnly, selected, cadHubUx, el.id, el.x, el.y, el.w, el.h]);

  useEffect(() => {
    if (selected) return;
    setHubMode(null);
    setEdgeTrim(null);
    setActiveEdge(null);
    setRayGuides([]);
    actionCommitRef.current = null;
    actionCancelRef.current = null;
    modeStartClientRef.current = null;
    try { getPageSnapRegistry().setHover(null); } catch {}
  }, [selected]);


  useEffect(() => {
    if (!edgeTrim) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" || ev.key === "Delete") actionCancelRef.current?.();
      else if (ev.key === "Enter") actionCommitRef.current?.();
    };
    // Linksklick außerhalb der Bedien-Symbole setzt den Kantenschnitt ebenfalls.
    const onClick = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      const t = ev.target as HTMLElement | null;
      if (t?.closest('[data-hub-control], [data-tablet-aid="true"]')) return;
      ev.preventDefault();
      ev.stopPropagation();
      actionCommitRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick, true);
    };
  }, [edgeTrim]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const active = !!hubMode || !!edgeTrim;
    (window as any).__pixunaSkipFirstDraw = active;
    return () => {
      if ((window as any).__pixunaSkipFirstDraw === active) {
        (window as any).__pixunaSkipFirstDraw = false;
      }
    };
  }, [hubMode, edgeTrim]);

  // Tablet-Hilfsrad: Nach dem Aktivieren einer Funktion muss der Fangpunkt
  // ERNEUT angetippt werden, bevor das Objekt am Stift mitgezogen wird.
  useEffect(() => {
    if (!hubMode) return;
    const wheelOn = typeof window !== "undefined" && !!(window as any).__pixunaTabletCommit;
    setCarrying(!wheelOn);
  }, [hubMode]);







  const startDrag = (e: React.PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    onSelect?.({ shift: e.shiftKey });
    const node = rootRef.current;
    const parent = node?.parentElement as HTMLElement | null;
    const startX = e.clientX, startY = e.clientY;
    const frac = anchorFracRef.current ?? { fx: 0.5, fy: 0.5, key: "interior" };
    const rect0 = node?.getBoundingClientRect();
    const anchor0 = rect0
      ? { x: rect0.left + frac.fx * rect0.width, y: rect0.top + frac.fy * rect0.height }
      : { x: startX, y: startY };
    const baseTransform = node?.style.transform ?? "";
    let tdx = 0, tdy = 0;
    let raf = 0;
    dragRef.current = { x: e.clientX, y: e.clientY };

    const paint = () => {
      raf = 0;
      if (node) node.style.transform = `translate(${tdx}px, ${tdy}px) ${baseTransform}`.trim();
    };

    const handleMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      tdx = ev.clientX - startX;
      tdy = ev.clientY - startY;
      // Fangen: Registry-Punkte anderer Elemente + Rechtsklick-Hilfslinien.
      const pageRect = parent?.getBoundingClientRect();
      if (pageRect) {
        const tx = anchor0.x + tdx, ty = anchor0.y + tdy;
        const m = getPageSnapRegistry().queryNearest(tx, ty, pageRect, 10, [el.id]);
        if (m) {
          tdx = pageRect.left + (m.x / 100) * pageRect.width - anchor0.x;
          tdy = pageRect.top + (m.y / 100) * pageRect.height - anchor0.y;
        } else {
          const snapped = snapToRayGuides(tx, ty, pageRect);
          if (snapped) { tdx = snapped.x - anchor0.x; tdy = snapped.y - anchor0.y; }
        }
      }
      if (!raf) raf = requestAnimationFrame(paint);
    };
    let unregisterAbort: (() => void) | null = null;
    const finish = (commit: boolean, ev?: PointerEvent) => {
      dragRef.current = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (node) node.style.transform = baseTransform;
      try { if (ev) (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("keydown", handleKey, true);
      unregisterAbort?.(); unregisterAbort = null;
      if (commit && (tdx !== 0 || tdy !== 0)) onDrag?.(tdx, tdy, ev?.altKey);
    };
    const handleUp = (ev: PointerEvent) => finish(true, ev);
    const abort = () => { finish(false); setRayGuides([]); };
    const handleKey = (ev: KeyboardEvent) => {
      // ESC oder ENTF brechen das Verschieben ab (Ausgangslage bleibt erhalten).
      if (ev.key !== "Escape" && ev.key !== "Delete") return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      abort();
    };
    unregisterAbort = registerAbort(abort);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("keydown", handleKey, true);
  };



  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    // Don't start a drag when the user clicks an interactive control inside the hub.
    const t = e.target as HTMLElement;
    if (t.closest("[data-hub-control]")) return;
    // Anker als Fraktion INNERHALB des Elements speichern.
    // Zusätzlich Snap-Key (tl/tr/bl/br/mid-*) bestimmen, falls Klick nahe einer Ecke/Kante liegt.
    const rect = (rootRef.current ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const fy = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    const nearX = fx < 0.12 ? "l" : fx > 0.88 ? "r" : "m";
    const nearY = fy < 0.12 ? "t" : fy > 0.88 ? "b" : "m";
    let key = "interior";
    if (nearX !== "m" && nearY !== "m") key = `corner-${nearY}${nearX}`;
    else if (nearX === "m" && nearY !== "m") key = nearY === "t" ? "edge-top" : "edge-bottom";
    else if (nearY === "m" && nearX !== "m") key = nearX === "l" ? "edge-left" : "edge-right";
    // ── Shift-Mehrfachauswahl: Kein Drag. Stattdessen rastet der Anker auf den
    // NÄCHSTGELEGENEN Fangpunkt (Ecke oder Kantenmitte) ein, damit sofort
    // „Verschieben"/„Drehen" von diesem Punkt aus möglich ist. Beim Anklicken
    // weiterer Objekte bleibt dieser Anker am zuerst gewählten Objekt erhalten.
    if (e.shiftKey) {
      const cands: Array<{ fx: number; fy: number; key: string }> = [
        { fx: 0, fy: 0, key: "corner-tl" },
        { fx: 1, fy: 0, key: "corner-tr" },
        { fx: 0, fy: 1, key: "corner-bl" },
        { fx: 1, fy: 1, key: "corner-br" },
        { fx: 0.5, fy: 0, key: "edge-mid-top" },
        { fx: 0.5, fy: 1, key: "edge-mid-bottom" },
        { fx: 0, fy: 0.5, key: "edge-mid-left" },
        { fx: 1, fy: 0.5, key: "edge-mid-right" },
      ];
      let best = cands[0];
      let bestD = Infinity;
      for (const c of cands) {
        const dx = (c.fx - fx) * Math.max(1, rect.width);
        const dy = (c.fy - fy) * Math.max(1, rect.height);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = c; }
      }
      setAnchor(best);
      setActiveEdge(null);
      onSelect?.({ shift: true });
      return;
    }
    setAnchor({ fx, fy, key });
    if ((cadHubUx && selected) || hubMode || edgeTrim) {
      onSelect?.({ shift: e.shiftKey });
      if (!key.startsWith("edge-")) setActiveEdge(null);
      if (hubMode && !!(window as any).__pixunaTabletCommit) {
        modeStartClientRef.current = null;
        setCarrying(true);
      }
      return;
    }
    startDrag(e);

  };


  const handleRotateStart = (e: React.PointerEvent) => {
    if (readOnly || !onRotate) return;
    e.stopPropagation();
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    const node = rootRef.current;
    const parent = node?.parentElement as HTMLElement | null;
    if (!node || !parent) return;
    const rect = node.getBoundingClientRect();
    // Pivot = zuletzt angeklickter Fangpunkt (Anker) — sonst Mittelpunkt.
    const frac = anchorFracRef.current ?? { fx: 0.5, fy: 0.5, key: "interior" };
    const px = rect.left + frac.fx * rect.width;
    const py = rect.top + frac.fy * rect.height;
    const cx0 = rect.left + rect.width / 2;
    const cy0 = rect.top + rect.height / 2;
    const parentRect = parent.getBoundingClientRect();
    const startAngle = Math.atan2(e.clientY - py, e.clientX - px);
    const startRot = el.rotation ?? 0;
    const startX = el.x;
    const startY = el.y;
    rotateMovedRef.current = false;

    const apply = (deltaDeg: number) => {
      const rad = (deltaDeg * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const ox = cx0 - px, oy = cy0 - py;
      const newCx = px + ox * cos - oy * sin;
      const newCy = py + ox * sin + oy * cos;
      const newXPct = ((newCx - rect.width / 2 - parentRect.left) / Math.max(1, parentRect.width)) * 100;
      const newYPct = ((newCy - rect.height / 2 - parentRect.top) / Math.max(1, parentRect.height)) * 100;
      if (onTransform) {
        onTransform({ x: newXPct, y: newYPct, rotation: startRot + deltaDeg });
      } else {
        onRotate(startRot + deltaDeg, true);
      }
    };

    let unregisterAbort: (() => void) | null = null;
    const cleanup = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("keydown", handleKey, true);
      unregisterAbort?.(); unregisterAbort = null;
    };
    const handleMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 3) rotateMovedRef.current = true;
      const a = Math.atan2(ev.clientY - py, ev.clientX - px);
      let delta = ((a - startAngle) * 180) / Math.PI;
      if (ev.shiftKey) {
        // Shift: absolute Rotation auf 90°/0°-Raster fangen.
        const absTarget = Math.round((startRot + delta) / 90) * 90;
        delta = absTarget - startRot;
      }
      apply(delta);
    };
    const handleUp = (ev: PointerEvent) => {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
      cleanup();
    };
    // Abbruch: Ausgangszustand wiederherstellen, Vorschau verwerfen.
    const abort = () => {
      if (onTransform) onTransform({ x: startX, y: startY, rotation: startRot });
      else onRotate(startRot, true);
      cleanup();
    };
    const handleKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" && ev.key !== "Delete") return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      abort();
    };
    unregisterAbort = registerAbort(abort);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("keydown", handleKey, true);
  };




  const hubKinds = new Set(["cad-view", "cad-viewport", "pdf", "image"]);
  const showHub = !readOnly && selected && hubKinds.has(el.kind);
  // Optik: CAD-Blatt blau, alle anderen Objekte goldener Auswahlrahmen.
  const outlineStyle = selected
    ? (cadHubUx ? "1.5px solid #4da3ff" : "2px solid hsl(var(--accent-gold))")
    : "none";

  // Preview-Interaktion (Move/Rotate) — startet bei aktivem hubMode.
  // Anker = zuletzt geklickte Fraktion (anchorFracRef) INNERHALB des Elements.
  // Wichtig: clientX/Y des Ankers werden bei jedem Event NEU aus dem aktuellen
  // Element-Rect berechnet, damit Zoom/Pan des Workspaces den Bezug nicht kippen.
  useEffect(() => {
    if (!hubMode) return;
    const parent = rootRef.current?.parentElement as HTMLElement | null;
    if (!parent) return;
    const frac = anchorFracRef.current ?? { fx: 0.5, fy: 0.5, key: "interior" };
    const anchorFrac = { x: frac.fx, y: frac.fy };
    const startRot = el.rotation ?? 0;
    const startClient = modeStartClientRef.current;
    let startAngle: number | null = null;
    hubDownClientRef.current = null;
    hubSettledRef.current = false;

    const baseRect = () => {
      const pr = parent.getBoundingClientRect();
      return {
        left: pr.left + (el.x / 100) * pr.width,
        top: pr.top + (el.y / 100) * pr.height,
        width: (el.w / 100) * pr.width,
        height: (el.h / 100) * pr.height,
      };
    };

    // Sichtbarer Anker: Der Fangpunkt liegt nach einer bestehenden Rotation
    // nicht mehr an der unrotierten Rect-Position — deshalb um das Zentrum
    // mitdrehen. Nur so bleibt der Fangpunkt beim Drehen exakt an Ort.
    const rotAbout = (px: number, py: number, cx: number, cy: number, deg: number) => {
      const rad = (deg * Math.PI) / 180;
      const c = Math.cos(rad), s = Math.sin(rad);
      const ox = px - cx, oy = py - cy;
      return { x: cx + ox * c - oy * s, y: cy + ox * s + oy * c };
    };
    const liveAnchor = () => {
      const r = baseRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const a = rotAbout(r.left + frac.fx * r.width, r.top + frac.fy * r.height, cx, cy, startRot);
      return { clientX: a.x, clientY: a.y, rect: r };
    };


    const commit = () => {
      const p = previewRef.current;
      const parentRect = parent.getBoundingClientRect();
      const { clientX: ax, clientY: ay, rect } = liveAnchor();
      if (hubMode === "move") {
        const dxPct = (p.dxPx / Math.max(1, parentRect.width)) * 100;
        const dyPct = (p.dyPx / Math.max(1, parentRect.height)) * 100;
        onTransform?.({
          x: Math.max(0, Math.min(100 - (el.w ?? 0), el.x + dxPct)),
          y: Math.max(0, Math.min(100 - (el.h ?? 0), el.y + dyPct)),
        });
      } else if (hubMode === "rotate") {
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaRad = (p.deltaDeg * Math.PI) / 180;
        const ox = centerX - ax;
        const oy = centerY - ay;
        const cos = Math.cos(deltaRad);
        const sin = Math.sin(deltaRad);
        const newCx = ax + ox * cos - oy * sin;
        const newCy = ay + ox * sin + oy * cos;
        const newLeftPx = newCx - rect.width / 2;
        const newTopPx = newCy - rect.height / 2;
        const newXPct = ((newLeftPx - parentRect.left) / Math.max(1, parentRect.width)) * 100;
        const newYPct = ((newTopPx - parentRect.top) / Math.max(1, parentRect.height)) * 100;
        onTransform?.({
          x: Math.max(-50, Math.min(150, newXPct)),
          y: Math.max(-50, Math.min(150, newYPct)),
          rotation: startRot + p.deltaDeg,
        });
      }
      setPreview({ dxPx: 0, dyPx: 0, deltaDeg: 0, anchorFrac: { x: 0.5, y: 0.5 } });
      setHubMode(null);
      setActiveEdge(null);
      setGuides([]);
      setRayGuides([]);
      setRotAxis(null);

      setCarrying(true);
      actionCommitRef.current = null;
      actionCancelRef.current = null;
      modeStartClientRef.current = null;
      try { getPageSnapRegistry().setHover(null); } catch {}
    };
    const cancel = () => {
      setPreview({ dxPx: 0, dyPx: 0, deltaDeg: 0, anchorFrac: { x: 0.5, y: 0.5 } });
      setHubMode(null);
      setActiveEdge(null);
      setGuides([]);
      setRayGuides([]);
      setRotAxis(null);

      setCarrying(true);
      actionCommitRef.current = null;
      actionCancelRef.current = null;
      modeStartClientRef.current = null;
      try { getPageSnapRegistry().setHover(null); } catch {}
      // Abbruch → Objekt deselektieren, damit automatisch das Auswahl-Werkzeug greift.
      onSelect?.(undefined);
    };

    actionCommitRef.current = commit;
    actionCancelRef.current = cancel;
    // ENTF/ESC global: laufende HUB-Vorschau sofort verwerfen.
    const unregisterHubAbort = registerAbort(() => cancel());


    // Preview-Updates werden pro Frame gebündelt (rAF) — sonst rendert React
    // bei jedem Pointer-Event neu und das Verschieben ruckelt.
    let raf = 0;
    let pendingPreview: { dxPx: number; dyPx: number; deltaDeg: number; anchorFrac: { x: number; y: number } } | null = null;
    let pendingAxis: { ax: number; ay: number; bx: number; by: number; mx: number; my: number; deg: number } | null = null;
    const flushFrame = () => {
      raf = 0;
      if (pendingPreview) { setPreview(pendingPreview); pendingPreview = null; }
      if (pendingAxis) { setRotAxis(pendingAxis); pendingAxis = null; }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(flushFrame); };

    const onMove = (ev: PointerEvent) => {
      // Tablet-Hilfsrad/HUB-Bedienelemente werden für die Positionierung
      // komplett ignoriert — sonst springt das Objekt zum Rad.
      const mt = ev.target as HTMLElement | null;
      if (mt?.closest?.('[data-tablet-aid="true"], [data-hub-control]')) return;
      if ((window as any).__pixunaTabletCommit) {
        const overTabletAid = document.elementsFromPoint(ev.clientX, ev.clientY)
          .some((node) => (node as HTMLElement).closest?.('[data-tablet-aid="true"]'));
        if (overTabletAid) return;
      }
      if (!carryingRef.current) return; // Objekt abgelegt — Preview eingefroren.
      const { clientX: ax, clientY: ay } = liveAnchor();
      const reg = getPageSnapRegistry();
      const pageRect = parent.getBoundingClientRect();
      if (hubMode === "move") {
        let dxPx = startClient ? ev.clientX - startClient.x : ev.clientX - ax;
        let dyPx = startClient ? ev.clientY - startClient.y : ev.clientY - ay;
        const targetX = ax + dxPx;
        const targetY = ay + dyPx;
        const m = findSnap(targetX, targetY, pageRect, 12);
        if (m) {
          const snapPx = pageRect.left + (m.x / 100) * pageRect.width;
          const snapPy = pageRect.top + (m.y / 100) * pageRect.height;
          dxPx = snapPx - ax;
          dyPx = snapPy - ay;
          reg.setHover(m.match);
        } else {
          reg.setHover(null);
          const snapped = snapToRayGuides(targetX, targetY, pageRect);
          if (snapped) { dxPx = snapped.x - ax; dyPx = snapped.y - ay; }
        }
        previewRef.current = { dxPx, dyPx, deltaDeg: 0, anchorFrac };
        pendingPreview = { dxPx, dyPx, deltaDeg: 0, anchorFrac };
        schedule();

      } else if (hubMode === "rotate") {
        // Zielpunkt anvisieren: Fangpunkte anderer Objekte und Rechtsklick-
        // Hilfslinien ziehen den Rotations-Strahl exakt auf den Punkt.
        let tx = ev.clientX, ty = ev.clientY;
        const mR = findSnap(tx, ty, pageRect, 12);
        if (mR) {
          tx = pageRect.left + (mR.x / 100) * pageRect.width;
          ty = pageRect.top + (mR.y / 100) * pageRect.height;
          reg.setHover(mR.match);
        } else {
          reg.setHover(null);
          const snapped = snapToRayGuides(tx, ty, pageRect);
          if (snapped) { tx = snapped.x; ty = snapped.y; }
        }
        // Zu nah am Drehpunkt → Winkel wäre extrem sprunghaft, daher ignorieren.
        if (Math.hypot(ty - ay, tx - ax) < 24) return;
        const a = (Math.atan2(ty - ay, tx - ax) * 180) / Math.PI;
        if (startAngle === null) {
          // Referenzwinkel = Richtung der Fangpunkt-Achse (durch die beiden
          // oberen Fangpunkte) im Ausgangszustand.
          const r0 = baseRect();
          const c0x = r0.left + r0.width / 2, c0y = r0.top + r0.height / 2;
          const tl0 = rotAbout(r0.left, r0.top, c0x, c0y, startRot);
          const tr0 = rotAbout(r0.left + r0.width, r0.top, c0x, c0y, startRot);
          const d0l = Math.hypot(tl0.x - ax, tl0.y - ay);
          const d0r = Math.hypot(tr0.x - ax, tr0.y - ay);
          const ref0 = d0r >= d0l ? tr0 : tl0;
          startAngle = (Math.atan2(ref0.y - ay, ref0.x - ax) * 180) / Math.PI;
        }
        let delta = a - startAngle;
        // Kürzesten Weg wählen, damit kein 360°-Sprung entsteht.
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        if (ev.shiftKey) {
          // Shift = feste Neigungswinkel (45°-Raster: 45°, 90°, 135°, …)
          const absTarget = Math.round((startRot + delta) / 45) * 45;
          delta = absTarget - startRot;
        }

        // Zentrumsversatz, damit der gewählte Fangpunkt exakt an Ort bleibt:
        // Rotation um den Anker = Rotation um das Zentrum + Verschiebung.
        const rc = baseRect();
        const cX = rc.left + rc.width / 2, cY = rc.top + rc.height / 2;
        const newC = rotAbout(cX, cY, ax, ay, delta);
        const dCx = newC.x - cX, dCy = newC.y - cY;
        // Ref synchron mitschreiben: ein Linksklick kann committen, bevor der
        // React-State-Update-Zyklus durch ist — sonst ginge die Drehung verloren.
        previewRef.current = { dxPx: dCx, dyPx: dCy, deltaDeg: delta, anchorFrac };
        pendingPreview = { dxPx: dCx, dyPx: dCy, deltaDeg: delta, anchorFrac };
        schedule();

        // CAD-Blatt: Der Cursor wird optisch auf der Linie durch die beiden
        // oberen Fangpunkte fixiert — dadurch ist die Drehung exakt ablesbar.
        if (cadHubUx) {
          const total = startRot + delta;
          const map = (px: number, py: number) => {
            const q = rotAbout(px, py, cX, cY, total);
            return { x: q.x + dCx, y: q.y + dCy };
          };
          const tl = map(rc.left, rc.top);
          const tr = map(rc.left + rc.width, rc.top);
          const vx = tr.x - tl.x, vy = tr.y - tl.y;
          const len2 = vx * vx + vy * vy;
          // Maus hart auf die Fangpunkt-Achse projizieren (bleibt exakt auf
          // Höhe des gewählten Fangpunkts).
          let mx = tx, my = ty;
          if (len2 > 1e-6) {
            const t = ((tx - tl.x) * vx + (ty - tl.y) * vy) / len2;
            mx = tl.x + vx * t;

            my = tl.y + vy * t;
          }
          const toPct = (cx: number, cy: number) => ({
            x: ((cx - pageRect.left) / Math.max(1, pageRect.width)) * 100,
            y: ((cy - pageRect.top) / Math.max(1, pageRect.height)) * 100,
          });
          // Achse über die Blattbreite hinaus verlängern (Orientierungshilfe).
          const ext = 0.6;
          const A = toPct(tl.x - vx * ext, tl.y - vy * ext);
          const B = toPct(tr.x + vx * ext, tr.y + vy * ext);
          const M = toPct(mx, my);
          const shown = ((startRot + delta) % 360 + 360) % 360;
          pendingAxis = { ax: A.x, ay: A.y, bx: B.x, by: B.y, mx: M.x, my: M.y, deg: shown };
          schedule();

        }
      }

    };

    const onDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const td = ev.target as HTMLElement | null;
      if (td?.closest?.('[data-tablet-aid="true"]')) return;
      hubDownClientRef.current = { x: ev.clientX, y: ev.clientY };
      // Drehen: Ein Linksklick setzt das Objekt sofort in der aktuellen
      // Drehstellung — schon beim Pointerdown, damit kein anderes Handling
      // (Canvas-Drag, Neuauswahl) dazwischenkommt.
      const wheelActiveNow = !!(window as any).__pixunaTabletCommit;
      if (hubMode === "rotate" && !wheelActiveNow && !hubSettledRef.current && startAngle !== null) {
        const t0 = ev.target as HTMLElement | null;
        if (t0?.closest("[data-hub-control]")) return;
        ev.preventDefault();
        ev.stopPropagation();
        hubSettledRef.current = true;
        hubDownClientRef.current = null;
        commit();
      }
    };

    // Linksklick-Abschluss: der CAD-Canvas verschluckt teilweise das native
    // "click"-Event (preventDefault auf pointerdown), deshalb hören wir
    // zusätzlich auf pointerup und behandeln beides identisch (mit Guard,
    // damit nicht doppelt commited wird).
    const handleClickLike = (ev: MouseEvent | PointerEvent) => {
      if (hubSettledRef.current) return;
      if ((ev as MouseEvent).button !== undefined && (ev as MouseEvent).button !== 0) return;
      // Nur reagieren, wenn der Klick NACH dem Start der HUB-Aktion begonnen hat
      // (sonst würde das Pointerup der Aktivierungs-Geste sofort committen).
      const downClient = hubDownClientRef.current;
      if (!downClient) return;
      if (Math.hypot(ev.clientX - downClient.x, ev.clientY - downClient.y) > 6) {
        hubDownClientRef.current = null;
        return;
      }
      const t = ev.target as HTMLElement | null;
      if (t?.closest('[data-hub-control], [data-tablet-aid="true"]')) return;
      ev.preventDefault();
      ev.stopPropagation();
      // Erneuter Klick auf den gewählten Fangpunkt (Anker) → Aktion bestätigen.
      const { clientX: ax0, clientY: ay0 } = liveAnchor();
      const p = previewRef.current;
      const ax = ax0 + (hubMode === "move" ? p.dxPx : 0);
      const ay = ay0 + (hubMode === "move" ? p.dyPx : 0);
      const wheelActive = !!(window as any).__pixunaTabletCommit;
      if (!wheelActive) {
        // Ohne Tablet-Hilfsrad setzt ein einfacher Linksklick das CAD-Blatt.
        hubDownClientRef.current = null;
        hubSettledRef.current = true;
        commit();
        return;
      }
      // Mit Tablet-Hilfsrad: NICHT committen — nur "carrying" togglen.
      if (hubMode === "move") {
        if (carryingRef.current) {
          // Ablegen: Preview einfrieren.
          setCarrying(false);
        } else {
          // Wieder aufnehmen: startClient neu setzen, damit Anker exakt am Cursor sitzt.
          modeStartClientRef.current = null;
          setCarrying(true);
        }
      } else {
        // Rotate: Klick bricht nicht ab und commited nicht.
      }

      hubDownClientRef.current = null;
    };
    const onContext = (ev: MouseEvent) => {
      // Rechtsklick während HUB-Aktion: Fangpunkt eines anderen Objekts anvisieren.
      // Es entsteht eine Hilfslinie (Kreuz + Strahl zum aktiven Anker), auf die
      // beim Verschieben/Drehen gefangen wird.
      const t = ev.target as HTMLElement | null;
      if (t?.closest("[data-hub-control]")) return;
      ev.preventDefault();
      ev.stopPropagation();
      const pageRect = parent.getBoundingClientRect();
      const m = findSnap(ev.clientX, ev.clientY, pageRect, 14);
      const xPct = m ? m.x : ((ev.clientX - pageRect.left) / Math.max(1, pageRect.width)) * 100;
      const yPct = m ? m.y : ((ev.clientY - pageRect.top) / Math.max(1, pageRect.height)) * 100;
      setGuides((g) => [...g, { id: Date.now() + Math.random(), xPct, yPct }]);
      // Strahl vom anvisierten Punkt zum aktuellen (Preview-)Anker dieses Elements.
      const p = previewRef.current;
      const { clientX: ax0, clientY: ay0 } = liveAnchor();
      const ax = ax0 + (hubMode === "move" ? p.dxPx : 0);
      const ay = ay0 + (hubMode === "move" ? p.dyPx : 0);
      const bx = ((ax - pageRect.left) / Math.max(1, pageRect.width)) * 100;
      const by = ((ay - pageRect.top) / Math.max(1, pageRect.height)) * 100;
      setRayGuides((g) => [...g.slice(-3), { id: Date.now() + Math.random(), ax: xPct, ay: yPct, bx, by }]);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" || ev.key === "Delete") { ev.stopPropagation(); ev.preventDefault(); cancel(); }
      else if (ev.key === "Enter") { ev.stopPropagation(); commit(); }
    };
    const onClick = (ev: MouseEvent) => handleClickLike(ev);
    const onUp = (ev: PointerEvent) => handleClickLike(ev);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("contextmenu", onContext, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("contextmenu", onContext, true);
      window.removeEventListener("keydown", onKey, true);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      hubDownClientRef.current = null;

      unregisterHubAbort();
      if (actionCommitRef.current === commit) actionCommitRef.current = null;
      if (actionCancelRef.current === cancel) actionCancelRef.current = null;
    };
  }, [hubMode, cadHubUx, el.x, el.y, el.w, el.h, el.rotation, onTransform]);


  const previewTransform = (() => {
    const parts: string[] = [];
    if (hubMode === "move" && (preview.dxPx !== 0 || preview.dyPx !== 0)) {
      parts.push(`translate(${preview.dxPx}px, ${preview.dyPx}px)`);
    }
    // Drehen: Rotation um das Zentrum + Zentrumsversatz — identisch zur
    // Commit-Mathematik, damit der Fangpunkt exakt an Ort bleibt.
    if (hubMode === "rotate") {
      if (preview.dxPx !== 0 || preview.dyPx !== 0) {
        parts.push(`translate(${preview.dxPx}px, ${preview.dyPx}px)`);
      }
      const totalDeg = (el.rotation ?? 0) + preview.deltaDeg;
      if (totalDeg) parts.push(`rotate(${totalDeg}deg)`);
    } else {
      const rot = el.rotation ?? 0;
      if (rot) parts.push(`rotate(${rot}deg)`);
    }
    return parts.length ? parts.join(" ") : undefined;
  })();

  const previewTransformOrigin: string | undefined = undefined;

  // Bilder/PDFs bekommen bei aktivem Tablet-Hilfsrad denselben HUB-Ablauf wie
  // CAD-Blätter: Funktion antippen → Fangpunkt mit dem Stift ziehen (Vorschau)
  // → ENTER bzw. Häkchen setzt final.
  const hubCapable = cadHubUx || (tabletActive && (el.kind === "image" || el.kind === "pdf"));
  const tabletCommitOnly = hubCapable && tabletActive && (!!hubMode || !!edgeTrim);
  // CAD-Blatt: Verschieben/Drehen ausschließlich von einem Fangpunkt aus.
  const anchorIsSnap = !cadHubUx || (!!anchorFracState && anchorFracState.key !== "interior");

  // CAD-Blätter bleiben in der normalen Ebenen-Hierarchie (unter der CAD-
  // Zeichenebene). Auswahl-Hitbox und Bedienelemente werden deshalb als
  // transparentes Overlay über die Zeichenebene portiert.
  const cadProxyStyle: React.CSSProperties = {
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    transform: previewTransform,
    transformOrigin: "center center",
  };
  const wrapCadChrome = (node: React.ReactNode): React.ReactNode => {
    if (!cadHubUx || !portalHost) return node;
    return createPortal(
      <div className="absolute" style={{ ...cadProxyStyle, zIndex: 60, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "auto",
            cursor: hubMode ? "crosshair" : "default",
          }}
          onPointerDown={handlePointerDown}
        />
        {node}
      </div>,
      portalHost,
    );
  };


  return (
    <div
      ref={rootRef}
      data-marquee-id={el.id}
      data-element-kind={el.kind}
      onPointerDown={handlePointerDown}
      className="absolute"
      style={{
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.w}%`,
        height: `${el.h}%`,
        outline: outlineStyle,
        outlineOffset: selected ? "1px" : undefined,
        cursor: readOnly ? "default" : (hubMode ? "crosshair" : (cadHubUx ? "default" : "move")),
        opacity: hubMode ? 0.7 : (el.opacity ?? 1),
        boxShadow: el.shadow ? "0 8px 24px -8px rgba(0,0,0,0.25)" : undefined,
        border: el.border ? "1px solid hsl(var(--ink))" : undefined,
        transform: previewTransform,
        transformOrigin: previewTransformOrigin ?? "center center",
        // CAD-Blätter folgen strikt der normalen Ebenen-Hierarchie und werden
        // deshalb NICHT über die CAD-Zeichenebene gehoben (sonst läge ein
        // CAD-Blatt der Default-Ebene vor Linien höherer Ebenen). Auswahl und
        // Bedienung laufen über das transparente Overlay (wrapCadChrome).
        zIndex: cadHubUx ? undefined : (showHub ? 80 : (elevated ? 30 : undefined)),
        touchAction: "none",
        // PDF/Bild/CAD-Blatt dürfen bei aktivem Zeichenwerkzeug keinen Pointer
        // abfangen — sonst stoppen neue Objekte an ihren Kanten und der
        // Radiergummi erreicht die darüberliegende CAD-Eingabeschicht nicht.
        pointerEvents: cadHubUx ? "none" : (((el.kind === "pdf" || el.kind === "image") && toolActive) ? "none" : undefined),

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
        <WarpedContent corners={el.warpCorners}>
          <img
            src={el.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            style={{ background: "hsl(var(--surface-muted))", ...buildEraseMaskCss(el.eraseCircles, el.wMm ?? 0, el.hMm ?? 0) }}
          />
        </WarpedContent>
      )}

      {el.kind === "note" && (
        <div
          className="w-full h-full p-3 text-sm"
          style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--ink))" }}
        >
          {el.text || "Notiz"}
        </div>
      )}
      {(el.kind === "cad-view" || el.kind === "cad-viewport") && (
        <div
          className="w-full h-full"
          style={buildEraseMaskCss(el.eraseCircles, el.wMm ?? 0, el.hMm ?? 0)}
        >
          <CadViewportViewHost element={el} />
        </div>
      )}

      {el.kind === "table" && (
        <TableElementView
          element={el}
          onChange={(patch) => onTransform?.(patch)}
        />
      )}

      {(el.kind === "shape" || el.kind === "line" || el.kind === "pdf" || el.kind === "timeline") && el.kind !== "pdf" && (
        <div
          className="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
          style={{ background: "hsl(var(--surface-muted))" }}
        >
          {el.kind}
        </div>
      )}

      {el.kind === "pdf" && (
        <WarpedContent corners={el.warpCorners}>
          <div className="w-full h-full">
            {el.pdfSourceB64 ? (
              <PdfPageView
                sourceB64={el.pdfSourceB64}
                pageIndex={el.pdfPageIndex ?? 0}
                deferDuringWorkspaceZoom
                maskStyle={buildEraseMaskCss(el.eraseCircles, el.wMm ?? 0, el.hMm ?? 0)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground" style={{ background: "hsl(var(--surface-muted))" }}>PDF</div>
            )}
          </div>

        </WarpedContent>
      )}


      {/* Photoshop-artige Ecken-/Kanten-Verzerrung: aktive Handles nur, wenn
          Bild/PDF selektiert ist UND der Nutzer im Inspector „Verzerren" an
          hat. Andere Werkzeug-Handles bleiben aktiv (kein Modal-Modus). */}
      {selected && (el.kind === "image" || el.kind === "pdf") && (
        <WarpTargetHandles
          elementId={el.id}
          corners={el.warpCorners}
          axis={el.warpAxis ?? "free"}
          containerRef={rootRef}
          onCommit={(next) => onTransform?.({ warpCorners: next } as any)}
        />
      )}

      {/* CAD-Blatt: transparente Auswahl-Hitbox über der Zeichenebene, solange
         das Blatt nicht ausgewählt ist. Das Blatt selbst bleibt in seiner Ebene. */}
      {cadHubUx && !readOnly && !selected && !toolActive && portalHost && createPortal(
        <div
          className="absolute"
          style={{ ...cadProxyStyle, zIndex: 29 }}
          onPointerDown={handlePointerDown}
        />,
        portalHost,
      )}

      {showHub && wrapCadChrome(
        <>
          {!tabletCommitOnly && !cadHubUx && (
            <>
              {/* Rotation stem — bei CAD-Blatt ausgeblendet: Drehen läuft nur über die HUB-Box. */}
              <div
                ref={rotateRef}
                data-hub-control
                onPointerDown={handleRotateStart}
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
            </>
          )}

          {/* Hub action bar — bei CAD-Blatt am zuletzt gewählten Anker,
             sonst wie gehabt oben rechts. */}
          {(() => {
            const anchored = cadHubUx && anchorFracState && anchorFracState.key !== "interior";
            // CAD-Blatt: Solange kein Fangpunkt (Ecke) gewählt ist, werden gar
            // keine Symbole gezeigt — statt ausgegrauter Buttons.
            if (cadHubUx && !anchored && !edgeTrim && !hubMode) return null;
            const hubStyle: React.CSSProperties = anchored
              ? {
                  left: `${anchorFracState!.fx * 100}%`,
                  top: `${anchorFracState!.fy * 100}%`,
                  transform: `translate(-50%, calc(-100% - 12px))`,
                  background: tabletCommitOnly ? "transparent" : "white",
                  border: tabletCommitOnly ? "none" : `1px solid hsl(var(--hairline))`,
                  padding: tabletCommitOnly ? 0 : 3,
                  pointerEvents: "auto",
                  zIndex: 10,
                }
              : {
                  right: 0,
                  top: -36,
                  background: tabletCommitOnly ? "transparent" : "white",
                  border: tabletCommitOnly ? "none" : `1px solid hsl(var(--hairline))`,
                  padding: tabletCommitOnly ? 0 : 3,
                  pointerEvents: "auto",
                  zIndex: 10,
                };
            return (
          <div
            data-hub-control
            className={`absolute flex items-center gap-1 rounded-md ${tabletCommitOnly ? "" : "shadow-md"}`}
            style={hubStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {tabletCommitOnly || (cadHubUx && !!edgeTrim) ? (
              <button
                data-hub-control
                onClick={(e) => {
                  e.stopPropagation();
                  actionCommitRef.current?.();
                }}
                title="Bestätigen"
                className="h-9 w-9 inline-flex items-center justify-center rounded-full shadow-md hover:bg-[hsl(var(--surface-muted))]"
                style={{ color: "hsl(140 60% 40%)", background: "white", border: "1px solid hsl(var(--hairline))" }}
              >
                <Check size={16} />
              </button>
            ) : hubCapable ? (
              <>
                {hubMode !== "rotate" && (
                  <button
                    data-hub-control
                    disabled={!anchorIsSnap}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!anchorIsSnap) return;
                      // WICHTIG: kein Start-Client setzen → Delta = Maus - Anker.
                      // Dadurch klebt der zuletzt gewählte Fangpunkt/Anker exakt
                      // unter dem Mauszeiger, sobald "Verschieben" aktiv ist.
                      modeStartClientRef.current = null;
                      setPreview({ dxPx: 0, dyPx: 0, deltaDeg: 0, anchorFrac: { x: 0.5, y: 0.5 } });
                      setEdgeTrim(null);
                      setActiveEdge(null);
                      setHubMode((m) => (m === "move" ? null : "move"));
                    }}
                    title={anchorIsSnap
                      ? "Verschieben — Anker folgt der Maus, klicken zum Setzen (ESC bricht ab)"
                      : "Zuerst einen Fangpunkt (Ecke/Kantenmitte) anklicken"}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))] ${hubMode === "move" ? "bg-[hsl(var(--surface-muted))]" : ""} ${anchorIsSnap ? "" : "opacity-40 cursor-not-allowed"}`}
                    style={{ color: hubMode === "move" ? (cadHubUx ? hubBlue : "hsl(var(--accent-gold))") : undefined }}
                  >
                    <Move size={14} strokeWidth={1.6} className="shrink-0" />
                  </button>
                )}
                {hubMode !== "move" && (
                  <button
                    data-hub-control
                    disabled={!anchorIsSnap}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!anchorIsSnap) return;
                      modeStartClientRef.current = { x: e.clientX, y: e.clientY };
                      setPreview({ dxPx: 0, dyPx: 0, deltaDeg: 0, anchorFrac: { x: 0.5, y: 0.5 } });
                      setEdgeTrim(null);
                      setActiveEdge(null);
                      setHubMode((m) => (m === "rotate" ? null : "rotate"));
                    }}
                    title={anchorIsSnap
                      ? "Drehen — Maus bewegen (Shift = 90°-Fang), dann klicken zum Setzen"
                      : "Zuerst einen Fangpunkt (Ecke/Kantenmitte) anklicken"}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))] ${hubMode === "rotate" ? "bg-[hsl(var(--surface-muted))]" : ""} ${anchorIsSnap ? "" : "opacity-40 cursor-not-allowed"}`}
                    style={{ color: hubMode === "rotate" ? (cadHubUx ? hubBlue : "hsl(var(--accent-gold))") : undefined }}
                  >
                    <RotateCw size={14} />
                  </button>
                )}

                {hubMode && tabletActive && (
                  <button
                    data-hub-control
                    onClick={(e) => {
                      e.stopPropagation();
                      actionCommitRef.current?.();
                    }}
                    title="Bestätigen (Tablet)"
                    className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
                    style={{ color: "hsl(140 60% 40%)" }}
                  >
                    <Check size={14} />
                  </button>
                )}
                {hubMode && (
                  <button
                    data-hub-control
                    onClick={(e) => {
                      e.stopPropagation();
                      actionCancelRef.current?.();
                    }}
                    title="Abbrechen"
                    className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
                  >
                    <X size={14} />
                  </button>
                )}
                {!hubMode && (el.kind === "image" || el.kind === "pdf") && (
                  <WarpHubButton elementId={el.id} />
                )}
              </>

            ) : (
              <>
                <button
                  data-hub-control
                  onClick={(e) => { e.stopPropagation(); onRotate?.(15); }}
                  title="Drehen +15°"
                  className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
                >
                  <RotateCw size={14} />
                </button>
                {(el.kind === "image" || el.kind === "pdf") && (
                  <WarpHubButton elementId={el.id} />
                )}
              </>
            )}
            {!tabletCommitOnly && !cadHubUx && (
              <button
                data-hub-control
                onClick={(e) => { e.stopPropagation(); onDuplicate?.(); }}
                title="Duplizieren"
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
              >
                <Copy size={14} />
              </button>
            )}
          </div>
            );
          })()}




          {/* Edge-Drag-Handles: Preview beim Ziehen, Commit erst bei Pointerup
             (bzw. Tablet-Häkchen). onEdgeDrag wird nur EINMAL mit dem Gesamt-
             Delta gerufen — kein jitterndes Store-Update während der Bewegung. */}
          {!tabletCommitOnly && !hubMode && (["top", "right", "bottom", "left"] as const).map((edge) => {
            const isHor = edge === "top" || edge === "bottom";
            const isActive = edgeTrim?.edge === edge;
            const edgeReady = activeEdge === edge;
            const startEdgeDrag = (e: React.PointerEvent) => {
              if (!onEdgeDrag) return;
              e.stopPropagation();
              e.preventDefault();
              if (cadHubUx && activeEdge !== edge && !edgeTrim) {
                setActiveEdge(edge);
                return;
              }
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
              const start = { x: e.clientX, y: e.clientY };
              setEdgeTrim({ edge, dxPx: 0, dyPx: 0 });
              setHubMode(null);
              setActiveEdge(edge);
              const move = (ev: PointerEvent) => {
                setEdgeTrim({ edge, dxPx: ev.clientX - start.x, dyPx: ev.clientY - start.y });
              };
              const commit = () => {
                const p = edgeTrimRef.current;
                if (p && (p.dxPx !== 0 || p.dyPx !== 0)) {
                  onEdgeDrag!(edge, p.dxPx, p.dyPx);
                }
                setEdgeTrim(null);
                setActiveEdge(null);
                actionCommitRef.current = null;
                actionCancelRef.current = null;
                unregisterTrimAbort?.(); unregisterTrimAbort = null;
              };
              let unregisterTrimAbort: (() => void) | null = null;
              const cancel = () => {
                setEdgeTrim(null);
                setActiveEdge(null);
                actionCommitRef.current = null;
                actionCancelRef.current = null;
                unregisterTrimAbort?.(); unregisterTrimAbort = null;
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", cancel);
              };
              actionCommitRef.current = commit;
              actionCancelRef.current = cancel;
              unregisterTrimAbort = registerAbort(() => cancel());
              let up: (ev: PointerEvent) => void;
              up = (ev: PointerEvent) => {
                try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", cancel);
                // Tablet-Modus und CAD-Blatt: nicht sofort committen —
                // der Schnitt wird erst per Häkchen bzw. ENTER gesetzt.
                if ((window as any).__pixunaTabletCommit || cadHubUx) {
                  return;
                }
                commit();
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
              window.addEventListener("pointercancel", cancel);
            };
            const baseStyle: React.CSSProperties = {
              position: "absolute",
              background: "transparent",
              // CAD-Blatt: Mauszeiger bleibt unverändert (nur über das Symbol schneiden).
              cursor: cadHubUx
                ? (isActive || edgeReady ? (isHor ? "ns-resize" : "ew-resize") : "default")
                : (isHor ? "ns-resize" : "ew-resize"),
              // Bedien-Overlay des CAD-Blatts hat pointerEvents:none — die
              // Kanten-Griffe müssen sie explizit wieder aktivieren.
              pointerEvents: "auto",
              zIndex: 5,
            };
            const sizeStyle: React.CSSProperties = isHor
              ? { left: 14, right: 14, height: 8, [edge === "top" ? "top" : "bottom"]: -4 }
              : { top: 14, bottom: 14, width: 8, [edge === "left" ? "left" : "right"]: -4 };
            const edgeStroke = cadHubUx ? hubBlue : "hsl(var(--accent-gold))";
            const EdgeSymbol = isHor ? ChevronsUpDown : ChevronsLeftRight;
            const hoverGlow = hoveredSnapKey === `edge-mid-${edge}` || hoveredSnapKey === `edge-line-${edge}`;
            return (
              <div
                key={edge}
                data-hub-control
                onPointerDown={startEdgeDrag}
                title={cadHubUx
                  ? `Kante ${edge}: nach außen ziehen erweitert den Ausschnitt, nach innen ziehen schneidet ab`
                  : `Kante ${edge} ziehen`}
                className="group"
                style={{ ...baseStyle, ...sizeStyle }}
              >
                <div
                  className="absolute"
                  style={
                    isHor
                      ? { left: 0, right: 0, top: "50%", height: hoverGlow || isActive || edgeReady ? 2 : 1, transform: "translateY(-50%)", background: edgeStroke, opacity: hoverGlow || isActive || edgeReady ? 1 : 0.45, boxShadow: hoverGlow || edgeReady ? `0 0 8px ${edgeStroke}` : undefined }
                      : { top: 0, bottom: 0, left: "50%", width: hoverGlow || isActive || edgeReady ? 2 : 1, transform: "translateX(-50%)", background: edgeStroke, opacity: hoverGlow || isActive || edgeReady ? 1 : 0.45, boxShadow: hoverGlow || edgeReady ? `0 0 8px ${edgeStroke}` : undefined }
                  }
                />
                {cadHubUx && (
                  <div
                    className={`absolute flex items-center justify-center rounded-full transition-opacity ${isActive || edgeReady ? "opacity-100" : "opacity-0"}`}
                    style={{
                      width: 18,
                      height: 18,
                      background: "white",
                      border: `1.5px solid ${edgeStroke}`,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                      color: edgeStroke,
                      ...(isHor
                        ? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
                        : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }),
                    }}
                  >
                    <EdgeSymbol size={12} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Edge-Trim-Preview: gestricheltes Rechteck des künftigen Rahmens.
             Wird nur beim aktiven Ziehen angezeigt und in Pixel-Deltas relativ
             zum Element-Rand positioniert. */}
          {edgeTrim && (() => {
            const insetLeft   = edgeTrim.edge === "left"   ?  edgeTrim.dxPx : 0;
            const insetRight  = edgeTrim.edge === "right"  ? -edgeTrim.dxPx : 0;
            const insetTop    = edgeTrim.edge === "top"    ?  edgeTrim.dyPx : 0;
            const insetBottom = edgeTrim.edge === "bottom" ? -edgeTrim.dyPx : 0;
            return (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: insetLeft, right: insetRight, top: insetTop, bottom: insetBottom,
                  border: cadHubUx ? `1.5px dashed ${hubBlue}` : "1.5px dashed hsl(var(--accent-gold))",
                  background: cadHubUx ? "rgba(77,163,255,0.08)" : "hsl(var(--accent-gold) / 0.06)",
                  zIndex: 7,
                }}
              />
            );
          })()}


          {/* Ecken-Handles: quadratisch + blau bei CAD-Blatt, sonst rund + gold */}
          {!tabletCommitOnly && (["tl", "tr", "bl", "br"] as const).map((corner) => {
            // Bei CAD-Blatt: Ecken sind Snap-Marker + Anker-Setzer (kein Trim/Resize).
            // Bei anderen Elementen (image/pdf): Ecken skalieren wie gehabt.
            const cornerDraggable = !isCadView && !!onCornerDrag;
            const startCornerDrag = (e: React.PointerEvent) => {
              if (!cornerDraggable || !onCornerDrag) return;
              e.stopPropagation();
              e.preventDefault();
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
              let last = { x: e.clientX, y: e.clientY };
              const move = (ev: PointerEvent) => {
                const dx = ev.clientX - last.x;
                const dy = ev.clientY - last.y;
                onCornerDrag(corner, dx, dy, ev.shiftKey);
                last = { x: ev.clientX, y: ev.clientY };
              };
              const up = (ev: PointerEvent) => {
                try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
              window.addEventListener("pointercancel", up);
            };
            const cornerClickCad = (e: React.PointerEvent) => {
              const key = `corner-${corner}`;
              // Ein zweiter Linksklick auf den bereits aktiven Fangpunkt setzt
              // die laufende CAD-Blatt-Vorschau sofort ab. Der Handle ist als
              // HUB-Control markiert und würde sonst vom globalen Commit-Handler
              // bewusst übersprungen.
              if (hubMode && anchorFracRef.current?.key === key) {
                e.stopPropagation();
                e.preventDefault();
                if (!!(window as any).__pixunaTabletCommit) {
                  modeStartClientRef.current = null;
                  setCarrying(true);
                  return;
                }
                actionCommitRef.current?.();
                return;
              }
              // Nur Anker setzen — kein Drag, keine Deselektion.
              e.stopPropagation();
              e.preventDefault();
              const fx = corner === "tl" || corner === "bl" ? 0 : 1;
              const fy = corner === "tl" || corner === "tr" ? 0 : 1;
              setAnchor({ fx, fy, key });
              onSelect?.({ shift: e.shiftKey });
              if (hubMode && !!(window as any).__pixunaTabletCommit) {
                modeStartClientRef.current = null;
                setCarrying(true);
              }
            };
            const isTop = corner === "tl" || corner === "tr";
            const isLeft = corner === "tl" || corner === "bl";
            const cursor = cornerDraggable
              ? (corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize")
              : "default";
            // CAD-Blatt: Fangpunkte blau, sonst gold.
            const size = 12;
            const glow = hoveredSnapKey === `corner-${corner}`;
            const isAnchor = cadHubUx && anchorFracState?.key === `corner-${corner}`;
            const stroke = cadHubUx ? hubBlue : "hsl(var(--accent-gold))";
            const fill = (glow || isAnchor) ? stroke : "white";
            const shadowActive = cadHubUx
              ? "0 0 0 3px rgba(77,163,255,0.35), 0 0 10px rgba(77,163,255,0.9)"
              : "0 0 0 3px hsl(var(--accent-gold) / 0.35), 0 0 10px hsl(var(--accent-gold))";

            return (
              <div
                key={corner}
                data-hub-control
                onPointerDown={cornerDraggable ? startCornerDrag : (cadHubUx ? cornerClickCad : undefined)}
                title={cadHubUx ? "Fangpunkt / Anker für Verschieben & Drehen" : "Ecke skalieren (Shift: proportional)"}
                className="absolute"
                style={{
                  [isTop ? "top" : "bottom"]: -Math.floor(((glow || isAnchor) ? size + 4 : size) / 2),
                  [isLeft ? "left" : "right"]: -Math.floor(((glow || isAnchor) ? size + 4 : size) / 2),
                  width: (glow || isAnchor) ? size + 4 : size,
                  height: (glow || isAnchor) ? size + 4 : size,
                  borderRadius: 999,
                  background: fill,
                  border: `2px solid ${stroke}`,
                  boxShadow: (glow || isAnchor) ? shadowActive : "0 1px 3px rgba(0,0,0,0.25)",
                  transition: "width 90ms, height 90ms, background 90ms, box-shadow 90ms",
                  cursor,
                  pointerEvents: (cornerDraggable || cadHubUx) ? "auto" : "none",
                  zIndex: 15,
                } as React.CSSProperties}
              />
            );
          })}

          {/* CAD-Blatt: Kantenmitten sind bewusst KEINE Fangpunkte mehr —
             nur die vier Ecken dienen als Anker für Verschieben/Drehen. */}



        </>

      )}

      {/* Rechtsklick-Hilfslinien während einer HUB-Aktion. Werden per Portal
         in das Seiten-Parent gerendert, damit sie über das gesamte Blatt
         verlaufen. Werden beim Commit/Cancel automatisch geleert. */}
      {cadHubUx && hubMode && guides.length > 0 && rootRef.current?.parentElement && createPortal(
        <>
          {guides.map((g) => (
            <React.Fragment key={g.id}>
              {/* Achsen — identisch zur CAD-Oberfläche (GlobalGuides):
                 1px, gestrichelt 5/6, rgba(77,163,255,0.38). */}
              <div
                data-guide-overlay
                className="absolute pointer-events-none"
                style={{
                  left: 0, right: 0, top: `${g.yPct}%`, height: 0,
                  borderTop: "1px dashed rgba(77,163,255,0.38)",
                  zIndex: 900,
                }}
              />
              <div
                data-guide-overlay
                className="absolute pointer-events-none"
                style={{
                  top: 0, bottom: 0, left: `${g.xPct}%`, width: 0,
                  borderLeft: "1px dashed rgba(77,163,255,0.38)",
                  zIndex: 900,
                }}
              />
              {/* Anker-Punkt wie im CAD: blauer Kern mit weißem Rand. */}
              <div
                data-guide-overlay
                className="absolute pointer-events-none rounded-full"
                style={{
                  left: `${g.xPct}%`, top: `${g.yPct}%`,
                  width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5,
                  background: "rgba(77,163,255,0.95)",
                  border: "1.5px solid rgba(255,255,255,0.95)",
                  boxSizing: "border-box",
                  zIndex: 901,
                }}
              />
            </React.Fragment>
          ))}
        </>,
        rootRef.current.parentElement,
      )}

      {/* Rechtsklick-Strahlen: Orientierungs-/Fanglinie vom gewählten Fremd-
         Fangpunkt bis zum aktiven Fangpunkt dieses Elements. */}
      {rayGuides.length > 0 && rootRef.current?.parentElement && createPortal(
        <svg
          data-guide-overlay
          className="absolute inset-0 pointer-events-none"
          style={{ width: "100%", height: "100%", zIndex: 910 }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {rayGuides.map((g) => (
            <g key={g.id}>
              <line
                x1={g.ax} y1={g.ay} x2={g.bx} y2={g.by}
                stroke="rgba(77,163,255,0.38)"
                strokeWidth={1}
                strokeDasharray="5 6"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>,
        rootRef.current.parentElement,
      )}
      {/* Anker-Punkte der Strahlen (kreisrund, unabhängig vom SVG-Stretch). */}
      {rayGuides.length > 0 && rootRef.current?.parentElement && createPortal(
        <>
          {rayGuides.map((g) => (
            <div
              key={`ray-dot-${g.id}`}
              data-guide-overlay
              className="absolute pointer-events-none rounded-full"
              style={{
                left: `${g.ax}%`, top: `${g.ay}%`,
                width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5,
                background: "rgba(77,163,255,0.95)",
                border: "1.5px solid rgba(255,255,255,0.95)",
                boxSizing: "border-box",
                zIndex: 911,
              }}
            />
          ))}
        </>,
        rootRef.current.parentElement,
      )}


      {/* CAD-Blatt drehen: Achse durch die beiden oberen Fangpunkte, der
         Cursor sitzt fixiert auf dieser Linie. Linksklick setzt das Blatt. */}
      {rotAxis && rootRef.current?.parentElement && createPortal(
        <>
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ width: "100%", height: "100%", zIndex: 915 }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <line
            x1={rotAxis.ax} y1={rotAxis.ay} x2={rotAxis.bx} y2={rotAxis.by}
            stroke="hsl(var(--accent-gold))"
            strokeWidth={0.12}
            strokeDasharray="1.2 0.8"
            vectorEffect="non-scaling-stroke"
            opacity={0.9}
          />
          
        </svg>
        </>,
        rootRef.current.parentElement,
      )}



    </div>
  );
}


/** Vorschau-Bild eines CAD-Sheets. Liest live aus dem projectStore und
 *  zeigt den `thumbnail` (PNG aus dem CAD-Editor). Fallback: dezenter
 *  Platzhalter, wenn das Sheet noch nie im CAD geöffnet wurde. */
/** Rastert die aktuelle CAD-Ansicht eines platzierten Blatts in eine PNG-DataURL
 *  („Pixel"-Objektart). Gibt null zurück, wenn keine Szene vorhanden ist. */
function renderCadViewSnapshot(
  element: PageElement,
  sheet?: import("@/lib/projectStore").Sheet,
): string | null {
  const sceneJson = sheet?.sceneJson;
  const paperWmm = element.wMm ?? 0;
  const paperHmm = element.hMm ?? 0;
  if (!sceneJson || !(paperWmm > 0) || !(paperHmm > 0)) return null;
  const PX_PER_MM = 8;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(paperWmm * PX_PER_MM));
  canvas.height = Math.max(1, Math.round(paperHmm * PX_PER_MM));
  let labels: any = null;
  if (sheet?.labelsJson) { try { labels = JSON.parse(sheet.labelsJson); } catch { labels = null; } }
  try {
    renderSceneRegionToCanvas({
      canvas,
      sceneJson,
      labelsJson: labels,
      paperWmm,
      paperHmm,
      scaleDen: element.scaleDen ?? parseScaleDen(element.scale ?? sheet?.scale) ?? 100,
      centerM: element.modelCenterM ?? { x: 0, y: 0 },
      rotationDeg: element.viewportRotationDeg ?? 0,
    });
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("[CadView] Pixel-Rasterung fehlgeschlagen:", err);
    return null;
  }
}

function CadViewportViewHost({ element }: { element: PageElement }) {
  const projects = useProjects();
  const { sheet } = React.useMemo(() => {
    let s: import("@/lib/projectStore").Sheet | undefined;
    if (element.sheetId) {
      for (const p of projects) {
        const hit = p.sheets.find((x) => x.id === element.sheetId);
        if (hit) { s = hit; break; }
      }
    }
    return { sheet: s };
  }, [projects, element.sheetId]);
  // Automatische Aktualisierung ist pro CAD-Blatt-Objekt einstellbar.
  const autoUpdate = element.autoUpdate !== false;
  return (
    <CadViewportView
      element={element}
      sheet={sheet}
      paperWmm={element.wMm}
      paperHmm={element.hMm}
      autoUpdate={autoUpdate}
      showScaleCheck={false}

    />
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
  documentImporting,
  onDocumentImport,
  onDocumentLibrary,
  docScale,
  onDocScaleChange,
  docFreePlace,
  onDocFreePlaceChange,
  onCadLineSnapChange,
  onCadDuplicateSegments,
  updateToolSettings,

  pendingTableId,
  tableModifyMode,
  setTableModifyMode,
  tableFormulaFn,
  setTableFormulaFn,
  onConfirmTable,
  onCancelTable,

  onJumpCad,
  onCollapse,
  cadEngine,
  helpOn,
}: {
  projectId: string;
  page?: import("@/lib/projectStore").ProjectPage;
  element?: PageElement;
  tab: "settings" | "tools" | "layers";
  setTab: (t: "settings" | "tools" | "layers") => void;
  project: import("@/lib/projectStore").Project;
  activeTool: PageTool;
  setActiveTool: (t: PageTool) => void;
  selectedCadTool?: "line" | "free" | "text" | "hatch" | "guide";
  selectedElementId?: string;
  selectedElementIds?: string[];
  setSelectedElementId: (id?: string) => void;
  toolSettings: ToolSettings;
  cadSelectionCount?: number;
  cadSelectedLineSnap?: { midpoint: boolean; division: number | null; isGuide: boolean } | null;
  documentImporting?: boolean;
  onDocumentImport?: () => void;
  onDocumentLibrary?: () => void;
  docScale?: string;
  onDocScaleChange?: (s: string) => void;
  docFreePlace?: boolean;
  onDocFreePlaceChange?: (v: boolean) => void;
  onCadLineSnapChange?: (patch: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
  onCadDuplicateSegments?: () => void;
  updateToolSettings: <K extends keyof ToolSettings>(k: K, patch: Partial<ToolSettings[K]>) => void;

  pendingTableId?: string | null;
  tableModifyMode?: boolean;
  setTableModifyMode?: (v: boolean) => void;
  tableFormulaFn?: FormulaFn | null;
  setTableFormulaFn?: (f: FormulaFn | null) => void;
  onConfirmTable?: () => void;
  onCancelTable?: () => void;

  onJumpCad: (sheetId?: string) => void;
  onCollapse?: () => void;
  cadEngine?: import("@/cad/embed/MiniCad").MiniCad | null;
  /** Hilfe-Modus aktiv → Hinweis über der Ebenenliste einblenden. */
  helpOn?: boolean;
}) {

  const layerCount = page?.elements.length ?? 0;
  return (
    <aside
      className="w-[280px] shrink-0 border-l flex flex-col text-[11px]"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] shrink-0 border-b items-stretch" style={{ borderColor: "hsl(var(--hairline))" }}>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} label="Seiten" icon={<Settings size={12} />} />
        <TabButton active={tab === "tools"} onClick={() => setTab("tools")} label="Werkzeug" icon={<Settings size={12} />} />
        <TabButton
          active={tab === "layers"}
          onClick={() => setTab("layers")}
          label="Ebenen"
          icon={<Layers size={12} />}
          badge={layerCount > 0 ? layerCount : undefined}
        />
        <button
          onClick={onCollapse}
          title="Einklappen"
          className="w-8 flex items-center justify-center hover:bg-muted border-l"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <PanelRightClose size={12} className="text-muted-foreground" />
        </button>
      </div>

      <DragScrollDiv axis="y" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 cursor-grab active:cursor-grabbing">
        <div className="min-w-0 space-y-2">
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
              documentImporting={documentImporting}
              onDocumentImport={onDocumentImport}
              onDocumentLibrary={onDocumentLibrary}
              docScale={docScale}
              onDocScaleChange={onDocScaleChange}
              docFreePlace={docFreePlace}
              onDocFreePlaceChange={onDocFreePlaceChange}
              onCadLineSnapChange={onCadLineSnapChange}
              onCadDuplicateSegments={onCadDuplicateSegments}
              updateToolSettings={updateToolSettings}
              onJumpCad={onJumpCad}
              cadEngine={cadEngine ?? null}
              pendingTableId={pendingTableId ?? null}
              tableModifyMode={!!tableModifyMode}
              setTableModifyMode={setTableModifyMode}
              tableFormulaFn={tableFormulaFn ?? null}
              setTableFormulaFn={setTableFormulaFn}
              onConfirmTable={onConfirmTable}
              onCancelTable={onCancelTable}
            />
          )}
          {tab === "tools" && activeTool !== "guide" && activeTool !== "text" && activeTool !== "eraser" && activeTool !== null && activeTool !== "pipette" && activeTool !== "document" && activeTool !== "cad" && !isLinePageTool(activeTool) && (
            <ToolHelpNotes toolId={activeTool} />
          )}
          {tab === "layers" && page && (
            <div className="space-y-4">
              {helpOn && (
                <div
                  className="rounded-lg px-3 py-2 text-[11px] font-medium"
                  style={{ background: "hsl(220 18% 16%)", color: "hsl(0 0% 100% / 0.92)" }}
                >
                  Höchste Ebene = Im Vordergrund
                </div>
              )}
              {/* Ein einziges Ebenen-/Bezeichnungs-ID-System — identisch zur
                 CAD-Oberfläche. CAD-Blätter, Dokumente, Notizen, Tabellen
                 usw. werden über den `externalLabelCounter`-Hook direkt in
                 die jeweilige ID-Zeile eingezählt (siehe useEffect unten),
                 damit es kein Parallel-Panel gibt. */}
              {cadEngine && <CadIdPanelHost engine={cadEngine} />}
              {cadEngine && (
                <PageElementLabelCounterBridge engine={cadEngine} page={page} />
              )}
            </div>
          )}
        </div>
      </DragScrollDiv>
    </aside>
  );
}


function TabButton({
  active,
  onClick,
  label,
  badge,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 truncate px-2 py-2 text-[11px] font-medium transition-colors relative flex items-center justify-center gap-1"
      style={{
        background: active ? "hsl(var(--surface-card))" : "hsl(var(--surface-muted))",
        color: active ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
        borderBottom: active ? "2px solid hsl(var(--accent-gold))" : "2px solid transparent",
      }}
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span
          className="text-[9px] px-1 py-0.5 rounded-full align-middle"
          style={{ background: "hsl(var(--accent-gold))", color: "white" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}


function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2 text-[11px]">
      <span className="text-muted-foreground truncate">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FreeDimInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = React.useState(String(value));
  const focused = React.useRef(false);
  React.useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  const commit = () => {
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n)) {
      const clamped = Math.max(50, Math.min(2000, Math.round(n)));
      onCommit(clamped);
      setText(String(clamped));
    } else {
      setText(String(value));
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-full h-8 px-2 rounded bg-transparent border text-sm"
      style={{ borderColor: "hsl(var(--hairline))" }}
    />
  );
}

function FreeFormatEditor({ width, height, onCommit }: { width: number; height: number; onCommit: (w: number, h: number) => void }) {
  const [w, setW] = React.useState(String(width));
  const [h, setH] = React.useState(String(height));
  React.useEffect(() => { setW(String(width)); }, [width]);
  React.useEffect(() => { setH(String(height)); }, [height]);
  const dirty = Number(w.replace(",", ".")) !== width || Number(h.replace(",", ".")) !== height;
  const clamp = (n: number) => Math.max(50, Math.min(2000, Math.round(n)));
  const commit = () => {
    const wn = Number(w.replace(",", "."));
    const hn = Number(h.replace(",", "."));
    if (!Number.isFinite(wn) || !Number.isFinite(hn)) return;
    const nw = clamp(wn), nh = clamp(hn);
    setW(String(nw));
    setH(String(nh));
    onCommit(nw, nh);
  };
  const inputStyle = { borderColor: "hsl(var(--hairline))" } as const;
  return (
    <>
      <Row label="Breite (mm)">
        <input
          type="text"
          inputMode="decimal"
          value={w}
          onChange={(e) => setW(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={inputStyle}
        />
      </Row>
      <Row label="Höhe (mm)">
        <input
          type="text"
          inputMode="decimal"
          value={h}
          onChange={(e) => setH(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          className="w-full h-8 px-2 rounded bg-transparent border text-sm"
          style={inputStyle}
        />
      </Row>
      <div className="flex justify-end">
        <button
          onClick={commit}
          disabled={!dirty}
          className="h-7 px-3 rounded text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          title="Neues Papierformat übernehmen"
        >
          Bestätigen
        </button>
      </div>
    </>
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
  const project = useProject(projectId);
  const spreadMembers = page.spreadId
    ? (project?.pages.filter((x) => x.spreadId === page.spreadId).sort((a, b) => (a.spreadIndex ?? 0) - (b.spreadIndex ?? 0)) ?? [])
    : [];
  const inSpread = spreadMembers.length >= 2;
  const pageIndex = project?.pages.findIndex((x) => x.id === page.id) ?? -1;
  const prevPage = pageIndex > 0 ? project?.pages[pageIndex - 1] : undefined;
  const nextPage = pageIndex >= 0 ? project?.pages[pageIndex + 1] : undefined;
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
              onChange={(e) => {
                const next = e.target.value as PageFormat;
                if (next === "frei") {
                  update({
                    format: next,
                    customWidthMm: page.customWidthMm ?? 400,
                    customHeightMm: page.customHeightMm ?? 300,
                  });
                } else {
                  update({ format: next });
                }
              }}
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
          {page.format === "frei" ? (
            <FreeFormatEditor
              width={page.customWidthMm ?? 400}
              height={page.customHeightMm ?? 300}
              onCommit={(w, h) => update({ customWidthMm: w, customHeightMm: h })}
            />
          ) : (

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
          )}
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

      <div>
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
          SEITENANSICHT (VERBUND)
        </div>
        <div className="space-y-3">
          {!inSpread ? (
            <>
              <div className="text-[11px] text-muted-foreground">
                Einzelseite. Zum Erstellen einer Doppelseite mit einer benachbarten Seite verbinden — oder an einen bestehenden Verbund anfügen.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!prevPage}
                  onClick={() => {
                    if (!prevPage) return;
                    if (prevPage.spreadId) {
                      projectStore.addPageToSpread(projectId, prevPage.spreadId, page.id);
                    } else {
                      projectStore.linkPagesToSpread(projectId, [prevPage.id, page.id]);
                    }
                  }}
                  className="flex-1 h-8 rounded border text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                  title={prevPage?.spreadId ? "An vorherigen Verbund anhängen" : "Mit vorheriger Seite verbinden"}
                >
                  <Link2 size={12} /> {prevPage?.spreadId ? "an vorherigen Verbund" : "vorherige"}
                </button>
                <button
                  type="button"
                  disabled={!nextPage}
                  onClick={() => {
                    if (!nextPage) return;
                    if (nextPage.spreadId) {
                      projectStore.addPageToSpread(projectId, nextPage.spreadId, page.id);
                    } else {
                      projectStore.linkPagesToSpread(projectId, [page.id, nextPage.id]);
                    }
                  }}
                  className="flex-1 h-8 rounded border text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                  title={nextPage?.spreadId ? "An nächsten Verbund anhängen" : "Mit nächster Seite verbinden"}
                >
                  <Link2 size={12} /> {nextPage?.spreadId ? "an nächsten Verbund" : "nächste"}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!page.spreadExcluded}
                  onChange={(e) => update({ spreadExcluded: !e.target.checked })}
                />
                Diese Seite berücksichtigen
              </label>

            </>
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">
                Teil eines Verbunds aus <strong>{spreadMembers.length}</strong> Seiten
                (Position {(page.spreadIndex ?? 0) + 1}).
              </div>
              <Row label="Layout">
                <select
                  value={page.spreadLayoutMode ?? "grid"}
                  onChange={(e) => projectStore.setSpreadLayoutMode(projectId, page.spreadId!, e.target.value as "grid" | "free")}
                  className="w-full h-8 px-2 rounded bg-transparent border text-sm"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                >
                  <option value="grid">Doppelseite (nebeneinander)</option>
                  <option value="free">Freie Anordnung</option>
                </select>
              </Row>
              {(page.spreadLayoutMode ?? "grid") === "free" && (
                <Row label="Anordnung">
                  <button
                    type="button"
                    onClick={() =>
                      projectStore.setSpreadLayoutLocked(
                        projectId,
                        page.spreadId!,
                        !page.spreadLayoutLocked,
                      )
                    }
                    className="w-full h-8 rounded border text-xs flex items-center justify-center gap-1.5"
                    style={{
                      borderColor: "hsl(var(--hairline))",
                      background: page.spreadLayoutLocked ? "hsl(var(--accent-gold) / 0.12)" : "transparent",
                    }}
                    title={page.spreadLayoutLocked ? "Anordnung ist gesperrt — Klick zum Entsperren" : "Anordnung sperren (Ziehen deaktivieren)"}
                  >
                    {page.spreadLayoutLocked ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
                    {page.spreadLayoutLocked ? "Anordnung gesperrt" : "Anordnung sperren"}
                  </button>
                </Row>
              )}
              {nextPage && !nextPage.spreadId && (
                <button
                  type="button"
                  onClick={() => projectStore.addPageToSpread(projectId, page.spreadId!, nextPage.id)}
                  className="w-full h-8 rounded border text-xs flex items-center justify-center gap-1.5"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                >
                  <Link2 size={12} /> Nächste Seite anfügen
                </button>
              )}
              <button
                type="button"
                onClick={() => projectStore.removePageFromSpread(projectId, page.id)}
                className="w-full h-8 rounded border text-xs flex items-center justify-center gap-1.5"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                <Link2Off size={12} /> Diese Seite aus Verbund lösen
              </button>
              <button
                type="button"
                onClick={() => {
                  const n = projectStore.applySpreadPatternToRest(projectId, page.spreadId!);
                  if (n > 0) {
                    // eslint-disable-next-line no-alert
                    alert(`Muster auf ${n} weitere Verbund${n === 1 ? "" : "e"} angewendet.`);
                  } else {
                    // eslint-disable-next-line no-alert
                    alert("Keine weiteren passenden Seiten gefunden.");
                  }
                }}
                className="w-full h-8 rounded text-xs font-medium"
                style={{ background: "hsl(var(--accent-gold))", color: "white" }}
                title="Muster (N Seiten) auf alle nachfolgenden Seiten anwenden"
              >
                Für alle übernehmen
              </button>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!page.spreadExcluded}
                  onChange={(e) => update({ spreadExcluded: !e.target.checked })}
                />
                Diese Seite berücksichtigen
              </label>

            </>
          )}
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
  documentImporting,
  onDocumentImport,
  onDocumentLibrary,
  docScale,
  onDocScaleChange,
  docFreePlace,
  onDocFreePlaceChange,
  onCadLineSnapChange,
  onCadDuplicateSegments,
  updateToolSettings,
  onJumpCad,
  cadEngine,
  pendingTableId,
  tableModifyMode,
  setTableModifyMode,
  tableFormulaFn,
  setTableFormulaFn,
  onConfirmTable,
  onCancelTable,
}: {
  projectId: string;
  pageId?: string;
  element?: PageElement;
  project: import("@/lib/projectStore").Project;
  activeTool: PageTool;
  setActiveTool: (t: PageTool) => void;
  selectedCadTool?: "line" | "free" | "text" | "hatch" | "guide";
  selectedElementId?: string;
  selectedElementIds?: string[];
  setSelectedElementId: (id?: string) => void;
  toolSettings: ToolSettings;
  cadSelectionCount?: number;
  cadSelectedLineSnap?: { midpoint: boolean; division: number | null; isGuide: boolean } | null;
  documentImporting?: boolean;
  onDocumentImport?: () => void;
  onDocumentLibrary?: () => void;
  docScale?: string;
  onDocScaleChange?: (s: string) => void;
  docFreePlace?: boolean;
  onDocFreePlaceChange?: (v: boolean) => void;
  onCadLineSnapChange?: (patch: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
  onCadDuplicateSegments?: () => void;
  updateToolSettings: <K extends keyof ToolSettings>(k: K, patch: Partial<ToolSettings[K]>) => void;

  onJumpCad: (sheetId?: string) => void;
  cadEngine?: import("@/cad/embed/MiniCad").MiniCad | null;
  pendingTableId?: string | null;
  tableModifyMode?: boolean;
  setTableModifyMode?: (v: boolean) => void;
  tableFormulaFn?: FormulaFn | null;
  setTableFormulaFn?: (f: FormulaFn | null) => void;
  onConfirmTable?: () => void;
  onCancelTable?: () => void;
}) {
  const cadDocSelected = useCadDocumentSelected(cadEngine ?? null);

  const settingsTool = activeTool ?? selectedCadTool ?? null;
  const settingsPage = (pageId ? project.pages.find((candidate) => candidate.id === pageId) : undefined)
    ?? project.pages[0];
  const guidePxPerMm = settingsPage
    ? mappePagePxPerMm(getPageSizeMm(settingsPage).wMm)
    : 1;
  return (
    <div className="space-y-3">

      {/* "Aktives Werkzeug"-Kopfzeile entfernt — der Nutzer weiß, welches
          Werkzeug er in der Rail angeklickt hat. */}

      {/* Ebenen-Auswahl — bestimmt, in welche Ebene neu gezeichnete Objekte
          landen. Analog zum "Ebene"-Dropdown in der CAD-Oberfläche. */}
      {cadEngine && settingsTool && settingsTool !== "cad" && settingsTool !== "pipette" && (
        <EbeneSelect engine={cadEngine} />
      )}

      {/* Per-tool settings */}

      {/* Rahmen-Modus (Berühren / Umschließen) liegt jetzt als Flyout links am
          Auswahl-Symbol — kein eigenes Panel mehr in den Werkzeugeinstellungen. */}
      {settingsTool === "guide" && (
        <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <GuideSettings
            settings={toolSettings.guide}
            pxPerMm={guidePxPerMm}
            onChange={(p) => updateToolSettings("guide", p)}
          />
        </div>
      )}
      {(settingsTool === "line" || settingsTool === "free") && (
        <LineModeSelect
          value={settingsTool === "free" ? "free" : "line"}
          onChange={(next) => { if (next !== settingsTool) setActiveTool(next); }}
        />
      )}
      {settingsTool === "line" && cadEngine && (
        <>
          <LineShapeModeSelect app={cadEngine} />
          <RasterModeToggle app={cadEngine} projectId={projectId} />
        </>
      )}

      {settingsTool === "line" && (
        <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <LineSettings
            settings={toolSettings.line}
            pxPerMm={guidePxPerMm}
            onChange={(p) => updateToolSettings("line", p)}
          />
        </div>
      )}
      {settingsTool === "free" && cadEngine && (
        <>
          <RasterModeToggle app={cadEngine} projectId={projectId} />
          <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
            <FreeDrawSettingsPanel app={cadEngine} projectId={projectId} pxPerMm={guidePxPerMm} hideChrome />
          </div>
        </>
      )}
      {settingsTool === "eraser" && cadEngine && (
        <>
          <EraserModeSelect app={cadEngine} rasterSelection={element ? element.kind === "image" : null} />
          <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
            <EraserSettingsPanel app={cadEngine} rasterSelection={element ? element.kind === "image" : null} />
          </div>
        </>
      )}
      {settingsTool === "pipette" && cadEngine && (
        <SettingsBlock title="PIPETTE">
          <PipetteSettingsPanel app={cadEngine} />
        </SettingsBlock>
      )}
      {settingsTool === "hatch" && cadEngine && (
        <>
          <HatchModeSelect app={cadEngine} />
          <RasterModeToggle app={cadEngine} projectId={projectId} />
          <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
            <HatchSettingsPanel app={cadEngine} projectId={projectId} pxPerMm={guidePxPerMm} hideChrome />
          </div>
        </>
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

      {settingsTool === "text" && cadEngine && (
        <RasterModeToggle app={cadEngine} projectId={projectId} />
      )}
      {settingsTool === "text" && (
        <>
          <TextModeSelect
            settings={toolSettings.text}
            onChange={(p) => updateToolSettings("text", p)}
          />
          <div className="rounded-md border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
            <TextSettings
              settings={toolSettings.text}
              pxPerMm={guidePxPerMm}
              onChange={(p) => updateToolSettings("text", p)}
              hideMode
            />
          </div>
        </>
      )}
      {settingsTool === "document" && !cadDocSelected && (
        <DocumentToolSettings importing={!!documentImporting} onImport={onDocumentImport} onOpenLibrary={onDocumentLibrary} scale={docScale ?? "1:100"} onScaleChange={onDocScaleChange} freePlace={!!docFreePlace} onFreePlaceChange={onDocFreePlaceChange} />
      )}

      {/* Tabellen-Werkzeug — Placement-Preview + Modifikation */}
      {pageId && (settingsTool === "table" || (!activeTool && element?.kind === "table")) && (
        <TableToolSettings
          projectId={projectId}
          pageId={pageId}
          tableElement={element?.kind === "table" ? element : undefined}
          isPending={!!pendingTableId && element?.id === pendingTableId}
          modifyMode={!!tableModifyMode}
          setModifyMode={(v) => setTableModifyMode?.(v)}
          formulaFn={tableFormulaFn ?? null}
          setFormulaFn={(f) => setTableFormulaFn?.(f)}
          onConfirm={() => onConfirmTable?.()}
          onCancel={() => onCancelTable?.()}
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
          cadEngine={cadEngine ?? null}
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

      {/* CAD-Dokument-Inspector: erscheint, sobald ein CAD-Dokument
          (scene.documents) im Auswahl-Tool selektiert ist. */}
      {(!activeTool || settingsTool === "document") && cadEngine && (
        <CadDocumentInspector engine={cadEngine} />
      )}
    </div>
  );
}

function EbeneSelect({ engine }: { engine: import("@/cad/embed/MiniCad").MiniCad }) {
  // Re-render bei Auswahl-Änderung / Label-Erstellung.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 300);
    return () => window.clearInterval(id);
  }, []);
  const groups = engine.labelManager?.list?.() ?? [];
  const selectionLabelId = (engine as any).getSelectionLabelId?.() as string | null;
  const hasSelection = selectionLabelId != null;
  const activeId =
    selectionLabelId
    ?? (engine as any).activeDrawLabelId
    ?? (engine as any).selectedLabelId
    ?? groups[0]?.id
    ?? "";
  return (
    <SettingsBlock title="EBENE">
      <select
        value={activeId}
        onChange={(e) => {
          const v = e.target.value;
          if (hasSelection) {
            // Auswahl vorhanden → Ebene des Objekts persistent ändern.
            try { (engine as any).setSelectionLabelId?.(v); } catch {}
          } else {
            // Nichts ausgewählt → Ebene für NEU zu zeichnende Objekte setzen.
            try { (engine as any).setActiveDrawLabelId?.(v); } catch {}
          }
          try { (engine as any).refreshLabelUI?.(); } catch {}
          setTick((t) => t + 1);
        }}
        className="w-full h-8 px-2 rounded border bg-transparent text-sm"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    </SettingsBlock>
  );
}


/** Pollt, ob im CAD-Engine gerade ein Dokument (Bild/PDF) selektiert ist. */
function useCadDocumentSelected(engine: any): boolean {
  const [sel, setSel] = useState(false);
  useEffect(() => {
    if (!engine) { setSel(false); return; }
    const id = window.setInterval(() => {
      const s: any = (engine as any).selection;
      setSel(!!s && s.type === "document");
    }, 200);
    return () => window.clearInterval(id);
  }, [engine]);
  return sel;
}

function DocumentToolSettings({
  importing,
  onImport,
  onOpenLibrary,
  scale,
  onScaleChange,
  freePlace,
  onFreePlaceChange,
}: {
  importing: boolean;
  onImport?: () => void;
  onOpenLibrary?: () => void;
  scale: string;
  onScaleChange?: (s: string) => void;
  freePlace?: boolean;
  onFreePlaceChange?: (v: boolean) => void;
}) {
  // Der Maßstab greift erst, wenn "Maßstab anwenden" gesetzt ist —
  // ohne Häkchen wird das Dokument frei (auto-fit) platziert.
  const useScale = !freePlace;
  return (
    <SettingsBlock title="DOKUMENT IMPORTIEREN">
      <button
        type="button"
        disabled={importing}
        onClick={onImport}
        className="w-full h-9 rounded-md border text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-wait"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="PDF, JPG oder PNG importieren"
      >
        <FileImage size={14} />
        {importing ? "Importiere…" : "Datei importieren"}
      </button>

      <button
        type="button"
        disabled={importing}
        onClick={onOpenLibrary}
        className="w-full h-9 mt-1.5 rounded-md border text-xs flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ borderColor: "hsl(var(--hairline))" }}
        title="Dokumente aus der Projekt-Ablage (Startseite) einfügen"
      >
        <FolderOpen size={14} />
        Aus Projekt-Ablage
      </button>

      <label
        className="flex items-center gap-2 text-[11px] cursor-pointer select-none px-1 pt-2"
        title="Ohne Häkchen wird das Dokument frei platziert (Originalgröße/auto-fit)."
      >
        <input
          type="checkbox"
          checked={useScale}
          onChange={(e) => onFreePlaceChange?.(!e.target.checked)}
        />
        <span>Maßstab anwenden</span>
      </label>

      <div className={useScale ? "" : "opacity-50 pointer-events-none"}>
        <Row label="Maßstab">
          <PlacedScaleInput
            value={scale}
            onCommit={(next) => onScaleChange?.(next)}
          />
        </Row>
      </div>

    </SettingsBlock>
  );
}


function SelectSettings({
  settings,
  onChange,
  selectedCount,
}: {
  settings: ToolSettings["select"];
  onChange: (p: Partial<ToolSettings["select"]>) => void;
  selectedCount: number;
}) {
  const mode = settings.marqueeMode;
  return (
    <SettingsBlock title="AUSWAHL">
      <div className="text-[11px] mb-1 text-muted-foreground">Rahmen-Modus</div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange({ marqueeMode: "click" })}
          className="flex-1 h-9 rounded-md border flex items-center justify-center gap-1.5 text-xs"
          style={mode === "click" ? {
            background: "rgba(59,130,246,0.15)",
            borderColor: "rgba(59,130,246,0.9)",
            color: "rgba(59,130,246,1)",
          } : { borderColor: "hsl(var(--hairline))" }}
          title="Klick: einzeln anklicken, kein Rahmen"
        >
          <MousePointer2 size={14} />
          <span>Klick</span>
        </button>
        <button
          type="button"
          onClick={() => onChange({ marqueeMode: "touch" })}
          className="flex-1 h-9 rounded-md border flex items-center justify-center gap-1.5 text-xs"
          style={mode === "touch" ? {
            background: "rgba(249,115,22,0.15)",
            borderColor: "rgba(249,115,22,0.9)",
            color: "rgba(249,115,22,1)",
          } : { borderColor: "hsl(var(--hairline))" }}
          title="Berühren (Crossing): alles was den Rahmen berührt"
        >
          <SquareDashed size={14} />
          <span>Berühren</span>
        </button>
        <button
          type="button"
          onClick={() => onChange({ marqueeMode: "enclose" })}
          className="flex-1 h-9 rounded-md border flex items-center justify-center gap-1.5 text-xs"
          style={mode === "enclose" ? {
            background: "rgba(59,130,246,0.15)",
            borderColor: "rgba(59,130,246,0.9)",
            color: "rgba(59,130,246,1)",
          } : { borderColor: "hsl(var(--hairline))" }}
          title="Umschließen (Window): nur vollständig innen liegende Elemente"
        >
          <BoxSelect size={14} />
          <span>Umschließen</span>
        </button>
      </div>
      <div className="text-[11px] leading-relaxed pt-2 mt-2 text-muted-foreground border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
        Klick auf Leerraum + ziehen zieht einen Rahmen auf. Im Modus <b>Berühren</b> werden
        alle Elemente ausgewählt, die den Rahmen schneiden — im Modus <b>Umschließen</b>
        nur die vollständig innen liegenden. Mit <b>Entf</b> gemeinsam löschen.
      </div>
      {selectedCount > 0 && (
        <div className="text-[11px] text-muted-foreground pt-1">
          {selectedCount} Element{selectedCount === 1 ? "" : "e"} ausgewählt.
        </div>
      )}
    </SettingsBlock>
  );
}


const formatGuideMeasure = (value: number, fractionDigits: number) =>
  Number(value.toFixed(fractionDigits)).toString();

function GuideMeasureInput({
  label,
  unit,
  value,
  fractionDigits,
  onChange,
}: {
  label: string;
  unit: "px" | "mm" | "pt";
  value: number;
  fractionDigits: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => formatGuideMeasure(value, fractionDigits));
  const focusedRef = useRef(false);
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(formatGuideMeasure(value, fractionDigits));
  }, [fractionDigits, value]);

  const parseDraft = (next: string) => {
    const parsed = Number(next.trim().replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const restoreOrCommit = () => {
    const parsed = parseDraft(draft);
    if (parsed == null) {
      setDraft(formatGuideMeasure(value, fractionDigits));
      return;
    }
    onChange(parsed);
    setDraft(formatGuideMeasure(parsed, fractionDigits));
  };

  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[9px] text-muted-foreground">{label}</span>
      <span className="flex h-8 items-center overflow-hidden rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onFocus={() => { focusedRef.current = true; }}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const parsed = parseDraft(next);
            if (parsed != null) onChange(parsed);
          }}
          onBlur={() => {
            focusedRef.current = false;
            if (cancelBlurRef.current) {
              cancelBlurRef.current = false;
              setDraft(formatGuideMeasure(value, fractionDigits));
              return;
            }
            restoreOrCommit();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelBlurRef.current = true;
              setDraft(formatGuideMeasure(value, fractionDigits));
              event.currentTarget.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-xs tabular-nums outline-none"
          aria-label={`${label} in ${unit}`}
        />
        <span className="pr-2 text-[10px] text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}

function GuideSettings({
  settings,
  pxPerMm,
  onChange,
}: {
  settings: ToolSettings["guide"];
  pxPerMm: number;
  onChange: (p: Partial<ToolSettings["guide"]>) => void;
}) {
  const strokeWidthMm = guideStrokePxToMm(settings.strokeWidth, pxPerMm);

  return (
    <SettingsBlock title="HILFSLINIE">
      <ToolColorPicker
        label="Farbe"
        value={settings.color}
        onChange={(value) => onChange({ color: value })}
      />
      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Strichstärke</div>
        <div className="grid grid-cols-2 gap-2">
          <GuideMeasureInput
            label="Bildschirm"
            unit="px"
            value={settings.strokeWidth}
            fractionDigits={2}
            onChange={(value) => onChange({ strokeWidth: value })}
          />
          <GuideMeasureInput
            label="Tatsächliche Größe"
            unit="mm"
            value={strokeWidthMm}
            fractionDigits={3}
            onChange={(value) => onChange({ strokeWidth: guideStrokeMmToPx(value, pxPerMm) })}
          />
        </div>
      </div>
      <Row label="Fixiert">
        <button
          type="button"
          onClick={() => onChange({ locked: !settings.locked })}
          className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted"
          style={{
            borderColor: settings.locked ? "hsl(var(--ink-soft))" : "hsl(var(--hairline))",
            background: settings.locked ? "hsl(var(--surface-strong))" : "transparent",
            color: settings.locked ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
          }}
          title={settings.locked ? "Hilfslinien sind gesperrt — klicken zum Entsperren" : "Klicken um alle Hilfslinien zu sperren"}
          aria-label={settings.locked ? "Hilfslinien entsperren" : "Hilfslinien fixieren"}
          aria-pressed={settings.locked}
        >
          {settings.locked ? <LockIcon size={15} /> : <UnlockIcon size={15} />}
        </button>
      </Row>
    </SettingsBlock>
  );
}

/** Modus-Auswahl Linie / Freihand — Design analog zum Schraffurwerkzeug. */
function LineModeSelect({
  value,
  onChange,
}: {
  value: LinePageTool;
  onChange: (next: LinePageTool) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1.5">MODUS</div>
      <div className="grid grid-cols-2 gap-1">
        {LINE_TOOL_VARIANTS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            onClick={() => onChange(id)}
            className={`flex flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 transition-colors ${
              value === id ? "bg-accent" : "hover:bg-muted"
            }`}
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <Icon size={14} />
            <span className="text-[9px] leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LineSettings({
  settings,
  pxPerMm,
  onChange,
}: {
  settings: ToolSettings["line"];
  pxPerMm: number;
  onChange: (p: Partial<ToolSettings["line"]>) => void;
}) {
  const thicknessPx = guideStrokeMmToPx(settings.thicknessMm, pxPerMm);

  return (
    <SettingsBlock title="LINIE">
      <ToolColorPicker
        label="Farbe"
        value={settings.color}
        onChange={(value) => onChange({ color: value })}
      />
      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Strichstärke</div>
        <div className="grid grid-cols-2 gap-2">
          <GuideMeasureInput
            label="Bildschirm"
            unit="px"
            value={thicknessPx}
            fractionDigits={2}
            onChange={(value) => onChange({ thicknessMm: guideStrokePxToMm(value, pxPerMm) })}
          />
          <GuideMeasureInput
            label="Tatsächliche Größe"
            unit="mm"
            value={settings.thicknessMm}
            fractionDigits={3}
            onChange={(value) => onChange({ thicknessMm: value })}
          />
        </div>
      </div>
      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Transparenz</div>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={Math.max(1, settings.alpha)}
          onChange={(e) => onChange({ alpha: Number(e.target.value) })}
          className="w-full accent-foreground"
        />
        <label className="mt-1 flex h-7 items-center overflow-hidden rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={Math.max(1, settings.alpha)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange({ alpha: Math.min(100, Math.max(1, Math.round(v))) });
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-xs tabular-nums outline-none"
            aria-label="Transparenz in Prozent"
          />
          <span className="pr-2 text-[10px] text-muted-foreground">%</span>
        </label>
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
      <div className="text-[11px] text-muted-foreground">
        Mittelpunkt = Halbierungs-Snap (50 %). Teilung N (z. B. 3, 4) erzeugt N-1
        zusätzliche Snap-Punkte für gleiche Abschnitte. Beide Optionen sind
        kombinierbar.
      </div>
    </SettingsBlock>
  );
}



function TextStyleToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className="flex h-8 flex-1 items-center justify-center rounded border transition-colors hover:bg-muted"
      style={{
        borderColor: "hsl(var(--hairline))",
        background: active ? "hsl(var(--accent))" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

const TEXT_MODES = [
  { id: "auto" as const, label: "Rahmen variabel", icon: ScanIcon },
  { id: "frame" as const, label: "Rahmen fix", icon: FrameIcon },
];

/** Modus-Auswahl (Rahmen variabel / fix) — liegt über dem Einstellungsrahmen. */
function TextModeSelect({
  settings,
  onChange,
}: {
  settings: ToolSettings["text"];
  onChange: (p: Partial<ToolSettings["text"]>) => void;
}) {
  const mode: "auto" | "frame" = settings.autoSize === false ? "frame" : "auto";
  return (
    <div className="mb-2">
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1.5">MODUS</div>
      <div className="grid grid-cols-2 gap-1">
        {TEXT_MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            onClick={() => {
              if (id === "frame") onChange({ autoSize: false, wrap: true });
              else onChange({ autoSize: true, wrap: false });
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 transition-colors ${
              mode === id ? "bg-accent" : "hover:bg-muted"
            }`}
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <Icon size={14} />
            <span className="text-[9px] leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TextSettings({
  settings,
  pxPerMm,
  onChange,
  hideMode = false,
}: {
  settings: ToolSettings["text"];
  pxPerMm: number;
  onChange: (p: Partial<ToolSettings["text"]>) => void;
  hideMode?: boolean;
}) {
  // Schriftgrößen werden – wie in Word – in Punkt (pt) geführt.
  // 1 pt = 4/3 CSS-Pixel; die mm-Angabe ist die reale Höhe auf dem Blatt.
  const fontPx = settings.fontSize * (4 / 3);
  const fontMm = guideStrokePxToMm(fontPx, pxPerMm);

  return (
    <SettingsBlock title="TEXT">
      {!hideMode && <TextModeSelect settings={settings} onChange={onChange} />}

      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Ausrichtung</div>
        <div className="flex gap-1">
          {([
            { id: "left" as const, label: "Text links", Icon: AlignLeft },
            { id: "center" as const, label: "Text zentriert", Icon: AlignCenter },
            { id: "right" as const, label: "Text rechts", Icon: AlignRight },
          ]).map(({ id, label, Icon }) => (
            <TextStyleToggle
              key={id}
              active={settings.align === id}
              title={label}
              onClick={() => onChange({ align: id })}
            >
              <Icon size={15} />
            </TextStyleToggle>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Schriftgröße</div>
        <div className="grid grid-cols-2 gap-2">
          <GuideMeasureInput
            label="Bildschirm"
            unit="pt"
            value={settings.fontSize}
            fractionDigits={1}
            onChange={(value) => {
              if (value > 0) onChange({ fontSize: Math.min(400, Math.max(1, Number(value.toFixed(2)))) });
            }}
          />
          <GuideMeasureInput
            label="Tatsächliche Größe"
            unit="mm"
            value={fontMm}
            fractionDigits={3}
            onChange={(value) => {
              const pt = guideStrokeMmToPx(value, pxPerMm) * (3 / 4);
              if (pt > 0) onChange({ fontSize: Math.min(400, Math.max(1, Number(pt.toFixed(2)))) });
            }}
          />
        </div>
      </div>


      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Stil</div>
        <div className="flex gap-1">
          <TextStyleToggle active={settings.bold} title="Fett" onClick={() => onChange({ bold: !settings.bold })}>
            <BoldIcon size={15} />
          </TextStyleToggle>
          <TextStyleToggle active={settings.italic} title="Kursiv" onClick={() => onChange({ italic: !settings.italic })}>
            <ItalicIcon size={15} />
          </TextStyleToggle>
          <TextStyleToggle active={settings.underline} title="Unterstrichen" onClick={() => onChange({ underline: !settings.underline })}>
            <UnderlineIcon size={15} />
          </TextStyleToggle>
          <TextStyleToggle active={settings.strike} title="Durchgestrichen" onClick={() => onChange({ strike: !settings.strike })}>
            <StrikethroughIcon size={15} />
          </TextStyleToggle>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Absatz</div>
        <input
          type="range"
          min={80}
          max={300}
          step={5}
          value={settings.lineHeightPct}
          onChange={(e) => onChange({ lineHeightPct: Number(e.target.value) })}
          className="pixuna-range w-full"
        />
        <label className="mt-1 flex h-7 items-center overflow-hidden rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
          <input
            type="number"
            min={80}
            max={300}
            step={5}
            value={settings.lineHeightPct}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange({ lineHeightPct: Math.min(300, Math.max(80, Math.round(v))) });
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-xs tabular-nums outline-none"
            aria-label="Absatzhöhe in Prozent"
          />
          <span className="pr-2 text-[10px] text-muted-foreground">%</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ToolColorPicker label="Textfarbe" value={settings.color} onChange={(v) => onChange({ color: v })} />
        <ToolColorPicker
          label="Feldfarbe"
          value={settings.bgColor}
          onChange={(v) => onChange({ bgColor: v, bgAlphaPct: settings.bgAlphaPct > 0 ? settings.bgAlphaPct : 100 })}
        />
      </div>

      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Transparenz</div>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={Math.max(1, settings.alpha)}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ alpha: v, ...(settings.bgAlphaPct > 0 ? { bgAlphaPct: v } : {}) });
          }}
          className="pixuna-range w-full"
        />
        <label className="mt-1 flex h-7 items-center overflow-hidden rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={Math.max(1, settings.alpha)}
            onChange={(e) => {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw)) return;
              const v = Math.min(100, Math.max(1, Math.round(raw)));
              onChange({ alpha: v, ...(settings.bgAlphaPct > 0 ? { bgAlphaPct: v } : {}) });
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-xs tabular-nums outline-none"
            aria-label="Transparenz in Prozent"
          />
          <span className="pr-2 text-[10px] text-muted-foreground">%</span>
        </label>
      </div>

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
                className="pixuna-range flex-1"
              />
              <span className="text-xs tabular-nums w-10 text-right">{settings.borderWidthPx} px</span>
            </div>
          </Row>
        </>
      )}
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
  cadEngine,
}: {
  project: import("@/lib/projectStore").Project;
  projectId: string;
  pageId?: string;
  selectedElementId?: string;
  setSelectedElementId: (id?: string) => void;
  onJumpCad: (sheetId?: string) => void;
  cadEngine?: import("@/cad/embed/MiniCad").MiniCad | null;
}) {
  const navigate = useNavigate();
  // Kleiner Ticker, damit neue/umbenannte Bezeichnungs-IDs im Dropdown erscheinen.
  const [, setLabelTick] = useState(0);
  useEffect(() => {
    if (!cadEngine) return;
    const id = window.setInterval(() => setLabelTick((t) => t + 1), 400);
    return () => window.clearInterval(id);
  }, [cadEngine]);
  const labelGroups = cadEngine?.labelManager?.list?.() ?? [];
  const page = project.pages.find((p) => p.id === pageId);
  const placed = (page?.elements ?? []).filter((e) => e.kind === "cad-view" || e.kind === "cad-viewport");
  const [pdfOpen, setPdfOpen] = useState<boolean>(false);
  const [pdfPickedSheet, setPdfPickedSheet] = useState<string | null>(null);
  const [pickScale, setPickScale] = useState<Record<string, string>>({});

  const goCadForSheetPdf = (sheetId: string, mode: "view" | "frame", scale: string) => {
    if (!projectId || !pageId) return;
    navigate(`/project/${projectId}/cad?sheetPdf=${encodeURIComponent(sheetId)}&mode=${mode}&scale=${encodeURIComponent(scale)}&pageId=${encodeURIComponent(pageId)}`);
  };




  return (
    <div className="space-y-3">





      {/* CAD-Blatt als PDF einfügen (verschoben aus dem Dokument-Werkzeug). */}
      <div>
        <button
          type="button"
          onClick={() => setPdfOpen((v) => !v)}
          className="w-full h-9 rounded-md border text-xs flex items-center justify-between gap-2 px-2"
          style={{ borderColor: "hsl(var(--hairline))" }}
          title="Ein Zeichenblatt aus der CAD-Oberfläche als PDF einfügen"
        >
          <span className="flex items-center gap-2"><CompassIcon size={14} /> CAD-Blatt als PDF einfügen</span>
          <span className="text-muted-foreground">{pdfOpen ? "▴" : "▾"}</span>
        </button>
        {pdfOpen && (
          <div className="mt-1 rounded-md border p-1.5 space-y-1" style={{ borderColor: "hsl(var(--hairline))" }}>
            {project.sheets.length === 0 && (
              <div className="text-[11px] text-muted-foreground px-1 py-2">
                Noch keine Zeichenblätter. In der CAD-Oberfläche anlegen.
              </div>
            )}
            {project.sheets.map((s) => {
              const isActive = pdfPickedSheet === s.id;
              const curScale = pickScale[s.id] ?? s.scale ?? "1:100";
              const selectValue = PAGE_PLAN_SCALES.includes(curScale) ? curScale : "__other__";
              return (
                <div key={s.id} className="space-y-1">
                  <div
                    role="button"
                    onClick={() => setPdfPickedSheet(isActive ? null : s.id)}
                    className="w-full h-7 rounded-md text-[11px] flex items-center justify-between px-2 hover:bg-muted gap-2 cursor-pointer"
                    style={{ background: isActive ? "hsl(var(--surface-strong))" : undefined }}
                  >
                    <span className="truncate flex-1 text-left">{s.name}</span>
                    <select
                      value={selectValue}
                      onClick={(ev) => ev.stopPropagation()}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      onChange={(ev) => {
                        ev.stopPropagation();
                        const v = ev.target.value;
                        if (v === "frei") {
                          const picked = askPlanScale(curScale);
                          if (!picked) return;
                          setPickScale((m) => ({ ...m, [s.id]: picked }));
                        } else if (v !== "__other__") {
                          setPickScale((m) => ({ ...m, [s.id]: v }));
                        }
                      }}
                      className="h-6 px-1 rounded bg-transparent border text-[11px] text-muted-foreground"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                    >
                      {!PAGE_PLAN_SCALES.includes(curScale) && (
                        <option value="__other__">{curScale}</option>
                      )}
                      {PAGE_PLAN_SCALES.map((sc) => (
                        <option key={sc} value={sc}>{sc}</option>
                      ))}
                      <option value="frei">frei…</option>
                    </select>
                  </div>
                  {isActive && (
                    <div className="pl-2">
                      <button
                        type="button"
                        onClick={() => goCadForSheetPdf(s.id, "frame", curScale)}
                        className="h-7 w-full rounded-md border text-[10px] hover:bg-muted"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                        title="Rahmen in CAD-Oberfläche aufziehen (mit Häkchen bestätigen)"
                      >
                        Rahmen
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

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
                        // Live-Referenz: nur den Sync-Zeitstempel bumpen, damit
                        // der Viewport-Renderer re-executed und die aktuellste
                        // Vektor-Szene des Sheets zeichnet. Kein Bitmap-Kopieren.
                        projectStore.updateElement(projectId, pageId, el.id, {
                          lastSyncAt: new Date().toISOString(),
                        });
                      }}
                      title="Aktualisieren — aktuelle CAD-Ansicht als Snapshot übernehmen"
                      className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
                    >
                      <RefreshCw size={13} className="text-muted-foreground" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-muted-foreground">Maßstab</span>
                    <PlacedScaleInput
                      value={el.scale ?? sheet?.scale ?? "1:100"}
                      onCommit={(next) => {
                        if (!pageId) return;
                        const den = parseScaleDen(next);
                        // Alten Nenner konsistent aus dem Element (oder scale-String) ableiten.
                        const prevDen = el.scaleDen ?? parseScaleDen(el.scale ?? sheet?.scale ?? "1:100");
                        if (!(den > 0) || prevDen === den) {
                          // Trotzdem scale/scaleDen synchron halten (falls sie gedriftet waren).
                          projectStore.updateElement(projectId, pageId, el.id, {
                            scale: `1:${den}`,
                            scaleDen: den,
                            lastSyncAt: new Date().toISOString(),
                          });
                          return;
                        }
                        // Der Rahmen des platzierten CAD-Blatts entspricht dem Papier­ausschnitt.
                        // Da paperMm = modelM * 1000 / scaleDen konstant für dieselbe Modellfläche gilt,
                        // skaliert die Rahmengröße mit dem Verhältnis prevDen / den.
                        const ratio = prevDen / den;
                        const nextW = Math.max(0.5, Math.min(400, (el.w ?? 0) * ratio));
                        const nextH = Math.max(0.5, Math.min(400, (el.h ?? 0) * ratio));
                        projectStore.updateElement(projectId, pageId, el.id, {
                          scale: `1:${den}`,
                          scaleDen: den,
                          w: nextW,
                          h: nextH,
                          lastSyncAt: new Date().toISOString(),
                        });
                      }}
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
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-muted-foreground shrink-0">Ebene</span>
                    <select
                      value={el.labelId ?? ""}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(ev) => {
                        if (!pageId) return;
                        const v = ev.target.value;
                        projectStore.updateElement(projectId, pageId, el.id, {
                          labelId: v || undefined,
                        });
                        try { cadEngine?.refreshLabelUI?.(); } catch {}
                      }}
                      disabled={!cadEngine || labelGroups.length === 0}
                      className="flex-1 h-7 px-2 rounded bg-transparent border text-sm"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                      title="Ebene — identisch zur CAD-Oberfläche."
                    >
                      <option value="">— keine —</option>
                      {labelGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Objektart: Vektor (live) ⇄ Pixel (eingebranntes Bild). */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-muted-foreground shrink-0">Objektart</span>
                    <div className="flex-1 flex gap-1">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (!pageId || !el.pixelMode) return;
                          projectStore.updateElement(projectId, pageId, el.id, { pixelMode: false });
                        }}
                        className={`flex-1 h-7 rounded border text-[11px] ${!el.pixelMode ? "font-semibold" : ""}`}
                        style={{
                          borderColor: !el.pixelMode ? "#4da3ff" : "hsl(var(--hairline))",
                          background: !el.pixelMode ? "rgba(77,163,255,0.12)" : "transparent",
                        }}
                        title="Vektor: Live-Ansicht des Zeichenblatts, bei jedem Zoom scharf"
                      >
                        Vektor
                      </button>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (!pageId || el.pixelMode) return;
                          const snap = renderCadViewSnapshot(el, sheet);
                          if (!snap) { window.alert("Pixel-Umwandlung fehlgeschlagen — Zeichenblatt enthält noch keine Szene."); return; }
                          projectStore.updateElement(projectId, pageId, el.id, {
                            pixelMode: true,
                            viewSnapshot: snap,
                          });
                        }}
                        className={`flex-1 h-7 rounded border text-[11px] ${el.pixelMode ? "font-semibold" : ""}`}
                        style={{
                          borderColor: el.pixelMode ? "#4da3ff" : "hsl(var(--hairline))",
                          background: el.pixelMode ? "rgba(77,163,255,0.12)" : "transparent",
                        }}
                        title="Pixel: Ansicht wird als Bild eingebrannt (Radiergummi inkl. Smooth möglich)"
                      >
                        Pixel
                      </button>
                    </div>
                  </div>

                  {/* Automatische Aktualisierung — pro CAD-Blatt-Objekt. */}
                  <label
                    className="flex items-center justify-between gap-2 mt-2 cursor-pointer"
                    onClick={(ev) => ev.stopPropagation()}
                    title={'Wenn aus: Ansicht bleibt eingefroren, bis „Aktualisieren" geklickt wird.'}
                  >
                    <span className="text-[11px] text-muted-foreground">Automatisch aktualisieren</span>
                    <input
                      type="checkbox"
                      checked={el.autoUpdate !== false}
                      disabled={!!el.pixelMode}
                      onChange={(ev) => {
                        if (!pageId) return;
                        projectStore.updateElement(projectId, pageId, el.id, { autoUpdate: ev.target.checked });
                      }}
                      className="h-4 w-4"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Freie Maßstabs-Eingabe für ein platziertes CAD-Blatt.
 *  Akzeptiert ausschließlich Formate wie "1:50" (auch "50" oder "1/50" werden zu "1:50" normalisiert).
 *  Zeigt bei ungültiger Eingabe eine schlichte Fehlermeldung unterhalb des Feldes. Default: 1:100. */
function PlacedScaleInput({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
  const [draft, setDraft] = React.useState<string>(value);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { setDraft(value); setError(null); }, [value]);

  // Erlaubt: "1:50", "1 : 50", "50", "1/50". Nenner 1..10000, Komma/Punkt zulässig.
  type ValidateResult =
    | { ok: true; normalized: string; den: number; message?: undefined }
    | { ok: false; message: string; normalized?: undefined; den?: undefined };
  const validate = (raw: string): ValidateResult => {
    const s = (raw || "").trim();
    if (!s) return { ok: false, message: "Bitte einen Maßstab eingeben, z. B. 1:100." };
    const m = s.match(/^\s*(?:1\s*[:\/]\s*)?(\d+(?:[.,]\d+)?)\s*$/);
    if (!m) return { ok: false, message: 'Ungültiges Format. Erlaubt: „1:50", „50" oder „1/50".' };
    const den = parseFloat(m[1].replace(",", "."));
    if (!(den > 0)) return { ok: false, message: "Nenner muss größer als 0 sein." };
    if (den > 10000) return { ok: false, message: "Nenner ist zu groß (max. 10000)." };
    const denStr = den % 1 === 0 ? String(den) : den.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return { ok: true, normalized: `1:${denStr}`, den };
  };

  const commit = () => {
    const res = validate(draft);
    if (!res.ok) { setError(res.message ?? "Ungültige Eingabe."); return; }
    setError(null);
    setDraft(res.normalized!);
    if (res.normalized !== value) onCommit(res.normalized!);
  };

  return (
    <div className="flex-1 flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setDraft(value); setError(null); (e.target as HTMLInputElement).blur(); }
        }}
        placeholder="1:100"
        aria-invalid={!!error}
        className="h-7 px-2 rounded bg-transparent border text-sm tabular-nums"
        style={{ borderColor: error ? "hsl(var(--destructive, 0 84% 60%))" : "hsl(var(--hairline))" }}
        title='Maßstab frei eingeben, z. B. "1:50", "50" oder "1/75". Default 1:100.'
      />
      {error && (
        <span className="text-[10px] leading-tight" style={{ color: "hsl(var(--destructive, 0 84% 60%))" }}>
          {error}
        </span>
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
      </div>
      {element.kind !== "cad-view" && element.kind !== "cad-viewport" && (
        <>
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
        </>
      )}

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
              value={element.color ?? (element.kind === "guide" ? "#4DA3FF" : "#1a1a1a")}
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

      {(element.kind === "image" || element.kind === "pdf") && (
        <WarpInspectorControls
          elementId={element.id}
          hasWarp={isWarped(element.warpCorners)}
          axis={element.warpAxis ?? "free"}
          onAxisChange={(a) => update({ warpAxis: a })}
          onReset={() => update({ warpCorners: undefined, warpAxis: undefined })}
        />
      )}

      {/* CAD-Viewport-Inspektor entfernt: Maßstab, Aktualisieren und Löschen
          für platzierte CAD-Blätter liegen ausschließlich im „CAD-Blatt"-
          Werkzeug (Auto-Open bei Auswahl). */}



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

function WarpInspectorControls({
  elementId,
  hasWarp,
  axis,
  onAxisChange,
  onReset,
}: {
  elementId: string;
  hasWarp: boolean;
  axis: "free" | "x" | "y";
  onAxisChange: (a: "free" | "x" | "y") => void;
  onReset: () => void;
}) {
  const active = useWarpTarget();
  const isActive = active === elementId;
  useEffect(() => {
    return () => {
      if (_isSelfActive()) setWarpTarget(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function _isSelfActive() {
    return (typeof window !== "undefined") && (active === elementId);
  }
  return (
    <div
      className="space-y-1.5 rounded-md border p-2"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Verzerren
      </div>
      <Row label="Achse">
        <select
          value={axis}
          onChange={(e) => onAxisChange(e.target.value as "free" | "x" | "y")}
          className="w-full h-8 px-2 rounded bg-transparent border text-[11px]"
          style={{ borderColor: "hsl(var(--hairline))" }}
          title="Beschränkt die Ziehrichtung der Ecken-/Kanten-Handles"
        >
          <option value="free">Frei (X + Y)</option>
          <option value="x">Nur X (horizontal)</option>
          <option value="y">Nur Y (vertikal)</option>
        </select>
      </Row>
      <button
        type="button"
        onClick={() => setWarpTarget(isActive ? null : elementId)}
        className="w-full h-8 rounded-md text-[11px] border flex items-center justify-center gap-2"
        style={{
          borderColor: isActive ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
          background: isActive ? "hsl(var(--accent-gold-soft))" : "transparent",
          color: "hsl(var(--ink))",
        }}
        title="Ecken- und Kanten-Punkte einblenden und ziehen"
      >
        {isActive ? "Verzerren beenden" : "Verzerren aktivieren"}
      </button>
      {hasWarp && (
        <button
          type="button"
          onClick={onReset}
          className="w-full h-7 rounded-md text-[11px] border text-muted-foreground hover:text-foreground"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          Verzerrung zurücksetzen
        </button>
      )}
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

/**
 * Bridge: registriert einen `externalLabelCounter`-Callback am CAD-Engine,
 * der PageElements mit `labelId` in die Bezeichnungs-ID-Zeilen einzählt.
 * Kein separates Ebenen-Panel — ein einziges System für alles.
 */
function PageElementLabelCounterBridge({
  engine,
  page,
}: {
  engine: import("@/cad/embed/MiniCad").MiniCad;
  page: import("@/lib/projectStore").ProjectPage;
}) {
  useEffect(() => {
    const counts = new Map<string, number>();
    for (const el of page.elements) {
      if (!el.labelId) continue;
      counts.set(el.labelId, (counts.get(el.labelId) ?? 0) + 1);
    }
    engine.externalLabelCounter = (labelId: string) => counts.get(labelId) ?? 0;
    try { engine.refreshLabelUI(); } catch {}
    return () => {
      engine.externalLabelCounter = null;
      try { engine.refreshLabelUI(); } catch {}
    };
  }, [engine, page.elements]);
  return null;
}


// LayersTab bleibt als Komponente vorhanden, wird aktuell aber nicht mehr
// eingebunden — das Bezeichnungs-ID-Panel (CadIdPanelHost) ist die einzige
// Ebenen-Quelle. Verbleibt hier, falls wir künftig eine Detailansicht darunter
// re-aktivieren wollen (dann aber verschmolzen mit dem oberen Panel).
function LayersTab({
  projectId,
  page,
  selectedElementId,
  setSelectedElementId,
  cadEngine,
}: {
  projectId: string;
  page: import("@/lib/projectStore").ProjectPage;
  selectedElementId?: string;
  setSelectedElementId: (id?: string) => void;
  cadEngine?: import("@/cad/embed/MiniCad").MiniCad | null;
}) {
  const [multi, setMulti] = useState<Set<string>>(new Set());
  // 300ms-Refresh, damit umbenannte Bezeichnungs-IDs aus dem Panel hier durchschlagen.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!cadEngine) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 400);
    return () => window.clearInterval(id);
  }, [cadEngine]);
  const groups = page.groups ?? [];
  const els = page.elements;
  const labelGroups = cadEngine?.labelManager?.list?.() ?? [];

  const layerLabel = (el: PageElement) => {
    // Bevorzugt der zugeordnete Bezeichnungs-ID-Name aus dem Engine-LabelManager.
    if (el.labelId) {
      const g = labelGroups.find((lg) => lg.id === el.labelId);
      if (g) return g.name;
    }
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
      "cad-viewport": "CAD-Viewport",
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
  activePageId,
  setActivePageId,
  onClose,
}: {
  project: import("@/lib/projectStore").Project;
  activePageId: string;
  setActivePageId: (id: string) => void;
  onClose: () => void;
}) {
  const [pageMode, setPageMode] = useState<PrintPageMode>("all");
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(project.pages.length);
  const [colorMode, setColorMode] = useState<PrintColorMode>("original");
  const [customColor, setCustomColor] = useState("#111111");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(project.pages.map(p => p.id)));
  const hasSpreads = project.pages.some((p) => !!p.spreadId);
  const [spreadCombined, setSpreadCombined] = useState<boolean>(hasSpreads);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  // Browser-Vorschau des fertigen PDFs (Blob-URL) vor dem eigentlichen Export.
  const [preview, setPreview] = useState<{ url: string; bytes: Uint8Array; name: string; pages: number } | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  // Modus steuert die Auswahl-Checkboxen direkt: "Alle Seiten" hakt alle an,
  // "Nur aktuelle Seite" genau die aktive, "Bereich" den gewählten Bereich.
  // WICHTIG: Während eines laufenden Exports darf hier nichts nachgeführt
  // werden — der Export schaltet die aktive Seite selbst um; ein State-Update
  // würde die Seiten-Komponenten (inkl. CAD-Layer) mitten im Snapshot neu
  // rendern und die PDF-Seiten leer/weiß machen.
  useEffect(() => {
    if (exporting) return;
    const next =
      pageMode === "all"
        ? project.pages.map((p) => p.id)
        : pageMode === "current"
          ? (activePageId ? [activePageId] : [])
          : (() => {
              const from = Math.max(1, Math.min(project.pages.length, rangeStart)) - 1;
              const to = Math.max(1, Math.min(project.pages.length, rangeEnd));
              return project.pages.slice(from, to).map((p) => p.id);
            })();
    setSelectedIds((prev) => {
      if (prev.size === next.length && next.every((id) => prev.has(id))) return prev;
      return new Set(next);
    });
  }, [pageMode, activePageId, rangeStart, rangeEnd, project.pages, exporting]);

  // Aktiv gefilterte Seiten anhand Modus (Alle / Aktuell / Bereich) und Auswahl.
  const resolveExportIds = (): string[] => {
    let base: string[] = [];
    if (pageMode === "all") base = project.pages.map((p) => p.id);
    else if (pageMode === "current") base = project.pages.filter((p) => p.id === activePageId).map((p) => p.id);
    else {
      const from = Math.max(1, Math.min(project.pages.length, rangeStart)) - 1;
      const to = Math.max(1, Math.min(project.pages.length, rangeEnd));
      base = project.pages.slice(from, to).map((p) => p.id);
    }
    return base.filter((id) => selectedIds.has(id));
  };

  // Erzeugt das PDF exakt wie beim Export – je nach Modus wird es dann
  // heruntergeladen ("download") oder nur im Browser angezeigt ("preview").
  const buildPdf = async (mode: "download" | "preview") => {
    const ids = resolveExportIds();
    if (ids.length === 0) return;
    setExporting(true);
    try {
      const { exportProjectToPdf, downloadPdf } = await import("@/lib/projectPdfExport");
      const bytes = await exportProjectToPdf(
        {
          project,
          selectedPageIds: ids,
          colorMode,
          customColor,
          spreadCombined,
          setActivePageId,
        },
        (p) => setProgress(p),
      );
      const safeName = (project.name || "projektmappe").replace(/[^\w-]+/g, "_");
      if (mode === "download") {
        downloadPdf(bytes, `${safeName}.pdf`);
        onClose();
      } else {
        const copy = new Uint8Array(bytes);
        const blob = new Blob([copy.buffer as ArrayBuffer], { type: "application/pdf" });
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(blob), bytes: copy, name: `${safeName}.pdf`, pages: ids.length };
        });
      }
    } catch (err) {
      console.error("PDF-Export fehlgeschlagen:", err);
      alert("PDF-Export fehlgeschlagen. Details in der Konsole.");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const handleExport = () => buildPdf("download");
  const handlePreview = () => buildPdf("preview");

  const closePreview = () => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };



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

      <DragScrollDiv axis="both" className="flex-1 min-h-0 overflow-auto p-4 cursor-grab active:cursor-grabbing">
        <div className="min-w-[320px] space-y-5">
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

        {hasSpreads && (
          <section>
            <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
              VERBUND
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={spreadCombined}
                onChange={(e) => setSpreadCombined(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Doppelseiten nebeneinander drucken
                <span className="block text-[11px] text-muted-foreground">
                  Verbundene Seiten erscheinen als eine PDF-Seite; einzelne Seiten unverändert.
                </span>
              </span>
            </label>
          </section>
        )}
        </div>
      </DragScrollDiv>

      {progress && (
        <div
          className="px-4 py-2 text-[11px] text-muted-foreground border-t"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          {progress.label} ({progress.current}/{progress.total})
        </div>
      )}
      <div
        className="border-t p-3 space-y-2"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <button
          onClick={handlePreview}
          disabled={exporting}
          className="w-full h-9 rounded-md text-sm border disabled:opacity-50"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
        >
          {exporting ? "Erstelle…" : "Vorschau anzeigen"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={exporting}
            className="flex-1 h-9 rounded-md text-sm border disabled:opacity-50"
            style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 h-9 rounded-md text-sm font-medium disabled:opacity-50"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            {exporting ? "Erstelle…" : "PDF erstellen"}
          </button>
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: "rgba(12,12,14,0.82)" }}
          onClick={closePreview}
        >
          <div
            className="m-auto w-[min(1100px,94vw)] h-[92vh] rounded-lg overflow-hidden flex flex-col shadow-2xl"
            style={{ background: "hsl(var(--surface))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-2 px-4 h-12 border-b shrink-0"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <span className="text-sm font-medium" style={{ color: "hsl(var(--ink))" }}>
                PDF-Vorschau
              </span>
              <span className="text-[11px] text-muted-foreground">
                {preview.pages} {preview.pages === 1 ? "Seite" : "Seiten"} · {preview.name}
              </span>
              <div className="flex-1" />
              <button
                onClick={async () => {
                  const { downloadPdf } = await import("@/lib/projectPdfExport");
                  downloadPdf(preview.bytes, preview.name);
                }}
                className="h-8 px-3 rounded-md text-xs font-medium"
                style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
              >
                Herunterladen
              </button>
              <button
                onClick={closePreview}
                className="h-8 px-3 rounded-md text-xs border"
                style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
              >
                Schließen
              </button>
            </div>
            <iframe
              src={preview.url}
              title="PDF-Vorschau"
              className="flex-1 w-full"
              style={{ border: "none", background: "#525659" }}
            />
          </div>
        </div>
      )}
    </aside>
  );
}


/* ---------- PresenterOverlay ---------- */
/**
 * Fullscreen-Präsentationsmodus:
 * - Zeigt die aktive Seite formatfüllend zentriert.
 * - Wischen/Ziehen horizontal → nächste / vorherige Seite.
 * - Pfeiltasten / Leertaste → Navigation. ESC oder Wisch nach oben → Ende.
 * - Wisch nach unten → Karussell-Ansicht (Cover-Flow-artig), Klick wählt Seite.
 */
function PresenterOverlay({
  pages,
  initialIndex,
  projectId,
  onClose,
  onSelectPage,
}: {
  pages: import("@/lib/projectStore").ProjectPage[];
  initialIndex: number;
  projectId: string;
  onClose: () => void;
  onSelectPage: (id: string) => void;
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(pages.length - 1, initialIndex)));
  const [carousel, setCarousel] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; startY: number; dx: number; dy: number } | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const rootRef = useRef<HTMLDivElement>(null);

  // Fullscreen API + Viewport-Beobachter.
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    const onFs = () => {
      if (!document.fullscreenElement) onClose();
    };
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("resize", onResize);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const clampIdx = (i: number) => Math.max(0, Math.min(pages.length - 1, i));
  const goto = (i: number) => setIndex(clampIdx(i));
  const doExit = () => {
    onSelectPage(pages[index]?.id ?? pages[0].id);
    onClose();
  };

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); doExit(); }
      else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); goto(index + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goto(index - 1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setCarousel(true); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setCarousel(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, pages.length]);

  // Pointer drag / swipe — nur wenn Karussell nicht offen ist.
  const onPointerDown = (e: React.PointerEvent) => {
    if (carousel) return;
    // Interaktionen mit Chrome-Buttons (Navigations-/Beenden-Buttons) nicht abfangen.
    const target = e.target as HTMLElement | null;
    if (target && target.closest("[data-presenter-chrome]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, dx: e.clientX - drag.startX, dy: e.clientY - drag.startY });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const { dx, dy } = drag;
    setDrag(null);
    const absX = Math.abs(dx), absY = Math.abs(dy);
    const H_THRESH = Math.min(160, viewport.w * 0.15);
    // Vertikal deutlich strenger: Nur ein sehr klares Hoch/Runter-Wischen
    // aktiviert Karussell (unten) bzw. beendet die Präsentation (oben).
    const V_THRESH = Math.min(240, viewport.h * 0.30);
    if (absY > absX * 1.4 && absY > V_THRESH) {
      if (dy < 0) doExit(); else setCarousel(true);
      return;
    }
    if (absX > H_THRESH) {
      if (dx < 0) goto(index + 1); else goto(index - 1);
    }
  };

  const current = pages[index];
  if (!current) return null;
  const fmt = FORMAT_SIZES[current.format];
  const aspect = fmt.w / fmt.h;
  // Fit to viewport (10% padding).
  const pad = 40;
  const availW = viewport.w - pad * 2;
  const availH = viewport.h - pad * 2;
  const targetW = Math.min(availW, availH * aspect);
  const zoomPct = (targetW / 1100) * 100;

  const dragX = drag ? drag.dx : 0;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[9999] select-none"
      style={{ background: "#000", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Hauptseite mit Nachbarn für Wisch-Vorschau */}
      {!carousel && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
          <div
            className="relative flex items-center gap-16"
            style={{
              transform: `translateX(${dragX}px)`,
              transition: drag ? "none" : "transform 240ms cubic-bezier(.22,.61,.36,1)",
            }}
          >
            {[index - 1, index, index + 1].map((i) => {
              const p = pages[i];
              if (!p) return <div key={`empty-${i}`} style={{ width: targetW }} />;
              return (
                <div
                  key={p.id}
                  style={{
                    width: targetW,
                    pointerEvents: "none",
                    filter: i === index ? "none" : "brightness(0.5)",
                  }}
                >
                  <PageCanvas
                    projectId={projectId}
                    page={p}
                    overlayOpacity={0}
                    selectedElementIds={[]}
                    zoom={zoomPct}
                    activeTool={null}
                    toolSettings={DEFAULT_TOOL_SETTINGS}
                    onCommitTool={() => {}}
                    onSelect={() => {}}
                    onCadSelectionChange={() => {}}
                    bare
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Karussell (Cover-Flow) */}
      {carousel && (
        <PresenterCarousel
          pages={pages}
          projectId={projectId}
          index={index}
          onPick={(i) => { setIndex(i); setCarousel(false); }}
          onClose={() => setCarousel(false)}
        />
      )}

      {/* Chrome: Seitenzähler + Hinweis */}
      <div
        data-presenter-chrome
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-1.5 rounded-full text-[11px]"
        style={{ background: "rgba(255,255,255,0.10)", color: "#fff", backdropFilter: "blur(6px)" }}
      >
        <button
          data-presenter-chrome
          onClick={() => goto(index - 1)}
          disabled={index <= 0}
          className="h-7 w-7 rounded-full flex items-center justify-center disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          title="Vorherige Seite (←)"
        >‹</button>
        <span className="px-1 tabular-nums">{index + 1} / {pages.length}</span>
        <button
          data-presenter-chrome
          onClick={() => goto(index + 1)}
          disabled={index >= pages.length - 1}
          className="h-7 w-7 rounded-full flex items-center justify-center disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          title="Nächste Seite (→)"
        >›</button>
        <button
          data-presenter-chrome
          onClick={() => setCarousel(true)}
          className="ml-1 h-7 px-2 rounded-full text-[11px]"
          style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          title="Karussell (↓)"
        >Karussell</button>
      </div>
      <button
        data-presenter-chrome
        onClick={doExit}
        title="Beenden (ESC)"
        className="absolute top-4 right-4 h-9 w-9 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.10)", color: "#fff" }}
      >
        ✕
      </button>
    </div>
  );
}

function PresenterCarousel({
  pages,
  projectId,
  index,
  onPick,
  onClose,
}: {
  pages: import("@/lib/projectStore").ProjectPage[];
  projectId: string;
  index: number;
  onPick: (i: number) => void;
  onClose: () => void;
}) {
  const [center, setCenter] = useState(index);
  useEffect(() => setCenter(index), [index]);
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(vw * 0.42, vh * 0.55 * 1.4);
  const gap = cardW * 0.55;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden" onClick={onClose}>
      <div className="relative flex items-center justify-center" style={{ height: vh * 0.7, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        {pages.map((p, i) => {
          const offset = i - center;
          const absOff = Math.abs(offset);
          if (absOff > 4) return null;
          const fmt = FORMAT_SIZES[p.format];
          const ratio = fmt.w / fmt.h;
          const w = cardW * (1 - Math.min(0.35, absOff * 0.14));
          const h = w / ratio;
          const rotY = Math.max(-55, Math.min(55, -offset * 28));
          const tx = offset * gap;
          const z = -absOff;
          return (
            <button
              key={p.id}
              onClick={() => onPick(i)}
              className="absolute rounded-lg overflow-hidden shadow-2xl transition-transform"
              style={{
                width: w,
                height: h,
                transform: `translateX(${tx}px) rotateY(${rotY}deg) scale(${1 - absOff * 0.06})`,
                transformStyle: "preserve-3d",
                zIndex: 100 + z,
                background: "#fff",
                border: offset === 0 ? "2px solid #fff" : "1px solid rgba(255,255,255,0.25)",
                opacity: 1 - absOff * 0.18,
                pointerEvents: absOff > 2 ? "none" : "auto",
              }}
            >
              <div
                style={{
                  width: 1100,
                  height: 1100 / ratio,
                  transform: `scale(${w / 1100})`,
                  transformOrigin: "top left",
                  pointerEvents: "none",
                }}
              >
                <PageCanvas
                  projectId={projectId}
                  page={p}
                  overlayOpacity={0}
                  selectedElementIds={[]}
                  zoom={100}
                  activeTool={null}
                  toolSettings={DEFAULT_TOOL_SETTINGS}
                  onCommitTool={() => {}}
                  onSelect={() => {}}
                  onCadSelectionChange={() => {}}
                  bare
                />
              </div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px]" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                Seite {i + 1}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={() => setCenter((c) => Math.max(0, c - 1))}
          className="h-9 w-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          title="Vorherige"
        >
          ‹
        </button>
        <div className="px-3 py-1.5 rounded-full text-[11px]" style={{ background: "rgba(255,255,255,0.10)", color: "#fff" }}>
          Seite {center + 1} / {pages.length} · Klick zum Auswählen · ↑ oder ESC zurück
        </div>
        <button
          onClick={() => setCenter((c) => Math.min(pages.length - 1, c + 1))}
          className="h-9 w-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          title="Nächste"
        >
          ›
        </button>
      </div>
    </div>
  );
}

// re-export helpful types
export type { PageElement, ElementKind };
