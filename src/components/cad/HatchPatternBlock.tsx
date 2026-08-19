import React, { useEffect, useRef, useState } from "react";
import { Check, Grid2X2, Move, CheckCheck } from "lucide-react";
import { HATCH_PATTERNS } from "@/cad/hatchPatterns";

/** Regler + Zahlenfeld: grob per Slider, fein per Eingabe/Pfeiltasten. */
const SliderRow: React.FC<{
  label: string; min: number; max: number; step: number; decimals: number;
  value: number; disabled?: boolean; onChange: (v: number) => void;
}> = ({ label, min, max, step, decimals, value, disabled, onChange }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className={`flex items-center justify-between gap-2 ${disabled ? "opacity-50" : ""}`}>
      <span className="w-24 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        className="pixuna-range h-4 min-w-0 flex-1 cursor-pointer"
      />
      <input
        type="number" min={min} max={max} step={step} disabled={disabled}
        value={Number(value.toFixed(decimals))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(clamp(v));
        }}
        className="w-14 shrink-0 rounded border bg-transparent px-1 py-0.5 text-right text-[10px] tabular-nums"
        style={{ borderColor: "hsl(var(--hairline, var(--border)))" }}
      />
    </div>
  );
};

interface Props {
  /** CadApp oder MiniCad — beide teilen dieselben Default-Felder. */
  app: any | null;
  /** Basis-Skalierung des Musters für diese Oberfläche (CAD größer als Mappe). */
  scaleMax?: number;
}

/**
 * Gemeinsamer Muster-Block für Schraffuren (CAD + Mappe).
 * Das Auswahlfeld ist immer sichtbar, aber ausgegraut, solange „Muster“
 * nicht aktiviert ist. Zusätzlich lässt sich das Muster innerhalb der
 * Schraffur verschieben (Move-Modus, Bestätigung per Häkchen → Undo/Redo).
 */
export const HatchPatternBlock: React.FC<Props> = ({ app, scaleMax = 20 }) => {
  const [enabled, setEnabled] = useState(false);
  const [patternId, setPatternId] = useState("mauerwerk");
  const [scale, setScale] = useState(1);
  const [stretch, setStretch] = useState(1);
  const [angleDeg, setAngleDeg] = useState(0);
  const [skewDeg, setSkewDeg] = useState(0);
  const [moveMode, setMoveMode] = useState(false);
  const [, force] = useState(0);
  const dragRef = useRef<{ wx: number; wy: number; ox: number; oy: number } | null>(null);

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

  const render = () => { app?.renderer?.render?.(); app?.requestRender?.(); };

  const apply = (mutate: (h: any) => void, def: () => void) => {
    if (!app) return;
    const h = app.getSelectedHatch?.();
    if (h) mutate(h); else def();
    render();
    force((x) => x + 1);
  };

  // ── Muster innerhalb der Schraffur verschieben ────────────────────
  useEffect(() => {
    const canvas: HTMLCanvasElement | undefined = app?.canvas;
    if (!app || !canvas || !moveMode) return;
    const toWorld = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return app.camera?.screenToWorld?.(e.clientX - r.left, e.clientY - r.top);
    };
    const down = (e: PointerEvent) => {
      const h = app.getSelectedHatch?.();
      const w = toWorld(e);
      if (!h || !w) return;
      dragRef.current = { wx: w.x, wy: w.y, ox: h.patternOffsetX ?? 0, oy: h.patternOffsetY ?? 0 };
      e.preventDefault();
      e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      const h = app.getSelectedHatch?.();
      const w = toWorld(e);
      if (!d || !h || !w) return;
      h.patternOffsetX = d.ox + (w.x - d.wx);
      h.patternOffsetY = d.oy + (w.y - d.wy);
      render();
      e.preventDefault();
      e.stopPropagation();
    };
    const up = () => { dragRef.current = null; };
    canvas.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      canvas.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, moveMode]);

  if (!app) return null;
  const hairline = "hsl(var(--hairline, var(--border)))";

  return (
    <div className="space-y-2 rounded border p-2" style={{ borderColor: hairline }}>
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
            borderColor: hairline,
            background: enabled ? "hsl(var(--primary) / 0.16)" : "transparent",
            color: "hsl(var(--primary))",
          }}
        >
          {enabled && <Check size={11} />}
        </span>
        <span className="flex items-center gap-1.5"><Grid2X2 size={13} /> Muster</span>
      </button>

      <select
        value={patternId}
        disabled={!enabled}
        onChange={(e) => {
          const val = e.target.value;
          setPatternId(val);
          apply((h) => { h.patternId = val; }, () => { app.defaultHatchPatternId = val; });
        }}
        className={`w-full rounded border bg-transparent px-1.5 py-1 text-[11px] ${enabled ? "" : "opacity-50"}`}
        style={{ borderColor: hairline }}
      >
        {HATCH_PATTERNS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      <SliderRow
        label="Skalierung" min={0.05} max={scaleMax} step={0.01} decimals={2} value={scale} disabled={!enabled}
        onChange={(val) => { setScale(val); apply((h) => { h.patternScale = val; }, () => { app.defaultHatchPatternScale = val; }); }}
      />
      <SliderRow
        label="Streckung" min={0.1} max={10} step={0.01} decimals={2} value={stretch} disabled={!enabled}
        onChange={(val) => { setStretch(val); apply((h) => { h.patternStretch = val; }, () => { app.defaultHatchPatternStretch = val; }); }}
      />
      <SliderRow
        label="Drehen (°)" min={-180} max={180} step={0.5} decimals={1} value={angleDeg} disabled={!enabled}
        onChange={(val) => { setAngleDeg(val); apply((h) => { h.patternAngleDeg = val; }, () => { app.defaultHatchPatternAngleDeg = val; }); }}
      />
      <SliderRow
        label="Verzerrung (°)" min={-70} max={70} step={0.5} decimals={1} value={skewDeg} disabled={!enabled}
        onChange={(val) => { setSkewDeg(val); apply((h) => { h.patternSkewDeg = val; }, () => { app.defaultHatchPatternSkewDeg = val; }); }}
      />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={!enabled}
          onClick={() => setMoveMode((m) => !m)}
          title="Muster innerhalb der Schraffur verschieben"
          aria-pressed={moveMode}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded border px-2 py-1 text-[10px] transition-colors ${enabled ? "hover:bg-muted" : "opacity-50"}`}
          style={{
            borderColor: hairline,
            background: moveMode ? "hsl(var(--primary) / 0.16)" : "transparent",
            color: moveMode ? "hsl(var(--primary))" : undefined,
          }}
        >
          <Move size={12} /> Muster verschieben
        </button>
        {moveMode && (
          <button
            type="button"
            title="Position übernehmen"
            onClick={() => {
              setMoveMode(false);
              dragRef.current = null;
              app.commitHistorySnapshot?.();
            }}
            className="flex items-center justify-center rounded border px-2 py-1 text-[10px]"
            style={{ borderColor: hairline, background: "hsl(var(--primary) / 0.16)", color: "hsl(var(--primary))" }}
          >
            <CheckCheck size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
