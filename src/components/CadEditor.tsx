import React, { useRef, useEffect, useState, useCallback } from "react";
import { DragScrollDiv } from "@/components/DragScrollDiv";
import { CadApp } from "@/cad/CadApp";
import { ToolIds, PointEditAction } from "@/cad/constants";
import { MousePointer2, Minus, Square, ChevronLeft, ChevronRight, Undo2, Redo2, Spline, RectangleHorizontal, Circle, Ruler, Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Pipette, Sticker as StickerIcon, Pencil, Trash2, Download, Upload, Plus, FileImage, FileText, Maximize2, Ruler as RulerIcon, Eraser, Construction, BrickWall, PaintBucket, Grid3x3, DoorOpen, AppWindow, Move, RotateCw, PanelRightOpen, PanelRightClose, Crosshair, Scaling, Check, Scissors, Anchor as AnchorIcon, SquareDashed, BoxSelect, FlipHorizontal2, FolderOpen } from "lucide-react";
import type { HatchDrawMode } from "@/cad/HatchTool";
import type { StickerDefinition } from "@/cad/StickerManager";
import { instanceBoundingCornersWorld } from "@/cad/StickerManager";
import { importFile, type ImportedPage } from "@/cad/documentImport";
import { projectStore } from "@/lib/projectStore";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FreeDrawSettingsPanel } from "@/components/cad/FreeDrawSettingsPanel";
import { EraserSettingsPanel } from "@/components/cad/EraserSettingsPanel";
import { ProjectFilePickerDialog } from "@/components/cad/ProjectFilePickerDialog";
import { WallSettingsPanel } from "@/components/cad/WallSettingsPanel";
import { HatchPatternBlock } from "@/components/cad/HatchPatternBlock";

import { ToolHelpNotes } from "@/components/cad/ToolHelpNotes";
import { RasterModeToggle } from "@/components/cad/RasterModeToggle";

import { DocumentFilterPanel } from "@/components/cad/DocumentFilterPanel";
import { DocumentPixelModeToggle } from "@/components/cad/DocumentPixelModeToggle";
import { WarpSection } from "@/components/page/CadDocumentInspector";

const CAD_TOOLS = [
  { id: ToolIds.SELECT, label: "Auswahl", key: "V", icon: MousePointer2 },
  { id: ToolIds.WALL, label: "Wand", key: "W", icon: BrickWall },
  { id: ToolIds.DOOR, label: "Türen/Fenster", key: "U", icon: DoorOpen },
  { id: ToolIds.LINE, label: "Linie", key: "L", icon: Minus },
  { id: ToolIds.HATCH, label: "Schraffur", key: "H", icon: Square },
  { id: ToolIds.MEASURE, label: "Maßkette", key: "M", icon: Ruler },
  { id: ToolIds.TEXT, label: "Text", key: "T", icon: Type },
  { id: ToolIds.STICKER, label: "Sticker", key: "O", icon: StickerIcon },
  { id: ToolIds.DOCUMENT, label: "Dokument", key: "D", icon: FileImage },
];


// Sub-Werkzeuge unter "Linie": gemeinsam ein Einstellungsfenster mit
// drei wählbaren Zeichenarten oben. Letzte Auswahl wird gemerkt.
const LINE_VARIANTS = [
  { id: ToolIds.LINE, label: "Linie", icon: Minus },
  { id: ToolIds.FREE, label: "Freihand", icon: Pencil },
  { id: ToolIds.ERASER, label: "Radiergummi", icon: Eraser },
];

type ToolVariant =
  | { kind: "tool"; id: string; label: string; icon: any }
  | { kind: "hatch"; mode: HatchDrawMode; label: string; icon: any }
  | { kind: "marquee"; mode: "touch" | "enclose" | "click"; label: string; icon: any };

const TOOL_VARIANTS: Record<string, ToolVariant[]> = {
  [ToolIds.LINE]: [
    { kind: "tool", id: ToolIds.LINE, label: "Linie", icon: Minus },
    { kind: "tool", id: ToolIds.FREE, label: "Freihand", icon: Pencil },
    { kind: "tool", id: ToolIds.ERASER, label: "Radiergummi", icon: Eraser },
  ],
  [ToolIds.HATCH]: [
    { kind: "hatch", mode: "polygon", label: "Polygon", icon: Spline },
    { kind: "hatch", mode: "rectangle", label: "Rechteck", icon: RectangleHorizontal },
    { kind: "hatch", mode: "circle", label: "Kreis", icon: Circle },
    { kind: "hatch", mode: "fill", label: "Füllung", icon: PaintBucket },
  ],
  [ToolIds.SELECT]: [
    { kind: "marquee", mode: "click",   label: "Klick",       icon: MousePointer2 },
    { kind: "marquee", mode: "touch",   label: "Berühren",    icon: SquareDashed },
    { kind: "marquee", mode: "enclose", label: "Umschließen", icon: BoxSelect },
  ],
};

export interface CadEditorHandle {
  undo: () => void;
  redo: () => void;
  exportPdf: () => void;
  openExportPanel: () => void;
  deleteSelection: () => void;
  hasDeletableSelection: () => boolean;
  copySelection: () => boolean;
  pasteClipboard: () => boolean;
  hasClipboard: () => boolean;
  /** CSS-Pixel pro Welt-Meter (camera.scale). */
  getCameraScale: () => number;
  /** Welt-Koordinaten (Meter) an einer Bildschirm-CSS-Position im Canvas. */
  screenToWorldM: (cssX: number, cssY: number) => { x: number; y: number };
}

interface CadEditorProps {
  projectId?: string;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onZoomChange?: (percent: number) => void;
  onCanDeleteChange?: (canDelete: boolean) => void;
  /** Präsentations-Modus: blendet linke Werkzeug- und rechte Einstellungsleiste aus. */
  presenting?: boolean;
}
const CadEditor = React.forwardRef<CadEditorHandle, CadEditorProps>(({ projectId, onHistoryChange, onZoomChange, onCanDeleteChange, presenting }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const hubLenRef = useRef<HTMLInputElement>(null);
  const hubAngRef = useRef<HTMLInputElement>(null);
  const pointEditRef = useRef<HTMLDivElement>(null);
  const pointMoveBtnRef = useRef<HTMLButtonElement>(null);
  const pointTranslateBtnRef = useRef<HTMLButtonElement>(null);
  const pointRotateBtnRef = useRef<HTMLButtonElement>(null);
  const pointDeleteBtnRef = useRef<HTMLButtonElement>(null);
  const pointOffsetBtnRef = useRef<HTMLButtonElement>(null);
  const pointInsertPointBtnRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const idSelectRef = useRef<HTMLSelectElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const colorPreviewRef = useRef<HTMLDivElement>(null);
  const thicknessInputRef = useRef<HTMLInputElement>(null);

  // IdPanel refs
  const idPanelRef = useRef<HTMLDivElement>(null);
  const idBodyRef = useRef<HTMLDivElement>(null);
  const idListRef = useRef<HTMLDivElement>(null);
  const idAddBtnRef = useRef<HTMLButtonElement>(null);
  const idToggleBtnRef = useRef<HTMLButtonElement>(null);

  // SheetPanel refs (Zeichnungs-ID / Transparentpause)
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const sheetListRef = useRef<HTMLDivElement>(null);
  const sheetAddBtnRef = useRef<HTMLButtonElement>(null);
  const sheetToggleBtnRef = useRef<HTMLButtonElement>(null);

  // PlanPanel refs (Druckpläne)
  const planPanelRef = useRef<HTMLDivElement>(null);
  const planBodyRef = useRef<HTMLDivElement>(null);
  const planListRef = useRef<HTMLDivElement>(null);
  const planAddBtnRef = useRef<HTMLButtonElement>(null);
  const planPrintBtnRef = useRef<HTMLButtonElement>(null);
  const planToggleBtnRef = useRef<HTMLButtonElement>(null);

  // Hatch settings refs
  const hatchSettingsRef = useRef<HTMLDivElement>(null);
  const hatchIdSelectRef = useRef<HTMLSelectElement>(null);
  const hatchFillColorRef = useRef<HTMLInputElement>(null);
  const hatchFillPreviewRef = useRef<HTMLDivElement>(null);
  const hatchStrokeColorRef = useRef<HTMLInputElement>(null);
  const hatchStrokePreviewRef = useRef<HTMLDivElement>(null);
  const hatchStrokeWidthRef = useRef<HTMLInputElement>(null);
  const hatchAlphaRef = useRef<HTMLInputElement>(null);
  const areaShowRef = useRef<HTMLInputElement>(null);
  const areaSettingsGroupRef = useRef<HTMLDivElement>(null);
  const areaTextColorRef = useRef<HTMLInputElement>(null);
  const areaTextPreviewRef = useRef<HTMLDivElement>(null);
  const areaFontSizeRef = useRef<HTMLInputElement>(null);
  const areaBgColorRef = useRef<HTMLInputElement>(null);
  const areaBgPreviewRef = useRef<HTMLDivElement>(null);
  const areaBgAlphaRef = useRef<HTMLInputElement>(null);

  // Measure settings refs
  const measureSettingsRef = useRef<HTMLDivElement>(null);
  const measureIdSelectRef = useRef<HTMLSelectElement>(null);
  const measureOrientationRef = useRef<HTMLSelectElement>(null);
  const measurePointCountRef = useRef<HTMLSelectElement>(null);
  const measureDirectionRef = useRef<HTMLSelectElement>(null);
  const measureEditModeRef = useRef<HTMLSelectElement>(null);

  const measureExtRef = useRef<HTMLInputElement>(null);
  const measureExtGroupRef = useRef<HTMLDivElement>(null);
  const measureExtStyleRef = useRef<HTMLSelectElement>(null);
  const measureExtColorRef = useRef<HTMLInputElement>(null);
  const measureExtColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureExtAlphaRef = useRef<HTMLInputElement>(null);
  const measureFreeTextToggleRef = useRef<HTMLInputElement>(null);
  const measureFreeTextInputRef = useRef<HTMLInputElement>(null);
  const measureFreeTextGroupRef = useRef<HTMLDivElement>(null);
  const measureFreeTextBoldRef = useRef<HTMLButtonElement>(null);
  const measureFreeTextItalicRef = useRef<HTMLButtonElement>(null);
  const measureFreeTextColorRef = useRef<HTMLInputElement>(null);
  const measureFreeTextColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureTextColorRef = useRef<HTMLInputElement>(null);
  const measureTextColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureTextSizeRef = useRef<HTMLInputElement>(null);
  const measureTextGapRef = useRef<HTMLInputElement>(null);
  const measureDoorHeightTextRef = useRef<HTMLInputElement>(null);
  const measureDecimalsRef = useRef<HTMLInputElement>(null);
  const measureTextBgToggleRef = useRef<HTMLInputElement>(null);
  const measureTextBgGroupRef = useRef<HTMLDivElement>(null);
  const measureTextBgColorRef = useRef<HTMLInputElement>(null);
  const measureTextBgColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureTextBgAlphaRef = useRef<HTMLInputElement>(null);
  const measureLineColorRef = useRef<HTMLInputElement>(null);
  const measureLineColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureTickLengthRef = useRef<HTMLInputElement>(null);
  const measureShowUnitRef = useRef<HTMLInputElement>(null);
  const measureUnitRef = useRef<HTMLSelectElement>(null);

  // Text settings refs
  const textSettingsRef = useRef<HTMLDivElement>(null);
  const textIdSelectRef = useRef<HTMLSelectElement>(null);
  const textColorRef = useRef<HTMLInputElement>(null);
  const textColorPreviewRef = useRef<HTMLDivElement>(null);
  const textFontSizeRef = useRef<HTMLInputElement>(null);
  const textAlignLeftRef = useRef<HTMLButtonElement>(null);
  const textAlignCenterRef = useRef<HTMLButtonElement>(null);
  const textAlignRightRef = useRef<HTMLButtonElement>(null);
  const textBgColorRef = useRef<HTMLInputElement>(null);
  const textBgColorPreviewRef = useRef<HTMLDivElement>(null);
  const textBgAlphaRef = useRef<HTMLInputElement>(null);
  const textWrapRef = useRef<HTMLInputElement>(null);
  const textBorderToggleRef = useRef<HTMLInputElement>(null);
  const textBorderGroupRef = useRef<HTMLDivElement>(null);
  const textBorderColorRef = useRef<HTMLInputElement>(null);
  const textBorderColorPreviewRef = useRef<HTMLDivElement>(null);
  const textBorderWidthRef = useRef<HTMLInputElement>(null);
  const textModeAutoRef = useRef<HTMLButtonElement>(null);
  const textModeFrameRef = useRef<HTMLButtonElement>(null);
  const textBoldRef = useRef<HTMLButtonElement>(null);
  const textItalicRef = useRef<HTMLButtonElement>(null);
  const textUnderlineRef = useRef<HTMLButtonElement>(null);
  const textStrikeRef = useRef<HTMLButtonElement>(null);
  const textLineHeightRangeRef = useRef<HTMLInputElement>(null);
  const textLineHeightNumRef = useRef<HTMLInputElement>(null);
  const textBgAlphaRangeRef = useRef<HTMLInputElement>(null);
  const textFontSizePtRef = useRef<HTMLInputElement>(null);

  // Text editor overlay refs
  const textEditorElRef = useRef<HTMLDivElement>(null);
  const textEditorToolbarRef = useRef<HTMLDivElement>(null);
  const textEditorBoldRef = useRef<HTMLButtonElement>(null);
  const textEditorItalicRef = useRef<HTMLButtonElement>(null);
  const textEditorColorRef = useRef<HTMLInputElement>(null);
  const textEditorSizeRef = useRef<HTMLSelectElement>(null);
  const textEditorSymbolRef = useRef<HTMLSelectElement>(null);

  const appRef = useRef<CadApp | null>(null);
  const [cadApp, setCadApp] = useState<CadApp | null>(null);

  React.useImperativeHandle(ref, () => ({
    undo: () => appRef.current?.undo(),
    redo: () => appRef.current?.redo(),
    exportPdf: () => appRef.current?.printSelectedPlans(),
    openExportPanel: () => {
      setRightOpen(true);
      setRightTab("sheets");
      // Kleines Delay, damit der Sheets-Tab gerendert ist bevor wir hineinscrollen.
      setTimeout(() => {
        const body = planBodyRef.current;
        // Sicherstellen, dass die Druckpläne-Sektion ausgeklappt ist.
        if (body && body.classList.contains("collapsed")) {
          planToggleBtnRef.current?.click();
        }
        planPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    },
    deleteSelection: () => { appRef.current?.deleteSelection(); },
    copySelection: () => appRef.current?.copySelection() ?? false,
    pasteClipboard: () => appRef.current?.startPastePreview() ?? false,
    hasClipboard: () => !!appRef.current?.clipboard,
    hasDeletableSelection: () => appRef.current?.hasDeletableSelection() ?? false,
    getCameraScale: () => appRef.current?.camera.scale ?? 80,
    screenToWorldM: (cssX, cssY) => {
      const cam = appRef.current?.camera;
      if (!cam) return { x: 0, y: 0 };
      return cam.screenToWorld(cssX, cssY);
    },
  }), []);

  // Zoom-Anzeige nach oben spiegeln (Camera.scale, 80 = 100%).
  useEffect(() => {
    if (!onZoomChange) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const s = appRef.current?.camera.scale;
      if (typeof s === "number") {
        const pct = Math.round((s / 80) * 100);
        if (pct !== last) { last = pct; onZoomChange(pct); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onZoomChange]);

  // Melde Verfügbarkeit einer löschbaren Auswahl (für den Header-Papierkorb).
  useEffect(() => {
    if (!onCanDeleteChange) return;
    let raf = 0;
    let last = false;
    const tick = () => {
      const c = appRef.current?.hasDeletableSelection() ?? false;
      if (c !== last) { last = c; onCanDeleteChange(c); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onCanDeleteChange]);

  const [activeTool, setActiveTool] = useState<string>(ToolIds.SELECT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(true);
  const [rightOpen, setRightOpen] = useState<boolean>(true);
  const [rightTab, setRightTab] = useState<"settings" | "sheets" | "layers">("settings");
  
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const leftSidebarRef = useRef<HTMLElement>(null);
  // Outside-Klick schließt das Werkzeug-Flyout (Freihand/Radiergummi/Schraffur-Varianten …).
  useEffect(() => {
    if (!expandedTool) return;
    const onDown = (e: MouseEvent | PointerEvent) => {
      const el = leftSidebarRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setExpandedTool(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [expandedTool]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hatchDrawMode, setHatchDrawMode] = useState<HatchDrawMode>("polygon");
  // Letzter Zeichen-Modus innerhalb der "Linie"-Variante (Linie/Freihand/Radiergummi).
  // Default = Linie. Bei jedem Wechsel wird gemerkt.
  const [lineVariant, setLineVariant] = useState<string>(ToolIds.LINE);
  // Marquee-Rahmen-Modus des Auswahl-Werkzeugs (Berühren / Umschließen).
  // Wird über das Flyout links am Auswahl-Symbol umgeschaltet.
  const [selectMarqueeMode, setSelectMarqueeMode] = useState<"touch" | "enclose" | "click">("click");
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedFreeStrokeId, setSelectedFreeStrokeId] = useState<string | null>(null);
  const [stickers, setStickers] = useState<StickerDefinition[]>([]);
  const [stickerSelCount, setStickerSelCount] = useState(0);
  const [stickerPhase, setStickerPhase] = useState<"idle" | "selecting" | "placing" | "rotating">("idle");
  const stickerImportRef = useRef<HTMLInputElement>(null);
  // Floating edit-pencil overlay near selected sticker instance
  const [stickerEditOverlay, setStickerEditOverlay] = useState<{ id: string; x: number; y: number } | null>(null);

  // Document import state
  const [docLabelTick, setDocLabelTick] = useState(0);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const [docPickerPages, setDocPickerPages] = useState<ImportedPage[] | null>(null);
  const [docPickerSelected, setDocPickerSelected] = useState<Set<number>>(new Set());
  const [docLibraryOpen, setDocLibraryOpen] = useState(false);
  const [docImporting, setDocImporting] = useState(false);
  // Dokumentenwerkzeug (identisch zur Projektmappe): ohne Häkchen wird frei
  // platziert (Originalgröße), mit Häkchen greift der eingestellte Maßstab.
  const [docFreePlace, setDocFreePlace] = useState(true);
  const [docImportScale, setDocImportScale] = useState("1:100");
  const [docSelected, setDocSelected] = useState<{ id: string; name: string; widthM: number; heightM: number; importScaleDenom: number; kind: "image" | "pdf-page"; pdfSourceB64: string | null } | null>(null);
  const [docFilterSig, setDocFilterSig] = useState<string>("");
  const [docScalePopoverOpen, setDocScalePopoverOpen] = useState(false);
  const [docScaleChoice, setDocScaleChoice] = useState<string>("100");
  const [docScaleCustom, setDocScaleCustom] = useState<string>("100");
  const [docToolPhase, setDocToolPhase] = useState<string>("idle");
  const docFreeScaleBaseRef = useRef<{ id: string; w: number; h: number } | null>(null);
  const [docFreeScalePct, setDocFreeScalePct] = useState<number>(100);
  useEffect(() => {
    if (!docSelected) { docFreeScaleBaseRef.current = null; return; }
    const base = docFreeScaleBaseRef.current;
    if (!base || base.id !== docSelected.id) {
      docFreeScaleBaseRef.current = { id: docSelected.id, w: docSelected.widthM, h: docSelected.heightM };
      setDocFreeScalePct(100);
    } else {
      const cur = base.w > 0 ? (docSelected.widthM / base.w) * 100 : 100;
      setDocFreeScalePct(prev => Math.abs(prev - cur) > 0.5 ? Math.round(cur) : prev);
    }
  }, [docSelected?.id, docSelected?.widthM, docSelected?.heightM]);
  // Maßstab-Auswahl vor Platzierung
  const [scaleDialogPages, setScaleDialogPages] = useState<ImportedPage[] | null>(null);
  const [scaleChoice, setScaleChoice] = useState<string>("100"); // "50" | "100" | "200" | "500" | "1" | "custom"
  const [scaleCustom, setScaleCustom] = useState<string>("100");
  // Zeichenoberfläche ist immer 1:1 — nur Import-Dialog nutzt den Wert
  // als Default-Vorauswahl beim PDF-Import.
  const drawingScale = 1;

  // Raster (Hintergrund-Grid) Einstellungen
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridPanelOpen, setGridPanelOpen] = useState(false);
  const [gridSizeM, setGridSizeM] = useState<number>(1);
  const [gridColor, setGridColor] = useState<string>("#000000");
  const [gridOpacity, setGridOpacity] = useState<number>(0.06);
  // Hintergrundfarbe der Oberfläche
  const [bgColor, setBgColor] = useState<string>("#ffffff");

  // Door tool state (Türen/Fenster)
  const [doorMode, setDoorMode] = useState<"door" | "window">("door");
  const [doorWidthM, setDoorWidthM] = useState<number>(0.9);
  const [doorHeightM, setDoorHeightM] = useState<number>(2.1);
  const [doorBreakHeightM, setDoorBreakHeightM] = useState<number>(0);
  const [doorBreakHeightVisible, setDoorBreakHeightVisible] = useState<boolean>(false);
  // Line arrow settings
  const [lineArrowStart, setLineArrowStart] = useState<boolean>(false);
  const [lineArrowEnd, setLineArrowEnd] = useState<boolean>(false);
  const [lineArrowScale, setLineArrowScale] = useState<number>(1);
  // Linien-Transparenz (1–100 %) — wird als rgba() auf die Linienfarbe angewendet.
  const [lineAlpha, setLineAlpha] = useState<number>(100);
  function applyLineAlpha(pct: number) {
    const clamped = Math.min(100, Math.max(1, Math.round(pct)));
    setLineAlpha(clamped);
    const app: any = appRef.current;
    if (!app) return;
    const hex = colorInputRef.current?.value || app.defaultLineColor || "#111111";
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    const next = clamped >= 100
      ? hex
      : m
        ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${clamped / 100})`
        : hex;
    const selected = app.getSelectedSegment?.();
    if (selected) { selected.color = next; }
    else {
      const group = app.getSelectedGroupSegments?.() ?? [];
      if (group.length > 0) { for (const seg of group) seg.color = next; }
      else { app.defaultLineColor = next; }
    }
    app.requestRender?.();
  }


  const [doorSide, setDoorSide] = useState<"inner" | "outer">("inner");
  const [doorHand, setDoorHand] = useState<"left" | "right">("left");
  const [doorEdge, setDoorEdge] = useState<"inner" | "center" | "outer">("center");
  const [doorColor, setDoorColor] = useState<string>("#000000");
  const [doorJambEnabled, setDoorJambEnabled] = useState<boolean>(true);
  const [doorJambColor, setDoorJambColor] = useState<string>("#808080");
  const [doorJambLenM, setDoorJambLenM] = useState<number>(0.086);
  const [doorJambThickM, setDoorJambThickM] = useState<number>(0.08);
  const [doorSashEnabled, setDoorSashEnabled] = useState<boolean>(true);
  const [doorGlassColor, setDoorGlassColor] = useState<string>("#000000");
  const [doorGlassThickM, setDoorGlassThickM] = useState<number>(0.08);
  const [doorGlassFillColor, setDoorGlassFillColor] = useState<string>("");
  const [doorSelectedId, setDoorSelectedId] = useState<string | null>(null);
  const [doorHub, setDoorHub] = useState<{ visible: boolean; screenX: number; screenY: number; doorId: string | null; posM: number; widthM: number; moving: boolean; resizing: boolean }>({ visible: false, screenX: 0, screenY: 0, doorId: null, posM: 0, widthM: 0, moving: false, resizing: false });
  const [doorHubPosInput, setDoorHubPosInput] = useState<string>("");
  const [doorHubWidthInput, setDoorHubWidthInput] = useState<string>("");

  // Document Hub (Anker/Verschieben/Drehen/Skalieren) — beim Klick auf einen Eckpunkt geöffnet.
  const [docHub, setDocHub] = useState<{ visible: boolean; screenX: number; screenY: number; docId: string | null; mode: "none" | "move" | "rotate" | "scale" | "crop"; cropSide: "top" | "right" | "bottom" | "left" | null }>({ visible: false, screenX: 0, screenY: 0, docId: null, mode: "none", cropSide: null });
  const [docHubDx, setDocHubDx] = useState<string>("0.000");
  const [docHubDy, setDocHubDy] = useState<string>("0.000");
  const [docHubRot, setDocHubRot] = useState<string>("0");
  const [docHubScale, setDocHubScale] = useState<string>("1.000");

  // Maßkette „fertig"-Button (Häkchen) — vom MeasureTool gesetzt.
  const [measureFinishHub, setMeasureFinishHub] = useState<{ visible: boolean; screenX: number; screenY: number }>({ visible: false, screenX: 0, screenY: 0 });

  // Hub-Box für ausgewählte Maßkette (Verschieben mit Snap auf andere Maßketten).
  const [dimHub, setDimHub] = useState<{ visible: boolean; screenX: number; screenY: number; dimensionId: string | null; mode: "none" | "move" }>({ visible: false, screenX: 0, screenY: 0, dimensionId: null, mode: "none" });

  // PDF-/Bild-Hub: aktiven Maus-Modus an CadApp spiegeln, damit SelectTool die Canvas-Klicks
  // entsprechend behandeln kann. Beim Moduswechsel den Referenz-Klick zurücksetzen.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.documentHubMode = docHub.mode;
    app.documentHubFirstClick = null;
    const tabletTransform = docHub.mode !== "none" && !!(window as any).__pixunaTabletCommit;
    app.selectTool.documentHubTabletArmed = tabletTransform;
    (window as any).__pixunaDocumentTransformActive = tabletTransform;
    return () => {
      if ((window as any).__pixunaDocumentTransformActive) {
        (window as any).__pixunaDocumentTransformActive = false;
      }
    };
  }, [docHub.mode]);

  // Dimension-Hub-Modus an CadApp spiegeln.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.dimensionHubMode = dimHub.mode;
  }, [dimHub.mode]);


  // Renderer-Settings synchron halten
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.renderer.gridSettings = {
      enabled: gridEnabled,
      sizeM: gridSizeM,
      color: gridColor,
      opacity: gridOpacity,
    };
  }, [gridEnabled, gridSizeM, gridColor, gridOpacity]);

  // Hintergrundfarbe synchron halten
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.renderer.backgroundColor = bgColor;
    app.renderer.render();
  }, [bgColor]);

  // Door tool settings sync
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.doorTool.settings.mode = doorMode;
    app.doorTool.settings.widthM = doorWidthM;
    app.doorTool.settings.heightM = doorHeightM;
    app.doorTool.settings.breakHeightM = doorBreakHeightM;
    app.doorTool.settings.breakHeightVisible = doorBreakHeightVisible;
    app.doorTool.settings.side = doorSide;
    app.doorTool.settings.hand = doorHand;
    app.doorTool.settings.edge = doorEdge;
    app.doorTool.settings.color = doorColor;
    app.doorTool.settings.jambEnabled = doorJambEnabled;
    app.doorTool.settings.jambColor = doorJambColor;
    app.doorTool.settings.jambLenM = doorJambLenM;
    app.doorTool.settings.jambThickM = doorJambThickM;
    app.doorTool.settings.sashEnabled = doorSashEnabled;
    app.doorTool.settings.glassColor = doorGlassColor;
    app.doorTool.settings.glassThickM = doorGlassThickM;
    app.doorTool.settings.glassFillColor = doorGlassFillColor;
    app.doorTool.applySettingsToSelection();
  }, [doorMode, doorWidthM, doorHeightM, doorBreakHeightM, doorBreakHeightVisible, doorSide, doorHand, doorEdge, doorColor, doorJambEnabled, doorJambColor, doorJambLenM, doorJambThickM, doorSashEnabled, doorGlassColor, doorGlassThickM, doorGlassFillColor]);

  // Line arrow settings sync (Default + selektiertes Segment)
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.defaultArrowStart = lineArrowStart;
    app.defaultArrowEnd = lineArrowEnd;
    app.defaultArrowScale = lineArrowScale;
    const sel = app.getSelectedSegment?.();
    const groupSegs = (typeof (app as any).getSelectedGroupSegments === "function")
      ? (app as any).getSelectedGroupSegments() as any[] : [];
    const targets: any[] = sel ? [sel] : groupSegs;
    if (targets.length > 0) {
      for (const seg of targets) {
        seg.arrowStart = lineArrowStart;
        seg.arrowEnd = lineArrowEnd;
        seg.arrowScale = lineArrowScale;
      }
    }
  }, [lineArrowStart, lineArrowEnd, lineArrowScale]);



  useEffect(() => {
    if (
      !canvasRef.current || !hubRef.current || !hubLenRef.current || !hubAngRef.current ||
      !pointEditRef.current || !pointMoveBtnRef.current || !pointTranslateBtnRef.current ||
      !pointRotateBtnRef.current || !pointDeleteBtnRef.current || !pointOffsetBtnRef.current || !settingsRef.current || !idSelectRef.current ||
      !colorInputRef.current || !colorPreviewRef.current || !thicknessInputRef.current ||
      !idPanelRef.current || !idBodyRef.current || !idListRef.current ||
      !idAddBtnRef.current || !idToggleBtnRef.current ||
      !sheetPanelRef.current || !sheetBodyRef.current || !sheetListRef.current ||
      !sheetAddBtnRef.current || !sheetToggleBtnRef.current ||
      !hatchSettingsRef.current || !hatchIdSelectRef.current ||
      !hatchFillColorRef.current || !hatchFillPreviewRef.current ||
      !hatchStrokeColorRef.current || !hatchStrokePreviewRef.current || !hatchStrokeWidthRef.current ||
      !hatchAlphaRef.current || !areaShowRef.current || !areaSettingsGroupRef.current ||
      !areaTextColorRef.current || !areaTextPreviewRef.current || !areaFontSizeRef.current ||
      !areaBgColorRef.current || !areaBgPreviewRef.current || !areaBgAlphaRef.current ||
      !measureSettingsRef.current || !measureIdSelectRef.current ||
      !measureOrientationRef.current || !measurePointCountRef.current || !measureDirectionRef.current || !measureEditModeRef.current ||
      !measureExtRef.current || !measureExtGroupRef.current || !measureExtStyleRef.current ||
      !measureExtColorRef.current || !measureExtColorPreviewRef.current || !measureExtAlphaRef.current ||
      !measureFreeTextToggleRef.current || !measureFreeTextInputRef.current ||
      !measureFreeTextGroupRef.current || !measureFreeTextBoldRef.current || !measureFreeTextItalicRef.current ||
      !measureFreeTextColorRef.current || !measureFreeTextColorPreviewRef.current ||
      !measureTextColorRef.current || !measureTextColorPreviewRef.current || !measureTextSizeRef.current ||
      !measureDecimalsRef.current || !measureTextBgToggleRef.current || !measureTextBgGroupRef.current ||
      !measureTextBgColorRef.current || !measureTextBgColorPreviewRef.current || !measureTextBgAlphaRef.current ||
      !measureLineColorRef.current || !measureLineColorPreviewRef.current || !measureTickLengthRef.current ||
      !measureShowUnitRef.current || !measureUnitRef.current ||
      !textSettingsRef.current || !textIdSelectRef.current ||
      !textColorRef.current || !textColorPreviewRef.current || !textFontSizeRef.current ||
      !textAlignLeftRef.current || !textAlignCenterRef.current || !textAlignRightRef.current ||
      !textBgColorRef.current || !textBgColorPreviewRef.current || !textBgAlphaRef.current ||
      !textWrapRef.current || !textBorderToggleRef.current || !textBorderGroupRef.current ||
      !textBorderColorRef.current || !textBorderColorPreviewRef.current || !textBorderWidthRef.current ||
      !textEditorElRef.current || !textEditorToolbarRef.current ||
      !textEditorBoldRef.current || !textEditorItalicRef.current ||
      !textEditorColorRef.current || !textEditorSizeRef.current || !textEditorSymbolRef.current
    ) return;

    const app = new CadApp(
      canvasRef.current,
      hubRef.current, hubLenRef.current, hubAngRef.current,
      pointEditRef.current,
      {
        [PointEditAction.MOVE]: pointMoveBtnRef.current,
        [PointEditAction.TRANSLATE]: pointTranslateBtnRef.current,
        [PointEditAction.ROTATE]: pointRotateBtnRef.current,
        [PointEditAction.DELETE]: pointDeleteBtnRef.current,
        [PointEditAction.OFFSET]: pointOffsetBtnRef.current,
        [PointEditAction.INSERT_POINT]: pointInsertPointBtnRef.current!,
      },
      settingsRef.current, idSelectRef.current,
      colorInputRef.current, colorPreviewRef.current, thicknessInputRef.current,
      idPanelRef.current, idBodyRef.current, idListRef.current,
      idAddBtnRef.current, idToggleBtnRef.current,
      hatchSettingsRef.current,
      hatchIdSelectRef.current,
      hatchFillColorRef.current, hatchFillPreviewRef.current,
      hatchStrokeColorRef.current, hatchStrokePreviewRef.current,
      hatchStrokeWidthRef.current, hatchAlphaRef.current,
      areaShowRef.current, areaSettingsGroupRef.current,
      areaTextColorRef.current, areaTextPreviewRef.current, areaFontSizeRef.current,
      areaBgColorRef.current, areaBgPreviewRef.current, areaBgAlphaRef.current,
      {
        panel: measureSettingsRef.current,
        idSelect: measureIdSelectRef.current,
        orientation: measureOrientationRef.current,
        pointCount: measurePointCountRef.current,
        direction: measureDirectionRef.current,
        editMode: measureEditModeRef.current,

        extensionsToggle: measureExtRef.current,
        extensionsGroup: measureExtGroupRef.current,
        extensionStyle: measureExtStyleRef.current,
        extensionColor: measureExtColorRef.current,
        extensionColorPreview: measureExtColorPreviewRef.current,
        extensionAlpha: measureExtAlphaRef.current,
        freeTextToggle: measureFreeTextToggleRef.current,
        freeTextInput: measureFreeTextInputRef.current,
        freeTextGroup: measureFreeTextGroupRef.current,
        freeTextBold: measureFreeTextBoldRef.current,
        freeTextItalic: measureFreeTextItalicRef.current,
        freeTextColor: measureFreeTextColorRef.current,
        freeTextColorPreview: measureFreeTextColorPreviewRef.current,
        textColor: measureTextColorRef.current,
        textColorPreview: measureTextColorPreviewRef.current,
        textSize: measureTextSizeRef.current,
        decimals: measureDecimalsRef.current,
        textBgToggle: measureTextBgToggleRef.current,
        textBgGroup: measureTextBgGroupRef.current,
        textBgColor: measureTextBgColorRef.current,
        textBgColorPreview: measureTextBgColorPreviewRef.current,
        textBgAlpha: measureTextBgAlphaRef.current,
        lineColor: measureLineColorRef.current,
        lineColorPreview: measureLineColorPreviewRef.current,
        tickLength: measureTickLengthRef.current,
        showUnit: measureShowUnitRef.current!,
        unit: measureUnitRef.current!,
        textGap: measureTextGapRef.current || undefined,
        doorHeightText: measureDoorHeightTextRef.current || undefined,
      },
      {
        panel: textSettingsRef.current,
        idSelect: textIdSelectRef.current,
        textColor: textColorRef.current,
        textColorPreview: textColorPreviewRef.current,
        fontSize: textFontSizeRef.current,
        alignLeftBtn: textAlignLeftRef.current,
        alignCenterBtn: textAlignCenterRef.current,
        alignRightBtn: textAlignRightRef.current,
        bgColor: textBgColorRef.current,
        bgColorPreview: textBgColorPreviewRef.current,
        bgAlpha: textBgAlphaRef.current,
        wrapToggle: textWrapRef.current,
        borderToggle: textBorderToggleRef.current,
        borderGroup: textBorderGroupRef.current,
        borderColor: textBorderColorRef.current,
        borderColorPreview: textBorderColorPreviewRef.current,
        borderWidth: textBorderWidthRef.current,
        modeAutoBtn: textModeAutoRef.current,
        modeFrameBtn: textModeFrameRef.current,
        boldBtn: textBoldRef.current,
        italicBtn: textItalicRef.current,
        underlineBtn: textUnderlineRef.current,
        strikeBtn: textStrikeRef.current,
        lineHeightRange: textLineHeightRangeRef.current,
        lineHeightNum: textLineHeightNumRef.current,
        bgAlphaRange: textBgAlphaRangeRef.current,
        fontSizePt: textFontSizePtRef.current,
      },
      {
        editor: textEditorElRef.current,
        toolbar: textEditorToolbarRef.current,
        boldBtn: textEditorBoldRef.current,
        italicBtn: textEditorItalicRef.current,
        colorInput: textEditorColorRef.current,
        sizeSelect: textEditorSizeRef.current,
        symbolSelect: textEditorSymbolRef.current,
      },
    );

    app.onToolChange = (id) => {
      setActiveTool(id);
      if (id === ToolIds.LINE || id === ToolIds.FREE || id === ToolIds.ERASER) {
        setLineVariant(id);
      }
      setStickerPhase(app.stickerTool.phase);
      setStickerSelCount(app.stickerTool.getSelectionCount());
    };
    // CAD-State pro Projekt aus localStorage wiederherstellen
    const persistKey = `pixuna.cad.${projectId ?? "default"}`;
    const persist = () => {
      try {
        const snap = (app as any)._serializeScene?.();
        if (typeof snap !== "string") return;
        localStorage.setItem(persistKey, snap);
        if (projectId) {
          try {
            const data = JSON.parse(snap);
            const list = Array.isArray(data.sheets) ? data.sheets : [];
            // Vorschau (PNG) für das gerade aktive Sheet aus dem Canvas erzeugen.
            // Andere Sheets behalten ihr bestehendes thumbnail (wird beim
            // Sheet-Wechsel jeweils neu erzeugt).
            const activeSheetId: string | undefined = (app as any).activeSheetId;
            let activeThumb: string | undefined;
            try {
              const cv = canvasRef.current;
              if (cv && cv.width > 0 && cv.height > 0) {
                // Skaliere auf max. 480px Breite, um localStorage nicht zu sprengen.
                const maxW = 480;
                const k = Math.min(1, maxW / cv.width);
                if (k < 1) {
                  const off = document.createElement("canvas");
                  off.width = Math.max(1, Math.round(cv.width * k));
                  off.height = Math.max(1, Math.round(cv.height * k));
                  const octx = off.getContext("2d");
                  if (octx) {
                    octx.fillStyle = "#ffffff";
                    octx.fillRect(0, 0, off.width, off.height);
                    octx.drawImage(cv, 0, 0, off.width, off.height);
                    activeThumb = off.toDataURL("image/jpeg", 0.78);
                  }
                } else {
                  activeThumb = cv.toDataURL("image/jpeg", 0.78);
                }
              }
            } catch {}
            const prevSheets: import("@/lib/projectStore").Sheet[] =
              projectStore.getState().projects.find((p) => p.id === projectId)?.sheets ?? [];
            const prevById = new Map(prevSheets.map((s) => [s.id, s] as const));
            const scenesById = (data && typeof data.scenesById === "object") ? data.scenesById : {};
            const labelsJsonStr = Array.isArray(data.labels) ? JSON.stringify(data.labels) : undefined;
            const sheets = list
              // Default-Sheet ist ein regulär auswählbares Blatt in der Projektmappe.
              .filter((s: any) => s && s.id)
              .map((s: any) => {
                const prev = prevById.get(s.id);
                // Per-Sheet-Szene aus scenesById (Fallback: aktive Scene-Felder).
                let sceneObj: any = scenesById[s.id];
                if (!sceneObj && s.id === activeSheetId) {
                  sceneObj = {
                    segments: data.segments, hatches: data.hatches, walls: data.walls,
                    dimensions: data.dimensions, textBoxes: data.textBoxes,
                    stickerInstances: data.stickerInstances, documents: data.documents,
                    freeStrokes: data.freeStrokes, rulerGuide: data.rulerGuide, doors: data.doors,
                  };
                }
                let sceneJson: string | undefined;
                try { sceneJson = sceneObj ? JSON.stringify(sceneObj) : prev?.sceneJson; }
                catch { sceneJson = prev?.sceneJson; }
                return {
                  id: s.id,
                  name: s.name || "Sheet",
                  scale: typeof s.scaleValue === "number" ? `1:${s.scaleValue}` : (s.scaleKey || "1:100"),
                  thumbnail: s.id === activeSheetId && activeThumb ? activeThumb : prev?.thumbnail,
                  sceneJson,
                  labelsJson: labelsJsonStr ?? prev?.labelsJson,
                };
              });
            projectStore.updateProject(projectId, { sheets });
          } catch {}
        }
      } catch (e) { console.error("CAD persist failed:", e); }
    };
    try {
      const saved = localStorage.getItem(persistKey);
      if (saved) (app as any)._restoreScene?.(saved);
    } catch (e) { console.error("CAD restore failed:", e); }

    app.onHistoryChange = (u, r) => { setCanUndo(u); setCanRedo(r); onHistoryChange?.(u, r); persist(); };
    // Periodischer Fallback (Sheet-Renames etc. pushen keine History).
    const persistTimer = window.setInterval(persist, 4000);
    app.onStickersChange = () => setStickers([...app.stickers]);
    app.stickerTool.onSelectionChange = () => {
      setStickerSelCount(app.stickerTool.getSelectionCount());
      setStickerPhase(app.stickerTool.phase);
    };
    app.hatchTool.onDrawModeChange = (m) => setHatchDrawMode(m);
    setHatchDrawMode(app.hatchTool.drawMode);
    app.documentTool.onPhaseChange = () => setDocToolPhase(app.documentTool.phase);
    app.onSelectionChange = () => {
      setSelectedWallId(app.getSelectedWall()?.id || null);
      setSelectedFreeStrokeId(app.getSelectedFreeStroke()?.id || null);
      // Pfeil-Einstellungen mit aktueller Auswahl synchronisieren
      try {
        const style = app.getCurrentLineStyle() as any;
        setLineArrowStart(!!style.arrowStart);
        setLineArrowEnd(!!style.arrowEnd);
        setLineArrowScale(typeof style.arrowScale === "number" ? style.arrowScale : 1);
      } catch {}
    };

    app.setTool(ToolIds.SELECT);
    app.doorTool.onSelectionChange = (id) => {
      setDoorSelectedId(id);
      if (id) {
        const d = app.scene.getDoorById(id);
        if (d) {
          setDoorMode(d.kind);
          setDoorWidthM(d.widthM);
          setDoorHeightM(d.heightM);
          setDoorBreakHeightM(d.breakHeightM);
          setDoorBreakHeightVisible(!!d.breakHeightVisible);

          setDoorSide(d.side);
          setDoorHand(d.hand);
          setDoorEdge(d.edge);
          setDoorColor(d.color);
          setDoorJambEnabled(d.jambEnabled);
          setDoorJambColor(d.jambColor);
          setDoorJambLenM(d.jambLenM);
          setDoorJambThickM(d.jambThickM);
          setDoorSashEnabled(d.sashEnabled);
          setDoorGlassColor(d.glassColor);
          setDoorGlassThickM(d.glassThickM);
          setDoorGlassFillColor(d.glassFillColor);
        }
      }
    };
    app.doorTool.onHubChange = (state) => {
      setDoorHub({ ...state });
      setDoorHubPosInput(state.visible ? state.posM.toFixed(3) : "");
      setDoorHubWidthInput(state.visible ? state.widthM.toFixed(3) : "");
    };

    // Zeichnungs-ID-Panel verdrahten (Schritt 1: nur UI)
    app.attachSheetPanel(
      sheetPanelRef.current!,
      sheetBodyRef.current!,
      sheetListRef.current!,
      sheetAddBtnRef.current!,
      sheetToggleBtnRef.current!,
    );

    // Druckpläne-Panel verdrahten (Schritt 2)
    if (planPanelRef.current && planBodyRef.current && planListRef.current &&
        planAddBtnRef.current && planPrintBtnRef.current && planToggleBtnRef.current) {
      app.attachPlanPanel(
        planPanelRef.current,
        planBodyRef.current,
        planListRef.current,
        planAddBtnRef.current,
        planPrintBtnRef.current,
        planToggleBtnRef.current,
      );
    }

    appRef.current = app;
    setCadApp(app);

    const onResize = () => app.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(persistTimer);
      try { persist(); } catch {}
      app.destroy();
      appRef.current = null;
      setCadApp(null);
    };
  }, []);

  // Resize canvas when sidebar collapses/expands
  useEffect(() => {
    const t = setTimeout(() => appRef.current?.resize(), 180);
    return () => clearTimeout(t);
  }, [sidebarCollapsed]);

  // Zeichenoberfläche ist fix 1:1 — App-Wert einmalig setzen.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    app.drawingScale = 1;
  }, []);


  // Floating Edit-Pencil neben ausgewählter Sticker-Instanz (Polling per RAF).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const app = appRef.current;
      if (app) {
        const inst = app.getSelectedStickerInstance?.();
        if (inst && !app.isStickerEditing()) {
          const corners = instanceBoundingCornersWorld(inst.items as any, inst.position, inst.rotationRad, inst.scale);
          let maxX = -Infinity, minY = Infinity;
          for (const c of corners) { if (c.x > maxX) maxX = c.x; if (c.y < minY) minY = c.y; }
          const sp = app.camera.worldToScreen(maxX, minY);
          const next = { id: inst.id, x: sp.x, y: sp.y };
          setStickerEditOverlay(prev => (prev && prev.id === next.id && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5) ? prev : next);
        } else {
          setStickerEditOverlay(prev => prev ? null : prev);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Poll selected document for the settings panel + Document Hub state
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const app = appRef.current;
      if (app) {
        const sel = app.selection as any;
        if (sel && sel.type === "document") {
          const doc = app.scene.getDocumentById(sel.documentId);
          if (doc) {
            setDocSelected(prev => (prev && prev.id === doc.id && prev.widthM === doc.widthM && prev.heightM === doc.heightM && prev.importScaleDenom === doc.importScaleDenom) ? prev : { id: doc.id, name: doc.name, widthM: doc.widthM, heightM: doc.heightM, importScaleDenom: doc.importScaleDenom, kind: doc.kind, pdfSourceB64: doc.pdfSourceB64 || null });
            const sig = `${(doc as any).activeFilterId || ""}|${(doc as any).opacity ?? 1}|${JSON.stringify(((doc as any).filters || []).map((f: any) => [f.id, f.name, f.mode, f.tintColor, f.bwThreshold, f.freeRemaps]))}`;
            setDocFilterSig(prev => prev === sig ? prev : sig);
          } else {
            setDocSelected(prev => prev ? null : prev);
          }
        } else {
          setDocSelected(prev => prev ? null : prev);
        }
        // Document Hub sync
        const hs = app.documentHubState;
        setDocHub(prev => {
          if (!hs.visible) {
            return prev.visible ? { visible: false, screenX: 0, screenY: 0, docId: null, mode: "none", cropSide: null } : prev;
          }
          if (prev.visible && prev.docId === hs.docId && prev.cropSide === hs.cropSide && Math.abs(prev.screenX - hs.screenX) < 0.5 && Math.abs(prev.screenY - hs.screenY) < 0.5) return prev;
          // Default-Modus IMMER "none" — User muss explizit Verschieben/Drehen/Skalieren/Schere aktivieren.
          const isSameAnchor = prev.visible && prev.docId === hs.docId && prev.cropSide === hs.cropSide;
          return { visible: true, screenX: hs.screenX, screenY: hs.screenY, docId: hs.docId, cropSide: hs.cropSide, mode: isSameAnchor ? prev.mode : "none" };
        });
        // Measure-Finish-Hub sync
        const mh = app.measureFinishHubState;
        setMeasureFinishHub(prev => {
          if (!mh.visible) return prev.visible ? { visible: false, screenX: 0, screenY: 0 } : prev;
          if (prev.visible && Math.abs(prev.screenX - mh.screenX) < 0.5 && Math.abs(prev.screenY - mh.screenY) < 0.5) return prev;
          return { visible: true, screenX: mh.screenX, screenY: mh.screenY };
        });
        // Dimension-Hub sync
        const dh = app.dimensionHubState;
        setDimHub(prev => {
          if (!dh.visible) {
            return prev.visible ? { visible: false, screenX: 0, screenY: 0, dimensionId: null, mode: "none" } : prev;
          }
          if (prev.visible && prev.dimensionId === dh.dimensionId
              && Math.abs(prev.screenX - dh.screenX) < 0.5
              && Math.abs(prev.screenY - dh.screenY) < 0.5) return prev;
          return { visible: true, screenX: dh.screenX, screenY: dh.screenY, dimensionId: dh.dimensionId, mode: prev.dimensionId === dh.dimensionId ? prev.mode : "none" };
        });
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleToolClick = useCallback((id: string) => {
    // "Linie" Sidebar-Knopf aktiviert die zuletzt gewählte Variante
    const targetId = id === ToolIds.LINE ? lineVariant : id;
    appRef.current?.setTool(targetId);
    setActiveTool(targetId);
    setGridPanelOpen(false);
    // Flyout: erneuter Klick auf dasselbe Symbol schließt die Variantenauswahl wieder.
    setExpandedTool(prev => (TOOL_VARIANTS[id] ? (prev === id ? null : id) : null));
  }, [lineVariant]);

  /**
   * Platziert importierte Seiten direkt — Maßstab kommt aus dem
   * Dokumentenwerkzeug-Panel (Häkchen „Maßstab anwenden").
   */
  const placeImportedPages = useCallback((pages: ImportedPage[], stacked = false) => {
    const app = appRef.current; if (!app || pages.length === 0) return;
    const [firstPage] = pages;
    let denom = 1;
    if (!docFreePlace) {
      const m = docImportScale.match(/^\s*1\s*:\s*(\d+(?:[.,]\d+)?)\s*$/);
      const v = m ? parseFloat(m[1].replace(",", ".")) : parseFloat(docImportScale.replace(",", "."));
      denom = Number.isFinite(v) && v > 0 ? v : 100;
    } else if (firstPage && firstPage.widthM > 0) {
      // Frei platzieren: Standardgröße = 10 m Breite (am Raster messbar).
      denom = 10 / firstPage.widthM;
    }
    const [first, ...rest] = pages;
    const firstW = first.widthM * denom;
    const firstH = first.heightM * denom;
    app.setTool(ToolIds.DOCUMENT);
    app.documentTool.beginPlacement({
      src: first.src, widthM: firstW, heightM: firstH,
      pixelWidth: first.pixelWidth, pixelHeight: first.pixelHeight,
      name: first.name, kind: first.kind, pageIndex: first.pageIndex,
      importScaleDenom: denom,
      pdfSourceB64: first.pdfSourceB64 || null,
    });
    // "Gesamt": alle Seiten leicht versetzt übereinander stapeln.
    const step = stacked ? Math.max(0.05, firstW * 0.04) : 0;
    let offX = stacked ? step : firstW + 0.5;
    let offY = 0;
    let i = 0;
    for (const p of rest) {
      i++;
      const pw = p.widthM * denom;
      const ph = p.heightM * denom;
      app.scene.createDocument({
        name: p.name, kind: p.kind, src: p.src, pageIndex: p.pageIndex,
        position: { x: offX, y: offY }, widthM: pw, heightM: ph,
        pixelWidth: p.pixelWidth, pixelHeight: p.pixelHeight,
        labelId: app.activeDrawLabelId,
        importScaleDenom: denom,
        pdfSourceB64: p.pdfSourceB64 || null,
      });
      if (stacked) { offX = step * (i + 1); offY = step * (i + 1); }
      else offX += pw + 0.5;
    }
    // "Frei platzieren": Standardbreite 10 m — Ansicht bleibt unverändert.

  }, [docFreePlace, docImportScale]);

  const importPickedFile = useCallback(async (f: File) => {
    setDocImporting(true);
    try {
      const pages = await importFile(f);
      if (pages.length === 0) { window.alert("Keine Seiten gefunden."); return; }
      if (pages.length === 1) {
        placeImportedPages(pages);
      } else {
        // PDF mit mehreren Seiten → eine Seite wählen oder gesamtes Dokument
        setDocPickerSelected(new Set([0]));
        setDocPickerPages(pages);
      }
    } catch (err: any) {
      window.alert(err?.message || "Import fehlgeschlagen.");
    } finally {
      setDocImporting(false);
    }
  }, [placeImportedPages]);

  const handleDocFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await importPickedFile(f);
  }, [importPickedFile]);

  const handleDocPickerConfirm = useCallback((mode: "single" | "all") => {
    if (!docPickerPages) return;
    const all = docPickerPages;
    const idx = docPickerSelected.values().next().value ?? 0;
    setDocPickerPages(null);
    setDocPickerSelected(new Set());
    if (mode === "all") placeImportedPages(all, true);
    else placeImportedPages([all[idx]]);
  }, [docPickerPages, docPickerSelected, placeImportedPages]);


  /**
   * Maßstab anwenden. Import-Faktor = importScaleDenom:
   *   Die Importer liefern widthM/heightM als reine Papier-Größe in Metern
   *   (z. B. A4 = 0.21 × 0.297 m). Damit 1 m im Plan bei z. B. 1:100 auch
   *   1 m im Modell ergibt, wird die Welt-Größe mit dem Maßstabs-Nenner
   *   multipliziert: weltM = papierM × denom.
   * Geometrie ist danach maßhaltig; der Ansichtsmaßstab wirkt rein als Zoom.
   */
  const handleScaleConfirm = useCallback(() => {
    if (!scaleDialogPages) return;
    const app = appRef.current; if (!app) return;
    const denom = scaleChoice === "custom" ? parseFloat(scaleCustom.replace(",", ".")) : parseFloat(scaleChoice);
    const safeDenom = Number.isFinite(denom) && denom > 0 ? denom : 100;
    const [first, ...rest] = scaleDialogPages;
    const firstW = first.widthM * safeDenom;
    const firstH = first.heightM * safeDenom;
    app.setTool(ToolIds.DOCUMENT);
    app.documentTool.beginPlacement({
      src: first.src, widthM: firstW, heightM: firstH,
      pixelWidth: first.pixelWidth, pixelHeight: first.pixelHeight,
      name: first.name, kind: first.kind, pageIndex: first.pageIndex,
      importScaleDenom: safeDenom,
      pdfSourceB64: first.pdfSourceB64 || null,
    });
    let offX = firstW + 0.5;
    for (const p of rest) {
      const pw = p.widthM * safeDenom;
      const ph = p.heightM * safeDenom;
      app.scene.createDocument({
        name: p.name, kind: p.kind, src: p.src, pageIndex: p.pageIndex,
        position: { x: offX, y: 0 }, widthM: pw, heightM: ph,
        pixelWidth: p.pixelWidth, pixelHeight: p.pixelHeight,
        labelId: app.activeDrawLabelId,
        importScaleDenom: safeDenom,
        pdfSourceB64: p.pdfSourceB64 || null,
      });
      offX += pw + 0.5;
    }
    setScaleDialogPages(null);
  }, [scaleDialogPages, scaleChoice, scaleCustom]);

  const sidebarWidth = sidebarCollapsed ? 56 : 240;

  return (
    <div className="flex w-full h-full overflow-hidden" style={{ background: "hsl(var(--surface))" }}>
      {/* Left Sidebar — im Präsentationsmodus ausgeblendet */}
      <aside
        ref={leftSidebarRef}
        className="relative shrink-0 flex flex-col border-r"
        style={{
          width: 56,
          background: "hsl(var(--surface-card))",
          borderColor: "hsl(var(--hairline))",
          display: presenting ? "none" : undefined,
        }}
      >
        {/* Raster / Undo / Redo / Pipette */}
        <div className="flex flex-col items-center gap-0.5 p-1.5">
          <button
            onClick={() => setGridPanelOpen((o) => !o)}
            title="Raster-Einstellungen — ein/ausschalten im Panel"
            className={`cad-rail-btn ${gridPanelOpen || gridEnabled ? "active" : ""}`}
          >
            <Grid3x3 size={18} />
            <span>Raster</span>
          </button>
          <button
            onClick={() => handleToolClick(ToolIds.PIPETTE)}
            title="Pipette (P)"
            className={`cad-rail-btn ${activeTool === ToolIds.PIPETTE ? "active" : ""}`}
          >
            <Pipette size={18} />
            <span>Pipette</span>
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 border-t" style={{ borderColor: "hsl(var(--hairline))" }} />

        {/* Tool list */}
        <div className="flex flex-col items-center gap-0.5 p-1.5">
          {CAD_TOOLS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === ToolIds.LINE
              ? (activeTool === ToolIds.LINE || activeTool === ToolIds.FREE || activeTool === ToolIds.ERASER)
              : activeTool === t.id;
            const variants = TOOL_VARIANTS[t.id];
            const isExpanded = expandedTool === t.id && !!variants;
            return (
              <div key={t.id} className="relative w-full flex justify-center">
                <button
                  onClick={() => handleToolClick(t.id)}
                  title={`${t.label} (${t.key})`}
                  className={`cad-rail-btn ${isActive ? "active" : ""}`}
                >
                  <Icon size={18} />
                  <span>{t.label.length > 9 ? t.label.slice(0, 8) + "…" : t.label}</span>
                </button>
                {isExpanded && (
                  <div
                    className="absolute top-0 left-full ml-1 flex flex-col gap-0.5 p-1 rounded-lg shadow-lg z-30"
                    style={{
                      background: "hsl(var(--surface-card))",
                      border: "1px solid hsl(var(--hairline))",
                    }}
                  >
                    {variants.map((v, i) => {
                      const VIcon = v.icon;
                      const vActive = v.kind === "tool"
                        ? activeTool === v.id
                        : v.kind === "hatch"
                          ? (activeTool === ToolIds.HATCH && hatchDrawMode === v.mode)
                          : (activeTool === ToolIds.SELECT && selectMarqueeMode === v.mode);
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            if (v.kind === "tool") {
                              appRef.current?.setTool(v.id);
                              setActiveTool(v.id);
                              setLineVariant(v.id);
                            } else if (v.kind === "hatch") {
                              if (activeTool !== ToolIds.HATCH) {
                                appRef.current?.setTool(ToolIds.HATCH);
                                setActiveTool(ToolIds.HATCH);
                              }
                              appRef.current?.hatchTool.setDrawMode(v.mode);
                            } else {
                              // marquee mode toggle for Select tool
                              if (activeTool !== ToolIds.SELECT) {
                                appRef.current?.setTool(ToolIds.SELECT);
                                setActiveTool(ToolIds.SELECT);
                              }
                              if (appRef.current) appRef.current.selectTool.marqueeMode = v.mode;
                              setSelectMarqueeMode(v.mode);
                            }
                            // Flyout bewusst offen lassen – schließt erst durch
                            // Klick außerhalb (Outside-Click-Listener unten).
                          }}
                          title={v.label}
                          className={`cad-rail-btn ${vActive ? "active" : ""}`}
                        >
                          <VIcon size={18} />
                          <span>{v.label.length > 9 ? v.label.slice(0, 8) + "…" : v.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>



        {/* PDF Page Picker: eine Seite ODER gesamtes Dokument (gestapelt) */}
        <Dialog open={!!docPickerPages} onOpenChange={(o) => { if (!o) setDocPickerPages(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Seite auswählen</DialogTitle>
            </DialogHeader>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Dieses PDF hat {docPickerPages?.length ?? 0} Seiten. Wähle genau eine Seite — oder
              importiere das gesamte Dokument: alle Seiten werden leicht versetzt übereinander abgelegt.
            </p>
            <div className="max-h-[60vh] overflow-y-auto grid grid-cols-3 gap-3 p-1">
              {docPickerPages?.map((p, i) => {
                const checked = (docPickerSelected.values().next().value ?? 0) === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDocPickerSelected(new Set([i]))}
                    className={`relative rounded-md border-2 transition-all overflow-hidden ${checked ? "border-primary" : "border-border"}`}
                  >
                    <img src={p.src} alt={p.name} className="w-full h-32 object-contain bg-muted" />
                    <div className="text-[10px] p-1 text-center truncate bg-muted/50">Seite {i + 1}</div>
                    {checked && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">✓</div>
                    )}
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleDocPickerConfirm("all")}>
                Gesamtes Dokument ({docPickerPages?.length ?? 0} Seiten)
              </Button>
              <Button onClick={() => handleDocPickerConfirm("single")}>
                Seite {(docPickerSelected.values().next().value ?? 0) + 1} importieren
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {docLibraryOpen && projectId && (
          <ProjectFilePickerDialog
            projectId={projectId}
            onCancel={() => setDocLibraryOpen(false)}
            onPick={(f) => { setDocLibraryOpen(false); void importPickedFile(f); }}
          />
        )}

        {/* Maßstab-Dialog vor Platzierung */}
        <Dialog open={!!scaleDialogPages} onOpenChange={(o) => { if (!o) setScaleDialogPages(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Maßstab des Dokuments</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-1">
              <p className="text-[11px] text-muted-foreground">
                In welchem Maßstab liegt der Plan vor?
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { v: "50", label: "1 : 50" },
                  { v: "100", label: "1 : 100" },
                  { v: "200", label: "1 : 200" },
                  { v: "500", label: "1 : 500" },
                  { v: "1", label: "1 : 1" },
                  { v: "custom", label: "Frei…" },
                ].map(opt => {
                  const active = scaleChoice === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setScaleChoice(opt.v)}
                      className="rounded-md h-9 text-xs font-semibold border transition-colors"
                      style={{
                        background: active ? "hsl(var(--primary))" : "hsl(var(--muted))",
                        color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                        borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border))",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {scaleChoice === "custom" && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-foreground">1 :</span>
                  <input
                    type="text"
                    value={scaleCustom}
                    onChange={(e) => setScaleCustom(e.target.value)}
                    className="cad-settings-select flex-1 h-8 text-xs"
                    placeholder="z. B. 75"
                    autoFocus
                  />
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" size="sm" onClick={() => setScaleDialogPages(null)}>Abbrechen</Button>
              <Button size="sm" onClick={handleScaleConfirm}>Übernehmen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </aside>

      {/* Canvas Area */}
      <div ref={containerRef} className="relative flex-1 min-w-0 h-full overflow-hidden">

        {/* Line Hub */}
        <div ref={hubRef} className="cad-hub absolute z-30 hidden flex gap-2 items-center">
          <input ref={hubLenRef} type="text" readOnly className="text-xs" />
          <input ref={hubAngRef} type="text" readOnly className="text-xs" />
        </div>

        {/* Door/Window Hub Box — LineHub-Stil: zwei Icons (Bewegen=Breite, Verschieben=Position) + zwei Inputs */}
        {doorHub.visible && (
          <div
            className="absolute z-30 flex items-center gap-1.5 px-2 py-1.5 rounded-md shadow-lg"
            style={{
              left: Math.max(8, doorHub.screenX + 12),
              top: Math.max(8, doorHub.screenY + 12),
              background: "white",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              title={doorHub.resizing ? "Klicken im Plan fixiert die Breite" : "Bewegen — Breite anpassen"}
              onClick={() => appRef.current?.doorTool.beginFollowResize()}
              className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${doorHub.resizing ? "active" : ""}`}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <input
              type="text"
              value={doorHubWidthInput}
              onChange={(e) => setDoorHubWidthInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = parseFloat(doorHubWidthInput.replace(",", "."));
                  if (Number.isFinite(n)) appRef.current?.doorTool.setSelectedWidthM(n);
                } else if (e.key === "Escape") {
                  appRef.current?.doorTool.hideHub();
                }
              }}
              className="text-[11px] w-[72px] px-1.5 py-1 rounded border tabular-nums"
              style={{ borderColor: "hsl(var(--border))" }}
              title="Breite (m)"
            />
            <span className="text-[10px] opacity-60 mr-1">m</span>
            <button
              type="button"
              title={doorHub.moving ? "Klicken im Plan fixiert die Position" : "Verschieben — Position auf Wand"}
              onClick={() => appRef.current?.doorTool.beginFollowMove()}
              className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${doorHub.moving ? "active" : ""}`}
            >
              <Move className="h-3.5 w-3.5" />
            </button>
            <input
              type="text"
              value={doorHubPosInput}
              onChange={(e) => setDoorHubPosInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = parseFloat(doorHubPosInput.replace(",", "."));
                  if (Number.isFinite(n)) appRef.current?.doorTool.setSelectedPosM(n);
                } else if (e.key === "Escape") {
                  appRef.current?.doorTool.hideHub();
                }
              }}
              className="text-[11px] w-[72px] px-1.5 py-1 rounded border tabular-nums"
              style={{ borderColor: "hsl(var(--border))" }}
              title="Position auf Wand (m ab Wandanfang)"
            />
            <span className="text-[10px] opacity-60">m</span>
            <button
              type="button"
              title="Fenster/Tür löschen"
              onClick={() => {
                const app = appRef.current;
                if (!app || !doorHub.doorId) return;
                const d = app.scene.doors.find((x: any) => x.id === doorHub.doorId);
                if (d) {
                  app.scene.removeDoor(d);
                  app.clearSelection?.();
                  app.doorTool.hideHub();
                  app.refreshLabelUI?.();
                }
              }}
              className="cad-toolbar-btn h-7 w-7 justify-center px-0"
              style={{ color: "hsl(0 65% 50%)" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}



        {/* Document Hub — Anker · Verschieben · Drehen · Skalieren (öffnet beim Klick auf Eckpunkt) */}
        {measureFinishHub.visible && (
          <div
            className="absolute z-30 flex items-center px-1 py-1 rounded-md shadow-lg"
            style={{
              left: Math.max(8, measureFinishHub.screenX + 14),
              top: Math.max(8, measureFinishHub.screenY - 30),
              background: "white",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
            }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onClick={(e) => {
              e.stopPropagation();
              appRef.current?.measureTool.finishCollect();
            }}
          >
            <button
              type="button"
              title="Maßkette fertig (Enter)"
              className="cad-toolbar-btn h-7 w-7 justify-center px-0"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Dimension Hub — Verschieben mit Snap auf andere Maßketten */}
        {dimHub.visible && (
          <div
            className="absolute z-30 flex items-center px-1 py-1 rounded-md shadow-lg"
            style={{
              left: Math.max(8, dimHub.screenX + 14),
              top: Math.max(8, dimHub.screenY - 30),
              background: "white",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
            }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              title={dimHub.mode === "move" ? "Klick auf Canvas: neuen Platzierungspunkt setzen (Snap aktiv)" : "Maßkette frei verschieben (mit Snap)"}
              className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${dimHub.mode === "move" ? "active" : ""}`}
              onClick={() => {
                setDimHub(prev => ({ ...prev, mode: prev.mode === "move" ? "none" : "move" }));
              }}
            >
              <Move className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Maßkette spiegeln (Text auf gegenüberliegende Seite; nur aktiv wenn Häkchen gesetzt)"
              className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${(() => {
                const app = appRef.current;
                const dim = app?.scene.dimensions.find((d: any) => d.id === dimHub.dimensionId);
                return dim?.mirror ? "active" : "";
              })()}`}
              onClick={() => {
                const app = appRef.current;
                if (!app || !dimHub.dimensionId) return;
                const sel = app.selection as any;
                if (!sel || sel.type !== "dimension" || sel.dimensionId !== dimHub.dimensionId) return;
                const dim = app.scene.dimensions.find((d: any) => d.id === dimHub.dimensionId);
                if (!dim) return;
                dim.mirror = !dim.mirror;
                app.renderer.render();
                app.refreshLabelUI?.();
              }}
            >
              <FlipHorizontal2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Maßkette löschen"
              onClick={() => {
                const app = appRef.current;
                if (!app || !dimHub.dimensionId) return;
                const dim = app.scene.dimensions.find((d: any) => d.id === dimHub.dimensionId);
                if (dim) {
                  app.scene.removeDimension(dim);
                  app.clearSelection?.();
                  app.dimensionHubState = { visible: false, screenX: 0, screenY: 0, dimensionId: null };
                  app.refreshLabelUI?.();
                }
              }}
              className="cad-toolbar-btn h-7 w-7 justify-center px-0"
              style={{ color: "hsl(0 65% 50%)" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}


        {docHub.visible && (() => {
          const app = appRef.current;
          const doc = app && docHub.docId ? app.scene.getDocumentById(docHub.docId) : null;
          const closeHub = () => {
            if (app) app.documentHubState = { visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null };
            setDocHub({ visible: false, screenX: 0, screenY: 0, docId: null, mode: "none", cropSide: null });
          };
          const applyMove = () => {
            const dx = parseFloat(docHubDx.replace(",", "."));
            const dy = parseFloat(docHubDy.replace(",", "."));
            if (doc && Number.isFinite(dx) && Number.isFinite(dy)) {
              doc.position = { x: doc.position.x + dx, y: doc.position.y + dy };
              setDocHubDx("0.000"); setDocHubDy("0.000");
              closeHub();
            }
          };
          const applyRotate = () => {
            const deg = parseFloat(docHubRot.replace(",", "."));
            if (doc && Number.isFinite(deg)) {
              doc.rotationRad = (deg * Math.PI) / 180;
              closeHub();
            }
          };
          const applyScale = () => {
            const f = parseFloat(docHubScale.replace(",", "."));
            if (doc && Number.isFinite(f) && f > 0) {
              const cx = doc.position.x + doc.widthM / 2;
              const cy = doc.position.y + doc.heightM / 2;
              doc.widthM = Math.max(0.001, doc.widthM * f);
              doc.heightM = Math.max(0.001, doc.heightM * f);
              doc.position = { x: cx - doc.widthM / 2, y: cy - doc.heightM / 2 };
              setDocHubScale("1.000");
              closeHub();
            }
          };
          const applyDelete = () => {
            if (!app || !doc) return;
            app.scene.removeDocument(doc);
            app.clearSelection();
            app.refreshLabelUI();
            closeHub();
          };
          return (
            <div
              className="absolute z-30 flex items-center gap-1.5 px-2 py-1.5 rounded-md shadow-lg"
              style={{
                left: Math.max(8, docHub.screenX + 12),
                top: Math.max(8, docHub.screenY + 12),
                background: "white",
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                title="Verschieben (Δx, Δy in m)"
                onClick={() => setDocHub(h => ({ ...h, mode: h.mode === "move" ? "none" : "move" }))}
                className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${docHub.mode === "move" ? "active" : ""}`}
              >
                <Move className="h-3.5 w-3.5" />
              </button>
              {docHub.mode === "move" && (
                <>
                  <input
                    type="text"
                    value={docHubDx}
                    onChange={(e) => setDocHubDx(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyMove(); else if (e.key === "Escape") closeHub(); }}
                    className="text-[11px] w-[60px] px-1.5 py-1 rounded border tabular-nums"
                    style={{ borderColor: "hsl(var(--border))" }}
                    title="Δx (m)" placeholder="Δx"
                  />
                  <input
                    type="text"
                    value={docHubDy}
                    onChange={(e) => setDocHubDy(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyMove(); else if (e.key === "Escape") closeHub(); }}
                    className="text-[11px] w-[60px] px-1.5 py-1 rounded border tabular-nums"
                    style={{ borderColor: "hsl(var(--border))" }}
                    title="Δy (m)" placeholder="Δy"
                  />
                  <span className="text-[10px] opacity-60 mr-1">m</span>
                </>
              )}
              <button
                type="button"
                title="Drehen (absoluter Winkel in °)"
                onClick={() => {
                  if (doc) setDocHubRot(((doc.rotationRad * 180 / Math.PI) % 360).toFixed(1));
                  setDocHub(h => ({ ...h, mode: h.mode === "rotate" ? "none" : "rotate" }));
                }}
                className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${docHub.mode === "rotate" ? "active" : ""}`}
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>
              {docHub.mode === "rotate" && (
                <>
                  <input
                    type="text"
                    value={docHubRot}
                    onChange={(e) => setDocHubRot(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyRotate(); else if (e.key === "Escape") closeHub(); }}
                    className="text-[11px] w-[64px] px-1.5 py-1 rounded border tabular-nums"
                    style={{ borderColor: "hsl(var(--border))" }}
                    title="Drehwinkel absolut (°)" placeholder="°"
                  />
                  <span className="text-[10px] opacity-60">°</span>
                </>
              )}
              <button
                type="button"
                title="Skalieren (Faktor um Zentrum)"
                onClick={() => setDocHub(h => ({ ...h, mode: h.mode === "scale" ? "none" : "scale" }))}
                className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${docHub.mode === "scale" ? "active" : ""}`}
              >
                <Scaling className="h-3.5 w-3.5" />
              </button>
              {docHub.mode === "scale" && (
                <>
                  <input
                    type="text"
                    value={docHubScale}
                    onChange={(e) => setDocHubScale(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyScale(); else if (e.key === "Escape") closeHub(); }}
                    className="text-[11px] w-[64px] px-1.5 py-1 rounded border tabular-nums"
                    style={{ borderColor: "hsl(var(--border))" }}
                    title="Skalierungsfaktor (× um Zentrum)" placeholder="×"
                  />
                  <span className="text-[10px] opacity-60">×</span>
                </>
              )}
              {docHub.cropSide && (
                <>
                  <span className="text-[10px] opacity-50 mx-1">|</span>
                  <button
                    type="button"
                    title={`Kante "${docHub.cropSide}" zuschneiden (Klick auf Canvas setzt neue Kante)`}
                    onClick={() => setDocHub(h => ({ ...h, mode: h.mode === "crop" ? "none" : "crop" }))}
                    className={`cad-toolbar-btn h-7 w-7 justify-center px-0 ${docHub.mode === "crop" ? "active" : ""}`}
                  >
                    <Scissors className="h-3.5 w-3.5" />
                  </button>
                  {doc && ((doc as any).cropM?.top || (doc as any).cropM?.right || (doc as any).cropM?.bottom || (doc as any).cropM?.left) ? (
                    <button
                      type="button"
                      title="Crop für diese Kante zurücksetzen"
                      onClick={() => {
                        if (!doc || !docHub.cropSide) return;
                        const cur = (doc as any).cropM || { top: 0, right: 0, bottom: 0, left: 0 };
                        (doc as any).cropM = { ...cur, [docHub.cropSide]: 0 };
                        closeHub();
                      }}
                      className="cad-toolbar-btn h-7 px-1.5 text-[10px]"
                    >
                      ⟲
                    </button>
                  ) : null}
                </>
              )}
              <button
                type="button"
                title="Dokument löschen"
                onClick={applyDelete}
                className="cad-toolbar-btn h-7 w-7 justify-center px-0"
                style={{ color: "hsl(0 65% 50%)" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })()}


        {/* Point Edit Menu */}
        <div ref={pointEditRef} className="cad-point-menu absolute z-30 hidden">
          <button ref={pointMoveBtnRef} title="Bewegen">◉</button>
          <button ref={pointTranslateBtnRef} title="Verschieben">✥</button>
          <button ref={pointRotateBtnRef} title="Drehen">⟳</button>
          <button ref={pointOffsetBtnRef} title="Kante rein-/rausziehen">⇆</button>
          <button ref={pointInsertPointBtnRef} title="Neuen Fangpunkt auf der Kante setzen">＋</button>
          <button ref={pointDeleteBtnRef} title="Löschen">🗑</button>
        </div>

        {/* Text Editor Toolbar (floating) */}
        <div ref={textEditorToolbarRef} className="hidden absolute z-40 flex items-center gap-1 px-2 py-1 rounded-md shadow-lg" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
          <button ref={textEditorBoldRef} type="button" className="cad-toolbar-btn h-7 w-7 justify-center px-0" title="Fett (Strg+B)">
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button ref={textEditorItalicRef} type="button" className="cad-toolbar-btn h-7 w-7 justify-center px-0" title="Kursiv (Strg+I)">
            <Italic className="h-3.5 w-3.5" />
          </button>
          <input ref={textEditorColorRef} type="color" defaultValue="#111111" className="w-7 h-7 cursor-pointer border-0 p-0 bg-transparent" title="Textfarbe" />
          <select ref={textEditorSizeRef} className="cad-settings-select h-7 text-xs" title="Schriftgröße">
            {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select ref={textEditorSymbolRef} className="cad-settings-select h-7 text-xs" title="Symbol einfügen" defaultValue="">
            <option value="">∑ Symbol</option>
            <option value="²">²</option>
            <option value="³">³</option>
            <option value="°">°</option>
            <option value="±">±</option>
            <option value="×">×</option>
            <option value="÷">÷</option>
            <option value="∅">∅</option>
            <option value="√">√</option>
            <option value="≈">≈</option>
            <option value="≤">≤</option>
            <option value="≥">≥</option>
            <option value="→">→</option>
            <option value="←">←</option>
            <option value="↑">↑</option>
            <option value="↓">↓</option>
          </select>
          <button
            type="button"
            title="Textbox löschen"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => {
              e.preventDefault(); e.stopPropagation();
              const app = appRef.current as any;
              if (!app) return;
              const sel = app.selection;
              const boxId = sel?.textBoxId;
              try { app.textEditor?.commit?.(); } catch {}
              if (boxId) {
                const box = app.scene.getTextBoxById?.(boxId);
                if (box) {
                  app.scene.removeTextBox(box);
                  app.clearSelection?.();
                  app.refreshLabelUI?.();
                }
              }
            }}
            className="cad-toolbar-btn h-7 w-7 justify-center px-0"
            style={{ color: "hsl(0 65% 50%)" }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Text Editor (contenteditable) */}
        <div ref={textEditorElRef} className="hidden absolute z-40 outline-none" />

        {/* Floating Edit-Pencil bei ausgewählter Sticker-Instanz */}
        {stickerEditOverlay && (
          <button
            type="button"
            onClick={() => {
              if (stickerEditOverlay) appRef.current?.openStickerEditByInstanceId(stickerEditOverlay.id);
            }}
            className="absolute z-30 flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110"
            style={{
              left: stickerEditOverlay.x + 6,
              top: stickerEditOverlay.y - 14,
              width: 28, height: 28,
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))",
              color: "#fff",
              border: "1px solid hsl(var(--primary) / 0.6)",
            }}
            title="Sticker-Inhalt bearbeiten"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Canvas */}
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Maßstab der Zeichenoberfläche ist fix 1:1 — kein UI mehr. */}
      </div>
      {/* Right Tab Panel */}
      {rightOpen && !presenting ? (
      <aside className="shrink-0 w-[280px] h-full flex-col border-l flex" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] shrink-0 border-b items-stretch" style={{ borderColor: "hsl(var(--hairline))" }}>
          {([
            { id: "settings" as const, label: "Werkzeugeinstellung" },
            { id: "sheets" as const, label: "Zeichenblätter" },
            { id: "layers" as const, label: "Ebenen" },
          ]).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRightTab(t.id)}
              className="min-w-0 truncate px-2 py-2 text-[11px] font-medium transition-colors"
              style={{
                background: rightTab === t.id ? "hsl(var(--surface-card))" : "hsl(var(--surface-muted))",
                color: rightTab === t.id ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
                borderBottom: rightTab === t.id ? "2px solid hsl(var(--accent-gold))" : "2px solid transparent",
              }}
            >{t.label}</button>
          ))}
          <button
            type="button"
            onClick={() => setRightOpen(false)}
            title="Einklappen"
            className="w-8 flex items-center justify-center hover:bg-muted border-l"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <PanelRightClose size={14} className="text-muted-foreground" />
          </button>
        </div>

        <DragScrollDiv axis="y" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 cursor-grab active:cursor-grabbing" style={{ display: rightTab === "settings" ? "block" : "none" }}>
        {/* Settings area (scrollable) — kompakter, keine horizontale Overflow-Falle. */}
        <div className="flex-1 min-h-0 p-2 w-full">
          {/* Raster-Einstellungen */}
          {gridPanelOpen && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                Raster
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="grid-enabled"
                    type="checkbox"
                    checked={gridEnabled}
                    onChange={(e) => setGridEnabled(e.target.checked)}
                    className="accent-primary"
                  />
                  <label htmlFor="grid-enabled" className="!mb-0 cursor-pointer">Sichtbar</label>
                </div>
                <div>
                  <label>Rastergröße (m)</label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    value={gridSizeM}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      if (Number.isFinite(n) && n > 0) setGridSizeM(n);
                    }}
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[0.1, 0.25, 0.5, 1, 5, 10].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGridSizeM(v)}
                      className={`cad-toolbar-btn h-7 px-2 text-[11px] ${Math.abs(gridSizeM - v) < 1e-6 ? "active" : ""}`}
                    >
                      {v < 1 ? `${v * 100} cm` : `${v} m`}
                    </button>
                  ))}
                </div>
                <div>
                  <label>Farbe</label>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: gridColor }} />
                    <input
                      type="color"
                      value={gridColor}
                      onChange={(e) => setGridColor(e.target.value)}
                      className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label>Transparenz ({Math.round((1 - gridOpacity) * 100)}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(gridOpacity * 100)}
                    onChange={(e) => setGridOpacity(Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100)))}
                    className="w-full"
                  />
                </div>

                {/* Hintergrundfarbe der Oberfläche */}
                <div className="pt-3 mt-1" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                  <label>Hintergrundfarbe</label>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: bgColor }} />
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="flex-1 h-7 px-1.5 text-[11px] rounded border bg-transparent"
                      style={{ borderColor: "hsl(var(--border))" }}
                    />
                    <button
                      type="button"
                      onClick={() => setBgColor("#ffffff")}
                      className="cad-toolbar-btn h-7 px-2 text-[10px]"
                      title="Zurücksetzen"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modus-Auswahl: Linie / Freihand — Design analog Schraffurwerkzeug.
              Für den Radiergummi bleibt der klassische Varianten-Umschalter. */}
          {(activeTool === ToolIds.LINE || activeTool === ToolIds.FREE) && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[10px] font-semibold tracking-wider mb-1.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                MODUS
              </div>
              <div className="grid grid-cols-2 gap-1">
                {LINE_VARIANTS.filter(v => v.id !== ToolIds.ERASER).map(v => {
                  const Icon = v.icon;
                  const active = activeTool === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => { appRef.current?.setTool(v.id); setActiveTool(v.id); setLineVariant(v.id); }}
                      title={v.label}
                      className={`cad-toolbar-btn flex-col justify-center gap-0.5 h-11 ${active ? "active" : ""}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[9px] leading-tight">{v.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {activeTool === ToolIds.ERASER && (
            <div className="cad-settings-panel mb-2">
              <div className="flex gap-1">
                {LINE_VARIANTS.map(v => {
                  const Icon = v.icon;
                  const active = activeTool === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => { appRef.current?.setTool(v.id); setActiveTool(v.id); setLineVariant(v.id); }}
                      title={v.label}
                      className={`cad-toolbar-btn flex-1 justify-center h-9 ${active ? "active" : ""}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Line Settings */}
          <div ref={settingsRef} className={`cad-settings-panel hidden mb-2`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Linie
            </div>
            <RasterModeToggle app={appRef.current} projectId={projectId} />
            <div className="space-y-3">
              <div>
                <label>Ebene</label>
                <select ref={idSelectRef} className="cad-settings-select w-full" />
              </div>
              <div>
                <label>Farbe</label>
                <div className="flex items-center gap-2">
                  <div ref={colorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={colorInputRef} type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
               <div>
                 <label>Liniendicke (cm)</label>
                 <input ref={thicknessInputRef} type="text" defaultValue="3" />
               </div>
               <div>
                 <label>Transparenz</label>
                 <input
                   type="range"
                   min={1}
                   max={100}
                   step={1}
                   value={lineAlpha}
                   onChange={(e) => applyLineAlpha(Number(e.target.value))}
                   className="w-full"
                 />
                 <div className="flex items-center gap-1 mt-1">
                   <input
                     type="number"
                     min={1}
                     max={100}
                     step={1}
                     value={lineAlpha}
                     onChange={(e) => applyLineAlpha(Number(e.target.value))}
                     className="w-16 h-7 px-1 text-right text-[11px] rounded border bg-transparent"
                     style={{ borderColor: "hsl(var(--hairline))" }}
                   />
                   <span className="text-[10px]">%</span>
                 </div>
               </div>
               <div className="pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                 <label className="block mb-1.5">Pfeilspitzen</label>
                 <div className="flex gap-1">
                   <button type="button" onClick={() => setLineArrowStart(!lineArrowStart)}
                     className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${lineArrowStart ? "active" : ""}`}>
                     Anfang
                   </button>
                   <button type="button" onClick={() => setLineArrowEnd(!lineArrowEnd)}
                     className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${lineArrowEnd ? "active" : ""}`}>
                     Ende
                   </button>
                 </div>
               </div>
               {(lineArrowStart || lineArrowEnd) && (
                 <div>
                   <label>Pfeilgröße (×)</label>
                   <input
                     type="number" min={0.2} step={0.1}
                     value={lineArrowScale}
                     onChange={(e) => {
                       const n = parseFloat(e.target.value.replace(",", "."));
                       if (Number.isFinite(n) && n > 0) setLineArrowScale(n);
                     }}
                   />
                 </div>
               )}
             </div>

             <div className="mt-3 pt-2 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid hsl(var(--border))" }}>
               <span className="cad-kbd">Space</span>
               <span className="cad-kbd">Shift</span>
               <span className="cad-kbd">Tab</span>
             </div>
           </div>

           {/* Hatch Settings */}
          <div ref={hatchSettingsRef} className={`cad-settings-panel hidden mb-2`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Schraffur
            </div>
            <RasterModeToggle app={appRef.current} projectId={projectId} />

            <div className="flex gap-1 mb-3">
              <button
                type="button"
                onClick={() => appRef.current?.hatchTool.setDrawMode("polygon")}
                title="Polygon zeichnen"
                className={`cad-toolbar-btn flex-1 justify-center h-9 ${hatchDrawMode === "polygon" ? "active" : ""}`}
              >
                <Spline className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => appRef.current?.hatchTool.setDrawMode("rectangle")}
                title="Rechteck zeichnen"
                className={`cad-toolbar-btn flex-1 justify-center h-9 ${hatchDrawMode === "rectangle" ? "active" : ""}`}
              >
                <RectangleHorizontal className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => appRef.current?.hatchTool.setDrawMode("circle")}
                title="Kreis / Kreissektor zeichnen (Doppelklick oder Enter = Vollkreis)"
                className={`cad-toolbar-btn flex-1 justify-center h-9 ${hatchDrawMode === "circle" ? "active" : ""}`}
              >
                <Circle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => appRef.current?.hatchTool.setDrawMode("fill")}
                title="Füllung: Klick in einen von Linien/Wänden umschlossenen Bereich"
                className={`cad-toolbar-btn flex-1 justify-center h-9 ${hatchDrawMode === "fill" ? "active" : ""}`}
              >
                <PaintBucket className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label>Ebene</label>
                <select ref={hatchIdSelectRef} className="cad-settings-select w-full" />
              </div>
              <div>
                <label>Flächenfarbe</label>
                <div className="flex items-center gap-2">
                  <div ref={hatchFillPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={hatchFillColorRef} type="color" defaultValue="#4da3ff" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
              <div>
                <label>Polylinienfarbe</label>
                <div className="flex items-center gap-2">
                  <div ref={hatchStrokePreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={hatchStrokeColorRef} type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
              <div>
                <label>Polyliniendicke</label>
                <input ref={hatchStrokeWidthRef} type="text" defaultValue="1" />
              </div>
              <div>
                <label>Transparenz (0–100%)</label>
                <input ref={hatchAlphaRef} type="text" defaultValue="35" />
              </div>
              <HatchPatternBlock app={cadApp} scaleMax={60} />

              <div className="flex items-center gap-2 mt-1">
                <input
                  ref={areaShowRef}
                  type="checkbox"
                  id="cad-area-show"
                  className="w-[14px] h-[14px] cursor-pointer rounded-[3px] border accent-primary"
                  style={{ accentColor: "hsl(var(--primary))", borderColor: "hsl(var(--border))" }}
                />
                <label htmlFor="cad-area-show" className="!mb-0 cursor-pointer select-none">Flächenanzeige</label>
              </div>
              <div ref={areaSettingsGroupRef} className="hidden mt-2 pt-2 space-y-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <div>
                  <label>Textfarbe</label>
                  <div className="flex items-center gap-2">
                    <div ref={areaTextPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={areaTextColorRef} type="color" defaultValue="#000000" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label>Textgröße</label>
                  <input ref={areaFontSizeRef} type="text" defaultValue="10" />
                </div>
                <div>
                  <label>Hintergrundfarbe</label>
                  <div className="flex items-center gap-2">
                    <div ref={areaBgPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={areaBgColorRef} type="color" defaultValue="#ffffff" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label>HG-Transparenz (0–100%)</label>
                  <input ref={areaBgAlphaRef} type="text" defaultValue="72" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="cad-area-border"
                    data-area-border
                    type="checkbox"
                    className="w-[14px] h-[14px] cursor-pointer rounded-[3px] border accent-primary"
                    style={{ accentColor: "hsl(var(--primary))", borderColor: "hsl(var(--border))" }}
                  />
                  <label htmlFor="cad-area-border" className="!mb-0 cursor-pointer select-none">Rahmen</label>
                </div>
                <div data-area-border-group className="hidden space-y-2">
                  <div>
                    <label>Rahmenfarbe</label>
                    <div className="flex items-center gap-2">
                      <div data-area-border-preview className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                      <input data-area-border-color type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                    </div>
                  </div>
                  <div>
                    <label>Rahmenstärke (px)</label>
                    <input data-area-border-width type="text" defaultValue="1" />
                  </div>
                </div>
               </div>
             </div>
             <div className="mt-3 pt-2 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid hsl(var(--border))" }}>
               <span className="cad-kbd">Space</span>
               <span className="cad-kbd">Shift</span>
               <span className="cad-kbd">Tab</span>
             </div>
           </div>

          {/* Measure Settings */}
          <div ref={measureSettingsRef} className={`cad-settings-panel hidden`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Maßkette
            </div>
            <div className="space-y-3">
              <div>
                <label>Ebene</label>
                <select ref={measureIdSelectRef} className="cad-settings-select w-full" />
              </div>
              <div>
                <label>Richtung</label>
                <select ref={measureOrientationRef} className="cad-settings-select w-full">
                  <option value="parallel">Parallel</option>
                  <option value="diagonal">Schräg</option>
                </select>
              </div>
              <div>
                <label>Punkte</label>
                <select ref={measurePointCountRef} className="cad-settings-select w-full" defaultValue="multi">
                  <option value="two">2 Punkte (Einzelmaß)</option>
                  <option value="multi">Mehrere Punkte (Kette)</option>
                </select>
              </div>
              <div>
                <label>Achse / Richtung</label>
                <select ref={measureDirectionRef} className="cad-settings-select w-full" defaultValue="free">
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertikal</option>
                  <option value="free">Frei</option>
                </select>
              </div>

              <div>
                <label>Punktbearbeitung (Auswahl)</label>
                <select ref={measureEditModeRef} className="cad-settings-select w-full" defaultValue="endpoints">
                  <option value="parallel">Parallel verschieben</option>
                  <option value="endpoints">Endpunkte editieren</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input ref={measureExtRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Verlängerungslinien</label>
              </div>
              <div ref={measureExtGroupRef} className="hidden space-y-2 pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <div>
                  <label>Stil</label>
                  <select ref={measureExtStyleRef} className="cad-settings-select w-full" defaultValue="dashed">
                    <option value="dashed">Gestrichelt</option>
                    <option value="solid">Durchgezogen</option>
                  </select>
                </div>
                <div>
                  <label>Farbe</label>
                  <div className="flex items-center gap-2">
                    <div ref={measureExtColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={measureExtColorRef} type="color" defaultValue="#2b2b2b" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label>Transparenz (0–1)</label>
                  <input ref={measureExtAlphaRef} type="text" defaultValue="1" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input ref={measureFreeTextToggleRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Freier Text</label>
              </div>
              <div>
                <input ref={measureFreeTextInputRef} type="text" placeholder="Text eingeben" className="hidden" />
              </div>
              <div ref={measureFreeTextGroupRef} className="hidden space-y-2 pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <div className="flex gap-1.5">
                  <button type="button" ref={measureFreeTextBoldRef} className="cad-toolbar-btn h-8 px-3 text-[12px] font-bold">B</button>
                  <button type="button" ref={measureFreeTextItalicRef} className="cad-toolbar-btn h-8 px-3 text-[12px] italic">I</button>
                </div>
                <div>
                  <label>Textfarbe (Freier Text)</label>
                  <div className="flex items-center gap-2">
                    <div ref={measureFreeTextColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={measureFreeTextColorRef} type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
              </div>
              <div>
                <label>Textfarbe</label>
                <div className="flex items-center gap-2">
                  <div ref={measureTextColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={measureTextColorRef} type="color" defaultValue="#000000" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
              <div>
                <label>Textgröße (px)</label>
                <input ref={measureTextSizeRef} type="text" defaultValue="11" />
              </div>
              <div>
                <label>Text-Abstand zur Maßlinie (px)</label>
                <input ref={measureTextGapRef} type="text" defaultValue="2" />
              </div>
              <div>
                <label>Höhentext (frei, ersetzt Türhöhe)</label>
                <input ref={measureDoorHeightTextRef} type="text" placeholder="z. B. 2,10 m OK" />
              </div>
              <div>
                <label>Kommastellen (0–6)</label>
                <input ref={measureDecimalsRef} type="text" defaultValue="2" />
              </div>
              <div className="flex items-center gap-2">
                <input ref={measureTextBgToggleRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Text-Hintergrund</label>
              </div>
              <div ref={measureTextBgGroupRef} className="hidden space-y-2 pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <div>
                  <label>HG-Farbe</label>
                  <div className="flex items-center gap-2">
                    <div ref={measureTextBgColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={measureTextBgColorRef} type="color" defaultValue="#ffffff" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label>HG-Transparenz (0–1)</label>
                  <input ref={measureTextBgAlphaRef} type="text" defaultValue="0.8" />
                </div>
              </div>
              <div>
                <label>Linienfarbe</label>
                <div className="flex items-center gap-2">
                  <div ref={measureLineColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={measureLineColorRef} type="color" defaultValue="#2b2b2b" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
              <div>
                <label>Endstrich-Länge (m)</label>
                <input ref={measureTickLengthRef} type="text" defaultValue="0.15" />
              </div>
              <div className="flex items-center gap-2">
                <input ref={measureShowUnitRef} type="checkbox" className="accent-primary" defaultChecked />
                <label className="!mb-0 cursor-pointer">Einheit anzeigen</label>
              </div>
              <div>
                <label>Einheit</label>
                <select ref={measureUnitRef} className="cad-settings-select w-full" defaultValue="m">
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                  <option value="m">m</option>
                </select>
              </div>
            </div>
          </div>

          {/* Text Settings */}
          <div ref={textSettingsRef} className={`cad-settings-panel hidden`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Text
            </div>
            <RasterModeToggle app={appRef.current} projectId={projectId} />
            <div className="space-y-3">
              <div>
                <label>Ebene</label>
                <select ref={textIdSelectRef} className="cad-settings-select w-full" />
              </div>
              <div>
                <div className="text-[10px] font-semibold tracking-wider mb-1.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>MODUS</div>
                <div className="grid grid-cols-2 gap-1">
                  <button ref={textModeAutoRef} type="button" className="cad-toolbar-btn h-9 justify-center text-[11px]" title="Rahmen passt sich an Text an">
                    Rahmen variabel
                  </button>
                  <button ref={textModeFrameRef} type="button" className="cad-toolbar-btn h-9 justify-center text-[11px]" title="Text passt sich an Rahmen an">
                    Rahmen fix
                  </button>
                </div>
              </div>
              <div>
                <label>Ausrichtung</label>
                <div className="flex gap-1">
                  <button ref={textAlignLeftRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9" title="Text links">
                    <AlignLeft className="h-4 w-4" />
                  </button>
                  <button ref={textAlignCenterRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9" title="Text zentriert">
                    <AlignCenter className="h-4 w-4" />
                  </button>
                  <button ref={textAlignRightRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9" title="Text rechts">
                    <AlignRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label>Schriftstärke</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] mb-0.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Punkt (pt)</div>
                    <input ref={textFontSizePtRef} type="text" defaultValue="12" />
                  </div>
                  <div>
                    <div className="text-[9px] mb-0.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Bildschirm (px)</div>
                    <input ref={textFontSizeRef} type="text" defaultValue="16" />
                  </div>
                </div>
              </div>
              <div>
                <label>Stil</label>
                <div className="flex gap-1">
                  <button ref={textBoldRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9 font-bold" title="Fett">B</button>
                  <button ref={textItalicRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9 italic" title="Kursiv">I</button>
                  <button ref={textUnderlineRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9 underline" title="Unterstrichen">U</button>
                  <button ref={textStrikeRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9 line-through" title="Durchgestrichen">S</button>
                </div>
              </div>
              <div>
                <label>Absatz</label>
                <input ref={textLineHeightRangeRef} type="range" min={80} max={300} step={5} defaultValue={105} className="cad-range w-full" />
                <input ref={textLineHeightNumRef} type="text" defaultValue="105" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label>Textfarbe</label>
                  <div className="flex items-center gap-2">
                    <div ref={textColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={textColorRef} type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label>Feldfarbe</label>
                  <div className="flex items-center gap-2">
                    <div ref={textBgColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={textBgColorRef} type="color" defaultValue="#ffffff" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
              </div>
              <div>
                <label>Transparenz</label>
                <input ref={textBgAlphaRangeRef} type="range" min={0} max={100} step={1} defaultValue={0} className="cad-range w-full" />
                <input ref={textBgAlphaRef} type="text" defaultValue="0" />
              </div>
              <div className="flex items-center gap-2 hidden">
                <input ref={textWrapRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Zeilenumbruch</label>
              </div>
              <div className="flex items-center gap-2">
                <input ref={textBorderToggleRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Rahmen</label>
              </div>
              <div ref={textBorderGroupRef} className="hidden space-y-2 pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <div>
                  <label>Rahmenfarbe</label>
                  <div className="flex items-center gap-2">
                    <div ref={textBorderColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                    <input ref={textBorderColorRef} type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                  </div>
                </div>
                <div>
                  <label>Rahmenstärke (px)</label>
                  <input ref={textBorderWidthRef} type="text" defaultValue="1" />
                </div>
              </div>
            </div>
          </div>

          {/* Sticker Settings */}
          {activeTool === ToolIds.STICKER && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Sticker</div>
              <div className="space-y-3">
                {stickerPhase === "selecting" ? (
                  <>
                    <div className="rounded-md p-2 text-xs space-y-2" style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.4)" }}>
                      <div className="font-medium">Auswahl-Modus aktiv</div>
                      <div style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                        Klicke Objekte zum Hinzufügen / Entfernen.<br />
                        <strong>Enter</strong> oder <strong>Doppelklick</strong> = speichern · <strong>Esc</strong> = abbrechen
                      </div>
                      <div className="font-mono text-[11px] pt-1" style={{ borderTop: "1px solid hsl(var(--primary) / 0.3)" }}>
                        Objekte ausgewählt: <strong>{stickerSelCount}</strong>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" disabled={stickerSelCount === 0} onClick={() => {
                        const name = window.prompt("Name für neuen Sticker:", `Sticker ${appRef.current!.stickers.length + 1}`);
                        if (!name) return;
                        appRef.current!.stickerTool.commitSelectionAsSticker(name);
                      }} className="cad-toolbar-btn flex-1 justify-center h-9 disabled:opacity-40 disabled:cursor-not-allowed" title="Auswahl als Sticker speichern">
                        <Plus className="h-4 w-4" /> <span className="text-xs">Speichern</span>
                      </button>
                      <button type="button" onClick={() => { appRef.current!.stickerTool.cancel(); }} className="cad-toolbar-btn h-9 px-3 justify-center" title="Abbrechen">
                        <span className="text-xs">Abbrechen</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <button type="button" onClick={() => {
                    appRef.current!.stickerTool.beginSelectionMode();
                  }} className="cad-toolbar-btn w-full justify-center h-9" title="Mehrere Objekte für neuen Sticker auswählen">
                    <Plus className="h-4 w-4" /> <span className="text-xs">Auswahl</span>
                  </button>
                )}

                <div className="flex gap-1">
                  <button type="button" onClick={() => {
                    const json = appRef.current!.exportStickers();
                    const blob = new Blob([json], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "sticker-library.json";
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                  }} className="cad-toolbar-btn flex-1 justify-center h-8 text-xs" title="Exportieren">
                    <Download className="h-3.5 w-3.5" /> Export
                  </button>
                  <button type="button" onClick={() => stickerImportRef.current?.click()} className="cad-toolbar-btn flex-1 justify-center h-8 text-xs" title="Importieren">
                    <Upload className="h-3.5 w-3.5" /> Import
                  </button>
                  <input ref={stickerImportRef} type="file" accept="application/json" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    const text = await f.text();
                    try {
                      const n = appRef.current!.importStickers(text);
                      if (n === 0) window.alert("Keine gültigen Sticker in der Datei gefunden.");
                    } catch { window.alert("Datei konnte nicht gelesen werden."); }
                    e.target.value = "";
                  }} />
                </div>

                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {stickers.length === 0 && (
                    <div className="text-xs text-center py-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Noch keine Sticker</div>
                  )}
                  {stickers.map(s => {
                    const isActive = appRef.current?.stickerTool.activeDef?.id === s.id;
                    return (
                      <div key={s.id} className="flex items-center gap-1">
                        <button type="button" onClick={() => appRef.current!.beginStickerPlacement(s.id)} className={`cad-toolbar-btn flex-1 justify-start h-8 text-xs ${isActive ? "active" : ""}`} title="Platzieren">
                          <StickerIcon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{s.name}</span>
                        </button>
                        <button type="button" onClick={() => {
                          const ok = appRef.current!.openStickerEditByDefId(s.id);
                          if (!ok) window.alert("Keine platzierte Instanz dieses Stickers gefunden. Platziere ihn zuerst auf dem Canvas.");
                        }} className="cad-toolbar-btn h-8 w-8 justify-center px-0" title="Sticker-Inhalt bearbeiten (Edit-Mode)" style={{ color: "hsl(var(--primary))" }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => {
                          const next = window.prompt("Sticker umbenennen:", s.name);
                          if (next && next.trim()) appRef.current!.renameSticker(s.id, next);
                        }} className="cad-toolbar-btn h-8 w-8 justify-center px-0" title="Umbenennen">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => {
                          if (window.confirm(`Sticker "${s.name}" löschen?`)) appRef.current!.removeSticker(s.id);
                        }} className="cad-toolbar-btn h-8 w-8 justify-center px-0" title="Löschen">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
                  <div><strong>Auswahl</strong>: Objekte sammeln · Enter speichert</div>
                  <div><strong>Klick auf Sticker</strong>: Platzieren-Modus</div>
                  <div>1. Klick: Position · Maus: Rotation · 2. Klick: bestätigt</div>
                  <div>SHIFT: 90°-Snap · ENTER: Winkel eingeben</div>
                </div>
              </div>
            </div>
          )}

          {/* Document-Tool-Panel: nur Import */}
          {activeTool === ToolIds.DOCUMENT && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Dokument importieren</div>
              {/* Ebene wie bei allen anderen Werkzeugen ganz oben: bestimmt die
                  Bezeichnungs-ID, in die das importierte Bild/PDF einsortiert wird. */}
              <label className="block text-xs mb-3">
                <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Ebene</span>
                <select
                  key={docLabelTick}
                  value={appRef.current?.activeDrawLabelId ?? ""}
                  onChange={(e) => {
                    const app = appRef.current;
                    if (!app) return;
                    app.setActiveDrawLabelId(e.target.value);
                    app.refreshLabelUI();
                    setDocLabelTick((x) => x + 1);
                  }}
                  className="cad-settings-select w-full"
                >
                  {(appRef.current?.labelManager.list() ?? []).map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
              <div className="space-y-3">

                <button
                  type="button"
                  disabled={docImporting}
                  onClick={() => docFileInputRef.current?.click()}
                  className="cad-toolbar-btn w-full justify-center h-9 disabled:opacity-50 disabled:cursor-wait"
                  title="PDF, JPG oder PNG importieren"
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-xs">{docImporting ? "Importiere…" : "Datei importieren"}</span>
                </button>
                <input
                  ref={docFileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  onChange={handleDocFileChange}
                />

                <button
                  type="button"
                  disabled={docImporting}
                  onClick={() => setDocLibraryOpen(true)}
                  className="cad-toolbar-btn w-full justify-center h-9 disabled:opacity-50"
                  title="Dokumente aus der Projekt-Ablage (Startseite) einfügen"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span className="text-xs">Aus Projekt-Ablage</span>
                </button>

                <label
                  className="flex items-center gap-2 text-[11px] cursor-pointer select-none px-0.5"
                  title="Ohne Häkchen wird das Dokument frei platziert (Originalgröße)."
                >
                  <input
                    type="checkbox"
                    checked={!docFreePlace}
                    onChange={(e) => setDocFreePlace(!e.target.checked)}
                  />
                  <span>Maßstab anwenden</span>
                </label>

                <div className={docFreePlace ? "opacity-50 pointer-events-none" : ""}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] w-14" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Maßstab</span>
                    <input
                      value={docImportScale}
                      onChange={(e) => setDocImportScale(e.target.value)}
                      placeholder="1:100"
                      className="flex-1 h-8 px-2 rounded border bg-transparent text-xs"
                      style={{ borderColor: "hsl(var(--border))" }}
                    />
                  </div>
                </div>

                {docToolPhase === "placing" && (
                  <div className="rounded-md p-2 text-xs" style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.4)" }}>
                    Linksklick: Position setzen · Enter: final platzieren · Esc: abbrechen
                  </div>
                )}

                <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
                  {docFreePlace
                    ? <div>Freie Platzierung — Maßstab kann nachträglich gesetzt werden.</div>
                    : <div>Import im Maßstab {docImportScale}.</div>}
                  <div>Bearbeiten (Skalieren, Drehen, Bild verzerren, Spiegeln): <strong>Auswahl-Werkzeug</strong> (V) → Dokument anklicken.</div>
                </div>
              </div>
            </div>
          )}

          {/* Freihand-Tool-Panel */}
          {(activeTool === ToolIds.FREE || (activeTool === ToolIds.SELECT && selectedFreeStrokeId)) && (
            <FreeDrawSettingsPanel app={appRef.current} units="m" projectId={projectId} />
          )}

          {/* Eraser-Tool-Panel */}
          {activeTool === ToolIds.ERASER && (
            <EraserSettingsPanel app={appRef.current} variant="cad" />
          )}

          {/* Marquee-Modus des Auswahl-Werkzeugs liegt jetzt als Flyout links
              am Auswahl-Symbol — kein eigenes Panel mehr in den Werkzeugeinstellungen. */}

          {/* Wand-Tool-Panel */}
          {(activeTool === ToolIds.WALL || (activeTool === ToolIds.SELECT && selectedWallId)) && (
            <WallSettingsPanel app={appRef.current} />
          )}

          {/* Türen/Fenster Panel */}
          {activeTool === ToolIds.DOOR && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                {doorSelectedId ? (doorMode === "window" ? "Fenster bearbeiten" : "Tür bearbeiten") : "Türen/Fenster"}
              </div>
              <div className="flex gap-1 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setDoorMode("door");
                    if (!doorSelectedId) {
                      setDoorHeightM(2.1);
                      setDoorSashEnabled(true);
                      setDoorJambThickM(0.08);
                    }
                  }}
                  title="Tür"
                  className={`cad-toolbar-btn flex-1 justify-center h-9 ${doorMode === "door" ? "active" : ""}`}
                >
                  <DoorOpen className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDoorMode("window");
                    if (!doorSelectedId) {
                      setDoorHeightM(1.2);
                      setDoorSashEnabled(false);
                      setDoorJambThickM(0.09);
                    }
                  }}
                  title="Fenster"
                  className={`cad-toolbar-btn flex-1 justify-center h-9 ${doorMode === "window" ? "active" : ""}`}
                >
                  <AppWindow className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label>{doorMode === "window" ? "Fensterbreite" : "Türbreite"} (m) — mit Laibung</label>
                  <input
                    type="number" min={0.1} step={0.05}
                    value={doorWidthM}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      if (Number.isFinite(n) && n > 0) setDoorWidthM(n);
                    }}
                  />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {[0.7, 0.8, 0.9, 1.0, 1.1].map(v => (
                    <button key={v} type="button" onClick={() => setDoorWidthM(v)}
                      className={`cad-toolbar-btn h-7 px-2 text-[11px] ${Math.abs(doorWidthM - v) < 1e-6 ? "active" : ""}`}>
                      {v.toFixed(2)} m
                    </button>
                  ))}
                </div>
                <div>
                  <label>Lichte Breite (m) — nur {doorMode === "window" ? "Fensterglas" : "Türschwung"}</label>
                  <input
                    type="number" min={0.05} step={0.05}
                    value={Math.max(0, +(doorWidthM - (doorJambEnabled ? 2 * doorJambLenM : 0)).toFixed(4))}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      if (Number.isFinite(n) && n > 0) {
                        const jl = doorJambEnabled ? doorJambLenM : 0;
                        setDoorWidthM(n + 2 * jl);
                      }
                    }}
                  />
                </div>
                <div>
                  <label>Höhe (m)</label>
                  <input
                    type="number" min={0.5} step={0.05}
                    value={doorHeightM}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      if (Number.isFinite(n) && n > 0) setDoorHeightM(n);
                    }}
                  />
                </div>
                <div>
                  <label>Brüstungshöhe BRH (m)</label>
                  <input
                    type="number" min={0} step={0.05}
                    value={doorBreakHeightM}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value.replace(",", "."));
                      if (Number.isFinite(n) && n >= 0) setDoorBreakHeightM(n);
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={doorBreakHeightVisible}
                    onChange={(e) => setDoorBreakHeightVisible(e.target.checked)}
                  />
                  <span>BRH in Maßketten anzeigen</span>
                </label>

                <div>
                  <label>Startkante</label>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setDoorEdge("inner")}
                      className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorEdge === "inner" ? "active" : ""}`}>
                      Innen
                    </button>
                    <button type="button" onClick={() => setDoorEdge("center")}
                      className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorEdge === "center" ? "active" : ""}`}>
                      Mitte
                    </button>
                    <button type="button" onClick={() => setDoorEdge("outer")}
                      className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorEdge === "outer" ? "active" : ""}`}>
                      Außen
                    </button>
                  </div>
                </div>
                {doorMode === "door" && (
                  <>
                    <div>
                      <label>Öffnungsseite (Aufschlag)</label>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setDoorSide("inner")}
                          className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorSide === "inner" ? "active" : ""}`}>
                          Innen
                        </button>
                        <button type="button" onClick={() => setDoorSide("outer")}
                          className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorSide === "outer" ? "active" : ""}`}>
                          Außen
                        </button>
                      </div>
                    </div>
                    <div>
                      <label>Öffnungsrichtung</label>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setDoorHand("left")}
                          className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorHand === "left" ? "active" : ""}`}>
                          Links
                        </button>
                        <button type="button" onClick={() => setDoorHand("right")}
                          className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorHand === "right" ? "active" : ""}`}>
                          Rechts
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {(doorMode === "door" || doorSashEnabled) && (
                  <div>
                    <label>{doorMode === "window" ? "Flügel-Farbe" : "Tür-Farbe"}</label>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: doorColor }} />
                      <input type="color" value={doorColor} onChange={(e) => setDoorColor(e.target.value)}
                        className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                    </div>
                  </div>
                )}

                {doorMode === "window" && (
                  <>
                    <div>
                      <label>Fenster-Farbe (Linien)</label>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: doorGlassColor }} />
                        <input type="color" value={doorGlassColor} onChange={(e) => setDoorGlassColor(e.target.value)}
                          className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                      </div>
                    </div>
                    <div>
                      <label>Fensterglas-Dicke (m, Abstand der Linien — 0 = auto)</label>
                      <input
                        type="number"
                        step={0.005}
                        min={0}
                        value={doorGlassThickM}
                        onChange={(e) => setDoorGlassThickM(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-full text-xs px-2 py-1 rounded border bg-background"
                        style={{ borderColor: "hsl(var(--border))" }}
                      />
                    </div>
                    <div>
                      <label className="flex items-center justify-between">
                        <span>Füllung</span>
                        <button type="button"
                          onClick={() => setDoorGlassFillColor(doorGlassFillColor ? "" : "#cfe2f3")}
                          className={`cad-toolbar-btn h-7 px-2 text-[11px] ${doorGlassFillColor ? "active" : ""}`}>
                          {doorGlassFillColor ? "Ein" : "Aus"}
                        </button>
                      </label>
                    </div>
                    {doorGlassFillColor && (
                      <div>
                        <label>Füll-Farbe</label>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: doorGlassFillColor }} />
                          <input type="color" value={doorGlassFillColor} onChange={(e) => setDoorGlassFillColor(e.target.value)}
                            className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="flex items-center justify-between">
                        <span>Flügeltür (Schwung anzeigen)</span>
                        <button type="button" onClick={() => setDoorSashEnabled(!doorSashEnabled)}
                          className={`cad-toolbar-btn h-7 px-2 text-[11px] ${doorSashEnabled ? "active" : ""}`}>
                          {doorSashEnabled ? "Ein" : "Aus"}
                        </button>
                      </label>
                    </div>
                    {doorSashEnabled && (
                      <>
                        <div>
                          <label>Öffnungsseite (Aufschlag)</label>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setDoorSide("inner")}
                              className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorSide === "inner" ? "active" : ""}`}>
                              Innen
                            </button>
                            <button type="button" onClick={() => setDoorSide("outer")}
                              className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorSide === "outer" ? "active" : ""}`}>
                              Außen
                            </button>
                          </div>
                        </div>
                        <div>
                          <label>Öffnungsrichtung</label>
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setDoorHand("left")}
                              className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorHand === "left" ? "active" : ""}`}>
                              Links
                            </button>
                            <button type="button" onClick={() => setDoorHand("right")}
                              className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${doorHand === "right" ? "active" : ""}`}>
                              Rechts
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* Laibung */}
                <div className="border-t pt-3" style={{ borderColor: "hsl(var(--border))" }}>
                  <label className="flex items-center justify-between">
                    <span>Laibung</span>
                    <button type="button" onClick={() => setDoorJambEnabled(!doorJambEnabled)}
                      className={`cad-toolbar-btn h-7 px-2 text-[11px] ${doorJambEnabled ? "active" : ""}`}>
                      {doorJambEnabled ? "Ein" : "Aus"}
                    </button>
                  </label>
                </div>
                {doorJambEnabled && (
                  <>
                    <div>
                      <label>Laibungslänge (m, je Seite)</label>
                      <input
                        type="number" min={0} step={0.01}
                        value={doorJambLenM}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(",", "."));
                          if (Number.isFinite(n) && n >= 0) setDoorJambLenM(n);
                        }}
                      />
                    </div>
                    <div>
                      <label>Laibungsdicke (m, quer) — 0 = volle Wand</label>
                      <input
                        type="number" min={0} step={0.01}
                        value={doorJambThickM}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value.replace(",", "."));
                          if (Number.isFinite(n) && n >= 0) setDoorJambThickM(n);
                        }}
                      />
                    </div>
                    <div>
                      <label>Laibungs-Farbe</label>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: doorJambColor }} />
                        <input type="color" value={doorJambColor} onChange={(e) => setDoorJambColor(e.target.value)}
                          className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                      </div>
                    </div>
                  </>
                )}
                {doorSelectedId && (
                  <button
                    type="button"
                    onClick={() => {
                      const app = appRef.current;
                      if (!app) return;
                      const d = app.scene.getDoorById(doorSelectedId);
                      if (d) { app.scene.removeDoor(d); app.doorTool.selectDoor(null); }
                    }}
                    className="cad-toolbar-btn w-full justify-center h-8 text-[11px]"
                    style={{ color: "hsl(var(--destructive))" }}
                  >
                    {doorMode === "window" ? "Fenster" : "Tür"} löschen
                  </button>
                )}
                <div className="text-[11px] opacity-70">
                  {doorSelectedId
                    ? "Endpunkt anklicken → Hubbox für Bewegen/Position. Endpunkte ziehen ändert Breite."
                    : `Klick auf eine Wand setzt ${doorMode === "window" ? "ein Fenster" : "eine Tür"}.`}
                </div>
              </div>
            </div>
          )}

          {/* Document-Eigenschaften: nur im Auswahl-Tool, wenn Dokument selektiert */}
          {!!docSelected && (activeTool === ToolIds.SELECT || (activeTool === ToolIds.DOCUMENT && (docToolPhase === "scale-pick-1" || docToolPhase === "scale-pick-2" || docToolPhase === "scale-await-input" || docToolPhase === "warp"))) && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Dokument-Eigenschaften</div>
              {/* Ebene des ausgewählten Bildes/PDFs — wie bei allen anderen Objekten. */}
              <label className="block text-xs mb-3">
                <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Ebene (Auswahl)</span>
                <select
                  key={docLabelTick}
                  value={appRef.current?.scene.getDocumentById(docSelected.id)?.labelId ?? ""}
                  onChange={(e) => {
                    const app = appRef.current;
                    const doc = app?.scene.getDocumentById(docSelected.id);
                    if (!app || !doc) return;
                    doc.labelId = e.target.value;
                    app.refreshLabelUI();
                    app.renderer.render();
                    setDocLabelTick((x) => x + 1);
                  }}
                  className="cad-settings-select w-full"
                >
                  {(appRef.current?.labelManager.list() ?? []).map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
              <div className="space-y-3">

                <div className="text-xs">
                  <div className="font-medium truncate" title={docSelected.name}>{docSelected.name}</div>
                  <div style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                    {docSelected.widthM.toFixed(3)} × {docSelected.heightM.toFixed(3)} m
                  </div>
                </div>

                {(docToolPhase === "scale-pick-1" || docToolPhase === "scale-pick-2" || docToolPhase === "scale-await-input") && (
                  <div className="rounded-md p-2 text-xs" style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.4)" }}>
                    {docToolPhase === "scale-pick-1" && <span>1. Skalier-Punkt anklicken (Snap aktiv)</span>}
                    {docToolPhase === "scale-pick-2" && <span>2. Punkt setzen · Shift: Ortho · Klick auf m-Anzeige: Distanz tippen</span>}
                    {docToolPhase === "scale-await-input" && <span>Soll-Länge im Hub eingeben + Enter</span>}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => appRef.current?.documentTool.beginScaleTwoPoints(docSelected.id)}
                  className="cad-toolbar-btn w-full justify-start px-2 h-9"
                  title="Über zwei Snap-Punkte und eine Soll-Länge skalieren"
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="text-xs">Skalieren (2 Punkte)</span>
                </button>

                <button
                  type="button"
                  onClick={() => appRef.current?.documentTool.beginScaleFromLastDimension(docSelected.id)}
                  className="cad-toolbar-btn w-full justify-start px-2 h-9"
                  title="Skaliere mit der zuletzt erstellten Maßkette als Referenz"
                >
                  <RulerIcon className="h-4 w-4" />
                  <span className="text-xs">Skalieren (Maßkette)</span>
                </button>

                {/* Freie Skalierung — Slider (relativ zur Größe bei Auswahl), ohne Rahmen. */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] px-0.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                    <span>Freie Skalierung</span>
                    <button
                      type="button"
                      className="hover:underline"
                      title="Zurück auf 100%"
                      onClick={() => {
                        const base = docFreeScaleBaseRef.current;
                        if (!base) return;
                        setDocFreeScalePct(100);
                        (appRef.current?.documentTool as any)?.scaleUniformAbsolute?.(docSelected.id, 1, base.w, base.h);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={1}
                      max={2000}
                      step={1}
                      value={Math.round(docFreeScalePct)}
                      onChange={(e) => {
                        const pct = Number(e.target.value);
                        const base = docFreeScaleBaseRef.current;
                        if (!base) return;
                        setDocFreeScalePct(pct);
                        (appRef.current?.documentTool as any)?.scaleUniformAbsolute?.(docSelected.id, pct / 100, base.w, base.h);
                      }}
                      className="flex-1 accent-foreground"
                    />
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      step={1}
                      value={Math.round(docFreeScalePct)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isFinite(v)) return;
                        const pct = Math.max(1, Math.min(2000, v));
                        const base = docFreeScaleBaseRef.current;
                        if (!base) return;
                        setDocFreeScalePct(pct);
                        (appRef.current?.documentTool as any)?.scaleUniformAbsolute?.(docSelected.id, pct / 100, base.w, base.h);
                      }}
                      className="w-14 h-6 px-1 text-[11px] rounded border tabular-nums text-right"
                      style={{ borderColor: "hsl(var(--border))" }}
                    />
                    <span className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>%</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const app = appRef.current; if (!app) return;
                    const doc = app.scene.getDocumentById(docSelected.id);
                    if (doc && window.confirm(`Dokument "${doc.name}" löschen?`)) {
                      app.scene.removeDocument(doc); app.clearSelection(); app.refreshLabelUI();
                    }
                  }}
                  className="cad-toolbar-btn w-full justify-start px-2 h-9"
                  title="Dokument löschen"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-xs">Löschen</span>
                </button>

                {!!docSelected.pdfSourceB64 && (
                  <DocumentPixelModeToggle app={appRef.current} docId={docSelected.id} />
                )}

                {!!docSelected.pdfSourceB64 && (
                  <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                      PDF auflösen
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const app = appRef.current; if (!app) return;
                        if (!window.confirm(`PDF "${docSelected.name}" in CAD-Objekte auflösen?\n\nLinien, Schraffuren und Texte werden in eine neue Ebene "PDF-Import — ${docSelected.name}" extrahiert; radierte Bereiche bleiben ausgespart.`)) return;
                        const res = await app.documentTool.dissolvePdf(docSelected.id);
                        if (res) {
                          window.alert(`Auflösen erfolgreich:\n${res.segments} Linien · ${res.hatches} Schraffuren · ${res.texts} Texte`);
                        }
                      }}
                      className="cad-toolbar-btn w-full justify-start px-2 h-9"
                      title="PDF-Vektoren extrahieren und in Linien/Schraffuren/Texte konvertieren (inkl. Radier-Änderungen)"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="text-xs">Auflösen → CAD-Objekte</span>
                    </button>
                  </div>
                )}


                <WarpSection engine={appRef.current} docId={docSelected.id} />


                <DocumentFilterPanel app={appRef.current} docId={docSelected.id} sig={docFilterSig} />



                <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
                  <div>Drag: verschieben (Snap aktiv) · Entf: löschen</div>
                </div>
              </div>
            </div>
          )}
          {activeTool === ToolIds.HATCH ? (
            <div
              className="mt-3 rounded-md border p-2 space-y-2"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="text-[10px] font-semibold tracking-wider" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                HILFE
              </div>
              <div className="text-[10.5px] leading-snug" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                <div><span className="cad-kbd">L-Klick + Shift</span> Gerade zeichnen</div>
                <div><span className="cad-kbd">Doppelklick auf Kante</span> Neuer Fangpunkt</div>
                <div><span className="cad-kbd">Klick auf Kante + Symbol</span> Kante rein-/rausziehen</div>
                <div className="mt-1.5 font-semibold">Objektarten</div>
                <div>Vektor: Generell bearbeitbar</div>
                <div>Pixel: Radiergummi bearbeitbar</div>
              </div>
            </div>
          ) : activeTool === ToolIds.LINE ? (
            <div
              className="mt-3 rounded-md border p-2 space-y-2"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="text-[10px] font-semibold tracking-wider" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                HILFE
              </div>
              <div className="text-[10.5px] leading-snug" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                <div><span className="cad-kbd">L-Klick + Shift</span> Gerade zeichnen</div>
                <div className="mt-1.5 font-semibold">Objektarten</div>
                <div>Vektor: Generell bearbeitbar</div>
                <div>Pixel: Radiergummi bearbeitbar</div>
              </div>
            </div>
          ) : activeTool === ToolIds.TEXT ? (
            <div
              className="mt-3 rounded-md border p-2 space-y-2"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <div className="text-[10px] font-semibold tracking-wider" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                HILFE
              </div>
              <div className="text-[10.5px] leading-snug" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                <div className="font-semibold">Modus</div>
                <div>Rahmen variabel: Rahmen passt sich an Text an</div>
                <div>Rahmen fix: Text passt sich an Rahmen an</div>
                <div className="mt-1.5"><span className="cad-kbd">Enter</span> Absatz setzen</div>
                <div><span className="cad-kbd">Text beenden</span> Außerhalb Textfeld klicken</div>
              </div>
            </div>
          ) : (
            <ToolHelpNotes toolId={activeTool} />
          )}
        </div>
        </DragScrollDiv>
        <DragScrollDiv axis="both" className="flex-1 min-h-0 overflow-auto p-2 space-y-2 cursor-grab active:cursor-grabbing" style={{ display: rightTab === "sheets" ? "block" : "none" }}>
          {/* Zeichnungs-ID Panel (Blätter + Transparentpause) */}
          <div ref={sheetPanelRef} className="cad-id-panel w-full">
            <div className="id-head">
              <div className="id-title">Zeichnungs-ID</div>
              <div className="id-head-actions">
                <button ref={sheetToggleBtnRef} className="id-head-btn icon-only" title="Ein-/Ausklappen">
                  <span className="id-toggle-chevron" />
                </button>
              </div>
            </div>
            <div ref={sheetBodyRef} className="id-body">
              <div className="id-add-wrap">
                <button ref={sheetAddBtnRef} className="id-head-btn id-add-btn">+ Blatt</button>
              </div>
              <div ref={sheetListRef} className="id-list" />
            </div>
          </div>

          {/* Druckpläne — direkt im Sheets-Tab, unterhalb der Zeichenblätter. */}
          <div ref={planPanelRef} className="cad-id-panel w-full">
            <div className="id-head">
              <div className="id-title">Druckpläne</div>
              <div className="id-head-actions">
                <button ref={planToggleBtnRef} className="id-head-btn icon-only" title="Ein-/Ausklappen">
                  <span className="id-toggle-chevron" />
                </button>
              </div>
            </div>
            <div ref={planBodyRef} className="id-body">
              <div className="id-add-wrap">
                <button ref={planAddBtnRef} className="id-head-btn id-add-btn">+ Plan</button>
              </div>
              <div ref={planListRef} className="id-list" />
              <div className="plan-print-wrap">
                <button ref={planPrintBtnRef} className="plan-print-btn" title="Ausgewählte Pläne als PDF drucken">
                  🖨 PDF Drucken
                </button>
              </div>
              <div className="text-[11px] leading-snug px-2 py-2 mt-2" style={{ color: "hsl(var(--ink-soft))" }}>
                Tipp: Pläne kannst du auch über das Werkzeug „CAD-Blatt" in der Projektmappenbearbeitung einfügen.
              </div>
            </div>
          </div>
        </DragScrollDiv>
        <DragScrollDiv axis="both" className="flex-1 min-h-0 overflow-auto p-2 space-y-2 cursor-grab active:cursor-grabbing" style={{ display: rightTab === "layers" ? "block" : "none" }}>
          <div ref={idPanelRef} className="cad-id-panel w-full">
            <div className="id-head">
              <div className="id-title">Bezeichnungs-ID</div>
              <div className="id-head-actions">
                <button ref={idToggleBtnRef} className="id-head-btn icon-only" title="Ein-/Ausklappen">
                  <span className="id-toggle-chevron" />
                </button>
              </div>
            </div>
            <div ref={idBodyRef} className="id-body">
              <div className="id-add-wrap">
                <button ref={idAddBtnRef} className="id-head-btn id-add-btn">+ ID</button>
              </div>
              <div ref={idListRef} className="id-list" />
            </div>
          </div>
        </DragScrollDiv>
      </aside>
      ) : (
        <div
          className="w-7 shrink-0 border-l flex items-start justify-center pt-3"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <button
            onClick={() => setRightOpen(true)}
            title="Panel einblenden"
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-muted"
          >
            <PanelRightOpen size={14} style={{ color: "hsl(var(--ink-soft))" }} />
          </button>
        </div>
      )}
    </div>
  );
});
CadEditor.displayName = "CadEditor";

export default CadEditor;
