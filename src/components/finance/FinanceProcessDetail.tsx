import React, { useState } from "react";
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, CreditCard, FileText, Pencil, RotateCcw,
} from "lucide-react";
import {
  financeStore, parseEur, positionsOf,
  type FinanceDirection, type FinanceNode, type FinancePosition, type FinancePositionType,
  type FinanceState, type InvoiceKind, type PositionStatus, type TaxBasis,
} from "@/lib/financeStore";
import { computeProcessSummary, formatMoney } from "@/lib/financeMath";

interface Props {
  projectId: string;
  state: FinanceState;
  node: FinanceNode;
  onBack: () => void;
}

const POS_LABEL_EXPENSE: Record<FinancePositionType, string> = {
  offer: "Angebot erhalten",
  order: "Auftrag vergeben",
  invoice: "Rechnung erhalten",
  credit: "Gutschrift",
  supplement: "Nachtrag",
};

const POS_LABEL_INCOME: Record<FinancePositionType, string> = {
  offer: "Angebot erstellt",
  order: "Auftrag erhalten",
  invoice: "Rechnung gestellt",
  credit: "Gutschrift",
  supplement: "Nachtrag",
};

const STATUS_LABEL: Record<PositionStatus, string> = {
  open: "Offen",
  approved: "Bestätigt",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
};

const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  single: "Einzelrechnung",
  partial: "Abschlagsrechnung",
  final_cumulative: "Schlussrechnung (kumuliert)",
};

const FORECAST_SOURCE_LABEL = {
  manual: "Manuell festgelegt",
  order: "Aus Auftrag abgeleitet",
  invoiced: "Aus Rechnungen (vorläufig)",
  estimate: "Aus Schätzung (vorläufig)",
  incomplete: "Noch unvollständig",
};

export const FinanceProcessDetail: React.FC<Props> = ({ projectId, state, node, onBack }) => {
  const dir: FinanceDirection = node.direction ?? "expense";
  const taxDisplay: TaxBasis = state.taxDisplay ?? "gross";
  const currency = state.currency || "EUR";
  const fmt = (v: number) => formatMoney(v, currency);

  const summary = computeProcessSummary(state, node, taxDisplay);
  const positions = positionsOf(state, node.id);
  const payments = (state.payments ?? []).filter((p) => p.nodeId === node.id);
  const labels = dir === "income" ? POS_LABEL_INCOME : POS_LABEL_EXPENSE;

  const [editingForecast, setEditingForecast] = useState(false);
  const [forecastDraft, setForecastDraft] = useState("");

  const [addingPayment, setAddingPayment] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");

  const handleSaveForecast = () => {
    const val = parseEur(forecastDraft);
    if (forecastDraft.trim() === "") {
      financeStore.updateNode(projectId, node.id, { manualForecast: null });
    } else if (Number.isFinite(val) && val >= 0) {
      financeStore.updateNode(projectId, node.id, { manualForecast: Math.round(val * 100) / 100 });
    }
    setEditingForecast(false);
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseEur(payAmount);
    if (!Number.isFinite(val) || val <= 0) return;
    financeStore.addPayment(projectId, {
      nodeId: node.id,
      date: payDate || new Date().toISOString().slice(0, 10),
      amount: Math.round(val * 100) / 100,
      reference: payRef.trim(),
      note: "",
    });
    setPayAmount("");
    setPayRef("");
    setAddingPayment(false);
  };

  const actionButtons: { type: FinancePositionType; label: string }[] = dir === "income"
    ? [
        { type: "offer", label: "Angebot hinzufügen" },
        { type: "order", label: "Auftrag erhalten" },
        { type: "invoice", label: "Rechnung stellen" },
        { type: "supplement", label: "Nachtrag hinzufügen" },
      ]
    : [
        { type: "offer", label: "Angebot hinzufügen" },
        { type: "order", label: "Auftrag vergeben" },
        { type: "invoice", label: "Rechnung hinzufügen" },
        { type: "supplement", label: "Nachtrag hinzufügen" },
      ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-3 rounded-lg border text-sm font-medium flex items-center gap-2 hover:bg-muted"
          style={{ borderColor: "hsl(var(--hairline))" }}
        >
          <ArrowLeft size={16} /> Zurück zur Übersicht
        </button>
        <div className="flex items-center gap-2">
          {(["expense", "income"] as FinanceDirection[]).map((d) => {
            const active = dir === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => financeStore.updateNode(projectId, node.id, { direction: d })}
                className="min-h-[40px] px-3 rounded-lg border text-xs font-semibold"
                style={{
                  borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                  background: active ? "hsl(var(--accent-gold) / 0.14)" : "transparent",
                  color: active ? "hsl(var(--accent-gold))" : "hsl(var(--ink-soft))",
                }}
              >
                {d === "expense" ? "Ausgabe" : "Einnahme"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Kopfdaten des Vorgangs */}
      <div
        className="rounded-xl border p-4 grid grid-cols-1 md:grid-cols-2 gap-3"
        style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
      >
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: "hsl(var(--ink-soft))" }}>
            Bezeichnung des Vorgangs
          </label>
          <input
            value={node.name}
            onChange={(e) => financeStore.updateNode(projectId, node.id, { name: e.target.value })}
            placeholder="z. B. Elektroarbeiten"
            className="w-full h-10 rounded-lg border px-3 text-sm font-semibold outline-none focus:border-[hsl(var(--accent-gold))]"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: "hsl(var(--ink-soft))" }}>
            {dir === "income" ? "Auftraggeber / Kunde" : "Auftragnehmer / Geschäftspartner"}
          </label>
          <input
            value={node.partner ?? ""}
            onChange={(e) => financeStore.updateNode(projectId, node.id, { partner: e.target.value })}
            placeholder={dir === "income" ? "z. B. Kunde Schmidt" : "z. B. Firma Müller"}
            className="w-full h-10 rounded-lg border px-3 text-sm outline-none focus:border-[hsl(var(--accent-gold))]"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] uppercase tracking-wider mb-1" style={{ color: "hsl(var(--ink-soft))" }}>
            Notiz
          </label>
          <input
            value={node.note}
            onChange={(e) => financeStore.updateNode(projectId, node.id, { note: e.target.value })}
            placeholder="Hinweise, Vertragsnummer oder Leistungsumfang …"
            className="w-full h-10 rounded-lg border px-3 text-sm outline-none focus:border-[hsl(var(--accent-gold))]"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
          />
        </div>
      </div>

      {/* Kompakte Zusammenfassung */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>Beauftragt</div>
          <div className="text-base font-semibold mt-1">{fmt(summary.orderTotal)}</div>
          {summary.openSupplements !== 0 && (
            <div className="text-[11px] mt-0.5" style={{ color: "hsl(34 92% 52%)" }}>
              Offene Nachträge: {fmt(summary.openSupplements)}
            </div>
          )}
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>Berechnet</div>
          <div className="text-base font-semibold mt-1">{fmt(summary.invoicedTotal)}</div>
          {summary.remainingOrderAmount > 0 && (
            <div className="text-[11px] mt-0.5" style={{ color: "hsl(var(--ink-soft))" }}>
              Offener Auftrag: {fmt(summary.remainingOrderAmount)}
            </div>
          )}
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>
            {dir === "income" ? "Erhalten" : "Bezahlt"}
          </div>
          <div className="text-base font-semibold mt-1">{fmt(summary.paidTotal)}</div>
          {summary.unassignedPrepayments > 0 && (
            <div className="text-[11px] mt-0.5" style={{ color: "hsl(34 92% 52%)" }}>
              Vorauszahlung: {fmt(summary.unassignedPrepayments)}
            </div>
          )}
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>
            {summary.overpaymentAmount > 0 ? "Überzahlung / Guthaben" : "Offener Rechnungsbetrag"}
          </div>
          <div
            className="text-base font-semibold mt-1"
            style={{
              color: summary.overdueAmount > 0
                ? "hsl(var(--destructive))"
                : summary.overpaymentAmount > 0
                  ? "hsl(34 92% 52%)"
                  : summary.openInvoiceAmount === 0 && summary.invoicedTotal > 0
                    ? "hsl(142 65% 42%)"
                    : undefined,
            }}
          >
            {summary.overpaymentAmount > 0 ? fmt(summary.overpaymentAmount) : fmt(summary.openInvoiceAmount)}
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 rounded-xl border p-3" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] uppercase tracking-wider" style={{ color: "hsl(var(--ink-soft))" }}>Erwartet gesamt</span>
            {!editingForecast && (
              <button
                type="button"
                onClick={() => { setForecastDraft(String(summary.expectedTotal || "")); setEditingForecast(true); }}
                className="text-[11px] flex items-center gap-1 hover:underline"
                style={{ color: "hsl(var(--accent-gold))" }}
              >
                <Pencil size={11} /> Ändern
              </button>
            )}
          </div>
          {editingForecast ? (
            <div className="mt-1 flex items-center gap-1">
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                value={forecastDraft}
                onChange={(e) => setForecastDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveForecast(); if (e.key === "Escape") setEditingForecast(false); }}
                className="w-full h-8 rounded border px-2 text-xs outline-none"
                style={{ borderColor: "hsl(var(--accent-gold))", background: "hsl(var(--surface))" }}
              />
              <button type="button" onClick={handleSaveForecast} className="h-8 px-2 rounded text-xs font-semibold" style={{ background: "hsl(var(--accent-gold))", color: "#111" }}>OK</button>
            </div>
          ) : (
            <>
              <div className="text-base font-semibold mt-1">{fmt(summary.expectedTotal)}</div>
              <div className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: "hsl(var(--ink-soft))" }}>
                <span>{FORECAST_SOURCE_LABEL[summary.forecastSource]}</span>
                {summary.forecastSource === "manual" && (
                  <button
                    type="button"
                    title="Manuelle Prognose zurücksetzen"
                    onClick={() => financeStore.updateNode(projectId, node.id, { manualForecast: null })}
                    className="hover:text-foreground"
                  >
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Aktionsleiste */}
      <div className="flex flex-wrap gap-2">
        {actionButtons.map((btn) => (
          <button
            key={btn.type}
            type="button"
            onClick={() => financeStore.addPosition(projectId, node.id, btn.type)}
            className="min-h-[44px] px-3.5 rounded-lg border text-xs sm:text-sm font-medium flex items-center gap-1.5 hover:border-[hsl(var(--accent-gold))]"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
          >
            <Plus size={15} style={{ color: "hsl(var(--accent-gold))" }} />
            {btn.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAddingPayment((v) => !v)}
          className="min-h-[44px] px-3.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5"
          style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
        >
          <CreditCard size={15} /> Zahlung erfassen
        </button>
      </div>

      {/* Zahlung erfassen Formular */}
      {addingPayment && (
        <form
          onSubmit={handleAddPayment}
          className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
          style={{ borderColor: "hsl(var(--accent-gold) / 0.5)", background: "hsl(var(--surface-card))" }}
        >
          <div>
            <label className="block text-xs mb-1" style={{ color: "hsl(var(--ink-soft))" }}>Betrag ({currency})</label>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="z. B. 5.000,00"
              className="w-full h-10 rounded-lg border px-3 text-sm outline-none"
              style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "hsl(var(--ink-soft))" }}>Datum</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="w-full h-10 rounded-lg border px-3 text-sm outline-none"
              style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "hsl(var(--ink-soft))" }}>Referenz / Verwendungszweck</label>
            <input
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="z. B. Überweisung RE-01"
              className="w-full h-10 rounded-lg border px-3 text-sm outline-none"
              style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="h-10 flex-1 rounded-lg text-sm font-semibold"
              style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => setAddingPayment(false)}
              className="h-10 px-3 rounded-lg border text-sm"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              Abbruch
            </button>
          </div>
        </form>
      )}

      {/* Belege (Angebote, Aufträge, Nachträge, Rechnungen) */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="text-sm font-semibold flex items-center gap-2">
            <FileText size={16} style={{ color: "hsl(var(--accent-gold))" }} />
            Belege ({positions.length})
          </div>
        </div>
        {positions.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: "hsl(var(--ink-soft))" }}>
            Noch keine Belege erfasst. Nutze die Buttons oben, um Angebote, Aufträge oder Rechnungen anzulegen.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
            {positions.map((pos) => (
              <PositionRow
                key={pos.id}
                projectId={projectId}
                pos={pos}
                typeLabel={labels[pos.type]}
                currency={currency}
              />
            ))}
          </div>
        )}
      </div>

      {/* Zahlungen */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "hsl(var(--hairline))" }}>
          <div className="text-sm font-semibold flex items-center gap-2">
            <CreditCard size={16} style={{ color: "hsl(var(--accent-gold))" }} />
            Zahlungen ({payments.length})
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="p-4 text-xs text-center" style={{ color: "hsl(var(--ink-soft))" }}>
            Noch keine Zahlungen erfasst.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "hsl(var(--hairline))" }}>
            {payments.map((pay) => (
              <div key={pay.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{pay.reference || "Zahlung"}</div>
                  <div className="text-xs" style={{ color: "hsl(var(--ink-soft))" }}>{pay.date}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-semibold">{fmt(pay.amount)}</span>
                  <button
                    type="button"
                    aria-label="Zahlung löschen"
                    onClick={() => financeStore.deletePayment(projectId, pay.id)}
                    className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted"
                    style={{ color: "hsl(var(--ink-soft))" }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const PositionRow: React.FC<{
  projectId: string;
  pos: FinancePosition;
  typeLabel: string;
  currency: string;
}> = ({ projectId, pos, typeLabel, currency }) => {
  const [amountDraft, setAmountDraft] = useState(
    pos.amount ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pos.amount) : "",
  );

  const upd = (patch: Partial<FinancePosition>) => financeStore.updatePosition(projectId, pos.id, patch);

  return (
    <div className="p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="px-2 py-0.5 rounded text-xs font-semibold"
            style={{ background: "hsl(var(--accent-gold) / 0.14)", color: "hsl(var(--accent-gold))" }}
          >
            {typeLabel}
          </span>
          {pos.type === "supplement" && (
            <select
              value={pos.supplementKind ?? "plus"}
              onChange={(e) => upd({ supplementKind: e.target.value as "plus" | "minus" })}
              className="h-8 rounded border px-2 text-xs bg-transparent"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              <option value="plus">Mehrnachtrag (+)</option>
              <option value="minus">Mindernachtrag (−)</option>
            </select>
          )}
          {pos.type === "invoice" && (
            <select
              value={pos.invoiceKind ?? "single"}
              onChange={(e) => upd({ invoiceKind: e.target.value as InvoiceKind })}
              className="h-8 rounded border px-2 text-xs bg-transparent"
              style={{ borderColor: "hsl(var(--hairline))" }}
            >
              {(Object.keys(INVOICE_KIND_LABEL) as InvoiceKind[]).map((k) => (
                <option key={k} value={k}>{INVOICE_KIND_LABEL[k]}</option>
              ))}
            </select>
          )}
          <select
            value={pos.status ?? "open"}
            onChange={(e) => upd({ status: e.target.value as PositionStatus })}
            className="h-8 rounded border px-2 text-xs bg-transparent"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            {(Object.keys(STATUS_LABEL) as PositionStatus[]).map((st) => (
              <option key={st} value={st}>{STATUS_LABEL[st]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          {pos.type === "offer" && pos.status !== "approved" && (
            <button
              type="button"
              onClick={() => financeStore.acceptOfferAsOrder(projectId, pos.id)}
              className="h-8 px-2.5 rounded-lg border text-xs font-medium flex items-center gap-1 hover:border-[hsl(var(--accent-gold))]"
              style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--accent-gold))" }}
            >
              <CheckCircle2 size={13} /> Beauftragen
            </button>
          )}
          <button
            type="button"
            aria-label="Beleg löschen"
            onClick={() => financeStore.deletePosition(projectId, pos.id)}
            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted"
            style={{ color: "hsl(var(--ink-soft))" }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <input
          value={pos.number}
          onChange={(e) => upd({ number: e.target.value })}
          placeholder="Beleg-Nr."
          className="h-9 rounded-lg border px-2.5 text-sm outline-none"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
        />
        <input
          type="date"
          value={pos.date}
          onChange={(e) => upd({ date: e.target.value })}
          className="h-9 rounded-lg border px-2.5 text-sm outline-none"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
        />
        <div className="flex gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            onBlur={() => {
              const v = parseEur(amountDraft);
              upd({ amount: v });
              setAmountDraft(v ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) : "");
            }}
            placeholder={`Betrag (${currency})`}
            className="w-full h-9 rounded-lg border px-2.5 text-sm font-medium outline-none text-right"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
          />
          <select
            value={pos.amountBasis ?? "gross"}
            onChange={(e) => upd({ amountBasis: e.target.value as TaxBasis })}
            className="h-9 rounded-lg border px-1.5 text-xs bg-transparent shrink-0"
            style={{ borderColor: "hsl(var(--hairline))" }}
          >
            <option value="gross">Brutto</option>
            <option value="net">Netto</option>
          </select>
        </div>
        {pos.type === "invoice" ? (
          <input
            type="date"
            title="Fälligkeitsdatum"
            value={pos.dueDate ?? ""}
            onChange={(e) => upd({ dueDate: e.target.value })}
            className="h-9 rounded-lg border px-2.5 text-sm outline-none"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
          />
        ) : (
          <input
            type="number"
            min={0}
            max={100}
            value={pos.taxRate ?? ""}
            onChange={(e) => upd({ taxRate: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="MwSt. %"
            className="h-9 rounded-lg border px-2.5 text-sm outline-none"
            style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
          />
        )}
        <input
          value={pos.note}
          onChange={(e) => upd({ note: e.target.value })}
          placeholder="Notiz"
          className="h-9 rounded-lg border px-2.5 text-sm outline-none"
          style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
        />
      </div>
    </div>
  );
};