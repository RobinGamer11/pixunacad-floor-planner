/**
 * Minimaler Browser-Client für die öffentliche Supabase API.
 *
 * Diese App bleibt eine Vite-SPA. Deshalb dürfen hier ausschließlich die
 * Projekt-URL und der Publishable Key verwendet werden – niemals ein
 * service_role- oder anderer geheimer Schlüssel.
 */

export type SupabaseUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

export type SupabaseSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SupabaseUser;
  persistent: boolean;
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: SupabaseUser;
};

export type WorkspaceRecord = {
  user_id: string;
  schema_version: number;
  payload: Record<string, unknown>;
  updated_at: string;
};

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const PERSISTENT_SESSION_KEY = "pixuna.supabase.session.v1";
const TEMPORARY_SESSION_KEY = "pixuna.supabase.session.session.v1";

const canUseStorage = () => typeof window !== "undefined";

function readStoredSession(): SupabaseSession | null {
  if (!canUseStorage()) return null;

  for (const [storage, key, persistent] of [
    [window.sessionStorage, TEMPORARY_SESSION_KEY, false],
    [window.localStorage, PERSISTENT_SESSION_KEY, true],
  ] as const) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Omit<SupabaseSession, "persistent">;
      if (parsed?.accessToken && parsed?.refreshToken && parsed?.user?.id) {
        return { ...parsed, persistent };
      }
    } catch {
      // Ein defekter lokaler Eintrag darf die App nicht blockieren.
    }
  }

  return null;
}

function messageFromResponse(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const candidate = body as { msg?: unknown; message?: unknown; error_description?: unknown; error?: unknown };
    for (const value of [candidate.msg, candidate.message, candidate.error_description, candidate.error]) {
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return `Supabase-Anfrage fehlgeschlagen (${status}).`;
}

class PixunaSupabaseClient {
  private session: SupabaseSession | null = readStoredSession();
  private listeners = new Set<(session: SupabaseSession | null) => void>();

  readonly isConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

  getSession() {
    return this.session;
  }

  onAuthStateChange(listener: (session: SupabaseSession | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.session));
  }

  private persistSession(session: SupabaseSession | null) {
    if (!canUseStorage()) return;
    try {
      window.localStorage.removeItem(PERSISTENT_SESSION_KEY);
      window.sessionStorage.removeItem(TEMPORARY_SESSION_KEY);
      if (!session) return;
      const { persistent, ...stored } = session;
      const target = persistent ? window.localStorage : window.sessionStorage;
      target.setItem(persistent ? PERSISTENT_SESSION_KEY : TEMPORARY_SESSION_KEY, JSON.stringify(stored));
    } catch {
      // Ohne Browser-Speicher bleibt die Sitzung bis zum Reload nutzbar.
    }
  }

  private setSession(session: SupabaseSession | null) {
    this.session = session;
    this.persistSession(session);
    this.notify();
  }

  private requireConfiguration() {
    if (!this.isConfigured) {
      throw new Error("Supabase ist noch nicht konfiguriert. Prüfe VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY.");
    }
  }

  private async request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
    this.requireConfiguration();
    const headers = new Headers(init.headers);
    headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) throw new Error(messageFromResponse(response.status, body));
    return body as T;
  }

  private sessionFromResponse(response: AuthResponse, persistent: boolean): SupabaseSession {
    if (!response.access_token || !response.refresh_token || !response.user?.id) {
      throw new Error("Supabase hat keine vollständige Sitzung zurückgegeben.");
    }

    const expiresAt = typeof response.expires_at === "number"
      ? response.expires_at * 1000
      : Date.now() + Math.max(60, response.expires_in ?? 3600) * 1000;

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt,
      user: response.user,
      persistent,
    };
  }

  private async restoreSessionFromUrl(): Promise<SupabaseSession | null> {
    if (typeof window === "undefined" || !window.location.hash) return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;

    const expiresAt = Number(params.get("expires_at"));
    const user = await this.request<SupabaseUser>("/auth/v1/user", {}, accessToken);
    const session: SupabaseSession = {
      accessToken,
      refreshToken,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt * 1000 : Date.now() + 3_600_000,
      user,
      persistent: true,
    };
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    this.setSession(session);
    return session;
  }

  async restoreSession(): Promise<SupabaseSession | null> {
    if (!this.isConfigured) return null;
    try {
      const sessionFromUrl = await this.restoreSessionFromUrl();
      if (sessionFromUrl) return sessionFromUrl;
    } catch {
      // Ein fehlerhafter Bestätigungs- oder Recovery-Link wird unten wie eine
      // regulär abgelaufene Sitzung behandelt.
    }
    const stored = this.session ?? readStoredSession();
    if (!stored) return null;

    // Ein Token wird vorsorglich eine Minute vor Ablauf erneuert.
    if (stored.expiresAt > Date.now() + 60_000) {
      this.session = stored;
      return stored;
    }

    try {
      const response = await this.request<AuthResponse>("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: stored.refreshToken }),
      });
      const refreshed = this.sessionFromResponse(response, stored.persistent);
      this.setSession(refreshed);
      return refreshed;
    } catch {
      this.setSession(null);
      return null;
    }
  }

  async signInWithPassword(email: string, password: string, persistent = true): Promise<SupabaseSession> {
    const response = await this.request<AuthResponse>("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const session = this.sessionFromResponse(response, persistent);
    this.setSession(session);
    return session;
  }

  async signUp(email: string, password: string, redirectTo: string): Promise<{ requiresEmailConfirmation: boolean }> {
    const response = await this.request<AuthResponse>("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: {}, email_redirect_to: redirectTo }),
    });

    if (response.access_token && response.refresh_token && response.user?.id) {
      this.setSession(this.sessionFromResponse(response, true));
      return { requiresEmailConfirmation: false };
    }

    return { requiresEmailConfirmation: true };
  }

  async resetPasswordForEmail(email: string, redirectTo: string) {
    await this.request("/auth/v1/recover", {
      method: "POST",
      body: JSON.stringify({ email, redirect_to: redirectTo }),
    });
  }

  async updatePassword(password: string) {
    await this.authenticatedRequest("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ password }),
    });
  }

  async signOut() {
    const current = this.session;
    try {
      if (current) {
        await this.request("/auth/v1/logout?scope=local", { method: "POST" }, current.accessToken);
      }
    } catch {
      // Lokales Abmelden darf auch bei einer unterbrochenen Verbindung gelingen.
    } finally {
      this.setSession(null);
    }
  }

  private async authenticatedRequest<T>(path: string, init: RequestInit = {}) {
    let session = this.session ?? await this.restoreSession();
    if (session && session.expiresAt <= Date.now() + 60_000) {
      session = await this.restoreSession();
    }
    if (!session) throw new Error("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
    return this.request<T>(path, init, session.accessToken);
  }

  async getWorkspace(): Promise<WorkspaceRecord | null> {
    const session = this.session ?? await this.restoreSession();
    if (!session) throw new Error("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
    const rows = await this.authenticatedRequest<WorkspaceRecord[]>(
      `/rest/v1/user_workspaces?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id,schema_version,payload,updated_at`,
    );
    return rows[0] ?? null;
  }

  async saveWorkspace(payload: Record<string, unknown>) {
    const session = this.session ?? await this.restoreSession();
    if (!session) throw new Error("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.");
    await this.authenticatedRequest<WorkspaceRecord[]>("/rest/v1/user_workspaces?on_conflict=user_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: session.user.id,
        schema_version: 1,
        payload,
        updated_at: new Date().toISOString(),
      }),
    });
  }
}

export const supabase = new PixunaSupabaseClient();
