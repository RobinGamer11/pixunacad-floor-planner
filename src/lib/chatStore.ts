/**
 * Chat-Store: Direktchats zwischen Kontakten und Projektgruppenchats.
 *
 * Baut vollständig auf der bestehenden Netzwerkschicht auf
 * (`networkClient` → eigenes, externes Supabase-Projekt, RLS aktiv).
 * Es wird kein zweiter Auth- oder Datenweg eingeführt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNetworkClient, isMissingSchemaError } from "@/lib/networkClient";
import { supabase as authClient } from "@/lib/supabase";
import { ensureSharedProject } from "@/lib/projectRegistration";

export type ChatTarget =
  | { kind: "direct"; userId: string; title: string; avatarUrl?: string | null }
  | { kind: "project"; projectId: string; title: string };

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export const chatKeyOf = (t: ChatTarget) => (t.kind === "direct" ? `d:${t.userId}` : `p:${t.projectId}`);

export interface ConversationSummary {
  id: string;
  type: "direct" | "project";
  project_id: string | null;
  direct_key: string | null;
  last_message_at: string;
}

/**
 * Supabase liefert bei fehlgeschlagenen Anfragen ein einfaches Fehlerobjekt –
 * kein `Error`. `instanceof Error` greift dort nicht, deshalb wird hier die
 * tatsächliche Meldung inklusive Fehlercode ausgewertet.
 */
export function describeSupabaseError(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].map((p) => (p ?? "").trim()).filter(Boolean);
  const text = parts.join(" – ");
  const code = e.code ? ` (Fehlercode ${e.code})` : "";
  return text ? `${text}${code}` : `${fallback}${code}`;
}

/** Ungelesen-Markierung: Schlüssel (`d:<userId>` / `p:<projectId>`) → true. */
export function useUnreadChats(myId: string | null, enabled: boolean) {
  const [unread, setUnread] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const client = getNetworkClient();
    if (!client || !myId || !enabled) return;
    try {
      const [{ data: convs, error: convErr }, { data: mems, error: memErr }] = await Promise.all([
        client.from("conversations").select("id,type,project_id,direct_key,last_message_at"),
        client.from("conversation_members").select("conversation_id,last_read_at").eq("user_id", myId),
      ]);
      if (convErr || memErr) return;
      const conversations = (convs ?? []) as ConversationSummary[];
      if (!conversations.length) {
        setUnread({});
        return;
      }
      const readAt = new Map(
        ((mems ?? []) as { conversation_id: string; last_read_at: string }[]).map((m) => [
          m.conversation_id,
          Date.parse(m.last_read_at),
        ])
      );

      // Ungelesen heißt: es gibt mindestens eine noch nicht gelesene Nachricht
      // EINER ANDEREN Person. Eigene Nachrichten und leere Chats zählen nicht,
      // und auch ältere fremde Nachrichten müssen erkannt werden.
      const { data: msgs, error: msgErr } = await client
        .from("messages")
        .select("conversation_id,sender_id,created_at")
        .in("conversation_id", conversations.map((c) => c.id))
        .neq("sender_id", myId)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (msgErr) return;

      const newestForeign = new Map<string, number>();
      for (const m of (msgs ?? []) as { conversation_id: string; created_at: string }[]) {
        const t = Date.parse(m.created_at);
        if (t > (newestForeign.get(m.conversation_id) ?? 0)) newestForeign.set(m.conversation_id, t);
      }

      const next: Record<string, boolean> = {};
      for (const c of conversations) {
        const key =
          c.type === "project"
            ? `p:${c.project_id}`
            : `d:${(c.direct_key ?? "").split("|").find((id) => id !== myId) ?? ""}`;
        const foreign = newestForeign.get(c.id) ?? 0;
        if (!foreign) continue;
        const seen = readAt.get(c.id) ?? 0;
        if (foreign > seen) next[key] = true;
      }
      setUnread(next);
    } catch {
      // Ungelesen-Markierung ist unkritisch.
    }
  }, [enabled, myId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const client = getNetworkClient();
    if (!client || !enabled) return;
    const channel = client
      .channel("pixuna-chat-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => { void load(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [enabled, load]);

  return { unread, refreshUnread: load };
}

export function useConversation(target: ChatTarget | null, onRead?: () => void) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const convRef = useRef<string | null>(null);
  const readUpToRef = useRef(0);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const key = target ? chatKeyOf(target) : null;

  const myId = authClient.getSession()?.user.id ?? null;

  /* -------- Unterhaltung öffnen (bestehende wird wiederverwendet) -------- */
  useEffect(() => {
    let active = true;
    setMessages([]);
    setConversationId(null);
    convRef.current = null;
    readUpToRef.current = 0;
    setError(null);
    if (!target) return;

    const client = getNetworkClient();
    if (!client) return;
    setLoading(true);

    void (async () => {
      try {
        if (target.kind === "project") {
          // Ein rein lokal angelegtes Projekt ist serverseitig noch unbekannt.
          // Erst registrieren (ohne Eigentümerwechsel), dann den Chat öffnen.
          const reg = await ensureSharedProject(target.projectId, target.title);
          if (!reg.ok) throw new Error(reg.message ?? "Projekt konnte nicht angemeldet werden.");
        }
        const { data, error: rpcError } =
          target.kind === "direct"
            ? await client.rpc("start_direct_conversation", { _other_user: target.userId })
            : await client.rpc("ensure_project_conversation", { _project_id: target.projectId });
        if (rpcError) throw rpcError;
        const convId = data as string;
        if (!active) return;
        convRef.current = convId;
        setConversationId(convId);

        const { data: rows, error: msgError } = await client
          .from("messages")
          .select("id,conversation_id,sender_id,body,created_at")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(500);
        if (msgError) throw msgError;
        if (!active) return;
        setMessages((rows ?? []) as ChatMessage[]);
      } catch (err) {
        if (!active) return;
        setError(
          isMissingSchemaError(err)
            ? "Die Chat-Tabellen fehlen noch. Bitte die Migration db/migrations/20260821160000_chat.sql im Supabase SQL-Editor ausführen."
            : describeSupabaseError(err, "Chat konnte nicht geöffnet werden.")
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  /* ------------------------- Nachrichten in Echtzeit ------------------------ */
  useEffect(() => {
    const client = getNetworkClient();
    if (!client || !conversationId) return;
    const channel = client
      .channel(`pixuna-chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [conversationId]);

  /* ------------------------------ Lesestand ------------------------------ */
  /**
   * Lesestand richtet sich nach der zuletzt tatsächlich angezeigten Nachricht,
   * nicht nach der lokalen Rechneruhr. Nur die eigene Mitgliedschaftszeile wird
   * aktualisiert (Spaltenrecht `last_read_at`).
   */
  const markRead = useCallback(async (): Promise<boolean> => {
    const client = getNetworkClient();
    const convId = convRef.current;
    if (!client || !convId || !myId) return false;
    const newest = messages.reduce((acc, m) => Math.max(acc, Date.parse(m.created_at)), 0);
    if (!newest || newest <= readUpToRef.current) return false;
    const stamp = new Date(newest).toISOString();

    const { data, error: updErr } = await client
      .from("conversation_members")
      .update({ last_read_at: stamp })
      .eq("conversation_id", convId)
      .eq("user_id", myId)
      .select("conversation_id");
    if (updErr) {
      setError(describeSupabaseError(updErr, "Lesestand konnte nicht gespeichert werden."));
      return false;
    }
    if (!data || data.length === 0) {
      // Mitgliedschaft fehlt ausnahmsweise → eigene Zeile anlegen (RLS prüft erneut).
      const { error: insErr } = await client
        .from("conversation_members")
        .insert({ conversation_id: convId, user_id: myId, last_read_at: stamp });
      if (insErr) {
        setError(describeSupabaseError(insErr, "Lesestand konnte nicht gespeichert werden."));
        return false;
      }
    }
    readUpToRef.current = newest;
    onReadRef.current?.();
    return true;
  }, [messages, myId]);

  // Nur bei sichtbar geöffnetem Chat quittieren – ein Fenster im Hintergrund
  // darf ungesehene Nachrichten nicht automatisch als gelesen markieren.
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    void markRead();
  }, [conversationId, markRead, messages, messages.length]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => { if (!document.hidden) void markRead(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [markRead]);

  const send = useCallback(
    async (text: string) => {
      const client = getNetworkClient();
      const body = text.trim();
      if (!client || !convRef.current || !myId || !body) return;
      const { error: sendError } = await client
        .from("messages")
        .insert({ conversation_id: convRef.current, sender_id: myId, body });
      if (sendError) {
        setError(describeSupabaseError(sendError, "Nachricht konnte nicht gesendet werden."));
        return;
      }
      // Eigene Nachricht sofort nachladen, falls Realtime nicht durchkommt.
      const { data } = await client
        .from("messages")
        .select("id,conversation_id,sender_id,body,created_at")
        .eq("conversation_id", convRef.current)
        .order("created_at", { ascending: true })
        .limit(500);
      if (data) setMessages(data as ChatMessage[]);
    },
    [myId]
  );

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return useMemo(
    () => ({ conversationId, messages, loading, error, send, myId, markRead, retry }),
    [conversationId, error, loading, markRead, messages, myId, retry, send]
  );
}
