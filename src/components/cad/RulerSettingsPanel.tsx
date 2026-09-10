import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import {
  RULER_SIDES, RULER_UNITS, rulerDecimals,
  type RulerSide, type RulerUnit,
} from "@/cad/rulerModel";

const HAIRLINE = "hsl(var(--hairline))";

const STEPS = [
  "Anfangspunkt setzen (L-Klick)",
  "Endpunkt setzen (L-Klick)",
  "Verschieben, drehen, Länge ändern (ziehen)",
];

/**
 * Einstellungen des eigenständigen Lineal-Werkzeugs:
 * Schrittanzeige, Länge in der gewählten Einheit, Zeichenseite,
 * Maßeinheit und Entfernen.
 */
export const RulerSettingsPanel: React.FC<{ app: CadApp | MiniCad | null }> = ({ app }) => {
  const a: any = app;
  const [, force] = useState(0);
  const [lenText, setLenText] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => force((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, [app]);

  if (!app) return null;

  const tool = a.rulerTool;
  const hasRuler = !!a.scene?.rulerGuide;
  const unit: RulerUnit = tool?.getUnit?.() ?? "cm";
  const side: RulerSide = tool?.getSide?.() ?? "center";
  const decimals = rulerDecimals(unit);
  const length = tool?.getLengthInUnit?.() ?? 0;
  const phase: string = tool?.phase ?? "start";
  const current = phase === "start" ? 0 : phase === "end" ? 1 : 2;

  const commitLength = () => {
    const n = parseFloat(lenText.replace(",", "."));
    if (Number.isFinite(n) && n > 0) tool?.setLengthInUnit?.(n);
    setEditing(false);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          if (hasRuler) tool?.deactivateRuler?.();
          else tool?.activateRuler?.();
          force((n) => n + 1);
        }}
        className="h-11 w-full rounded-lg text-sm font-semibold transition-colors"
        style={
          hasRuler
            ? { background: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold-foreground, var(--background)))" }
            : { border: `1px solid ${HAIRLINE}`, color: "hsl(var(--foreground))" }
        }
      >
        {hasRuler ? "Lineal deaktivieren" : "Lineal aktivieren"}
      </button>

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
                  : { borderColor: HAIRLINE, color: "hsl(var(--muted-foreground))" }
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

      <div className="space-y-2 border-t pt-2" style={{ borderColor: HAIRLINE }}>
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">LÄNGE</div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            disabled={!hasRuler}
            value={editing ? lenText : (hasRuler ? length.toFixed(decimals) : "")}
            placeholder="–"
            onFocus={() => { setEditing(true); setLenText(length.toFixed(decimals)); }}
            onChange={(e) => setLenText(e.target.value)}
            onBlur={commitLength}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLength(); (e.target as HTMLInputElement).blur(); } }}
            className="h-8 w-24 rounded border bg-transparent px-2 text-sm tabular-nums"
            style={{ borderColor: HAIRLINE }}
          />
          <span className="text-[11px] text-muted-foreground">{unit}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Echte Länge der Zeichnung — der Zoom ändert nur die Bildschirmgröße.
        </div>
      </div>

      <div className="space-y-2 border-t pt-2" style={{ borderColor: HAIRLINE }}>
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">MASSEINHEIT</div>
        <div className="grid grid-cols-3 gap-1">
          {RULER_UNITS.map((u) => (
            <button
              key={u.value}
              type="button"
              onClick={() => { tool?.setUnit?.(u.value); force((n) => n + 1); }}
              className={`rounded border px-1 py-1.5 text-[10px] transition-colors ${unit === u.value ? "bg-accent" : "hover:bg-muted"}`}
              style={{ borderColor: HAIRLINE }}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 border-t pt-2" style={{ borderColor: HAIRLINE }}>
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">ZEICHENSEITE</div>
        <div className="grid grid-cols-3 gap-1">
          {RULER_SIDES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => { tool?.setSide?.(s.value); force((n) => n + 1); }}
              className={`rounded border px-1 py-1.5 text-[10px] transition-colors ${side === s.value ? "bg-accent" : "hover:bg-muted"}`}
              style={{ borderColor: HAIRLINE }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Die gesetzte Strecke bleibt an ihrem Platz; nur der Linealkörper wechselt die Seite.
        </div>
      </div>

    </div>
  );
};

export default RulerSettingsPanel;
