import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { MiniCad } from "@/cad/embed/MiniCad";
import { SquareDashed, BoxSelect } from "lucide-react";

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
        </div>

        {count > 0 && (
          <div className="space-y-2">
            <div className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
              {count} Element{count === 1 ? "" : "e"} ausgewählt
            </div>
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
