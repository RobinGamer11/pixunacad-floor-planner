/**
 * Exportbereich ist sichtbar. Notabschaltung je Gerät:
 * localStorage "pixuna.exportPreview" = "0".
 */
export function isExportAreaEnabled(): boolean {
  try { return localStorage.getItem("pixuna.exportPreview") !== "0"; } catch { return true; }
}
