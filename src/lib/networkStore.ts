/**
 * Netzwerk-Store: Profile, Kontakte, Kontaktanfragen, Projektmitglieder
 * und Online-Status – alles gemeinsam im eigenen Supabase-Projekt.
 *
 * Die CAD-/Projektinhalte bleiben unverändert lokal; hier geht es nur um
 * die gemeinsame Personen- und Zugehörigkeitsschicht.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNetworkClient, isMissingSchemaError, networkConfigured } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";

export type PresenceStatus = "online" | "away" | "busy" | "offline";
export type ContactState = "pending" | "accepted" | "declined";

export interface NetworkProfile {
  id: string;
  display_name: string;
  role?: string | null;
  avatar_url?: string | null;
}

export interface ContactRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: ContactState;
}

export interface MemberRow {
  project_id: string;
  user_id: string;
  role: string;
}

export interface NetworkPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: string | null;
  status: PresenceStatus;
}

export interface LocalProjectRef {
  id: string;
  name: string;
}

const STALE_AFTER_MS = 90_000;
const HEARTBEAT_MS = 30_000;

export const presenceColor = (s: PresenceStatus) =>
  s === "online"
    ? "hsl(140 60% 45%)"
    : s === "away"
      ? "hsl(42 92% 52%)"
      : s === "busy"
        ? "hsl(0 70% 55%)"
        : "hsl(0 0% 55%)";

export const presenceLabel = (s: PresenceStatus) =>
  s === "online" ? "Online" : s === "away" ? "Abwesend" : s === "busy" ? "Beschäftigt" : "Offline";

function effectiveStatus(row: { status?: string; last_seen_at?: string } | undefined): PresenceStatus {
  if (!row) return "offline";
  const status = (row.status ?? "offline") as PresenceStatus;
  if (status === "offline") return "offline";
  const seen = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  if (!seen || Date.now() - seen > STALE_AFTER_MS) return "offline";
  return status;
}

export interface NetworkState {
  /** Supabase erreichbar und Netzwerk-Tabellen vorhanden. */
  ready: boolean;
  loading: boolean;
  /** Migration noch nicht eingespielt. */
  schemaMissing: boolean;
  error: string | null;
  myId: string | null;
  myProfile: NetworkProfile | null;
  myStatus: PresenceStatus;
  /** Angenommene Kontakte inkl. Live-Status. */
  contacts: NetworkPerson[];
  /** Eingehende, offene Kontaktanfragen. */
  incoming: { contactId: string; person: NetworkProfile }[];
  /** Von mir gesendete, noch offene Anfragen. */
  outgoing: { contactId: string; person: NetworkProfile }[];
  members: MemberRow[];
}

export function useNetwork(localProjects: LocalProjectRef[]) {
  const [state, setState] = useState<NetworkState>({
    ready: false,
    loading: true,
    schemaMissing: false,
    error: null,
    myId: null,
    myProfile: null,
    myStatus: "offline",
    contacts: [],
    incoming: [],
    outgoing: [],
    members: [],
  });
  const desiredStatus = useRef<PresenceStatus>("online");
  const reloadRef = useRef<() => void>(() => {});

  const projectsKey = useMemo(
    () => localProjects.map((p) => `${p.id}:${p.name}`).join("|"),
    [localProjects]
  );

  const load = useCallback(async () => {
    const client = getNetworkClient();
    const session = authClient.getSession();
    if (!networkConfigured || !client || !session) {
      setState((s) => ({ ...s, loading: false, ready: false, error: "Nicht angemeldet." }));
      return;
    }
    const myId = session.user.id;

    try {
      const { data: contactRows, error: contactErr } = await client
        .from("contacts")
        .select("id,requester_id,addressee_id,status");
      if (contactErr) throw contactErr;

      const rows = (contactRows ?? []) as ContactRow[];
      const otherIds = Array.from(
        new Set(rows.map((r) => (r.requester_id === myId ? r.addressee_id : r.requester_id)))
      );

      const { data: memberRows, error: memberErr } = await client
        .from("project_members")
        .select("project_id,user_id,role");
      if (memberErr) throw memberErr;
      const members = (memberRows ?? []) as MemberRow[];

      const profileIds = Array.from(new Set([myId, ...otherIds, ...members.map((m) => m.user_id)]));
      const { data: profileRows, error: profileErr } = await client
        .from("profiles")
        .select("id,display_name,role,avatar_url")
        .in("id", profileIds);
      if (profileErr) throw profileErr;
      const profiles = new Map<string, NetworkProfile>(
        (profileRows ?? []).map((p: NetworkProfile) => [p.id, p])
      );

      const { data: presenceRows, error: presenceErr } = await client
        .from("presence")
        .select("user_id,status,last_seen_at")
        .in("user_id", profileIds);
      if (presenceErr) throw presenceErr;
      const presence = new Map(
        (presenceRows ?? []).map((p: { user_id: string; status: string; last_seen_at: string }) => [p.user_id, p])
      );

      const personOf = (id: string): NetworkPerson => ({
        id,
        name: profiles.get(id)?.display_name?.trim() || "Unbekannt",
        avatarUrl: profiles.get(id)?.avatar_url,
        role: profiles.get(id)?.role,
        status: effectiveStatus(presence.get(id)),
      });

      const accepted = rows.filter((r) => r.status === "accepted");
      const contacts = accepted
        .map((r) => personOf(r.requester_id === myId ? r.addressee_id : r.requester_id))
        .sort((a, b) => a.name.localeCompare(b.name));

      const incoming = rows
        .filter((r) => r.status === "pending" && r.addressee_id === myId)
        .map((r) => ({ contactId: r.id, person: profiles.get(r.requester_id) ?? { id: r.requester_id, display_name: "Unbekannt" } }));
      const outgoing = rows
        .filter((r) => r.status === "pending" && r.requester_id === myId)
        .map((r) => ({ contactId: r.id, person: profiles.get(r.addressee_id) ?? { id: r.addressee_id, display_name: "Unbekannt" } }));

      setState({
        ready: true,
        loading: false,
        schemaMissing: false,
        error: null,
        myId,
        myProfile: profiles.get(myId) ?? { id: myId, display_name: "" },
        myStatus: effectiveStatus(presence.get(myId)),
        contacts,
        incoming,
        outgoing,
        members,
      });
    } catch (error) {
      const missing = isMissingSchemaError(error);
      setState((s) => ({
        ...s,
        loading: false,
        ready: false,
        myId,
        schemaMissing: missing,
        error: missing
          ? "Die Netzwerk-Tabellen fehlen im Supabase-Projekt. Bitte die Migration db/migrations/20260821140000_network.sql einmalig im SQL-Editor ausführen."
          : error instanceof Error
            ? error.message
            : "Netzwerkdaten konnten nicht geladen werden.",
      }));
    }
  }, []);

  reloadRef.current = () => { void load(); };

  useEffect(() => { void load(); }, [load]);

  /* -------- Präsenz melden (Heartbeat + Sichtbarkeit + Abmeldung) -------- */
  useEffect(() => {
    const client = getNetworkClient();
    const session = authClient.getSession();
    if (!client || !session) return;
    const myId = session.user.id;
    let cancelled = false;

    const beat = async (status?: PresenceStatus) => {
      if (cancelled) return;
      const next = status ?? desiredStatus.current;
      try {
        await client
          .from("presence")
          .upsert({ user_id: myId, status: next, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
      } catch {
        // Präsenz ist unkritisch – Fehler dürfen die Oberfläche nicht stören.
      }
    };

    void beat();
    const timer = window.setInterval(() => { void beat(); }, HEARTBEAT_MS);
    const onVisibility = () => { void beat(document.hidden ? "away" : desiredStatus.current); };
    const onUnload = () => { void beat("offline"); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onUnload);
      void client
        .from("presence")
        .upsert({ user_id: myId, status: "offline", last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
    };
  }, []);

  /* ------------------------------ Realtime ------------------------------ */
  useEffect(() => {
    const client = getNetworkClient();
    if (!client || !state.ready) return;
    let debounce = 0;
    const refresh = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => reloadRef.current(), 250);
    };
    const channel = client
      .channel("pixuna-network")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refresh)
      .subscribe();

    // Zusätzlicher Fallback, falls Realtime im Projekt deaktiviert ist.
    const poll = window.setInterval(() => reloadRef.current(), 45_000);

    return () => {
      window.clearTimeout(debounce);
      window.clearInterval(poll);
      void client.removeChannel(channel);
    };
  }, [state.ready]);

  /* ---------------- Lokale Projekte als Netzwerk-Projekte ---------------- */
  useEffect(() => {
    const client = getNetworkClient();
    const session = authClient.getSession();
    if (!client || !session || !state.ready || localProjects.length === 0) return;
    const payload = localProjects.map((p) => ({
      id: p.id,
      owner_id: session.user.id,
      name: p.name,
      updated_at: new Date().toISOString(),
    }));
    void client
      .from("network_projects")
      .upsert(payload, { onConflict: "id" })
      .then(({ error }) => {
        if (error && !isMissingSchemaError(error)) {
          // Fremde Projekte (anderer Owner) werden von RLS abgelehnt – das ist gewollt.
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsKey, state.ready]);

  /* ------------------------------- Aktionen ----------------------------- */
  const run = useCallback(async (fn: (client: NonNullable<ReturnType<typeof getNetworkClient>>) => Promise<void>) => {
    const client = getNetworkClient();
    if (!client) return;
    try {
      await fn(client);
      await load();
    } catch (error) {
      setState((s) => ({ ...s, error: error instanceof Error ? error.message : "Aktion fehlgeschlagen." }));
    }
  }, [load]);

  const actions = useMemo(() => ({
    searchUsers: async (query: string): Promise<NetworkProfile[]> => {
      const client = getNetworkClient();
      if (!client || query.trim().length < 2) return [];
      const { data, error } = await client.rpc("search_profiles", { query: query.trim() });
      if (error) return [];
      return (data ?? []) as NetworkProfile[];
    },
    sendRequest: (userId: string) =>
      run(async (client) => {
        const session = authClient.getSession();
        if (!session) return;
        const { error } = await client
          .from("contacts")
          .upsert(
            { requester_id: session.user.id, addressee_id: userId, status: "pending", updated_at: new Date().toISOString() },
            { onConflict: "requester_id,addressee_id" }
          );
        if (error) throw error;
      }),
    acceptRequest: (contactId: string) =>
      run(async (client) => {
        const { error } = await client
          .from("contacts")
          .update({ status: "accepted", updated_at: new Date().toISOString() })
          .eq("id", contactId);
        if (error) throw error;
      }),
    declineRequest: (contactId: string) =>
      run(async (client) => {
        const { error } = await client.from("contacts").delete().eq("id", contactId);
        if (error) throw error;
      }),
    addMember: (projectId: string, userId: string) =>
      run(async (client) => {
        const session = authClient.getSession();
        const { error } = await client
          .from("project_members")
          .upsert({ project_id: projectId, user_id: userId, role: "member", added_by: session?.user.id }, { onConflict: "project_id,user_id" });
        if (error) throw error;
      }),
    removeMember: (projectId: string, userId: string) =>
      run(async (client) => {
        const { error } = await client
          .from("project_members")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", userId);
        if (error) throw error;
      }),
    setStatus: (status: PresenceStatus) => {
      desiredStatus.current = status;
      return run(async (client) => {
        const session = authClient.getSession();
        if (!session) return;
        const { error } = await client
          .from("presence")
          .upsert({ user_id: session.user.id, status, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
        if (error) throw error;
      });
    },
    saveProfile: (patch: { display_name?: string; role?: string; avatar_url?: string | null }) =>
      run(async (client) => {
        const session = authClient.getSession();
        if (!session) return;
        const { error } = await client
          .from("profiles")
          .upsert({ id: session.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" });
        if (error) throw error;
      }),
    reload: () => { void load(); },
  }), [load, run]);

  return { ...state, ...actions };
}
