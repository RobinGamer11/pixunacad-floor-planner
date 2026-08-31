/**
 * CadCommentLayer — Kommentar-Pins über der CAD-Zeichenfläche.
 *
 * Verankerung: Weltkoordinaten in Metern (`pos_x`/`pos_y`). Damit bleibt ein
 * Kommentar beim Zoomen, Verschieben und Blattwechsel exakt an seiner Stelle.
 * Kommentare sind keine Zeichenobjekte: sie liegen als DOM-Overlay über dem
 * Canvas, werden nicht in die Szene serialisiert und nicht mit exportiert
 * (`.pixuna-exporting` blendet sie aus).
 *
 * Die kleine Vorschau der Zeichenfläche wird ausschließlich bei Bedarf erzeugt
 * (beim Setzen bzw. Öffnen eines Kommentars) – nie laufend beim Zeichnen.
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

/** Ausschnitt um den Punkt herum als kleines Vorschaubild (einmalig). */
function capturePreview(pt: { x: number; y: number }): string | null {
  try {
    const canvas = document.querySelector("canvas[data-cad-canvas]") as HTMLCanvasElement | null;
    if (!canvas) return null;
    const w = 320;
    const h = 120;
    const sx = Math.max(0, Math.min(canvas.width - w, Math.round(pt.x * (canvas.width / canvas.clientWidth)) - w / 2));
    const sy = Math.max(0, Math.min(canvas.height - h, Math.round(pt.y * (canvas.height / canvas.clientHeight)) - h / 2));
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, sx, sy, w, h, 0, 0, w, h);
    return out.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}

export function CadCommentLayer({
  app,
  projectId,
  projectName,
}: {
  app: any;
  projectId?: string;
  projectName?: string;
}) {
  const ui = useCommentUi();
  const access = useProjectAccess(projectId);
  const members = useProjectMemberOptions(projectId);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [sheetId, setSheetId] = React.useState<string>(() => (app?.activeSheetId as string) || "default");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ x: number; y: number; preview: string | null } | null>(null);
  const [openPreview, setOpenPreview] = React.useState<string | null>(null);

  const { comments, error, myId, create, updateBody, setStatus, remove, clearError } = useSheetComments({
    projectId,
    context: "cad",
    sheetId,
    canModerate: access.permissions.canManageMembers,
    projectName,
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

  const roots = React.useMemo(
    () => comments.filter((c) => !c.parent_id && (ui.filter === "all" || c.status === ui.filter)),
    [comments, ui.filter],
  );
  const repliesOf = React.useCallback(
    (id: string) => comments.filter((c) => c.parent_id === id),
    [comments],
  );
  const openCount = comments.filter((c) => !c.parent_id && c.status === "open").length;
  React.useEffect(() => { commentUi.set({ openCount }); }, [openCount]);

  const onCanvasClick = (e: React.PointerEvent) => {
    if (!ui.mode || !cam || !hostRef.current) return;
    // Freigegebene Projekte: ohne Kommentarrecht keinen Entwurf öffnen.
    if (access.shared && !access.permissions.canComment) return;
    const rect = hostRef.current.getBoundingClientRect();
    const local = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const w = cam.screenToWorld(local.x, local.y);
    clearError();
    setOpenId(null);
    setDraft({ x: w.x, y: w.y, preview: capturePreview(local) });
  };

  return (
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
        roots.map((c) => {
          const p = toScreen(c.pos_x, c.pos_y);
          return (
            <React.Fragment key={c.id}>
              <CommentPin
                comment={c}
                author={authors.get(c.author_id)}
                active={openId === c.id}
                onClick={() => {
                  setDraft(null);
                  clearError();
                  const next = openId === c.id ? null : c.id;
                  setOpenPreview(next ? capturePreview(toScreen(c.pos_x, c.pos_y)) : null);
                  setOpenId(next);
                }}
                style={{ left: p.x, top: p.y }}
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
                  preview={openPreview}
                  error={error}
                  style={{ left: p.x + 20, top: p.y + 6, pointerEvents: "auto" }}
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
          );
        })}

      {draft && (() => {
        const p = toScreen(draft.x, draft.y);
        return (
          <CommentDraft
            style={{ left: p.x + 12, top: p.y + 6, pointerEvents: "auto" }}
            members={members}
            preview={draft.preview}
            error={error}
            onDirty={clearError}
            onCancel={() => setDraft(null)}
            onSave={async ({ text, mentions }) => {
              const row = await create({ posX: draft.x, posY: draft.y, body: text, mentions });
              if (!row) return false;
              setDraft(null);
              setOpenPreview(draft.preview);
              setOpenId(row.id);
              return true;
            }}
          />
        );
      })()}
    </div>
  );
}
