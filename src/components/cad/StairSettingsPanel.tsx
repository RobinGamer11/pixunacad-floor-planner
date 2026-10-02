import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import { ToolIds } from "@/cad/constants";
import { computeStairGeometry, stepRuleCheckText, suggestFromFloorHeight, treadFromRule } from "@/cad/stairGeometry";

const HAIRLINE = "hsl(var(--hairline))";

/** Treppen-Symbol (Vektor), gleiche Signatur wie lucide-Icons. */
export const StairIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 20h5v-5h5v-5h5V5h3" />
  </svg>
);

const NumField: React.FC<{ label: string; value: number; unit: string; step?: number; onCommit: (n: number) => void; disabled?: boolean }> = ({ label, value, unit, onCommit, disabled }) => {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (Math.round(value * 100) / 100).toLocaleString("de-DE");
  const commit = () => {
    if (text == null) return;
    const n = parseFloat(text.replace(",", "."));
    setText(null);
    if (Number.isFinite(n) && n > 0) onCommit(n);
  };
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex h-8 w-28 items-center rounded-md border" style={{ borderColor: HAIRLINE }}>
        <input
          aria-label={label}
          disabled={disabled}
          value={shown}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); commit(); } }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right tabular-nums outline-none"
        />
        <span className="pr-2 text-[10px] text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
};

const Toggle: React.FC<{ label: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, on, onChange }) => (
  <label className="flex items-center justify-between text-xs">
    <span>{label}</span>
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
  </label>
);

const STEPS = ["Startpunkt der ersten Stufe setzen", "Richtung wählen, mit ✓ bestätigen", "Bezug links oder rechts wählen", "Referenzlinie zeichnen, mit ✓ abschließen"];

/**
 * Einstellungen der Treppe: neue Treppe (Werkzeug aktiv) oder ausgewählte
 * Treppe (Auswahlwerkzeug). Jede Änderung an einer bestehenden Treppe ist
 * genau ein Undo-Schritt.
 */
export const StairSettingsPanel: React.FC<{ app: CadApp | null; activeTool: string }> = ({ app, activeTool }) => {
  const [, force] = useState(0);
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => force((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, [app]);
  if (!app) return null;
  const tool = app.stairTool;
  const sel = ((app.selectTool as any).marqueeSelectedIds || []) as { kind: string; id: string }[];
  const selId = activeTool === ToolIds.SELECT && sel.length === 1 && sel[0].kind === "stair" ? sel[0].id : null;
  const editing = activeTool === ToolIds.STAIR && tool.phase === "edit";
  const st: any = selId ? (app.scene as any).getStairById(selId) : null;
  if (activeTool !== ToolIds.STAIR && !st) return null;
  if (editing) {
    return (
      <div className="cad-settings-panel mb-2 space-y-2 text-xs">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Treppe bearbeiten</div>
        <p className="text-muted-foreground">Griffe ziehen: weiße = Stufengrenze, gelb = Laufbreite, blau = Referenzlinie. Mit ✓ oder Enter speichern, Escape verwirft.</p>
        {tool.lastWarnings.map((w) => <p key={w} className="text-destructive">{w}</p>)}
        <div className="flex gap-2">
          <button type="button" className="h-9 flex-1 rounded-md bg-primary text-primary-foreground font-semibold" onClick={() => tool.confirm()}>✓ Fixieren</button>
          <button type="button" className="h-9 flex-1 rounded-md border" style={{ borderColor: HAIRLINE }} onClick={() => tool.escape()}>Abbrechen</button>
        </div>
      </div>
    );
  }

  // Quelle: ausgewählte Treppe oder Werkzeug-Voreinstellungen.
  const src: any = st ?? tool.settings;
  const set = (patch: Record<string, any>) => {
    if (st) {
      const before = { ...st };
      Object.assign(st, patch);
      if (st.useStepRule && ("treadDepthM" in patch || "stepRuleCm" in patch || "useStepRule" in patch)) {
        st.riserHeightM = Math.max(0.05, (st.stepRuleCm / 100 - st.treadDepthM) / 2);
      }
      if ("treadDepthM" in patch) st.stepDistancesM = null;
      if (!computeStairGeometry(st).valid && ("stairWidthM" in patch || "treadDepthM" in patch)) {
        Object.assign(st, before);
        return;
      }
      app.commitHistorySnapshot();
    } else {
      Object.assign(tool.settings, patch);
      tool.applyStepRule();
    }
    force((n) => n + 1);
  };
  const g = st ? computeStairGeometry(st) : null;
  const phaseIdx = ["start", "dir", "side", "path"].indexOf(tool.phase);

  return (
    <div className="cad-settings-panel mb-2 space-y-3 text-xs">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Treppe</div>

      <div className="grid grid-cols-2 gap-1">
        <button type="button" className="h-8 rounded-md border bg-primary/10" style={{ borderColor: "hsl(var(--primary))" }}>Gerade / Podest</button>
        <button type="button" disabled title="Folgt nach Abnahme der geraden Treppe" className="h-8 rounded-md border opacity-40" style={{ borderColor: HAIRLINE }}>Gewendelt</button>
      </div>

      {!st && (
        <div className="space-y-1">
          {STEPS.map((l, i) => (
            <div key={l} className="rounded-md border px-2 py-1.5" style={i === phaseIdx ? { borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.12)" } : { borderColor: HAIRLINE, color: "hsl(var(--muted-foreground))" }}>{i + 1}. {l}</div>
          ))}
          {tool.phase === "side" && (
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button type="button" className="h-9 rounded-md border" style={{ borderColor: HAIRLINE }} onClick={() => tool.chooseSide("left")}>Bezug links</button>
              <button type="button" className="h-9 rounded-md border" style={{ borderColor: HAIRLINE }} onClick={() => tool.chooseSide("right")}>Bezug rechts</button>
            </div>
          )}
          {(tool.phase === "dir" || tool.phase === "path") && (
            <button type="button" className="h-9 w-full rounded-md bg-primary text-primary-foreground font-semibold" onClick={() => tool.confirm()}>✓ Bestätigen</button>
          )}
          {tool.lastWarnings.map((w) => <p key={w} className="text-destructive">{w}</p>)}
        </div>
      )}

      <div className="space-y-1.5">
        <NumField label="Auftritt" unit="cm" value={src.treadDepthM * 100} onCommit={(n) => set({ treadDepthM: n / 100 })} />
        <NumField label="Steigung" unit="cm" value={src.riserHeightM * 100} disabled={src.useStepRule} onCommit={(n) => set({ riserHeightM: n / 100 })} />
        <NumField label="Laufbreite" unit="m" value={src.stairWidthM} onCommit={(n) => set({ stairWidthM: n })} />
        <Toggle label="Schrittmaßregel" on={!!src.useStepRule} onChange={(v) => set({ useStepRule: v })} />
        {src.useStepRule && <NumField label="Schrittmaß" unit="cm" value={src.stepRuleCm} onCommit={(n) => set({ stepRuleCm: n })} />}
        <p className="text-muted-foreground tabular-nums">{stepRuleCheckText(src.treadDepthM, src.riserHeightM)}</p>
        <NumField label="Geschosshöhe" unit="m" value={src.floorHeightM ?? 0} onCommit={(n) => {
          const s = suggestFromFloorHeight(n, src.stepRuleCm / 100);
          set({ floorHeightM: n, riserHeightM: s.riserM, treadDepthM: src.useStepRule ? treadFromRule(s.riserM, src.stepRuleCm / 100) : src.treadDepthM });
        }} />
      </div>

      {g && (
        <div className="rounded-md border p-2 tabular-nums" style={{ borderColor: HAIRLINE }}>
          <div>Steigungen: {g.riserCount} · Auftritte: {g.treadCount}</div>
          <div>Höhe: {g.totalHeightM.toFixed(2)} m · Lauflänge: {g.totalRunM.toFixed(2)} m</div>
          {g.warnings.map((w) => <div key={w} className="text-destructive">{w}</div>)}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1">
          {(["up", "down"] as const).map((d) => (
            <button key={d} type="button" onClick={() => set({ direction: d })} className="h-8 rounded-md border" style={{ borderColor: src.direction === d ? "hsl(var(--primary))" : HAIRLINE }}>{d === "up" ? "Aufwärts" : "Abwärts"}</button>
          ))}
        </div>
        <Toggle label="Pfeil" on={src.showArrow !== false} onChange={(v) => set({ showArrow: v })} />
        <Toggle label="Startkreis" on={src.showCircle !== false} onChange={(v) => set({ showCircle: v })} />
        <Toggle label="Beschriftung" on={src.showLabel !== false} onChange={(v) => set({ showLabel: v })} />
        <Toggle label="Laufbreite anzeigen" on={!!src.showWidth} onChange={(v) => set({ showWidth: v })} />
      </div>

      {st && (
        <div className="space-y-1">
          <button type="button" className="h-9 w-full rounded-md border font-semibold" style={{ borderColor: HAIRLINE }} onClick={() => { if (tool.beginEdit(st.id)) app.setTool(ToolIds.STAIR); }}>Stufen & Linie bearbeiten</button>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className="h-9 rounded-md border" style={{ borderColor: HAIRLINE }} onClick={() => tool.addLandingRun(st.id)}>Podest hinzufügen</button>
            <button type="button" disabled={st.path.length < 3} className="h-9 rounded-md border disabled:opacity-40" style={{ borderColor: HAIRLINE }} onClick={() => tool.removeLastLanding(st.id)}>Podest entfernen</button>
          </div>
        </div>
      )}
    </div>
  );
};
