import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Home } from "lucide-react";
import {
  financeStore, childrenOf, positionsOf, positionTotals,
  type FinanceState, type FinancePosition,
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

      {archived.length > 0 && (
        <FinanceSummaryCard
          totals={positionTotals(archived)}
          hideEstimate
          title="Archivierte Belege"
          subtitle="Gesamtes Projekt"
          invoiceDetails={archived.filter(isInvoiceLike)}
          background={ARCHIVE_BG}
        />
      )}
      {created.length > 0 && (
        <FinanceSummaryCard
          totals={positionTotals(created)}
          hideEstimate
          title="Angelegte Belege"
          subtitle="Gesamtes Projekt"
          invoiceDetails={created.filter(isInvoiceLike)}
          background={CREATED_BG}
        />
      )}

      {archived.length === 0 && created.length === 0 && (
        <div
          className="rounded-xl border px-4 py-6 text-xs"
          style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
        >
          Noch keine Finanz-Einträge. Lege sie in der Finanzen-Oberfläche an.
        </div>
      )}
    </div>
  );
}
