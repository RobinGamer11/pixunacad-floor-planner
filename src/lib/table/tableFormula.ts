/**
 * tableFormula.ts — Engine-unabhängige Formelauswertung für Tabellenobjekte.
 *
 * Gemeinsamer Kern für Projektmappe und CAD-Oberfläche. Unterstützt
 *  - Aggregate `SUM/AVG/MIN/MAX/COUNT` mit Bereichen (`A1:A9`),
 *  - freie Zellarithmetik (`=C2*D2`),
 *  - tabellenübergreifende Bezüge (`=Tabelle1!B2`, `='Kosten 1'!A1:A9`),
 *  - definierte Fehlerwerte `#REF!`, `#CIRC!`, `#DIV/0!`, `#ERR!`.
 */

import { tableRegistry } from "./tableRegistry";

export type FormulaFn = "SUM" | "AVG" | "MIN" | "MAX" | "COUNT";

export const FORMULA_ERRORS = ["#REF!", "#CIRC!", "#DIV/0!", "#ERR!"] as const;
export type FormulaError = (typeof FORMULA_ERRORS)[number];

export function isFormulaError(v: unknown): v is FormulaError {
  return typeof v === "string" && (FORMULA_ERRORS as readonly string[]).includes(v);
}

/** Kontext einer Auswertung — erlaubt Bezüge auf andere Tabellenobjekte. */
export interface FormulaContext {
  /** ID der Tabelle, zu der `cells` gehört (für Zyklusprüfung und Selbstbezug). */
  tableId?: string;
  /** Auflösung fremder Tabellen; Default: globale `tableRegistry`. */
  resolve?: (nameOrId: string) => { id: string; cells: string[][] } | null;
}

/** Spaltenindex → Spaltenbuchstabe (0 → A, 26 → AA). */
export function colLabel(c: number): string {
  let s = "";
  let n = c;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** "B3" → { r: 2, c: 1 } */
export function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c: c - 1, r: parseInt(m[2], 10) - 1 };
}

/** Bereichsausdruck für zwei Eckzellen ("A1" oder "A1:C4"). */
export function rangeExpr(r1: number, c1: number, r2: number, c2: number): string {
  const a = `${colLabel(Math.min(c1, c2))}${Math.min(r1, r2) + 1}`;
  const b = `${colLabel(Math.max(c1, c2))}${Math.max(r1, r2) + 1}`;
  return a === b ? a : `${a}:${b}`;
}

/** Qualifizierter Bezug auf eine fremde Tabelle (`Tabelle1!B2`). */
export function qualifyRef(tableName: string, ref: string): string {
  const name = (tableName || "").trim();
  if (!name) return ref;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `${name}!${ref}` : `'${name}'!${ref}`;
}

/** Zerlegt einen (evtl. qualifizierten) Bezug in Tabellenname und Zellteil. */
export function splitQualified(token: string): { table: string | null; rest: string } {
  const m = /^\s*(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_äöüÄÖÜß .-]*?))\s*!\s*(.+)$/.exec(token);
  if (!m) return { table: null, rest: token.trim() };
  return { table: (m[1] ?? m[2]).trim(), rest: m[3].trim() };
}

/* Tokens: optional 'Name'! oder Name! gefolgt von A1 bzw. A1:B9 */
const REF_TOKEN = /(?:'[^']+'|[A-Za-z_][A-Za-z0-9_äöüÄÖÜß.-]*)?!?\s*[A-Z]+\d+(?::[A-Z]+\d+)?/g;
const SINGLE_REF = /(?:(?:'[^']+'|[A-Za-z_][A-Za-z0-9_äöüÄÖÜß.-]*)!)?[A-Z]+\d+/g;
const RANGE_REF = /((?:'[^']+'|[A-Za-z_][A-Za-z0-9_äöüÄÖÜß.-]*)!)?([A-Z]+\d+):((?:'[^']+'|[A-Za-z_][A-Za-z0-9_äöüÄÖÜß.-]*)!)?([A-Z]+\d+)/g;

interface Scope {
  id: string;
  cells: string[][];
}

function defaultResolve(nameOrId: string): { id: string; cells: string[][] } | null {
  const t = tableRegistry.resolve(nameOrId);
  return t ? { id: t.id, cells: t.cells } : null;
}

function scopeFor(token: string | null, base: Scope, ctx: FormulaContext): Scope | null {
  if (!token) return base;
  const resolve = ctx.resolve ?? defaultResolve;
  const t = resolve(token);
  return t ? { id: t.id, cells: t.cells } : null;
}

function cellValue(scope: Scope, r: number, c: number, ctx: FormulaContext, seen: Set<string>): number | string {
  if (r < 0 || c < 0 || r >= scope.cells.length || c >= (scope.cells[r]?.length ?? 0)) return "#REF!";
  return evaluate(scope, r, c, ctx, seen);
}

/** Sammelt Zahlenwerte eines (evtl. qualifizierten) Bereichs/Bezugs. */
function collectNumbers(part: string, base: Scope, ctx: FormulaContext, seen: Set<string>, out: number[]): FormulaError | null {
  const trimmed = part.trim();
  if (!trimmed) return null;
  const { table, rest } = splitQualified(trimmed);
  const scope = scopeFor(table, base, ctx);
  if (!scope) return "#REF!";

  const rangeMatch = /^([A-Z]+\d+):([A-Z]+\d+)$/i.exec(rest);
  if (rangeMatch) {
    const a = parseRef(rangeMatch[1]);
    const b = parseRef(rangeMatch[2]);
    if (!a || !b) return "#REF!";
    for (let rr = Math.min(a.r, b.r); rr <= Math.max(a.r, b.r); rr++) {
      for (let cc = Math.min(a.c, b.c); cc <= Math.max(a.c, b.c); cc++) {
        if (rr >= scope.cells.length || cc >= (scope.cells[rr]?.length ?? 0)) continue;
        const v = cellValue(scope, rr, cc, ctx, new Set(seen));
        if (isFormulaError(v)) return v;
        if (typeof v === "number") out.push(v);
      }
    }
    return null;
  }

  const ref = parseRef(rest);
  if (ref) {
    const v = cellValue(scope, ref.r, ref.c, ctx, new Set(seen));
    if (isFormulaError(v)) return v;
    if (typeof v === "number") out.push(v);
    return null;
  }
  const n = Number(rest.replace(",", "."));
  if (Number.isFinite(n)) out.push(n);
  return null;
}

function evaluate(scope: Scope, r: number, c: number, ctx: FormulaContext, seen: Set<string>): number | string {
  const raw = scope.cells[r]?.[c] ?? "";
  if (!raw.startsWith("=")) {
    const n = Number(raw.replace(",", "."));
    return raw === "" ? "" : Number.isFinite(n) ? n : raw;
  }
  const key = `${scope.id}|${r},${c}`;
  if (seen.has(key)) return "#CIRC!";
  seen.add(key);

  try {
    let error: FormulaError | null = null;
    const expr = raw.slice(1);

    // 1) Aggregatfunktionen auflösen.
    const substituted = expr.replace(/(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\(([^)]*)\)/gi, (_m, fn, arg) => {
      const nums: number[] = [];
      for (const part of String(arg).split(",")) {
        const err = collectNumbers(part, scope, ctx, seen, nums);
        if (err) { error = err; return "0"; }
      }
      const up = String(fn).toUpperCase();
      if (up === "SUM") return String(nums.reduce((a, x) => a + x, 0));
      if (up === "AVG" || up === "AVERAGE") return String(nums.length ? nums.reduce((a, x) => a + x, 0) / nums.length : 0);
      if (up === "MIN") return String(nums.length ? Math.min(...nums) : 0);
      if (up === "MAX") return String(nums.length ? Math.max(...nums) : 0);
      if (up === "COUNT") return String(nums.length);
      return "0";
    });
    if (error) return error;

    // 2) Verbleibende Bereiche außerhalb von Funktionen sind ungültig.
    RANGE_REF.lastIndex = 0;
    if (RANGE_REF.test(substituted)) return "#ERR!";

    // 3) Einzelbezüge (auch qualifiziert) ersetzen.
    SINGLE_REF.lastIndex = 0;
    const withRefs = substituted.replace(SINGLE_REF, (token) => {
      const { table, rest } = splitQualified(token);
      const s = scopeFor(table, scope, ctx);
      if (!s) { error = "#REF!"; return "0"; }
      const p = parseRef(rest);
      if (!p) { error = "#REF!"; return "0"; }
      const v = cellValue(s, p.r, p.c, ctx, new Set(seen));
      if (isFormulaError(v)) { error = v; return "0"; }
      return typeof v === "number" ? String(v) : "0";
    });
    if (error) return error;

    if (!/^[-+*/().,\d\s]*$/.test(withRefs)) return "#ERR!";
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${withRefs || 0});`)();
    if (typeof val !== "number") return "#ERR!";
    if (!Number.isFinite(val)) return Number.isNaN(val) ? "#ERR!" : "#DIV/0!";
    return Math.round(val * 1e6) / 1e6;
  } catch {
    return "#ERR!";
  }
}

/** Wert einer Zelle: Zahl, Text oder ausgewertete Formel. */
export function evalCell(
  cells: string[][],
  r: number,
  c: number,
  ctx: FormulaContext = {},
): number | string {
  const scope: Scope = { id: ctx.tableId || "__local__", cells };
  return evaluate(scope, r, c, ctx, new Set());
}

/** Anzeigewert einer Zelle (Formeln ausgewertet). */
export function displayValue(cells: string[][], r: number, c: number, ctx: FormulaContext = {}): string {
  const raw = cells[r]?.[c] ?? "";
  if (!raw.startsWith("=")) return raw;
  return String(evalCell(cells, r, c, ctx));
}

/**
 * Alle Zellbezüge einer Formel — für die farbige Hervorhebung während der
 * Eingabe. Liefert die Bezüge in Reihenfolge ihres Auftretens.
 */
export function extractRefs(formula: string): {
  table: string | null; r1: number; c1: number; r2: number; c2: number; token: string;
}[] {
  const out: { table: string | null; r1: number; c1: number; r2: number; c2: number; token: string }[] = [];
  if (!formula || !formula.startsWith("=")) return out;
  REF_TOKEN.lastIndex = 0;
  const seen = new Set<string>();
  for (const m of formula.slice(1).matchAll(REF_TOKEN)) {
    const token = m[0].trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    const { table, rest } = splitQualified(token);
    const parts = rest.split(":");
    const a = parseRef(parts[0]);
    if (!a) continue;
    const b = parts[1] ? parseRef(parts[1]) : a;
    if (!b) continue;
    out.push({
      table,
      r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c),
      r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c),
      token,
    });
  }
  return out;
}

/** Farbpalette für die Bezugs-Hervorhebung (Reihenfolge = Bezugsindex). */
export const REF_COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2"];

/** true, wenn nach diesem Formeltext ein Klick einen Bezug einfügen darf. */
export function acceptsRefInsert(formula: string, caret: number): boolean {
  if (!formula.startsWith("=")) return false;
  const before = formula.slice(0, caret).replace(/\s+$/, "");
  if (before === "=") return true;
  return /[=+\-*/(,:]$/.test(before);
}
