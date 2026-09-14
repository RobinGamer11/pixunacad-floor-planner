/**
 * Tests für den DXF-Austausch des Bibliothekssystems.
 *
 * Die Testdateien unter `__fixtures__/` bilden bewusst externe DXF-Strukturen
 * ab (fremde Layernamen, HATCH mit Begrenzungsschleifen, BLOCK/INSERT mit
 * Drehung und Skalierung) und stammen nicht aus der eigenen Exportlogik.
 * Nur der Rundlauf-Test verwendet zusätzlich `exportDefinitionToDxf`.
 *
 * Geprüft werden ausschließlich die Adapter — Scene, Renderer, Projektmappe
 * und MiniCAD sind nicht beteiligt.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { importDxfToSnapshots, detectDxfUnits } from "./dxfImport";
import { exportDefinitionToDxf } from "./dxfExport";
import type { LibraryDefinition, LibraryGeometrySnapshot } from "./types";

const FIX = path.resolve(__dirname, "__fixtures__");
const read = (name: string) => fs.readFileSync(path.join(FIX, name), "utf8");

type Pt = { x: number; y: number };

/** Bounding-Box aller übernommenen Punkte (in Metern). */
function bbox(snaps: LibraryGeometrySnapshot[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (p: Pt) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  };
  for (const s of snaps) {
    const d: any = s.data || {};
    if (s.kind === "segment") { add(d.a); add(d.b); }
    else if (s.kind === "hatch") {
      (d.points || []).forEach(add);
      (d.holes || []).forEach((h: Pt[]) => h.forEach(add));
    } else if (s.kind === "textBox") add(d.center);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

const kinds = (snaps: LibraryGeometrySnapshot[]) => snaps.map((s) => s.kind);
const layers = (snaps: LibraryGeometrySnapshot[]) =>
  new Set(snaps.map((s) => (s.data as any)?.sourceLayer));

describe("DXF-Import: Maßstab und Einheiten", () => {
  it("Millimeter-Rechteck 1000 × 500 mm wird 1,0 × 0,5 m groß", () => {
    const res = importDxfToSnapshots(read("rect-mm.dxf"));
    expect(res.failed).toBeUndefined();
    expect(res.units.unitsPerMeter).toBe(1000);
    const b = bbox(res.snapshots);
    expect(b.width).toBeCloseTo(1.0, 9);
    expect(b.height).toBeCloseTo(0.5, 9);
  });

  it("Meter-Rechteck 1,0 × 0,5 m ergibt exakt dieselbe Größe", () => {
    const mm = bbox(importDxfToSnapshots(read("rect-mm.dxf")).snapshots);
    const res = importDxfToSnapshots(read("rect-m.dxf"));
    expect(res.units.unitsPerMeter).toBe(1);
    const m = bbox(res.snapshots);
    expect(m.width).toBeCloseTo(mm.width, 9);
    expect(m.height).toBeCloseTo(mm.height, 9);
  });

  it("ohne $INSUNITS wird die Annahme (mm) klar gekennzeichnet", () => {
    const info = detectDxfUnits(read("rect-nounits.dxf"));
    expect(info.assumed).toBe(true);
    expect(info.unitsPerMeter).toBe(1000);
    expect(info.label).toMatch(/angenommen/i);
    const res = importDxfToSnapshots(read("rect-nounits.dxf"));
    expect(res.units.assumed).toBe(true);
  });

  it("unbekannter $INSUNITS-Code fällt sichtbar auf die Annahme zurück", () => {
    const info = detectDxfUnits(read("rect-unknown-units.dxf"));
    expect(info.assumed).toBe(true);
    expect(info.unitsPerMeter).toBe(1000);
  });

  it("manuell gewählte Einheit überschreibt die Erkennung", () => {
    // Datei sagt Millimeter, der Nutzer wählt im Dialog Zentimeter.
    const res = importDxfToSnapshots(read("rect-mm.dxf"), { unitsPerMeter: 100 });
    expect(res.units.unitsPerMeter).toBe(100);
    expect(res.units.assumed).toBe(false);
    const b = bbox(res.snapshots);
    expect(b.width).toBeCloseTo(10, 9);
    expect(b.height).toBeCloseTo(5, 9);
  });

  it("manuelle Einheit greift auch bei fehlender Angabe", () => {
    const res = importDxfToSnapshots(read("rect-nounits.dxf"), { unitsPerMeter: 1 });
    const b = bbox(res.snapshots);
    expect(b.width).toBeCloseTo(1000, 6);
  });
});

describe("DXF-Import: typische externe CAD-Geometrie", () => {
  const res = importDxfToSnapshots(read("geometry-mm.dxf"));

  it("wird ohne Fehler gelesen", () => {
    expect(res.failed).toBeUndefined();
    expect(res.snapshots.length).toBeGreaterThan(0);
  });

  it("LINE wird in Originallänge übernommen", () => {
    const seg = res.snapshots.find(
      (s) => s.kind === "segment" && (s.data as any).sourceLayer === "LINIEN",
    );
    expect(seg).toBeTruthy();
    const d: any = seg!.data;
    expect(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)).toBeCloseTo(2.0, 9);
  });

  it("offene LWPOLYLINE wird als Einzelsegmente übernommen", () => {
    const segs = res.snapshots.filter((s) => (s.data as any).sourceLayer === "OFFEN");
    expect(segs).toHaveLength(2);
    expect(kinds(segs)).toEqual(["segment", "segment"]);
  });

  it("geschlossene LWPOLYLINE wird zur Fläche", () => {
    const closed = importDxfToSnapshots(read("rect-mm.dxf")).snapshots;
    expect(kinds(closed)).toEqual(["hatch"]);
    expect((closed[0].data as any).closed).toBe(true);
  });

  it("LWPOLYLINE mit Bulge behält die Bogeninformation", () => {
    const seg = res.snapshots.find((s) => (s.data as any).sourceLayer === "BOGEN");
    expect(seg).toBeTruthy();
    // DXF-Bulge 1.0 (Halbkreis) → PixunaCAD-Bulge ±0.5
    expect(Math.abs((seg!.data as any).bulge)).toBeCloseTo(0.5, 9);
  });

  it("ARC wird als Bogensegment mit korrektem Radius übernommen", () => {
    const segs = res.snapshots.filter((s) => (s.data as any).sourceLayer === "BOEGEN");
    expect(segs.length).toBeGreaterThan(0);
    const d: any = segs[0].data;
    expect(d.bulge).not.toBe(0);
    // Viertelkreis mit r = 0,5 m: Sehnenlänge = r·√2
    const chord = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
    expect(chord).toBeCloseTo(0.5 * Math.SQRT2, 6);
  });

  it("CIRCLE wird als vier Bogensegmente mit korrektem Durchmesser übernommen", () => {
    const segs = res.snapshots.filter((s) => (s.data as any).sourceLayer === "KREISE");
    expect(segs).toHaveLength(4);
    const b = bbox(segs);
    expect(b.width).toBeCloseTo(0.5, 6);
    expect(b.height).toBeCloseTo(0.5, 6);
  });

  it("TEXT und MTEXT werden als Textobjekte übernommen", () => {
    const texts = res.snapshots.filter((s) => s.kind === "textBox");
    expect(texts).toHaveLength(2);
    const html = texts.map((t) => (t.data as any).html);
    expect(html).toContain("Beispieltext");
    expect(html).toContain("Mehrzeiliger Text");
    // Schrifthöhe 200 mm → 0,2 m
    expect((texts[0].data as any).heightM / 1.4).toBeCloseTo(0.2, 6);
  });

  it("INSERT/BLOCK wird mit Drehung und Skalierung aufgelöst", () => {
    const seg = res.snapshots.find((s) => (s.data as any).sourceLayer === "BLOCKLAYER");
    expect(seg).toBeTruthy();
    const d: any = seg!.data;
    // Blocklinie 100 mm, Skalierung 2 → 0,2 m; Drehung 90° → senkrecht
    expect(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)).toBeCloseTo(0.2, 9);
    expect(Math.abs(d.b.x - d.a.x)).toBeCloseTo(0, 9);
    // Einfügepunkt 500/500 mm, Y gespiegelt
    expect(d.a.x).toBeCloseTo(0.5, 9);
    expect(d.a.y).toBeCloseTo(-0.5, 9);
  });

  it("ursprüngliche Layernamen bleiben erhalten", () => {
    expect(layers(res.snapshots)).toEqual(
      new Set(["LINIEN", "OFFEN", "BOGEN", "BOEGEN", "KREISE", "BESCHRIFTUNG", "BLOCKLAYER"]),
    );
  });
});

describe("DXF-Import: HATCH mit Loch", () => {
  const res = importDxfToSnapshots(read("hatch-mm.dxf"));

  it("erzeugt genau eine gefüllte Fläche mit einem Loch", () => {
    const hatches = res.snapshots.filter((s) => s.kind === "hatch");
    expect(hatches).toHaveLength(1);
    const d: any = hatches[0].data;
    expect(d.holes).toHaveLength(1);
    expect(d.fillAlphaPct).toBe(100);
    expect(d.sourceLayer).toBe("FLAECHEN");
  });

  it("Außenkontur und Loch haben die richtigen Maße", () => {
    const d: any = res.snapshots.find((s) => s.kind === "hatch")!.data;
    const outer = bbox([{ kind: "hatch", data: { points: d.points } } as any]);
    expect(outer.width).toBeCloseTo(2.0, 9);
    expect(outer.height).toBeCloseTo(1.0, 9);
    const hole = bbox([{ kind: "hatch", data: { points: d.holes[0] } } as any]);
    expect(hole.width).toBeCloseTo(1.0, 9);
    expect(hole.height).toBeCloseTo(0.5, 9);
  });
});

describe("DXF-Import: verständliche Hinweise", () => {
  const res = importDxfToSnapshots(read("lossy-mm.dxf"));

  it("nennt Ellipse und Spline als vereinfacht übernommen", () => {
    expect(res.simplified.join(" ")).toMatch(/Ellipse/i);
    expect(res.simplified.join(" ")).toMatch(/SPLINE/i);
  });

  it("nennt nicht übernommene Objekte ausdrücklich", () => {
    expect(res.skipped.join(" ")).toMatch(/Punktobjekt/i);
  });

  it("alle Hinweise sind in `warnings` enthalten", () => {
    expect(res.warnings).toEqual([...res.simplified, ...res.skipped]);
    expect(res.warnings.every((w) => w.trim().length > 0)).toBe(true);
  });

  it("Musterschraffuren werden als einfarbige Fläche gemeldet", () => {
    const pattern = read("hatch-mm.dxf")
      .replace("2\nSOLID", "2\nANSI31")
      .replace(/^70\n1$/m, "70\n0");
    const out = importDxfToSnapshots(pattern);
    expect(out.simplified.join(" ")).toMatch(/Musterschraffur/i);
  });

  it("binäre DXF-Dateien werden klar abgelehnt", () => {
    const res2 = importDxfToSnapshots(read("binary-like.dxf"));
    expect(res2.failed).toBeTruthy();
    expect(res2.failed).toMatch(/Binär/i);
    expect(res2.snapshots).toHaveLength(0);
  });

  it("unlesbare Dateien liefern eine Meldung statt eines stillen Fehlers", () => {
    const res2 = importDxfToSnapshots("kein gültiges DXF");
    expect(res2.failed).toBeTruthy();
    expect(res2.warnings.length).toBeGreaterThan(0);
  });
});

describe("DXF-Rundlauf: Export → Import", () => {
  const def: LibraryDefinition = {
    id: "test-def",
    name: "Rundlauf Test",
    category: "Test",
    tags: ["dxf"],
    geometry: [
      {
        kind: "segment",
        data: { a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, color: "#ff0000", thicknessM: 0.002, bulge: 0, isGuide: false, sourceLayer: "LINIEN" },
      },
      {
        kind: "segment",
        data: { a: { x: 0, y: 1 }, b: { x: 1, y: 1 }, color: "#0000ff", thicknessM: 0.002, bulge: 0.25, isGuide: false, sourceLayer: "BOGEN" },
      },
      {
        kind: "hatch",
        data: {
          points: [{ x: 0, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3.5 }, { x: 0, y: 3.5 }],
          holes: [],
          fillColor: "#808080",
          strokeColor: "#000000",
          fillAlphaPct: 100,
          strokeWidthPx: 1,
          areaLabel: {},
          patternEnabled: false,
          bulges: [0, 0, 0, 0],
          holeBulges: [],
          isPolygon: true,
          closed: true,
          sourceLayer: "FLAECHEN",
        },
      },
    ],
  } as unknown as LibraryDefinition;

  const exported = exportDefinitionToDxf(def);
  const back = importDxfToSnapshots(exported.dxf);

  it("der Export ist lesbares ASCII-DXF in Metern", () => {
    expect(back.failed).toBeUndefined();
    expect(back.units.unitsPerMeter).toBe(1);
  });

  it("Abmessungen und Positionen bleiben innerhalb enger Toleranz erhalten", () => {
    const before = bbox(def.geometry as LibraryGeometrySnapshot[]);
    const after = bbox(back.snapshots);
    expect(after.minX).toBeCloseTo(before.minX, 4);
    expect(after.minY).toBeCloseTo(before.minY, 4);
    expect(after.width).toBeCloseTo(before.width, 4);
    expect(after.height).toBeCloseTo(before.height, 4);
  });

  it("gerade Linie bleibt gerade und behält ihre Länge", () => {
    const seg = back.snapshots.find((s) => (s.data as any).sourceLayer === "LINIEN");
    expect(seg).toBeTruthy();
    const d: any = seg!.data;
    expect(d.bulge).toBe(0);
    expect(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y)).toBeCloseTo(2, 4);
  });

  it("Bogen behält Vorzeichen und Stärke", () => {
    const seg = back.snapshots.find((s) => (s.data as any).sourceLayer === "BOGEN");
    expect(seg).toBeTruthy();
    expect((seg!.data as any).bulge).toBeCloseTo(0.25, 6);
  });

  it("Fläche bleibt eine geschlossene Fläche in Originalgröße", () => {
    const hatch = back.snapshots.find((s) => s.kind === "hatch");
    expect(hatch).toBeTruthy();
    const d: any = hatch!.data;
    const b = bbox([{ kind: "hatch", data: { points: d.points } } as any]);
    expect(b.width).toBeCloseTo(3, 4);
    expect(b.height).toBeCloseTo(1.5, 4);
  });
});
