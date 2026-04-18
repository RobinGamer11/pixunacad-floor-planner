import React, { useRef, useEffect, useState, useCallback } from "react";
import { CadApp } from "@/cad/CadApp";
import { ToolIds, PointEditAction } from "@/cad/constants";
import { MousePointer2, Minus, Square, ChevronLeft, ChevronRight, Undo2, Redo2, Spline, RectangleHorizontal } from "lucide-react";
import type { HatchDrawMode } from "@/cad/HatchTool";

const CAD_TOOLS = [
  { id: ToolIds.SELECT, label: "Auswahl", key: "V", icon: MousePointer2 },
  { id: ToolIds.LINE, label: "Linie", key: "L", icon: Minus },
  { id: ToolIds.HATCH, label: "Schraffur", key: "H", icon: Square },
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

  const appRef = useRef<CadApp | null>(null);
  const [activeTool, setActiveTool] = useState<string>(ToolIds.SELECT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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
      !areaBgColorRef.current || !areaBgPreviewRef.current || !areaBgAlphaRef.current
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
    );

    app.onToolChange = (id) => setActiveTool(id);
    app.onHistoryChange = (u, r) => { setCanUndo(u); setCanRedo(r); };
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
          {/* Settings hidden when sidebar collapsed */}
          {/* Line Settings - inline in sidebar; visibility ('hidden' class) is controlled by CadApp */}
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

          {/* Hatch Settings - inline in sidebar; visibility ('hidden' class) is controlled by CadApp */}
          <div ref={hatchSettingsRef} className={`cad-settings-panel hidden ${sidebarCollapsed ? "!hidden" : ""}`}>

            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              Schraffur
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
        </div>

        {/* Collapse toggle - positioned on the divider between tools and settings */}
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

        {/* Canvas */}
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
    </div>
  );
};

export default CadEditor;
