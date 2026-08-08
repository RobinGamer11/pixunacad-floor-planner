import React, { useEffect, useRef, useState } from "react";
import { MousePointer2, ArrowBigUp, Trash2, CornerDownLeft, Pencil } from "lucide-react";
import {
  virtualMouseClick,
  virtualMouseHold,
  virtualKeyPress,
  virtualKeyHold,
  virtualTypeChar,
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

  // Solange das Rad sichtbar ist: Tablet-Commit-Gate aktivieren, damit reale
  // Stift-/Finger-Kontakte in Zeichenwerkzeugen NICHT sofort einen Punkt setzen.
  // Der Commit erfolgt erst über den LMB- oder ENTER-Knopf am Rad.
  useEffect(() => {
    (window as any).__pixunaTabletCommit = true;
    return () => { (window as any).__pixunaTabletCommit = false; };
  }, []);

  // Zentrale Verteilung aller realen Kontakte an die Rad-Knöpfe (iPadOS-fest).
  useWheelTouchRouter();

  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number; pointerId: number } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
      data-tablet-aid="true"
      className="fixed select-none"
      onPointerDownCapture={(e) => { e.preventDefault(); }}
      onPointerMoveCapture={(e) => { e.preventDefault(); }}
      onPointerUpCapture={(e) => { e.preventDefault(); }}
      onMouseDownCapture={(e) => { e.preventDefault(); }}
      onTouchStartCapture={(e) => { e.preventDefault(); }}
      onTouchMoveCapture={(e) => { e.preventDefault(); }}
      style={{
        left: pos.x,
        top: pos.y,
        width: size,
        height: size,
        touchAction: "none",
        // Immer im Vordergrund — über Panels, Hubs, Dialogen und Overlays.
        zIndex: 2147483000,
        pointerEvents: "auto",
        isolation: "isolate",
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
      {/* Zentrum: TABLET-Label + Toggles für Stift-Modus und Zoom-Sperre */}
      <CenterToggles />


      {/* 6 Buttons kreisförmig (60°-Schritte) */}
      <WheelButton angle={-90} size={size} label="LMB" tooltip="Linke Maustaste (Tap = Klick, Halten = gedrückt halten)"
        onTap={() => virtualMouseClick(0)}
        onHold={(on) => virtualMouseHold(0, on)}
        icon={<MousePointer2 size={16} />} />
      <WheelButton angle={-30} size={size} label="RMB" tooltip="Rechte Maustaste"
        onTap={() => virtualMouseClick(2)}
        onHold={(on) => virtualMouseHold(2, on)}
        icon={<MousePointer2 size={16} style={{ transform: "scaleX(-1)" }} />} />
      <WheelButton angle={30} size={size} label="ENTF" tooltip="Entf-Taste"
        onTap={() => virtualKeyPress("Delete")}
        icon={<Trash2 size={16} />} />
      <WheelButton angle={90} size={size} label="ENTER" tooltip="Bestätigen: setzt Punkt am Cursor (bzw. Enter-Taste in Eingabefeldern)"
        onTap={() => {
          const el = document.activeElement as HTMLElement | null;
          const inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as any).isContentEditable);
          if (inField) virtualKeyPress("Enter", el);
          else virtualMouseClick(0);
        }}
        icon={<CornerDownLeft size={16} />} />
      <WheelButton angle={150} size={size} label="ESC" tooltip="Esc-Taste"
        onTap={() => virtualKeyPress("Escape")}
        icon={<span className="text-[10px] font-bold">ESC</span>} />
      <WheelButton angle={210} size={size} label="SHIFT" tooltip="Shift halten (2-Hand-Bedienung)"
        onHold={(on) => virtualKeyHold("Shift", on)}
        toggleHold
        icon={<ArrowBigUp size={16} />} />
      {/* Ziffernblock: erscheint, sobald ein Textfeld fokussiert ist. */}
      <NumberPad wheelPos={pos} wheelSize={size} />
    </div>
  );
}

function CenterToggles() {
  const [penOnly, setPenOnly] = useState<boolean>(() => {
    try { return localStorage.getItem("pixuna.penOnly") === "1"; } catch { return false; }
  });
  useEffect(() => {
    (window as any).__pixunaPenOnly = penOnly;
    try { localStorage.setItem("pixuna.penOnly", penOnly ? "1" : "0"); } catch {}
  }, [penOnly]);
  useEffect(() => {
    return () => {
      (window as any).__pixunaPenOnly = false;
      (window as any).__pixunaZoomLock = false;
    };
  }, []);


  const btn = (active: boolean): React.CSSProperties => ({
    width: 46,
    height: 22,
    borderRadius: 6,
    fontSize: 9,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    border: "1px solid hsl(var(--hairline))",
    background: active ? "hsl(var(--accent-gold))" : "hsl(var(--surface))",
    color: active ? "hsl(var(--surface))" : "hsl(var(--ink))",
    cursor: "pointer",
  });

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1">
      <div className="text-[10px] uppercase tracking-widest pointer-events-none" style={{ color: "hsl(var(--ink-soft))" }}>
        Tablet
      </div>
      <button
        type="button"
        title="Stift-Modus: nur Stift zeichnet, Finger = pan/zoom/auswählen"
        tabIndex={-1}
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPenOnly((v) => !v); }}
        style={btn(penOnly)}
      >
        <Pencil size={11} />
        Stift
      </button>
    </div>
  );
}


function NumberPad({ wheelPos, wheelSize }: { wheelPos: { x: number; y: number }; wheelSize: number }) {
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("pixuna.numpadCollapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pixuna.numpadCollapsed", collapsed ? "1" : "0"); } catch {}
  }, [collapsed]);
  const lastInputRef = useRef<HTMLElement | null>(null);

  // Solange Rad aktiv: bei allen INPUT/TEXTAREA `inputmode="none"` setzen,
  // damit auf iPad KEINE OS-Tastatur aufgeht.
  useEffect(() => {
    const prev = new WeakMap<HTMLElement, string | null>();
    const patch = (el: HTMLElement) => {
      if (prev.has(el)) return;
      prev.set(el, el.getAttribute("inputmode"));
      el.setAttribute("inputmode", "none");
    };
    const onFocusInGlobal = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") patch(t);
    };
    document.querySelectorAll<HTMLElement>("input, textarea").forEach(patch);
    document.addEventListener("focusin", onFocusInGlobal);
    return () => {
      document.removeEventListener("focusin", onFocusInGlobal);
      document.querySelectorAll<HTMLElement>("input, textarea").forEach((el) => {
        if (!prev.has(el)) return;
        const p = prev.get(el);
        if (p == null) el.removeAttribute("inputmode");
        else el.setAttribute("inputmode", p);
      });
    };
  }, []);

  useEffect(() => {
    const isField = (el: Element | null): el is HTMLElement =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element | null;
      if (isField(t)) {
        lastInputRef.current = t;
        setVisible(true);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Element | null;
      if (next?.closest('[data-tablet-aid="true"]')) return;
      // Delay: iOS lässt den Fokus beim Tippen auf virtuelle Buttons kurz los.
      setTimeout(() => {
        const active = document.activeElement;
        const remembered = lastInputRef.current;
        if (remembered?.isConnected) {
          setVisible(true);
          return;
        }
        if (!isField(active)) {
          setVisible(false);
          lastInputRef.current = null;
        }
      }, 60);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  if (!visible) return null;

  const keys = ["1","2","3","4","5","6","7","8","9",",","0","⌫"];
  const padWidth = collapsed ? 64 : 156;
  const padHeight = collapsed ? 40 : 220;
  let left = wheelSize / 2 - padWidth / 2;
  let top = wheelSize + 8;
  if (typeof window !== "undefined" && wheelPos.y + wheelSize + padHeight + 16 > window.innerHeight) {
    top = -(padHeight + 8);
  }
  const press = (k: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Focus zurück auf letztes Eingabefeld, damit virtualTypeChar/Backspace es trifft.
    const el = lastInputRef.current;
    if (el && document.activeElement !== el) {
      try { (el as HTMLInputElement).focus({ preventScroll: true }); } catch { el.focus(); }
    }
    if (k === "⌫") virtualKeyPress("Backspace", el);
    else virtualTypeChar(k, el);
  };

  return (
    <div
      className="absolute z-[61] rounded-xl p-2 select-none"
      style={{
        left, top, width: padWidth,
        background: "hsla(var(--surface-card), 0.96)",
        border: "1px solid hsl(var(--hairline))",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        backdropFilter: "blur(6px)",
        touchAction: "none",
      }}
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="flex justify-end mb-1">
        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setCollapsed((v) => !v); }}
          className="h-6 px-2 rounded text-[10px] font-semibold border"
          style={{
            borderColor: "hsl(var(--hairline))",
            background: "hsl(var(--surface))",
            color: "hsl(var(--ink))",
          }}
          title={collapsed ? "Zahlenfeld ausklappen" : "Zahlenfeld einklappen"}
        >
          {collapsed ? "123 ▸" : "▾"}
        </button>
      </div>
      {!collapsed && (
        <div className="grid grid-cols-3 gap-1.5">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              tabIndex={-1}
              onPointerDown={press(k)}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="h-10 rounded-md text-sm font-semibold border"
              style={{
                borderColor: "hsl(var(--hairline))",
                background: "hsl(var(--surface))",
                color: "hsl(var(--ink))",
                touchAction: "none",
              }}
            >
              {k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * Globale Registry aller Rad-Knöpfe.
 *
 * Hintergrund (iPadOS): Sobald der Stift auf dem Canvas zeichnet, hält dieses
 * Element einen Pointer-Capture und Safari liefert weitere Kontakte teils
 * umgeleitet oder gar nicht mehr an die eigentlichen Ziel-Elemente. Deshalb
 * werden alle Rad-Knöpfe zentral über Capture-Phase-Listener auf `window`
 * per Koordinaten-Hittest bedient — das funktioniert auch bei aktivem
 * Pointer-Capture eines anderen Elements und bei beliebig vielen parallelen
 * Kontakten (Stift + Finger).
 */
type BtnHandle = {
  getRect: () => DOMRect | null;
  begin: () => void;
  end: () => void;
  cancel: () => void;
};
const WHEEL_BUTTONS = new Set<BtnHandle>();

function hitButton(x: number, y: number): BtnHandle | null {
  for (const h of WHEEL_BUTTONS) {
    const r = h.getRect();
    if (!r || r.width === 0) continue;
    // Kleine Toleranz für Finger-Treffer.
    if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) return h;
  }
  return null;
}

/** Verteilt alle realen Kontakte per Koordinaten-Hittest an die Rad-Knöpfe. */
function useWheelTouchRouter() {
  useEffect(() => {
    const active = new Map<number | string, BtnHandle>();
    const recentHits: { t: number; x: number; y: number }[] = [];

    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
    };

    const onPointerDown = (e: PointerEvent) => {
      if ((e as any).__virtual) return;
      const h = hitButton(e.clientX, e.clientY);
      if (!h) return;
      stop(e);
      active.set(e.pointerId, h);
      recentHits.push({ t: Date.now(), x: e.clientX, y: e.clientY });
      h.begin();
    };
    const onPointerUp = (e: PointerEvent) => {
      const h = active.get(e.pointerId);
      if (!h) return;
      stop(e);
      active.delete(e.pointerId);
      h.end();
    };
    const onPointerCancel = (e: PointerEvent) => {
      const h = active.get(e.pointerId);
      if (!h) return;
      active.delete(e.pointerId);
      h.cancel();
    };

    // Touch-Fallback: iPadOS unterdrückt während eines aktiven Stiftkontakts
    // gelegentlich Pointer-Events für zusätzliche Finger.
    const wasRecent = (x: number, y: number) =>
      recentHits.some((r) => Date.now() - r.t < 500 && Math.hypot(r.x - x, r.y - y) < 40);

    const onTouchStart = (e: TouchEvent) => {
      let handled = false;
      for (const t of Array.from(e.changedTouches)) {
        if (wasRecent(t.clientX, t.clientY)) { handled = true; continue; }
        const h = hitButton(t.clientX, t.clientY);
        if (!h) continue;
        handled = true;
        active.set(`t${t.identifier}`, h);
        h.begin();
      }
      if (handled) stop(e);
    };
    const onTouchEnd = (e: TouchEvent) => {
      let handled = false;
      for (const t of Array.from(e.changedTouches)) {
        const h = active.get(`t${t.identifier}`);
        if (!h) continue;
        handled = true;
        active.delete(`t${t.identifier}`);
        h.end();
      }
      if (handled) stop(e);
    };
    const onTouchCancel = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const h = active.get(`t${t.identifier}`);
        if (!h) continue;
        active.delete(`t${t.identifier}`);
        h.cancel();
      }
    };

    const opts = { capture: true, passive: false } as AddEventListenerOptions;
    window.addEventListener("pointerdown", onPointerDown, opts);
    window.addEventListener("pointerup", onPointerUp, opts);
    window.addEventListener("pointercancel", onPointerCancel, opts);
    window.addEventListener("touchstart", onTouchStart, opts);
    window.addEventListener("touchend", onTouchEnd, opts);
    window.addEventListener("touchcancel", onTouchCancel, opts);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, opts);
      window.removeEventListener("pointerup", onPointerUp, opts);
      window.removeEventListener("pointercancel", onPointerCancel, opts);
      window.removeEventListener("touchstart", onTouchStart, opts);
      window.removeEventListener("touchend", onTouchEnd, opts);
      window.removeEventListener("touchcancel", onTouchCancel, opts);
      for (const h of active.values()) h.cancel();
      active.clear();
    };
  }, []);
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
  const activeRef = useRef(false);
  activeRef.current = active;
  const elRef = useRef<HTMLButtonElement | null>(null);
  const holdTimer = useRef<number | null>(null);
  const isHeld = useRef(false);

  // Callbacks stabil halten, damit die Registry-Registrierung nur einmal läuft.
  const cbs = useRef({ onTap, onHold, toggleHold });
  cbs.current = { onTap, onHold, toggleHold };

  useEffect(() => {
    const handle: BtnHandle = {
      getRect: () => elRef.current?.getBoundingClientRect() ?? null,
      begin: () => {
        if (cbs.current.toggleHold) return;
        if (holdTimer.current) clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(() => {
          if (cbs.current.onHold) {
            isHeld.current = true;
            setActive(true);
            cbs.current.onHold(true);
          }
        }, 250);
      },
      end: () => {
        if (cbs.current.toggleHold) {
          const next = !activeRef.current;
          setActive(next);
          cbs.current.onHold?.(next);
          return;
        }
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        if (isHeld.current) {
          isHeld.current = false;
          setActive(false);
          cbs.current.onHold?.(false);
        } else {
          cbs.current.onTap?.();
        }
      },
      cancel: () => {
        if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
        if (isHeld.current) {
          isHeld.current = false;
          setActive(false);
          cbs.current.onHold?.(false);
        }
      },
    };
    WHEEL_BUTTONS.add(handle);
    return () => {
      WHEEL_BUTTONS.delete(handle);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  return (
    <button
      ref={elRef}
      title={tooltip}
      type="button"
      tabIndex={-1}
      // Reale Kontakte werden zentral über den Router (Capture-Phase) bedient.
      // Hier nur Defaults unterdrücken (Fokus-Verlust, iOS-Scroll, Ghost-Klicks).
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="absolute h-11 w-11 rounded-full flex flex-col items-center justify-center gap-0.5 text-[9px] font-semibold border transition-colors"
      style={{
        left: cx,
        top: cy,
        borderColor: "hsl(var(--hairline))",
        background: active ? "hsl(var(--accent-gold))" : "hsl(var(--surface))",
        color: active ? "hsl(var(--surface))" : "hsl(var(--ink))",
        touchAction: "none",
        pointerEvents: "auto",
        zIndex: 2,
      }}
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}


