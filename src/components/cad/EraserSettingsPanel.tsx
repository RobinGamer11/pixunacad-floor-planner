import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";

interface Props { app: CadApp | null; }

export const EraserSettingsPanel: React.FC<Props> = ({ app }) => {
  const [radius, setRadius] = useState(0.12);
  const [strength, setStrength] = useState(1);

  useEffect(() => {
    if (!app) return;
    setRadius(app.defaultEraserRadiusM);
    setStrength(app.defaultEraserStrength);
  }, [app]);

  if (!app) return null;

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Radiergummi</div>
      <div className="space-y-3">
        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Größe (m): {radius.toFixed(3)}</span>
          <input type="range" min={0.02} max={1.5} step={0.01} value={radius}
            onChange={(e) => { const v = parseFloat(e.target.value); setRadius(v); app.defaultEraserRadiusM = v; }}
            className="w-full" />
        </label>

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Stärke: {Math.round(strength * 100)}%</span>
          <input type="range" min={0.1} max={1} step={0.05} value={strength}
            onChange={(e) => { const v = parseFloat(e.target.value); setStrength(v); app.defaultEraserStrength = v; }}
            className="w-full" />
        </label>

        <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
          Maus gedrückt halten → radieren. Wirkt auf Freihand-Striche und Linien (splittet sie).
        </div>
      </div>
    </div>
  );
};
