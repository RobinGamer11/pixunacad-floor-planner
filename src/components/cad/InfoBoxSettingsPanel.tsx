/**
 * Einstellungen der gewählten Infobox bzw. des Entwurfs (Darstellung | Info).
 * Erst die erste Eingabe setzt den Entwurf als Objekt (ein Undo-Schritt).
 */
import React from "react";
import { Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { AttachmentsSection } from "@/components/cad/ObjectInfoTabs";
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
  const base = box ?? { kind: "info", status: "open", title: "", desc: "", sizePx: 180, sizeM: 0.5, labelId: app.activeDrawLabelId };

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
          <CategoryPicker app={app} value={base.categoryId ?? null} onChange={(id) => update({ categoryId: id })} />
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
          <SpotPreview app={app} x={box ? box.x : ui.draft!.x} y={box ? box.y : ui.draft!.y}
            on={base.showPreview !== false} onToggle={() => update({ showPreview: base.showPreview === false })} />
          <div className="flex items-end gap-2 pt-1">
            <label className="block flex-1">
              <span className="mb-1 block">Breite (m)</span>
              <input type="number" min={0.1} max={10} step={0.05} className={inputCls} value={base.sizeM ?? 0.5}
                onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); if (n >= 0.1 && n <= 10) update({ sizeM: n }); }} />
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
          {box && <AttachmentsSection app={app} obj={box} />}
        </div>
      )}
    </div>
  );
}

const DEFAULT_COLORS = ["#c9a96e", "#3b82f6", "#16a34a", "#dc2626", "#9333ea", "#ea580c"];

/** Kategorie wählen, neu anlegen (Name + Farbe) oder löschen – je Blatt. */
function CategoryPicker({ app, value, onChange }: { app: any; value: string | null; onChange: (id: string | null) => void }) {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(DEFAULT_COLORS[0]);
  const cats: any[] = app.scene?.infoBoxCategories || [];
  const cur = cats.find((c) => c.id === value) || null;

  const add = () => {
    const n = name.trim();
    if (!n) return;
    const id = `cat${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    app.runAction(() => { app.scene.infoBoxCategories = [...cats, { id, name: n, color }]; });
    setAdding(false); setName("");
    onChange(id);
  };
  const del = () => {
    if (!cur) return;
    app.runAction(() => {
      app.scene.infoBoxCategories = cats.filter((c) => c.id !== cur.id);
      for (const b of app.scene.infoBoxes || []) if (b.categoryId === cur.id) b.categoryId = null;
    });
    force();
  };

  return (
    <div className="space-y-2">
      <span className="block">Kategorie</span>
      <div className="flex gap-2">
        <select className="cad-settings-select h-9 min-w-0 flex-1 px-2 text-[12px]" value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Keine Kategorie</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {cur && <span className="h-9 w-3 shrink-0 rounded" style={{ background: cur.color }} />}
        <button type="button" title="Neue Kategorie" className="cad-toolbar-btn h-9 w-9 justify-center p-0" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-4 w-4" />
        </button>
        {cur && (
          <button type="button" title="Kategorie löschen" className="cad-toolbar-btn h-9 w-9 justify-center p-0" onClick={del}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {adding && (
        <div className="space-y-2 rounded-md border p-2" style={{ borderColor: "hsl(var(--cad-hub-border))" }}>
          <input className={inputCls} value={name} placeholder="Name der Kategorie" autoFocus
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <div className="flex items-center gap-1.5">
            {DEFAULT_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Farbe ${c}`} onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full" style={{ background: c, boxShadow: color === c ? "0 0 0 2px hsl(var(--foreground))" : undefined }} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-6 w-8 cursor-pointer" title="Eigene Farbe" />
            <button type="button" onClick={add} disabled={!name.trim()} className="cad-toolbar-btn ml-auto h-8 px-3 text-[12px] font-semibold">Anlegen</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ausschnitt der Zeichenfläche an der Stelle der Infobox (Augensymbol schaltet). */
function SpotPreview({ app, x, y, on, onToggle }: { app: any; x: number; y: number; on: boolean; onToggle: () => void }) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const [inView, setInView] = React.useState(true);
  React.useEffect(() => {
    if (!on) return;
    let raf = 0;
    const draw = () => {
      const c = ref.current, src: HTMLCanvasElement | undefined = app?.canvas, cam = app?.camera;
      if (c && src && cam) {
        const p = cam.worldToScreen(x, y);
        const k = src.width / Math.max(1, src.clientWidth || src.width);
        const half = 90;
        const ok = p.x > -half && p.y > -half && p.x < (src.clientWidth || 0) + half && p.y < (src.clientHeight || 0) + half;
        setInView(ok);
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          if (ok) ctx.drawImage(src, (p.x - half) * k, (p.y - half * 0.6) * k, half * 2 * k, half * 1.2 * k, 0, 0, c.width, c.height);
          ctx.strokeStyle = "#c9a96e"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2, 6, 0, Math.PI * 2); ctx.stroke();
        }
      }
      raf = window.setTimeout(() => requestAnimationFrame(draw), 250) as any;
    };
    draw();
    return () => window.clearTimeout(raf);
  }, [app, x, y, on]);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span>Vorschau der Stelle</span>
        <button type="button" onClick={onToggle} title={on ? "Vorschau ausblenden" : "Vorschau einblenden"} className="cad-toolbar-btn h-7 w-7 justify-center p-0">
          {on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>
      {on && (
        <div className="relative overflow-hidden rounded-md border" style={{ borderColor: "hsl(var(--cad-hub-border))", background: "hsl(var(--card))" }}>
          <canvas ref={ref} width={360} height={216} className="block h-auto w-full" />
          {!inView && <div className="absolute inset-0 flex items-center justify-center text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Stelle liegt außerhalb der Ansicht</div>}
        </div>
      )}
    </div>
  );
}
