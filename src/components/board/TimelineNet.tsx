import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, CalendarClock, FileText } from "lucide-react";
import {
  itemAchieved, effectiveStatusId, taskAlert,
  type TlItem, type TlCategory, type TlStatus, type TlKind,
} from "@/lib/timelineStore";

const ORANGE = "#e2703a";
const RED = "#ef4444";
const GREY = "#a19a92";
/** Blaues Aufleuchten für Einträge, die auf der Startseite bearbeitet wurden. */
export const FRESH_BLUE = "#4da3ff";
const CANVAS = "#141110";
const CANVAS_LINE = "#332c26";
const CANVAS_PANEL = "#1c1815";

function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }
function kindIcon(kind: TlKind, size = 12) {
  if (kind === "task") return <CheckSquare size={size} />;
  if (kind === "event") return <CalendarClock size={size} />;
  return <FileText size={size} />;
}

export function TimelineNet({
  projectName, items, categories, statuses, selectedId, onSelect, compact = false,
}: {
  projectName: string;
  items: TlItem[];
  categories: TlCategory[];
  statuses: TlStatus[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Kompakte, nicht interaktive Vorschau (Startseite). */
  compact?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [view, setView] = useState({ k: compact ? 0.55 : 1, tx: 0, ty: 0 });
  const viewRef = useRef(view); viewRef.current = view;
  const [hoverId, setHoverId] = useState<string | null>(null);
  const now = Date.now();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const cur = viewRef.current;
      const nk = clamp(cur.k * Math.exp(-e.deltaY * 0.0015), 0.3, 6);
      if (nk === cur.k) return;
      const ratio = nk / cur.k;
      setView({ k: nk, tx: px - (px - cur.tx) * ratio, ty: py - (py - cur.ty) * ratio });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef({ on: false, sx: 0, sy: 0 });

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const statusMap = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);

  /** Ring 1 = Kategorien, Ring 2 = deren Einträge. */
  const layout = useMemo(() => {
    const groups = categories
      .map((c) => ({ cat: c, its: items.filter((i) => i.categoryId === c.id) }))
      .filter((g) => g.its.length);
    const loose = items.filter((i) => !catMap.has(i.categoryId ?? ""));
    if (loose.length) {
      groups.push({ cat: { id: "__none__", label: "Ohne Kategorie", color: GREY }, its: loose });
    }
    const R1 = 190, R2 = 130;
    const nodes: {
      id: string; x: number; y: number; r: number; label: string; color: string;
      item?: TlItem; parent?: { x: number; y: number };
    }[] = [];
    groups.forEach((g, gi) => {
      const a = (gi / Math.max(1, groups.length)) * Math.PI * 2 - Math.PI / 2;
      const gx = Math.cos(a) * R1, gy = Math.sin(a) * R1;
      nodes.push({ id: `cat:${g.cat.id}`, x: gx, y: gy, r: 26, label: g.cat.label, color: g.cat.color });
      g.its.forEach((it, ii) => {
        const spread = Math.PI * 0.9;
        const f = g.its.length === 1 ? 0 : ii / (g.its.length - 1) - 0.5;
        const ang = a + f * spread;
        const dist = R2 + (ii % 3) * 34;
        nodes.push({
          id: it.id,
          x: gx + Math.cos(ang) * dist,
          y: gy + Math.sin(ang) * dist,
          r: 16,
          label: it.title,
          color: g.cat.color,
          item: it,
          parent: { x: gx, y: gy },
        });
      });
    });
    return { nodes, groups };
  }, [items, categories, catMap]);

  const cx = size.w / 2 + view.tx;
  const cy = size.h / 2 + view.ty;

  return (
    <div
      ref={wrap}
      className="relative w-full h-full overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{ background: CANVAS, touchAction: "none" }}
      onPointerDown={(e) => {
        drag.current = { on: true, sx: e.clientX - view.tx, sy: e.clientY - view.ty };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current.on) return;
        setView((v) => ({ ...v, tx: e.clientX - drag.current.sx, ty: e.clientY - drag.current.sy }));
      }}
      onPointerUp={(e) => {
        drag.current.on = false;
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      }}
    >
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <defs>
          <filter id="net-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g transform={`translate(${cx}, ${cy}) scale(${view.k})`}>
          {/* Verbindungen Wurzel → Kategorie → Eintrag */}
          {layout.nodes.map((n) =>
            n.parent ? (
              <line key={`e-${n.id}`} x1={n.parent.x} y1={n.parent.y} x2={n.x} y2={n.y}
                    stroke={CANVAS_LINE} strokeWidth={1} />
            ) : (
              <line key={`e-${n.id}`} x1={0} y1={0} x2={n.x} y2={n.y}
                    stroke="#4a423b" strokeWidth={1.2} />
            ),
          )}

          {/* Wurzel */}
          <circle r={44} fill={CANVAS_PANEL} stroke="#4a423b" strokeWidth={1.4} />
          <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#efe7de">
            {projectName.length > 12 ? `${projectName.slice(0, 11)}…` : projectName}
          </text>

          {layout.nodes.map((n) => {
            const it = n.item;
            const sel = it ? it.id === selectedId : false;
            const alert = it ? taskAlert(it, now) : false;
            const fresh = !!it?.fresh;
            const fill = it
              ? (fresh ? FRESH_BLUE : it.kind === "task" ? (alert ? RED : ORANGE) : itemAchieved(it, now) ? ORANGE : GREY)
              : CANVAS_PANEL;
            return (
              <g key={n.id}
                 style={{ cursor: it ? "pointer" : "default" }}
                 onPointerDown={(e) => e.stopPropagation()}
                 onClick={() => it && onSelect?.(it.id)}
                 onPointerEnter={() => setHoverId(n.id)}
                 onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}>
                {(hoverId === n.id || sel) && (
                  <circle cx={n.x} cy={n.y} r={n.r + 7} fill="none"
                          stroke={sel ? "#ffffff" : n.color} strokeOpacity={sel ? 0.9 : 0.45}
                          strokeDasharray="4 3" strokeWidth={1.2} />
                )}
                <circle cx={n.x} cy={n.y} r={n.r} fill={fill}
                        filter={alert || fresh ? "url(#net-glow)" : undefined}
                        stroke={fresh ? FRESH_BLUE : n.color} strokeWidth={fresh ? 2.4 : it ? 1.4 : 2.4}
                        opacity={it ? 0.95 : 1} />
                {it && (
                  <g transform={`translate(${n.x - 6}, ${n.y - 6})`} pointerEvents="none">
                    <foreignObject width={14} height={14}>
                      <div style={{ color: "#141110", lineHeight: 0 }}>{kindIcon(it.kind, 12)}</div>
                    </foreignObject>
                  </g>
                )}
                <text x={n.x} y={n.y + n.r + 13} textAnchor="middle" fontSize={it ? 10 : 11}
                      fontWeight={it ? 500 : 700}
                      fill={sel ? "#ffffff" : it ? "#cdc4bb" : "#efe7de"}>
                  {n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label}
                </text>
                {it && (
                  <text x={n.x} y={n.y + n.r + 25} textAnchor="middle" fontSize={9} fill="#8b837b">
                    {statusMap.get(effectiveStatusId(it, now))?.label ?? ""}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {!items.length && (
        <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "#6f665e" }}>
          Noch keine Einträge.
        </div>
      )}
    </div>
  );
}
