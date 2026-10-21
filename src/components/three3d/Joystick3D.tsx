/**
 * Virtueller Joystick (Tablet): Ziehen des Knopfes liefert −1…1 je Achse, Loslassen = 0.
 * Der beschriftete Griff unter der Rundung verschiebt nur den Joystick selbst;
 * die Position wird lokal je Joystick gespeichert (nie Projekt/Cloud).
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Move } from "lucide-react";


function clampPos(p: { x: number; y: number }, w0: number, h0: number) {
  const w = window.innerWidth, h = window.innerHeight, m = 8;
  return { x: Math.min(Math.max(m, p.x), Math.max(m, w - w0 - m)), y: Math.min(Math.max(m, p.y), Math.max(m, h - h0 - m)) };
}

export function Joystick3D({ label, storageKey, defaultPos, onChange, size = 112, onVertical }: {
  label: string; storageKey: string; defaultPos: () => { x: number; y: number }; onChange: (x: number, y: number) => void;
  size?: number;
  /** Optional: Hoch/Runter-Knöpfe rechts an der Rundung (Halten = bewegen). */
  onVertical?: (dir: "u" | "d", on: boolean) => void;
}) {
  // Alles (Griff, Hoch/Runter, Schrift, Symbole) skaliert mit der Joystick-Größe.
  const k = size / 112;
  const SIZE = size, KNOB = Math.round(size * 0.4);
  const GAP = Math.round(6 * k), VBW = Math.round(30 * k), GRIP_H = Math.round(34 * k), GRIP_W = Math.round(68 * k);
  const SIDE = onVertical ? GAP + VBW : 0;
  const W = SIZE + SIDE, H = SIZE + GRIP_H - 8;
  const max = (SIZE - KNOB) / 2;
  const [p, setP] = useState({ x: 0, y: 0 });
  const [pos, setPos] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(storageKey) || "null"); if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) return clampPos(s, W, H); } catch {}
    return clampPos(defaultPos(), W, H);
  });
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(pos)); } catch {} }, [pos, storageKey]);
  useEffect(() => { setPos(q => clampPos(q, W, H)); const r = () => setPos(q => clampPos(q, W, H)); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, [W, H]);

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
  // Nur der eigene Kontakt beendet den Joystick (andere Finger stören nicht).
  const end = (e: React.PointerEvent) => { if (id.current !== e.pointerId) return; id.current = null; setP({ x: 0, y: 0 }); onChange(0, 0); };
  const surface = { background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink))", touchAction: "none" as const };

  const vBtn = (dir: "u" | "d") => (
    <button type="button" aria-label={dir === "u" ? "Hoch" : "Runter"} title={dir === "u" ? "Hoch (Space)" : "Runter (X)"}
      className="grid place-items-center border select-none"
      style={{ ...surface, width: VBW, height: SIZE / 2 - 6 * k,
        borderRadius: dir === "u" ? "0 22px 6px 0 / 0 40px 6px 0" : "0 6px 22px 0 / 0 6px 40px 0" }}
      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); onVertical?.(dir, true); }}
      onPointerUp={() => onVertical?.(dir, false)} onPointerCancel={() => onVertical?.(dir, false)}
      onLostPointerCapture={() => onVertical?.(dir, false)}>
      {dir === "u" ? <ChevronUp size={Math.round(16 * k)} /> : <ChevronDown size={Math.round(16 * k)} />}
    </button>
  );

  return (
    <div className="fixed z-[60] select-none" style={{ left: pos.x, top: pos.y, width: W, height: H, touchAction: "none" }}>
      <div
        className="relative rounded-full border shadow-sm"
        style={{ width: SIZE, height: SIZE, background: "hsl(var(--surface-card) / 0.92)", borderColor: "hsl(var(--hairline))", touchAction: "none" }}
        onPointerDown={(e) => {
          if (id.current !== null) return;
          const r = e.currentTarget.getBoundingClientRect();
          center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          id.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => { if (id.current === e.pointerId) update(e.clientX, e.clientY); }}
        onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        aria-label={label}
      >
        <div className="absolute rounded-full border"
          style={{ width: KNOB, height: KNOB, left: SIZE / 2 - KNOB / 2 + p.x, top: SIZE / 2 - KNOB / 2 + p.y,
            background: "hsl(var(--accent-gold))", borderColor: "hsl(var(--hairline))", pointerEvents: "none" }} />
      </div>
      {onVertical && (
        <div className="absolute flex flex-col" style={{ left: SIZE + GAP, top: 6 * k, gap: 4 * k }}>
          {vBtn("u")}{vBtn("d")}
        </div>
      )}
      {/* Griff: folgt der Rundung unten, verschiebt nur den Joystick */}
      <div
        role="button" aria-label={`${label} verschieben`} title="Ziehen zum Verschieben"
        className="absolute flex flex-col items-center justify-center gap-0.5 border font-semibold leading-none cursor-grab active:cursor-grabbing"
        style={{
          ...surface, left: SIZE / 2 - GRIP_W / 2, top: SIZE - 8 * k, width: GRIP_W, height: GRIP_H, fontSize: 10 * k, borderRadius: `0 0 ${GRIP_W / 2}px ${GRIP_W / 2}px / 0 0 ${24 * k}px ${24 * k}px`,
        }}
        onPointerDown={(e) => {
          e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { id: e.pointerId, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        onPointerMove={(e) => { const d = drag.current; if (d && d.id === e.pointerId) setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, W, H)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      >
        <span>{label}</span>
        <Move size={Math.round(11 * k)} strokeWidth={1.8} aria-hidden="true" />
      </div>
    </div>
  );
}
