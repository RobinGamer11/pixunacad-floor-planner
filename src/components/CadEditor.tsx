import React, { useRef, useEffect, useState, useCallback } from "react";
import { CadApp } from "@/cad/CadApp";
import { ToolIds, PointEditAction } from "@/cad/constants";

const CAD_TOOLS = [
  { id: ToolIds.SELECT, label: "Auswahl", key: "V" },
  { id: ToolIds.LINE, label: "Linie", key: "L" },
  { id: ToolIds.HATCH, label: "Schraffur", key: "H" },
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

  useEffect(() => {
    if (
      !canvasRef.current || !hubRef.current || !hubLenRef.current || !hubAngRef.current ||
      !pointEditRef.current || !pointMoveBtnRef.current || !pointTranslateBtnRef.current ||
      !pointRotateBtnRef.current || !pointDeleteBtnRef.current || !settingsRef.current || !idSelectRef.current ||
      !colorInputRef.current || !colorPreviewRef.current || !thicknessInputRef.current ||
      !idPanelRef.current || !idBodyRef.current || !idListRef.current ||
      !idAddBtnRef.current || !idToggleBtnRef.current ||
      !hatchSettingsRef.current || !hatchFillColorRef.current || !hatchFillPreviewRef.current ||
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
      hatchFillColorRef.current, hatchFillPreviewRef.current,
      hatchStrokeColorRef.current, hatchStrokePreviewRef.current,
      hatchStrokeWidthRef.current, hatchAlphaRef.current,
      areaShowRef.current, areaSettingsGroupRef.current,
      areaTextColorRef.current, areaTextPreviewRef.current, areaFontSizeRef.current,
      areaBgColorRef.current, areaBgPreviewRef.current, areaBgAlphaRef.current,
    );

    app.onToolChange = (id) => setActiveTool(id);
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

  const handleToolClick = useCallback((id: string) => {
    appRef.current?.setTool(id);
    setActiveTool(id);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ background: "hsl(var(--cad-canvas))" }}>
      {/* Toolbar */}
      <div
        className="absolute top-3 left-3 z-20 flex gap-1 rounded-lg border px-1 py-1 shadow-sm"
        style={{ background: "hsl(var(--cad-toolbar))", borderColor: "hsl(var(--cad-toolbar-border))" }}
      >
        {CAD_TOOLS.map((t) => (
          <button
            key={t.id}
            className={`cad-toolbar-btn ${activeTool === t.id ? "active" : ""}`}
            onClick={() => handleToolClick(t.id)}
          >
            <span>{t.label}</span>
            <span className="tool-key">{t.key}</span>
          </button>
        ))}
      </div>

      {/* Line Settings Panel */}
      <div ref={settingsRef} className="cad-settings-panel absolute top-3 right-[240px] z-20 hidden w-48">
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

      {/* Hatch Settings Panel */}
      <div ref={hatchSettingsRef} className="cad-settings-panel absolute top-14 right-[240px] z-20 hidden w-52">
        <div className="text-xs font-semibold mb-2" style={{ color: "hsl(var(--foreground))" }}>Schraffur-Einstellungen</div>
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
  );
};

export default CadEditor;
