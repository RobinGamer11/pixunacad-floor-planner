import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import { SquareDashed, BoxSelect, SquareDashedMousePointer } from "lucide-react";
import { objectDisplayName } from "@/cad/objectMeta";
import { OBJECT_TYPE_LABELS, objectTypeKey } from "@/cad/selectionFilter";
import { infoBoxUi } from "@/lib/infoBoxUi";

interface Props { app: CadApp | MiniCad | null; }

/**
 * Einstellungspanel für das Auswahl-Werkzeug (CAD-Oberfläche).
 * Umschaltbare Rahmen-Auswahl analog zu Archicad:
 *   - "touch"   → Crossing (alle Elemente, die den Rahmen berühren)
 *   - "enclose" → Window   (nur Elemente, die vollständig im Rahmen liegen)
 */
export const SelectSettingsPanel: React.FC<Props> = ({ app }) => {
  const [mode, setMode] = useState<"touch" | "enclose" | "click">("touch");
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!app) return;
    setMode(app.selectTool.marqueeMode);
    setCount(app.selectTool.marqueeSelectedIds.length);
    // Kleiner Polling-Loop, damit die Anzahl live aktualisiert wird
    // (marqueeSelectedIds wird engine-intern gesetzt und triggert kein React-Update).
    let raf = 0;
    const tick = () => {
      setCount(app.selectTool.marqueeSelectedIds.length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app]);

  if (!app) return null;

  const setBoth = (m: "touch" | "enclose" | "click") => {
    app.selectTool.marqueeMode = m;
    setMode(m);
  };

  const clearSel = () => {
    app.selectTool.marqueeSelectedIds = [];
    setCount(0);
  };

  const deleteSel = () => {
    if (!app.selectTool.marqueeSelectedIds.length) return;
    app.selectTool.deleteMarqueeSelection();
    setCount(0);
  };

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3"
        style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        Auswahl
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-[11px] mb-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
            Rahmen-Modus
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setBoth("touch")}
              className="cad-toolbar-btn flex-1 justify-center h-9"
              style={mode === "touch" ? {
                background: "rgba(249,115,22,0.15)",
                borderColor: "rgba(249,115,22,0.9)",
                color: "rgba(249,115,22,1)",
              } : undefined}
              title="Crossing: alles was den Rahmen berührt"
            >
              <SquareDashed size={14} className="mr-1" />
              <span className="text-xs">Berühren</span>
            </button>
            <button
              type="button"
              onClick={() => setBoth("enclose")}
              className="cad-toolbar-btn flex-1 justify-center h-9"
              style={mode === "enclose" ? {
                background: "rgba(59,130,246,0.15)",
                borderColor: "rgba(59,130,246,0.9)",
                color: "rgba(59,130,246,1)",
              } : undefined}
              title="Window: nur vollständig umschlossene Elemente"
            >
              <BoxSelect size={14} className="mr-1" />
              <span className="text-xs">Umschließen</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const n = (app as any)?.selectAllInActiveCadPlan?.()
                ?? (app as any)?.selectAllObjects?.();
              if (typeof n === "number") setCount(n);
            }}
            className="cad-toolbar-btn w-full justify-center h-9 mt-1"
            title="Alles auswählen (Strg/Cmd + A)"
          >
            <SquareDashedMousePointer size={14} className="mr-1" />
            <span className="text-xs">Alles</span>
          </button>
        </div>


        {count > 0 && (
          <div className="space-y-2">
            <div className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              {count} Element{count === 1 ? "" : "e"} ausgewählt
            </div>
            <SelectedList app={app} />
            <div className="flex gap-1">
              <button type="button" onClick={deleteSel}
                className="cad-toolbar-btn flex-1 justify-center h-9">
                <span className="text-xs">Löschen (Entf)</span>
              </button>
              <button type="button" onClick={clearSel}
                className="cad-toolbar-btn flex-1 justify-center h-9">
                <span className="text-xs">Aufheben</span>
              </button>
            </div>
          </div>
        )}

        <div className="text-[11px] leading-relaxed pt-2"
          style={{ color: "hsl(var(--cad-toolbar-muted))", borderTop: "1px solid hsl(var(--border))" }}>
          Klick auf Leerraum + ziehen zieht einen Rahmen auf. Im Modus
          <b> Berühren</b> werden alle Elemente ausgewählt, die den Rahmen
          schneiden — im Modus <b>Umschließen</b> nur die vollständig innen liegenden.
          Mit <b>Entf</b> gemeinsam löschen.
        </div>
      </div>
    </div>
  );
};

/**
 * Liste der ausgewählten Objekte. Die Liste bleibt stehen, während man darin
 * klickt: Klick = nur dieses Objekt, Shift-Klick = hinzufügen/entfernen.
 * Erst eine neue Auswahl außerhalb der Liste erneuert sie.
 */
const SelectedList: React.FC<{ app: any }> = ({ app }) => {
  const st = app.selectTool;
  const keyOf = (l: any[]) => l.map((m) => m.kind + ":" + m.id).join();
  const [items, setItems] = useState<{ kind: string; id: string }[]>(() => [...(st.marqueeSelectedIds || [])]);
  const ownKey = React.useRef<string>(keyOf(st.marqueeSelectedIds || []));
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cur = st.marqueeSelectedIds || [];
      const k = keyOf(cur);
      if (k !== ownKey.current) { ownKey.current = k; setItems([...cur]); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app]);

  const selected = new Set((st.marqueeSelectedIds || []).map((m: any) => m.kind + ":" + m.id));
  const apply = (next: { kind: string; id: string }[]) => {
    st.marqueeSelectedIds = next;
    ownKey.current = keyOf(next);
    st.syncPrimarySelection?.();
    if (next.length === 1 && next[0].kind === "infobox") infoBoxUi.select(next[0].id); else infoBoxUi.clear();
    app.renderer?.render?.();
    force((x) => x + 1);
  };
  const click = (e: React.MouseEvent, m: { kind: string; id: string }) => {
    const key = m.kind + ":" + m.id;
    if (e.shiftKey) {
      const cur: any[] = st.marqueeSelectedIds || [];
      apply(selected.has(key) ? cur.filter((x) => x.kind + ":" + x.id !== key) : [...cur, m]);
    } else apply([m]);
  };

  return (
    <div className="max-h-56 overflow-y-auto rounded-md border" style={{ borderColor: "hsl(var(--border))" }}>
      {items.map((m) => {
        const o = st._getElementById?.(m.kind, m.id);
        if (!o) return null;
        const type = OBJECT_TYPE_LABELS[objectTypeKey(m.kind, o)] || m.kind;
        const name = (() => { try { return objectDisplayName(m.kind, o); } catch { return type; } })();
        const on = selected.has(m.kind + ":" + m.id);
        return (
          <button key={m.kind + m.id} type="button" onClick={(e) => click(e, m)}
            className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-[11px] last:border-b-0"
            style={{ borderColor: "hsl(var(--border))", background: on ? "hsl(var(--primary) / 0.12)" : undefined, opacity: on ? 1 : 0.6 }}
            title="Klick: nur dieses Objekt · Shift-Klick: hinzufügen/entfernen">
            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
            <span className="shrink-0 text-[10px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{type}{o.objCode ? ` · #${o.objCode}` : ""}</span>
          </button>
        );
      })}
    </div>
  );
};
