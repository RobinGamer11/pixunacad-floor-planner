import { useEffect, useRef } from "react";
import type { LibraryGeometrySnapshot } from "@/cad/library/types";
import { snapshotsBounds } from "@/cad/library/libraryGeometry";

interface Props {
  geometry: LibraryGeometrySnapshot[];
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Echte 2D-Vorschau eines Bibliotheksobjekts direkt aus den gespeicherten
 * Geometrie-Snapshots. Rein darstellend: Geometrie, Skalierung und Speicherung
 * werden dabei nicht verändert.
 */
export default function LibraryGeometryPreview({ geometry, size = 40, className, title }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (!geometry || geometry.length === 0) return;

    const b = snapshotsBounds(geometry);
    const w = Math.max(1e-6, b.maxX - b.minX);
    const h = Math.max(1e-6, b.maxY - b.minY);
    const pad = size * 0.12;
    const scale = Math.min((size - pad * 2) / w, (size - pad * 2) / h);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    // Y-Achse spiegeln: Weltkoordinaten zeigen nach oben, Canvas nach unten.
    const tx = (p: { x: number; y: number }) => ({
      x: size / 2 + (p.x - cx) * scale,
      y: size / 2 - (p.y - cy) * scale,
    });

    const stroke = "hsl(var(--cad-toolbar-fg, 0 0% 90%))";
    ctx.strokeStyle = stroke;
    ctx.fillStyle = "rgba(160,160,200,0.22)";
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const poly = (pts: { x: number; y: number }[] | undefined, close: boolean, fill = false) => {
      if (!pts || pts.length < 2) return;
      ctx.beginPath();
      const p0 = tx(pts[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) { const p = tx(pts[i]); ctx.lineTo(p.x, p.y); }
      if (close) ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
    };

    for (const snap of geometry) {
      const d = snap.data as Record<string, never> & {
        a?: { x: number; y: number }; b?: { x: number; y: number };
        p1?: { x: number; y: number }; p2?: { x: number; y: number };
        points?: { x: number; y: number }[]; corners?: { x: number; y: number }[];
        holes?: { x: number; y: number }[][];
        center?: { x: number; y: number }; widthM?: number; heightM?: number;
      };
      if (snap.kind === "segment") poly([d.a!, d.b!], false);
      else if (snap.kind === "hatch") {
        poly(d.points, true, true);
        for (const loop of d.holes || []) poly(loop, true);
      } else if (snap.kind === "wall") poly(d.corners, false);
      else if (snap.kind === "freeStroke") poly(d.points, false);
      else if (snap.kind === "dimension") poly([d.p1!, d.p2!], false);
      else if (snap.kind === "textBox" || snap.kind === "table") {
        const c = d.center || { x: 0, y: 0 };
        const w2 = (d.widthM || 0.2) / 2, h2 = (d.heightM || 0.2) / 2;
        poly([
          { x: c.x - w2, y: c.y - h2 },
          { x: c.x + w2, y: c.y - h2 },
          { x: c.x + w2, y: c.y + h2 },
          { x: c.x - w2, y: c.y + h2 },
        ], true);
      }
    }
  }, [geometry, size]);

  return (
    <canvas
      ref={ref}
      title={title}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
