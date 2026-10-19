/**
 * Virtueller Joystick (Tablet): Ziehen des Knopfes liefert −1…1 je Achse, Loslassen = 0.
 * Der beschriftete Griff unter der Rundung verschiebt nur den Joystick selbst;
 * die Position wird lokal je Joystick gespeichert (nie Projekt/Cloud).
 */
import { useEffect, useRef, useState } from "react";

const SIZE = 112, KNOB = 44, GRIP_H = 22;
const TOTAL_H = SIZE + GRIP_H - 6;

function clampPos(p: { x: number; y: number }) {
  const w = window.innerWidth, h = window.innerHeight, m = 8;
  return { x: Math.min(Math.max(m, p.x), Math.max(m, w - SIZE - m)), y: Math.min(Math.max(m, p.y), Math.max(m, h - TOTAL_H - m)) };
}

export function Joystick3D({ label, storageKey, defaultPos, onChange }: {
  label: string; storageKey: string; defaultPos: () => { x: number; y: number }; onChange: (x: number, y: number) => void;
}) {
  const max = (SIZE - KNOB) / 2;
  const [p, setP] = useState({ x: 0, y: 0 });
  const [pos, setPos] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || "null"); if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) return clampPos(s); } catch {}
    return clampPos(defaultPos());
  });
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(pos)); } catch {} }, [pos, storageKey]);
  useEffect(() => { const r = () => setPos(q => clampPos(q)); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, []);

  const center = useRef({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const update = (cx: number, cy: number) => {
    let dx = cx - center.current.x, dy = cy - center.current.y;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    setP({ x: dx, y: dy });
    onChange(dx / max, dy / max);
  };
  const end = () => { id.current = null; setP({ x: 0, y: 0 }); onChange(0, 0); };

  return (
    <div className="fixed z-[60] select-none" style={{ left: pos.x, top: pos.y, width: SIZE, height: TOTAL_H, touchAction: "none" }}>
      <div
        className="relative rounded-full border shadow-sm"
        style={{ width: SIZE, height: SIZE, background: "hsl(var(--surface-card) / 0.92)", borderColor: "hsl(var(--hairline))", touchAction: "none" }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (id.current === e.pointerId) update(e.clientX, e.clientY); }}
        onPointerUp={end} onPointerCancel={end}
        aria-label={label}
      >
        <div className="absolute rounded-full border"
          style={{ width: KNOB, height: KNOB, left: SIZE / 2 - KNOB / 2 + p.x, top: SIZE / 2 - KNOB / 2 + p.y,
            background: "hsl(var(--accent-gold))", borderColor: "hsl(var(--hairline))", pointerEvents: "none" }} />
      </div>
      {/* Griff: folgt der Rundung unten, verschiebt nur den Joystick */}
      <div
        role="button" aria-label={`${label} verschieben`} title="Ziehen zum Verschieben"
        className="absolute left-1/2 -translate-x-1/2 grid place-items-center border text-[10px] font-semibold cursor-grab active:cursor-grabbing"
        style={{
          top: SIZE - 6, width: 64, height: GRIP_H, borderRadius: "0 0 32px 32px / 0 0 18px 18px",
          background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))", touchAction: "none",
        }}
        onPointerDown={(e) => {
          e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        onPointerMove={(e) => { const d = drag.current; if (d && d.id === e.pointerId) setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy })); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      >
        {label}
      </div>
    </div>
  );
}
