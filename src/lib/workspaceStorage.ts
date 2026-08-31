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
