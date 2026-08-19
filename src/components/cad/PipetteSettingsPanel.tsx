import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";

const STEPS = [
  "Objekt auswählen (L-Klick)",
  "Auf anderes Objekt übertragen (L-Klick)",
];

/**
 * Schrittanzeige für das Pipetten-Werkzeug.
 * Der aktuelle Schritt wird hervorgehoben, der nächste bleibt grau sichtbar.
 */
export const PipetteSettingsPanel: React.FC<{ app: CadApp | MiniCad | null }> = ({ app }) => {
  const [hasSource, setHasSource] = useState(false);

  useEffect(() => {
    if (!app) return;
    const read = () => setHasSource(!!(app as any).pipetteTool?.hasSource);
    read();
    const t = window.setInterval(read, 200);
    return () => window.clearInterval(t);
  }, [app]);

  if (!app) return null;

  const current = hasSource ? 1 : 0;

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
                ? {
                    borderColor: "hsl(var(--primary))",
                    background: "hsl(var(--primary) / 0.12)",
                    color: "hsl(var(--foreground))",
                  }
                : {
                    borderColor: "hsl(var(--hairline))",
                    color: "hsl(var(--muted-foreground))",
                  }
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
    </div>
  );
};

export default PipetteSettingsPanel;
