import { describe, it, expect } from "vitest";
import {
  computeProcessSummary,
  computeScopeSummary,
  evaluateBudgetStatus,
  formatMoney,
  toCents,
  fromCents,
} from "./financeMath";
import { migrateFinanceState } from "./persistence/schemas";
import type { FinanceState } from "./financeStore";

function baseState(partial: Partial<FinanceState> = {}): FinanceState {
  return {
    nodes: [],
    positions: [],
    payments: [],
    projectEstimate: 0,
    projectNote: "",
    perspective: "client",
    taxDisplay: "gross",
    currency: "EUR",
    budgetAmount: null,
    budgetBasis: "gross",
    costBudgetAmount: null,
    costBudgetBasis: "gross",
    ...partial,
  };
}

describe("financeMath", () => {
  it("verhindert Fließkomma-Rundungsfehler bei Cent-Additionen", () => {
    expect(fromCents(toCents(0.1) + toCents(0.2))).toBe(0.3);
  });

  it("zählt Angebot, Auftrag, Rechnung und Zahlung niemals doppelt", () => {
    const state = baseState({
      nodes: [
        { id: "n1", type: "action", parentId: null, name: "Elektro", note: "", estimate: 0, enabled: true, order: 1, direction: "expense" },
      ],
      positions: [
        { id: "p1", nodeId: "n1", type: "offer", date: "2026-01-01", number: "ANG-1", amount: 35000, note: "", order: 1, status: "open" },
        { id: "p2", nodeId: "n1", type: "order", date: "2026-01-05", number: "AUF-1", amount: 35000, note: "", order: 2, status: "approved" },
        { id: "p3", nodeId: "n1", type: "invoice", date: "2026-02-01", number: "RE-1", amount: 28000, note: "", order: 3, status: "open", invoiceKind: "single" },
      ],
      payments: [
        { id: "pay1", nodeId: "n1", invoiceId: "p3", date: "2026-02-10", amount: 22000, reference: "ÜW-1", note: "" },
      ],
    });

    const summary = computeScopeSummary(state, null);
    expect(summary.expense.offersTotal).toBe(35000);
    expect(summary.expense.orderTotal).toBe(35000);
    expect(summary.expense.invoicedTotal).toBe(28000);
    expect(summary.expense.paidTotal).toBe(22000);
    expect(summary.expense.openInvoiceAmount).toBe(6000);
    expect(summary.expense.remainingOrderAmount).toBe(7000);
    expect(summary.expense.expectedTotal).toBe(35000);
  });

  it("verändert beim Perspektivwechsel keinerlei Beträge", () => {
    const state = baseState({
      nodes: [
        { id: "n1", type: "action", parentId: null, name: "Garten", note: "", estimate: 0, enabled: true, order: 1, direction: "income" },
        { id: "n2", type: "action", parentId: null, name: "Material", note: "", estimate: 0, enabled: true, order: 2, direction: "expense" },
      ],
      positions: [
        { id: "p1", nodeId: "n1", type: "order", date: "2026-01-01", number: "A1", amount: 50000, note: "", order: 1, status: "approved" },
        { id: "p2", nodeId: "n2", type: "order", date: "2026-01-02", number: "B1", amount: 18000, note: "", order: 1, status: "approved" },
      ],
    });
    const asClient = computeScopeSummary({ ...state, perspective: "client" }, null);
    const asContractor = computeScopeSummary({ ...state, perspective: "contractor" }, null);
    expect(asClient.expense.orderTotal).toBe(asContractor.expense.orderTotal);
    expect(asClient.income.orderTotal).toBe(asContractor.income.orderTotal);
    expect(asContractor.expectedSurplus).toBe(32000);
  });

  it("berücksichtigt Nachträge, Gutschriften, kumulierte Schlussrechnungen und Überzahlungen korrekt", () => {
    const state = baseState({
      nodes: [
        { id: "n1", type: "action", parentId: null, name: "Rohbau", note: "", estimate: 0, enabled: true, order: 1, direction: "expense" },
      ],
      positions: [
        { id: "o1", nodeId: "n1", type: "order", date: "2026-01-01", number: "AUF", amount: 10000, note: "", order: 1, status: "approved" },
        { id: "s1", nodeId: "n1", type: "supplement", supplementKind: "plus", date: "2026-01-10", number: "NT1", amount: 2000, note: "", order: 2, status: "approved" },
        { id: "s2", nodeId: "n1", type: "supplement", supplementKind: "minus", date: "2026-01-12", number: "NT2", amount: 500, note: "", order: 3, status: "approved" },
        { id: "s3", nodeId: "n1", type: "supplement", supplementKind: "plus", date: "2026-01-15", number: "NT3", amount: 3000, note: "", order: 4, status: "open" },
        { id: "i1", nodeId: "n1", type: "invoice", date: "2026-02-01", number: "AR1", amount: 4000, note: "", order: 5, status: "open", invoiceKind: "partial" },
        { id: "i2", nodeId: "n1", type: "invoice", date: "2026-03-01", number: "SR1", amount: 11500, note: "", order: 6, status: "open", invoiceKind: "final_cumulative" },
        { id: "c1", nodeId: "n1", type: "credit", date: "2026-03-05", number: "GS1", amount: 500, note: "", order: 7, status: "open" },
      ],
      payments: [
        { id: "pay1", nodeId: "n1", date: "2026-02-10", amount: 4000, reference: "AR1", note: "" },
        { id: "pay2", nodeId: "n1", date: "2026-03-10", amount: 7500, reference: "SR1", note: "" },
      ],
    });

    const p = computeProcessSummary(state, state.nodes[0]!);
    expect(p.orderTotal).toBe(11500);
    expect(p.openSupplements).toBe(3000);
    // Kumulierte Schlussrechnung (11.500) ersetzt Abschlag (4.000), abzüglich Gutschrift (500) = 11.000
    expect(p.invoicedTotal).toBe(11000);
    // Bezahlt: 11.500 -> 500 € Überzahlung, nicht still auf 0 abgeschnitten
    expect(p.paidTotal).toBe(11500);
    expect(p.openInvoiceAmount).toBe(0);
    expect(p.overpaymentAmount).toBe(500);
  });

  it("meldet bei fehlendem Budget oder vorläufigem Stand niemals fälschlich grün", () => {
    const noBudget = evaluateBudgetStatus(null, 0, true, formatMoney);
    expect(noBudget.tone).toBe("neutral");
    expect(noBudget.text).toContain("Budget noch nicht festgelegt");

    const provisional = evaluateBudgetStatus(50000, 10000, true, formatMoney);
    expect(provisional.tone).toBe("neutral");
    expect(provisional.text).toContain("vorläufig");

    const exceeded = evaluateBudgetStatus(50000, 55000, false, formatMoney);
    expect(exceeded.tone).toBe("red");
  });

  it("übernimmt Altbestände verlustfrei ohne Angebote zu Aufträgen oder Rechnungen als bezahlt zu markieren", () => {
    const legacy = {
      _v: 1,
      nodes: [{ id: "a1", type: "action", parentId: null, name: "Alte Anlage", note: "Notiz", estimate: 12000, enabled: true, order: 1 }],
      positions: [
        { id: "p1", nodeId: "a1", type: "offer", date: "2025-05-01", number: "ANG-1", amount: 10000, note: "Alt", order: 1 },
        { id: "p2", nodeId: "a1", type: "invoice", date: "2025-06-01", number: "RE-1", amount: 5000, note: "", order: 2 },
      ],
      projectEstimate: 20000,
      projectNote: "Bestand",
    };
    const migrated = migrateFinanceState(legacy) as FinanceState;
    expect(migrated.perspective).toBe("client");
    expect(migrated.budgetAmount).toBeNull();
    expect(migrated.positions[0]?.type).toBe("offer");
    expect(migrated.positions[1]?.type).toBe("invoice");
    expect(migrated.payments).toEqual([]);
    const summary = computeScopeSummary(migrated, null);
    expect(summary.expense.orderTotal).toBe(0);
    expect(summary.expense.invoicedTotal).toBe(5000);
    expect(summary.expense.paidTotal).toBe(0);
    expect(summary.expense.openInvoiceAmount).toBe(5000);
  });
});