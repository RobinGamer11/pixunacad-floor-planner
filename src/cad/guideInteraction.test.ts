import { describe, expect, it } from "vitest";
import { GlobalGuides } from "./globalGuides";
import { GuideInteractionController, guideAxesFor } from "./GuideInteractionController";
import { buildGuideGeometry } from "./guideGeometry";

const cam = { worldToScreen: (x: number, y: number) => ({ x: x * 100, y: y * 100 }), screenToWorld: (x: number, y: number) => ({ x: x / 100, y: y / 100 }) };
// Eine Linie (0,0)→(1,1); Fangpunkt (0,0)
const topo = {
  findBestSnap(ms: any, mw: any) {
    if (Math.hypot(ms.x, ms.y) < 3) return { type: "POINT", world: { x: 0, y: 0 } };
    const t = (mw.x + mw.y) / 2;
    const q = { x: t, y: t };
    if (Math.hypot(q.x - mw.x, q.y - mw.y) * 100 < 10) return { type: "LINE", world: q, lineA: { x: 0, y: 0 }, lineB: { x: 1, y: 1 } };
    return null;
  },
  // Echte Objektgeometrie statt Ring-Probeabfragen
  guideGeometry: (extra: any[] = []) => buildGuideGeometry({ scene: { segments: [{ id: "s", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }] }, isVisible: () => true, extraEdges: extra }),
};

describe("Zentrale Hilfslinien", () => {
  it("Fangpunkt ohne Bezug: H, V, Objektachse und Rechtwinklige", () => {
    const g = new GlobalGuides();
    const c = new GuideInteractionController(g, topo, cam);
    expect(c.handleRightClick({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(g.lines.length).toBe(4);
    c.handleRightClick({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(g.lines.length).toBe(0);
  });

  it("Kante mit Bezug: echte Parallele durch den Bezugspunkt", () => {
    const { axes } = guideAxesFor({ kind: "edge", world: { x: 0.5, y: 0.5 }, dir: { x: 1, y: 1 } }, { x: 3, y: 0 });
    expect(axes).toEqual([{ point: { x: 3, y: 0 }, dir: { x: 1, y: 1 } }]);
  });

  it("Fangpunkt mit Bezug ergänzt die Verbindungslinie", () => {
    const { axes } = guideAxesFor({ kind: "point", world: { x: 1, y: 1 }, directions: [] }, { x: 0, y: 0 });
    expect(axes.length).toBe(3);
  });

  it("Referenzzählung: geteilte Achse bleibt bis zur letzten Gruppe", () => {
    const g = new GlobalGuides();
    g.toggleAt({ x: 0, y: 0 });
    g.toggleLine({ x: 5, y: 0 }, { x: 1, y: 0 }); // gleiche Gerade y=0
    expect(g.lines.length).toBe(2);
    g.toggleAt({ x: 0, y: 0 });
    expect(g.lines.length).toBe(1);
  });

  it("CAD-Blatt und Exportseite sind getrennt", () => {
    const g = new GlobalGuides();
    g.setContext("cad:sheet:a");
    g.toggleAt({ x: 0, y: 0 });
    g.setContext("export:plan:p1");
    expect(g.lines.length).toBe(0);
    g.setContext("cad:sheet:a");
    expect(g.lines.length).toBe(2);
  });
});
