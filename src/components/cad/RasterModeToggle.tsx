import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import { projectStore } from "@/lib/projectStore";

interface Props {
  app: CadApp | MiniCad | null | undefined;
  projectId?: string;
}

/**
 * Umschalter Vektor / Pixel für Linien-, Freihand-, Text- und Schraffur-Werkzeug.
 * Pixel = Objekt wird beim Fertigstellen zu einem Bild gerastert.
 */
export const RasterModeToggle: React.FC<Props> = ({ app, projectId }) => {
  const [mode, setMode] = useState<"vector" | "pixel">("vector");
  const projectSettings = projectId
    ? projectStore.getState().projects.find((project) => project.id === projectId)?.settings
    : undefined;
  const [dpi, setDpi] = useState(() => projectSettings?.pixelRenderDpi ?? 1200);
  const [supersampling, setSupersampling] = useState(() => projectSettings?.pixelSupersampling ?? false);
  const [supersamplingFactor, setSupersamplingFactor] = useState<2 | 4>(() => projectSettings?.pixelSupersamplingFactor ?? 2);

  useEffect(() => {
    if (!app) return;
    setMode((app as any).defaultDrawRasterMode === "pixel" ? "pixel" : "vector");
    const settings = projectId
      ? projectStore.getState().projects.find((project) => project.id === projectId)?.settings
      : undefined;
    const nextDpi = settings?.pixelRenderDpi ?? 1200;
    const nextSs = settings?.pixelSupersampling ?? false;
    const nextFactor = settings?.pixelSupersamplingFactor ?? 2;
    (app as any).pixelRenderDpi = nextDpi;
    (app as any).pixelSupersampling = nextSs;
    (app as any).pixelSupersamplingFactor = nextFactor;
    setDpi(nextDpi);
    setSupersampling(nextSs);
    setSupersamplingFactor(nextFactor);
  }, [app, projectId]);

  const saveQuality = (patch: { dpi?: number; supersampling?: boolean; factor?: 2 | 4 }) => {
    const nextDpi = patch.dpi ?? dpi;
    const nextSs = patch.supersampling ?? supersampling;
    const nextFactor = patch.factor ?? supersamplingFactor;
    if (app) {
      (app as any).pixelRenderDpi = nextDpi;
      (app as any).pixelSupersampling = nextSs;
      (app as any).pixelSupersamplingFactor = nextFactor;
    }
    if (projectId) {
      projectStore.updateProjectSettings(projectId, {
        pixelRenderDpi: nextDpi,
        pixelSupersampling: nextSs,
        pixelSupersamplingFactor: nextFactor,
      });
    }
  };

  const applyDpi = (raw: number) => {
    const next = Math.round(Math.max(600, Math.min(2400, raw || 600)) / 50) * 50;
    setDpi(next);
    saveQuality({ dpi: next });
  };

  const apply = (next: "vector" | "pixel") => {
    if (app) (app as any).defaultDrawRasterMode = next;
    setMode(next);
  };

  const btn = (value: "vector" | "pixel", label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => apply(value)}
      className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] ${mode === value ? "active" : ""}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mb-2">
      <label className="block mb-1.5 text-[11px]">Objektart</label>
      <div className="flex gap-1">
        {btn("vector", "Vektor")}
        {btn("pixel", "Pixel")}
      </div>
      <div className="text-[10px] leading-tight mt-1.5" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        {mode === "pixel"
          ? "Pixel: Das fertige Objekt wird als Bild abgelegt — Radiergummi (auch Smooth) funktioniert wie bei PNGs, aber Punkte/Text/Muster sind danach nicht mehr editierbar."
          : "Vektor: Objekt bleibt jederzeit editierbar (Punkte, Text, Muster)."}
      </div>
      {mode === "pixel" && (
        <div className="mt-2 pt-2 space-y-2 border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="text-[11px]">Render-Qualität</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={600}
                  max={2400}
                  step={50}
                  value={dpi}
                  onChange={(event) => setDpi(Number(event.target.value))}
                  onBlur={() => applyDpi(dpi)}
                  onKeyDown={(event) => { if (event.key === "Enter") applyDpi(dpi); }}
                  className="w-16 h-7 px-1 text-right text-[11px] rounded border bg-transparent"
                  style={{ borderColor: "hsl(var(--hairline))" }}
                />
                <span className="text-[10px]">DPI</span>
              </div>
            </div>
            <input
              type="range"
              min={600}
              max={2400}
              step={50}
              value={Math.max(600, Math.min(2400, dpi || 600))}
              onChange={(event) => applyDpi(Number(event.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={supersampling}
                onChange={(event) => {
                  const next = event.target.checked;
                  setSupersampling(next);
                  saveQuality({ supersampling: next });
                }}
              />
              Supersampling
            </label>
            <select
              value={supersamplingFactor}
              disabled={!supersampling}
              onChange={(event) => {
                const next = Number(event.target.value) === 4 ? 4 : 2;
                setSupersamplingFactor(next);
                saveQuality({ factor: next });
              }}
              className="h-7 px-1 text-[11px] rounded border bg-transparent disabled:opacity-40"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </div>
          <div className="text-[10px] leading-tight" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
            Gilt projektweit für neu erzeugte Pixelobjekte. Höhere Werte benötigen mehr Speicher.
          </div>
        </div>
      )}
    </div>
  );
};
