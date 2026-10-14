/**
 * Infoboxen auf der Zeichenfläche (DOM-Overlay, feste Bildschirmgröße).
 * Die Boxen sind Zeichenobjekte der Szene (Ebene, Objekt-ID, Undo);
 * bearbeitet wird ausschließlich in den Werkzeugeinstellungen.
 */
import React from "react";
import { Info, Move } from "lucide-react";
import { commentUi, useCommentUi } from "@/lib/commentsStore";
import { infoBoxUi, infoBoxSizeWorld, infoBoxTitleExtraWorld, initialsOf, useInfoBoxUi } from "@/lib/infoBoxUi";
import { useAuth } from "@/components/auth/AuthProvider";
import { ensureObjectCode } from "@/cad/objectMeta";

function scenesOf(app: any): any[] {
  const out: any[] = [];
  try { for (const s of app.scenesById?.values?.() || []) out.push(s); } catch { /* */ }
  if (app.scene && !out.includes(app.scene)) out.push(app.scene);
  return out;
}


/** Bildschirmlage eines Pins: Spitze exakt auf der Weltkoordinate. */
function pinGeom(b: any, cam: any) {
  const p = cam.worldToScreen(b.x, b.y);
  const pin = Math.max(1, infoBoxSizeWorld(b).w * cam.scale);
  const extra = infoBoxTitleExtraWorld(b) * cam.scale;
  return { pin, extra, left: p.x - pin / 2, top: p.y - pin, width: pin + extra, height: pin, ax: p.x, ay: p.y };
}

export function CadInfoBoxLayer({ app }: { app: any }) {
  const ui = useCommentUi();
  const sel = useInfoBoxUi();
  const auth = useAuth() as any;
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const user = auth?.session?.user;
  const initials = initialsOf(user?.user_metadata?.display_name || user?.user_metadata?.name || user?.email);

  // Kamera, Blatt, Ebenen und Undo pro Frame nachführen.
  React.useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const cam = app?.camera;
      const boxes: any[] = app?.scene?.infoBoxes || [];
      const key = cam
        ? `${cam.scale}|${cam.offsetX}|${cam.offsetY}|${app?.activeSheetId ?? ""}|${boxes.map((b) => `${b.id}${b.x}${b.y}${b.sizeM}${b.title}${b.kind}${b.status}${b.labelId}${b.authorInitials}`).join(",")}|${((app?.selectTool?.marqueeSelectedIds || []) as any[]).filter((m) => m.kind === "infobox").map((m) => m.id).join()}|${infoBoxUi.get().hiddenIds.join()}|${(app?.labelManager?.list?.() || []).map((l: any) => `${l.id}${l.visible}`).join()}`
        : "";
      if (key !== last) { last = key; force(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app]);

  // Synchron mit jedem Zeichnen: Pins sitzen beim Verschieben/Zoomen exakt fest.
  React.useEffect(() => {
    const r = app?.renderer;
    if (!r?.afterRender) return;
    const sync = () => {
      const host = hostRef.current, cam = app.camera;
      if (!host || !cam) return;
      host.querySelectorAll<HTMLElement>("[data-infobox-pin]").forEach((el) => {
        const b = app.scene?.getInfoBoxById?.(el.dataset.infoboxPin);
        if (!b) return;
        const g = pinGeom(b, cam);
        el.style.left = `${g.left}px`; el.style.top = `${g.top}px`;
        el.style.width = `${g.width}px`; el.style.height = `${g.height}px`;
        el.style.setProperty("--pin", `${g.pin}px`);
      });
      host.querySelectorAll<HTMLElement>("[data-infobox-anchor]").forEach((el) => {
        const b = app.scene?.getInfoBoxById?.(el.dataset.infoboxAnchor);
        if (!b) return;
        const p = cam.worldToScreen(b.x, b.y);
        el.style.left = `${p.x - 5}px`; el.style.top = `${p.y - 5}px`;
      });
    };
    r.afterRender.add(sync);
    return () => { r.afterRender.delete(sync); };
  }, [app]);

  // Anderes Werkzeug oder andere Objektauswahl beendet den Infobox-Modus.
  React.useEffect(() => {
    if (!ui.mode || !app) return;
    const startTool = app.activeTool;
    const startSel = app.selection;
    let raf = 0;
    const tick = () => {
      if (app.activeTool !== startTool || (app.selection && app.selection !== startSel)) {
        commentUi.exitMode();
        infoBoxUi.clear();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app, ui.mode]);

  // Werkzeugwechsel schließt eine gewählte Infobox (auch ohne Setzmodus).
  React.useEffect(() => {
    if (!sel.selectedId || !app) return;
    const startTool = app.activeTool;
    let raf = 0;
    const tick = () => {
      if (app.activeTool !== startTool) {
        infoBoxUi.clear();
        const st = app.selectTool;
        if (st?.marqueeSelectedIds?.some?.((m: any) => m.kind === "infobox")) st.marqueeSelectedIds = st.marqueeSelectedIds.filter((m: any) => m.kind !== "infobox");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app, sel.selectedId]);

  // Esc: erst Auswahl aufheben, dann die Funktion ganz deaktivieren.
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

  // Tippen setzt sofort eine echte Aufgabe-Box (ein Undo-Schritt), kein Platzhalter.
  React.useEffect(() => {
    if (!app?.input || !ui.mode) return;
    const onTap = (sx: number, sy: number) => {
      const w = app.camera.screenToWorld(sx, sy);
      const lm = app.labelManager;
      let labelId = app.activeDrawLabelId;
      if (lm?.isEditable?.(labelId) === false) labelId = lm.list?.().find((g: any) => lm.isEditable(g.id))?.id ?? labelId;
      const made = app.runAction(() => {
        const b = app.scene.createInfoBox({ x: w.x, y: w.y, labelId, authorInitials: initials, kind: "task", status: "open" });
        ensureObjectCode(scenesOf(app), "infobox", b);
        return b;
      });
      if (made) infoBoxUi.select(made.id);
      app.renderer?.render?.();
    };
    app.input.canvasTapHandler = onTap;
    return () => { if (app.input.canvasTapHandler === onTap) app.input.canvasTapHandler = null; };
  }, [app, ui.mode, initials]);

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

  const boxes: any[] = app?.scene?.infoBoxes || [];
  const openCount = boxes.length;
  React.useEffect(() => { commentUi.set({ openCount }); }, [openCount]);

  // Verschieben wie beim Linienwerkzeug: Fangpunkt (Pinspitze) wählen →
  // „Verschieben“ → Vorschau folgt Maus/Finger (mit Fang, Länge/Winkel) →
  // Tippen/Klick setzt den Zielpunkt als genau einen Undo-Schritt.
  const [pick, setPick] = React.useState<string | null>(null);
  const [armed, setArmed] = React.useState(false);
  const [preview, setPreview] = React.useState<{ x: number; y: number } | null>(null);
  React.useEffect(() => { if (!sel.selectedId || pick !== sel.selectedId) { setPick(null); setArmed(false); } }, [sel.selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!app?.input || !armed || !pick) { setPreview(null); return; }
    const prev = app.input.canvasTapHandler;
    const snapAt = (sx: number, sy: number) => {
      let w = app.camera.screenToWorld(sx, sy);
      try { w = app.selectTool?.snapWorldPointPublic?.(w) ?? w; } catch { /* */ }
      return w;
    };
    const onMove = (e: PointerEvent) => {
      const r = app.canvas?.getBoundingClientRect?.();
      if (!r) return;
      const w = snapAt(e.clientX - r.left, e.clientY - r.top);
      setPreview({ x: w.x, y: w.y });
      const b = app.scene.getInfoBoxById?.(pick);
      if (b) {
        const dx = w.x - b.x, dy = w.y - b.y;
        try { app.hub?.showAt?.(e.clientX - r.left, e.clientY - r.top); app.hub?.updateDisplay?.(Math.hypot(dx, dy), (Math.atan2(dy, dx) * 180) / Math.PI); } catch { /* */ }
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setArmed(false); } };
    const onTap = (sx: number, sy: number) => {
      const b = app.scene.getInfoBoxById?.(pick);
      if (!b) { setArmed(false); return; }
      const w = snapAt(sx, sy);
      app.runAction(() => { b.x = w.x; b.y = w.y; });
      setArmed(false); setPick(null);
      app.renderer?.render?.();
    };
    app.input.canvasTapHandler = onTap;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey, true);
      try { app.hub?.hide?.(); } catch { /* */ }
      setPreview(null);
      if (app.input.canvasTapHandler === onTap) app.input.canvasTapHandler = prev && prev !== onTap ? prev : null;
    };
  }, [app, armed, pick]);

  const cam = app?.camera;
  if (!cam) return null;
  const marked = new Set<string>(((app.selectTool?.marqueeSelectedIds || []) as any[]).filter((m) => m.kind === "infobox").map((m) => m.id));
  const visible = (b: any) => app.labelManager?.isVisible?.(b.labelId) !== false && !sel.hiddenIds.includes(b.id);

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
      // Andere Objektauswahl lösen, damit rechts sicher die Infobox erscheint.
      try { if (app.selection) app.setSelection?.(null); } catch { /* */ }
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
        const g = pinGeom(b, cam);
        const pin = g.pin;
        const extra = g.extra;
        const task = b.kind === "task";
        const statusVar = b.status === "done" ? "--infobox-done" : "--infobox-open";
        const chosen = sel.selectedId === b.id || marked.has(b.id);
        return (
          <div
            key={b.id}
            data-infobox-pin={b.id}
            role="button"
            title={b.title || "Infobox"}
            onPointerDown={(e) => choose(e, b)}
            className="absolute flex items-center justify-center overflow-hidden cursor-pointer select-none"
            style={{
              left: g.left, top: g.top, width: g.width, height: g.height,
              ["--pin" as any]: `${pin}px`,
              borderRadius: extra ? "calc(var(--pin) / 2) calc(var(--pin) / 2) calc(var(--pin) / 2) calc(var(--pin) * 0.19)" : "50% 50% 50% 19%",
              borderWidth: "max(1px, calc(var(--pin) * 0.06))", justifyContent: extra ? "flex-start" : "center", pointerEvents: "auto", touchAction: "none",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              borderStyle: "solid", borderColor: `hsl(var(${task ? statusVar : "--notice-beige"}))`,
              boxShadow: chosen ? "0 0 0 2.5px hsl(var(--primary)), 0 0 10px 2px hsl(var(--primary) / 0.55)" : "0 4px 6px -1px hsl(0 0% 0% / 0.15)",
            }}
          >
            {task ? (
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
                style={{ width: "calc(var(--pin) * 0.75)", height: "calc(var(--pin) * 0.75)", fontSize: "calc(var(--pin) * 0.33)", background: `hsl(var(${statusVar}))`, color: "hsl(0 0% 100%)", boxShadow: "0 0 0 2px hsl(0 0% 100%)" }}
              >
                {b.authorInitials || "?"}
              </span>
            ) : (
              <>
                <span className="inline-flex shrink-0 items-center justify-center" style={{ width: "calc(var(--pin) * 0.9)", height: "var(--pin)" }}>
                  <Info style={{ width: "calc(var(--pin) * 0.62)", height: "calc(var(--pin) * 0.62)" }} />
                </span>
                {b.title && (
                  <span className="truncate font-semibold" style={{ fontSize: "calc(var(--pin) * 0.36)", lineHeight: 1, paddingRight: "calc(var(--pin) * 0.2)" }}>
                    {b.title}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
      {(() => {
        const b = sel.selectedId ? boxes.find((x) => x.id === sel.selectedId) : null;
        if (!b || !visible(b)) return null;
        const sp = cam.worldToScreen(b.x, b.y);
        const on = pick === b.id;
        return (
          <>
            {armed && preview && (() => {
              const tp = cam.worldToScreen(preview.x, preview.y);
              const gp = Math.max(1, infoBoxSizeWorld(b).w * cam.scale);
              const gw = gp + infoBoxTitleExtraWorld(b) * cam.scale;
              return (
                <>
                  <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none", overflow: "visible" }}>
                    <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="6 4" />
                  </svg>
                  <div className="absolute" style={{ left: tp.x, top: tp.y, width: gw, height: gp, marginLeft: -gp / 2, marginTop: -gp,
                    borderRadius: "50% 50% 50% 19%", pointerEvents: "none", opacity: 0.55,
                    background: "hsl(var(--card))", border: "2px dashed hsl(var(--primary))" }} />
                </>
              );
            })()}
            <button type="button" aria-label="Fangpunkt der Infobox" data-infobox-anchor={b.id}
              onPointerDown={(e) => { e.stopPropagation(); setPick(on ? null : b.id); setArmed(false); }}
              className="absolute rounded-full"
              style={{ left: sp.x - 5, top: sp.y - 5, width: 10, height: 10, pointerEvents: "auto", touchAction: "none",
                background: on ? "hsl(var(--primary))" : "hsl(var(--card))", border: "1.5px solid hsl(var(--primary))",
                boxShadow: "0 0 0 8px transparent" }} />
            {on && (
              <button type="button" title="Verschieben"
                onPointerDown={(e) => { e.stopPropagation(); setArmed((a) => !a); }}
                className="absolute flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold shadow-md"
                style={{ left: sp.x + 14, top: sp.y + 6, pointerEvents: "auto",
                  background: armed ? "hsl(var(--primary))" : "hsl(var(--card))",
                  color: armed ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))",
                  border: "1px solid hsl(var(--primary))" }}>
                <Move size={15} /> {armed ? "Zielpunkt wählen" : "Verschieben"}
              </button>
            )}
          </>
        );
      })()}
    </div>
  );
}
