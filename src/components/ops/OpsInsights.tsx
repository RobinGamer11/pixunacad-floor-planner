/**
 * Gemeinsame Auswertungsbausteine für die Organisation.
 *
 * Verwendet ausschließlich die bereits vorhandenen Datenquellen
 * (`time_entries`, `absences`, `devices`/`device_bookings`, Projektmitglieder).
 * Es werden keine neuen Tabellen und keine zweite Zählerhaltung eingeführt.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  ABSENCE_LABEL,
  datesInRange,
  formatMinutes,
  netMinutes,
  useAbsences,
  useDevices,
  useTimeEntriesForProjects,
  type DeviceBooking,
} from "@/lib/opsStore";
import { useProjectsMemberOptions } from "@/lib/projectTeam";

const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";

/** Stabile, gut unterscheidbare Farben für die Kreisdiagramme. */
const PALETTE = [
  "#c9a227", "#3f9c6a", "#4da3ff", "#e2703a", "#8b5cf6",
  "#ef4444", "#0ea5e9", "#84cc16", "#f472b6", "#14b8a6",
];
export const insightColor = (index: number) => PALETTE[index % PALETTE.length];

/* ------------------------------------------------------------- Bausteine */

export function Collapsible({
  title,
  badge,
  defaultOpen = false,
  children,
  right,
  dense,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  right?: React.ReactNode;
  dense?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: LINE }}>
      <div className={`flex items-center gap-2 ${dense ? "px-2.5 py-1.5" : "px-3 py-2.5"}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 min-w-0 text-left"
        >
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className={`${dense ? "text-[11px]" : "text-xs"} font-semibold tracking-wide truncate`}>{title}</span>
          {badge !== undefined && badge !== null && (
            <span className="text-[11px] tabular-nums" style={{ color: SOFT }}>({badge})</span>
          )}
        </button>
        {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
      </div>
      {open && <div className={dense ? "px-2.5 pb-2.5" : "px-3 pb-3"}>{children}</div>}
    </div>
  );
}

/**
 * Kreisdiagramm – optisch und funktional identisch zum Kategorien-Diagramm
 * der Orga-Oberfläche: anklickbare Segmente, hervorgehobene Auswahl,
 * abgedunkelte übrige Segmente und ein Mittelpunkt zum Zurücksetzen.
 */
export function MiniPie({
  slices,
  activeId = null,
  onSlice,
  onCenter,
}: {
  slices: { id: string; value: number; color: string }[];
  activeId?: string | null;
  onSlice?: (id: string) => void;
  onCenter?: () => void;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = 74;
  const C = 84;
  if (!total) {
    return (
      <svg width={C * 2} height={C * 2} aria-hidden>
        <circle cx={C} cy={C} r={R - 18} fill="none" stroke={LINE} strokeWidth={10} />
      </svg>
    );
  }
  let acc = -Math.PI / 2;
  return (
    <svg width={C * 2} height={C * 2}>
      {slices.filter((s) => s.value > 0).map((s) => {
        const ang = (s.value / total) * Math.PI * 2;
        const a0 = acc;
        const a1 = acc + ang;
        acc = a1;
        const r = activeId === s.id ? R + 6 : R;
        const large = ang > Math.PI ? 1 : 0;
        const d =
          ang >= Math.PI * 2 - 1e-6
            ? `M ${C} ${C - r} A ${r} ${r} 0 1 1 ${C - 0.01} ${C - r} Z`
            : `M ${C} ${C} L ${C + Math.cos(a0) * r} ${C + Math.sin(a0) * r} A ${r} ${r} 0 ${large} 1 ${C + Math.cos(a1) * r} ${C + Math.sin(a1) * r} Z`;
        return (
          <path
            key={s.id}
            d={d}
            fill={s.color}
            opacity={activeId && activeId !== s.id ? 0.4 : 1}
            style={{ cursor: onSlice ? "pointer" : "default" }}
            onClick={() => onSlice?.(s.id)}
          />
        );
      })}
      <circle
        cx={C}
        cy={C}
        r={36}
        fill="hsl(var(--surface-card))"
        style={{ cursor: onCenter ? "pointer" : "default" }}
        onClick={() => onCenter?.()}
      />
    </svg>
  );
}

/** Legende – dieselben Auswahl-Schaltflächen wie im Kategorien-Diagramm. */
function Legend({
  rows,
  activeId = null,
  onSelect,
}: {
  rows: { id: string; label: string; color: string; value: string; sub?: string }[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  if (!rows.length) return <div className="text-[11px]" style={{ color: SOFT }}>Keine Daten vorhanden.</div>;
  return (
    <div className="flex flex-col gap-1.5 min-w-[200px]">
      {rows.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect?.(r.id)}
          className="flex items-center gap-2 text-[11px] rounded-md px-2 py-1 text-left"
          style={{
            background: activeId === r.id ? "hsl(var(--surface-muted))" : "transparent",
            opacity: activeId && activeId !== r.id ? 0.55 : 1,
          }}
        >
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />
          <span className="truncate flex-1">{r.label}</span>
          <span className="tabular-nums shrink-0">{r.value}</span>
          {r.sub && <span className="shrink-0" style={{ color: SOFT }}>· {r.sub}</span>}
        </button>
      ))}
    </div>
  );
}


const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/* ------------------------------------------------------ Zeit + Abwesenheit */

/**
 * Zeiterfassung je Person über die angegebenen Projekte.
 * Alle Projektbeteiligten erscheinen – auch mit 0 Minuten. Abwesenheiten
 * werden separat als Tage ausgewiesen (sie zählen nicht als Arbeitszeit).
 */
export function TimeInsights({
  projectIds,
  projectNames,
  peopleById,
}: {
  projectIds: string[];
  projectNames?: Map<string, string>;
  peopleById?: Map<string, string>;
}) {
  const times = useTimeEntriesForProjects(projectIds);
  const absences = useAbsences(projectIds);
  const { byProject } = useProjectsMemberOptions(projectIds);

  const nameOf = (id: string) => {
    for (const list of Object.values(byProject)) {
      const hit = list.find((m) => m.id === id);
      if (hit) return hit.name;
    }
    return peopleById?.get(id) ?? (id === times.myId ? "Ich" : "Teammitglied");
  };

  const rows = useMemo(() => {
    const minutes = new Map<string, number>();
    for (const id of projectIds) {
      for (const m of byProject[id] ?? []) if (!minutes.has(m.id)) minutes.set(m.id, 0);
    }
    for (const e of times.entries) minutes.set(e.user_id, (minutes.get(e.user_id) ?? 0) + netMinutes(e));
    const absenceDays = new Map<string, number>();
    const seen = new Set<string>();
    for (const a of absences.absences) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      if (a.status === "cancelled") continue;
      absenceDays.set(a.user_id, (absenceDays.get(a.user_id) ?? 0) + datesInRange(a.starts_on, a.ends_on).length);
      if (!minutes.has(a.user_id)) minutes.set(a.user_id, 0);
    }
    return Array.from(minutes.entries())
      .map(([id, m]) => ({ id, minutes: m, absenceDays: absenceDays.get(id) ?? 0 }))
      .sort((a, b) => b.minutes - a.minutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [times.entries, absences.absences, byProject, projectIds.join("|")]);

  const total = rows.reduce((s, r) => s + r.minutes, 0);

  /** Auswahl im Kreisdiagramm – filtert Legende, Summe und Verlauf. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const toggle = (id: string) => setActiveId((cur) => (cur === id ? null : id));
  useEffect(() => {
    if (activeId && !rows.some((r) => r.id === activeId)) setActiveId(null);
  }, [rows, activeId]);

  const history = useMemo(
    () =>
      [...times.entries]
        .filter((e) => !activeId || e.user_id === activeId)
        .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
        .slice(0, 200),
    [times.entries, activeId],
  );
  const absenceHistory = useMemo(() => {
    const seen = new Set<string>();
    return absences.absences
      .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      .filter((a) => !activeId || a.user_id === activeId)
      .sort((a, b) => b.starts_on.localeCompare(a.starts_on))
      .slice(0, 100);
  }, [absences.absences, activeId]);

  const activeRow = activeId ? rows.find((r) => r.id === activeId) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-6">
        <MiniPie
          slices={rows.map((r, i) => ({ id: r.id, value: r.minutes, color: insightColor(i) }))}
          activeId={activeId}
          onSlice={toggle}
          onCenter={() => setActiveId(null)}
        />
        <Legend
          activeId={activeId}
          onSelect={toggle}
          rows={rows.map((r, i) => ({
            id: r.id,
            label: nameOf(r.id),
            color: insightColor(i),
            value: formatMinutes(r.minutes),
            sub: r.absenceDays ? `${r.absenceDays} Tage abwesend` : undefined,
          }))}
        />
        <div className="text-[11px]" style={{ color: SOFT }}>
          {activeRow ? (
            <>
              {nameOf(activeRow.id)}:{" "}
              <span className="tabular-nums" style={{ color: "hsl(var(--ink))" }}>{formatMinutes(activeRow.minutes)}</span>
              {total > 0 && <> · {Math.round((activeRow.minutes / total) * 100)}%</>}
            </>
          ) : (
            <>
              Gesamt: <span className="tabular-nums" style={{ color: "hsl(var(--ink))" }}>{formatMinutes(total)}</span>
            </>
          )}
        </div>
      </div>

      <Collapsible title="Verlauf" badge={history.length + absenceHistory.length} dense>
        <div className="flex flex-col gap-1">
          {history.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-[11px]">
              <span className="shrink-0 tabular-nums" style={{ color: SOFT }}>{fmtDay(e.started_at)}</span>
              <span className="truncate flex-1">{nameOf(e.user_id)}</span>
              {projectNames && (
                <span className="truncate shrink-0" style={{ color: SOFT }}>
                  {projectNames.get(e.project_id) ?? "Projekt"}
                </span>
              )}
              <span className="tabular-nums shrink-0">{formatMinutes(netMinutes(e))}</span>
            </div>
          ))}
          {absenceHistory.map((a) => (
            <div key={`abs-${a.id}`} className="flex items-center gap-2 text-[11px]" style={{ color: SOFT }}>
              <span className="shrink-0 tabular-nums">{a.starts_on} – {a.ends_on}</span>
              <span className="truncate flex-1">{nameOf(a.user_id)}</span>
              <span className="shrink-0">{a.masked ? "abwesend" : ABSENCE_LABEL[a.kind ?? "other"]}</span>
            </div>
          ))}
          {!history.length && !absenceHistory.length && (
            <div className="text-[11px]" style={{ color: SOFT }}>Kein Verlauf vorhanden.</div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}


/* ------------------------------------------------------ Geräte / Werkzeuge */

const bookingMinutes = (b: DeviceBooking) =>
  Math.max(0, Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000));

/**
 * Geräte-/Werkzeugnutzung. Ohne `projectIds` werden alle sichtbaren
 * Buchungen ausgewertet (projektübergreifende Gesamtnutzung).
 */
export function DeviceInsights({
  projectIds,
  projectNames,
  peopleById,
}: {
  projectIds?: string[];
  projectNames?: Map<string, string>;
  peopleById?: Map<string, string>;
}) {
  const devices = useDevices(undefined);
  const filter = projectIds ? new Set(projectIds) : null;

  const bookings = useMemo(
    () => devices.bookings.filter((b) => !filter || (b.project_id && filter.has(b.project_id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices.bookings, projectIds?.join("|")],
  );

  const nameOfPerson = (id: string | null) =>
    !id ? "Ohne Verantwortliche" : id === devices.myId ? "Ich" : peopleById?.get(id) ?? "Teammitglied";

  const rows = useMemo(() => {
    const byDevice = new Map<string, { minutes: number; people: Set<string> }>();
    for (const b of bookings) {
      const cur = byDevice.get(b.device_id) ?? { minutes: 0, people: new Set<string>() };
      cur.minutes += bookingMinutes(b);
      if (b.responsible_id) cur.people.add(b.responsible_id);
      byDevice.set(b.device_id, cur);
    }
    return devices.devices
      .map((d) => ({
        id: d.id,
        name: d.name,
        archived: d.archived,
        minutes: byDevice.get(d.id)?.minutes ?? 0,
        people: Array.from(byDevice.get(d.id)?.people ?? []),
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [bookings, devices.devices]);

  const total = rows.reduce((s, r) => s + r.minutes, 0);

  /** Auswahl im Kreisdiagramm – filtert Legende, Summe und Verlauf. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const toggle = (id: string) => setActiveId((cur) => (cur === id ? null : id));
  useEffect(() => {
    if (activeId && !rows.some((r) => r.id === activeId)) setActiveId(null);
  }, [rows, activeId]);

  const history = useMemo(
    () =>
      [...bookings]
        .filter((b) => !activeId || b.device_id === activeId)
        .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
        .slice(0, 200),
    [bookings, activeId],
  );
  const deviceName = (id: string) => devices.devices.find((d) => d.id === id)?.name ?? "Gerät";
  const activeRow = activeId ? rows.find((r) => r.id === activeId) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-6">
        <MiniPie
          slices={rows.map((r, i) => ({ id: r.id, value: r.minutes, color: insightColor(i) }))}
          activeId={activeId}
          onSlice={toggle}
          onCenter={() => setActiveId(null)}
        />
        <Legend
          activeId={activeId}
          onSelect={toggle}
          rows={rows.map((r, i) => ({
            id: r.id,
            label: r.archived ? `${r.name} (archiviert)` : r.name,
            color: insightColor(i),
            value: formatMinutes(r.minutes),
            sub: r.people.length ? r.people.map(nameOfPerson).join(", ") : undefined,
          }))}
        />
        <div className="text-[11px]" style={{ color: SOFT }}>
          {activeRow ? (
            <>
              {activeRow.name}:{" "}
              <span className="tabular-nums" style={{ color: "hsl(var(--ink))" }}>{formatMinutes(activeRow.minutes)}</span>
              {total > 0 && <> · {Math.round((activeRow.minutes / total) * 100)}%</>}
            </>
          ) : (
            <>
              Gesamt: <span className="tabular-nums" style={{ color: "hsl(var(--ink))" }}>{formatMinutes(total)}</span>
            </>
          )}
        </div>
      </div>


      <Collapsible title="Verlauf" badge={history.length} dense>
        <div className="flex flex-col gap-1">
          {history.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-[11px]">
              <span className="shrink-0 tabular-nums" style={{ color: SOFT }}>{fmtDay(b.starts_at)}</span>
              <span className="truncate flex-1">{deviceName(b.device_id)}</span>
              <span className="truncate shrink-0" style={{ color: SOFT }}>{nameOfPerson(b.responsible_id)}</span>
              {projectNames && (
                <span className="truncate shrink-0" style={{ color: SOFT }}>
                  {projectNames.get(b.project_id ?? "") ?? "Projekt"}
                </span>
              )}
              <span className="tabular-nums shrink-0">{formatMinutes(bookingMinutes(b))}</span>
            </div>
          ))}
          {!history.length && <div className="text-[11px]" style={{ color: SOFT }}>Kein Verlauf vorhanden.</div>}
        </div>
      </Collapsible>
    </div>
  );
}

/** Anzahl der Personen in den angegebenen Projekten (für Klapp-Badges). */
export function usePeopleCount(projectIds: string[]) {
  const { byProject } = useProjectsMemberOptions(projectIds);
  return useMemo(() => {
    const set = new Set<string>();
    for (const id of projectIds) for (const m of byProject[id] ?? []) set.add(m.id);
    return set.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byProject, projectIds.join("|")]);
}
