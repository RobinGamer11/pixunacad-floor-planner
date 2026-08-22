/**
 * tableRegistry.ts — projektweite Registrierung aller sichtbaren Tabellen.
 *
 * Zweck:
 *  1. **Tabellenübergreifende Formeln**: `=Tabelle1!B2` muss die Zellen einer
 *     anderen Tabelle auflösen können — unabhängig davon, ob die Tabelle in der
 *     Projektmappe oder in der CAD-Oberfläche liegt.
 *  2. **Interaktive Formeleingabe über Tabellengrenzen hinweg**: Während in
 *     einer Tabelle eine Formel getippt wird, kann in eine Zelle einer anderen
 *     Tabelle geklickt werden; der Bezug wird dann qualifiziert eingefügt.
 *  3. **Tabellenmodus-Flag**: Globale Entf-Shortcuts dürfen im Zellmodus nicht
 *     das ganze Tabellenobjekt löschen.
 *
 * Bewusst ein einfacher Modul-Singleton ohne Persistenz: Namen und IDs liegen
 * im Tabellenmodell (`TableData.tableId` / `TableData.name`), die Registry ist
 * nur die Laufzeit-Sicht darauf.
 */

export interface RegisteredTable {
  id: string;
  name: string;
  cells: string[][];
}

type Listener = () => void;

const tables = new Map<string, RegisteredTable>();
const listeners = new Set<Listener>();

function emit() { listeners.forEach((l) => { try { l(); } catch { /* noop */ } }); }

/** Laufende interaktive Formeleingabe (genau eine gleichzeitig). */
export interface FormulaSession {
  /** ID der Tabelle, in deren Zelle gerade getippt wird. */
  tableId: string;
  /** Fügt einen Zellbezug an der Caretposition ein. */
  insertRef: (ref: string) => void;
}

let session: FormulaSession | null = null;

/** Zähler offener Tabellen-Zellmodi (>0 ⇒ Entf gehört der Tabelle). */
let editDepth = 0;

export const tableRegistry = {
  subscribe(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  register(entry: RegisteredTable) {
    const prev = tables.get(entry.id);
    if (prev && prev.name === entry.name && prev.cells === entry.cells) return;
    tables.set(entry.id, entry);
    emit();
  },

  unregister(id: string) {
    if (tables.delete(id)) emit();
  },

  get(id: string): RegisteredTable | null { return tables.get(id) ?? null; },

  list(): RegisteredTable[] { return [...tables.values()]; },

  /** Auflösung per ID oder (case-insensitiv) per Anzeigename. */
  resolve(nameOrId: string): RegisteredTable | null {
    const key = (nameOrId || "").trim().replace(/^'|'$/g, "");
    if (!key) return null;
    const byId = tables.get(key);
    if (byId) return byId;
    const lower = key.toLowerCase();
    for (const t of tables.values()) if (t.name.toLowerCase() === lower) return t;
    return null;
  },

  /** Freier Standardname („Tabelle3“), der noch nicht vergeben ist. */
  suggestName(): string {
    const used = new Set([...tables.values()].map((t) => t.name.toLowerCase()));
    for (let i = 1; i < 999; i++) {
      const n = `Tabelle${i}`;
      if (!used.has(n.toLowerCase())) return n;
    }
    return `Tabelle${Date.now()}`;
  },

  /* ---- Interaktive Formeleingabe ---- */
  beginSession(s: FormulaSession) { session = s; },
  endSession(tableId?: string) {
    if (!tableId || session?.tableId === tableId) session = null;
  },
  getSession(): FormulaSession | null { return session; },

  /* ---- Zellmodus ---- */
  setCellModeActive(active: boolean) {
    editDepth = Math.max(0, editDepth + (active ? 1 : -1));
  },
  isCellModeActive(): boolean { return editDepth > 0; },
};
