/**
 * Zentrale Finanzen-Oberfläche (projektbezogen).
 *
 * Wird im Reiter „Finanzen“ der Projektstartseite angezeigt und verwendet
 * ausschließlich den bestehenden financeStore – es gibt keine zweite
 * Datenhaltung. Angebote, Rechnungen und Nachträge können nur noch als
 * erhaltene Belege erfasst werden; ein Erzeugen eigener Dokumente entfällt.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { exportElementToA4Pdf } from "@/lib/financePdfExport";
import {
  financeStore, childrenOf, positionsOf, nodeTotals, projectTotals, actionTotals,
  control, formatEur, formatPct, positionTotals,
  type FinanceNode, type FinanceState, type FinanceTotals, type FinancePosition,
  type FinancePositionType,
} from "@/lib/financeStore";
import { FinanceSummaryCard } from "@/components/finance/FinanceSummaryCard";
import { FinancePositionsTable } from "@/components/finance/FinancePositionsTable";
import {
  Plus, PanelLeftClose, PanelLeftOpen, ChevronRight, ChevronDown,
  Folder, Building2, ArrowRight, ToggleLeft, ToggleRight, Home, Trash2, Search, X,
  MoreVertical, Copy, Pencil, FileDown, ListTree,
} from "lucide-react";

/** Filterbare Positionsarten (mehrfach kombinierbar). */
type FilterKey = "offer" | "invoice" | "plus" | "minus";
const FILTER_CHIPS: [FilterKey, string][] = [
  ["offer", "Angebots-Nr."],
  ["invoice", "Rechnungs-Nr."],
  ["plus", "Mehrnachträge"],
  ["minus", "Mindernachträge"],
];
const FILTER_LABEL: Record<FilterKey, string> = {
  offer: "Angebot",
  invoice: "Rechnung",
  plus: "Mehrnachtrag",
  minus: "Mindernachtrag",
};
const keyOf = (p: { type: string; supplementKind?: string }): FilterKey =>
  p.type === "supplement" ? ((p.supplementKind ?? "plus") as FilterKey) : (p.type as FilterKey);

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

export function FinanceWorkspace({ projectId, projectName }: { projectId: string; projectName?: string }) {
  const state = useFinance(projectId);
  const pid = projectId;

  /** null = Projektknoten. Beim Projektwechsel immer zurücksetzen. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [leftOpen, setLeftOpen] = useState(true);
  /** Struktur als seitliches Panel auf Tablet und Handy. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => {
    setSelectedId(null);
    setExpanded({});
    setMobileNavOpen(false);
  }, [projectId]);

  const selected = useMemo(
    () => (selectedId ? state.nodes.find((n) => n.id === selectedId) ?? null : null),
    [state.nodes, selectedId],
  );

  /* ---- Filter (Strukturspalte, Treffer im obersten Projektordner) ---- */
  const [filterQuery, setFilterQuery] = useState("");
  const [filterTypes, setFilterTypes] = useState<FilterKey[]>([]);
  const filterActive = filterQuery.trim() !== "" || filterTypes.length > 0;
  useEffect(() => { if (filterActive) setSelectedId(null); }, [filterActive, filterQuery, filterTypes]);

  const filterHits = useMemo(() => {
    if (!filterActive) return [];
    const q = filterQuery.trim().toLowerCase();
    const nodeById = new Map(state.nodes.map((n) => [n.id, n]));
    const pathOf = (nodeId: string): string => {
      const parts: string[] = [];
      let cur = nodeById.get(nodeId);
      while (cur) { parts.unshift(cur.name); cur = cur.parentId ? nodeById.get(cur.parentId) : undefined; }
      return parts.join(" › ");
    };
    const hits: { pos: typeof state.positions[number]; label: string; path: string; nodeId: string }[] = [];
    for (const node of state.nodes) {
      const counters: Record<string, number> = {};
      for (const p of positionsOf(state, node.id)) {
        const k = keyOf(p);
        counters[k] = (counters[k] ?? 0) + 1;
        const label = `${FILTER_LABEL[k]} ${String(counters[k]).padStart(2, "0")}`;
        if (filterTypes.length > 0 && !filterTypes.includes(k)) continue;
        if (q) {
          const hay = [label, p.number, p.note, node.name, node.note].join(" ").toLowerCase();
          if (!hay.includes(q)) continue;
        }
        hits.push({ pos: p, label, path: pathOf(node.id), nodeId: node.id });
      }
    }
    return hits;
  }, [state, filterActive, filterQuery, filterTypes]);

  /* ---- PDF-Export des Detailbereichs (DIN A4) ---- */
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    const el = exportRef.current;
    if (!el || exporting) return;
    setExporting(true);
    el.classList.add("finance-exporting");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const title = selected?.name ?? projectName ?? "Finanzen";
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
    let parent: string | null = null;
    if (selected) parent = selected.type === "overview" ? selected.id : selected.parentId;
    const node = financeStore.addNode(pid, type, parent);
    if (parent) setExpanded((e) => ({ ...e, [parent!]: true }));
    setSelectedId(node.id);
    setMobileNavOpen(false);
  };

  const openNode = (id: string | null) => { setSelectedId(id); setMobileNavOpen(false); };

  const renderTree = (parentId: string | null, depth: number): React.ReactNode =>
    childrenOf(state, parentId).map((n) => {
      const kids = childrenOf(state, n.id);
      const open = expanded[n.id] ?? true;
      const active = selectedId === n.id;
      return (
        <div key={n.id}>
          <div
            onClick={() => openNode(n.id)}
            className="group flex items-center gap-1 px-2 py-2 rounded-md cursor-pointer text-[13px] min-h-[44px]"
            style={{
              paddingLeft: 8 + depth * 14,
              background: active ? "hsl(var(--surface-muted))" : undefined,
              opacity: n.enabled ? 1 : 0.45,
            }}
          >
            {kids.length > 0 ? (
              <button onClick={(e) => { e.stopPropagation(); toggleExpand(n.id); }}
                className="h-8 w-8 -ml-1 flex items-center justify-center shrink-0">
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span className="h-8 w-8 -ml-1 shrink-0" />}
            {n.type === "overview"
              ? <Folder size={14} style={{ color: "hsl(var(--accent-gold))" }} />
              : <Building2 size={14} style={{ color: "hsl(var(--ink-soft))" }} />}
            <span className="truncate flex-1">{n.name}</span>
            <NodeMenu
              projectId={pid}
              node={n}
              compact
              onDeleted={() => setSelectedId((cur) => (cur === n.id ? null : cur))}
              onDuplicated={(id) => openNode(id)}
            />
          </div>
          {open && kids.length > 0 && renderTree(n.id, depth + 1)}
        </div>
      );
    });

  /** Strukturspalte – auf großen Bildschirmen fest, sonst als Panel. */
  const structure = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden"
         style={{ background: "hsl(var(--surface-card))" }}>
      <div className="flex items-center gap-1 px-3 py-2 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="text-[11px] font-semibold uppercase tracking-wider flex-1"
             style={{ color: "hsl(var(--ink-soft))" }}>Struktur</div>
        <button onClick={() => { setLeftOpen(false); setMobileNavOpen(false); }}
          className="h-11 w-11 rounded flex items-center justify-center hover:bg-muted" title="Struktur einklappen">
          <PanelLeftClose size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        <button onClick={() => addNode("overview")}
          className="w-full h-12 rounded-lg border-2 text-sm font-semibold flex items-center justify-center gap-2"
          style={{
            borderColor: "hsl(var(--accent-gold))",
            background: "hsl(var(--accent-gold) / 0.12)",
            color: "hsl(var(--accent-gold))",
          }}>
          <Plus size={18} /> Ordner
        </button>
        <button onClick={() => addNode("action")}
          className="w-full h-12 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}>
          <Plus size={18} /> Anlage
        </button>
      </div>

      <div className="px-3 py-2 border-b space-y-1.5" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="flex items-center gap-1.5 h-11 rounded-md border px-2"
             style={{ borderColor: "hsl(var(--hairline))" }}>
          <Search size={13} style={{ color: "hsl(var(--ink-soft))" }} />
          <input value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Nr., Name, Notiz…"
            className="flex-1 min-w-0 bg-transparent text-[13px] outline-none" />
          {filterActive && (
            <button title="Filter zurücksetzen" className="h-9 w-9 flex items-center justify-center"
              onClick={() => { setFilterQuery(""); setFilterTypes([]); }}>
              <X size={14} style={{ color: "hsl(var(--ink-soft))" }} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTER_CHIPS.map(([key, label]) => {
            const on = filterTypes.includes(key);
            return (
              <button key={key}
                onClick={() => setFilterTypes((t) => on ? t.filter((x) => x !== key) : [...t, key])}
                className="h-9 px-3 rounded-full border text-[11px] font-medium"
                style={{
                  borderColor: on ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  background: on ? "hsl(var(--accent-gold) / 0.14)" : undefined,
                }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto py-1 px-1">
        <div onClick={() => openNode(null)}
          className="flex items-center gap-1.5 px-2 py-2 rounded-md cursor-pointer text-[13px] font-semibold min-h-[44px]"
          style={{ background: selectedId === null ? "hsl(var(--surface-muted))" : undefined }}>
          <Home size={14} style={{ color: "hsl(var(--accent-gold))" }} />
          <span className="truncate">{projectName ?? "Projekt"}</span>
        </div>
        {renderTree(null, 1)}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[60vh] w-full min-w-0 flex-col overflow-hidden rounded-xl border"
         style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-app))" }}>
      <div className="flex min-h-0 flex-1">
        {leftOpen && (
          <aside className="hidden lg:flex w-[280px] shrink-0 min-h-0 flex-col border-r overflow-hidden"
                 style={{ borderColor: "hsl(var(--hairline))" }}>
            {structure}
          </aside>
        )}

        <section className="flex-1 min-w-0 min-h-0 overflow-auto">
          {/* Tablet und Handy: große Anlege-Knöpfe über der Struktur */}
          <div className="lg:hidden grid grid-cols-2 gap-2 px-3 pt-3">
            <button onClick={() => addNode("overview")}
              className="h-12 rounded-lg border-2 text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                borderColor: "hsl(var(--accent-gold))",
                background: "hsl(var(--accent-gold) / 0.12)",
                color: "hsl(var(--accent-gold))",
              }}>
              <Plus size={18} /> Ordner
            </button>
            <button onClick={() => addNode("action")}
              className="h-12 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
              style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}>
              <Plus size={18} /> Anlage
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b"
               style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
            <button onClick={() => setMobileNavOpen((v) => !v)}
              className="lg:hidden h-11 min-w-[44px] px-3 rounded-md border flex items-center gap-1.5 text-[12px] font-medium"
              style={{ borderColor: "hsl(var(--hairline))" }}>
              <ListTree size={16} /> Struktur
            </button>
            {!leftOpen && (
              <button onClick={() => setLeftOpen(true)}
                className="hidden lg:flex h-11 w-11 rounded items-center justify-center hover:bg-muted" title="Struktur einblenden">
                <PanelLeftOpen size={16} />
              </button>
            )}
            <div className="text-[11px] font-semibold uppercase tracking-wider"
                 style={{ color: "hsl(var(--ink-soft))" }}>
              {selected ? (selected.type === "action" ? "Anlage" : "Ordner") : "Projekt"}
            </div>
            {selected && <span className="text-sm font-medium truncate max-w-[200px] sm:max-w-[280px]">{selected.name}</span>}
            {selected && (
              <NodeMenu
                projectId={pid}
                node={selected}
                onDeleted={() => setSelectedId(null)}
                onDuplicated={(id) => setSelectedId(id)}
              />
            )}
            <div className="flex-1" />
            <button onClick={handleExport} disabled={exporting}
              className="h-11 min-w-[44px] px-3 rounded-md border flex items-center gap-1.5 text-[12px] font-medium disabled:opacity-50"
              style={{ borderColor: "hsl(var(--hairline))" }} title="Als PDF (DIN A4) exportieren">
              <FileDown size={16} /> <span className="hidden sm:inline">PDF</span>
            </button>
            {selected && (
              <button
                onClick={() => {
                  if (!window.confirm(`\u201e${selected.name}\u201c wirklich löschen?`)) return;
                  financeStore.deleteNode(pid, selected.id);
                  setSelectedId(null);
                }}
                className="h-11 min-w-[44px] px-3 rounded-md border flex items-center gap-1.5 text-[12px] font-medium"
                style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--destructive))" }}
                title="Auswahl löschen">
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {/* Struktur klappt unterhalb des Kopfes auf (Tablet und Handy) */}
          {mobileNavOpen && (
            <div className="lg:hidden border-b max-h-[70vh] overflow-auto"
                 style={{ borderColor: "hsl(var(--hairline))" }}>
              {structure}
            </div>
          )}

          <div ref={exportRef} className="p-3 sm:p-4 space-y-4" style={{ background: "hsl(var(--surface-app))" }}>
            {filterActive && (
              <FilterResults hits={filterHits} onOpen={(id) => { setFilterQuery(""); setFilterTypes([]); setSelectedId(id); }} />
            )}
            {!selected && !filterActive && (
              <ProjectView projectId={pid} state={state} projectName={projectName ?? "Projekt"}
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
      </div>

      {/* Struktur als seitliches Panel auf Tablet und Handy */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <div className="relative h-full w-[86vw] max-w-[340px] shadow-xl">
            {structure}
          </div>
        </div>
      )}
    </div>
  );
}


/* -------------------------------------------------- Drei-Punkte-Menü (Knoten) */

const NodeMenu: React.FC<{
  projectId: string;
  node: FinanceNode;
  compact?: boolean;
  onDeleted: () => void;
  onDuplicated: (id: string) => void;
}> = ({ projectId, node, compact, onDeleted, onDuplicated }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const label = node.type === "overview" ? "Ordner" : "Anlage";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const item = (icon: React.ReactNode, text: string, run: () => void, danger?: boolean) => (
    <button
      onClick={(e) => { e.stopPropagation(); setOpen(false); run(); }}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[12px] rounded-md hover:bg-muted text-left"
      style={danger ? { color: "hsl(var(--destructive))" } : undefined}>
      {icon}{text}
    </button>
  );

  return (
    <div ref={ref} className="relative shrink-0" data-export-hide>
      <button
        title={`${label} verwalten`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`h-6 w-6 rounded flex items-center justify-center hover:bg-muted ${compact ? "opacity-50 group-hover:opacity-100" : "opacity-60 hover:opacity-100"}`}
        style={{ color: "hsl(var(--ink-soft))" }}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 min-w-[180px] rounded-lg border p-1 shadow-lg"
             style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
          {item(<Pencil size={13} />, `${label} umbenennen`, () => {
            const name = window.prompt(`${label} umbenennen`, node.name);
            if (name && name.trim()) financeStore.updateNode(projectId, node.id, { name: name.trim() });
          })}
          {item(<Copy size={13} />, `${label} duplizieren`, () => {
            const copy = financeStore.duplicateNode(projectId, node.id);
            if (copy) onDuplicated(copy.id);
          })}
          {item(<Trash2 size={13} />, `${label} löschen`, () => {
            if (!window.confirm(`\u201e${node.name}\u201c wirklich löschen?`)) return;
            financeStore.deleteNode(projectId, node.id);
            onDeleted();
          }, true)}
        </div>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------- Aktion */

const ActionView: React.FC<{ projectId: string; state: FinanceState; node: FinanceNode }> =
({ projectId, state, node }) => {
  const totals = actionTotals(state, node);
  const positions = positionsOf(state, node.id);
  const invoiceDetails = positions.filter((p) => p.type === "invoice" || p.type === "supplement");
  const isInvoiceLike = (p: FinancePosition) => p.type === "invoice" || p.type === "supplement";
  const archived = positions.filter((p) => !p.hasTemplate);
  const created = positions.filter((p) => p.hasTemplate);
  const archivedInvoices = archived.filter(isInvoiceLike);
  const createdInvoices = created.filter(isInvoiceLike);

  const hasSplit = archived.length > 0 || created.length > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <input value={node.name}
          onChange={(e) => financeStore.updateNode(projectId, node.id, { name: e.target.value })}
          placeholder="Name der Aktion / des Unternehmens"
          className="w-full bg-transparent text-xl font-semibold outline-none" />
        <textarea value={node.note} rows={2}
          onChange={(e) => financeStore.updateNode(projectId, node.id, { note: e.target.value })}
          placeholder="Notiz..."
          className="w-full bg-transparent text-sm outline-none resize-y border rounded-lg px-3 py-1.5"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }} />
      </div>

      {/* Übersichten ganz oben – getrennt nach erhaltenen und angelegten Belegen. */}
      {!hasSplit && (
        <FinanceSummaryCard
          totals={totals}
          subtitle={node.name}
          invoiceDetails={invoiceDetails}
          onEstimateChange={(v) => financeStore.updateNode(projectId, node.id, { estimate: v })}
        />
      )}

      {hasSplit && (
        <div className="space-y-2">
          <EstimateRow value={node.estimate || 0}
            onChange={(v) => financeStore.updateNode(projectId, node.id, { estimate: v })} />
          {archived.length > 0 && (
            <FinanceSummaryCard totals={positionTotals(archived)} hideEstimate
              title="Erhaltene Belege" subtitle={node.name}
              invoiceDetails={archivedInvoices} background={ARCHIVE_BG} />
          )}
          {created.length > 0 && (
            <FinanceSummaryCard totals={positionTotals(created)} hideEstimate
              title="Angelegte Belege" subtitle={node.name}
              invoiceDetails={createdInvoices} background={CREATED_BG} />
          )}
        </div>
      )}

      {/* Erhalten = bestehende Belege erfassen; darunter das Anlegen neuer Belege */}
      <div className="space-y-1.5" data-export-hide>
        <div className="flex flex-wrap gap-1.5">
          {([["offer", "Angebot"], ["invoice", "Rechnung"], ["supplement", "Nachtrag"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => financeStore.addPosition(projectId, node.id, t)}
              className="h-9 px-3 rounded-lg border-2 text-[13px] font-semibold flex items-center gap-1.5 hover:bg-muted"
              style={{ borderColor: "hsl(var(--hairline))" }}>
              <Plus size={15} /> {label} erhalten
            </button>
          ))}
        </div>
      </div>


      {/* Erhaltene Belege – nur Tabelle, Übersicht steht oben */}
      {archived.length > 0 && (
        <div className="space-y-1.5 rounded-xl p-2.5" style={{ background: ARCHIVE_BG }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider"
               style={{ color: "hsl(var(--ink-soft))" }}>Erhaltene Belege</div>
          <FinancePositionsTable projectId={projectId} nodeId={node.id} positions={archived}
            emptyHint="Noch keine erhaltenen Belege." />
        </div>
      )}

      {/* Angelegte Belege (Vorlagen in der Projektmappe) */}
      {created.length > 0 && (
        <div className="space-y-1.5 rounded-xl p-2.5" style={{ background: CREATED_BG }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider"
               style={{ color: "hsl(var(--ink-soft))" }}>Angelegte Belege</div>
          <FinancePositionsTable projectId={projectId} nodeId={node.id} positions={created}
            background="hsl(var(--surface-card))"
            emptyHint="Noch keine angelegten Belege." />
        </div>
      )}

      {positions.length === 0 && (
        <FinancePositionsTable projectId={projectId} nodeId={node.id} positions={[]} />
      )}
    </div>
  );
};

/** Kompakte Zeile zur Pflege der Kostenschätzung (wenn die Übersicht geteilt ist). */
const EstimateRow: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]"
         style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
      <span className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "hsl(var(--ink-soft))" }}>Kostenschätzung</span>
      {draft === null ? (
        <button className="font-semibold" onClick={() => setDraft(String(value || ""))}>
          {formatEur(value)}
        </button>
      ) : (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onChange(parseEurLocal(draft)); setDraft(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onChange(parseEurLocal(draft)); setDraft(null); }
            if (e.key === "Escape") setDraft(null);
          }}
          className="bg-transparent border rounded px-2 py-0.5 font-semibold outline-none"
          style={{ borderColor: "hsl(var(--hairline))" }} />
      )}
    </div>
  );
};

const parseEurLocal = (v: string): number => {
  const n = parseFloat(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Hintergründe zur Unterscheidung erhaltener und angelegter Belege. */
const ARCHIVE_BG = "hsl(var(--surface-muted))";
const CREATED_BG = "hsl(var(--accent-gold) / 0.10)";

/* --------------------------------------------------------------- Übersicht */

/** Sammelt alle Positionen unterhalb eines Knotens (aktive Zweige, rekursiv). */
function collectPositions(state: FinanceState, parentId: string | null): FinancePosition[] {
  const out: FinancePosition[] = [];
  const walk = (id: string | null) => {
    for (const kid of childrenOf(state, id)) {
      if (!kid.enabled) continue;
      if (kid.type === "action") out.push(...positionsOf(state, kid.id));
      else walk(kid.id);
    }
  };
  walk(parentId);
  return out;
}

/** Getrennte Übersichten für erhaltene und angelegte Belege. */
const SplitSummaries: React.FC<{
  state: FinanceState; parentId: string | null; subtitle: string;
  estimate: number; onEstimateChange: (v: number) => void; fallback: FinanceTotals;
}> = ({ state, parentId, subtitle, estimate, onEstimateChange, fallback }) => {
  const all = collectPositions(state, parentId);
  const archived = all.filter((p) => !p.hasTemplate);
  const created = all.filter((p) => p.hasTemplate);
  const isInvoiceLike = (p: FinancePosition) => p.type === "invoice" || p.type === "supplement";

  if (archived.length === 0 && created.length === 0) {
    return <FinanceSummaryCard totals={fallback} subtitle={subtitle} onEstimateChange={onEstimateChange} />;
  }
  return (
    <div className="space-y-2">
      <EstimateRow value={estimate} onChange={onEstimateChange} />
      {archived.length > 0 && (
        <FinanceSummaryCard totals={positionTotals(archived)} hideEstimate
          title="Erhaltene Belege" subtitle={subtitle}
          invoiceDetails={archived.filter(isInvoiceLike)} background={ARCHIVE_BG} />
      )}
      {created.length > 0 && (
        <FinanceSummaryCard totals={positionTotals(created)} hideEstimate
          title="Angelegte Belege" subtitle={subtitle}
          invoiceDetails={created.filter(isInvoiceLike)} background={CREATED_BG} />
      )}
    </div>
  );
};

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

      <SplitSummaries state={state} parentId={node.id} subtitle={node.name}
        estimate={totals.estimate} fallback={totals}
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

      <SplitSummaries state={state} parentId={null} subtitle="Gesamtes Projekt"
        estimate={totals.estimate} fallback={totals}
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
        Noch keine Einträge. Lege links „+ Ordner" oder „+ Anlegen" an.
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
        // Anlagen (Aktionen) lassen sich ebenfalls aufklappen — dort erscheinen
        // die Belege getrennt nach „erhalten" und „angelegt".
        const nodePositions = n.type === "action" ? positionsOf(state, n.id) : [];
        const canExpand = kids.length > 0 || nodePositions.length > 0;
        const isOpen = !!open[n.id];
        return (
          <div key={n.id} {...(n.enabled ? {} : { "data-export-hide": true })}>
            <div className="grid items-center px-3 py-2 border-b text-sm"
                 style={{ gridTemplateColumns: "28px 1.6fr 1fr 1fr 1fr 1.2fr 32px", borderColor: "hsl(var(--hairline))", opacity: n.enabled ? 1 : 0.45 }}>
              <button data-export-hide title={n.enabled ? "Wird berücksichtigt" : "Wird nicht berücksichtigt"}
                onClick={() => financeStore.updateNode(projectId, n.id, { enabled: !n.enabled })}>
                {n.enabled ? <ToggleRight size={16} style={{ color: "hsl(var(--accent-gold))" }} /> : <ToggleLeft size={16} />}
              </button>
              <button
                className="flex items-center gap-1.5 min-w-0 text-left"
                title={canExpand ? "Unterpunkte ein-/ausklappen" : "Öffnen"}
                onClick={() => canExpand
                  ? setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))
                  : onSelect(n.id)}>
                {canExpand
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
              <button data-export-hide onClick={() => onSelect(n.id)}
                className="h-7 w-7 rounded-md border-2 flex items-center justify-center"
                style={{ borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.14)" }}
                title={n.type === "overview" ? "Übersicht öffnen" : "Aktion öffnen (bearbeiten)"}>
                <ArrowRight size={14} style={{ color: "hsl(var(--accent-gold))" }} />
              </button>

            </div>
            {isOpen && kids.length > 0 && (
              <div className="pl-6 border-b" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}>
                <ChildList projectId={projectId} state={state} nodes={kids} onSelect={onSelect} deep />
              </div>
            )}
            {isOpen && nodePositions.length > 0 && (
              <div className="pl-6 pr-3 py-2 border-b space-y-2"
                   style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}>
                <PositionMiniList title="Erhaltene Belege" background={ARCHIVE_BG}
                  positions={nodePositions.filter((p) => !p.hasTemplate)} />
                <PositionMiniList title="Angelegte Belege" background={CREATED_BG}
                  positions={nodePositions.filter((p) => !!p.hasTemplate)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Kompakte, schreibgeschützte Belegliste beim Aufklappen einer Anlage. */
const POSITION_KIND_LABEL: Record<FinancePositionType, string> = {
  offer: "Angebot",
  invoice: "Rechnung",
  supplement: "Nachtrag",
};

const PositionMiniList: React.FC<{
  title: string; background: string; positions: FinancePosition[];
}> = ({ title, background, positions }) => {
  if (positions.length === 0) return null;
  const sum = positions.reduce(
    (s, p) => s + (p.type === "supplement" && p.supplementKind === "minus" ? -(p.amount || 0) : (p.amount || 0)),
    0,
  );
  return (
    <div className="rounded-lg px-2.5 py-2 space-y-1" style={{ background }}>
      <div className="flex items-center gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider flex-1"
             style={{ color: "hsl(var(--ink-soft))" }}>{title}</div>
        <div className="text-[11px] font-semibold tabular-nums">{formatEur(sum)}</div>
      </div>
      {positions.map((p) => (
        <div key={p.id} className="grid items-center gap-2 text-[11px]"
             style={{ gridTemplateColumns: "1.1fr 1fr 0.9fr 1fr" }}>
          <span>{POSITION_KIND_LABEL[p.type]}{p.type === "supplement" && p.supplementKind === "minus" ? " (−)" : ""}</span>
          <span className="truncate" style={{ color: "hsl(var(--ink-soft))" }}>{p.number || "—"}</span>
          <span style={{ color: "hsl(var(--ink-soft))" }}>{p.date || ""}</span>
          <span className="tabular-nums text-right font-medium">{formatEur(p.amount || 0)}</span>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------- Filter-Trefferliste */

const FilterResults: React.FC<{
  hits: { pos: FinancePosition; label: string; path: string; nodeId: string }[];
  onOpen: (nodeId: string) => void;
}> = ({ hits, onOpen }) => {
  const sum = hits.reduce(
    (s, h) => s + (h.pos.type === "supplement" && h.pos.supplementKind === "minus" ? -(h.pos.amount || 0) : (h.pos.amount || 0)),
    0,
  );
  return (
    <div className="rounded-xl border overflow-hidden"
         style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="text-sm font-semibold flex-1">Filterergebnis</div>
        <div className="text-xs" style={{ color: "hsl(var(--ink-soft))" }}>
          {hits.length} {hits.length === 1 ? "Position" : "Positionen"} · {formatEur(sum)}
        </div>
      </div>

      <div className="grid items-center px-3 py-2 border-b text-[11px] font-semibold uppercase tracking-wider"
           style={{ gridTemplateColumns: "1.2fr 1.6fr 1fr 1.2fr 1fr 32px", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
        <span>Typ</span><span>Ordner</span><span>Datum</span><span>Nummer</span><span>Betrag</span><span />
      </div>

      {hits.length === 0 ? (
        <div className="px-4 py-6 text-xs" style={{ color: "hsl(var(--ink-soft))" }}>
          Keine Positionen gefunden.
        </div>
      ) : hits.map((h) => {
        const isMinus = h.pos.type === "supplement" && h.pos.supplementKind === "minus";
        const isPlus = h.pos.type === "supplement" && h.pos.supplementKind === "plus";
        return (
          <div key={h.pos.id} className="grid items-center px-3 py-2 border-b text-sm"
               style={{ gridTemplateColumns: "1.2fr 1.6fr 1fr 1.2fr 1fr 32px", borderColor: "hsl(var(--hairline))" }}>
            <span className="font-medium truncate">{h.label}</span>
            <span className="truncate text-xs" style={{ color: "hsl(var(--ink-soft))" }}>{h.path}</span>
            <span className="text-xs" style={{ color: "hsl(var(--ink-soft))" }}>{h.pos.date}</span>
            <span className="text-xs truncate" style={{ color: "hsl(var(--ink-soft))" }}>{h.pos.number}</span>
            <span className="tabular-nums font-medium"
                  style={{ color: isPlus ? "hsl(24 95% 50%)" : isMinus ? "hsl(142 70% 34%)" : undefined }}>
              {isMinus ? "−" : ""}{formatEur(h.pos.amount)}
            </span>
            <button data-export-hide onClick={() => onOpen(h.nodeId)}
              className="h-7 w-7 rounded-md border-2 flex items-center justify-center"
              style={{ borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--accent-gold) / 0.14)" }}
              title="Aktion öffnen (bearbeiten)">
              <ArrowRight size={14} style={{ color: "hsl(var(--accent-gold))" }} />
            </button>

          </div>
        );
      })}
    </div>
  );
};
