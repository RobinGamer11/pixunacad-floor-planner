/**
 * Paket 05 – Geräte und Werkzeuge im Netzwerkbereich.
 *
 * Ein Gerät gehört einer Person, kann eine verantwortliche Person haben und
 * ist für alle Projekte sichtbar, in denen es gebucht ist. Geräte mit
 * Buchungshistorie werden archiviert statt gelöscht.
 */
import { useMemo, useState } from "react";
import { Plus, Archive, ArchiveRestore, Wrench } from "lucide-react";
import { useDevices } from "@/lib/opsStore";

const inputCls = "h-8 rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";
const LINE = "hsl(var(--hairline))";
const SOFT = "hsl(var(--ink-soft))";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function DevicesTab({
  projectNames,
  peopleById,
}: {
  projectNames: Map<string, string>;
  peopleById: Map<string, string>;
}) {
  const devices = useDevices(undefined);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [responsible, setResponsible] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => Array.from(peopleById.entries()), [peopleById]);
  const list = useMemo(
    () => devices.devices.filter((d) => (showArchived ? true : !d.archived)),
    [devices.devices, showArchived],
  );

  const bookingsOf = (deviceId: string) =>
    devices.bookings
      .filter((b) => b.device_id === deviceId)
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
      .slice(0, 5);

  if (devices.unavailable) {
    return (
      <div className="text-xs" style={{ color: SOFT }}>
        Geräte stehen zur Verfügung, sobald du angemeldet bist und die Projektfreigabe eingerichtet ist.
      </div>
    );
  }

  const add = async () => {
    setError(null);
    if (!name.trim()) { setError("Bitte einen Namen angeben."); return; }
    try {
      await devices.addDevice(name, note, responsible || null);
      setName("");
      setNote("");
      setResponsible("");
    } catch (err) {
      setError((err as Error)?.message ?? "Anlegen nicht möglich.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <input className={`${inputCls} min-w-[160px]`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Gerät / Werkzeug" />
        <input className={`${inputCls} min-w-[160px] flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bemerkung (optional)" />
        <select className={inputCls} value={responsible} onChange={(e) => setResponsible(e.target.value)}>
          <option value="">Verantwortlich: offen</option>
          {people.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button onClick={() => void add()} className="h-8 px-3 rounded-md border text-xs flex items-center gap-1"
                style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}>
          <Plus size={12} /> Anlegen
        </button>
        <button onClick={() => setShowArchived((v) => !v)} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: LINE, color: SOFT }}>
          {showArchived ? "Archivierte ausblenden" : "Archivierte anzeigen"}
        </button>
      </div>
      {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}

      <div className="flex flex-col gap-2">
        {list.map((d) => {
          const canManage = d.owner_id === devices.myId || d.responsible_id === devices.myId;
          const recent = bookingsOf(d.id);
          return (
            <div key={d.id} className="rounded-lg p-2.5" style={{ border: `1px solid ${LINE}`, opacity: d.archived ? 0.6 : 1 }}>
              <div className="flex items-center gap-2">
                <Wrench size={13} style={{ color: SOFT }} />
                <span className="text-xs font-medium truncate">{d.name}</span>
                <span className="text-[11px]" style={{ color: SOFT }}>
                  {d.responsible_id ? `· ${peopleById.get(d.responsible_id) ?? "Verantwortlich"}` : "· ohne Verantwortliche"}
                </span>
                <div className="flex-1" />
                {canManage && (
                  <button
                    className="h-7 px-2 rounded-md border text-[11px] flex items-center gap-1"
                    style={{ borderColor: LINE }}
                    onClick={() => void devices.updateDevice(d.id, { archived: !d.archived })}
                  >
                    {d.archived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
                    {d.archived ? "Reaktivieren" : "Archivieren"}
                  </button>
                )}
              </div>
              {d.note && <div className="mt-1 text-[11px]" style={{ color: SOFT }}>{d.note}</div>}
              <div className="mt-1.5 flex flex-col gap-0.5">
                {recent.map((b) => (
                  <div key={b.id} className="text-[11px]" style={{ color: SOFT }}>
                    {fmt(b.starts_at)} – {fmt(b.ends_at)} · {projectNames.get(b.project_id) ?? "Projekt"}
                    {b.override_reason ? ` · übersteuert: ${b.override_reason}` : ""}
                  </div>
                ))}
                {!recent.length && <div className="text-[11px]" style={{ color: SOFT }}>Keine Buchungen.</div>}
              </div>
            </div>
          );
        })}
        {!list.length && <div className="text-xs" style={{ color: SOFT }}>Noch keine Geräte angelegt.</div>}
      </div>
    </div>
  );
}
