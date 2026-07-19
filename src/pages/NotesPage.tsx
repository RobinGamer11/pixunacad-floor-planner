import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { useProject } from "@/lib/projectStore";
import {
  notesStore, useNotes,
  type NoteKind, type NoteNode, type NoteStatus, type NotePriority, type NoteStatusDef,
} from "@/lib/notesStore";
import {
  Plus, Search, Trash2, ChevronRight, ChevronDown, FileText, CheckSquare, FolderTree,
  Circle, Clock3, CheckCircle2, AlertTriangle, X, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Network, Link2, CalendarClock, GripVertical,
} from "lucide-react";

const PRIORITY_LABEL: Record<NotePriority, string> = {
  low: "Niedrig", normal: "Normal", high: "Hoch", urgent: "Dringend",
};

function kindIcon(kind: NoteKind, size = 13) {
  if (kind === "topic") return <FolderTree size={size} />;
  if (kind === "task") return <CheckSquare size={size} />;
  return <FileText size={size} />;
}
function kindColor(kind: NoteKind) {
  if (kind === "topic") return "hsl(var(--accent-gold))";
  if (kind === "task") return "#3b82f6";
  return "#8b5cf6";
}

// -------------------------------------------------------------
// Root Page
// -------------------------------------------------------------
export default function NotesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const state = useNotes(projectId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightMode, setRightMode] = useState<"graph" | "links" | "timeline">("graph");

  const statusMap = useMemo(() => {
    const m = new Map<string, NoteStatusDef>();
    state.statuses.forEach((s) => m.set(s.id, s));
    return m;
  }, [state.statuses]);

  const childrenOf = useCallback(
    (parentId: string | null) => state.nodes.filter((n) => n.parentId === parentId),
    [state.nodes]
  );

  const selected = state.nodes.find((n) => n.id === selectedId) ?? null;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addChild = (parentId: string | null, kind: NoteKind) => {
    if (!projectId) return;
    const n = notesStore.addNode(projectId, parentId, kind);
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setSelectedId(n.id);
  };

  if (!projectId) return null;

  const gridCols = [
    leftOpen ? "280px" : "0px",
    "1fr",
    rightOpen ? "460px" : "0px",
  ].join(" ");

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <WorkspaceHeader projectId={projectId} projectName={project?.name} contextLabel="Notiznetz" mode="notes" />
      <main
        className="flex-1 min-h-0 grid transition-[grid-template-columns] duration-200"
        style={{ gridTemplateColumns: gridCols, background: "hsl(var(--surface-muted))" }}
      >
        {/* LEFT */}
        {leftOpen && (
          <LeftPanel
            projectId={projectId}
            state={state}
            statusMap={statusMap}
            search={search} setSearch={setSearch}
            filterCat={filterCat} setFilterCat={setFilterCat}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            selectedId={selectedId} setSelectedId={setSelectedId}
            expanded={expanded} toggleExpand={toggleExpand}
            childrenOf={childrenOf}
            addChild={addChild}
            onCollapse={() => setLeftOpen(false)}
          />
        )}

        {/* MIDDLE */}
        <section className="min-h-0 overflow-auto relative">
          <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 border-b"
               style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
            {!leftOpen && (
              <button onClick={() => setLeftOpen(true)}
                className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
                title="Liste einblenden">
                <PanelLeftOpen size={15} />
              </button>
            )}
            <div className="flex-1" />
            {!rightOpen && (
              <button onClick={() => setRightOpen(true)}
                className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
                title="Netz einblenden">
                <PanelRightOpen size={15} />
              </button>
            )}
          </div>
          {selected ? (
            <NoteEditor
              projectId={projectId}
              node={selected}
              categories={state.categories}
              statuses={state.statuses}
              nodes={state.nodes}
              onDelete={() => { notesStore.deleteNode(projectId, selected.id); setSelectedId(null); }}
            />
          ) : (
            <div className="h-[calc(100%-40px)] flex items-center justify-center text-sm"
                 style={{ color: "hsl(var(--ink-soft))" }}>
              Wähle links einen Eintrag oder lege ein neues Thema an.
            </div>
          )}
        </section>

        {/* RIGHT */}
        {rightOpen && (
          <RightPanel
            projectName={project?.name ?? "Projekt"}
            state={state}
            statusMap={statusMap}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            mode={rightMode}
            setMode={setRightMode}
            onCollapse={() => setRightOpen(false)}
          />
        )}
      </main>
    </div>
  );
}

// -------------------------------------------------------------
// LEFT PANEL – Baumliste + Filter
// -------------------------------------------------------------
function LeftPanel({
  projectId, state, statusMap, search, setSearch, filterCat, setFilterCat,
  filterStatus, setFilterStatus, selectedId, setSelectedId,
  expanded, toggleExpand, childrenOf, addChild, onCollapse,
}: {
  projectId: string;
  state: ReturnType<typeof useNotes>;
  statusMap: Map<string, NoteStatusDef>;
  search: string; setSearch: (v: string) => void;
  filterCat: string; setFilterCat: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  selectedId: string | null; setSelectedId: (v: string | null) => void;
  expanded: Set<string>; toggleExpand: (id: string) => void;
  childrenOf: (parentId: string | null) => NoteNode[];
  addChild: (parentId: string | null, kind: NoteKind) => void;
  onCollapse: () => void;
}) {
  const q = search.trim().toLowerCase();

  // Filter: Knoten & Vorfahren markieren, damit Struktur erhalten bleibt
  const visibleIds = useMemo(() => {
    const set = new Set<string>();
    const matches = (n: NoteNode) => {
      if (q && !`${n.title} ${n.description ?? ""}`.toLowerCase().includes(q)) return false;
      if (filterCat && n.category !== filterCat) return false;
      if (filterStatus && n.status !== filterStatus) return false;
      return true;
    };
    const byId = new Map(state.nodes.map((n) => [n.id, n]));
    state.nodes.forEach((n) => {
      if (matches(n)) {
        let cur: NoteNode | undefined = n;
        while (cur) {
          set.add(cur.id);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
      }
    });
    return set;
  }, [state.nodes, q, filterCat, filterStatus]);

  const anyFilter = q || filterCat || filterStatus;

  const addCategory = () => {
    const name = prompt("Neue Kategorie");
    if (name) notesStore.addCategory(projectId, name.trim());
  };
  const addStatus = () => {
    const label = prompt("Neuer Status – Bezeichnung");
    if (!label) return;
    const color = prompt("Farbe (Hex, z. B. #6366f1)", "#6366f1") ?? "#6366f1";
    notesStore.addStatus(projectId, label.trim(), color);
  };

  return (
    <aside className="flex flex-col min-h-0 border-r"
           style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
      <div className="p-2.5 border-b space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="flex items-center gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider flex-1"
               style={{ color: "hsl(var(--ink-soft))" }}>Notiznetz</div>
          <button onClick={onCollapse}
            className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
            title="Liste einklappen">
            <PanelLeftClose size={14} />
          </button>
        </div>

        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2"
                  style={{ color: "hsl(var(--ink-soft))" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen…"
            className="w-full h-7 pl-7 pr-2 rounded-md border text-[11px] bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }} />
        </div>

        <FilterRow>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
            className="flex-1 h-7 rounded-md border text-[11px] px-1 bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }}>
            <option value="">Alle Kategorien</option>
            {state.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <IconBtn onClick={addCategory} title="Kategorie hinzufügen"><Plus size={12} /></IconBtn>
        </FilterRow>

        <FilterRow>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="flex-1 h-7 rounded-md border text-[11px] px-1 bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }}>
            <option value="">Alle Status</option>
            {state.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <IconBtn onClick={addStatus} title="Status hinzufügen"><Plus size={12} /></IconBtn>
        </FilterRow>

        <button onClick={() => addChild(null, "topic")}
          className="w-full h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1"
          style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}>
          <Plus size={12} /> Neues Thema
        </button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        <TreeList
          nodes={childrenOf(null)}
          depth={0}
          selectedId={selectedId}
          onSelect={setSelectedId}
          expanded={expanded}
          toggleExpand={toggleExpand}
          childrenOf={childrenOf}
          addChild={addChild}
          visibleIds={anyFilter ? visibleIds : null}
          statusMap={statusMap}
        />
        {childrenOf(null).length === 0 && (
          <div className="px-3 py-6 text-center text-[11px]" style={{ color: "hsl(var(--ink-soft))" }}>
            Noch keine Themen. Beginne oben mit „Neues Thema".
          </div>
        )}
      </div>
    </aside>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}
function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted shrink-0"
      style={{ borderColor: "hsl(var(--hairline))" }}>
      {children}
    </button>
  );
}

function TreeList({
  nodes, depth, selectedId, onSelect, expanded, toggleExpand, childrenOf, addChild, visibleIds, statusMap,
}: {
  nodes: NoteNode[]; depth: number;
  selectedId: string | null; onSelect: (id: string) => void;
  expanded: Set<string>; toggleExpand: (id: string) => void;
  childrenOf: (parentId: string | null) => NoteNode[];
  addChild: (parentId: string | null, kind: NoteKind) => void;
  visibleIds: Set<string> | null;
  statusMap: Map<string, NoteStatusDef>;
}) {
  return (
    <ul>
      {nodes.map((n) => {
        if (visibleIds && !visibleIds.has(n.id)) return null;
        const kids = childrenOf(n.id);
        const hasKids = kids.length > 0;
        const isOpen = expanded.has(n.id) || !!visibleIds;
        const isSel = selectedId === n.id;
        const st = n.status ? statusMap.get(n.status) : undefined;
        return (
          <li key={n.id}>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-note-id", n.id);
                e.dataTransfer.effectAllowed = "link";
              }}
              onClick={() => onSelect(n.id)}
              className="group flex items-center gap-1 pr-1.5 py-1 cursor-pointer border-l-2"
              style={{
                paddingLeft: 6 + depth * 12,
                background: isSel ? "hsl(var(--surface-muted))" : "transparent",
                borderColor: isSel ? "hsl(var(--accent-gold))" : "transparent",
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); if (hasKids) toggleExpand(n.id); }}
                className="h-4 w-4 flex items-center justify-center shrink-0"
                style={{ visibility: hasKids ? "visible" : "hidden" }}>
                {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
              <GripVertical size={10} className="opacity-0 group-hover:opacity-40 shrink-0" />
              <span style={{ color: kindColor(n.kind) }} className="shrink-0">{kindIcon(n.kind)}</span>
              <span className="text-[11px] font-medium truncate flex-1" title={n.title}>{n.title}</span>
              {st && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} title={st.label} />}
              {n.priority === "urgent" && <AlertTriangle size={10} className="text-red-500 shrink-0" />}
            </div>

            {isSel && (
              <div className="flex gap-1 py-1 pr-2" style={{ paddingLeft: 26 + depth * 12 }}>
                {n.kind === "topic" && (
                  <MiniAddBtn onClick={() => addChild(n.id, "topic")} label="Unterthema" />
                )}
                <MiniAddBtn onClick={() => addChild(n.id, "note")} label="Notiz" />
                <MiniAddBtn onClick={() => addChild(n.id, "task")} label="Aufgabe" />
              </div>
            )}

            {hasKids && isOpen && (
              <TreeList
                nodes={kids} depth={depth + 1}
                selectedId={selectedId} onSelect={onSelect}
                expanded={expanded} toggleExpand={toggleExpand}
                childrenOf={childrenOf} addChild={addChild}
                visibleIds={visibleIds} statusMap={statusMap}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MiniAddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="h-6 px-2 rounded-md text-[10px] font-medium border flex items-center gap-1 hover:bg-muted"
      style={{ borderColor: "hsl(var(--hairline))" }}>
      <Plus size={10} /> {label}
    </button>
  );
}

// -------------------------------------------------------------
// MIDDLE – Editor
// -------------------------------------------------------------
function NoteEditor({
  projectId, node, categories, statuses, nodes, onDelete,
}: {
  projectId: string;
  node: NoteNode;
  categories: string[];
  statuses: NoteStatusDef[];
  nodes: NoteNode[];
  onDelete: () => void;
}) {
  const [newComment, setNewComment] = useState("");
  const patch = (p: Partial<NoteNode>) => notesStore.updateNode(projectId, node.id, p);

  const onDropLink = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/x-note-id");
    if (id) notesStore.linkNodes(projectId, node.id, id);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: kindColor(node.kind) }}>{kindIcon(node.kind, 18)}</span>
        <select value={node.kind}
          onChange={(e) => patch({ kind: e.target.value as NoteKind })}
          className="h-7 rounded-md border text-[11px] px-1 bg-background"
          style={{ borderColor: "hsl(var(--hairline))" }}>
          <option value="topic">Thema</option>
          <option value="note">Notiz</option>
          <option value="task">Aufgabe</option>
        </select>
        <div className="flex-1" />
        <button onClick={onDelete}
          className="h-8 px-2 rounded-md text-xs flex items-center gap-1 hover:bg-muted"
          title="Löschen">
          <Trash2 size={14} /> Löschen
        </button>
      </div>

      <input value={node.title} onChange={(e) => patch({ title: e.target.value })}
        placeholder="Titel *"
        className="w-full text-xl font-semibold bg-transparent border-b py-1 focus:outline-none mb-3"
        style={{ borderColor: "hsl(var(--hairline))" }} />
      <textarea value={node.description ?? ""} onChange={(e) => patch({ description: e.target.value })}
        placeholder="Beschreibung *" rows={4}
        className="w-full text-sm rounded-md border p-2 bg-background mb-4"
        style={{ borderColor: "hsl(var(--hairline))" }} />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Field label="Datum">
          <input type="date" value={node.date ?? ""} onChange={(e) => patch({ date: e.target.value })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Uhrzeit">
          <input type="time" value={node.time ?? ""} onChange={(e) => patch({ time: e.target.value })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Fällig am">
          <input type="date" value={node.dueDate ?? ""} onChange={(e) => patch({ dueDate: e.target.value })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Dringlichkeit">
          <select value={node.priority ?? "normal"}
            onChange={(e) => patch({ priority: e.target.value as NotePriority })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }}>
            {(Object.keys(PRIORITY_LABEL) as NotePriority[]).map((p) =>
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <div className="flex flex-wrap gap-1">
            {statuses.map((s) => (
              <button key={s.id} onClick={() => patch({ status: s.id })}
                className="h-7 px-2 rounded-md text-[11px] font-medium flex items-center gap-1 border"
                style={{
                  borderColor: node.status === s.id ? s.color : "hsl(var(--hairline))",
                  background: node.status === s.id ? s.color + "22" : "transparent",
                  color: node.status === s.id ? s.color : "hsl(var(--ink))",
                }}>
                {s.id === "open" ? <Circle size={11} /> :
                 s.id === "wip" ? <Clock3 size={11} /> :
                 s.id === "done" ? <CheckCircle2 size={11} /> :
                 <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />}
                {s.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Kategorie">
          <select value={node.category ?? ""}
            onChange={(e) => patch({ category: e.target.value || undefined })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }}>
            <option value="">—</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Verantwortlich">
          <input value={node.responsible ?? ""}
            onChange={(e) => patch({ responsible: e.target.value })} placeholder="Name"
            className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
        <Field label="Beteiligte (Komma-getrennt)">
          <input value={(node.participants ?? []).join(", ")}
            onChange={(e) => patch({ participants: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            className="w-full h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }} />
        </Field>
      </div>

      <Field label="Verknüpfungen (aus Liste hineinziehen)">
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "link"; }}
          onDrop={onDropLink}
          className="min-h-[52px] rounded-md border-2 border-dashed p-2 flex flex-wrap gap-1"
          style={{ borderColor: "hsl(var(--hairline))" }}>
          {(node.linkedIds ?? []).length === 0 && (
            <span className="text-[11px] self-center" style={{ color: "hsl(var(--ink-soft))" }}>
              Ziehe Themen, Notizen oder Aufgaben aus der linken Liste hierher.
            </span>
          )}
          {(node.linkedIds ?? []).map((id) => {
            const t = nodes.find((n) => n.id === id);
            if (!t) return null;
            return (
              <span key={id}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                style={{ background: "hsl(var(--surface-muted))" }}>
                <span style={{ color: kindColor(t.kind) }}>{kindIcon(t.kind, 10)}</span>
                {t.title}
                <button onClick={() => notesStore.unlinkNodes(projectId, node.id, id)}
                  title="Verknüpfung entfernen">
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      </Field>

      <div className="mt-6">
        <div className="text-xs font-semibold uppercase tracking-wider mb-2"
             style={{ color: "hsl(var(--ink-soft))" }}>Kommentare</div>
        <div className="space-y-2 mb-2">
          {(node.comments ?? []).map((c) => (
            <div key={c.id} className="text-xs p-2 rounded flex items-start gap-2"
                 style={{ background: "hsl(var(--surface-muted))" }}>
              <div className="flex-1">
                <div className="whitespace-pre-wrap">{c.text}</div>
                <div className="text-[10px] mt-1" style={{ color: "hsl(var(--ink-soft))" }}>
                  {new Date(c.ts).toLocaleString()}
                </div>
              </div>
              <button onClick={() => notesStore.removeComment(projectId, node.id, c.id)}
                className="h-6 w-6 rounded flex items-center justify-center hover:bg-background"
                title="Kommentar löschen">
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
            placeholder="Kommentar hinzufügen…"
            className="flex-1 h-8 rounded-md border px-2 text-xs bg-background"
            style={{ borderColor: "hsl(var(--hairline))" }} />
          <button onClick={() => {
            if (!newComment.trim()) return;
            notesStore.addComment(projectId, node.id, newComment);
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
      <span className="block text-[11px] mb-1 font-medium uppercase tracking-wider"
        style={{ color: "hsl(var(--ink-soft))" }}>{label}</span>
      {children}
    </label>
  );
}

// -------------------------------------------------------------
// RIGHT PANEL
// -------------------------------------------------------------
function RightPanel({
  projectName, state, statusMap, selectedId, setSelectedId, mode, setMode, onCollapse,
}: {
  projectName: string;
  state: ReturnType<typeof useNotes>;
  statusMap: Map<string, NoteStatusDef>;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  mode: "graph" | "links" | "timeline";
  setMode: (m: "graph" | "links" | "timeline") => void;
  onCollapse: () => void;
}) {
  return (
    <aside className="min-h-0 border-l flex flex-col"
      style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
      <div className="p-2 border-b flex items-center gap-1" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="flex gap-1 flex-1 rounded-md p-0.5"
             style={{ background: "hsl(var(--surface-muted))" }}>
          <ModeChip active={mode === "graph"} onClick={() => setMode("graph")}
            icon={<Network size={12} />} label="Projektnetz" />
          <ModeChip active={mode === "links"} onClick={() => setMode("links")}
            icon={<Link2 size={12} />} label="Verknüpfungen" />
          <ModeChip active={mode === "timeline"} onClick={() => setMode("timeline")}
            icon={<CalendarClock size={12} />} label="Zeitstrahl" />
        </div>
        <button onClick={onCollapse}
          className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
          title="Netz einklappen">
          <PanelRightClose size={14} />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {mode === "graph" && (
          <ProjectGraph projectName={projectName} nodes={state.nodes}
            statusMap={statusMap} selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {mode === "links" && (
          <LinksGraph nodes={state.nodes} statusMap={statusMap}
            selectedId={selectedId} onSelect={setSelectedId} />
        )}
        {mode === "timeline" && (
          <TimelineView nodes={state.nodes} statusMap={statusMap}
            selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </div>
    </aside>
  );
}

function ModeChip({ active, onClick, icon, label }:
  { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className="flex-1 h-6 px-2 rounded flex items-center justify-center gap-1 text-[10px] font-medium transition-colors"
      style={{
        background: active ? "hsl(var(--accent-gold))" : "transparent",
        color: active ? "hsl(var(--surface))" : "hsl(var(--ink-soft))",
      }}>
      {icon} {label}
    </button>
  );
}

// -------------------------------------------------------------
// Zoom/Pan container
// -------------------------------------------------------------
function useZoomPan() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const state = useRef({ x: 0, y: 0, k: 1, dragging: false, sx: 0, sy: 0, pinchDist: 0, pinchK: 1 });

  useEffect(() => { state.current.x = t.x; state.current.y = t.y; state.current.k = t.k; }, [t]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const cur = state.current;
      const factor = Math.pow(1.0015, -e.deltaY);
      const newK = Math.min(6, Math.max(0.2, cur.k * factor));
      const nx = px - (px - cur.x) * (newK / cur.k);
      const ny = py - (py - cur.y) * (newK / cur.k);
      setT({ x: nx, y: ny, k: newK });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    state.current.dragging = true;
    state.current.sx = e.clientX - state.current.x;
    state.current.sy = e.clientY - state.current.y;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!state.current.dragging) return;
    setT((cur) => ({ ...cur, x: e.clientX - state.current.sx, y: e.clientY - state.current.sy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    state.current.dragging = false;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  // Touch pinch
  const touches = useRef<Map<number, { x: number; y: number }>>(new Map());
  const onTouchStart = (e: React.TouchEvent) => {
    for (const t of Array.from(e.touches)) touches.current.set(t.identifier, { x: t.clientX, y: t.clientY });
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const a = e.touches[0], b = e.touches[1];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const prev = touches.current;
      const pa = prev.get(a.identifier), pb = prev.get(b.identifier);
      if (pa && pb) {
        const prevDist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (prevDist > 0) {
          const el = wrap.current!;
          const rect = el.getBoundingClientRect();
          const px = (a.clientX + b.clientX) / 2 - rect.left;
          const py = (a.clientY + b.clientY) / 2 - rect.top;
          const cur = state.current;
          const factor = dist / prevDist;
          const newK = Math.min(6, Math.max(0.2, cur.k * factor));
          const nx = px - (px - cur.x) * (newK / cur.k);
          const ny = py - (py - cur.y) * (newK / cur.k);
          setT({ x: nx, y: ny, k: newK });
        }
      }
      touches.current.set(a.identifier, { x: a.clientX, y: a.clientY });
      touches.current.set(b.identifier, { x: b.clientX, y: b.clientY });
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) touches.current.delete(t.identifier);
  };

  const reset = () => setT({ x: 0, y: 0, k: 1 });

  return { wrap, t, onPointerDown, onPointerMove, onPointerUp, onTouchStart, onTouchMove, onTouchEnd, reset };
}

// -------------------------------------------------------------
// Radial Graph für gesamten Baum
// -------------------------------------------------------------
interface LayoutNode { id: string; x: number; y: number; r: number; node: NoteNode | null; parent: string | null }

function layoutRadial(nodes: NoteNode[], rootLabel: string) {
  const byParent = new Map<string | null, NoteNode[]>();
  nodes.forEach((n) => {
    const arr = byParent.get(n.parentId) ?? [];
    arr.push(n);
    byParent.set(n.parentId, arr);
  });
  const out: LayoutNode[] = [];
  const edges: { from: string; to: string }[] = [];
  const ROOT_ID = "__root__";
  out.push({ id: ROOT_ID, x: 0, y: 0, r: 42, node: null, parent: null });

  const place = (
    parentId: string | null, parentPos: { x: number; y: number },
    parentAngle: number, spread: number, ring: number,
    baseRadius: number,
  ) => {
    const kids = byParent.get(parentId) ?? [];
    if (!kids.length) return;
    const radius = baseRadius + ring * 130;
    const step = spread / kids.length;
    kids.forEach((k, i) => {
      const ang = parentAngle - spread / 2 + step * (i + 0.5);
      const x = parentPos.x + Math.cos(ang) * radius;
      const y = parentPos.y + Math.sin(ang) * radius;
      const r = k.kind === "topic" ? 26 - Math.min(ring, 3) * 3 : 18 - Math.min(ring, 3) * 2;
      out.push({ id: k.id, x, y, r: Math.max(10, r), node: k, parent: parentId ?? ROOT_ID });
      edges.push({ from: parentId ?? ROOT_ID, to: k.id });
      const childSpread = ring === 0 ? Math.PI / 2.2 : Math.PI / 1.8;
      place(k.id, { x, y }, ang, childSpread, ring + 1, 0);
    });
  };
  place(null, { x: 0, y: 0 }, -Math.PI / 2, Math.PI * 2, 0, 140);

  return { nodes: out, edges, rootLabel };
}

function ProjectGraph({
  projectName, nodes, statusMap, selectedId, onSelect,
}: {
  projectName: string; nodes: NoteNode[];
  statusMap: Map<string, NoteStatusDef>;
  selectedId: string | null; onSelect: (id: string) => void;
}) {
  const zp = useZoomPan();
  const layout = useMemo(() => layoutRadial(nodes, projectName), [nodes, projectName]);
  const [size, setSize] = useState({ w: 400, h: 500 });
  useEffect(() => {
    const el = zp.wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zp.wrap]);

  const cx = size.w / 2;
  const cy = size.h / 2;

  return (
    <div ref={zp.wrap} className="w-full h-full relative overflow-hidden touch-none"
         style={{ background: "hsl(var(--surface-muted))", cursor: "grab" }}
         onPointerDown={zp.onPointerDown} onPointerMove={zp.onPointerMove}
         onPointerUp={zp.onPointerUp} onPointerCancel={zp.onPointerUp}
         onTouchStart={zp.onTouchStart} onTouchMove={zp.onTouchMove} onTouchEnd={zp.onTouchEnd}>
      <button onClick={zp.reset}
        className="absolute top-2 right-2 z-10 h-7 px-2 rounded-md text-[10px] border bg-background/80 backdrop-blur"
        style={{ borderColor: "hsl(var(--hairline))" }}>Ansicht zurücksetzen</button>
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <g transform={`translate(${cx + zp.t.x}, ${cy + zp.t.y}) scale(${zp.t.k})`}>
          {layout.edges.map((e, i) => {
            const a = layout.nodes.find((n) => n.id === e.from)!;
            const b = layout.nodes.find((n) => n.id === e.to)!;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="hsl(var(--hairline))" strokeWidth={1.2 / zp.t.k} />;
          })}
          {layout.nodes.map((ln) => {
            if (!ln.node) {
              return (
                <g key={ln.id}>
                  <circle cx={ln.x} cy={ln.y} r={ln.r} fill="hsl(var(--ink))" />
                  <text x={ln.x} y={ln.y + 4} textAnchor="middle" fontSize={11}
                        fontWeight={600} fill="hsl(var(--surface))">
                    {layout.rootLabel.length > 12 ? layout.rootLabel.slice(0, 12) + "…" : layout.rootLabel}
                  </text>
                </g>
              );
            }
            const n = ln.node;
            const isSel = n.id === selectedId;
            const isTopic = n.kind === "topic";
            const statusCol = n.status ? statusMap.get(n.status)?.color ?? "hsl(var(--hairline))"
                                       : kindColor(n.kind);
            return (
              <g key={ln.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}>
                <circle cx={ln.x} cy={ln.y} r={ln.r + (isSel ? 3 : 0)}
                  fill={isTopic ? "hsl(var(--accent-gold))" : "hsl(var(--surface-card))"}
                  stroke={isSel ? "hsl(var(--accent-gold))" : statusCol}
                  strokeWidth={isSel ? 3 : 1.8} />
                <text x={ln.x} y={ln.y + 3} textAnchor="middle" fontSize={9} fontWeight={600}
                  fill={isTopic ? "hsl(var(--surface))" : "hsl(var(--ink))"}>
                  {n.title.length > 10 ? n.title.slice(0, 10) + "…" : n.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {layout.nodes.length === 1 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] pointer-events-none"
             style={{ color: "hsl(var(--ink-soft))" }}>
          Noch keine Themen im Netz.
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Verknüpfungen-Ansicht: ausgewählter Knoten + verknüpfte
// -------------------------------------------------------------
function LinksGraph({
  nodes, statusMap, selectedId, onSelect,
}: {
  nodes: NoteNode[]; statusMap: Map<string, NoteStatusDef>;
  selectedId: string | null; onSelect: (id: string) => void;
}) {
  const zp = useZoomPan();
  const [size, setSize] = useState({ w: 400, h: 500 });
  useEffect(() => {
    const el = zp.wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zp.wrap]);

  const center = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const linked = center ? (center.linkedIds ?? []).map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as NoteNode[] : [];

  const cx = size.w / 2;
  const cy = size.h / 2;
  const R = 130;

  return (
    <div ref={zp.wrap} className="w-full h-full relative overflow-hidden touch-none"
         style={{ background: "hsl(var(--surface-muted))", cursor: "grab" }}
         onPointerDown={zp.onPointerDown} onPointerMove={zp.onPointerMove}
         onPointerUp={zp.onPointerUp} onPointerCancel={zp.onPointerUp}
         onTouchStart={zp.onTouchStart} onTouchMove={zp.onTouchMove} onTouchEnd={zp.onTouchEnd}>
      {!center && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px]"
             style={{ color: "hsl(var(--ink-soft))" }}>
          Wähle links einen Eintrag, um dessen Verknüpfungen zu sehen.
        </div>
      )}
      {center && (
        <svg width={size.w} height={size.h} className="absolute inset-0">
          <g transform={`translate(${cx + zp.t.x}, ${cy + zp.t.y}) scale(${zp.t.k})`}>
            {linked.map((n, i) => {
              const ang = (i / Math.max(1, linked.length)) * Math.PI * 2 - Math.PI / 2;
              const x = Math.cos(ang) * R;
              const y = Math.sin(ang) * R;
              const st = n.status ? statusMap.get(n.status)?.color ?? kindColor(n.kind) : kindColor(n.kind);
              return (
                <g key={n.id}>
                  <line x1={0} y1={0} x2={x} y2={y} stroke="hsl(var(--hairline))" strokeDasharray="4 3" />
                  <g style={{ cursor: "pointer" }} onClick={() => onSelect(n.id)}>
                    <circle cx={x} cy={y} r={22}
                      fill={n.kind === "topic" ? "hsl(var(--accent-gold))" : "hsl(var(--surface-card))"}
                      stroke={st} strokeWidth={2} />
                    <text x={x} y={y + 3} textAnchor="middle" fontSize={9} fontWeight={600}
                      fill={n.kind === "topic" ? "hsl(var(--surface))" : "hsl(var(--ink))"}>
                      {n.title.length > 9 ? n.title.slice(0, 9) + "…" : n.title}
                    </text>
                  </g>
                </g>
              );
            })}
            <g>
              <circle cx={0} cy={0} r={34}
                fill={center.kind === "topic" ? "hsl(var(--accent-gold))" : "hsl(var(--ink))"} />
              <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="hsl(var(--surface))">
                {center.title.length > 11 ? center.title.slice(0, 11) + "…" : center.title}
              </text>
            </g>
          </g>
        </svg>
      )}
      {center && linked.length === 0 && (
        <div className="absolute inset-x-0 bottom-4 text-center text-[11px] pointer-events-none"
             style={{ color: "hsl(var(--ink-soft))" }}>
          Noch keine Verknüpfungen – ziehe aus der Liste in das Feld „Verknüpfungen" in der Mitte.
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Zeitstrahl
// -------------------------------------------------------------
function TimelineView({
  nodes, statusMap, selectedId, onSelect,
}: {
  nodes: NoteNode[]; statusMap: Map<string, NoteStatusDef>;
  selectedId: string | null; onSelect: (id: string) => void;
}) {
  const topics = nodes.filter((n) => n.kind === "topic");
  const childrenOf = (id: string) => nodes.filter((n) => n.parentId === id);
  const bestDate = (n: NoteNode) => n.date || n.dueDate || "";

  return (
    <div className="w-full h-full overflow-auto p-4" style={{ background: "hsl(var(--surface-muted))" }}>
      {topics.length === 0 && (
        <div className="text-center text-[11px] mt-10" style={{ color: "hsl(var(--ink-soft))" }}>
          Lege Themen an, um den Zeitstrahl zu füllen.
        </div>
      )}
      <ol className="relative border-l-2 pl-4 space-y-6" style={{ borderColor: "hsl(var(--accent-gold))" }}>
        {topics.map((t) => {
          const kids = childrenOf(t.id).slice().sort((a, b) => (bestDate(a) || "").localeCompare(bestDate(b) || ""));
          return (
            <li key={t.id} className="relative">
              <span className="absolute -left-[22px] top-1 h-3.5 w-3.5 rounded-full border-2"
                style={{ background: "hsl(var(--accent-gold))", borderColor: "hsl(var(--surface))" }} />
              <button onClick={() => onSelect(t.id)}
                className="text-sm font-semibold text-left hover:underline"
                style={{ color: selectedId === t.id ? "hsl(var(--accent-gold))" : "hsl(var(--ink))" }}>
                {t.title}
              </button>
              {t.date && (
                <div className="text-[10px]" style={{ color: "hsl(var(--ink-soft))" }}>
                  {new Date(t.date).toLocaleDateString()}
                </div>
              )}
              <ul className="mt-2 space-y-1">
                {kids.map((k) => {
                  const col = k.status ? statusMap.get(k.status)?.color ?? kindColor(k.kind) : kindColor(k.kind);
                  return (
                    <li key={k.id}>
                      <button onClick={() => onSelect(k.id)}
                        className="w-full text-left flex items-center gap-2 p-2 rounded-md border hover:bg-background"
                        style={{
                          borderColor: selectedId === k.id ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                          background: "hsl(var(--surface-card))",
                        }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col }} />
                        <span style={{ color: kindColor(k.kind) }}>{kindIcon(k.kind, 11)}</span>
                        <span className="text-[11px] flex-1 truncate">{k.title}</span>
                        <span className="text-[10px] tabular-nums" style={{ color: "hsl(var(--ink-soft))" }}>
                          {bestDate(k) ? new Date(bestDate(k)).toLocaleDateString() : "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {kids.length === 0 && (
                  <li className="text-[10px] pl-2" style={{ color: "hsl(var(--ink-soft))" }}>
                    Keine Einträge unter diesem Thema.
                  </li>
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
