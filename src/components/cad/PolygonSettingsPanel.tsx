import React, { useEffect, useState } from "react";
import { Spline, RectangleHorizontal, Circle } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import type { PolygonDrawMode } from "@/cad/PolygonTool";
import { RasterModeToggle } from "@/components/cad/RasterModeToggle";
import { Defaults } from "@/cad/constants";
import { StrokeSettingsPanel } from "@/components/cad/StrokeSettingsPanel";
import { StrokeEffectsSettings } from "@/components/cad/StrokeEffectsSettings";

const HAIRLINE = "hsl(var(--hairline))";

const MODES: { value: PolygonDrawMode; label: string; Icon: React.ElementType }[] = [
  { value: "polygon", label: "Polygon", Icon: Spline },
  { value: "rectangle", label: "Rechteck", Icon: RectangleHorizontal },
  { value: "circle", label: "Kreis", Icon: Circle },
];

type AnyApp = CadApp | MiniCad | null;

/**
 * Alle aktuell ausgewählten Polygonobjekte (Mehrfachauswahl inbegriffen).
 * Berücksichtigt Einzelauswahl, die Mappen-Mehrfachauswahl (`selections`)
 * und die Rahmen-/Shift-Auswahl der Engine (`selectTool.marqueeSelectedIds`).
 * Schraffuren bleiben ausgeschlossen — Polygon ist ein eigener Werkzeugtyp.
 */
function selectedPolygons(app: AnyApp): any[] {
  if (!app) return [];
  const a: any = app;
  const ids: string[] = [];
  const sels: any[] = Array.isArray(a.selections) && a.selections.length
    ? a.selections
    : (a.selection ? [a.selection] : []);
  for (const s of sels) if (s?.hatchId) ids.push(s.hatchId);
  const marquee = a.selectTool?.marqueeSelectedIds as { kind: string; id: string }[] | undefined;
  if (Array.isArray(marquee)) {
    for (const m of marquee) if (m?.kind === "hatch" && m.id) ids.push(m.id);
  }
  const out: any[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const o = a.scene?.getHatchById?.(id);
    if (o && o.isPolygon === true) { seen.add(id); out.push(o); }
  }
  return out;
}


/** Modus-Auswahl — ausschließlich Polygon / Rechteck / Kreis (kein Füllmodus). */
export const PolygonModeSelect: React.FC<{ app: AnyApp }> = ({ app }) => {
  const [mode, setMode] = useState<PolygonDrawMode>("polygon");
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => {
      const m = (app as any).polygonTool?.drawMode as PolygonDrawMode | undefined;
      if (m === "polygon" || m === "rectangle" || m === "circle") setMode(m);
    }, 300);
    return () => window.clearInterval(t);
  }, [app]);
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">MODUS</div>
      <div className="grid grid-cols-3 gap-1">
        {MODES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => { (app as any)?.polygonTool?.setPolygonMode?.(value); setMode(value); }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 transition-colors ${
              mode === value ? "bg-accent" : "hover:bg-muted"
            }`}
            style={{ borderColor: HAIRLINE }}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-[9px] leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Eigenschaften des Polygonwerkzeugs — Aufbau identisch zum Linienwerkzeug
 * (Farbe, Strichstärke, Transparenz) plus Kanten-Fangoptionen. Es gibt bewusst
 * keine Füll-, Muster- oder Flächeneigenschaften.
 */
export const PolygonSettingsPanel: React.FC<{
  app: AnyApp;
  projectId?: string;
  /** true = Modus/Objektart werden außerhalb gerendert. */
  hideChrome?: boolean;
  /** "drawing" = CAD (cm/mm), "screen" = Projektmappe (px/mm). */
  variant?: "screen" | "drawing";
  pxPerMm?: number;
}> = ({ app, projectId, hideChrome, variant = "screen", pxPerMm = 1 }) => {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // Auswahlwechsel/Änderungen aus der Engine übernehmen.
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(rerender, 300);
    return () => window.clearInterval(t);
  }, [app]);

  const sels = selectedPolygons(app);
  const first = sels[0] ?? null;
  const a: any = app;

  const color = first?.strokeColor ?? a?.defaultPolygonColor ?? "#111111";
  const thicknessM = first?.thicknessM ?? a?.defaultPolygonThicknessM ?? 0.01;
  const alphaPct = Math.round(((first?.alpha ?? a?.defaultPolygonAlpha ?? 1) as number) * 100);

  const commit = () => {
    a?.renderer?.render?.();
    a?.requestRender?.();
    if (a && "_changeDirty" in a) a._changeDirty = true;
    rerender();
  };

  const applyStroke = (patch: { color?: string; thicknessM?: number; alphaPct?: number }) => {
    if (!app) return;
    const targets = selectedPolygons(app);
    if (targets.length === 0) {
      if (patch.color !== undefined) a.defaultPolygonColor = patch.color;
      if (patch.thicknessM !== undefined) a.defaultPolygonThicknessM = patch.thicknessM;
      if (patch.alphaPct !== undefined) a.defaultPolygonAlpha = Math.max(0, Math.min(1, patch.alphaPct / 100));
    } else {
      for (const p of targets) {
        if (patch.color !== undefined) p.strokeColor = patch.color;
        if (patch.thicknessM !== undefined) {
          p.thicknessM = patch.thicknessM;
          p.strokeWidthPx = patch.thicknessM * Defaults.strokeWidthBaseScale;
        }
        if (patch.alphaPct !== undefined) p.alpha = Math.max(0, Math.min(1, patch.alphaPct / 100));
      }
    }
    commit();
  };

  const applySnap = (patch: { midpointSnap?: boolean; divisionSnap?: number | null }) => {
    const targets = selectedPolygons(app);
    for (const p of targets) {
      if (patch.midpointSnap !== undefined) p.midpointSnap = !!patch.midpointSnap;
      if (patch.divisionSnap !== undefined) {
        p.divisionSnap = patch.divisionSnap == null || patch.divisionSnap < 2
          ? undefined : Math.floor(patch.divisionSnap);
      }
    }
    commit();
  };

  return (
    <div className="space-y-3">
      {!hideChrome && <PolygonModeSelect app={app} />}
      {!hideChrome && <RasterModeToggle app={app} projectId={projectId} />}

      <StrokeSettingsPanel
        title="POLYGON"
        colorLabel="Konturfarbe"
        variant={variant}
        pxPerMm={pxPerMm}
        value={{ color, thicknessM, alphaPct }}
        onChange={applyStroke}
      />

      <StrokeEffectsSettings app={app} kind="polygon" />

      {first && (
        <div className="space-y-2 border-t pt-2" style={{ borderColor: HAIRLINE }}>
          <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">POLYGON-SNAPS</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Mittelpunkt</span>
            <button
              type="button"
              onClick={() => applySnap({ midpointSnap: !first.midpointSnap })}
              className="h-7 rounded-md border px-2 text-xs"
              style={{
                borderColor: HAIRLINE,
                background: first.midpointSnap ? "hsl(var(--surface-strong))" : "transparent",
              }}
            >
              {first.midpointSnap ? "Ein" : "Aus"}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Teilung (N)</span>
            <input
              type="number"
              min={2}
              max={64}
              step={1}
              value={first.divisionSnap ?? ""}
              placeholder="–"
              onChange={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") { applySnap({ divisionSnap: null }); return; }
                const n = Math.floor(Number(raw));
                if (Number.isFinite(n)) applySnap({ divisionSnap: n >= 2 ? n : null });
              }}
              className="h-7 w-20 rounded border bg-transparent px-2 text-sm tabular-nums"
              style={{ borderColor: HAIRLINE }}
            />
          </div>
          <div className="text-[11px] text-muted-foreground">
            Mittelpunkt und Teilung gelten für jede einzelne Polygonkante.
          </div>
        </div>
      )}
    </div>
  );
};

export default PolygonSettingsPanel;
