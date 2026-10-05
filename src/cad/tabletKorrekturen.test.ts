import { describe, it, expect, vi } from "vitest";
import { CadApp } from "./CadApp";
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

describe("Altdaten: frühere Hintergrundentfernung", () => {
  it("veraltete Felder werden beim Laden verworfen, das Bild bleibt", () => {
    const rd: any = restoreOneScene({
      documents: [{ ...makeDoc(), bgRemoval: { enabled: true, hasMaskEdits: true, fgMaskDataUrl: "data:image/png;base64,MASK" } }],
    } as any, new Scene()).documents[0];
    expect(rd).toBeTruthy();
    expect(rd.src).toBe("data:image/png;base64,AAAA");
    expect(rd.bgRemoval).toBeUndefined();
    expect(JSON.stringify(rd, (k, v) => (k.startsWith("_") ? undefined : v))).not.toContain("fgMaskDataUrl");
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
