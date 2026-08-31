/**
 * Gemeinsame Kommentar-Oberfläche für CAD und Projektmappe (Paket 07).
 *
 * Enthält ausschließlich Darstellung und Bedienung – die Verankerung
 * (Weltkoordinaten in CAD, Seitenprozente in der Mappe) liefert die jeweilige
 * Layer-Komponente. Kommentare sind keine Zeichenobjekte: die Flächen hier
 * sind außerhalb des Kommentarmodus vollständig durchlässig.
 */
import React from "react";
import { MessageSquare, Check, RotateCcw, Pencil, Trash2, X } from "lucide-react";
import {
  commentUi,
  initialsOf,
  useCommentUi,
  type CommentAuthor,
  type ProjectComment,
} from "@/lib/commentsStore";

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

export function CommentAvatar({ author, size = 22 }: { author?: CommentAuthor; size?: number }) {
  const name = author?.name ?? "Unbekannt";
  if (author?.avatarUrl) {
    return (
      <img
        src={author.avatarUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: "hsl(var(--muted))",
        color: "hsl(var(--muted-foreground))",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Kommentar-Pin (Bedienfläche bleibt zoomunabhängig gut treffbar). */
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
      className="absolute flex items-center justify-center rounded-full shadow-md"
      style={{
        width: 30,
        height: 30,
        marginLeft: -15,
        marginTop: -30,
        borderRadius: "50% 50% 50% 4px",
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
      <CommentAvatar author={author} size={20} />
    </button>
  );
}

const panelStyle: React.CSSProperties = {
  width: 260,
  background: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  boxShadow: "0 10px 30px hsl(0 0% 0% / 0.25)",
  padding: 10,
  pointerEvents: "auto",
};

/** Entwurf: leer oder abgebrochen erzeugt keinen gespeicherten Kommentar. */
export function CommentDraft({
  style,
  onSave,
  onCancel,
  error,
}: {
  style: React.CSSProperties;
  onSave: (text: string) => Promise<boolean>;
  onCancel: () => void;
  error?: string | null;
}) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => { ref.current?.focus(); }, []);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onSave(text);
    setBusy(false);
    if (ok) setText("");
  };

  return (
    <div
      className="absolute"
      style={{ ...panelStyle, ...style }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDownCapture={stopCanvasKeys}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
      }}
    >
      <div className="mb-1 text-xs font-semibold opacity-70">Neuer Kommentar</div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Kommentartext …"
        className="w-full resize-y rounded border bg-transparent p-2 text-sm"
        style={{ borderColor: "hsl(var(--border))" }}
      />
      {error && <div className="mt-1 text-xs" style={{ color: "hsl(0 70% 55%)" }}>{error}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="rounded px-2 py-1 text-xs" onClick={onCancel}>Abbrechen</button>
        <button
          type="button"
          disabled={!text.trim() || busy}
          onClick={() => void save()}
          className="rounded px-2 py-1 text-xs font-semibold disabled:opacity-40"
          style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          {busy ? "Speichern …" : "Speichern"}
        </button>
      </div>
    </div>
  );
}

export function CommentPopover({
  comment,
  author,
  myId,
  canModerate,
  style,
  error,
  onClose,
  onSaveBody,
  onStatus,
  onDelete,
}: {
  comment: ProjectComment;
  author?: CommentAuthor;
  myId: string | null;
  canModerate: boolean;
  style: React.CSSProperties;
  error?: string | null;
  onClose: () => void;
  onSaveBody: (text: string) => Promise<boolean>;
  onStatus: (status: "open" | "done") => void;
  onDelete: () => void;
}) {
  const isAuthor = !!myId && myId === comment.author_id;
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(comment.body);
  React.useEffect(() => { setText(comment.body); }, [comment.body]);

  return (
    <div
      className="absolute"
      style={{ ...panelStyle, ...style }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDownCapture={stopCanvasKeys}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (editing) setEditing(false); else onClose();
        }
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <CommentAvatar author={author} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{author?.name ?? "Unbekannt"}</div>
          <div className="text-[10px] opacity-60">
            {formatWhen(comment.created_at)}
            {comment.edited_at ? " · bearbeitet" : ""}
          </div>
        </div>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
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

      {editing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full resize-y rounded border bg-transparent p-2 text-sm"
            style={{ borderColor: "hsl(var(--border))" }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="rounded px-2 py-1 text-xs" onClick={() => { setText(comment.body); setEditing(false); }}>
              Abbrechen
            </button>
            <button
              type="button"
              disabled={!text.trim()}
              className="rounded px-2 py-1 text-xs font-semibold disabled:opacity-40"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
              onClick={async () => { if (await onSaveBody(text)) setEditing(false); }}
            >
              Speichern
            </button>
          </div>
        </>
      ) : (
        // Text bewusst als reiner Text (kein HTML).
        <div className="whitespace-pre-wrap break-words text-sm">{comment.body}</div>
      )}

      {error && <div className="mt-1 text-xs" style={{ color: "hsl(0 70% 55%)" }}>{error}</div>}

      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {(isAuthor || canModerate) && (
            comment.status === "open" ? (
              <button type="button" className="flex items-center gap-1 rounded px-1.5 py-1 hover:opacity-80" onClick={() => onStatus("done")}>
                <Check className="h-3.5 w-3.5" /> Erledigt
              </button>
            ) : (
              <button type="button" className="flex items-center gap-1 rounded px-1.5 py-1 hover:opacity-80" onClick={() => onStatus("open")}>
                <RotateCcw className="h-3.5 w-3.5" /> Wieder öffnen
              </button>
            )
          )}
          {isAuthor && (
            <button type="button" className="flex items-center gap-1 rounded px-1.5 py-1 hover:opacity-80" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Bearbeiten
            </button>
          )}
          {(isAuthor || canModerate) && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1.5 py-1 hover:opacity-80"
              style={{ color: "hsl(0 65% 55%)" }}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Genau ein Kommentar-Schalter je Oberfläche, auch wenn mehrere Seiten
 * (Doppelseiten-Layout) gleichzeitig einen Kommentar-Layer einbinden.
 */
const fabMounted: { id: symbol | null } = { id: null };
function useSingleFab(): boolean {
  const self = React.useRef(Symbol("fab"));
  const [primary, setPrimary] = React.useState(false);
  React.useEffect(() => {
    const me = self.current;
    if (!fabMounted.id) { fabMounted.id = me; setPrimary(true); }
    return () => { if (fabMounted.id === me) { fabMounted.id = null; } };
  }, []);
  return primary;
}

/**
 * Kommentar-Schalter (in CAD und Mappe identisch): Modus an/aus, Pins
 * ein-/ausblenden und Statusfilter – ohne eigene Verwaltungsoberfläche.
 */
export function CommentFab({
  count,
  disabled,
  style,
  className,
  fixed,
}: {
  count: number;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  /** true = am Fenster verankert (Projektmappe), sonst am Zeichenbereich. */
  fixed?: boolean;
}) {
  const ui = useCommentUi();
  const [open, setOpen] = React.useState(false);
  const primary = useSingleFab();
  if (!primary) return null;
  return (
    <div
      className={`${fixed ? "fixed" : "absolute"} z-30 flex flex-col items-end gap-1 pixuna-comments ${className ?? ""}`}
      style={style}
    >
      {open && (
        <div
          className="rounded-lg p-2 text-xs"
          style={{
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 8px 24px hsl(0 0% 0% / 0.2)",
          }}
        >
          <label className="mb-1 flex items-center gap-2">
            <input type="checkbox" checked={ui.visible} onChange={(e) => commentUi.set({ visible: e.target.checked })} />
            Pins anzeigen
          </label>
          <div className="flex gap-1">
            {(["all", "open", "done"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => commentUi.set({ filter: f })}
                className="rounded px-1.5 py-0.5"
                style={{
                  background: ui.filter === f ? "hsl(var(--primary))" : "transparent",
                  color: ui.filter === f ? "hsl(var(--primary-foreground))" : "inherit",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                {f === "all" ? "Alle" : f === "open" ? "Offen" : "Erledigt"}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Kommentar-Anzeige"
          className="rounded-full px-2 py-1 text-[10px]"
          style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--card-foreground))" }}
        >
          Filter
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => commentUi.toggleMode()}
          title={disabled ? "Kommentare benötigen ein verbundenes Projekt" : "Kommentarmodus"}
          className="relative flex items-center justify-center rounded-full shadow-lg disabled:opacity-40"
          style={{
            width: 40,
            height: 40,
            background: ui.mode ? "hsl(var(--primary))" : "hsl(var(--card))",
            color: ui.mode ? "hsl(var(--primary-foreground))" : "hsl(var(--card-foreground))",
            border: "1px solid hsl(var(--border))",
          }}
        >
          <MessageSquare className="h-5 w-5" />
          {count > 0 && (
            <span
              className="absolute -right-1 -top-1 rounded-full px-1 text-[10px] font-bold"
              style={{ background: OPEN_COLOR, color: "#fff" }}
            >
              {count}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
