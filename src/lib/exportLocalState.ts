/**
 * Reiner Bedienzustand des Export-Bereichs pro Gerät und Projekt.
 * Nie Teil von Projekt-Snapshot, Verlauf oder Cloud-Synchronisierung.
 */
const activeKey = (projectId: string) => `pixuna.export.activePage.${projectId}`;
const collapsedKey = (projectId: string) => `pixuna.export.collapsed.${projectId}`;

function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* Speicher voll/gesperrt: Bedienzustand ist verzichtbar */ }
}

export function getLocalActivePage(projectId: string | undefined): string | null {
  return projectId ? read(activeKey(projectId)) : null;
}
export function setLocalActivePage(projectId: string | undefined, planId: string | null) {
  if (projectId) write(activeKey(projectId), planId);
}

export function getLocalCollapsed(projectId: string | undefined): Set<string> {
  if (!projectId) return new Set();
  try {
    const arr = JSON.parse(read(collapsedKey(projectId)) || "[]");
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch { return new Set(); }
}
export function setLocalCollapsed(projectId: string | undefined, ids: Set<string>) {
  if (projectId) write(collapsedKey(projectId), JSON.stringify([...ids]));
}
