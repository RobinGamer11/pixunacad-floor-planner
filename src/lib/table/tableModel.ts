/**
 * tableModel.ts — gemeinsames Datenmodell für Tabellenobjekte.
 *
 * Wird von Projektmappe und (später) CAD-Oberfläche gleichermaßen genutzt.
 * Alte Projekte speichern nur `cells` (+ optional `colWidths`/`rowHeights`);
 * `normalizeTable` migriert diese verlustfrei in das erweiterte Modell.
 */

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
export type TableNumberFormat = "auto" | "number" | "currency" | "percent";

/** Rahmenstil einer Zelle. */
export type CellBorderStyle = "single" | "double";

/** Sichtbarkeit der vier Zellkanten (undefined = sichtbar). */
export interface CellBorders {
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
}

export interface TableCellFormat {
  align?: HAlign;
  valign?: VAlign;
  /** Reines Anzeigeformat; der gespeicherte Zellwert bleibt unverändert. */
  numberFormat?: TableNumberFormat;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  background?: string;
  /** Pro Kante ein/aus — fehlende Kante = sichtbar. */
  borders?: CellBorders;
  borderStyle?: CellBorderStyle;
  /** Rahmenstärke dieser Zelle in px (Fallback: Tabellen-Rahmenbreite). */
  borderWidthPx?: number;
  /** Untere Kante als Doppellinie (Summenlinie). */
  bottomDouble?: boolean;
}

export interface TableMerge {
  r: number;
  c: number;
  rowSpan: number;
  colSpan: number;
}

/** Rohform, wie sie in `PageElement.tableData` gespeichert wird. */
export interface TableData {
  /** Stabile Objekt-ID (für tabellenübergreifende Formeln). */
  tableId?: string;
  /** Anzeigename für Formelbezüge (`=Tabelle1!B2`). */
  name?: string;
  cells: string[][];

  /** Legacy-Felder (mm) — werden gelesen, aber nicht mehr geschrieben. */
  colWidths?: number[];
  rowHeights?: number[];
  colWidthsMm?: number[];
  rowHeightsMm?: number[];
  cellFormats?: Record<string, TableCellFormat>;
  merges?: TableMerge[];
  filters?: Record<number, string[]>;
  headerRow?: boolean;
  /** Spaltenfilter im Tabellenmodus (Default: aus). */
  filtersEnabled?: boolean;
  borderColor?: string;
  borderWidthPx?: number;
  background?: string;
  headerBackground?: string;
}

/** Vollständig aufgelöstes Modell (alle Arrays passen zur Rastergröße). */
export interface TableModel extends TableData {
  cells: string[][];
  colWidthsMm: number[];
  rowHeightsMm: number[];
  cellFormats: Record<string, TableCellFormat>;
  merges: TableMerge[];
}

export const DEFAULT_COL_MM = 26;
export const DEFAULT_ROW_MM = 7;
export const DEFAULT_FONT_PT = 9;
export const MIN_COL_MM = 6;
export const MIN_ROW_MM = 4;
export const PT_TO_MM = 25.4 / 72;

/** Dezentes Grau der Kopfzeile (Default, per Zellhintergrund überschreibbar). */
export const HEADER_BG = "#cfcfcf";

export const cellKey = (r: number, c: number) => `${r},${c}`;

/** Neue Tabelle mit Kopfzeile und leeren Zellen. */
export function createTableData(cols: number, rows: number): TableData {
  const C = Math.max(1, Math.min(24, Math.round(cols)));
  const R = Math.max(1, Math.min(200, Math.round(rows)));
  const cells: string[][] = [];
  for (let r = 0; r < R; r++) cells.push(Array.from({ length: C }, () => ""));
  return {
    cells,
    colWidthsMm: Array.from({ length: C }, () => DEFAULT_COL_MM),
    rowHeightsMm: Array.from({ length: R }, () => DEFAULT_ROW_MM),
    cellFormats: {},
    merges: [],
    headerRow: true,
    filtersEnabled: false,
    filters: {},
    borderWidthPx: 1,
    borderColor: "#000000",
    background: "#ffffff",
  };
}

/** Migriert/vervollständigt gespeicherte Daten. Nie mutierend. */
export function normalizeTable(data?: TableData | null): TableModel {
  const src = data ?? createTableData(3, 4);
  const rawCells = Array.isArray(src.cells) && src.cells.length ? src.cells : [[""]];
  const cols = Math.max(1, ...rawCells.map((row) => (Array.isArray(row) ? row.length : 0)));
  const cells = rawCells.map((row) =>
    Array.from({ length: cols }, (_, c) => String((row as string[])?.[c] ?? "")),
  );
  const rows = cells.length;

  const legacyCols = src.colWidthsMm ?? src.colWidths;
  const legacyRows = src.rowHeightsMm ?? src.rowHeights;
  const colWidthsMm = Array.from({ length: cols }, (_, c) => {
    const v = legacyCols?.[c];
    return typeof v === "number" && v > 0 ? v : DEFAULT_COL_MM;
  });
  const rowHeightsMm = Array.from({ length: rows }, (_, r) => {
    const v = legacyRows?.[r];
    return typeof v === "number" && v > 0 ? v : DEFAULT_ROW_MM;
  });

  const merges = (src.merges ?? []).filter(
    (m) =>
      m && m.r >= 0 && m.c >= 0 && m.r < rows && m.c < cols &&
      (m.rowSpan > 1 || m.colSpan > 1),
  ).map((m) => ({
    r: m.r,
    c: m.c,
    rowSpan: Math.min(m.rowSpan, rows - m.r),
    colSpan: Math.min(m.colSpan, cols - m.c),
  }));

  const cellFormats: Record<string, TableCellFormat> = {};
  for (const [k, v] of Object.entries(src.cellFormats ?? {})) {
    const [r, c] = k.split(",").map(Number);
    if (r >= 0 && r < rows && c >= 0 && c < cols && v) cellFormats[k] = v;
  }

  return {
    ...src,
    cells,
    colWidthsMm,
    rowHeightsMm,
    cellFormats,
    merges,
    headerRow: src.headerRow !== false,
    filtersEnabled: src.filtersEnabled === true,
    filters: src.filters ?? {},
  };
}

export function tableWidthMm(t: TableModel): number {
  return t.colWidthsMm.reduce((a, b) => a + b, 0);
}
export function tableHeightMm(t: TableModel): number {
  return t.rowHeightsMm.reduce((a, b) => a + b, 0);
}

/** Merge, dessen Ankerzelle (r,c) ist. */
export function mergeAnchorAt(t: TableModel, r: number, c: number): TableMerge | undefined {
  return t.merges.find((m) => m.r === r && m.c === c);
}
/** Merge, der (r,c) überdeckt (auch als Anker). */
export function mergeCovering(t: TableModel, r: number, c: number): TableMerge | undefined {
  return t.merges.find(
    (m) => r >= m.r && r < m.r + m.rowSpan && c >= m.c && c < m.c + m.colSpan,
  );
}
/** true, wenn die Zelle von einem Merge verdeckt wird (kein Anker). */
export function isCovered(t: TableModel, r: number, c: number): boolean {
  const m = mergeCovering(t, r, c);
  return !!m && !(m.r === r && m.c === c);
}

function remapFormats(
  formats: Record<string, TableCellFormat>,
  map: (r: number, c: number) => { r: number; c: number } | null,
): Record<string, TableCellFormat> {
  const out: Record<string, TableCellFormat> = {};
  for (const [k, v] of Object.entries(formats)) {
    const [r, c] = k.split(",").map(Number);
    const next = map(r, c);
    if (next) out[cellKey(next.r, next.c)] = v;
  }
  return out;
}

export function insertRow(t: TableModel, at: number): TableModel {
  const cols = t.cells[0].length;
  const cells = t.cells.map((row) => row.slice());
  cells.splice(at, 0, Array.from({ length: cols }, () => ""));
  const rowHeightsMm = t.rowHeightsMm.slice();
  rowHeightsMm.splice(at, 0, t.rowHeightsMm[Math.min(at, t.rowHeightsMm.length - 1)] ?? DEFAULT_ROW_MM);
  return {
    ...t,
    cells,
    rowHeightsMm,
    cellFormats: remapFormats(t.cellFormats, (r, c) => ({ r: r >= at ? r + 1 : r, c })),
    merges: t.merges.map((m) =>
      m.r >= at ? { ...m, r: m.r + 1 } : (at < m.r + m.rowSpan ? { ...m, rowSpan: m.rowSpan + 1 } : m),
    ),
  };
}

export function removeRow(t: TableModel, at: number): TableModel {
  if (t.cells.length <= 1) return t;
  const cells = t.cells.filter((_, r) => r !== at);
  const rowHeightsMm = t.rowHeightsMm.filter((_, r) => r !== at);
  return {
    ...t,
    cells,
    rowHeightsMm,
    cellFormats: remapFormats(t.cellFormats, (r, c) => (r === at ? null : { r: r > at ? r - 1 : r, c })),
    merges: t.merges
      .map((m) => {
        if (at < m.r) return { ...m, r: m.r - 1 };
        if (at < m.r + m.rowSpan) return { ...m, rowSpan: m.rowSpan - 1 };
        return m;
      })
      .filter((m) => m.rowSpan > 1 || m.colSpan > 1),
  };
}

export function insertCol(t: TableModel, at: number): TableModel {
  const cells = t.cells.map((row) => {
    const nr = row.slice();
    nr.splice(at, 0, "");
    return nr;
  });
  const colWidthsMm = t.colWidthsMm.slice();
  colWidthsMm.splice(at, 0, t.colWidthsMm[Math.min(at, t.colWidthsMm.length - 1)] ?? DEFAULT_COL_MM);
  return {
    ...t,
    cells,
    colWidthsMm,
    cellFormats: remapFormats(t.cellFormats, (r, c) => ({ r, c: c >= at ? c + 1 : c })),
    merges: t.merges.map((m) =>
      m.c >= at ? { ...m, c: m.c + 1 } : (at < m.c + m.colSpan ? { ...m, colSpan: m.colSpan + 1 } : m),
    ),
  };
}

export function removeCol(t: TableModel, at: number): TableModel {
  if (t.cells[0].length <= 1) return t;
  const cells = t.cells.map((row) => row.filter((_, c) => c !== at));
  const colWidthsMm = t.colWidthsMm.filter((_, c) => c !== at);
  return {
    ...t,
    cells,
    colWidthsMm,
    cellFormats: remapFormats(t.cellFormats, (r, c) => (c === at ? null : { r, c: c > at ? c - 1 : c })),
    merges: t.merges
      .map((m) => {
        if (at < m.c) return { ...m, c: m.c - 1 };
        if (at < m.c + m.colSpan) return { ...m, colSpan: m.colSpan - 1 };
        return m;
      })
      .filter((m) => m.rowSpan > 1 || m.colSpan > 1),
  };
}

/** Zellen des Bereichs zu einer Zelle verbinden (Inhalt der Ankerzelle bleibt). */
export function mergeRange(t: TableModel, r1: number, c1: number, r2: number, c2: number): TableModel {
  const rA = Math.min(r1, r2), rB = Math.max(r1, r2);
  const cA = Math.min(c1, c2), cB = Math.max(c1, c2);
  if (rA === rB && cA === cB) return t;
  const merges = t.merges.filter(
    (m) => m.r + m.rowSpan <= rA || m.r > rB || m.c + m.colSpan <= cA || m.c > cB,
  );
  merges.push({ r: rA, c: cA, rowSpan: rB - rA + 1, colSpan: cB - cA + 1 });
  return { ...t, merges };
}

/** Verbund an dieser Position wieder auflösen. */
export function unmergeAt(t: TableModel, r: number, c: number): TableModel {
  const m = mergeCovering(t, r, c);
  if (!m) return t;
  return { ...t, merges: t.merges.filter((x) => x !== m) };
}

/** Formatierung auf einen Zellbereich anwenden (undefined-Werte löschen Keys nicht). */
export function applyFormat(
  t: TableModel,
  r1: number, c1: number, r2: number, c2: number,
  patch: TableCellFormat,
): TableModel {
  const formats = { ...t.cellFormats };
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      const k = cellKey(r, c);
      formats[k] = { ...(formats[k] ?? {}), ...patch };
    }
  }
  return { ...t, cellFormats: formats };
}

/** Zahlenformat auf markierte Zellen oder die vollständig berührten Zeilen anwenden. */
export function applyNumberFormat(
  t: TableModel,
  r1: number, c1: number, r2: number, c2: number,
  numberFormat: TableNumberFormat,
  wholeRows = false,
): TableModel {
  return applyFormat(
    t,
    r1,
    wholeRows ? 0 : c1,
    r2,
    wholeRows ? t.cells[0].length - 1 : c2,
    { numberFormat },
  );
}

/** Effektives Format einer Zelle inkl. Kopfzeilen-Default. */
export function effectiveFormat(t: TableModel, r: number, c: number): Required<Pick<TableCellFormat, "align" | "valign" | "numberFormat" | "fontSizePt" | "bold" | "italic">> & TableCellFormat {
  const f = t.cellFormats[cellKey(r, c)] ?? {};
  const isHeader = t.headerRow !== false && r === 0;
  return {
    align: f.align ?? "left",
    valign: f.valign ?? "middle",
    numberFormat: f.numberFormat ?? "auto",
    fontSizePt: f.fontSizePt ?? DEFAULT_FONT_PT,
    bold: f.bold ?? isHeader,
    italic: f.italic ?? false,
    color: f.color,
    background: f.background ?? (isHeader ? HEADER_BG : undefined),
  };
}

/** Effektive Rahmen-Eigenschaften einer Zelle (Kanten, Stil, Stärke). */
export function effectiveBorders(t: TableModel, r: number, c: number): {
  top: boolean; right: boolean; bottom: boolean; left: boolean;
  style: CellBorderStyle; widthPx: number; bottomDouble: boolean;
} {
  const f = t.cellFormats[cellKey(r, c)] ?? {};
  const b = f.borders ?? {};
  return {
    top: b.top !== false,
    right: b.right !== false,
    bottom: b.bottom !== false,
    left: b.left !== false,
    style: f.borderStyle ?? "single",
    widthPx: f.borderWidthPx ?? (t.borderWidthPx ?? 1),
    bottomDouble: f.bottomDouble === true,
  };
}

/** Raster auf exakte Zeilen/Spaltenzahl bringen (Panel-Stepper). */
export function resizeGrid(t: TableModel, rows: number, cols: number): TableModel {
  let out = t;
  const R = Math.max(1, Math.min(200, Math.round(rows)));
  const C = Math.max(1, Math.min(24, Math.round(cols)));
  while (out.cells.length > R) out = removeRow(out, out.cells.length - 1);
  while (out.cells.length < R) out = insertRow(out, out.cells.length);
  while (out.cells[0].length > C) out = removeCol(out, out.cells[0].length - 1);
  while (out.cells[0].length < C) out = insertCol(out, out.cells[0].length);
  return out;
}

/** Modell → speicherbare Rohdaten (Legacy-Felder werden entfernt). */
export function toTableData(t: TableModel): TableData {
  const { colWidths: _a, rowHeights: _b, ...rest } = t;
  return rest;
}
