import React, { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { parseEur, type TaxBasis } from "@/lib/financeStore";

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  initialAmount: number | null;
  initialBasis: TaxBasis;
  currency?: string;
  onSave: (amount: number | null, basis: TaxBasis) => void;
  onClose: () => void;
}

export const FinanceBudgetModal: React.FC<Props> = ({
  open,
  title,
  subtitle,
  initialAmount,
  initialBasis,
  currency = "EUR",
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState("");
  const [basis, setBasis] = useState<TaxBasis>(initialBasis);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(
      initialAmount !== null
        ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(initialAmount)
        : "",
    );
    setBasis(initialBasis);
    setError(null);
  }, [open, initialAmount, initialBasis]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Bitte einen Betrag eingeben oder das Budget entfernen.");
      return;
    }
    const parsed = parseEur(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Bitte einen gültigen, nicht negativen Betrag eingeben.");
      return;
    }
    onSave(Math.round(parsed * 100) / 100, basis);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border p-5 shadow-2xl"
        style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-card))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {subtitle && (
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--ink-soft))" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "hsl(var(--ink-soft))" }}>
              Betrag ({currency})
            </label>
            <div className="relative">
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setError(null); }}
                placeholder="z. B. 150.000,00"
                className="w-full h-11 rounded-lg border px-3 pr-12 text-base font-medium outline-none focus:border-[hsl(var(--accent-gold))]"
                style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface))" }}
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold"
                style={{ color: "hsl(var(--ink-soft))" }}
              >
                {currency}
              </span>
            </div>
            {error && <p className="text-xs mt-1.5" style={{ color: "hsl(var(--destructive))" }}>{error}</p>}
          </div>

          <div>
            <span className="block text-xs font-medium mb-1.5" style={{ color: "hsl(var(--ink-soft))" }}>
              Berechnungsbasis
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(["gross", "net"] as TaxBasis[]).map((b) => {
                const active = basis === b;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBasis(b)}
                    className="h-11 rounded-lg border text-sm font-medium transition-colors"
                    style={{
                      borderColor: active ? "hsl(var(--accent-gold))" : "hsl(var(--hairline))",
                      background: active ? "hsl(var(--accent-gold) / 0.14)" : "hsl(var(--surface))",
                      color: active ? "hsl(var(--accent-gold))" : undefined,
                    }}
                  >
                    {b === "gross" ? "Brutto (inkl. MwSt.)" : "Netto (ohne MwSt.)"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {initialAmount !== null ? (
              <button
                type="button"
                onClick={() => { onSave(null, basis); onClose(); }}
                className="h-11 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 hover:bg-muted"
                style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}
              >
                <Trash2 size={14} /> Budget entfernen
              </button>
            ) : <span />}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-lg border text-sm font-medium hover:bg-muted"
                style={{ borderColor: "hsl(var(--hairline))" }}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="h-11 px-5 rounded-lg text-sm font-semibold"
                style={{ background: "hsl(var(--accent-gold))", color: "#111" }}
              >
                Speichern
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};