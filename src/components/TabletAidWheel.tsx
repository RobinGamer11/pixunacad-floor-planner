import React, { useEffect, useRef, useState } from "react";
import { MousePointer2, ArrowBigUp, Trash2 } from "lucide-react";
import {
  virtualMouseClick,
  virtualMouseHold,
  virtualKeyPress,
  virtualKeyHold,
} from "@/lib/virtualInput";

/**
 * Tablet-Hilfsrad: kreisförmiges Widget mit 5 Knöpfen (LMB, RMB, SHIFT, ESC, ENTF).
 * - Tap = einmaliger Event.
 * - Long-Press / Halten = Modifier bzw. Maustaste sticky gedrückt halten.
 * - Rand des Rades ist ein Griff — an ihm kann das Rad verschoben werden.
 * Position wird in localStorage gespeichert.
 */
export function TabletAidWheel() {
  const STORAGE_KEY = "pixuna.tabletAid.pos";
  const size = 190;
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 16, y: Math.max(80, (typeof window !== "undefined" ? window.innerHeight : 800) - size - 24) };
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
  }, [pos]);

  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number; pointerId: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y, pointerId: e.pointerId };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const nx = Math.max(0, Math.min(window.innerWidth - size, d.ox + (e.clientX - d.startX)));
    const ny = Math.max(0, Math.min(window.innerHeight - size, d.oy + (e.clientY - d.startY)));
    setPos({ x: nx, y: ny });
  };
  const onDragEnd = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    dragRef.current = null;
  };

  return (
    <div
      className="fixed z-[60] select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: size,
        height: size,
        touchAction: "none",
      }}
    >
      {/* Rand = Drag-Griff */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        className="absolute inset-0 rounded-full"
        style={{
          border: "2px solid hsl(var(--accent-gold))",
          background: "hsla(var(--surface-card), 0.92)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          backdropFilter: "blur(6px)",
          cursor: "grab",
        }}
      />
      {/* Zentraler Label */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] uppercase tracking-widest pointer-events-none"
        style={{ color: "hsl(var(--ink-soft))" }}
      >
        Tablet
      </div>

      {/* 5 Buttons kreisförmig */}
      <WheelButton angle={-90} size={size} label="LMB" tooltip="Linke Maustaste (Tap = Klick, Halten = gedrückt halten)"
        onTap={() => virtualMouseClick(0)}
        onHold={(on) => virtualMouseHold(0, on)}
        icon={<MousePointer2 size={16} />} />
      <WheelButton angle={-18} size={size} label="RMB" tooltip="Rechte Maustaste"
        onTap={() => virtualMouseClick(2)}
        onHold={(on) => virtualMouseHold(2, on)}
        icon={<MousePointer2 size={16} style={{ transform: "scaleX(-1)" }} />} />
      <WheelButton angle={54} size={size} label="ENTF" tooltip="Entf-Taste"
        onTap={() => virtualKeyPress("Delete")}
        icon={<Trash2 size={16} />} />
      <WheelButton angle={126} size={size} label="ESC" tooltip="Esc-Taste"
        onTap={() => virtualKeyPress("Escape")}
        icon={<span className="text-[10px] font-bold">ESC</span>} />
      <WheelButton angle={198} size={size} label="SHIFT" tooltip="Shift halten (2-Hand-Bedienung)"
        onHold={(on) => virtualKeyHold("Shift", on)}
        toggleHold
        icon={<ArrowBigUp size={16} />} />
    </div>
  );
}

function WheelButton({
  angle, size, label, tooltip, icon, onTap, onHold, toggleHold,
}: {
  angle: number;
  size: number;
  label: string;
  tooltip: string;
  icon: React.ReactNode;
  onTap?: () => void;
  onHold?: (on: boolean) => void;
  /** Wenn true: Tap togglet dauerhaft an/aus (statt Tap+Long-Press). */
  toggleHold?: boolean;
}) {
  const r = size / 2 - 26;
  const rad = (angle * Math.PI) / 180;
  const cx = size / 2 + Math.cos(rad) * r - 22;
  const cy = size / 2 + Math.sin(rad) * r - 22;
  const [active, setActive] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const isHeld = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (toggleHold) return;
    // Long-Press erkennen (250ms).
    holdTimer.current = window.setTimeout(() => {
      if (onHold) {
        isHeld.current = true;
        setActive(true);
        onHold(true);
      }
    }, 250);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (toggleHold) {
      const next = !active;
      setActive(next);
      onHold?.(next);
      return;
    }
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (isHeld.current) {
      isHeld.current = false;
      setActive(false);
      onHold?.(false);
    } else {
      onTap?.();
    }
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (isHeld.current) {
      isHeld.current = false;
      setActive(false);
      onHold?.(false);
    }
  };

  return (
    <button
      title={tooltip}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="absolute h-11 w-11 rounded-full flex flex-col items-center justify-center gap-0.5 text-[9px] font-semibold border transition-colors"
      style={{
        left: cx,
        top: cy,
        borderColor: "hsl(var(--hairline))",
        background: active ? "hsl(var(--accent-gold))" : "hsl(var(--surface))",
        color: active ? "hsl(var(--surface))" : "hsl(var(--ink))",
        touchAction: "none",
      }}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}
