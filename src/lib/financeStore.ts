import { accountRecordKey, currentAccount, registerLocalFlusher } from "./accountStorage";
// Store für die Finanzen-Oberfläche. Persistiert projektbezogen in localStorage.
//
// Struktur:
//   Projekt (virtueller Wurzelknoten)
//     └─ Übersicht  (z. B. "01 Rohbau")
//          └─ Aktion (z. B. "Tiefbau Müller GmbH")  → enthält Positionen

export type FinanceNodeType = "overview" | "action";
export type FinancePositionType = "offer" | "order" | "invoice" | "credit" | "supplement";
export type SupplementKind = "plus" | "minus";
export type FinancePerspective = "client" | "contractor";
export type FinanceDirection = "expense" | "income";
export type TaxBasis = "net" | "gross";
export type PositionStatus = "open" | "approved" | "rejected" | "cancelled";
export type InvoiceKind = "single" | "partial" | "final_cumulative";

export interface FinanceNode {
  id: string;
  type: FinanceNodeType;
  /** null = direkt unter dem Projekt. */
  parentId: string | null;
  name: string;
  note: string;
  /** Kostenschätzung in EUR (0 = keine Angabe). */
  estimate: number;
  /** Ausgeschaltete Knoten fließen nicht in übergeordnete Summen ein. */
  enabled: boolean;
  order: number;
  /** Vorgangsrichtung (Ausgabe / Einnahme). */
  direction?: FinanceDirection;
  /** Auftraggeber, Auftragnehmer oder Geschäftspartner. */
  partner?: string;
  /** Bewusst manuell festgelegte Gesamtprognose (ersetzt automatischen Vorschlag). */
  manualForecast?: number | null;
  /** Optionales Bereichsbudget (nur für Bereiche). */
  budgetAmount?: number | null;
  budgetBasis?: TaxBasis;
}

export interface FinancePosition {
  id: string;
  nodeId: string;
  type: FinancePositionType;
  /** Nur bei type === "supplement". */
  supplementKind?: SupplementKind;
  date: string;   // YYYY-MM-DD
  number: string; // Angebots-/Rechnungs-/Nachtrags-Nr.
  amount: number; // EUR (immer positiv eingegeben)
  note: string;
  order: number;
  /** Gesetzt, wenn zu dieser Position eine Vorlage in der Projektmappe existiert. */
  hasTemplate?: boolean;
  /** Netto- oder Bruttobasis des gespeicherten Betrags. */
  amountBasis?: TaxBasis;
  /** Steuersatz in Prozent (z. B. 19, 7, 0) oder null = unbekannt. */
  taxRate?: number | null;
  /** Status des Belegs (offen, bestätigt/beauftragt, abgelehnt, storniert). */
  status?: PositionStatus;
  /** Rechnungsart zur Vermeidung von Doppelzählung bei Abschlags-/Schlussrechnungen. */
  invoiceKind?: InvoiceKind;
  /** Fälligkeitsdatum (YYYY-MM-DD) für Zahlungsstatus. */
  dueDate?: string;
}

export interface FinancePayment {
  id: string;
  nodeId: string;
  /** Optional: direkt zugeordnete Rechnung. */
  invoiceId?: string | null;
  date: string; // YYYY-MM-DD
  amount: number; // tatsächlich gezahlter/erhaltener Betrag (immer positiv)
  reference: string;
  note: string;
}

export interface FinanceState {
  nodes: FinanceNode[];
  positions: FinancePosition[];
  /** Kostenschätzung auf Projektebene. */
  projectEstimate: number;
  projectNote: string;
  /** Projektperspektive: Auftraggeber oder Auftragnehmer. */
  perspective?: FinancePerspective;
  /** Gewählte Anzeigebasis (Netto / Brutto). */
  taxDisplay?: TaxBasis;
  /** Projektwährung (Standard EUR). */
  currency?: string;
  /** Projektbudget (null = noch nicht festgelegt, nicht 0 €). */
  budgetAmount?: number | null;
  budgetBasis?: TaxBasis;
  /** Optionales Kostenbudget in der Auftragnehmer-Perspektive. */
  costBudgetAmount?: number | null;
  costBudgetBasis?: TaxBasis;
  /** Erfasste Zahlungen und Teilzahlungen. */
  payments?: FinancePayment[];
}

import { migrateFinanceState, stampVersion, FINANCE_KIND } from "./persistence";

const KEY = (projectId: string) => `pixuna.finance.v2.${projectId}`;

const uid = () => `f-${Math.random().toString(36).slice(2, 10)}`;

function emptyState(): FinanceState {
  return {
    nodes: [],
    positions: [],
    projectEstimate: 0,
    projectNote: "",
    perspective: "client",
    taxDisplay: "gross",
    currency: "EUR",
    budgetAmount: null,
    budgetBasis: "gross",
    costBudgetAmount: null,
    costBudgetBasis: "gross",
    payments: [],
  };
}

type Listener = () => void;
const listeners = new Set<Listener>();
const writeErrorListeners = new Set<(projectId: string, error: string | null) => void>();
const mutationListeners = new Set<(projectId: string) => void>();

export function onFinanceWriteError(fn: (projectId: string, error: string | null) => void) {
  writeErrorListeners.add(fn);
  return () => { writeErrorListeners.delete(fn); };
}

function normalizeState(raw: Partial<FinanceState> | null | undefined): FinanceState {
  const parsed = raw ? (migrateFinanceState({ ...raw }) as Partial<FinanceState>) : {};
  return {
    nodes: (parsed.nodes ?? []).map((n) => ({
      ...n,
      enabled: n.enabled !== false,
      direction: n.direction ?? (n.type === "action" ? "expense" : undefined),
      partner: n.partner ?? "",
      manualForecast: typeof n.manualForecast === "number" ? n.manualForecast : null,
      budgetAmount: typeof n.budgetAmount === "number" ? n.budgetAmount : null,
      budgetBasis: n.budgetBasis ?? "gross",
    })),
    positions: (parsed.positions ?? []).map((p) => ({
      ...p,
      note: p.note ?? "",
      amount: typeof p.amount === "number" && Number.isFinite(p.amount) ? p.amount : 0,
      amountBasis: p.amountBasis ?? "gross",
      taxRate: typeof p.taxRate === "number" && Number.isFinite(p.taxRate) ? p.taxRate : null,
      status: p.status ?? (p.type === "supplement" ? "approved" : "open"),
      invoiceKind: p.type === "invoice" ? (p.invoiceKind ?? "single") : p.invoiceKind,
    })),
    projectEstimate: typeof parsed.projectEstimate === "number" ? parsed.projectEstimate : 0,
    projectNote: parsed.projectNote ?? "",
    perspective: parsed.perspective === "contractor" ? "contractor" : "client",
    taxDisplay: parsed.taxDisplay === "net" ? "net" : "gross",
    currency: parsed.currency || "EUR",
    budgetAmount: typeof parsed.budgetAmount === "number" && Number.isFinite(parsed.budgetAmount) ? parsed.budgetAmount : null,
    budgetBasis: parsed.budgetBasis === "net" ? "net" : "gross",
    costBudgetAmount: typeof parsed.costBudgetAmount === "number" && Number.isFinite(parsed.costBudgetAmount) ? parsed.costBudgetAmount : null,
    costBudgetBasis: parsed.costBudgetBasis === "net" ? "net" : "gross",
    payments: Array.isArray(parsed.payments) ? parsed.payments : [],
  };
}

const failedWrites = new Map<string, { projectId: string; state: FinanceState }>();
function read(projectId: string): FinanceState {
  const pending = failedWrites.get(accountRecordKey(currentAccount() ?? "", projectId));
  if (pending) return pending.state;
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

function write(projectId: string, state: FinanceState) {
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify(stampVersion(FINANCE_KIND, { ...state })));
    failedWrites.delete(accountRecordKey(currentAccount() ?? "", projectId));
    writeErrorListeners.forEach((fn) => fn(projectId, null));
  } catch (err) {
    failedWrites.set(accountRecordKey(currentAccount() ?? "", projectId), { projectId, state });
    const msg = err instanceof Error ? err.message : "Lokaler Speicher voll – Finanzdaten konnten nicht gesichert werden.";
    writeErrorListeners.forEach((fn) => fn(projectId, msg));
  }
  listeners.forEach((l) => l());
  mutationListeners.forEach(fn => fn(projectId));
}

function nextOrder(items: { order: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.order), 0) + 1;
}

export const financeStore = {
  subscribeAll(fn: (projectId: string) => void) {
    mutationListeners.add(fn);
    return () => { mutationListeners.delete(fn); };
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get(projectId: string): FinanceState {
    return read(projectId);
  },

  // ---------- Knoten ----------
  addNode(
    projectId: string,
    type: FinanceNodeType,
    parentId: string | null,
    opts?: { name?: string; direction?: FinanceDirection; partner?: string },
  ): FinanceNode {
    const s = read(projectId);
    const siblings = s.nodes.filter((n) => n.parentId === parentId);
    const node: FinanceNode = {
      id: uid(),
      type,
      parentId,
      name: opts?.name?.trim() || (type === "overview" ? "Neuer Bereich" : "Neuer Vorgang"),
      note: "",
      estimate: 0,
      enabled: true,
      order: nextOrder(siblings),
      direction: type === "action" ? (opts?.direction ?? "expense") : undefined,
      partner: opts?.partner ?? "",
      manualForecast: null,
      budgetAmount: null,
      budgetBasis: s.taxDisplay ?? "gross",
    };
    s.nodes = [...s.nodes, node];
    write(projectId, s);
    return node;
  },
  updateNode(projectId: string, id: string, patch: Partial<FinanceNode>) {
    const s = read(projectId);
    s.nodes = s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    write(projectId, s);
  },
  /** Dupliziert einen Knoten samt Unterknoten und Positionen. */
  duplicateNode(projectId: string, id: string): FinanceNode | null {
    const s = read(projectId);
    const source = s.nodes.find((n) => n.id === id);
    if (!source) return null;

    const idMap = new Map<string, string>();
    const collect = (nodeId: string) => {
      idMap.set(nodeId, uid());
      s.nodes.filter((n) => n.parentId === nodeId).forEach((n) => collect(n.id));
    };
    collect(id);

    const siblings = s.nodes.filter((n) => n.parentId === source.parentId);
    const newNodes: FinanceNode[] = [];
    const newPositions: FinancePosition[] = [];
    for (const [oldId, newId] of idMap) {
      const n = s.nodes.find((x) => x.id === oldId)!;
      newNodes.push({
        ...n,
        id: newId,
        parentId: oldId === id ? n.parentId : idMap.get(n.parentId ?? "") ?? n.parentId,
        name: oldId === id ? `${n.name} (Kopie)` : n.name,
        order: oldId === id ? nextOrder(siblings) : n.order,
      });
      for (const p of s.positions.filter((x) => x.nodeId === oldId)) {
        newPositions.push({ ...p, id: uid(), nodeId: newId });
      }
    }
    s.nodes = [...s.nodes, ...newNodes];
    s.positions = [...s.positions, ...newPositions];
    write(projectId, s);
    return newNodes[0] ?? null;
  },
  deleteNode(projectId: string, id: string) {
    const s = read(projectId);
    const ids = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of s.nodes) {
        if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); grew = true; }
      }
    }
    s.nodes = s.nodes.filter((n) => !ids.has(n.id));
    s.positions = s.positions.filter((p) => !ids.has(p.nodeId));
    s.payments = (s.payments ?? []).filter((pay) => !ids.has(pay.nodeId));
    write(projectId, s);
  },
  moveNode(projectId: string, id: string, dir: -1 | 1) {
    const s = read(projectId);
    const node = s.nodes.find((n) => n.id === id);
    if (!node) return;
    const sibs = s.nodes.filter((n) => n.parentId === node.parentId).sort((a, b) => a.order - b.order);
    const i = sibs.findIndex((n) => n.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return;
    const a = sibs[i], b = sibs[j];
    const tmp = a.order; a.order = b.order; b.order = tmp;
    s.nodes = s.nodes.map((n) => (n.id === a.id ? a : n.id === b.id ? b : n));
    write(projectId, s);
  },

  // ---------- Positionen ----------
  addPosition(
    projectId: string,
    nodeId: string,
    type: FinancePositionType,
    opts?: Partial<FinancePosition>,
  ): FinancePosition {
    const s = read(projectId);
    const own = s.positions.filter((p) => p.nodeId === nodeId);
    const pos: FinancePosition = {
      id: uid(),
      nodeId,
      type,
      supplementKind: type === "supplement" ? (opts?.supplementKind ?? "plus") : undefined,
      date: new Date().toISOString().slice(0, 10),
      number: "",
      amount: 0,
      note: "",
      order: nextOrder(own),
      amountBasis: s.taxDisplay ?? "gross",
      taxRate: 19,
      status: type === "order" ? "approved" : "open",
      invoiceKind: type === "invoice" ? "single" : undefined,
      ...opts,
    };
    s.positions = [...s.positions, pos];
    write(projectId, s);
    return pos;
  },
  updatePosition(projectId: string, id: string, patch: Partial<FinancePosition>) {
    const s = read(projectId);
    s.positions = s.positions.map((p) => (p.id === id ? { ...p, ...patch } : p));
    write(projectId, s);
  },
  deletePosition(projectId: string, id: string) {
    const s = read(projectId);
    s.positions = s.positions.filter((p) => p.id !== id);
    write(projectId, s);
  },
  /** Verschiebt eine Position innerhalb ihres Knotens an eine neue Index-Position. */
  reorderPositions(projectId: string, nodeId: string, fromId: string, toId: string) {
    const s = read(projectId);
    const own = s.positions.filter((p) => p.nodeId === nodeId).sort((a, b) => a.order - b.order);
    const from = own.findIndex((p) => p.id === fromId);
    const to = own.findIndex((p) => p.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = own.splice(from, 1);
    own.splice(to, 0, moved);
    own.forEach((p, i) => { p.order = i + 1; });
    s.positions = s.positions.map((p) => own.find((o) => o.id === p.id) ?? p);
    write(projectId, s);
  },
  setProjectEstimate(projectId: string, value: number) {
    const s = read(projectId);
    s.projectEstimate = value;
    write(projectId, s);
  },
  setProjectNote(projectId: string, note: string) {
    const s = read(projectId);
    s.projectNote = note;
    write(projectId, s);
  },
  setPerspective(projectId: string, perspective: FinancePerspective) {
    const s = read(projectId);
    s.perspective = perspective;
    write(projectId, s);
  },
  setTaxDisplay(projectId: string, taxDisplay: TaxBasis) {
    const s = read(projectId);
    s.taxDisplay = taxDisplay;
    write(projectId, s);
  },
  setBudget(projectId: string, amount: number | null, basis: TaxBasis, kind: "project" | "cost" = "project") {
    const s = read(projectId);
    if (kind === "cost") {
      s.costBudgetAmount = amount;
      s.costBudgetBasis = basis;
    } else {
      s.budgetAmount = amount;
      s.budgetBasis = basis;
    }
    write(projectId, s);
  },
  addPayment(projectId: string, payment: Omit<FinancePayment, "id">): FinancePayment {
    const s = read(projectId);
    const item: FinancePayment = { id: uid(), ...payment };
    s.payments = [...(s.payments ?? []), item];
    write(projectId, s);
    return item;
  },
  updatePayment(projectId: string, id: string, patch: Partial<FinancePayment>) {
    const s = read(projectId);
    s.payments = (s.payments ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p));
    write(projectId, s);
  },
  deletePayment(projectId: string, id: string) {
    const s = read(projectId);
    s.payments = (s.payments ?? []).filter((p) => p.id !== id);
    write(projectId, s);
  },
  acceptOfferAsOrder(projectId: string, offerId: string): FinancePosition | null {
    const s = read(projectId);
    const offer = s.positions.find((p) => p.id === offerId && p.type === "offer");
    if (!offer) return null;
    const own = s.positions.filter((p) => p.nodeId === offer.nodeId);
    const order: FinancePosition = {
      id: uid(),
      nodeId: offer.nodeId,
      type: "order",
      date: new Date().toISOString().slice(0, 10),
      number: offer.number ? `AUF-${offer.number}` : "",
      amount: offer.amount,
      note: offer.note ? `Beauftragt aus Angebot: ${offer.note}` : "Beauftragt aus Angebot",
      order: nextOrder(own),
      amountBasis: offer.amountBasis ?? "gross",
      taxRate: offer.taxRate ?? null,
      status: "approved",
    };
    s.positions = [
      ...s.positions.map((p) => (p.id === offerId ? { ...p, status: "approved" as PositionStatus } : p)),
      order,
    ];
    write(projectId, s);
    return order;
  },
  /** Übernimmt einen vollständigen Finanzstand (z. B. aus der Cloud). */
  replaceState(projectId: string, next: FinanceState) {
    write(projectId, normalizeState(next));
  },
};

// ---------------------------------------------------------------- Auswertung

export interface FinanceTotals {
  estimate: number;
  offers: number;
  /** Rechnungen inkl. Nachtragssaldo. */
  invoices: number;
  /** Rechnungen ohne Nachträge. */
  invoicesBase: number;
  /** Mehrnachträge minus Mindernachträge. */
  supplements: number;
}

export function childrenOf(state: FinanceState, parentId: string | null): FinanceNode[] {
  return state.nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order);
}

export function positionsOf(state: FinanceState, nodeId: string): FinancePosition[] {
  return state.positions.filter((p) => p.nodeId === nodeId).sort((a, b) => a.order - b.order);
}

export function actionTotals(state: FinanceState, node: FinanceNode): FinanceTotals {
  let offers = 0, invoicesBase = 0, supplements = 0;
  for (const p of state.positions) {
    if (p.nodeId !== node.id) continue;
    const amt = p.amount || 0;
    if (p.type === "offer") offers += amt;
    else if (p.type === "invoice") invoicesBase += amt;
    else supplements += p.supplementKind === "minus" ? -amt : amt;
  }
  return {
    estimate: node.estimate || 0,
    offers,
    invoicesBase,
    supplements,
    invoices: invoicesBase + supplements,
  };
}

/** Summiert eine beliebige Positionsliste (z. B. nur erhaltene oder nur angelegte Belege). */
export function positionTotals(positions: FinancePosition[], estimate = 0): FinanceTotals {
  let offers = 0, invoicesBase = 0, supplements = 0;
  for (const p of positions) {
    const amt = p.amount || 0;
    if (p.type === "offer") offers += amt;
    else if (p.type === "invoice") invoicesBase += amt;
    else supplements += p.supplementKind === "minus" ? -amt : amt;
  }
  return { estimate, offers, invoicesBase, supplements, invoices: invoicesBase + supplements };
}


/** Summiert einen Knoten rekursiv; ausgeschaltete Kinder werden ignoriert. */
export function nodeTotals(state: FinanceState, node: FinanceNode): FinanceTotals {
  if (node.type === "action") return actionTotals(state, node);
  const kids = childrenOf(state, node.id).filter((n) => n.enabled);
  const sum = kids.reduce<FinanceTotals>((acc, k) => {
    const t = nodeTotals(state, k);
    return {
      estimate: acc.estimate + t.estimate,
      offers: acc.offers + t.offers,
      invoices: acc.invoices + t.invoices,
      invoicesBase: acc.invoicesBase + t.invoicesBase,
      supplements: acc.supplements + t.supplements,
    };
  }, { estimate: 0, offers: 0, invoices: 0, invoicesBase: 0, supplements: 0 });
  // Eigene Kostenschätzung hat Vorrang, sonst Summe der Kinder.
  return { ...sum, estimate: node.estimate > 0 ? node.estimate : sum.estimate };
}

/** Summe über das gesamte Projekt (alle aktiven Wurzelknoten). */
export function projectTotals(state: FinanceState): FinanceTotals {
  const roots = childrenOf(state, null).filter((n) => n.enabled);
  const sum = roots.reduce<FinanceTotals>((acc, k) => {
    const t = nodeTotals(state, k);
    return {
      estimate: acc.estimate + t.estimate,
      offers: acc.offers + t.offers,
      invoices: acc.invoices + t.invoices,
      invoicesBase: acc.invoicesBase + t.invoicesBase,
      supplements: acc.supplements + t.supplements,
    };
  }, { estimate: 0, offers: 0, invoices: 0, invoicesBase: 0, supplements: 0 });
  return { ...sum, estimate: state.projectEstimate > 0 ? state.projectEstimate : sum.estimate };
}

export interface ControlValue { delta: number; pct: number | null }

/** Kontrolle: Wert im Vergleich zur Basis (Basis = 100 %). */
export function control(base: number, value: number): ControlValue {
  return { delta: value - base, pct: base > 0 ? (value / base) * 100 : null };
}

export function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
}

export function formatPct(p: number | null): string {
  if (p === null) return "–";
  return `${new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p)} %`;
}

export function parseEur(v: string): number {
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}


registerLocalFlusher(async () => {
  const prefix = `${currentAccount() ?? ""}\u0001`;
  for (const [key, pending] of failedWrites) if (key.startsWith(prefix)) {
    write(pending.projectId, pending.state);
    if (failedWrites.has(key)) throw new Error("Finanzdaten sind noch nicht auf dem Gerät gespeichert.");
  }
});
