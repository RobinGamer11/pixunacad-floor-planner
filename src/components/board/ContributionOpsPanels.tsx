/**
 * Paket 04–06 – Beitrags-Abschnitte im Board-Editor:
 *   * Zeiterfassung (Ist-Zeiten je Beitrag, netto nach Pausen)
 *   * Geräte/Werkzeuge (Buchungen mit Konfliktwarnung und Übersteuerung)
 *   * Dokumente/Anhänge (privater Dateispeicher)
 *
 * Ohne geteiltes Projekt bzw. ohne eingespielte Migration bleiben die
 * Abschnitte sichtbar, aber mit klarem Hinweis – nichts bricht.
 */
import { useMemo, useState } from "react";
import { Paperclip, Plus, Trash2, Wrench, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import type { TeamMemberOption } from "@/lib/projectTeam";
import {
  useTimeEntries,
  useDevices,
  useAttachments,
  netMinutes,
  formatMinutes,
  isoToLocalInput,
  localToIso,
  type DeviceConflict,
  type ContributionAttachment,
} from "@/lib/opsStore";

const inputCls =
  "w-full h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";
const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";

function SectionHead({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span style={{ color: SOFT }}>{icon}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: SOFT }}>{title}</span>
      <div className="flex-1" />
      {right}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] leading-snug" style={{ color: SOFT }}>{children}</div>;
}

const nowLocal = () => isoToLocalInput(new Date().toISOString());

const fmtSpan = (startIso: string, endIso: string) => {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const d = (x: Date) => x.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const t = (x: Date) => x.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return d(s) === d(e) ? `${d(s)} ${t(s)}–${t(e)}` : `${d(s)} ${t(s)} – ${d(e)} ${t(e)}`;
};

/* =============================================== Zeiterfassung je Beitrag */

export function ContributionTimePanel({
  projectId, itemId, canEdit, members, plannedMinutes,
}: {
  projectId: string;
  itemId: string;
  canEdit: boolean;
  members: TeamMemberOption[];
  /** Soll-Dauer aus dem Beitragszeitraum (Minuten) – nur zur Einordnung. */
  plannedMinutes?: number;
}) {
  const time = useTimeEntries(projectId);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [start, setStart] = useState(nowLocal);
  const [end, setEnd] = useState(nowLocal);
  const [pause, setPause] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mine = time.myId ?? "";
  const entries = useMemo(
    () => time.entries.filter((e) => e.item_id === itemId),
    [time.entries, itemId],
  );
  const total = entries.reduce((s, e) => s + netMinutes(e), 0);
  const actual = time.actualsByItem.get(itemId);
  const overlapIds = time.overlapIds;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? (id === mine ? "Ich" : "Unbekannt");

  const submit = async () => {
    setError(null);
    const s = localToIso(start);
    const e = localToIso(end);
    if (!s || !e) { setError("Bitte Beginn und Ende angeben."); return; }
    if (Date.parse(e) <= Date.parse(s)) { setError("Das Ende muss nach dem Beginn liegen."); return; }
    const gross = (Date.parse(e) - Date.parse(s)) / 60000;
    if (pause > gross) { setError("Die Pause ist länger als der erfasste Zeitraum."); return; }
    try {
      await time.add({ itemId, userId: userId || mine, startedAt: s, endedAt: e, breakMinutes: pause, note });
      setNote("");
      setPause(0);
      setOpen(false);
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    }
  };

  return (
    <div className="rounded-lg p-2.5" style={{ border: `1px solid ${LINE}` }}>
      <SectionHead
        icon={<Clock size={12} />}
        title="Zeiterfassung"
        right={<span className="text-[11px] tabular-nums">{formatMinutes(total)}</span>}
      />
      {plannedMinutes ? (
        <Hint>
          Soll aus Zeitraum: {formatMinutes(plannedMinutes)} · Ist: {formatMinutes(total)}
        </Hint>
      ) : null}
      {/* Ist-Werte werden ausschließlich aus den Zeiteinträgen abgeleitet. */}
      {actual ? (
        <Hint>
          Tatsächlich: {fmtSpan(actual.startedAt, actual.endedAt)} · Aufwand {formatMinutes(actual.minutes)}
        </Hint>
      ) : null}

      {time.unavailable ? (
        <Hint>Zeiterfassung steht erst für geteilte Projekte mit Anmeldung zur Verfügung.</Hint>
      ) : (
        <>
          <div className="flex flex-col gap-1 mt-1.5">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-[11px]">
                <span className="truncate flex-1">
                  {nameOf(e.user_id)} · {fmtSpan(e.started_at, e.ended_at)}
                  {e.break_minutes ? ` · ${e.break_minutes} min Pause` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                <span className="tabular-nums shrink-0">{formatMinutes(netMinutes(e))}</span>
                {(e.user_id === mine || canEdit) && (
                  <button
                    className="shrink-0 opacity-60 hover:opacity-100"
                    title="Eintrag löschen"
                    onClick={() => void time.remove(e.id).catch((err) => setError((err as Error).message))}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
            {!entries.length && <Hint>Noch keine Zeiten erfasst.</Hint>}
          </div>

          {canEdit && !open && (
            <button
              onClick={() => { setOpen(true); setUserId(mine); }}
              className="mt-2 flex items-center gap-1 h-7 px-2 rounded-md border text-[11px]"
              style={{ borderColor: LINE }}
            >
              <Plus size={11} /> Zeit erfassen
            </button>
          )}

          {open && (
            <div className="mt-2 flex flex-col gap-1.5">
              <select className={inputCls} value={userId} onChange={(ev) => setUserId(ev.target.value)}>
                <option value={mine}>Eigene Zeit</option>
                {members.filter((m) => m.id !== mine).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="datetime-local" className={inputCls} value={start} onChange={(ev) => setStart(ev.target.value)} />
                <input type="datetime-local" className={inputCls} value={end} onChange={(ev) => setEnd(ev.target.value)} />
              </div>
              <input
                type="number" min={0} className={inputCls} value={pause}
                onChange={(ev) => setPause(Number(ev.target.value) || 0)}
                placeholder="Pause in Minuten"
              />
              <input className={inputCls} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Bemerkung (optional)" />
              {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
              <div className="flex gap-1.5">
                <button onClick={() => void submit()} className="h-7 px-2.5 rounded-md border text-[11px]"
                        style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}>
                  Speichern
                </button>
                <button onClick={() => { setOpen(false); setError(null); }} className="h-7 px-2.5 rounded-md border text-[11px]" style={{ borderColor: LINE }}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================ Geräte/Werkzeuge je Beitrag */

export function ContributionDevicesPanel({
  projectId, itemId, canEdit, members,
}: {
  projectId: string;
  itemId: string;
  canEdit: boolean;
  members: TeamMemberOption[];
}) {
  const devices = useDevices(projectId);
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [responsible, setResponsible] = useState("");
  const [start, setStart] = useState(nowLocal);
  const [end, setEnd] = useState(nowLocal);
  const [conflicts, setConflicts] = useState<DeviceConflict[] | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const bookings = useMemo(
    () => devices.bookings.filter((b) => b.item_id === itemId),
    [devices.bookings, itemId],
  );
  const deviceName = (id: string) => devices.devices.find((d) => d.id === id)?.name ?? "Gerät";
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "Unbekannt" : "—");

  const save = async (overrideReason?: string) => {
    setError(null);
    const s = localToIso(start);
    const e = localToIso(end);
    if (!deviceId) { setError("Bitte ein Gerät wählen."); return; }
    if (!s || !e || Date.parse(e) <= Date.parse(s)) { setError("Bitte einen gültigen Zeitraum angeben."); return; }
    try {
      if (!overrideReason) {
        const found = await devices.checkConflicts(deviceId, s, e);
        if (found.length) { setConflicts(found); return; }
      }
      await devices.book({
        deviceId,
        itemId,
        responsibleId: responsible || null,
        startsAt: s,
        endsAt: e,
        overrideReason,
      });
      setOpen(false);
      setConflicts(null);
      setReason("");
    } catch (err) {
      setError((err as Error)?.message ?? "Buchung nicht möglich.");
    }
  };

  return (
    <div className="rounded-lg p-2.5" style={{ border: `1px solid ${LINE}` }}>
      <SectionHead icon={<Wrench size={12} />} title="Geräte & Werkzeuge" />

      {devices.unavailable ? (
        <Hint>Geräte stehen erst für geteilte Projekte mit Anmeldung zur Verfügung.</Hint>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center gap-2 text-[11px]">
                <span className="flex-1 truncate">
                  {deviceName(b.device_id)} · {fmtSpan(b.starts_at, b.ends_at)} · {nameOf(b.responsible_id)}
                  {b.override_reason ? ` · übersteuert: ${b.override_reason}` : ""}
                </span>
                {canEdit && (
                  <button className="opacity-60 hover:opacity-100" title="Buchung entfernen"
                          onClick={() => void devices.removeBooking(b.id).catch((err) => setError((err as Error).message))}>
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
            {!bookings.length && <Hint>Diesem Beitrag ist noch kein Gerät zugeordnet.</Hint>}
          </div>

          {canEdit && !open && (
            <button onClick={() => setOpen(true)} className="mt-2 flex items-center gap-1 h-7 px-2 rounded-md border text-[11px]" style={{ borderColor: LINE }}>
              <Plus size={11} /> Gerät buchen
            </button>
          )}

          {open && (
            <div className="mt-2 flex flex-col gap-1.5">
              <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                <option value="">Gerät wählen …</option>
                {devices.devices.filter((d) => !d.archived).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select className={inputCls} value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                <option value="">Verantwortlich: offen</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-1.5">
                <input type="datetime-local" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
                <input type="datetime-local" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>

              {conflicts && (
                <div className="rounded-md p-2" style={{ border: "1px solid #f59e0b", background: "#f59e0b18" }}>
                  <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#b45309" }}>
                    <AlertTriangle size={11} /> Doppelbelegung erkannt
                  </div>
                  <ul className="mt-1 text-[11px] list-disc pl-4">
                    {conflicts.map((c) => (
                      <li key={c.id}>
                        {fmtSpan(c.starts_at, c.ends_at)} ·{" "}
                        {c.masked ? "anderes Projekt (Details nicht sichtbar)" : c.project_name || "Projekt"}
                      </li>
                    ))}
                  </ul>
                  <input
                    className={`${inputCls} mt-1.5`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Begründung für die Übersteuerung"
                  />
                </div>
              )}

              {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
              <div className="flex gap-1.5">
                <button
                  onClick={() => void save(conflicts ? reason.trim() || undefined : undefined)}
                  disabled={!!conflicts && !reason.trim()}
                  className="h-7 px-2.5 rounded-md border text-[11px] disabled:opacity-50"
                  style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}
                >
                  {conflicts ? "Trotzdem buchen" : "Buchen"}
                </button>
                <button onClick={() => { setOpen(false); setConflicts(null); setError(null); }}
                        className="h-7 px-2.5 rounded-md border text-[11px]" style={{ borderColor: LINE }}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================================================ Anhänge je Beitrag */

export function ContributionAttachmentsPanel({
  projectId, itemId, canEdit,
}: {
  projectId: string;
  itemId: string;
  canEdit: boolean;
}) {
  const files = useAttachments(projectId, itemId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async (a: ContributionAttachment) => {
    try {
      const url = await files.openUrl(a);
      if (url) window.open(url, "_blank", "noopener");
    } catch (err) {
      setError((err as Error)?.message ?? "Datei konnte nicht geöffnet werden.");
    }
  };

  return (
    <div className="rounded-lg p-2.5" style={{ border: `1px solid ${LINE}` }}>
      <SectionHead icon={<Paperclip size={12} />} title="Dokumente / Anhänge" />

      {files.unavailable ? (
        <Hint>Anhänge stehen erst für geteilte Projekte mit Anmeldung zur Verfügung.</Hint>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {files.attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[11px]">
                <button className="flex-1 truncate text-left hover:underline" onClick={() => void open(a)}>
                  {a.file_name}
                </button>
                <button className="opacity-60 hover:opacity-100" title="Öffnen" onClick={() => void open(a)}>
                  <ExternalLink size={11} />
                </button>
                {canEdit && (
                  <button
                    className="opacity-60 hover:opacity-100"
                    title="Zuordnung entfernen"
                    onClick={() => void files.unlink(a).catch((err) => setError((err as Error).message))}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
            {!files.attachments.length && <Hint>Noch keine Dateien hinterlegt.</Hint>}
          </div>

          {canEdit && (
            <label className="mt-2 inline-flex items-center gap-1 h-7 px-2 rounded-md border text-[11px] cursor-pointer"
                   style={{ borderColor: LINE, opacity: busy ? 0.6 : 1 }}>
              <Plus size={11} /> {busy ? "Wird hochgeladen …" : "Datei hinzufügen"}
              <input
                type="file"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setError(null);
                  try { await files.upload(file); }
                  catch (err) { setError((err as Error)?.message ?? "Upload fehlgeschlagen."); }
                  finally { setBusy(false); }
                }}
              />
            </label>
          )}
          {error && <div className="mt-1 text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
        </>
      )}
    </div>
  );
}
