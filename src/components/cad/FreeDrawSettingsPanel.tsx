import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";

type LineStyle = "solid" | "dashed" | "dotted" | "dashdot" | "blob";

const STYLE_OPTIONS: { value: LineStyle; label: string }[] = [
  { value: "solid", label: "Linie" },
  { value: "dashed", label: "Gestrichelt" },
  { value: "dashdot", label: "Punkt-Strich" },
  { value: "dotted", label: "Punkte" },
  { value: "blob", label: "Klekse" },
];

interface Props { app: CadApp | null; }

export const FreeDrawSettingsPanel: React.FC<Props> = ({ app }) => {
  const [color, setColor] = useState("#111111");
  const [thickness, setThickness] = useState(0.03);
  const [opacity, setOpacity] = useState(1);
  const [style, setStyle] = useState<LineStyle>("solid");
  const [gap, setGap] = useState(0.08);
  const [hasRuler, setHasRuler] = useState(false);

  useEffect(() => {
    if (!app) return;
    setColor(app.defaultFreeColor);
    setThickness(app.defaultFreeThicknessM);
    setOpacity(app.defaultFreeOpacity);
    setStyle(app.defaultFreeLineStyle);
    setGap(app.defaultFreeGapM);
    setHasRuler(!!app.scene.rulerGuide);
  }, [app]);

  if (!app) return null;

  const apply = (fn: () => void) => { fn(); };

  const toggleRuler = () => {
    if (!app) return;
    if (app.scene.rulerGuide) {
      app.scene.rulerGuide = null;
      setHasRuler(false);
    } else {
      // Platziere standardmäßig horizontal in Bildschirmmitte
      const rect = app.canvas.getBoundingClientRect();
      const left = app.camera.screenToWorld(rect.width * 0.2, rect.height * 0.5);
      const right = app.camera.screenToWorld(rect.width * 0.8, rect.height * 0.5);
      app.scene.rulerGuide = { a: { x: left.x, y: left.y }, b: { x: right.x, y: right.y } };
      setHasRuler(true);
    }
  };

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Freihand</div>
      <div className="space-y-3">
        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Farbe</span>
          <input type="color" value={color}
            onChange={(e) => apply(() => { setColor(e.target.value); app.defaultFreeColor = e.target.value; })}
            className="w-full h-8 rounded border" />
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Linienart</span>
          <select value={style}
            onChange={(e) => { const v = e.target.value as LineStyle; setStyle(v); app.defaultFreeLineStyle = v; }}
            className="w-full h-8 rounded border bg-background px-2 text-xs">
            {STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Dicke (m): {thickness.toFixed(3)}</span>
          <input type="range" min={0.005} max={0.5} step={0.005} value={thickness}
            onChange={(e) => { const v = parseFloat(e.target.value); setThickness(v); app.defaultFreeThicknessM = v; }}
            className="w-full" />
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Transparenz: {Math.round(opacity * 100)}%</span>
          <input type="range" min={0.05} max={1} step={0.05} value={opacity}
            onChange={(e) => { const v = parseFloat(e.target.value); setOpacity(v); app.defaultFreeOpacity = v; }}
            className="w-full" />
        </label>

        {(style === "dashed" || style === "dotted" || style === "dashdot" || style === "blob") && (
          <label className="block text-xs">
            <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{style === "blob" ? "Abstand (m)" : "Lücke (m)"}: {gap.toFixed(3)}</span>
            <input type="range" min={0.01} max={0.5} step={0.005} value={gap}
              onChange={(e) => { const v = parseFloat(e.target.value); setGap(v); app.defaultFreeGapM = v; }}
              className="w-full" />
          </label>
        )}

        <button type="button" onClick={toggleRuler}
          className="cad-toolbar-btn w-full justify-center h-9">
          <span className="text-xs">{hasRuler ? "Lineal entfernen" : "Lineal hinzufügen"}</span>
        </button>

        <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
          Maus gedrückt halten → zeichnen. Lineal: Stift folgt der Linie.
        </div>
      </div>
    </div>
  );
};
