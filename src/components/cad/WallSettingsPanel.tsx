import React, { useEffect, useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { WallToolSettings } from "@/cad/WallTool";
import { Defaults } from "@/cad/constants";
import { HATCH_PATTERNS } from "@/cad/hatchPatterns";
import { runWallTopologyMaintenance } from "@/cad/wallTopologyMaintenance";
import { RasterModeToggle } from "@/components/cad/RasterModeToggle";

/** Typische Wand-Baustoffe (Schraffur skaliert automatisch mit der Wanddicke). */
const WALL_PATTERNS = HATCH_PATTERNS.filter(p =>
  ["mauerwerk", "stahlbeton", "ziegelverband", "holz", "daemmung_hart", "daemmung_weich", "xps"].includes(p.id),
);

const HAIRLINE = "hsl(var(--hairline))";

interface Props { app: CadApp | null; projectId?: string; }


export const WallSettingsPanel: React.FC<Props> = ({ app }) => {
  const [, force] = useState(0);
  const rerender = () => force(x => x + 1);

  useEffect(() => {
    if (!app) return;
    const prevSel = app.onSelectionChange;
    const prevLab = app.onLabelsChange;
    app.onSelectionChange = () => { prevSel?.(); rerender(); };
    app.onLabelsChange = () => { prevLab?.(); rerender(); };
    return () => {
      app.onSelectionChange = prevSel;
      app.onLabelsChange = prevLab;
    };
  }, [app]);

  if (!app) return null;
  const selectedWall = app.getSelectedWall();
  const s: WallToolSettings = app.wallTool.settings;
  const labels = app.labelManager.list();

  // Active values: from selected wall if any, otherwise from tool defaults.
  const get = <K extends keyof WallToolSettings>(key: K): WallToolSettings[K] => {
    if (!selectedWall) return s[key];
    switch (key) {
      case "kind": return selectedWall.kind as any;
      case "referenceSide": return selectedWall.referenceSide as any;
      case "thicknessOverrideM": return selectedWall.thicknessM as any;
      case "color": return selectedWall.color as any;
      case "fillColor": return selectedWall.fillColor as any;
      case "labelId": return selectedWall.labelId as any;
      case "customName": return selectedWall.customName as any;
      default: return s[key];
    }
  };

  const update = (patch: Partial<WallToolSettings>) => {
    Object.assign(app.wallTool.settings, patch);
    rerender();
  };

  const updateSelected = (apply: () => void) => {
    if (!selectedWall) return;
    apply();
    runWallTopologyMaintenance(app.scene, [selectedWall]);
    rerender();
  };

  const setKind = (kind: "outer" | "inner") => {
    if (selectedWall) {
      updateSelected(() => {
        selectedWall.kind = kind;
        if (s.fillColorAuto) {
          selectedWall.fillColor = kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner;
        }
      });
      return;
    }
    const patch: Partial<WallToolSettings> = { kind };
    if (s.fillColorAuto) {
      patch.fillColor = kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner;
    }
    update(patch);
  };

  const setRef = (side: "outer" | "center" | "inner") => {
    if (selectedWall) {
      updateSelected(() => { selectedWall.referenceSide = side; });
    } else {
      update({ referenceSide: side });
    }
  };

  const setThickness = (val: number) => {
    const v = Math.max(0.001, val);
    if (selectedWall) {
      updateSelected(() => { selectedWall.thicknessM = v; });
    } else {
      // Eine gemeinsame Eingabe "Wanddicke": schreibt in die Dicke der aktuell
      // gewählten Wandart und hebt eine alte Override-Dicke auf.
      update(s.kind === "outer"
        ? { thicknessOuterM: v, thicknessOverrideM: null }
        : { thicknessInnerM: v, thicknessOverrideM: null });
    }
  };


  const setColor = (color: string) => {
    if (selectedWall) updateSelected(() => { selectedWall.color = color; });
    else update({ color });
  };

  const setFillColor = (fillColor: string) => {
    if (selectedWall) updateSelected(() => { selectedWall.fillColor = fillColor; });
    else update({ fillColor, fillColorAuto: false });
  };

  const setPattern = (patternId: string) => {
    if (selectedWall) updateSelected(() => { (selectedWall as any).patternId = patternId; });
    else update({ patternId } as any);
  };

  const setPatternScale = (patternScale: number) => {
    const val = Math.max(0.1, Math.min(10, patternScale || 1));
    if (selectedWall) updateSelected(() => { (selectedWall as any).patternScale = val; });
    else update({ patternScale: val } as any);
  };

  const setPatternAlign = (val: boolean) => {
    if (selectedWall) updateSelected(() => { (selectedWall as any).patternAlignToWall = val; });
    else update({ patternAlignToWall: val } as any);
  };

  const setLabel = (labelId: string) => {
    if (selectedWall) {
      updateSelected(() => { selectedWall.labelId = labelId; });
      app.refreshLabelUI();
    } else {
      update({ labelId });
    }
  };

  const kind = get("kind") as "outer" | "inner";
  const referenceSide = get("referenceSide") as "outer" | "center" | "inner";
  const color = get("color") as string;
  const fillColor = get("fillColor") as string;
  const labelId = (get("labelId") as string) || Defaults.defaultLabelId;
  const patternId = (selectedWall ? (selectedWall as any).patternId : (s as any).patternId) || "none";
  const patternScale = (selectedWall ? (selectedWall as any).patternScale : (s as any).patternScale) ?? 1;
  const patternAlign = !!(selectedWall ? (selectedWall as any).patternAlignToWall : (s as any).patternAlignToWall);
  const thicknessValue = selectedWall
    ? selectedWall.thicknessM
    : (s.thicknessOverrideM ?? (s.kind === "outer" ? s.thicknessOuterM : s.thicknessInnerM));

  return (
    <div className="cad-settings-panel mb-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-3" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
        {selectedWall ? "Wand bearbeiten" : "Wand"}
      </div>

      <div className="flex gap-1 mb-3">
        <button
          type="button"
          onClick={() => setKind("outer")}
          className={`cad-toolbar-btn flex-1 justify-center h-9 ${kind === "outer" ? "active" : ""}`}
          title="Außenwand (höhere Priorität)"
        >
          <span className="text-xs font-semibold">AW</span>
        </button>
        <button
          type="button"
          onClick={() => setKind("inner")}
          className={`cad-toolbar-btn flex-1 justify-center h-9 ${kind === "inner" ? "active" : ""}`}
          title="Innenwand"
        >
          <span className="text-xs font-semibold">IW</span>
        </button>
      </div>

      {!selectedWall && (
        <div className="mb-3">
          <label>Eingabemodus</label>
          <div className="flex gap-1">
            {(["chain", "single"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => update({ inputMode: m })}
                className={`cad-toolbar-btn flex-1 justify-center h-8 ${s.inputMode === m ? "active" : ""}`}
                title={m === "chain" ? "Polywand" : "Einzelwand"}
              >
                <span className="text-[11px]">{m === "chain" ? "Verkettet" : "Einzeln"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label>Bezugsseite</label>
          <div className="flex gap-1">
            {(["outer", "center", "inner"] as const).map(side => (
              <button
                key={side}
                type="button"
                onClick={() => setRef(side)}
                className={`cad-toolbar-btn flex-1 justify-center h-8 ${referenceSide === side ? "active" : ""}`}
              >
                <span className="text-[11px]">{side === "outer" ? "Außen" : side === "center" ? "Mitte" : "Innen"}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label>Ebene</label>
          <select
            value={labelId}
            onChange={e => setLabel(e.target.value)}
            className="cad-settings-select w-full"
          >
            {labels.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {!selectedWall && (
          <>
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
          </>
        )}

        {selectedWall && (
          <div>
            <label>Dicke (m)</label>
            <input
              type="number" step="0.005" min="0.01"
              value={thicknessValue}
              onChange={e => setThickness(parseFloat(e.target.value) || 0)}
            />
          </div>
        )}

        <div>
          <label>Baustoff-Schraffur</label>
          <select
            value={patternId}
            onChange={e => setPattern(e.target.value)}
            className="cad-settings-select w-full"
          >
            <option value="none">Ohne (nur Flächenfarbe)</option>
            {WALL_PATTERNS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {patternId !== "none" && (
            <>
              <div className="mt-2">
                <label>Musterdichte (1 = auto, an Wanddicke)</label>
                <input
                  type="number" step="0.05" min="0.1" max="10"
                  value={patternScale}
                  onChange={e => setPatternScale(parseFloat(e.target.value) || 1)}
                />
              </div>
              <label className="mt-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={patternAlign}
                  onChange={e => setPatternAlign(e.target.checked)}
                />
                <span className="text-[11px]">Muster an Wandrichtung drehen</span>
              </label>
              <div className="text-[10px] mt-1" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                Aus = einheitliche Musterrichtung bei allen Wänden.
              </div>
            </>
          )}
        </div>

        <div>
          <label>Linienfarbe</label>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: color }} />
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent" />
          </div>
        </div>

        <div>
          <label>Flächenfarbe</label>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border" style={{ borderColor: "hsl(var(--border))", background: fillColor }} />
            <input
              type="color"
              value={fillColor}
              onChange={e => setFillColor(e.target.value)}
              className="w-8 h-8 cursor-pointer border-0 p-0 bg-transparent"
            />
            <button
              type="button"
              onClick={() => {
                const def = kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner;
                if (selectedWall) updateSelected(() => { selectedWall.fillColor = def; });
                else update({ fillColor: def, fillColorAuto: true });
              }}
              className="cad-toolbar-btn h-7 px-2 text-[11px]"
              title="Standard (dunkelgrau / hellgrau)"
            >
              Standard
            </button>
          </div>
        </div>
      </div>

      {!selectedWall && (
        <div className="mt-3 pt-2 text-[11px]" style={{ borderTop: "1px solid hsl(var(--border))", color: "hsl(var(--cad-toolbar-muted))" }}>
          Klick: Eckpunkt setzen · Doppelklick: abschließen · Shift: Ortho<br />
          <b>Leertaste</b>: Bezugsseite wechseln · <b>B</b>: Bezugslinie koppeln
        </div>
      )}
    </div>
  );
};
