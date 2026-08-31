/**
 * Paket 04 – Einstieg „+ Zeiterfassung“ im Organisationsbereich.
 *
 * Zwei Bereiche in einem Formular: Arbeitszeit (mit Beitrag verknüpft) und
 * Abwesenheit (personenbezogen, ohne Beitragsbezug). Es werden ausschließlich
 * die vorhandenen Projektmitglieder und Beiträge verwendet.
 */
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { TeamMemberOption } from "@/lib/projectTeam";
import {
  useTimeEntries,
  useAbsences,
  isoDate,
  isoToLocalInput,
  localToIso,
  formatMinutes,
  overlaps,
  type AbsenceKind,
} from "@/lib/opsStore";

const inputCls =
  "w-full h-9 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";
const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";

export function TimeEntryDialog({
  projectId,
  items,
  members,
  defaultItemId,
  onClose,
}: {
  projectId: string;
  items: { id: string; title: string }[];
  members: TeamMemberOption[];
  defaultItemId?: string;
  onClose: () => void;
}) {
  const time = useTimeEntries(projectId);
  const absences = useAbsences(useMemo(() => [projectId], [projectId]));

  const [tab, setTab] = useState<"work" | "absence">("work");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Arbeitszeit
  const [userId, setUserId] = useState("");
  const [start, setStart] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [pause, setPause] = useState(0);
  const [note, setNote] = useState("");
  const [itemId, setItemId] = useState(defaultItemId ?? items[0]?.id ?? "");

  // Abwesenheit
  const [kind, setKind] = useState<AbsenceKind>("vacation");
  const [from, setFrom] = useState(() => isoDate(new Date()));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [status, setStatus] = useState("planned");
  const [aNote, setANote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const person = userId || time.myId || "";

  /** Netto-Vorschau und Überschneidungshinweis für dieselbe Person. */
  const preview = useMemo(() => {
    const s = localToIso(start);
    const e = localToIso(end);
    if (!s || !e) return null;
    const gross = (Date.parse(e) - Date.parse(s)) / 60000;
    if (!(gross > 0)) return null;
    const net = Math.max(0, gross - Math.max(0, pause));
    const clash = time.entries.some(
      (x) => x.user_id === person && overlaps(Date.parse(s), Date.parse(e), Date.parse(x.started_at), Date.parse(x.ended_at)),
    );
    return { net, clash };
  }, [start, end, pause, time.entries, person]);

  const saveWork = async () => {
    setError(null);
    const s = localToIso(start);
    const e = localToIso(end);
    if (!itemId) { setError("Bitte einen Beitrag wählen."); return; }
    if (!s || !e) { setError("Bitte Beginn und Ende angeben."); return; }
    if (Date.parse(e) <= Date.parse(s)) { setError("Das Ende muss nach dem Beginn liegen."); return; }
    const gross = (Date.parse(e) - Date.parse(s)) / 60000;
    if (pause < 0) { setError("Die Pause darf nicht negativ sein."); return; }
    if (pause > gross) { setError("Die Pause ist länger als der erfasste Zeitraum."); return; }
    setBusy(true);
    try {
      await time.add({ itemId, userId: person, startedAt: s, endedAt: e, breakMinutes: pause, note });
      setDone("Arbeitszeit gespeichert.");
      setNote("");
      setPause(0);
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  };

  const saveAbsence = async () => {
    setError(null);
    if (!from || !to || to < from) { setError("Bitte einen gültigen Zeitraum wählen."); return; }
    setBusy(true);
    try {
      await absences.add({ kind, startsOn: from, endsOn: to, note: aNote, status });
      setDone("Abwesenheit gespeichert.");
      setANote("");
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  };

  const unavailable = time.unavailable && absences.unavailable;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(20,17,16,0.45)" }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-[520px] max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4"
        style={{ background: "hsl(var(--card))", border: `1px solid ${LINE}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold">Zeiterfassung</span>
          <div className="flex-1" />
          <button className="h-9 w-9 rounded-md flex items-center justify-center" onClick={onClose} aria-label="Schließen">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 mb-3 rounded-lg p-1" style={{ border: `1px solid ${LINE}` }}>
          {([["work", "Arbeitszeit"], ["absence", "Abwesenheit"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setError(null); setDone(null); }}
              className="h-9 rounded-md text-xs"
              style={{
                background: tab === id ? "hsl(var(--accent-gold) / 0.15)" : "transparent",
                color: tab === id ? "hsl(var(--accent-gold))" : SOFT,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {unavailable ? (
          <div className="text-[11px]" style={{ color: SOFT }}>
            Zeiterfassung und Abwesenheiten stehen zur Verfügung, sobald du angemeldet bist und das
            Projekt gemeinsam genutzt wird.
          </div>
        ) : tab === "work" ? (
          <div className="flex flex-col gap-2">
            <Field label="Beitrag">
              <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {!items.length && <option value="">Kein Beitrag vorhanden</option>}
                {items.map((i) => <option key={i.id} value={i.id}>{i.title || "Ohne Titel"}</option>)}
              </select>
            </Field>
            <Field label="Person">
              <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Ich</option>
                {members.filter((m) => m.id !== time.myId).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Beginn">
                <input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Ende">
                <input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Pause (Minuten)">
                <input type="number" min={0} className={inputCls} value={pause}
                       onChange={(e) => setPause(Math.max(0, Number(e.target.value) || 0))} />
              </Field>
              <Field label="Notiz">
                <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
              </Field>
            </div>
            {preview && (
              <div className="text-[11px]" style={{ color: preview.clash ? "#d97706" : SOFT }}>
                Netto: {formatMinutes(preview.net)}
                {preview.clash ? " · Achtung: überschneidet sich mit einer bereits erfassten Zeit dieser Person." : ""}
              </div>
            )}
            <Actions busy={busy} onSave={() => void saveWork()} onClose={onClose} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Field label="Art">
              <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as AbsenceKind)}>
                <option value="vacation">Urlaub</option>
                <option value="sick">Krank</option>
                <option value="other">Sonstige</option>
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Von"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Bis"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            <Field label="Status">
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="planned">Geplant</option>
                <option value="confirmed">Bestätigt</option>
                <option value="cancelled">Abgesagt</option>
              </select>
            </Field>
            <Field label="Bemerkung">
              <input className={inputCls} value={aNote} onChange={(e) => setANote(e.target.value)}
                     placeholder="nur für dich sichtbar" />
            </Field>
            <div className="text-[11px]" style={{ color: SOFT }}>
              Abwesenheiten zählen nicht als Arbeitszeit. In gemeinsamen Ansichten sehen andere nur „abwesend“.
            </div>
            <Actions busy={busy} onSave={() => void saveAbsence()} onClose={onClose} />
          </div>
        )}

        {error && <div className="mt-2 text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
        {done && !error && <div className="mt-2 text-[11px]" style={{ color: SOFT }}>{done}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: SOFT }}>{label}</span>
      {children}
    </label>
  );
}

function Actions({ busy, onSave, onClose }: { busy: boolean; onSave: () => void; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        disabled={busy}
        onClick={onSave}
        className="h-10 px-4 rounded-md border text-xs disabled:opacity-50"
        style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}
      >
        {busy ? "Speichert…" : "Speichern"}
      </button>
      <button onClick={onClose} className="h-10 px-4 rounded-md border text-xs" style={{ borderColor: LINE }}>
        Schließen
      </button>
    </div>
  );
}
