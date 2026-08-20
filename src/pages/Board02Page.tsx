import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { useProject } from "@/lib/projectStore";
import {
  timelineStore, useTimeline, useTimelineHistory,
  itemStartMs, itemEndMs, itemAchieved,
  type TlItem, type TlKind, type TlCategory, type TlPriority,
} from "@/lib/timelineStore";
import { CheckSquare, CalendarClock, FileText, X, Trash2, Plus } from "lucide-react";

// ------------------------------------------------------------------
// Konstanten / Helfer
// ------------------------------------------------------------------
const ORANGE = "#e2703a";
const GREY = "#a19a92";
const DAY = 86400000;

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

interface Placed {
  item: TlItem;
  x0: number; x1: number;
  circles: { x: number; r: number; t: number }[];
  side: 1 | -1;
  lane: number;
  labelX: number;
}

// ------------------------------------------------------------------
// Seite
// ------------------------------------------------------------------
export default function Board02Page() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const state = useTimeline(projectId);
  const hist = useTimelineHistory(projectId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openLabelId, setOpenLabelId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<"category" | "status">("status");
  const [axisMode, setAxisMode] = useState<"time" | "percent">("time");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const selected = state.items.find((i) => i.id === selectedId) ?? null;
  const now = Date.now();

  // ---- Domain -----------------------------------------------------
  const domain = useMemo(() => {
    if (!state.items.length) return { d0: now - 30 * DAY, d1: now + 60 * DAY };
    let d0 = Infinity, d1 = -Infinity;
    state.items.forEach((i) => {
      d0 = Math.min(d0, itemStartMs(i));
      d1 = Math.max(d1, itemEndMs(i));
    });
    if (d1 - d0 < 7 * DAY) { d0 -= 3 * DAY; d1 += 3 * DAY; }
    const pad = (d1 - d0) * 0.08;
    return { d0: d0 - pad, d1: d1 + pad };
  }, [state.items, now]);

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
  const xOf = useCallback(
    (t: number) => padX + ((t - domain.d0) / (domain.d1 - domain.d0)) * baseW * view.k + view.tx,
    [domain, baseW, view],
  );
  const tOf = useCallback(
    (x: number) => domain.d0 + ((x - padX - view.tx) / (baseW * view.k)) * (domain.d1 - domain.d0),
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

  // ---- Layout der Kreise + Beschriftungen ---------------------------
  const prioMap = useMemo(() => new Map(state.priorities.map((p) => [p.id, p])), [state.priorities]);
  const catMap = useMemo(() => new Map(state.categories.map((c) => [c.id, c])), [state.categories]);

  const cy = size.h / 2;

  const placed = useMemo<Placed[]>(() => {
    const sorted = [...state.items].sort((a, b) => itemStartMs(a) - itemStartMs(b));
    const laneEnd: Record<string, number> = {};
    let flip: 1 | -1 = -1;
    return sorted.map((item) => {
      const s = itemStartMs(item), e = itemEndMs(item);
      const x0 = xOf(s), x1 = xOf(e);
      const rMax = prioMap.get(item.priorityId ?? "")?.size ?? 13;
      const rMin = Math.max(3, rMax * 0.3);
      const len = x1 - x0;
      const circles: { x: number; r: number; t: number }[] = [];
      if (len < rMax * 1.2) {
        circles.push({ x: x0, r: rMax, t: s });
      } else {
        const n = clamp(Math.round(len / (rMax * 1.5)), 3, 24);
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          circles.push({ x: x0 + len * f, r: rMin + (rMax - rMin) * f, t: s + (e - s) * f });
        }
      }
      flip = flip === 1 ? -1 : 1;
      const side = flip;
      const key = side === -1 ? "up" : "dn";
      let lane = 0;
      while (laneEnd[`${key}${lane}`] !== undefined && laneEnd[`${key}${lane}`] > x1 - 4) lane++;
      laneEnd[`${key}${lane}`] = x1 + Math.max(120, item.title.length * 7.4);
      return { item, x0, x1, circles, side, lane, labelX: x1 };
    });
  }, [state.items, xOf, prioMap]);

  // ---- Farbe eines Kreises ------------------------------------------
  const circleFill = useCallback((item: TlItem, t: number) => {
    if (colorMode === "category") return catMap.get(item.categoryId ?? "")?.color ?? GREY;
    const achieved = itemAchieved(item, now);
    if (t > now) return GREY;
    if (!achieved) return GREY;                 // offene Aufgabe/Notiz bleibt grau
    return ORANGE;
  }, [colorMode, catMap, now]);

  // ---- Achsen-Ticks --------------------------------------------------
  const ticks = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    if (axisMode === "percent") {
      for (let p = 0; p <= 100; p += 10) {
        out.push({ x: xOf(domain.d0 + (domain.d1 - domain.d0) * (p / 100)), label: `${p}%` });
      }
      return out;
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
  }, [axisMode, domain, xOf, view.k, size.w]);

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
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
          {/* Werkzeugleiste */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0"
               style={{ borderColor: "hsl(var(--hairline))" }}>
            <div className="flex items-center gap-2">
              <BigAddButton kind="task" onClick={() => add("task")} />
              <BigAddButton kind="event" onClick={() => add("event")} />
              <BigAddButton kind="note" onClick={() => add("note")} />
            </div>
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

          {/* Zeitstrahl */}
          <div
            ref={wrapRef}
            className="relative h-[420px] shrink-0 overflow-hidden select-none cursor-grab active:cursor-grabbing"
            style={{ background: "#141110", touchAction: "none" }}
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

              {/* Verbindungslinien (L-Form) */}
              {placed.map((p) => {
                const ly = cy + p.side * (52 + p.lane * 46);
                return (
                  <path
                    key={`c-${p.item.id}`}
                    d={`M ${p.labelX} ${cy + p.side * 6} L ${p.labelX} ${ly} L ${p.labelX + 16} ${ly}`}
                    fill="none"
                    stroke={p.item.id === selectedId ? ORANGE : "#4a423b"}
                    strokeWidth={1}
                  />
                );
              })}

              {/* Kreise */}
              {placed.map((p) => (
                <g key={p.item.id} data-tl-interactive
                   style={{ cursor: "pointer" }}
                   onPointerDown={(e) => e.stopPropagation()}
                   onClick={() => { setSelectedId(p.item.id); setOpenLabelId(p.item.id); }}>
                  {p.circles.map((c, i) => {
                    const spansNow = p.x0 <= nowX && p.x1 >= nowX && colorMode === "status";
                    const near = spansNow && Math.abs(c.x - nowX) < Math.max(24, c.r * 3);
                    return (
                      <circle
                        key={i}
                        cx={c.x}
                        cy={cy + (i % 2 === 0 ? 0 : (i % 4 === 1 ? -c.r * 0.5 : c.r * 0.5))}
                        r={c.r}
                        fill={near ? "url(#tl-now)" : circleFill(p.item, c.t)}
                        opacity={p.item.id === selectedId ? 1 : 0.92}
                        stroke={p.item.id === selectedId ? "#fff" : "none"}
                        strokeWidth={p.item.id === selectedId ? 1 : 0}
                      />
                    );
                  })}
                </g>
              ))}
            </svg>

            {/* Titel-Labels als HTML-Ebene */}
            {placed.map((p) => {
              const ly = cy + p.side * (52 + p.lane * 46);
              const open = openLabelId === p.item.id;
              const cat = catMap.get(p.item.categoryId ?? "");
              return (
                <div
                  key={`l-${p.item.id}`}
                  data-tl-interactive
                  className="absolute"
                  style={{ left: p.labelX + 18, top: ly - 11, maxWidth: 260 }}
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
                         style={{ background: "#1c1815", border: "1px solid #332c26", color: "#cdc4bb", width: 260 }}>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        <Chip>{kindLabel(p.item.kind)}</Chip>
                        {cat && <Chip color={cat.color}>{cat.label}</Chip>}
                        <Chip>{prioMap.get(p.item.priorityId ?? "")?.label ?? "—"}</Chip>
                        {itemAchieved(p.item, now) && <Chip color={ORANGE}>Erreicht</Chip>}
                      </div>
                      <div className="opacity-70">
                        {fmtDate(p.item.startDate, p.item.startTime)}
                        {p.item.endDate ? ` – ${fmtDate(p.item.endDate, p.item.endTime)}` : ""}
                      </div>
                      {p.item.description && <p className="mt-1.5 whitespace-pre-wrap">{p.item.description}</p>}
                    </div>
                  )}
                </div>
              );
            })}

            {!state.items.length && (
              <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "#6f665e" }}>
                Noch keine Einträge — oben links Aufgabe, Termin oder Notiz anlegen.
              </div>
            )}
          </div>

          {/* Projektfortschritt */}
          <div className="px-4 py-4 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium">Projektstand</span>
              <span className="tabular-nums text-muted-foreground">{progress}%</span>
            </div>
            <ProgressBar percent={progress} />
          </div>

          {/* Kategorien */}
          <div className="px-4 py-4">
            <div className="text-xs font-medium mb-3">Kategorien im Projekt</div>
            <div className="flex flex-wrap items-center gap-6">
              <PieChart
                slices={catStats.map((s) => ({ value: s.count, color: s.cat.color, id: s.cat.id }))}
                activeId={activeCat}
                onSlice={(id) => setActiveCat(id === activeCat ? null : id)}
              />
              <div className="flex flex-col gap-1.5">
                {catStats.map((s) => (
                  <button
                    key={s.cat.id}
                    onClick={() => setActiveCat(activeCat === s.cat.id ? null : s.cat.id)}
                    className="flex items-center gap-2 text-[11px] rounded-md px-2 py-1 hover:bg-muted"
                    style={{ background: activeCat === s.cat.id ? "hsl(var(--surface-muted))" : "transparent" }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.cat.color }} />
                    <span>{s.cat.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {s.count} · {Math.round(s.share * 100)}%
                    </span>
                  </button>
                ))}
                {!catStats.length && <span className="text-[11px] text-muted-foreground">Keine Einträge.</span>}
              </div>
            </div>

            {activeCat && (
              <div className="mt-4 max-w-xl">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium">
                    Stand „{catMap.get(activeCat)?.label}“
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {catStats.find((s) => s.cat.id === activeCat)?.percent ?? 0}%
                  </span>
                </div>
                <ProgressBar
                  percent={catStats.find((s) => s.cat.id === activeCat)?.percent ?? 0}
                  color={catMap.get(activeCat)?.color}
                />
              </div>
            )}
          </div>
        </div>

        {/* Editor */}
        {selected && projectId && (
          <ItemEditor
            projectId={projectId}
            item={selected}
            categories={state.categories}
            priorities={state.priorities}
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
  projectId, item, categories, priorities, onClose,
}: {
  projectId: string;
  item: TlItem;
  categories: TlCategory[];
  priorities: TlPriority[];
  onClose: () => void;
}) {
  const [newCat, setNewCat] = useState<{ label: string; color: string } | null>(null);
  const [newPrio, setNewPrio] = useState<{ label: string; size: number } | null>(null);
  const set = (patch: Partial<TlItem>) => timelineStore.updateItem(projectId, item.id, patch);

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

        {item.kind !== "event" && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!item.done} onChange={(e) => set({ done: e.target.checked })} />
            Erledigt (Kreise werden orange)
          </label>
        )}
        {item.kind === "event" && (
          <p className="text-[10px] text-muted-foreground">Termine sind an die Zeit gekoppelt und färben sich automatisch.</p>
        )}

        <Field label="Kategorie">
          <select
            className={inputCls}
            value={item.categoryId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new") { setNewCat({ label: "", color: "#e2703a" }); return; }
              set({ categoryId: e.target.value || undefined });
            }}
          >
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            <option value="__new">+ Neu …</option>
          </select>
          {newCat && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input className={inputCls} placeholder="Name" value={newCat.label}
                     onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} />
              <input type="color" className="h-8 w-9 rounded border" value={newCat.color}
                     onChange={(e) => setNewCat({ ...newCat, color: e.target.value })} />
              <button className={miniBtn} onClick={() => {
                const id = timelineStore.addCategory(projectId, newCat.label, newCat.color);
                if (id) set({ categoryId: id });
                setNewCat(null);
              }}><Plus size={13} /></button>
            </div>
          )}
        </Field>

        <Field label="Priorität (Kreisgröße)">
          <select
            className={inputCls}
            value={item.priorityId ?? ""}
            onChange={(e) => {
              if (e.target.value === "__new") { setNewPrio({ label: "", size: 15 }); return; }
              set({ priorityId: e.target.value || undefined });
            }}
          >
            <option value="">—</option>
            {priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            <option value="__new">+ Neu …</option>
          </select>
          {newPrio && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input className={inputCls} placeholder="Name" value={newPrio.label}
                     onChange={(e) => setNewPrio({ ...newPrio, label: e.target.value })} />
              <input type="number" min={4} max={40} className={`${inputCls} w-16`} value={newPrio.size}
                     onChange={(e) => setNewPrio({ ...newPrio, size: Number(e.target.value) })} />
              <button className={miniBtn} onClick={() => {
                const id = timelineStore.addPriority(projectId, newPrio.label, newPrio.size);
                if (id) set({ priorityId: id });
                setNewPrio(null);
              }}><Plus size={13} /></button>
            </div>
          )}
        </Field>

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
          <textarea className={`${inputCls} h-28 resize-none`} value={item.description ?? ""}
                    onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------
// UI-Bausteine
// ------------------------------------------------------------------
const inputCls =
  "w-full h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";
const miniBtn =
  "h-8 w-8 shrink-0 rounded-md border grid place-items-center hover:bg-muted";

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
    <div className="flex items-center rounded-md p-0.5" style={{ background: "hsl(var(--surface-muted))" }}>
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className="h-7 px-2.5 rounded-[5px] text-[11px] font-medium"
          style={{
            background: value === o.v ? "hsl(var(--accent-gold))" : "transparent",
            color: value === o.v ? "hsl(var(--surface))" : "hsl(var(--ink-soft))",
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
    <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: "hsl(var(--surface-muted))" }}>
      <div className="h-full rounded-full transition-all"
           style={{ width: `${clamp(percent, 0, 100)}%`, background: color ?? ORANGE }} />
    </div>
  );
}

function PieChart({
  slices, activeId, onSlice,
}: {
  slices: { value: number; color: string; id: string }[];
  activeId: string | null;
  onSlice: (id: string) => void;
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
      <circle cx={C} cy={C} r={26} fill="hsl(var(--surface-card))" />
    </svg>
  );
}
