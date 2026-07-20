import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Animated futuristic background — flowing gradient mesh + drifting particles
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
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Particles
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

      // Base dark gradient
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "#0a0e1a");
      bg.addColorStop(1, "#111827");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Flowing orbs
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

      // Grid overlay
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

      // Particles
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Auth-Vorbereitung — noch keine echte Prüfung.
    try {
      sessionStorage.setItem("pixuna.loggedIn", "1");
    } catch {}
    navigate("/", { replace: true });
  };

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ background: "hsl(var(--surface))" }}
    >
      {/* Left: Login panel */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: 380,
          background: "hsl(var(--surface-card))",
          borderRight: "1px solid hsl(var(--hairline))",
        }}
      >
        {/* Brand */}
        <div className="px-10 pt-10 pb-8">
          <div
            className="tracking-tight leading-none select-none"
            style={{
              fontFamily:
                "'Space Grotesk', 'Inter', system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 30,
              letterSpacing: "-0.02em",
              color: "hsl(var(--ink))",
            }}
          >
            Pixuna
            <span style={{ color: "hsl(var(--accent-gold))" }}>CAD</span>
          </div>
          <div
            className="mt-1 text-[11px] uppercase tracking-[0.22em]"
            style={{ color: "hsl(var(--ink-soft))" }}
          >
            Architektur · CAD
          </div>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="flex-1 flex flex-col px-10">
          <div className="space-y-3">
            <Field
              label="Benutzername"
              value={username}
              onChange={setUsername}
              type="text"
              autoComplete="username"
            />
            <Field
              label="Passwort"
              value={password}
              onChange={setPassword}
              type="password"
              autoComplete="current-password"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border cursor-pointer"
              style={{ accentColor: "hsl(var(--accent-gold))" }}
            />
            <label
              htmlFor="remember"
              className="text-[12px] cursor-pointer"
              style={{ color: "hsl(var(--ink-soft))" }}
            >
              Angemeldet bleiben
            </label>
          </div>

          <div className="mt-5">
            <button
              type="submit"
              className="h-11 w-11 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
              style={{
                background: "hsl(var(--ink))",
                color: "hsl(var(--surface))",
                boxShadow: "0 8px 24px -8px hsl(var(--ink) / 0.35)",
              }}
              title="Einloggen"
              aria-label="Einloggen"
            >
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-1.5">
            <button
              type="button"
              className="text-[11px] uppercase tracking-[0.18em] text-left hover:opacity-70 transition-opacity"
              style={{ color: "hsl(var(--ink-soft))" }}
            >
              Probleme beim Anmelden?
            </button>
            <button
              type="button"
              className="text-[11px] uppercase tracking-[0.18em] text-left hover:opacity-70 transition-opacity"
              style={{ color: "hsl(var(--ink-soft))" }}
            >
              Konto erstellen
            </button>
          </div>

          <div className="flex-1" />
          <div
            className="pb-6 text-[10px] uppercase tracking-[0.2em]"
            style={{ color: "hsl(var(--ink-soft))", opacity: 0.6 }}
          >
            © PixunaCAD
          </div>
        </form>
      </div>

      {/* Right: Animated background */}
      <div className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div className="absolute top-6 left-8 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "hsl(var(--accent-gold))", boxShadow: "0 0 12px hsl(var(--accent-gold))" }}
          />
          <span
            className="text-[11px] uppercase tracking-[0.22em]"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            Willkommen zurück
          </span>
        </div>
        <div className="absolute bottom-8 right-8 text-right">
          <div
            className="text-[10px] uppercase tracking-[0.28em]"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Build 2026.07
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete?: string;
}) {
  return (
    <div
      className="rounded-md px-3 pt-2 pb-1.5 transition-colors focus-within:ring-2"
      style={{
        background: "hsl(var(--surface-muted))",
        border: "1px solid hsl(var(--hairline))",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "hsl(var(--ink-soft))" }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full bg-transparent outline-none text-sm py-0.5"
        style={{ color: "hsl(var(--ink))" }}
      />
    </div>
  );
}
