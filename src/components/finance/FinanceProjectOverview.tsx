import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, ChevronDown, ChevronRight, Folder, Home } from "lucide-react";
import {
  financeStore, childrenOf, nodeTotals, projectTotals, control, positionsOf, positionTotals,
  formatEur, formatPct,
  type FinanceState, type FinanceNode, type FinancePosition,
} from "@/lib/financeStore";
import { FinanceSummaryCard } from "@/components/finance/FinanceSummaryCard";

/** Hintergründe wie in der Finanzen-Oberfläche. */
const ARCHIVE_BG = "hsl(var(--surface-muted))";
const CREATED_BG = "hsl(var(--accent-gold) / 0.10)";

/** Sammelt alle Positionen aktiver Zweige unterhalb eines Knotens. */
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

/**
 * Read-only Gesamtübersicht der Finanzen eines Projekts für die Startseite.
 * Zeigt – wie in der Finanzen-Oberfläche – archivierte und angelegte Belege getrennt.
 */
export function FinanceProjectOverview({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<FinanceState>(() => financeStore.get(projectId));
  useEffect(() => {
    setState(financeStore.get(projectId));
    const unsub = financeStore.subscribe(() => setState(financeStore.get(projectId)));
    return () => { unsub(); };
  }, [projectId]);

  const totals = projectTotals(state);
  const roots = childrenOf(state, null);
  const all = collectPositions(state, null);
  const archived = all.filter((p) => !p.hasTemplate);
  const created = all.filter((p) => p.hasTemplate);
  const isInvoiceLike = (p: FinancePosition) => p.type === "invoice" || p.type === "supplement";

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <Home size={15} style={{ color: "hsl(var(--accent-gold))" }} />
        <div className="text-lg font-semibold">{projectName}</div>
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/project/${projectId}/finance`)}
          className="h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 hover:bg-muted"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          Finanzen öffnen <ArrowRight size={13} />
        </button>
      </div>

      <FinanceSummaryCard totals={totals} subtitle="Gesamtes Projekt" />

      {archived.length > 0 && (
        <FinanceSummaryCard
          totals={positionTotals(archived)}
          hideEstimate
          title="Archivierte Belege"
          subtitle={projectName}
          invoiceDetails={archived.filter(isInvoiceLike)}
          background={ARCHIVE_BG}
        />
      )}
      {created.length > 0 && (
        <FinanceSummaryCard
          totals={positionTotals(created)}
          hideEstimate
          title="Angelegte Belege"
          subtitle={projectName}
          invoiceDetails={created.filter(isInvoiceLike)}
          background={CREATED_BG}
        />
      )}

      {roots.length === 0 ? (
        <div
          className="rounded-xl border px-4 py-6 text-xs"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
        >
          Noch keine Finanz-Einträge. Lege sie in der Finanzen-Oberfläche an.
        </div>
      ) : (
        <NodeTable state={state} nodes={roots} />
      )}
    </div>
  );
}


function NodeTable({ state, nodes }: { state: FinanceState; nodes: FinanceNode[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cols = "1.6fr 1fr 1fr 1fr 1.2fr";
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
    >
      <div
        className="grid items-center px-3 py-2 border-b text-[11px] font-semibold uppercase tracking-wider"
        style={{ gridTemplateColumns: cols, borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
      >
        <span>Bezeichnung</span><span>Schätzung</span><span>Angebote</span>
        <span>Rechnungen</span><span>Kontrolle (Ang./Re.)</span>
      </div>
      {nodes.map((n) => {
        const t = nodeTotals(state, n);
        const cO = control(t.estimate, t.offers);
        const cI = control(t.estimate, t.invoices);
        const kids = childrenOf(state, n.id);
        const isOpen = !!open[n.id];
        return (
          <div key={n.id}>
            <div
              className="grid items-center px-3 py-2 border-b text-sm"
              style={{ gridTemplateColumns: cols, borderColor: "hsl(var(--hairline))", opacity: n.enabled ? 1 : 0.45 }}
            >
              <button
                className="flex items-center gap-1.5 min-w-0 text-left"
                onClick={() => kids.length > 0 && setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))}
              >
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
            </div>
            {isOpen && kids.length > 0 && (
              <div className="pl-6 border-b" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}>
                <NodeTable state={state} nodes={kids} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
