import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X, MessageSquare, FolderKanban } from "lucide-react";
import { useConversation, type ChatTarget } from "@/lib/chatStore";
import type { NetworkPerson } from "@/lib/networkStore";

function initialOf(name: string) {
  return (name?.[0] ?? "?").toUpperCase();
}

function Bubble({
  own,
  name,
  avatarUrl,
  body,
  time,
  showHeader,
}: {
  own: boolean;
  name: string;
  avatarUrl?: string | null;
  body: string;
  time: string;
  showHeader: boolean;
}) {
  return (
    <div className={`flex gap-2 ${own ? "flex-row-reverse" : ""} ${showHeader ? "mt-3" : "mt-1"}`}>
      <div className="w-7 shrink-0">
        {showHeader && (
          <div
            className="h-7 w-7 rounded-full overflow-hidden grid place-items-center border"
            style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-semibold text-muted-foreground">{initialOf(name)}</span>
            )}
          </div>
        )}
      </div>
      <div className={`min-w-0 max-w-[78%] ${own ? "items-end text-right" : ""} flex flex-col`}>
        {showHeader && (
          <div className="text-[10px] text-muted-foreground mb-0.5">
            {own ? "Du" : name} · {time}
          </div>
        )}
        <div
          className="rounded-lg px-2.5 py-1.5 text-sm whitespace-pre-wrap break-words border text-left"
          style={
            own
              ? { background: "hsl(var(--accent-gold) / 0.16)", borderColor: "hsl(var(--accent-gold) / 0.45)" }
              : { background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }
          }
          title={time}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({
  target,
  people,
  onClose,
}: {
  target: ChatTarget;
  /** Bekannte Personen für Name/Avatar der Absender. */
  people: Map<string, NetworkPerson>;
  onClose: () => void;
}) {
  const chat = useConversation(target);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [target.kind, chat.conversationId]);

  const rows = useMemo(() => {
    return chat.messages.map((m, i) => {
      const prev = chat.messages[i - 1];
      const showHeader =
        !prev || prev.sender_id !== m.sender_id || Date.parse(m.created_at) - Date.parse(prev.created_at) > 300_000;
      const person = people.get(m.sender_id);
      return {
        ...m,
        showHeader,
        name: person?.name ?? (m.sender_id === chat.myId ? "Du" : "Unbekannt"),
        avatarUrl: person?.avatarUrl ?? null,
        time: new Date(m.created_at).toLocaleString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    });
  }, [chat.messages, chat.myId, people]);

  const submit = () => {
    const text = draft;
    setDraft("");
    void chat.send(text);
  };

  return (
    <div
      className="rounded-xl border flex flex-col"
      style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", height: 460 }}
    >
      <div className="flex items-center gap-2 px-3 h-11 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        {target.kind === "project" ? <FolderKanban size={15} /> : <MessageSquare size={15} />}
        <span className="text-sm font-semibold truncate">{target.title}</span>
        <span className="text-[11px] text-muted-foreground">
          {target.kind === "project" ? "Projektchat" : "Direktchat"}
        </span>
        <button onClick={onClose} className="ml-auto h-7 w-7 rounded-md grid place-items-center hover:bg-[hsl(var(--surface-muted))]" title="Chat schließen">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {chat.loading && <div className="p-6 text-center text-sm text-muted-foreground">Chat wird geladen …</div>}
        {chat.error && (
          <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "hsl(0 70% 55% / 0.4)" }}>
            {chat.error}
          </div>
        )}
        {!chat.loading && !chat.error && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Noch keine Nachrichten.</div>
        )}
        {rows.map((m) => (
          <Bubble
            key={m.id}
            own={m.sender_id === chat.myId}
            name={m.name}
            avatarUrl={m.avatarUrl}
            body={m.body}
            time={m.time}
            showHeader={m.showHeader}
          />
        ))}
        <div ref={endRef} />
      </div>

      <div className="p-2 border-t flex items-end gap-2" style={{ borderColor: "hsl(var(--hairline))" }}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Nachricht schreiben … (Enter senden, Shift+Enter neue Zeile)"
          disabled={!chat.conversationId}
          className="flex-1 resize-none rounded-md border px-2.5 py-1.5 text-sm outline-none"
          style={{ background: "hsl(var(--surface-muted))", borderColor: "hsl(var(--hairline))" }}
        />
        <button
          onClick={submit}
          disabled={!chat.conversationId || !draft.trim()}
          className="h-9 w-9 rounded-md border grid place-items-center disabled:opacity-40"
          style={{ borderColor: "hsl(var(--accent-gold))" }}
          title="Senden"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;
