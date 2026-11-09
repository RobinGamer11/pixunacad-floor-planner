// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, PDFRef } from "pdf-lib";
import pako from "pako";
import { exportPlansToPdf } from "./PlanPdfExport";

const MM_PER_PT = 25.4 / 72;

function plan(scale: number, rotation: number, clip = { left: 0, right: 0, top: 0, bottom: 0 }): any {
  return {
    id: "p1", name: "Seite", formatKey: "a3", landscape: true, freeWidth: 420, freeHeight: 297,
    marginsMm: 10, holePattern: "none", holePunchSide: "left", spreadId: null, spreadOffset: null,
    parentFolderId: null, order: 0,
    projections: [{
      id: "pr1", sourceSheetId: "s1", x: 0, y: 0, rotation, scale, clip,
      sceneSnapshot: {
        version: 3,
        segments: [{ id: "l1", labelId: "lbl", a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, color: "#000000", thicknessM: 0.01 }],
      },
    }],
  };
}

type M = number[];
const mul = (A: M, B: M): M => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];

/** Liest den Ausschnitt-Inhalt und liefert alle gestrichenen Geraden in PDF-Punkten. */
async function strokedLines(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const contents = page.node.get(PDFName.of("Contents"));
  const refs: PDFRef[] = contents instanceof PDFArray ? contents.asArray() as PDFRef[] : [contents as PDFRef];
  let text = "";
  for (const r of refs) {
    const st = doc.context.lookup(r) as PDFRawStream;
    const raw = st.getContents();
    const filt = st.dict.get(PDFName.of("Filter"));
    text += filt ? new TextDecoder().decode(pako.inflate(raw)) : new TextDecoder().decode(raw);
    text += "\n";
  }
  const start = text.indexOf("% pixuna-projection");
  expect(start).toBeGreaterThanOrEqual(0);
  const body = text.slice(start).split("\n").slice(1).join(" ");
  const tok = body.split(/\s+/).filter(Boolean);
  const stack: M[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const nums: number[] = [];
  let path: [number, number][] = [];
  const lines: { a: [number, number]; b: [number, number] }[] = [];
  const ap = (x: number, y: number): [number, number] => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  for (const t of tok) {
    if (/^-?\d*\.?\d+(e-?\d+)?$/i.test(t)) { nums.push(parseFloat(t)); continue; }
    if (t === "q") stack.push([...ctm]);
    else if (t === "Q") ctm = stack.pop() ?? ctm;
    else if (t === "cm") ctm = mul(ctm, nums.slice(-6));
    else if (t === "m") path = [ap(nums[nums.length - 2], nums[nums.length - 1])];
    else if (t === "l") path.push(ap(nums[nums.length - 2], nums[nums.length - 1]));
    else if (t === "S") { for (let i = 1; i < path.length; i++) lines.push({ a: path[i - 1], b: path[i] }); path = []; }
    else if (t === "n" || t === "f" || t === "f*") path = [];
    nums.length = 0;
  }
  return lines;
}

const lenMm = (l: { a: [number, number]; b: [number, number] }) => Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) * MM_PER_PT;

describe("Vektor-PDF: Maßstab der Ausschnitte", () => {
  it("5,00 m Linie misst bei 1:50 genau 100 mm als Vektor", async () => {
    const bytes = await exportPlansToPdf([plan(50, 0)], () => null);
    const lines = await strokedLines(bytes);
    expect(lines.length).toBeGreaterThan(0);
    const longest = Math.max(...lines.map(lenMm));
    expect(longest).toBeCloseTo(100, 2);
  });

  it("5,00 m Linie misst bei 1:100 genau 50 mm", async () => {
    const bytes = await exportPlansToPdf([plan(100, 0)], () => null);
    const longest = Math.max(...(await strokedLines(bytes)).map(lenMm));
    expect(longest).toBeCloseTo(50, 2);
  });

  it("gedrehter, zugeschnittener Ausschnitt: Drehung und Lage stimmen", async () => {
    const rot = Math.PI / 6;
    const bytes = await exportPlansToPdf([plan(50, rot, { left: 0, right: 30, top: 0, bottom: 0 })], () => null);
    const lines = await strokedLines(bytes);
    const l = lines.reduce((a, b) => (lenMm(b) > lenMm(a) ? b : a));
    // Linie bleibt 100 mm lang (Zuschnitt wirkt per Clip, nicht auf die Geometrie).
    expect(lenMm(l)).toBeCloseTo(100, 2);
    // Richtung: +30° im Papier (Y nach unten) = −30° in PDF (Y nach oben).
    const ang = Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]);
    expect(ang).toBeCloseTo(-rot, 4);
    // Mittelpunkt der Linie = Papiermitte (Ausschnitt mittig platziert).
    const mid = [(l.a[0] + l.b[0]) / 2 * MM_PER_PT, (l.a[1] + l.b[1]) / 2 * MM_PER_PT];
    expect(mid[0]).toBeCloseTo(210, 1);
    expect(mid[1]).toBeCloseTo(148.5, 1);
  });
});
