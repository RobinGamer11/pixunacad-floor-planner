import React, { useRef, useEffect, useState, useCallback } from "react";
import { CadApp } from "@/cad/CadApp";
import { ToolIds, PointEditAction } from "@/cad/constants";
import { MousePointer2, Minus, Square, ChevronLeft, ChevronRight, Undo2, Redo2, Spline, RectangleHorizontal, Circle, Ruler, Type, Bold, Italic, AlignLeft, AlignCenter, AlignRight, Pipette, Sticker as StickerIcon, Pencil, Trash2, Download, Upload, Plus, FileImage, Maximize2, Ruler as RulerIcon } from "lucide-react";
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
  const [docSelected, setDocSelected] = useState<{ id: string; name: string; widthM: number; heightM: number } | null>(null);
  const [docToolPhase, setDocToolPhase] = useState<string>("idle");

  useEffect(() => {
    if (
      !canvasRef.current || !hubRef.current || !hubLenRef.current || !hubAngRef.current ||
      !pointEditRef.current || !pointMoveBtnRef.current || !pointTranslateBtnRef.current ||
      !pointRotateBtnRef.current || !pointDeleteBtnRef.current || !settingsRef.current || !idSelectRef.current ||
      !colorInputRef.current || !colorPreviewRef.current || !thicknessInputRef.current ||
      !idPanelRef.current || !idBodyRef.current || !idListRef.current ||
      !idAddBtnRef.current || !idToggleBtnRef.current ||
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

  const handleToolClick = useCallback((id: string) => {
    appRef.current?.setTool(id);
    setActiveTool(id);
  }, []);

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
        </div>

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
        {/* ID Panel */}
        <div ref={idPanelRef} className="cad-id-panel absolute top-3 right-3 z-20 w-[220px]">
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
      </div>
    </div>
  );
};

export default CadEditor;
