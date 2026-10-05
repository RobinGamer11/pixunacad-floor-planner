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

  it("übernimmt keine unsichtbaren Flächen (Deckkraft 0) und behält graue Wandflächen", async () => {
    const r = await extractPdfPageVectors(b64, 0);
    const area = (p: { x: number; y: number }[]) => Math.abs(p.reduce((s, q, i) => { const o = p[(i + p.length - 1) % p.length]; return s + o.x * q.y - q.x * o.y; }, 0) / 2);
    expect(r.hatches.some((h) => area(h.points) > 900_000)).toBe(false);
    expect(r.hatches.filter((h) => h.fillColor === "#5f5f5f").length).toBeGreaterThan(100);
    expect(r.texts.filter((t) => Math.abs((t.angleRad || 0) - Math.PI / 2) < 0.01).length).toBeGreaterThan(50);
  }, 30000);

  it("liefert Texte mit Breite und Drehung", async () => {
    const r = await extractPdfPageVectors(b64, 0);
    expect(r.texts.length).toBeGreaterThan(5);
    for (const t of r.texts) expect(Number.isFinite(t.angleRad)).toBe(true);
  }, 30000);
});

import { clipSegment, clipPolygonToBox, groupFillRings } from "./pdfVectorExtract";
import { pdfDashToPattern } from "./pdfDash";
describe("PDF-Hilfsgeometrie", () => {
  const box = { x0: 0, y0: 0, x1: 10, y1: 10 };
  it("beschneidet Linien und Flächen am Clip-Rahmen", () => {
    expect(clipSegment({ x: -5, y: 5 }, { x: 5, y: 5 }, box)![0].x).toBeCloseTo(0);
    expect(clipSegment({ x: -5, y: -5 }, { x: -1, y: -1 }, box)).toBe(null);
    expect(clipPolygonToBox([{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }], box).length).toBe(4);
  });
  it("innere Teilpfade werden Löcher", () => {
    const sq = (a: number, b: number) => [{ x: a, y: a }, { x: b, y: a }, { x: b, y: b }, { x: a, y: b }];
    const g = groupFillRings([sq(0, 10), sq(2, 8)]);
    expect(g.length).toBe(1); expect(g[0].holes.length).toBe(1);
  });
  it("Strichelung wird in CAD-Linienart übersetzt", () => {
    expect(pdfDashToPattern([3, 2], 0.001).kind).toBe("dashed");
    expect(pdfDashToPattern([6, 2, 0, 2], 0.001).kind).toBe("dash-dot");
  });
});
