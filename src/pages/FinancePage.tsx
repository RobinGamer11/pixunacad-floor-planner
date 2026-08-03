import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { TabletAidWheel } from "@/components/TabletAidWheel";
import { useProject } from "@/lib/projectStore";
import { exportElementToA4Pdf } from "@/lib/financePdfExport";
import {
  financeStore, childrenOf, positionsOf, nodeTotals, projectTotals, actionTotals,
  control, formatEur, formatPct,
  type FinanceNode, type FinanceState, type FinanceTotals,
} from "@/lib/financeStore";
import { FinanceSummaryCard } from "@/components/finance/FinanceSummaryCard";
import { FinancePositionsTable } from "@/components/finance/FinancePositionsTable";
import {
  Plus, PanelLeftClose, PanelLeftOpen, ChevronRight, ChevronDown,
  Folder, Building2, ArrowRight, ToggleLeft, ToggleRight, Home, Trash2,
} from "lucide-react";

function useFinance(projectId?: string): FinanceState {
  const [state, setState] = useState<FinanceState>(() =>
    projectId ? financeStore.get(projectId) : { nodes: [], positions: [], projectEstimate: 0, projectNote: "" });
  useEffect(() => {
    if (!projectId) return;
    setState(financeStore.get(projectId));
    const unsub = financeStore.subscribe(() => setState(financeStore.get(projectId)));
    return () => { unsub(); };
  }, [projectId]);
  return state;
}

export default function FinancePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const state = useFinance(projectId);

  /** null = Projektknoten. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [leftOpen, setLeftOpen] = useState(true);
  const [tabletAidOn, setTabletAidOn] = useState<boolean>(() => {
    try { return localStorage.getItem("pixuna.tabletAid") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("pixuna.tabletAid", tabletAidOn ? "1" : "0"); } catch { /* ignore */ }
  }, [tabletAidOn]);

  const selected = useMemo(
    () => (selectedId ? state.nodes.find((n) => n.id === selectedId) ?? null : null),
    [state.nodes, selectedId],
  );
  const pid = projectId ?? "";

  /* ---- PDF-Export des rechten Detailfensters (DIN A4) ---- */
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    const el = exportRef.current;
    if (!el || exporting) return;
    setExporting(true);
    el.classList.add("finance-exporting");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const title = selected?.name ?? project?.name ?? "Finanzen";
      await exportElementToA4Pdf(el, `${title}.pdf`);
    } catch (e) {
      console.error("Finanz-Export fehlgeschlagen", e);
    } finally {
      el.classList.remove("finance-exporting");
      setExporting(false);
    }
  };

  const toggleExpand = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !(e[id] ?? true) }));

  const addNode = (type: "overview" | "action") => {
    // Aktionen landen im ausgewählten Übersichtsordner, Übersichten auf dessen Ebene.
    let parent: string | null = null;
    if (selected) parent = selected.type === "overview" ? selected.id : selected.parentId;
    const node = financeStore.addNode(pid, type, parent);
    if (parent) setExpanded((e) => ({ ...e, [parent!]: true }));
    setSelectedId(node.id);
  };

  const renderTree = (parentId: string | null, depth: number): React.ReactNode =>
    childrenOf(state, parentId).map((n) => {
      const kids = childrenOf(state, n.id);
      const open = expanded[n.id] ?? true;
      const active = selectedId === n.id;
      return (
        <div key={n.id}>
          <div
            onClick={() => setSelectedId(n.id)}
            className="group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-[12px]"
            style={{
              paddingLeft: 8 + depth * 14,
              background: active ? "hsl(var(--surface-muted))" : undefined,
              opacity: n.enabled ? 1 : 0.45,
            }}
          >
            {kids.length > 0 ? (
              <button onClick={(e) => { e.stopPropagation(); toggleExpand(n.id); }}
                className="h-4 w-4 flex items-center justify-center shrink-0">
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : <span className="h-4 w-4 shrink-0" />}
            {n.type === "overview"
              ? <Folder size={13} style={{ color: "hsl(var(--accent-gold))" }} />
              : <Building2 size={13} style={{ color: "hsl(var(--ink-soft))" }} />}
            <span className="truncate flex-1">{n.name}</span>
            <button
              title={n.type === "overview" ? "Übersicht löschen" : "Aktion löschen"}
              onClick={(e) => {
                e.stopPropagation();
                if (!confirm(`„${n.name}" wirklich löschen?`)) return;
                financeStore.deleteNode(pid, n.id);
                setSelectedId((cur) => (cur === n.id ? null : cur));
              }}
              className="opacity-0 group-hover:opacity-100 shrink-0"
              style={{ color: "hsl(var(--ink-soft))" }}>
              <Trash2 size={13} />
            </button>
          </div>
          {open && kids.length > 0 && renderTree(n.id, depth + 1)}
        </div>
      );
    });

  return (
    <div className="h-screen flex flex-col" style={{ background: "hsl(var(--surface-app))" }}>
      <WorkspaceHeader
        projectId={projectId}
        projectName={project?.name}
        mode="finance"
        tabletAidOn={tabletAidOn}
        onToggleTabletAid={() => setTabletAidOn((v) => !v)}
        canDelete={!!selected}
        onDelete={() => {
          if (!selected) return;
          financeStore.deleteNode(pid, selected.id);
          setSelectedId(null);
        }}
      />

      <main className="flex-1 min-h-0 flex">
        {leftOpen && (
          <aside className="w-[280px] shrink-0 min-h-0 flex flex-col border-r overflow-hidden"
                 style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
            <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider flex-1"
                   style={{ color: "hsl(var(--ink-soft))" }}>Struktur</div>
              <button onClick={() => setLeftOpen(false)}
                className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted" title="Liste einklappen">
                <PanelLeftClose size={15} />
              </button>
            </div>

            <div className="flex gap-1.5 px-3 py-2 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
              <button onClick={() => addNode("overview")}
                className="flex-1 h-7 rounded-md border text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-muted"
                style={{ borderColor: "hsl(var(--hairline))" }}>
                <Plus size={12} /> Übersicht
              </button>
              <button onClick={() => addNode("action")}
                className="flex-1 h-7 rounded-md border text-[11px] font-medium flex items-center justify-center gap-1 hover:bg-muted"
                style={{ borderColor: "hsl(var(--hairline))" }}>
                <Plus size={12} /> Aktion
              </button>
            </div>

            <div className="flex-1 overflow-auto py-1 px-1">
              <div onClick={() => setSelectedId(null)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-[12px] font-semibold"
                style={{ background: selectedId === null ? "hsl(var(--surface-muted))" : undefined }}>
                <Home size={13} style={{ color: "hsl(var(--accent-gold))" }} />
                <span className="truncate">{project?.name ?? "Projekt"}</span>
              </div>
              {renderTree(null, 1)}
            </div>
          </aside>
        )}

        <section className="flex-1 min-w-0 min-h-0 overflow-auto">
          <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 border-b"
               style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
            {!leftOpen && (
              <button onClick={() => setLeftOpen(true)}
                className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted" title="Liste einblenden">
                <PanelLeftOpen size={15} />
              </button>
            )}
            <div className="text-[11px] font-semibold uppercase tracking-wider"
                 style={{ color: "hsl(var(--ink-soft))" }}>
              {selected ? (selected.type === "action" ? "Aktion" : "Übersicht") : "Projekt"}
            </div>
            <div className="flex-1" />
            {selected && (
              <button
                onClick={() => {
                  if (!confirm(`„${selected.name}" wirklich löschen?`)) return;
                  financeStore.deleteNode(pid, selected.id);
                  setSelectedId(null);
                }}
                className="h-7 w-7 rounded flex items-center justify-center opacity-40 hover:opacity-100 hover:bg-muted"
                title={selected.type === "action" ? "Aktion löschen" : "Übersicht löschen"}>
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="p-4 space-y-4">
            {!selected && (
              <ProjectView projectId={pid} state={state} projectName={project?.name ?? "Projekt"}
                           onSelect={setSelectedId} />
            )}
            {selected?.type === "overview" && (
              <OverviewView projectId={pid} state={state} node={selected} onSelect={setSelectedId} />
            )}
            {selected?.type === "action" && (
              <ActionView projectId={pid} state={state} node={selected} />
            )}
          </div>
        </section>
      </main>
      {tabletAidOn && <TabletAidWheel />}
    </div>
  );
}

/* ----------------------------------------------------------------- Aktion */

const ActionView: React.FC<{ projectId: string; state: FinanceState; node: FinanceNode }> =
({ projectId, state, node }) => {
  const totals = actionTotals(state, node);
  const positions = positionsOf(state, node.id);
  const invoiceDetails = positions.filter((p) => p.type === "invoice" || p.type === "supplement");

  return (
    <>
      <div className="space-y-2">
        <input value={node.name}
          onChange={(e) => financeStore.updateNode(projectId, node.id, { name: e.target.value })}
          placeholder="Name der Aktion / des Unternehmens"
          className="w-full bg-transparent text-2xl font-semibold outline-none" />
        <textarea value={node.note} rows={2}
          onChange={(e) => financeStore.updateNode(projectId, node.id, { note: e.target.value })}
          placeholder="Notiz..."
          className="w-full bg-transparent text-sm outline-none resize-y border rounded-lg px-3 py-2"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }} />
      </div>

      <FinanceSummaryCard
        totals={totals}
        subtitle={node.name}
        invoiceDetails={invoiceDetails}
        onEstimateChange={(v) => financeStore.updateNode(projectId, node.id, { estimate: v })}
      />

      <div className="flex flex-wrap gap-2">
        {([["offer", "Angebot"], ["invoice", "Rechnung"], ["supplement", "Nachtrag"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => financeStore.addPosition(projectId, node.id, t)}
            className="h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1 hover:bg-muted"
            style={{ borderColor: "hsl(var(--hairline))" }}>
            <Plus size={13} /> {label}
          </button>
        ))}
      </div>

      <FinancePositionsTable projectId={projectId} nodeId={node.id} positions={positions} />
    </>
  );
};

/* --------------------------------------------------------------- Übersicht */

const OverviewView: React.FC<{ projectId: string; state: FinanceState; node: FinanceNode; onSelect: (id: string) => void }> =
({ projectId, state, node, onSelect }) => {
  const totals = nodeTotals(state, node);
  const kids = childrenOf(state, node.id);
  return (
    <>
      <div className="space-y-2">
        <input value={node.name}
          onChange={(e) => financeStore.updateNode(projectId, node.id, { name: e.target.value })}
          placeholder="Name der Übersicht"
          className="w-full bg-transparent text-2xl font-semibold outline-none" />
        <textarea value={node.note} rows={2}
          onChange={(e) => financeStore.updateNode(projectId, node.id, { note: e.target.value })}
          placeholder="Notiz..."
          className="w-full bg-transparent text-sm outline-none resize-y border rounded-lg px-3 py-2"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }} />
      </div>

      <FinanceSummaryCard totals={totals} subtitle={node.name}
        onEstimateChange={(v) => financeStore.updateNode(projectId, node.id, { estimate: v })} />

      <ChildList projectId={projectId} state={state} nodes={kids} onSelect={onSelect} />
    </>
  );
};

/* ----------------------------------------------------------------- Projekt */

const ProjectView: React.FC<{ projectId: string; state: FinanceState; projectName: string; onSelect: (id: string) => void }> =
({ projectId, state, projectName, onSelect }) => {
  const totals = projectTotals(state);
  const roots = childrenOf(state, null);
  return (
    <>
      <div className="space-y-2">
        <div className="text-2xl font-semibold">{projectName}</div>
        <textarea value={state.projectNote} rows={2}
          onChange={(e) => financeStore.setProjectNote(projectId, e.target.value)}
          placeholder="Notiz..."
          className="w-full bg-transparent text-sm outline-none resize-y border rounded-lg px-3 py-2"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }} />
      </div>

      <FinanceSummaryCard totals={totals} subtitle="Gesamtes Projekt"
        onEstimateChange={(v) => financeStore.setProjectEstimate(projectId, v)} />

      <ChildList projectId={projectId} state={state} nodes={roots} onSelect={onSelect} deep />
    </>
  );
};

/* ------------------------------------------------- Liste untergeordneter Knoten */

const ChildList: React.FC<{
  projectId: string; state: FinanceState; nodes: FinanceNode[];
  onSelect: (id: string) => void; deep?: boolean;
}> = ({ projectId, state, nodes, onSelect }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border px-4 py-6 text-xs"
           style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
        Noch keine Einträge. Lege links „+ Übersicht" oder „+ Aktion" an.
      </div>
    );
  }
  return (
    <div className="rounded-xl border overflow-hidden"
         style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
      <div className="grid items-center px-3 py-2 border-b text-[11px] font-semibold uppercase tracking-wider"
           style={{ gridTemplateColumns: "28px 1.6fr 1fr 1fr 1fr 1.2fr 32px", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
        <span /><span>Bezeichnung</span><span>Schätzung</span><span>Angebote</span>
        <span>Rechnungen</span><span>Kontrolle (Ang./Re.)</span><span />
      </div>
      {nodes.map((n) => {
        const t: FinanceTotals = nodeTotals(state, n);
        const cO = control(t.estimate, t.offers);
        const cI = control(t.estimate, t.invoices);
        const kids = childrenOf(state, n.id);
        const isOpen = !!open[n.id];
        return (
          <div key={n.id}>
            <div className="grid items-center px-3 py-2 border-b text-sm"
                 style={{ gridTemplateColumns: "28px 1.6fr 1fr 1fr 1fr 1.2fr 32px", borderColor: "hsl(var(--hairline))", opacity: n.enabled ? 1 : 0.45 }}>
              <button title={n.enabled ? "Wird berücksichtigt" : "Wird nicht berücksichtigt"}
                onClick={() => financeStore.updateNode(projectId, n.id, { enabled: !n.enabled })}>
                {n.enabled ? <ToggleRight size={16} style={{ color: "hsl(var(--accent-gold))" }} /> : <ToggleLeft size={16} />}
              </button>
              <button
                className="flex items-center gap-1.5 min-w-0 text-left"
                title={kids.length > 0 ? "Unterpunkte ein-/ausklappen" : "Öffnen"}
                onClick={() => kids.length > 0
                  ? setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))
                  : onSelect(n.id)}>
                {kids.length > 0
                  ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />)
                  : <span className="w-[13px]" />}
                {n.type === "overview" ? <Folder size={14} /> : <Building2 size={14} />}
                <span className="truncate font-medium">{n.name}</span>
              </button>
              <span className="tabular-nums">{formatEur(t.estimate)}</span>
              <span className="tabular-nums" style={{ color: "hsl(24 95% 50%)" }}>{formatEur(t.offers)}</span>
              <span className="tabular-nums">{formatEur(t.invoices)}</span>
              <span className="text-xs" style={{ color: "hsl(var(--ink-soft))" }}>
                {formatPct(cO.pct)} / {formatPct(cI.pct)}
              </span>
              <button onClick={() => onSelect(n.id)}
                className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
                title={n.type === "overview" ? "Übersicht öffnen" : "Aktion öffnen"}>
                <ArrowRight size={14} style={{ color: "hsl(var(--ink-soft))" }} />
              </button>
            </div>
            {isOpen && kids.length > 0 && (
              <div className="pl-6 border-b" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}>
                <ChildList projectId={projectId} state={state} nodes={kids} onSelect={onSelect} deep />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
