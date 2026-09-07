/**
 * Zusätzliche Organisationsansichten (Ansichtstrahl, Projektnetz, Gantt).
 *
 * Alle drei arbeiten mit genau denselben Board-Beiträgen wie der Kalender –
 * es entstehen keine Kopien der Datensätze. Projekt- und Personenfilter
 * werden von der aufrufenden Ansicht bereits angewendet.
 */
import { useMemo } from "react";
import { TimelineNet } from "@/components/board/TimelineNet";
import { isPeriodItem, type TlItem, type TlState } from "@/lib/timelineStore";

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

const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";

const dayMs = 86_400_000;
const parse = (d?: string) => (d ? Date.parse(`${d}T00:00:00`) : NaN);
const fmt = (t: number) =>
  new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

function statusColor(board: OpsBoard, item: TlItem) {
  return board.state.statuses.find((s) => s.id === (item.statusId ?? "open"))?.color ?? board.color;
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-[12px]" style={{ color: SOFT }}>{text}</div>;
}

/* ------------------------------------------------------------ Ansichtstrahl */

export function OpsRay({ boards, onSelect }: { boards: OpsBoard[]; onSelect?: (projectId: string, itemId: string) => void }) {
  const points = useMemo(() => {
    const out: { key: string; projectId: string; itemId: string; t: number; title: string; color: string; project: string }[] = [];
    for (const b of boards) {
      for (const i of b.items) {
        const t = parse(i.endDate || i.startDate);
        if (!Number.isFinite(t)) continue;
        out.push({ key: `${b.id}:${i.id}`, projectId: b.id, itemId: i.id, t, title: i.title || "Beitrag", color: statusColor(b, i), project: b.name });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }, [boards]);

  if (!points.length) return <Empty text="Keine Beiträge im aktuellen Filter." />;

  const min = Math.min(...points.map((p) => p.t), Date.now());
  const max = Math.max(...points.map((p) => p.t), Date.now());
  const span = Math.max(dayMs, max - min);
  const pos = (t: number) => ((t - min) / span) * 100;

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: LINE }}>
      <div className="relative h-[220px]">
        <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: LINE }} />
        <div className="absolute top-1/2 h-4 w-px -translate-y-1/2" style={{ left: `${pos(Date.now())}%`, background: "hsl(var(--accent-gold))" }} />
        {points.map((p, idx) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect?.(p.projectId, p.itemId)}
            className="absolute -translate-x-1/2 flex flex-col items-center gap-1"
            style={{ left: `${pos(p.t)}%`, top: idx % 2 ? "calc(50% + 10px)" : undefined, bottom: idx % 2 ? undefined : "calc(50% + 10px)" }}
            title={`${p.title} · ${p.project} · ${fmt(p.t)}`}
          >
            {idx % 2 === 0 && (
              <span className="max-w-[120px] truncate text-[10px]" style={{ color: SOFT }}>{p.title}</span>
            )}
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            {idx % 2 === 1 && (
              <span className="max-w-[120px] truncate text-[10px]" style={{ color: SOFT }}>{p.title}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: SOFT }}>
        <span>{fmt(min)}</span>
        <span>{fmt(max)}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Projektnetz */

export function OpsNet({ boards, onSelect }: { boards: OpsBoard[]; onSelect?: (projectId: string, itemId: string) => void }) {
  if (!boards.length) return <Empty text="Keine Projekte im aktuellen Filter." />;
  return (
    <div className={`grid gap-3 ${boards.length > 1 ? "md:grid-cols-2" : ""}`}>
      {boards.map((b) => (
        <div key={b.id} className="h-[420px] overflow-hidden rounded-xl" style={{ border: `1px solid ${LINE}` }}>
          <TimelineNet
            projectName={b.name}
            items={b.items}
            categories={b.state.categories}
            statuses={b.state.statuses}
            onSelect={(id) => onSelect?.(b.id, id)}
          />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Gantt */

export function OpsGantt({ boards, onSelect }: { boards: OpsBoard[]; onSelect?: (projectId: string, itemId: string) => void }) {
  const rows = useMemo(() => {
    const out: { key: string; projectId: string; itemId: string; label: string; project: string; color: string; from: number; to: number; period: boolean }[] = [];
    for (const b of boards) {
      for (const i of b.items) {
        const from = parse(i.startDate);
        if (!Number.isFinite(from)) continue;
        const to = Number.isFinite(parse(i.endDate)) ? parse(i.endDate) : from;
        out.push({
          key: `${b.id}:${i.id}`,
          projectId: b.id,
          itemId: i.id,
          label: i.title || "Beitrag",
          project: b.name,
          color: statusColor(b, i),
          from,
          to: Math.max(to, from),
          // Der Projektzeitraum bleibt hier ein durchgehender Balken.
          period: isPeriodItem(i),
        });
      }
    }
    return out.sort((a, b) => a.from - b.from);
  }, [boards]);

  if (!rows.length) return <Empty text="Keine Beiträge im aktuellen Filter." />;

  const min = Math.min(...rows.map((r) => r.from));
  const max = Math.max(...rows.map((r) => r.to + dayMs));
  const span = Math.max(dayMs, max - min);
  const left = (t: number) => ((t - min) / span) * 100;
  const width = (a: number, b: number) => Math.max(1.5, ((b + dayMs - a) / span) * 100);
  const nowLeft = left(Date.now());

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: LINE }}>
      <div className="mb-2 flex justify-between text-[10px]" style={{ color: SOFT }}>
        <span>{fmt(min)}</span>
        <span>{fmt(max - dayMs)}</span>
      </div>
      <div className="relative flex flex-col gap-1">
        {nowLeft >= 0 && nowLeft <= 100 && (
          <div className="pointer-events-none absolute bottom-0 top-0 w-px" style={{ left: `calc(40% + ${nowLeft * 0.6}%)`, background: "hsl(var(--accent-gold))" }} />
        )}
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onSelect?.(r.projectId, r.itemId)}
            className="flex items-center gap-2 text-left"
            title={`${r.label} · ${r.project} · ${fmt(r.from)} – ${fmt(r.to)}`}
          >
            <span className="w-[40%] shrink-0 truncate text-[11px]">
              {r.label}
              <span className="ml-1 text-[10px]" style={{ color: SOFT }}>{r.project}</span>
            </span>
            <span className="relative h-4 flex-1 rounded" style={{ background: "hsl(var(--surface-muted))" }}>
              <span
                className="absolute top-0.5 h-3 rounded"
                style={{
                  left: `${left(r.from)}%`,
                  width: `${width(r.from, r.to)}%`,
                  background: r.color,
                  opacity: r.period ? 0.55 : 1,
                }}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
