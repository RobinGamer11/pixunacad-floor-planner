/**
 * Paket 06 – projektübergreifender Kalender im Netzwerkbereich.
 *
 * Zeigt Abwesenheiten (fremde bewusst ohne Art/Bemerkung) und
 * Gerätebuchungen aller Projekte, an denen man beteiligt ist. Zusätzlich
 * lassen sich hier die eigenen Abwesenheiten pflegen.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { RangeCalendar, type CalEntry } from "@/components/calendar/RangeCalendar";
import {
  ABSENCE_LABEL,
  datesInRange,
  isoDate,
  useAbsences,
  useDevices,
  type AbsenceKind,
} from "@/lib/opsStore";

const inputCls = "h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";
const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";

export function OpsCalendarTab({
  projectIds,
  projectNames,
  peopleById,
}: {
  projectIds: string[];
  projectNames: Map<string, string>;
  peopleById: Map<string, string>;
}) {
  const absences = useAbsences(projectIds);
  const devices = useDevices(undefined);

  const [showAbsences, setShowAbsences] = useState(true);
  const [showBookings, setShowBookings] = useState(true);
  const [form, setForm] = useState(false);
  const [kind, setKind] = useState<AbsenceKind>("vacation");
  const [from, setFrom] = useState(() => isoDate(new Date()));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mine = useMemo(
    () => absences.absences.filter((a) => a.user_id === absences.myId),
    [absences.absences, absences.myId],
  );

  const entries: CalEntry[] = useMemo(() => {
    const out: CalEntry[] = [];
    if (showAbsences) {
      for (const a of absences.absences) {
        const who = a.user_id === absences.myId ? "Ich" : peopleById.get(a.user_id) ?? "Teammitglied";
        for (const day of datesInRange(a.starts_on, a.ends_on)) {
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
        const name = devices.devices.find((d) => d.id === b.device_id)?.name ?? "Gerät";
        for (const day of datesInRange(isoDate(new Date(b.starts_at)), isoDate(new Date(b.ends_at)))) {
          out.push({
            id: `dev-${b.id}-${day}`,
            date: day,
            title: name,
            sub: projectNames.get(b.project_id) ?? "Projekt",
            color: "#4da3ff",
          });
        }
      }
    }
    return out;
  }, [absences.absences, absences.myId, devices.bookings, devices.devices, peopleById, projectNames, showAbsences, showBookings]);

  const save = async () => {
    setError(null);
    if (!from || !to || to < from) { setError("Bitte einen gültigen Zeitraum wählen."); return; }
    try {
      await absences.add({ kind, startsOn: from, endsOn: to, note });
      setNote("");
      setForm(false);
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    }
  };

  if (absences.unavailable && devices.unavailable) {
    return (
      <div className="text-xs" style={{ color: SOFT }}>
        Gemeinsame Kalender stehen zur Verfügung, sobald du angemeldet bist und die Projektfreigabe eingerichtet ist.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {([
          ["Abwesenheiten", showAbsences, () => setShowAbsences((v) => !v), "#8b8178"],
          ["Gerätebuchungen", showBookings, () => setShowBookings((v) => !v), "#4da3ff"],
        ] as [string, boolean, () => void, string][]).map(([label, on, toggle, color]) => (
          <button key={label} onClick={toggle} className="flex items-center gap-1.5 h-7 px-2.5 rounded-md border"
                  style={{ borderColor: on ? color : LINE, color: on ? "hsl(var(--ink))" : SOFT }}>
            <span className="h-2 w-2 rounded-full" style={{ background: on ? color : "transparent", border: `1px solid ${color}` }} />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setForm((v) => !v)} className="flex items-center gap-1 h-7 px-2.5 rounded-md border" style={{ borderColor: LINE }}>
          <Plus size={11} /> Abwesenheit eintragen
        </button>
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
          <input className={`${inputCls} min-w-[180px] flex-1`} value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="Bemerkung (nur für dich sichtbar)" />
          <button onClick={() => void save()} className="h-8 px-3 rounded-md border text-xs"
                  style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}>
            Speichern
          </button>
          {error && <div className="w-full text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
        </div>
      )}

      {!!mine.length && (
        <div className="rounded-lg p-2.5" style={{ border: `1px solid ${LINE}` }}>
          <div className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: SOFT }}>Meine Abwesenheiten</div>
          <div className="flex flex-col gap-1">
            {mine.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1 truncate">
                  {ABSENCE_LABEL[a.kind ?? "other"]} · {a.starts_on} – {a.ends_on}
                  {a.note ? ` · ${a.note}` : ""}
                </span>
                <button className="opacity-60 hover:opacity-100" title="Löschen" onClick={() => void absences.remove(a.id)}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <RangeCalendar entries={entries} selectedDates={[]} onSelectDate={() => {}} />
    </div>
  );
}
