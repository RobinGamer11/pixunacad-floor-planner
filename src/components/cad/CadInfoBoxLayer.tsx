/**
 * Infoboxen auf der Zeichenfläche (DOM-Overlay, feste Bildschirmgröße).
 * Die Boxen sind Zeichenobjekte der Szene (Ebene, Objekt-ID, Undo);
 * bearbeitet wird ausschließlich in den Werkzeugeinstellungen.
 */
import React from "react";
import { Info } from "lucide-react";
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
        ? `${cam.scale}|${cam.offsetX}|${cam.offsetY}|${app?.activeSheetId ?? ""}|${boxes.map((b) => `${b.id}${b.x}${b.y}${b.title}${b.kind}${b.status}${b.sizePx}${b.labelId}${b.authorInitials}${b.categoryId}`).join(",")}|${(app?.scene?.infoBoxCategories || []).map((c: any) => c.id + c.name + c.color).join()}|${((app?.selectTool?.marqueeSelectedIds || []) as any[]).filter((m) => m.kind === "infobox").map((m) => m.id).join()}|${(app?.labelManager?.list?.() || []).map((l: any) => `${l.id}${l.visible}`).join()}`
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

  React.useEffect(() => {
    if (!app?.input || !ui.mode) return;
    const onTap = (sx: number, sy: number) => {
      const w = app.camera.screenToWorld(sx, sy);
      infoBoxUi.set({ selectedId: null, draft: { x: w.x, y: w.y, sheetId: app.activeSheetId || "default" } });
    };
    app.input.canvasTapHandler = onTap;
    return () => { if (app.input.canvasTapHandler === onTap) app.input.canvasTapHandler = null; };
  }, [app, ui.mode]);

  // Wheel over a pin also uses the canvas' existing, non-passive zoom listener.
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !app?.canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      app.canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: e.clientX, clientY: e.clientY }));
      app.canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, cancelable: true }));
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [app]);

  // Offene Aufgaben für den Zähler am Knopf.
  const boxes: any[] = app?.scene?.infoBoxes || [];
  const openCount = boxes.filter((b) => b.kind === "task" && b.status !== "done").length;
  React.useEffect(() => { commentUi.set({ openCount }); }, [openCount]);

  const cam = app?.camera;
  if (!cam) return null;
  const visible = (b: any) => app.labelManager?.isVisible?.(b.labelId) !== false;

  const draft = sel.draft && sel.draft.sheetId === (app.activeSheetId || "default") ? sel.draft : null;

  return (
    <div
      ref={hostRef}
      data-infobox-layer
      className="pixuna-comments absolute inset-0"
      style={{ pointerEvents: "none", zIndex: 25 }}
    >
      {boxes.filter(visible).map((b) => {
        const p = cam.worldToScreen(b.x, b.y);
        const active = sel.selectedId === b.id
          || ((app.selectTool?.marqueeSelectedIds || []) as any[]).some((m) => m.kind === "infobox" && m.id === b.id);
        const task = b.kind === "task";
        const cat = (app.scene?.infoBoxCategories || []).find((c: any) => c.id === b.categoryId);
        const statusVar = b.status === "done" ? "--infobox-done" : "--infobox-open";
        return (
          <div
            key={b.id}
            role="button"
            title={b.title || "Infobox"}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button !== 0 || e.pointerType === "touch") {
                app.canvas?.dispatchEvent(new PointerEvent("pointerdown", { pointerId: e.pointerId, pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons, bubbles: true }));
                if (e.button !== 0 || app.input?.cameraGesture) return;
                // Touch on a pin selects it; never creates another box on release.
                if (app.input) app.input.canvasTapHandler = null;
              }
              const st = app.selectTool;
              const selectToolOn = !ui.mode && st && app.activeTool === st;
              if (selectToolOn && e.shiftKey) {
                // Shift: zur Mehrfachauswahl hinzufügen/entfernen.
                const cur: any[] = st.marqueeSelectedIds || [];
                if (!cur.length) st._seedMarqueeFromSelection?.();
                const list: any[] = st.marqueeSelectedIds || [];
                const i = list.findIndex((m) => m.kind === "infobox" && m.id === b.id);
                st.marqueeSelectedIds = i >= 0 ? list.filter((_, j) => j !== i) : [...list, { kind: "infobox", id: b.id }];
                infoBoxUi.clear();
              } else {
                if (st) st.marqueeSelectedIds = [{ kind: "infobox", id: b.id }];
                infoBoxUi.select(b.id);
              }
              app.renderer?.render?.();
            }}
            className="absolute flex items-center justify-center shadow-md cursor-pointer select-none"
            style={{
              left: p.x, top: p.y, width: 32, height: 32, marginLeft: -16, marginTop: -32,
              borderRadius: "50% 50% 50% 6px", pointerEvents: "auto", touchAction: "none",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              border: `2px solid hsl(var(${task ? statusVar : "--notice-beige"}))`,
              outline: active ? "2px solid hsl(var(--primary))" : undefined,
              outlineOffset: 2,
            }}
          >
            {task ? (
              <div className="flex items-center justify-center">
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold"
                  style={{ background: `hsl(var(${statusVar}))`, color: "hsl(0 0% 100%)", boxShadow: "0 0 0 2px hsl(0 0% 100%)" }}
                >
                  {b.authorInitials || "?"}
                </span>
              </div>
            ) : (
              <Info size={20} />
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
