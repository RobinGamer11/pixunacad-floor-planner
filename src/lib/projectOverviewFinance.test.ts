import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateAccount } from "./accountStorage";
import { computeBudgetComparison, computeProcessSummary, computeScopeSummary } from "./financeMath";
import { financeStore, type FinanceNode, type FinanceState } from "./financeStore";
import { timelineStore } from "./timelineStore";
import { projectAccessStore } from "./projectAccess";
import { deleteContribution } from "./contributionActions";
import { defaultThumbnailForType, projectThumbnailSrc } from "./projectMeta";
import { buildHomePayload, applyHomePayload } from "./homeProjectSync";
import { projectStore } from "./projectStore";

const cost: FinanceNode = { id: "cost", type: "action", parentId: null, name: "Material", note: "", estimate: 0, enabled: true, order: 1, direction: "expense" };
function fixture(): FinanceState {
  return { nodes: [cost], positions: [
    { id: "order", nodeId: "cost", type: "order", date: "2026-11-28", number: "", amount: 35000, note: "", order: 1, status: "approved" },
    { id: "invoice", nodeId: "cost", type: "invoice", date: "2026-11-28", number: "", amount: 28000, note: "", order: 2 },
  ], payments: [{ id: "payment", nodeId: "cost", invoiceId: "invoice", date: "2026-11-28", amount: 22000, reference: "", note: "" }], projectEstimate: 0, projectNote: "", budgetAmount: 50000, costBudgetAmount: 40000 };
}

beforeEach(() => { activateAccount(`overview-test-${Math.random()}`); localStorage.clear(); vi.restoreAllMocks(); });

describe("Projektbilder", () => {
  it.each(["Gebäudebau", "Landschaft/Freiraum", "Sonstiges"])("löst das Standardbild für %s aus derselben Quelle auf", (type) => {
    expect(projectThumbnailSrc(undefined, type)).toBe(defaultThumbnailForType(type));
    expect(projectThumbnailSrc("data:image/svg+xml,placeholder", type)).toBe(defaultThumbnailForType(type));
    expect(projectThumbnailSrc("/__l5e/assets-v1/old", type)).toBe(defaultThumbnailForType(type));
  });
  it("erhält ein selbst gewähltes Bild unverändert", () => {
    expect(projectThumbnailSrc("data:image/png;base64,abc", "Gebäudebau")).toBe("data:image/png;base64,abc");
  });
});

describe("Budget und Zahlungsregeln", () => {
  it("vergleicht tatsächliche Teilzahlungen getrennt von der Kostenprognose", () => {
    const comparison = computeBudgetComparison(fixture(), "project");
    expect(comparison.paid).toBe(22000);
    expect(comparison.unpaidBudget).toBe(28000);
    expect(comparison.expected).toBe(35000);
    expect(comparison.forecastDifference).toBe(15000);
  });
  it("behandelt fehlendes Budget nicht als Nullbudget oder Überschreitung", () => {
    const result = computeBudgetComparison({ ...fixture(), budgetAmount: null }, "project");
    expect(result.amount).toBeNull(); expect(result.unpaidBudget).toBeNull(); expect(result.forecastDifference).toBeNull();
  });
  it("berücksichtigt bestätigte Nachträge genau einmal", () => {
    const state = fixture();
    state.positions.push({ id: "extra", nodeId: "cost", type: "supplement", supplementKind: "plus", date: "2026-11-28", number: "", amount: 3000, note: "", order: 3, status: "approved" });
    expect(computeBudgetComparison(state, "project").forecastDifference).toBe(12000);
  });
  it("berechnet Auftragnehmerüberschuss ohne eingegangene Zahlungen als Einnahmeprognose zu addieren", () => {
    const state = fixture();
    state.nodes.push({ ...cost, id: "customer", name: "Kundenauftrag", direction: "income" });
    state.positions.push({ ...state.positions[0], id: "customer-order", nodeId: "customer", amount: 60000 });
    const result = computeScopeSummary({ ...state, perspective: "contractor" });
    expect(result.income.expectedTotal).toBe(60000); expect(result.income.paidTotal).toBe(0); expect(result.expectedSurplus).toBe(25000);
    expect(computeBudgetComparison(state, "cost").forecastDifference).toBe(5000);
  });
  it("rechnet tatsächliche Bruttozahlungen mit der belegten Steuer in Netto um", () => {
    const state = fixture();
    state.positions = [{ ...state.positions[1], amount: 2380, amountBasis: "gross", taxRate: 19 }];
    state.payments = [{ ...state.payments?.[0], id: "pay", nodeId: "cost", invoiceId: "invoice", date: "2026-11-28", amount: 1190, reference: "", note: "" }];
    const summary = computeProcessSummary(state, cost, "net");
    expect(summary.invoicedTotal).toBe(2000); expect(summary.paidTotal).toBe(1000); expect(summary.openInvoiceAmount).toBe(1000);
  });
  it("erfindet bei fehlender Steuer keine Netto-Umrechnung", () => {
    const result = computeProcessSummary(fixture(), cost, "net");
    expect(result.hasMissingTax).toBe(true); expect(result.paidTotal).toBe(22000);
  });
  it("vergleicht ein Bruttobudget mit Bruttokosten auch bei Nettoanzeige", () => {
    const state = fixture(); state.positions = [{ ...state.positions[0], amount: 11900, amountBasis: "gross", taxRate: 19 }];
    expect(computeBudgetComparison({ ...state, taxDisplay: "net", budgetBasis: "gross", budgetAmount: 15000 }, "project").forecastDifference).toBe(3100);
  });
  it("zählt zugeordnete Kosten einmal und erhält Bereiche und Zuordnung beim Home-Roundtrip", () => {
    const projectId = projectStore.createProject();
    const state = fixture();
    state.nodes = [{ ...cost, id: "area", type: "overview", name: "Bereich" }, { ...cost, parentId: "area", customerProcessId: "customer" }, { ...cost, id: "customer", direction: "income" }];
    financeStore.replaceState(projectId, state);
    const payload = buildHomePayload(projectId);
    if (!payload) throw new Error("Home-Payload fehlt");
    financeStore.replaceState(projectId, { ...state, nodes: [], positions: [], payments: [] });
    applyHomePayload(projectId, JSON.parse(JSON.stringify(payload)));
    const restored = financeStore.get(projectId);
    expect(restored.nodes.find((node) => node.id === "cost")?.customerProcessId).toBe("customer");
    expect(restored.nodes.find((node) => node.id === "area")?.name).toBe("Bereich");
    expect(computeScopeSummary(restored).expense.expectedTotal).toBe(35000);
    expect(computeScopeSummary(restored, "area").expense.expectedTotal).toBe(35000);
  });
  it("löst beim Löschen eines Kundenauftrags nur die Auswertungszuordnung, nicht die Kosten", () => {
    const state = fixture(); state.nodes = [{ ...cost, customerProcessId: "customer" }, { ...cost, id: "customer", direction: "income" }];
    financeStore.replaceState("p", state); financeStore.deleteNode("p", "customer");
    expect(financeStore.get("p").nodes[0]?.customerProcessId).toBeNull();
    expect(computeScopeSummary(financeStore.get("p")).expense.expectedTotal).toBe(35000);
  });
});

describe("Beitragsaktionen", () => {
  function seed() { return timelineStore.addItem("p", "contribution", { title: "Baustellenbesuch", startDate: "2026-11-28" }); }
  it("löscht nach Bestätigung, persistiert und lässt sich mit einem Undo vollständig zurückholen", () => {
    const item = seed(); vi.spyOn(projectAccessStore, "canEdit").mockReturnValue(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    expect(deleteContribution("p", item.id)).toBe(true);
    expect(timelineStore.getState("p").items).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("pixuna.board02.p") || "{}").items).toEqual([]);
    timelineStore.undo("p"); expect(timelineStore.getState("p").items[0]?.id).toBe(item.id);
  });
  it("ändert bei abgelehnter Bestätigung nichts", () => {
    const item = seed(); vi.spyOn(projectAccessStore, "canEdit").mockReturnValue(true); vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(deleteContribution("p", item.id)).toBe(false); expect(timelineStore.getState("p").items).toHaveLength(1);
  });
  it("verweigert Löschungen ohne Schreibberechtigung", () => {
    const item = seed(); vi.spyOn(projectAccessStore, "canEdit").mockReturnValue(false); const confirmation = vi.spyOn(window, "confirm");
    expect(deleteContribution("p", item.id)).toBe(false); expect(confirmation).not.toHaveBeenCalled(); expect(timelineStore.getState("p").items).toHaveLength(1);
  });
});