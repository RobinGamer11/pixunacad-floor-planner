/**
 * Serverseitige Projektzuordnung sicherstellen.
 *
 * Kommentare, Zeiten, Geräte usw. hängen an `public.network_projects`. Ein rein
 * lokal angelegtes Projekt ist dort zunächst unbekannt – dann greift die
 * RLS-Regel `project_can_comment(...)` nicht und das Speichern schlägt fehl
 * („new row violates row-level security policy“).
 *
 * Grundsätze:
 *  - Bestehende Eigentümer werden NIEMALS überschrieben (kein Upsert auf
 *    `owner_id`). Es wird nur eingefügt, wenn das Projekt serverseitig noch
 *    gar nicht existiert.
 *  - Fremde Projekte werden nicht übernommen: schlägt das Einfügen wegen eines
 *    bestehenden Datensatzes fehl, bleibt es beim vorhandenen Eigentümer.
 *  - RLS bleibt aktiv; es werden keine pauschalen Rechte vergeben.
 */
import { getNetworkClient, isMissingSchemaError, networkConfigured } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";
import { projectAccessStore } from "@/lib/projectAccess";

export interface EnsureProjectResult {
  ok: boolean;
  /** Verständliche deutsche Meldung, wenn `ok` false ist. */
  message?: string;
}

/** Erfolgreich geprüfte Projekte – pro Sitzung nur einmal nachfragen. */
const verified = new Set<string>();
const inflight = new Map<string, Promise<EnsureProjectResult>>();

function fail(message: string): EnsureProjectResult {
  return { ok: false, message };
}

/**
 * Supabase-Fehler sind einfache Objekte (kein `Error`) – Meldung, Details und
 * Fehlercode müssen ausgewertet werden, damit die Ursache sichtbar bleibt.
 */
function describe(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].map((p) => (p ?? "").trim()).filter(Boolean);
  const code = e.code ? ` (Fehlercode ${e.code})` : "";
  return parts.length ? `${parts.join(" – ")}${code}` : `${fallback}${code}`;
}


async function run(projectId: string, name: string | undefined): Promise<EnsureProjectResult> {
  if (!networkConfigured) return fail("Die gemeinsame Datenbasis ist nicht eingerichtet.");
  const client = getNetworkClient();
  const session = authClient.getSession();
  if (!client) return fail("Die gemeinsame Datenbasis ist nicht erreichbar.");
  if (!session) return fail("Bitte zuerst anmelden, um Kommentare zu speichern.");

  try {
    // 1) Ist das Projekt serverseitig bereits bekannt (und für mich sichtbar)?
    const { data: existing, error: selErr } = await client
      .from("network_projects")
      .select("id,owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (selErr && !isMissingSchemaError(selErr)) throw selErr;
    if (existing) {
      verified.add(projectId);
      await projectAccessStore.reload();
      return { ok: true };
    }

    // 2) Noch unbekannt → als eigenes Projekt anmelden (ohne Owner-Wechsel).
    const { error: insErr } = await client.from("network_projects").insert({
      id: projectId,
      owner_id: session.user.id,
      name: name?.trim() || "Projekt",
    });
    if (insErr) {
      // 23505 = Datensatz existiert bereits, gehört aber jemand anderem.
      if ((insErr as { code?: string }).code === "23505") {
        return fail("Dieses Projekt gehört einem anderen Konto. Bitte um eine Freigabe bitten.");
      }
      if (isMissingSchemaError(insErr)) {
        return fail("Die Datenbank-Einrichtung fehlt. Bitte die SQL-Migrationen einspielen.");
      }
      throw insErr;
    }

    verified.add(projectId);
    await projectAccessStore.reload();
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    return fail(msg ? `Projektzuordnung fehlgeschlagen: ${msg}` : "Projektzuordnung fehlgeschlagen.");
  }
}

/**
 * Stellt sicher, dass `projectId` serverseitig bekannt ist und der angemeldete
 * Benutzer dort eine Rolle hat. Mehrfachaufrufe sind günstig (gecached).
 */
export function ensureSharedProject(
  projectId: string | undefined,
  name?: string,
): Promise<EnsureProjectResult> {
  if (!projectId) return Promise.resolve(fail("Kein Projekt geöffnet."));
  if (verified.has(projectId)) return Promise.resolve({ ok: true });
  const running = inflight.get(projectId);
  if (running) return running;
  const p = run(projectId, name).finally(() => { inflight.delete(projectId); });
  inflight.set(projectId, p);
  return p;
}

/** Nach Ab-/Anmeldung erneut prüfen. */
export function resetSharedProjectCache() {
  verified.clear();
  inflight.clear();
}
