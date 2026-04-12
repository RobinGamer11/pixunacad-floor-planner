import React, { useRef, useEffect, useState, useCallback } from "react";
import { CadApp } from "@/cad/CadApp";
import { ToolIds, PointEditAction } from "@/cad/constants";

const CAD_TOOLS = [
  { id: ToolIds.SELECT, label: "Auswahl", key: "V" },
  { id: ToolIds.LINE, label: "Linie", key: "L" },
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
  const settingsRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const colorPreviewRef = useRef<HTMLDivElement>(null);
  const thicknessInputRef = useRef<HTMLInputElement>(null);

  const appRef = useRef<CadApp | null>(null);
  const [activeTool, setActiveTool] = useState(ToolIds.SELECT);

  useEffect(() => {
    if (
      !canvasRef.current || !hubRef.current || !hubLenRef.current || !hubAngRef.current ||
      !pointEditRef.current || !pointMoveBtnRef.current || !pointTranslateBtnRef.current ||
      !pointRotateBtnRef.current || !settingsRef.current || !colorInputRef.current ||
      !colorPreviewRef.current || !thicknessInputRef.current
    ) return;

    const app = new CadApp(
      canvasRef.current,
      hubRef.current,
      hubLenRef.current,
      hubAngRef.current,
      pointEditRef.current,
      {
        [PointEditAction.MOVE]: pointMoveBtnRef.current,
        [PointEditAction.TRANSLATE]: pointTranslateBtnRef.current,
        [PointEditAction.ROTATE]: pointRotateBtnRef.current,
      },
      settingsRef.current,
      colorInputRef.current,
      colorPreviewRef.current,
      thicknessInputRef.current,
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
      <div ref={settingsRef} className="cad-settings-panel absolute top-3 right-3 z-20 hidden w-44">
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

      {/* Line Hub (floating length/angle display) */}
      <div ref={hubRef} className="cad-hub absolute z-30 hidden flex gap-2 items-center">
        <input ref={hubLenRef} type="text" readOnly className="text-xs" />
        <input ref={hubAngRef} type="text" readOnly className="text-xs" />
      </div>

      {/* Point Edit Menu */}
      <div ref={pointEditRef} className="cad-point-menu absolute z-30 hidden">
        <button ref={pointMoveBtnRef}>Bewegen</button>
        <button ref={pointTranslateBtnRef}>Verschieben</button>
        <button ref={pointRotateBtnRef}>Drehen</button>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default CadEditor;
