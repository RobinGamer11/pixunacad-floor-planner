/**
 * printExport.ts — globaler Schalter für "Export/Druck läuft".
 *
 * Während eines PDF-Exports (oder eines Ausdrucks) werden Hilfsdarstellungen
 * ausgeblendet: Seitenränder-Overlay (React/DOM, per CSS-Klasse) und
 * Hilfslinien der CAD-Engine (Renderer liest das Flag pro Frame).
 */

let exporting = false;

export function isExportMode(): boolean {
  return exporting;
}

export function setExportMode(on: boolean) {
  exporting = !!on;
  try {
    document.documentElement.classList.toggle("pixuna-exporting", exporting);
  } catch {}
}
