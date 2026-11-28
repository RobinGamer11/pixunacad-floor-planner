import "./financeWorkspace.css";
import { FinanceBudgetOverview } from "./FinanceBudgetOverview";
import { Button } from "@/components/ui/button";
import { useProjectReadOnly } from "@/lib/projectAccess";
/**
 * Überarbeitete Finanzen-Oberfläche (projektbezogen).
 * Unterstützt Auftraggeber- und Auftragnehmer-Perspektive auf derselben Datengrundlage
 * (financeStore + homeProjectSync), ohne Doppelzählung und responsiv für Desktop, Tablet und Handy.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Folder, Home, FileDown,
  ChevronRight, Trash2, Search, X, AlertTriangle, Layers,
} from "lucide-react";
import {
  financeStore,
  type FinanceDirection, type FinanceNode, type FinancePerspective, type FinanceState, type TaxBasis,
} from "@/lib/financeStore";
import {
  collectEnabledActionNodes, computeProcessSummary, computeScopeSummary, formatMoney,
} from "@/lib/financeMath";
import { exportFinanceReportPdf } from "@/lib/financePdfExport";
import { FinanceBudgetModal } from "./FinanceBudgetModal";
import { FinanceComparisonCards, type ComparisonFilter } from "./FinanceComparisonCards";
import { FinanceProcessDetail } from "./FinanceProcessDetail";

type FinanceTab = "overview" | "primary" | "secondary";

function useFinance(projectId?: string): FinanceState {
  const [state, setState] = useState<FinanceState>(() =>
    projectId ? financeStore.get(projectId) : { nodes: [], positions: [], projectEstimate: 0, projectNote: "" },
  );
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
  const readOnly = useProjectReadOnly(projectId);
  const perspective: FinancePerspective = state.perspective ?? "client";
  const taxDisplay: TaxBasis = state.taxDisplay ?? "gross";
  const currency = state.currency || "EUR";
  const fmt = (v: number) => formatMoney(v, currency);

  const [scopeId, setScopeId] = useState<string | null>(null);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [listFilter, setListFilter] = useState<ComparisonFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileAreasOpen, setMobileAreasOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [budgetModal, setBudgetModal] = useState<{ open: boolean; kind: "project" | "cost" }>({
    open: false,
    kind: "project",
  });

  useEffect(() => {
    setScopeId(null);
    setActiveProcessId(null);
    setTab("overview");
    setListFilter("all");
    setQuery("");
  }, [projectId]);

  const summary = useMemo(
    () => computeScopeSummary(state, scopeId, taxDisplay),
    [state, scopeId, taxDisplay],
  );

  const activeProcess = useMemo(
    () => (activeProcessId ? state.nodes.find((n) => n.id === activeProcessId && n.type === "action") ?? null : null),
    [state.nodes, activeProcessId],
  );

  const areaNodes = useMemo(
    () => state.nodes.filter((n) => n.type === "overview").sort((a, b) => a.order - b.order),
    [state.nodes],
  );

  const scopedProcesses = useMemo(() => {
    const list = collectEnabledActionNodes(state, scopeId);
    const q = query.trim().toLowerCase();
    return list
      .map((node) => ({ node, summary: computeProcessSummary(state, node, taxDisplay) }))
      .filter(({ node, summary: p }) => {
        if (tab === "primary") {
          if (perspective === "client" && p.direction !== "expense") return false;
          if (perspective === "contractor" && p.direction !== "income") return false;
        } else if (tab === "secondary") {
          if (perspective === "client" && p.direction !== "expense") return false;
          if (perspective === "contractor" && p.direction !== "expense") return false;
        }
        if (listFilter === "expenses" && p.direction !== "expense") return false;
        if (listFilter === "incomes" && p.direction !== "income") return false;
        if (listFilter === "open_invoices" && p.openInvoiceAmount <= 0) return false;
        if (listFilter === "unbilled_orders" && p.remainingOrderAmount <= 0) return false;
        if (q) {
          const hay = [node.name, node.partner ?? "", node.note].join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [state, scopeId, taxDisplay, tab, perspective, listFilter, query]);

  const handleCreateProcess = (direction?: FinanceDirection) => {
    const dir: FinanceDirection = direction ?? (
      tab === "secondary"
        ? "expense"
        : (perspective === "contractor" ? "income" : "expense")
    );
    const node = financeStore.addNode(projectId, "action", scopeId, {
      name: dir === "income" ? "Neuer Einnahmen-Vorgang" : "Neuer Ausgaben-Vorgang",
      direction: dir,
    });
    setActiveProcessId(node.id);
  };

  const handleCreateArea = () => {
    const area = financeStore.addNode(projectId, "overview", null, { name: "Neuer Bereich" });
    setScopeId(area.id);
    setActiveProcessId(null);
    setMobileAreasOpen(false);
  };

  const handleFilterJump = (filter: ComparisonFilter) => {
    setListFilter(filter);
    if (filter === "incomes") {
      setTab(perspective === "client" ? "secondary" : "primary");
    } else if (filter === "expenses") {
      setTab(perspective === "client" ? "primary" : "secondary");
    } else {
      setTab("primary");
    }
    setActiveProcessId(null);
  };

  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportFinanceReportPdf(state, scopeId, projectName ?? "Projekt");
    } finally {
      setExporting(false);
    }
  };

  const tabLabels: Record<FinanceTab, string> = perspective === "client"
    ? { overview: "Überblick", primary: "Aufträge & Kosten", secondary: "Zahlungen" }
    : { overview: "Überblick", primary: "Kundenaufträge & Einnahmen", secondary: "Eigene Kosten & Zahlungen" };

  const renderAreaList = (onPick?: () => void) => (
    <div className="space-y-1">
      <Button variant="ghost"
        type="button"
        onClick={() => { setScopeId(null); setActiveProcessId(null); onPick?.(); }}
        className="w-full min-h-[42px] px-3 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors text-left"
        style={{
          background: scopeId === null ? "hsl(var(--accent-gold) / 0.14)" : "transparent",
          color: scopeId === null ? "hsl(var(--accent-gold))" : undefined,
        }}
      >
        <Home size={15} />
        <span className="truncate">Gesamtes Projekt</span>
      </Button>
      {areaNodes.map((area) => {
        const active = scopeId === area.id;
        return (
          <div key={area.id} className="group flex items-center gap-1">
            <Button variant="ghost"
              type="button"
              onClick={() => { setScopeId(area.id); setActiveProcessId(null); onPick?.(); }}
              className="flex-1 min-w-0 min-h-[42px] px-3 rounded-lg flex items-center gap-2 text-sm transition-colors text-left"
              style={{
                background: active ? "hsl(var(--accent-gold) / 0.14)" : "transparent",
                color: active ? "hsl(var(--accent-gold))" : undefined,
              }}
            >
              <Folder size={15} className="shrink-0" />
              <span className="truncate">{area.name}</span>
            </Button>
            <Button variant="ghost"
              type="button"
              aria-label="Bereich löschen"
              onClick={() => {
                if (scopeId === area.id) setScopeId(null);
                financeStore.deleteNode(projectId, area.id);
              }}
              className="h-8 w-8 rounded-lg flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-muted shrink-0"
              style={{ color: "hsl(var(--ink-soft))" }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        );
      })}
      <Button variant="ghost"
        type="button"
        onClick={handleCreateArea}
        className="w-full min-h-[42px] mt-2 px-3 rounded-lg border border-dashed text-xs font-medium flex items-center gap-1.5 hover:border-[hsl(var(--accent-gold))]"
        style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
      >
        <Plus size={14} /> Neuer Bereich
      </Button>
    </div>
  );

  return (
    <div className="finance-workspace space-y-5">
      {/* 1. Projektperspektive + Netto/Brutto + PDF */}
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>
              Projektperspektive
            </div>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: "hsl(var(--ink-soft))" }}>
              {perspective === "client"
                ? "Behalte Budget, vergebene Aufträge und Zahlungen im Blick."
                : "Vergleiche deine Aufträge und Einnahmen mit deinen Projektkosten."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border p-0.5"
              style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
            >
              {(["gross", "net"] as TaxBasis[]).map((b) => {
                const active = taxDisplay === b;
                return (
                  <Button variant="ghost"
                    key={b}
                    type="button"
                    onClick={() => financeStore.setTaxDisplay(projectId, b)}
                    className="min-h-[36px] px-3 rounded-md text-xs font-semibold transition-colors"
                    style={{
                      background: active ? "hsl(var(--accent-gold))" : "transparent",
                      color: active ? "#111" : "hsl(var(--ink-soft))",
                    }}
                  >
                    {b === "gross" ? "Brutto" : "Netto"}
                  </Button>
                );
              })}
            </div>

            <Button variant="ghost"
              type="button"
              onClick={handleExportPdf}
              disabled={exporting}
              className="min-h-[40px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:border-[hsl(var(--accent-gold))]"
              style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
            >
              <FileDown size={15} style={{ color: "hsl(var(--accent-gold))" }} />
              {exporting ? "Exportiere …" : "PDF-Bericht"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {(["client", "contractor"] as FinancePerspective[]).map((p) => {
            const active = perspective === p;
            return (
              <Button variant="ghost"
                key={p}
                type="button"
                onClick={() => { financeStore.setPerspective(projectId, p); setTab("overview"); setListFilter("all"); }}
                className="min-h-[48px] px-4 rounded-xl border text-sm sm:text-base font-semibold transition-colors"
                style={{
                  borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  background: active ? "hsl(var(--accent-gold) / 0.16)" : "hsl(var(--surface))",
                  color: active ? "hsl(var(--accent-gold))" : undefined,
                }}
              >
                {p === "client" ? "Auftraggeber" : "Auftragnehmer"}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Hinweis bei fehlenden Steuerangaben im Netto-Modus */}
      {(summary.expense.hasMissingTax || summary.income.hasMissingTax) && (
        <div
          className="rounded-xl border px-4 py-2.5 text-xs flex items-center gap-2"
          style={{ borderColor: "hsl(34 92% 52% / 0.5)", background: "hsl(34 92% 52% / 0.08)", color: "hsl(34 92% 62%)" }}
        >
          <AlertTriangle size={15} className="shrink-0" />
          Einzelne Belege enthalten keine Steuersatz-Angabe und werden mit ihrem gespeicherten Betrag ausgewiesen.
        </div>
      )}

      <FinanceBudgetOverview state={state} readOnly={readOnly} onEdit={(kind) => setBudgetModal({ open: true, kind })} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium" htmlFor={`finance-scope-${projectId}`}>Gesamtes Projekt / Bereich</label>
        <select id={`finance-scope-${projectId}`} className="h-11 min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm" value={scopeId ?? ""} onChange={(event) => { setScopeId(event.target.value || null); setActiveProcessId(null); }}>
          <option value="">Gesamtes Projekt</option>
          {areaNodes.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
        </select>
        <Button variant="outline" aria-expanded={mobileAreasOpen} onClick={() => setMobileAreasOpen((open) => !open)}><Layers /> Bereiche verwalten</Button>
      </div>
      {mobileAreasOpen && <fieldset disabled={readOnly} className="max-w-lg min-w-0 space-y-2">{renderAreaList()}</fieldset>}
      <div className="w-full min-w-0 space-y-5">
        <div className="w-full min-w-0 space-y-5">
          {activeProcess ? (
            <FinanceProcessDetail
              key={activeProcess.id}
              projectId={projectId}
              state={state}
              node={activeProcess}
              onBack={() => setActiveProcessId(null)}
            />
          ) : (
            <>
              {/* 3. Reiter + Hauptaktion */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  className="inline-flex flex-wrap rounded-xl border p-1 gap-1"
                  style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
                >
                  {(["overview", "primary", "secondary"] as FinanceTab[]).map((t) => {
                    const active = tab === t;
                    return (
                      <Button variant="ghost"
                        key={t}
                        type="button"
                        onClick={() => { setTab(t); setListFilter("all"); }}
                        className="min-h-[40px] px-3.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors"
                        style={{
                          background: active ? "hsl(var(--accent-gold))" : "transparent",
                          color: active ? "#111" : "hsl(var(--ink-soft))",
                        }}
                      >
                        {tabLabels[t]}
                      </Button>
                    );
                  })}
                </div>

                <Button variant="ghost"
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleCreateProcess()}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center gap-1.5"
                  style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
                >
                  <Plus size={16} /> Vorgang anlegen
                </Button>
              </div>

              {/* 4. Reiter-Inhalt */}
              {tab === "overview" ? (
                <div className="space-y-4">
                  <FinanceComparisonCards
                    showBudgetComparisons={false}
                    summary={summary}
                    perspective={perspective}
                    onSelectFilter={handleFilterJump}
                    onOpenBudget={(kind) => setBudgetModal({ open: true, kind })}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "hsl(var(--ink-soft))" }} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Vorgang oder Geschäftspartner suchen …"
                        className="w-full h-11 rounded-xl border pl-9 pr-8 text-sm outline-none focus:border-[hsl(var(--accent-gold))]"
                        style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
                      />
                      {query && (
                        <Button variant="ghost"
                          type="button"
                          onClick={() => setQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2"
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                    {listFilter !== "all" && (
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setListFilter("all")}
                        className="min-h-[44px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1"
                        style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}
                      >
                        Filter zurücksetzen <X size={13} />
                      </Button>
                    )}
                  </div>

                  {scopedProcesses.length === 0 ? (
                    <div
                      className="rounded-xl border p-8 text-center space-y-3"
                      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
                    >
                      <p className="text-sm" style={{ color: "hsl(var(--ink-soft))" }}>
                        Noch keine Vorgänge in diesem Bereich.
                      </p>
                      <Button variant="ghost"
                        type="button"
                        disabled={readOnly}
                  onClick={() => handleCreateProcess()}
                        className="min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
                        style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
                      >
                        <Plus size={16} /> Ersten Vorgang anlegen
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scopedProcesses.map(({ node, summary: p }) => (
                        <div
                          key={node.id}
                          onClick={() => setActiveProcessId(node.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setActiveProcessId(node.id); }}
                          className="rounded-xl border p-4 cursor-pointer transition-colors hover:border-[hsl(var(--accent-gold)/0.6)] flex flex-col md:flex-row md:items-center justify-between gap-3"
                          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-sm sm:text-base truncate">
                              {node.name}
                              {node.partner && (
                                <span className="font-normal" style={{ color: "hsl(var(--ink-soft))" }}>
                                  {" · "}{node.partner}
                                </span>
                              )}
                            </div>
                            <div className="text-xs mt-1 flex flex-wrap gap-x-4 gap-y-1" style={{ color: "hsl(var(--ink-soft))" }}>
                              <span>Beauftragt: <strong className="text-foreground">{fmt(p.orderTotal)}</strong></span>
                              <span>Berechnet: <strong className="text-foreground">{fmt(p.invoicedTotal)}</strong></span>
                              <span>{p.direction === "income" ? "Erhalten" : "Bezahlt"}: <strong className="text-foreground">{fmt(p.paidTotal)}</strong></span>
                              {p.openInvoiceAmount > 0 && (
                                <span style={{ color: p.overdueAmount > 0 ? "hsl(var(--destructive))" : "hsl(34 92% 52%)" }}>
                                  Offen: {fmt(p.openInvoiceAmount)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="finance-process-tail">
                            <span className="max-w-full break-words text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: "hsl(var(--hairline))" }}>
                              {perspective === "client" && tab === "secondary" ? `Bezahlt: ${fmt(p.paidTotal)} · Offen: ${fmt(p.openInvoiceAmount)}` : `Erwartet: ${fmt(p.expectedTotal)}`}
                            </span>
                            <ChevronRight size={18} style={{ color: "hsl(var(--ink-soft))" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <FinanceBudgetModal
        open={budgetModal.open}
        title={budgetModal.kind === "cost" ? "Kostenbudget festlegen" : "Projektbudget festlegen"}
        subtitle={
          budgetModal.kind === "cost"
            ? "Optionales Zielbudget für deine eigenen Projektkosten."
            : "Kein Budget ist ein eigener Zustand und wird nicht als 0 € gewertet."
        }
        initialAmount={budgetModal.kind === "cost" ? summary.costBudgetAmount : summary.budgetAmount}
        initialBasis={budgetModal.kind === "cost" ? summary.costBudgetBasis : summary.budgetBasis}
        currency={currency}
        onSave={(amount, basis) => { if (!readOnly) financeStore.setBudget(projectId, amount, basis, budgetModal.kind); }}
        onClose={() => setBudgetModal((m) => ({ ...m, open: false }))}
      />
    </div>
  );
}