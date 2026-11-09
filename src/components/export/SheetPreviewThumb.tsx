import React from "react";
import type { CadApp } from "@/cad/CadApp";
import { flattenSheetSnapshot, itemsBoundsM } from "@/cad/PlanProjections";
import { drawSheetSnapshotContent, ProjectionCamera } from "@/cad/ProjectionRender";

/**
 * Echte Zeichnungsvorschau eines CAD-Blatts (gleicher Renderer wie die
 * Ausschnitte). Wird neu gezeichnet, wenn sich der Blattinhalt ändert.
 */
export function SheetPreviewThumb({ app, sheetId, revision }: { app: CadApp; sheetId: string; revision: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [empty, setEmpty] = React.useState(false);
  React.useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const handle = window.setTimeout(() => {
      try {
        const snap = app.serializeSheetSnapshot(sheetId);
        const defs = (app as any).libraryDefinitions;
        const items = snap ? flattenSheetSnapshot(snap, defs) : [];
        const dpr = window.devicePixelRatio || 1;
        const w = cv.clientWidth || 120, h = cv.clientHeight || 80;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (!snap || items.length === 0) { setEmpty(true); return; }
        setEmpty(false);
        const b = itemsBoundsM(items);
        const bw = Math.max(1e-3, b.maxX - b.minX), bh = Math.max(1e-3, b.maxY - b.minY);
        const pad = 8;
        const s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh);
        const offX = w / 2 - (b.minX + bw / 2) * s;
        const offY = h / 2 - (b.minY + bh / 2) * s;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawSheetSnapshotContent(ctx, snap, new ProjectionCamera(s, offX, offY), defs);
      } catch { setEmpty(true); }
    }, 60);
    return () => window.clearTimeout(handle);
  }, [app, sheetId, revision]);
  return (
    <div className="relative h-full w-full">
      <canvas ref={ref} className="h-full w-full" />
      {empty && <div className="absolute inset-0 flex items-center justify-center text-[10px]" style={{ color: "hsl(var(--overlay-ink) / 0.45)" }}>Leeres Blatt</div>}
    </div>
  );
}
