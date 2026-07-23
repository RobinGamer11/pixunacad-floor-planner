/**
 * CadViewportView — Live-Referenz auf ein CAD-Sheet.
 *
 * KEIN Bitmap-Snapshot, KEIN Fit-to-Frame. Der sichtbare Modellausschnitt
 * wird mathematisch exakt aus Papier-mm × Nennmaßstab berechnet:
 *
 *     modelWmm = paperWmm * scaleDen
 *     modelWm  = modelWmm / 1000
 *
 * Dadurch entspricht 1 mm Papier immer exakt `scaleDen` mm Modell — sowohl
 * am Bildschirm als auch beim späteren PDF-Export.
 *
 * Auto-Update:
 *   - `autoUpdate` (Standard: true) → Viewport re-rendert bei jeder Änderung
 *     des Sheets `sceneJson`.
 *   - `autoUpdate` = false → Viewport friert die zuletzt gerenderte Szene
 *     ein und aktualisiert erst, wenn `element.lastSyncAt` bumpt (via
 *     „Ansicht aktualisieren"-Button).
 *
 * Maßstabs-Check:
 *   Ein kleines Overlay unten links zeigt die mm-zu-mm Referenz an
 *   („10 mm Papier ≙ 1000 mm Modell") — als sichtbare Garantie, dass der
 *   Ausdruck exakt der gewählten Skalierung entspricht.
 */
import React, { useEffect, useRef, useState } from "react";
import type { PageElement, Sheet } from "@/lib/projectStore";
import { parseScaleDen } from "@/lib/paper";
import { renderSceneRegionToCanvas } from "@/cad/SceneRegionRenderer";

export interface CadViewportViewProps {
  element: PageElement;
  sheet?: Sheet;
  /** Papier-Breite des Viewport-Rahmens in mm. */
  paperWmm?: number;
  /** Papier-Höhe des Viewport-Rahmens in mm. */
  paperHmm?: number;
  /** Live-Aktualisierung ein/aus. Default: true. */
  autoUpdate?: boolean;
  /** Maßstabs-Check-Pille anzeigen. Default: true. */
  showScaleCheck?: boolean;
}

/** Ziel-Pixel-Dichte für den Offscreen-Render (px pro Papier-mm). */
const RENDER_PX_PER_MM = 4;

/** Formatiert einen Modell-Millimeterwert als „5000 mm" / „5 m" o.ä. */
function formatModelMm(mm: number): string {
  if (mm >= 1000) return `${(mm / 1000).toLocaleString("de-DE", { maximumFractionDigits: 2 })} m`;
  if (mm >= 10) return `${Math.round(mm)} mm`;
  return `${mm.toLocaleString("de-DE", { maximumFractionDigits: 1 })} mm`;
}

export function CadViewportView({
  element,
  sheet,
  paperWmm,
  paperHmm,
  autoUpdate = true,
  showScaleCheck = true,
}: CadViewportViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const scaleDen =
    element.scaleDen ?? parseScaleDen(element.scale ?? sheet?.scale) ?? 100;
  const centerM = element.modelCenterM ?? { x: 0, y: 0 };
  const rotationDeg = element.viewportRotationDeg ?? 0;

  const liveSceneJson = sheet?.sceneJson;
  const liveLabelsJson = sheet?.labelsJson;

  // Wenn autoUpdate=false, frieren wir die zuletzt gerenderte Szene ein und
  // aktualisieren erst bei Änderung von element.lastSyncAt.
  const [frozen, setFrozen] = useState<{ sceneJson?: string; labelsJson?: string }>(
    () => ({ sceneJson: liveSceneJson, labelsJson: liveLabelsJson })
  );
  useEffect(() => {
    if (autoUpdate) return;
    // Bei manuellem Modus: bei lastSyncAt-Bump oder Toggle-Wechsel Snapshot ziehen.
    setFrozen({ sceneJson: liveSceneJson, labelsJson: liveLabelsJson });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpdate, element.lastSyncAt]);

  const sceneJson = autoUpdate ? liveSceneJson : frozen.sceneJson;
  const labelsJson = autoUpdate ? liveLabelsJson : frozen.labelsJson;

  const effWmm = paperWmm && paperWmm > 0 ? paperWmm : undefined;
  const effHmm = paperHmm && paperHmm > 0 ? paperHmm : undefined;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!sceneJson || !effWmm || !effHmm) return;

    const pxW = Math.max(1, Math.round(effWmm * RENDER_PX_PER_MM));
    const pxH = Math.max(1, Math.round(effHmm * RENDER_PX_PER_MM));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;

    let parsedLabels: any = null;
    if (labelsJson) {
      try { parsedLabels = JSON.parse(labelsJson); } catch { parsedLabels = null; }
    }

    try {
      renderSceneRegionToCanvas({
        canvas,
        sceneJson,
        labelsJson: parsedLabels,
        paperWmm: effWmm,
        paperHmm: effHmm,
        scaleDen,
        centerM,
        rotationDeg,
      });
    } catch (err) {
      console.warn("[CadViewportView] render failed:", err);
    }
  }, [
    sceneJson, labelsJson, effWmm, effHmm, scaleDen,
    centerM.x, centerM.y, rotationDeg, element.lastSyncAt,
  ]);

  const label = sheet?.name ?? "CAD-Ansicht";

  // Maßstabs-Check: eine „runde" Papier-Referenz wählen (10 mm bevorzugt).
  const paperRefMm = 10;
  const modelRefMm = paperRefMm * scaleDen;
  const scaleCheckText = `${paperRefMm} mm Papier ≙ ${formatModelMm(modelRefMm)} Modell · 1:${Math.round(scaleDen)}`;

  // Legacy-Fallback für Alt-Elemente ohne sceneJson.
  const legacySnapshot = !sceneJson ? (element.viewSnapshot || sheet?.thumbnail) : null;

  const ScaleCheckPill = showScaleCheck ? (
    <div
      className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] tabular-nums pointer-events-none select-none"
      style={{
        background: "hsl(var(--surface) / 0.9)",
        color: "hsl(var(--ink-soft))",
        border: "1px solid hsl(var(--hairline))",
        fontVariantNumeric: "tabular-nums",
      }}
      title={`Maßstabs-Check: ${scaleCheckText}`}
    >
      {scaleCheckText}
    </div>
  ) : null;

  const StaleBadge = !autoUpdate ? (
    <div
      className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] pointer-events-none select-none"
      style={{
        background: "hsl(var(--surface) / 0.9)",
        color: "hsl(var(--ink-soft))",
        border: "1px solid hsl(var(--hairline))",
      }}
      title={'Automatische Aktualisierung ist deaktiviert — via „Ansicht aktualisieren" neu laden.'}
    >
      manuell
    </div>
  ) : null;

  if (!sceneJson && !legacySnapshot) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed relative"
        style={{
          borderColor: "hsl(var(--hairline))",
          background: "hsl(var(--surface-muted))",
        }}
      >
        {sheet
          ? `${label} — noch keine Zeichnung (Sheet im CAD öffnen)`
          : "Kein Zeichenblatt"}
        <span className="sr-only">Maßstab 1:{scaleDen}</span>
        {ScaleCheckPill}
      </div>
    );
  }

  if (!sceneJson && legacySnapshot) {
    return (
      <div
        ref={wrapRef}
        className="w-full h-full relative"
        style={{ background: "white" }}
        data-viewport-scale={`1:${scaleDen}`}
        title={`${label} · Legacy-Snapshot (Maßstab nicht exakt)`}
      >
        <img
          src={legacySnapshot}
          alt={label}
          className="w-full h-full object-contain"
          draggable={false}
          style={{ pointerEvents: "none" }}
        />
        {ScaleCheckPill}
        {StaleBadge}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="w-full h-full relative overflow-hidden"
      style={{ background: "white" }}
      data-viewport-scale={`1:${scaleDen}`}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          imageRendering: "auto",
        }}
      />
      {ScaleCheckPill}
      {StaleBadge}
    </div>
  );
}

export default CadViewportView;
