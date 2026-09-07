import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";

const HAIRLINE = "hsl(var(--hairline))";

const STEPS = [
  "Anfangspunkt setzen (L-Klick)",
  "Endpunkt setzen (L-Klick)",
  "Verschieben, drehen, Länge ändern (ziehen)",
];

const SIDES: { value: "left" | "center" | "right"; label: string }[] = [
  { value: "left", label: "Links" },
  { value: "center", label: "Mittig" },
  { value: "right", label: "Rechts" },
];

/**
 * Einstellungen des eigenständigen Lineal-Werkzeugs.
 * Aufbau wie beim Pipetten-Werkzeug: Schrittanzeige plus die wenigen
 * Werte, die das Lineal selbst betreffen (Länge in Zentimetern,
 * Zeichenseite, Entfernen).
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
  const lengthCm = tool?.getLengthCm?.() ?? 0;
  const phase: string = tool?.phase ?? "start";
  const current = phase === "start" ? 0 : phase === "end" ? 1 : 2;
  const side: string = a.defaultFreeRulerSide ?? "center";

  const commitLength = () => {
    const n = parseFloat(lenText.replace(",", "."));
    if (Number.isFinite(n) && n > 0) tool?.setLengthCm?.(n);
    setEditing(false);
  };

  return (
    <div className="space-y-3">
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
            value={editing ? lenText : (hasRuler ? lengthCm.toFixed(1) : "")}
            placeholder="–"
            onFocus={() => { setEditing(true); setLenText(lengthCm.toFixed(1)); }}
            onChange={(e) => setLenText(e.target.value)}
            onBlur={commitLength}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLength(); (e.target as HTMLInputElement).blur(); } }}
            className="h-8 w-24 rounded border bg-transparent px-2 text-sm tabular-nums"
            style={{ borderColor: HAIRLINE }}
          />
          <span className="text-[11px] text-muted-foreground">cm</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          Immer echte Zentimeter der Zeichnung — der Zoom ändert nur die Bildschirmgröße.
        </div>
      </div>

      <div className="space-y-2 border-t pt-2" style={{ borderColor: HAIRLINE }}>
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">ZEICHENSEITE</div>
        <div className="grid grid-cols-3 gap-1">
          {SIDES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => { a.defaultFreeRulerSide = s.value; force((n) => n + 1); }}
              className={`rounded border px-1 py-1.5 text-[10px] transition-colors ${side === s.value ? "bg-accent" : "hover:bg-muted"}`}
              style={{ borderColor: HAIRLINE }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!hasRuler}
        onClick={() => { tool?.remove?.(); force((n) => n + 1); }}
        className="h-8 w-full rounded-md border text-xs disabled:opacity-40"
        style={{ borderColor: HAIRLINE }}
      >
        Lineal entfernen
      </button>
    </div>
  );
};

export default RulerSettingsPanel;
