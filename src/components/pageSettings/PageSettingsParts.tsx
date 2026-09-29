import React from "react";

/**
 * Gemeinsame, datenmodellneutrale Bausteine der Seiteneinstellungen.
 * Genutzt von der Projektmappe (eigene Seitendaten) und vom Export
 * (PlanManager-Daten). Keine Datenlogik – nur Gestaltung.
 */

export const settingsFieldClass = "w-full h-8 px-2 rounded bg-transparent border text-sm";
export const settingsBorder: React.CSSProperties = { borderColor: "hsl(var(--hairline))" };

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2 text-[11px]">
      <span className="text-muted-foreground truncate">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SettingsSelect<T extends string>({ value, options, onChange, disabled }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}
      className={`${settingsFieldClass} disabled:opacity-50`} style={settingsBorder}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Zwei Symbolknöpfe Quer/Hoch wie in der Mappe. */
export function OrientationButtons({ landscape, onChange }: { landscape: boolean; onChange: (landscape: boolean) => void }) {
  const btn = (active: boolean): React.CSSProperties => ({
    borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
    background: active ? "hsl(var(--accent-gold) / 0.12)" : undefined,
  });
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)} className="h-8 w-8 rounded border flex items-center justify-center" style={btn(landscape)} title="Querformat">▭</button>
      <button type="button" onClick={() => onChange(false)} className="h-8 w-8 rounded border flex items-center justify-center" style={btn(!landscape)} title="Hochformat">▯</button>
    </div>
  );
}

/** Ränder: Checkbox + Zahl + „mm“. */
export function MarginsField({ value, onChange }: { value: number; onChange: (mm: number) => void }) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => { const n = Math.max(0, Math.min(100, Number(text) || 0)); if (n !== value) onChange(n); else setText(String(value)); };
  return (
    <div className="flex items-center gap-2 w-full">
      <input type="checkbox" checked={value > 0} onChange={(e) => onChange(e.target.checked ? 10 : 0)} />
      <input type="number" min={0} max={100} step={1} value={text} disabled={value === 0}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="flex-1 h-8 px-2 rounded bg-transparent border text-sm disabled:opacity-50" style={settingsBorder} />
      <span className="text-xs text-muted-foreground">mm</span>
    </div>
  );
}

export function SettingsButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={title}
      className="w-full min-h-8 px-2 rounded border text-xs flex items-center justify-center gap-1.5 disabled:opacity-40" style={settingsBorder}>
      {children}
    </button>
  );
}
