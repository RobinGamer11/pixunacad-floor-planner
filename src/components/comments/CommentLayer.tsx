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
import {
  CommentDraft,
  CommentFab,
  CommentPin,
  CommentPopover,
} from "@/components/comments/CommentLayerUi";
import {
  commentUi,
  useCommentAuthors,
  useCommentTarget,
  useCommentUi,
  useSheetComments,
} from "@/lib/commentsStore";
import { useProjectAccess } from "@/lib/projectAccess";

export function CommentLayer({ projectId, pageId }: { projectId: string; pageId: string }) {
  const ui = useCommentUi();
  const access = useProjectAccess(projectId);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ x: number; y: number } | null>(null);

  const { comments, error, myId, create, updateBody, setStatus, remove } = useSheetComments({
    projectId,
    context: "mappe",
    sheetId: pageId,
    canModerate: access.permissions.canManageMembers,
  });

  const authors = useCommentAuthors(React.useMemo(() => comments.map((c) => c.author_id), [comments]));

  React.useEffect(() => { setOpenId(null); setDraft(null); }, [pageId]);

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

  const visible = React.useMemo(
    () => comments.filter((c) => ui.filter === "all" || c.status === ui.filter),
    [comments, ui.filter],
  );
  const openCount = comments.filter((c) => c.status === "open").length;

  const place = (e: React.PointerEvent) => {
    if (!ui.mode || !access.permissions.canComment) return;
    const r = hostRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return;
    e.stopPropagation();
    setOpenId(null);
    setDraft({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  return (
    <>
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
          visible.map((c) => (
            <React.Fragment key={c.id}>
              <CommentPin
                comment={c}
                author={authors.get(c.author_id)}
                active={openId === c.id}
                onClick={() => { setDraft(null); setOpenId(openId === c.id ? null : c.id); }}
                style={{ left: `${c.pos_x}%`, top: `${c.pos_y}%` }}
              />
              {openId === c.id && (
                <CommentPopover
                  comment={c}
                  author={authors.get(c.author_id)}
                  myId={myId}
                  canModerate={access.permissions.canManageMembers}
                  error={error}
                  style={{ left: `${c.pos_x}%`, top: `${c.pos_y}%`, marginLeft: 20 }}
                  onClose={() => setOpenId(null)}
                  onSaveBody={(text) => updateBody(c.id, text)}
                  onStatus={(s) => void setStatus(c.id, s)}
                  onDelete={() => { void remove(c.id); setOpenId(null); }}
                />
              )}
            </React.Fragment>
          ))}

        {draft && (
          <CommentDraft
            style={{ left: `${draft.x}%`, top: `${draft.y}%`, marginLeft: 12 }}
            error={error}
            onCancel={() => setDraft(null)}
            onSave={async (text) => {
              const row = await create({ posX: draft.x, posY: draft.y, body: text });
              if (!row) return false;
              setDraft(null);
              setOpenId(row.id);
              return true;
            }}
          />
        )}
      </div>

      <CommentFab
        fixed
        count={openCount}
        disabled={!access.permissions.canComment}
        style={{ right: 20, bottom: 20 }}
      />
    </>
  );
}
