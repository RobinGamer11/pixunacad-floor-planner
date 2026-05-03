import React, { useRef, useEffect, useState, useCallback } from "react";
import { CadApp } from "@/cad/CadApp";
import { ToolIds, PointEditAction } from "@/cad/constants";
import { MousePointer2, Minus, Square, ChevronLeft, ChevronRight, Undo2, Redo2, Spline, RectangleHorizontal, Circle, Ruler, Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Pipette, Sticker as StickerIcon, Pencil, Trash2, Download, Upload, Plus, FileImage, Maximize2, Ruler as RulerIcon, Eraser } from "lucide-react";
import type { HatchDrawMode } from "@/cad/HatchTool";
import type { StickerDefinition } from "@/cad/StickerManager";
import { instanceBoundingCornersWorld } from "@/cad/StickerManager";
import { importFile, type ImportedPage } from "@/cad/documentImport";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const CAD_TOOLS = [
  { id: ToolIds.SELECT, label: "Auswahl", key: "V", icon: MousePointer2 },
  { id: ToolIds.LINE, label: "Linie", key: "L", icon: Minus },
  { id: ToolIds.HATCH, label: "Schraffur", key: "H", icon: Square },
  { id: ToolIds.MEASURE, label: "Maßkette", key: "M", icon: Ruler },
  { id: ToolIds.TEXT, label: "Text", key: "T", icon: Type },
  { id: ToolIds.PIPETTE, label: "Pipette", key: "P", icon: Pipette },
  { id: ToolIds.STICKER, label: "Sticker", key: "O", icon: StickerIcon },
  { id: ToolIds.DOCUMENT, label: "Dokument", key: "D", icon: FileImage },
  { id: ToolIds.FREE, label: "Freihand", key: "F", icon: Pencil },
  { id: ToolIds.ERASER, label: "Radiergummi", key: "E", icon: Eraser },
];

const CadEditor: React.FC = () => {
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
  const measureEditModeRef = useRef<HTMLSelectElement>(null);
  const measureExtRef = useRef<HTMLInputElement>(null);
  const measureFreeTextToggleRef = useRef<HTMLInputElement>(null);
  const measureFreeTextInputRef = useRef<HTMLInputElement>(null);
  const measureTextColorRef = useRef<HTMLInputElement>(null);
  const measureTextColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureTextSizeRef = useRef<HTMLInputElement>(null);
  const measureDecimalsRef = useRef<HTMLInputElement>(null);
  const measureTextBgToggleRef = useRef<HTMLInputElement>(null);
  const measureTextBgGroupRef = useRef<HTMLDivElement>(null);
  const measureTextBgColorRef = useRef<HTMLInputElement>(null);
  const measureTextBgColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureTextBgAlphaRef = useRef<HTMLInputElement>(null);
  const measureLineColorRef = useRef<HTMLInputElement>(null);
  const measureLineColorPreviewRef = useRef<HTMLDivElement>(null);
  const measureTickLengthRef = useRef<HTMLInputElement>(null);

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

  // Text editor overlay refs
  const textEditorElRef = useRef<HTMLDivElement>(null);
  const textEditorToolbarRef = useRef<HTMLDivElement>(null);
  const textEditorBoldRef = useRef<HTMLButtonElement>(null);
  const textEditorItalicRef = useRef<HTMLButtonElement>(null);
  const textEditorColorRef = useRef<HTMLInputElement>(null);
  const textEditorSizeRef = useRef<HTMLSelectElement>(null);
  const textEditorSymbolRef = useRef<HTMLSelectElement>(null);

  const appRef = useRef<CadApp | null>(null);
  const [activeTool, setActiveTool] = useState<string>(ToolIds.SELECT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hatchDrawMode, setHatchDrawMode] = useState<HatchDrawMode>("polygon");
  const [stickers, setStickers] = useState<StickerDefinition[]>([]);
  const [stickerSelCount, setStickerSelCount] = useState(0);
  const [stickerPhase, setStickerPhase] = useState<"idle" | "selecting" | "placing" | "rotating">("idle");
  const stickerImportRef = useRef<HTMLInputElement>(null);
  // Floating edit-pencil overlay near selected sticker instance
  const [stickerEditOverlay, setStickerEditOverlay] = useState<{ id: string; x: number; y: number } | null>(null);

  // Document import state
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const [docPickerPages, setDocPickerPages] = useState<ImportedPage[] | null>(null);
  const [docPickerSelected, setDocPickerSelected] = useState<Set<number>>(new Set());
  const [docImporting, setDocImporting] = useState(false);
  const [docSelected, setDocSelected] = useState<{ id: string; name: string; widthM: number; heightM: number; importScaleDenom: number } | null>(null);
  const [docScalePopoverOpen, setDocScalePopoverOpen] = useState(false);
  const [docScaleChoice, setDocScaleChoice] = useState<string>("100");
  const [docScaleCustom, setDocScaleCustom] = useState<string>("100");
  const [docToolPhase, setDocToolPhase] = useState<string>("idle");
  // Maßstab-Auswahl vor Platzierung
  const [scaleDialogPages, setScaleDialogPages] = useState<ImportedPage[] | null>(null);
  const [scaleChoice, setScaleChoice] = useState<string>("100"); // "50" | "100" | "200" | "500" | "1" | "custom"
  const [scaleCustom, setScaleCustom] = useState<string>("100");
  // Zeichnen-Maßstab (Default-Vorauswahl beim PDF-Import)
  const [drawingScale, setDrawingScale] = useState<number>(100);
  const [drawingScaleOpen, setDrawingScaleOpen] = useState(false);
  const [drawingScaleCustom, setDrawingScaleCustom] = useState<string>("100");
  

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
      !measureOrientationRef.current || !measurePointCountRef.current || !measureEditModeRef.current ||
      !measureExtRef.current || !measureFreeTextToggleRef.current || !measureFreeTextInputRef.current ||
      !measureTextColorRef.current || !measureTextColorPreviewRef.current || !measureTextSizeRef.current ||
      !measureDecimalsRef.current || !measureTextBgToggleRef.current || !measureTextBgGroupRef.current ||
      !measureTextBgColorRef.current || !measureTextBgColorPreviewRef.current || !measureTextBgAlphaRef.current ||
      !measureLineColorRef.current || !measureLineColorPreviewRef.current || !measureTickLengthRef.current ||
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
        editMode: measureEditModeRef.current,
        extensionsToggle: measureExtRef.current,
        freeTextToggle: measureFreeTextToggleRef.current,
        freeTextInput: measureFreeTextInputRef.current,
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
      setStickerPhase(app.stickerTool.phase);
      setStickerSelCount(app.stickerTool.getSelectionCount());
    };
    app.onHistoryChange = (u, r) => { setCanUndo(u); setCanRedo(r); };
    app.onStickersChange = () => setStickers([...app.stickers]);
    app.stickerTool.onSelectionChange = () => {
      setStickerSelCount(app.stickerTool.getSelectionCount());
      setStickerPhase(app.stickerTool.phase);
    };
    app.hatchTool.onDrawModeChange = (m) => setHatchDrawMode(m);
    setHatchDrawMode(app.hatchTool.drawMode);
    app.documentTool.onPhaseChange = () => setDocToolPhase(app.documentTool.phase);
    app.setTool(ToolIds.SELECT);

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

    const onResize = () => app.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      app.destroy();
      appRef.current = null;
    };
  }, []);

  // Resize canvas when sidebar collapses/expands
  useEffect(() => {
    const t = setTimeout(() => appRef.current?.resize(), 180);
    return () => clearTimeout(t);
  }, [sidebarCollapsed]);

  // Ansichtsmaßstab: REIN visueller Zoom + visueller Darstellungsfaktor für PDFs.
  // Verändert KEINE Modellgeometrie und KEINE Dokument-Welt-Maße.
  // Der Wert wird zusätzlich an die App weitergereicht, damit der Renderer
  // PDFs visuell mit (importScaleDenom / drawingScale) skalieren kann.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const nextScale = Math.max(0.0001, drawingScale);
    app.drawingScale = nextScale;
    const cam = app.camera;
    const target = 80 * (100 / nextScale);
    const newScale = Math.max(cam.minScale, Math.min(cam.maxScale, target));
    if (Math.abs(newScale - cam.scale) < 1e-6) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const pivotSx = rect ? rect.width / 2 : cam.offsetX;
    const pivotSy = rect ? rect.height / 2 : cam.offsetY;
    const before = cam.screenToWorld(pivotSx, pivotSy);
    cam.scale = newScale;
    const after = cam.screenToWorld(pivotSx, pivotSy);
    cam.offsetX += (after.x - before.x) * cam.scale;
    cam.offsetY += (after.y - before.y) * cam.scale;
  }, [drawingScale]);


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

  // Poll selected document for the settings panel
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const app = appRef.current;
      if (app) {
        const sel = app.selection as any;
        if (sel && sel.type === "document") {
          const doc = app.scene.getDocumentById(sel.documentId);
          if (doc) {
            setDocSelected(prev => (prev && prev.id === doc.id && prev.widthM === doc.widthM && prev.heightM === doc.heightM && prev.importScaleDenom === doc.importScaleDenom) ? prev : { id: doc.id, name: doc.name, widthM: doc.widthM, heightM: doc.heightM, importScaleDenom: doc.importScaleDenom });
          } else {
            setDocSelected(prev => prev ? null : prev);
          }
        } else {
          setDocSelected(prev => prev ? null : prev);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleToolClick = useCallback((id: string) => {
    appRef.current?.setTool(id);
    setActiveTool(id);
  }, []);

  const handleDocFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setDocImporting(true);
    try {
      const pages = await importFile(f);
      if (pages.length === 0) { window.alert("Keine Seiten gefunden."); return; }
      if (pages.length === 1) {
        // Direkt zum Maßstab-Dialog – Default = aktueller Zeichen-Maßstab
        const def = pages[0].kind === "pdf-page" ? String(drawingScale) : "1";
        setScaleChoice(def);
        setScaleCustom(String(drawingScale));
        setScaleDialogPages(pages);
      } else {
        // PDF mit mehreren Seiten → erst Page-Picker
        const all = new Set<number>();
        pages.forEach((_, i) => all.add(i));
        setDocPickerSelected(all);
        setDocPickerPages(pages);
      }
    } catch (err: any) {
      window.alert(err?.message || "Import fehlgeschlagen.");
    } finally {
      setDocImporting(false);
    }
  }, [drawingScale]);

  const handleDocPickerConfirm = useCallback(() => {
    if (!docPickerPages) return;
    const selectedPages = docPickerPages.filter((_, i) => docPickerSelected.has(i));
    if (selectedPages.length === 0) { setDocPickerPages(null); return; }
    // → Maßstab-Dialog (Default = aktueller Zeichen-Maßstab)
    setScaleChoice(selectedPages[0].kind === "pdf-page" ? String(drawingScale) : "1");
    setScaleCustom(String(drawingScale));
    setDocPickerPages(null);
    setDocPickerSelected(new Set());
    setScaleDialogPages(selectedPages);
  }, [docPickerPages, docPickerSelected]);

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
      });
      offX += pw + 0.5;
    }
    setScaleDialogPages(null);
  }, [scaleDialogPages, scaleChoice, scaleCustom]);

  const sidebarWidth = sidebarCollapsed ? 56 : 240;

  return (
    <div className="flex w-full h-full overflow-hidden" style={{ background: "hsl(var(--cad-canvas))" }}>
      {/* Left Sidebar */}
      <aside
        className="relative shrink-0 flex flex-col border-r transition-[width] duration-150 ease-out"
        style={{
          width: sidebarWidth,
          background: "linear-gradient(180deg, hsl(222 30% 15%), hsl(222 32% 12%))",
          borderColor: "hsl(var(--cad-toolbar-border))",
          boxShadow: "1px 0 0 hsl(0 0% 100% / 0.03) inset",
        }}
      >
        {/* Undo / Redo */}
        <div className={`flex gap-1 p-2 ${sidebarCollapsed ? "flex-col items-center" : ""}`}>
          <button
            onClick={() => appRef.current?.undo()}
            disabled={!canUndo}
            title="Rückgängig (Strg+Z)"
            className={`cad-toolbar-btn ${sidebarCollapsed ? "justify-center px-0 h-9 w-9" : "flex-1 justify-center"} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Undo2 className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span className="text-xs">Undo</span>}
          </button>
          <button
            onClick={() => appRef.current?.redo()}
            disabled={!canRedo}
            title="Wiederherstellen (Strg+Y)"
            className={`cad-toolbar-btn ${sidebarCollapsed ? "justify-center px-0 h-9 w-9" : "flex-1 justify-center"} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Redo2 className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span className="text-xs">Redo</span>}
          </button>
        </div>

        {/* Divider */}
        <div className="mx-3 border-t opacity-60" style={{ borderColor: "hsl(var(--cad-toolbar-border))" }} />

        {/* Tool list */}
        <div className="flex flex-col gap-1 p-2">
          {CAD_TOOLS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTool === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleToolClick(t.id)}
                title={sidebarCollapsed ? `${t.label} (${t.key})` : undefined}
                className={`cad-toolbar-btn ${isActive ? "active" : ""} ${
                  sidebarCollapsed ? "justify-center px-0 h-10 w-10 mx-auto" : "w-full justify-between"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{t.label}</span>}
                </span>
                {!sidebarCollapsed && <span className="tool-key">{t.key}</span>}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        {!sidebarCollapsed && (
          <div className="mx-3 border-t" style={{ borderColor: "hsl(var(--cad-toolbar-border))" }} />
        )}

        {/* Settings area (scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {/* Line Settings */}
          <div ref={settingsRef} className={`cad-settings-panel hidden mb-2 ${sidebarCollapsed ? "!hidden" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Linie
            </div>
            <div className="space-y-3">
              <div>
                <label>ID</label>
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
                 <label>Stärke (m)</label>
                 <input ref={thicknessInputRef} type="text" defaultValue="0.03" />
               </div>
             </div>
             <div className="mt-3 pt-2 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid hsl(var(--border))" }}>
               <span className="cad-kbd">Space</span>
               <span className="cad-kbd">Shift</span>
               <span className="cad-kbd">Tab</span>
             </div>
           </div>

           {/* Hatch Settings */}
          <div ref={hatchSettingsRef} className={`cad-settings-panel hidden mb-2 ${sidebarCollapsed ? "!hidden" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Schraffur
            </div>

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
            </div>

            <div className="space-y-3">
              <div>
                <label>ID</label>
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
                <input ref={hatchStrokeWidthRef} type="text" defaultValue="2.2" />
              </div>
              <div>
                <label>Transparenz (0–100%)</label>
                <input ref={hatchAlphaRef} type="text" defaultValue="35" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input ref={areaShowRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Flächenanzeige</label>
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
                  <input ref={areaFontSizeRef} type="text" defaultValue="16" />
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
               </div>
             </div>
             <div className="mt-3 pt-2 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid hsl(var(--border))" }}>
               <span className="cad-kbd">Space</span>
               <span className="cad-kbd">Shift</span>
               <span className="cad-kbd">Tab</span>
             </div>
           </div>

          {/* Measure Settings */}
          <div ref={measureSettingsRef} className={`cad-settings-panel hidden ${sidebarCollapsed ? "!hidden" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Maßkette
            </div>
            <div className="space-y-3">
              <div>
                <label>ID</label>
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
                <select ref={measurePointCountRef} className="cad-settings-select w-full">
                  <option value="two">2 Punkte</option>
                  <option value="multi">Mehrere Punkte</option>
                </select>
              </div>
              <div>
                <label>Punktbearbeitung (Auswahl)</label>
                <select ref={measureEditModeRef} className="cad-settings-select w-full">
                  <option value="parallel">Parallel verschieben</option>
                  <option value="endpoints">Endpunkte editieren</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input ref={measureExtRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Verlängerungslinien</label>
              </div>
              <div className="flex items-center gap-2">
                <input ref={measureFreeTextToggleRef} type="checkbox" className="accent-primary" />
                <label className="!mb-0 cursor-pointer">Freier Text</label>
              </div>
              <div>
                <input ref={measureFreeTextInputRef} type="text" placeholder="Text eingeben" className="hidden" />
              </div>
              <div>
                <label>Textfarbe</label>
                <div className="flex items-center gap-2">
                  <div ref={measureTextColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={measureTextColorRef} type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
              <div>
                <label>Textgröße (px)</label>
                <input ref={measureTextSizeRef} type="text" defaultValue="12" />
              </div>
              <div>
                <label>Kommastellen (0–6)</label>
                <input ref={measureDecimalsRef} type="text" defaultValue="3" />
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
                <input ref={measureTickLengthRef} type="text" defaultValue="0.06" />
              </div>
            </div>
          </div>

          {/* Text Settings */}
          <div ref={textSettingsRef} className={`cad-settings-panel hidden ${sidebarCollapsed ? "!hidden" : ""}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Text
            </div>
            <div className="space-y-3">
              <div>
                <label>ID</label>
                <select ref={textIdSelectRef} className="cad-settings-select w-full" />
              </div>
              <div>
                <label>Textfarbe</label>
                <div className="flex items-center gap-2">
                  <div ref={textColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={textColorRef} type="color" defaultValue="#111111" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
              <div>
                <label>Schriftgröße (px)</label>
                <input ref={textFontSizeRef} type="text" defaultValue="16" />
              </div>
              <div>
                <label>Ausrichtung</label>
                <div className="flex gap-1">
                  <button ref={textAlignLeftRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9" title="Links">
                    <AlignLeft className="h-4 w-4" />
                  </button>
                  <button ref={textAlignCenterRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9" title="Mitte">
                    <AlignCenter className="h-4 w-4" />
                  </button>
                  <button ref={textAlignRightRef} type="button" className="cad-toolbar-btn flex-1 justify-center h-9" title="Rechts">
                    <AlignRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label>Hintergrundfarbe</label>
                <div className="flex items-center gap-2">
                  <div ref={textBgColorPreviewRef} className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))" }} />
                  <input ref={textBgColorRef} type="color" defaultValue="#ffffff" className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
                </div>
              </div>
              <div>
                <label>HG-Transparenz (0–100%)</label>
                <input ref={textBgAlphaRef} type="text" defaultValue="0" />
              </div>
              <div className="flex items-center gap-2">
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
          {!sidebarCollapsed && activeTool === ToolIds.STICKER && (
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
          {!sidebarCollapsed && activeTool === ToolIds.DOCUMENT && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Dokument importieren</div>
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

                {docToolPhase === "placing" && (
                  <div className="rounded-md p-2 text-xs" style={{ background: "hsl(var(--primary) / 0.12)", border: "1px solid hsl(var(--primary) / 0.4)" }}>
                    Klick auf Canvas: Dokument absetzen · Esc: abbrechen
                  </div>
                )}

                <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
                  <div>PDF, JPG, PNG werden mit 96 DPI / 72 pt importiert.</div>
                  <div>Zum Skalieren: <strong>Auswahl-Tool</strong> (V) → Dokument anklicken.</div>
                </div>
              </div>
            </div>
          )}

          {/* Freihand-Tool-Panel */}
          {!sidebarCollapsed && activeTool === ToolIds.FREE && (
            <FreeDrawSettingsPanel app={appRef.current} />
          )}

          {/* Eraser-Tool-Panel */}
          {!sidebarCollapsed && activeTool === ToolIds.ERASER && (
            <EraserSettingsPanel app={appRef.current} />
          )}

          {/* Document-Eigenschaften: nur im Auswahl-Tool, wenn Dokument selektiert */}
          {!sidebarCollapsed && !!docSelected && (activeTool === ToolIds.SELECT || (activeTool === ToolIds.DOCUMENT && (docToolPhase === "scale-pick-1" || docToolPhase === "scale-pick-2" || docToolPhase === "scale-await-input"))) && (
            <div className="cad-settings-panel mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Dokument-Eigenschaften</div>
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
                  className="cad-toolbar-btn w-full justify-center h-9"
                  title="Über zwei Snap-Punkte und eine Soll-Länge skalieren"
                >
                  <Maximize2 className="h-4 w-4" />
                  <span className="text-xs">Skalieren (2 Punkte)</span>
                </button>
                <button
                  type="button"
                  onClick={() => appRef.current?.documentTool.beginScaleFromLastDimension(docSelected.id)}
                  className="cad-toolbar-btn w-full justify-center h-9"
                  title="Skaliere mit der zuletzt erstellten Maßkette als Referenz"
                >
                  <RulerIcon className="h-4 w-4" />
                  <span className="text-xs">Skalieren (Maßkette)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const app = appRef.current; if (!app) return;
                    const doc = app.scene.getDocumentById(docSelected.id);
                    if (doc && window.confirm(`Dokument "${doc.name}" löschen?`)) {
                      app.scene.removeDocument(doc); app.clearSelection(); app.refreshLabelUI();
                    }
                  }}
                  className="cad-toolbar-btn w-full justify-center h-9"
                  title="Dokument löschen"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-xs">Löschen</span>
                </button>

                <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
                  <div>Drag: verschieben (Snap aktiv) · Entf: löschen</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PDF Page Picker Dialog */}
        <Dialog open={!!docPickerPages} onOpenChange={(o) => { if (!o) setDocPickerPages(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Seiten auswählen</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto grid grid-cols-3 gap-3 p-1">
              {docPickerPages?.map((p, i) => {
                const checked = docPickerSelected.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setDocPickerSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      });
                    }}
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
              <Button variant="outline" onClick={() => { setDocPickerSelected(new Set()); }}>Keine</Button>
              <Button variant="outline" onClick={() => {
                const all = new Set<number>();
                docPickerPages?.forEach((_, i) => all.add(i));
                setDocPickerSelected(all);
              }}>Alle</Button>
              <Button onClick={handleDocPickerConfirm} disabled={docPickerSelected.size === 0}>
                {docPickerSelected.size} importieren
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="absolute -right-3 top-[88px] z-30 flex items-center justify-center w-6 h-6 rounded-full border shadow-md transition-all hover:scale-110"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))",
            borderColor: "hsl(var(--primary) / 0.6)",
            color: "#fff",
            boxShadow: "0 4px 12px -2px hsl(var(--primary) / 0.5)",
          }}
          title={sidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
        >
          {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* Canvas Area */}
      <div ref={containerRef} className="relative flex-1 min-w-0 h-full overflow-hidden">
        {/* Right-side stacked panels: Bezeichnungs-ID + Zeichnungs-ID */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2 items-end">
          {/* Bezeichnungs-ID Panel */}
          <div ref={idPanelRef} className="cad-id-panel w-[220px]">
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

          {/* Zeichnungs-ID Panel (Blätter + Transparentpause) */}
          <div ref={sheetPanelRef} className="cad-id-panel w-[220px]">
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

          {/* Druckpläne Panel */}
          <div ref={planPanelRef} className="cad-id-panel w-[220px]">
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
            </div>
          </div>
        </div>

        {/* Line Hub */}
        <div ref={hubRef} className="cad-hub absolute z-30 hidden flex gap-2 items-center">
          <input ref={hubLenRef} type="text" readOnly className="text-xs" />
          <input ref={hubAngRef} type="text" readOnly className="text-xs" />
        </div>

        {/* Point Edit Menu */}
        <div ref={pointEditRef} className="cad-point-menu absolute z-30 hidden">
          <button ref={pointMoveBtnRef} title="Bewegen">◉</button>
          <button ref={pointTranslateBtnRef} title="Verschieben">✥</button>
          <button ref={pointRotateBtnRef} title="Drehen">⟳</button>
          <button ref={pointOffsetBtnRef} title="Kante versetzen">⇆</button>
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

        {/* Drawing Scale Drop-Up (bottom-left) */}
        <div className="absolute left-3 bottom-3 z-30">
          {drawingScaleOpen && (
            <div
              className="mb-2 rounded-md shadow-lg p-2 w-44"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                Maßstab Zeichnung
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {[100, 200, 500, 50, 10, 1].map(d => {
                  const active = drawingScale === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { setDrawingScale(d); setDrawingScaleOpen(false); }}
                      className="rounded h-7 text-[11px] font-semibold border transition-colors"
                      style={{
                        background: active ? "hsl(var(--primary))" : "hsl(var(--muted))",
                        color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                        borderColor: active ? "hsl(var(--primary))" : "hsl(var(--border))",
                      }}
                    >
                      1:{d}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px]" style={{ color: "hsl(var(--foreground))" }}>1 :</span>
                <input
                  type="text"
                  value={drawingScaleCustom}
                  onChange={(e) => setDrawingScaleCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const n = parseFloat(drawingScaleCustom.replace(",", "."));
                      if (Number.isFinite(n) && n > 0) { setDrawingScale(n); setDrawingScaleOpen(false); }
                    }
                  }}
                  className="cad-settings-select h-7 flex-1 text-[11px]"
                  placeholder="frei"
                />
                <button
                  type="button"
                  onClick={() => {
                    const n = parseFloat(drawingScaleCustom.replace(",", "."));
                    if (Number.isFinite(n) && n > 0) { setDrawingScale(n); setDrawingScaleOpen(false); }
                  }}
                  className="rounded h-7 px-2 text-[11px] font-semibold"
                  style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                >
                  OK
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setDrawingScaleOpen(o => !o)}
            className="rounded-md px-3 h-8 text-xs font-semibold shadow-md flex items-center gap-1.5 transition-colors"
            style={{
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
            }}
            title="Maßstab der Zeichenoberfläche"
          >
            <span style={{ color: "hsl(var(--muted-foreground))" }}>M</span>
            <span>1 : {drawingScale}</span>
            <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>{drawingScaleOpen ? "▾" : "▴"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CadEditor;
