/**
 * DocumentPixelModeToggle — Vektor ⇄ Pixel Umschalter für PDF-Dokumente.
 *
 * Vektor: PDF bleibt vektorbasiert (scharf bei jedem Zoom, "Auflösen" möglich).
 * Pixel:  PDF wird als Bild eingebrannt — der Radiergummi arbeitet dann wie bei
 *         PNG/JPG inkl. Smooth-Modus. Zurück auf Vektor bleiben alle
 *         Radier-Änderungen erhalten.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  convertDocumentToPixel,
  convertDocumentToVector,
  isDocumentPixelMode,
  isPdfBackedDocument,
} from "@/cad/documentPixelMode";

interface Props {
  /** CadApp oder MiniCad. */
  app: any;
  docId: string;
}

export function DocumentPixelModeToggle({ app, docId }: Props) {
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);
  const doc = app?.scene?.getDocumentById?.(docId);
  if (!doc || !isPdfBackedDocument(doc)) return null;
  const pixel = isDocumentPixelMode(doc);

  const setMode = async (toPixel: boolean) => {
    if (busy || toPixel === pixel) return;
    setBusy(true);
    try {
      if (toPixel) await convertDocumentToPixel(doc);
      else await convertDocumentToVector(doc);
      app.renderer?.render?.();
      app.commitHistorySnapshot?.();
    } catch (e: any) {
      window.alert("Umwandlung fehlgeschlagen: " + (e?.message || e));
    } finally {
      setBusy(false);
      force((n) => n + 1);
    }
  };

  return (
    <div className="mb-1">
      <div className="text-[11px] mb-1.5 flex items-center gap-1.5">
        Objektart
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode(false)}
          className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] disabled:opacity-50 ${!pixel ? "active" : ""}`}
          title="PDF bleibt vektorbasiert — scharf bei jedem Zoom, „Auflösen“ möglich"
        >
          Vektor
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setMode(true)}
          className={`cad-toolbar-btn flex-1 justify-center h-8 text-[11px] disabled:opacity-50 ${pixel ? "active" : ""}`}
          title="PDF als Bild — Radiergummi inkl. Smooth-Modus wie bei PNG/JPG"
        >
          Pixel
        </button>
      </div>
      <div className="text-[10px] leading-tight mt-1.5 text-muted-foreground">
        {pixel
          ? "Pixel: radieren wie bei PNG/JPG (auch Smooth). Zurück auf „Vektor“ bleiben alle Radier-Änderungen erhalten."
          : "Vektor: scharf bei jedem Zoom. Für weiches Radieren auf „Pixel“ umschalten."}
      </div>
    </div>
  );
}
