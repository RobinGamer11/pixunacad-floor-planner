/**
 * tableFormula.ts — Engine-unabhängige Formelauswertung für Tabellenobjekte.
 *
 * Ausgelagert aus `TableElementView`, damit Projektmappe und CAD-Oberfläche
 * dieselbe Auswertung verwenden. Unterstützt Aggregate (SUM/AVG/MIN/MAX/COUNT)
 * mit Bereichen (`A1:A9`) sowie freie Zellarithmetik (`=C2*D2`).
 */

export type FormulaFn = "SUM" | "AVG" | "MIN" | "MAX" | "COUNT";

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

/** Wert einer Zelle: Zahl, Text oder ausgewertete Formel. */
export function evalCell(
  cells: string[][],
  r: number,
  c: number,
  seen: Set<string> = new Set(),
): number | string {
  const raw = cells[r]?.[c] ?? "";
  if (!raw.startsWith("=")) {
    const n = Number(raw.replace(",", "."));
    return raw === "" ? "" : Number.isFinite(n) ? n : raw;
  }
  const key = `${r},${c}`;
  if (seen.has(key)) return "#CIRC";
  seen.add(key);
  try {
    const expr = raw.slice(1);
    const substituted = expr.replace(/(SUM|AVG|AVERAGE|MIN|MAX|COUNT)\(([^)]+)\)/gi, (_m, fn, arg) => {
      const nums: number[] = [];
      for (const part of String(arg).split(",")) {
        const rangeMatch = /^([A-Z]+\d+):([A-Z]+\d+)$/i.exec(part.trim());
        if (rangeMatch) {
          const a = parseRef(rangeMatch[1]);
          const b = parseRef(rangeMatch[2]);
          if (!a || !b) continue;
          const [r1, r2] = [Math.min(a.r, b.r), Math.max(a.r, b.r)];
          const [c1, c2] = [Math.min(a.c, b.c), Math.max(a.c, b.c)];
          for (let rr = r1; rr <= r2; rr++)
            for (let cc = c1; cc <= c2; cc++) {
              const v = evalCell(cells, rr, cc, new Set(seen));
              if (typeof v === "number") nums.push(v);
            }
        } else {
          const ref = parseRef(part);
          if (ref) {
            const v = evalCell(cells, ref.r, ref.c, new Set(seen));
            if (typeof v === "number") nums.push(v);
          } else {
            const n = Number(part);
            if (Number.isFinite(n)) nums.push(n);
          }
        }
      }
      const up = String(fn).toUpperCase();
      if (up === "SUM") return String(nums.reduce((a, x) => a + x, 0));
      if (up === "AVG" || up === "AVERAGE") return String(nums.length ? nums.reduce((a, x) => a + x, 0) / nums.length : 0);
      if (up === "MIN") return String(nums.length ? Math.min(...nums) : 0);
      if (up === "MAX") return String(nums.length ? Math.max(...nums) : 0);
      if (up === "COUNT") return String(nums.length);
      return "0";
    });
    const withRefs = substituted.replace(/[A-Z]+\d+/g, (ref) => {
      const p = parseRef(ref);
      if (!p) return ref;
      const v = evalCell(cells, p.r, p.c, new Set(seen));
      return typeof v === "number" ? String(v) : "0";
    });
    if (!/^[-+*/().\d\s]*$/.test(withRefs)) return "#ERR";
    // eslint-disable-next-line no-new-func
    const val = Function(`"use strict"; return (${withRefs || 0});`)();
    return typeof val === "number" && Number.isFinite(val) ? Math.round(val * 1e6) / 1e6 : "#ERR";
  } catch {
    return "#ERR";
  }
}

/** Anzeigewert einer Zelle (Formeln ausgewertet). */
export function displayValue(cells: string[][], r: number, c: number): string {
  const raw = cells[r]?.[c] ?? "";
  if (!raw.startsWith("=")) return raw;
  return String(evalCell(cells, r, c));
}
