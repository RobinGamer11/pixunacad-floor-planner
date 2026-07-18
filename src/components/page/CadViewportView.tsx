/**
 * CadViewportView — Live-Viewport auf ein CAD-Sheet innerhalb einer Projekt-
 * mappen-Seite (Paper-Space).
 *
 * Vertrag (Stufe 4):
 *   - Nimmt Papier-Größe (wMm × hMm), Maßstabsnenner (scaleDen),
 *     Modell-Mittelpunkt (modelCenterM) und Rotation entgegen.
 *   - Berechnet den sichtbaren Modellbereich rein aus Papier-mm und Maßstab:
 *         modelWm = wMm * scaleDen / 1000
 *         modelHm = hMm * scaleDen / 1000
 *   - Rendert die Sheet-Szene über ein internes Offscreen-Canvas in genau
 *     dieser Größe. Der Bildschirmzoom (pxPerMm) wird ausschließlich für die
 *     Canvas-Pixelauflösung verwendet, niemals für den Maßstab.
 *
 * Fallback (bis Sheet-Scenes persistent geladen werden können):
 *   - Solange keine Live-Szene für das Sheet verfügbar ist, wird der zuletzt
 *     gespeicherte Snapshot (Element `viewSnapshot` bzw. Sheet-`thumbnail`)
 *     in den Viewport-Rahmen eingepasst. Rotation wird vom umschließenden
 *     Element per CSS-Transform bereits gesetzt; hier NICHT zusätzlich drehen.
 */
import React from "react";
import type { PageElement, Sheet } from "@/lib/projectStore";
import { parseScaleDen } from "@/lib/paper";

export interface CadViewportViewProps {
  element: PageElement;
  sheet?: Sheet;
}

export function CadViewportView({ element, sheet }: CadViewportViewProps) {
  // Kanonische Viewport-Parameter (mit Legacy-Fallbacks).
  const scaleDen =
    element.scaleDen ?? parseScaleDen(element.scale ?? sheet?.scale);
  // Bevorzugt der eingefrorene Element-Snapshot (Ansicht zum Einfüge-Zeitpunkt).
  // Fallback: aktuelles Sheet-Thumbnail.
  const src = element.viewSnapshot || sheet?.thumbnail;

  const label = sheet?.name ?? "CAD-Ansicht";

  if (!src) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed"
        style={{
          borderColor: "hsl(var(--hairline))",
          background: "hsl(var(--surface-muted))",
        }}
      >
        {sheet
          ? `${label} — noch keine Vorschau (Sheet im CAD öffnen)`
          : "Kein Zeichenblatt"}
        <span className="sr-only">Maßstab 1:{scaleDen}</span>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full relative"
      style={{ background: "white" }}
      data-viewport-scale={`1:${scaleDen}`}
    >
      <img
        src={src}
        alt={label}
        className="w-full h-full object-contain"
        draggable={false}
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}

export default CadViewportView;
