import React from "react";
import { ChevronRight } from "lucide-react";
import {
  evaluateBudgetStatus,
  formatMoney,
  type FinanceTone,
  type ScopeSummary,
} from "@/lib/financeMath";
import type { FinancePerspective } from "@/lib/financeStore";

export type ComparisonFilter =
  | "all"
  | "expenses"
  | "incomes"
  | "open_invoices"
  | "unbilled_orders";

interface Props {
  summary: ScopeSummary;
  perspective: FinancePerspective;
  onSelectFilter: (filter: ComparisonFilter) => void;
  onOpenBudget: (kind: "project" | "cost") => void;
}

const TONE_COLOR: Record<FinanceTone, string> = {
  green: "hsl(142 65% 42%)",
  neutral: "hsl(var(--ink-soft))",
  orange: "hsl(34 92% 52%)",
  red: "hsl(var(--destructive))",
};

interface RowData {
  id: string;
  title: string;
  headline: string;
  detail: string;
  tone: FinanceTone;
  filter: ComparisonFilter;
  actionLabel?: string;
  onAction?: () => void;
}

export const FinanceComparisonCards: React.FC<Props> = ({
  summary,
  perspective,
  onSelectFilter,
  onOpenBudget,
}) => {
  const fmt = (v: number) => formatMoney(v, summary.currency);
  const rows: RowData[] = [];

  if (perspective === "client") {
    const budgetEval = evaluateBudgetStatus(
      summary.budgetAmount,
      summary.expense.expectedTotal,
      summary.expense.isProvisional,
      fmt,
    );
    rows.push({
      id: "budget-expected",
      title: "Budget ↔ Erwartete Gesamtkosten",
      headline: summary.budgetAmount !== null
        ? `${fmt(summary.budgetAmount)} Budget · ${fmt(summary.expense.expectedTotal)} erwartet`
        : `Kein Budget festgelegt · ${fmt(summary.expense.expectedTotal)} erwartet`,
      detail: summary.expense.isProvisional && summary.budgetAmount !== null
        ? `${budgetEval.text} (Restkosten noch nicht vollständig erfasst)`
        : budgetEval.text,
      tone: budgetEval.tone,
      filter: "expenses",
      actionLabel: summary.budgetAmount === null ? "+ Budget festlegen" : "Budget ändern",
      onAction: () => onOpenBudget("project"),
    });

    const orderDiff = summary.expense.invoicedTotal - summary.expense.orderTotal;
    let orderDetail = "Noch keine Aufträge oder Rechnungen erfasst.";
    let orderTone: FinanceTone = "neutral";
    if (summary.expense.orderTotal > 0 || summary.expense.invoicedTotal > 0) {
      if (orderDiff > 0) {
        orderDetail = `${fmt(orderDiff)} über dem bestätigten Auftrag berechnet.`;
        orderTone = "orange";
      } else if (orderDiff < 0) {
        orderDetail = `Bisher ${fmt(Math.abs(orderDiff))} weniger berechnet als beauftragt (weitere Rechnungen können folgen).`;
        orderTone = "neutral";
      } else {
        orderDetail = "Beauftragte Leistungen vollständig abgerechnet.";
        orderTone = "green";
      }
    }
    rows.push({
      id: "order-invoiced",
      title: "Vergebene Aufträge ↔ Erhaltene Rechnungen",
      headline: `${fmt(summary.expense.orderTotal)} beauftragt · ${fmt(summary.expense.invoicedTotal)} berechnet`,
      detail: orderDetail,
      tone: orderTone,
      filter: "unbilled_orders",
    });

    let payDetail = "Keine offenen Rechnungen.";
    let payTone: FinanceTone = summary.expense.invoicedTotal > 0 ? "green" : "neutral";
    if (summary.expense.openInvoiceAmount > 0) {
      payDetail = summary.expense.overdueAmount > 0
        ? `${fmt(summary.expense.openInvoiceAmount)} noch zu bezahlen (davon ${fmt(summary.expense.overdueAmount)} überfällig).`
        : `${fmt(summary.expense.openInvoiceAmount)} noch zu bezahlen.`;
      payTone = summary.expense.overdueAmount > 0 ? "red" : "neutral";
    } else if (summary.expense.overpaymentAmount > 0) {
      payDetail = `${fmt(summary.expense.overpaymentAmount)} Überzahlung / Guthaben.`;
      payTone = "orange";
    }
    rows.push({
      id: "invoiced-paid",
      title: "Erhaltene Rechnungen ↔ Geleistete Zahlungen",
      headline: `${fmt(summary.expense.invoicedTotal)} berechnet · ${fmt(summary.expense.paidTotal)} bezahlt`,
      detail: payDetail,
      tone: payTone,
      filter: "open_invoices",
    });
  } else {
    // Auftragnehmer-Perspektive
    const incDiff = summary.income.invoicedTotal - summary.income.orderTotal;
    rows.push({
      id: "inc-order-invoiced",
      title: "Erhaltene Aufträge ↔ Gestellte Rechnungen",
      headline: `${fmt(summary.income.orderTotal)} beauftragt · ${fmt(summary.income.invoicedTotal)} gestellt`,
      detail: summary.income.orderTotal === 0 && summary.income.invoicedTotal === 0
        ? "Noch keine Aufträge oder Rechnungen erfasst."
        : incDiff < 0
          ? `Noch ${fmt(Math.abs(incDiff))} nicht abgerechnet.`
          : incDiff > 0
            ? `${fmt(incDiff)} über dem bestätigten Auftrag abgerechnet.`
            : "Alle bestätigten Aufträge vollständig abgerechnet.",
      tone: incDiff === 0 && summary.income.orderTotal > 0 ? "green" : "neutral",
      filter: "incomes",
    });

    rows.push({
      id: "inc-invoiced-paid",
      title: "Gestellte Rechnungen ↔ Erhaltene Zahlungen",
      headline: `${fmt(summary.income.invoicedTotal)} gestellt · ${fmt(summary.income.paidTotal)} erhalten`,
      detail: summary.income.openInvoiceAmount > 0
        ? `${fmt(summary.income.openInvoiceAmount)} Zahlung offen${summary.income.overdueAmount > 0 ? ` (${fmt(summary.income.overdueAmount)} überfällig)` : ""}.`
        : summary.income.invoicedTotal > 0
          ? "Alle gestellten Rechnungen vollständig bezahlt."
          : "Noch keine Zahlungen erfasst.",
      tone: summary.income.overdueAmount > 0
        ? "red"
        : summary.income.openInvoiceAmount > 0
          ? "neutral"
          : summary.income.invoicedTotal > 0
            ? "green"
            : "neutral",
      filter: "open_invoices",
    });

    const surplusTone: FinanceTone =
      summary.income.processCount === 0 && summary.expense.processCount === 0
        ? "neutral"
        : summary.expectedSurplus < 0
          ? "red"
          : summary.income.isProvisional || summary.expense.isProvisional
            ? "neutral"
            : "green";
    rows.push({
      id: "inc-vs-exp",
      title: "Erwartete Einnahmen ↔ Erwartete Gesamtkosten",
      headline: `${fmt(summary.income.expectedTotal)} Einnahmen · ${fmt(summary.expense.expectedTotal)} Kosten`,
      detail: summary.expectedSurplus < 0
        ? `Voraussichtliche Unterdeckung: ${fmt(Math.abs(summary.expectedSurplus))} (Projektprognose).`
        : `Voraussichtlicher Überschuss: ${fmt(summary.expectedSurplus)} (Projektprognose, kein steuerlicher Gewinn).`,
      tone: surplusTone,
      filter: "all",
    });

    const costEval = evaluateBudgetStatus(
      summary.costBudgetAmount,
      summary.expense.expectedTotal,
      summary.expense.isProvisional,
      fmt,
    );
    rows.push({
      id: "cost-budget",
      title: "Kostenbudget ↔ Erwartete Gesamtkosten",
      headline: summary.costBudgetAmount !== null
        ? `${fmt(summary.costBudgetAmount)} Kostenbudget · ${fmt(summary.expense.expectedTotal)} erwartet`
        : `Kein Kostenbudget festgelegt · ${fmt(summary.expense.expectedTotal)} erwartet`,
      detail: costEval.text,
      tone: costEval.tone,
      filter: "expenses",
      actionLabel: summary.costBudgetAmount === null ? "+ Kostenbudget festlegen" : "Kostenbudget ändern",
      onAction: () => onOpenBudget("cost"),
    });
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div
          key={r.id}
          onClick={() => onSelectFilter(r.filter)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectFilter(r.filter); }}
          className="rounded-xl border p-4 cursor-pointer transition-colors hover:border-[hsl(var(--accent-gold)/0.6)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
        >
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--ink-soft))" }}>
              {r.title}
            </div>
            <div className="text-sm sm:text-base font-semibold break-words">{r.headline}</div>
            <div className="text-xs sm:text-sm font-medium" style={{ color: TONE_COLOR[r.tone] }}>
              {r.detail}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            {r.actionLabel && r.onAction && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); r.onAction!(); }}
                className="min-h-[40px] px-3 rounded-lg border text-xs font-semibold transition-colors"
                style={{
                  borderColor: "hsl(var(--accent-gold))",
                  color: "hsl(var(--accent-gold))",
                  background: "hsl(var(--accent-gold) / 0.1)",
                }}
              >
                {r.actionLabel}
              </button>
            )}
            <ChevronRight size={18} style={{ color: "hsl(var(--ink-soft))" }} />
          </div>
        </div>
      ))}
    </div>
  );
};