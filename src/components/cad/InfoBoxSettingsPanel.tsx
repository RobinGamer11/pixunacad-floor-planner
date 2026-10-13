/**
 * Einstellungen der gewählten Infobox bzw. des Entwurfs (Darstellung | Info).
 * Erst die erste Eingabe setzt den Entwurf als Objekt (ein Undo-Schritt).
 */
import React from "react";
import { Trash2, X } from "lucide-react";
import { infoBoxUi, initialsOf, useInfoBoxUi } from "@/lib/infoBoxUi";
import { useAuth } from "@/components/auth/AuthProvider";
import { ensureObjectCode, formatObjectId, setObjectName } from "@/cad/objectMeta";

const inputCls = "cad-settings-input w-full h-9 text-[12px] px-3";

function scenesOf(app: any): any[] {
  const out: any[] = [];
  try { for (const s of app.scenesById?.values?.() || []) out.push(s); } catch { /* */ }
  if (app.scene && !out.includes(app.scene)) out.push(app.scene);
  return out;
}

export default function InfoBoxSettingsPanel({ app }: { app: any }) {
  const ui = useInfoBoxUi();
  const auth = useAuth() as any;
  const [tab, setTab] = React.useState<"look" | "info">("look");
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const box: any = ui.selectedId ? app?.scene?.getInfoBoxById?.(ui.selectedId) : null;

  // Undo/Blattwechsel kann die Box entfernen.
  React.useEffect(() => {
    if (!ui.selectedId) return;
    const t = window.setInterval(() => {
      if (!app?.scene?.getInfoBoxById?.(ui.selectedId!)) infoBoxUi.clear(); else force();
    }, 300);
    return () => window.clearInterval(t);
  }, [app, ui.selectedId]);

  if (!app || (!box && !ui.draft)) return null;

  const user = auth?.session?.user;
  const initials = initialsOf(user?.user_metadata?.display_name || user?.user_metadata?.name || user?.email);
  const base = box ?? { kind: "info", status: "open", title: "", desc: "", sizePx: 180, labelId: app.activeDrawLabelId };

  const labelOk = (id: string) => app.labelManager?.isEditable?.(id) !== false;
  const drawLabel = () => {
    const cur = app.activeDrawLabelId;
    if (labelOk(cur)) return cur;
    return app.labelManager?.list?.().find((g: any) => labelOk(g.id))?.id ?? cur;
  };

  /** Ändert die Box; ein Entwurf wird dabei als Objekt gesetzt. */
  const update = (patch: Record<string, any>, commit = true) => {
    if (box) {
      Object.assign(box, patch);
      if (commit) app.commitHistorySnapshot?.();
      app.renderer?.render?.();
      force();
      return;
    }
    const d = ui.draft!;
    const made = app.runAction(() => {
      const b = app.scene.createInfoBox({ x: d.x, y: d.y, labelId: drawLabel(), authorInitials: initials, kind: base.kind, ...patch });
      ensureObjectCode(scenesOf(app), "infobox", b);
      return b;
    });
    if (made) infoBoxUi.select(made.id);
  };

  const remove = () => {
    if (!box) { infoBoxUi.clear(); return; }
    app.runAction(() => app.scene.removeInfoBox(box));
    infoBoxUi.clear();
    app.renderer?.render?.();
  };

  const kindBtn = (k: "info" | "task", label: string) => (
    <button
      type="button"
      onClick={() => update({ kind: k })}
      className="h-11 flex-1 rounded-md border text-[13px] font-semibold"
      style={base.kind === k
        ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", borderColor: "hsl(var(--primary))" }
        : { borderColor: "hsl(var(--cad-hub-border))" }}
    >{label}</button>
  );
  const statusBtn = (s: "open" | "done", label: string, v: string) => (
    <button
      type="button"
      onClick={() => update({ status: s })}
      className="h-9 flex-1 rounded-md border text-[12px] font-semibold"
      style={base.status === s
        ? { background: `hsl(var(${v}))`, color: "hsl(0 0% 100%)", borderColor: `hsl(var(${v}))` }
        : { borderColor: "hsl(var(--cad-hub-border))", color: `hsl(var(${v}))` }}
    >{label}</button>
  );

  const tabBtn = (t: "look" | "info", label: string) => (
    <button type="button" onClick={() => setTab(t)}
      className="flex-1 pb-1.5 text-[12.5px] font-semibold"
      style={{ borderBottom: tab === t ? "2px solid hsl(var(--accent-gold))" : "2px solid transparent", color: tab === t ? undefined : "hsl(var(--cad-toolbar-muted))" }}
    >{label}</button>
  );

  return (
    <div className="space-y-3 p-1 text-[12px]">
      <div className="flex items-start gap-2 pt-2">
        <div className="min-w-0 flex-1 text-center text-[13px] font-semibold truncate">
          {box ? formatObjectId("infobox", box) : "Neue Infobox"}
        </div>
        <button type="button" title="Schließen (Esc)" className="cad-toolbar-btn h-7 w-7 justify-center p-0" onClick={() => infoBoxUi.clear()}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2">{tabBtn("look", "Darstellung")}{tabBtn("info", "Info")}</div>

      {tab === "look" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block">Ebene</span>
            <select className="cad-settings-select w-full h-9 text-[12px] px-2" value={base.labelId || ""}
              onChange={(e) => { if (box) update({ labelId: e.target.value }); else { app.setActiveDrawLabelId?.(e.target.value); force(); } }}>
              {(app.labelManager?.list?.() || []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <div className="flex gap-2">{kindBtn("info", "Information")}{kindBtn("task", "Aufgabe")}</div>
          {base.kind === "task" && (
            <div className="flex gap-2">{statusBtn("open", "Offen", "--infobox-open")}{statusBtn("done", "Erledigt", "--infobox-done")}</div>
          )}
          <label className="block">
            <span className="mb-1 block">Titel</span>
            <input className={inputCls} value={base.title} placeholder="Titel"
              onChange={(e) => update({ title: e.target.value }, false)}
              onBlur={() => box && app.commitHistorySnapshot?.()} />
          </label>
          <label className="block">
            <span className="mb-1 block">Beschreibung</span>
            <textarea className="cad-settings-input w-full min-h-[96px] text-[12px] px-3 py-2" value={base.desc} placeholder="Beschreibung"
              onChange={(e) => update({ desc: e.target.value }, false)}
              onBlur={() => box && app.commitHistorySnapshot?.()} />
          </label>
          <div className="flex items-end gap-2 pt-1">
            <label className="block flex-1">
              <span className="mb-1 block">Größe (px)</span>
              <input type="number" min={120} max={480} step={10} className={inputCls} value={base.sizePx}
                onChange={(e) => { const n = parseFloat(e.target.value); if (n >= 120 && n <= 480) update({ sizePx: n }); }} />
            </label>
            <button type="button" onClick={remove} title="Infobox löschen"
              className="cad-toolbar-btn h-9 gap-1.5 px-3 justify-center">
              <Trash2 className="h-4 w-4" /> Löschen
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {!box ? (
            <p style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Erst Titel oder Beschreibung eingeben, dann wird die Infobox gesetzt.</p>
          ) : (
            <label className="block">
              <span className="mb-1 block">Name</span>
              <input className={inputCls} value={box.objName || ""} placeholder="Infobox"
                onChange={(e) => { setObjectName(scenesOf(app), "infobox", box, e.target.value); force(); }}
                onBlur={() => app.commitHistorySnapshot?.()} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
