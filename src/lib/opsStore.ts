/**
 * Paket 04–06 – gemeinsame Datenschicht für
 *   * Arbeitszeiten (`time_entries`)
 *   * Abwesenheiten (`absences`, maskiert über `absences_for_projects`)
 *   * Geräte/Werkzeuge (`devices`, `device_bookings`)
 *   * Beitragsanhänge (`contribution_attachments` + Storage-Bucket)
 *
 * Grundsätze:
 *  - Es wird ausschließlich das eigene Supabase-Projekt aus `.env` genutzt
 *    (öffentlicher Publishable Key, siehe `networkClient.ts`).
 *  - Die Rechte kommen aus RLS. Der Client blendet zusätzlich aus, ersetzt
 *    die serverseitige Prüfung aber nicht.
 *  - Fehlt die Migration oder ist niemand angemeldet, bleiben alle Listen
 *    leer und `unavailable` ist true – die App funktioniert unverändert
 *    weiter (rein lokale Projekte sind davon nicht betroffen).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNetworkClient, isMissingSchemaError, networkConfigured } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";

/* ------------------------------------------------------------------ Typen */

export interface TimeEntry {
  id: string;
  project_id: string;
  item_id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  break_minutes: number;
  note?: string | null;
}

export type AbsenceKind = "vacation" | "sick" | "other";

export interface Absence {
  id: string;
  user_id: string;
  starts_on: string;
  ends_on: string;
  /** Bei fremden Personen bewusst null – Art bleibt privat. */
  kind: AbsenceKind | null;
  note: string | null;
  status: "planned" | "confirmed" | "cancelled";
  /** true = fremde Abwesenheit ohne Detailangaben. */
  masked: boolean;
}

export interface Device {
  id: string;
  owner_id: string;
  name: string;
  responsible_id: string | null;
  note: string | null;
  archived: boolean;
}

export interface DeviceBooking {
  id: string;
  device_id: string;
  project_id: string;
  item_id: string | null;
  responsible_id: string | null;
  starts_at: string;
  ends_at: string;
  override_reason: string | null;
}

export interface DeviceConflict {
  id: string;
  starts_at: string;
  ends_at: string;
  project_id: string | null;
  project_name: string | null;
  item_id: string | null;
  responsible_id: string | null;
  masked: boolean;
}

export interface ContributionAttachment {
  id: string;
  project_id: string;
  item_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
}

export const ATTACHMENT_BUCKET = "project-attachments";

export const ABSENCE_LABEL: Record<AbsenceKind, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  other: "Abwesend",
};

/* --------------------------------------------------------------- Helfer */

/** Netto-Arbeitszeit in Minuten (Dauer abzüglich Pause). */
export function netMinutes(entry: Pick<TimeEntry, "started_at" | "ended_at" | "break_minutes">): number {
  const start = Date.parse(entry.started_at);
  const end = Date.parse(entry.ended_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000) - Math.max(0, entry.break_minutes || 0));
}

export function sumMinutes(entries: TimeEntry[]): number {
  return entries.reduce((sum, e) => sum + netMinutes(e), 0);
}

/** "7:30 h" – bewusst ohne Dezimalstunden, damit nichts falsch gerundet wirkt. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

/** Überschneidung zweier Zeiträume; direktes Aneinandergrenzen zählt nicht. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Alle Kalendertage eines Zeitraums als ISO-Datum. */
export function datesInRange(startIso: string, endIso: string, limit = 400): string[] {
  const out: string[] = [];
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur <= end && out.length < limit) {
    out.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Lokales "YYYY-MM-DDTHH:mm" (für <input type="datetime-local">) → ISO. */
export function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ctx() {
  const client = networkConfigured ? getNetworkClient() : null;
  const session = authClient.getSession();
  return { client, session, ready: Boolean(client && session) };
}

/**
 * Klar unterscheidbare Zustände statt eines einzigen `unavailable`.
 *  - "loading"          – Anfrage läuft
 *  - "ready"            – geladen (kann leer sein → „noch keine Einträge")
 *  - "not-configured"   – keine Supabase-Verbindung konfiguriert
 *  - "signed-out"       – nicht angemeldet
 *  - "setup-missing"    – Tabellen/Funktionen fehlen (Migration nicht eingespielt)
 *  - "denied"           – angemeldet, aber keine Berechtigung (RLS/Grants)
 *  - "offline"          – Netzwerk-/Verbindungsfehler
 *  - "error"            – sonstiger Ladefehler
 */
export type OpsStatus =
  | "loading" | "ready" | "not-configured" | "signed-out"
  | "setup-missing" | "denied" | "offline" | "error";

/** Fehler einer Anfrage einem Zustand zuordnen – ohne Inhalte offenzulegen. */
export function classifyOpsError(err: unknown): OpsStatus {
  if (isMissingSchemaError(err)) return "setup-missing";
  const e = err as { code?: string; status?: number; message?: string; name?: string } | null;
  const code = e?.code ?? "";
  const status = e?.status ?? 0;
  const msg = (e?.message ?? "").toLowerCase();
  if (code === "42501" || code === "PGRST301" || status === 401 || status === 403 || msg.includes("permission denied")) {
    return "denied";
  }
  if (e?.name === "TypeError" || msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed")) {
    return "offline";
  }
  return "error";
}

export const OPS_STATUS_TEXT: Record<Exclude<OpsStatus, "loading" | "ready">, string> = {
  "not-configured": "Die Cloud-Verbindung ist in dieser Umgebung nicht konfiguriert.",
  "signed-out": "Bitte melde dich an, um gemeinsame Kalenderdaten zu sehen.",
  "setup-missing": "Die gemeinsamen Kalendertabellen sind in der Datenbank noch nicht eingerichtet (Migration nicht eingespielt).",
  denied: "Für diese Daten fehlen die Berechtigungen (Projektfreigabe oder Datenbankrechte).",
  offline: "Die Daten konnten nicht geladen werden – Verbindung unterbrochen.",
  error: "Beim Laden ist ein Fehler aufgetreten.",
};

function useAsyncList<T>(load: (signal: { cancelled: boolean }) => Promise<T[]>, deps: unknown[]) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<OpsStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const tick = useRef(0);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Anmeldewechsel sofort berücksichtigen (Token/Signout).
  useEffect(() => {
    const off = authClient.onAuthStateChange(() => reload());
    return () => { off(); };
  }, [reload]);

  useEffect(() => {
    const signal = { cancelled: false };
    const run = ++tick.current;
    const base = ctx();
    if (!base.client) { setRows([]); setStatus("not-configured"); setError(null); setLoading(false); return; }
    if (!base.session) { setRows([]); setStatus("signed-out"); setError(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    load(signal)
      .then((data) => {
        if (signal.cancelled || run !== tick.current) return;
        setRows(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (signal.cancelled || run !== tick.current) return;
        const next = classifyOpsError(err);
        setRows([]);
        setStatus(next);
        setError(next === "setup-missing" ? null : (err as Error)?.message ?? null);
      })
      .finally(() => {
        if (!signal.cancelled && run === tick.current) setLoading(false);
      });
    return () => { signal.cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const unavailable = status !== "ready" && status !== "loading";
  return { rows, setRows, loading, status, unavailable, error, reload };
}


/* ------------------------------------------------------ Schritt 04: Zeit */

export interface TimeEntryInput {
  /** Leer = ohne Beitragsbezug (Spalte ist NOT NULL, daher leerer Text). */
  itemId: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  breakMinutes: number;
  note?: string;
}

/**
 * Arbeitszeit für ein beliebiges Projekt anlegen – dieselbe Tabelle wie im
 * Projektbereich, nur ohne festen Projektfilter (Startseite → Organisation).
 */
export async function addTimeEntryFor(projectId: string, input: TimeEntryInput) {
  const { client, session } = ctx();
  if (!client || !session) throw new Error("Zeiterfassung benötigt eine Anmeldung.");
  if (!projectId) throw new Error("Bitte ein Projekt wählen.");
  const { error: err } = await client.from("time_entries").insert({
    project_id: projectId,
    item_id: input.itemId ?? "",
    user_id: input.userId || session.user.id,
    started_at: input.startedAt,
    ended_at: input.endedAt,
    break_minutes: Math.max(0, Math.round(input.breakMinutes || 0)),
    note: input.note?.trim() || null,
    created_by: session.user.id,
  });
  if (err) throw err;
}

/** Eigene Abwesenheit anlegen – projektunabhängig (personenbezogen). */
export async function addAbsenceEntry(input: {
  kind: AbsenceKind; startsOn: string; endsOn: string; note?: string; status?: string;
}) {
  const { client, session } = ctx();
  if (!client || !session) throw new Error("Abwesenheiten benötigen eine Anmeldung.");
  const { error: err } = await client.from("absences").insert({
    user_id: session.user.id,
    kind: input.kind,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    status: input.status ?? "planned",
    note: input.note?.trim() || null,
  });
  if (err) throw err;
}

export interface DeviceBookingInput {
  deviceId: string;
  itemId?: string | null;
  responsibleId?: string | null;
  startsAt: string;
  endsAt: string;
  overrideReason?: string;
}

/** Konflikte eines Geräts – auch aus Projekten ohne eigene Sicht (maskiert). */
export async function checkDeviceConflicts(
  deviceId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string,
): Promise<DeviceConflict[]> {
  const { client } = ctx();
  if (!client) return [];
  const { data, error: err } = await client.rpc("device_booking_conflicts", {
    _device_id: deviceId,
    _starts_at: startsAt,
    _ends_at: endsAt,
    _exclude_id: excludeId ?? null,
  });
  if (err) throw err;
  return (data ?? []) as DeviceConflict[];
}

/** Gerätebuchung für ein beliebiges Projekt – zentrale Geräteverwaltung. */
export async function bookDeviceFor(projectId: string, input: DeviceBookingInput) {
  const { client, session } = ctx();
  if (!client || !session) throw new Error("Buchungen benötigen eine Anmeldung.");
  if (!projectId) throw new Error("Bitte ein Projekt wählen.");
  const reason = input.overrideReason?.trim() || null;
  const { error: err } = await client.from("device_bookings").insert({
    device_id: input.deviceId,
    project_id: projectId,
    item_id: input.itemId || null,
    responsible_id: input.responsibleId ?? null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    override_reason: reason,
    override_by: reason ? session.user.id : null,
    override_at: reason ? new Date().toISOString() : null,
    created_by: session.user.id,
  });
  if (err) throw err;
}


export function useTimeEntries(projectId: string | undefined) {
  const { rows, loading, status, unavailable, error, reload } = useAsyncList<TimeEntry>(async () => {
    const { client, session } = ctx();
    if (!client || !session || !projectId) return [];
    const { data, error: err } = await client
      .from("time_entries")
      .select("id,project_id,item_id,user_id,started_at,ended_at,break_minutes,note")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false });
    if (err) throw err;
    return (data ?? []) as TimeEntry[];
  }, [projectId]);

  const myId = ctx().session?.user.id ?? null;

  const add = useCallback(async (input: TimeEntryInput) => {
    const { client, session } = ctx();
    if (!client || !session || !projectId) throw new Error("Zeiterfassung benötigt eine Anmeldung.");
    const { error: err } = await client.from("time_entries").insert({
      project_id: projectId,
      item_id: input.itemId,
      user_id: input.userId,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      break_minutes: Math.max(0, Math.round(input.breakMinutes || 0)),
      note: input.note?.trim() || null,
      created_by: session.user.id,
    });
    if (err) throw err;
    reload();
  }, [projectId, reload]);

  const update = useCallback(async (id: string, patch: Partial<TimeEntryInput>) => {
    const { client } = ctx();
    if (!client) throw new Error("Zeiterfassung benötigt eine Anmeldung.");
    const { error: err } = await client
      .from("time_entries")
      .update({
        ...(patch.itemId !== undefined ? { item_id: patch.itemId } : {}),
        ...(patch.startedAt !== undefined ? { started_at: patch.startedAt } : {}),
        ...(patch.endedAt !== undefined ? { ended_at: patch.endedAt } : {}),
        ...(patch.breakMinutes !== undefined ? { break_minutes: Math.max(0, Math.round(patch.breakMinutes)) } : {}),
        ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (err) throw err;
    reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    const { client } = ctx();
    if (!client) return;
    const { error: err } = await client.from("time_entries").delete().eq("id", id);
    if (err) throw err;
    reload();
  }, [reload]);

  /** Ist-Zeiten je Beitrag (Minuten, netto). */
  const minutesByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rows) map.set(e.item_id, (map.get(e.item_id) ?? 0) + netMinutes(e));
    return map;
  }, [rows]);

  /** Ist-Zeiten je Person (Minuten, netto). */
  const minutesByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rows) map.set(e.user_id, (map.get(e.user_id) ?? 0) + netMinutes(e));
    return map;
  }, [rows]);

  /** Tatsächlicher Zeitraum + Aufwand je Beitrag – rein abgeleitet. */
  const actualsByItem = useMemo(() => deriveActuals(rows), [rows]);

  /** IDs von Einträgen, die sich bei derselben Person zeitlich überschneiden. */
  const overlapIds = useMemo(() => overlappingEntryIds(rows), [rows]);

  return {
    entries: rows, loading, status, unavailable, error, reload, add, update, remove,
    minutesByItem, minutesByUser, actualsByItem, overlapIds, myId,
  };
}

export interface ItemActuals {
  /** Frühester Start aller Arbeitszeiteinträge (ISO). */
  startedAt: string;
  /** Spätestes Ende aller Arbeitszeiteinträge (ISO). */
  endedAt: string;
  /** Summe der Nettoarbeitszeiten aller Personen (Minuten). */
  minutes: number;
}

/** Ist-Werte je Beitrag aus den Zeiteinträgen ableiten (keine eigenen Felder). */
export function deriveActuals(entries: TimeEntry[]): Map<string, ItemActuals> {
  const map = new Map<string, ItemActuals>();
  for (const e of entries) {
    const cur = map.get(e.item_id);
    const minutes = (cur?.minutes ?? 0) + netMinutes(e);
    const startedAt = !cur || Date.parse(e.started_at) < Date.parse(cur.startedAt) ? e.started_at : cur.startedAt;
    const endedAt = !cur || Date.parse(e.ended_at) > Date.parse(cur.endedAt) ? e.ended_at : cur.endedAt;
    map.set(e.item_id, { startedAt, endedAt, minutes });
  }
  return map;
}

/** Überschneidungen derselben Person – nur Hinweis, keine Sperre. */
export function overlappingEntryIds(entries: TimeEntry[]): Set<string> {
  const out = new Set<string>();
  const byUser = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
    byUser.get(e.user_id)!.push(e);
  }
  for (const list of byUser.values()) {
    const sorted = [...list].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (Date.parse(cur.started_at) < Date.parse(prev.ended_at)) {
        out.add(prev.id);
        out.add(cur.id);
      }
    }
  }
  return out;
}

/**
 * Projektübergreifende Arbeitszeiten (nur lesen) – für den Netzwerkkalender.
 * RLS begrenzt die Antwort bereits auf zugängliche Projekte.
 */
export function useTimeEntriesForProjects(projectIds: string[]) {
  const key = useMemo(() => projectIds.slice().sort().join("|"), [projectIds]);
  const { rows, loading, status, unavailable, error, reload } = useAsyncList<TimeEntry>(async () => {
    const { client, session } = ctx();
    const ids = key ? key.split("|") : [];
    if (!client || !session || !ids.length) return [];
    const { data, error: err } = await client
      .from("time_entries")
      .select("id,project_id,item_id,user_id,started_at,ended_at,break_minutes,note")
      .in("project_id", ids)
      .order("started_at", { ascending: false });
    if (err) throw err;
    return (data ?? []) as TimeEntry[];
  }, [key]);

  const myId = ctx().session?.user.id ?? null;
  return { entries: rows, loading, status, unavailable, error, reload, myId };
}

/* ----------------------------------------------- Schritt 04: Abwesenheit */

export function useAbsences(projectIds: string[]) {
  const key = useMemo(() => projectIds.slice().sort().join("|"), [projectIds]);

  const { rows, loading, status, unavailable, error, reload } = useAsyncList<Absence>(async () => {
    const { client, session } = ctx();
    if (!client || !session) return [];
    const ids = key ? key.split("|") : [];
    const { data, error: err } = await client.rpc("absences_for_projects", { _project_ids: ids });
    if (err) throw err;
    return (data ?? []) as Absence[];
  }, [key]);

  const myId = ctx().session?.user.id ?? null;

  const add = useCallback(async (input: {
    kind: AbsenceKind; startsOn: string; endsOn: string; note?: string; status?: string;
  }) => {
    const { client, session } = ctx();
    if (!client || !session) throw new Error("Abwesenheiten benötigen eine Anmeldung.");
    const { error: err } = await client.from("absences").insert({
      user_id: session.user.id,
      kind: input.kind,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: input.status ?? "planned",
      note: input.note?.trim() || null,
    });
    if (err) throw err;
    reload();
  }, [reload]);

  /** Eigene Abwesenheit anpassen (Status/Zeitraum/Bemerkung). */
  const update = useCallback(async (id: string, patch: {
    kind?: AbsenceKind; startsOn?: string; endsOn?: string; note?: string; status?: string;
  }) => {
    const { client } = ctx();
    if (!client) throw new Error("Abwesenheiten benötigen eine Anmeldung.");
    const { error: err } = await client.from("absences").update({
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.startsOn !== undefined ? { starts_on: patch.startsOn } : {}),
      ...(patch.endsOn !== undefined ? { ends_on: patch.endsOn } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    }).eq("id", id);
    if (err) throw err;
    reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    const { client } = ctx();
    if (!client) return;
    const { error: err } = await client.from("absences").delete().eq("id", id);
    if (err) throw err;
    reload();
  }, [reload]);

  /** Abwesenheiten je Kalendertag – für gemeinsame Kalender. */
  const byDate = useMemo(() => {
    const map = new Map<string, Absence[]>();
    for (const a of rows) {
      for (const d of datesInRange(a.starts_on, a.ends_on)) {
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(a);
      }
    }
    return map;
  }, [rows]);

  return { absences: rows, loading, status, unavailable, error, reload, add, update, remove, byDate, myId };
}

/* ------------------------------------------------- Schritt 05: Geräte */

export function useDevices(projectId: string | undefined) {
  const devicesState = useAsyncList<Device>(async () => {
    const { client, session } = ctx();
    if (!client || !session) return [];
    const { data, error: err } = await client
      .from("devices")
      .select("id,owner_id,name,responsible_id,note,archived")
      .order("name");
    if (err) throw err;
    return (data ?? []) as Device[];
  }, []);

  const bookingsState = useAsyncList<DeviceBooking>(async () => {
    const { client, session } = ctx();
    if (!client || !session) return [];
    let query = client
      .from("device_bookings")
      .select("id,device_id,project_id,item_id,responsible_id,starts_at,ends_at,override_reason")
      .order("starts_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error: err } = await query;
    if (err) throw err;
    return (data ?? []) as DeviceBooking[];
  }, [projectId]);

  const myId = ctx().session?.user.id ?? null;

  const addDevice = useCallback(async (name: string, note?: string, responsibleId?: string | null) => {
    const { client, session } = ctx();
    if (!client || !session) throw new Error("Geräte benötigen eine Anmeldung.");
    const { error: err } = await client.from("devices").insert({
      owner_id: session.user.id,
      name: name.trim() || "Gerät",
      note: note?.trim() || null,
      responsible_id: responsibleId ?? null,
    });
    if (err) throw err;
    devicesState.reload();
  }, [devicesState]);

  const updateDevice = useCallback(async (id: string, patch: Partial<Pick<Device, "name" | "note" | "responsible_id" | "archived">>) => {
    const { client } = ctx();
    if (!client) return;
    const { error: err } = await client
      .from("devices")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) throw err;
    devicesState.reload();
  }, [devicesState]);

  /** Konflikte gegen alle Buchungen des Geräts – auch aus fremden Projekten. */
  const checkConflicts = useCallback(async (
    deviceId: string,
    startsAt: string,
    endsAt: string,
    excludeId?: string,
  ): Promise<DeviceConflict[]> => {
    const { client } = ctx();
    if (!client) return [];
    const { data, error: err } = await client.rpc("device_booking_conflicts", {
      _device_id: deviceId,
      _starts_at: startsAt,
      _ends_at: endsAt,
      _exclude_id: excludeId ?? null,
    });
    if (err) throw err;
    return (data ?? []) as DeviceConflict[];
  }, []);

  const book = useCallback(async (input: {
    deviceId: string;
    itemId?: string | null;
    responsibleId?: string | null;
    startsAt: string;
    endsAt: string;
    overrideReason?: string;
  }) => {
    const { client, session } = ctx();
    if (!client || !session || !projectId) throw new Error("Buchungen benötigen ein geteiltes Projekt.");
    const { error: err } = await client.from("device_bookings").insert({
      device_id: input.deviceId,
      project_id: projectId,
      item_id: input.itemId ?? null,
      responsible_id: input.responsibleId ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      override_reason: input.overrideReason?.trim() || null,
      override_by: input.overrideReason?.trim() ? session.user.id : null,
      override_at: input.overrideReason?.trim() ? new Date().toISOString() : null,
      created_by: session.user.id,
    });
    if (err) throw err;
    bookingsState.reload();
  }, [projectId, bookingsState]);

  const removeBooking = useCallback(async (id: string) => {
    const { client } = ctx();
    if (!client) return;
    const { error: err } = await client.from("device_bookings").delete().eq("id", id);
    if (err) throw err;
    bookingsState.reload();
  }, [bookingsState]);

  const bookingsByItem = useMemo(() => {
    const map = new Map<string, DeviceBooking[]>();
    for (const b of bookingsState.rows) {
      if (!b.item_id) continue;
      if (!map.has(b.item_id)) map.set(b.item_id, []);
      map.get(b.item_id)!.push(b);
    }
    return map;
  }, [bookingsState.rows]);

  return {
    devices: devicesState.rows,
    bookings: bookingsState.rows,
    bookingsByItem,
    loading: devicesState.loading || bookingsState.loading,
    status: devicesState.status !== "ready" ? devicesState.status : bookingsState.status,
    unavailable: devicesState.unavailable,
    error: devicesState.error ?? bookingsState.error,
    reload: () => { devicesState.reload(); bookingsState.reload(); },
    addDevice,
    updateDevice,
    checkConflicts,
    book,
    removeBooking,
    myId,
  };
}

/* -------------------------------------------- Schritt 05: Beitragsanhänge */

export function useAttachments(projectId: string | undefined, itemId: string | undefined) {
  const { rows, loading, unavailable, reload } = useAsyncList<ContributionAttachment>(async () => {
    const { client, session } = ctx();
    if (!client || !session || !projectId || !itemId) return [];
    const { data, error: err } = await client
      .from("contribution_attachments")
      .select("id,project_id,item_id,storage_path,file_name,mime_type,size_bytes,created_by,created_at")
      .eq("project_id", projectId)
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });
    if (err) throw err;
    return (data ?? []) as ContributionAttachment[];
  }, [projectId, itemId]);

  const upload = useCallback(async (file: File) => {
    const { client, session } = ctx();
    if (!client || !session || !projectId || !itemId) {
      throw new Error("Anhänge benötigen ein geteiltes Projekt und eine Anmeldung.");
    }
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "datei";
    const path = `${projectId}/${itemId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await client.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) throw upErr;
    const { error: err } = await client.from("contribution_attachments").insert({
      project_id: projectId,
      item_id: itemId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      created_by: session.user.id,
    });
    if (err) throw err;
    reload();
  }, [projectId, itemId, reload]);

  /**
   * Entfernt nur die Zuordnung. Die Datei selbst wird ausschließlich dann
   * gelöscht, wenn sie an keiner anderen Stelle mehr verlinkt ist.
   */
  const unlink = useCallback(async (attachment: ContributionAttachment) => {
    const { client } = ctx();
    if (!client) return;
    const { error: err } = await client.from("contribution_attachments").delete().eq("id", attachment.id);
    if (err) throw err;
    try {
      const { data: stillLinked } = await client.rpc("attachment_still_linked", {
        _storage_path: attachment.storage_path,
      });
      if (stillLinked === false) {
        await client.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]);
      }
    } catch {
      // Bleibt die Datei liegen, ist das unkritisch – Daten gehen nie verloren.
    }
    reload();
  }, [reload]);

  /** Kurzlebiger Link zum Öffnen/Herunterladen (privater Bucket). */
  const openUrl = useCallback(async (attachment: ContributionAttachment) => {
    const { client } = ctx();
    if (!client) return null;
    const { data, error: err } = await client.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.storage_path, 300);
    if (err) throw err;
    return data?.signedUrl ?? null;
  }, []);

  return { attachments: rows, loading, unavailable, reload, upload, unlink, openUrl };
}
