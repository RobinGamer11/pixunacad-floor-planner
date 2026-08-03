// Store für die Finanzen-Oberfläche. Persistiert projektbezogen in localStorage.

export type FinanceKind = "income" | "expense";

export interface FinanceStatusDef { id: string; label: string; color: string }

export interface FinanceEntry {
  id: string;
  kind: FinanceKind;
  title: string;
  amount: number;          // EUR (netto oder brutto, je nach Eingabe)
  category?: string;
  status?: string;         // id aus FinanceState.statuses
  date?: string;           // YYYY-MM-DD
  contractor?: string;     // Firma / Empfänger
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface FinanceState {
  categories: string[];
  statuses: FinanceStatusDef[];
  entries: FinanceEntry[];
  /** Gesamtbudget des Projekts in EUR. */
  budget: number;
}

const DEFAULT_STATUSES: FinanceStatusDef[] = [
  { id: "planned", label: "Geplant", color: "#94a3b8" },
  { id: "open", label: "Offen", color: "#f59e0b" },
  { id: "paid", label: "Bezahlt", color: "#10b981" },
];

const DEFAULT_CATEGORIES = ["Allgemein", "Rohbau", "Elektro", "Sanitär", "Material", "Honorar"];

const KEY = (projectId: string) => `pixuna.finance.${projectId}`;

const uid = () => `f-${Math.random().toString(36).slice(2, 10)}`;

function emptyState(): FinanceState {
  return {
    categories: [...DEFAULT_CATEGORIES],
    statuses: [...DEFAULT_STATUSES],
    entries: [],
    budget: 0,
  };
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read(projectId: string): FinanceState {
  try {
    const raw = localStorage.getItem(KEY(projectId));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<FinanceState>;
    return {
      categories: parsed.categories?.length ? parsed.categories : [...DEFAULT_CATEGORIES],
      statuses: parsed.statuses?.length ? parsed.statuses : [...DEFAULT_STATUSES],
      entries: parsed.entries ?? [],
      budget: typeof parsed.budget === "number" ? parsed.budget : 0,
    };
  } catch {
    return emptyState();
  }
}

function write(projectId: string, state: FinanceState) {
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

export const financeStore = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get(projectId: string): FinanceState {
    return read(projectId);
  },
  addEntry(projectId: string, kind: FinanceKind): FinanceEntry {
    const s = read(projectId);
    const now = Date.now();
    const entry: FinanceEntry = {
      id: uid(),
      kind,
      title: kind === "income" ? "Neue Einnahme" : "Neue Ausgabe",
      amount: 0,
      category: s.categories[0],
      status: s.statuses[0]?.id,
      date: new Date().toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now,
    };
    s.entries = [entry, ...s.entries];
    write(projectId, s);
    return entry;
  },
  updateEntry(projectId: string, id: string, patch: Partial<FinanceEntry>) {
    const s = read(projectId);
    s.entries = s.entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e));
    write(projectId, s);
  },
  deleteEntry(projectId: string, id: string) {
    const s = read(projectId);
    s.entries = s.entries.filter((e) => e.id !== id);
    write(projectId, s);
  },
  setBudget(projectId: string, budget: number) {
    const s = read(projectId);
    s.budget = budget;
    write(projectId, s);
  },
  addCategory(projectId: string, label: string) {
    const s = read(projectId);
    if (!s.categories.includes(label)) s.categories = [...s.categories, label];
    write(projectId, s);
  },
  removeCategory(projectId: string, label: string) {
    const s = read(projectId);
    s.categories = s.categories.filter((c) => c !== label);
    write(projectId, s);
  },
  addStatus(projectId: string, label: string, color: string) {
    const s = read(projectId);
    s.statuses = [...s.statuses, { id: uid(), label, color }];
    write(projectId, s);
  },
  removeStatus(projectId: string, id: string) {
    const s = read(projectId);
    s.statuses = s.statuses.filter((x) => x.id !== id);
    write(projectId, s);
  },
};

export function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n || 0);
}
