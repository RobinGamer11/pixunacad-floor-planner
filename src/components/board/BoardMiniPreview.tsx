import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  useTimeline, getBoardSurface, itemStartMs, itemEndMs, itemAchieved, taskAlert,
  priorityRadius, type TlItem,
} from "@/lib/timelineStore";
import { TimelineNet, FRESH_BLUE } from "./TimelineNet";

const ORANGE = "#e2703a";
const RED = "#ef4444";
const GREY = "#a19a92";
const CANVAS = "#141110";
const CANVAS_LINE = "#332c26";
const DAY = 86400000;

/** Kompakter Ansichtstrahl für die Startseiten-Vorschau. */
function MiniRay({ items, categories }: { items: TlItem[]; categories: { id: string; color: string }[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const h = 200;
  const now = Date.now();

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const catColor = useMemo(() => new Map(categories.map((c) => [c.id, c.color])), [categories]);

  const { d0, d1 } = useMemo(() => {
    if (!items.length) return { d0: now, d1: now + 10 * DAY };
    let a = Infinity, b = -Infinity;
    items.forEach((i) => { a = Math.min(a, itemStartMs(i)); b = Math.max(b, itemEndMs(i)); });
    if (b - a < DAY) b = a + DAY;
    const pad = (b - a) * 0.08;
    return { d0: a - pad, d1: b + pad };
  }, [items, now]);

  const padX = 18;
  const xOf = (t: number) => padX + ((t - d0) / (d1 - d0)) * Math.max(40, w - padX * 2);
  const axisY = h - 34;
  const nowX = xOf(now);

  return (
    <div ref={wrap} className="w-full" style={{ height: h }}>
      <svg width={w} height={h}>
        <defs>
          <linearGradient id="mini-tl" gradientUnits="userSpaceOnUse" x1={nowX - w * 0.22} x2={nowX + w * 0.22} y1={0} y2={0}>
            <stop offset="0%" stopColor={ORANGE} />
            <stop offset="100%" stopColor={GREY} />
          </linearGradient>
          <filter id="mini-glow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line x1={0} x2={w} y1={axisY} y2={axisY} stroke="#2b2724" />
        {nowX > 0 && nowX < w && (
          <>
            <line x1={nowX} x2={nowX} y1={12} y2={axisY} stroke="#5c534b" />
            <text x={nowX + 5} y={20} fill="#8b837b" fontSize={8} letterSpacing={1.2}>HEUTE</text>
          </>
        )}
        {items.map((i, idx) => {
          const x0 = xOf(itemStartMs(i));
          const x1 = xOf(itemEndMs(i));
          const r = Math.max(3.5, priorityRadius(undefined) * 0.4);
          const side = idx % 2 === 0 ? -1 : 1;
          const dy = side * (14 + (idx % 4) * 15);
          const cy = axisY - 62 + dy;
          const fresh = !!i.fresh;
          const alert = taskAlert(i, now);
          const fill = fresh ? FRESH_BLUE
            : alert ? RED
            : i.kind === "task" && !itemAchieved(i, now) ? GREY
            : catColor.get(i.categoryId ?? "") ?? "url(#mini-tl)";
          return (
            <g key={i.id}>
              {x1 - x0 > 2 && (
                <line x1={x0} x2={x1} y1={cy} y2={cy} stroke="#3a3430" strokeWidth={1} />
              )}
              <circle cx={x0} cy={cy} r={r} fill={fill} filter={fresh || alert ? "url(#mini-glow)" : undefined} />
              {x1 - x0 > 2 && <circle cx={x1} cy={cy} r={r} fill={fill} opacity={0.85} />}
              <line x1={x0} x2={x0} y1={cy} y2={axisY} stroke="#2f2a26" strokeWidth={0.6} />
            </g>
          );
        })}
        {!items.length && (
          <text x={w / 2} y={h / 2} textAnchor="middle" fill="#6f665e" fontSize={11}>Noch keine Einträge.</text>
        )}
      </svg>
    </div>
  );
}

/**
 * Vorschau der Board-Oberfläche eines Projekts – zeigt je nach zuletzt im Board
 * gewählter Oberfläche den Ansichtstrahl oder das Projektnetz.
 */
export function BoardMiniPreview({ projectId, projectName }: { projectId: string; projectName: string }) {
  const state = useTimeline(projectId);
  const surface = getBoardSurface(projectId);

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: CANVAS, border: `1px solid ${CANVAS_LINE}` }}>
      {surface === "net" ? (
        <div style={{ height: 260 }}>
          <TimelineNet
            compact
            projectName={projectName}
            items={state.items}
            categories={state.categories}
            statuses={state.statuses}
          />
        </div>
      ) : (
        <MiniRay items={state.items} categories={state.categories} />
      )}
    </div>
  );
}
