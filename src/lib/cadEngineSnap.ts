/**
 * cadEngineSnap.ts — Brücke zwischen den Seiten-Elementen (ElementView / CAD-Blatt-HUB)
 * und der eingebetteten MiniCad-Engine der Projektmappe.
 *
 * Die Engine hält Linien, Freihand, Texte, Schraffuren und Dokumente. Deren
 * Fangpunkte liegen NICHT in der pageSnap-Registry. Damit CAD-Blätter beim
 * Verschieben/Drehen auch an diesen Objekten fangen können, registriert die
 * Projektmappe hier eine Query-Funktion. Ergebnis sind Prozent-Koordinaten
 * relativ zur Seitenfläche (0..100).
 */

export type EngineSnapQuery = (
  clientX: number,
  clientY: number,
  pageRect: DOMRect,
  tolerancePx?: number
) => { x: number; y: number } | null;

export function registerCadEngineSnap(fn: EngineSnapQuery | null) {
  (window as any).__pixunaCadEngineSnap = fn;
}

export function queryCadEngineSnap(
  clientX: number,
  clientY: number,
  pageRect: DOMRect,
  tolerancePx = 12
): { x: number; y: number } | null {
  const fn = (window as any).__pixunaCadEngineSnap as EngineSnapQuery | undefined;
  if (typeof fn !== "function") return null;
  try {
    return fn(clientX, clientY, pageRect, tolerancePx);
  } catch {
    return null;
  }
}
