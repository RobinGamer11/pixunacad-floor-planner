/**
 * Der Exportbereich bleibt bis zum Abschluss der Cloud-Unterstützung für
 * Exportseiten (inkl. Zwei-Geräte-Test) verborgen. Interne Freischaltung:
 * localStorage "pixuna.exportPreview" = "1".
 */
export function isExportAreaEnabled(): boolean {
  try { return localStorage.getItem("pixuna.exportPreview") === "1"; } catch { return false; }
}
