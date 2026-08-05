import React, { useRef, useState } from "react";
import { GripVertical, Trash2, Calendar } from "lucide-react";
import {
  financeStore, formatEur, parseEur,
  type FinancePosition, type FinancePositionType,
} from "@/lib/financeStore";

interface Props {
  projectId: string;
  nodeId: string;
  positions: FinancePosition[];
}

const TYPE_LABEL: Record<FinancePositionType, string> = {
  offer: "Angebot",
  invoice: "Rechnung",
  supplement: "Nachtrag",
};

const NUMBER_PLACEHOLDER: Record<FinancePositionType, string> = {
  offer: "z. B. ANG-2024-1001",
  invoice: "z. B. RE-2024-2001",
  supplement: "z. B. NT-2024-3001",
};

export const FinancePositionsTable: React.FC<Props> = ({ projectId, nodeId, positions }) => {
  const [dragId, setDragId] = useState<string | null>(null);

  const upd = (id: string, patch: Partial<FinancePosition>) =>
    financeStore.updatePosition(projectId, id, patch);

  // Fortlaufende Nummerierung von oben nach unten, je Typ (Nachträge zusätzlich
  // nach Mehr-/Mindernachtrag getrennt).
  const counters: Record<string, number> = {};
  const numberOf = new Map<string, string>();
  for (const p of positions) {
    const key = p.type === "supplement" ? `s-${p.supplementKind ?? "plus"}` : p.type;
    counters[key] = (counters[key] ?? 0) + 1;
    numberOf.set(p.id, String(counters[key]).padStart(2, "0"));
  }



  return (
    <div className="rounded-xl border overflow-hidden"
         style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
      <div className="grid items-center px-3 py-2 border-b text-[11px] font-semibold uppercase tracking-wider"
           style={{ gridTemplateColumns: "24px 1.4fr 1fr 1.2fr 1fr 2fr 32px", borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
        <span />
        <span>Typ</span>
        <span>Datum</span>
        <span>Nummer</span>
        <span>Betrag</span>
        <span>Notiz</span>
        <span />
      </div>

      {positions.length === 0 && (
        <div className="px-4 py-6 text-xs" style={{ color: "hsl(var(--ink-soft))" }}>
          Noch keine Positionen. Über „+ Angebot", „+ Rechnung" oder „+ Nachtrag" anlegen.
        </div>
      )}

      {positions.map((p) => {
        const isMinus = p.type === "supplement" && p.supplementKind === "minus";
        const isPlus = p.type === "supplement" && p.supplementKind === "plus";
        const amountColor = isPlus ? "hsl(24 95% 50%)" : isMinus ? "hsl(142 70% 34%)" : undefined;
        return (
          <div key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId && dragId !== p.id) financeStore.reorderPositions(projectId, nodeId, dragId, p.id); setDragId(null); }}
            className="grid items-center px-3 py-1.5 border-b text-sm"
            style={{ gridTemplateColumns: "24px 1.4fr 1fr 1.2fr 1fr 2fr 32px", borderColor: "hsl(var(--hairline))" }}>
            <span className="cursor-grab active:cursor-grabbing" title="Position verschieben">
              <GripVertical size={14} style={{ color: "hsl(var(--ink-soft))" }} />
            </span>

            <div className="flex items-center gap-1 min-w-0 pr-2">

              {p.type === "supplement" ? (
                <select
                  value={p.supplementKind ?? "plus"}
                  onChange={(e) => upd(p.id, { supplementKind: e.target.value as "plus" | "minus" })}
                  title={isMinus ? "Mindernachtrag" : "Mehrnachtrag"}
                  className="bg-transparent text-[11px] outline-none border rounded px-0.5 py-0.5 min-w-0 flex-1 truncate"
                  style={{ borderColor: "hsl(var(--hairline))" }}>
                  <option value="plus">Mehrnachtr.</option>
                  <option value="minus">Mindernachtr.</option>
                </select>
              ) : (
                <span className="truncate flex-1">{TYPE_LABEL[p.type]}</span>
              )}
              <span className="text-xs tabular-nums shrink-0" style={{ color: "hsl(var(--ink-soft))" }}>
                {numberOf.get(p.id)}
              </span>
            </div>

            <DateCell value={p.date} onChange={(v) => upd(p.id, { date: v })} />


            <input value={p.number} placeholder={NUMBER_PLACEHOLDER[p.type]}
              onChange={(e) => upd(p.id, { number: e.target.value })}
              className="bg-transparent text-sm outline-none pr-2 min-w-0" />

            <AmountInput value={p.amount} color={amountColor} negative={isMinus}
              onCommit={(v) => upd(p.id, { amount: v })} />

            <input value={p.note} placeholder="Notiz eingeben..."
              onChange={(e) => upd(p.id, { note: e.target.value })}
              className="bg-transparent text-sm outline-none pr-2 min-w-0" />

            <button type="button" onClick={() => financeStore.deletePosition(projectId, p.id)}
              className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted" title="Position löschen">
              <Trash2 size={14} style={{ color: "hsl(var(--ink-soft))" }} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

/** Datum mit Kalendersymbol als Auslöser; natives Icon wird ausgeblendet. */
const DateCell: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* not supported */ }
  };
  return (
    <div className="flex items-center gap-1.5 pr-2">
      <button type="button" onClick={open} title="Kalender öffnen"
        className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted shrink-0">
        <Calendar size={13} style={{ color: "hsl(var(--ink-soft))" }} />
      </button>
      <input ref={ref} type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm outline-none w-full [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none" />
    </div>
  );
};


const AmountInput: React.FC<{ value: number; color?: string; negative?: boolean; onCommit: (v: number) => void }> =
({ value, color, negative, onCommit }) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <input
      value={focused ? draft : `${negative && value ? "−" : ""}${formatEur(value)}`}
      onFocus={() => { setDraft(value ? String(value) : ""); setFocused(true); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); onCommit(Math.abs(parseEur(draft))); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="bg-transparent text-sm font-medium outline-none pr-2 min-w-0"
      style={{ color }}
    />
  );
};
