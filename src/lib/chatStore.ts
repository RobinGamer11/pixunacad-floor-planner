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
      const readAt = new Map(
        ((mems ?? []) as { conversation_id: string; last_read_at: string }[]).map((m) => [
          m.conversation_id,
          Date.parse(m.last_read_at),
        ])
      );
      const next: Record<string, boolean> = {};
      for (const c of (convs ?? []) as ConversationSummary[]) {
        const key =
          c.type === "project"
            ? `p:${c.project_id}`
            : `d:${(c.direct_key ?? "").split("|").find((id) => id !== myId) ?? ""}`;
        const seen = readAt.get(c.id) ?? 0;
        if (Date.parse(c.last_message_at) > seen) next[key] = true;
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

export function useConversation(target: ChatTarget | null) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convRef = useRef<string | null>(null);
  const key = target ? chatKeyOf(target) : null;

  const myId = authClient.getSession()?.user.id ?? null;

  /* -------- Unterhaltung öffnen (bestehende wird wiederverwendet) -------- */
  useEffect(() => {
    let active = true;
    setMessages([]);
    setConversationId(null);
    convRef.current = null;
    setError(null);
    if (!target) return;

    const client = getNetworkClient();
    if (!client) return;
    setLoading(true);

    void (async () => {
      try {
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
            : err instanceof Error
              ? err.message
              : "Chat konnte nicht geöffnet werden."
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
  const markRead = useCallback(async () => {
    const client = getNetworkClient();
    if (!client || !conversationId || !myId) return;
    try {
      await client
        .from("conversation_members")
        .upsert(
          { conversation_id: conversationId, user_id: myId, last_read_at: new Date().toISOString() },
          { onConflict: "conversation_id,user_id" }
        );
    } catch {
      // Lesestand ist unkritisch.
    }
  }, [conversationId, myId]);

  useEffect(() => {
    if (!conversationId) return;
    void markRead();
  }, [conversationId, markRead, messages.length]);

  const send = useCallback(
    async (text: string) => {
      const client = getNetworkClient();
      const body = text.trim();
      if (!client || !convRef.current || !myId || !body) return;
      const { error: sendError } = await client
        .from("messages")
        .insert({ conversation_id: convRef.current, sender_id: myId, body });
      if (sendError) {
        setError(sendError.message);
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

  return useMemo(
    () => ({ conversationId, messages, loading, error, send, myId, markRead }),
    [conversationId, error, loading, markRead, messages, myId, send]
  );
}
