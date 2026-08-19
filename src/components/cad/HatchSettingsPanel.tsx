import React, { useEffect, useState } from "react";
import { Spline, RectangleHorizontal, Circle, PaintBucket } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import type { HatchDrawMode } from "@/cad/HatchTool";
import { RasterModeToggle } from "@/components/cad/RasterModeToggle";
import { ToolColorPicker } from "@/components/workspace/ToolColorPicker";
import { HatchPatternBlock } from "@/components/cad/HatchPatternBlock";

const MODES: { value: HatchDrawMode; label: string; Icon: React.ElementType }[] = [
  { value: "polygon", label: "Polygon", Icon: Spline },
  { value: "rectangle", label: "Rechteck", Icon: RectangleHorizontal },
  { value: "circle", label: "Kreis", Icon: Circle },
  { value: "fill", label: "Füllung", Icon: PaintBucket },
];

const HAIRLINE = "hsl(var(--hairline))";

/** Kleine Maßeingabe (px / mm) im Stil des Hilfslinien-Werkzeugs. */
const MeasureInput: React.FC<{
  label: string; value: number; digits: number; onChange: (v: number) => void;
}> = ({ label, value, digits, onChange }) => {
  const [draft, setDraft] = useState(String(Number(value.toFixed(digits))));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(String(Number(value.toFixed(digits)))); }, [value, digits, focused]);
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[9px] text-muted-foreground">{label}</span>
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
        className="h-8 w-full rounded-md border bg-transparent px-2 text-[11px] tabular-nums"
        style={{ borderColor: HAIRLINE }}
      />
    </label>
  );
};

interface Props {
  app: CadApp | MiniCad | null;
  projectId?: string;
  /** Bildschirm-Pixel pro Papiermillimeter (für die mm-Anzeige der Strichstärke). */
  pxPerMm?: number;
  /** Maximale Musterskalierung (CAD nutzt größere Werte als die Mappe). */
  patternScaleMax?: number;
  /** true = Modus & Objektart werden außerhalb (über dem Rahmen) gerendert. */
  hideChrome?: boolean;
  /** Zusatzfeld direkt unter der Strichstärke (CAD: Flächenanzeige). */
  afterStroke?: React.ReactNode;
}

/** Modus-Auswahl — kann außerhalb des Einstellungsrahmens platziert werden. */
export const HatchModeSelect: React.FC<{ app: CadApp | MiniCad | null }> = ({ app }) => {
  const [mode, setMode] = useState<HatchDrawMode>("polygon");
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => {
      const m = (app as any).hatchTool?.drawMode as HatchDrawMode | undefined;
      if (m) setMode(m);
    }, 300);
    return () => window.clearInterval(t);
  }, [app]);
  return (
    <div className="mb-2">
      <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">MODUS</div>
      <div className="grid grid-cols-4 gap-1">
        {MODES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => { if (!app) return; (app as any).hatchTool?.setDrawMode(value); setMode(value); }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded border px-1 py-1.5 transition-colors ${
              mode === value ? "bg-accent" : "hover:bg-muted"
            }`}
            style={{ borderColor: HAIRLINE }}
          >
            <Icon size={14} />
            <span className="text-[9px] leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const HatchSettingsPanel: React.FC<Props> = ({ app, projectId, pxPerMm = 96 / 25.4, patternScaleMax = 20, hideChrome = false, afterStroke }) => {
  const [mode, setMode] = useState<HatchDrawMode>("polygon");
  const [fillColor, setFillColor] = useState("#4da3ff");
  const [strokeColor, setStrokeColor] = useState("#111111");
  const [strokeWidthPx, setStrokeWidthPx] = useState(1);
  const [fillAlphaPct, setFillAlphaPct] = useState(35);
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
    } else {
      setFillColor((app as any).defaultHatchFillColor);
      setStrokeColor((app as any).defaultHatchStrokeColor);
      setStrokeWidthPx((app as any).defaultHatchStrokeWidthPx);
      setFillAlphaPct((app as any).defaultHatchFillAlphaPct);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);

  const selected = () => (app as any)?.getSelectedHatch?.() || null;
  const apply = (mutate: (h: any) => void, def: () => void) => {
    if (!app) return;
    const h = selected();
    if (h) mutate(h); else def();
    (app as any).renderer?.render?.();
    (app as any).requestRender?.();
    force((x) => x + 1);
  };

  const strokeMm = strokeWidthPx / Math.max(1e-6, pxPerMm);
  const setStroke = (px: number) => {
    const v = Math.max(0, px);
    setStrokeWidthPx(v);
    apply((h) => { h.strokeWidthPx = v; }, () => { if (app) (app as any).defaultHatchStrokeWidthPx = v; });
  };

  return (
    <div className="space-y-3 text-xs">
{!hideChrome && (
        <>
          <HatchModeSelect app={app} />
          {/* OBJEKTART (Vektor / Pixel) */}
          <RasterModeToggle app={app} projectId={projectId} />
        </>
      )}

      <div className="grid grid-cols-2 gap-2">
        <ToolColorPicker
          label="Füllfarbe"
          value={fillColor}
          onChange={(value) => {
            setFillColor(value);
            apply((h) => { h.fillColor = value; }, () => { if (app) (app as any).defaultHatchFillColor = value; });
          }}
        />
        <ToolColorPicker
          label="Linienfarbe"
          value={strokeColor}
          onChange={(value) => {
            setStrokeColor(value);
            apply((h) => { h.strokeColor = value; }, () => { if (app) (app as any).defaultHatchStrokeColor = value; });
          }}
        />
      </div>

      {/* Strichstärke px + mm */}
      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Strichstärke</div>
        <div className="grid grid-cols-2 gap-2">
          <MeasureInput label="Bildschirm (px)" value={strokeWidthPx} digits={2} onChange={(v) => setStroke(v)} />
          <MeasureInput label="Tatsächliche Größe (mm)" value={strokeMm} digits={3} onChange={(v) => setStroke(v * pxPerMm)} />
        </div>
      </div>

      {afterStroke}

      {/* Transparenz */}
      <div>
        <div className="mb-1.5 text-[10px] text-muted-foreground">Transparenz</div>
        <input
          type="range" min={1} max={100} step={1} value={fillAlphaPct}
          onChange={(e) => {
            const v = Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1));
            setFillAlphaPct(v);
            apply((h) => { h.fillAlphaPct = v; }, () => { if (app) (app as any).defaultHatchFillAlphaPct = v; });
          }}
          className="pixuna-range h-4 w-full cursor-pointer"
        />
        <input
          type="number" min={1} max={100}
          value={fillAlphaPct}
          onChange={(e) => {
            const v = Math.max(1, Math.min(100, parseFloat(e.target.value) || 1));
            setFillAlphaPct(v);
            apply((h) => { h.fillAlphaPct = v; }, () => { if (app) (app as any).defaultHatchFillAlphaPct = v; });
          }}
          className="mt-1 h-8 w-full rounded-md border bg-transparent px-2 text-[11px] tabular-nums"
          style={{ borderColor: HAIRLINE }}
        />
      </div>

      {/* Muster ganz unten */}
      <HatchPatternBlock app={app} scaleMax={patternScaleMax} />
    </div>
  );
};
