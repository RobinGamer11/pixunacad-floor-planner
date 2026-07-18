import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { useProject } from "@/lib/projectStore";
import { notesStore, useNotes, type NoteKind, type NoteNode, type NoteStatus, type NotePriority } from "@/lib/notesStore";
import {
  Plus, Search, Trash2, ChevronRight, FileText, CheckSquare, FolderTree,
  Circle, Clock3, CheckCircle2, AlertTriangle, Paperclip, Image as ImageIcon, X,
} from "lucide-react";

const STATUS_LABEL: Record<NoteStatus, string> = { open: "Offen", wip: "In Bearbeitung", done: "Erledigt" };
const STATUS_COLOR: Record<NoteStatus, string> = { open: "#ef4444", wip: "#f59e0b", done: "#10b981" };
const PRIORITY_LABEL: Record<NotePriority, string> = { low: "Niedrig", normal: "Normal", high: "Hoch", urgent: "Dringend" };

function iconForKind(kind: NoteKind, size = 14) {
  switch (kind) {
    case "topic": return <FolderTree size={size} />;
    case "task": return <CheckSquare size={size} />;
    case "file": return <Paperclip size={size} />;
    case "photo": return <ImageIcon size={size} />;
    default: return <FileText size={size} />;
  }
}

export default function NotesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const state = useNotes(projectId);
  const [focusId, setFocusId] = useState<string | null>(null); // aktueller Graph-Fokus (parent)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<NoteStatus | "">("");

  const nodesByParent = useMemo(() => {
    const map = new Map<string | null, NoteNode[]>();
    state.nodes.forEach((n) => {
      const arr = map.get(n.parentId) ?? [];
      arr.push(n);
      map.set(n.parentId, arr);
    });
    return map;
  }, [state.nodes]);

  const children = nodesByParent.get(focusId) ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return children.filter((n) => {
      if (q && !(`${n.title} ${n.description ?? ""}`.toLowerCase().includes(q))) return false;
      if (filterCat && n.category !== filterCat) return false;
      if (filterStatus && n.status !== filterStatus) return false;
      return true;
    });
  }, [children, search, filterCat, filterStatus]);

  const selected = state.nodes.find((n) => n.id === selectedId) ?? null;

  // Breadcrumbs für Fokus
  const focusPath = useMemo(() => {
    const path: NoteNode[] = [];
    let cur = focusId;
    while (cur) {
      const n = state.nodes.find((x) => x.id === cur);
      if (!n) break;
      path.unshift(n);
      cur = n.parentId;
    }
    return path;
  }, [focusId, state.nodes]);

  if (!projectId) return null;

  const addChild = (kind: NoteKind) => {
    const n = notesStore.addNode(projectId, focusId, kind);
    setSelectedId(n.id);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <WorkspaceHeader
        projectId={projectId}
        projectName={project?.name}
        contextLabel="Notiznetz"
        mode="notes"
      />
      <main className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: "320px 1fr 420px", background: "hsl(var(--surface-muted))" }}>
        {/* Linke Spalte: Liste + Filter */}
        <aside className="flex flex-col min-h-0 border-r" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
          <div className="p-3 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
            <div className="flex items-center gap-1 mb-2 text-[11px]" style={{ color: "hsl(var(--ink-soft))" }}>
              <button onClick={() => { setFocusId(null); setSelectedId(null); }} className="hover:underline">Projekt</button>
              {focusPath.map((n) => (
                <React.Fragment key={n.id}>
                  <ChevronRight size={11} />
                  <button onClick={() => setFocusId(n.id)} className="hover:underline truncate max-w-[90px]" title={n.title}>{n.title}</button>
                </React.Fragment>
              ))}
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--ink-soft))" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen…"
                className="w-full h-8 pl-7 pr-2 rounded-md border text-xs bg-background"
                style={{ borderColor: "hsl(var(--hairline))" }}
              />
            </div>
            <div className="flex gap-1 mt-2">
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                className="flex-1 h-7 rounded-md border text-[11px] px-1 bg-background" style={{ borderColor: "hsl(var(--hairline))" }}>
                <option value="">Alle Kategorien</option>
                {state.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as NoteStatus | "")}
                className="flex-1 h-7 rounded-md border text-[11px] px-1 bg-background" style={{ borderColor: "hsl(var(--hairline))" }}>
                <option value="">Alle Status</option>
                <option value="open">Offen</option>
                <option value="wip">In Bearbeitung</option>
                <option value="done">Erledigt</option>
              </select>
            </div>
            <div className="flex gap-1 mt-2">
              <button onClick={() => addChild("topic")} className="flex-1 h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1"
                style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}>
                <Plus size={12} /> Thema
              </button>
              <button onClick={() => addChild("note")} className="flex-1 h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1 border"
                style={{ borderColor: "hsl(var(--hairline))" }}>
                <Plus size={12} /> Notiz
              </button>
              <button onClick={() => addChild("task")} className="flex-1 h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1 border"
                style={{ borderColor: "hsl(var(--hairline))" }}>
                <Plus size={12} /> Aufgabe
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 && (
              <div className="p-4 text-xs" style={{ color: "hsl(var(--ink-soft))" }}>
                Keine Einträge auf dieser Ebene. Lege ein Thema oder eine Notiz an.
              </div>
            )}
            <ul>
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    onDoubleClick={() => { if (n.kind === "topic") setFocusId(n.id); }}
                    className="w-full text-left px-3 py-2 border-b flex items-start gap-2 hover:bg-muted/50"
                    style={{
                      borderColor: "hsl(var(--hairline))",
                      background: selectedId === n.id ? "hsl(var(--surface-muted))" : "transparent",
                    }}
                  >
                    <span style={{ color: "hsl(var(--accent-gold))" }} className="mt-0.5">{iconForKind(n.kind)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{n.title}</span>
                        {n.status && (
                          <span title={STATUS_LABEL[n.status]} className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: STATUS_COLOR[n.status] }} />
                        )}
                        {n.priority === "urgent" && <AlertTriangle size={11} className="text-red-500 shrink-0" />}
                      </span>
                      {n.description && (
                        <span className="text-[11px] block truncate" style={{ color: "hsl(var(--ink-soft))" }}>
                          {n.description}
                        </span>
                      )}
                      {n.category && (
                        <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "hsl(var(--surface-muted))", color: "hsl(var(--ink-soft))" }}>
                          {n.category}
                        </span>
                      )}
                    </span>
                    {n.kind === "topic" && <ChevronRight size={13} className="mt-1 shrink-0" style={{ color: "hsl(var(--ink-soft))" }} />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Mitte: Editor */}
        <section className="min-h-0 overflow-auto">
          {selected ? (
            <NoteEditor
              projectId={projectId}
              node={selected}
              categories={state.categories}
              onAddCategory={(name) => notesStore.addCategory(projectId, name)}
              onDelete={() => { notesStore.deleteNode(projectId, selected.id); setSelectedId(null); }}
              nodes={state.nodes}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: "hsl(var(--ink-soft))" }}>
              Wähle einen Eintrag oder lege einen neuen an.
            </div>
          )}
        </section>

        {/* Rechts: Netz */}
        <aside className="min-h-0 border-l flex flex-col" style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
          <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: "hsl(var(--hairline))" }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>Projektnetz</div>
            <button onClick={() => { setFocusId(null); setSelectedId(null); }} className="text-[11px] hover:underline" style={{ color: "hsl(var(--accent-gold))" }}>
              Ganzes Projekt
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <NoteGraph
              rootLabel={project?.name ?? "Projekt"}
              focusId={focusId}
              nodes={state.nodes}
              selectedId={selectedId}
              onFocus={(id) => setFocusId(id)}
              onSelect={(id) => setSelectedId(id)}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}

// -------------------------------------------------------------
// Editor-Panel
// -------------------------------------------------------------
function NoteEditor({
  projectId, node, categories, onAddCategory, onDelete, nodes,
}: {
  projectId: string;
  node: NoteNode;
  categories: string[];
  onAddCategory: (name: string) => void;
  onDelete: () => void;
  nodes: NoteNode[];
}) {
  const [newCat, setNewCat] = useState("");
  const [newComment, setNewComment] = useState("");

  const patch = (p: Partial<NoteNode>) => notesStore.updateNode(projectId, node.id, p);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: "hsl(var(--accent-gold))" }}>{iconForKind(node.kind, 18)}</span>
        <select
          value={node.kind}
          onChange={(e) => patch({ kind: e.target.value as NoteKind })}
          className="h-7 rounded-md border text-[11px] px-1 bg-background"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <option value="topic">Thema</option>
          <option value="note">Notiz</option>
          <option value="task">Aufgabe</option>
          <option value="file">Datei</option>
          <option value="photo">Foto</option>
        </select>
        <div className="flex-1" />
        <button onClick={onDelete} className="h-8 px-2 rounded-md text-xs flex items-center gap-1 hover:bg-muted" title="Löschen">
          <Trash2 size={14} /> Löschen
        </button>
      </div>

      <input
        value={node.title}
        onChange={(e) => patch({ title: e.target.value })}
        placeholder="Titel *"
        className="w-full text-xl font-semibold bg-transparent border-b py-1 focus:outline-none mb-3"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
      <textarea
        value={node.description ?? ""}
        onChange={(e) => patch({ description: e.target.value })}
        placeholder="Beschreibung *"
        rows={4}
        className="w-full text-sm rounded-md border p-2 bg-background mb-4"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Datum">
          <input type="date" value={node.date ?? ""} onChange={(e) => patch({ date: e.target.value })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Uhrzeit">
          <input type="time" value={node.time ?? ""} onChange={(e) => patch({ time: e.target.value })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Fällig am">
          <input type="date" value={node.dueDate ?? ""} onChange={(e) => patch({ dueDate: e.target.value })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Verantwortlich">
          <input value={node.responsible ?? ""} onChange={(e) => patch({ responsible: e.target.value })} placeholder="Name"
            className="w-full h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Status">
          <div className="flex gap-1">
            {(["open", "wip", "done"] as const).map((s) => (
              <button key={s}
                onClick={() => patch({ status: s })}
                className="flex-1 h-8 rounded-md text-[11px] font-medium flex items-center justify-center gap-1 border"
                style={{
                  borderColor: node.status === s ? STATUS_COLOR[s] : "hsl(var(--hairline))",
                  background: node.status === s ? STATUS_COLOR[s] + "22" : "transparent",
                  color: node.status === s ? STATUS_COLOR[s] : "hsl(var(--ink))",
                }}>
                {s === "open" ? <Circle size={11} /> : s === "wip" ? <Clock3 size={11} /> : <CheckCircle2 size={11} />}
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Dringlichkeit">
          <select value={node.priority ?? "normal"} onChange={(e) => patch({ priority: e.target.value as NotePriority })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }}>
            {(Object.keys(PRIORITY_LABEL) as NotePriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </Field>
        <Field label="Kategorie">
          <div className="flex gap-1">
            <select value={node.category ?? ""} onChange={(e) => patch({ category: e.target.value || undefined })}
              className="flex-1 h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }}>
              <option value="">—</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="+ Neu"
              className="w-20 h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }} />
            <button onClick={() => { if (newCat.trim()) { onAddCategory(newCat.trim()); patch({ category: newCat.trim() }); setNewCat(""); } }}
              className="h-8 px-2 rounded-md border text-xs" style={{ borderColor: "hsl(var(--hairline))" }}>OK</button>
          </div>
        </Field>
        <Field label="Beteiligte (Komma-getrennt)">
          <input value={(node.participants ?? []).join(", ")}
            onChange={(e) => patch({ participants: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
      </div>

      <Field label="Verknüpfungen">
        <div className="flex flex-wrap gap-1 mb-1">
          {(node.linkedIds ?? []).map((id) => {
            const t = nodes.find((n) => n.id === id);
            if (!t) return null;
            return (
              <span key={id} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                style={{ background: "hsl(var(--surface-muted))" }}>
                {iconForKind(t.kind, 10)} {t.title}
                <button onClick={() => patch({ linkedIds: (node.linkedIds ?? []).filter((x) => x !== id) })}>
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
        <select value="" onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          const cur = node.linkedIds ?? [];
          if (!cur.includes(id)) patch({ linkedIds: [...cur, id] });
        }} className="w-full h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }}>
          <option value="">+ Eintrag verknüpfen…</option>
          {nodes.filter((n) => n.id !== node.id).map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
        </select>
      </Field>

      <div className="mt-6">
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(var(--ink-soft))" }}>Kommentare</div>
        <div className="space-y-2 mb-2">
          {(node.comments ?? []).map((c) => (
            <div key={c.id} className="text-xs p-2 rounded" style={{ background: "hsl(var(--surface-muted))" }}>
              <div className="whitespace-pre-wrap">{c.text}</div>
              <div className="text-[10px] mt-1" style={{ color: "hsl(var(--ink-soft))" }}>
                {new Date(c.ts).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Kommentar hinzufügen…"
            className="flex-1 h-8 rounded-md border px-2 text-xs bg-background" style={{ borderColor: "hsl(var(--hairline))" }} />
          <button onClick={() => {
            if (!newComment.trim()) return;
            patch({ comments: [...(node.comments ?? []), { id: Math.random().toString(36).slice(2, 8), text: newComment.trim(), ts: Date.now() }] });
            setNewComment("");
          }} className="h-8 px-3 rounded-md text-xs font-medium"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}>Senden</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] mb-1 font-medium uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>{label}</span>
      {children}
    </label>
  );
}

// -------------------------------------------------------------
// Interaktives Netz (SVG, radial)
// -------------------------------------------------------------
function NoteGraph({
  rootLabel, focusId, nodes, selectedId, onFocus, onSelect,
}: {
  rootLabel: string;
  focusId: string | null;
  nodes: NoteNode[];
  selectedId: string | null;
  onFocus: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 400, h: 500 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const children = nodes.filter((n) => n.parentId === focusId);
  const focus = focusId ? nodes.find((n) => n.id === focusId) : null;
  const centerLabel = focus ? focus.title : rootLabel;

  const cx = size.w / 2;
  const cy = size.h / 2;
  const R = Math.min(size.w, size.h) * 0.35;

  return (
    <div ref={wrapRef} className="w-full h-full relative overflow-hidden" style={{ background: "hsl(var(--surface-muted))" }}>
      <svg width={size.w} height={size.h} className="absolute inset-0">
        {/* Verbindungen */}
        {children.map((n, i) => {
          const ang = (i / Math.max(1, children.length)) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(ang) * R;
          const y = cy + Math.sin(ang) * R;
          return (
            <line key={"l" + n.id} x1={cx} y1={cy} x2={x} y2={y}
              stroke="hsl(var(--hairline))" strokeWidth={1} />
          );
        })}

        {/* Zentrum */}
        <g onClick={() => focus && onFocus(focus.parentId)} style={{ cursor: focus ? "pointer" : "default" }}>
          <circle cx={cx} cy={cy} r={44} fill="hsl(var(--ink))" />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="hsl(var(--surface))">
            {centerLabel.length > 12 ? centerLabel.slice(0, 12) + "…" : centerLabel}
          </text>
        </g>

        {/* Kinder */}
        {children.map((n, i) => {
          const ang = (i / Math.max(1, children.length)) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(ang) * R;
          const y = cy + Math.sin(ang) * R;
          const isSel = n.id === selectedId;
          const isTopic = n.kind === "topic";
          const statusCol = n.status ? STATUS_COLOR[n.status] : "hsl(var(--accent-gold))";
          const r = isTopic ? 30 : 22;
          return (
            <g key={n.id} style={{ cursor: "pointer" }}
              onClick={() => onSelect(n.id)}
              onDoubleClick={() => { if (isTopic) onFocus(n.id); }}>
              <circle cx={x} cy={y} r={r + (isSel ? 4 : 0)}
                fill={isTopic ? "hsl(var(--accent-gold))" : "hsl(var(--surface-card))"}
                stroke={isSel ? "hsl(var(--accent-gold))" : statusCol}
                strokeWidth={isSel ? 3 : 2} />
              <text x={x} y={y + 3} textAnchor="middle" fontSize={10} fontWeight={600}
                fill={isTopic ? "hsl(var(--surface))" : "hsl(var(--ink))"}>
                {n.title.length > 8 ? n.title.slice(0, 8) + "…" : n.title}
              </text>
            </g>
          );
        })}

        {children.length === 0 && (
          <text x={cx} y={cy + 80} textAnchor="middle" fontSize={11} fill="hsl(var(--ink-soft))">
            Noch keine Einträge – links „Thema" hinzufügen
          </text>
        )}
      </svg>
    </div>
  );
}
