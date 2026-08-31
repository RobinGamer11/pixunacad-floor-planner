/**
 * Paket 05 – Geräte und Werkzeuge im Netzwerkbereich.
 *
 * Ein Gerät gehört einer Person, kann eine verantwortliche Person haben und
 * ist für alle Projekte sichtbar, in denen es gebucht ist. Geräte mit
 * Buchungshistorie werden archiviert statt gelöscht.
 */
import { useMemo, useState } from "react";
import { Plus, Archive, ArchiveRestore, Wrench, Pencil, Trash2, Check, X } from "lucide-react";
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
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [responsible, setResponsible] = useState("");
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", note: "", responsible: "" });
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => Array.from(peopleById.entries()), [peopleById]);

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return devices.devices.filter((d) => {
      if (!q) return true;
      const person = d.responsible_id ? peopleById.get(d.responsible_id) ?? "" : "";
      return [d.name, d.note ?? "", person].some((v) => v.toLowerCase().includes(q));
    });
  }, [devices.devices, filter, peopleById]);

  const active = matches.filter((d) => !d.archived);
  const archived = matches.filter((d) => d.archived);

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
      setFormOpen(false);
    } catch (err) {
      setError((err as Error)?.message ?? "Anlegen nicht möglich.");
    }
  };

  const saveEdit = async (id: string) => {
    setError(null);
    try {
      await devices.updateDevice(id, {
        name: editDraft.name.trim() || "Gerät",
        note: editDraft.note.trim() || null,
        responsible_id: editDraft.responsible || null,
      });
      setEditing(null);
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    }
  };

  const removeOne = async (id: string, label: string) => {
    setError(null);
    if (!window.confirm(`Gerät „${label}" endgültig löschen?`)) return;
    try {
      await devices.removeDevice(id);
    } catch (err) {
      setError((err as Error)?.message ?? "Löschen nicht möglich.");
    }
  };

  const row = (d: (typeof devices.devices)[number]) => {
    const canManage = d.owner_id === devices.myId || d.responsible_id === devices.myId;
    const recent = bookingsOf(d.id);
    const isEditing = editing === d.id;
    return (
      <div key={d.id} className="rounded-lg p-2.5" style={{ border: `1px solid ${LINE}`, opacity: d.archived ? 0.7 : 1 }}>
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inputCls} min-w-[150px]`} value={editDraft.name}
                   onChange={(e) => setEditDraft((v) => ({ ...v, name: e.target.value }))} placeholder="Name" />
            <input className={`${inputCls} min-w-[150px] flex-1`} value={editDraft.note}
                   onChange={(e) => setEditDraft((v) => ({ ...v, note: e.target.value }))} placeholder="Bemerkung (optional)" />
            <select className={inputCls} value={editDraft.responsible}
                    onChange={(e) => setEditDraft((v) => ({ ...v, responsible: e.target.value }))}>
              <option value="">Verantwortlich: offen</option>
              {people.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <button className="h-7 px-2 rounded-md border text-[11px] flex items-center gap-1"
                    style={{ borderColor: "hsl(var(--accent-gold))" }} onClick={() => void saveEdit(d.id)}>
              <Check size={11} /> Speichern
            </button>
            <button className="h-7 px-2 rounded-md border text-[11px] flex items-center gap-1"
                    style={{ borderColor: LINE }} onClick={() => setEditing(null)}>
              <X size={11} /> Abbrechen
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Wrench size={13} style={{ color: SOFT }} />
            <span className="text-xs font-medium truncate">{d.name}</span>
            <span className="text-[11px]" style={{ color: SOFT }}>
              {d.responsible_id ? `· ${peopleById.get(d.responsible_id) ?? "Verantwortlich"}` : "· ohne Verantwortliche"}
            </span>
            <div className="flex-1" />
            {canManage && (
              <>
                <button className="h-7 px-2 rounded-md border text-[11px] flex items-center gap-1" style={{ borderColor: LINE }}
                        onClick={() => { setEditing(d.id); setEditDraft({ name: d.name, note: d.note ?? "", responsible: d.responsible_id ?? "" }); }}>
                  <Pencil size={11} /> Bearbeiten
                </button>
                <button
                  className="h-7 px-2 rounded-md border text-[11px] flex items-center gap-1"
                  style={{ borderColor: LINE }}
                  onClick={() => void devices.updateDevice(d.id, { archived: !d.archived })}
                >
                  {d.archived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
                  {d.archived ? "Reaktivieren" : "Archivieren"}
                </button>
                <button className="h-7 px-2 rounded-md border text-[11px] flex items-center gap-1" style={{ borderColor: LINE }}
                        onClick={() => void removeOne(d.id, d.name)}>
                  <Trash2 size={11} /> Löschen
                </button>
              </>
            )}
          </div>
        )}
        {d.note && !isEditing && <div className="mt-1 text-[11px]" style={{ color: SOFT }}>{d.note}</div>}
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
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium">Geräte &amp; Werkzeuge sind projektübergreifend zu managen</div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFormOpen((v) => !v)} className="h-8 px-3 rounded-md border text-xs flex items-center gap-1"
                style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}>
          <Plus size={12} /> Anlegen
        </button>
        <input
          className={`${inputCls} min-w-[220px] flex-1`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter: Name, Bezeichnung oder verantwortliche Person"
        />
      </div>

      {formOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg p-2.5" style={{ border: `1px solid ${LINE}` }}>
          <input className={`${inputCls} min-w-[160px]`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Gerät / Werkzeug" />
          <input className={`${inputCls} min-w-[160px] flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bemerkung (optional)" />
          <select className={inputCls} value={responsible} onChange={(e) => setResponsible(e.target.value)}>
            <option value="">Verantwortlich: offen</option>
            {people.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <button onClick={() => void add()} className="h-8 px-3 rounded-md border text-xs flex items-center gap-1"
                  style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}>
            <Check size={12} /> Speichern
          </button>
          <button onClick={() => { setFormOpen(false); setError(null); }} className="h-8 px-3 rounded-md border text-xs" style={{ borderColor: LINE, color: SOFT }}>
            Abbrechen
          </button>
        </div>
      )}

      {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}

      <div className="flex flex-col gap-2">
        {active.map(row)}
        {!active.length && <div className="text-xs" style={{ color: SOFT }}>Keine Geräte vorhanden.</div>}
      </div>

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: SOFT }}>
            Archiviert ({archived.length})
          </div>
          {archived.map(row)}
        </div>
      )}
    </div>
  );
}
