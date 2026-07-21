import React, { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { DragScrollDiv } from "@/components/DragScrollDiv";
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
  Eye,
  EyeOff,
  Settings,
  Wrench,
  CheckSquare,
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
  SquareDashed,
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
} from "@/lib/projectStore";
import CadOverlayLayer from "@/components/page/CadOverlayLayer";
import { CadDocumentInspector } from "@/components/page/CadDocumentInspector";
import { CadIdPanelHost } from "@/components/page/CadIdPanelHost";
import { PdfPageView } from "@/components/page/PdfPageView";
import { TableElementView, TableModifyContext, TableFormulaPickContext, type FormulaFn } from "@/components/page/TableElementView";
import { TableToolSettings } from "@/components/page/TableToolSettings";

import { CadViewportView } from "@/components/page/CadViewportView";
import { importFile, type ImportedPage } from "@/cad/documentImport";
import { popPendingSheetPdf } from "@/lib/sheetPdfExport";
import type { MiniCadSelectionInfo } from "@/cad/embed/MiniCad";
import type { HatchDrawMode } from "@/cad/HatchTool";
import { FreeDrawSettingsPanel } from "@/components/cad/FreeDrawSettingsPanel";
import { EraserSettingsPanel } from "@/components/cad/EraserSettingsPanel";
import { HatchSettingsPanel } from "@/components/cad/HatchSettingsPanel";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { TabletAidWheel } from "@/components/TabletAidWheel";

// Papierformate: kanonische Quelle ist src/lib/paper.ts.
// Für "frei" enthält diese Tabelle nur die Default-Größe; individuelle Werte
// aus page.customWidthMm/customHeightMm werden dort abgefragt, wo die reale
// Seitengröße gebraucht wird (getPageSizeMm).
import { PAPER_FORMATS as FORMAT_SIZES, getPageSizeMm } from "@/lib/paper";

export type PageTool = "guide" | "line" | "free" | "eraser" | "text" | "cad" | "pipette" | "hatch" | "document" | "table" | null;
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

const PROJECT_ZOOM_MIN = 10;
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
  const project = useProject(projectId);
  const navigate = useNavigate();
  const [activePageId, setActivePageId] = useState<string | undefined>(project?.pages[0]?.id);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const [docImporting, setDocImporting] = useState(false);
  const [docPickerPages, setDocPickerPages] = useState<ImportedPage[] | null>(null);
  const [docPickerSelected, setDocPickerSelected] = useState<Set<number>>(new Set());
  // Ausgabemaßstab für neu importierte Dokumente. Wird rechts im
  // "Dokument"-Werkzeug-Panel als Dropdown ausgewählt (wie beim CAD-Blatt).
  const [docScale, setDocScale] = useState<string>("1:100");
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
  const [tabletAidOn, setTabletAidOn] = useState<boolean>(() => {
    try { return localStorage.getItem("pixuna.tabletAid") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pixuna.tabletAid", tabletAidOn ? "1" : "0"); } catch {}
  }, [tabletAidOn]);
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
      return {
        kind: "page",
        pageId: pageEl.dataset.pageId ?? "",
        xRatio: r.width > 0 ? clampUnit((clientX - r.left) / r.width) : 0.5,
        yRatio: r.height > 0 ? clampUnit((clientY - r.top) / r.height) : 0.5,
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

  // Beim ersten Anzeigen: gesamte Seite mittig anzeigen, leicht rausgezoomt.
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
    // 88 % des verfügbaren Platzes → sichtbarer Randabstand rund um das Blatt.
    const fit = Math.min(w / pageW, h / pageH) * 100 * 0.88;
    setZoom(clampProjectZoom(fit));
    didAutoFitRef.current = true;
    requestAnimationFrame(() => {
      const v = canvasViewportRef.current;
      if (!v) return;
      v.scrollLeft = Math.max(0, (v.scrollWidth - v.clientWidth) / 2);
      v.scrollTop = Math.max(0, (v.scrollHeight - v.clientHeight) / 2);
    });
  });


  // Aktueller Zoom als Ref, damit iPad-Touch-Handler ihn ohne Rerender lesen.
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const wheelAccumRef = useRef(1);
  const wheelAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const wheelRafRef = useRef(0);

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

  const setActiveToolAndTab = (t: PageTool) => {
    setPrintMode(false);
    setActiveTool(t);
    if (isLinePageTool(t)) setLineToolVariant(t);
    if (!isLinePageTool(t)) setLineToolFlyoutOpen(false);
    if (t !== "hatch") setHatchToolFlyoutOpen(false);
    if (t !== null) setSelectToolFlyoutOpen(false);
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
  const [toolSettings, setToolSettings] = useState<ToolSettings>({
    select: { multi: false, marqueeMode: "click" },
    guide: { color: "#7DD3FC", strokeWidth: 1, locked: false },
    line: { color: "#111111", thicknessMm: 0.5, alpha: 100 },
    text: {
      fontSize: 11,
      color: "#111111",
      bold: false,
      italic: false,
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

  // Legt die importierten Seiten mit dem aktuell im rechten Panel
  // gewählten Maßstab (docScale, z. B. "1:100") direkt im Modellbereich ab.
  // Kein Modal mehr — der Nutzer wählt den Maßstab wie beim CAD-Blatt vor
  // dem Import rechts über das Dropdown.
  const placeImportedPages = (pages: ImportedPage[]) => {
    const engine = cadEngineApiRef.current?.engine;
    if (!engine || pages.length === 0) return;
    const m = docScale.match(/^1\s*:\s*(\d+(?:[.,]\d+)?)$/);
    const parsed = m ? parseFloat(m[1].replace(",", ".")) : NaN;
    const denom = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    const [first, ...rest] = pages;
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
    let offX = firstW + 0.5;
    for (const p of rest) {
      const pw = p.widthM * denom;
      const ph = p.heightM * denom;
      engine.scene.createDocument({
        name: p.name,
        kind: p.kind,
        src: p.src,
        pageIndex: p.pageIndex,
        position: { x: offX, y: 0 },
        widthM: pw,
        heightM: ph,
        pixelWidth: p.pixelWidth,
        pixelHeight: p.pixelHeight,
        labelId: engine.activeDrawLabelId,
        importScaleDenom: denom,
        pdfSourceB64: p.pdfSourceB64 || null,
      });
      offX += pw + 0.5;
    }
    engine.refreshLabelUI();
  };

  const handleDocumentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setDocImporting(true);
    try {
      const pages = await importFile(f);
      if (pages.length === 0) { window.alert("Keine Seiten gefunden."); return; }
      if (pages.length === 1) {
        placeImportedPages(pages);
      } else {
        const all = new Set<number>();
        pages.forEach((_, i) => all.add(i));
        setDocPickerSelected(all);
        setDocPickerPages(pages);
      }
    } catch (err: any) {
      window.alert("Dokument-Import fehlgeschlagen: " + (err?.message || err));
    } finally {
      setDocImporting(false);
    }
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
      projectStore.addElement(projectId, targetPageId, {
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
      });
      setActivePageId(targetPageId);
    } catch (err: any) {
      window.alert("Einfügen des CAD-Blatts fehlgeschlagen: " + (err?.message || err));
    }
  }, [projectId]);


  const confirmDocumentPagePicker = () => {
    if (!docPickerPages) return;
    const selected = docPickerPages.filter((_, i) => docPickerSelected.has(i));
    setDocPickerPages(null);
    setDocPickerSelected(new Set());
    if (selected.length === 0) return;
    placeImportedPages(selected);
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          box.scrollLeft = Math.max(0, (box.scrollWidth - box.clientWidth) / 2);
          box.scrollTop = Math.max(0, (box.scrollHeight - box.clientHeight) / 2);
        });
      });
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

  // Entf-Shortcut auf Fenster-Ebene: nur reagieren, wenn kein Textfeld fokussiert
  // ist und tatsächlich etwas ausgewählt ist. So bleibt der Trash-Button 1:1
  // per Tastatur bedienbar (Projektmappe und CAD gleichermaßen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (selectedElementIds.length === 0 && cadSelectionCount === 0) return;
      // Wenn ausschließlich CAD-Auswahl existiert, überlassen wir es dem
      // MiniCad-eigenen Handler (der bereits den passenden Scene-Kontext hat).
      if (selectedElementIds.length === 0) return;
      e.preventDefault();
      runDeleteSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
        onPresent={() => setPresenting(true)}
        onShare={() => {}}
        onExport={() => setPrintMode((v) => !v)}
        tabletAidOn={tabletAidOn}
        onToggleTabletAid={() => setTabletAidOn((v) => !v)}
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
          icon={<FileImage size={18} />}
          label="Dokument"
          active={activeTool === "document"}
          showLabel
          onClick={() => setActiveToolAndTab(activeTool === "document" ? null : "document")}
        />
        <input
          ref={documentFileInputRef}
          type="file"
          accept=".pdf,application/pdf,image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleDocumentFileChange}
        />
        {docPickerPages && (
          <DocumentPagePickerDialog
            pages={docPickerPages}
            selected={docPickerSelected}
            onToggle={(i) => setDocPickerSelected((prev) => {
              const next = new Set(prev);
              if (next.has(i)) next.delete(i); else next.add(i);
              return next;
            })}
            onSelectAll={() => {
              const all = new Set<number>();
              docPickerPages.forEach((_, i) => all.add(i));
              setDocPickerSelected(all);
            }}
            onSelectNone={() => setDocPickerSelected(new Set())}
            onCancel={() => setDocPickerPages(null)}
            onConfirm={confirmDocumentPagePicker}
          />
        )}
        {/* Maßstab-Modal entfernt — Maßstab wird jetzt rechts im "Dokument"-
            Werkzeug-Panel per Dropdown vor dem Import gewählt. */}

        <ToolRailButton
          icon={<TableIcon size={18} />}
          label="Tabelle"
          active={activeTool === "table"}
          onClick={() => {
            const pid = activePage?.id;
            if (!pid) return;
            // Abschalten während Placement: aktives Element löschen & Tool abwählen.
            if (activeTool === "table" && pendingTableId) {
              projectStore.deleteElement(projectId, pid, pendingTableId);
              setPendingTableId(null);
              setActiveTool(null);
              setTableModifyMode(false);
              return;
            }
            const defRows = 3;
            const defCols = 3;
            const initialCells: string[][] = Array.from({ length: defRows }, (_, r) =>
              Array.from({ length: defCols }, (__, c) => (r === 0 ? `Spalte ${String.fromCharCode(65 + c)}` : ""))
            );
            // Default-Maße: klein, schlicht, an 11pt-Text angepasst (~7mm Zeile, ~26mm Spalte).
            const cellW = 26, cellH = 7;
            const w = cellW * defCols;
            const h = cellH * defRows;
            const fmt = FORMAT_SIZES[activePage!.format];
            const pageW = activePage!.customWidthMm ?? fmt.w;
            const pageH = activePage!.customHeightMm ?? fmt.h;
            const x = Math.max(5, (pageW - w) / 2);
            const y = Math.max(5, (pageH - h) / 2);
            const newId = projectStore.addElement(projectId, pid, {
              kind: "table",
              x, y, w, h,
              tableData: { cells: initialCells, headerRow: true, filters: {} },
            } as any);
            setPendingTableId(newId);
            setSelectedElementId(newId);
            setActiveToolAndTab("table");
          }}
        />

        <ToolRailButton icon={<StickyNote size={18} />} label="Notiz" disabled />

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
            style={{ background: "hsl(var(--surface))" }}
          >
            <div
              ref={canvasViewportRef}
              className="flex-1 overflow-hidden relative"
              style={{ touchAction: "pan-x pan-y" }}
              onWheel={(e) => {
                if ((window as any).__pixunaZoomLock) { if (e.cancelable) e.preventDefault(); return; }
                if (e.shiftKey && !e.altKey) {
                  return;
                }
                const container = e.currentTarget as HTMLDivElement;
                let dy = e.deltaY;
                if (e.deltaMode === 1) dy *= 16;
                if (e.deltaMode === 2) dy *= container.clientHeight;
                if (Math.abs(dy) > 60) {
                  const sign = dy < 0 ? -1 : 1;
                  dy = sign * (60 + Math.log2(Math.abs(dy) / 60 + 1) * 40);
                }
                let sensitivity = 0.00055;
                if (e.altKey) sensitivity = 0.0012;
                else if (e.ctrlKey || e.metaKey) sensitivity = 0.00042;
                const factor = Math.exp(-dy * sensitivity);
                // rAF-coalescing: mehrere Wheel-Ticks pro Frame in EINE
                // Zoom-Aktualisierung zusammenfassen (verhindert Ruckeln).
                wheelAccumRef.current *= factor;
                wheelAnchorRef.current = { x: e.clientX, y: e.clientY };
                if (!wheelRafRef.current) {
                  wheelRafRef.current = requestAnimationFrame(() => {
                    wheelRafRef.current = 0;
                    const f = wheelAccumRef.current;
                    wheelAccumRef.current = 1;
                    const a = wheelAnchorRef.current;
                    const current = zoomRef.current;
                    const next = clampProjectZoom(current * f);
                    if (Math.abs(next - current) < 0.002) return;
                    if (a) zoomAnchorRef.current = captureZoomAnchor(a.x, a.y);
                    setZoom(next);
                  });
                }
                if (e.cancelable) e.preventDefault();
              }}
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
                      onCadEngineReady={(api) => { cadEngineApiRef.current = api; forceEngineTick(t => t + 1); }}
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
                    className="min-h-full flex items-start justify-center"
                    style={{ padding: "60vh 60vw" }}
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
                                ? (api) => { cadEngineApiRef.current = api; forceEngineTick(t => t + 1); }
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
            <ZoomBar zoom={zoom} setZoom={setZoomClamped} />
          </main>

          {/* Right inspector (collapsible) */}
          {rightOpen ? (
            printMode ? (
              <PrintPanel
                project={project}
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
              docScale={docScale}
              onDocScaleChange={setDocScale}
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
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
  onCancel,
  onConfirm,
}: {
  pages: ImportedPage[];
  selected: Set<number>;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ background: "hsl(var(--ink) / 0.32)" }}>
      <div className="w-full max-w-2xl rounded-md border p-4 shadow-xl" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
        <div className="text-sm font-semibold mb-3">Seiten auswählen</div>
        <div className="max-h-[60vh] overflow-y-auto grid grid-cols-3 gap-3 p-1">
          {pages.map((p, i) => {
            const checked = selected.has(i);
            return (
              <button key={`${p.name}-${i}`} type="button" onClick={() => onToggle(i)} className="relative rounded-md border-2 overflow-hidden" style={{ borderColor: checked ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))" }}>
                <img src={p.src} alt={p.name} className="w-full h-32 object-contain" style={{ background: "hsl(var(--surface-muted))" }} />
                <div className="text-[10px] p-1 text-center truncate" style={{ background: "hsl(var(--surface-muted))" }}>Seite {i + 1}</div>
                {checked && <div className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface-card))" }}>✓</div>}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button type="button" onClick={onSelectNone} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>Keine</button>
          <button type="button" onClick={onSelectAll} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>Alle</button>
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>Abbrechen</button>
          <button type="button" onClick={onConfirm} disabled={selected.size === 0} className="h-8 px-3 rounded-md text-xs font-semibold disabled:opacity-50" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface-card))" }}>{selected.size} importieren</button>
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
  guide: { color: "#7DD3FC", strokeWidth: 1, locked: false },
  line: { color: "#111111", thicknessMm: 0.5, alpha: 100 },
  text: {
    fontSize: 11,
    color: "#111111",
    bold: false,
    italic: false,
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

  const inner = (
    <div
      className="relative"
      style={{
        width: displayWidth,
        height: displayHeight,
      }}
    >
      <div
        ref={pageRef}
        data-page-id={page.id}
          className="relative shadow-xl"
          style={{
            width: displayWidth,
            height: displayHeight,
            background: "white",
            border: "1px solid hsl(var(--hairline))",
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
            : activeTool === null ? "select"
            : null
          }
          hatchDrawMode={hatchDrawMode}
          enabled={activeTool === "line" || activeTool === "text" || activeTool === "guide" || activeTool === "free" || activeTool === "eraser" || activeTool === "hatch" || activeTool === "document" || activeTool === null}
          initialState={page.cadOverlay}
          ghostSnapState={overlayPage ? overlayPage.cadOverlay : null}
          lineColor={activeTool === "guide" ? toolSettings.guide.color : toolSettings.line.color}
          lineThicknessMm={activeTool === "guide" ? Math.max(0.1, toolSettings.guide.strokeWidth * 0.2) : toolSettings.line.thicknessMm}
          lineAlpha={toolSettings.line.alpha / 100}
          guideColor={toolSettings.guide.color}
          guidesLocked={toolSettings.guide.locked}
          multiSelectMode={toolSettings.select.multi}
          selectMarqueeMode={toolSettings.select.marqueeMode}

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
      className="min-h-full flex items-start justify-center"
      style={{ padding: "60vh 60vw" }}
    >
      {inner}
    </div>
  );
}


function ZoomBar({ zoom, setZoom }: { zoom: number; setZoom: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const sliderValue = zoomToSliderValue(zoom);
  return (
    <div
      className="h-10 shrink-0 border-t flex items-center justify-center gap-3 px-4"
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
        className="w-64 accent-foreground"
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
  onCornerDrag,
  onTransform,
  onJumpCad,
}: {
  el: PageElement;
  selected?: boolean;
  readOnly?: boolean;
  elevated?: boolean;
  onSelect?: (opts?: { shift?: boolean }) => void;
  onDrag?: (dx: number, dy: number, alt?: boolean) => void;

  onDuplicate?: () => void;
  onDelete?: () => void;
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

  const isCadView = el.kind === "cad-view" || el.kind === "cad-viewport";
  const hubBlue = "hsl(217 91% 60%)";


  const startDrag = (e: React.PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    onSelect?.({ shift: e.shiftKey });
    dragRef.current = { x: e.clientX, y: e.clientY };
    const handleMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      onDrag?.(dx, dy, ev.altKey);
    };
    const handleUp = (ev: PointerEvent) => {
      dragRef.current = null;
      try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    // Don't start a drag when the user clicks an interactive control inside the hub.
    const t = e.target as HTMLElement;
    if (t.closest("[data-hub-control]")) return;
    startDrag(e);
  };

  const handleRotateStart = (e: React.PointerEvent) => {
    if (readOnly || !onRotate) return;
    e.stopPropagation();
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const startRot = el.rotation ?? 0;
    rotateMovedRef.current = false;
    const handleMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 3) rotateMovedRef.current = true;
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let deg = startRot + ((a - startAngle) * 180) / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      onRotate(deg, true);
    };
    const handleUp = (ev: PointerEvent) => {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch {}
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };


  const hubKinds = new Set(["cad-view", "cad-viewport", "pdf", "image"]);
  const showHub = !readOnly && selected && hubKinds.has(el.kind);
  // CAD-Blatt behält nur die blaue Frame-Optik; Bearbeitung bleibt 1:1 wie PDF.
  const outlineStyle = selected
    ? (isCadView ? `2px dashed ${hubBlue}` : "2px solid hsl(var(--accent-gold))")
    : "none";

  return (
    <div
      ref={rootRef}
      data-marquee-id={el.id}
      onPointerDown={handlePointerDown}
      className="absolute"
      style={{
        left: `${el.x}%`,
        top: `${el.y}%`,
        width: `${el.w}%`,
        height: `${el.h}%`,
        outline: outlineStyle,
        outlineOffset: selected && isCadView ? "1px" : undefined,
        cursor: readOnly || isCadView ? "default" : "move",
        opacity: el.opacity ?? 1,
        boxShadow: el.shadow ? "0 8px 24px -8px rgba(0,0,0,0.25)" : undefined,
        border: el.border ? "1px solid hsl(var(--ink))" : undefined,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: "center center",
        zIndex: isCadView ? (showHub ? 90 : 40) : (showHub ? 80 : (elevated ? 30 : undefined)),
        touchAction: "none",
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
      {(el.kind === "cad-view" || el.kind === "cad-viewport") && (
        <CadViewportViewHost element={el} />
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
        el.pdfSourceB64 ? (
          <PdfPageView sourceB64={el.pdfSourceB64} pageIndex={el.pdfPageIndex ?? 0} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground" style={{ background: "hsl(var(--surface-muted))" }}>PDF</div>
        )
      )}

      {showHub && (
        <>
          {/* Rotation stem */}
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
              background: isCadView ? hubBlue : "hsl(var(--accent-gold))",
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
              background: isCadView ? hubBlue : "hsl(var(--accent-gold))",
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
              border: `1px solid ${isCadView ? hubBlue : "hsl(var(--hairline))"}`,
              padding: 3,
              zIndex: 10,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              data-hub-control
              onClick={(e) => { e.stopPropagation(); onRotate?.(15); }}
              title="Drehen +15°"
              className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
              style={isCadView ? { color: hubBlue } : undefined}
            >
              <RotateCw size={14} />
            </button>
            {!isCadView && (
              <button
                data-hub-control
                onClick={(e) => { e.stopPropagation(); onDuplicate?.(); }}
                title="Duplizieren"
                className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-[hsl(var(--surface-muted))]"
              >
                <Copy size={14} />
              </button>
            )}
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

          {/* Edge-Drag-Handles */}
          {(["top", "right", "bottom", "left"] as const).map((edge) => {
            const isHor = edge === "top" || edge === "bottom";
            const startEdgeDrag = (e: React.PointerEvent) => {
              if (!onEdgeDrag) return;
              e.stopPropagation();
              e.preventDefault();
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
              let last = { x: e.clientX, y: e.clientY };
              const move = (ev: PointerEvent) => {
                const dx = ev.clientX - last.x;
                const dy = ev.clientY - last.y;
                onEdgeDrag(edge, dx, dy);
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
            const baseStyle: React.CSSProperties = {
              position: "absolute",
              background: "transparent",
              cursor: isHor ? "ns-resize" : "ew-resize",
              zIndex: 5,
            };
            const sizeStyle: React.CSSProperties = isHor
              ? { left: 0, right: 0, height: 8, [edge === "top" ? "top" : "bottom"]: -4 }
              : { top: 0, bottom: 0, width: 8, [edge === "left" ? "left" : "right"]: -4 };
            const edgeStroke = isCadView ? hubBlue : "hsl(var(--accent-gold))";
            return (
              <div
                key={edge}
                data-hub-control
                onPointerDown={startEdgeDrag}
                title={`Kante ${edge} ziehen`}
                style={{ ...baseStyle, ...sizeStyle }}
              >
                <div
                  className="absolute"
                  style={
                    isHor
                      ? { left: 0, right: 0, top: "50%", height: 2, transform: "translateY(-50%)", background: edgeStroke, opacity: 0.7 }
                      : { top: 0, bottom: 0, left: "50%", width: 2, transform: "translateX(-50%)", background: edgeStroke, opacity: 0.7 }
                  }
                />
              </div>
            );
          })}

          {/* Ecken-Handles: quadratisch + blau bei CAD-Blatt, sonst rund + gold */}
          {onCornerDrag && (["tl", "tr", "bl", "br"] as const).map((corner) => {
            const startCornerDrag = (e: React.PointerEvent) => {
              e.stopPropagation();
              e.preventDefault();
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
              if (!onCornerDrag) return;
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
            const isTop = corner === "tl" || corner === "tr";
            const isLeft = corner === "tl" || corner === "bl";
            const cursor =
              corner === "tl" || corner === "br" ? "nwse-resize" : "nesw-resize";
            const size = isCadView ? 10 : 12;
            return (
              <div
                key={corner}
                data-hub-control
                onPointerDown={startCornerDrag}
                title={`Ecke skalieren (Shift: proportional)`}
                className="absolute"
                style={{
                  [isTop ? "top" : "bottom"]: -Math.floor(size / 2),
                  [isLeft ? "left" : "right"]: -Math.floor(size / 2),
                  width: size,
                  height: size,
                  borderRadius: isCadView ? 2 : 999,
                  background: "white",
                  border: `2px solid ${isCadView ? hubBlue : "hsl(var(--accent-gold))"}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  cursor,
                  zIndex: 6,
                } as React.CSSProperties}
              />
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
function CadViewportViewHost({ element }: { element: PageElement }) {
  const projects = useProjects();
  const sheet = React.useMemo(() => {
    if (!element.sheetId) return undefined;
    for (const p of projects) {
      const s = p.sheets.find((x) => x.id === element.sheetId);
      if (s) return s;
    }
    return undefined;
  }, [projects, element.sheetId]);
  return <CadViewportView element={element} sheet={sheet} />;
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
  docScale,
  onDocScaleChange,
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
  documentImporting?: boolean;
  onDocumentImport?: () => void;
  docScale?: string;
  onDocScaleChange?: (s: string) => void;
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
}) {

  const layerCount = page?.elements.length ?? 0;
  return (
    <aside
      className="w-[280px] shrink-0 border-l flex flex-col text-[11px]"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] shrink-0 border-b items-stretch" style={{ borderColor: "hsl(var(--hairline))" }}>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")} label="Seiteneinstellung" />
        <TabButton active={tab === "tools"} onClick={() => setTab("tools")} label="Werkzeugeinstellung" />
        <TabButton
          active={tab === "layers"}
          onClick={() => setTab("layers")}
          label="Ebenen"
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

      <DragScrollDiv axis="both" className="flex-1 min-h-0 overflow-auto p-2 cursor-grab active:cursor-grabbing">
        <div className="min-w-[320px] space-y-2">
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
              docScale={docScale}
              onDocScaleChange={onDocScaleChange}
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
          {tab === "layers" && page && (
            <div className="space-y-4">
            {/* CAD-Ebenen (Bezeichnungs-ID) — 1:1 wie in der CAD-Oberfläche.
                Verwaltet alle CAD-Objekte (Linien, Schraffuren, Texte,
                Freihand, Dokumente, Wände, Maßketten) per Layer/Sichtbarkeit. */}
            {cadEngine && <CadIdPanelHost engine={cadEngine} />}

            {/* Projektmappen-Elemente (Notizen, Bilder, CAD-Blätter, …) —
                Z-Order + Sichtbarkeit auf React-Ebene. */}
              <LayersTab
                projectId={projectId}
                page={page}
                selectedElementId={selectedElementId}
                setSelectedElementId={setSelectedElementId}
              />
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 truncate px-2 py-2 text-[11px] font-medium transition-colors relative"
      style={{
        background: active ? "hsl(var(--surface-card))" : "hsl(var(--surface-muted))",
        color: active ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
        borderBottom: active ? "2px solid hsl(var(--accent-gold))" : "2px solid transparent",
      }}
    >
      {label}
      {badge !== undefined && (
        <span
          className="ml-1 text-[9px] px-1 py-0.5 rounded-full align-middle"
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
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
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
  docScale,
  onDocScaleChange,
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
  selectedCadTool?: "line" | "free" | "text" | "hatch";
  selectedElementId?: string;
  selectedElementIds?: string[];
  setSelectedElementId: (id?: string) => void;
  toolSettings: ToolSettings;
  cadSelectionCount?: number;
  cadSelectedLineSnap?: { midpoint: boolean; division: number | null; isGuide: boolean } | null;
  documentImporting?: boolean;
  onDocumentImport?: () => void;
  docScale?: string;
  onDocScaleChange?: (s: string) => void;
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

  const settingsTool = activeTool ?? selectedCadTool ?? null;
  return (
    <div className="space-y-5">
      {/* "Aktives Werkzeug"-Kopfzeile entfernt — der Nutzer weiß, welches
          Werkzeug er in der Rail angeklickt hat. */}

      {/* Ebenen-Auswahl — bestimmt, in welche Ebene neu gezeichnete Objekte
          landen. Analog zum "Ebene"-Dropdown in der CAD-Oberfläche. */}
      {cadEngine && settingsTool && settingsTool !== "cad" && (
        <EbeneSelect engine={cadEngine} />
      )}

      {/* Per-tool settings */}

      {/* Rahmen-Modus (Berühren / Umschließen) liegt jetzt als Flyout links am
          Auswahl-Symbol — kein eigenes Panel mehr in den Werkzeugeinstellungen. */}
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
      {settingsTool === "document" && (
        <DocumentToolSettings importing={!!documentImporting} onImport={onDocumentImport} scale={docScale ?? "1:100"} onScaleChange={onDocScaleChange} />
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
      {!activeTool && cadEngine && (
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

function DocumentToolSettings({
  importing,
  onImport,
  scale,
  onScaleChange,
}: {
  importing: boolean;
  onImport?: () => void;
  scale: string;
  onScaleChange?: (s: string) => void;
}) {
  const selectValue = PAGE_PLAN_SCALES.includes(scale) ? scale : "__other__";
  return (
    <SettingsBlock title="DOKUMENT IMPORTIEREN">
      {/* Maßstab-Dropdown — wie beim CAD-Blatt: legt fest, in welchem
          Ausgabemaßstab das importierte Dokument (A4/A3/A2 …) im
          Modellbereich abgelegt wird. Modell selbst bleibt 1:1. */}
      <Row label="Maßstab">
        <select
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "frei") {
              const picked = askPlanScale(scale);
              if (picked) onScaleChange?.(picked);
            } else if (v !== "__other__") {
              onScaleChange?.(v);
            }
          }}
          className="w-full h-8 px-2 rounded border bg-transparent text-sm"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          {!PAGE_PLAN_SCALES.includes(scale) && (
            <option value="__other__">{scale}</option>
          )}
          {PAGE_PLAN_SCALES.map((sc) => (
            <option key={sc} value={sc}>{sc}</option>
          ))}
          <option value="frei">frei…</option>
        </select>
      </Row>

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

      <div className="text-[11px] leading-relaxed text-muted-foreground pt-2 border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div>Import erfolgt im gewählten Maßstab (z. B. {scale}) auf A4/A3/A2 …</div>
        <div>Zum Skalieren, Drehen oder Zuschneiden: <strong>Auswahl-Werkzeug</strong> → Dokument anklicken.</div>
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
        <select
          value={settings.autoSize === false ? "frame" : "auto"}
          onChange={(e) => {
            if (e.target.value === "frame") onChange({ autoSize: false, wrap: true });
            else onChange({ autoSize: true, wrap: false });
          }}
          className="w-full h-8 px-2 rounded bg-transparent border text-xs"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <option value="auto">Rahmen passt sich an</option>
          <option value="frame">Rahmen zeichnen</option>
        </select>
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
      <Row label="Schriftgröße">
        <input
          type="number"
          min={1}
          step={1}
          value={settings.fontSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) onChange({ fontSize: n });
          }}
          className="w-20 h-8 px-2 rounded bg-transparent border text-sm tabular-nums"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
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
      <Row label="Farbe">
        <ColorInput value={settings.color} onChange={(v) => onChange({ color: v })} />
      </Row>
      <Row label="Hintergrund">
        <ColorInput value={settings.bgColor} onChange={(v) => onChange({ bgColor: v })} />
      </Row>
      <Row label="Transparenz">
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
  const navigate = useNavigate();
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
                    <div className="grid grid-cols-2 gap-1 pl-2">
                      <button
                        type="button"
                        onClick={() => goCadForSheetPdf(s.id, "view", curScale)}
                        className="h-7 rounded-md border text-[10px] hover:bg-muted"
                        style={{ borderColor: "hsl(var(--hairline))" }}
                        title="Aktuell sichtbaren Ausschnitt im richtigen Maßstab einfügen"
                      >
                        Ansicht
                      </button>
                      <button
                        type="button"
                        onClick={() => goCadForSheetPdf(s.id, "frame", curScale)}
                        className="h-7 rounded-md border text-[10px] hover:bg-muted"
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
                        projectStore.updateElement(projectId, pageId, el.id, {
                          viewSnapshot: sheet?.thumbnail,
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
                    <select
                      value={(() => {
                        const cur = el.scale ?? sheet?.scale ?? "1:100";
                        return PAGE_PLAN_SCALES.includes(cur) ? cur : "frei";
                      })()}
                      onChange={(ev) => {
                        if (!pageId) return;
                        let next = ev.target.value;
                        if (next === "frei") {
                          const picked = askPlanScale(el.scale ?? sheet?.scale ?? "1:100");
                          if (!picked) return;
                          next = picked;
                        }
                        projectStore.updateElement(projectId, pageId, el.id, { scale: next });
                      }}
                      onClick={(ev) => ev.stopPropagation()}
                      className="flex-1 h-7 px-2 rounded bg-transparent border text-sm"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                    >
                      {PAGE_PLAN_SCALES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      {(() => {
                        const cur = el.scale ?? sheet?.scale ?? "1:100";
                        if (!PAGE_PLAN_SCALES.includes(cur)) {
                          return <option key={cur} value={cur}>{cur}</option>;
                        }
                        return null;
                      })()}
                      <option value="frei">frei…</option>
                    </select>
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

      {(element.kind === "cad-view" || element.kind === "cad-viewport") && (() => {
        const project = projectStore.getState().projects.find((p) => p.id === projectId);
        const sheet = project?.sheets.find((s) => s.id === element.sheetId);
        const cur = element.scale ?? sheet?.scale ?? "1:100";
        return (
          <>
            <Row label="Maßstab">
              <select
                value={PAGE_PLAN_SCALES.includes(cur) ? cur : "frei"}
                onChange={(ev) => {
                  let next = ev.target.value;
                  if (next === "frei") {
                    const picked = askPlanScale(cur);
                    if (!picked) return;
                    next = picked;
                  }
                  update({ scale: next });
                }}
                className="w-full h-8 px-2 rounded bg-transparent border text-sm"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                {PAGE_PLAN_SCALES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {!PAGE_PLAN_SCALES.includes(cur) && (
                  <option key={cur} value={cur}>{cur}</option>
                )}
                <option value="frei">frei…</option>
              </select>
            </Row>
            <button
              onClick={() => update({
                viewSnapshot: sheet?.thumbnail ?? element.viewSnapshot,
                lastSyncAt: new Date().toISOString(),
              })}
              className="w-full h-9 rounded-md text-sm border flex items-center justify-center gap-2 mt-2"
              style={{ borderColor: "hsl(var(--hairline))" }}
              title="Aktuelle CAD-Ansicht als Snapshot übernehmen"
            >
              <RefreshCw size={14} /> Ansicht aktualisieren
            </button>
          </>
        );
      })()}

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
  setActivePageId,
  onClose,
}: {
  project: import("@/lib/projectStore").Project;
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

  // Aktiv gefilterte Seiten anhand Modus (Alle / Aktuell / Bereich) und Auswahl.
  const resolveExportIds = (): string[] => {
    let base: string[] = [];
    if (pageMode === "all") base = project.pages.map((p) => p.id);
    else if (pageMode === "current") base = project.pages.slice(0, 1).map((p) => p.id);
    else {
      const from = Math.max(1, Math.min(project.pages.length, rangeStart)) - 1;
      const to = Math.max(1, Math.min(project.pages.length, rangeEnd));
      base = project.pages.slice(from, to).map((p) => p.id);
    }
    return base.filter((id) => selectedIds.has(id));
  };

  const handleExport = async () => {
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
      downloadPdf(bytes, `${safeName}.pdf`);
      onClose();
    } catch (err) {
      console.error("PDF-Export fehlgeschlagen:", err);
      alert("PDF-Export fehlgeschlagen. Details in der Konsole.");
    } finally {
      setExporting(false);
      setProgress(null);
    }
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
        className="border-t p-3 flex gap-2"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
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

