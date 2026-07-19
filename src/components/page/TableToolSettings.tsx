import React from "react";
import { Plus, Minus, Check, X, Pencil } from "lucide-react";
import { projectStore } from "@/lib/projectStore";
import type { PageElement } from "@/lib/projectStore";

/**
 * Werkzeug-Einstellungen für das Tabellen-Werkzeug (Projektmappe).
 *
 * Etappe 1:
 *  - Placement-Preview: Tabelle wird direkt beim Aktivieren des Werkzeugs
 *    mittig auf der Seite platziert; Zeilen/Spalten sind hier live einstellbar.
 *  - "Tabelle modifizieren"-Schalter aktiviert die Inline-+/-–Bedienknöpfe
 *    an der Tabelle selbst (siehe TableElementView).
 *  - "Bestätigen" schließt den Placement-Modus; "Abbrechen" verwirft.
 *
 * Weitere Etappen (Filter, Rahmen, Hintergrund, HUB, Formel-Klick) folgen.
 */
export function TableToolSettings({
  projectId,
  pageId,
  tableElement,
  isPending,
  modifyMode,
  setModifyMode,
  onConfirm,
  onCancel,
}: {
  projectId: string;
  pageId: string;
  tableElement?: PageElement;
  isPending: boolean;
  modifyMode: boolean;
  setModifyMode: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!tableElement || tableElement.kind !== "table") {
    return (
      <div
        className="rounded-md border p-2 text-[11px] text-muted-foreground"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        Wähle eine Tabelle aus, um sie zu bearbeiten.
      </div>
    );
  }

  const data = tableElement.tableData ?? { cells: [[""]], headerRow: true, filters: {} };
  const rows = data.cells.length;
  const cols = data.cells[0]?.length ?? 1;

  // Zellgrößen für automatische Anpassung der Element-Maße (in mm).
  // 11pt Fließtext ≈ 3,9 mm — Zellhöhe 7 mm, Spaltenbreite 26 mm passt gut.
  const CELL_W_MM = 26;
  const CELL_H_MM = 7;

  const resize = (nextRows: number, nextCols: number) => {
    const R = Math.max(1, Math.min(64, Math.round(nextRows)));
    const C = Math.max(1, Math.min(24, Math.round(nextCols)));
    const cells: string[][] = [];
    for (let r = 0; r < R; r++) {
      const row: string[] = [];
      for (let c = 0; c < C; c++) {
        const existing = data.cells[r]?.[c];
        if (existing !== undefined) row.push(existing);
        else if (r === 0 && data.headerRow !== false) row.push(`Spalte ${String.fromCharCode(65 + c)}`);
        else row.push("");
      }
      cells.push(row);
    }
    projectStore.updateElement(projectId, pageId, tableElement.id, {
      w: CELL_W_MM * C,
      h: CELL_H_MM * R,
      tableData: { ...data, cells },
    } as any);
  };

  return (
    <div className="space-y-3">
      <div
        className="rounded-md border p-2 space-y-2"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <div className="text-[11px] font-semibold text-muted-foreground">Tabelle</div>

        <RowColStepper label="Spalten" value={cols} min={1} max={24} onChange={(v) => resize(rows, v)} />
        <RowColStepper label="Zeilen"  value={rows} min={1} max={64} onChange={(v) => resize(v, cols)} />

        <label className="flex items-center gap-2 text-[11px] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={modifyMode}
            onChange={(e) => setModifyMode(e.target.checked)}
          />
          <Pencil size={11} />
          <span>Tabelle modifizieren</span>
        </label>
        <div className="text-[10px] text-muted-foreground leading-snug">
          Blendet +/- an Spalten- und Zeilenrändern ein, um live zu ergänzen oder zu entfernen.
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onConfirm}
            className="flex-1 h-8 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5"
            style={{ background: "hsl(var(--accent-gold))", color: "hsl(var(--surface))" }}
          >
            <Check size={12} /> Bestätigen
          </button>
          <button
            onClick={onCancel}
            className="h-8 px-2.5 rounded-md text-[11px] border flex items-center gap-1"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <X size={12} /> Abbrechen
          </button>
        </div>
      )}
    </div>
  );
}

function RowColStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div
        className="flex items-center rounded-md border"
        style={{ borderColor: "hsl(var(--hairline))" }}
      >
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="h-7 w-7 flex items-center justify-center hover:bg-muted disabled:opacity-30"
        >
          <Minus size={11} />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-10 h-7 text-center text-[11px] bg-transparent outline-none"
        />
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="h-7 w-7 flex items-center justify-center hover:bg-muted disabled:opacity-30"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}
