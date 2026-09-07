/**
 * Gemeinsame Organisationsansicht.
 *
 * Wird an zwei Stellen mit denselben Daten und derselben Bedienung verwendet:
 *   * Startseite → Allg. Organisation (projektübergreifend, alle Projekte)
 *   * Projekt → Organisation (nur das geöffnete Projekt)
 *
 * Aufbau (eine einzige Oberfläche, keine zweite Parallelansicht):
 *   1. Kopf: Titel der aktiven Ansicht, „+ Beitrag“, Ansichtsauswahl
 *   2. Hauptbereich: Kalender / Ansichtstrahl / Projektnetz / Gantt
 *   3. „Mein Überblick“: anklickbare Karten mit echten Werten
 *   4. Darunter links die zur Karte passende Liste, rechts das Kreisdiagramm
 *      mit „+ Kategorie“ und „+ Priorität“.
 *
 * Es werden ausschließlich vorhandene Stores verwendet (Board-Beiträge,
 * `time_entries`). Geräte/Werkzeuge und Abwesenheiten sind aus der
 * Oberfläche entfernt.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Filter as FilterIcon, Layers, ListChecks } from "lucide-react";
import {
  timelineStore,
  subscribeTimeline,
  effectiveStatusId,
  itemAchieved,
  taskAlert,
  type TlCategory,
  type TlItem,
  type TlPriority,
  type TlStatus,
} from "@/lib/timelineStore";
import { OpsActionBar } from "@/components/ops/OpsActionBar";
import { OpsCalendarTab } from "@/components/network/OpsCalendarTab";
import { OPS_VIEWS, type OpsView } from "@/components/ops/OpsViews";
import { useProjectsMemberOptions } from "@/lib/projectTeam";
import { Legend, MiniPie, insightColor } from "@/components/ops/OpsInsights";
import { formatMinutes, netMinutes, useTimeEntriesForProjects } from "@/lib/opsStore";
import { OpsItemEditDialog } from "@/components/ops/OpsItemEditDialog";
import { CategoryManagerDialog, PriorityManagerDialog } from "@/components/ops/OpsTaxonomyDialogs";
import {
  isItemSelected,
  isTimeSelected,
  matchesQuery,
  priorityRank,
  sameSelection,
  OPS_SORTS,
  type OpsSelection,
  type OpsSort,
} from "@/components/ops/opsSelection";

export interface OpsOverviewProject {
  id: string;
  name: string;
}

const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";
const GOLD = "hsl(var(--accent-gold))";
const CARD = "hsl(var(--surface-card))";

const inputCls =
  "h-11 rounded-md border bg-background text-foreground px-2 text-xs outline-none focus:ring-1 focus:ring-ring [&>option]:bg-background [&>option]:text-foreground";

/** Stabile Projektfarbe – identisch zur bisherigen Darstellung. */
export function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 55%)`;
}

type CardId = "items" | "time" | "projects" | "filter";

interface OpsFilters {
  person: string;
  category: string;
  priority: string;
  status: string;
  query: string;
}

const EMPTY_FILTERS: OpsFilters = { person: "", category: "", priority: "", status: "", query: "" };

const fmtDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
};
const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/* --------------------------------------------------------- Überblickskarte */

function SummaryCard({
  icon,
  label,
  value,
  hint,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[76px] min-w-[220px] flex-1 items-center gap-3 rounded-xl border px-3 py-3 text-left"
      style={{
        borderColor: active ? GOLD : LINE,
        background: active ? "hsl(var(--accent-gold) / 0.12)" : CARD,
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "hsl(var(--surface-muted))", color: active ? GOLD : "hsl(var(--ink))" }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11px]" style={{ color: SOFT }}>{label}</span>
        <span className="block truncate text-lg font-semibold tabular-nums">{value}</span>
        <span className="block truncate text-[11px]" style={{ color: SOFT }}>{hint}</span>
      </span>
    </button>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: LINE, background: "hsl(var(--surface))" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Haupt */

export function OpsOverview({
  projects,
  fixedProjectId,
  title = "Organisation projektübergreifend",
  subtitle = "Beiträge, Zeiten und Termine auf einen Blick.",
  showHeader = true,
  className = "px-4 py-5 sm:px-6 lg:px-10 lg:py-7",
}: {
  projects: OpsOverviewProject[];
  /** Projektbereich: Aktionen sind fest auf dieses Projekt gesetzt. */
  fixedProjectId?: string;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
  className?: string;
}) {

  const viewRef = useRef<HTMLDivElement>(null);
  const [opsNonce, setOpsNonce] = useState(0);
  const opsProjectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const opsProjectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const { namesById: opsPeople } = useProjectsMemberOptions(opsProjectIds);

  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(opsProjectIds));
  const [editing, setEditing] = useState<{ projectId: string; itemId: string } | null>(null);
  const [selection, setSelection] = useState<OpsSelection>(null);
  const [taxonomy, setTaxonomy] = useState<{ kind: "category" | "priority"; projectId?: string } | null>(null);
  /** Zuletzt gewählte Ansicht bleibt während der Arbeit erhalten. */
  const [view, setView] = useState<OpsView>("calendar");
  const [card, setCard] = useState<CardId>("items");
  const [filters, setFilters] = useState<OpsFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<OpsSort>("priority");
  const [showAllItems, setShowAllItems] = useState(false);
  const [timePie, setTimePie] = useState<"project" | "person">(fixedProjectId ? "person" : "project");
  const [showItems, setShowItems] = useState(true);
  const [showTimes, setShowTimes] = useState(true);

  const setFilter = (patch: Partial<OpsFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const openItem = (projectId: string, itemId: string) => {
    setSelection((cur) =>
      sameSelection(cur, { kind: "item", projectId, itemId }) ? cur : { kind: "item", projectId, itemId },
    );
    setEditing({ projectId, itemId });
  };
  const selectTime = (projectId: string, entryId: string, itemId?: string) =>
    setSelection({ kind: "time", projectId, entryId, itemId });

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

  const toggleProject = (id: string) =>
    setActiveIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const visibleIds = useMemo(
    () => opsProjectIds.filter((id) => activeIds.has(id)),
    [opsProjectIds, activeIds],
  );
  const hiddenProjects = useMemo(
    () => new Set(opsProjectIds.filter((id) => !activeIds.has(id))),
    [opsProjectIds, activeIds],
  );

  /* ------------------------------------------------- Beiträge (Board-Daten) */

  type Row = {
    id: string;
    projectId: string;
    projectName: string;
    item: TlItem;
    catLabel?: string;
    catColor: string;
    prioLabel?: string;
    statusLabel?: string;
    statusColor: string;
    people: string;
    done: boolean;
    alert: boolean;
  };

  const boardMeta = useMemo(() => {
    const categories = new Map<string, TlCategory>();
    const priorities = new Map<string, TlPriority>();
    const statuses = new Map<string, TlStatus>();
    const rows: Row[] = [];
    const now = Date.now();
    for (const p of projects) {
      if (!activeIds.has(p.id)) continue;
      let st;
      try { st = timelineStore.getState(p.id); } catch { continue; }
      st.categories.forEach((c) => { if (!categories.has(c.id)) categories.set(c.id, c); });
      st.priorities.forEach((c) => { if (!priorities.has(c.id)) priorities.set(c.id, c); });
      st.statuses.forEach((c) => { if (!statuses.has(c.id)) statuses.set(c.id, c); });
      for (const item of st.items as TlItem[]) {
        const statusId = effectiveStatusId(item);
        rows.push({
          id: `${p.id}:${item.id}`,
          projectId: p.id,
          projectName: p.name,
          item,
          catLabel: st.categories.find((c) => c.id === item.categoryId)?.label,
          catColor: st.categories.find((c) => c.id === item.categoryId)?.color ?? SOFT,
          prioLabel: st.priorities.find((c) => c.id === item.priorityId)?.label,
          statusLabel: st.statuses.find((s) => s.id === statusId)?.label,
          statusColor: st.statuses.find((s) => s.id === statusId)?.color ?? SOFT,
          people: (item.assignees ?? []).map((id) => opsPeople.get(id) ?? "Teammitglied").join(", ")
            || item.responsible || "",
          done: itemAchieved(item, now),
          alert: taskAlert(item, now),
        });
      }
    }
    return {
      rows,
      categories: Array.from(categories.values()),
      priorities: Array.from(priorities.values()),
      statuses: Array.from(statuses.values()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, activeIds, tick, opsPeople]);

  const itemFilter = useMemo(() => {
    const f = filters;
    return (i: TlItem) => {
      if (f.category && i.categoryId !== f.category) return false;
      if (f.priority && i.priorityId !== f.priority) return false;
      if (f.status && effectiveStatusId(i) !== f.status) return false;
      if (!matchesQuery(i, f.query)) return false;
      return true;
    };
  }, [filters]);

  const filteredRows = useMemo(() => {
    const list = boardMeta.rows
      .filter((r) => !filters.person || (r.item.assignees ?? []).includes(filters.person))
      .filter((r) => itemFilter(r.item));
    return list.sort((a, b) => {
      if (sort === "priority") {
        const d = priorityRank(boardMeta.priorities, a.item.priorityId) - priorityRank(boardMeta.priorities, b.item.priorityId);
        if (d) return d;
      } else {
        const ai = boardMeta.categories.findIndex((c) => c.id === a.item.categoryId);
        const bi = boardMeta.categories.findIndex((c) => c.id === b.item.categoryId);
        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      }
      return (a.item.startDate ?? "").localeCompare(b.item.startDate ?? "");
    });
  }, [boardMeta, filters.person, itemFilter, sort]);

  /* --------------------------------------------------------- Arbeitszeiten */

  const times = useTimeEntriesForProjects(visibleIds);
  const timeRows = useMemo(
    () =>
      times.entries
        .filter((e) => !filters.person || e.user_id === filters.person)
        .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)),
    [times.entries, filters.person],
  );
  const totalMinutes = useMemo(() => timeRows.reduce((s, e) => s + netMinutes(e), 0), [timeRows]);

  const itemTitle = (projectId: string, itemId?: string | null) => {
    if (!itemId) return "";
    return boardMeta.rows.find((r) => r.projectId === projectId && r.item.id === itemId)?.item.title ?? "";
  };
  const personName = (id: string) => (id === times.myId ? "Ich" : opsPeople.get(id) ?? "Teammitglied");

  /* --------------------------------------------------------------- Kalender */

  const [selectedDate, setSelectedDate] = useState<string | undefined>(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });

  /* ------------------------------------------------------------ Diagramme */

  const pie = useMemo(() => {
    if (card === "time") {
      const map = new Map<string, number>();
      for (const e of timeRows) {
        const key = timePie === "project" ? e.project_id : e.user_id;
        map.set(key, (map.get(key) ?? 0) + netMinutes(e));
      }
      const rows = Array.from(map.entries())
        .map(([id, minutes], idx) => ({
          id,
          label: timePie === "project" ? opsProjectNames.get(id) ?? "Projekt" : personName(id),
          color: timePie === "project" ? projectColor(id) : insightColor(idx),
          value: minutes,
          text: formatMinutes(minutes),
        }))
        .sort((a, b) => b.value - a.value);
      return {
        title: timePie === "project" ? "Zeiten nach Projekt" : "Arbeitszeiten nach Personen",
        rows,
        center: formatMinutes(totalMinutes),
        centerHint: "erfasst",
      };
    }
    const map = new Map<string, number>();
    for (const r of filteredRows) map.set(r.item.categoryId ?? "", (map.get(r.item.categoryId ?? "") ?? 0) + 1);
    const rows = boardMeta.categories
      .map((c) => ({ id: c.id, label: c.label, color: c.color, value: map.get(c.id) ?? 0, text: String(map.get(c.id) ?? 0) }))
      .filter((r) => r.value > 0);
    const ohne = map.get("") ?? 0;
    if (ohne) rows.push({ id: "", label: "Ohne Kategorie", color: SOFT, value: ohne, text: String(ohne) });
    return {
      title: "Beiträge nach Kategorien",
      rows,
      center: String(filteredRows.length),
      centerHint: "Beiträge",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, timePie, timeRows, filteredRows, boardMeta.categories, totalMinutes, opsProjectNames, opsPeople, times.myId]);

  const pieTotal = pie.rows.reduce((s, r) => s + r.value, 0);
  const activeFilterCount = Object.entries(filters).filter(([, v]) => v).length;
  const viewLabel = OPS_VIEWS.find((v) => v.id === view)?.label ?? "Organisation";

  /** Alle wirksamen Einschränkungen – auch Zeitraum und Projektauswahl. */
  const hiddenProjectCount = fixedProjectId ? 0 : hiddenProjects.size;
  const anyFilterActive =
    activeFilterCount > 0 || !!selectedDate || hiddenProjectCount > 0 || !showItems || !showTimes;
  const resetAllFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSelectedDate(undefined);
    setActiveIds(new Set(opsProjectIds));
    setShowItems(true);
    setShowTimes(true);
  };
  const resetButton = anyFilterActive ? (
    <button
      type="button"
      onClick={resetAllFilters}
      className="h-12 min-w-[44px] rounded-xl border px-5 text-sm font-semibold shadow-sm transition hover:opacity-90"
      style={{ borderColor: GOLD, background: "hsl(var(--accent-gold) / 0.18)", color: "hsl(var(--ink))" }}
    >
      Filter zurücksetzen
    </button>
  ) : null;

  const taxonomyProject = taxonomy?.projectId ?? fixedProjectId;

  /* ------------------------------------------------------------------- UI */

  return (
    <div className={className}>
      {/* 1. Kopfbereich */}
      <div className="mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0">
            {showHeader && (
              <>
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
              </>
            )}
            <div className={`${showHeader ? "mt-5" : ""} text-base font-medium`}>{viewLabel}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <select
              className={`${inputCls} h-12 min-w-[170px]`}
              value={view}
              onChange={(e) => setView(e.target.value as OpsView)}
              title="Ansicht wählen"
              aria-label="Ansicht"
            >
              {OPS_VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OpsActionBar
            projects={projects}
            fixedProjectId={fixedProjectId}
            onChanged={() => setOpsNonce((n) => n + 1)}
          />
        </div>
      </div>


      {/* 2. Hauptansicht */}
      <div ref={viewRef} className="mb-5 rounded-xl border p-2 sm:p-3"
           style={{ borderColor: LINE, background: "hsl(var(--surface))" }}>
        <OpsCalendarTab
          key={opsNonce}
          projectIds={opsProjectIds}
          projectNames={opsProjectNames}
          peopleById={opsPeople}
          selectedDates={selectedDate ? [selectedDate] : []}
          onSelectDate={(d) => setSelectedDate((prev) => (prev === d ? undefined : d))}
          hiddenProjects={hiddenProjects}
          onToggleProject={toggleProject}
          calendarDefaultRange="week"
          onEditItem={openItem}
          onSelectTime={selectTime}
          selection={selection}
          view={view}
          onViewChange={setView}
          personFilter={filters.person}
          onPersonFilterChange={(id) => setFilter({ person: id })}
          itemFilter={itemFilter}
          showItems={showItems}
          showTimes={showTimes}
          showToolbar={false}
        />
      </div>

      {/* 3. Mein Überblick */}
      <div className="mb-4">
        <h2 className="mb-2 text-sm font-semibold">Mein Überblick</h2>
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">
          <SummaryCard
            icon={<ListChecks size={18} />}
            label="Beiträge"
            value={String(filteredRows.length)}
            hint={activeFilterCount ? "im aktuellen Filter" : "insgesamt sichtbar"}
            active={card === "items"}
            onClick={() => setCard("items")}
          />
          <SummaryCard
            icon={<Clock size={18} />}
            label="Arbeitszeiten"
            value={formatMinutes(totalMinutes)}
            hint={`${timeRows.length} Erfassungen`}
            active={card === "time"}
            onClick={() => setCard("time")}
          />
          {!fixedProjectId ? (
            <SummaryCard
              icon={<Layers size={18} />}
              label="Projekte ein-/ausblenden"
              value={`${visibleIds.length} / ${opsProjectIds.length}`}
              hint="Projekte sichtbar"
              active={card === "projects"}
              onClick={() => setCard("projects")}
            />
          ) : (
            <div className="flex min-h-[76px] min-w-[220px] flex-1 items-center gap-3 rounded-xl border px-3 py-3"
                 style={{ borderColor: LINE, background: CARD }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "hsl(var(--surface-muted))" }}>
                <Layers size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px]" style={{ color: SOFT }}>Projekt</span>
                <span className="block truncate text-sm font-semibold">
                  {opsProjectNames.get(fixedProjectId) ?? "Aktuelles Projekt"}
                </span>
                <span className="block text-[11px]" style={{ color: SOFT }}>nur dieses Projekt</span>
              </span>
            </div>
          )}
          <SummaryCard
            icon={<FilterIcon size={18} />}
            label="Filter"
            value={activeFilterCount ? `${activeFilterCount} aktiv` : "Keine aktiv"}
            hint={activeFilterCount ? "Filter angewendet" : "Alle Einträge"}
            active={card === "filter"}
            onClick={() => setCard("filter")}
          />
        </div>
      </div>

      {/* 4. Liste (links) und Diagramm (rechts) */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {card === "items" && (
            <Panel
              title="Aktuelle Beiträge"
              right={
                <>
                  {resetButton}

                  <select value={sort} onChange={(e) => setSort(e.target.value as OpsSort)}
                          className={inputCls} style={{ borderColor: LINE }} aria-label="Sortierung">
                    {OPS_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowAllItems((v) => !v)}
                          className="h-11 rounded-md px-3 text-[12px]" style={{ color: GOLD }}>
                    {showAllItems ? "Weniger anzeigen" : "Alle anzeigen"}
                  </button>
                </>
              }
            >
              <div className="flex flex-col gap-1.5">
                {(showAllItems ? filteredRows : filteredRows.slice(0, 8)).map((r) => {
                  const on = isItemSelected(selection, r.projectId, r.item.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openItem(r.projectId, r.item.id)}
                      className="flex min-h-[52px] items-center gap-3 rounded-lg border px-3 py-2 text-left"
                      style={{
                        borderColor: on ? GOLD : LINE,
                        background: on ? "hsl(var(--accent-gold) / 0.12)" : "transparent",
                      }}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.catColor }} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${r.done ? "line-through" : ""}`}>
                          {r.item.title || "Ohne Titel"}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color: SOFT }}>
                          {[r.projectName, r.catLabel, fmtDate(r.item.startDate),
                            r.item.startTime ? `${r.item.startTime}${r.item.endTime ? `–${r.item.endTime}` : ""}` : "",
                            r.people].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {r.prioLabel && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                              style={{ border: `1px solid ${LINE}`, color: SOFT }}>
                          {r.prioLabel}
                        </span>
                      )}
                      {r.statusLabel && (
                        <span className="hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] sm:inline"
                              style={{ background: `${r.statusColor}22`, color: r.statusColor }}>
                          {r.statusLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
                {!filteredRows.length && (
                  <div className="py-4 text-[12px]" style={{ color: SOFT }}>
                    Keine Beiträge im aktuellen Filter.
                  </div>
                )}
              </div>
            </Panel>
          )}

          {card === "time" && (
            <Panel title="Aktuelle Arbeitszeiten" right={resetButton}>
              <div className="flex flex-col gap-1.5">
                {timeRows.slice(0, 200).map((e) => {
                  const on = isTimeSelected(selection, e.id);
                  const beitrag = itemTitle(e.project_id, e.item_id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => selectTime(e.project_id, e.id, e.item_id ?? undefined)}
                      className="flex min-h-[52px] items-center gap-3 rounded-lg border px-3 py-2 text-left"
                      style={{
                        borderColor: on ? GOLD : LINE,
                        background: on ? "hsl(var(--accent-gold) / 0.12)" : "transparent",
                      }}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: projectColor(e.project_id) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">
                          {personName(e.user_id)}{beitrag ? ` · ${beitrag}` : ""}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color: SOFT }}>
                          {[opsProjectNames.get(e.project_id) ?? "Projekt",
                            `${fmtDate(e.started_at)} ${fmtClock(e.started_at)}–${fmtClock(e.ended_at)}`,
                            e.note || ""].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[12px]">{formatMinutes(netMinutes(e))}</span>
                    </button>
                  );
                })}
                {!timeRows.length && (
                  <div className="py-4 text-[12px]" style={{ color: SOFT }}>Noch keine Arbeitszeit erfasst.</div>
                )}
              </div>
            </Panel>
          )}

          {card === "projects" && !fixedProjectId && (
            <Panel
              title="Projekte ein-/ausblenden"
              right={
                <button type="button" onClick={() => setActiveIds(new Set(opsProjectIds))}
                        className="h-11 rounded-md border px-3 text-[12px]" style={{ borderColor: LINE }}>
                  Alle anzeigen
                </button>
              }
            >
              <div className="grid gap-1.5 sm:grid-cols-2">
                {projects.map((p) => {
                  const on = activeIds.has(p.id);
                  return (
                    <label key={p.id}
                           className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
                           style={{ borderColor: on ? GOLD : LINE }}>
                      <input type="checkbox" checked={on} onChange={() => toggleProject(p.id)} className="accent-foreground" />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: projectColor(p.id) }} />
                      <span className="truncate">{p.name}</span>
                    </label>
                  );
                })}
                {!projects.length && <div className="text-[12px]" style={{ color: SOFT }}>Keine Projekte.</div>}
              </div>
            </Panel>
          )}

          {card === "filter" && (
            <Panel
              title="Filter"
              right={
                <button type="button" onClick={resetAllFilters}
                        className="h-11 rounded-md border px-3 text-[12px]" style={{ borderColor: LINE }}>
                  Alle Filter zurücksetzen
                </button>
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={filters.query}
                  onChange={(e) => setFilter({ query: e.target.value })}
                  placeholder="Beiträge durchsuchen"
                  className={`${inputCls} w-full`}
                  style={{ borderColor: LINE }}
                />
                <select className={`${inputCls} w-full`} value={filters.person}
                        onChange={(e) => setFilter({ person: e.target.value })} aria-label="Person">
                  <option value="">Alle Personen</option>
                  {Array.from(opsPeople.entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select className={`${inputCls} w-full`} value={filters.category}
                        onChange={(e) => setFilter({ category: e.target.value })} aria-label="Kategorie">
                  <option value="">Alle Kategorien</option>
                  {boardMeta.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select className={`${inputCls} w-full`} value={filters.priority}
                        onChange={(e) => setFilter({ priority: e.target.value })} aria-label="Priorität">
                  <option value="">Alle Prioritäten</option>
                  {boardMeta.priorities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select className={`${inputCls} w-full`} value={filters.status}
                        onChange={(e) => setFilter({ status: e.target.value })} aria-label="Status">
                  <option value="">Alle Status</option>
                  {boardMeta.statuses.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div className="flex flex-wrap items-center gap-2">
                  {([["Beiträge", showItems, () => setShowItems((v) => !v)],
                     ["Arbeitszeiten", showTimes, () => setShowTimes((v) => !v)]] as [string, boolean, () => void][])
                    .map(([label, on, toggle]) => (
                      <button key={label} type="button" onClick={toggle}
                              className="h-11 rounded-md border px-3 text-[12px]"
                              style={{ borderColor: on ? GOLD : LINE, color: on ? "hsl(var(--ink))" : SOFT }}>
                        {label}
                      </button>
                    ))}
                </div>
              </div>
              {selectedDate && (
                <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: SOFT }}>
                  <CalendarDays size={13} /> Gewählter Tag: {fmtDate(selectedDate)}
                  <button type="button" onClick={() => setSelectedDate(undefined)} style={{ color: GOLD }}>
                    zurücksetzen
                  </button>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Kreisdiagramm + Kategorien/Prioritäten */}
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title={pie.title}
            right={
              card === "time" && !fixedProjectId ? (
                <select className={inputCls} value={timePie}
                        onChange={(e) => setTimePie(e.target.value as "project" | "person")} aria-label="Auswertung">
                  <option value="project">nach Projekt</option>
                  <option value="person">nach Personen</option>
                </select>
              ) : undefined
            }
          >
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <MiniPie size={200} slices={pie.rows.map((r) => ({ id: r.id, value: r.value, color: r.color }))} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base font-semibold tabular-nums">{pie.center}</span>
                  <span className="text-[10px]" style={{ color: SOFT }}>{pie.centerHint}</span>
                </div>
              </div>
              <div className="w-full">
                <Legend
                  rows={pie.rows.map((r) => ({
                    id: r.id,
                    label: r.label,
                    color: r.color,
                    value: r.text,
                    sub: pieTotal ? `${Math.round((r.value / pieTotal) * 100)}%` : undefined,
                  }))}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Kategorien & Prioritäten">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTaxonomy({ kind: "category", projectId: fixedProjectId })}
                className="h-11 min-w-[44px] flex-1 rounded-lg border px-3 text-[12px] font-medium"
                style={{ borderColor: GOLD, background: "hsl(var(--accent-gold) / 0.14)" }}
              >
                + Kategorie
              </button>
              <button
                type="button"
                onClick={() => setTaxonomy({ kind: "priority", projectId: fixedProjectId })}
                className="h-11 min-w-[44px] flex-1 rounded-lg border px-3 text-[12px] font-medium"
                style={{ borderColor: GOLD, background: "hsl(var(--accent-gold) / 0.14)" }}
              >
                + Priorität
              </button>
            </div>
          </Panel>
        </div>
      </div>

      {editing && (
        <OpsItemEditDialog
          projectId={editing.projectId}
          projectName={opsProjectNames.get(editing.projectId)}
          itemId={editing.itemId}
          onClose={() => setEditing(null)}
        />
      )}

      {taxonomy?.kind === "category" && (
        <CategoryManagerDialog projects={projects} fixedProjectId={taxonomyProject} onClose={() => setTaxonomy(null)} />
      )}
      {taxonomy?.kind === "priority" && (
        <PriorityManagerDialog projects={projects} fixedProjectId={taxonomyProject} onClose={() => setTaxonomy(null)} />
      )}
    </div>
  );
}

export default OpsOverview;
