/**
 * Klassischer Ansichtstrahl (dunkle Fläche, HEUTE-Marke, Kreise am Zeitstrahl)
 * als wiederverwendbare Komponente für die Organisation.
 *
 * Optik entspricht dem bekannten Ansichtstrahl aus dem Board; neu sind nur
 * Zoom (Mausrad zum Zeiger, zwei Finger) und Verschieben.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  itemStartMs, itemEndMs, itemAchieved, taskAlert, priorityRadius, type TlItem,
} from "@/lib/timelineStore";
import { FRESH_BLUE } from "./TimelineNet";

const ORANGE = "#e2703a";
const RED = "#ef4444";
const GREY = "#a19a92";
const CANVAS = "#141110";
const CANVAS_LINE = "#332c26";
const TIME_COLOR = "#3f9c6a";
const DAY = 86400000;

export interface RayTimeMark {
  id: string;
  label: string;
  from: number;
  to: number;
}

interface Props {
  items: TlItem[];
  categories: { id: string; color: string }[];
  times?: RayTimeMark[];
  height?: number;
  selectedItemId?: string | null;
  selectedTimeId?: string | null;
  onSelectItem?: (id: string) => void;
  onSelectTime?: (id: string) => void;
  /** Zähler: erhöht sich, wenn die Ansicht eingepasst werden soll. */
  fitSignal?: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function BoardRay({
  items, categories, times = [], height = 420,
  selectedItemId, selectedTimeId, onSelectItem, onSelectTime, fitSignal = 0,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [view, setView] = useState({ k: 1, tx: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const now = Date.now();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (fitSignal) setView({ k: 1, tx: 0 }); }, [fitSignal]);

  const catColor = useMemo(() => new Map(categories.map((c) => [c.id, c.color])), [categories]);

  const { d0, d1 } = useMemo(() => {
    const stamps: number[] = [];
    items.forEach((i) => { stamps.push(itemStartMs(i), itemEndMs(i)); });
    times.forEach((t) => { stamps.push(t.from, t.to); });
    if (!stamps.length) return { d0: now, d1: now + 10 * DAY };
    let a = Math.min(...stamps);
    let b = Math.max(...stamps);
    if (b - a < DAY) b = a + DAY;
    const pad = (b - a) * 0.08;
    return { d0: a - pad, d1: b + pad };
  }, [items, times, now]);

  const padX = 26;
  const baseW = Math.max(60, w - padX * 2);
  const xOf = useCallback(
    (t: number) => padX + ((t - d0) / (d1 - d0)) * baseW * view.k + view.tx,
    [d0, d1, baseW, view],
  );

  /* Mausrad zoomt zum Zeiger. */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const cur = viewRef.current;
      const nk = clamp(cur.k * Math.exp(-dy * 0.0015), 0.3, 40);
      if (nk === cur.k) return;
      const ratio = nk / cur.k;
      const o = px - padX;
      setView({ k: nk, tx: o - (o - cur.tx) * ratio });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* Ziehen (Maus, Finger) verschiebt die Ansicht. */
  const drag = useRef({ on: false, sx: 0 });
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if ((e.target as Element).closest?.("[data-ray-interactive]")) return;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: viewRef.current.k };
      drag.current.on = false;
      return;
    }
    drag.current = { on: true, sx: e.clientX - viewRef.current.tx };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setView((v) => ({ ...v, k: clamp(pinch.current!.k * (dist / pinch.current!.dist), 0.3, 40) }));
      return;
    }
    if (!drag.current.on) return;
    setView((v) => ({ ...v, tx: e.clientX - drag.current.sx }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current.on = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* egal */ }
  };

  const h = height;
  const axisY = h - 46;
  const nowX = xOf(now);
  const sorted = useMemo(() => [...items].sort((a, b) => itemStartMs(a) - itemStartMs(b)), [items]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView({ k: 1, tx: 0 })}
          className="h-8 px-2.5 rounded-md border text-[11px]"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          Ansicht einpassen
        </button>
        <span className="text-[11px] text-muted-foreground">
          Mausrad zoomt · Ziehen verschiebt · zwei Finger auf dem Tablet
        </span>
      </div>

      <div
        ref={wrap}
        className="relative w-full overflow-hidden rounded-xl select-none cursor-grab active:cursor-grabbing"
        style={{ height: h, background: CANVAS, border: `1px solid ${CANVAS_LINE}`, touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg width={w} height={h} className="absolute inset-0">
          <defs>
            <linearGradient id="ray-tl" gradientUnits="userSpaceOnUse"
              x1={nowX - Math.max(120, w * 0.22)} x2={nowX + Math.max(120, w * 0.22)} y1={0} y2={0}>
              <stop offset="0%" stopColor={ORANGE} />
              <stop offset="100%" stopColor={GREY} />
            </linearGradient>
            <filter id="ray-glow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <line x1={0} x2={w} y1={axisY} y2={axisY} stroke="#2b2724" strokeWidth={1} />

          {nowX > 0 && nowX < w && (
            <g>
              <line x1={nowX} x2={nowX} y1={16} y2={axisY} stroke="#5c534b" strokeWidth={1} />
              <text x={nowX + 6} y={26} fill="#8b837b" fontSize={10} letterSpacing={1.6}>HEUTE</text>
            </g>
          )}

          {sorted.map((i, idx) => {
            const x0 = xOf(itemStartMs(i));
            const x1 = xOf(itemEndMs(i));
            const r = Math.max(4, priorityRadius(undefined) * 0.5);
            const side = idx % 2 === 0 ? -1 : 1;
            const cyi = axisY - 92 + side * (18 + (idx % 5) * 26);
            const fresh = !!i.fresh;
            const alert = taskAlert(i, now);
            const active = selectedItemId === i.id;
            const fill = fresh ? FRESH_BLUE
              : alert ? RED
                : i.kind === "task" && !itemAchieved(i, now) ? GREY
                  : catColor.get(i.categoryId ?? "") ?? "url(#ray-tl)";
            return (
              <g key={i.id} data-ray-interactive style={{ cursor: "pointer" }}
                 onPointerDown={(e) => e.stopPropagation()}
                 onClick={() => onSelectItem?.(i.id)}>
                {x1 - x0 > 2 && <line x1={x0} x2={x1} y1={cyi} y2={cyi} stroke="#3a3430" strokeWidth={1.5} />}
                <line x1={x0} x2={x0} y1={cyi} y2={axisY} stroke="#2f2a26" strokeWidth={0.7} />
                <circle cx={x0} cy={cyi} r={active ? r + 2 : r} fill={fill}
                        stroke={active ? "#fff" : fresh ? FRESH_BLUE : "none"} strokeWidth={active ? 1.5 : fresh ? 1 : 0}
                        filter={fresh || alert ? "url(#ray-glow)" : undefined} />
                {x1 - x0 > 2 && <circle cx={x1} cy={cyi} r={r} fill={fill} opacity={0.85} />}
                <text x={x0 + r + 6} y={cyi + 4} fontSize={11} fill={active ? "#fff" : "#cdc4bb"}>
                  {(i.title || "Beitrag").slice(0, 28)}
                </text>
              </g>
            );
          })}

          {times.map((t) => {
            const x0 = xOf(t.from);
            const x1 = Math.max(x0 + 3, xOf(t.to));
            const active = selectedTimeId === t.id;
            return (
              <g key={`time-${t.id}`} data-ray-interactive style={{ cursor: "pointer" }}
                 onPointerDown={(e) => e.stopPropagation()}
                 onClick={() => onSelectTime?.(t.id)}>
                <rect x={x0} y={axisY + 8} width={x1 - x0} height={8} rx={4}
                      fill={TIME_COLOR} stroke={active ? "#fff" : "none"} strokeWidth={active ? 1.5 : 0}>
                  <title>{t.label}</title>
                </rect>
              </g>
            );
          })}

          {!sorted.length && !times.length && (
            <text x={w / 2} y={h / 2} textAnchor="middle" fill="#6f665e" fontSize={12}>
              Keine Beiträge im aktuellen Filter.
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
