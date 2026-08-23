// Store für die Finanzen-Oberfläche. Persistiert projektbezogen in localStorage.
//
// Struktur:
//   Projekt (virtueller Wurzelknoten)
//     └─ Übersicht  (z. B. "01 Rohbau")
//          └─ Aktion (z. B. "Tiefbau Müller GmbH")  → enthält Positionen

export type FinanceNodeType = "overview" | "action";
export type FinancePositionType = "offer" | "invoice" | "supplement";
export type SupplementKind = "plus" | "minus";

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
}

export interface FinanceState {
  nodes: FinanceNode[];
  positions: FinancePosition[];
  /** Kostenschätzung auf Projektebene. */
  projectEstimate: number;
  projectNote: string;
}

import { migrateFinanceState, migrateProjectPages, stampVersion, FINANCE_KIND } from "./persistence";

const KEY = (projectId: string) => `pixuna.finance.v2.${projectId}`;

const uid = () => `f-${Math.random().toString(36).slice(2, 10)}`;

function emptyState(): FinanceState {
  return { nodes: [], positions: [], projectEstimate: 0, projectNote: "" };
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read(projectId: string): FinanceState {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (!raw) return emptyState();
    const parsed = migrateFinanceState(JSON.parse(raw)) as Partial<FinanceState>;
    return {
      nodes: (parsed.nodes ?? []).map((n) => ({ ...n, enabled: n.enabled !== false })),
      positions: parsed.positions ?? [],
      projectEstimate: typeof parsed.projectEstimate === "number" ? parsed.projectEstimate : 0,
      projectNote: parsed.projectNote ?? "",
    };
  } catch {
    return emptyState();
  }
}

function write(projectId: string, state: FinanceState) {
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify(stampVersion(FINANCE_KIND, { ...state })));
  } catch {}
  listeners.forEach((l) => l());
}

function nextOrder(items: { order: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.order), 0) + 1;
}

export const financeStore = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get(projectId: string): FinanceState {
    return read(projectId);
  },

  // ---------- Knoten ----------
  addNode(projectId: string, type: FinanceNodeType, parentId: string | null): FinanceNode {
    const s = read(projectId);
    const siblings = s.nodes.filter((n) => n.parentId === parentId);
    const node: FinanceNode = {
      id: uid(),
      type,
      parentId,
      name: type === "overview" ? "Neuer Ordner" : "Neue Anlage",
      note: "",
      estimate: 0,
      enabled: true,
      order: nextOrder(siblings),
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
  addPosition(projectId: string, nodeId: string, type: FinancePositionType): FinancePosition {
    const s = read(projectId);
    const own = s.positions.filter((p) => p.nodeId === nodeId);
    const pos: FinancePosition = {
      id: uid(),
      nodeId,
      type,
      supplementKind: type === "supplement" ? "plus" : undefined,
      date: new Date().toISOString().slice(0, 10),
      number: "",
      amount: 0,
      note: "",
      order: nextOrder(own),
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

/** Summiert eine beliebige Positionsliste (z. B. nur archivierte oder nur angelegte Belege). */
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

// ------------------------------------------------- Vorlagen (Projektmappe)

export const TEMPLATE_LABEL: Record<FinancePositionType, string> = {
  offer: "Angebot",
  invoice: "Rechnung",
  supplement: "Nachtrag",
};

/** Schlüssel einer Vorlagenseite in der Projektmappe. */
export function templateKeyOf(type: FinancePositionType, positionId: string): string {
  return `fin:${type}:${positionId}`;
}

export function parseTemplateKey(key: string): { type: FinancePositionType; positionId: string } | null {
  const m = /^fin:(offer|invoice|supplement):(.+)$/.exec(key);
  return m ? { type: m[1] as FinancePositionType, positionId: m[2] } : null;
}

const FAV_KEY = (projectId: string, type: FinancePositionType) =>
  `pixuna.finance.tplfav.${projectId}.${type}`;

/**
 * Favoriten-Vorlage (Seiten-Snapshot) lesen.
 * Bestandsdaten ohne Versionsfeld (Legacy/v0) laufen durch dieselbe additive
 * Seiten-Migration wie Projektseiten — sichtbare Eigenschaften bleiben 1:1.
 */
export function getFavoriteTemplate<T = unknown>(projectId: string, type: FinancePositionType): T[] | undefined {
  try {
    const raw = localStorage.getItem(FAV_KEY(projectId, type));
    if (!raw) return undefined;
    const parsed = migrateProjectPages(JSON.parse(raw));
    return Array.isArray(parsed) && parsed.length ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}


/** Favoriten-Vorlage setzen (Snapshot der aktuellen Vorlagenseiten). */
export function setFavoriteTemplate(projectId: string, type: FinancePositionType, pages: unknown[]) {
  try { localStorage.setItem(FAV_KEY(projectId, type), JSON.stringify(pages)); } catch {}
}
