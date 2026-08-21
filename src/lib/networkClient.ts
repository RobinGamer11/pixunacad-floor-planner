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
    // Token stammt aus der bestehenden Sitzung des Auth-Clients.
    accessToken: async () => {
      const session = authClient.getSession() ?? (await authClient.restoreSession());
      return session?.accessToken ?? null;
    },
  });
  return client;
}

/** True, wenn der Fehler darauf hindeutet, dass die Netzwerktabellen fehlen. */
export function isMissingSchemaError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST202") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find the table") || msg.includes("schema cache");
}
