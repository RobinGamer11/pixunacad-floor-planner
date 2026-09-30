import React, { useState } from "react";
import type { CadApp } from "@/cad/CadApp";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SettingsToggleButton } from "@/components/cad/SettingsToggleButton";
import { ToolBtn, ColorAlphaRow } from "@/components/cad/DocumentFilterPanel";

/**
 * Eigenständiger Bereich „Hintergrund entfernen“ — sitzt direkt unter
 * „Bild spiegeln“ und ist bewusst NICHT Teil der Bildbearbeitung.
 *
 * Regeln:
 * - `enabled` = Bereich ein-/ausgeschaltet. Einschalten schneidet NICHTS weg.
 * - `hasMaskEdits` = einzige verlässliche Anwendungsmarkierung. Erst wenn
 *   automatisch erkannt, weggeklickt oder gepinselt wurde, maskiert der
 *   Renderer. Ausschalten behält Maske und Markierung.
 * - Reihenfolge: Aus/An → Genauigkeit → Automatisch erkennen →
 *   Wegklicken/Wiederherstellen → Pinsel → Maske zurücksetzen → Erweitert.
 */
export function BgRemoveSection({ app, docId, sig }: { app: CadApp | null; docId: string; sig?: string }) {
  void sig;
  const doc: any = app?.scene.getDocumentById(docId) || null;
  const [, force] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [brushMode, setBrushMode] = useState<"fg" | "bg">("bg");
  const rerender = () => force(v => v + 1);

  if (!doc) return null;
  const bg = doc.bgRemoval || null;
  const inter = app?.bgRemoveInteraction || null;
  const isThisDoc = !!inter && inter.docId === doc.id;

  const commitStep = () => {
    app?.renderer?.render?.();
    (app as any)?.commitHistorySnapshot?.();
  };

  /** Genau ein Verlaufsschritt je „Automatisch erkennen“. */
  const runAuto = (tol?: number) => {
    void import("@/cad/documentBgRemove").then(({ autoRemoveBackgroundFromCorners, exportBgMaskDataUrl }) => {
      const t = tol ?? doc.bgRemoval?.tolerance ?? 32;
      const finish = () => { exportBgMaskDataUrl(doc); rerender(); commitStep(); };
      const done = autoRemoveBackgroundFromCorners(doc, t, () => {
        autoRemoveBackgroundFromCorners(doc, t);
        finish();
      });
      if (done) finish();
    });
  };

  /** An/Aus — schneidet beim Einschalten bewusst nichts weg. */
  const toggleEnabled = () => {
    void import("@/cad/documentBgRemove").then(({ ensureBgRemoval }) => {
      const b = ensureBgRemoval(doc);
      b.enabled = !b.enabled;
      if (!b.enabled && app) app.bgRemoveInteraction = null; // Werkzeuge beenden, Maske bleibt
      rerender();
      commitStep();
    });
  };

  const setInter = (tool: "wand" | "brush" | null, target: "fg" | "bg" = "bg") => {
    if (!app) return;
    if (tool === null) app.bgRemoveInteraction = null;
    else app.bgRemoveInteraction = { docId: doc.id, tool, target };
    rerender();
  };

  /** Regler: während des Ziehens kein Verlauf, beim Loslassen ein Schritt. */
  const beginSlider = () => { if (app) (app as any).suspendHistory = true; };
  const endSlider = () => {
    if (!app) return;
    (app as any).suspendHistory = false;
    commitStep();
  };

  const patchBg = (patch: any) => {
    if (!doc.bgRemoval) return;
    Object.assign(doc.bgRemoval, patch);
    rerender();
  };

  const reset = () => {
    void import("@/cad/documentBgRemove").then(({ resetBgMask }) => {
      resetBgMask(doc);
      rerender();
      commitStep();
    });
  };

  const wandActive = (t: "fg" | "bg") => isThisDoc && inter?.tool === "wand" && inter?.target === t;
  const brushActive = isThisDoc && inter?.tool === "brush";

  return (
    <div className="space-y-2">
      <SettingsToggleButton
        label="Hintergrund entfernen"
        active={!!bg?.enabled}
        onClick={toggleEnabled}
        title="Schaltet den Bereich ein. Das Bild bleibt zunächst unverändert — erst „Automatisch erkennen“, Wegklicken oder Pinseln entfernt etwas."
      />

      {bg?.enabled && (
        <>
          {/* 1. Genauigkeit — bewusst VOR dem automatischen Erkennen */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span title="Farb-Toleranz. Niedrig = nur sehr ähnliche Farben werden entfernt. Hoch = auch abweichende Töne werden mitgenommen.">
                Genauigkeit
              </span>
              <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{bg.tolerance}</span>
            </div>
            <input
              type="range" min={1} max={128} step={1} value={bg.tolerance}
              onPointerDown={beginSlider}
              onPointerUp={endSlider}
              onChange={(e) => patchBg({ tolerance: parseInt(e.target.value, 10) })}
              className="pixuna-range w-full"
            />
          </div>

          {/* 2. Automatisch erkennen */}
          <button
            type="button"
            onClick={() => runAuto()}
            className="cad-toolbar-btn h-10 w-full text-[12px] font-semibold justify-center"
            style={{ borderColor: "hsl(var(--primary))", background: "hsl(var(--primary) / 0.12)" }}
            title="Erkennt den Hintergrund automatisch anhand der 4 Bild-Ecken. Bei zu wenig/zu viel Wegschnitt die Genauigkeit anpassen und erneut klicken."
          >
            Automatisch erkennen
          </button>

          {/* 3. Wegklicken / Wiederherstellen */}
          <div className="space-y-1">
            <div className="text-[11px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Klick-Werkzeug</div>
            <div className="grid grid-cols-2 gap-1">
              <ToolBtn
                active={wandActive("bg")}
                onClick={() => setInter(wandActive("bg") ? null : "wand", "bg")}
                label="Wegklicken"
                title="Klick auf einen Bereich im Bild → alle zusammenhängenden ähnlichfarbigen Pixel werden entfernt."
              />
              <ToolBtn
                active={wandActive("fg")}
                onClick={() => setInter(wandActive("fg") ? null : "wand", "fg")}
                label="Wiederherstellen"
                title="Klick auf einen entfernten Bereich → er wird wieder sichtbar."
              />
            </div>
          </div>

          {/* 4. Pinsel und Pinselgröße */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>Pinsel (Feinarbeit)</span>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setBrushMode("bg")}
                  className="cad-toolbar-btn h-7 px-2 text-[11px]"
                  style={{
                    borderColor: brushMode === "bg" ? "hsl(var(--primary))" : undefined,
                    background: brushMode === "bg" ? "hsl(var(--primary) / 0.15)" : undefined,
                  }}
                  title="Pinsel entfernt (radiert Vordergrund)"
                >Entfernen</button>
                <button
                  type="button"
                  onClick={() => setBrushMode("fg")}
                  className="cad-toolbar-btn h-7 px-2 text-[11px]"
                  style={{
                    borderColor: brushMode === "fg" ? "hsl(var(--primary))" : undefined,
                    background: brushMode === "fg" ? "hsl(var(--primary) / 0.15)" : undefined,
                  }}
                  title="Pinsel stellt wieder her"
                >Zurückholen</button>
              </div>
            </div>
            <ToolBtn
              active={brushActive}
              onClick={() => setInter(brushActive ? null : "brush", brushMode)}
              label={brushActive ? "Pinsel aktiv — im Bild ziehen" : "Pinsel aktivieren"}
              title="Nach dem Aktivieren im Bild klicken oder ziehen."
            />
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Pinselgröße</span>
                <span style={{ color: "hsl(var(--cad-toolbar-muted))" }}>{(bg.brushRadiusM * 100).toFixed(0)} cm</span>
              </div>
              <input
                type="range" min={1} max={200} step={1} value={Math.round(bg.brushRadiusM * 100)}
                onPointerDown={beginSlider}
                onPointerUp={endSlider}
                onChange={(e) => patchBg({ brushRadiusM: parseInt(e.target.value, 10) / 100 })}
                className="pixuna-range w-full"
              />
            </div>
          </div>

          {isThisDoc && (
            <div className="text-[10px] rounded px-2 py-1" style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}>
              Bearbeitungsmodus aktiv — klicke im Bild.
            </div>
          )}

          {/* 5. Maske zurücksetzen */}
          <button
            type="button"
            onClick={reset}
            className="cad-toolbar-btn h-7 w-full text-[11px] justify-center"
            title="Setzt die Maske zurück — das ganze Bild wird wieder komplett sichtbar."
          >
            Maske zurücksetzen
          </button>

          {/* 6. Erweiterte Vordergrund-/Hintergrundoptionen */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            className="flex h-9 w-full items-center justify-between gap-2 rounded-md border px-2 text-[11px] font-medium hover:bg-muted"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <span>Erweitert (Einfärben &amp; Deckkraft)</span>
            {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          {advancedOpen && (
            <div className="space-y-2 pl-2" style={{ borderLeft: "1px solid hsl(var(--border))" }}>
              <ColorAlphaRow
                label="Vordergrund"
                color={bg.fgColor}
                alpha={bg.fgAlpha}
                onChange={(color, alpha) => patchBg({ fgColor: color, fgAlpha: alpha })}
                hint="Bleibt sichtbar. Farbe = Einfärbung, Deckkraft = Transparenz des sichtbaren Bildteils."
              />
              <ColorAlphaRow
                label="Hintergrund"
                color={bg.bgColor}
                alpha={bg.bgAlpha}
                onChange={(color, alpha) => patchBg({ bgColor: color, bgAlpha: alpha })}
                hint="Der weggeschnittene Bereich. Transparent + Deckkraft 0 % = komplett entfernt."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
