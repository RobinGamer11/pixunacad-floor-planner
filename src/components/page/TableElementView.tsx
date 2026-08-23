import React from "react";
import { Filter, X as XIcon } from "lucide-react";
import type { PageElement } from "@/lib/projectStore";
import {
  normalizeTable,
  toTableData,
  cellKey,
  effectiveFormat,
  effectiveBorders,
  isCovered,
  mergeCovering,
  tableWidthMm,
  tableHeightMm,
  MIN_COL_MM,
  MIN_ROW_MM,
  formatCellDisplay,
  type TableModel,
} from "@/lib/table/tableModel";

import { cellRectMm, layoutTable } from "@/lib/table/tableLayout";
import {
  acceptsRefInsert,
  colLabel,
  evalCell,
  extractRefs,
  qualifyRef,
  rangeExpr,
  REF_COLORS,
  type FormulaFn,
} from "@/lib/table/tableFormula";
import { tableRegistry } from "@/lib/table/tableRegistry";

export type { FormulaFn };
export { colLabel, evalCell };


/** Legacy-Kontext (bleibt für Kompatibilität erhalten, steuert nichts mehr). */
export const TableModifyContext = React.createContext<boolean>(false);

/** Formel-Picker: welche Aggregations-Funktion gerade platziert werden soll. */
export const TableFormulaPickContext = React.createContext<{
  fn: FormulaFn | null;
  setFn: (f: FormulaFn | null) => void;
} | null>(null);

export interface TableSelection { r1: number; c1: number; r2: number; c2: number; }

/** Zellauswahl + Bearbeitungsmodus — geteilt mit dem Einstellungs-Panel. */
export const TableEditContext = React.createContext<{
  /** Element-ID, deren interner Tabellenmodus aktiv ist (null = Objektmodus). */
  editId: string | null;
  setEditId: (id: string | null) => void;
  selection: TableSelection | null;
  setSelection: (s: TableSelection | null) => void;
  /** Raster-Vorgabe für neu platzierte Tabellen. */
  newCols: number;
  newRows: number;
  setNewCols: (v: number) => void;
  setNewRows: (v: number) => void;
} | null>(null);

export const normSel = (s: TableSelection): TableSelection => ({
  r1: Math.min(s.r1, s.r2), c1: Math.min(s.c1, s.c2),
  r2: Math.max(s.r1, s.r2), c2: Math.max(s.c1, s.c2),
});

/**
 * Tabellen-Element für die Projektmappe.
 *
 * Zwei strikt getrennte Modi:
 *  - Objektmodus (Default): die Tabelle ist ein einziges Objekt. Alle Zeiger-
 *    ereignisse laufen an die Auswahl-/HUB-Logik der Seite (Verschieben,
 *    Drehen, Skalieren, Kopieren, Löschen, Ebenen).
 *  - Tabellenmodus (`editing`, via Doppelklick / Panel): Zellauswahl,
 *    Texteingabe, Tab/Enter-Navigation, Spalten-/Zeilengrößen per Ziehen.
 * Beide Modi sind nie gleichzeitig aktiv.
 */
export function TableElementView({
  element,
  readOnly,
  editing,
  pageWmm,
  pageHmm,
  onChange,
  onExitEdit,
}: {
  element: PageElement;
  readOnly?: boolean;
  editing?: boolean;
  pageWmm?: number;
  pageHmm?: number;
  onChange: (patch: Partial<PageElement>) => void;
  onExitEdit?: () => void;
}) {
  const model = React.useMemo(() => normalizeTable(element.tableData as any), [element.tableData]);
  const lay = React.useMemo(() => layoutTable(model), [model]);
  const rows = lay.rows;
  const cols = lay.cols;
  const filtersEnabled = model.filtersEnabled === true;
  const filters = filtersEnabled ? (model.filters ?? {}) : {};
  const headerRow = model.headerRow !== false;
  const borderColor = model.borderColor ?? "hsl(var(--hairline))";
  const borderWidthPx = model.borderWidthPx ?? 1;
  const background = model.background ?? "hsl(var(--surface))";

  const editCtx = React.useContext(TableEditContext);
  const formulaCtx = React.useContext(TableFormulaPickContext);
  const pickFn = !readOnly && editing ? formulaCtx?.fn ?? null : null;
  const active = !!editing && !readOnly;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [pxPerMm, setPxPerMm] = React.useState(3);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0 && lay.widthMm > 0) setPxPerMm(w / lay.widthMm);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lay.widthMm]);

  const [editCell, setEditCell] = React.useState<{ r: number; c: number } | null>(null);
  /** Aktueller Eingabewert der offenen Zelle — für „Klick in andere Zelle speichert". */
  const editValueRef = React.useRef<string | null>(null);
  /** Kontrollierter Text der offenen Zelle (nötig für die Formeleingabe). */
  const [editText, setEditText] = React.useState<string>("");
  /** Startwert, wenn die Eingabe durch Tippen geöffnet wurde. */
  const pendingSeed = React.useRef<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Öffnen/Schließen einer Zelleingabe setzt den kontrollierten Text.
  React.useEffect(() => {
    if (!editCell) { setEditText(""); pendingSeed.current = null; return; }
    const seed = pendingSeed.current ?? (model.cells[editCell.r]?.[editCell.c] ?? "");
    pendingSeed.current = null;
    setEditText(seed);
    editValueRef.current = seed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCell]);

  const [openFilter, setOpenFilter] = React.useState<number | null>(null);
  const selection = editCtx?.selection ?? null;

  React.useEffect(() => {
    if (!active) { setEditCell(null); setOpenFilter(null); }
  }, [active]);

  /* ─── Identität: stabile ID + Name für tabellenübergreifende Formeln ───── */
  const tableId = (model.tableId as string) || element.id;
  const tableName = (model.name as string) || "";
  const namedRef = React.useRef(false);

  /** Fremde Tabellen dürfen während einer laufenden Formeleingabe Klicks annehmen. */
  const [sessionTick, setSessionTick] = React.useState(0);
  React.useEffect(() => tableRegistry.subscribe(() => setSessionTick((n) => n + 1)), []);
  const session = tableRegistry.getSession();
  const foreignSession = !!session && session.tableId !== tableId;

  React.useEffect(() => {
    tableRegistry.register({ id: tableId, name: tableName || tableId, cells: model.cells });
    return () => { if (!readOnly) tableRegistry.unregister(tableId); };
  }, [tableId, tableName, model.cells, readOnly]);

  /** Zellmodus global melden — globale Entf-Shortcuts dürfen dann nicht greifen. */
  React.useEffect(() => {
    if (!active) return;
    tableRegistry.setCellModeActive(true);
    return () => tableRegistry.setCellModeActive(false);
  }, [active]);


  // ─── Persistenz ─────────────────────────────────────────────────────────
  /** Modell speichern und Objektgröße an die mm-Summen angleichen. */
  const commit = React.useCallback((next: TableModel) => {
    const wMm = tableWidthMm(next);
    const hMm = tableHeightMm(next);
    const patch: Partial<PageElement> = { tableData: toTableData(next) as any, wMm, hMm };
    if (pageWmm && pageHmm) {
      patch.w = Math.max(1, Math.min(100, (wMm / pageWmm) * 100));
      patch.h = Math.max(1, Math.min(100, (hMm / pageHmm) * 100));
    }
    onChange(patch);
  }, [onChange, pageWmm, pageHmm]);

  /** Offene Zelleingabe übernehmen (ohne Enter). */
  const flushEdit = () => {
    const cur = editCell;
    const v = editValueRef.current;
    editValueRef.current = null;
    if (!cur || v == null) return;
    if (model.cells[cur.r]?.[cur.c] === v) return;
    setCell(cur.r, cur.c, v);
  };

  const setCell = (r: number, c: number, v: string) => {
    const cells = model.cells.map((row) => row.slice());
    cells[r][c] = v;
    commit({ ...model, cells });
  };

  const setFilter = (c: number, values: string[] | null) => {
    const nf = { ...filters };
    if (values == null || values.length === 0) delete nf[c];
    else nf[c] = values;
    commit({ ...model, filters: nf });
  };

  /** Fehlende Identität einmalig persistieren (ID + sprechender Name). */
  React.useEffect(() => {
    if (readOnly || namedRef.current) return;
    if (model.tableId && model.name) return;
    namedRef.current = true;
    commit({
      ...model,
      tableId: model.tableId || element.id,
      name: model.name || tableRegistry.suggestName(),
    });
  }, [readOnly, model, element.id, commit]);

  /* ─── Interaktive Formeleingabe (=, dann Zellen anklicken) ──────────────── */
  const isFormulaInput = editText.startsWith("=");
  /** Beim Ziehen erzeugter Bereich: Position des zuletzt eingefügten Bezugs. */
  const refDragRef = React.useRef<{ start: { r: number; c: number }; at: number; len: number; prefix: string } | null>(null);

  /** Bezug an der Caretposition einsetzen (ersetzt einen laufenden Zug-Bezug). */
  const insertRefAt = React.useCallback((ref: string, replaceLast = false) => {
    const input = inputRef.current;
    const text = editText;
    const drag = refDragRef.current;
    let at = input?.selectionStart ?? text.length;
    let head = text.slice(0, at);
    let tail = text.slice(at);
    if (replaceLast && drag) {
      head = text.slice(0, drag.at);
      tail = text.slice(drag.at + drag.len);
      at = drag.at;
    }
    const next = head + ref + tail;
    setEditText(next);
    editValueRef.current = next;
    if (drag) { drag.at = at; drag.len = ref.length; }
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const pos = at + ref.length;
      try { el.setSelectionRange(pos, pos); } catch { /* noop */ }
    });
  }, [editText]);

  /** Solange eine Formel getippt wird: Sitzung für Klicks in fremde Tabellen. */
  React.useEffect(() => {
    if (!active || !editCell || !isFormulaInput) { tableRegistry.endSession(tableId); return; }
    tableRegistry.beginSession({
      tableId,
      insertRef: (ref: string) => insertRefAt(ref, false),
    });
    return () => tableRegistry.endSession(tableId);
  }, [active, editCell, isFormulaInput, tableId, insertRefAt]);

  /** Farbige Hervorhebung der Bezüge der gerade getippten Formel. */
  const refHighlights = React.useMemo(() => {
    if (!isFormulaInput) return [] as { r1: number; c1: number; r2: number; c2: number; color: string }[];
    return extractRefs(editText)
      .map((ref, i) => ({ ...ref, color: REF_COLORS[i % REF_COLORS.length] }))
      .filter((ref) => {
        if (!ref.table) return true;
        const t = tableRegistry.resolve(ref.table);
        return !!t && t.id === tableId;
      });
  }, [isFormulaInput, editText, tableId, sessionTick]);


  // ─── Formel-Picker ──────────────────────────────────────────────────────
  const [pickStep, setPickStep] = React.useState<"target" | "start" | "end">("target");
  const [pickTarget, setPickTarget] = React.useState<{ r: number; c: number } | null>(null);
  const [pickStart, setPickStart] = React.useState<{ r: number; c: number } | null>(null);
  const [pickHover, setPickHover] = React.useState<{ r: number; c: number } | null>(null);
  React.useEffect(() => {
    setPickStep("target"); setPickTarget(null); setPickStart(null); setPickHover(null);
  }, [pickFn]);

  const previewFormula = React.useMemo(() => {
    if (!pickFn || !pickTarget) return null;
    const anchor = pickStep === "end" ? pickStart : pickHover;
    const cursor = pickStep === "end" ? pickHover : null;
    if (!anchor) return null;
    const end = cursor ?? anchor;
    const range = rangeExpr(anchor.r, anchor.c, end.r, end.c);
    const expr = `=${pickFn}(${range})`;
    const tmp = model.cells.map((row) => row.slice());
    tmp[pickTarget.r][pickTarget.c] = expr;
    return {
      expr,
      value: String(evalCell(tmp, pickTarget.r, pickTarget.c, { tableId })),
      r1: Math.min(anchor.r, end.r), r2: Math.max(anchor.r, end.r),
      c1: Math.min(anchor.c, end.c), c2: Math.max(anchor.c, end.c),
    };
  }, [pickFn, pickTarget, pickStart, pickHover, pickStep, model.cells]);

  // ─── Filter (Zeilensichtbarkeit) ────────────────────────────────────────
  const hiddenRows = React.useMemo(() => {
    const hidden = new Set<number>();
    const keys = Object.keys(filters);
    if (!keys.length) return hidden;
    for (let r = 0; r < rows; r++) {
      if (headerRow && r === 0) continue;
      for (const key of keys) {
        const c = Number(key);
        const allowed = filters[c];
        if (!allowed.includes(String(evalCell(model.cells, r, c, { tableId })))) { hidden.add(r); break; }
      }
    }
    return hidden;
  }, [filters, rows, headerRow, model.cells]);

  // ─── Zellinteraktion ────────────────────────────────────────────────────
  const dragSelRef = React.useRef(false);

  const handleCellPointerDown = (e: React.PointerEvent, r: number, c: number) => {
    // Fremde Tabelle während einer laufenden Formeleingabe: Bezug liefern.
    if (foreignSession && session) {
      e.stopPropagation();
      e.preventDefault();
      session.insertRef(qualifyRef(tableName || tableId, `${colLabel(c)}${r + 1}`));
      return;
    }
    if (!active) return;                 // Objektmodus: Ereignis geht ans Objekt
    e.stopPropagation();

    // Eigene Tabelle, offene Formel: Klick fügt den Bezug ein statt zu wechseln.
    if (editCell && isFormulaInput) {
      const caret = inputRef.current?.selectionStart ?? editText.length;
      if (!(editCell.r === r && editCell.c === c) && acceptsRefInsert(editText, caret)) {
        e.preventDefault();
        refDragRef.current = { start: { r, c }, at: caret, len: 0, prefix: "" };
        insertRefAt(`${colLabel(c)}${r + 1}`, false);
        return;
      }
    }

    if (pickFn) {
      if (pickStep === "target") { setPickTarget({ r, c }); setPickStep("start"); }
      else if (pickStep === "start") { setPickStart({ r, c }); setPickStep("end"); }
      else if (pickTarget && pickStart) {
        setCell(pickTarget.r, pickTarget.c, `=${pickFn}(${rangeExpr(pickStart.r, pickStart.c, r, c)})`);
        formulaCtx?.setFn(null);
      }
      return;
    }
    if (editCell && (editCell.r !== r || editCell.c !== c)) {
      // Kein Enter nötig: Ein Linksklick in eine andere Zelle speichert bereits.
      flushEdit();
      setEditCell(null);
    }
    if (e.shiftKey && selection) {
      editCtx?.setSelection(normSel({ ...selection, r2: r, c2: c }));
    } else {
      editCtx?.setSelection({ r1: r, c1: c, r2: r, c2: c });
      dragSelRef.current = true;
    }
  };

  const handleCellPointerEnter = (e: React.PointerEvent, r: number, c: number) => {
    if (pickFn) { setPickHover({ r, c }); return; }
    // Formelbezug durch Ziehen zum Bereich erweitern.
    const drag = refDragRef.current;
    if (active && drag && isFormulaInput && e.buttons === 1) {
      insertRefAt(rangeExpr(drag.start.r, drag.start.c, r, c), true);
      return;
    }
    if (active && dragSelRef.current && selection) {
      editCtx?.setSelection(normSel({ r1: selection.r1, c1: selection.c1, r2: r, c2: c }));
    }
  };

  React.useEffect(() => {
    if (!pickFn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); formulaCtx?.setFn(null); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pickFn, formulaCtx]);

  React.useEffect(() => {
    const up = () => { dragSelRef.current = false; refDragRef.current = null; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);


  /** Nächste sichtbare, nicht verdeckte Zelle in Richtung dr/dc. */
  const step = (r: number, c: number, dr: number, dc: number) => {
    let nr = r + dr, nc = c + dc;
    if (nc >= cols) { nc = 0; nr += 1; }
    if (nc < 0) { nc = cols - 1; nr -= 1; }
    while (nr >= 0 && nr < rows && hiddenRows.has(nr)) nr += dr || 1;
    if (nr < 0 || nr >= rows) return null;
    return { r: nr, c: nc };
  };

  const moveSelection = (dr: number, dc: number, startEdit = false) => {
    const cur = selection ? { r: selection.r1, c: selection.c1 } : { r: 0, c: 0 };
    const nxt = step(cur.r, cur.c, dr, dc);
    if (!nxt) return;
    editCtx?.setSelection({ r1: nxt.r, c1: nxt.c, r2: nxt.r, c2: nxt.c });
    setEditCell(startEdit ? nxt : null);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (!active || editCell) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      // Laufende Formelauswahl abbrechen — die Funktion wird dabei komplett
      // deaktiviert und muss im Panel erneut gewählt werden.
      if (pickFn) { formulaCtx?.setFn(null); return; }
      onExitEdit?.();
      return;
    }
    if (!selection) return;
    const keys: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      Tab: [0, e.shiftKey ? -1 : 1], Enter: [e.shiftKey ? -1 : 1, 0],
    };
    const d = keys[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); moveSelection(d[0], d[1]); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault(); e.stopPropagation();
      const s = normSel(selection);
      const cells = model.cells.map((row) => row.slice());
      for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) cells[r][c] = "";
      commit({ ...model, cells });
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.stopPropagation();
      e.preventDefault();
      // Tippen startet die Zelleingabe (bei "=" direkt im Formelmodus).
      pendingSeed.current = e.key;
      setEditCell({ r: selection.r1, c: selection.c1 });

    }

  };

  // ─── Spalten-/Zeilengrößen per Ziehen ───────────────────────────────────
  const startResize = (e: React.PointerEvent, kind: "col" | "row", index: number) => {
    if (!active) return;
    e.stopPropagation();
    e.preventDefault();
    const startClient = kind === "col" ? e.clientX : e.clientY;
    const base = kind === "col" ? model.colWidthsMm[index] : model.rowHeightsMm[index];
    const min = kind === "col" ? MIN_COL_MM : MIN_ROW_MM;
    let next = model;
    const move = (ev: PointerEvent) => {
      const delta = ((kind === "col" ? ev.clientX : ev.clientY) - startClient) / pxPerMm;
      const size = Math.max(min, Math.round((base + delta) * 10) / 10);
      if (kind === "col") {
        const colWidthsMm = model.colWidthsMm.slice();
        colWidthsMm[index] = size;
        next = { ...model, colWidthsMm };
      } else {
        const rowHeightsMm = model.rowHeightsMm.slice();
        rowHeightsMm[index] = size;
        next = { ...model, rowHeightsMm };
      }
      commit(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const inSelection = (r: number, c: number) => {
    if (!selection) return false;
    const s = normSel(selection);
    return r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2;
  };

  /** Farbe eines Formelbezugs für diese Zelle (Eingabe-Hervorhebung). */
  const refColorFor = (r: number, c: number): string | undefined => {
    for (const ref of refHighlights) {
      if (r >= ref.r1 && r <= ref.r2 && c >= ref.c1 && c <= ref.c2) return ref.color;
    }
    return undefined;
  };

  const highlightFor = (r: number, c: number): string | undefined => {
    if (pickFn) {
      if (pickTarget && pickTarget.r === r && pickTarget.c === c) return "hsl(var(--cad-selection-fill) / 0.30)";
      if (previewFormula) {
        const { r1, r2, c1, c2 } = previewFormula;
        if (r >= r1 && r <= r2 && c >= c1 && c <= c2) return "hsl(var(--cad-selection-fill) / 0.15)";
      }
      return undefined;
    }
    if (active && inSelection(r, c)) return "hsl(var(--cad-selection-fill) / 0.18)";
    return undefined;
  };


  const pct = (mm: number, total: number) => `${(mm / total) * 100}%`;

  return (
    <div
      ref={rootRef}
      className="w-full h-full relative select-none"
      style={{
        background,
        color: "hsl(var(--ink))",
        // Kein eigener Rahmen: Auswahl/Fokus zeichnet die Objekt-Logik der Seite
        // (identisch zu allen anderen PixunaCAD-Objekten).
        outline: "none",
        cursor: active ? "default" : undefined,
        // Objektmodus: keine Zeigerereignisse → Verschieben/Drehen/Skalieren
        // laufen unverändert über die Objekt-Logik der Seite.
        pointerEvents: active || foreignSession ? "auto" : "none",
      }}
      tabIndex={active ? 0 : -1}
      // Marker für den globalen Entf-Handler der Seite: im Zellmodus löscht
      // Entf nur den Zellinhalt, nicht das Tabellen-Objekt.
      data-table-cellmode={active ? "1" : undefined}
      onKeyDown={onGridKeyDown}
      onPointerDown={(e) => { if (active) e.stopPropagation(); }}
      onDoubleClick={(e) => { if (active) e.stopPropagation(); }}
    >
      {pickFn && (
        <div
          className="absolute -top-6 left-0 z-30 flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap"
          style={{
            background: "hsl(var(--surface))",
            border: "1px solid hsl(var(--hairline))",
            color: "hsl(var(--ink))",
            boxShadow: "0 4px 12px -6px rgba(0,0,0,0.35)",
          }}
        >
          <span>
            {pickFn}: {pickStep === "target" ? "Zielzelle wählen" : pickStep === "start" ? "Startzelle wählen" : "Endzelle wählen"}
          </span>
          {previewFormula && <span className="opacity-70 font-mono">{previewFormula.expr} = {previewFormula.value}</span>}
          <button
            onClick={() => formulaCtx?.setFn(null)}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-black/10"
            title="Abbrechen"
          ><XIcon size={10} /></button>
        </div>
      )}

      {/* Zellen — absolute mm-Positionierung, damit Druck/Export exakt bleibt */}
      {model.cells.map((row, r) =>
        row.map((_, c) => {
          if (isCovered(model, r, c)) return null;
          if (hiddenRows.has(r)) return null;
          const rect = cellRectMm(model, lay, r, c);
          const f = effectiveFormat(model, r, c);
          const isHeader = headerRow && r === 0;
          const raw = model.cells[r][c];
          const isPickTarget = pickFn && pickTarget?.r === r && pickTarget?.c === c;
          const display = isPickTarget && previewFormula
            ? previewFormula.value
            : raw.startsWith("=") ? String(evalCell(model.cells, r, c, { tableId })) : raw;
          const isEditingCell = active && editCell?.r === r && editCell?.c === c;
          const refColor = refColorFor(r, c);
          return (
            <div
              key={cellKey(r, c)}
              className="absolute overflow-hidden"
              style={{
                left: pct(rect.xMm, lay.widthMm),
                top: pct(rect.yMm, lay.heightMm),
                width: pct(rect.wMm, lay.widthMm),
                height: pct(rect.hMm, lay.heightMm),
                ...cellBorderStyle(model, r, c, borderColor),
                background: highlightFor(r, c) ?? f.background,
                display: "flex",
                alignItems: f.valign === "top" ? "flex-start" : f.valign === "bottom" ? "flex-end" : "center",
                justifyContent: f.align === "center" ? "center" : f.align === "right" ? "flex-end" : "flex-start",
                padding: `${0.3 * pxPerMm}px ${0.8 * pxPerMm}px`,
                fontSize: `${f.fontSizePt * (25.4 / 72) * pxPerMm}px`,
                lineHeight: 1.15,
                fontWeight: f.bold ? 700 : 400,
                fontStyle: f.italic ? "italic" : "normal",
                color: f.color ?? "hsl(var(--ink))",
                cursor: pickFn ? "crosshair" : foreignSession ? "crosshair" : active ? "text" : undefined,
                ...(refColor ? { outline: `1.5px solid ${refColor}`, outlineOffset: "-1.5px" } : null),
                // Fremde Tabelle: Klicks für Bezüge annehmen, sonst Objektlogik.
                pointerEvents: foreignSession ? "auto" : undefined,
              }}
              onPointerDown={(e) => handleCellPointerDown(e, r, c)}
              onPointerEnter={(e) => handleCellPointerEnter(e, r, c)}
              onDoubleClick={(e) => {
                if (!active || pickFn) return;
                e.stopPropagation();
                setEditCell({ r, c });
              }}
            >
              {isEditingCell ? (
                <input
                  autoFocus
                  ref={inputRef}
                  value={editText}
                  onChange={(e) => { setEditText(e.target.value); editValueRef.current = e.target.value; }}
                  onBlur={() => {
                    // Während eines Bezugsklicks in eine andere Tabelle nicht beenden.
                    if (tableRegistry.getSession()?.tableId === tableId) return;
                    const v = editValueRef.current ?? editText;
                    editValueRef.current = null;
                    setCell(r, c, v);
                    setEditCell(null);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      const v = editText;
                      editValueRef.current = null;
                      setCell(r, c, v);
                      setEditCell(null);
                      const d: [number, number] = e.key === "Tab"
                        ? [0, e.shiftKey ? -1 : 1]
                        : [e.shiftKey ? -1 : 1, 0];
                      const nxt = step(r, c, d[0], d[1]);
                      if (nxt) editCtx?.setSelection({ r1: nxt.r, c1: nxt.c, r2: nxt.r, c2: nxt.c });
                      rootRef.current?.focus();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      editValueRef.current = null;
                      setEditCell(null);
                      rootRef.current?.focus();
                    }
                  }}
                  className="w-full bg-transparent outline-none p-0 m-0"
                  style={{
                    font: "inherit",
                    color: "inherit",
                    textAlign: f.align,
                    fontFamily: editText.startsWith("=") ? "monospace" : undefined,
                  }}
                />

              ) : (
                <>
                  <span className="truncate" style={isPickTarget && previewFormula ? { color: "hsl(var(--cad-selection-stroke))", fontStyle: "italic" } : undefined}>
                    {display}
                  </span>
                  {isHeader && active && filtersEnabled && !pickFn && (
                    <button
                      onPointerDown={(e) => { e.stopPropagation(); }}
                      onClick={(e) => { e.stopPropagation(); setOpenFilter(openFilter === c ? null : c); }}
                      className="ml-auto opacity-60 hover:opacity-100 shrink-0"
                      title="Spalte filtern"
                    >
                      <Filter size={Math.max(8, 2.6 * pxPerMm)} className={filters[c] ? "text-primary" : undefined} />
                    </button>
                  )}
                </>
              )}
              {openFilter === c && isHeader && active && filtersEnabled && (
                <FilterMenu
                  values={uniqueColValues(model.cells, c, headerRow)}
                  active={filters[c] ?? null}
                  onChange={(v) => setFilter(c, v)}
                  onClose={() => setOpenFilter(null)}
                />
              )}
            </div>
          );
        }),
      )}

      {/* Ziehgriffe für Spaltenbreiten / Zeilenhöhen (nur im Tabellenmodus) */}
      {active && !pickFn && lay.colEdgesMm.slice(1).map((edge, i) => (
        <div
          key={`cw${i}`}
          className="absolute z-10 group"
          style={{
            left: `calc(${pct(edge, lay.widthMm)} - 3px)`,
            top: 0, width: 6, height: "100%", cursor: "col-resize",
          }}
          onPointerDown={(e) => startResize(e, "col", i)}
          title={`Spalte ${colLabel(i)}: ${model.colWidthsMm[i].toFixed(1)} mm`}
        >
          <div
            className="absolute inset-y-0 left-1/2 w-px opacity-0 group-hover:opacity-100"
            style={{ background: "hsl(var(--cad-snap-line))" }}
          />
        </div>
      ))}
      {active && !pickFn && lay.rowEdgesMm.slice(1).map((edge, i) => (
        <div
          key={`rh${i}`}
          className="absolute z-10 group"
          style={{
            top: `calc(${pct(edge, lay.heightMm)} - 3px)`,
            left: 0, height: 6, width: "100%", cursor: "row-resize",
          }}
          onPointerDown={(e) => startResize(e, "row", i)}
          title={`Zeile ${i + 1}: ${model.rowHeightsMm[i].toFixed(1)} mm`}
        >
          <div
            className="absolute inset-x-0 top-1/2 h-px opacity-0 group-hover:opacity-100"
            style={{ background: "hsl(var(--cad-snap-line))" }}
          />
        </div>
      ))}
    </div>
  );
}

function uniqueColValues(cells: string[][], c: number, headerRow: boolean): string[] {
  const set = new Set<string>();
  for (let r = headerRow ? 1 : 0; r < cells.length; r++) set.add(String(evalCell(cells, r, c)));
  return [...set].sort();
}

function FilterMenu({
  values,
  active,
  onChange,
  onClose,
}: {
  values: string[];
  active: string[] | null;
  onChange: (v: string[] | null) => void;
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
      className="absolute z-30 top-full left-0 mt-1 rounded-md shadow-lg border p-2 min-w-[160px] text-[11px]"
      style={{ background: "hsl(var(--surface))", borderColor: "hsl(var(--hairline))" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="max-h-40 overflow-auto space-y-0.5 mb-2">
        {values.length === 0 && <div className="text-[10px] text-muted-foreground">Keine Werte</div>}
        {values.map((v) => (
          <label key={v} className="flex items-center gap-1.5 cursor-pointer">
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
      </div>
    </div>
  );
}


/** Rahmen einer Zelle als CSS — Kanten einzeln, geteilte Kanten nur einmal.
 *  Damit wirken benachbarte Zellen wie ein durchgehendes, einfaches Raster. */
function cellBorderStyle(
  model: TableModel,
  r: number,
  c: number,
  color: string,
): React.CSSProperties {
  const b = effectiveBorders(model, r, c);
  const above = r > 0 ? effectiveBorders(model, r - 1, c) : null;
  const left = c > 0 ? effectiveBorders(model, r, c - 1) : null;
  const line = (w: number, style: "solid" | "double") =>
    w > 0 ? `${style === "double" ? Math.max(3, w) : w}px ${style} ${color}` : "none";
  // Geteilte Kanten gehören der oberen bzw. linken Nachbarzelle: die untere/
  // rechte Kante wird gezeichnet, die obere/linke nur, wenn der Nachbar dort
  // keine Linie hat (sonst doppelte Strichstärke).
  const showTop = b.top && (r === 0 || !(above && above.bottom));
  const showLeft = b.left && (c === 0 || !(left && left.right));
  return {
    borderTop: showTop ? line(b.widthPx, b.style === "double" ? "double" : "solid") : "none",
    borderLeft: showLeft ? line(b.widthPx, b.style === "double" ? "double" : "solid") : "none",
    borderRight: b.right ? line(b.widthPx, b.style === "double" ? "double" : "solid") : "none",
    borderBottom: b.bottom
      ? line(b.widthPx, (b.bottomDouble || b.style === "double") ? "double" : "solid")
      : "none",
  };
}
