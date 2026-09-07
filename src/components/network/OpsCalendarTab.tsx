/**
 * Organisationsansicht mit Zeitachse.
 *
 * Datenquellen sind ausschließlich die vorhandenen Board-Beiträge und die
 * erfassten Arbeitszeiten. Geräte/Werkzeuge und Abwesenheiten sind aus der
 * Oberfläche entfernt (Daten in der Datenbank bleiben unangetastet).
 *
 * Über die Ansichtsauswahl wird der mittlere Bereich zwischen Kalender,
 * Ansichtstrahl, Projektnetz und Gantt-Diagramm umgeschaltet. Projekt- und
 * Personenfilter gelten für alle Ansichten.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { RangeCalendar, type CalEntry } from "@/components/calendar/RangeCalendar";
import {
  datesInRange,
  formatMinutes,
  isoDate,
  netMinutes,
  useTimeEntriesForProjects,
  OPS_STATUS_TEXT,
  type OpsStatus,
} from "@/lib/opsStore";
import {
  effectiveStatusId,
  isPeriodItem,
  subscribeTimeline,
  timelineStore,
  type TlItem,
} from "@/lib/timelineStore";
import { OpsGantt, OpsNet, OpsRay, OPS_VIEWS, type OpsBoard, type OpsView } from "@/components/ops/OpsViews";

const inputCls =
  "h-9 rounded-md border bg-background text-foreground px-2 text-xs outline-none focus:ring-1 focus:ring-ring [&>option]:bg-background [&>option]:text-foreground";
const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";

/** Beiträge kommen aus der bestehenden Board-Datenbasis – keine zweite Speicherung. */
function useProjectItems(projectIds: string[]) {
  const key = projectIds.join("|");
  const [, setTick] = useState(0);
  useEffect(() => {
    const ids = key ? key.split("|") : [];
    const offs = ids.map((id) => subscribeTimeline(id, () => setTick((t) => t + 1)));
    return () => offs.forEach((off) => off());
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (key ? key.split("|") : []).map((id) => ({ id, state: timelineStore.getState(id) })), [key, setTick]);
}

/** Stabile Projektfarbe (identisch zur Projektliste). */
function projectHue(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 55%)`;
}

export function OpsCalendarTab({
  projectIds,
  projectNames,
  peopleById,
  selectedDates,
  onSelectDate,
  hiddenProjects,
  onToggleProject,
  projectFilterAsDropdown = false,
  calendarDefaultRange = "month",
  onEditItem,
}: {
  projectIds: string[];
  projectNames: Map<string, string>;
  peopleById: Map<string, string>;
  /** Optional: Tagesauswahl von außen steuern (Beiträge des Tages). */
  selectedDates?: string[];
  onSelectDate?: (day: string) => void;
  /** Optional: Projekt-Sichtbarkeit kontrolliert von außen führen. */
  hiddenProjects?: Set<string>;
  onToggleProject?: (id: string) => void;
  /** Projekte als Auswahlliste in der Filterzeile statt als Schaltflächenreihe. */
  projectFilterAsDropdown?: boolean;
  /** Vorauswahl des Kalenderzeitraums beim ersten Öffnen. */
  calendarDefaultRange?: "month" | "week" | "day";
  /** Beitrag zum Bearbeiten öffnen. */
  onEditItem?: (projectId: string, itemId: string) => void;
}) {

  /* Nur ausgewählte Projekte laden – keine Komplettabfrage. */
  const [hiddenState, setHidden] = useState<Set<string>>(() => new Set());
  const hidden = hiddenProjects ?? hiddenState;
  const activeProjects = useMemo(
    () => projectIds.filter((id) => !hidden.has(id)),
    [projectIds, hidden],
  );

  const times = useTimeEntriesForProjects(activeProjects);
  const boards = useProjectItems(activeProjects);

  const [showTimes, setShowTimes] = useState(true);
  const [showItems, setShowItems] = useState(true);
  const [personFilter, setPersonFilter] = useState("");
  const [view, setView] = useState<OpsView>("calendar");

  const [projectMenu, setProjectMenu] = useState(false);

  /** Bereits nach Person gefilterte Beiträge – Grundlage aller Ansichten. */
  const filteredBoards: OpsBoard[] = useMemo(
    () =>
      boards.map((b) => ({
        id: b.id,
        name: projectNames.get(b.id) ?? "Projekt",
        color: projectHue(b.id),
        state: b.state,
        items: (b.state.items as TlItem[]).filter(
          (i) => !personFilter || (i.assignees ?? []).includes(personFilter),
        ),
      })),
    [boards, personFilter, projectNames],
  );

  const entries: CalEntry[] = useMemo(() => {
    const out: CalEntry[] = [];

    if (showTimes) {
      for (const e of times.entries) {
        if (personFilter && e.user_id !== personFilter) continue;
        const who = e.user_id === times.myId ? "Ich" : peopleById.get(e.user_id) ?? "Teammitglied";
        for (const day of datesInRange(isoDate(new Date(e.started_at)), isoDate(new Date(e.ended_at)))) {
          out.push({
            id: `time-${e.id}-${day}`,
            date: day,
            title: `${who}: ${formatMinutes(netMinutes(e))}`,
            sub: projectNames.get(e.project_id) ?? "Projekt",
            color: "#3f9c6a",
          });
        }
      }
    }

    if (showItems) {
      for (const board of filteredBoards) {
        for (const item of board.items) {
          const statusId = effectiveStatusId(item);
          const color = board.state.statuses.find((s) => s.id === statusId)?.color ?? "#c9a227";
          const open = onEditItem ? () => onEditItem(board.id, item.id) : undefined;

          // Projektzeitraum: nur Start- und Endmarkierung, kein Eintrag an
          // jedem Tag dazwischen. Gewöhnliche Beiträge bleiben unverändert.
          if (isPeriodItem(item)) {
            const start = item.startDate;
            const end = item.endDate || item.startDate;
            if (start) {
              out.push({ id: `period-start-${board.id}-${item.id}`, date: start, title: "Projektstart", sub: board.name, color, onOpen: open });
            }
            if (end && end !== start) {
              out.push({ id: `period-end-${board.id}-${item.id}`, date: end, title: "Projektende", sub: board.name, color, onOpen: open });
            }
            continue;
          }

          for (const day of datesInRange(item.startDate, item.endDate || item.startDate)) {
            out.push({
              id: `item-${board.id}-${item.id}-${day}`,
              date: day,
              title: item.title || "Beitrag",
              sub: board.name,
              color,
              onOpen: open,
            });
          }
        }
      }
    }

    return out;
  }, [times.entries, times.myId, peopleById, projectNames, showTimes, personFilter, filteredBoards, showItems, onEditItem]);

  const reloadAll = () => { times.reload(); };
  const sources: { label: string; status: OpsStatus }[] = [{ label: "Arbeitszeiten", status: times.status }];
  const broken = sources.filter((s) => s.status !== "ready" && s.status !== "loading");

  const toggleProject = (id: string) => {
    if (onToggleProject) { onToggleProject(id); return; }
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const people = Array.from(peopleById.entries());

  return (
    <div className="flex flex-col gap-3">
      {!!broken.length && (
        <div className="rounded-lg p-2.5 text-[11px] flex flex-wrap items-center gap-2"
             style={{ border: `1px solid ${LINE}`, color: SOFT }}>
          <div className="flex-1 min-w-[220px]">
            {`Arbeitszeiten – ${OPS_STATUS_TEXT[broken[0].status as Exclude<OpsStatus, "loading" | "ready">]}`}
            {" "}Beiträge werden weiterhin angezeigt.
          </div>
          <button onClick={reloadAll} className="h-8 px-2.5 rounded-md border" style={{ borderColor: LINE }}>
            Erneut laden
          </button>
        </div>
      )}
      {/* Datenebenen */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {([
          ["Beiträge", showItems, () => setShowItems((v) => !v), "#c9a227"],
          ["Arbeitszeiten", showTimes, () => setShowTimes((v) => !v), "#3f9c6a"],
        ] as [string, boolean, () => void, string][]).map(([label, on, toggle, color]) => (
          <button key={label} onClick={toggle} className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border"
                  style={{ borderColor: on ? color : LINE, color: on ? "hsl(var(--ink))" : SOFT }}>
            <span className="h-2 w-2 rounded-full" style={{ background: on ? color : "transparent", border: `1px solid ${color}` }} />
            {label}
          </button>
        ))}
      </div>

      {/* Projekte ein-/ausblenden (Schaltflächenreihe) */}
      {!projectFilterAsDropdown && projectIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {projectIds.map((id) => {
            const on = !hidden.has(id);
            return (
              <button key={id} onClick={() => toggleProject(id)} className="h-8 px-2.5 rounded-md border"
                      style={{ borderColor: on ? "hsl(var(--accent-gold))" : LINE, color: on ? "hsl(var(--ink))" : SOFT }}>
                {projectNames.get(id) ?? "Projekt"}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter: Projekte, Person, Ansicht */}
      <div className="flex flex-wrap items-center gap-2">
        {projectFilterAsDropdown && projectIds.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setProjectMenu((v) => !v)}
              className={`${inputCls} flex items-center gap-1.5`}
              title="Projekte ein-/ausblenden"
            >
              Projekte ({projectIds.length - projectIds.filter((id) => hidden.has(id)).length}/{projectIds.length})
              <ChevronDown size={12} />
            </button>
            {projectMenu && (
              <div
                className="absolute z-30 mt-1 min-w-[220px] max-h-64 overflow-y-auto rounded-md border p-1.5 shadow-lg"
                style={{ borderColor: LINE, background: "hsl(var(--surface-card))" }}
              >
                {projectIds.map((id) => (
                  <label key={id} className="flex items-center gap-2 px-1.5 py-1 text-[11px] cursor-pointer">
                    <input type="checkbox" checked={!hidden.has(id)} onChange={() => toggleProject(id)} />
                    <span className="truncate">{projectNames.get(id) ?? "Projekt"}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <select className={inputCls} value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
          <option value="">Alle Personen</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {/* Ansichtsauswahl – schaltet den mittleren Bereich tatsächlich um. */}
        <select
          className={inputCls}
          value={view}
          onChange={(e) => setView(e.target.value as OpsView)}
          title="Ansicht wählen"
        >
          {OPS_VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </div>

      {view === "calendar" && (
        <RangeCalendar
          entries={entries}
          selectedDates={selectedDates ?? []}
          onSelectDate={onSelectDate ?? (() => {})}
          defaultRange={calendarDefaultRange}
        />
      )}
      {view === "ray" && (
        <OpsRay boards={filteredBoards} times={timeMarks} selection={selection} onSelectItem={onEditItem} onSelectTime={onSelectTime} />
      )}
      {view === "net" && (
        <OpsNet boards={filteredBoards} selection={selection} onSelectItem={onEditItem} />
      )}
      {view === "gantt" && (
        <OpsGantt boards={filteredBoards} times={timeMarks} selection={selection} onSelectItem={onEditItem} onSelectTime={onSelectTime} />
      )}
    </div>
  );
}
