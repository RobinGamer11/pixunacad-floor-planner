import React from "react";
import {
  Plus, Minus, Check, X, Pencil, Sigma,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic,
  ArrowUpToLine, ArrowDownToLine, Combine, Split,
  Rows3, Columns3, Trash2, Filter, Equal,
  SquareDashed, Square,
} from "lucide-react";
import { projectStore } from "@/lib/projectStore";
import type { PageElement } from "@/lib/projectStore";
import {
  normalizeTable, toTableData, resizeGrid, insertRow, insertCol, removeRow, removeCol,
  mergeRange, unmergeAt, applyFormat, effectiveFormat, effectiveBorders, mergeCovering,
  tableWidthMm, tableHeightMm, type TableModel, type HAlign, type VAlign,
  type CellBorderStyle,
} from "@/lib/table/tableModel";
import { TableEditContext, type FormulaFn } from "./TableElementView";

/**
 * Werkzeug-Einstellungen für das Tabellen-Werkzeug (Projektmappe).
 * Struktur, Zellformat, Rahmen/Hintergrund und Formel-Picker — Bedienung und
 * Optik identisch zu den übrigen PixunaCAD-Werkzeugpanels.
 */
export function TableToolSettings({
  projectId,
  pageId,
  tableElement,
  isPending,
  pageWmm,
  pageHmm,
  formulaFn,
  setFormulaFn,
  onConfirm,
  onCancel,
  onPatch,
}: {
  projectId: string;
  pageId: string;
  tableElement?: PageElement;
  isPending: boolean;
  pageWmm?: number;
  pageHmm?: number;
  formulaFn?: FormulaFn | null;
  setFormulaFn?: (f: FormulaFn | null) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ctx = React.useContext(TableEditContext);
  const editMode = !!tableElement && ctx?.editId === tableElement.id;
  const setEditMode = (v: boolean) => ctx?.setEditId(v && tableElement ? tableElement.id : null);
  const newCols = ctx?.newCols ?? 3;
  const newRows = ctx?.newRows ?? 4;
  const setNewCols = (v: number) => ctx?.setNewCols(v);
  const setNewRows = (v: number) => ctx?.setNewRows(v);

  if (!tableElement || tableElement.kind !== "table") {
    return (
      <div className="space-y-3">
        <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="text-[11px] font-semibold text-muted-foreground">Neue Tabelle</div>
          <Stepper label="Spalten" value={newCols} min={1} max={24} onChange={setNewCols} />
          <Stepper label="Zeilen" value={newRows} min={1} max={200} onChange={setNewRows} />
          <div className="text-[10px] text-muted-foreground leading-snug">
            Auf der Seite aufziehen oder einmal klicken, um die Tabelle in Standardgröße zu setzen.
          </div>
        </div>
      </div>
    );
  }

  const model = normalizeTable(tableElement.tableData as any);
  const rows = model.cells.length;
  const cols = model.cells[0].length;
  const sel = ctx?.selection ?? null;
  const selR = sel ? Math.min(sel.r1, sel.r2) : rows - 1;
  const selC = sel ? Math.min(sel.c1, sel.c2) : cols - 1;

  const commit = (next: TableModel) => {
    const wMm = tableWidthMm(next);
    const hMm = tableHeightMm(next);
    const patch: Partial<PageElement> = { tableData: toTableData(next) as any, wMm, hMm };
    if (pageWmm && pageHmm) {
      patch.w = Math.max(1, Math.min(100, (wMm / pageWmm) * 100));
      patch.h = Math.max(1, Math.min(100, (hMm / pageHmm) * 100));
    }
    if (onPatch) onPatch(patch);
    else projectStore.updateElement(projectId, pageId, tableElement.id, patch as any);
  };

  const patchTable = (patch: Partial<TableModel>) => commit({ ...model, ...patch });

  const fmt = effectiveFormat(model, selR, selC);
  const merged = !!mergeCovering(model, selR, selC);
  const format = (patch: Parameters<typeof applyFormat>[5]) => {
    if (!sel) return;
    commit(applyFormat(model, sel.r1, sel.c1, sel.r2, sel.c2, patch));
  };

  const borderWidthPx = model.borderWidthPx ?? 1;
  const borderColor = model.borderColor ?? "#d4d4d4";
  const background = model.background ?? "#ffffff";
  const filtersEnabled = model.filtersEnabled === true;
  const cellBorders = effectiveBorders(model, selR, selC);
  const fmtRaw = model.cellFormats[`${selR},${selC}`] ?? {};
  const fns: FormulaFn[] = ["SUM", "AVG", "MIN", "MAX", "COUNT"];

  /** Tabellen-Hintergrund setzen und einzelne Zellhintergründe zurücksetzen. */
  const setTableBackground = (v: string) => {
    const cellFormats: typeof model.cellFormats = {};
    for (const [k, f] of Object.entries(model.cellFormats)) {
      const { background: _drop, ...rest } = f;
      if (Object.keys(rest).length) cellFormats[k] = rest;
    }
    commit({ ...model, background: v, cellFormats });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="text-[11px] font-semibold text-muted-foreground">Tabelle</div>

        <Stepper label="Spalten" value={cols} min={1} max={24} onChange={(v) => commit(resizeGrid(model, rows, v))} />
        <Stepper label="Zeilen" value={rows} min={1} max={200} onChange={(v) => commit(resizeGrid(model, v, cols))} />

        <button
          onClick={() => setEditMode(!editMode)}
          className="w-full h-7 rounded-md border text-[11px] flex items-center justify-center gap-1.5"
          style={{
            borderColor: "hsl(var(--hairline))",
            background: editMode ? "hsl(var(--accent-gold-soft))" : undefined,
            color: editMode ? "hsl(var(--accent-gold))" : undefined,
          }}
          title="Doppelklick auf die Tabelle aktiviert den Tabellenmodus ebenfalls"
        >
          <Pencil size={11} /> {editMode ? "Tabellenmodus aktiv" : "Tabelle bearbeiten"}
        </button>
        <div className="text-[10px] text-muted-foreground leading-snug">
          Objektmodus: verschieben, drehen, skalieren. Tabellenmodus: Zellen bearbeiten,
          Spalten-/Zeilengrenzen ziehen. ESC verlässt den Tabellenmodus.
        </div>
      </div>

      {editMode && (
        <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-muted-foreground">Struktur</div>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-muted-foreground">Feld:</span>
              <span
                className="h-6 min-w-[34px] px-1.5 inline-flex items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums"
                style={{
                  borderColor: "hsl(var(--hairline))",
                  background: "hsl(var(--accent-gold-soft))",
                  color: "hsl(var(--accent-gold))",
                }}
              >
                {sel ? `${colName(selC)}${selR + 1}` : "–"}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <MiniBtn icon={<Rows3 size={11} />} label="Zeile ↑" onClick={() => commit(insertRow(model, selR))} />
            <MiniBtn icon={<Rows3 size={11} />} label="Zeile ↓" onClick={() => commit(insertRow(model, selR + 1))} />
            <MiniBtn icon={<Columns3 size={11} />} label="Spalte ←" onClick={() => commit(insertCol(model, selC))} />
            <MiniBtn icon={<Columns3 size={11} />} label="Spalte →" onClick={() => commit(insertCol(model, selC + 1))} />
            <MiniBtn icon={<Trash2 size={11} />} label="Zeile löschen" disabled={rows <= 1} onClick={() => commit(removeRow(model, selR))} />
            <MiniBtn icon={<Trash2 size={11} />} label="Spalte löschen" disabled={cols <= 1} onClick={() => commit(removeCol(model, selC))} />
            <MiniBtn
              icon={<Combine size={11} />} label="Verbinden"
              disabled={!sel || (sel.r1 === sel.r2 && sel.c1 === sel.c2)}
              onClick={() => sel && commit(mergeRange(model, sel.r1, sel.c1, sel.r2, sel.c2))}
            />
            <MiniBtn icon={<Split size={11} />} label="Trennen" disabled={!merged} onClick={() => commit(unmergeAt(model, selR, selC))} />
          </div>
        </div>
      )}

      {editMode && (
        <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="text-[11px] font-semibold text-muted-foreground">Zellformat</div>
          <div className="flex items-center gap-1">
            <Toggle active={fmt.align === "left"} onClick={() => format({ align: "left" as HAlign })}><AlignLeft size={11} /></Toggle>
            <Toggle active={fmt.align === "center"} onClick={() => format({ align: "center" as HAlign })}><AlignCenter size={11} /></Toggle>
            <Toggle active={fmt.align === "right"} onClick={() => format({ align: "right" as HAlign })}><AlignRight size={11} /></Toggle>
            <div className="w-1" />
            <Toggle active={fmt.valign === "top"} onClick={() => format({ valign: "top" as VAlign })}><ArrowUpToLine size={11} /></Toggle>
            <Toggle active={fmt.valign === "middle"} onClick={() => format({ valign: "middle" as VAlign })}><Minus size={11} /></Toggle>
            <Toggle active={fmt.valign === "bottom"} onClick={() => format({ valign: "bottom" as VAlign })}><ArrowDownToLine size={11} /></Toggle>
            <div className="w-1" />
            <Toggle active={fmt.bold} onClick={() => format({ bold: !fmt.bold })}><Bold size={11} /></Toggle>
            <Toggle active={fmt.italic} onClick={() => format({ italic: !fmt.italic })}><Italic size={11} /></Toggle>
          </div>
          <UnitField label="Schriftgröße" value={fmt.fontSizePt} unit="pt" min={4} max={72} onChange={(v) => format({ fontSizePt: v })} />
          <ColorRow label="Textfarbe" value={fmt.color ?? "#111111"} onChange={(v) => format({ color: v })} />
          <ColorRow label="Zellhintergrund" value={fmt.background ?? "#ffffff"} onChange={(v) => format({ background: v })} />

          <div className="pt-1 space-y-1.5" style={{ borderTop: "1px solid hsl(var(--hairline))" }}>
            <div className="text-[10px] font-semibold text-muted-foreground">Zellrahmen</div>
            <div className="flex items-center gap-1">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <Toggle
                  key={side}
                  active={cellBorders[side]}
                  onClick={() => format({ borders: { ...(fmtRaw.borders ?? {}), [side]: !cellBorders[side] } })}
                >
                  <span className="text-[9px]">{SIDE_LABEL[side]}</span>
                </Toggle>
              ))}
              <div className="w-1" />
              <Toggle
                active={cellBorders.top && cellBorders.right && cellBorders.bottom && cellBorders.left}
                onClick={() => format({ borders: {} })}
              ><Square size={11} /></Toggle>
              <Toggle
                active={!cellBorders.top && !cellBorders.right && !cellBorders.bottom && !cellBorders.left}
                onClick={() => format({ borders: { top: false, right: false, bottom: false, left: false } })}
              ><SquareDashed size={11} /></Toggle>
            </div>
            <div className="flex items-center gap-1">
              {(["single", "double"] as CellBorderStyle[]).map((st) => (
                <button
                  key={st}
                  onClick={() => format({ borderStyle: st })}
                  className="h-7 flex-1 rounded-md border text-[10px]"
                  style={{
                    borderColor: "hsl(var(--hairline))",
                    background: cellBorders.style === st ? "hsl(var(--accent-gold-soft))" : undefined,
                    color: cellBorders.style === st ? "hsl(var(--accent-gold))" : undefined,
                  }}
                >{st === "single" ? "Einfach" : "Doppelt"}</button>
              ))}
            </div>
            <button
              onClick={() => format({ bottomDouble: !cellBorders.bottomDouble, borders: { ...(fmtRaw.borders ?? {}), bottom: true } })}
              className="w-full h-7 rounded-md border text-[10px] flex items-center justify-center gap-1.5"
              style={{
                borderColor: "hsl(var(--hairline))",
                background: cellBorders.bottomDouble ? "hsl(var(--accent-gold-soft))" : undefined,
                color: cellBorders.bottomDouble ? "hsl(var(--accent-gold))" : undefined,
              }}
              title="Untere Zellkante als Doppellinie (Summenlinie)"
            >
              <Equal size={11} /> Summenlinie (untere Doppellinie)
            </button>
            <UnitField
              label="Rahmenstärke (Zelle)"
              value={cellBorders.widthPx}
              unit="px" min={0} max={8}
              onChange={(v) => format({ borderWidthPx: Math.round(v) })}
            />
          </div>
        </div>
      )}

      <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className="text-[11px] font-semibold text-muted-foreground">Rahmen &amp; Hintergrund</div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Rahmenbreite</span>
          <div className="flex items-center rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
            <button onClick={() => patchTable({ borderWidthPx: Math.max(0, borderWidthPx - 1) })} className="h-7 w-7 flex items-center justify-center hover:bg-muted"><Minus size={11} /></button>
            <div className="w-8 text-center text-[11px]">{borderWidthPx}px</div>
            <button onClick={() => patchTable({ borderWidthPx: Math.min(6, borderWidthPx + 1) })} className="h-7 w-7 flex items-center justify-center hover:bg-muted"><Plus size={11} /></button>
          </div>
        </div>
        <ColorRow label="Rahmenfarbe" value={borderColor} onChange={(v) => patchTable({ borderColor: v })} />
        <ColorRow label="Hintergrund" value={background} onChange={setTableBackground} />
        <div className="text-[10px] text-muted-foreground leading-snug">
          „Hintergrund" gilt für die ganze Tabelle und überschreibt beim erneuten
          Anwenden alle einzeln gesetzten Zellhintergründe.
        </div>

        <button
          onClick={() => patchTable({ filtersEnabled: !filtersEnabled, filters: {} })}
          className="w-full h-7 rounded-md border text-[11px] flex items-center justify-center gap-1.5"
          style={{
            borderColor: "hsl(var(--hairline))",
            background: filtersEnabled ? "hsl(var(--accent-gold-soft))" : undefined,
            color: filtersEnabled ? "hsl(var(--accent-gold))" : undefined,
          }}
        >
          <Filter size={11} /> Filterfunktion {filtersEnabled ? "an" : "aus"}
        </button>
      </div>

      {setFormulaFn && editMode && (
        <div className="rounded-md border p-2 space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <Sigma size={11} /> Formel per Klick
          </div>
          <div className="flex flex-wrap gap-1">
            {fns.map((f) => (
              <button
                key={f}
                onClick={() => setFormulaFn(formulaFn === f ? null : f)}
                className="h-6 px-2 text-[10px] rounded border"
                style={{
                  borderColor: "hsl(var(--hairline))",
                  background: formulaFn === f ? "hsl(var(--accent-gold-soft))" : undefined,
                  color: formulaFn === f ? "hsl(var(--accent-gold))" : undefined,
                }}
              >{f}</button>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground leading-snug">
            Funktion aktivieren, dann in der Tabelle: Zielzelle → Startzelle → Endzelle.
            Direkte Eingaben wie <span className="font-mono">=C2*D2</span> sind ebenfalls möglich.
          </div>
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onConfirm}
            className="flex-1 h-7 rounded text-[11px] font-medium flex items-center justify-center gap-1.5"
            style={{ background: "hsl(var(--ink))", color: "hsl(var(--surface))" }}
          >
            <Check size={12} /> Bestätigen
          </button>
          <button
            onClick={onCancel}
            className="h-7 px-2.5 rounded text-[11px] border flex items-center gap-1"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <X size={12} /> Abbrechen
          </button>
        </div>
      )}
    </div>
  );
}

function MiniBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-7 px-1.5 rounded-md border text-[10px] flex items-center gap-1 justify-center hover:bg-muted disabled:opacity-30"
      style={{ borderColor: "hsl(var(--hairline))" }}
    >
      {icon}<span className="truncate">{label}</span>
    </button>
  );
}

function Toggle({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 rounded-md border flex items-center justify-center hover:bg-muted"
      style={{
        borderColor: "hsl(var(--hairline))",
        background: active ? "hsl(var(--accent-gold-soft))" : undefined,
        color: active ? "hsl(var(--accent-gold))" : undefined,
      }}
    >{children}</button>
  );
}

function UnitField({ label, value, unit, min, max, onChange }: {
  label: string; value: number; unit: string; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div
        className="flex items-center h-7 px-1.5 rounded-md border bg-background"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <input
          type="number"
          min={min}
          max={max}
          value={Math.round(value * 10) / 10}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
          className="w-12 text-right text-[11px] bg-transparent outline-none"
        />
        <span className="text-[10px] text-muted-foreground pl-1">{unit}</span>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded border cursor-pointer"
        style={{ borderColor: "hsl(var(--hairline))" }}
      />
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center rounded-md border" style={{ borderColor: "hsl(var(--hairline))" }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="h-7 w-7 flex items-center justify-center hover:bg-muted disabled:opacity-30"
        ><Minus size={11} /></button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
          className="w-10 h-7 text-center text-[11px] bg-transparent outline-none"
        />
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-7 w-7 flex items-center justify-center hover:bg-muted disabled:opacity-30"
        ><Plus size={11} /></button>
      </div>
    </div>
  );
}


const SIDE_LABEL: Record<"top" | "right" | "bottom" | "left", string> = {
  top: "Oben", right: "Rechts", bottom: "Unten", left: "Links",
};

const colName = (c: number): string => {
  let n = c, out = "";
  do { out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return out;
};
