import React, { useEffect, useState } from "react";
import {
  DEFAULT_ROUGHEN, DEFAULT_STROKE_PATTERN,
  type RoughenParams, type StrokePatternKind, type StrokePatternParams,
} from "@/cad/strokeEffects";

const HAIRLINE = "hsl(var(--hairline))";

export type StrokeEffectKind = "line" | "polygon" | "hatch" | "free";

const PATTERNS: { value: StrokePatternKind; label: string }[] = [
  { value: "solid", label: "Durchgezogen" },
  { value: "dashed", label: "Gestrichelt" },
  { value: "dash-dot", label: "Strich-Punkt" },
  { value: "dotted", label: "Gepunktet" },
];

/** Alle aktuell ausgewählten Objekte der jeweiligen Art. */
function selectedTargets(app: any, kind: StrokeEffectKind): any[] {
  if (!app) return [];
  const sels: any[] = Array.isArray(app.selections) && app.selections.length
    ? app.selections
    : (app.selection ? [app.selection] : []);
  const out: any[] = [];
  for (const s of sels) {
    if (kind === "line" && s?.segmentId) {
      const o = app.scene?.getSegmentById?.(s.segmentId);
      if (o) out.push(o);
    } else if ((kind === "polygon" || kind === "hatch") && s?.hatchId) {
      const o = app.scene?.getHatchById?.(s.hatchId);
      if (o && (o.isPolygon === true) === (kind === "polygon")) out.push(o);
    } else if (kind === "free") {
      // Je nach Auswahlquelle heißt das Feld `freeId` (Klick) oder
      // `freeStrokeId` (Rahmenauswahl/Edit-Target) — beide akzeptieren.
      const id = s?.freeId || s?.freeStrokeId;
      const o = id ? app.scene?.getFreeStrokeById?.(id) : null;
      if (o) out.push(o);
    }

  }
  return out;
}

const NumField: React.FC<{
  label: string; unit: string; value: number; step?: number; min?: number; max?: number;
  onChange: (v: number) => void;
}> = ({ label, unit, value, step = 0.1, min = 0, max = 999, onChange }) => (
  <label className="min-w-0">
    <span className="mb-1 block whitespace-nowrap text-[9px] leading-tight text-muted-foreground">{label}</span>
    <span className="flex h-8 items-center overflow-hidden rounded-md border" style={{ borderColor: HAIRLINE }}>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        step={step} min={min} max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-[11px] tabular-nums outline-none"
      />
      <span className="pr-2 text-[9px] text-muted-foreground">{unit}</span>
    </span>
  </label>
);

/**
 * Gemeinsame Kontur-Effekte (Linienart + nicht-destruktives „Aufrauen“) für
 * Linien-, Polygon-, Schraffur- und Freihandwerkzeug. Ohne Auswahl werden die
 * Werkzeug-Standardwerte bearbeitet, mit Auswahl alle markierten Objekte.
 */
export const StrokeEffectsSettings: React.FC<{ app: any; kind: StrokeEffectKind }> = ({ app, kind }) => {
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(rerender, 300);
    return () => window.clearInterval(t);
  }, [app]);

  const targets = selectedTargets(app, kind);
  const defaults = app?.getStrokeEffectDefaults?.(kind);
  const pattern: StrokePatternParams =
    targets[0]?.strokePattern ?? defaults?.strokePattern ?? DEFAULT_STROKE_PATTERN;
  const roughen: RoughenParams = targets[0]?.roughen ?? defaults?.roughen ?? DEFAULT_ROUGHEN;

  const commit = () => {
    app?.renderer?.render?.();
    app?.requestRender?.();
    if (app && "_changeDirty" in app) app._changeDirty = true;
    rerender();
  };

  const applyPattern = (patch: Partial<StrokePatternParams>) => {
    if (!app) return;
    if (targets.length === 0) {
      const d = app.strokeEffectDefaults?.[kind];
      if (d) d.strokePattern = { ...d.strokePattern, ...patch };
    } else {
      for (const o of targets) o.strokePattern = { ...(o.strokePattern || DEFAULT_STROKE_PATTERN), ...patch };
    }
    commit();
  };

  const applyRoughen = (patch: Partial<RoughenParams>) => {
    if (!app) return;
    if (targets.length === 0) {
      const d = app.strokeEffectDefaults?.[kind];
      if (d) d.roughen = { ...d.roughen, ...patch };
    } else {
      for (const o of targets) o.roughen = { ...(o.roughen || DEFAULT_ROUGHEN), ...patch };
    }
    commit();
  };

  return (
    <div className="space-y-3 border-t pt-2" style={{ borderColor: HAIRLINE }}>
      <div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">LINIENART</div>
        <div className="grid grid-cols-2 gap-1">
          {PATTERNS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => applyPattern({ kind: p.value })}
              className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                pattern.kind === p.value ? "bg-accent" : "hover:bg-muted"
              }`}
              style={{ borderColor: HAIRLINE }}
            >
              {p.label}
            </button>
          ))}
        </div>
        {pattern.kind !== "solid" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <NumField
              label="Strichlänge" unit="mm" value={pattern.dashLengthMm} step={0.5} min={0.1} max={200}
              onChange={(v) => applyPattern({ dashLengthMm: v })}
            />
            <NumField
              label="Abstand" unit="mm" value={pattern.gapLengthMm} step={0.5} min={0.1} max={200}
              onChange={(v) => applyPattern({ gapLengthMm: v })}
            />
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground">AUFRAUEN</span>
          <button
            type="button"
            onClick={() => applyRoughen({ enabled: !roughen.enabled })}
            className="h-6 rounded-md border px-2 text-[10px]"
            style={{ borderColor: HAIRLINE, background: roughen.enabled ? "hsl(var(--surface-strong))" : "transparent" }}
          >
            {roughen.enabled ? "Ein" : "Aus"}
          </button>
        </div>
        {roughen.enabled && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <NumField
                label="Stärke" unit="mm" value={roughen.strengthMm} step={0.1} min={0} max={50}
                onChange={(v) => applyRoughen({ strengthMm: v })}
              />
              <NumField
                label="Detail" unit="je 100 mm" value={roughen.detailPer100Mm} step={1} min={1} max={100}
                onChange={(v) => applyRoughen({ detailPer100Mm: v })}
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(["smooth", "corner"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => applyRoughen({ mode: m })}
                  className={`rounded border px-2 py-1 text-[10px] ${roughen.mode === m ? "bg-accent" : "hover:bg-muted"}`}
                  style={{ borderColor: HAIRLINE }}
                >
                  {m === "smooth" ? "Weich" : "Eckig"}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Nicht-destruktiv: Die Originalgeometrie und alle Fangpunkte bleiben unverändert.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StrokeEffectsSettings;
