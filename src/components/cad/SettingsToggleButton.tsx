import React from "react";

const HAIRLINE = "hsl(var(--hairline))";

/**
 * Einheitlicher großer Aktiv/Aus-Schalter für die Werkzeugeinstellungen.
 * Rein optisch — die Logik bleibt beim jeweiligen Werkzeug.
 */
export const SettingsToggleButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
  /** Beschriftung des Zustands-Chips rechts. */
  onLabel?: string;
  offLabel?: string;
}> = ({ label, active, onClick, title, onLabel = "Ein", offLabel = "Aus" }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={title}
    className="flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-[12px] font-medium transition-colors hover:bg-muted"
    style={{ borderColor: HAIRLINE, background: active ? "hsl(var(--surface-strong))" : "transparent" }}
  >
    <span className="truncate">{label}</span>
    <span
      className="shrink-0 rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        borderColor: HAIRLINE,
        color: active ? "hsl(var(--cad-accent))" : "hsl(var(--muted-foreground))",
      }}
    >
      {active ? onLabel : offLabel}
    </span>
  </button>
);

/** Einheitliche Bereichsüberschrift der Werkzeugeinstellungen. */
export const SettingsHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground">{children}</div>
);

export default SettingsToggleButton;
