import React, { useEffect, useState } from "react";
import { ToolColorPicker } from "@/components/workspace/ToolColorPicker";
import { guideStrokeMmToPx, guideStrokePxToMm } from "@/lib/guideStrokeWidth";

const HAIRLINE = "hsl(var(--hairline))";

/** Kleine Maßeingabe (Bezeichnung + Zahl + Einheit) — Layout wie beim Linienwerkzeug. */
const MeasureField: React.FC<{
  label: string;
  unit: string;
  value: number;
  digits: number;
  onChange: (v: number) => void;
}> = ({ label, unit, value, digits, onChange }) => {
  const [draft, setDraft] = useState(String(Number(value.toFixed(digits))));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(Number(value.toFixed(digits))));
  }, [value, digits, focused]);
  return (
    <label className="min-w-0">
      <span className="mb-1 block whitespace-nowrap text-[9px] leading-tight text-muted-foreground">{label}</span>
      <span
        className="flex h-8 items-center overflow-hidden rounded-md border"
        style={{ borderColor: HAIRLINE, backgroundColor: "hsl(var(--card))" }}
      >
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value.trim().replace(",", "."));
            if (Number.isFinite(n) && n >= 0) onChange(n);
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-[11px] tabular-nums outline-none"
        />
        <span className="pr-2 text-[9px] text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
};

export interface StrokeSettingsValue {
  color: string;
  /** Physische Strichstärke in Metern — die EINE gespeicherte Größe. */
  thicknessM: number;
  /** Transparenz-/Deckkraftregler in Prozent (1..100), Semantik wie beim Linienwerkzeug. */
  alphaPct: number;
}

/**
 * Gemeinsame Kontur-Eigenschaften (Farbe, Strichstärke, Transparenz) für
 * Linien- und Polygonwerkzeug. Beide Werkzeuge bearbeiten damit denselben
 * physischen Wert `thicknessM` und benutzen dieselben Beschriftungen,
 * Umrechnungen und Layouts.
 */
export const StrokeSettingsPanel: React.FC<{
  title: string;
  value: StrokeSettingsValue;
  onChange: (patch: Partial<StrokeSettingsValue>) => void;
  /** "screen" = Projektmappe (Bildschirm px + mm), "drawing" = CAD (Zeichnung cm + mm). */
  variant?: "screen" | "drawing";
  /** Bildschirm-Pixel pro Papiermillimeter (nur Variante "screen"). */
  pxPerMm?: number;
  colorLabel?: string;
  children?: React.ReactNode;
}> = ({ title, value, onChange, variant = "screen", pxPerMm = 1, colorLabel = "Farbe", children }) => {
  const mm = value.thicknessM * 1000;
  const alpha = Math.min(100, Math.max(1, Math.round(value.alphaPct)));

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold tracking-wider mb-2 text-muted-foreground">{title}</div>

      <ToolColorPicker label={colorLabel} value={value.color} onChange={(v) => onChange({ color: v })} />

      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Strichstärke</div>
        <div className="grid grid-cols-2 gap-2">
          {variant === "drawing" ? (
            <MeasureField
              label="Zeichnung"
              unit="cm"
              digits={2}
              value={value.thicknessM * 100}
              onChange={(cm) => onChange({ thicknessM: Math.max(0.0002, cm / 100) })}
            />
          ) : (
            <MeasureField
              label="Bildschirm"
              unit="px"
              digits={2}
              value={guideStrokeMmToPx(mm, pxPerMm)}
              onChange={(px) => onChange({ thicknessM: Math.max(0.0002, guideStrokePxToMm(px, pxPerMm) / 1000) })}
            />
          )}
          <MeasureField
            label="Tatsächliche Größe"
            unit="mm"
            digits={3}
            value={mm}
            onChange={(v) => onChange({ thicknessM: Math.max(0.0002, v / 1000) })}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Transparenz</div>
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={alpha}
          onChange={(e) => onChange({ alphaPct: Number(e.target.value) })}
          className="pixuna-range w-full accent-foreground"
        />
        <label className="mt-1 flex h-7 items-center overflow-hidden rounded-md border" style={{ borderColor: HAIRLINE }}>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={alpha}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange({ alphaPct: Math.min(100, Math.max(1, Math.round(v))) });
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-xs tabular-nums outline-none"
            aria-label="Transparenz in Prozent"
          />
          <span className="pr-2 text-[10px] text-muted-foreground">%</span>
        </label>
      </div>

      {children}
    </div>
  );
};

export default StrokeSettingsPanel;
