/**
 * Kategorien und Prioritäten verwalten.
 *
 * Es werden ausschließlich die vorhandenen Board-/Timeline-Kategorien und
 * -Prioritäten bearbeitet (`timelineStore`). Änderungen erscheinen dadurch
 * sofort in Beitragserstellung, Bearbeitung, Filtern, Kreisdiagramm,
 * Ansichtstrahl, Projektnetz und Gantt.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, Field, inputCls, LINE, SOFT, GOLD, type OpsProjectRef } from "@/components/ops/OpsActionBar";
import { subscribeTimeline, timelineStore, QUICK_CATEGORY_ID } from "@/lib/timelineStore";

function useBoard(projectId: string) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    return subscribeTimeline(projectId, () => setTick((t) => t + 1));
  }, [projectId]);
  return useMemo(() => {
    if (!projectId) return null;
    try {
      timelineStore.ensureDefaults(projectId);
      return timelineStore.getState(projectId);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tick]);
}

function ProjectPick({
  projects, fixedProjectId, value, onChange,
}: { projects: OpsProjectRef[]; fixedProjectId?: string; value: string; onChange: (v: string) => void }) {
  if (fixedProjectId) return null;
  return (
    <Field label="Projekt">
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {!projects.length && <option value="">Kein Projekt vorhanden</option>}
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Field>
  );
}

/* ------------------------------------------------------------- Kategorien */

export function CategoryManagerDialog({
  projects, fixedProjectId, onClose,
}: { projects: OpsProjectRef[]; fixedProjectId?: string; onClose: () => void }) {
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const state = useBoard(projectId);
  const categories = state?.categories ?? [];
  const items = state?.items ?? [];

  const [name, setName] = useState("");
  const [color, setColor] = useState("#c9a227");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usedBy = (id: string) => items.filter((i) => i.categoryId === id).length;

  const add = () => {
    if (!projectId) { setError("Bitte ein Projekt wählen."); return; }
    if (!name.trim()) { setError("Bitte einen Namen angeben."); return; }
    timelineStore.addCategory(projectId, name.trim(), color);
    setName("");
    setError(null);
  };

  const remove = (id: string) => {
    const count = usedBy(id);
    if (!count) { timelineStore.removeCategory(projectId, id); setPendingDelete(null); return; }
    if (pendingDelete !== id) { setPendingDelete(id); setReplacement(""); return; }
    if (!replacement) { setError("Bitte eine Ersatzkategorie wählen."); return; }
    items.filter((i) => i.categoryId === id).forEach((i) =>
      timelineStore.updateItem(projectId, i.id, { categoryId: replacement }),
    );
    timelineStore.removeCategory(projectId, id);
    setPendingDelete(null);
    setError(null);
  };

  return (
    <Modal title="Kategorien verwalten" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ProjectPick projects={projects} fixedProjectId={fixedProjectId} value={projectId} onChange={setProjectId} />

        <div className="flex flex-col gap-2">
          {categories.map((c) => {
            const count = usedBy(c.id);
            return (
              <div key={c.id} className="flex flex-col gap-1.5 rounded-lg border p-2" style={{ borderColor: LINE }}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={c.color}
                    onChange={(e) => timelineStore.updateCategory(projectId, c.id, { color: e.target.value })}
                    className="h-9 w-10 rounded-md border bg-transparent"
                    style={{ borderColor: LINE }}
                    aria-label={`Farbe von ${c.label}`}
                  />
                  <input
                    className={`${inputCls} flex-1 min-w-[140px]`}
                    value={c.label}
                    onChange={(e) => timelineStore.updateCategory(projectId, c.id, { label: e.target.value })}
                  />
                  <span className="text-[11px] tabular-nums" style={{ color: SOFT }}>{count} Beiträge</span>
                  {c.id !== QUICK_CATEGORY_ID && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="h-9 w-9 rounded-md border flex items-center justify-center"
                      style={{ borderColor: LINE }}
                      title={count ? "Beiträge zuerst neu zuordnen" : "Löschen"}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {pendingDelete === c.id && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px]" style={{ color: SOFT }}>Beiträge stattdessen zuordnen zu:</span>
                    <select className={`${inputCls} max-w-[220px]`} value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                      <option value="">Bitte wählen</option>
                      {categories.filter((x) => x.id !== c.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="h-9 px-3 rounded-md border text-[11px]"
                      style={{ borderColor: GOLD, color: GOLD }}
                    >
                      Umziehen und löschen
                    </button>
                    <button type="button" onClick={() => setPendingDelete(null)} className="h-9 px-3 rounded-md border text-[11px]" style={{ borderColor: LINE }}>
                      Abbrechen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!categories.length && <div className="text-[11px]" style={{ color: SOFT }}>Noch keine Kategorien.</div>}
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2" style={{ borderColor: LINE }}>
          <div className="flex-1 min-w-[160px]">
            <Field label="Neue Kategorie">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </Field>
          </div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 rounded-md border bg-transparent"
            style={{ borderColor: LINE }}
            aria-label="Farbe der neuen Kategorie"
          />
          <button type="button" onClick={add} className="h-9 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: GOLD, color: "hsl(var(--ink))" }}>
            <Plus size={14} /> Hinzufügen
          </button>
        </div>

        {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ Prioritäten */

export function PriorityManagerDialog({
  projects, fixedProjectId, onClose,
}: { projects: OpsProjectRef[]; fixedProjectId?: string; onClose: () => void }) {
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const state = useBoard(projectId);
  const priorities = useMemo(
    () => [...(state?.priorities ?? [])].sort((a, b) => b.percent - a.percent),
    [state?.priorities],
  );
  const items = state?.items ?? [];

  const [name, setName] = useState("");
  const [percent, setPercent] = useState(50);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usedBy = (id: string) => items.filter((i) => i.priorityId === id).length;

  const add = () => {
    if (!projectId) { setError("Bitte ein Projekt wählen."); return; }
    if (!name.trim()) { setError("Bitte einen Namen angeben."); return; }
    timelineStore.addPriority(projectId, name.trim(), percent);
    setName("");
    setError(null);
  };

  const remove = (id: string) => {
    const count = usedBy(id);
    if (!count) { timelineStore.removePriority(projectId, id); setPendingDelete(null); return; }
    if (pendingDelete !== id) { setPendingDelete(id); setReplacement(""); return; }
    if (!replacement) { setError("Bitte eine Ersatzpriorität wählen."); return; }
    items.filter((i) => i.priorityId === id).forEach((i) =>
      timelineStore.updateItem(projectId, i.id, { priorityId: replacement }),
    );
    timelineStore.removePriority(projectId, id);
    setPendingDelete(null);
    setError(null);
  };

  return (
    <Modal title="Prioritäten verwalten" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ProjectPick projects={projects} fixedProjectId={fixedProjectId} value={projectId} onChange={setProjectId} />
        <div className="text-[11px]" style={{ color: SOFT }}>
          Der Rang bestimmt die Reihenfolge: 100 = höchste Priorität.
        </div>

        <div className="flex flex-col gap-2">
          {priorities.map((p) => {
            const count = usedBy(p.id);
            return (
              <div key={p.id} className="flex flex-col gap-1.5 rounded-lg border p-2" style={{ borderColor: LINE }}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${inputCls} flex-1 min-w-[140px]`}
                    value={p.label}
                    onChange={(e) => timelineStore.updatePriority(projectId, p.id, { label: e.target.value })}
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className={`${inputCls} w-[90px]`}
                    value={p.percent}
                    onChange={(e) => timelineStore.updatePriority(projectId, p.id, { percent: Number(e.target.value) || 1 })}
                    aria-label={`Rang von ${p.label}`}
                  />
                  <span className="text-[11px] tabular-nums" style={{ color: SOFT }}>{count} Beiträge</span>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="h-9 w-9 rounded-md border flex items-center justify-center"
                    style={{ borderColor: LINE }}
                    title={count ? "Beiträge zuerst neu zuordnen" : "Löschen"}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {pendingDelete === p.id && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px]" style={{ color: SOFT }}>Beiträge stattdessen zuordnen zu:</span>
                    <select className={`${inputCls} max-w-[220px]`} value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                      <option value="">Bitte wählen</option>
                      {priorities.filter((x) => x.id !== p.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.label}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => remove(p.id)} className="h-9 px-3 rounded-md border text-[11px]" style={{ borderColor: GOLD, color: GOLD }}>
                      Umziehen und löschen
                    </button>
                    <button type="button" onClick={() => setPendingDelete(null)} className="h-9 px-3 rounded-md border text-[11px]" style={{ borderColor: LINE }}>
                      Abbrechen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!priorities.length && <div className="text-[11px]" style={{ color: SOFT }}>Noch keine Prioritäten.</div>}
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2" style={{ borderColor: LINE }}>
          <div className="flex-1 min-w-[160px]">
            <Field label="Neue Priorität">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </Field>
          </div>
          <div className="w-[110px]">
            <Field label="Rang (1–100)">
              <input type="number" min={1} max={100} className={inputCls} value={percent}
                     onChange={(e) => setPercent(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
            </Field>
          </div>
          <button type="button" onClick={add} className="h-9 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: GOLD, color: "hsl(var(--ink))" }}>
            <Plus size={14} /> Hinzufügen
          </button>
        </div>

        {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
      </div>
    </Modal>
  );
}
