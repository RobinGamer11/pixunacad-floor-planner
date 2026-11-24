import type {
  FinanceDirection,
  FinanceNode,
  FinancePayment,
  FinancePosition,
  FinanceState,
  TaxBasis,
} from "./financeStore";

/** Konvertiert EUR in ganzzahlige Cent, um Fließkomma-Rundungsfehler zu vermeiden. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Berechnet den Anzeigebetrag in Cent für die gewünschte Netto-/Bruttobasis.
 * Errät niemals fehlende Steuersätze: bei fehlender Steuerangabe wird missingTax = true gesetzt.
 */
export function resolvePositionCents(
  pos: Pick<FinancePosition, "amount" | "amountBasis" | "taxRate">,
  targetBasis: TaxBasis,
): { cents: number; missingTax: boolean } {
  const rawCents = toCents(pos.amount || 0);
  const srcBasis: TaxBasis = pos.amountBasis ?? "gross";
  if (srcBasis === targetBasis) {
    return { cents: rawCents, missingTax: false };
  }
  if (typeof pos.taxRate !== "number" || !Number.isFinite(pos.taxRate) || pos.taxRate < 0) {
    return { cents: rawCents, missingTax: true };
  }
  const factor = 1 + pos.taxRate / 100;
  if (srcBasis === "net" && targetBasis === "gross") {
    return { cents: Math.round(rawCents * factor), missingTax: false };
  }
  return { cents: Math.round(rawCents / factor), missingTax: false };
}

export type ForecastSource = "manual" | "order" | "invoiced" | "estimate" | "incomplete";
export type FinanceTone = "green" | "neutral" | "orange" | "red";

export interface ProcessSummary {
  nodeId: string;
  direction: FinanceDirection;
  offersTotal: number;
  orderBase: number;
  approvedSupplements: number;
  openSupplements: number;
  rejectedSupplements: number;
  /** Bestätigter Auftragswert inkl. bestätigter Mehr-/Mindernachträge. */
  orderTotal: number;
  /** Gültige Rechnungen abzüglich Gutschriften (ohne Doppelzählung bei kumulierter Schlussrechnung). */
  invoicedTotal: number;
  /** Tatsächlich gezahlter bzw. erhaltener Betrag. */
  paidTotal: number;
  /** Offener Rechnungsbetrag (>= 0). */
  openInvoiceAmount: number;
  /** Überzahlung / Guthaben (> 0, falls Zahlungen > Rechnungen). */
  overpaymentAmount: number;
  /** Nicht zugeordnete Vorauszahlungen (Zahlungen ohne aktive Rechnung). */
  unassignedPrepayments: number;
  /** Noch nicht abgerechneter Auftragsrest. */
  remainingOrderAmount: number;
  /** Erwartete Gesamtkosten / -einnahmen für diesen Vorgang. */
  expectedTotal: number;
  forecastSource: ForecastSource;
  isProvisional: boolean;
  /** Überfälliger Rechnungsbetrag. */
  overdueAmount: number;
  /** Mindestens ein Beleg konnte mangels Steuersatz nicht exakt umgerechnet werden. */
  hasMissingTax: boolean;
}

export interface DirectionTotals {
  offersTotal: number;
  orderTotal: number;
  approvedSupplements: number;
  openSupplements: number;
  invoicedTotal: number;
  paidTotal: number;
  openInvoiceAmount: number;
  overpaymentAmount: number;
  unassignedPrepayments: number;
  remainingOrderAmount: number;
  expectedTotal: number;
  overdueAmount: number;
  isProvisional: boolean;
  hasMissingTax: boolean;
  processCount: number;
}

export interface ScopeSummary {
  scopeNodeId: string | null;
  scopeName: string;
  taxDisplay: TaxBasis;
  currency: string;
  expense: DirectionTotals;
  income: DirectionTotals;
  /** Projektbudget (nur wenn scopeNodeId === null) oder Bereichsbudget. */
  budgetAmount: number | null;
  budgetBasis: TaxBasis;
  /** Optionales Kostenbudget (Auftragnehmer-Perspektive auf Projektebene). */
  costBudgetAmount: number | null;
  costBudgetBasis: TaxBasis;
  /** Budgetspielraum = Budget minus erwartete Gesamtkosten (null ohne Budget). */
  budgetRemaining: number | null;
  /** Kostenbudget-Spielraum (Auftragnehmer). */
  costBudgetRemaining: number | null;
  /** Voraussichtlicher Überschuss = erwartete Einnahmen minus erwartete Gesamtkosten. */
  expectedSurplus: number;
  /** Summe optionaler Bereichsbudgets (zum Vergleich mit Projektbudget, nie addiert). */
  areaBudgetsSum: number;
  hasAreaBudgets: boolean;
}

export function collectEnabledActionNodes(state: FinanceState, scopeNodeId: string | null): FinanceNode[] {
  const byParent = new Map<string | null, FinanceNode[]>();
  for (const n of state.nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  const result: FinanceNode[] = [];
  const visit = (parentId: string | null) => {
    const kids = (byParent.get(parentId) ?? []).filter((n) => n.enabled !== false);
    for (const k of kids) {
      if (k.type === "action") result.push(k);
      else visit(k.id);
    }
  };
  if (scopeNodeId === null) {
    visit(null);
  } else {
    const target = state.nodes.find((n) => n.id === scopeNodeId);
    if (!target || target.enabled === false) return [];
    if (target.type === "action") return [target];
    visit(target.id);
  }
  return result;
}

export function computeProcessSummary(
  state: FinanceState,
  node: FinanceNode,
  taxDisplay: TaxBasis = state.taxDisplay ?? "gross",
  todayIso: string = new Date().toISOString().slice(0, 10),
): ProcessSummary {
  const direction: FinanceDirection = node.direction ?? "expense";
  const positions = state.positions.filter((p) => p.nodeId === node.id);
  const payments: FinancePayment[] = (state.payments ?? []).filter((pay) => pay.nodeId === node.id);

  let offersCents = 0;
  let orderBaseCents = 0;
  let approvedSuppCents = 0;
  let openSuppCents = 0;
  let rejectedSuppCents = 0;
  let hasMissingTax = false;

  const activeInvoices: { pos: FinancePosition; cents: number }[] = [];
  let creditsCents = 0;

  for (const p of positions) {
    if (p.status === "cancelled") continue;
    const resolved = resolvePositionCents(p, taxDisplay);
    if (resolved.missingTax) hasMissingTax = true;

    if (p.type === "offer") {
      offersCents += resolved.cents;
    } else if (p.type === "order") {
      if (p.status !== "rejected") orderBaseCents += resolved.cents;
    } else if (p.type === "supplement") {
      const signed = p.supplementKind === "minus" ? -resolved.cents : resolved.cents;
      if (p.status === "rejected") rejectedSuppCents += signed;
      else if (p.status === "open") openSuppCents += signed;
      else approvedSuppCents += signed;
    } else if (p.type === "invoice") {
      activeInvoices.push({ pos: p, cents: resolved.cents });
    } else if (p.type === "credit") {
      creditsCents += resolved.cents;
    }
  }

  // Abschlags- und Schlussrechnungen ohne Doppelzählung:
  // Liegt eine kumulierte Schlussrechnung vor, ersetzt sie frühere Abschlagsrechnungen.
  const hasCumulativeFinal = activeInvoices.some((i) => i.pos.invoiceKind === "final_cumulative");
  let invoicedGrossCents = 0;
  let overdueCents = 0;

  const paidByInvoice = new Map<string, number>();
  let paidTotalCents = 0;
  let unassignedPrepayCents = 0;

  for (const pay of payments) {
    const c = toCents(pay.amount || 0);
    paidTotalCents += c;
    if (pay.invoiceId) {
      paidByInvoice.set(pay.invoiceId, (paidByInvoice.get(pay.invoiceId) ?? 0) + c);
    }
  }

  for (const item of activeInvoices) {
    if (hasCumulativeFinal && item.pos.invoiceKind === "partial") continue;
    invoicedGrossCents += item.cents;
    if (item.pos.dueDate && item.pos.dueDate < todayIso) {
      const paidForThis = paidByInvoice.get(item.pos.id) ?? 0;
      const remaining = Math.max(0, item.cents - paidForThis);
      overdueCents += remaining;
    }
  }

  const invoicedNetOfCreditsCents = Math.max(0, invoicedGrossCents - creditsCents);
  if (invoicedNetOfCreditsCents === 0 && paidTotalCents > 0) {
    unassignedPrepayCents = paidTotalCents;
  }

  const rawOpenCents = invoicedNetOfCreditsCents - paidTotalCents;
  const openInvoiceCents = rawOpenCents > 0 ? rawOpenCents : 0;
  const overpaymentCents = rawOpenCents < 0 ? Math.abs(rawOpenCents) : 0;

  // Überfälligkeit kann den gesamten offenen Betrag nicht übersteigen.
  overdueCents = Math.min(overdueCents, openInvoiceCents);

  const orderTotalCents = orderBaseCents + approvedSuppCents;
  const remainingOrderCents = Math.max(0, orderTotalCents - invoicedNetOfCreditsCents);

  // Prognose: bewusste manuelle Gesamtprognose > Auftrag/Rechnung > Schätzung > unvollständig
  let expectedCents = 0;
  let forecastSource: ForecastSource = "incomplete";
  let isProvisional = false;

  if (typeof node.manualForecast === "number" && Number.isFinite(node.manualForecast)) {
    expectedCents = toCents(node.manualForecast);
    forecastSource = "manual";
  } else if (orderTotalCents > 0 || invoicedNetOfCreditsCents > 0) {
    if (invoicedNetOfCreditsCents >= orderTotalCents) {
      expectedCents = invoicedNetOfCreditsCents;
      forecastSource = orderTotalCents > 0 ? "order" : "invoiced";
      if (orderTotalCents === 0) isProvisional = true;
    } else {
      expectedCents = orderTotalCents;
      forecastSource = "order";
    }
  } else if (node.estimate > 0) {
    expectedCents = toCents(node.estimate);
    forecastSource = "estimate";
    isProvisional = true;
  } else {
    expectedCents = 0;
    forecastSource = "incomplete";
    isProvisional = true;
  }

  return {
    nodeId: node.id,
    direction,
    offersTotal: fromCents(offersCents),
    orderBase: fromCents(orderBaseCents),
    approvedSupplements: fromCents(approvedSuppCents),
    openSupplements: fromCents(openSuppCents),
    rejectedSupplements: fromCents(rejectedSuppCents),
    orderTotal: fromCents(orderTotalCents),
    invoicedTotal: fromCents(invoicedNetOfCreditsCents),
    paidTotal: fromCents(paidTotalCents),
    openInvoiceAmount: fromCents(openInvoiceCents),
    overpaymentAmount: fromCents(overpaymentCents),
    unassignedPrepayments: fromCents(unassignedPrepayCents),
    remainingOrderAmount: fromCents(remainingOrderCents),
    expectedTotal: fromCents(expectedCents),
    forecastSource,
    isProvisional,
    overdueAmount: fromCents(overdueCents),
    hasMissingTax,
  };
}

function emptyDirectionTotals(): DirectionTotals {
  return {
    offersTotal: 0,
    orderTotal: 0,
    approvedSupplements: 0,
    openSupplements: 0,
    invoicedTotal: 0,
    paidTotal: 0,
    openInvoiceAmount: 0,
    overpaymentAmount: 0,
    unassignedPrepayments: 0,
    remainingOrderAmount: 0,
    expectedTotal: 0,
    overdueAmount: 0,
    isProvisional: false,
    hasMissingTax: false,
    processCount: 0,
  };
}

export function computeScopeSummary(
  state: FinanceState,
  scopeNodeId: string | null = null,
  taxDisplay: TaxBasis = state.taxDisplay ?? "gross",
  todayIso: string = new Date().toISOString().slice(0, 10),
): ScopeSummary {
  const actions = collectEnabledActionNodes(state, scopeNodeId);
  const acc = {
    expense: {
      offers: 0, order: 0, appSupp: 0, openSupp: 0, inv: 0, paid: 0,
      open: 0, overpay: 0, prepay: 0, remOrder: 0, exp: 0, overdue: 0,
      provisional: false, missingTax: false, count: 0,
    },
    income: {
      offers: 0, order: 0, appSupp: 0, openSupp: 0, inv: 0, paid: 0,
      open: 0, overpay: 0, prepay: 0, remOrder: 0, exp: 0, overdue: 0,
      provisional: false, missingTax: false, count: 0,
    },
  };

  for (const node of actions) {
    const p = computeProcessSummary(state, node, taxDisplay, todayIso);
    const bucket = acc[p.direction];
    bucket.offers += toCents(p.offersTotal);
    bucket.order += toCents(p.orderTotal);
    bucket.appSupp += toCents(p.approvedSupplements);
    bucket.openSupp += toCents(p.openSupplements);
    bucket.inv += toCents(p.invoicedTotal);
    bucket.paid += toCents(p.paidTotal);
    bucket.open += toCents(p.openInvoiceAmount);
    bucket.overpay += toCents(p.overpaymentAmount);
    bucket.prepay += toCents(p.unassignedPrepayments);
    bucket.remOrder += toCents(p.remainingOrderAmount);
    bucket.exp += toCents(p.expectedTotal);
    bucket.overdue += toCents(p.overdueAmount);
    if (p.isProvisional) bucket.provisional = true;
    if (p.hasMissingTax) bucket.missingTax = true;
    bucket.count += 1;
  }

  const toTotals = (b: typeof acc.expense): DirectionTotals => ({
    offersTotal: fromCents(b.offers),
    orderTotal: fromCents(b.order),
    approvedSupplements: fromCents(b.appSupp),
    openSupplements: fromCents(b.openSupp),
    invoicedTotal: fromCents(b.inv),
    paidTotal: fromCents(b.paid),
    openInvoiceAmount: fromCents(b.open),
    overpaymentAmount: fromCents(b.overpay),
    unassignedPrepayments: fromCents(b.prepay),
    remainingOrderAmount: fromCents(b.remOrder),
    expectedTotal: fromCents(b.exp),
    overdueAmount: fromCents(b.overdue),
    isProvisional: b.count === 0 ? true : b.provisional,
    hasMissingTax: b.missingTax,
    processCount: b.count,
  });

  const expense = toTotals(acc.expense);
  const income = toTotals(acc.income);

  const scopeNode = scopeNodeId ? state.nodes.find((n) => n.id === scopeNodeId) ?? null : null;
  const scopeName = scopeNode ? scopeNode.name : "Gesamtes Projekt";

  // Projektbudget und Bereichsbudget strikt trennen:
  // Ohne eigenes Bereichsbudget niemals das Projektbudget als Bereichsbudget zeigen.
  const budgetAmount = scopeNode
    ? (typeof scopeNode.budgetAmount === "number" ? scopeNode.budgetAmount : null)
    : (typeof state.budgetAmount === "number" ? state.budgetAmount : null);
  const budgetBasis: TaxBasis = scopeNode
    ? (scopeNode.budgetBasis ?? "gross")
    : (state.budgetBasis ?? "gross");

  const costBudgetAmount = scopeNode
    ? null
    : (typeof state.costBudgetAmount === "number" ? state.costBudgetAmount : null);
  const costBudgetBasis: TaxBasis = state.costBudgetBasis ?? "gross";

  const budgetRemaining = budgetAmount !== null
    ? fromCents(toCents(budgetAmount) - toCents(expense.expectedTotal))
    : null;
  const costBudgetRemaining = costBudgetAmount !== null
    ? fromCents(toCents(costBudgetAmount) - toCents(expense.expectedTotal))
    : null;
  const expectedSurplus = fromCents(toCents(income.expectedTotal) - toCents(expense.expectedTotal));

  const areaBudgetNodes = state.nodes.filter(
    (n) => n.type === "overview" && n.enabled !== false && typeof n.budgetAmount === "number",
  );
  const areaBudgetsSum = fromCents(
    areaBudgetNodes.reduce((sum, n) => sum + toCents(n.budgetAmount ?? 0), 0),
  );

  return {
    scopeNodeId,
    scopeName,
    taxDisplay,
    currency: state.currency || "EUR",
    expense,
    income,
    budgetAmount,
    budgetBasis,
    costBudgetAmount,
    costBudgetBasis,
    budgetRemaining,
    costBudgetRemaining,
    expectedSurplus,
    areaBudgetsSum,
    hasAreaBudgets: areaBudgetNodes.length > 0,
  };
}

/** Bewertet den Budgetstatus mit freundlicher, klarer Textaussage (keine falschen grünen Bewertungen). */
export function evaluateBudgetStatus(
  budgetAmount: number | null,
  expectedTotal: number,
  isProvisional: boolean,
  formatMoney: (v: number) => string,
): { tone: FinanceTone; text: string } {
  if (budgetAmount === null) {
    return { tone: "neutral", text: "Budget noch nicht festgelegt" };
  }
  const diffCents = toCents(budgetAmount) - toCents(expectedTotal);
  if (diffCents < 0) {
    return {
      tone: "red",
      text: `${formatMoney(fromCents(Math.abs(diffCents)))} über dem Budget`,
    };
  }
  if (isProvisional) {
    return {
      tone: "neutral",
      text: `Kostenstand vorläufig · ${formatMoney(fromCents(diffCents))} Spielraum`,
    };
  }
  if (budgetAmount > 0 && diffCents <= toCents(budgetAmount) * 0.1) {
    return {
      tone: "orange",
      text: `Knapper Spielraum: ${formatMoney(fromCents(diffCents))} verbleibend`,
    };
  }
  return {
    tone: "green",
    text: `${formatMoney(fromCents(diffCents))} im Budgetrahmen`,
  };
}

export function formatMoney(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount || 0);
}