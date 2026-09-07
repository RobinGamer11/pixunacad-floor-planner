/**
 * Kontoname (öffentlicher Anzeigename) an einer Stelle zusammenführen.
 *
 * Quellen (in dieser Reihenfolge, erster echter Name gewinnt):
 *  1. `profiles.display_name` in der gemeinsamen Datenbasis
 *  2. Anzeigename aus den Benutzer-Metadaten (bei der Registrierung gesetzt)
 *  3. Lokaler Profilname aus dem Projektspeicher
 *  4. Vorderer Teil der E-Mail-Adresse
 *
 * Platzhalter („Benutzer“, leer, reiner E-Mail-Präfix aus dem Datenbank-Trigger)
 * zählen dabei nicht als echter Name, damit ein selbst vergebener Name niemals
 * überschrieben wird. Die Benutzeridentität bleibt unverändert die Benutzer-ID.
 */
import { supabase as authClient } from "@/lib/supabase";
import { getNetworkClient, isMissingSchemaError } from "@/lib/networkClient";
import { projectStore } from "@/lib/projectStore";

const PLACEHOLDER_NAMES = new Set(["", "benutzer", "unbekannt", "ich"]);

function isPlaceholder(name: string | null | undefined, emailPrefix: string) {
  const value = (name ?? "").trim();
  if (PLACEHOLDER_NAMES.has(value.toLowerCase())) return true;
  return Boolean(emailPrefix) && value.toLowerCase() === emailPrefix.toLowerCase();
}

function metadataName(meta: Record<string, unknown> | null | undefined): string {
  for (const key of ["display_name", "full_name", "name", "username"]) {
    const value = meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

let running: Promise<void> | null = null;

/**
 * Führt lokalen Profilnamen und `profiles.display_name` zusammen und schreibt
 * das Ergebnis in beide Richtungen zurück. Mehrfachaufrufe sind unschädlich.
 */
export function syncAccountDisplayName(): Promise<void> {
  if (running) return running;
  running = run().finally(() => { running = null; });
  return running;
}

async function run() {
  const session = authClient.getSession() ?? (await authClient.restoreSession());
  if (!session) return;

  const email = session.user.email ?? "";
  const emailPrefix = email.includes("@") ? email.split("@")[0] : email;
  const fromMeta = metadataName(session.user.user_metadata);
  const local = projectStore.getState().profile.name ?? "";

  const client = getNetworkClient();
  let fromServer = "";
  let serverReachable = false;
  if (client) {
    try {
      const { data, error } = await client
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (error && !isMissingSchemaError(error)) throw error;
      if (!error) {
        serverReachable = true;
        fromServer = ((data as { display_name?: string } | null)?.display_name ?? "").trim();
      }
    } catch {
      // Ohne Verbindung bleibt es beim lokalen Namen.
    }
  }

  const candidates = [fromServer, fromMeta, local];
  const resolved =
    candidates.find((c) => !isPlaceholder(c, emailPrefix)) ??
    (emailPrefix || "Benutzer");

  if (resolved && resolved !== local) {
    projectStore.updateProfile({ name: resolved });
  }

  if (serverReachable && client && resolved && resolved !== fromServer) {
    try {
      await client
        .from("profiles")
        .upsert({ id: session.user.id, display_name: resolved, updated_at: new Date().toISOString() }, { onConflict: "id" });
    } catch {
      // Rein kosmetisch – der lokale Name steht bereits richtig.
    }
  }

  if (resolved && !fromMeta) {
    try {
      await authClient.updateDisplayName(resolved);
    } catch {
      // Metadaten sind nur eine zusätzliche Absicherung.
    }
  }
}

/** True, wenn ein Name noch ein Platzhalter ist (z. B. während des Ladens). */
export function isPlaceholderName(name: string | null | undefined) {
  return PLACEHOLDER_NAMES.has((name ?? "").trim().toLowerCase());
}
