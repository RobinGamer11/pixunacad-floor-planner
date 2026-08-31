/**
 * Gemeinsame Kommentar-Oberfläche für CAD und Projektmappe (Paket 07).
 *
 * Enthält ausschließlich Darstellung und Bedienung – die Verankerung
 * (Weltkoordinaten in CAD, Seitenprozente in der Mappe) liefert die jeweilige
 * Layer-Komponente. Kommentare sind keine Zeichenobjekte: die Flächen hier
 * sind außerhalb des Kommentarmodus vollständig durchlässig.
 *
 * Gestaltung: kompakte, abgerundete Karte mit kleiner Vorschau der
 * Zeichenfläche, Verlauf mit Antworten, Erwähnungen (@) und Senden-Pfeil.
 * Alle Farben kommen aus den Design-Tokens → helles und dunkles Design.
 */
import React from "react";
import { ArrowUp, AtSign, Check, MessageSquare, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import {
  commentUi,
  initialsOf,
  useCommentUi,
  type CommentAuthor,
  type ProjectComment,
} from "@/lib/commentsStore";
import type { TeamMemberOption } from "@/lib/projectTeam";

const OPEN_COLOR = "hsl(38 92% 50%)";
const DONE_COLOR = "hsl(150 45% 42%)";

/** Verhindert, dass Zeichenflächen-Kürzel (Entf, Strg+A, Copy/Paste) durchschlagen. */
export function stopCanvasKeys(e: React.KeyboardEvent) {
  if (e.key === "Escape") return; // Escape wird bewusst lokal behandelt.
  e.stopPropagation();
  (e.nativeEvent as KeyboardEvent).stopImmediatePropagation?.();
}

export function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function CommentAvatar({ author, size = 22 }: { author?: { name: string; avatarUrl?: string | null }; size?: number }) {
  const name = author?.name ?? "Unbekannt";
  if (author?.avatarUrl) {
    return (
      <img
        src={author.avatarUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: "hsl(var(--primary) / 0.18)",
        color: "hsl(var(--primary))",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Kommentar-Pin: runder Avatar mit farbigem Ring an der angeklickten Stelle. */
export function CommentPin({
  comment,
  author,
  active,
  onClick,
  style,
}: {
  comment: ProjectComment;
  author?: CommentAuthor;
  active: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  const color = comment.status === "done" ? DONE_COLOR : OPEN_COLOR;
  return (
    <button
      type="button"
      title={comment.status === "done" ? "Erledigter Kommentar" : "Offener Kommentar"}
      onPointerDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute flex items-center justify-center shadow-md transition-transform hover:scale-105"
      style={{
        width: 32,
        height: 32,
        marginLeft: -16,
        marginTop: -32,
        borderRadius: "50% 50% 50% 6px",
        background: "hsl(var(--card))",
        border: `2px solid ${color}`,
        outline: active ? `2px solid ${color}` : "none",
        outlineOffset: 2,
        opacity: comment.status === "done" ? 0.75 : 1,
        pointerEvents: "auto",
        touchAction: "manipulation",
        ...style,
      }}
    >
      <CommentAvatar author={author} size={22} />
    </button>
  );
}

const cardStyle: React.CSSProperties = {
  width: 288,
  background: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 18,
  boxShadow: "0 18px 45px hsl(0 0% 0% / 0.28)",
  overflow: "hidden",
  pointerEvents: "auto",
};

/** Kleine Vorschau der Zeichenfläche (nur bei Bedarf erzeugt). */
function PreviewStrip({ src }: { src?: string | null }) {
  if (!src) return null;
  return (
    <div className="px-3 pt-3">
      <img
        src={src}
        alt="Ausschnitt der Zeichenfläche"
        draggable={false}
        className="w-full rounded-xl"
        style={{ height: 108, objectFit: "cover", border: "1px solid hsl(var(--border))", background: "#fff" }}
      />
    </div>
  );
}

/** Hebt Erwähnungen im Text hervor (reine Anzeige, kein HTML aus Benutzertext). */
function BodyText({ body }: { body: string }) {
  const parts = body.split(/(@[^\s@]{1,40})/g);
  return (
    <div className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) =>
        p.startsWith("@") ? (
          <span key={i} style={{ color: "hsl(var(--primary))", fontWeight: 600 }}>{p}</span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Eingabefeld */

export interface ComposerResult {
  text: string;
  mentions: string[];
}

/**
 * Texteingabe mit @-Erwähnungen und Senden-Pfeil.
 * Der eingegebene Text bleibt bei Fehlern erhalten.
 */
export function CommentComposer({
  members,
  placeholder = "Kommentar hinzufügen",
  autoFocus,
  submitLabel = "Senden",
  onSubmit,
  onCancel,
  error,
  onDirty,
}: {
  members: TeamMemberOption[];
  placeholder?: string;
  autoFocus?: boolean;
  submitLabel?: string;
  onSubmit: (value: ComposerResult) => Promise<boolean>;
  onCancel?: () => void;
  error?: string | null;
  onDirty?: () => void;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [picker, setPicker] = React.useState(false);
  const mentioned = React.useRef<Map<string, string>>(new Map());
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  const insertMention = (m: TeamMemberOption) => {
    mentioned.current.set(m.id, m.name);
    setText((t) => {
      const base = t.replace(/@[^\s@]*$/, "");
      const sep = base && !/\s$/.test(base) ? " " : "";
      return `${base}${sep}@${m.name} `;
    });
    setPicker(false);
    ref.current?.focus();
  };

  const query = React.useMemo(() => {
    const m = /@([^\s@]*)$/.exec(text);
    return m ? m[1].toLowerCase() : null;
  }, [text]);

  const suggestions = React.useMemo(() => {
    const q = picker ? "" : query;
    if (q === null) return [];
    return members.filter((m) => !q || m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [members, query, picker]);

  const showPicker = (picker || query !== null) && suggestions.length > 0;

  const send = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    const ids = Array.from(mentioned.current.entries())
      .filter(([, name]) => value.includes(`@${name}`))
      .map(([id]) => id);
    const ok = await onSubmit({ text: value, mentions: ids });
    setBusy(false);
    if (ok) {
      setText("");
      mentioned.current.clear();
    }
    // Bei Misserfolg bleibt der eingegebene Text bewusst stehen.
  };

  return (
    <div className="relative">
      {showPicker && (
        <div
          className="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded-xl"
          style={{ background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", border: "1px solid hsl(var(--border))" }}
        >
          {suggestions.map((m) => (
            <button
              key={m.id}
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:opacity-80"
              style={{ background: "transparent" }}
              onClick={() => insertMention(m)}
            >
              <CommentAvatar author={{ name: m.name, avatarUrl: m.avatarUrl }} size={18} />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        value={text}
        onChange={(e) => { setText(e.target.value); setPicker(false); onDirty?.(); }}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-3 pt-2 text-sm outline-none"
        style={{ color: "hsl(var(--card-foreground))" }}
        onKeyDownCapture={stopCanvasKeys}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel?.(); }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
        }}
      />

      {error && (
        <div className="px-3 pb-1 text-xs" style={{ color: "hsl(var(--destructive))" }}>{error}</div>
      )}

      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          type="button"
          title="Person erwähnen"
          onClick={() => setPicker((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:opacity-80"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          <AtSign className="h-4 w-4" />
        </button>
        {onCancel && (
          <button
            type="button"
            className="rounded-full px-2 py-1 text-xs"
            style={{ color: "hsl(var(--muted-foreground))" }}
            onClick={onCancel}
          >
            Abbrechen
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          title={submitLabel}
          disabled={!text.trim() || busy}
          onClick={() => void send()}
          className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Neue Karte */

export function CommentDraft({
  style,
  members,
  preview,
  error,
  onSave,
  onCancel,
  onDirty,
}: {
  style: React.CSSProperties;
  members: TeamMemberOption[];
  preview?: string | null;
  error?: string | null;
  onSave: (value: ComposerResult) => Promise<boolean>;
  onCancel: () => void;
  onDirty?: () => void;
}) {
  return (
    <div
      className="absolute"
      style={{ ...cardStyle, ...style }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDownCapture={stopCanvasKeys}
    >
      <PreviewStrip src={preview} />
      <CommentComposer
        members={members}
        autoFocus
        error={error}
        onSubmit={onSave}
        onCancel={onCancel}
        onDirty={onDirty}
      />
    </div>
  );
}

/* -------------------------------------------------- Verlauf mit Antworten */

function CommentRow({
  comment,
  author,
  myId,
  canModerate,
  onSaveBody,
  onStatus,
  onDelete,
}: {
  comment: ProjectComment;
  author?: CommentAuthor;
  myId: string | null;
  canModerate: boolean;
  onSaveBody: (text: string) => Promise<boolean>;
  onStatus?: (status: "open" | "done") => void;
  onDelete: () => void;
}) {
  const isAuthor = !!myId && myId === comment.author_id;
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(comment.body);
  React.useEffect(() => { setText(comment.body); }, [comment.body]);

  return (
    <div className="flex gap-2 px-3 py-2">
      <CommentAvatar author={author} size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-semibold">{author?.name ?? "Unbekannt"}</span>
          <span className="text-[10px] opacity-55">
            {formatWhen(comment.created_at)}{comment.edited_at ? " · bearbeitet" : ""}
          </span>
        </div>

        {editing ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border bg-transparent p-2 text-sm"
              style={{ borderColor: "hsl(var(--border))" }}
              onKeyDownCapture={stopCanvasKeys}
            />
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="rounded px-2 py-1 text-xs" onClick={() => { setText(comment.body); setEditing(false); }}>
                Abbrechen
              </button>
              <button
                type="button"
                disabled={!text.trim()}
                className="rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
                style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                onClick={async () => { if (await onSaveBody(text)) setEditing(false); }}
              >
                Speichern
              </button>
            </div>
          </>
        ) : (
          <BodyText body={comment.body} />
        )}

        {!editing && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
            {onStatus && (isAuthor || canModerate) && (
              comment.status === "open" ? (
                <button type="button" className="flex items-center gap-1 hover:opacity-80" onClick={() => onStatus("done")}>
                  <Check className="h-3.5 w-3.5" /> Erledigt
                </button>
              ) : (
                <button type="button" className="flex items-center gap-1 hover:opacity-80" onClick={() => onStatus("open")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Wieder öffnen
                </button>
              )
            )}
            {isAuthor && (
              <button type="button" className="flex items-center gap-1 hover:opacity-80" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Bearbeiten
              </button>
            )}
            {(isAuthor || canModerate) && (
              <button
                type="button"
                className="flex items-center gap-1 hover:opacity-80"
                style={{ color: "hsl(var(--destructive))" }}
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Löschen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentThread({
  comment,
  replies,
  authors,
  members,
  myId,
  canModerate,
  canComment,
  preview,
  style,
  error,
  onClose,
  onSaveBody,
  onStatus,
  onDelete,
  onReply,
  onDirty,
}: {
  comment: ProjectComment;
  replies: ProjectComment[];
  authors: Map<string, CommentAuthor>;
  members: TeamMemberOption[];
  myId: string | null;
  canModerate: boolean;
  canComment: boolean;
  preview?: string | null;
  style: React.CSSProperties;
  error?: string | null;
  onClose: () => void;
  onSaveBody: (id: string, text: string) => Promise<boolean>;
  onStatus: (status: "open" | "done") => void;
  onDelete: (id: string) => void;
  onReply: (value: ComposerResult) => Promise<boolean>;
  onDirty?: () => void;
}) {
  return (
    <div
      className="absolute"
      style={{ ...cardStyle, ...style }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDownCapture={stopCanvasKeys}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      }}
    >
      <div className="flex items-center justify-between px-3 pt-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: comment.status === "done" ? "hsl(150 45% 42% / 0.15)" : "hsl(38 92% 50% / 0.18)",
            color: comment.status === "done" ? DONE_COLOR : OPEN_COLOR,
          }}
        >
          {comment.status === "done" ? "Erledigt" : "Offen"}
        </span>
        <button type="button" onClick={onClose} title="Schließen" className="opacity-60 hover:opacity-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <PreviewStrip src={preview} />

      <div className="max-h-64 overflow-y-auto">
        <CommentRow
          comment={comment}
          author={authors.get(comment.author_id)}
          myId={myId}
          canModerate={canModerate}
          onSaveBody={(t) => onSaveBody(comment.id, t)}
          onStatus={onStatus}
          onDelete={() => onDelete(comment.id)}
        />
        {replies.length > 0 && (
          <div style={{ borderTop: "1px solid hsl(var(--border))" }}>
            {replies.map((r) => (
              <div key={r.id} style={{ paddingLeft: 12 }}>
                <CommentRow
                  comment={r}
                  author={authors.get(r.author_id)}
                  myId={myId}
                  canModerate={canModerate}
                  onSaveBody={(t) => onSaveBody(r.id, t)}
                  onDelete={() => onDelete(r.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {canComment && (
        <div style={{ borderTop: "1px solid hsl(var(--border))" }}>
          <CommentComposer
            members={members}
            placeholder="Antworten …"
            submitLabel="Antwort senden"
            error={error}
            onSubmit={onReply}
            onDirty={onDirty}
          />
        </div>
      )}
      {!canComment && error && (
        <div className="px-3 pb-2 text-xs" style={{ color: "hsl(var(--destructive))" }}>{error}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- Werkzeugleisten-Schalter */

/**
 * Kommentar-Schalter für die Werkzeugleiste der Zeichenfläche (CAD und
 * Projektmappe identisch). Erneuter Klick beendet den Kommentarmodus.
 */
export function CommentModeButton({
  disabled,
  title = "Kommentare",
}: {
  disabled?: boolean;
  title?: string;
}) {
  const ui = useCommentUi();
  const active = ui.mode;
  const count = ui.openCount;
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Kommentare benötigen ein geöffnetes Projekt und eine Anmeldung" : title}
      onClick={() => commentUi.toggleMode()}
      className="relative h-12 w-12 rounded-full flex flex-col items-center justify-center gap-0.5 shadow-lg transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 pixuna-comments"
      style={{
        background: active ? "hsl(var(--primary))" : "hsl(var(--surface-card))",
        color: active ? "hsl(var(--primary-foreground))" : "hsl(var(--ink))",
        border: "2px solid hsl(var(--primary) / 0.75)",
      }}
    >
      <MessageSquare size={18} />
      <span className="text-[10px] font-semibold leading-none">{count}</span>
    </button>
  );
}
