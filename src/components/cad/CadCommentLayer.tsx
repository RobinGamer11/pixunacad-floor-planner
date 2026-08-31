/**
 * CadCommentLayer — Kommentar-Pins über der CAD-Zeichenfläche.
 *
 * Verankerung: Weltkoordinaten in Metern (`pos_x`/`pos_y`). Damit bleibt ein
 * Kommentar beim Zoomen, Verschieben und Blattwechsel exakt an seiner Stelle.
 * Kommentare sind keine Zeichenobjekte: sie liegen als DOM-Overlay über dem
 * Canvas, werden nicht in die Szene serialisiert und nicht mit exportiert
 * (`.pixuna-exporting` blendet sie aus).
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

export function CadCommentLayer({ app, projectId }: { app: any; projectId?: string }) {
  const ui = useCommentUi();
  const access = useProjectAccess(projectId);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [sheetId, setSheetId] = React.useState<string>(() => (app?.activeSheetId as string) || "default");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ x: number; y: number } | null>(null);

  const { comments, error, myId, create, updateBody, setStatus, remove } = useSheetComments({
    projectId,
    context: "cad",
    sheetId,
    canModerate: access.permissions.canManageMembers,
  });

  const authors = useCommentAuthors(React.useMemo(() => comments.map((c) => c.author_id), [comments]));

  // Kamera- und Blattwechsel: pro Frame nachführen (wie die übrigen Overlays).
  React.useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const cam = app?.camera;
      const id = (app?.activeSheetId as string) || "default";
      if (id !== sheetId) setSheetId(id);
      const key = cam ? `${cam.scale}|${cam.offsetX}|${cam.offsetY}|${app?.activePlanId ?? ""}` : "";
      if (key !== last) { last = key; force(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app, sheetId]);

  // Kommentarmodus endet mit Escape und beim Verlassen der Oberfläche.
  React.useEffect(() => {
    if (!ui.mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !draft) commentUi.exitMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.mode, draft]);

  React.useEffect(() => () => commentUi.exitMode(), []);

  // Sprungziel aus der Team-Auswertung.
  const target = useCommentTarget(projectId, "cad");
  React.useEffect(() => {
    if (!target) return;
    commentUi.set({ visible: true, filter: "all" });
    setOpenId(target.commentId);
  }, [target]);

  const cam = app?.camera;
  const toScreen = (wx: number, wy: number) =>
    cam ? cam.worldToScreen(wx, wy) : { x: 0, y: 0 };

  const visible = React.useMemo(
    () => comments.filter((c) => ui.filter === "all" || c.status === ui.filter),
    [comments, ui.filter],
  );
  const openCount = comments.filter((c) => c.status === "open").length;

  const onCanvasClick = (e: React.PointerEvent) => {
    if (!ui.mode || !cam || !hostRef.current) return;
    if (!access.permissions.canComment) return;
    const rect = hostRef.current.getBoundingClientRect();
    const w = cam.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    setOpenId(null);
    setDraft({ x: w.x, y: w.y });
  };

  const disabled = !projectId || !access.permissions.canComment;

  return (
    <>
      <div
        ref={hostRef}
        data-comment-layer
        className="pixuna-comments absolute inset-0"
        style={{
          pointerEvents: ui.mode ? "auto" : "none",
          cursor: ui.mode ? "crosshair" : undefined,
          zIndex: 25,
        }}
        onPointerDown={onCanvasClick}
      >
        {ui.visible &&
          visible.map((c) => {
            const p = toScreen(c.pos_x, c.pos_y);
            return (
              <React.Fragment key={c.id}>
                <CommentPin
                  comment={c}
                  author={authors.get(c.author_id)}
                  active={openId === c.id}
                  onClick={() => { setDraft(null); setOpenId(openId === c.id ? null : c.id); }}
                  style={{ left: p.x, top: p.y }}
                />
                {openId === c.id && (
                  <CommentPopover
                    comment={c}
                    author={authors.get(c.author_id)}
                    myId={myId}
                    canModerate={access.permissions.canManageMembers}
                    error={error}
                    style={{ left: p.x + 20, top: p.y + 6 }}
                    onClose={() => setOpenId(null)}
                    onSaveBody={(text) => updateBody(c.id, text)}
                    onStatus={(s) => void setStatus(c.id, s)}
                    onDelete={() => { void remove(c.id); setOpenId(null); }}
                  />
                )}
              </React.Fragment>
            );
          })}

        {draft && (() => {
          const p = toScreen(draft.x, draft.y);
          return (
            <CommentDraft
              style={{ left: p.x + 12, top: p.y + 6 }}
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
          );
        })()}
      </div>

      <CommentFab count={openCount} disabled={disabled} style={{ right: 16, bottom: 16 }} />
    </>
  );
}
