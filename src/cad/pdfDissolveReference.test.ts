// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("./documentImport", async () => {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return {
    loadPdfJs: async () => pdfjs,
    loadPdfDocFromB64: async (b64: string) =>
      pdfjs.getDocument({ data: new Uint8Array(Buffer.from(b64, "base64")), isEvalSupported: false, disableFontFace: true }).promise,
  };
});

import { extractPdfPageVectors, HAIRLINE_PT } from "./pdfVectorExtract";
import { Defaults } from "./constants";

const b64 = readFileSync(resolve(__dirname, "__fixtures__/grundriss-praxis-grande.pdf")).toString("base64");
const PT = Defaults.documentMetersPerPdfPt;

describe("Referenz-PDF Grundriss Praxis Grande", () => {
  it("übernimmt feine Strichbreiten ohne künstliche Mindeststärke", async () => {
    const r = await extractPdfPageVectors(b64, 0);
    const widths = r.segments.map((s) => s.thicknessM / PT);
    expect(widths.length).toBeGreaterThan(100);
    const thin = widths.filter((w) => w < 0.5).length;
    // Viele Originalstriche liegen bei 0,13–0,35 pt → müssen dünn bleiben.
    expect(thin / widths.length).toBeGreaterThan(0.3);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(HAIRLINE_PT - 1e-9);
    const hist: Record<string, number> = {};
    for (const w of widths) { const k = w.toFixed(2); hist[k] = (hist[k] || 0) + 1; }
    console.log("Strichbreiten (pt):", JSON.stringify(Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8)));
    console.log("Texte:", r.texts.length, "Flächen:", r.hatches.length, "Linien:", r.segments.length);
    console.log("Textproben:", JSON.stringify(r.texts.slice(0, 12).map((t) => [t.text, +(t.fontSizePdfPt).toFixed(2), +(t.angleRad || 0).toFixed(2), +(t.widthPdfPt || 0).toFixed(1)])));
  }, 30000);

  it("liefert Texte mit Breite und Drehung", async () => {
    const r = await extractPdfPageVectors(b64, 0);
    expect(r.texts.length).toBeGreaterThan(5);
    for (const t of r.texts) expect(Number.isFinite(t.angleRad)).toBe(true);
  }, 30000);
});
