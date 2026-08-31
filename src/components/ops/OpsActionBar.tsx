/**
 * Gemeinsame Organisations-Aktionen für
 *   * Startseite → Organisation (projektübergreifend, Projekt wählbar)
 *   * Projekt → Organisation (Projekt fest vorausgewählt)
 *
 * Es werden ausschließlich die vorhandenen Stores/Tabellen verwendet
 * (`time_entries`, `absences`, `devices`/`device_bookings`, Board-Beiträge).
 */
import { useEffect, useMemo, useState } from "react";
import { Clock, CalendarOff, Wrench, X } from "lucide-react";
import {
  addAbsenceEntry,
  addTimeEntryFor,
  bookDeviceFor,
  checkDeviceConflicts,
  isoDate,
  isoToLocalInput,
  localToIso,
  useDevices,
  type AbsenceKind,
  type DeviceConflict,
} from "@/lib/opsStore";
import { subscribeTimeline, timelineStore } from "@/lib/timelineStore";
import { useProjectsMemberOptions } from "@/lib/projectTeam";

const inputCls =
  "w-full h-9 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";
const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";
const GOLD = "hsl(var(--accent-gold))";

export interface OpsProjectRef {
  id: string;
  name: string;
}

type DialogId = "time" | "absence" | "booking";

/** Beiträge eines Projekts aus der bestehenden Board-Datenbasis. */
function useItems(projectId: string) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    return subscribeTimeline(projectId, () => setTick((t) => t + 1));
  }, [projectId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(
    () =>
      projectId
        ? (timelineStore.getState(projectId).items as { id: string; title: string }[]).map((i) => ({
            id: i.id,
            title: i.title || "Ohne Titel",
          }))
        : [],
    [projectId, setTick],
  );
}

export function OpsActionBar({
  projects,
  fixedProjectId,
  defaultItemId,
  onChanged,
  extra,
}: {
  projects: OpsProjectRef[];
  /** Projektbereich: Projekt ist fest vorgegeben und nicht wählbar. */
  fixedProjectId?: string;
  defaultItemId?: string;
  onChanged?: () => void;
  /** Zusätzliche Schaltflächen (z. B. „+ Beitrag“) links davor. */
  extra?: React.ReactNode;
}) {
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  const { byProject } = useProjectsMemberOptions(ids);

  const close = (changed?: boolean) => {
    setDialog(null);
    if (changed) onChanged?.();
  };

  const btn = (id: DialogId, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      onClick={() => setDialog(id)}
      className="h-10 px-3 rounded-lg border text-xs flex items-center gap-1.5"
      style={{ borderColor: LINE, color: "hsl(var(--ink))" }}
    >
      {icon} {label}
    </button>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {btn("time", <Clock size={14} />, "+ Zeiterfassung")}
        {btn("absence", <CalendarOff size={14} />, "+ Abwesenheit")}
        {btn("booking", <Wrench size={14} />, "+ Buchung Geräte/Werkzeuge")}
      </div>

      {dialog === "time" && (
        <TimeDialog
          projects={projects}
          fixedProjectId={fixedProjectId}
          defaultItemId={defaultItemId}
          membersByProject={byProject}
          onClose={close}
        />
      )}
      {dialog === "absence" && <AbsenceDialog onClose={close} />}
      {dialog === "booking" && (
        <BookingDialog
          projects={projects}
          fixedProjectId={fixedProjectId}
          defaultItemId={defaultItemId}
          membersByProject={byProject}
          onClose={close}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------- Grundgerüst */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
          <span className="text-sm font-semibold">{title}</span>
          <div className="flex-1" />
          <button className="h-9 w-9 rounded-md flex items-center justify-center" onClick={onClose} aria-label="Schließen">
            <X size={16} />
          </button>
        </div>
        {children}
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
      <button disabled={busy} onClick={onSave}
              className="h-10 px-4 rounded-md border text-xs disabled:opacity-50"
              style={{ borderColor: GOLD, color: GOLD }}>
        {busy ? "Speichert…" : "Speichern"}
      </button>
      <button onClick={onClose} className="h-10 px-4 rounded-md border text-xs" style={{ borderColor: LINE }}>
        Schließen
      </button>
    </div>
  );
}

function ProjectField({
  projects, fixedProjectId, value, onChange,
}: {
  projects: OpsProjectRef[];
  fixedProjectId?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  if (fixedProjectId) {
    const name = projects.find((p) => p.id === fixedProjectId)?.name ?? "Aktuelles Projekt";
    return (
      <Field label="Projekt">
        <div className={`${inputCls} flex items-center`} style={{ color: SOFT }}>{name}</div>
      </Field>
    );
  }
  return (
    <Field label="Projekt">
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {!projects.length && <option value="">Kein Projekt vorhanden</option>}
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Field>
  );
}

/* --------------------------------------------------------- Zeiterfassung */

function TimeDialog({
  projects, fixedProjectId, defaultItemId, membersByProject, onClose,
}: {
  projects: OpsProjectRef[];
  fixedProjectId?: string;
  defaultItemId?: string;
  membersByProject: Record<string, { id: string; name: string }[]>;
  onClose: (changed?: boolean) => void;
}) {
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const items = useItems(projectId);
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [userId, setUserId] = useState("");
  const [start, setStart] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [pause, setPause] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const members = membersByProject[projectId] ?? [];
  useEffect(() => { if (!items.some((i) => i.id === itemId)) setItemId(""); }, [items, itemId]);

  const save = async () => {
    setError(null); setDone(null);
    const s = localToIso(start);
    const e = localToIso(end);
    if (!projectId) { setError("Bitte ein Projekt wählen."); return; }
    if (!s || !e) { setError("Bitte Beginn und Ende angeben."); return; }
    if (Date.parse(e) <= Date.parse(s)) { setError("Das Ende muss nach dem Beginn liegen."); return; }
    const gross = (Date.parse(e) - Date.parse(s)) / 60000;
    if (pause < 0) { setError("Die Pause darf nicht negativ sein."); return; }
    if (pause > gross) { setError("Die Pause ist länger als der erfasste Zeitraum."); return; }
    setBusy(true);
    try {
      await addTimeEntryFor(projectId, {
        itemId, userId, startedAt: s, endedAt: e, breakMinutes: pause, note,
      });
      setDone("Arbeitszeit gespeichert.");
      setNote(""); setPause(0);
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Zeiterfassung" onClose={() => onClose(Boolean(done))}>
      <div className="flex flex-col gap-2">
        <Field label="Person">
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Ich</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <ProjectField projects={projects} fixedProjectId={fixedProjectId} value={projectId} onChange={setProjectId} />
        <Field label="Beitrag (optional)">
          <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Ohne Beitrag</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Start">
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
        <Actions busy={busy} onSave={() => void save()} onClose={() => onClose(Boolean(done))} />
        {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
        {done && !error && <div className="text-[11px]" style={{ color: SOFT }}>{done}</div>}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- Abwesenheit */

function AbsenceDialog({ onClose }: { onClose: (changed?: boolean) => void }) {
  const [kind, setKind] = useState<AbsenceKind>("vacation");
  const [from, setFrom] = useState(() => isoDate(new Date()));
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const save = async () => {
    setError(null); setDone(null);
    if (!from || !to || to < from) { setError("Bitte einen gültigen Zeitraum wählen."); return; }
    setBusy(true);
    try {
      await addAbsenceEntry({ kind, startsOn: from, endsOn: to, note });
      setDone("Abwesenheit gespeichert.");
      setNote("");
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Abwesenheit" onClose={() => onClose(Boolean(done))}>
      <div className="flex flex-col gap-2">
        <Field label="Person">
          <div className={`${inputCls} flex items-center`} style={{ color: SOFT }}>Ich</div>
        </Field>
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
        <Field label="Bemerkung">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="nur für dich sichtbar" />
        </Field>
        <div className="text-[11px]" style={{ color: SOFT }}>
          Abwesenheiten zählen nicht als Arbeitszeit. In gemeinsamen Ansichten sehen andere nur „abwesend“.
        </div>
        <Actions busy={busy} onSave={() => void save()} onClose={() => onClose(Boolean(done))} />
        {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
        {done && !error && <div className="text-[11px]" style={{ color: SOFT }}>{done}</div>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------- Geräte-/Werkzeugbuchung */

function BookingDialog({
  projects, fixedProjectId, defaultItemId, membersByProject, onClose,
}: {
  projects: OpsProjectRef[];
  fixedProjectId?: string;
  defaultItemId?: string;
  membersByProject: Record<string, { id: string; name: string }[]>;
  onClose: (changed?: boolean) => void;
}) {
  // Zentrale Geräteverwaltung aus dem Netzwerk – keine zweite Liste.
  const devices = useDevices(undefined);
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const items = useItems(projectId);
  const [deviceId, setDeviceId] = useState("");
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [responsible, setResponsible] = useState("");
  const [start, setStart] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [conflicts, setConflicts] = useState<DeviceConflict[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const open = useMemo(() => devices.devices.filter((d) => !d.archived), [devices.devices]);
  const members = membersByProject[projectId] ?? [];
  useEffect(() => { if (!items.some((i) => i.id === itemId)) setItemId(""); }, [items, itemId]);
  useEffect(() => { if (!deviceId && open.length) setDeviceId(open[0].id); }, [open, deviceId]);

  const save = async (overrideReason?: string) => {
    setError(null); setDone(null);
    const s = localToIso(start);
    const e = localToIso(end);
    if (!deviceId) { setError("Bitte ein Gerät wählen."); return; }
    if (!projectId) { setError("Bitte ein Projekt wählen."); return; }
    if (!s || !e || Date.parse(e) <= Date.parse(s)) { setError("Bitte einen gültigen Zeitraum angeben."); return; }
    setBusy(true);
    try {
      if (!overrideReason) {
        const found = await checkDeviceConflicts(deviceId, s, e);
        if (found.length) { setConflicts(found); setBusy(false); return; }
      }
      await bookDeviceFor(projectId, {
        deviceId,
        itemId: itemId || null,
        responsibleId: responsible || null,
        startsAt: s,
        endsAt: e,
        overrideReason,
      });
      setConflicts(null);
      setReason("");
      setDone("Buchung gespeichert.");
      devices.reload();
    } catch (err) {
      setError((err as Error)?.message ?? "Buchung nicht möglich.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Buchung Geräte/Werkzeuge" onClose={() => onClose(Boolean(done))}>
      {devices.unavailable ? (
        <div className="text-[11px]" style={{ color: SOFT }}>
          Geräte stehen zur Verfügung, sobald du angemeldet bist und die Projektfreigabe eingerichtet ist.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Gerät / Werkzeug">
            <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              {!open.length && <option value="">Kein Gerät angelegt (Netzwerk → Geräte &amp; Werkzeuge)</option>}
              {open.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <ProjectField projects={projects} fixedProjectId={fixedProjectId} value={projectId} onChange={setProjectId} />
          <Field label="Beitrag (optional)">
            <select className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Ohne Beitrag</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </select>
          </Field>
          <Field label="Verantwortliche">
            <select className={inputCls} value={responsible} onChange={(e) => setResponsible(e.target.value)}>
              <option value="">Offen</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Von">
              <input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Bis">
              <input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>

          {conflicts && (
            <div className="rounded-md p-2 flex flex-col gap-1.5" style={{ border: "1px solid #d97706" }}>
              <div className="text-[11px]" style={{ color: "#d97706" }}>
                Überschneidung mit bestehenden Buchungen:
              </div>
              {conflicts.map((c) => (
                <div key={c.id} className="text-[11px]" style={{ color: SOFT }}>
                  {new Date(c.starts_at).toLocaleString("de-DE")} – {new Date(c.ends_at).toLocaleString("de-DE")}
                  {c.masked ? " · anderes Projekt" : ` · ${c.project_name ?? "Projekt"}`}
                </div>
              ))}
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}
                     placeholder="Begründung für die Übersteuerung" />
              <button
                disabled={busy || !reason.trim()}
                onClick={() => void save(reason.trim())}
                className="h-9 px-3 rounded-md border text-xs self-start disabled:opacity-50"
                style={{ borderColor: "#d97706", color: "#d97706" }}
              >
                Trotzdem buchen
              </button>
            </div>
          )}

          <Actions busy={busy} onSave={() => void save()} onClose={() => onClose(Boolean(done))} />
          {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
          {done && !error && <div className="text-[11px]" style={{ color: SOFT }}>{done}</div>}
        </div>
      )}
    </Modal>
  );
}

export default OpsActionBar;
