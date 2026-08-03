import React, { useState } from "react";
import { Info, Pencil } from "lucide-react";
import {
  control, formatEur, formatPct, parseEur,
  type FinancePosition, type FinanceTotals,
} from "@/lib/financeStore";

interface Props {
  totals: FinanceTotals;
  onEstimateChange?: (value: number) => void;
  /** Positionen für die aufklappbare Rechnungsübersicht (optional). */
  invoiceDetails?: FinancePosition[];
  subtitle?: string;
}

const cellCls = "px-4 py-3 flex-1 min-w-0";

type ControlMode = "est-offer" | "est-invoice" | "offer-invoice";

const CONTROL_LABEL: Record<ControlMode, string> = {
  "est-offer": "Schätzung vs. Angebot",
  "est-invoice": "Schätzung vs. Rechnung",
  "offer-invoice": "Angebot vs. Rechnung",
};

/** Einheitliche Schriftgröße für alle Beträge – richtet sich nach dem längsten. */
function amountFontSize(values: number[]): number {
  const len = Math.max(...values.map((v) => formatEur(v).length), 1);
  if (len <= 11) return 18;
  if (len <= 13) return 16;
  if (len <= 15) return 14;
  if (len <= 18) return 12.5;
  return 11;
}

export const FinanceSummaryCard: React.FC<Props> = ({ totals, onEstimateChange, invoiceDetails, subtitle }) => {
  const [editEstimate, setEditEstimate] = useState(false);
  const [draft, setDraft] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [mode, setMode] = useState<ControlMode>("est-offer");

  const base = mode === "offer-invoice" ? totals.offers : totals.estimate;
  const value = mode === "est-offer" ? totals.offers : totals.invoices;
  const c = control(base, value);
  const amountSize = amountFontSize([totals.estimate, totals.offers, totals.invoices]);

  const deltaColor = (d: number) => (d > 0 ? "hsl(var(--destructive))" : "hsl(142 70% 34%)");


  return (
    <div className="rounded-xl border overflow-hidden"
         style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
      <div className="flex flex-wrap items-stretch divide-x" style={{ borderColor: "hsl(var(--hairline))" }}>
        <div className={cellCls} style={{ maxWidth: 240 }}>
          <div className="text-sm font-semibold">Gesamt</div>
          <div className="text-xs" style={{ color: "hsl(var(--ink-soft))" }}>
            {subtitle ?? "Übersicht aller Positionen"}
          </div>
        </div>

        <div className={cellCls}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1"
               style={{ color: "hsl(var(--ink-soft))" }}>Kostenschätzung</div>
          {editEstimate && onEstimateChange ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { onEstimateChange(parseEur(draft)); setEditEstimate(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { onEstimateChange(parseEur(draft)); setEditEstimate(false); }
                if (e.key === "Escape") setEditEstimate(false);
              }}
              className="w-full bg-transparent border rounded px-2 py-1 font-semibold outline-none"
              style={{ borderColor: "hsl(var(--hairline))", fontSize: amountSize }}
            />
          ) : (
            <button type="button"
              disabled={!onEstimateChange}
              onClick={() => { setDraft(String(totals.estimate || "")); setEditEstimate(true); }}
              className="flex items-center gap-2 font-semibold whitespace-nowrap"
              style={{ fontSize: amountSize }}>
              {formatEur(totals.estimate)}
              {onEstimateChange && <Pencil size={13} style={{ color: "hsl(var(--ink-soft))" }} />}
            </button>
          )}
        </div>

        <div className={cellCls}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1"
               style={{ color: "hsl(var(--ink-soft))" }}>Angebote</div>
          <div className="font-semibold whitespace-nowrap"
               style={{ color: "hsl(var(--accent-strong, 24 95% 50%))", fontSize: amountSize }}>
            {formatEur(totals.offers)}
          </div>
        </div>

        <div className={cellCls}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1"
               style={{ color: "hsl(var(--ink-soft))" }}>
            Rechnungen
            {invoiceDetails && (
              <button type="button" onClick={() => setShowDetails((v) => !v)}
                title="Rechnungsübersicht anzeigen"
                className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-muted">
                <Info size={12} />
              </button>
            )}
          </div>
          <div className="font-semibold whitespace-nowrap" style={{ fontSize: amountSize }}>{formatEur(totals.invoices)}</div>

          <div className="text-xs mt-0.5" style={{ color: "hsl(var(--ink-soft))" }}>
            Nachträge: {totals.supplements < 0 ? "−" : "+"} {formatEur(Math.abs(totals.supplements))}
          </div>
        </div>

        <div className={cellCls}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1"
               style={{ color: "hsl(var(--ink-soft))" }}>Kontrolle</div>
          <select value={mode} onChange={(e) => setMode(e.target.value as ControlMode)}
            data-export-hide
            className="mb-1 w-full bg-transparent text-[11px] outline-none border rounded px-1 py-0.5"
            style={{ borderColor: "hsl(var(--hairline))" }}>
            {(Object.keys(CONTROL_LABEL) as ControlMode[]).map((m) => (
              <option key={m} value={m}>{CONTROL_LABEL[m]}</option>
            ))}
          </select>
          {/* Im Export wird das Drop-Down durch den vollständigen Text ersetzt. */}
          <div data-export-only className="mb-1 text-[11px] whitespace-nowrap font-medium">
            {CONTROL_LABEL[mode]}
          </div>
          <div className="font-semibold whitespace-nowrap"
               style={{ color: deltaColor(c.delta), fontSize: amountSize }}>
            {c.delta > 0 ? "+" : ""}{formatEur(c.delta)}
          </div>
          <div className="text-xs" style={{ color: "hsl(var(--ink-soft))" }}>
            {formatPct(c.pct)}
            {c.pct !== null && ` (${c.pct - 100 > 0 ? "+" : "−"}${formatPct(Math.abs(c.pct - 100))})`}
          </div>
        </div>

      </div>

      {showDetails && invoiceDetails && (
        <div className="border-t px-4 py-3" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-2"
               style={{ color: "hsl(var(--ink-soft))" }}>Rechnungsübersicht</div>
          {invoiceDetails.length === 0 ? (
            <div className="text-xs" style={{ color: "hsl(var(--ink-soft))" }}>Keine Rechnungen oder Nachträge angelegt.</div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {invoiceDetails.map((p) => {
                  const isMinus = p.type === "supplement" && p.supplementKind === "minus";
                  const isPlus = p.type === "supplement" && p.supplementKind === "plus";
                  return (
                    <tr key={p.id} className="border-t" style={{ borderColor: "hsl(var(--hairline))" }}>
                      <td className="py-1.5 pr-3">
                        {p.type === "invoice" ? "Rechnung" : isMinus ? "Nachtrag (Mindernachtrag)" : "Nachtrag (Mehrnachtrag)"}
                      </td>
                      <td className="py-1.5 pr-3" style={{ color: "hsl(var(--ink-soft))" }}>{p.date}</td>
                      <td className="py-1.5 pr-3" style={{ color: "hsl(var(--ink-soft))" }}>{p.number}</td>
                      <td className="py-1.5 text-right font-medium"
                          style={{ color: isPlus ? "hsl(24 95% 50%)" : isMinus ? "hsl(142 70% 34%)" : undefined }}>
                        {isMinus ? "−" : ""}{formatEur(p.amount)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t font-semibold" style={{ borderColor: "hsl(var(--hairline))" }}>
                  <td className="py-1.5" colSpan={3}>Summe Rechnungen inkl. Nachträge</td>
                  <td className="py-1.5 text-right">{formatEur(invoiceDetails.reduce((s, p) =>
                    s + (p.type === "supplement" && p.supplementKind === "minus" ? -(p.amount || 0) : (p.amount || 0)), 0))}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
