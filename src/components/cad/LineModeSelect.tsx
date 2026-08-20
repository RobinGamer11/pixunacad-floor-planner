import React, { useEffect, useState } from "react";
import { Circle, Minus, RectangleHorizontal } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import type { LineDrawMode } from "@/cad/LineTool";

const HAIRLINE = "hsl(var(--hairline))";

const MODES: { value: LineDrawMode; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { value: "polyline", label: "Linie", Icon: Minus },
  { value: "rectangle", label: "Rechteck", Icon: RectangleHorizontal },
  { value: "circle", label: "Kreis", Icon: Circle },
];

/**
 * Modus-Auswahl für das Linienwerkzeug — 1:1 analog zur Schraffur
 * (Linienzug, Rechteck, Kreis/Sektor).
 */
export const LineModeSelect: React.FC<{ app: CadApp | MiniCad | null }> = ({ app }) => {
  const [mode, setMode] = useState<LineDrawMode>("polyline");

  useEffect(() => {
    if (!app) return;
    const lineTool: any = (app as any).lineTool;
    if (lineTool?.drawMode) setMode(lineTool.drawMode);
    const t = window.setInterval(() => {
      const m = (app as any).lineTool?.drawMode as LineDrawMode | undefined;
      if (m) setMode((cur) => (cur === m ? cur : m));
    }, 300);
    return () => window.clearInterval(t);
  }, [app]);

  return (
    <div className="mb-2">
      <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">MODUS</div>
      <div className="grid grid-cols-3 gap-1">
        {MODES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            title={label}
            onClick={() => { if (!app) return; (app as any).lineTool?.setDrawMode(value); setMode(value); }}
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

export default LineModeSelect;
