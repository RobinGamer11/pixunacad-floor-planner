import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import { SquareDashed, BoxSelect, SquareDashedMousePointer } from "lucide-react";
import { formatObjectId, objectDisplayName } from "@/cad/objectMeta";
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

/** Liste aller ausgewählten Objekte: Klick = nur dieses, Shift-Klick = hinzufügen/entfernen. */
const SelectedList: React.FC<{ app: any }> = ({ app }) => {
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0; let last = "";
    const tick = () => {
      const k = (app.selectTool.marqueeSelectedIds || []).map((m: any) => m.kind + m.id).join();
      if (k !== last) { last = k; force((x) => x + 1); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app]);
  const st = app.selectTool;
  const list: { kind: string; id: string }[] = st.marqueeSelectedIds || [];
  const objOf = (m: { kind: string; id: string }) => (st as any)._getElementById?.(m.kind, m.id);
  const [anchor, setAnchor] = useState<string | null>(null);

  const click = (e: React.MouseEvent, m: { kind: string; id: string }) => {
    const key = m.kind + ":" + m.id;
    if (e.shiftKey) {
      // Shift: Bereich ab dem letzten angeklickten Eintrag zusätzlich markieren.
      const keys = list.map((x) => x.kind + ":" + x.id);
      const a = anchor ? keys.indexOf(anchor) : -1;
      if (a >= 0) {
        const b = keys.indexOf(key);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        st.marqueeSelectedIds = list.slice(lo, hi + 1);
      }
      setAnchor(key);
      app.renderer?.render?.();
      return;
    }
    setAnchor(key);
    st.marqueeSelectedIds = [m];
    st.syncPrimarySelection?.();
    if (m.kind === "infobox") infoBoxUi.select(m.id); else infoBoxUi.clear();
    app.renderer?.render?.();
  };

  return (
    <div className="max-h-56 overflow-y-auto rounded-md border" style={{ borderColor: "hsl(var(--border))" }}>
      {list.map((m) => {
        const o = objOf(m);
        if (!o) return null;
        const type = OBJECT_TYPE_LABELS[objectTypeKey(m.kind, o)] || m.kind;
        let id = ""; try { id = formatObjectId(m.kind, o); } catch { /* */ }
        const name = (() => { try { return objectDisplayName(m.kind, o); } catch { return type; } })();
        return (
          <button key={m.kind + m.id} type="button" onClick={(e) => click(e, m)}
            className="flex w-full items-center gap-2 border-b px-2 py-1.5 text-left text-[11px] last:border-b-0 hover:bg-muted"
            style={{ borderColor: "hsl(var(--border))", background: anchor === m.kind + ":" + m.id ? "hsl(var(--muted))" : undefined }}
            title="Klick: nur dieses Objekt auswählen · Shift-Klick: Bereich auswählen">
            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
            <span className="shrink-0 text-[10px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{type}{id ? ` · ${id}` : ""}</span>
          </button>
        );
      })}
    </div>
  );
};
