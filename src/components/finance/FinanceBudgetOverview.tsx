import { Pencil, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeBudgetComparison, computeScopeSummary, formatMoney } from "@/lib/financeMath";
import type { FinanceState } from "@/lib/financeStore";

export function FinanceBudgetOverview({ state, onEdit, readOnly }: {
  state: FinanceState; onEdit: (kind: "project" | "cost") => void; readOnly: boolean;
}) {
  const contractor = state.perspective === "contractor";
  const kind = contractor ? "cost" : "project";
  const comparison = computeBudgetComparison(state, kind);
  const summary = computeScopeSummary(state);
  const fmt = (amount: number) => formatMoney(amount, state.currency || "EUR");
  const basisLabel = comparison.basis === "gross" ? "Brutto" : "Netto";
  const difference = comparison.forecastDifference;
  const forecastText = difference === null ? "Budget noch nicht festgelegt" : difference < 0 ? `Voraussichtlich über Budget: ${fmt(-difference)}` : difference === 0 ? "Voraussichtlich im Budget" : `Voraussichtlich unter Budget: ${fmt(difference)}`;
  return <section aria-label={contractor ? "Kostenbudget und Prognose" : "Projektbudget und Zahlungen"} className="space-y-3">
    <div className="finance-budget-grid">
      <div className="min-w-0 rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold">{contractor ? "Kostenbudget" : "Projektbudget"}</h2>
        <p className="my-2 break-words text-xl font-semibold">{comparison.amount === null ? "Noch nicht festgelegt" : fmt(comparison.amount)}</p>
        <p className="mb-3 text-xs text-muted-foreground">{basisLabel} · gesamtes Projekt</p>
        <Button variant="outline" disabled={readOnly} className="h-auto min-h-11 max-w-full whitespace-normal" onClick={() => onEdit(kind)}><Pencil />{comparison.amount === null ? "Budget festlegen" : "Budget ändern"}</Button>
      </div>
      {!contractor && <div className="min-w-0 rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold">Bereits bezahlt</h3>
        <p className="my-2 break-words text-xl font-semibold">{fmt(summary.expense.paidTotal)}</p>
        <p className="text-xs text-muted-foreground">{comparison.unpaidBudget === null ? "Budget noch nicht festgelegt" : comparison.unpaidBudget >= 0 ? `Noch nicht ausgezahlt: ${fmt(comparison.unpaidBudget)}` : `Zahlungen über Budget: ${fmt(-comparison.unpaidBudget)}`} · Vergleich {basisLabel}</p>
      </div>}
      <div className="min-w-0 rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold">{contractor ? "Voraussichtliche Kosten" : "Voraussichtliche Gesamtkosten"}</h3>
        <p className="my-2 break-words text-xl font-semibold">{fmt(summary.expense.expectedTotal)}</p>
        <p className={`text-xs ${difference !== null && difference < 0 ? "text-destructive" : "text-muted-foreground"}`}>{forecastText} · Vergleich {basisLabel}{comparison.provisional ? " · vorläufig" : ""}</p>
      </div>
      {contractor ? <>
        <div className="min-w-0 rounded-lg border border-border bg-background p-4"><h3 className="text-sm font-semibold">Erwartete Einnahmen</h3><p className="my-2 break-words text-xl font-semibold">{fmt(summary.income.expectedTotal)}</p><p className="text-xs text-muted-foreground">Tatsächlich eingegangen: {fmt(summary.income.paidTotal)}</p></div>
        <div className="min-w-0 rounded-lg border border-border bg-background p-4"><h3 className="text-sm font-semibold">Voraussichtlicher Überschuss</h3><p className="my-2 break-words text-xl font-semibold">{fmt(summary.expectedSurplus)}</p><p className="text-xs text-muted-foreground">Erwartete Einnahmen minus voraussichtliche Kosten. Kein vorhandenes Geld und kein steuerlicher Gewinn.</p></div>
      </> : <div className="min-w-0 rounded-lg border border-border bg-background p-4"><h3 className="text-sm font-semibold">Offene Zahlungen</h3><p className="my-2 break-words text-xl font-semibold">{fmt(summary.expense.openInvoiceAmount)}</p><p className="text-xs text-muted-foreground">Noch offene erhaltene Rechnungen; weitere Rechnungen können folgen.</p></div>}
    </div>
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Info className="h-4 w-4 shrink-0" /><span>Prognosen verwenden je Vorgang den erwarteten Gesamtbetrag oder den bestätigten Auftrag einschließlich Nachträgen und berücksichtigen den Rechnungsstand; unvollständige Schätzungen bleiben vorläufig. Auftrag, Rechnung und Zahlung werden nicht addiert. Budgetvergleiche erfolgen in der gespeicherten Budgetbasis ({basisLabel}); die übrigen Beträge folgen der Netto-/Bruttoauswahl.{comparison.missingTax ? " Einzelne Steuersätze fehlen; der Vergleich ist nicht vollständig umrechenbar." : ""}</span></p>
  </section>;
}