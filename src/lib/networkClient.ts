/**
 * Supabase-Client für die Netzwerkschicht (Kontakte, Profile, Präsenz).
 *
 * Wichtig: Dieser Client spricht ausschließlich das eigene, externe
 * Supabase-Projekt aus `.env` an (Projekt-URL + öffentlicher Publishable Key).
 * Es wird keinerlei fremde Infrastruktur verwendet und kein geheimer
 * Schlüssel im Browser eingesetzt.
 *
 * Die Authentifizierung bleibt beim bestehenden schlanken Client
 * (`src/lib/supabase.ts`). Hier wird nur dessen Access-Token durchgereicht,
 * damit REST- und Realtime-Anfragen unter der echten Benutzeridentität
 * laufen (RLS greift also unverändert).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as authClient } from "@/lib/supabase";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export const networkConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let client: SupabaseClient | null = null;

export function getNetworkClient(): SupabaseClient | null {
  if (!networkConfigured) return null;
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Token wird zentral geprüft und bei Bedarf rechtzeitig erneuert.
    accessToken: async () => {
      const session = await authClient.ensureValidSession();
      return session?.accessToken ?? null;
    },
  });
  return client;
}

/** True, wenn der Fehler auf eine abgelaufene oder ungültige Anmeldung hinweist (z. B. 401 / PGRST303). */
export function isAuthExpiredError(error: unknown): boolean {
  const err = error as { code?: string; status?: number; message?: string } | null;
  if (!err) return false;
  if (err.status === 401 || err.code === "PGRST303") return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("jwt expired") ||
    msg.includes("invalid jwt") ||
    msg.includes("pgrst303") ||
    msg.includes("sitzung ist abgelaufen") ||
    msg.includes("anmeldung ist abgelaufen")
  );
}

export type CloudErrorKind = "auth" | "offline" | "forbidden" | "schema" | "db";

/** Ordnet Cloud-Fehler verständlich nach Ursache ein statt sie pauschal zu verstecken. */
export function classifyCloudError(error: unknown, fallback = "Datenbankfehler beim Laden."): { kind: CloudErrorKind; message: string } {
  const err = error as { code?: string; status?: number; message?: string } | null;
  const msg = String(err?.message ?? (typeof error === "string" ? error : "")).trim();
  const low = msg.toLowerCase();

  if (isAuthExpiredError(error)) {
    return { kind: "auth", message: "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an." };
  }
  if (
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    low.includes("failed to fetch") ||
    low.includes("networkerror") ||
    low.includes("load failed") ||
    low.includes("offline")
  ) {
    return { kind: "offline", message: "Offline – Cloud derzeit nicht erreichbar." };
  }
  if (err?.status === 403 || err?.code === "42501" || low.includes("permission denied") || low.includes("forbidden")) {
    return { kind: "forbidden", message: "Keine Berechtigung für diesen Zugriff." };
  }
  if (isMissingSchemaError(error)) {
    return { kind: "schema", message: "Cloud-Datenbank ist noch nicht vollständig eingerichtet." };
  }
  return { kind: "db", message: msg || fallback };
}

/**
 * Wiederholt eine fehlgeschlagene Leseanfrage höchstens einmal, wenn ein
 * abgelaufenes Token die Ursache war und die Erneuerung gelingt.
 * Niemals für Schreibanfragen verwenden.
 */
export async function withAuthRetry<T>(readFn: () => Promise<T>): Promise<T> {
  try {
    return await readFn();
  } catch (err) {
    if (!isAuthExpiredError(err)) throw err;
    const refreshed = await authClient.ensureValidSession({ forceRefresh: true });
    if (!refreshed) throw new Error("Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.");
    return await readFn();
  }
}

/** True, wenn der Fehler darauf hindeutet, dass die Netzwerktabellen fehlen. */
export function isMissingSchemaError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST202") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find the table") || msg.includes("schema cache");
}
