import { describe, expect, it } from "vitest";
import { cssPxToPt, ptToCssPx, ptToMm, textStyleFontSizePt } from "./textTypography";
import { htmlToRuns, normalizeRichTextHtml } from "./textRichRenderer";

describe("canonical text typography", () => {
  it("converts typographic points without drift", () => {
    expect(ptToCssPx(12)).toBe(16);
    expect(cssPxToPt(16)).toBe(12);
    expect(ptToMm(72)).toBeCloseTo(25.4);
  });

  it("prefers fontSizePt and migrates legacy px", () => {
    expect(textStyleFontSizePt({ fontSizePt: 14, fontSizePx: 99 })).toBe(14);
    expect(textStyleFontSizePt({ fontSizePx: 16 })).toBe(12);
  });

  it("reads canonical and legacy inline sizes as pt", () => {
    const runs = htmlToRuns('<span data-font-size-pt="14" style="font-size:99px">A</span><span style="font-size:16px">B</span>');
    expect(runs[0].sizeOverridePt).toBe(14);
    expect(runs[1].sizeOverridePt).toBe(12);
  });

  it("normalizes legacy inline sizes without retaining screen px", () => {
    const html = normalizeRichTextHtml('<span style="font-size:16px;color:red">Text</span>');
    expect(html).toContain('data-font-size-pt="12"');
    expect(html).not.toContain("font-size");
    expect(html).toContain("color: red");
  });
});