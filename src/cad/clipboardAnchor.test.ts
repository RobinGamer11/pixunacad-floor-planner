import { describe, expect, it } from "vitest";
import { buildClipboardFromSelection } from "./ClipboardManager";

/** Minimaler CadApp-Ersatz: eine ausgewählte Linie plus Mausposition. */
function fakeApp(mouse: { wx: number; wy: number }) {
  const seg = {
    id: "s1", a: { x: 0, y: 0 }, b: { x: 10, y: 0 },
    color: "#000", thicknessM: 0.01, labelId: "",
  };
  return {
    input: { mouse },
    selectTool: { marqueeSelectedIds: [] },
    selectedLabelId: null,
    scene: {},
    getSelectedSegment: () => seg,
    getSelectedHatch: () => null,
    getSelectedDimension: () => null,
    getSelectedTextBox: () => null,
  } as any;
}

describe("Kopier-Fangpunkt", () => {
  it("nimmt den Endpunkt, der beim Kopieren am Mauszeiger liegt", () => {
    const clip = buildClipboardFromSelection(fakeApp({ wx: 9.6, wy: 0.2 }));
    expect(clip?.anchor).toEqual({ x: 10, y: 0 });
  });

  it("nimmt den anderen Endpunkt, wenn dieser näher liegt", () => {
    const clip = buildClipboardFromSelection(fakeApp({ wx: 0.4, wy: -0.3 }));
    expect(clip?.anchor).toEqual({ x: 0, y: 0 });
  });

  it("verwendet einen ausdrücklich gesetzten Anker unverändert", () => {
    const clip = buildClipboardFromSelection(fakeApp({ wx: 9, wy: 0 }), { x: 5, y: 5 });
    expect(clip?.anchor).toEqual({ x: 5, y: 5 });
  });
});
