export type WorkspacePayload = {
  localStorage: Record<string, string>;
};

/** Schlüssel der lokalen Projektliste (siehe projectStore). */
const PROJECTS_KEY = "pixuna.projects.v3";

/**
 * Geteilte Projekte liegen gemeinsam in der Datenbank und dürfen nicht über
 * die persönliche Workspace-Sicherung zurückgespielt werden – sonst würde ein
 * älterer persönlicher Stand die gemeinsame Arbeit anderer überschreiben.
 * Der Anbieter wird zur Laufzeit gesetzt (vermeidet Importzyklen).
 */
let sharedIdsProvider: (() => Set<string>) | null = null;
export function setSharedProjectIdsProvider(provider: (() => Set<string>) | null) {
  sharedIdsProvider = provider;
}

function currentSharedIds(): Set<string> {
  try {
    return sharedIdsProvider?.() ?? new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function stripSharedProjects(raw: string): string {
  const shared = currentSharedIds();
  if (!shared.size) return raw;
  try {
    const parsed = JSON.parse(raw) as { projects?: Array<{ id?: string }> };
    if (!Array.isArray(parsed?.projects)) return raw;
    const kept = parsed.projects.filter((p) => !(p?.id && shared.has(p.id)));
    if (kept.length === parsed.projects.length) return raw;
    return JSON.stringify({ ...parsed, projects: kept });
  } catch {
    return raw;
  }
}

function isWorkspaceKey(key: string) {
  return key.startsWith("pixuna.")
    && !key.startsWith("pixuna.supabase.")
    && !key.startsWith("pixuna.external-content-consent.")
    && !key.startsWith("pixuna.legal.");
}

/**
 * Persönliche Kleinigkeiten, die weiterhin kontoweit gesichert werden dürfen
 * (Darstellung, Werkzeugvorlieben, Position des Tablet-Hilfsrads).
 *
 * Bewusst NICHT enthalten: Projekt-, CAD-, Tabellen-, Notiz-, Finanz-,
 * Board- und Dokumentdaten. Diese laufen ausschließlich über die
 * projektbezogene Speicherung bzw. die objektbasierte Zusammenarbeit –
 * ein kompletter LocalStorage-Abzug sprengt sonst das Speicherkontingent.
 */
const SETTINGS_KEYS = new Set([
  "pixuna.theme",
  "pixuna.canvasDark",
  "pixuna.penOnly",
  "pixuna.tabletAid",
  "pixuna.tabletAid.pos",
]);
const SETTINGS_PREFIXES = ["pixuna.finance.tplfav."];
/** Sicherheitsnetz gegen unerwartet große Einzelwerte. */
const MAX_SETTING_BYTES = 8 * 1024;

export function isSettingsKey(key: string) {
  return SETTINGS_KEYS.has(key) || SETTINGS_PREFIXES.some((p) => key.startsWith(p));
}

/** Kleiner Einstellungs-Schnappschuss (ersetzt den früheren Komplettabzug). */
export function captureSettings(): WorkspacePayload {
  const localStorageState: Record<string, string> = {};
  if (typeof window === "undefined") return { localStorage: localStorageState };
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !isSettingsKey(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value === null || value.length > MAX_SETTING_BYTES) continue;
    localStorageState[key] = value;
  }
  return { localStorage: localStorageState };
}

/**
 * Übernimmt einen gespeicherten Stand, ohne lokale Daten zu löschen.
 * Ältere Konten enthalten serverseitig noch den früheren Komplettabzug;
 * dessen Inhalte werden weiterhin übernommen, damit auf einem neuen Gerät
 * nichts fehlt.
 */
export function mergeWorkspace(payload: WorkspacePayload): boolean {
  if (typeof window === "undefined") return false;
  const incoming = payload?.localStorage ?? {};
  let changed = false;
  Object.entries(incoming).forEach(([key, value]) => {
    if (!isWorkspaceKey(key)) return;
    if (window.localStorage.getItem(key) === value) return;
    window.localStorage.setItem(key, value);
    changed = true;
  });
  return changed;
}

export function captureWorkspace(): WorkspacePayload {
  const localStorageState: Record<string, string> = {};
  if (typeof window === "undefined") return { localStorage: localStorageState };

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !isWorkspaceKey(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value === null) continue;
    localStorageState[key] = key === PROJECTS_KEY ? stripSharedProjects(value) : value;
  }

  return { localStorage: localStorageState };
}

export function clearWorkspaceStorage() {
  if (typeof window === "undefined") return;
  const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key && isWorkspaceKey(key)));
  keys.forEach((key) => window.localStorage.removeItem(key));
  const sessionKeys = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith("pixuna.workspace.hydrated.")));
  sessionKeys.forEach((key) => window.sessionStorage.removeItem(key));
}

export function restoreWorkspace(payload: WorkspacePayload) {
  if (typeof window === "undefined") return;
  const incoming = payload?.localStorage ?? {};
  const currentKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key && isWorkspaceKey(key)));

  currentKeys.forEach((key) => {
    if (!(key in incoming)) window.localStorage.removeItem(key);
  });
  Object.entries(incoming).forEach(([key, value]) => window.localStorage.setItem(key, value));
}
