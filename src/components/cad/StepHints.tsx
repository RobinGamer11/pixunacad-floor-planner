import React from "react";

/**
 * Freundliche Schrittanzeige im Stil des Pipetten-Werkzeugs.
 * Rein optisch — die eigentliche Werkzeuglogik bleibt unverändert.
 */
export const StepHints: React.FC<{
  steps: string[];
  /** Index des aktuell erwarteten Schritts. */
  current: number;
  /** Zusätzlicher Hinweis unter den Schritten (z. B. ESC: abbrechen). */
  footer?: string;
}> = ({ steps, current, footer }) => (
  <div className="space-y-1.5">
    {steps.map((label, i) => {
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
    {footer ? <div className="px-1 text-[10px] text-muted-foreground">{footer}</div> : null}
  </div>
);

export default StepHints;
