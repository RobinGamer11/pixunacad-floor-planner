import React from "react";
import type { CadApp } from "@/cad/CadApp";
import { PaperFormats } from "@/cad/PlanManager";
import { usePlanUi } from "./useExportApp";
import { HOLE_PATTERN_OPTIONS, type HolePunchSide } from "@/cad/pageGuides";
import type { SpreadLayoutMode } from "@/cad/PlanManager";
import { SettingsSection, SettingsRow, SettingsSelect, OrientationButtons, MarginsField, SettingsButton, settingsFieldClass, settingsBorder } from "@/components/pageSettings/PageSettingsParts";
import { Link2, Link2Off, RotateCcw, Snowflake, Pencil, Plus, AlertTriangle, Check, Move as MoveIcon } from "lucide-react";

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
      <div className="export-settings p-4 text-xs text-muted-foreground">
        Wähle links eine Exportseite aus oder lege eine neue an.
      </div>
    );
  }

  const ctl = app.planController;
  const selProj = ctl?.selectedProjectionId ? plan.projections.find(p => p.id === ctl.selectedProjectionId) ?? null : null;
  const selSheet = selProj ? sheets.find(s => s.id === selProj.sourceSheetId) ?? null : null;
  const plansInOrder = pm.flatOrder();
  const idx = plansInOrder.findIndex(p => p.id === plan.id);
  const prev = idx > 0 ? plansInOrder[idx - 1] : null;
  const next = idx >= 0 ? plansInOrder[idx + 1] ?? null : null;
  const members = pm.spreadMembers(plan.spreadId);
  const inSpread = members.length >= 2;

  const field = "w-full h-8 px-2 rounded border bg-transparent text-xs";
  const border = { borderColor: "hsl(var(--hairline))" };
  const set = (fn: () => void) => app.mutatePlans(fn);

  return (
    <div className="export-settings p-3 space-y-5 text-xs">
      <Section title="CAD-Blätter">
        <div className="text-[11px] text-muted-foreground leading-snug">
          Antippen platziert das Blatt auf dieser Seite. Ausschnitte bleiben verknüpft und aktualisieren sich automatisch.
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

      <SettingsSection title="SEITENEINSTELLUNGEN">
        <SettingsRow label="Seitentitel">
          <input key={plan.id + plan.name} defaultValue={plan.name} className={settingsFieldClass} style={settingsBorder}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== plan.name) set(() => pm.renamePlan(plan.id, v)); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
        </SettingsRow>
        <SettingsRow label="Format">
          <SettingsSelect value={plan.formatKey}
            options={[...PaperFormats.filter(f => ["a5", "a4", "a3", "a2"].includes(f.key)).map(f => ({ value: f.key, label: `${f.label} (${f.width} × ${f.height} mm)` })), { value: "free", label: "Freies Format" }]}
            onChange={(v) => set(() => pm.setFormat(plan.id, { formatKey: v }))} />
        </SettingsRow>
        {plan.formatKey === "free" ? (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <label>Breite (mm)<input type="number" min={10} key={"w" + plan.freeWidth} defaultValue={plan.freeWidth} className={settingsFieldClass} style={settingsBorder}
              onBlur={(e) => set(() => pm.setFormat(plan.id, { freeWidth: Number(e.target.value) }))} /></label>
            <label>Höhe (mm)<input type="number" min={10} key={"h" + plan.freeHeight} defaultValue={plan.freeHeight} className={settingsFieldClass} style={settingsBorder}
              onBlur={(e) => set(() => pm.setFormat(plan.id, { freeHeight: Number(e.target.value) }))} /></label>
          </div>
        ) : (
          <SettingsRow label="Ausrichtung">
            <OrientationButtons landscape={plan.landscape} onChange={(v) => set(() => pm.setFormat(plan.id, { landscape: v }))} />
          </SettingsRow>
        )}
        <SettingsRow label="Ränder">
          <MarginsField value={plan.marginsMm} onChange={(v) => set(() => pm.setPageSettings(plan.id, { marginsMm: v }))} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="ABHEFTUNG">
        <SettingsRow label="Lochung">
          <SettingsSelect value={plan.holePattern} options={HOLE_PATTERN_OPTIONS.map(o => ({ value: o.key, label: o.label }))}
            onChange={(v) => set(() => pm.setPageSettings(plan.id, { holePattern: v }))} />
        </SettingsRow>
        <SettingsRow label="Position">
          <SettingsSelect value={plan.holePunchSide} disabled={plan.holePattern === "none"}
            options={[{ value: "left", label: "Links" }, { value: "right", label: "Rechts" }, { value: "top", label: "Oben" }, { value: "bottom", label: "Unten" }] as { value: HolePunchSide; label: string }[]}
            onChange={(v) => set(() => pm.setPageSettings(plan.id, { holePunchSide: v }))} />
        </SettingsRow>
        <div className="text-[10px] text-muted-foreground">Nur Hilfsanzeige mit Fangpunkten – erscheint nie in der PDF.</div>
      </SettingsSection>

      <SettingsSection title="SEITENANSICHT (VERBUND)">
        {!inSpread ? (
          <>
            <div className="text-[11px] text-muted-foreground">Einzelseite. Mit einer benachbarten Seite verbinden, um eine zusammenhängende Seitenansicht zu erhalten.</div>
            <div className="flex gap-2">
              <SettingsButton disabled={!prev || (!!prev.spreadId && !!plan.spreadId)} onClick={() => prev && set(() => pm.linkSpread(prev.id, plan.id))}>
                <Link2 size={12} /> {prev?.spreadId ? "an vorherigen Verbund" : "vorherige"}
              </SettingsButton>
              <SettingsButton disabled={!next} onClick={() => next && set(() => pm.linkSpread(plan.id, next.id))}>
                <Link2 size={12} /> {next?.spreadId ? "an nächsten Verbund" : "nächste"}
              </SettingsButton>
            </div>
          </>
        ) : (
          <>
            <div className="text-[11px] text-muted-foreground">
              Teil eines Verbunds aus <strong>{members.length}</strong> Seiten (Position {members.findIndex(m => m.id === plan.id) + 1}). In der PDF wird der Verbund zu einer gemeinsamen Seite.
            </div>
            <SettingsRow label="Layout">
              <SettingsSelect value={pm.getSpreadLayoutMode(plan.spreadId)}
                options={[{ value: "grid", label: "Nebeneinander" }, { value: "free", label: "Freie Anordnung" }] as { value: SpreadLayoutMode; label: string }[]}
                onChange={(v) => set(() => pm.setSpreadLayoutMode(plan.spreadId!, v))} />
            </SettingsRow>
            {pm.getSpreadLayoutMode(plan.spreadId) === "free" && (
              <>
                <SettingsButton onClick={() => { app.spreadLayoutEditing = !app.spreadLayoutEditing; app.refreshPlanUI(); }}>
                  {app.spreadLayoutEditing ? <><Check size={12} /> Anordnung fixieren</> : <><MoveIcon size={12} /> Seitenanordnung bearbeiten</>}
                </SettingsButton>
                <div className="text-[10px] text-muted-foreground">
                  {app.spreadLayoutEditing
                    ? "Eckpunkt der aktiven Seite antippen und verschieben; „✓ Fixieren“ oder Enter übernimmt die Lage."
                    : "Verschiebbar ist immer nur die aktive Seite. Nachbarseite antippen wählt sie aus."}
                </div>
              </>
            )}
            {next && !next.spreadId && (
              <SettingsButton onClick={() => set(() => pm.linkSpread(plan.id, next.id))}><Link2 size={12} /> Nächste Seite anfügen</SettingsButton>
            )}
            <SettingsButton onClick={() => set(() => pm.resetSpreadLayout(plan.spreadId!))}><RotateCcw size={12} /> Anordnung zurücksetzen</SettingsButton>
            <SettingsButton onClick={() => set(() => pm.unlinkFromSpread(plan.id))}><Link2Off size={12} /> Aus Verbund lösen</SettingsButton>
          </>
        )}
      </SettingsSection>

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
    </div>
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
