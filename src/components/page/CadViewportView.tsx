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
 * am Bildschirm als auch beim späteren PDF-Export. Der Bildschirm-Zoom
 * beeinflusst ausschließlich die Pixel-Auflösung des Offscreen-Canvas,
 * niemals den Maßstab.
 */
import React, { useEffect, useRef } from "react";
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
}

/** Ziel-Pixel-Dichte für den Offscreen-Render (px pro Papier-mm). */
const RENDER_PX_PER_MM = 4;

export function CadViewportView({ element, sheet, paperWmm, paperHmm }: CadViewportViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const scaleDen =
    element.scaleDen ?? parseScaleDen(element.scale ?? sheet?.scale) ?? 100;
  const centerM = element.modelCenterM ?? { x: 0, y: 0 };
  const rotationDeg = element.viewportRotationDeg ?? 0;

  const sceneJson = sheet?.sceneJson;
  const labelsJson = sheet?.labelsJson;

  // Bei fehlender Rahmengröße: Fallback aus DOM-Layout (nicht ideal, aber
  // verhindert leeren Render). Der Aufrufer sollte immer paperWmm/paperHmm
  // aus dem Papier-Element (wMm/hMm) durchreichen.
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

  // Legacy-Fallback: Alt-Elemente ohne sceneJson zeigen den eingefrorenen
  // Bitmap-Snapshot (mit sichtbarem Hinweis, dass es sich um Legacy handelt).
  const legacySnapshot = !sceneJson ? (element.viewSnapshot || sheet?.thumbnail) : null;

  if (!sceneJson && !legacySnapshot) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed"
        style={{
          borderColor: "hsl(var(--hairline))",
          background: "hsl(var(--surface-muted))",
        }}
      >
        {sheet
          ? `${label} — noch keine Zeichnung (Sheet im CAD öffnen)`
          : "Kein Zeichenblatt"}
        <span className="sr-only">Maßstab 1:{scaleDen}</span>
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
    </div>
  );
}

export default CadViewportView;
