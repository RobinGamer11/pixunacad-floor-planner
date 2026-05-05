import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { WallToolSettings } from "@/cad/WallTool";
import { Defaults } from "@/cad/constants";

interface Props { app: CadApp | null; }

export const WallSettingsPanel: React.FC<Props> = ({ app }) => {
  const [, force] = useState(0);
  useEffect(() => {
    // Re-render when tool re-activates – cheap polling not needed; settings live on tool object.
  }, [app]);

  if (!app) return null;
  const s: WallToolSettings = app.wallTool.settings;

  const update = (patch: Partial<WallToolSettings>) => {
    Object.assign(app.wallTool.settings, patch);
    force(x => x + 1);
  };

  const setKind = (kind: "outer" | "inner") => {
    const patch: Partial<WallToolSettings> = { kind };
    if (s.fillColorAuto) {
      patch.fillColor = kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner;
    }
    update(patch);
  };

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        Wand
      </div>

      {/* Außen / Innen */}
      <div className="flex gap-1 mb-3">
        <button
          type="button"
          onClick={() => setKind("outer")}
          className={`cad-toolbar-btn flex-1 justify-center h-9 ${s.kind === "outer" ? "active" : ""}`}
          title="Außenwand (höhere Priorität)"
        >
          <span className="text-xs font-semibold">AW</span>
        </button>
        <button
          type="button"
          onClick={() => setKind("inner")}
          className={`cad-toolbar-btn flex-1 justify-center h-9 ${s.kind === "inner" ? "active" : ""}`}
          title="Innenwand"
        >
          <span className="text-xs font-semibold">IW</span>
        </button>
      </div>

      <div className="space-y-3">
        {/* Bezugsseite */}
        <div>
          <label>Bezugsseite</label>
          <div className="flex gap-1">
            {(["outer", "center", "inner"] as const).map(side => (
              <button
                key={side}
                type="button"
                onClick={() => update({ referenceSide: side })}
                className={`cad-toolbar-btn flex-1 justify-center h-8 ${s.referenceSide === side ? "active" : ""}`}
              >
                <span className="text-[11px]">{side === "outer" ? "Außen" : side === "center" ? "Mitte" : "Innen"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ID-Name */}
        <div>
          <label>ID-Name (optional)</label>
          <input
            type="text"
            value={s.customName}
            onChange={e => update({ customName: e.target.value })}
            placeholder={s.kind === "outer" ? "z. B. AW01" : "z. B. IW01"}
            className="w-full"
          />
        </div>

        {/* Default-Dicken */}
        <div>
          <label>Dicke Außenwand (m)</label>
          <input
            type="number" step="0.005" min="0.01"
            value={s.thicknessOuterM}
            onChange={e => update({ thicknessOuterM: Math.max(0.001, parseFloat(e.target.value) || 0) })}
          />
        </div>
        <div>
          <label>Dicke Innenwand (m)</label>
          <input
            type="number" step="0.005" min="0.01"
            value={s.thicknessInnerM}
            onChange={e => update({ thicknessInnerM: Math.max(0.001, parseFloat(e.target.value) || 0) })}
          />
        </div>

        {/* Override */}
        <div>
          <label>Override-Dicke (m, leer = Default)</label>
          <input
            type="number" step="0.005" min="0"
            value={s.thicknessOverrideM ?? ""}
            placeholder="—"
            onChange={e => {
              const val = e.target.value === "" ? null : parseFloat(e.target.value);
              update({ thicknessOverrideM: val != null && val > 0 ? val : null });
            }}
          />
        </div>

        {/* Linienfarbe */}
        <div>
          <label>Linienfarbe</label>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: s.color }} />
            <input type="color" value={s.color} onChange={e => update({ color: e.target.value })}
              className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
          </div>
        </div>

        {/* Flächenfarbe (Füllung) */}
        <div>
          <label>Flächenfarbe</label>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: s.fillColor }} />
            <input
              type="color"
              value={s.fillColor}
              onChange={e => update({ fillColor: e.target.value, fillColorAuto: false })}
              className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent"
            />
            <button
              type="button"
              onClick={() => update({
                fillColor: s.kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner,
                fillColorAuto: true,
              })}
              className="cad-toolbar-btn h-7 px-2 text-[11px]"
              title="Standard (dunkelgrau / hellgrau)"
            >
              Standard
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 text-[11px]" style={{ borderTop: "1px solid hsl(var(--border))", color: "hsl(var(--cad-toolbar-muted))" }}>
        Klick: Eckpunkt setzen · Doppelklick: Wand abschließen · Shift: Ortho
      </div>
    </div>
  );
};
