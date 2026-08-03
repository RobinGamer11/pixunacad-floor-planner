import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import { resetDocMask } from "@/cad/documentMask";

interface Props { app: CadApp | MiniCad | null; }

/** Nichtlineare Größen-Skala: 0.2 mm … 80 mm (Mitte) … 200 mm. */
const R_MIN = 0.0002, R_MID = 0.08, R_MAX = 0.2;
const sliderToRadius = (t: number) =>
  t <= 0.5 ? R_MIN * Math.pow(R_MID / R_MIN, t / 0.5) : R_MID * Math.pow(R_MAX / R_MID, (t - 0.5) / 0.5);
const radiusToSlider = (r: number) => {
  const v = Math.max(R_MIN, Math.min(R_MAX, r));
  return v <= R_MID
    ? 0.5 * (Math.log(v / R_MIN) / Math.log(R_MID / R_MIN))
    : 0.5 + 0.5 * (Math.log(v / R_MID) / Math.log(R_MAX / R_MID));
};


export const EraserSettingsPanel: React.FC<Props> = ({ app }) => {
  const [radius, setRadius] = useState(0.03);
  const [strength, setStrength] = useState(1);
  const [mode, setMode] = useState<"hard" | "smooth">("hard");
  const [softness, setSoftness] = useState(0.5);
  const [hasRuler, setHasRuler] = useState(false);

  useEffect(() => {
    if (!app) return;
    setRadius(app.defaultEraserRadiusM);
    setStrength(app.defaultEraserStrength);
    setMode(app.defaultEraserMode ?? "hard");
    setSoftness(app.defaultEraserSoftness ?? 0.5);
    setHasRuler(!!app.scene.rulerGuide);
  }, [app]);

  if (!app) return null;

  const toggleRuler = () => {
    if (!app) return;
    if (app.scene.rulerGuide) {
      app.scene.rulerGuide = null;
      setHasRuler(false);
    } else {
      const rect = app.canvas.getBoundingClientRect();
      const left = app.camera.screenToWorld(rect.width * 0.2, rect.height * 0.5);
      const right = app.camera.screenToWorld(rect.width * 0.8, rect.height * 0.5);
      app.scene.rulerGuide = { a: { x: left.x, y: left.y }, b: { x: right.x, y: right.y } };
      setHasRuler(true);
    }
  };

  const resetSelected = () => {
    const sel = app.selection;
    if (sel && sel.type === "document" && (sel as any).documentId) {
      const doc = app.scene.getDocumentById((sel as any).documentId);
      if (doc) { resetDocMask(doc); return; }
    }
    if (!confirm("Keine Dokument-Auswahl. Radierung ALLER Dokumente in dieser Szene zurücksetzen?")) return;
    for (const d of app.scene.documents) resetDocMask(d);
  };

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Radiergummi</div>
      <div className="space-y-3">
        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
            Größe: {(radius * 1000).toFixed(radius * 1000 < 1 ? 2 : radius * 1000 < 10 ? 1 : 0)} mm
          </span>
          <input type="range" min={0} max={1} step={0.001} value={radiusToSlider(radius)}
            onChange={(e) => { const v = sliderToRadius(parseFloat(e.target.value)); setRadius(v); app.defaultEraserRadiusM = v; }}
            className="w-full" />
        </label>


        <div className="text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Modus</span>
          <div className="grid grid-cols-2 gap-1">
            {(["hard", "smooth"] as const).map((m) => (
              <button key={m} type="button"
                onClick={() => { setMode(m); app.defaultEraserMode = m; }}
                className="cad-toolbar-btn justify-center h-8"
                style={mode === m ? { background: "hsl(var(--cad-accent) / 0.18)", borderColor: "hsl(var(--cad-accent))" } : undefined}>
                <span className="text-xs">{m === "hard" ? "Hart" : "Smooth"}</span>
              </button>
            ))}
          </div>
        </div>

        {mode === "smooth" && (
          <label className="block text-xs">
            <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Weichheit: {Math.round(softness * 100)}%</span>
            <input type="range" min={0.05} max={0.95} step={0.05} value={softness}
              onChange={(e) => { const v = parseFloat(e.target.value); setSoftness(v); app.defaultEraserSoftness = v; }}
              className="w-full" />
          </label>
        )}

        <label className="block text-xs">
          <span className="block mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Stärke: {Math.round(strength * 100)}%</span>
          <input type="range" min={0.1} max={1} step={0.05} value={strength}
            onChange={(e) => { const v = parseFloat(e.target.value); setStrength(v); app.defaultEraserStrength = v; }}
            className="w-full" />
        </label>

        <button type="button" onClick={toggleRuler}
          className="cad-toolbar-btn w-full justify-center h-9">
          <span className="text-xs">{hasRuler ? "Lineal entfernen" : "Lineal hinzufügen"}</span>
        </button>

        <button type="button" onClick={resetSelected}
          className="cad-toolbar-btn w-full justify-center h-9">
          <span className="text-xs">Radierung zurücksetzen</span>
        </button>

        <div className="text-[11px] leading-relaxed pt-2" style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
          Maus gedrückt halten → radieren. Lineal an Endpunkten oder Mitte verschiebbar.
        </div>
      </div>
    </div>
  );
};
