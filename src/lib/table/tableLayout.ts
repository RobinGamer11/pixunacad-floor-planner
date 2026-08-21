/**
 * tableLayout.ts — Geometrie eines Tabellenobjekts in Papier-Millimetern.
 * Einzige Quelle für Projektmappe (DOM), CAD-Canvas und Miniaturen.
 */

import { mergeCovering, tableHeightMm, tableWidthMm, type TableModel } from "./tableModel";

export interface TableLayout {
  /** Kumulierte Spaltenkanten (Länge = cols + 1), in mm ab linker Kante. */
  colEdgesMm: number[];
  /** Kumulierte Zeilenkanten (Länge = rows + 1), in mm ab oberer Kante. */
  rowEdgesMm: number[];
  widthMm: number;
  heightMm: number;
  rows: number;
  cols: number;
}

export function layoutTable(t: TableModel): TableLayout {
  const colEdgesMm = [0];
  for (const w of t.colWidthsMm) colEdgesMm.push(colEdgesMm[colEdgesMm.length - 1] + w);
  const rowEdgesMm = [0];
  for (const h of t.rowHeightsMm) rowEdgesMm.push(rowEdgesMm[rowEdgesMm.length - 1] + h);
  return {
    colEdgesMm,
    rowEdgesMm,
    widthMm: tableWidthMm(t),
    heightMm: tableHeightMm(t),
    rows: t.cells.length,
    cols: t.cells[0].length,
  };
}

export interface CellRectMm { xMm: number; yMm: number; wMm: number; hMm: number; }

/** Rechteck einer Zelle in mm — berücksichtigt verbundene Zellen. */
export function cellRectMm(t: TableModel, l: TableLayout, r: number, c: number): CellRectMm {
  const m = mergeCovering(t, r, c);
  const r1 = m ? m.r : r;
  const c1 = m ? m.c : c;
  const r2 = m ? m.r + m.rowSpan : r + 1;
  const c2 = m ? m.c + m.colSpan : c + 1;
  return {
    xMm: l.colEdgesMm[c1],
    yMm: l.rowEdgesMm[r1],
    wMm: l.colEdgesMm[Math.min(c2, l.cols)] - l.colEdgesMm[c1],
    hMm: l.rowEdgesMm[Math.min(r2, l.rows)] - l.rowEdgesMm[r1],
  };
}

/** Zelle unter einem Punkt (mm, relativ zur Tabellen-Ecke oben links). */
export function cellAtMm(l: TableLayout, xMm: number, yMm: number): { r: number; c: number } | null {
  if (xMm < 0 || yMm < 0 || xMm > l.widthMm || yMm > l.heightMm) return null;
  let c = 0;
  while (c < l.cols - 1 && xMm > l.colEdgesMm[c + 1]) c++;
  let r = 0;
  while (r < l.rows - 1 && yMm > l.rowEdgesMm[r + 1]) r++;
  return { r, c };
}
