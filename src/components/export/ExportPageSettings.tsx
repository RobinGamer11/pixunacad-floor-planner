import React from "react";
import type { CadApp } from "@/cad/CadApp";
import { PaperFormats } from "@/cad/PlanManager";
import { usePlanUi } from "./useExportApp";
import { HOLE_PATTERN_OPTIONS, type HolePunchSide } from "@/cad/pageGuides";
import type { SpreadLayoutMode } from "@/cad/PlanManager";
import { SettingsSection, SettingsRow, SettingsSelect, OrientationButtons, MarginsField, SettingsButton, settingsFieldClass, settingsBorder } from "@/components/pageSettings/PageSettingsParts";
import { SheetPreviewThumb } from "./SheetPreviewThumb";
import { ChevronDown } from "lucide-react";
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
  // Auswahl der zu platzierenden Zeichnung (nur lokal, nie Projektdaten).
  const [picked, setPicked] = React.useState<string | null>(null);
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
  const pickedId = picked && sheets.some(s => s.id === picked) ? picked : (sheets[0]?.id ?? null);

  return (
    <div className="export-settings p-3 space-y-3 text-xs">
      <DarkCard title="Zeichnung platzieren">
        {sheets.length === 0 ? (
          <div className="text-[11px]" style={D.muted}>Noch kein CAD-Blatt vorhanden.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {sheets.map(s => {
              const active = s.id === pickedId;
              return (
                <button key={s.id} type="button" aria-pressed={active} title={s.name}
                  onClick={() => setPicked(s.id)}
                  className="relative rounded-md border-2 p-1 text-left transition-colors"
                  style={{ borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--overlay-surface) / 0.14)", background: "hsl(var(--overlay-surface) / 0.05)" }}>
                  <div className="h-16 w-full overflow-hidden rounded-sm" style={{ background: "hsl(var(--overlay-surface) / 0.94)" }}>
                    <SheetPreviewThumb app={app} sheetId={s.id} revision={app.contentRevision} />
                  </div>
                  <div className="mt-1 truncate px-0.5 text-[11px]" style={{ color: active ? "hsl(var(--accent-gold))" : "hsl(var(--overlay-surface))" }}>{s.name}</div>
                  {active && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--overlay-ink))" }}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <button type="button" disabled={!pickedId}
          onClick={() => pickedId && app.placeSheetOnActivePlan(pickedId)}
          className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md text-xs font-semibold disabled:opacity-40"
          style={D.gold}>
          <Plus size={14} /> Auf Seite platzieren
        </button>
        <div className="mt-2 text-[10px]" style={D.muted}>Änderungen im CAD werden übernommen.</div>
      </DarkCard>

      <DarkCard title="Seite einrichten">
        <DarkRow label="Seitentitel">
          <input key={plan.id + plan.name} defaultValue={plan.name} className={darkField} style={D.field}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== plan.name) set(() => pm.renamePlan(plan.id, v)); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
        </DarkRow>
        <DarkRow label="Papierformat">
          <select value={plan.formatKey} className={darkField} style={D.field}
            onChange={(e) => set(() => pm.setFormat(plan.id, { formatKey: e.target.value }))}>
            {[...PaperFormats.filter(f => ["a5", "a4", "a3", "a2"].includes(f.key)).map(f => ({ value: f.key, label: `${f.label} (${f.width} × ${f.height} mm)` })), { value: "free", label: "Freies Format" }]
              .map(o => <option key={o.value} value={o.value} style={{ color: "initial" }}>{o.label}</option>)}
          </select>
        </DarkRow>
        {plan.formatKey === "free" && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <label style={D.muted}>Breite (mm)<input type="number" min={10} key={"w" + plan.freeWidth} defaultValue={plan.freeWidth} className={darkField} style={D.field}
              onBlur={(e) => set(() => pm.setFormat(plan.id, { freeWidth: Number(e.target.value) }))} /></label>
            <label style={D.muted}>Höhe (mm)<input type="number" min={10} key={"h" + plan.freeHeight} defaultValue={plan.freeHeight} className={darkField} style={D.field}
              onBlur={(e) => set(() => pm.setFormat(plan.id, { freeHeight: Number(e.target.value) }))} /></label>
          </div>
        )}
        {plan.formatKey !== "free" && (
          <DarkRow label="Ausrichtung">
            <div className="grid grid-cols-2 gap-1.5">
              {([[false, "Hochformat"], [true, "Querformat"]] as const).map(([land, label]) => {
                const active = plan.landscape === land;
                return (
                  <button key={label} type="button" aria-pressed={active}
                    onClick={() => set(() => pm.setFormat(plan.id, { landscape: land }))}
                    className="flex h-8 items-center justify-center gap-1.5 rounded-md border text-[11px]"
                    style={active ? D.gold : D.field}>
                    <span className="inline-block rounded-[2px] border" style={{ width: land ? 13 : 9, height: land ? 9 : 13, borderColor: "currentColor" }} />
                    {label}
                  </button>
                );
              })}
            </div>
          </DarkRow>
        )}
        <DarkRow label="Seitenränder">
          <div className="flex items-center gap-1.5">
            <input type="number" min={0} step={1} key={"m" + plan.marginsMm} defaultValue={plan.marginsMm} className={darkField} style={D.field}
              onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== plan.marginsMm) set(() => pm.setPageSettings(plan.id, { marginsMm: v })); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
            <span className="text-[11px]" style={D.muted}>mm</span>
          </div>
        </DarkRow>
      </DarkCard>

      <DarkCollapse title="Abheftung">
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
      </DarkCollapse>

      <DarkCollapse title="Seiten verbinden">
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
      </DarkCollapse>

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

/** Dunkler PixunaCAD-Kartenstil mit warmem Gold für aktive Elemente. */
const D = {
  card: { background: "hsl(var(--overlay-ink) / 0.94)", color: "hsl(var(--overlay-surface))", borderColor: "hsl(var(--overlay-surface) / 0.14)" } as React.CSSProperties,
  field: { background: "hsl(var(--overlay-surface) / 0.07)", borderColor: "hsl(var(--overlay-surface) / 0.18)", color: "hsl(var(--overlay-surface))" } as React.CSSProperties,
  muted: { color: "hsl(var(--overlay-surface) / 0.62)" } as React.CSSProperties,
  gold: { background: "hsl(var(--accent-gold))", borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--overlay-ink))" } as React.CSSProperties,
};
const darkField = "w-full h-8 px-2 rounded-md border text-xs outline-none focus:ring-1 focus:ring-[hsl(var(--accent-gold))]";

function DarkCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3" style={D.card}>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--accent-gold))" }}>{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function DarkRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-2 text-[11px]">
      <span className="truncate" style={D.muted}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DarkCollapse({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-lg border" style={D.card}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: open ? "hsl(var(--accent-gold))" : "hsl(var(--overlay-surface))" }}>
        {title}
        <ChevronDown size={14} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div className="export-dark-collapse space-y-3 border-t px-3 pb-3 pt-3" style={{ borderColor: "hsl(var(--overlay-surface) / 0.14)", color: "hsl(var(--overlay-surface))", ["--muted-foreground" as any]: "var(--overlay-surface)", ["--foreground" as any]: "var(--overlay-surface)", ["--hairline" as any]: "var(--overlay-surface)" }}>{children}</div>
      )}
    </div>
  );
}
