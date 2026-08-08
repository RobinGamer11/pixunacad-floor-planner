import React, { useEffect, useState } from "react";
import { Spline, RectangleHorizontal, Circle, PaintBucket, Waves, Grid2X2, Check } from "lucide-react";
import { HATCH_PATTERNS } from "@/cad/hatchPatterns";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import type { HatchDrawMode } from "@/cad/HatchTool";

const MODES: { value: HatchDrawMode; label: string; Icon: React.ElementType }[] = [
  { value: "polygon", label: "Polygon", Icon: Spline },
  { value: "rectangle", label: "Rechteck", Icon: RectangleHorizontal },
  { value: "circle", label: "Kreis", Icon: Circle },
  { value: "fill", label: "Füllung", Icon: PaintBucket },
];

interface Props {
  app: CadApp | MiniCad | null;
}

export const HatchSettingsPanel: React.FC<Props> = ({ app }) => {
  const [mode, setMode] = useState<HatchDrawMode>("polygon");
  const [fillColor, setFillColor] = useState("#4da3ff");
  const [strokeColor, setStrokeColor] = useState("#111111");
  const [strokeWidthPx, setStrokeWidthPx] = useState(1);
  const [fillAlphaPct, setFillAlphaPct] = useState(35);
  const [patternEnabled, setPatternEnabled] = useState(false);
  const [patternId, setPatternId] = useState("mauerwerk");
  const [patternScale, setPatternScale] = useState(1);
  const [patternAngleDeg, setPatternAngleDeg] = useState(0);
  const [patternSkewDeg, setPatternSkewDeg] = useState(0);
  const [, force] = useState(0);

  const sync = () => {
    if (!app) return;
    const hatchTool: any = (app as any).hatchTool;
    if (hatchTool) setMode(hatchTool.drawMode);
    const sel: any = (app as any).getSelectedHatch?.();
    if (sel) {
      setFillColor(sel.fillColor || (app as any).defaultHatchFillColor);
      setStrokeColor(sel.strokeColor || (app as any).defaultHatchStrokeColor);
      setStrokeWidthPx(typeof sel.strokeWidthPx === "number" ? sel.strokeWidthPx : (app as any).defaultHatchStrokeWidthPx);
      setFillAlphaPct(sel.fillAlphaPct ?? (app as any).defaultHatchFillAlphaPct);
      setPatternEnabled(!!sel.patternEnabled);
      setPatternId(sel.patternId || (app as any).defaultHatchPatternId || "mauerwerk");
      setPatternScale(sel.patternScale ?? 1);
      setPatternAngleDeg(sel.patternAngleDeg ?? 0);
      setPatternSkewDeg(sel.patternSkewDeg ?? 0);
    } else {
      setFillColor((app as any).defaultHatchFillColor);
      setStrokeColor((app as any).defaultHatchStrokeColor);
      setStrokeWidthPx((app as any).defaultHatchStrokeWidthPx);
      setFillAlphaPct((app as any).defaultHatchFillAlphaPct);
      setPatternEnabled(!!(app as any).defaultHatchPatternEnabled);
      setPatternId((app as any).defaultHatchPatternId || "mauerwerk");
      setPatternScale((app as any).defaultHatchPatternScale ?? 1);
      setPatternAngleDeg((app as any).defaultHatchPatternAngleDeg ?? 0);
      setPatternSkewDeg((app as any).defaultHatchPatternSkewDeg ?? 0);
    }
  };

  useEffect(() => {
    if (!app) return;
    sync();
    const hatchTool: any = (app as any).hatchTool;
    if (hatchTool) {
      const prev = hatchTool.onDrawModeChange;
      hatchTool.onDrawModeChange = (m: HatchDrawMode) => { prev?.(m); setMode(m); };
    }
    const prevSel = (app as any).onSelectionChange;
    (app as any).onSelectionChange = () => { prevSel?.(); sync(); force((x) => x + 1); };
    return () => { (app as any).onSelectionChange = prevSel; };
  }, [app]);

  const selected = () => (app as any)?.getSelectedHatch?.() || null;
  const apply = (mutate: (h: any) => void, def: () => void) => {
    if (!app) return;
    const h = selected();
    if (h) { mutate(h); (app as any).scene?._changeDirty; }
    else def();
    force((x) => x + 1);
  };

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1.5">MODUS</div>
        <div className="grid grid-cols-4 gap-1">
          {MODES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              title={label}
              onClick={() => {
                if (!app) return;
                (app as any).hatchTool?.setDrawMode(value);
                setMode(value);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 transition-colors ${
                mode === value ? "bg-accent" : "hover:bg-muted"
              }`}
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <Icon size={14} />
              <span className="text-[9px] leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Füllfarbe</span>
          <input
            type="color"
            value={fillColor}
            onChange={(e) => {
              const v = e.target.value;
              setFillColor(v);
              apply(
                (h) => { h.fillColor = v; },
                () => { if (app) (app as any).defaultHatchFillColor = v; },
              );
            }}
            className="h-8 w-full cursor-pointer rounded border-0 p-0 bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Linienfarbe</span>
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => {
              const v = e.target.value;
              setStrokeColor(v);
              apply(
                (h) => { h.strokeColor = v; },
                () => { if (app) (app as any).defaultHatchStrokeColor = v; },
              );
            }}
            className="h-8 w-full cursor-pointer rounded border-0 p-0 bg-transparent"
          />
        </label>
      </div>

      {/* ── Schraffurmuster ─────────────────────────────────────── */}
      <div className="space-y-2 rounded border p-2" style={{ borderColor: "hsl(var(--hairline))" }}>
        <button
          type="button"
          onClick={() => {
            const next = !patternEnabled;
            setPatternEnabled(next);
            apply((h) => { h.patternEnabled = next; }, () => { if (app) (app as any).defaultHatchPatternEnabled = next; });
          }}
          className="flex w-full items-center gap-2 text-[11px]"
          aria-pressed={patternEnabled}
        >
          <span
            className="flex h-4 w-4 items-center justify-center rounded border"
            style={{
              borderColor: "hsl(var(--hairline))",
              background: patternEnabled ? "hsl(var(--accent-gold-soft))" : "transparent",
              color: "hsl(var(--accent-gold))",
            }}
          >
            {patternEnabled && <Check size={11} />}
          </span>
          <span className="flex items-center gap-1.5"><Grid2X2 size={13} /> Muster</span>
        </button>

        {patternEnabled && (
          <div className="space-y-2">
            <select
              value={patternId}
              onChange={(e) => {
                const val = e.target.value;
                setPatternId(val);
                apply((h) => { h.patternId = val; }, () => { if (app) (app as any).defaultHatchPatternId = val; });
              }}
              className="w-full rounded border bg-transparent px-1.5 py-1 text-[11px]"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              {HATCH_PATTERNS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">Skalierung</span>
              <input
                type="range" min={0.1} max={4} step={0.05} value={patternScale}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setPatternScale(val);
                  apply((h) => { h.patternScale = val; }, () => { if (app) (app as any).defaultHatchPatternScale = val; });
                }}
                className="w-28"
              />
              <span className="w-9 text-right text-[10px] tabular-nums">{patternScale.toFixed(2)}</span>
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">Drehung (°)</span>
              <input
                type="range" min={-90} max={90} step={1} value={patternAngleDeg}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setPatternAngleDeg(val);
                  apply((h) => { h.patternAngleDeg = val; }, () => { if (app) (app as any).defaultHatchPatternAngleDeg = val; });
                }}
                className="w-28"
              />
              <span className="w-9 text-right text-[10px] tabular-nums">{Math.round(patternAngleDeg)}</span>
            </label>

            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">Verzerrung (°)</span>
              <input
                type="range" min={-60} max={60} step={1} value={patternSkewDeg}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setPatternSkewDeg(val);
                  apply((h) => { h.patternSkewDeg = val; }, () => { if (app) (app as any).defaultHatchPatternSkewDeg = val; });
                }}
                className="w-28"
              />
              <span className="w-9 text-right text-[10px] tabular-nums">{Math.round(patternSkewDeg)}</span>
            </label>
          </div>
        )}
      </div>


      <label className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">Linienstärke (px)</span>
        <input
          type="number"
          min={0}
          step={0.5}
          value={strokeWidthPx}
          onChange={(e) => {
            const v = Math.max(0, parseFloat(e.target.value) || 0);
            setStrokeWidthPx(v);
            apply(
              (h) => { h.strokeWidthPx = v; },
              () => { if (app) (app as any).defaultHatchStrokeWidthPx = v; },
            );
          }}
          className="w-20 rounded border px-1.5 py-0.5 text-xs"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </label>

      <label className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">Deckkraft (%)</span>
        <input
          type="number"
          min={0}
          max={100}
          value={fillAlphaPct}
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
            setFillAlphaPct(v);
            apply(
              (h) => { h.fillAlphaPct = v; },
              () => { if (app) (app as any).defaultHatchFillAlphaPct = v; },
            );
          }}
          className="w-20 rounded border px-1.5 py-0.5 text-xs"
          style={{ borderColor: "hsl(var(--hairline))" }}
        />
      </label>

      <button
        type="button"
        onClick={() => {
          if (!app) return;
          (app as any).defaultHatchAutoSmooth = !((app as any).defaultHatchAutoSmooth !== false);
          force((x) => x + 1);
        }}
        className="w-full flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-[11px] transition-colors hover:bg-muted"
        style={{ borderColor: "hsl(var(--hairline))" }}
        aria-pressed={(app as any)?.defaultHatchAutoSmooth !== false}
      >
        <span className="flex items-center gap-1.5">
          <Waves size={13} />
          Kanten nach Radieren glätten
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium"
          style={
            (app as any)?.defaultHatchAutoSmooth !== false
              ? { background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }
              : { background: "hsl(var(--surface-muted))", color: "hsl(var(--ink-soft))" }
          }
        >
          {(app as any)?.defaultHatchAutoSmooth !== false ? "An" : "Aus"}
        </span>
      </button>
      <div className="text-[10px] leading-relaxed" style={{ color: "hsl(var(--ink-soft))" }}>
        Glättet automatisch die radierten Kanten und entfernt Ausreißer/Zacken bei Schwüngen.
      </div>

      <div className="text-[10px] text-muted-foreground leading-relaxed">

        {mode === "polygon" && "Punkte klicken · Doppelklick beendet."}
        {mode === "rectangle" && "Zwei Klicks für die erste Seite, dritter Klick für Breite."}
        {mode === "circle" && "Zentrum → Radius → Doppelklick beendet."}
        {mode === "fill" && "Klick in eine geschlossene Fläche zwischen Linien."}
      </div>
    </div>
  );
};
