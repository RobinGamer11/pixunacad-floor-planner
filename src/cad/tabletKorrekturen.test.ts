import { describe, it, expect, vi } from "vitest";
import { CadApp } from "./CadApp";
import {
  ensureBgRemoval,
  bgRemovalApplied,
  bgRemovalSignature,
  markBgMaskEdited,
  resetBgMask,
  exportBgMaskDataUrl,
} from "./documentBgRemove";
import { restoreOneScene } from "./sceneSerde";
import { Scene } from "./Scene";

function makeDoc(): any {
  return {
    id: "doc-1",
    name: "Bild",
    kind: "image",
    src: "data:image/png;base64,AAAA",
    position: { x: 0, y: 0 },
    widthM: 1,
    heightM: 1,
    rotationRad: 0,
    labelId: "l1",
    cropM: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

describe("Hintergrund entfernen: enabled vs. hasMaskEdits", () => {
  it("bloßes Einschalten schneidet nichts weg", () => {
    const doc = makeDoc();
    const b = ensureBgRemoval(doc);
    b.enabled = true;
    expect(b.hasMaskEdits).toBe(false);
    expect(bgRemovalApplied(doc)).toBe(false);
    expect(bgRemovalSignature(doc)).toBe("");
  });

  it("erst eine echte Maskenänderung maskiert", () => {
    const doc = makeDoc();
    ensureBgRemoval(doc).enabled = true;
    markBgMaskEdited(doc);
    expect(bgRemovalApplied(doc)).toBe(true);
    expect(bgRemovalSignature(doc)).not.toBe("");
  });

  it("Ausschalten behält Maske und Markierung", () => {
    const doc = makeDoc();
    const b = ensureBgRemoval(doc);
    b.enabled = true;
    markBgMaskEdited(doc);
    b.fgMaskDataUrl = "data:image/png;base64,MASK";
    b.enabled = false;
    expect(bgRemovalApplied(doc)).toBe(false);
    expect(b.hasMaskEdits).toBe(true);
    expect(b.fgMaskDataUrl).toBe("data:image/png;base64,MASK");
    b.enabled = true;
    expect(bgRemovalApplied(doc)).toBe(true);
  });

  it("Maske zurücksetzen zeigt wieder das Original", () => {
    const doc = makeDoc();
    ensureBgRemoval(doc).enabled = true;
    markBgMaskEdited(doc);
    resetBgMask(doc);
    expect(doc.bgRemoval.hasMaskEdits).toBe(false);
    expect(doc.bgRemoval.fgMaskDataUrl).toBe(null);
    expect(bgRemovalApplied(doc)).toBe(false);
  });

  it("Altdokumente mit vorhandener Maske bleiben maskiert", () => {
    const doc = makeDoc();
    doc.bgRemoval = { enabled: true, fgMaskDataUrl: "data:image/png;base64,ALT", tolerance: 32, brushRadiusM: 0.1, fgColor: null, fgAlpha: 1, bgColor: null, bgAlpha: 0 } as any;
    expect(bgRemovalApplied(doc)).toBe(true);
    expect(ensureBgRemoval(doc).hasMaskEdits).toBe(true);
  });

  it("ohne Speicher-Maske bleibt die gespeicherte DataURL erhalten", () => {
    const doc = makeDoc();
    const b = ensureBgRemoval(doc);
    b.enabled = true;
    b.hasMaskEdits = true;
    b.fgMaskDataUrl = "data:image/png;base64,MASK";
    expect(exportBgMaskDataUrl(doc)).toBe("data:image/png;base64,MASK");
  });

  it("Maske und Markierung überleben Speichern und Laden", () => {
    const scene = new Scene();
    const raw: any = {
      documents: [{
        id: "doc-1", name: "Bild", kind: "image", src: "data:image/png;base64,AAAA",
        position: { x: 0, y: 0 }, widthM: 1, heightM: 1, rotationRad: 0, labelId: "l1",
        bgRemoval: {
          enabled: true,
          hasMaskEdits: true,
          fgMaskDataUrl: "data:image/png;base64,MASK",
          tolerance: 40, brushRadiusM: 0.2,
          fgColor: null, fgAlpha: 1, bgColor: null, bgAlpha: 0,
        },
      }],
    };
    restoreOneScene(scene, raw);
    const rd: any = scene.documents.find((d: any) => d.id === "doc-1");
    expect(rd.bgRemoval.hasMaskEdits).toBe(true);
    expect(rd.bgRemoval.fgMaskDataUrl).toBe("data:image/png;base64,MASK");
    expect(bgRemovalApplied(rd)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("Maßkette auf dem Tablet verschieben", () => {
  function moveApp() {
    const dim: any = { id: "dim-1", placementPoint: { x: 1, y: 1 } };
    const commit = vi.fn();
    const renderer: any = { dimensionMovePreview: null, render: vi.fn() };
    const app = Object.assign(Object.create(CadApp.prototype), {
      scene: { getDimensionById: (id: string) => (id === "dim-1" ? dim : null) },
      renderer,
      dimensionHubMode: "none",
      commitHistorySnapshot: commit,
      refreshLabelUI: vi.fn(),
    }) as any;
    return { app, dim, commit, renderer };
  }

  it("Scharfstellen ändert die Maßkette nicht", () => {
    const { app, dim, commit } = moveApp();
    app.startDimensionMove("dim-1");
    expect(app.dimensionMoveActive).toBe(true);
    expect(app.dimensionMoveArmed).toBe(true);
    expect(dim.placementPoint).toEqual({ x: 1, y: 1 });
    expect(commit).not.toHaveBeenCalled();
  });

  it("Vorschau verändert das echte Objekt nicht", () => {
    const { app, dim, renderer, commit } = moveApp();
    app.startDimensionMove("dim-1");
    app.dimensionMoveArmed = false;
    app.dimensionMovePreviewPlacement = { x: 5, y: 7 };
    app._syncDimensionMovePreview();
    expect(dim.placementPoint).toEqual({ x: 1, y: 1 });
    expect(renderer.dimensionMovePreview).toEqual({ dimensionId: "dim-1", placementPoint: { x: 5, y: 7 } });
    expect(commit).not.toHaveBeenCalled();
  });

  it("Fixieren speichert genau einen Verlaufsschritt", () => {
    const { app, dim, commit, renderer } = moveApp();
    app.startDimensionMove("dim-1");
    app.dimensionMoveArmed = false;
    app.dimensionMovePreviewPlacement = { x: 5, y: 7 };
    app.commitDimensionMove();
    expect(dim.placementPoint).toEqual({ x: 5, y: 7 });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(app.dimensionMoveActive).toBe(false);
    expect(renderer.dimensionMovePreview).toBe(null);
  });

  it("Abbrechen stellt die Ausgangslage wieder her", () => {
    const { app, dim, commit, renderer } = moveApp();
    app.startDimensionMove("dim-1");
    app.dimensionMoveArmed = false;
    app.dimensionMovePreviewPlacement = { x: 9, y: 9 };
    app.cancelDimensionMove();
    expect(dim.placementPoint).toEqual({ x: 1, y: 1 });
    expect(commit).not.toHaveBeenCalled();
    expect(renderer.dimensionMovePreview).toBe(null);
  });
});
