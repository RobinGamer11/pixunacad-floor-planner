import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { useProject } from "@/lib/projectStore";
import {
  timelineStore, useTimeline, useTimelineHistory,
  itemStartMs, itemEndMs, itemAchieved, effectiveStatusId, priorityRadius,
  type TlItem, type TlKind, type TlCategory, type TlPriority, type TlStatus,
} from "@/lib/timelineStore";
import {
  CheckSquare, CalendarClock, FileText, X, Trash2, Plus, Settings, Save, Search, ChevronLeft,
} from "lucide-react";

// ------------------------------------------------------------------
// Konstanten / Helfer
// ------------------------------------------------------------------
const ORANGE = "#e2703a";
const GREY = "#a19a92";
const DAY = 86400000;
const PANEL = "#1c1815";
const PANEL_LINE = "#332c26";
const CANVAS = "#141110";

function kindIcon(kind: TlKind, size = 12) {
  if (kind === "task") return <CheckSquare size={size} />;
  if (kind === "event") return <CalendarClock size={size} />;
  return <FileText size={size} />;
}
function kindLabel(kind: TlKind) {
  return kind === "task" ? "Aufgabe" : kind === "event" ? "Termin" : "Notiz";
}
function fmtDate(d?: string, t?: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}${t ? ` ${t}` : ""}`;
}
function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }

interface Circle { bx: number; dy: number; r: number; t: number }
interface Placed {
  item: TlItem;
  bx0: number; bx1: number;
  t0: number; t1: number;
  circles: Circle[];
  side: 1 | -1;
  lane: number;
}

// ------------------------------------------------------------------
// Seite
// ------------------------------------------------------------------
export default function Board02Page() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const state = useTimeline(projectId);
  const hist = useTimelineHistory(projectId);

  useEffect(() => { if (projectId) timelineStore.ensureDefaults(projectId); }, [projectId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openLabelId, setOpenLabelId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<"category" | "status">("status");
  const [axisMode, setAxisMode] = useState<"time" | "percent">("time");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [prioFilter, setPrioFilter] = useState<string>("");

  const selected = state.items.find((i) => i.id === selectedId) ?? null;
  const now = Date.now();

  // ---- Domain (Zeitbereich) ----------------------------------------
  const range = useMemo(() => {
    if (!state.items.length) return { r0: now, r1: now + 10 * DAY };
    let r0 = Infinity, r1 = -Infinity;
    state.items.forEach((i) => {
      r0 = Math.min(r0, itemStartMs(i));
      r1 = Math.max(r1, itemEndMs(i));
    });
    if (r1 - r0 < DAY) r1 = r0 + DAY;
    return { r0, r1 };
  }, [state.items, now]);

  const domain = useMemo(() => {
    const pad = (range.r1 - range.r0) * 0.08;
    return { d0: range.r0 - pad, d1: range.r1 + pad };
  }, [range]);

  // ---- Viewport / Zoom ---------------------------------------------
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 380 });
  const [view, setView] = useState({ k: 1, tx: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const padX = 60;
  const baseW = Math.max(200, size.w - padX * 2);
  /** Basisposition (unabhängig von Zoom/Pan) – Grundlage für stabiles Kreis-Layout. */
  const baseX = useCallback(
    (t: number) => padX + ((t - domain.d0) / (domain.d1 - domain.d0)) * baseW,
    [domain, baseW],
  );
  const xOf = useCallback(
    (t: number) => padX + ((t - domain.d0) / (domain.d1 - domain.d0)) * baseW * view.k + view.tx,
    [domain, baseW, view],
  );

  useEffect(() => {
    const el = wrapRef.current;
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

  const drag = useRef({ on: false, sx: 0 });
  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    if (target.closest?.("[data-tl-interactive]")) return;
    drag.current = { on: true, sx: e.clientX - viewRef.current.tx };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    setView((v) => ({ ...v, tx: e.clientX - drag.current.sx }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    drag.current.on = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  // ---- Layout der Kreise (zoomstabil) -------------------------------
  const prioMap = useMemo(() => new Map(state.priorities.map((p) => [p.id, p])), [state.priorities]);
  const catMap = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);
  const statusMap = useMemo(() => new Map(state.statuses.map((s) => [s.id, s])), [state.statuses]);

  const cy = size.h / 2;

  const placed = useMemo<Placed[]>(() => {
    const sorted = [...state.items].sort((a, b) => itemStartMs(a) - itemStartMs(b));
    const laneEnd: Record<string, number> = {};
    // Deterministisches 2D-Bubble-Packing entlang der horizontalen Zeitachse.
    const packed: { x: number; y: number; r: number }[] = [];
    const GAP = 1.6;
    const fits = (x: number, y: number, r: number) =>
      packed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAP);
    /** Pseudozufall aus einem String – gleiche Daten ⇒ gleiche Anordnung. */
    const seedOf = (s: string) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return ((h >>> 0) % 10000) / 10000;
    };
    const placeCircle = (ax: number, r: number, seed: number): { x: number; y: number } => {
      if (fits(ax, 0, r)) { packed.push({ x: ax, y: 0, r }); return { x: ax, y: 0 }; }
      const phase = seed * Math.PI * 2;
      const stepR = Math.max(2.5, r * 0.45);
      let best: { x: number; y: number; cost: number } | null = null;
      for (let ring = 1; ring <= 26 && !best; ring++) {
        const d = ring * stepR;
        const n = Math.max(8, Math.round(ring * 8));
        for (let i = 0; i < n; i++) {
          const a = phase + (i / n) * Math.PI * 2;
          // horizontal nur leicht ausweichen, vertikal freier -> kompakte Wolke statt Stapel
          const x = ax + Math.cos(a) * d * 0.55;
          const y = Math.sin(a) * d;
          if (!fits(x, y, r)) continue;
          const cost = Math.abs(x - ax) * 2.2 + Math.abs(y);
          if (!best || cost < best.cost) best = { x, y, cost };
        }
      }
      const res = best ?? { x: ax, y: 0 };
      packed.push({ x: res.x, y: res.y, r });
      return { x: res.x, y: res.y };
    };

    let flip: 1 | -1 = -1;
    return sorted.map((item) => {
      const s = itemStartMs(item), e = itemEndMs(item);
      const ax0 = baseX(s), ax1 = baseX(e);
      const rMax = priorityRadius(prioMap.get(item.priorityId ?? "")?.percent);
      const rMin = Math.max(3, rMax * 0.35);
      const len = ax1 - ax0;
      const circles: Circle[] = [];
      if (len < rMax * 1.2) {
        const pos = placeCircle(ax0, rMax, seedOf(item.id));
        circles.push({ bx: pos.x, dy: pos.y, r: rMax, t: s });
      } else {
        const n = clamp(Math.round(len / (rMax * 1.35)), 3, 40);
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          const r = rMin + (rMax - rMin) * f;
          const pos = placeCircle(ax0 + len * f, r, seedOf(`${item.id}:${i}`));
          circles.push({ bx: pos.x, dy: pos.y, r, t: s + (e - s) * f });
        }
      }
      flip = flip === 1 ? -1 : 1;
      const side = flip;
      const key = side === -1 ? "up" : "dn";
      const bx0 = circles[0]?.bx ?? ax0;
      const bx1 = circles[circles.length - 1]?.bx ?? ax1;
      let lane = 0;
      while (laneEnd[`${key}${lane}`] !== undefined && laneEnd[`${key}${lane}`] > bx1 - 4) lane++;
      laneEnd[`${key}${lane}`] = bx1 + Math.max(120, item.title.length * 7.4);
      return { item, bx0, bx1, t0: s, t1: e, circles, side, lane };
    });
  }, [state.items, baseX, prioMap]);

  /** Basis-X → Bildschirm-X (Zoom/Pan). */
  const sx = useCallback((bx: number) => padX + (bx - padX) * view.k + view.tx, [view]);

  /** Halbe Höhe der Bubble-Wolke (Bildschirm) – Beschriftungen liegen darüber/darunter. */
  const clusterHalf = useMemo(() => {
    let m = 0;
    placed.forEach((p) => p.circles.forEach((c) => { m = Math.max(m, Math.abs(c.dy) + c.r); }));
    return m * view.k;
  }, [placed, view.k]);
  const labelY = useCallback(
    (p: Placed) => clamp(cy + p.side * (clusterHalf + 26 + p.lane * 26), 20, size.h - 60),
    [clusterHalf, cy, size.h],
  );

  // ---- Farbe eines Kreises ------------------------------------------
  const circleFill = useCallback((item: TlItem, t: number) => {
    if (colorMode === "category") return catMap.get(item.categoryId ?? "")?.color ?? GREY;
    // „Erledigt“ ist immer orange – unabhängig von der Zeitposition.
    if (itemAchieved(item, now)) return ORANGE;
    return GREY;
  }, [colorMode, catMap, now]);

  // ---- Achsen-Ticks --------------------------------------------------
  const ticks = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    if (axisMode === "percent") {
      for (let p = 0; p <= 100; p += 10) {
        out.push({ x: xOf(range.r0 + (range.r1 - range.r0) * (p / 100)), label: `${p}%` });
      }
      return out.filter((t) => t.x > -50 && t.x < size.w + 50);
    }
    const spanDays = (domain.d1 - domain.d0) / DAY / view.k;
    const d = new Date(domain.d0);
    if (spanDays > 200) {
      d.setDate(1); d.setHours(0, 0, 0, 0);
      const step = spanDays > 1200 ? 6 : spanDays > 600 ? 3 : 1;
      while (d.getTime() <= domain.d1) {
        out.push({ x: xOf(d.getTime()), label: `${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` });
        d.setMonth(d.getMonth() + step);
      }
    } else {
      d.setHours(0, 0, 0, 0);
      const stepDays = spanDays > 60 ? 7 : spanDays > 20 ? 2 : 1;
      while (d.getTime() <= domain.d1) {
        out.push({ x: xOf(d.getTime()), label: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.` });
        d.setDate(d.getDate() + stepDays);
      }
    }
    return out.filter((t) => t.x > -50 && t.x < size.w + 50);
  }, [axisMode, domain, range, xOf, view.k, size.w]);

  // ---- Kennzahlen -----------------------------------------------------
  const progress = useMemo(() => {
    if (!state.items.length) return 0;
    const done = state.items.filter((i) => itemAchieved(i, now)).length;
    return Math.round((done / state.items.length) * 100);
  }, [state.items, now]);

  const catStats = useMemo(() => {
    const total = state.items.length || 1;
    return state.categories.map((c) => {
      const its = state.items.filter((i) => i.categoryId === c.id);
      const done = its.filter((i) => itemAchieved(i, now)).length;
      return {
        cat: c,
        count: its.length,
        share: its.length / total,
        percent: its.length ? Math.round((done / its.length) * 100) : 0,
      };
    }).filter((s) => s.count > 0);
  }, [state.categories, state.items, now]);

  // ---- Liste (gefiltert + sortiert) -----------------------------------
  const listItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = state.items.filter((i) => {
      if (activeCat && i.categoryId !== activeCat) return false;
      if (prioFilter && i.priorityId !== prioFilter) return false;
      if (!q) return true;
      const hay = [
        i.title, i.description ?? "", i.responsible ?? "",
        catMap.get(i.categoryId ?? "")?.label ?? "",
        prioMap.get(i.priorityId ?? "")?.label ?? "",
        statusMap.get(i.statusId ?? "")?.label ?? "",
        kindLabel(i.kind),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
    return rows.sort((a, b) => {
      const da = itemAchieved(a, now) ? 1 : 0;
      const db = itemAchieved(b, now) ? 1 : 0;
      if (da !== db) return da - db;
      const pa = prioMap.get(a.priorityId ?? "")?.percent ?? 0;
      const pb = prioMap.get(b.priorityId ?? "")?.percent ?? 0;
      if (pa !== pb) return pb - pa;
      return itemStartMs(a) - itemStartMs(b);
    });
  }, [state.items, query, prioFilter, activeCat, catMap, prioMap, statusMap, now]);

  // ---- Aktionen --------------------------------------------------------
  const add = (kind: TlKind) => {
    if (!projectId) return;
    const it = timelineStore.addItem(projectId, kind);
    setSelectedId(it.id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && /input|textarea|select/i.test(el.tagName)) return;
      if (e.key === "Delete" && selectedId && projectId) {
        timelineStore.deleteItem(projectId, selectedId);
        setSelectedId(null);
      }
      if (e.key === "Escape") { setSelectedId(null); setOpenLabelId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, projectId]);

  const nowX = xOf(now);

  return (
    <div className="h-screen flex flex-col bg-background">
      <WorkspaceHeader
        projectId={projectId}
        projectName={project?.name}
        contextLabel="Board02"
        mode="board2"
        canUndo={hist.canUndo}
        canRedo={hist.canRedo}
        onUndo={hist.undo}
        onRedo={hist.redo}
        canDelete={!!selectedId}
        onDelete={() => { if (projectId && selectedId) { timelineStore.deleteItem(projectId, selectedId); setSelectedId(null); } }}
      />

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ background: CANVAS }}>
          {/* Werkzeugleiste – im schwarzen Fenster, graues Feld */}
          <div className="p-4 pb-0">
            <div className="flex flex-wrap items-center gap-2 rounded-xl p-3"
                 style={{ background: PANEL, border: `1px solid ${PANEL_LINE}` }}>
              <BigAddButton kind="task" onClick={() => add("task")} />
              <BigAddButton kind="event" onClick={() => add("event")} />
              <BigAddButton kind="note" onClick={() => add("note")} />
              <div className="flex-1" />
              <Segmented
                value={colorMode}
                onChange={(v) => setColorMode(v as typeof colorMode)}
                options={[{ v: "status", l: "Farbe: Stand" }, { v: "category", l: "Farbe: Kategorie" }]}
              />
              <Segmented
                value={axisMode}
                onChange={(v) => setAxisMode(v as typeof axisMode)}
                options={[{ v: "time", l: "Zeitraum" }, { v: "percent", l: "Projektstand %" }]}
              />
            </div>
          </div>

          {/* Zeitstrahl */}
          <div
            ref={wrapRef}
            className="relative mx-4 mt-4 h-[420px] rounded-xl overflow-hidden select-none cursor-grab active:cursor-grabbing"
            style={{ background: CANVAS, border: `1px solid ${PANEL_LINE}`, touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <svg width={size.w} height={size.h} className="absolute inset-0">
              <defs>
                <linearGradient id="tl-now" x1="0" x2="1">
                  <stop offset="0%" stopColor={ORANGE} />
                  <stop offset="100%" stopColor={GREY} />
                </linearGradient>
              </defs>

              {/* Achse */}
              <line x1={0} x2={size.w} y1={size.h - 46} y2={size.h - 46} stroke="#2b2724" strokeWidth={1} />
              {ticks.map((t, i) => (
                <g key={i}>
                  <line x1={t.x} x2={t.x} y1={size.h - 52} y2={size.h - 46} stroke="#3a3430" />
                  <text x={t.x} y={size.h - 30} fill="#8b837b" fontSize={11} textAnchor="middle">{t.label}</text>
                </g>
              ))}

              {/* Jetzt-Linie */}
              {nowX > 0 && nowX < size.w && (
                <g>
                  <line x1={nowX} x2={nowX} y1={16} y2={size.h - 46} stroke="#5c534b" strokeWidth={1} />
                  <text x={nowX + 6} y={26} fill="#8b837b" fontSize={10} letterSpacing={1.6}>HEUTE</text>
                </g>
              )}

              {/* Verbindungslinien (L-Form) – Beschriftung liegt außerhalb des Clusters */}
              {placed.map((p) => {
                const last = p.circles[p.circles.length - 1];
                const lx = sx(p.bx1);
                const y0 = cy + (last?.dy ?? 0) * view.k + p.side * (last?.r ?? 6) * view.k;
                const ly = labelY(p);
                return (
                  <path
                    key={`c-${p.item.id}`}
                    d={`M ${lx} ${y0} L ${lx} ${ly} L ${lx + 16} ${ly}`}
                    fill="none"
                    stroke={p.item.id === selectedId ? ORANGE : "#4a423b"}
                    strokeWidth={1}
                  />
                );
              })}

              {/* Kreise – Teil der Zeitstrahl-Welt: skalieren mit dem Zoom */}
              {placed.map((p) => (
                <g key={p.item.id} data-tl-interactive
                   style={{ cursor: "pointer" }}
                   onPointerDown={(e) => e.stopPropagation()}
                   onClick={() => { setSelectedId(p.item.id); setOpenLabelId(p.item.id); }}>
                  {p.circles.map((c, i) => {
                    const cxp = sx(c.bx);
                    const r = c.r * view.k;
                    const spansNow = colorMode === "status" && sx(p.bx0) <= nowX && sx(p.bx1) >= nowX;
                    const near = spansNow && Math.abs(cxp - nowX) < Math.max(24, r * 3);
                    return (
                      <circle
                        key={i}
                        cx={cxp}
                        cy={cy + c.dy * view.k}
                        r={r}
                        fill={near ? "url(#tl-now)" : circleFill(p.item, c.t)}
                        opacity={p.item.id === selectedId ? 1 : 0.92}
                        stroke={p.item.id === selectedId ? "#fff" : "none"}
                        strokeWidth={p.item.id === selectedId ? Math.max(0.5, view.k) : 0}
                      />
                    );
                  })}
                </g>
              ))}
            </svg>

            {/* Titel-Labels */}
            {placed.map((p) => {
              const lx = sx(p.bx1);
              const ly = labelY(p);
              const open = openLabelId === p.item.id;
              const cat = catMap.get(p.item.categoryId ?? "");
              return (
                <div
                  key={`l-${p.item.id}`}
                  data-tl-interactive
                  className="absolute"
                  style={{ left: lx + 18, top: ly - 11, maxWidth: 260 }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { setOpenLabelId(open ? null : p.item.id); setSelectedId(p.item.id); }}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap"
                    style={{
                      background: open ? "#241f1b" : "transparent",
                      color: p.item.id === selectedId ? "#fff" : "#cdc4bb",
                      border: `1px solid ${open ? "#3b332d" : "transparent"}`,
                    }}
                  >
                    <span style={{ color: cat?.color ?? ORANGE }}>{kindIcon(p.item.kind, 11)}</span>
                    {p.item.title}
                  </button>
                  {open && (
                    <div className="mt-1 rounded-lg p-2.5 text-[11px] shadow-lg"
                         style={{ background: PANEL, border: `1px solid ${PANEL_LINE}`, color: "#cdc4bb", width: 260 }}>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        <Chip>{kindLabel(p.item.kind)}</Chip>
                        {cat && <Chip color={cat.color}>{cat.label}</Chip>}
                        <Chip>{prioMap.get(p.item.priorityId ?? "")?.label ?? "—"}</Chip>
                        {p.item.statusId && (
                          <Chip color={statusMap.get(p.item.statusId)?.color}>
                            {statusMap.get(p.item.statusId)?.label ?? "—"}
                          </Chip>
                        )}
                      </div>
                      <div className="opacity-70">
                        {fmtDate(p.item.startDate, p.item.startTime)}
                        {p.item.endDate ? ` – ${fmtDate(p.item.endDate, p.item.endTime)}` : ""}
                      </div>
                      {p.item.responsible && <div className="mt-1 opacity-70">👤 {p.item.responsible}</div>}
                      {p.item.description && <p className="mt-1.5 whitespace-pre-wrap">{p.item.description}</p>}
                    </div>
                  )}
                </div>
              );
            })}

            {!state.items.length && (
              <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "#6f665e" }}>
                Noch keine Einträge — oben Aufgabe, Termin oder Notiz anlegen.
              </div>
            )}
          </div>

          {/* Projektfortschritt */}
          <div className="mx-4 mt-4 rounded-xl p-4" style={{ background: PANEL, border: `1px solid ${PANEL_LINE}` }}>
            <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "#cdc4bb" }}>
              <span className="font-medium">Projektstand</span>
              <span className="tabular-nums opacity-70">{progress}%</span>
            </div>
            <ProgressBar percent={progress} />
          </div>

          {/* Kategorien + Liste */}
          <div className="mx-4 my-4 rounded-xl p-4" style={{ background: PANEL, border: `1px solid ${PANEL_LINE}` }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs font-medium" style={{ color: "#cdc4bb" }}>Kategorien im Projekt</div>
              {activeCat && (
                <button onClick={() => setActiveCat(null)}
                        className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
                        style={{ background: "#241f1b", border: `1px solid ${PANEL_LINE}`, color: "#cdc4bb" }}>
                  <ChevronLeft size={12} /> Zurück
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <PieChart
                slices={catStats.map((s) => ({ value: s.count, color: s.cat.color, id: s.cat.id }))}
                activeId={activeCat}
                onSlice={(id) => setActiveCat(id === activeCat ? null : id)}
                onCenter={() => setActiveCat(null)}
              />
              <div className="flex flex-col gap-1.5">
                {catStats.map((s) => (
                  <button
                    key={s.cat.id}
                    onClick={() => setActiveCat(activeCat === s.cat.id ? null : s.cat.id)}
                    className="flex items-center gap-2 text-[11px] rounded-md px-2 py-1"
                    style={{
                      background: activeCat === s.cat.id ? "#241f1b" : "transparent",
                      color: "#cdc4bb",
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.cat.color }} />
                    <span>{s.cat.label}</span>
                    <span className="opacity-60 tabular-nums">
                      {s.count} · {Math.round(s.share * 100)}%
                    </span>
                  </button>
                ))}
                {!catStats.length && <span className="text-[11px]" style={{ color: "#6f665e" }}>Keine Einträge.</span>}
              </div>
            </div>

            {activeCat && (
              <div className="mt-4 max-w-xl">
                <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "#cdc4bb" }}>
                  <span className="font-medium">Stand „{catMap.get(activeCat)?.label}“</span>
                  <span className="tabular-nums opacity-70">
                    {catStats.find((s) => s.cat.id === activeCat)?.percent ?? 0}%
                  </span>
                </div>
                <ProgressBar
                  percent={catStats.find((s) => s.cat.id === activeCat)?.percent ?? 0}
                  color={catMap.get(activeCat)?.color}
                />
              </div>
            )}

            {/* Auflistung */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="text-xs font-medium" style={{ color: "#cdc4bb" }}>
                  {activeCat ? `Punkte in „${catMap.get(activeCat)?.label}“` : "Alle Punkte"}
                </div>
                <div className="flex-1" />
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "#6f665e" }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Suchen …"
                    className="h-8 w-44 rounded-md pl-7 pr-2 text-[11px] outline-none"
                    style={{ background: "#241f1b", border: `1px solid ${PANEL_LINE}`, color: "#e6ded6" }}
                  />
                </div>
                <select
                  value={prioFilter}
                  onChange={(e) => setPrioFilter(e.target.value)}
                  className="h-8 rounded-md px-2 text-[11px] outline-none"
                  style={{ background: "#241f1b", border: `1px solid ${PANEL_LINE}`, color: "#e6ded6" }}
                >
                  <option value="">Alle Prioritäten</option>
                  {state.priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>

              <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${PANEL_LINE}` }}>
                <div className="grid px-3 py-2 text-[10px] uppercase tracking-wide"
                     style={{ gridTemplateColumns: "90px 1fr 110px 120px 170px 130px", background: "#241f1b", color: "#8b837b" }}>
                  <span>Priorität</span><span>Name</span><span>Status</span><span>Kategorie</span><span>Zeitraum</span><span>Verantwortlich</span>
                </div>
                {listItems.map((i) => {
                  const prio = prioMap.get(i.priorityId ?? "");
                  const cat = catMap.get(i.categoryId ?? "");
                  const st = statusMap.get(i.statusId ?? "");
                  const doneRow = itemAchieved(i, now);
                  return (
                    <button
                      key={i.id}
                      onClick={() => setSelectedId(i.id)}
                      className="grid w-full items-center px-3 py-2 text-left text-[11px] border-t"
                      style={{
                        gridTemplateColumns: "90px 1fr 110px 120px 170px 130px",
                        borderColor: PANEL_LINE,
                        background: i.id === selectedId ? "#2a231e" : "transparent",
                        color: doneRow ? "#8b837b" : "#cdc4bb",
                      }}
                    >
                      <span className="tabular-nums">{prio ? `${prio.label} · ${prio.percent}%` : "—"}</span>
                      <span className="flex items-center gap-1.5 truncate pr-2">
                        <span style={{ color: cat?.color ?? ORANGE }}>{kindIcon(i.kind, 11)}</span>
                        <span className="truncate">{i.title}</span>
                      </span>
                      <span style={{ color: st?.color ?? "#8b837b" }}>{st?.label ?? "—"}</span>
                      <span>{cat?.label ?? "—"}</span>
                      <span className="opacity-80">
                        {fmtDate(i.startDate)}{i.endDate ? ` – ${fmtDate(i.endDate)}` : ""}
                      </span>
                      <span className="truncate">{i.responsible || "—"}</span>
                    </button>
                  );
                })}
                {!listItems.length && (
                  <div className="px-3 py-4 text-[11px]" style={{ color: "#6f665e" }}>Keine Treffer.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Editor */}
        {selected && projectId && (
          <ItemEditor
            projectId={projectId}
            item={selected}
            categories={state.categories}
            priorities={state.priorities}
            statuses={state.statuses}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Editor
// ------------------------------------------------------------------
function ItemEditor({
  projectId, item, categories, priorities, statuses, onClose,
}: {
  projectId: string;
  item: TlItem;
  categories: TlCategory[];
  priorities: TlPriority[];
  statuses: TlStatus[];
  onClose: () => void;
}) {
  const set = (patch: Partial<TlItem>) => timelineStore.updateItem(projectId, item.id, patch);
  const prio = priorities.find((p) => p.id === item.priorityId);

  return (
    <aside className="w-[340px] shrink-0 border-l overflow-y-auto"
           style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
      <div className="flex items-center gap-2 px-3 h-12 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        {kindIcon(item.kind, 14)}
        <span className="text-xs font-semibold">{kindLabel(item.kind)}</span>
        <div className="flex-1" />
        <button className="h-7 w-7 rounded-md grid place-items-center hover:bg-muted"
                title="Löschen (Entf)"
                onClick={() => { timelineStore.deleteItem(projectId, item.id); onClose(); }}>
          <Trash2 size={14} />
        </button>
        <button className="h-7 w-7 rounded-md grid place-items-center hover:bg-muted" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        <Field label="Name">
          <input className={inputCls} value={item.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>

        <Field label="Status">
          <div className="grid grid-cols-3 gap-1.5">
            {statuses.map((s) => {
              const active = effectiveStatusId(item) === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => set({ statusId: s.id, done: s.id === "done", statusManual: true })}
                  className="h-8 rounded-md border text-[11px] font-medium"
                  style={{
                    background: active ? `${s.color}22` : "hsl(var(--background))",
                    borderColor: active ? s.color : "hsl(var(--hairline))",
                    color: active ? s.color : "hsl(var(--ink-soft))",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Verantwortliche(r)">
          <input className={inputCls} placeholder="Name frei eingeben"
                 value={item.responsible ?? ""} onChange={(e) => set({ responsible: e.target.value })} />
        </Field>

        <ManagedSelect
          label="Kategorie"
          value={item.categoryId ?? ""}
          entries={categories.map((c) => ({ id: c.id, label: c.label, color: c.color }))}
          onSelect={(id) => set({ categoryId: id || undefined })}
          onRename={(id, label) => timelineStore.updateCategory(projectId, id, { label })}
          onColor={(id, color) => timelineStore.updateCategory(projectId, id, { color })}
          onRemove={(id) => timelineStore.removeCategory(projectId, id)}
          onAdd={(label) => {
            const id = timelineStore.addCategory(projectId, label, "#e2703a");
            if (id) set({ categoryId: id });
          }}
        />

        <ManagedSelect
          label="Priorität (Kreisgröße)"
          value={item.priorityId ?? ""}
          entries={priorities.map((p) => ({ id: p.id, label: p.label, percent: p.percent }))}
          onSelect={(id) => set({ priorityId: id || undefined })}
          onRename={(id, label) => timelineStore.updatePriority(projectId, id, { label })}
          onRemove={(id) => timelineStore.removePriority(projectId, id)}
          onAdd={(label) => {
            const id = timelineStore.addPriority(projectId, label, 50);
            if (id) set({ priorityId: id });
          }}
        />

        {prio && (
          <Field label={`Priorität in % (Kreisgröße): ${prio.percent}%`}>
            <input
              type="range" min={1} max={100} value={prio.percent}
              onChange={(e) => timelineStore.updatePriority(projectId, prio.id, { percent: Number(e.target.value) })}
              className="w-full accent-[var(--accent-slider,#e2703a)]"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Start (Datum)">
            <input type="date" className={inputCls} value={item.startDate}
                   onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Start (Uhrzeit)">
            <input type="time" className={inputCls} value={item.startTime ?? ""}
                   onChange={(e) => set({ startTime: e.target.value })} />
          </Field>
          <Field label="Ziel (Datum)">
            <input type="date" className={inputCls} value={item.endDate ?? ""}
                   onChange={(e) => set({ endDate: e.target.value || undefined })} />
          </Field>
          <Field label="Ziel (Uhrzeit)">
            <input type="time" className={inputCls} value={item.endTime ?? ""}
                   onChange={(e) => set({ endTime: e.target.value || undefined })} />
          </Field>
        </div>

        <Field label="Beschreibung">
          <textarea className="w-full min-h-[160px] rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring resize-y"
                    value={item.description ?? ""}
                    onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------
// Drop-down mit Zahnrad-Verwaltung
// ------------------------------------------------------------------
interface ManagedEntry { id: string; label: string; color?: string; percent?: number }

function ManagedSelect({
  label, value, entries, onSelect, onRename, onColor, onPercent, onRemove, onAdd,
}: {
  label: string;
  value: string;
  entries: ManagedEntry[];
  onSelect: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onColor?: (id: string, color: string) => void;
  onPercent?: (id: string, percent: number) => void;
  onRemove: (id: string) => void;
  onAdd: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [draft, setDraft] = useState<Record<string, ManagedEntry>>({});
  const [newLabel, setNewLabel] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return;
      // Klick außerhalb: schließen und Änderungen verwerfen
      setDraft({});
      setNewLabel("");
      setManage(false);
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, manage]);

  const cur = entries.find((e) => e.id === value);
  const val = (e: ManagedEntry) => draft[e.id] ?? e;

  return (
    <div className="flex flex-col gap-1" ref={boxRef}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="relative">
        <button className={`${inputCls} flex items-center gap-2 text-left`} onClick={() => setOpen((o) => !o)}>
          {cur?.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: cur.color }} />}
          <span className="truncate">
            {cur ? `${cur.label}${cur.percent !== undefined ? ` · ${cur.percent}%` : ""}` : "—"}
          </span>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-lg"
               style={{ borderColor: "hsl(var(--hairline))" }}>
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-[10px] text-muted-foreground">{manage ? "Bearbeiten" : "Auswählen"}</span>
              <button
                className="h-6 w-6 rounded grid place-items-center hover:bg-muted"
                title={manage ? "Änderungen speichern" : "Einträge verwalten"}
                onClick={() => {
                  if (manage) {
                    Object.values(draft).forEach((d) => {
                      const src = entries.find((e) => e.id === d.id);
                      if (!src) return;
                      if (d.label !== src.label && d.label.trim()) onRename(d.id, d.label.trim());
                      if (onColor && d.color && d.color !== src.color) onColor(d.id, d.color);
                      if (onPercent && d.percent !== undefined && d.percent !== src.percent) onPercent(d.id, d.percent);
                    });
                    setDraft({});
                  }
                  setManage((m) => !m);
                }}
              >
                {manage ? <Save size={13} /> : <Settings size={13} />}
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
              {entries.map((e) => {
                const d = val(e);
                if (!manage) {
                  return (
                    <button key={e.id}
                            className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted text-left"
                            onClick={() => { onSelect(e.id); setOpen(false); }}>
                      {e.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />}
                      <span className="truncate">{e.label}</span>
                      {e.percent !== undefined && <span className="ml-auto tabular-nums text-muted-foreground">{e.percent}%</span>}
                    </button>
                  );
                }
                return (
                  <div key={e.id} className="flex items-center gap-1 px-1 py-1">
                    <input className={`${inputCls} h-7`} value={d.label}
                           onChange={(ev) => setDraft((s) => ({ ...s, [e.id]: { ...d, label: ev.target.value } }))} />
                    {onColor && (
                      <input type="color" className="h-7 w-8 shrink-0 rounded border" value={d.color ?? "#e2703a"}
                             onChange={(ev) => setDraft((s) => ({ ...s, [e.id]: { ...d, color: ev.target.value } }))} />
                    )}
                    {onPercent && (
                      <input type="number" min={1} max={100} className={`${inputCls} h-7 w-16 shrink-0`}
                             value={d.percent ?? 50}
                             onChange={(ev) => setDraft((s) => ({ ...s, [e.id]: { ...d, percent: clamp(Number(ev.target.value), 1, 100) } }))} />
                    )}
                    <button className="h-7 w-7 shrink-0 rounded grid place-items-center hover:bg-muted"
                            title="Löschen" onClick={() => onRemove(e.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-1 border-t pt-1 mt-1" style={{ borderColor: "hsl(var(--hairline))" }}>
              <input className={`${inputCls} h-7`} placeholder="Neu …" value={newLabel}
                     onChange={(e) => setNewLabel(e.target.value)} />
              <button className="h-7 w-7 shrink-0 rounded grid place-items-center hover:bg-muted"
                      onClick={() => { if (newLabel.trim()) { onAdd(newLabel.trim()); setNewLabel(""); } }}>
                <Plus size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// UI-Bausteine
// ------------------------------------------------------------------
const inputCls =
  "w-full h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function BigAddButton({ kind, onClick }: { kind: TlKind; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-11 px-4 rounded-lg flex items-center gap-2 text-sm font-semibold border transition-colors hover:opacity-90"
      style={{
        background: "hsl(var(--accent-gold-soft))",
        borderColor: "hsl(var(--hairline))",
        color: "hsl(var(--ink))",
      }}
    >
      {kindIcon(kind, 15)} + {kindLabel(kind)}
    </button>
  );
}

function Segmented({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="flex items-center rounded-md p-0.5" style={{ background: "#241f1b" }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className="h-7 px-2.5 rounded-[5px] text-[11px] font-medium"
          style={{
            background: value === o.v ? ORANGE : "transparent",
            color: value === o.v ? "#141110" : "#a19a92",
          }}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px]"
          style={{ background: color ? `${color}22` : "#2a2420", color: color ?? "#b3aaa1" }}>
      {children}
    </span>
  );
}

function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  return (
    <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: "#2a2420" }}>
      <div className="h-full rounded-full transition-all"
           style={{ width: `${clamp(percent, 0, 100)}%`, background: color ?? ORANGE }} />
    </div>
  );
}

function PieChart({
  slices, activeId, onSlice, onCenter,
}: {
  slices: { value: number; color: string; id: string }[];
  activeId: string | null;
  onSlice: (id: string) => void;
  onCenter: () => void;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return null;
  const R = 54, C = 64;
  let acc = -Math.PI / 2;
  return (
    <svg width={C * 2} height={C * 2}>
      {slices.map((s) => {
        const ang = (s.value / total) * Math.PI * 2;
        const a0 = acc, a1 = acc + ang;
        acc = a1;
        const r = activeId === s.id ? R + 5 : R;
        const large = ang > Math.PI ? 1 : 0;
        const d = ang >= Math.PI * 2 - 1e-6
          ? `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r} Z`
          : `M ${C} ${C} L ${C + Math.cos(a0) * r} ${C + Math.sin(a0) * r} A ${r} ${r} 0 ${large} 1 ${C + Math.cos(a1) * r} ${C + Math.sin(a1) * r} Z`;
        return (
          <path key={s.id} d={d} fill={s.color} opacity={activeId && activeId !== s.id ? 0.4 : 1}
                style={{ cursor: "pointer" }} onClick={() => onSlice(s.id)} />
        );
      })}
      <circle cx={C} cy={C} r={26} fill={PANEL} style={{ cursor: "pointer" }} onClick={onCenter} />
    </svg>
  );
}
