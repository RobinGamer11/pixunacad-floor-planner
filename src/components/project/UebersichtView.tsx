import React, { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Check, X, Trash2, Settings2, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import { projectStore, type Project, type Task } from "@/lib/projectStore";
import { notesStore, useNotes } from "@/lib/notesStore";
import { AufgabenView } from "@/pages/ProjectsHome";

interface Props {
  project: Project;
  activeMappeId?: string;
  onSelectMappe?: (id: string) => void;
}

/**
 * Neue Übersicht:
 *   Links: Projektmappen-Feld (fixe Höhe, Scroll) → Projektinfos → Zeitstrahl/Aufgaben/Kalender.
 *   Rechts: Titelbild + Erläuterung Gesamtprojekt + Erläuterung ausgewählte Mappe.
 * Reihenfolge Zeitstrahl vs. Aufgaben/Kalender per Setting (default: Zeitstrahl unten).
 */
export function UebersichtView({ project }: Props) {
  return (
    <div className="mt-3 space-y-2">
      {/* 1. Projekttitelbild */}
      <HeroPanel project={project} />
      {/* 2. Projektinfos (oben) */}
      <ProjektinfoPanel project={project} />
      {/* 3. Konzept (nur Text) */}
      <KonzeptPanel project={project} />
    </div>
  );
}

/* ============================================================ Hero (nur Bild, ohne Label) */
function HeroPanel({ project }: { project: Project }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => projectStore.updateProject(project.id, { thumbnail: String(r.result) });
    r.readAsDataURL(f);
  };
  return (
    <section
      className="rounded-2xl p-3"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="rounded-xl overflow-hidden aspect-[16/9] relative group" style={{ background: "hsl(var(--surface-muted))" }}>
        <img src={project.thumbnail} alt="" className="w-full h-full object-cover" />
        <button
          onClick={() => inputRef.current?.click()}
          title="Titelbild ändern"
          className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center shadow"
          style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
        >
          <Pencil size={14} />
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleThumb} />
      </div>
    </section>
  );
}

/* ============================================================ Konzept (einklappbar, umbenennbar) */
function KonzeptPanel({ project }: { project: Project }) {
  const collapsed = !!project.konzeptCollapsed;
  const title = project.konzeptTitle ?? "Konzept";
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.konzept ?? "");

  const saveTitle = () => {
    const v = titleDraft.trim() || "Konzept";
    projectStore.updateProject(project.id, { konzeptTitle: v });
    setRenaming(false);
  };

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => projectStore.updateProject(project.id, { konzeptCollapsed: !collapsed })}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
          title={collapsed ? "Aufklappen" : "Einklappen"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {renaming ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") { setTitleDraft(title); setRenaming(false); }
            }}
            className="flex-1 text-xs font-semibold tracking-[0.18em] uppercase bg-transparent border-b outline-none"
            style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--accent-gold))" }}
          />
        ) : (
          <div
            className="flex-1 text-xs font-semibold tracking-[0.18em] uppercase cursor-text"
            style={{ color: "hsl(var(--accent-gold))" }}
            onDoubleClick={() => { setTitleDraft(title); setRenaming(true); }}
            title="Doppelklick zum Umbenennen"
          >
            {title}
          </div>
        )}
        <button
          onClick={() => { setTitleDraft(title); setRenaming(true); }}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
          title="Titel umbenennen"
        >
          <Pencil size={12} />
        </button>
        {!collapsed && !editing && (
          <button
            onClick={() => { setDraft(project.konzept ?? ""); setEditing(true); }}
            className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Text bearbeiten"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {!collapsed && (
        editing ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="w-full text-sm rounded-md border p-2 bg-transparent outline-none"
              style={{ borderColor: "hsl(var(--hairline))" }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="h-8 px-3 rounded-md border text-xs flex items-center gap-1"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                <X size={12} /> Abbrechen
              </button>
              <button
                onClick={() => { projectStore.updateProject(project.id, { konzept: draft }); setEditing(false); }}
                className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1"
                style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
              >
                <Check size={12} /> Speichern
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap min-h-[3em]">
            {project.konzept || `${title}, Leitgedanke oder kurze Beschreibung des Projekts…`}
          </p>
        )
      )}
    </section>
  );
}

/* ============================================================ Mappen-Panel */

function MappenPanel({ project, activeId, onSelect }: { project: Project; activeId?: string; onSelect: (id: string) => void }) {
  const navigate = useNavigate();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const mappen = project.mappen ?? [];

  const openEdit = (id?: string) => {
    if (!id) return;
    projectStore.setActiveMappe(project.id, id);
    navigate(`/project/${project.id}`);
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const toIdx = mappen.findIndex((m) => m.id === targetId);
    if (toIdx >= 0) projectStore.moveMappeToIndex(project.id, dragId, toIdx);
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <section
      className="rounded-2xl p-5 flex flex-col"
      style={{
        background: "hsl(var(--surface-card))",
        border: "1px solid hsl(var(--hairline))",
        height: 360,
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold tracking-[0.18em]" style={{ color: "hsl(var(--accent-gold))" }}>PROJEKTMAPPEN</span>
        <button
          onClick={() => projectStore.addMappe(project.id, "Neue Mappe")}
          title="Neue Projektmappe"
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Plus size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => openEdit(activeId ?? mappen[0]?.id)}
          disabled={mappen.length === 0}
          title="Ausgewählte Projektmappe bearbeiten"
          className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-[11px] font-medium border transition disabled:opacity-40"
          style={{
            color: "hsl(var(--surface))",
            background: "hsl(var(--ink))",
            borderColor: "hsl(var(--ink))",
          }}
        >
          <Pencil size={12} />
          Bearbeiten
        </button>
      </div>

      {mappen.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          Noch keine Mappen — mit + oben anlegen.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1 mappen-scroll">
          <div className="space-y-1.5">
            {mappen.map((m) => {
              const active = m.id === activeId;
              const isRenaming = renamingId === m.id;
              const isDragOver = dragOverId === m.id && dragId !== m.id;
              return (
                <div
                  key={m.id}
                  draggable={!isRenaming}
                  onDragStart={(e) => { setDragId(m.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverId !== m.id) setDragOverId(m.id); }}
                  onDragLeave={() => { if (dragOverId === m.id) setDragOverId(null); }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(m.id); }}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  className="group flex items-center gap-1.5 p-2.5 rounded-md border transition cursor-pointer"
                  style={{
                    background: active ? "hsl(var(--surface-muted))" : "transparent",
                    borderColor: isDragOver
                      ? "hsl(var(--accent-gold))"
                      : active
                        ? "hsl(var(--accent-gold) / 0.4)"
                        : "transparent",
                    opacity: dragId === m.id ? 0.4 : 1,
                  }}
                  onClick={() => !isRenaming && onSelect(m.id)}
                  onDoubleClick={() => !isRenaming && openEdit(m.id)}
                >
                  <span
                    title="Zum Verschieben ziehen"
                    className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical size={14} />
                  </span>
                  <div
                    className="w-10 h-10 rounded shrink-0 flex items-center justify-center text-xs font-semibold"
                    style={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--hairline))", color: "hsl(var(--accent-gold))" }}
                  >
                    {m.pageIds.length}
                  </div>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => { projectStore.renameMappe(project.id, m.id, nameDraft.trim() || m.name); setRenamingId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { projectStore.renameMappe(project.id, m.id, nameDraft.trim() || m.name); setRenamingId(null); }
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 text-sm bg-transparent border-b outline-none"
                      style={{ borderColor: "hsl(var(--hairline))" }}
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium truncate">{m.name}</span>
                  )}
                  {!isRenaming && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingId(m.id); setNameDraft(m.name); }}
                        title="Umbenennen"
                        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Pencil size={12} />
                      </button>
                      {mappen.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Mappe "${m.name}" löschen? Enthaltene Seiten wandern in die erste Mappe.`)) {
                              projectStore.deleteMappe(project.id, m.id);
                            }
                          }}
                          title="Löschen"
                          className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================ Projektinfo */

function ProjektinfoPanel({ project }: { project: Project }) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground mb-2">
        PROJEKTINFO
      </div>
      <div className="space-y-1.5">
        <InfoRow label="Bauherr" value={project.bauherr || "—"} />
        <InfoRow label="Projektadresse" value={project.ort || "—"} />
        <InfoRow label="Projekttyp" value={project.projektTyp || "—"} />
        <InfoRow label="Status" value={project.status || "—"} />
        <InfoRow label="Erstellt am" value={project.erstelltAm || "—"} />
        <InfoRow
          label="Zuletzt geändert"
          value={new Date(project.updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
        />
        {project.customFields?.map((f) => <InfoRow key={f.id} label={f.label} value={f.value || "—"} />)}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0 pb-1.5 border-b" style={{ borderColor: "hsl(var(--hairline) / 0.5)" }}>
      <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground leading-tight">{label}</span>
      <span className="text-[13px] break-words leading-snug" style={{ color: "hsl(var(--ink))" }}>{value}</span>
    </div>
  );
}

/* ============================================================ Zeitstrahl */

function TaskTimeline({ project }: { project: Project }) {
  const tasks = [...project.tasks].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const firstOpenIdx = tasks.findIndex((t) => !t.done);

  const togglePos = () => {
    const next = (project.settings?.timelinePosition ?? "bottom") === "bottom" ? "top" : "bottom";
    projectStore.updateProjectSettings(project.id, { timelinePosition: next });
  };

  return (
    <section
      className="rounded-2xl p-6"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="text-xs font-semibold tracking-[0.18em]" style={{ color: "hsl(var(--accent-gold))" }}>
          ZEITSTRAHL
        </div>
        <button
          onClick={togglePos}
          title="Zeitstrahl-Position umschalten (auch im Reiter Aufgaben verfügbar)"
          className="text-muted-foreground hover:text-foreground text-[11px] flex items-center gap-1"
        >
          <Settings2 size={12} /> {project.settings?.timelinePosition === "top" ? "Oben" : "Unten"}
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">Noch keine Aufgaben angelegt.</div>
      ) : (
        <div className="relative">
          <div className="absolute left-0 right-0 top-2 h-px" style={{ background: "hsl(var(--hairline))" }} />
          <div className="flex justify-between gap-3 relative overflow-x-auto">
            {tasks.map((t, i) => {
              let dotColor = "hsl(var(--surface-muted))";
              let dotBorder = "hsl(var(--hairline))";
              if (t.done) { dotColor = "hsl(var(--accent-gold) / 0.35)"; dotBorder = "hsl(var(--accent-gold) / 0.5)"; }
              else if (i === firstOpenIdx) { dotColor = "hsl(var(--accent-gold))"; dotBorder = "hsl(var(--accent-gold))"; }
              return (
                <div key={t.id} className="flex-1 flex flex-col items-center text-center min-w-[90px]">
                  <span className="w-4 h-4 rounded-full border-2 relative z-10" style={{ background: dotColor, borderColor: dotBorder }} />
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    {t.date ? new Date(t.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
                  </div>
                  <div
                    className="mt-1 text-xs leading-tight px-1 truncate w-full"
                    style={{
                      color: t.done ? "hsl(var(--ink-soft))" : i === firstOpenIdx ? "hsl(var(--ink))" : "hsl(var(--ink-soft))",
                      fontWeight: i === firstOpenIdx ? 600 : 400,
                    }}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================ Aufgaben-Mini */

function AufgabenMini({ project }: { project: Project }) {
  const notes = useNotes(project.id);
  const mappen = project.mappen ?? [];
  const mappeName = (id?: string) => (id ? (mappen.find((m) => m.id === id)?.name ?? "") : "");
  type Row = { key: string; source: "legacy" | "note"; id: string; title: string; done: boolean; date?: string; mappeId?: string };
  const rows: Row[] = useMemo(() => {
    const legacy: Row[] = project.tasks.map((t) => ({
      key: `legacy:${t.id}`, source: "legacy", id: t.id, title: t.title, done: t.done, date: t.date,
    }));
    const noteTasks: Row[] = notes.nodes
      .filter((n) => n.kind === "task")
      .map((n) => ({
        key: `note:${n.id}`, source: "note", id: n.id, title: n.title,
        done: n.status === "done", date: n.date || n.dueDate, mappeId: n.mappeId,
      }));
    return [...legacy, ...noteTasks]
      .sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
  }, [project.tasks, notes.nodes]);
  const open = rows.filter((r) => !r.done).slice(0, 8);
  const toggle = (r: Row) => {
    if (r.source === "legacy") projectStore.toggleTask(project.id, r.id);
    else notesStore.updateNode(project.id, r.id, { status: r.done ? "open" : "done" });
  };
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">AUFGABEN</div>
        <div className="text-[10px] text-muted-foreground">Bearbeiten im Reiter „Aufgaben"</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Keine Aufgaben.</div>
      ) : open.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Alles erledigt 🎉</div>
      ) : (
        <div className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
          {open.map((t) => {
            const mn = mappeName(t.mappeId);
            return (
              <label key={t.key} className="flex items-center gap-2 py-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggle(t)}
                  className="accent-foreground"
                />
                <span className={`flex-1 truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                {mn && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "hsl(var(--surface-muted))", color: "hsl(var(--ink-soft))" }}>
                    {mn}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {t.date ? new Date(t.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ============================================================ Kalender-Mini */

function KalenderMini({ project }: { project: Project }) {
  const today = new Date();
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const first = new Date(view.year, view.month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const byDay = useMemo(() => {
    const map = new Map<number, Task[]>();
    project.tasks.forEach((t) => {
      if (!t.date) return;
      const d = new Date(t.date);
      if (d.getFullYear() === view.year && d.getMonth() === view.month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(t);
      }
    });
    return map;
  }, [project.tasks, view]);
  const cells: (number | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const nav = (dir: number) => {
    const m = view.month + dir;
    const y = view.year + Math.floor(m / 12);
    setView({ year: y, month: ((m % 12) + 12) % 12 });
  };
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center justify-between text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
        <span>KALENDER</span>
        <div className="flex items-center gap-1 tracking-normal">
          <button onClick={() => nav(-1)} className="px-1 hover:text-foreground">‹</button>
          <span className="font-medium normal-case tracking-normal text-foreground" style={{ letterSpacing: 0 }}>
            {first.toLocaleString("de-DE", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => nav(1)} className="px-1 hover:text-foreground">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-muted-foreground text-center">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 mt-1 text-xs">
        {cells.map((c, i) => {
          if (c === null) return <div key={i} className="h-9" />;
          const dayTasks = byDay.get(c) ?? [];
          const isToday = today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === c;
          const hasOpen = dayTasks.some((t) => !t.done);
          const hasHigh = dayTasks.some((t) => !t.done && t.priority === "high");
          return (
            <div
              key={i}
              className="h-9 flex flex-col items-center justify-center rounded-md relative"
              style={{
                background: isToday ? "hsl(var(--ink))" : "transparent",
                color: isToday ? "hsl(var(--surface))" : undefined,
                fontWeight: isToday ? 600 : undefined,
              }}
            >
              <span>{c}</span>
              {dayTasks.length > 0 && (
                <span className="absolute bottom-1">
                  <span
                    className="w-1 h-1 rounded-full block"
                    style={{
                      background: hasHigh ? "hsl(0 70% 55%)" : hasOpen ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))",
                    }}
                  />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================ Hero + Erläuterungen (kombiniert) */

function HeroErlaeuterungPanel({
  project,
  mappe,
}: {
  project: Project;
  mappe: { id: string; name: string; konzept?: string } | undefined;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handleThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => projectStore.updateProject(project.id, { thumbnail: String(r.result) });
    r.readAsDataURL(f);
  };
  return (
    <section
      className="rounded-2xl p-5 space-y-5"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div>
        <div className="flex items-center text-xs text-muted-foreground mb-3">
          <span>Projekttitelbild</span>
        </div>
        <div className="rounded-xl overflow-hidden aspect-[16/9] relative group" style={{ background: "hsl(var(--surface-muted))" }}>
          <img src={project.thumbnail} alt="" className="w-full h-full object-cover" />
          <button
            onClick={() => inputRef.current?.click()}
            title="Titelbild ändern"
            className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center shadow"
            style={{ background: "hsl(var(--surface))", color: "hsl(var(--ink))" }}
          >
            <Pencil size={14} />
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleThumb} />
        </div>
      </div>

      <div className="h-px" style={{ background: "hsl(var(--hairline))" }} />

      <InlineEditableText
        title="KONZEPT — GESAMTPROJEKT"
        value={project.konzept ?? ""}
        placeholder="Konzept, Leitgedanke oder kurze Beschreibung des gesamten Projekts…"
        onSave={(v) => projectStore.updateProject(project.id, { konzept: v })}
      />

      {mappe && (
        <>
          <div className="h-px" style={{ background: "hsl(var(--hairline))" }} />
          <InlineEditableText
            title={`KONZEPT — ${mappe.name.toUpperCase()}`}
            value={mappe.konzept ?? ""}
            placeholder="Beschreibung dieser Projektmappe (ändert sich je nach ausgewählter Mappe)…"
            onSave={(v) => projectStore.updateMappeKonzept(project.id, mappe.id, v)}
          />
        </>
      )}
    </section>
  );
}

function InlineEditableText({ title, value, placeholder, onSave }: { title: string; value: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold tracking-[0.18em]" style={{ color: "hsl(var(--accent-gold))" }}>
          {title}
        </div>
        {!editing && (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="text-muted-foreground hover:text-foreground"
            title="Bearbeiten"
          >
            <Pencil size={13} />
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full text-sm rounded-md border p-2 bg-transparent outline-none"
            style={{ borderColor: "hsl(var(--hairline))" }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="h-8 px-3 rounded-md border text-xs flex items-center gap-1"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <X size={12} /> Abbrechen
            </button>
            <button
              onClick={() => { onSave(draft); setEditing(false); }}
              className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
            >
              <Check size={12} /> Speichern
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap min-h-[3em]">
          {value || placeholder}
        </p>
      )}
    </div>
  );
}


