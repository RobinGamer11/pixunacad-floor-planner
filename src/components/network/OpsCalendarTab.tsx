/**
 * Paket 06 – projektübergreifender Kalender im Netzwerkbereich.
 *
 * Vier Ebenen aus den Originaldaten: Beiträge bleiben im Projektkalender,
 * hier werden Arbeitszeiten, Abwesenheiten und Gerätebuchungen aller
 * Projekte gezeigt, an denen man beteiligt ist. Fremde Abwesenheiten
 * bleiben ohne Art und Bemerkung (Maskierung kommt serverseitig).
 * Zusätzlich lassen sich hier die eigenen Abwesenheiten pflegen.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { RangeCalendar, type CalEntry } from "@/components/calendar/RangeCalendar";
import {
  ABSENCE_LABEL,
  datesInRange,
  formatMinutes,
  isoDate,
  netMinutes,
  useAbsences,
  useDevices,
  useTimeEntriesForProjects,
  OPS_STATUS_TEXT,
  type AbsenceKind,
  type OpsStatus,
} from "@/lib/opsStore";
import { effectiveStatusId, subscribeTimeline, timelineStore, type TlItem } from "@/lib/timelineStore";

const inputCls = "h-9 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";
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

export function OpsCalendarTab({
  projectIds,
  projectNames,
  peopleById,
  selectedDates,
  onSelectDate,
  hiddenProjects,
  onToggleProject,
  allowAbsenceEntry = true,
  projectFilterAsDropdown = false,
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
  /** Abwesenheiten hier eintragen/pflegen (Projektbereich). */
  allowAbsenceEntry?: boolean;
  /** Projekte als Auswahlliste in der Filterzeile statt als Schaltflächenreihe. */
  projectFilterAsDropdown?: boolean;
}) {

  /* Nur ausgewählte Projekte laden – keine Komplettabfrage. */
  const [hiddenState, setHidden] = useState<Set<string>>(() => new Set());
  const hidden = hiddenProjects ?? hiddenState;
  const activeProjects = useMemo(
    () => projectIds.filter((id) => !hidden.has(id)),
    [projectIds, hidden],
  );

  const absences = useAbsences(activeProjects);
  const devices = useDevices(undefined);
  const times = useTimeEntriesForProjects(activeProjects);
  const boards = useProjectItems(activeProjects);

  const [showAbsences, setShowAbsences] = useState(true);
  const [showBookings, setShowBookings] = useState(true);
  const [showTimes, setShowTimes] = useState(true);
  const [showItems, setShowItems] = useState(true);
  const [personFilter, setPersonFilter] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  const [projectMenu, setProjectMenu] = useState(false);
  const [form, setForm] = useState(false);
  const [kind, setKind] = useState<AbsenceKind>("vacation");
  const [from, setFrom] = useState(() => isoDate(new Date()));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [status, setStatus] = useState("planned");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(
    () => absences.absences.filter((a) => a.user_id === absences.myId),
    [absences.absences, absences.myId],
  );

  const inRange = (day: string) => (!fromFilter || day >= fromFilter) && (!toFilter || day <= toFilter);

  const entries: CalEntry[] = useMemo(() => {
    const out: CalEntry[] = [];
    const seenAbsence = new Set<string>();

    if (showTimes && !deviceFilter) {
      for (const e of times.entries) {
        if (personFilter && e.user_id !== personFilter) continue;
        const who = e.user_id === times.myId ? "Ich" : peopleById.get(e.user_id) ?? "Teammitglied";
        for (const day of datesInRange(isoDate(new Date(e.started_at)), isoDate(new Date(e.ended_at)))) {
          if (!inRange(day)) continue;
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

    if (showAbsences && !deviceFilter) {
      for (const a of absences.absences) {
        if (personFilter && a.user_id !== personFilter) continue;
        // Dieselbe personenbezogene Abwesenheit nur einmal darstellen.
        if (seenAbsence.has(a.id)) continue;
        seenAbsence.add(a.id);
        const who = a.user_id === absences.myId ? "Ich" : peopleById.get(a.user_id) ?? "Teammitglied";
        for (const day of datesInRange(a.starts_on, a.ends_on)) {
          if (!inRange(day)) continue;
          out.push({
            id: `abs-${a.id}-${day}`,
            date: day,
            title: a.masked ? `${who}: abwesend` : `${who}: ${ABSENCE_LABEL[a.kind ?? "other"]}`,
            color: "#8b8178",
          });
        }
      }
    }

    if (showBookings) {
      for (const b of devices.bookings) {
        if (deviceFilter && b.device_id !== deviceFilter) continue;
        if (personFilter && b.responsible_id !== personFilter) continue;
        if (b.project_id && hidden.has(b.project_id)) continue;
        const name = devices.devices.find((d) => d.id === b.device_id)?.name ?? "Gerät";
        for (const day of datesInRange(isoDate(new Date(b.starts_at)), isoDate(new Date(b.ends_at)))) {
          if (!inRange(day)) continue;
          out.push({
            id: `dev-${b.id}-${day}`,
            date: day,
            title: name,
            sub: projectNames.get(b.project_id ?? "") ?? "Projekt",
            color: "#4da3ff",
          });
        }
      }
    }
    if (showItems && !deviceFilter) {
      for (const board of boards) {
        for (const item of board.state.items as TlItem[]) {
          if (personFilter && !(item.assignees ?? []).includes(personFilter)) continue;
          const statusId = effectiveStatusId(item);
          const color = board.state.statuses.find((s) => s.id === statusId)?.color ?? "#c9a227";
          for (const day of datesInRange(item.startDate, item.endDate || item.startDate)) {
            if (!inRange(day)) continue;
            out.push({
              id: `item-${board.id}-${item.id}-${day}`,
              date: day,
              title: item.title || "Beitrag",
              sub: projectNames.get(board.id) ?? "Projekt",
              color,
            });
          }
        }
      }
    }

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absences.absences, absences.myId, devices.bookings, devices.devices, times.entries, times.myId,
      peopleById, projectNames, showAbsences, showBookings, showTimes, personFilter, deviceFilter,
      fromFilter, toFilter, hidden, boards, showItems]);

  const save = async () => {
    setError(null);
    if (!from || !to || to < from) { setError("Bitte einen gültigen Zeitraum wählen."); return; }
    try {
      await absences.add({ kind, startsOn: from, endsOn: to, note, status });
      setNote("");
      setForm(false);
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    }
  };

  const reloadAll = () => { absences.reload(); devices.reload(); times.reload(); };
  const sources: { label: string; status: OpsStatus }[] = [
    { label: "Arbeitszeiten", status: times.status },
    { label: "Abwesenheiten", status: absences.status },
    { label: "Geräte", status: devices.status },
  ];
  const broken = sources.filter((s) => s.status !== "ready" && s.status !== "loading");
  const cloudBlocked = broken.length === sources.length;

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
            {cloudBlocked
              ? OPS_STATUS_TEXT[broken[0].status as Exclude<OpsStatus, "loading" | "ready">]
              : `Teilweise nicht geladen: ${broken.map((b) => `${b.label} – ${OPS_STATUS_TEXT[b.status as Exclude<OpsStatus, "loading" | "ready">]}`).join(" · ")}`}
            {cloudBlocked && broken.some((b) => b.status === "setup-missing") && (
              <> Beiträge werden weiterhin angezeigt.</>
            )}
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
          ["Abwesenheiten", showAbsences, () => setShowAbsences((v) => !v), "#8b8178"],
          ["Gerätebuchungen", showBookings, () => setShowBookings((v) => !v), "#4da3ff"],
        ] as [string, boolean, () => void, string][]).map(([label, on, toggle, color]) => (
          <button key={label} onClick={toggle} className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border"
                  style={{ borderColor: on ? color : LINE, color: on ? "hsl(var(--ink))" : SOFT }}>
            <span className="h-2 w-2 rounded-full" style={{ background: on ? color : "transparent", border: `1px solid ${color}` }} />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        {allowAbsenceEntry && (
          <button onClick={() => setForm((v) => !v)} className="flex items-center gap-1 h-9 px-2.5 rounded-md border" style={{ borderColor: LINE }}>
            <Plus size={11} /> Abwesenheit eintragen
          </button>
        )}
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

      {/* Filter: Zeitraum, Projekte, Person, Gerät */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className={inputCls} value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} title="Von" />
        <input type="date" className={inputCls} value={toFilter} onChange={(e) => setToFilter(e.target.value)} title="Bis" />
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
        <select className={inputCls} value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
          <option value="">Alle Geräte</option>
          {devices.devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>


      {form && (
        <div className="rounded-lg p-2.5 flex flex-wrap items-end gap-2" style={{ border: `1px solid ${LINE}` }}>
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
            <option value="vacation">Urlaub</option>
            <option value="sick">Krank</option>
            <option value="other">Sonstige Abwesenheit</option>
          </select>
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="planned">Geplant</option>
            <option value="confirmed">Bestätigt</option>
            <option value="cancelled">Abgesagt</option>
          </select>
          <input className={`${inputCls} min-w-[180px] flex-1`} value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="Bemerkung (nur für dich sichtbar)" />
          <button onClick={() => void save()} className="h-9 px-3 rounded-md border text-xs"
                  style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}>
            Speichern
          </button>
          {error && <div className="w-full text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
        </div>
      )}

      {allowAbsenceEntry && !!mine.length && (
        <div className="rounded-lg p-2.5" style={{ border: `1px solid ${LINE}` }}>
          <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: SOFT }}>Meine Abwesenheiten</div>
          <div className="flex flex-col gap-1">
            {mine.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1 truncate">
                  {ABSENCE_LABEL[a.kind ?? "other"]} · {a.starts_on} – {a.ends_on}
                  {a.note ? ` · ${a.note}` : ""}
                </span>
                <select
                  className="h-8 rounded-md border bg-background px-1 text-[11px]"
                  value={a.status ?? "planned"}
                  onChange={(e) => void absences.update(a.id, { status: e.target.value })}
                >
                  <option value="planned">Geplant</option>
                  <option value="confirmed">Bestätigt</option>
                  <option value="cancelled">Abgesagt</option>
                </select>
                <button className="h-8 w-8 flex items-center justify-center opacity-60 hover:opacity-100"
                        title="Löschen" onClick={() => void absences.remove(a.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <RangeCalendar entries={entries} selectedDates={selectedDates ?? []} onSelectDate={onSelectDate ?? (() => {})} />
    </div>
  );
}
