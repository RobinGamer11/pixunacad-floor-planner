import { useEffect, useRef } from "react";

/**
 * Bewegter Hintergrund (Farbverlauf, treibende Orbs, Raster, Partikel).
 * Wird sowohl auf der Anmeldeseite als auch auf der Hauptseite verwendet,
 * damit beide Oberflächen dieselbe Optik zeigen.
 */
export function AuroraBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const N = 55;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00025,
      vy: (Math.random() - 0.5) * 0.00025,
      r: Math.random() * 1.6 + 0.4,
    }));

    let t = 0;
    const render = () => {
      t += 0.004;

      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#0a0e1a");
      bg.addColorStop(1, "#111827");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const orbs = [
        { x: 0.3 + Math.sin(t * 0.9) * 0.25, y: 0.4 + Math.cos(t * 0.7) * 0.25, c: "rgba(79,110,255,0.55)", r: 0.55 },
        { x: 0.7 + Math.cos(t * 0.6) * 0.3, y: 0.6 + Math.sin(t * 0.8) * 0.25, c: "rgba(217,163,74,0.35)", r: 0.6 },
        { x: 0.5 + Math.sin(t * 1.1) * 0.2, y: 0.3 + Math.cos(t * 1.3) * 0.2, c: "rgba(120,180,255,0.4)", r: 0.5 },
      ];
      ctx.globalCompositeOperation = "lighter";
      for (const o of orbs) {
        const cx = o.x * w;
        const cy = o.y * h;
        const rr = Math.max(w, h) * o.r;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, o.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = "source-over";

      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      const step = 60;
      const off = (t * 20) % step;
      for (let x = -off; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = -off; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(200,220,255,0.85)";
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className ?? "absolute inset-0 h-full w-full"} />;
}

export default AuroraBackground;
