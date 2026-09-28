import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";

const STEPS = [
  "Richtung festsetzen – Gelbe Linie setzen",
  "Maßkettenpunkte auswählen – Häkchen zum festsetzen",
];

type MState = "freeDir" | "collect" | "place";

/** Schrittanzeige für das Maßkettenwerkzeug (Optik wie Pipette). */
export const MeasureWorkflowPanel: React.FC<{ app: CadApp | MiniCad | null }> = ({ app }) => {
  const [state, setState] = useState<MState>("collect");
  const [free, setFree] = useState(false);

  useEffect(() => {
    if (!app) return;
    const read = () => {
      const t = (app as any).measureTool;
      setState((t?.state as MState) || "collect");
      setFree((app as any).measureSettings?.direction === "free");
    };
    read();
    const id = window.setInterval(read, 200);
    return () => window.clearInterval(id);
  }, [app]);

  if (!app) return null;
  const current = free && state === "freeDir" ? 0 : 1;

  return (
    <div className="space-y-1.5">
      {STEPS.map((label, i) => {
        const active = i === current;
        return (
          <div
            key={label}
            className="flex items-center gap-2 rounded-md border px-2 py-2 text-xs leading-snug transition-colors"
            style={
              active
                ? { borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--foreground))" }
                : { borderColor: "hsl(var(--hairline))", color: "hsl(var(--muted-foreground))", opacity: i === 0 && !free ? 0.6 : 1 }
            }
          >
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
              style={
                active
                  ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }
                  : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
              }
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium" : undefined}>{label}</span>
          </div>
        );
      })}
      {state === "place" && (
        <div className="px-1 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          Position der Maßkette auf der Zeichenfläche wählen.
        </div>
      )}
    </div>
  );
};

export default MeasureWorkflowPanel;
