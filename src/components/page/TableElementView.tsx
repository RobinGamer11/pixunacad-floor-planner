import React from "react";
import { Filter, Plus, Minus, Sigma, X as XIcon } from "lucide-react";
import type { PageElement } from "@/lib/projectStore";

/** Kontext, mit dem die Projektmappe der Tabelle mitteilt, dass gerade
 *  „Tabelle modifizieren" aktiv ist. Nur dann werden inline +/-–Knöpfe
 *  zwischen Spalten / Zeilen eingeblendet. */
export const TableModifyContext = React.createContext<boolean>(false);

/** Formel-Picker: welche Aggregations-Funktion gerade platziert werden soll. */
export type FormulaFn = "SUM" | "AVG" | "MIN" | "MAX" | "COUNT";
/** Kontext zum Aktivieren/Steuern des Formel-Klick-Modus (Etappe 3). */
export const TableFormulaPickContext = React.createContext<{
  fn: FormulaFn | null;
  setFn: (f: FormulaFn | null) => void;
} | null>(null);

/** Tabellen-Element für die Projektmappe. */
export function TableElementView({
  element,
  readOnly,
  onChange,
}: {
  element: PageElement;
  readOnly?: boolean;
  onChange: (patch: Partial<PageElement>) => void;
}) {
  const data = element.tableData ?? { cells: [["", ""], ["", ""]], headerRow: true, filters: {} };
  const cells = data.cells;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const filters = data.filters ?? {};
  const headerRow = data.headerRow !== false;
  const borderColor = data.borderColor ?? "hsl(var(--hairline))";
  const borderWidthPx = data.borderWidthPx ?? 1;
  const background = data.background ?? "hsl(var(--surface))";
  const headerBackground = data.headerBackground ?? "hsl(var(--surface-muted))";

  const modifyOn = React.useContext(TableModifyContext) && !readOnly;
  const formulaCtx = React.useContext(TableFormulaPickContext);
  const pickFn = !readOnly ? formulaCtx?.fn ?? null : null;

  const [editing, setEditing] = React.useState<{ r: number; c: number } | null>(null);
  const [openFilter, setOpenFilter] = React.useState<number | null>(null);

  // Formel-Picker Zustand: Zielzelle → Startzelle → Endzelle
  const [pickStep, setPickStep] = React.useState<"target" | "start" | "end">("target");
  const [pickTarget, setPickTarget] = React.useState<{ r: number; c: number } | null>(null);
  const [pickStart, setPickStart] = React.useState<{ r: number; c: number } | null>(null);
  const [pickHover, setPickHover] = React.useState<{ r: number; c: number } | null>(null);

  React.useEffect(() => {
    // Reset picker whenever activation toggles.
    setPickStep("target");
    setPickTarget(null);
    setPickStart(null);
    setPickHover(null);
  }, [pickFn]);

  // Live-Vorschau der Formel, während im Picker-Modus Start/Endzelle gewählt werden.
  const previewFormula = React.useMemo(() => {
    if (!pickFn || !pickTarget) return null;
    const anchor = pickStep === "end" ? pickStart : pickHover;
    const cursor = pickStep === "end" ? pickHover : null;
    if (!anchor) return null;
    const end = cursor ?? anchor;
    const r1 = Math.min(anchor.r, end.r), r2 = Math.max(anchor.r, end.r);
    const c1 = Math.min(anchor.c, end.c), c2 = Math.max(anchor.c, end.c);
    const a = `${colLabel(c1)}${r1 + 1}`;
    const b = `${colLabel(c2)}${r2 + 1}`;
    const range = a === b ? a : `${a}:${b}`;
    const expr = `=${pickFn}(${range})`;
    // Temporäre Zellenmatrix mit Vorschauformel in Zielzelle für Live-Berechnung.
    const tmp = cells.map((row) => row.slice());
    tmp[pickTarget.r][pickTarget.c] = expr;
    const value = evalCell(tmp, pickTarget.r, pickTarget.c);
    return { expr, value: String(value), r1, r2, c1, c2 };
  }, [pickFn, pickTarget, pickStart, pickHover, pickStep, cells]);

  const updateCells = (mutator: (draft: string[][]) => string[][] | void) => {
    const clone = cells.map((row) => row.slice());
    const result = mutator(clone);
    const next: string[][] = Array.isArray(result) ? result : clone;
    onChange({ tableData: { ...data, cells: next } });
  };

  const setCell = (r: number, c: number, v: string) => {
    updateCells((d) => { d[r][c] = v; });
  };

  const addRow = () => updateCells((d) => { d.push(Array(cols).fill("")); });
  const addCol = () => updateCells((d) => d.map((row) => [...row, ""]));
  const delRow = (r: number) => {
    if (rows <= 1) return;
    updateCells((d) => { d.splice(r, 1); });
  };
  const delCol = (c: number) => {
    if (cols <= 1) return;
    updateCells((d) => d.map((row) => { row.splice(c, 1); return row; }));
  };

  const setFilter = (c: number, values: string[] | null) => {
    const nf = { ...filters };
    if (values == null || values.length === 0) delete nf[c];
    else nf[c] = values;
    onChange({ tableData: { ...data, filters: nf } });
  };

  // Filter: sichtbare Zeilen berechnen (Header immer sichtbar).
  const visibleRows: number[] = [];
  for (let r = 0; r < rows; r++) {
    if (headerRow && r === 0) { visibleRows.push(r); continue; }
    let ok = true;
    for (const key of Object.keys(filters)) {
      const c = Number(key);
      const allowed = filters[c];
      const v = evalCell(cells, r, c);
      if (!allowed.includes(String(v))) { ok = false; break; }
    }
    if (ok) visibleRows.push(r);
  }

  const handleCellClick = (r: number, c: number) => {
    if (readOnly) return;
    if (pickFn) {
      if (pickStep === "target") {
        setPickTarget({ r, c });
        setPickStep("start");
      } else if (pickStep === "start") {
        setPickStart({ r, c });
        setPickStep("end");
      } else if (pickStep === "end" && pickTarget && pickStart) {
        const r1 = Math.min(pickStart.r, r), r2 = Math.max(pickStart.r, r);
        const c1 = Math.min(pickStart.c, c), c2 = Math.max(pickStart.c, c);
        const a = `${colLabel(c1)}${r1 + 1}`;
        const b = `${colLabel(c2)}${r2 + 1}`;
        const range = a === b ? a : `${a}:${b}`;
        setCell(pickTarget.r, pickTarget.c, `=${pickFn}(${range})`);
        formulaCtx?.setFn(null);
      }
      return;
    }
    setEditing({ r, c });
  };

  const isCellHighlighted = (r: number, c: number): string | undefined => {
    if (!pickFn) return undefined;
    if (pickTarget && pickTarget.r === r && pickTarget.c === c) return "hsl(var(--accent-gold) / 0.35)";
    if (previewFormula) {
      const { r1, r2, c1, c2 } = previewFormula;
      if (r >= r1 && r <= r2 && c >= c1 && c <= c2) return "hsl(var(--primary) / 0.20)";
    }
    if (pickStart && pickStart.r === r && pickStart.c === c) return "hsl(var(--primary) / 0.25)";
    return undefined;
  };

  return (
    <div
      className="w-full h-full overflow-auto text-[11px] relative"
      style={{ background, color: "hsl(var(--ink))" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {pickFn && (
        <div
          className="sticky top-0 z-20 flex items-center justify-between gap-1 px-2 py-1 text-[10px] font-medium"
          style={{ background: "hsl(var(--accent-gold) / 0.15)", borderBottom: `1px solid ${borderColor}` }}
        >
          <span>
            {pickFn}: {pickStep === "target" ? "Zielzelle wählen" : pickStep === "start" ? "Startzelle wählen" : "Endzelle wählen"}
          </span>
          <button
            onClick={() => formulaCtx?.setFn(null)}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-black/10"
            title="Abbrechen"
          ><XIcon size={10} /></button>
        </div>
      )}
      {modifyOn && (
        <div className="flex gap-0.5 px-1 pt-1">
          {cells[0]?.map((_, c) => (
            <div key={c} className="flex items-center gap-0.5" style={{ flex: 1 }}>
              <button
                onClick={() => delCol(c)}
                disabled={cols <= 1}
                className="w-4 h-4 flex items-center justify-center rounded bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-30"
                title="Spalte löschen"
              ><Minus size={9} /></button>
              <div className="flex-1" />
              <button
                onClick={() => updateCells((d) => d.map((row) => { const nr = [...row]; nr.splice(c + 1, 0, ""); return nr; }))}
                className="w-4 h-4 flex items-center justify-center rounded bg-primary/10 text-primary hover:bg-primary/20"
                title="Spalte rechts einfügen"
              ><Plus size={9} /></button>
            </div>
          ))}
        </div>
      )}
      <table className="border-collapse w-full">
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r}>
              {cells[r].map((_, c) => {
                const isHeader = headerRow && r === 0;
                const value = cells[r][c];
                const display = value.startsWith("=") ? String(evalCell(cells, r, c)) : value;
                const isEditing = editing?.r === r && editing?.c === c;
                const highlight = isCellHighlighted(r, c);
                return (
                  <td
                    key={c}
                    className="align-top relative"
                    style={{
                      border: borderWidthPx > 0 ? `${borderWidthPx}px solid ${borderColor}` : "none",
                      minWidth: 64,
                      background: highlight ?? (isHeader ? headerBackground : undefined),
                      fontWeight: isHeader ? 600 : undefined,
                      cursor: pickFn ? "crosshair" : undefined,
                    }}
                    onDoubleClick={() => !readOnly && !pickFn && setEditing({ r, c })}
                    onClick={(e) => {
                      if ((e as any).pointerType === "touch") { handleCellClick(r, c); return; }
                    }}
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        defaultValue={value}
                        onBlur={(e) => { setCell(r, c, e.target.value); setEditing(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-full h-full px-1.5 py-1 bg-transparent outline-none"
                        style={{ minHeight: 32, fontFamily: value.startsWith("=") ? "monospace" : undefined }}
                      />
                    ) : (
                      <div
                        className="px-1.5 py-1 flex items-center justify-between gap-1"
                        style={{ minHeight: 32 }}
                        onClick={() => handleCellClick(r, c)}
                      >
                        <span className="truncate">{display}</span>
                        {isHeader && !readOnly && !pickFn && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenFilter(openFilter === c ? null : c); }}
                            className="opacity-60 hover:opacity-100"
                            title="Spalte filtern / bearbeiten"
                          >
                            <Filter size={11} className={filters[c] ? "text-primary" : undefined} />
                          </button>
                        )}
                      </div>
                    )}
                    {openFilter === c && isHeader && (
                      <FilterMenu
                        values={uniqueColValues(cells, c, headerRow)}
                        active={filters[c] ?? null}
                        onChange={(v) => setFilter(c, v)}
                        onDeleteCol={() => { delCol(c); setOpenFilter(null); }}
                        onClose={() => setOpenFilter(null)}
                      />
                    )}
                  </td>
                );
              })}
              {modifyOn && (
                <td className="border-0 pl-1 align-middle" style={{ width: 44 }}>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => delRow(r)}
                      disabled={rows <= 1 || (headerRow && r === 0)}
                      className="w-4 h-4 flex items-center justify-center rounded bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-30"
                      title="Zeile löschen"
                    ><Minus size={9} /></button>
                    <button
                      onClick={() => updateCells((d) => { const nr = Array(cols).fill(""); d.splice(r + 1, 0, nr); })}
                      className="w-4 h-4 flex items-center justify-center rounded bg-primary/10 text-primary hover:bg-primary/20"
                      title="Zeile unten einfügen"
                    ><Plus size={9} /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {modifyOn && (
        <div className="flex gap-1 p-1">
          <button
            onClick={() => {
              const r = editing?.r ?? rows - 1;
              const c = editing?.c ?? cols - 1;
              const startR = headerRow ? 1 : 0;
              if (r <= startR) return;
              const colLetter = colLabel(c);
              setCell(r, c, `=SUM(${colLetter}${startR + 1}:${colLetter}${r})`);
            }}
            className="h-6 px-2 text-[10px] rounded border flex items-center gap-1"
            style={{ borderColor: "hsl(var(--hairline))" }}
            title="Summenformel in aktive Zelle einfügen"
          ><Sigma size={10} /> Summe</button>
        </div>
      )}
    </div>
  );
}

function uniqueColValues(cells: string[][], c: number, headerRow: boolean): string[] {
  const set = new Set<string>();
  for (let r = headerRow ? 1 : 0; r < cells.length; r++) {
    const v = evalCell(cells, r, c);
    set.add(String(v));
  }
  return [...set].sort();
}

function FilterMenu({
  values,
  active,
  onChange,
  onDeleteCol,
  onClose,
}: {
  values: string[];
  active: string[] | null;
  onChange: (v: string[] | null) => void;
  onDeleteCol: () => void;
  onClose: () => void;
}) {
  const [local, setLocal] = React.useState<Set<string>>(new Set(active ?? values));
  const toggle = (v: string) => {
    const n = new Set(local);
    if (n.has(v)) n.delete(v); else n.add(v);
    setLocal(n);
  };
  return (
    <div
      className="absolute z-30 top-full left-0 mt-1 rounded-md shadow-lg border p-2 min-w-[160px]"
      style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="max-h-40 overflow-auto space-y-0.5 mb-2">
        {values.length === 0 && <div className="text-[10px] text-muted-foreground">Keine Werte</div>}
        {values.map((v) => (
          <label key={v} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
            <input type="checkbox" checked={local.has(v)} onChange={() => toggle(v)} />
            <span className="truncate">{v || "(leer)"}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => { onChange(local.size === values.length ? null : [...local]); onClose(); }}
          className="h-6 px-2 text-[10px] rounded border"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >Übernehmen</button>
        <button
          onClick={() => { onChange(null); onClose(); }}
          className="h-6 px-2 text-[10px] rounded border"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >Alle</button>
        <button
          onClick={onDeleteCol}
          className="h-6 px-2 text-[10px] rounded border text-destructive"
          style={{ borderColor: "hsl(var(--hairline))" }}
          title="Diese Spalte löschen"
        >Spalte löschen</button>
      </div>
    </div>
  );
}

// ─── Formel-Auswertung ────────────────────────────────────────────────────
export function colLabel(c: number): string {
  let s = "";
  let n = c;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c: c - 1, r: parseInt(m[2], 10) - 1 };
}

export function evalCell(cells: string[][], r: number, c: number, seen: Set<string> = new Set()): number | string {
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
      for (const part of arg.split(",")) {
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
      const up = fn.toUpperCase();
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
