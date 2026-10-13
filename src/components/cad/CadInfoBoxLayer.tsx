/**
 * Infoboxen auf der Zeichenfläche (DOM-Overlay, feste Bildschirmgröße).
 * Die Boxen sind Zeichenobjekte der Szene (Ebene, Objekt-ID, Undo);
 * bearbeitet wird ausschließlich in den Werkzeugeinstellungen.
 */
import React from "react";
import { commentUi, useCommentUi } from "@/lib/commentsStore";
import { infoBoxUi, useInfoBoxUi } from "@/lib/infoBoxUi";

export function CadInfoBoxLayer({ app }: { app: any }) {
  const ui = useCommentUi();
  const sel = useInfoBoxUi();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  // Kamera, Blatt, Ebenen und Undo pro Frame nachführen.
  React.useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const cam = app?.camera;
      const boxes: any[] = app?.scene?.infoBoxes || [];
      const key = cam
        ? `${cam.scale}|${cam.offsetX}|${cam.offsetY}|${app?.activeSheetId ?? ""}|${boxes.map((b) => `${b.id}${b.x}${b.y}${b.title}${b.kind}${b.status}${b.sizePx}${b.labelId}${b.authorInitials}${b.categoryId}`).join(",")}|${(app?.scene?.infoBoxCategories || []).map((c: any) => c.id + c.name + c.color).join()}|${(app?.labelManager?.list?.() || []).map((l: any) => `${l.id}${l.visible}`).join()}`
        : "";
      if (key !== last) { last = key; force(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app]);

  // Esc: erst Entwurf/Auswahl abbrechen, dann die Funktion ganz deaktivieren.
  React.useEffect(() => {
    if (!ui.mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const s = infoBoxUi.get();
      if (s.draft || s.selectedId) infoBoxUi.clear();
      else commentUi.exitMode();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.mode]);

  React.useEffect(() => () => { commentUi.exitMode(); infoBoxUi.clear(); }, []);

  // Offene Aufgaben für den Zähler am Knopf.
  const boxes: any[] = app?.scene?.infoBoxes || [];
  const openCount = boxes.filter((b) => b.kind === "task" && b.status !== "done").length;
  React.useEffect(() => { commentUi.set({ openCount }); }, [openCount]);

  const cam = app?.camera;
  if (!cam) return null;
  const visible = (b: any) => app.labelManager?.isVisible?.(b.labelId) !== false;

  const onCanvasDown = (e: React.PointerEvent) => {
    if (!ui.mode || !hostRef.current || e.button !== 0) return;
    const rect = hostRef.current.getBoundingClientRect();
    const w = cam.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    infoBoxUi.set({ selectedId: null, draft: { x: w.x, y: w.y, sheetId: app.activeSheetId || "default" } });
  };

  const draft = sel.draft && sel.draft.sheetId === (app.activeSheetId || "default") ? sel.draft : null;

  return (
    <div
      ref={hostRef}
      data-infobox-layer
      className="pixuna-comments absolute inset-0"
      style={{ pointerEvents: ui.mode ? "auto" : "none", zIndex: 25 }}
      onPointerDown={onCanvasDown}
    >
      {boxes.filter(visible).map((b) => {
        const p = cam.worldToScreen(b.x, b.y);
        const active = sel.selectedId === b.id;
        const task = b.kind === "task";
        const cat = (app.scene?.infoBoxCategories || []).find((c: any) => c.id === b.categoryId);
        const statusVar = b.status === "done" ? "--infobox-done" : "--infobox-open";
        return (
          <div
            key={b.id}
            role="button"
            title={b.title || "Infobox"}
            onPointerDown={(e) => { e.stopPropagation(); infoBoxUi.select(b.id); }}
            className="absolute rounded-md px-2 py-1.5 text-[11.5px] leading-tight shadow-md cursor-pointer select-none"
            style={{
              left: p.x, top: p.y, width: b.sizePx || 180, pointerEvents: "auto",
              background: "hsl(var(--cad-settings-bg))",
              color: "hsl(var(--foreground))",
              border: `2px solid hsl(var(--notice-beige))`,
              outline: active ? "2px solid hsl(var(--primary))" : undefined,
              outlineOffset: 2,
            }}
          >
            {task ? (
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold"
                  style={{ background: `hsl(var(${statusVar}))`, color: "hsl(0 0% 100%)", boxShadow: "0 0 0 2px hsl(0 0% 100%)" }}
                >
                  {b.authorInitials || "?"}
                </span>
                <span className="truncate font-semibold">{b.title || "Aufgabe"}</span>
              </div>
            ) : (
              <>
                <div className="truncate font-semibold">{b.title || "Information"}</div>
                <div className="truncate text-[10.5px]" style={{ color: "hsl(var(--cad-toolbar-muted))" }}>
                  Information
                </div>
              </>
            )}
            {cat && (
              <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color }} />
                <span className="truncate">{cat.name}</span>
              </div>
            )}
          </div>
        );
      })}
      {draft && (() => {
        const p = cam.worldToScreen(draft.x, draft.y);
        return (
          <div
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: p.x, top: p.y, background: "hsl(var(--notice-beige))", boxShadow: "0 0 0 2px hsl(var(--cad-settings-bg))" }}
          />
        );
      })()}
    </div>
  );
}
