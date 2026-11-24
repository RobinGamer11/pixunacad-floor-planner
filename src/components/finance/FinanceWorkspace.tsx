/**
 * Überarbeitete Finanzen-Oberfläche (projektbezogen).
 * Unterstützt Auftraggeber- und Auftragnehmer-Perspektive auf derselben Datengrundlage
 * (financeStore + homeProjectSync), ohne Doppelzählung und responsiv für Desktop, Tablet und Handy.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Folder, Home, FileDown, PanelLeftClose, PanelLeftOpen,
  ChevronRight, Trash2, Search, X, AlertTriangle, Layers,
} from "lucide-react";
import {
  financeStore, childrenOf,
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
  const perspective: FinancePerspective = state.perspective ?? "client";
  const taxDisplay: TaxBasis = state.taxDisplay ?? "gross";
  const currency = state.currency || "EUR";
  const fmt = (v: number) => formatMoney(v, currency);

  const [scopeId, setScopeId] = useState<string | null>(null);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [listFilter, setListFilter] = useState<ComparisonFilter>("all");
  const [query, setQuery] = useState("");
  const [areasOpen, setAreasOpen] = useState(true);
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
          if (perspective === "client" && p.direction !== "income") return false;
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
        ? (perspective === "client" ? "income" : "expense")
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
    ? { overview: "Überblick", primary: "Aufträge & Rechnungen", secondary: "Einnahmen" }
    : { overview: "Überblick", primary: "Aufträge & Einnahmen", secondary: "Kosten & Ausgaben" };

  const kpiCards = perspective === "client"
    ? [
        {
          id: "budget",
          label: "Budget",
          value: summary.budgetAmount !== null ? fmt(summary.budgetAmount) : "Noch nicht festgelegt",
          sub: summary.budgetAmount !== null
            ? `Basis: ${summary.budgetBasis === "net" ? "Netto" : "Brutto"}`
            : "Kein Budget hinterlegt",
          action: summary.budgetAmount === null ? "+ Budget festlegen" : "Budget ändern",
          onAction: () => setBudgetModal({ open: true, kind: "project" }),
          onClick: () => setBudgetModal({ open: true, kind: "project" }),
        },
        {
          id: "orders",
          label: "Aufträge vergeben",
          value: fmt(summary.expense.orderTotal),
          sub: summary.expense.remainingOrderAmount > 0
            ? `${fmt(summary.expense.remainingOrderAmount)} noch nicht abgerechnet`
            : "Bestätigte Aufträge inkl. Nachträge",
          onClick: () => handleFilterJump("unbilled_orders"),
        },
        {
          id: "invoices",
          label: "Rechnungen erhalten",
          value: fmt(summary.expense.invoicedTotal),
          sub: `${fmt(summary.expense.paidTotal)} bereits bezahlt`,
          onClick: () => handleFilterJump("expenses"),
        },
        {
          id: "open",
          label: "Noch zu bezahlen",
          value: fmt(summary.expense.openInvoiceAmount),
          sub: summary.expense.overdueAmount > 0
            ? `${fmt(summary.expense.overdueAmount)} überfällig`
            : "Offene erhaltene Rechnungen",
          tone: summary.expense.overdueAmount > 0 ? "red" : undefined,
          onClick: () => handleFilterJump("open_invoices"),
        },
      ]
    : [
        {
          id: "inc-orders",
          label: "Aufträge erhalten",
          value: fmt(summary.income.orderTotal),
          sub: summary.income.remainingOrderAmount > 0
            ? `${fmt(summary.income.remainingOrderAmount)} noch nicht abgerechnet`
            : "Bestätigte Kundenaufträge",
          onClick: () => handleFilterJump("incomes"),
        },
        {
          id: "inc-invoices",
          label: "Rechnungen gestellt",
          value: fmt(summary.income.invoicedTotal),
          sub: `${fmt(summary.income.openInvoiceAmount)} Zahlung offen`,
          onClick: () => handleFilterJump("incomes"),
        },
        {
          id: "inc-paid",
          label: "Zahlungen erhalten",
          value: fmt(summary.income.paidTotal),
          sub: "Tatsächlich eingegangenes Geld",
          onClick: () => handleFilterJump("incomes"),
        },
        {
          id: "surplus",
          label: "Voraussichtlicher Überschuss",
          value: fmt(summary.expectedSurplus),
          sub: "Projektprognose (kein steuerlicher Gewinn)",
          tone: summary.expectedSurplus < 0 ? "red" : undefined,
          onClick: () => handleFilterJump("all"),
        },
      ];

  const renderAreaList = (onPick?: () => void) => (
    <div className="space-y-1">
      <button
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
      </button>
      {areaNodes.map((area) => {
        const active = scopeId === area.id;
        return (
          <div key={area.id} className="group flex items-center gap-1">
            <button
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
            </button>
            <button
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
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={handleCreateArea}
        className="w-full min-h-[42px] mt-2 px-3 rounded-lg border border-dashed text-xs font-medium flex items-center gap-1.5 hover:border-[hsl(var(--accent-gold))]"
        style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
      >
        <Plus size={14} /> Neuer Bereich
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
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
                  <button
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
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting}
              className="min-h-[40px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 hover:border-[hsl(var(--accent-gold))]"
              style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
            >
              <FileDown size={15} style={{ color: "hsl(var(--accent-gold))" }} />
              {exporting ? "Exportiere …" : "PDF-Bericht"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {(["client", "contractor"] as FinancePerspective[]).map((p) => {
            const active = perspective === p;
            return (
              <button
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
              </button>
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

      {/* Mobile Bereichsauswahl */}
      <div className="lg:hidden flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMobileAreasOpen((v) => !v)}
          className="min-h-[44px] flex-1 px-3.5 rounded-xl border text-sm font-medium flex items-center justify-between"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
        >
          <span className="flex items-center gap-2 truncate">
            <Layers size={15} style={{ color: "hsl(var(--accent-gold))" }} />
            Bereich: {summary.scopeName}
          </span>
          <ChevronRight size={16} className={mobileAreasOpen ? "rotate-90 transition-transform" : "transition-transform"} />
        </button>
      </div>
      {mobileAreasOpen && (
        <div
          className="lg:hidden rounded-xl border p-3"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
        >
          {renderAreaList(() => setMobileAreasOpen(false))}
        </div>
      )}

      {/* Hauptlayout: Bereiche links (Desktop) + Inhalt rechts */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {areasOpen && (
          <aside
            className="hidden lg:block w-60 shrink-0 rounded-xl border p-3"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>
                Bereiche
              </span>
              <button
                type="button"
                onClick={() => setAreasOpen(false)}
                title="Bereiche einklappen"
                className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>
            {renderAreaList()}
          </aside>
        )}

        <div className="flex-1 min-w-0 w-full space-y-5">
          {!areasOpen && (
            <button
              type="button"
              onClick={() => setAreasOpen(true)}
              className="hidden lg:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border hover:border-[hsl(var(--accent-gold))]"
              style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
            >
              <PanelLeftOpen size={14} /> Bereiche anzeigen ({summary.scopeName})
            </button>
          )}

          {activeProcess ? (
            <FinanceProcessDetail
              projectId={projectId}
              state={state}
              node={activeProcess}
              onBack={() => setActiveProcessId(null)}
            />
          ) : (
            <>
              {/* 2. Vier Kennzahlenkarten */}
              <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {kpiCards.map((card) => (
                  <div
                    key={card.id}
                    onClick={card.onClick}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") card.onClick(); }}
                    className="rounded-xl border p-4 cursor-pointer transition-colors hover:border-[hsl(var(--accent-gold)/0.6)] flex flex-col justify-between gap-2"
                    style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
                  >
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>
                        {card.label}
                      </div>
                      <div
                        className="text-lg sm:text-xl font-bold mt-1.5 break-words"
                        style={{ color: card.tone === "red" ? "hsl(var(--destructive))" : undefined }}
                      >
                        {card.value}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "hsl(var(--ink-soft))" }}>
                        {card.sub}
                      </div>
                    </div>
                    {card.action && card.onAction && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); card.onAction!(); }}
                        className="mt-1 min-h-[38px] px-3 rounded-lg text-xs font-semibold self-start"
                        style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
                      >
                        {card.action}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 3. Reiter + Hauptaktion */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  className="inline-flex flex-wrap rounded-xl border p-1 gap-1"
                  style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
                >
                  {(["overview", "primary", "secondary"] as FinanceTab[]).map((t) => {
                    const active = tab === t;
                    return (
                      <button
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
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => handleCreateProcess()}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center gap-1.5"
                  style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
                >
                  <Plus size={16} /> Vorgang anlegen
                </button>
              </div>

              {/* 4. Reiter-Inhalt */}
              {tab === "overview" ? (
                <div className="space-y-4">
                  <FinanceComparisonCards
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
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {listFilter !== "all" && (
                      <button
                        type="button"
                        onClick={() => setListFilter("all")}
                        className="min-h-[44px] px-3 rounded-xl border text-xs font-medium flex items-center gap-1"
                        style={{ borderColor: "hsl(var(--accent-gold))", color: "hsl(var(--accent-gold))" }}
                      >
                        Filter zurücksetzen <X size={13} />
                      </button>
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
                      <button
                        type="button"
                        onClick={() => handleCreateProcess()}
                        className="min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
                        style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
                      >
                        <Plus size={16} /> Ersten Vorgang anlegen
                      </button>
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
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: "hsl(var(--hairline))" }}>
                              Erwartet: {fmt(p.expectedTotal)}
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
        onSave={(amount, basis) => financeStore.setBudget(projectId, amount, basis, budgetModal.kind)}
        onClose={() => setBudgetModal((m) => ({ ...m, open: false }))}
      />
    </div>
  );
}