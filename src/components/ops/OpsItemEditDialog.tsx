/**
 * Bestehende Beiträge bearbeiten – dieselbe Board-Datenbasis wie überall
 * (`timelineStore`). Änderungen sind sofort projektbezogen und
 * projektübergreifend sichtbar, weil kein zweiter Datensatz entsteht.
 */
import { useEffect, useMemo, useState } from "react";
import { Modal, Field, Actions, inputCls, LINE, SOFT } from "@/components/ops/OpsActionBar";
import { subscribeTimeline, timelineStore, type TlItem } from "@/lib/timelineStore";
import { useProjectsMemberOptions } from "@/lib/projectTeam";
import { useTimeEntriesForProjects, formatMinutes, netMinutes } from "@/lib/opsStore";

export function OpsItemEditDialog({
  projectId,
  projectName,
  itemId,
  onClose,
}: {
  projectId: string;
  projectName?: string;
  itemId: string;
  onClose: () => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeTimeline(projectId, () => setTick((t) => t + 1)), [projectId]);

  const state = useMemo(() => {
    try {
      return timelineStore.getState(projectId);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tick]);

  const item = state?.items.find((i) => i.id === itemId) as TlItem | undefined;

  const ids = useMemo(() => [projectId], [projectId]);
  const { byProject } = useProjectsMemberOptions(ids);
  const members = byProject[projectId] ?? [];
  const times = useTimeEntriesForProjects(ids);
  const bookedMinutes = useMemo(
    () => times.entries.filter((e) => e.item_id === itemId).reduce((s, e) => s + netMinutes(e), 0),
    [times.entries, itemId],
  );

  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [startDate, setStartDate] = useState(item?.startDate ?? "");
  const [endDate, setEndDate] = useState(item?.endDate ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [priorityId, setPriorityId] = useState(item?.priorityId ?? "");
  const [statusId, setStatusId] = useState(item?.statusId ?? "open");
  const [assignees, setAssignees] = useState<string[]>(item?.assignees ?? []);
  const [error, setError] = useState<string | null>(null);

  if (!item || !state) {
    return (
      <Modal title="Beitrag" onClose={onClose}>
        <div className="text-[11px]" style={{ color: SOFT }}>Dieser Beitrag ist nicht mehr vorhanden.</div>
      </Modal>
    );
  }

  const toggleAssignee = (id: string) =>
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = () => {
    if (!title.trim()) { setError("Bitte einen Namen angeben."); return; }
    if (endDate && startDate && endDate < startDate) { setError("Das Ende darf nicht vor dem Beginn liegen."); return; }
    timelineStore.updateItem(projectId, itemId, {
      title: title.trim(),
      description,
      startDate: startDate || item.startDate,
      endDate: endDate || undefined,
      categoryId: categoryId || undefined,
      priorityId: priorityId || undefined,
      statusId,
      statusManual: true,
      done: statusId === "done",
      assignees,
    });
    timelineStore.markFresh(projectId, itemId);
    onClose();
  };

  return (
    <Modal title={`Beitrag bearbeiten${projectName ? ` · ${projectName}` : ""}`} onClose={onClose}>
      <div className="flex flex-col gap-2">
        <Field label="Name">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Beschreibung">
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Beginn">
            <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Ende (optional)">
            <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Kategorie">
            <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Ohne Kategorie</option>
              {state.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Priorität">
            <select className={inputCls} value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
              <option value="">Ohne Priorität</option>
              {state.priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Status">
          <select className={inputCls} value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            {state.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>

        <Field label="Verantwortliche">
          <div className="flex flex-wrap gap-1.5">
            {!members.length && <span className="text-[11px]" style={{ color: SOFT }}>Keine Projektmitglieder vorhanden.</span>}
            {members.map((m) => {
              const on = assignees.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleAssignee(m.id)}
                  className="h-8 px-2.5 rounded-md border text-[11px]"
                  style={{ borderColor: on ? "hsl(var(--accent-gold))" : LINE, color: on ? "hsl(var(--ink))" : SOFT }}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="text-[11px]" style={{ color: SOFT }}>
          Erfasste Arbeitszeit für diesen Beitrag: <span className="tabular-nums">{formatMinutes(bookedMinutes)}</span>
        </div>

        <Actions busy={false} onSave={save} onClose={onClose} />
        {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
      </div>
    </Modal>
  );
}

export default OpsItemEditDialog;
