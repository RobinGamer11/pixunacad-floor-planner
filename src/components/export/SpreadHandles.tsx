import React from "react";
import type { CadApp } from "@/cad/CadApp";
import { Check, X } from "lucide-react";

type Page = { id: string; name: string; x: number; y: number; w: number; h: number; active: boolean };

/**
 * Bedienung des Seitenverbunds (nur Exportansicht).
 * - Antippen einer Nachbarseite macht sie aktiv — ausschließlich mit dem Auswahlwerkzeug.
 * - Eckpunkte gibt es nur an der aktiven Seite und nur im flüchtigen Modus
 *   „Seitenanordnung bearbeiten“ (app.spreadLayoutEditing).
 * - Antippen eines Eckpunkts startet direkt den Verschiebe-Modus. Anheben von
 *   Finger/Stift beendet nur die Zeigerbewegung; gespeichert wird allein über
 *   „✓ Fixieren“ oder Enter. Abbrechen/Esc stellt die Ausgangslage wieder her.
 */
export function SpreadHandles({ app }: { app: CadApp }) {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const lastKey = React.useRef("");
  const [moving, setMoving] = React.useState<string | null>(null);
  const mv = React.useRef<{ id: string; refX: number | null; refY: number | null; dx: number; dy: number; base: Page[] } | null>(null);

  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pm = app.renderer.planMode;
      const key = pm ? `${app.camera.scale}|${app.camera.offsetX}|${app.camera.offsetY}|${JSON.stringify(pm.spreadNeighbors ?? [])}|${app.activePlanId}|${app.spreadLayoutEditing}` : "";
      if (key !== lastKey.current) { lastKey.current = key; force(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app]);

  // Seitenwechsel → laufende Bedienung schließen.
  React.useEffect(() => { if (mv.current) { app.cancelSpreadPreview(); mv.current = null; setMoving(null); } }, [app, app.activePlanId]);

  // Antippen einer Nachbarseiten-Papierfläche aktiviert sie (nur Auswahlwerkzeug).
  React.useEffect(() => {
    const cv = app.canvas;
    let down: { x: number; y: number; t: number; tool: unknown } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: Date.now(), tool: app.activeTool }; };
    const onUp = (e: PointerEvent) => {
      const d = down; down = null;
      if (!d || mv.current) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || Date.now() - d.t > 600) return;
      // Nur das Auswahlwerkzeug darf die aktive Exportseite wechseln; ein
      // Zeichenwerkzeug (auch ein währenddessen gewechseltes) niemals.
      if (app.activeTool !== app.selectTool || d.tool !== app.selectTool) return;
      const r = cv.getBoundingClientRect();
      app.activateSpreadPageAt(e.clientX - r.left, e.clientY - r.top);
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointerup", onUp);
    return () => { cv.removeEventListener("pointerdown", onDown); cv.removeEventListener("pointerup", onUp); };
  }, [app]);

  const pm = app.renderer.planMode;
  const active = app.activePlanId ? app.planManager.getById(app.activePlanId) : null;
  const neighbors = pm?.spreadNeighbors ?? [];
  const free = !!active?.spreadId && app.planManager.getSpreadLayoutMode(active.spreadId) === "free";
  const editing = free && app.spreadLayoutEditing;

  const commit = React.useCallback(() => {
    const m = mv.current; mv.current = null; setMoving(null);
    if (m && (m.dx !== 0 || m.dy !== 0)) app.commitSpreadPage(m.id, m.dx, m.dy);
    else app.cancelSpreadPreview();
    // Nach dem Fixieren endet der Anordnungsmodus (keine Eckpunkte mehr).
    app.spreadLayoutEditing = false;
  }, [app]);
  const cancel = React.useCallback(() => {
    if (mv.current) app.cancelSpreadPreview();
    mv.current = null; setMoving(null);
  }, [app]);

  React.useEffect(() => {
    if (!moving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); commit(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [moving, cancel, commit]);

  if (!pm || !active?.spreadId || neighbors.length === 0) return null;
  const cam = app.camera;
  const pxPerMm = cam.scale / 1000;
  const tl = cam.worldToScreen(-pm.widthMm / 2000, -pm.heightMm / 2000);
  const pages: Page[] = [
    { id: active.id, name: active.name, x: 0, y: 0, w: pm.widthMm, h: pm.heightMm, active: true },
    ...neighbors.map(n => ({ id: n.id, name: n.name, x: n.dxMm, y: n.dyMm, w: n.widthMm, h: n.heightMm, active: false })),
  ];

  /** Einrasten an Kanten der übrigen Seiten (Ausgangslage). */
  const snap = (base: Page[], id: string, dx: number, dy: number) => {
    const me = base.find(p => p.id === id)!;
    const tol = 8 / pxPerMm;
    let bx = dx, by = dy, best = tol, bestY = tol;
    for (const o of base) {
      if (o.id === id) continue;
      for (const cand of [o.x, o.x + o.w]) for (const self of [0, me.w]) {
        const v = cand - self - me.x; if (Math.abs(v - dx) < best) { best = Math.abs(v - dx); bx = v; }
      }
      for (const cand of [o.y, o.y + o.h]) for (const self of [0, me.h]) {
        const v = cand - self - me.y; if (Math.abs(v - dy) < bestY) { bestY = Math.abs(v - dy); by = v; }
      }
    }
    return { dx: bx, dy: by };
  };

  const startMove = (id: string) => {
    mv.current = { id, refX: null, refY: null, dx: 0, dy: 0, base: pages.map(p => ({ ...p })) };
    setMoving(id);
  };

  const activePage = pages[0];
  const cornerPos = (p: Page, i: number) => {
    const cx = i === 1 || i === 2 ? p.x + p.w : p.x;
    const cy = i >= 2 ? p.y + p.h : p.y;
    return { left: tl.x + cx * pxPerMm, top: tl.y + cy * pxPerMm };
  };

  const btn: React.CSSProperties = { background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" };

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {/* Namen der Nachbarseiten: Antippen öffnet die Seite — aber nur, wenn
          beim Drücken und Loslassen das Auswahlwerkzeug aktiv war. */}
      {!moving && neighbors.map(n => (
        <button key={`name-${n.id}`} type="button"
          className="absolute h-8 px-3 rounded-full border text-xs shadow-sm max-w-[200px] truncate pointer-events-auto"
          style={{ ...btn, left: tl.x + (n.dxMm + n.widthMm / 2) * pxPerMm, top: Math.max(4, tl.y + n.dyMm * pxPerMm - 38), transform: "translateX(-50%)" }}
          title="Diese Seite öffnen (nur mit dem Auswahlwerkzeug)"
          onPointerDown={(e) => { nameDown.current = { id: n.id, ok: app.activeTool === app.selectTool }; e.stopPropagation(); }}
          onPointerUp={(e) => { e.stopPropagation(); }}
          onClick={(e) => {
            e.stopPropagation();
            const d = nameDown.current; nameDown.current = null;
            if (!d || d.id !== n.id || !d.ok) return;
            if (app.activeTool !== app.selectTool) return;
            app.setActivePlanId(n.id);
          }}>
          {n.name || "Seite"}
        </button>
      ))}

      {/* Eckpunkte ausschließlich an der aktiven Seite, nur im Anordnungsmodus. */}
      {editing && !moving && [0, 1, 2, 3].map(i => {
        const pos = cornerPos(activePage, i);
        return (
          <button key={`c-${i}`} type="button"
            aria-label={`Aktive Seite „${activePage.name}“ am Eckpunkt verschieben`}
            title="Aktive Seite verschieben"
            className="absolute grid place-items-center pointer-events-auto group"
            style={{ left: pos.left, top: pos.top, width: 28, height: 28, transform: "translate(-50%,-50%)", touchAction: "none", background: "transparent", border: "none", padding: 0 }}
            onPointerDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); startMove(activePage.id); }}>
            <span className="absolute rounded-full opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
              style={{ width: 18, height: 18, background: "hsl(var(--cad-snap-point) / 0.18)", border: "1px solid hsl(var(--cad-snap-line) / 0.6)" }} />
            <span className="absolute rounded-full"
              style={{ width: 8, height: 8, background: "hsl(var(--cad-snap-point))", boxShadow: "0 0 0 1.5px hsl(var(--surface-card))" }} />
          </button>
        );
      })}

      {/* Verschiebe-Modus: Fläche fängt Zeiger; Seite folgt, ✓ Fixieren/Enter speichert. */}
      {moving && (
        <>
          <div className="absolute inset-0 pointer-events-auto" style={{ touchAction: "none", cursor: "move" }}
            onPointerDown={(e) => {
              const m = mv.current; if (!m) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              if (m.refX == null) { m.refX = e.clientX - m.dx * pxPerMm; m.refY = e.clientY - m.dy * pxPerMm; }
            }}
            onPointerMove={(e) => {
              const m = mv.current; if (!m) return;
              // Referenz beim ersten Kontakt setzen → kein Sprung.
              if (m.refX == null || m.refY == null) { m.refX = e.clientX - m.dx * pxPerMm; m.refY = e.clientY - m.dy * pxPerMm; return; }
              if (e.pointerType !== "mouse" && e.buttons === 0) return;
              const s = snap(m.base, m.id, (e.clientX - m.refX) / pxPerMm, (e.clientY - m.refY) / pxPerMm);
              m.dx = s.dx; m.dy = s.dy;
              app.previewSpreadPage(m.id, s.dx, s.dy);
            }}
            onPointerUp={() => {
              // Anheben beendet nur die Zeigerbewegung; die Vorschau bleibt sichtbar.
              const m = mv.current; if (m) { m.refX = null; m.refY = null; }
            }}
            onPointerCancel={() => { const m = mv.current; if (m) { m.refX = null; m.refY = null; } }} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-lg border shadow-md pointer-events-auto" style={btn}>
            <span className="text-xs px-2">Seite verschieben</span>
            <button type="button" className="h-9 px-3 rounded-md border text-xs flex items-center gap-1" style={{ ...btn, borderColor: "hsl(var(--accent-gold))" }} onClick={commit}><Check size={14} /> Fixieren</button>
            <button type="button" className="h-9 px-3 rounded-md border text-xs flex items-center gap-1" style={btn} onClick={cancel}><X size={14} /> Abbrechen</button>
          </div>
        </>
      )}
    </div>
  );
}
