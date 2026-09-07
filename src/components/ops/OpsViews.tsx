/**
 * Zusätzliche Organisationsansichten (Ansichtstrahl, Projektnetz, Gantt).
 *
 * Alle drei arbeiten mit genau denselben Board-Beiträgen und Zeiterfassungen
 * wie der Kalender – es entstehen keine Kopien der Datensätze. Projekt- und
 * Personenfilter werden von der aufrufenden Ansicht bereits angewendet.
 * Auswahl, Zoom und Verschieben verhalten sich in allen Ansichten gleich.
 */
import { useMemo, useState } from "react";
import { TimelineNet } from "@/components/board/TimelineNet";
import { OpsZoomPane } from "@/components/ops/OpsZoomPane";
import { isPeriodItem, type TlItem, type TlState } from "@/lib/timelineStore";
import { isItemSelected, isTimeSelected, type OpsSelection } from "@/components/ops/opsSelection";

export type OpsView = "calendar" | "ray" | "net" | "gantt";

export const OPS_VIEWS: { id: OpsView; label: string }[] = [
  { id: "calendar", label: "Kalender" },
  { id: "ray", label: "Ansichtstrahl" },
  { id: "net", label: "Projektnetz" },
  { id: "gantt", label: "Gantt-Diagramm" },
];

export interface OpsBoard {
  id: string;
  name: string;
  color: string;
  state: TlState;
  /** Bereits gefilterte Beiträge (Person). */
  items: TlItem[];
}

/** Zeiterfassung als Zeitspanne – dieselbe Datenquelle wie die Listen. */
export interface OpsTimeMark {
  id: string;
  projectId: string;
  itemId?: string;
  project: string;
  label: string;
  from: number;
  to: number;
}

export interface OpsViewProps {
  boards: OpsBoard[];
  times?: OpsTimeMark[];
  selection?: OpsSelection;
  onSelectItem?: (projectId: string, itemId: string) => void;
  onSelectTime?: (projectId: string, entryId: string, itemId?: string) => void;
}

const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";
const TIME_COLOR = "#3f9c6a";

const dayMs = 86_400_000;
const parse = (d?: string) => (d ? Date.parse(`${d}T00:00:00`) : NaN);
const fmt = (t: number) =>
  new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

function categoryColor(board: OpsBoard, item: TlItem) {
  return board.state.categories.find((c) => c.id === item.categoryId)?.color ?? board.color;
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-[12px]" style={{ color: SOFT }}>{text}</div>;
}

/* ------------------------------------------------------------ Ansichtstrahl */

export function OpsRay({ boards, times = [], selection, onSelectItem, onSelectTime }: OpsViewProps) {
  const marks = useMemo(() => {
    const items: {
      key: string; projectId: string; itemId: string; from: number; to: number;
      period: boolean; title: string; color: string; project: string;
    }[] = [];
    for (const b of boards) {
      for (const i of b.items) {
        const from = parse(i.startDate);
        if (!Number.isFinite(from)) continue;
        const rawTo = parse(i.endDate);
        const to = Number.isFinite(rawTo) ? Math.max(rawTo, from) : from;
        items.push({
          key: `${b.id}:${i.id}`,
          projectId: b.id,
          itemId: i.id,
          from,
          to,
          // Projektverlauf: ein zusammenhängender Zeitraum, kein Tageseintrag.
          period: isPeriodItem(i),
          title: i.title || "Beitrag",
          color: categoryColor(b, i),
          project: b.name,
        });
      }
    }
    return items.sort((a, b) => a.from - b.from);
  }, [boards]);

  if (!marks.length && !times.length) return <Empty text="Keine Beiträge im aktuellen Filter." />;

  const stamps = [...marks.flatMap((m) => [m.from, m.to]), ...times.flatMap((t) => [t.from, t.to]), Date.now()];
  const min = Math.min(...stamps);
  const max = Math.max(...stamps);
  const span = Math.max(dayMs, max - min);
  const pos = (t: number) => ((t - min) / span) * 100;

  return (
    <OpsZoomPane height={330}>
      <div className="relative px-4" style={{ height: 330 }}>
        <div className="absolute left-4 right-4 top-1/2 h-px" style={{ background: LINE }} />
        <div className="absolute top-1/2 h-5 w-px -translate-y-1/2" style={{ left: `${pos(Date.now())}%`, background: "hsl(var(--accent-gold))" }} />

        {marks.map((m, idx) =>
          m.period ? (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelectItem?.(m.projectId, m.itemId)}
              className="absolute top-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${pos(m.from)}%`,
                width: `${Math.max(0.8, pos(m.to) - pos(m.from))}%`,
                height: 10,
                background: m.color,
                opacity: isItemSelected(selection ?? null, m.projectId, m.itemId) ? 1 : 0.6,
                outline: isItemSelected(selection ?? null, m.projectId, m.itemId) ? "2px solid hsl(var(--accent-gold))" : "none",
              }}
              title={`${m.title} · ${m.project} · ${fmt(m.from)} – ${fmt(m.to)}`}
            />
          ) : (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelectItem?.(m.projectId, m.itemId)}
              className="absolute -translate-x-1/2 flex flex-col items-center gap-1"
              style={{ left: `${pos(m.from)}%`, top: idx % 2 ? "calc(50% + 14px)" : undefined, bottom: idx % 2 ? undefined : "calc(50% + 14px)" }}
              title={`${m.title} · ${m.project} · ${fmt(m.from)}`}
            >
              {idx % 2 === 0 && <span className="max-w-[130px] truncate text-[10px]" style={{ color: SOFT }}>{m.title}</span>}
              <span
                className="rounded-full"
                style={{
                  background: m.color,
                  width: isItemSelected(selection ?? null, m.projectId, m.itemId) ? 14 : 10,
                  height: isItemSelected(selection ?? null, m.projectId, m.itemId) ? 14 : 10,
                  boxShadow: isItemSelected(selection ?? null, m.projectId, m.itemId) ? "0 0 0 3px hsl(var(--accent-gold))" : "none",
                }}
              />
              {idx % 2 === 1 && <span className="max-w-[130px] truncate text-[10px]" style={{ color: SOFT }}>{m.title}</span>}
            </button>
          ),
        )}

        {times.map((t) => (
          <button
            key={`time-${t.id}`}
            type="button"
            onClick={() => onSelectTime?.(t.projectId, t.id, t.itemId)}
            className="absolute rounded"
            style={{
              left: `${pos(t.from)}%`,
              width: `${Math.max(0.5, pos(t.to) - pos(t.from))}%`,
              bottom: 18,
              height: 8,
              background: TIME_COLOR,
              outline: isTimeSelected(selection ?? null, t.id) ? "2px solid hsl(var(--accent-gold))" : "none",
            }}
            title={`${t.label} · ${t.project}`}
          />
        ))}

        <div className="absolute bottom-1 left-4 right-4 flex justify-between text-[10px]" style={{ color: SOFT }}>
          <span>{fmt(min)}</span>
          <span>{fmt(max)}</span>
        </div>
      </div>
    </OpsZoomPane>
  );
}

/* -------------------------------------------------------------- Projektnetz */

export function OpsNet({ boards, selection, onSelectItem }: OpsViewProps) {
  const [fitSignal, setFitSignal] = useState(0);
  if (!boards.length) return <Empty text="Keine Projekte im aktuellen Filter." />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFitSignal((n) => n + 1)}
          className="h-8 px-2.5 rounded-md border text-[11px]"
          style={{ borderColor: LINE }}
        >
          Ansicht einpassen
        </button>
        <span className="text-[11px] text-muted-foreground">
          Mausrad zoomt · gedrücktes Mausrad verschiebt · zwei Finger auf dem Tablet
        </span>
      </div>
      <div className={`grid gap-3 ${boards.length > 1 ? "md:grid-cols-2" : ""}`}>
        {boards.map((b) => (
          <div key={b.id} className="h-[460px] overflow-hidden rounded-xl" style={{ border: `1px solid ${LINE}` }}>
            <TimelineNet
              projectName={b.name}
              items={b.items}
              categories={b.state.categories}
              statuses={b.state.statuses}
              fitSignal={fitSignal}
              selectedId={selection && selection.kind === "item" && selection.projectId === b.id ? selection.itemId : null}
              onSelect={(id) => onSelectItem?.(b.id, id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Gantt */

export function OpsGantt({ boards, times = [], selection, onSelectItem, onSelectTime }: OpsViewProps) {
  const rows = useMemo(() => {
    const out: {
      key: string; projectId: string; itemId?: string; entryId?: string; label: string;
      project: string; color: string; from: number; to: number; period: boolean; point: boolean; time: boolean;
    }[] = [];
    for (const b of boards) {
      for (const i of b.items) {
        const from = parse(i.startDate);
        if (!Number.isFinite(from)) continue;
        const rawTo = parse(i.endDate);
        const to = Number.isFinite(rawTo) ? Math.max(rawTo, from) : from;
        out.push({
          key: `${b.id}:${i.id}`,
          projectId: b.id,
          itemId: i.id,
          label: i.title || "Beitrag",
          project: b.name,
          color: categoryColor(b, i),
          from,
          to,
          period: isPeriodItem(i),
          point: to === from,
          time: false,
        });
      }
    }
    for (const t of times) {
      out.push({
        key: `time:${t.id}`,
        projectId: t.projectId,
        entryId: t.id,
        itemId: t.itemId,
        label: t.label,
        project: t.project,
        color: TIME_COLOR,
        from: t.from,
        to: t.to,
        period: false,
        point: false,
        time: true,
      });
    }
    return out.sort((a, b) => a.from - b.from);
  }, [boards, times]);

  if (!rows.length) return <Empty text="Keine Beiträge im aktuellen Filter." />;

  const min = Math.min(...rows.map((r) => r.from));
  const max = Math.max(...rows.map((r) => r.to + dayMs));
  const span = Math.max(dayMs, max - min);
  const left = (t: number) => ((t - min) / span) * 100;
  const width = (a: number, b: number) => Math.max(1.2, ((b + dayMs - a) / span) * 100);
  const nowLeft = left(Date.now());

  return (
    <OpsZoomPane height={Math.min(520, Math.max(220, rows.length * 26 + 40))}>
      <div className="p-3">
        <div className="mb-2 flex justify-between text-[10px]" style={{ color: SOFT }}>
          <span>{fmt(min)}</span>
          <span>{fmt(max - dayMs)}</span>
        </div>
        <div className="relative flex flex-col gap-1">
          {nowLeft >= 0 && nowLeft <= 100 && (
            <div className="pointer-events-none absolute bottom-0 top-0 w-px" style={{ left: `calc(38% + ${nowLeft * 0.62}%)`, background: "hsl(var(--accent-gold))" }} />
          )}
          {rows.map((r) => {
            const active = r.time
              ? isTimeSelected(selection ?? null, r.entryId ?? "")
              : isItemSelected(selection ?? null, r.projectId, r.itemId ?? "");
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => (r.time ? onSelectTime?.(r.projectId, r.entryId!, r.itemId) : onSelectItem?.(r.projectId, r.itemId!))}
                className="flex items-center gap-2 rounded text-left"
                style={{ background: active ? "hsl(var(--surface-muted))" : "transparent" }}
                title={`${r.label} · ${r.project} · ${fmt(r.from)} – ${fmt(r.to)}`}
              >
                <span className="w-[38%] shrink-0 truncate text-[11px]">
                  {r.label}
                  <span className="ml-1 text-[10px]" style={{ color: SOFT }}>{r.project}</span>
                </span>
                <span className="relative h-4 flex-1 rounded" style={{ background: "hsl(var(--surface-muted))" }}>
                  <span
                    className="absolute top-0.5 rounded"
                    style={{
                      left: `${left(r.from)}%`,
                      width: r.point ? undefined : `${width(r.from, r.to)}%`,
                      height: r.point ? 12 : 12,
                      aspectRatio: r.point ? "1 / 1" : undefined,
                      borderRadius: r.point ? 999 : 4,
                      background: r.color,
                      opacity: r.period ? 0.7 : 1,
                      outline: active ? "2px solid hsl(var(--accent-gold))" : "none",
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </OpsZoomPane>
  );
}
