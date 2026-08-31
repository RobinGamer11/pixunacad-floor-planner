/**
 * Gemeinsame Organisationsansicht.
 *
 * Wird an zwei Stellen mit denselben Daten und derselben Bedienung verwendet:
 *   * Startseite → Organisation (projektübergreifend, alle Projekte)
 *   * Projekt → Organisation (nur das geöffnete Projekt im Projektfilter)
 *
 * Es werden ausschließlich vorhandene Stores verwendet (Board-Beiträge,
 * `time_entries`, `absences`, `devices`/`device_bookings`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import {
  timelineStore,
  subscribeTimeline,
  itemAchieved,
  taskAlert,
  type TlItem,
  type TlKind,
} from "@/lib/timelineStore";
import { OpsActionBar } from "@/components/ops/OpsActionBar";
import { OpsCalendarTab } from "@/components/network/OpsCalendarTab";
import { useProjectsMemberOptions } from "@/lib/projectTeam";
import {
  Collapsible,
  TimeInsights,
  DeviceInsights,
  CategoryInsights,
  usePeopleCount,
} from "@/components/ops/OpsInsights";
import { formatMinutes, netMinutes, useDevices, useTimeEntriesForProjects } from "@/lib/opsStore";

export interface OpsOverviewProject {
  id: string;
  name: string;
}

/** Stabile Projektfarbe – identisch zur bisherigen Darstellung. */
export function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 55%)`;
}

/**
 * Eine Zeile in „Projektstände“.
 * Kopf: Projektname, Projektstart/-ende und die insgesamt erfasste Arbeitszeit.
 * Aufgeklappt: Beiträge (Kategorien-Diagramm), Zeiterfassung und Geräte/Werkzeuge.
 */
function ProjectStandRow({
  project,
  open,
  onToggle,
  peopleById,
  onShowItem,
  /** Ohne Kopfzeile: Inhalt (die drei Reiter) wird direkt angezeigt. */
  headless = false,
}: {
  project: OpsOverviewProject;
  open: boolean;
  onToggle: () => void;
  peopleById?: Map<string, string>;
  onShowItem?: (item: TlItem) => void;
  headless?: boolean;
}) {
  const ids = useMemo(() => [project.id], [project.id]);
  const times = useTimeEntriesForProjects(ids);
  const peopleCount = usePeopleCount(ids);
  const devices = useDevices(project.id);
  const [tick, setTick] = useState(0);
  /** Reiter innerhalb einer Projektzeile – „Beiträge“ ist die Vorauswahl. */
  const [standTab, setStandTab] = useState<"items" | "time" | "dev">("items");

  useEffect(() => subscribeTimeline(project.id, () => setTick((t) => t + 1)), [project.id]);

  const state = useMemo(() => {
    try {
      return timelineStore.getState(project.id);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, tick]);

  const totalMinutes = useMemo(
    () => times.entries.reduce((s, e) => s + netMinutes(e), 0),
    [times.entries],
  );
  const items = state?.items ?? [];
  const deviceCount = devices.devices.filter((d) => !d.archived).length;

  return (
    <div
      className={headless ? "" : "rounded-lg border overflow-hidden"}
      style={headless ? undefined : { borderColor: "hsl(var(--hairline))" }}
    >
      {!headless && (
        <div className="flex items-center gap-3 px-3 py-2">
          <button type="button" onClick={onToggle} className="flex items-center gap-2 min-w-0 flex-1 text-left">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: projectColor(project.id) }} />
            <span className="min-w-0">
              <span className="block text-sm truncate">{project.name}</span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {(state?.period.start || "offen")} – {(state?.period.end || "offen")} · {formatMinutes(totalMinutes)} erfasst
              </span>
            </span>
          </button>
        </div>
      )}

      {(headless || open) && (
        <div className={`${headless ? "" : "px-3 pb-3"} flex flex-col gap-2`}>
          {/* Reiter nebeneinander – „Beiträge“ ist zuerst geöffnet. */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["items", "Beiträge", items.length],
              ["time", "Zeiterfassung", peopleCount],
              ["dev", "Geräte/Werkzeuge", deviceCount],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStandTab(id)}
                className="h-7 px-2.5 rounded-md border text-[11px]"
                style={{
                  borderColor: standTab === id ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  background: standTab === id ? "hsl(var(--accent-gold) / 0.14)" : "transparent",
                }}
              >
                {label} <span className="tabular-nums text-muted-foreground">({count})</span>
              </button>
            ))}
          </div>

          {standTab === "items" && (
            <CategoryInsights projectId={project.id} onSelectItem={(i) => onShowItem?.(i)} />
          )}
          {standTab === "time" && <TimeInsights projectIds={ids} peopleById={peopleById} />}
          {standTab === "dev" && <DeviceInsights projectIds={ids} peopleById={peopleById} />}
        </div>
      )}
    </div>
  );
}

export function OpsOverview({
  projects,
  fixedProjectId,
  title = "Organisation",
  subtitle = "projektübergreifend",
  showHeader = true,
  className = "px-10 py-7",
}: {
  projects: OpsOverviewProject[];
  /** Projektbereich: Aktionen sind fest auf dieses Projekt gesetzt. */
  fixedProjectId?: string;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
  className?: string;
}) {
  const calendarRef = useRef<HTMLDivElement>(null);
  // Gemeinsame Organisationsdaten (Kalender/Aktionen) neu laden, wenn etwas erfasst wurde.
  const [opsNonce, setOpsNonce] = useState(0);
  const opsProjectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const opsProjectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const { namesById: opsPeople } = useProjectsMemberOptions(opsProjectIds);
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(opsProjectIds));
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Board-Änderungen aller Projekte live übernehmen.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const offs = projects.map((p) => subscribeTimeline(p.id, () => setTick((t) => t + 1)));
    return () => offs.forEach((off) => off());
  }, [projects]);
  useEffect(() => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      projects.forEach((p) => next.add(p.id));
      return next;
    });
  }, [projects]);

  const toggle = (id: string) =>
    setActiveIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // Board-Einträge (Beiträge, Termine, Notizen) über die gewählten Projekte hinweg.
  type GTask = {
    id: string; projectId: string; projectName: string; title: string; kind: TlKind;
    date?: string; time?: string; done: boolean; alert: boolean; color: string; category?: string;
  };
  const gTasks: GTask[] = useMemo(() => {
    const now = Date.now();
    const out: GTask[] = [];
    projects.forEach((p) => {
      const color = projectColor(p.id);
      try {
        const st = timelineStore.getState(p.id);
        const cats = new Map(st.categories.map((c) => [c.id, c.label]));
        st.items.forEach((i) =>
          out.push({
            id: i.id,
            projectId: p.id,
            projectName: p.name,
            title: i.title,
            kind: i.kind,
            date: i.endDate || i.startDate,
            time: i.endTime || i.startTime,
            done: itemAchieved(i, now),
            alert: taskAlert(i, now),
            color,
            category: cats.get(i.categoryId ?? ""),
          }),
        );
      } catch { /* Projekt ohne Board-Daten */ }
    });
    return out.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.alert !== b.alert) return a.alert ? -1 : 1;
      return `${a.date ?? "9999"} ${a.time ?? "99:99"}`.localeCompare(`${b.date ?? "9999"} ${b.time ?? "99:99"}`);
    });
  }, [projects, tick]);

  /** Vorauswahl: immer der heutige Tag. */
  const [selectedDate, setSelectedDate] = useState<string | undefined>(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  /** Beitrag im Kalender darüber zeigen – kein Sprung in die Projekt-Orga. */
  const showInCalendar = (date?: string) => {
    if (!date) return;
    setSelectedDate(date);
    calendarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Ohne Tagesauswahl nur Aufgaben; mit Tagesauswahl alle Einträge des Tages.
  const visible = selectedDate
    ? gTasks
        .filter((t) => activeIds.has(t.projectId) && t.date === selectedDate)
        .sort((a, b) => (a.kind === "task" ? 1 : 0) - (b.kind === "task" ? 1 : 0))
    : gTasks.filter((t) => t.kind === "task" && activeIds.has(t.projectId));

  return (
    <div className={className}>
      {showHeader && (
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <span className="text-sm text-muted-foreground">{subtitle}</span>}
        </div>
      )}

      {/* Aktionen – dieselben Daten wie im Projektbereich. */}
      <div className={fixedProjectId ? "mt-4 mb-4" : "mb-4"}>
        <OpsActionBar
          projects={projects}
          fixedProjectId={fixedProjectId}
          showContribution
          onChanged={() => setOpsNonce((n) => n + 1)}
        />
      </div>

      {/* Kalender: Beiträge, Arbeitszeiten, Abwesenheiten, Buchungen. */}
      <div ref={calendarRef} className="mb-6 rounded-xl border p-3"
           style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}>
        <OpsCalendarTab
          key={opsNonce}
          projectIds={opsProjectIds}
          projectNames={opsProjectNames}
          peopleById={opsPeople}
          selectedDates={selectedDate ? [selectedDate] : []}
          onSelectDate={(d) => setSelectedDate((prev) => (prev === d ? undefined : d))}
          hiddenProjects={new Set(opsProjectIds.filter((id) => !activeIds.has(id)))}
          onToggleProject={toggle}
          allowAbsenceEntry={false}
          projectFilterAsDropdown
        />
      </div>

      <div className="space-y-6">
        {/* Beiträge – standardmäßig eingeklappt */}
        <Collapsible
          title={`ALLE BEITRÄGE${selectedDate ? ` · ${selectedDate}` : ` · ${visible.length}`}`}
          right={selectedDate ? (
            <button onClick={() => setSelectedDate(undefined)} className="text-[11px] text-muted-foreground hover:text-foreground">
              Filter zurücksetzen
            </button>
          ) : undefined}
        >
          {visible.length === 0 ? (
            <div className="py-3 text-sm text-muted-foreground">Keine offenen Beiträge.</div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
              {visible.map((t) => (
                <li key={`${t.projectId}:${t.id}`} className="py-2.5 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.done}
                    title="Erledigt"
                    onChange={() => {
                      timelineStore.updateItem(t.projectId, t.id, {
                        statusId: t.done ? "open" : "done",
                        done: !t.done,
                        statusManual: true,
                      });
                      timelineStore.markFresh(t.projectId, t.id);
                    }}
                    className="accent-foreground"
                  />
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                  <button
                    onClick={() => showInCalendar(t.date)}
                    className="flex-1 min-w-0 text-left"
                    title="Im Kalender anzeigen"
                  >
                    <div className={`text-sm truncate flex items-center gap-2 ${t.done ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: "hsl(var(--surface-muted))", color: "hsl(var(--ink-soft))" }}>
                        {t.kind === "task" ? "Beitrag" : t.kind === "event" ? "Termin" : "Notiz"}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {t.projectName}{t.category ? ` · ${t.category}` : ""}{t.date ? ` · ${t.date}` : ""}{t.time ? ` · ${t.time}` : ""}
                    </div>
                  </button>
                  <button
                    onClick={() => showInCalendar(t.date)}
                    title="Im Kalender anzeigen"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <CalendarDays size={14} />
                  </button>
                  {t.alert && !t.done && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: "hsl(0 70% 50% / 0.15)", color: "hsl(0 70% 40%)" }}>
                      Überfällig
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Collapsible>

        {/* Allgemeines: alle Geräte/Werkzeuge und ihre Gesamtnutzung */}
        <Collapsible title="ALLGEMEINES">
          <DeviceInsights projectNames={opsProjectNames} peopleById={opsPeople} />
        </Collapsible>

        {/* Projektstände */}
        <div className="rounded-xl border p-4" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}>
          <div className="text-xs font-semibold tracking-widest text-muted-foreground mb-3">PROJEKTSTÄNDE</div>
          <div className="space-y-2">
            {projects.map((p) => (
              <ProjectStandRow
                key={p.id}
                project={p}
                open={previewId === p.id}
                onToggle={() => setPreviewId((cur) => (cur === p.id ? null : p.id))}
                peopleById={opsPeople}
                onShowItem={(i) => showInCalendar(i.endDate || i.startDate)}
              />
            ))}
            {projects.length === 0 && <div className="text-sm text-muted-foreground">Keine Projekte.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OpsOverview;
