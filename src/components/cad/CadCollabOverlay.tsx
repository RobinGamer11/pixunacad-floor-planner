/**
 * Dezente Live-Hinweise über der Zeichenfläche.
 *
 * Zeigt Zeiger anderer Personen auf demselben Blatt und eine zurückhaltende
 * farbige Kontur mit Namen für Objekte, die gerade jemand anderes bearbeitet.
 * Es wird ausschließlich gezeichnet – am CAD-Modell ändert sich nichts.
 */
import { useEffect, useRef } from "react";
import type { CadApp } from "@/cad/CadApp";
import type { CadCollabSession, CollabStatus } from "@/lib/cadCollab/session";

interface Props {
  app: CadApp | null;
  status: CollabStatus;
  session: { current: CadCollabSession | null };
}

/** Grobe Hülle eines Objekts aus seinen Koordinaten im gespeicherten Stand. */
function boundsOfJson(json: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let data: unknown;
  try { data = JSON.parse(json); } catch { return null; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    const obj = node as Record<string, unknown>;
    if (typeof obj.x === "number" && typeof obj.y === "number") {
      minX = Math.min(minX, obj.x); maxX = Math.max(maxX, obj.x);
      minY = Math.min(minY, obj.y); maxY = Math.max(maxY, obj.y);
    }
    for (const key of Object.keys(obj)) visit(obj[key]);
  };
  visit(data);
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

export function CadCollabOverlay({ app, status, session }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!app || !canvas) return;
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const host = app.canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx || !host) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.clearRect(0, 0, w, h);

      const state = statusRef.current;
      if (!state.connected) return;
      const sheetId = app.activeSheetId;

      // Fremde Bearbeitungsmarkierungen als zurückhaltende Kontur.
      for (const lock of state.locksByObject.values()) {
        if (lock.sheetId !== sheetId) continue;
        const json = session.current?.getObjectJson(sheetId, lock.objectId);
        if (!json) continue;
        const b = boundsOfJson(json);
        if (!b) continue;
        const a = app.camera.worldToScreen(b.minX, b.minY);
        const c = app.camera.worldToScreen(b.maxX, b.maxY);
        const x = Math.min(a.x, c.x) - 6;
        const y = Math.min(a.y, c.y) - 6;
        const bw = Math.abs(c.x - a.x) + 12;
        const bh = Math.abs(c.y - a.y) + 12;
        ctx.save();
        ctx.strokeStyle = lock.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x, y, bw, bh);
        ctx.setLineDash([]);
        ctx.font = "11px system-ui, sans-serif";
        const label = lock.displayName;
        const tw = ctx.measureText(label).width + 10;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = lock.color;
        ctx.fillRect(x, y - 17, tw, 16);
        ctx.fillStyle = "#0b1020";
        ctx.fillText(label, x + 5, y - 5);
        ctx.restore();
      }

      // Zeiger der Personen auf demselben Blatt.
      for (const peer of state.peers) {
        if (peer.sheetId !== sheetId || !peer.cursor) continue;
        const p = app.camera.worldToScreen(peer.cursor.x, peer.cursor.y);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = peer.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 9, p.y + 4);
        ctx.lineTo(p.x + 4, p.y + 9);
        ctx.closePath();
        ctx.fill();
        ctx.font = "11px system-ui, sans-serif";
        const tw = ctx.measureText(peer.displayName).width + 10;
        ctx.fillRect(p.x + 8, p.y + 8, tw, 15);
        ctx.fillStyle = "#0b1020";
        ctx.fillText(peer.displayName, p.x + 13, p.y + 19);
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [app, session]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden="true"
    />
  );
}
