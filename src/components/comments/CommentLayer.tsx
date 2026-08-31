/**
 * CommentLayer — Kommentar-Pins über einer Seite der Projektmappe.
 *
 * Verankerung: Prozentkoordinaten der Seite (identisch zu `toPct` in
 * `ProjectWorkspace`). Dadurch bleibt ein Kommentar bei Zoom, Seitenwechsel
 * und Formatanzeige an derselben Stelle. Kommentare sind keine
 * Seitenelemente: sie werden getrennt gespeichert, verändern das
 * Projektdokument nicht und erscheinen nicht im Export.
 */
import React from "react";
import { CommentDraft, CommentPin, CommentThread } from "@/components/comments/CommentLayerUi";
import {
  commentUi,
  useCommentAuthors,
  useCommentTarget,
  useCommentUi,
  useSheetComments,
} from "@/lib/commentsStore";
import { useProjectAccess } from "@/lib/projectAccess";
import { useProjectMemberOptions } from "@/lib/projectTeam";

export function CommentLayer({
  projectId,
  pageId,
  projectName,
  bookId = null,
}: {
  projectId: string;
  pageId: string;
  projectName?: string;
  bookId?: string | null;
}) {
  const ui = useCommentUi();
  const access = useProjectAccess(projectId);
  const members = useProjectMemberOptions(projectId);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ x: number; y: number } | null>(null);

  const { comments, error, myId, create, updateBody, setStatus, remove, clearError } = useSheetComments({
    projectId,
    context: "mappe",
    sheetId: pageId,
    bookId,
    canModerate: access.permissions.canManageMembers,
    projectName,
  });

  const authors = useCommentAuthors(React.useMemo(() => comments.map((c) => c.author_id), [comments]));

  React.useEffect(() => { setOpenId(null); setDraft(null); }, [pageId, bookId]);

  React.useEffect(() => {
    if (!ui.mode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !draft) commentUi.exitMode(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.mode, draft]);

  React.useEffect(() => () => commentUi.exitMode(), []);

  const target = useCommentTarget(projectId, "mappe");
  React.useEffect(() => {
    if (!target || target.sheetId !== pageId) return;
    commentUi.set({ visible: true, filter: "all" });
    setOpenId(target.commentId);
  }, [target, pageId]);

  const roots = React.useMemo(
    () => comments.filter((c) => !c.parent_id && (ui.filter === "all" || c.status === ui.filter)),
    [comments, ui.filter],
  );
  const repliesOf = React.useCallback(
    (id: string) => comments.filter((c) => c.parent_id === id),
    [comments],
  );

  const place = (e: React.PointerEvent) => {
    if (!ui.mode) return;
    if (access.shared && !access.permissions.canComment) return;
    const r = hostRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return;
    e.stopPropagation();
    clearError();
    setOpenId(null);
    setDraft({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  return (
    <div
      ref={hostRef}
      data-comment-layer
      className="pixuna-comments absolute inset-0"
      style={{
        pointerEvents: ui.mode ? "auto" : "none",
        cursor: ui.mode ? "crosshair" : undefined,
        zIndex: 40,
      }}
      onPointerDown={place}
    >
      {ui.visible &&
        roots.map((c) => (
          <React.Fragment key={c.id}>
            <CommentPin
              comment={c}
              author={authors.get(c.author_id)}
              active={openId === c.id}
              onClick={() => { setDraft(null); clearError(); setOpenId(openId === c.id ? null : c.id); }}
              style={{ left: `${c.pos_x}%`, top: `${c.pos_y}%` }}
            />
            {openId === c.id && (
              <CommentThread
                comment={c}
                replies={repliesOf(c.id)}
                authors={authors}
                members={members}
                myId={myId}
                canModerate={access.permissions.canManageMembers}
                canComment={access.permissions.canComment}
                error={error}
                style={{ left: `${c.pos_x}%`, top: `${c.pos_y}%`, marginLeft: 20, pointerEvents: "auto" }}
                onClose={() => setOpenId(null)}
                onSaveBody={(id, text) => updateBody(id, text)}
                onStatus={(s) => void setStatus(c.id, s)}
                onDelete={(id) => { void remove(id); if (id === c.id) setOpenId(null); }}
                onDirty={clearError}
                onReply={async ({ text, mentions }) => {
                  const row = await create({ posX: c.pos_x, posY: c.pos_y, body: text, mentions, parentId: c.id });
                  return !!row;
                }}
              />
            )}
          </React.Fragment>
        ))}

      {draft && (
        <CommentDraft
          style={{ left: `${draft.x}%`, top: `${draft.y}%`, marginLeft: 12, pointerEvents: "auto" }}
          members={members}
          error={error}
          onDirty={clearError}
          onCancel={() => setDraft(null)}
          onSave={async ({ text, mentions }) => {
            const row = await create({ posX: draft.x, posY: draft.y, body: text, mentions });
            if (!row) return false;
            setDraft(null);
            setOpenId(row.id);
            return true;
          }}
        />
      )}
    </div>
  );
}
