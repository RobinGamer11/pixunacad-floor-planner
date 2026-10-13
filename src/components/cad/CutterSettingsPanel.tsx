import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";

const STEPS = [
  "Punkt 1 setzen (L-Klick)",
  "Punkt 2 setzen (L-Klick) = erzeugt Linie",
  "Enter oder Doppel-L-Klick = Polygone, Schraffuren, Linien, Wände und Bibliothekselemente auf der Linie teilen",
];

/** Schrittanzeige für den Cutter (gleiche Optik wie die Pipette). */
export const CutterSettingsPanel: React.FC<{ app: CadApp | null }> = ({ app }) => {
  const [phase, setPhase] = useState<"p1" | "p2" | "ready">("p1");

  useEffect(() => {
    if (!app) return;
    const read = () => setPhase(((app as any).cutterTool?.phase as any) || "p1");
    read();
    const t = window.setInterval(read, 200);
    return () => window.clearInterval(t);
  }, [app]);

  if (!app) return null;
  const current = phase === "p1" ? 0 : phase === "p2" ? 1 : 2;

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
                : { borderColor: "hsl(var(--hairline))", color: "hsl(var(--muted-foreground))" }
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
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className={active ? "font-medium" : undefined}>{label}</span>
          </div>
        );
      })}
    </div>
  );
};

export default CutterSettingsPanel;
