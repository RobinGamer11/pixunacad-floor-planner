import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { useProject } from "@/lib/projectStore";
import {
  financeStore, formatEur,
  type FinanceEntry, type FinanceKind, type FinanceState,
} from "@/lib/financeStore";
import {
  Plus, Search, Trash2, PanelLeftClose, PanelLeftOpen,
  TrendingUp, TrendingDown, Wallet, X,
} from "lucide-react";

function useFinance(projectId?: string): FinanceState {
  const [state, setState] = useState<FinanceState>(() =>
    projectId ? financeStore.get(projectId) : { categories: [], statuses: [], entries: [], budget: 0 });
  useEffect(() => {
    if (!projectId) return;
    setState(financeStore.get(projectId));
    const unsub = financeStore.subscribe(() => setState(financeStore.get(projectId)));
    return () => { unsub(); };

  }, [projectId]);
  return state;
}

export default function FinancePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const state = useFinance(projectId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterKind, setFilterKind] = useState<"" | FinanceKind>("");
  const [leftOpen, setLeftOpen] = useState(true);

  const statusMap = useMemo(
    () => Object.fromEntries(state.statuses.map((s) => [s.id, s])),
    [state.statuses],
  );

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.entries.filter((e) => {
      if (filterCat && e.category !== filterCat) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterKind && e.kind !== filterKind) return false;
      if (q && !(`${e.title} ${e.contractor ?? ""} ${e.note ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [state.entries, search, filterCat, filterStatus, filterKind]);

  const selected = state.entries.find((e) => e.id === selectedId) ?? null;

  const totals = useMemo(() => {
    let income = 0, expense = 0, openSum = 0;
    for (const e of state.entries) {
      if (e.kind === "income") income += e.amount || 0;
      else {
        expense += e.amount || 0;
        if (e.status !== "paid") openSum += e.amount || 0;
      }
    }
    return { income, expense, balance: income - expense, openSum };
  }, [state.entries]);

  if (!projectId) return null;

  const add = (kind: FinanceKind) => {
    const e = financeStore.addEntry(projectId, kind);
    setSelectedId(e.id);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <WorkspaceHeader
        projectId={projectId}
        projectName={project?.name}
        mode="finance"
        canDelete={!!selected}
        onDelete={() => {
          if (!selected) return;
          financeStore.deleteEntry(projectId, selected.id);
          setSelectedId(null);
        }}
      />
      <main
        className="flex-1 min-h-0 grid transition-[grid-template-columns] duration-200"
        style={{
          gridTemplateColumns: leftOpen ? "240px 1fr" : "1fr",
          background: "hsl(var(--surface-muted))",
        }}
      >
        {leftOpen && (
          <aside className="flex flex-col min-h-0 border-r"
                 style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
            <div className="p-2 border-b space-y-2" style={{ borderColor: "hsl(var(--hairline))" }}>
              <div className="flex items-center gap-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider flex-1"
                     style={{ color: "hsl(var(--ink-soft))" }}>Finanzen</div>
                <button onClick={() => setLeftOpen(false)}
                  className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
                  title="Liste einklappen">
                  <PanelLeftClose size={14} />
                </button>
              </div>

              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2"
                        style={{ color: "hsl(var(--ink-soft))" }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Suchen…"
                  className="w-full h-7 pl-7 pr-2 rounded-md border text-[11px] bg-background"
                  style={{ borderColor: "hsl(var(--hairline))" }} />
              </div>

              <FilterRow>
                <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as any)}
                  className="flex-1 h-7 rounded-md border text-[11px] px-1 bg-background min-w-0"
                  style={{ borderColor: "hsl(var(--hairline))" }}>
                  <option value="">Alle Posten</option>
                  <option value="income">Einnahmen</option>
                  <option value="expense">Ausgaben</option>
                </select>
              </FilterRow>

              <FilterRow>
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                  className="flex-1 h-7 rounded-md border text-[11px] px-1 bg-background min-w-0"
                  style={{ borderColor: "hsl(var(--hairline))" }}>
                  <option value="">Alle Kategorien</option>
                  {state.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <IconBtn title="Kategorie hinzufügen" onClick={() => {
                  const label = window.prompt("Neue Kategorie");
                  if (label?.trim()) financeStore.addCategory(projectId, label.trim());
                }}><Plus size={12} /></IconBtn>
              </FilterRow>

              <FilterRow>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  className="flex-1 h-7 rounded-md border text-[11px] px-1 bg-background min-w-0"
                  style={{ borderColor: "hsl(var(--hairline))" }}>
                  <option value="">Alle Status</option>
                  {state.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <IconBtn title="Status hinzufügen" onClick={() => {
                  const label = window.prompt("Neuer Status");
                  if (label?.trim()) financeStore.addStatus(projectId, label.trim(), "#64748b");
                }}><Plus size={12} /></IconBtn>
              </FilterRow>

              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => add("income")}
                  className="h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1"
                  style={{ background: "hsl(var(--accent-gold-soft))", color: "hsl(var(--accent-gold))" }}>
                  <Plus size={12} /> Einnahme
                </button>
                <button onClick={() => add("expense")}
                  className="h-7 rounded-md text-[11px] font-medium flex items-center justify-center gap-1 border"
                  style={{ borderColor: "hsl(var(--hairline))", color: "hsl(var(--ink-soft))" }}>
                  <Plus size={12} /> Ausgabe
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto py-1">
              {entries.map((e) => {
                const st = e.status ? statusMap[e.status] : undefined;
                const active = e.id === selectedId;
                return (
                  <div key={e.id} onClick={() => setSelectedId(e.id)}
                    className="flex items-center gap-1.5 px-2 py-1.5 mx-1 mb-1 rounded-md cursor-pointer border"
                    style={{
                      background: active ? "hsl(var(--accent-gold-soft))" : "hsl(var(--surface-muted))",
                      borderColor: active ? "hsl(var(--accent-gold))" : "transparent",
                    }}>
                    {e.kind === "income"
                      ? <TrendingUp size={13} style={{ color: "#10b981" }} />
                      : <TrendingDown size={13} style={{ color: "#ef4444" }} />}
                    <span className="text-[11px] font-medium truncate flex-1">{e.title}</span>
                    {st && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: st.color }} title={st.label} />}
                    <span className="text-[10px] tabular-nums" style={{ color: "hsl(var(--ink-soft))" }}>
                      {formatEur(e.amount)}
                    </span>
                  </div>
                );
              })}
              {entries.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px]" style={{ color: "hsl(var(--ink-soft))" }}>
                  Noch keine Posten. Lege oben eine Einnahme oder Ausgabe an.
                </div>
              )}
            </div>
          </aside>
        )}

        <section className="min-h-0 overflow-auto">
          <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 border-b"
               style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
            {!leftOpen && (
              <button onClick={() => setLeftOpen(true)}
                className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted"
                title="Liste einblenden">
                <PanelLeftOpen size={15} />
              </button>
            )}
            <div className="text-[11px] font-semibold uppercase tracking-wider"
                 style={{ color: "hsl(var(--ink-soft))" }}>Übersicht</div>
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Budget" value={formatEur(state.budget)} icon={<Wallet size={14} />} />
              <StatCard label="Einnahmen" value={formatEur(totals.income)} color="#10b981" icon={<TrendingUp size={14} />} />
              <StatCard label="Ausgaben" value={formatEur(totals.expense)} color="#ef4444" icon={<TrendingDown size={14} />} />
              <StatCard label="Saldo" value={formatEur(totals.balance)}
                        color={totals.balance >= 0 ? "#10b981" : "#ef4444"} />
            </div>

            <Card title="Budget">
              <label className="flex items-center justify-between gap-2 text-[11px]">
                <span style={{ color: "hsl(var(--ink-soft))" }}>Gesamtbudget (EUR)</span>
                <input type="number" value={state.budget}
                  onChange={(e) => financeStore.setBudget(projectId, parseFloat(e.target.value) || 0)}
                  className="w-40 h-7 rounded-md border px-2 text-[11px] bg-background"
                  style={{ borderColor: "hsl(var(--hairline))" }} />
              </label>
              <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "hsl(var(--surface-muted))" }}>
                <div className="h-full rounded-full"
                     style={{
                       width: `${state.budget > 0 ? Math.min(100, (totals.expense / state.budget) * 100) : 0}%`,
                       background: totals.expense > state.budget ? "#ef4444" : "hsl(var(--accent-gold))",
                     }} />
              </div>
              <div className="mt-1 text-[10px]" style={{ color: "hsl(var(--ink-soft))" }}>
                Offene Ausgaben: {formatEur(totals.openSum)}
              </div>
            </Card>

            {selected ? (
              <Card title={selected.kind === "income" ? "Einnahme bearbeiten" : "Ausgabe bearbeiten"}
                    action={
                      <button onClick={() => { financeStore.deleteEntry(projectId, selected.id); setSelectedId(null); }}
                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-muted"
                        title="Posten löschen">
                        <Trash2 size={13} />
                      </button>
                    }>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bezeichnung" full>
                    <input value={selected.title}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { title: e.target.value })}
                      className="w-full h-7 rounded-md border px-2 text-[11px] bg-background"
                      style={{ borderColor: "hsl(var(--hairline))" }} />
                  </Field>
                  <Field label="Betrag (EUR)">
                    <input type="number" value={selected.amount}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="w-full h-7 rounded-md border px-2 text-[11px] bg-background"
                      style={{ borderColor: "hsl(var(--hairline))" }} />
                  </Field>
                  <Field label="Art">
                    <select value={selected.kind}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { kind: e.target.value as FinanceKind })}
                      className="w-full h-7 rounded-md border px-1 text-[11px] bg-background"
                      style={{ borderColor: "hsl(var(--hairline))" }}>
                      <option value="income">Einnahme</option>
                      <option value="expense">Ausgabe</option>
                    </select>
                  </Field>
                  <Field label="Kategorie">
                    <select value={selected.category ?? ""}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { category: e.target.value })}
                      className="w-full h-7 rounded-md border px-1 text-[11px] bg-background"
                      style={{ borderColor: "hsl(var(--hairline))" }}>
                      {state.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={selected.status ?? ""}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { status: e.target.value })}
                      className="w-full h-7 rounded-md border px-1 text-[11px] bg-background"
                      style={{ borderColor: "hsl(var(--hairline))" }}>
                      {state.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Datum">
                    <input type="date" value={selected.date ?? ""}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { date: e.target.value })}
                      className="w-full h-7 rounded-md border px-2 text-[11px] bg-background"
                      style={{ borderColor: "hsl(var(--hairline))" }} />
                  </Field>
                  <Field label="Firma / Empfänger">
                    <input value={selected.contractor ?? ""}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { contractor: e.target.value })}
                      className="w-full h-7 rounded-md border px-2 text-[11px] bg-background"
                      style={{ borderColor: "hsl(var(--hairline))" }} />
                  </Field>
                  <Field label="Notiz" full>
                    <textarea value={selected.note ?? ""} rows={3}
                      onChange={(e) => financeStore.updateEntry(projectId, selected.id, { note: e.target.value })}
                      className="w-full rounded-md border px-2 py-1 text-[11px] bg-background resize-none"
                      style={{ borderColor: "hsl(var(--hairline))" }} />
                  </Field>
                </div>
              </Card>
            ) : (
              <Card title="Alle Posten">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ color: "hsl(var(--ink-soft))" }}>
                      <th className="text-left font-medium py-1">Bezeichnung</th>
                      <th className="text-left font-medium py-1">Kategorie</th>
                      <th className="text-left font-medium py-1">Datum</th>
                      <th className="text-left font-medium py-1">Status</th>
                      <th className="text-right font-medium py-1">Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} onClick={() => setSelectedId(e.id)}
                          className="cursor-pointer hover:bg-muted border-t"
                          style={{ borderColor: "hsl(var(--hairline))" }}>
                        <td className="py-1.5">{e.title}</td>
                        <td className="py-1.5">{e.category ?? "—"}</td>
                        <td className="py-1.5">{e.date ?? "—"}</td>
                        <td className="py-1.5">{e.status ? statusMap[e.status]?.label ?? "—" : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums"
                            style={{ color: e.kind === "income" ? "#10b981" : "#ef4444" }}>
                          {e.kind === "income" ? "+" : "−"}{formatEur(e.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entries.length === 0 && (
                  <div className="py-6 text-center text-[11px]" style={{ color: "hsl(var(--ink-soft))" }}>
                    Keine Posten vorhanden.
                  </div>
                )}
              </Card>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className="h-7 w-7 shrink-0 rounded-md border flex items-center justify-center hover:bg-muted"
      style={{ borderColor: "hsl(var(--hairline))" }}>
      {children}
    </button>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider"
           style={{ color: "hsl(var(--ink-soft))" }}>
        {icon}{label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "hsl(var(--surface-card))", borderColor: "hsl(var(--hairline))" }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider flex-1"
             style={{ color: "hsl(var(--ink-soft))" }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px]" style={{ color: "hsl(var(--ink-soft))" }}>{label}</span>
      {children}
    </label>
  );
}
