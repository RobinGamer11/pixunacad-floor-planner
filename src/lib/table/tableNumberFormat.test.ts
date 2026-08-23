import { describe, expect, it } from "vitest";
import {
  applyNumberFormat,
  createTableData,
  effectiveFormat,
  normalizeTable,
  toTableData,
} from "./tableModel";
import { displayValue, evalCell } from "./tableFormula";

describe("Tabellen-Zahlenformate", () => {
  it("verwendet Automatisch als rückwärtskompatiblen Standard", () => {
    const model = normalizeTable(createTableData(2, 2));

    expect(effectiveFormat(model, 0, 0).numberFormat).toBe("auto");
  });

  it("formatiert denselben Rohwert als Euro oder Prozent", () => {
    const cells = [["0.19"]];

    expect(displayValue(cells, 0, 0, {}, "currency")).toBe("0,19 €");
    expect(displayValue(cells, 0, 0, {}, "percent")).toBe("19,00 %");
    expect(cells[0][0]).toBe("0.19");
  });

  it("erkennt in Automatisch Zahlen, lässt Text aber unverändert", () => {
    const cells = [["0.19", "19 %", "Hinweis", "=A1*2"]];

    expect(displayValue(cells, 0, 0)).toBe("0,19");
    expect(displayValue(cells, 0, 1)).toBe("19 %");
    expect(displayValue(cells, 0, 2)).toBe("Hinweis");
    expect(displayValue(cells, 0, 3)).toBe("0,38");
    expect(cells).toEqual([["0.19", "19 %", "Hinweis", "=A1*2"]]);
  });

  it("ändert bei Multiplikation und Division nur die Anzeige", () => {
    const model = normalizeTable({ cells: [["0.19", "2", "=A1*B1", "=B1/A1"]] });
    const multiplied = evalCell(model.cells, 0, 2);
    const divided = evalCell(model.cells, 0, 3);
    const formatted = applyNumberFormat(model, 0, 2, 0, 3, "currency");

    expect(multiplied).toBe(0.38);
    expect(divided).toBe(10.526316);
    expect(evalCell(formatted.cells, 0, 2)).toBe(multiplied);
    expect(evalCell(formatted.cells, 0, 3)).toBe(divided);
    expect(displayValue(formatted.cells, 0, 2, {}, effectiveFormat(formatted, 0, 2).numberFormat)).toBe("0,38 €");
    expect(formatted.cells).toBe(model.cells);
  });

  it("wendet das Format wahlweise auf Zellen oder vollständige Zeilen an", () => {
    const model = normalizeTable(createTableData(3, 3));
    const cellsOnly = applyNumberFormat(model, 0, 1, 1, 1, "number");
    const wholeRows = applyNumberFormat(cellsOnly, 2, 1, 2, 1, "percent", true);

    expect(effectiveFormat(cellsOnly, 0, 1).numberFormat).toBe("number");
    expect(effectiveFormat(cellsOnly, 1, 1).numberFormat).toBe("number");
    expect(effectiveFormat(cellsOnly, 0, 0).numberFormat).toBe("auto");
    expect([0, 1, 2].map((c) => effectiveFormat(wholeRows, 2, c).numberFormat)).toEqual([
      "percent",
      "percent",
      "percent",
    ]);
    expect(toTableData(wholeRows).cellFormats?.["2,2"]?.numberFormat).toBe("percent");
  });
});
