/** Virtueller Joystick (Tablet): Ziehen des Knopfes liefert −1…1 je Achse, Loslassen = 0. */
import { useRef, useState } from "react";

export function Joystick3D({ label, onChange }: { label: string; onChange: (x: number, y: number) => void }) {
  const size = 112, knob = 44, max = (size - knob) / 2;
  const [p, setP] = useState({ x: 0, y: 0 });
  const center = useRef({ x: 0, y: 0 });
  const id = useRef<number | null>(null);
  const update = (cx: number, cy: number) => {
    let dx = cx - center.current.x, dy = cy - center.current.y;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    setP({ x: dx, y: dy });
    onChange(dx / max, dy / max);
  };
  const end = () => { id.current = null; setP({ x: 0, y: 0 }); onChange(0, 0); };
  return (
    <div className="flex flex-col items-center gap-1 select-none" style={{ touchAction: "none" }}>
      <div
        className="relative rounded-full border shadow-sm"
        style={{ width: size, height: size, background: "hsl(var(--surface-card) / 0.92)", borderColor: "hsl(var(--hairline))", touchAction: "none" }}
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
          style={{ width: knob, height: knob, left: size / 2 - knob / 2 + p.x, top: size / 2 - knob / 2 + p.y,
            background: "hsl(var(--accent-gold))", borderColor: "hsl(var(--hairline))", pointerEvents: "none" }} />
      </div>
      <span className="text-[10px] font-medium" style={{ color: "hsl(var(--ink-soft))" }}>{label}</span>
    </div>
  );
}
