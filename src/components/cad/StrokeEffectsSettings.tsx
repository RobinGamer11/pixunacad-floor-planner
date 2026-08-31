import React, { useEffect, useState } from "react";
import {
  DEFAULT_ROUGHEN, DEFAULT_STROKE_PATTERN,
  type RoughenParams, type StrokePatternKind, type StrokePatternParams,
} from "@/cad/strokeEffects";
import {
  BRUSH_PRESETS, brushPresetInfo, renderBrushPreview,
  type BrushPresetId,
} from "@/cad/brushStrokes";
import { applyBrushSizeDefaults } from "@/cad/brushSizeDefaults";

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

/**
 * Regler + frei beschreibbares Zahlenfeld, beide synchron. Während einer
 * zusammenhängenden Reglerbewegung wird die Historie ausgesetzt, damit nur ein
 * einziger Undo-Schritt entsteht.
 */
const SliderField: React.FC<{
  label: string; unit: string; value: number; step?: number; min: number; max: number;
  onChange: (v: number) => void; onDragStart?: () => void; onDragEnd?: () => void;
}> = ({ label, unit, value, step = 0.1, min, max, onChange, onDragStart, onDragEnd }) => {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="whitespace-nowrap text-[9px] leading-tight text-muted-foreground">{label}</span>
        <span className="flex h-6 items-center overflow-hidden rounded-md border" style={{ borderColor: HAIRLINE }}>
          <input
            type="number"
            value={Number(value.toFixed(3))}
            step={step} min={min} max={max}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(clamp(n));
            }}
            className="h-full w-14 min-w-0 bg-transparent px-1 text-right text-[11px] tabular-nums outline-none"
          />
          <span className="pr-1 text-[9px] text-muted-foreground">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        value={value}
        step={step} min={min} max={max}
        onPointerDown={onDragStart}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-1.5 w-full cursor-pointer accent-foreground"
      />
    </label>
  );
};


/** Stift-Button mit gerenderter Strichvorschau (echter Pinsel-Algorithmus). */
const BrushButton: React.FC<{
  id: BrushPresetId; label: string; active: boolean; onClick: () => void;
  character?: number; opacity?: number;
}> = ({ id, label, active, onClick, character, opacity }) => {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const color = getComputedStyle(cv).color || "#111111";
    try { renderBrushPreview(cv, id, color, character, opacity); } catch { /* noop */ }
  }, [id, active, character, opacity]);
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex flex-col items-stretch gap-1 rounded border px-1.5 py-1 text-[9px] leading-tight transition-colors ${
        active ? "bg-accent" : "hover:bg-muted"
      }`}
      style={{ borderColor: HAIRLINE }}
    >
      <canvas ref={ref} className="h-4 w-full text-foreground" />
      <span className="truncate text-muted-foreground">{label}</span>
    </button>
  );
};

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
      for (const o of targets) {
        const next: StrokePatternParams = { ...(o.strokePattern || DEFAULT_STROKE_PATTERN), ...patch };
        // Seed dauerhaft am Objekt verankern — Darstellung bleibt stabil.
        if (next.brushPreset && !next.brushSeed) {
          next.brushSeed = (typeof o.appearanceSeed === "number" && o.appearanceSeed > 0) ? o.appearanceSeed : 1;
        }
        o.strokePattern = next;
      }
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

  // Zusammenhängende Reglerbewegung = genau ein Undo-Schritt.
  const dragStart = () => { if (app) (app as any).suspendHistory = true; };
  const dragEnd = () => {
    if (!app) return;
    (app as any).suspendHistory = false;
    try { (app as any).commitHistorySnapshot?.(); } catch { /* noop */ }
    commit();
  };

  // Strich-/Abstandsregler: Freihand arbeitet in der Projektmappe (eingebetteter
  // MiniCad) mit deutlich feineren Werten; in der CAD-Oberfläche bleibt der
  // volle Bereich wie bei Linie/Polygon/Schraffur.
  const isEmbedded = !!(app && (app as any).isEmbeddedMiniCad);
  const fineFree = kind === "free" && isEmbedded;
  const dashMax = fineFree ? 20 : 200;
  const dashStep = fineFree ? 0.1 : 0.5;

  const activeBrush = pattern.kind === "brush" ? (pattern.brushPreset as BrushPresetId | undefined) : undefined;
  const brushInfo = brushPresetInfo(activeBrush);
  const brushCharacter = pattern.brushCharacter ?? brushInfo?.character ?? 50;

  const selectBrush = (id: string) => {
    if (!id) { applyPattern({ kind: "solid" }); return; }
    const info = brushPresetInfo(id);
    applyPattern({
      kind: "brush",
      brushPreset: id as BrushPresetId,
      brushCharacter: pattern.brushPreset === id ? brushCharacter : (info?.character ?? 50),
    });
    // Stift-Standardgrößen: Mappe 400 px, CAD 50 cm, Marker 30 % Deckkraft.
    applyBrushSizeDefaults(app, kind, id, targets);
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
        {pattern.kind !== "solid" && pattern.kind !== "brush" && (
          <div className="mt-2 space-y-2">
            <SliderField
              label="Strichlänge" unit="mm" value={pattern.dashLengthMm} step={dashStep} min={0.1} max={dashMax}
              onChange={(v) => applyPattern({ dashLengthMm: v })}
              onDragStart={dragStart} onDragEnd={dragEnd}
            />
            <SliderField
              label="Abstand" unit="mm" value={pattern.gapLengthMm} step={dashStep} min={0.1} max={dashMax}
              onChange={(v) => applyPattern({ gapLengthMm: v })}
              onDragStart={dragStart} onDragEnd={dragEnd}
            />
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-1">
          {BRUSH_PRESETS.map((b) => (
            <BrushButton
              key={b.id}
              id={b.id}
              label={b.label}
              active={activeBrush === b.id}
              onClick={() => selectBrush(activeBrush === b.id ? "" : b.id)}
              character={activeBrush === b.id ? brushCharacter : undefined}
            />

          ))}
        </div>

        <div className="mt-2">
          {activeBrush && (
            <div className="mt-2 space-y-2">
              <SliderField
                label="Charakter" unit="" value={brushCharacter} step={1} min={0} max={100}
                onChange={(v) => applyPattern({ brushCharacter: v })}
                onDragStart={dragStart} onDragEnd={dragEnd}
              />
              {brushInfo?.usesAngle && (
                <SliderField
                  label="Federwinkel" unit="°" value={pattern.brushAngleDeg ?? 38} step={1} min={-180} max={180}
                  onChange={(v) => applyPattern({ brushAngleDeg: v })}
                  onDragStart={dragStart} onDragEnd={dragEnd}
                />
              )}
              <div className="text-[11px] text-muted-foreground">
                Farbe, Linienstärke und Deckkraft steuern den Stift; die Geometrie bleibt bearbeitbar.
              </div>
            </div>
          )}
        </div>

      </div>


      <div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">AUFRAUEN</div>
        <button
          type="button"
          onClick={() => applyRoughen({ enabled: !roughen.enabled })}
          className="mb-2 flex h-9 w-full items-center justify-center rounded-md border text-[12px] font-medium transition-colors hover:bg-muted"
          style={{ borderColor: HAIRLINE, background: roughen.enabled ? "hsl(var(--surface-strong))" : "transparent" }}
        >
          {roughen.enabled ? "Aufrauen: Ein" : "Aufrauen: Aus"}
        </button>

        {roughen.enabled && (
          <div className="space-y-2">
            <div className="space-y-2">
              <SliderField
                label="Stärke" unit="mm" value={roughen.strengthMm} step={0.1} min={0} max={300}
                onChange={(v) => applyRoughen({ strengthMm: v })}
                onDragStart={dragStart} onDragEnd={dragEnd}
              />
              <SliderField
                label="Detail" unit="je 100 mm" value={roughen.detailPer100Mm} step={1} min={1} max={500}
                onChange={(v) => applyRoughen({ detailPer100Mm: v })}
                onDragStart={dragStart} onDragEnd={dragEnd}
              />
              <SliderField
                label="Skalierung" unit="%" value={roughen.scalePercent ?? 100} step={1} min={10} max={1800}
                onChange={(v) => applyRoughen({ scalePercent: v })}
                onDragStart={dragStart} onDragEnd={dragEnd}
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
