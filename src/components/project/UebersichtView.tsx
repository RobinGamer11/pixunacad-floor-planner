import React, { useState, useMemo, useRef } from "react";
import { Plus, Pencil, Check, X, Trash2, Settings2, ArrowUp, ArrowDown } from "lucide-react";
import { projectStore, type Project, type Task } from "@/lib/projectStore";

interface Props {
  project: Project;
  activeMappeId: string | undefined;
  onSelectMappe: (id: string) => void;
}

/**
 * Neue Übersicht:
 *   Links: Projektmappen-Feld (fixe Höhe, Scroll) → Projektinfos → Zeitstrahl/Aufgaben/Kalender.
 *   Rechts: Titelbild + Erläuterung Gesamtprojekt + Erläuterung ausgewählte Mappe.
 * Reihenfolge Zeitstrahl vs. Aufgaben/Kalender per Setting (default: Zeitstrahl unten).
 */
export function UebersichtView({ project, activeMappeId, onSelectMappe }: Props) {
  const timelinePos = project.settings?.timelinePosition ?? "bottom";
  const mappen = project.mappen ?? [];
  const activeMappe = mappen.find((m) => m.id === activeMappeId) ?? mappen[0];

  return (
    <div className="mt-6 space-y-5">
      {timelinePos === "top" && <TaskTimeline project={project} />}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 items-start">
        {/* Linke Spalte (schmal) */}
        <div className="space-y-5 min-w-0">
          <MappenPanel project={project} activeId={activeMappe?.id} onSelect={onSelectMappe} />
          <ProjektinfoPanel project={project} />
          <AufgabenMini project={project} />
        </div>

        {/* Rechte Spalte (dominant): Titelbild + Erläuterungen zusammen */}
        <div className="min-w-0">
          <HeroErlaeuterungPanel project={project} mappe={activeMappe} />
        </div>
      </div>

      <KalenderMini project={project} />
      {timelinePos === "bottom" && <TaskTimeline project={project} />}
    </div>
  );
}

/* ============================================================ Mappen-Panel */

function MappenPanel({ project, activeId, onSelect }: { project: Project; activeId?: string; onSelect: (id: string) => void }) {
  const [editMode, setEditMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const mappen = project.mappen ?? [];

  return (
    <section
      className="rounded-2xl p-4 flex flex-col"
      style={{
        background: "hsl(var(--surface-card))",
        border: "1px solid hsl(var(--hairline))",
        height: 260,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">PROJEKTMAPPEN</span>
        <button
          onClick={() => projectStore.addMappe(project.id, "Neue Mappe")}
          title="Neue Projektmappe"
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Plus size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setEditMode((v) => !v)}
          title={editMode ? "Bearbeiten beenden" : "Mappen bearbeiten"}
          className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-[11px] font-medium border transition"
          style={{
            color: editMode ? "hsl(var(--surface))" : "hsl(var(--ink))",
            background: editMode ? "hsl(var(--accent-gold))" : "transparent",
            borderColor: editMode ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
          }}
        >
          <Pencil size={12} />
          {editMode ? "Fertig" : "Bearbeiten"}
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
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 p-2 rounded-md border transition cursor-pointer"
                  style={{
                    background: active ? "hsl(var(--surface-muted))" : "transparent",
                    borderColor: active ? "hsl(var(--accent-gold) / 0.4)" : "transparent",
                  }}
                  onClick={() => !isRenaming && onSelect(m.id)}
                >
                  <div
                    className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-[10px] font-semibold"
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
                    <span className="flex-1 text-sm truncate">{m.name}</span>
                  )}
                  {editMode && !isRenaming && (
                    <div className="flex items-center gap-0.5">
                      <button
                        disabled={mappen.indexOf(m) === 0}
                        onClick={(e) => { e.stopPropagation(); projectStore.reorderMappe(project.id, m.id, -1); }}
                        title="Nach oben"
                        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        disabled={mappen.indexOf(m) === mappen.length - 1}
                        onClick={(e) => { e.stopPropagation(); projectStore.reorderMappe(project.id, m.id, 1); }}
                        title="Nach unten"
                        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowDown size={12} />
                      </button>
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
      className="rounded-2xl p-5"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground mb-3">
        PROJEKTINFO
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
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
    <div className="flex items-baseline justify-between gap-2 text-sm py-1 border-b" style={{ borderColor: "hsl(var(--hairline) / 0.5)" }}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right truncate">{value}</span>
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
  const open = project.tasks.filter((t) => !t.done).slice(0, 8);
  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--hairline))" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">AUFGABEN</div>
        <div className="text-[10px] text-muted-foreground">Bearbeiten im Reiter „Aufgaben"</div>
      </div>
      {project.tasks.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Keine Aufgaben.</div>
      ) : open.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Alles erledigt 🎉</div>
      ) : (
        <div className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
          {open.map((t) => (
            <label key={t.id} className="flex items-center gap-2 py-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => projectStore.toggleTask(project.id, t.id)}
                className="accent-foreground"
              />
              <span className={`flex-1 truncate ${t.done ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {t.date ? new Date(t.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : ""}
              </span>
            </label>
          ))}
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
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span>Projekttitelbild</span>
          <span>Geändert: {new Date(project.updatedAt).toLocaleDateString("de-DE")}</span>
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
        title="ERLÄUTERUNG — GESAMTPROJEKT"
        value={project.konzept ?? ""}
        placeholder="Konzept, Leitgedanke oder kurze Beschreibung des gesamten Projekts…"
        onSave={(v) => projectStore.updateProject(project.id, { konzept: v })}
      />

      {mappe && (
        <>
          <div className="h-px" style={{ background: "hsl(var(--hairline))" }} />
          <InlineEditableText
            title={`ERLÄUTERUNG — ${mappe.name.toUpperCase()}`}
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


