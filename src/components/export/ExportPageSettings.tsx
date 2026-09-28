import React from "react";
import type { CadApp } from "@/cad/CadApp";
import { PaperFormats } from "@/cad/PlanManager";
import { usePlanUi } from "./useExportApp";
import { Link2, Snowflake, Pencil, Plus, AlertTriangle } from "lucide-react";

/**
 * Rechte Einstellungsleiste einer Exportseite. Alle Änderungen laufen über
 * `app.mutatePlans` (ein Verlaufsschritt, synchronisiert Renderer/Plan-Scenes).
 */
export function ExportPageSettings({ app, onOpenSourceSheet }: {
  app: CadApp;
  onOpenSourceSheet: (sheetId: string) => void;
}) {
  // leichte Abfrage für Auswahländerungen im PlanController (Canvas-Interaktion)
  usePlanUi(app, 400);
  const pm = app.planManager;
  const plan = app.activePlanId ? pm.getById(app.activePlanId) : null;
  const sheets = app.sheetManager.list();

  if (!plan) {
    return (
      <aside className="export-settings shrink-0 w-[260px] h-full border-l p-4 text-xs text-muted-foreground"
        style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
        Wähle links eine Exportseite aus oder lege eine neue an.
      </aside>
    );
  }

  const ctl = app.planController;
  const selProj = ctl?.selectedProjectionId ? plan.projections.find(p => p.id === ctl.selectedProjectionId) ?? null : null;
  const selSheet = selProj ? sheets.find(s => s.id === selProj.sourceSheetId) ?? null : null;
  const plansInOrder = pm.list();
  const idx = plansInOrder.findIndex(p => p.id === plan.id);
  const prev = idx >= 0 ? plansInOrder[idx + 1] ?? null : null; // Liste ist neueste-zuerst

  const field = "w-full h-8 px-2 rounded border bg-transparent text-xs";
  const border = { borderColor: "hsl(var(--hairline))" };
  const set = (fn: () => void) => app.mutatePlans(fn);

  return (
    <aside className="export-settings shrink-0 w-[260px] h-full border-l overflow-y-auto p-3 space-y-4 text-xs"
      style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
      <Section title="Seite">
        <label className="block space-y-1">
          <span>Titel</span>
          <input key={plan.id + plan.name} defaultValue={plan.name} className={field} style={border}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== plan.name) set(() => pm.renamePlan(plan.id, v)); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
        </label>
        <div className="grid grid-cols-4 gap-1">
          {[...PaperFormats.map(f => ({ key: f.key, label: f.label })), { key: "free", label: "Frei" }].map(f => (
            <button key={f.key} type="button" className="h-8 rounded border"
              style={{ borderColor: plan.formatKey === f.key ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))", background: plan.formatKey === f.key ? "hsl(var(--accent-gold-soft))" : undefined }}
              onClick={() => set(() => pm.setFormat(plan.id, { formatKey: f.key }))}>{f.label}</button>
          ))}
        </div>
        {plan.formatKey === "free" ? (
          <div className="grid grid-cols-2 gap-2">
            <label>Breite (mm)<input type="number" min={10} key={"w" + plan.freeWidth} defaultValue={plan.freeWidth} className={field} style={border}
              onBlur={(e) => set(() => pm.setFormat(plan.id, { freeWidth: Number(e.target.value) }))} /></label>
            <label>Höhe (mm)<input type="number" min={10} key={"h" + plan.freeHeight} defaultValue={plan.freeHeight} className={field} style={border}
              onBlur={(e) => set(() => pm.setFormat(plan.id, { freeHeight: Number(e.target.value) }))} /></label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {[{ v: false, l: "Hochformat" }, { v: true, l: "Querformat" }].map(o => (
              <button key={o.l} type="button" className="h-8 rounded border"
                style={{ borderColor: plan.landscape === o.v ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))", background: plan.landscape === o.v ? "hsl(var(--accent-gold-soft))" : undefined }}
                onClick={() => set(() => pm.setFormat(plan.id, { landscape: o.v }))}>{o.l}</button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2">
          <span className="flex-1">Seitenrand (mm, Hilfslinie)</span>
          <input type="number" min={0} max={50} key={"m" + plan.marginsMm} defaultValue={plan.marginsMm} className="w-16 h-8 px-2 rounded border bg-transparent" style={border}
            onBlur={(e) => set(() => pm.setPageSettings(plan.id, { marginsMm: Math.max(0, Number(e.target.value) || 0) }))} />
        </label>
        <label className="flex items-center gap-2 min-h-8 cursor-pointer">
          <input type="checkbox" checked={plan.holePunch} onChange={(e) => set(() => pm.setPageSettings(plan.id, { holePunch: e.target.checked }))} className="h-4 w-4" />
          <span>Lochung anzeigen (Hilfslinie)</span>
        </label>
        <label className="flex items-center gap-2 min-h-8 cursor-pointer">
          <input type="checkbox" disabled={!prev && !plan.spreadId} checked={!!plan.spreadId}
            onChange={(e) => set(() => {
              if (!e.target.checked) { pm.setPageSettings(plan.id, { spreadId: null }); return; }
              if (!prev) return;
              const sid = prev.spreadId || `spread-${prev.id}`;
              pm.setPageSettings(prev.id, { spreadId: sid });
              pm.setPageSettings(plan.id, { spreadId: sid });
            })} className="h-4 w-4" />
          <span>Seitenverbund mit vorheriger Seite{prev ? ` („${prev.name}“)` : ""}</span>
        </label>
      </Section>

      <Section title="CAD-Blatt platzieren">
        <div className="text-[11px] text-muted-foreground leading-snug">
          Ausschnitte bleiben mit dem CAD-Blatt verknüpft und aktualisieren sich automatisch.
        </div>
        <div className="space-y-1">
          {sheets.map(s => (
            <button key={s.id} type="button" className="w-full h-9 px-2 rounded border flex items-center gap-2 text-left" style={border}
              onClick={() => app.placeSheetOnActivePlan(s.id)}>
              <Plus size={13} /> <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      </Section>

      {selProj && (
        <Section title="Ausgewählter Ausschnitt">
          <div className="flex items-center gap-1.5">
            {selProj.mode === "frozen" ? <Snowflake size={13} /> : <Link2 size={13} />}
            <span>{selProj.mode === "frozen" ? "Eingefroren (feste Kopie)" : "Live verknüpft"}</span>
          </div>
          <div className="text-muted-foreground">Quelle: {selSheet?.name ?? <span className="inline-flex items-center gap-1" style={{ color: "hsl(var(--destructive))" }}><AlertTriangle size={12} /> CAD-Blatt fehlt</span>}</div>
          <label className="flex items-center gap-2">
            <span className="flex-1">Maßstab 1:</span>
            <input type="number" min={1} key={"s" + selProj.scaleDen} defaultValue={selProj.scaleDen} className="w-20 h-8 px-2 rounded border bg-transparent" style={border}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0 && v !== selProj.scaleDen) set(() => pm.updateProjection(plan.id, selProj.id, { scaleDen: v, scale: 1 / v }));
              }} />
          </label>
          {selProj.mode !== "frozen" && selSheet && (
            <button type="button" className="w-full h-9 rounded border flex items-center justify-center gap-1.5" style={border}
              onClick={() => { if (window.confirm("Ausschnitt einfrieren? Spätere Änderungen am CAD-Blatt erscheinen dann nicht mehr hier.")) set(() => ctl?.freezeProjection(plan.id, selProj.id)); }}>
              <Snowflake size={13} /> Einfrieren
            </button>
          )}
          {selSheet && (
            <button type="button" className="w-full h-9 rounded flex items-center justify-center gap-1.5 font-medium"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
              onClick={() => onOpenSourceSheet(selSheet.id)}>
              <Pencil size={13} /> CAD-Blatt bearbeiten
            </button>
          )}
        </Section>
      )}
      <div className="text-[10px] text-muted-foreground leading-snug">
        Mit den CAD-Werkzeugen zeichnest du hier nur Anmerkungen auf diese Exportseite. Die Zeichnung selbst änderst du über „CAD-Blatt bearbeiten“.
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ink-soft))" }}>{title}</div>
      {children}
    </div>
  );
}
