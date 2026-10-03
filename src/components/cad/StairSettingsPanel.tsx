import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, Check } from "lucide-react";
import type { CadApp } from "@/cad/CadApp";
import { ToolIds } from "@/cad/constants";
import { isTabletMode } from "@/cad/StairTool";
import { DEFAULT_WINDER_COUNT, DEFAULT_MIN_WINDER_INNER_TREAD_M, knickModeOf, computeStairGeometry, stepRuleCheckText, suggestFromFloorHeight, treadFromRule } from "@/cad/stairGeometry";

const HAIRLINE = "hsl(var(--hairline))";
const MUTED = "hsl(var(--cad-toolbar-muted))";

/** Treppen-Symbol (Vektor), gleiche Signatur wie lucide-Icons. */
export const StairIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4v-4h4v-4h4V8h4" />
  </svg>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTED }}>{children}</div>
);

const NumField: React.FC<{ label: string; value: number; unit: string; onCommit: (n: number) => void; disabled?: boolean; suffix?: React.ReactNode; signed?: boolean }> = ({ label, value, unit, onCommit, disabled, suffix, signed }) => {
  const [text, setText] = useState<string | null>(null);
  const rounded = Math.round(value * 100) / 100;
  const shown = text ?? `${signed && rounded > 0 ? "+" : ""}${rounded.toLocaleString("de-DE")}`;
  const commit = () => {
    if (text == null) return;
    const n = parseFloat(text.replace(",", "."));
    setText(null);
    if (Number.isFinite(n) && (signed || n > 0)) onCommit(n);
  };
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span style={{ color: MUTED }}>{label}{suffix}</span>
      <span className="flex h-8 w-28 items-center rounded-md border" style={{ borderColor: HAIRLINE, opacity: disabled ? 0.55 : 1 }}>
        <input
          aria-label={label}
          disabled={disabled}
          value={shown}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); commit(); } }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right tabular-nums outline-none"
        />
        <span className="pr-2 text-[10px]" style={{ color: MUTED }}>{unit}</span>
      </span>
    </label>
  );
};

/** CAD-Toggle-Optik: Häkchen links neben dem Text. */
const Check2: React.FC<{ label: string; on: boolean; onChange: (v: boolean) => void; big?: boolean }> = ({ label, on, onChange, big }) => (
  <label className={`flex items-center gap-2 cursor-pointer select-none ${big ? "rounded-md border px-2 py-2 text-[13px] font-medium" : "text-xs"}`} style={big ? { borderColor: on ? "hsl(var(--primary))" : HAIRLINE } : undefined}>
    <input
      type="checkbox"
      checked={on}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="w-[14px] h-[14px] cursor-pointer rounded-[3px] border"
      style={{ accentColor: "hsl(var(--primary))", borderColor: "hsl(var(--border))" }}
    />
    <span>{label}</span>
  </label>
);

const STEPS = ["Startkante der ersten Stufe setzen", "Laufrichtung bestimmen", "Bezug A oder B wählen", "Referenzlinie zeichnen"];

/** DOM-Bedienknöpfe über der Zeichenfläche (Häkchen, A/B). */
const StairCanvasButtons: React.FC<{ app: CadApp }> = ({ app }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => { tick((n) => (n + 1) % 1e6); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const host = app.canvas?.parentElement;
  if (!host) return null;
  const b = app.stairTool.buttons;
  const ox = app.canvas.offsetLeft, oy = app.canvas.offsetTop;
  const stop = (e: React.PointerEvent | React.MouseEvent) => { e.stopPropagation(); };
  const round = "absolute z-30 flex items-center justify-center rounded-full shadow-md";
  return createPortal(
    <>
      {b.left && (
        <button type="button" aria-label="Bezug A" title="Bezug A" onPointerDown={stop}
          onClick={(e) => { stop(e); app.stairTool.chooseSide("left"); }}
          className={`${round} h-8 w-8 text-xs font-semibold`}
          style={{ left: ox + b.left.x - 16, top: oy + b.left.y - 16, background: b.left.active ? "hsl(var(--primary))" : "hsl(var(--background))", color: b.left.active ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))", border: "1.5px solid hsl(var(--primary))" }}>A</button>
      )}
      {b.right && (
        <button type="button" aria-label="Bezug B" title="Bezug B" onPointerDown={stop}
          onClick={(e) => { stop(e); app.stairTool.chooseSide("right"); }}
          className={`${round} h-8 w-8 text-xs font-semibold`}
          style={{ left: ox + b.right.x - 16, top: oy + b.right.y - 16, background: b.right.active ? "hsl(var(--primary))" : "hsl(var(--background))", color: b.right.active ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))", border: "1.5px solid hsl(var(--primary))" }}>B</button>
      )}
      {b.confirm && (
        <button type="button" aria-label="Bestätigen" title="Bestätigen (Enter)" onPointerDown={stop}
          onClick={(e) => { stop(e); app.stairTool.confirm(); }}
          className={`${round} h-9 w-9`}
          style={{ left: ox + b.confirm.x - 18, top: oy + b.confirm.y - 18, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
          <Check size={18} />
        </button>
      )}
    </>,
    host,
  );
};

/**
 * Einstellungen der Treppe: neue Treppe (Werkzeug aktiv) oder ausgewählte
 * Treppe (Bearbeitung mit Griffen). Jede Änderung an einer bestehenden
 * Treppe ist genau ein Undo-Schritt.
 */
export const StairSettingsPanel: React.FC<{ app: CadApp | null; activeTool: string }> = ({ app, activeTool }) => {
  const [, force] = useState(0);
  useEffect(() => {
    if (!app) return;
    const t = window.setInterval(() => force((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, [app]);
  if (!app || activeTool !== ToolIds.STAIR) return null;
  const tool = app.stairTool;
  const st: any = tool.phase === "edit" ? tool.editStair() : null;

  const src: any = st ?? tool.settings;
  const set = (patch: Record<string, any>) => {
    if (st) {
      const before = { ...st, path: st.path };
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
  // Bearbeiten: gespeicherte Treppe; Platzieren: reine Vorschau des Werkzeugs (live).
  const previewParams = st ? null : tool.getPreviewParams();
  const g = st ? computeStairGeometry(st) : previewParams ? computeStairGeometry(previewParams) : null;
  const phaseIdx = ["start", "dir", "side", "path"].indexOf(tool.phase);
  const labels: any[] = (app as any).labelManager?.list?.() ?? [];
  const labelValue = st ? st.labelId : (app as any).activeDrawLabelId ?? "";
  const info = st ? tool.handleInfo() : null;
  const knick = st ? tool.selectedKnick() : null;
  const floorAuto = g ? g.totalHeightM : null;
  const manualFloor = src.floorHeightM != null;
  const tablet = isTabletMode();
  const warnings = [...new Set([...tool.lastWarnings, ...(g?.warnings ?? [])])];

  return (
    <div className="cad-settings-panel mb-2 space-y-3 text-xs">
      <StairCanvasButtons app={app} />
      <SectionTitle>{st ? "Treppe" : "Treppe zeichnen"}</SectionTitle>
      {st && warnings.map((w) => <p key={w} className="cad-stair-warning">{w}</p>)}

      <label className="block text-xs">
        <span className="block mb-1" style={{ color: MUTED }}>Ebene</span>
        <select
          value={labelValue}
          onChange={(e) => {
            if (st) { (app.scene as any).assignStairsToLabel([st.id], e.target.value); app.commitHistorySnapshot(); }
            else (app as any).setActiveDrawLabelId(e.target.value);
            (app as any).refreshLabelUI?.();
            app.renderer.render();
            force((n) => n + 1);
          }}
          className="cad-settings-select w-full"
        >
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>

      {!st && (
        <div className="space-y-1">
          {STEPS.map((l, i) => (
            <div key={l} className="rounded-md border px-2 py-1.5" style={i === phaseIdx ? { borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.08)" } : { borderColor: HAIRLINE, color: MUTED }}>{i + 1}. {l}</div>
          ))}
          <p style={{ color: MUTED }}>
            {tablet ? "Bestätigen mit ✓ oder Enter. Fingerheben bestätigt nie." : "Klick bestätigt, Enter oder Doppelklick schließt die Referenzlinie ab. Shift richtet aus."}
          </p>
          {warnings.map((w) => <p key={w} className="cad-stair-warning">{w}</p>)}
        </div>
      )}

      {st && (
        <div className="space-y-2 rounded-md border p-2" style={{ borderColor: HAIRLINE }}>
          {!info && <p style={{ color: MUTED }}>Blauen Fangpunkt antippen – das Punktmenü erscheint direkt am Punkt.</p>}
          {info && (
            <>
              {info.fields.map((f) => (
                <NumField key={f.id} label={f.label} unit={f.unit} value={f.value} disabled={tool.moving} signed={f.signed}
                  onCommit={(n) => { if (n >= f.min - 1e-9) tool.setHandleValue(f.id, n); else tool.lastWarnings = [`Mindestens ${f.min.toLocaleString("de-DE")} ${f.unit}.`]; force((x) => x + 1); }} />
              ))}
              {info.lines.map(([k, v]) => (
                <div key={k} className="flex justify-between tabular-nums"><span style={{ color: MUTED }}>{k}</span><span>{v}</span></div>
              ))}
              {(info.kind === "boundary" || info.kind === "landing") && !tool.moving && (
                <button type="button" className="cad-toolbar-btn h-8 w-full justify-center gap-1 text-[11px] disabled:opacity-40" disabled={!info.canReset}
                  onClick={() => { tool.resetSelected(); force((n) => n + 1); }}
                  title={info.canReset ? "Auf Standard zurücksetzen" : (info.resetHint ?? "Bereits Standard")} aria-label="Zurücksetzen">
                  <RotateCcw size={14} /> Auf Standard
                </button>
              )}
              {tool.moving && <p style={{ color: MUTED }}>{tablet ? "Bestätigen mit ✓ oder Enter, Escape verwirft." : "Klick oder Enter bestätigt, Escape verwirft. Shift richtet aus."}</p>}
            </>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2"><span className="font-semibold">Schrittmaßregel</span><OnOff value={!!src.useStepRule} onChange={(v) => set({ useStepRule: v })} /></div>
        <div data-testid="floor-manual" className="flex items-center justify-between gap-2"><span className="font-semibold">Geschosshöhe vorgeben</span><OnOff value={manualFloor} onChange={(v) => set({ floorHeightM: v ? (floorAuto || 2.8) : null })} /></div>
        {manualFloor ? (
          <>
            <NumField label="Geschosshöhe" unit="m" value={src.floorHeightM} onCommit={(n) => {
              const s = suggestFromFloorHeight(n, src.stepRuleCm / 100);
              set({ floorHeightM: n, riserHeightM: s.riserM, treadDepthM: src.useStepRule ? treadFromRule(s.riserM, src.stepRuleCm / 100) : src.treadDepthM });
            }} />
            {(() => { const s = suggestFromFloorHeight(src.floorHeightM, src.stepRuleCm / 100); return <p className="tabular-nums" style={{ color: MUTED }}>→ {s.riserCount} Steigungen à {(s.riserM * 100).toFixed(1).replace(".", ",")} cm</p>; })()}
          </>
        ) : (
          <div data-testid="floor-auto" className="flex justify-between tabular-nums"><span style={{ color: MUTED }}>Geschosshöhe</span><span>{floorAuto != null ? `${floorAuto.toFixed(2).replace(".", ",")} m` : "—"}</span></div>
        )}
        <NumField label="Auftritt" unit="cm" value={src.treadDepthM * 100} onCommit={(n) => set({ treadDepthM: n / 100 })} />
        <NumField label="Steigung" unit="cm" value={src.riserHeightM * 100} disabled={src.useStepRule}
          suffix={g ? <span className="ml-1 tabular-nums">({g.riserCount} STG)</span> : null}
          onCommit={(n) => set({ riserHeightM: n / 100 })} />
        <NumField label="Laufbreite" unit="m" value={src.stairWidthM} onCommit={(n) => set({ stairWidthM: n })} />
        {src.useStepRule && <NumField label="Schrittmaß" unit="cm" value={src.stepRuleCm} onCommit={(n) => set({ stepRuleCm: n })} />}
        <p className="tabular-nums" style={{ color: MUTED }}>{stepRuleCheckText(src.treadDepthM, src.riserHeightM)}</p>
      </div>

      <div className="space-y-1.5">
        {g ? (
          <>
            <div className="flex justify-between tabular-nums"><span style={{ color: MUTED }}>Steigungen</span><span>{g.riserCount}</span></div>
            <div className="flex justify-between tabular-nums"><span style={{ color: MUTED }}>Auftritt (verwendet)</span><span>{(g.usedTreadM * 100).toFixed(1).replace(".", ",")} cm</span></div>
            <div className="flex justify-between tabular-nums"><span style={{ color: MUTED }}>Lauflänge</span><span>{g.totalRunM.toFixed(2).replace(".", ",")} m</span></div>
            <div className="flex justify-between tabular-nums"><span style={{ color: MUTED }}>Restlänge</span><span>{(g.remainderM * 100).toFixed(1).replace(".", ",")} cm</span></div>
          </>
        ) : (
          <p style={{ color: MUTED }}>Wird nach Festlegen der Referenzlinie berechnet</p>
        )}
      </div>

      <div className="space-y-1.5">
        <SectionTitle>Gewendelte Stufen</SectionTitle>
        {st && st.path.length > 2 && st.path.slice(1, -1).map((_: unknown, i: number) => {
          const k = i + 1;
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="w-14 shrink-0" style={{ color: k === knick ? "hsl(var(--primary))" : MUTED }}>Knick {k}</span>
              <OnOff value={knickModeOf(st, k) === "winder"} labels={["Podest", "Gewendelt"]} disabled={tool.moving}
                onChange={(w) => { tool.setKnickModeSelected(w ? "winder" : "landing", k); force((n) => n + 1); }} />
            </div>
          );
        })}
        <NumField label="Anzahl je Knick" unit="Stk" value={src.winderCount ?? DEFAULT_WINDER_COUNT}
          onCommit={(n) => { tool.setWinderSetting({ winderCount: Math.max(2, Math.min(8, Math.round(n))) }); force((x) => x + 1); }} />
        <NumField label="Mindestauftritt innen" unit="cm" value={(src.minWinderInnerTreadM ?? DEFAULT_MIN_WINDER_INNER_TREAD_M) * 100}
          onCommit={(n) => { tool.setWinderSetting({ minWinderInnerTreadM: n / 100 }); force((x) => x + 1); }} />
        <p style={{ color: MUTED }}>Projektvorgabe, gemessen 30 cm vom inneren Eckpunkt.</p>
      </div>

      <div className="space-y-1.5">
        <SectionTitle>Treppenrichtung</SectionTitle>
        <div className="grid grid-cols-2 gap-1">
          {(["up", "down"] as const).map((d) => (
            <button key={d} type="button" onClick={() => set({ direction: d })} className="cad-toolbar-btn h-8 justify-center text-[11px]" style={src.direction === d ? { background: "hsl(var(--primary) / 0.12)", borderColor: "hsl(var(--primary))" } : undefined}>{d === "up" ? "Aufwärts" : "Abwärts"}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <SectionTitle>Anzeige</SectionTitle>
        <Check2 label="Pfeil" on={src.showArrow !== false} onChange={(v) => set({ showArrow: v })} />
        <Check2 label="Startkreis" on={src.showCircle !== false} onChange={(v) => set({ showCircle: v })} />
        <Check2 label="Beschriftung" on={src.showLabel !== false} onChange={(v) => set({ showLabel: v })} />
        <Check2 label="Laufbreite" on={!!src.showWidth} onChange={(v) => set({ showWidth: v })} />
      </div>
    </div>
  );
};

/** Zwei Schaltflächen AN/AUS (bzw. eigene Beschriftung) statt Häkchen. */
function OnOff({ value, onChange, labels = ["AUS", "AN"], disabled }: { value: boolean; onChange: (v: boolean) => void; labels?: [string, string]; disabled?: boolean }) {
  const btn = (on: boolean, text: string) => (
    <button type="button" disabled={disabled} aria-pressed={value === on} onClick={() => value !== on && onChange(on)}
      className="cad-toolbar-btn h-7 flex-1 justify-center px-2 text-[11px] disabled:opacity-40"
      style={value === on ? { background: "hsl(var(--primary) / 0.15)", borderColor: "hsl(var(--primary))", fontWeight: 600 } : undefined}>{text}</button>
  );
  return <div className="flex min-w-[110px] gap-1">{labels[1] === "AN" ? <>{btn(true, "AN")}{btn(false, "AUS")}</> : <>{btn(false, labels[0])}{btn(true, labels[1])}</>}</div>;
}
