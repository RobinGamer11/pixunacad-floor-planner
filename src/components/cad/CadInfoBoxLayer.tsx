/**
 * Infoboxen auf der Zeichenfläche (DOM-Overlay, feste Bildschirmgröße).
 * Die Boxen sind Zeichenobjekte der Szene (Ebene, Objekt-ID, Undo);
 * bearbeitet wird ausschließlich in den Werkzeugeinstellungen.
 */
import React from "react";
import { Move } from "lucide-react";
import { commentUi, useCommentUi } from "@/lib/commentsStore";
import { infoBoxCornersWorld, infoBoxSizeWorld, infoBoxUi, useInfoBoxUi } from "@/lib/infoBoxUi";

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
        ? `${cam.scale}|${cam.offsetX}|${cam.offsetY}|${app?.activeSheetId ?? ""}|${boxes.map((b) => `${b.id}${b.x}${b.y}${b.title}${b.kind}${b.status}${b.sizePx}${b.sizeM}${b.labelId}${b.authorInitials}${b.categoryId}`).join(",")}|${(app?.scene?.infoBoxCategories || []).map((c: any) => c.id + c.name + c.color).join()}|${((app?.selectTool?.marqueeSelectedIds || []) as any[]).filter((m) => m.kind === "infobox").map((m) => m.id).join()}|${infoBoxUi.get().hiddenIds.join()}|${(app?.labelManager?.list?.() || []).map((l: any) => `${l.id}${l.visible}`).join()}`
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

  // Zähler am Knopf: alle Infoboxen des aktiven Blatts.
  const boxes: any[] = app?.scene?.infoBoxes || [];
  const openCount = boxes.length;
  React.useEffect(() => { commentUi.set({ openCount }); }, [openCount]);

  // Verschieben über Fangpunkt (wie Schraffur): Ecke wählen → „Verschieben“ → Zielpunkt tippen.
  const [pick, setPick] = React.useState<{ id: string; i: number } | null>(null);
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => { if (!sel.selectedId || pick?.id !== sel.selectedId) { setPick(null); setArmed(false); } }, [sel.selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!app?.input || !armed || !pick) return;
    const prev = app.input.canvasTapHandler;
    const onTap = (sx: number, sy: number) => {
      const b = app.scene.getInfoBoxById?.(pick.id);
      if (!b) { setArmed(false); return; }
      let w = app.camera.screenToWorld(sx, sy);
      try { w = app.selectTool?.snapWorldPointPublic?.(w) ?? w; } catch { /* */ }
      const c = infoBoxCornersWorld(b)[pick.i];
      app.runAction(() => { b.x += w.x - c.x; b.y += w.y - c.y; });
      setArmed(false); setPick(null);
      app.renderer?.render?.();
    };
    app.input.canvasTapHandler = onTap;
    return () => { if (app.input.canvasTapHandler === onTap) app.input.canvasTapHandler = prev && prev !== onTap ? prev : null; };
  }, [app, armed, pick]);

  const cam = app?.camera;
  if (!cam) return null;
  const visible = (b: any) => app.labelManager?.isVisible?.(b.labelId) !== false && !sel.hiddenIds.includes(b.id);

  const draft = sel.draft && sel.draft.sheetId === (app.activeSheetId || "default") ? sel.draft : null;

  const choose = (e: React.PointerEvent, b: any) => {
    e.stopPropagation();
    if (e.button !== 0 || e.pointerType === "touch") {
      app.canvas?.dispatchEvent(new PointerEvent("pointerdown", { pointerId: e.pointerId, pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons, bubbles: true }));
      if (e.button !== 0 || app.input?.cameraGesture) return;
      app.input?.cancelCanvasTap();
    }
    const st = app.selectTool;
    const selectToolOn = !ui.mode && st && app.activeTool === st;
    if (selectToolOn && e.shiftKey) {
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
  };

  return (
    <div
      ref={hostRef}
      data-infobox-layer
      className="pixuna-comments absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 25 }}
    >
      {boxes.filter(visible).map((b) => {
        const p = cam.worldToScreen(b.x, b.y);
        const { w: wm, h: hm } = infoBoxSizeWorld(b);
        const w = Math.max(14, wm * cam.scale), h = Math.max(6, hm * cam.scale);
        const icon = Math.max(4, h * 0.72);
        const active = sel.selectedId === b.id
          || ((app.selectTool?.marqueeSelectedIds || []) as any[]).some((m) => m.kind === "infobox" && m.id === b.id);
        const task = b.kind === "task";
        const statusVar = b.status === "done" ? "--infobox-done" : "--infobox-open";
        return (
          <div
            key={b.id}
            role="button"
            title={b.title || "Infobox"}
            onPointerDown={(e) => choose(e, b)}
            className="absolute flex items-center overflow-hidden cursor-pointer select-none"
            style={{
              left: p.x - w / 2, top: p.y - h / 2, width: w, height: h,
              gap: h * 0.18, paddingLeft: h * 0.14, paddingRight: h * 0.2,
              borderRadius: h * 0.22, pointerEvents: "auto", touchAction: "none",
              background: "hsl(var(--card))", color: "hsl(var(--foreground))",
              border: `${Math.max(1, h * 0.05)}px solid hsl(var(${task ? statusVar : "--notice-beige"}))`,
              outline: active ? "2px solid hsl(var(--primary))" : undefined, outlineOffset: 1,
              boxShadow: "0 1px 4px hsl(0 0% 0% / 0.18)",
            }}
          >
            <span className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
              style={task
                ? { width: icon, height: icon, fontSize: icon * 0.42, background: `hsl(var(${statusVar}))`, color: "hsl(0 0% 100%)", boxShadow: "0 0 0 1px hsl(0 0% 100%)" }
                : { width: icon, height: icon, fontSize: icon * 0.7, fontFamily: "Georgia, serif", fontStyle: "italic", background: "hsl(var(--notice-beige))", color: "hsl(var(--ink))" }}>
              {task ? (b.authorInitials || "?") : "i"}
            </span>
            {b.title && (
              <span className="min-w-0 truncate font-medium leading-none" style={{ fontSize: icon * 0.55 }}>{b.title}</span>
            )}
          </div>
        );
      })}
      {(() => {
        const b = sel.selectedId ? boxes.find((x) => x.id === sel.selectedId) : null;
        if (!b || !visible(b)) return null;
        const pts = infoBoxCornersWorld(b).map((c) => cam.worldToScreen(c.x, c.y));
        return (
          <>
            {pts.map((sp, i) => {
              const on = pick?.i === i;
              return (
                <button key={i} type="button" aria-label="Fangpunkt der Infobox"
                  onPointerDown={(e) => { e.stopPropagation(); setPick({ id: b.id, i }); setArmed(false); }}
                  className="absolute rounded-full"
                  style={{ left: sp.x - 9, top: sp.y - 9, width: 18, height: 18, pointerEvents: "auto", touchAction: "none",
                    background: on ? "hsl(var(--primary))" : "hsl(var(--card))", border: "2px solid hsl(var(--primary))" }} />
              );
            })}
            {pick && pick.id === b.id && (
              <button type="button" title="Verschieben"
                onPointerDown={(e) => { e.stopPropagation(); setArmed((a) => !a); }}
                className="absolute flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold shadow-md"
                style={{ left: pts[pick.i].x + 14, top: pts[pick.i].y - 46, pointerEvents: "auto",
                  background: armed ? "hsl(var(--primary))" : "hsl(var(--card))",
                  color: armed ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                  border: "1px solid hsl(var(--primary))" }}>
                <Move size={15} /> {armed ? "Zielpunkt wählen" : "Verschieben"}
              </button>
            )}
          </>
        );
      })()}
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
