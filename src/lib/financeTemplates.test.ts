import { describe, expect, it } from "vitest";
import type { ProjectPage } from "./projectStore";
import {
  findLegacyTemplatePages,
  hasTemplateObjects,
  isBlankTemplatePage,
  TEMPLATE_SEED_VERSION,
} from "./financeTemplates";

const page = (patch: Partial<ProjectPage>): ProjectPage => ({
  id: "page",
  title: "Seite",
  format: "A4-hoch",
  margins: 0,
  background: false,
  elements: [],
  ...patch,
});

describe("finance template seed migration", () => {
  it("uses seed v2 after the former empty seed", () => {
    expect(TEMPLATE_SEED_VERSION).toBe("2");
  });

  it("recognizes objects in elements and every CAD overlay array", () => {
    const domPage = page({ elements: [{ id: "text", kind: "text", x: 0, y: 0, w: 1, h: 1 }] });
    const cadPage = page({ cadOverlay: { textBoxes: [{ id: "box" }] } });
    expect(isBlankTemplatePage(domPage)).toBe(false);
    expect(isBlankTemplatePage(cadPage)).toBe(false);
    expect(hasTemplateObjects([domPage, cadPage])).toBe(true);
  });

  it("finds all matching legacy offer pages in their original order", () => {
    const pages = [
      page({ id: "normal", title: "Grundriss", elements: [{ id: "n", kind: "line", x: 0, y: 0, w: 1, h: 1 }] }),
      page({ id: "offer-1", title: "Standard-Mustervorlage", elements: [{ id: "table", kind: "table", x: 1, y: 1, w: 20, h: 10, tableData: { cells: [["A"]] } }] }),
      page({ id: "offer-2", title: "Angebot Mustervorlage 2", cadOverlay: { segments: [{ id: "line" }] } }),
    ];
    expect(findLegacyTemplatePages(pages, "offer")?.map((item) => item.id)).toEqual(["offer-1", "offer-2"]);
  });

  it("never treats assigned or empty pages as a migration source", () => {
    const pages = [
      page({ title: "Standard-Mustervorlage" }),
      page({ title: "Angebot Vorlage", templateKey: "fin:offer:old", cadOverlay: { segments: [{ id: "line" }] } }),
    ];
    expect(findLegacyTemplatePages(pages, "offer")).toBeUndefined();
  });
});