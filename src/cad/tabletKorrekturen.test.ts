import { describe, it, expect } from "vitest";
import {
  ensureBgRemoval,
  bgRemovalApplied,
  bgRemovalSignature,
  markBgMaskEdited,
  resetBgMask,
  exportBgMaskDataUrl,
} from "./documentBgRemove";
import { serializeScene, deserializeScene } from "./sceneSerde";
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
    const doc: any = makeDoc();
    doc.bgRemoval = {
      enabled: true,
      hasMaskEdits: true,
      fgMaskDataUrl: "data:image/png;base64,MASK",
      tolerance: 40,
      brushRadiusM: 0.2,
      fgColor: null,
      fgAlpha: 1,
      bgColor: null,
      bgAlpha: 0,
    };
    scene.documents.push(doc);
    const restored = deserializeScene(serializeScene(scene) as any);
    const rd: any = restored.documents.find((d: any) => d.id === "doc-1");
    expect(rd.bgRemoval.hasMaskEdits).toBe(true);
    expect(rd.bgRemoval.fgMaskDataUrl).toBe("data:image/png;base64,MASK");
    expect(bgRemovalApplied(rd)).toBe(true);
  });
});
