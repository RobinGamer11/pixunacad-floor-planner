import React, { useReducer } from "react";
import {
  DEFAULT_DISPLAY_GRADIENT,
  normalizeDisplayGradient,
  type DisplayGradient,
  type DisplayGradientDirection,
} from "@/cad/displayGradient";
import { SettingsToggleButton } from "@/components/cad/SettingsToggleButton";

const HAIRLINE = "hsl(var(--hairline))";

const DIRECTIONS: { value: DisplayGradientDirection; label: string }[] = [
  { value: "left-to-right", label: "Links → Rechts" },
  { value: "right-to-left", label: "Rechts → Links" },
  { value: "top-to-bottom", label: "Oben → Unten" },
  { value: "bottom-to-top", label: "Unten → Oben" },
];

const Row: React.FC<{
  label: string; unit: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; onDragStart?: () => void; onDragEnd?: () => void;
}> = ({ label, unit, value, min, max, step = 1, onChange, onDragStart, onDragEnd }) => (
  <label className="block min-w-0">
    <span className="mb-1 flex items-center justify-between gap-2">
      <span className="whitespace-nowrap text-[9px] leading-tight text-muted-foreground">{label}</span>
      <span className="flex h-6 items-center overflow-hidden rounded-md border" style={{ borderColor: HAIRLINE }}>
        <input
          type="number" value={Number(value.toFixed(2))} min={min} max={max} step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="h-full w-14 min-w-0 bg-transparent px-1 text-right text-[11px] tabular-nums outline-none"
        />
        <span className="pr-1 text-[9px] text-muted-foreground">{unit}</span>
      </span>
    </span>
    <input
      type="range" min={min} max={max} step={step}
      value={Math.min(max, Math.max(min, value))}
      onPointerDown={onDragStart}
      onPointerUp={onDragEnd}
      onChange={(e) => onChange(Number(e.target.value))}
      className="pixuna-range h-4 w-full cursor-pointer"
    />
  </label>
);

interface Props {
  /** Aktuell betroffene Objekte (Schraffuren oder Dokumente). */
  targets: any[];
  /** Wird aufgerufen, wenn keine Auswahl besteht (Vorgabe für neue Objekte). */
  onDefault?: (g: DisplayGradient) => void;
  /** Aktueller Vorgabewert, falls keine Auswahl besteht. */
  defaultValue?: DisplayGradient | undefined;
  /** Neu zeichnen / Panel aktualisieren. */
  commit: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * Transparenzverlauf für bestehende Schraffuren und Dokumente. Setzt nur die
 * optionale Anzeigeeigenschaft `displayGradient`; Geometrie, Kontur, Auswahl
 * und Fangpunkte bleiben unverändert.
 */
export const DisplayGradientSettings: React.FC<Props> = ({
  targets, onDefault, defaultValue, commit, onDragStart, onDragEnd,
}) => {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const current: DisplayGradient =
    normalizeDisplayGradient(targets[0]?.displayGradient ?? defaultValue) ?? { ...DEFAULT_DISPLAY_GRADIENT };

  const patch = (p: Partial<DisplayGradient>) => {
    const next: DisplayGradient = { ...current, ...p };
    if (targets.length) {
      for (const t of targets) t.displayGradient = { ...next };
    } else {
      onDefault?.(next);
    }
    commit();
    force();
  };

  return (
    <div className="space-y-2">
      <SettingsToggleButton
        label="Transparenzverlauf"
        active={current.enabled}
        onLabel="An"
        offLabel="Aus"
        onClick={() => patch({ enabled: !current.enabled })}
      />
      {current.enabled && (
        <div className="space-y-2 rounded-md border p-2" style={{ borderColor: HAIRLINE }}>
          <div className="grid grid-cols-2 gap-2">
            <SettingsToggleButton
              label="Art"
              active={current.type === "linear"}
              onLabel="Linear"
              offLabel="Vignette"
              onClick={() => patch({ type: current.type === "linear" ? "vignette" : "linear" })}
            />
            {current.type === "linear" && (
              <label className="block min-w-0">
                <span className="mb-1 block text-[9px] text-muted-foreground">Richtung</span>
                <select
                  value={current.direction}
                  onChange={(e) => patch({ direction: e.target.value as DisplayGradientDirection })}
                  className="h-8 w-full rounded-md border bg-transparent px-1 text-[11px] outline-none"
                  style={{ borderColor: HAIRLINE }}
                >
                  {DIRECTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
            )}
          </div>

          {current.type === "linear" && (
            <Row label="Drehung" unit="°" min={-180} max={180} value={current.angleDeg}
              onChange={(v) => patch({ angleDeg: v })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
          )}
          <Row label="Beginn" unit="%" min={0} max={100} value={current.startPercent}
            onChange={(v) => patch({ startPercent: v })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
          <Row label="Ende" unit="%" min={0} max={100} value={current.endPercent}
            onChange={(v) => patch({ endPercent: v })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
          <Row label="Endsichtbarkeit" unit="%" min={0} max={100} step={1}
            value={Math.round(current.endOpacity * 100)}
            onChange={(v) => patch({ endOpacity: v / 100 })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
          <Row label="Weichheit" unit="%" min={0} max={100} value={current.softness}
            onChange={(v) => patch({ softness: v })} onDragStart={onDragStart} onDragEnd={onDragEnd} />

          {current.type === "vignette" && (
            <div className="grid grid-cols-2 gap-2">
              <Row label="Mitte X" unit="%" min={0} max={100} value={Math.round(current.centerX * 100)}
                onChange={(v) => patch({ centerX: v / 100 })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              <Row label="Mitte Y" unit="%" min={0} max={100} value={Math.round(current.centerY * 100)}
                onChange={(v) => patch({ centerY: v / 100 })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              <Row label="Breite" unit="%" min={5} max={300} value={Math.round(current.radiusX * 100)}
                onChange={(v) => patch({ radiusX: v / 100 })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              <Row label="Höhe" unit="%" min={5} max={300} value={Math.round(current.radiusY * 100)}
                onChange={(v) => patch({ radiusY: v / 100 })} onDragStart={onDragStart} onDragEnd={onDragEnd} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
