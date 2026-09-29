import React from "react";
import type { CadApp } from "@/cad/CadApp";
import { GripVertical } from "lucide-react";

type Neighbor = { id: string; name: string; dxMm: number; dyMm: number; widthMm: number; heightMm: number };

/**
 * Griffe der Nachbarseiten im Seitenverbund (nur Exportansicht).
 * - Antippen des Namens öffnet die Nachbarseite.
 * - Bei freier Anordnung: Griff ziehen (Finger/Stift/Maus), flüssige Vorschau,
 *   Einrasten an Nachbarkanten, Speichern erst beim Loslassen (ein Verlaufsschritt).
 * Die Seitenflächen selbst bleiben durchlässig für die Zeichenfläche.
 */
export function SpreadHandles({ app }: { app: CadApp }) {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const lastKey = React.useRef("");
  const drag = React.useRef<{ id: string; startX: number; startY: number; dx0: number; dy0: number; dx: number; dy: number; moved: boolean } | null>(null);

  // Position an Kamera/Planänderungen anpassen (leichter rAF-Vergleich).
  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pm = app.renderer.planMode;
      const key = pm ? `${app.camera.scale}|${app.camera.offsetX}|${app.camera.offsetY}|${JSON.stringify(pm.spreadNeighbors ?? [])}|${app.activePlanId}` : "";
      if (key !== lastKey.current) { lastKey.current = key; force(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [app]);

  const pm = app.renderer.planMode;
  const active = app.activePlanId ? app.planManager.getById(app.activePlanId) : null;
  if (!pm || !active?.spreadId) return null;
  const neighbors: Neighbor[] = pm.spreadNeighbors ?? [];
  if (neighbors.length === 0) return null;
  const free = app.planManager.getSpreadLayoutMode(active.spreadId) === "free";
  const cam = app.camera;
  const pxPerMm = cam.scale / 1000;
  const tl = cam.worldToScreen(-pm.widthMm / 2000, -pm.heightMm / 2000);

  /** Einrasten an Kanten der aktiven Seite und der übrigen Nachbarn. */
  const snap = (id: string, dx: number, dy: number, w: number, h: number) => {
    const tol = 8 / pxPerMm;
    const others = [{ x: 0, y: 0, w: pm.widthMm, h: pm.heightMm }, ...neighbors.filter(n => n.id !== id).map(n => ({ x: n.dxMm, y: n.dyMm, w: n.widthMm, h: n.heightMm }))];
    let bx = dx, by = dy, best = tol, bestY = tol;
    for (const o of others) {
      for (const [cand, self] of [[o.x, 0], [o.x + o.w, 0], [o.x, w], [o.x + o.w, w]] as const) {
        const v = cand - self; if (Math.abs(v - dx) < best) { best = Math.abs(v - dx); bx = v; }
      }
      for (const [cand, self] of [[o.y, 0], [o.y + o.h, 0], [o.y, h], [o.y + o.h, h]] as const) {
        const v = cand - self; if (Math.abs(v - dy) < bestY) { bestY = Math.abs(v - dy); by = v; }
      }
    }
    return { dx: bx, dy: by };
  };

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {neighbors.map(n => {
        const x = tl.x + n.dxMm * pxPerMm;
        const y = tl.y + n.dyMm * pxPerMm;
        const w = n.widthMm * pxPerMm;
        return (
          <div key={n.id} className="absolute flex items-center gap-1 pointer-events-auto"
            style={{ left: x + w / 2, top: Math.max(4, y - 40), transform: "translateX(-50%)" }}>
            {free && (
              <button type="button" aria-label={`Seite „${n.name}“ verschieben`} title="Ziehen zum Verschieben"
                className="h-9 w-9 rounded-full border grid place-items-center shadow-sm"
                style={{ touchAction: "none", background: "hsl(var(--surface-card))", borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--ink))" }}
                onPointerDown={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { id: n.id, startX: e.clientX, startY: e.clientY, dx0: n.dxMm, dy0: n.dyMm, dx: n.dxMm, dy: n.dyMm, moved: false };
                }}
                onPointerMove={(e) => {
                  const d = drag.current; if (!d || d.id !== n.id) return;
                  const mx = (e.clientX - d.startX) / pxPerMm, my = (e.clientY - d.startY) / pxPerMm;
                  if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 3) return; // kein Sprung beim Antippen
                  d.moved = true;
                  const s = snap(n.id, d.dx0 + mx, d.dy0 + my, n.widthMm, n.heightMm);
                  d.dx = s.dx; d.dy = s.dy;
                  app.previewSpreadNeighbor(n.id, s.dx, s.dy);
                }}
                onPointerUp={() => {
                  const d = drag.current; drag.current = null;
                  if (d && d.moved) app.commitSpreadNeighbor(d.id, d.dx, d.dy);
                }}
                onPointerCancel={() => {
                  const d = drag.current; drag.current = null;
                  if (d) app.previewSpreadNeighbor(d.id, d.dx0, d.dy0);
                }}>
                <GripVertical size={16} />
              </button>
            )}
            <button type="button" className="h-9 px-3 rounded-full border text-xs shadow-sm max-w-[200px] truncate"
              style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))" }}
              title="Diese Seite öffnen"
              onClick={() => app.setActivePlanId(n.id)}>
              {n.name || "Seite"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
