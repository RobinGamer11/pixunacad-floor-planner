/**
 * CommentsTab — Kommentarübersicht im Bereich „Projekt-Team“.
 *
 * Nutzt ausschließlich die vorhandene Kommentar-Tabelle: die Zahlen je Person
 * werden aus den geladenen Kommentaren abgeleitet (keine zweite
 * Zählerhaltung). Ein Klick springt in die zugehörige Oberfläche und öffnet
 * dort denselben Kommentar.
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, ExternalLink } from "lucide-react";
import { commentNavigation, useProjectCommentOverview } from "@/lib/commentsStore";
import { formatWhen } from "@/components/comments/CommentLayerUi";

export function CommentsTab({
  projects,
  peopleById,
  initialProjectId,
}: {
  projects: { id: string; name: string }[];
  peopleById: Map<string, string>;
  /** Vorauswahl, wenn aus einer Projektzeile heraus geöffnet. */
  initialProjectId?: string;
}) {
  const [projectId, setProjectId] = React.useState<string>(initialProjectId ?? projects[0]?.id ?? "");
  React.useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);
  }, [initialProjectId]);
  React.useEffect(() => {
    if (!projects.some((p) => p.id === projectId)) setProjectId(projects[0]?.id ?? "");
  }, [projects, projectId]);

  const [filter, setFilter] = React.useState<"all" | "open" | "done">("open");
  const { comments, statsByUser, ready } = useProjectCommentOverview(projectId || undefined);
  const navigate = useNavigate();

  const rows = comments.filter((c) => filter === "all" || c.status === filter);

  const nameOf = (id: string) => peopleById.get(id) ?? "Nicht mehr verfügbar";

  const jump = (c: (typeof comments)[number]) => {
    commentNavigation.request({
      projectId: c.project_id,
      context: c.context,
      sheetId: c.sheet_id,
      bookId: c.book_id,
      commentId: c.id,
    });
    navigate(c.context === "cad" ? `/project/${c.project_id}/cad/${c.sheet_id}` : `/project/${c.project_id}`);
  };

  if (!projects.length) {
    return <div className="text-sm opacity-70">Keine gemeinsamen Projekte vorhanden.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded border bg-[hsl(var(--surface-card))] px-2 py-1 text-sm text-[hsl(var(--foreground))]"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {(["open", "done", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="rounded border px-2 py-1 text-xs"
            style={{
              borderColor: filter === f ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
              background: filter === f ? "hsl(var(--accent-gold) / 0.14)" : "transparent",
            }}
          >
            {f === "open" ? "Offen" : f === "done" ? "Erledigt" : "Alle"}
          </button>
        ))}
      </div>

      {!ready && <div className="text-sm opacity-70">Kommentare werden geladen …</div>}

      {ready && (
        <>
          <div className="flex flex-wrap gap-2">
            {Array.from(statsByUser.entries()).map(([userId, stat]) => (
              <div
                key={userId}
                className="rounded border px-2 py-1 text-xs"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                <span className="font-semibold">{nameOf(userId)}</span>
                <span className="ml-2 opacity-70">{stat.open} offen · {stat.done} erledigt</span>
              </div>
            ))}
            {!statsByUser.size && <div className="text-sm opacity-70">Noch keine Kommentare.</div>}
          </div>

          <div className="space-y-1">
            {rows.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => jump(c)}
                className="flex w-full items-start gap-2 rounded border px-2 py-2 text-left text-sm hover:opacity-90"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 opacity-60" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.body}</span>
                  <span className="block text-[11px] opacity-60">
                    {nameOf(c.author_id)} · {c.context === "cad" ? "CAD" : "Projektmappe"} ·{" "}
                    {formatWhen(c.created_at)} · {c.status === "done" ? "Erledigt" : "Offen"}
                  </span>
                </span>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 opacity-60" />
              </button>
            ))}
            {!rows.length && <div className="text-sm opacity-70">Keine Kommentare in dieser Auswahl.</div>}
          </div>
        </>
      )}
    </div>
  );
}
