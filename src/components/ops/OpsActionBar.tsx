/**
 * Gemeinsame Organisations-Aktion für
 *   * Startseite → Organisation (projektübergreifend, Projekt wählbar)
 *   * Projekt → Organisation (Projekt fest vorausgewählt)
 *
 * Es gibt genau eine Hauptaktion „+ Beitrag“. Im Dialog wird zwischen
 * einem normalen Beitrag und einer Zeiterfassung gewählt – beides schreibt
 * weiterhin in die bestehenden Datenquellen (Board-Beiträge, `time_entries`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { X, ListPlus } from "lucide-react";
import {
  addTimeEntryFor,
  isoDate,
  isoToLocalInput,
  localToIso,
} from "@/lib/opsStore";
import {
  addQuickItem,
  subscribeTimeline,
  timelineStore,
  QUICK_CATEGORY_ID,
  type TlPriority,
} from "@/lib/timelineStore";
import { useProjectsMemberOptions } from "@/lib/projectTeam";

export const inputCls =
  "w-full h-9 rounded-md border bg-background text-foreground px-2 text-xs outline-none focus:ring-1 focus:ring-ring [&>option]:bg-background [&>option]:text-foreground";
export const LINE = "hsl(var(--hairline))";
export const SOFT = "hsl(var(--ink-soft))";
export const GOLD = "hsl(var(--accent-gold))";

export interface OpsProjectRef {
  id: string;
  name: string;
}

/** Beiträge eines Projekts aus der bestehenden Board-Datenbasis. */
function useItems(projectId: string) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    return subscribeTimeline(projectId, () => setTick((t) => t + 1));
  }, [projectId]);
  return useMemo(
    () =>
      projectId
        ? (timelineStore.getState(projectId).items as { id: string; title: string }[]).map((i) => ({
            id: i.id,
            title: i.title || "Ohne Titel",
          }))
        : [],
    [projectId, tick],
  );
}

/** Kategorien und Prioritäten eines Projekts – dieselbe Board-Datenbasis. */
function useBoardMeta(projectId: string) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    return subscribeTimeline(projectId, () => setTick((t) => t + 1));
  }, [projectId]);
  return useMemo(() => {
    if (!projectId) return { categories: [] as { id: string; label: string }[], priorities: [] as TlPriority[] };
    try {
      timelineStore.ensureDefaults(projectId);
      const st = timelineStore.getState(projectId);
      return {
        categories: st.categories.map((c) => ({ id: c.id, label: c.label })),
        priorities: st.priorities,
      };
    } catch {
      return { categories: [] as { id: string; label: string }[], priorities: [] as TlPriority[] };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tick]);
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
  /** Zusätzliche Schaltflächen links davor. */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  const { byProject } = useProjectsMemberOptions(ids);

  const close = (changed?: boolean) => {
    setOpen(false);
    if (changed) onChanged?.();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <button
          onClick={() => setOpen(true)}
          className="h-12 px-5 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition hover:opacity-90"
          style={{ background: GOLD, color: "hsl(var(--ink))" }}
        >
          <ListPlus size={17} /> + Beitrag
        </button>
      </div>

      {open && (
        <ContributionDialog
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

export function Modal({
  title, onClose, children, wide = true,
}: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
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
        className={`w-full ${wide ? "sm:max-w-[760px]" : "sm:max-w-[520px]"} max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-t-2xl sm:rounded-2xl p-4`}
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: SOFT }}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Beschreibungsfeld: nutzt die volle Dialogbreite, bricht Text um, wächst
 * beim Tippen mit und scrollt erst ab einer sinnvollen Höhe im Feld selbst.
 */
export function AutoTextarea({
  value, onChange, placeholder, minRows = 3, maxHeight = 280,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value, maxHeight]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-full block resize-none rounded-md border bg-background text-foreground px-2 py-1.5 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-ring"
      style={{ maxHeight, overflowY: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
    />
  );
}

export function Actions({ busy, onSave, onClose }: { busy: boolean; onSave: () => void; onClose: () => void }) {
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

/* --------------------------------------------------------------- Beitrag */

function ContributionDialog({
  projects, fixedProjectId, defaultItemId, membersByProject, onClose,
}: {
  projects: OpsProjectRef[];
  fixedProjectId?: string;
  defaultItemId?: string;
  membersByProject: Record<string, { id: string; name: string }[]>;
  onClose: (changed?: boolean) => void;
}) {
  const [mode, setMode] = useState<"item" | "time">("item");
  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const { categories, priorities } = useBoardMeta(projectId);
  const items = useItems(projectId);
  const members = membersByProject[projectId] ?? [];

  /* Beitrag */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>(QUICK_CATEGORY_ID);
  const [priorityId, setPriorityId] = useState<string>("normal");
  const [date, setDate] = useState(() => isoDate(new Date()));

  /* Zeiterfassung */
  const [itemId, setItemId] = useState(defaultItemId ?? "");
  const [userId, setUserId] = useState("");
  const [start, setStart] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(() => isoToLocalInput(new Date().toISOString()));
  const [pause, setPause] = useState(0);
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!categories.some((c) => c.id === categoryId)) setCategoryId(QUICK_CATEGORY_ID);
  }, [categories, categoryId]);
  useEffect(() => {
    if (priorities.length && !priorities.some((p) => p.id === priorityId)) setPriorityId(priorities[0].id);
  }, [priorities, priorityId]);
  useEffect(() => { if (!items.some((i) => i.id === itemId)) setItemId(""); }, [items, itemId]);

  const saveItem = () => {
    setError(null);
    if (!projectId) { setError("Bitte ein Projekt wählen."); return; }
    if (!title.trim()) { setError("Bitte einen Namen angeben."); return; }
    // Bestehende Board-Datenbasis – keine zweite Speicherung.
    addQuickItem(projectId, "task", { title: title.trim(), description, date, categoryId, priorityId });
    setTitle("");
    setDescription("");
    setDone("Beitrag gespeichert.");
  };

  const saveTime = async () => {
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
      await addTimeEntryFor(projectId, { itemId, userId, startedAt: s, endedAt: e, breakMinutes: pause, note });
      setDone("Arbeitszeit gespeichert.");
      setNote(""); setPause(0);
    } catch (err) {
      setError((err as Error)?.message ?? "Speichern nicht möglich.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Beitrag" onClose={() => onClose(Boolean(done))}>
      <div className="flex flex-col gap-2">
        {/* Art des Eintrags – Beitrag oder Zeiterfassung */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: "hsl(var(--surface-muted))" }}>
          {([["item", "Beitrag"], ["time", "Zeiterfassung"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setMode(id); setError(null); setDone(null); }}
              className="flex-1 h-8 rounded-md text-xs font-medium"
              style={{
                background: mode === id ? "hsl(var(--card))" : "transparent",
                color: mode === id ? "hsl(var(--ink))" : SOFT,
                border: mode === id ? `1px solid ${LINE}` : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <ProjectField projects={projects} fixedProjectId={fixedProjectId} value={projectId} onChange={setProjectId} />

        {mode === "item" ? (
          <>
            <Field label="Name">
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Beitragsname" />
            </Field>
            <Field label="Beschreibung">
              <AutoTextarea value={description} onChange={setDescription} placeholder="optional" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Kategorie">
                <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {!categories.length && <option value={QUICK_CATEGORY_ID}>Schnellablage</option>}
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Priorität">
                <select className={inputCls} value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
                  {!priorities.length && <option value="normal">Normal</option>}
                  {priorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Datum">
              <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Actions busy={false} onSave={saveItem} onClose={() => onClose(Boolean(done))} />
          </>
        ) : (
          <>
            <Field label="Person">
              <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Ich</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
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
            <Actions busy={busy} onSave={() => void saveTime()} onClose={() => onClose(Boolean(done))} />
          </>
        )}

        {error && <div className="text-[11px]" style={{ color: "#ef4444" }}>{error}</div>}
        {done && !error && <div className="text-[11px]" style={{ color: SOFT }}>{done}</div>}
      </div>
    </Modal>
  );
}

export default OpsActionBar;
