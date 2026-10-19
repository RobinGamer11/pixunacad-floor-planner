import { describe, it, expect } from "vitest";
import { buildDossierData, buildDossierPdf, DEFAULT_PRESETS } from "./dossier";
import type { Derived3D } from "./geometryDerivation";

const prism = (sheetId: string, id: string, x0: number): Derived3D => ({
  type: "prism", source: "hatch", sourceId: id, sheetId, color: "#ccc", holes: [], z0: 0, z1: 2.5,
  footprint: [{ x: x0, y: 0 }, { x: x0 + 2, y: 0 }, { x: x0 + 2, y: 1 }, { x: x0, y: 1 }],
});
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Render-Dossier", () => {
  // Gleiche Objekt-ID (A0001) auf zwei Blättern → trotzdem eindeutige Dossier-Kennungen
  const items = [prism("s1", "x", 0), prism("s1", "x", 0), prism("s2", "x", 5)];
  const data = buildDossierData("Haus", items, k => ({ key: k, sheetName: k.startsWith("s1") ? "EG" : "OG", name: "Bodenplatte", objCode: "A0001", kind: "hatch", description: "", attachments: [] }), DEFAULT_PRESETS);

  it("vergibt eindeutige Kennungen je Objekt und Blatt", () => {
    expect(data.objects.map(o => o.dossierId)).toEqual(["D001", "D002"]);
    expect(data.objects.map(o => o.sheetId)).toEqual(["s1", "s2"]);
    expect(data.objects[0].sizeM).toEqual({ x: 2, y: 1, z: 2.5 });
  });

  it("Arbeitsauftrag enthält Wetter und Bildwirkung", () => {
    expect(data.workOrder).toContain("Wetter: Sonnig");
    expect(data.workOrder).toContain("Bildwirkung: Freundlich, hell");
  });

  it("erzeugt ein PDF", async () => {
    const img = { png: PNG, w: 1, h: 1 };
    const bytes = await buildDossierPdf(data, { target: img, assignment: { ...img, badges: [{ id: "D001", x: 0.5, y: 0.5 }] } }, () => []);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
