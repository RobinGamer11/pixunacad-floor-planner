import React, { useEffect, useState } from "react";
import { Check, Grid2X2 } from "lucide-react";
import { HATCH_PATTERNS } from "@/cad/hatchPatterns";

/** Regler + Zahlenfeld: grob per Slider, fein per Eingabe/Pfeiltasten. */
const SliderRow: React.FC<{
  label: string; min: number; max: number; step: number; decimals: number;
  value: number; onChange: (v: number) => void;
}> = ({ label, min, max, step, decimals, value, onChange }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="w-16 shrink-0 text-[10px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        className="h-4 min-w-0 flex-1 cursor-pointer accent-[hsl(var(--accent-gold))]"
      />
      <input
        type="number" min={min} max={max} step={step}
        value={Number(value.toFixed(decimals))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(clamp(v));
        }}
        className="w-12 shrink-0 rounded border bg-transparent px-1 py-0.5 text-right text-[10px] tabular-nums"
        style={{ borderColor: "hsl(var(--border))" }}
      />
    </div>
  );
};

interface Props {
  /** CadApp oder MiniCad — beide teilen dieselben Default-Felder. */
  app: any | null;
}

/**
 * Mustereinstellungen für Schraffuren (Muster an/aus, Typ, Skalierung,
 * Streckung, Drehung, Verzerrung). Wirkt auf die aktuell ausgewählte
 * Schraffur — oder sonst auf die Werkzeug-Defaults.
 */
export const HatchPatternControls: React.FC<Props> = ({ app }) => {
  const [enabled, setEnabled] = useState(false);
  const [patternId, setPatternId] = useState("mauerwerk");
  const [scale, setScale] = useState(1);
  const [stretch, setStretch] = useState(1);
  const [angleDeg, setAngleDeg] = useState(0);
  const [skewDeg, setSkewDeg] = useState(0);
  const [, force] = useState(0);

  const sync = () => {
    if (!app) return;
    const sel: any = app.getSelectedHatch?.();
    const src = sel || {
      patternEnabled: app.defaultHatchPatternEnabled,
      patternId: app.defaultHatchPatternId,
      patternScale: app.defaultHatchPatternScale,
      patternStretch: app.defaultHatchPatternStretch,
      patternAngleDeg: app.defaultHatchPatternAngleDeg,
      patternSkewDeg: app.defaultHatchPatternSkewDeg,
    };
    setEnabled(!!src.patternEnabled);
    setPatternId(src.patternId || "mauerwerk");
    setScale(src.patternScale ?? 2);
    setStretch(src.patternStretch ?? 1);
    setAngleDeg(src.patternAngleDeg ?? 0);
    setSkewDeg(src.patternSkewDeg ?? 0);
  };

  useEffect(() => {
    if (!app) return;
    sync();
    const prevSel = app.onSelectionChange;
    app.onSelectionChange = () => { prevSel?.(); sync(); force((x) => x + 1); };
    return () => { app.onSelectionChange = prevSel; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  const apply = (mutate: (h: any) => void, def: () => void) => {
    if (!app) return;
    const h = app.getSelectedHatch?.();
    if (h) mutate(h); else def();
    app.renderer?.render?.();
    app.requestRender?.();
    force((x) => x + 1);
  };

  if (!app) return null;

  return (
    <div className="space-y-2 rounded border p-2" style={{ borderColor: "hsl(var(--border))" }}>
      <button
        type="button"
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          apply((h) => { h.patternEnabled = next; }, () => { app.defaultHatchPatternEnabled = next; });
        }}
        className="flex w-full items-center gap-2 text-[11px]"
        aria-pressed={enabled}
      >
        <span
          className="flex h-4 w-4 items-center justify-center rounded border"
          style={{
            borderColor: "hsl(var(--border))",
            background: enabled ? "hsl(var(--accent-gold-soft))" : "transparent",
            color: "hsl(var(--accent-gold))",
          }}
        >
          {enabled && <Check size={11} />}
        </span>
        <span className="flex items-center gap-1.5"><Grid2X2 size={13} /> Muster</span>
      </button>

      {enabled && (
        <div className="space-y-2">
          <select
            value={patternId}
            onChange={(e) => {
              const val = e.target.value;
              setPatternId(val);
              apply((h) => { h.patternId = val; }, () => { app.defaultHatchPatternId = val; });
            }}
            className="cad-settings-select w-full"
          >
            {HATCH_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          <SliderRow
            label="Skalierung" min={0.05} max={20} step={0.01} decimals={2} value={scale}
            onChange={(val) => {
              setScale(val);
              apply((h) => { h.patternScale = val; }, () => { app.defaultHatchPatternScale = val; });
            }}
          />
          <SliderRow
            label="Länge (Streckung)" min={0.1} max={10} step={0.01} decimals={2} value={stretch}
            onChange={(val) => {
              setStretch(val);
              apply((h) => { h.patternStretch = val; }, () => { app.defaultHatchPatternStretch = val; });
            }}
          />
          <SliderRow
            label="Drehung (°)" min={-180} max={180} step={0.5} decimals={1} value={angleDeg}
            onChange={(val) => {
              setAngleDeg(val);
              apply((h) => { h.patternAngleDeg = val; }, () => { app.defaultHatchPatternAngleDeg = val; });
            }}
          />
          <SliderRow
            label="Verzerrung (°)" min={-70} max={70} step={0.5} decimals={1} value={skewDeg}
            onChange={(val) => {
              setSkewDeg(val);
              apply((h) => { h.patternSkewDeg = val; }, () => { app.defaultHatchPatternSkewDeg = val; });
            }}
          />
        </div>
      )}
    </div>
  );
};
