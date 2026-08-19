import React, { useEffect, useState } from "react";
import { Eraser, Feather } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";

interface Props {
  app: CadApp | MiniCad | null;
  /** "cad" = große Dimensionierung (Mitte 5 m, max 25 m) mit Prozentanzeige. */
  variant?: "cad" | "workspace";
  /** Optional: true, wenn das aktuell gewählte Objekt ein Rasterbild (PNG/JPG) ist. */
  rasterSelection?: boolean | null;
}

/** Nichtlineare Größen-Skala. Projektmappe: 0,2 mm … 80 mm (Mitte) … 200 mm. */
const R_MIN = 0.0002, R_MID = 0.08, R_MAX = 0.2;
/** CAD-Blatt: 5 mm … 5 m (Mitte) … 25 m. */
const CAD_R_MIN = 0.005, CAD_R_MID = 5, CAD_R_MAX = 25;

const makeScale = (min: number, mid: number, max: number) => ({
  toRadius: (t: number) =>
    t <= 0.5 ? min * Math.pow(mid / min, t / 0.5) : mid * Math.pow(max / mid, (t - 0.5) / 0.5),
  toSlider: (r: number) => {
    const v = Math.max(min, Math.min(max, r));
    return v <= mid
      ? 0.5 * (Math.log(v / min) / Math.log(mid / min))
      : 0.5 + 0.5 * (Math.log(v / mid) / Math.log(max / mid));
  },
});

/** Beobachtet, ob die aktuelle Auswahl ein Rasterbild ist (Smooth nur für PNG/JPG). */
function useRasterSelection(app: CadApp | MiniCad | null, override: boolean | null) {
  const [docRaster, setDocRaster] = useState<boolean | null>(null);
  useEffect(() => {
    if (!app) return;
    const check = () => {
      const sel: any = app.selection;
      if (!sel) { setDocRaster(null); return; }
      if (sel.type === "document" && sel.documentId) {
        const doc = app.scene.getDocumentById(sel.documentId);
        setDocRaster(doc ? doc.kind === "image" : null);
      } else {
        setDocRaster(false);
      }
    };
    check();
    const t = window.setInterval(check, 400);
    return () => window.clearInterval(t);
  }, [app]);
  const rasterOk = override !== null ? override : docRaster;
  return rasterOk !== false;
}

/**
 * Modus-Auswahl (Hart / Smooth) — liegt wie bei den anderen Werkzeugen
 * OBERHALB des Einstellungs-Rahmens.
 */
export const EraserModeSelect: React.FC<Props> = ({ app, rasterSelection = null }) => {
  const [mode, setMode] = useState<"hard" | "smooth">("hard");
  const smoothAllowed = useRasterSelection(app, rasterSelection);

  useEffect(() => { if (app) setMode(app.defaultEraserMode ?? "hard"); }, [app]);
  useEffect(() => {
    if (!app) return;
    if (!smoothAllowed && mode === "smooth") { setMode("hard"); app.defaultEraserMode = "hard"; }
  }, [smoothAllowed, mode, app]);

  if (!app) return null;

  const MODES = [
    { id: "hard" as const, label: "Hart", Icon: Eraser },
    { id: "smooth" as const, label: "Smooth", Icon: Feather },
  ];

  return (
    <div className="mb-2">
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1.5">MODUS</div>
      <div className="grid grid-cols-2 gap-1">
        {MODES.map(({ id, label, Icon }) => {
          const disabled = id === "smooth" && !smoothAllowed;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              title={disabled ? "Weicher Modus ist nur für Bilder (PNG/JPG) verfügbar." : label}
              onClick={() => { if (disabled) return; setMode(id); app.defaultEraserMode = id; }}
              className={`flex flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 transition-colors ${
                mode === id && !disabled ? "bg-accent" : "hover:bg-muted"
              }`}
              style={{ borderColor: "hsl(var(--hairline))", ...(disabled ? { opacity: 0.45, cursor: "not-allowed" } : {}) }}
            >
              <Icon size={14} />
              <span className="text-[9px] leading-tight">{label}</span>
            </button>
          );
        })}
      </div>
      {!smoothAllowed && (
        <div className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Weicher Modus ist nur für Bilder (PNG/JPG) verfügbar.
        </div>
      )}
    </div>
  );
};

export const EraserSettingsPanel: React.FC<Props> = ({ app, variant = "workspace", rasterSelection = null }) => {
  const isCad = variant === "cad";
  const scale = isCad ? makeScale(CAD_R_MIN, CAD_R_MID, CAD_R_MAX) : makeScale(R_MIN, R_MID, R_MAX);
  const [radius, setRadius] = useState(isCad ? 0.2 : 0.03);
  const [strength, setStrength] = useState(1);
  const [mode, setMode] = useState<"hard" | "smooth">("hard");
  const [softness, setSoftness] = useState(0.5);
  const [hasRuler, setHasRuler] = useState(false);
  /** Aus dem Schraffur-Werkzeug hierher verschoben: Kanten nach Radieren glätten. */
  const [smoothEdges, setSmoothEdges] = useState(true);
  const smoothAllowed = useRasterSelection(app, rasterSelection);

  useEffect(() => {
    if (!app) return;
    setRadius(app.defaultEraserRadiusM);
    setStrength(app.defaultEraserStrength);
    setMode(app.defaultEraserMode ?? "hard");
    setSoftness(app.defaultEraserSoftness ?? 0.5);
    setHasRuler(!!app.scene.rulerGuide);
    setSmoothEdges((app as any).defaultHatchAutoSmooth !== false);
  }, [app]);

  // Modus-Wechsel aus der Modus-Leiste oberhalb spiegeln.
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => setMode(app.defaultEraserMode ?? "hard"), 300);
    return () => window.clearInterval(t);
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

  const framedBtn = "w-full flex items-center justify-between gap-2 h-9 px-2 rounded-md border text-xs transition-colors hover:bg-muted";
  const framedStyle = { borderColor: "hsl(var(--hairline))" } as React.CSSProperties;

  return (
    <div className="space-y-3 text-xs">
      <label className="block text-xs">
        <span className="block mb-1 text-muted-foreground">
          {isCad
            ? `Größe: ${Math.round(scale.toSlider(radius) * 100)} %`
            : `Größe: ${(radius * 1000).toFixed(radius * 1000 < 1 ? 2 : radius * 1000 < 10 ? 1 : 0)} mm`}
        </span>
        <input type="range" min={0} max={1} step={0.001} value={scale.toSlider(radius)}
          onChange={(e) => { const v = scale.toRadius(parseFloat(e.target.value)); setRadius(v); app.defaultEraserRadiusM = v; }}
          className="w-full" />
      </label>

      <label className="block text-xs">
        <span className="block mb-1 text-muted-foreground">Transparenz: {Math.round(strength * 100)}%</span>
        <input type="range" min={0.1} max={1} step={0.05} value={strength}
          onChange={(e) => { const v = parseFloat(e.target.value); setStrength(v); app.defaultEraserStrength = v; }}
          className="w-full" />
      </label>

      {mode === "smooth" && smoothAllowed && (
        <label className="block text-xs">
          <span className="block mb-1 text-muted-foreground">Weichheit: {Math.round(softness * 100)}%</span>
          <input type="range" min={0.05} max={1} step={0.05} value={softness}
            onChange={(e) => { const v = parseFloat(e.target.value); setSoftness(v); app.defaultEraserSoftness = v; }}
            className="w-full" />
        </label>
      )}

      <button
        type="button"
        onClick={() => { (app as any).defaultHatchAutoSmooth = !((app as any).defaultHatchAutoSmooth !== false); setSmoothEdges((app as any).defaultHatchAutoSmooth !== false); }}
        aria-pressed={smoothEdges}
        className={framedBtn}
        style={framedStyle}
      >
        <span>Kanten glätten</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded border"
          style={{ borderColor: "hsl(var(--hairline))", color: smoothEdges ? "hsl(var(--cad-accent))" : "hsl(var(--muted-foreground))" }}>
          {smoothEdges ? "An" : "Aus"}
        </span>
      </button>

      <button type="button" onClick={toggleRuler} className={`${framedBtn} justify-center`} style={framedStyle}>
        <span>{hasRuler ? "Lineal entfernen" : "Lineal hinzufügen"}</span>
      </button>

      <div className="text-[10px] leading-snug text-muted-foreground">
        Maus gedrückt halten → radieren. Das Lineal lässt sich nur an seinen
        Endpunkten verschieben; an der Linie selbst fängt der Radiergummi für
        ein gerades Radieren.
      </div>
    </div>
  );
};
