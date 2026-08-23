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

/**
 * Zweite Brücke: ALLE Fangpunkte der eingebetteten MiniCad-Engine in einem
 * Bildschirmradius um den Cursor — Pendant zu `TopologyEngine.nearbySnapPoints()`
 * der großen CAD-Oberfläche. Wird nur für die dezente Fangpunkt-Vorschau
 * während Verschieben/Drehen genutzt (Prozent-Koordinaten der Seitenfläche).
 */
export type EngineSnapNearbyQuery = (
  clientX: number,
  clientY: number,
  pageRect: DOMRect,
  radiusPx?: number
) => Array<{ x: number; y: number }>;

export function registerCadEngineSnapNearby(fn: EngineSnapNearbyQuery | null) {
  (window as any).__pixunaCadEngineSnapNearby = fn;
}

export function queryCadEngineSnapNearby(
  clientX: number,
  clientY: number,
  pageRect: DOMRect,
  radiusPx = 140
): Array<{ x: number; y: number }> {
  const fn = (window as any).__pixunaCadEngineSnapNearby as EngineSnapNearbyQuery | undefined;
  if (typeof fn !== "function") return [];
  try {
    return fn(clientX, clientY, pageRect, radiusPx) ?? [];
  } catch {
    return [];
  }
}
