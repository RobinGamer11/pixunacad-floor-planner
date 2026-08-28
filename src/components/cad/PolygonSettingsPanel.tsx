import React, { useEffect, useState } from "react";
import { Spline, RectangleHorizontal, Circle } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import type { PolygonDrawMode } from "@/cad/PolygonTool";
import { RasterModeToggle } from "@/components/cad/RasterModeToggle";
import { ToolColorPicker } from "@/components/workspace/ToolColorPicker";

const HAIRLINE = "hsl(var(--hairline))";

const MODES: { value: PolygonDrawMode; label: string; Icon: React.ElementType }[] = [
  { value: "polygon", label: "Polygon", Icon: Spline },
  { value: "rectangle", label: "Rechteck", Icon: RectangleHorizontal },
  { value: "circle", label: "Kreis", Icon: Circle },
];

type AnyApp = CadApp | MiniCad | null;

/** Aktuell ausgewähltes Polygonobjekt (falls vorhanden). */
function selectedPolygon(app: AnyApp): any | null {
  const id = (app as any)?.selection?.hatchId;
  if (!id) return null;
  const o = (app as any).scene?.getHatchById?.(id);
  return o && o.isPolygon ? o : null;
}

/** Modus-Auswahl — analog zum Linien-/Schraffurwerkzeug. */
export const PolygonModeSelect: React.FC<{ app: AnyApp }> = ({ app }) => {
  const [mode, setMode] = useState<PolygonDrawMode>("polygon");
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => {
      const m = (app as any).polygonTool?.drawMode as PolygonDrawMode | undefined;
      if (m) setMode(m);
    }, 300);
    return () => window.clearInterval(t);
  }, [app]);
  return (
    <div className="mb-3 grid grid-cols-3 gap-1">
      {MODES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          title={label}
          onClick={() => { (app as any)?.polygonTool?.setDrawMode(value); setMode(value); }}
          className={`cad-toolbar-btn h-9 justify-center ${mode === value ? "active" : ""}`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
};

/** Einstellungen des Polygonwerkzeugs: Farbe, Linienstärke, Transparenz. */
export const PolygonSettingsPanel: React.FC<{
  app: AnyApp;
  projectId?: string;
  /** true = Modus/Chrome wird außerhalb gerendert. */
  hideChrome?: boolean;
}> = ({ app, projectId, hideChrome }) => {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const sel = selectedPolygon(app);
  const color = sel?.strokeColor ?? (app as any)?.defaultPolygonColor ?? "#111111";
  const thicknessM = sel?.thicknessM ?? (app as any)?.defaultPolygonThicknessM ?? 0.01;
  const alpha = sel?.alpha ?? (app as any)?.defaultPolygonAlpha ?? 1;

  const setColor = (hex: string) => {
    const s = selectedPolygon(app);
    if (s) s.strokeColor = hex;
    else if (app) (app as any).defaultPolygonColor = hex;
    (app as any)?.requestRender?.();
    rerender();
  };
  const setThickness = (mm: number) => {
    const m = Math.max(0.0002, mm / 1000);
    const s = selectedPolygon(app);
    if (s) { s.thicknessM = m; s.strokeWidthPx = m * 80; }
    else if (app) (app as any).defaultPolygonThicknessM = m;
    (app as any)?.requestRender?.();
    rerender();
  };
  const setAlpha = (pct: number) => {
    const a = Math.max(0, Math.min(1, pct / 100));
    const s = selectedPolygon(app);
    if (s) s.alpha = a;
    else if (app) (app as any).defaultPolygonAlpha = a;
    (app as any)?.requestRender?.();
    rerender();
  };

  return (
    <div className="space-y-3">
      {!hideChrome && <PolygonModeSelect app={app} />}
      {!hideChrome && <RasterModeToggle app={app} projectId={projectId} />}

      <div>
        <span className="mb-1 block text-[9px] text-muted-foreground">Konturfarbe</span>
        <ToolColorPicker value={color} onChange={setColor} />
      </div>

      <label className="block">
        <span className="mb-1 block text-[9px] text-muted-foreground">Linienstärke (mm)</span>
        <input
          type="number"
          step={0.1}
          min={0.1}
          value={Number((thicknessM * 1000).toFixed(2))}
          onChange={(e) => setThickness(Number(e.target.value.replace(",", ".")))}
          className="h-8 w-full rounded-md border bg-transparent px-2 text-right text-[11px] tabular-nums outline-none"
          style={{ borderColor: HAIRLINE }}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[9px] text-muted-foreground">Transparenz ({Math.round((1 - alpha) * 100)}%)</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(alpha * 100)}
          onChange={(e) => setAlpha(Number(e.target.value))}
          className="w-full"
        />
      </label>
    </div>
  );
};

export default PolygonSettingsPanel;
