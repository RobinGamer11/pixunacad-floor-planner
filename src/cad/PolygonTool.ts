import { HatchTool, type HatchDrawMode } from "./HatchTool";
import { maybeRasterize } from "./rasterize";
import type { Vec2 } from "./geometry";
import type { Input } from "./Input";

export type PolygonDrawMode = "polygon" | "rectangle" | "circle";

/**
 * Polygonwerkzeug — eigenständiges Werkzeug für geschlossene Konturen.
 *
 * Zeichenverhalten, Fangpunkte, Hilfslinien und HUB-Eingaben sind identisch
 * zum Schraffurwerkzeug (gemeinsame Basisklasse). Der Unterschied liegt
 * ausschließlich im erzeugten Objekt: es entsteht immer genau EIN
 * geschlossenes Polygonobjekt (nie eine Schraffur, nie Einzelsegmente).
 */
export class PolygonTool extends HatchTool {
  id = "polygon";

  /** Der Füllmodus der Schraffur existiert hier bewusst nicht. */
  setPolygonMode(mode: PolygonDrawMode) {
    super.setDrawMode(this._sanitizeMode(mode));
  }

  /**
   * Auch der geerbte generische Setter darf für das Polygonwerkzeug niemals
   * den Füllmodus aktivieren — "fill" wird zur Laufzeit abgewiesen.
   */
  override setDrawMode(mode: HatchDrawMode) {
    super.setDrawMode(this._sanitizeMode(mode as any));
  }

  private _sanitizeMode(mode: any): HatchDrawMode {
    return (mode === "polygon" || mode === "rectangle" || mode === "circle")
      ? (mode as HatchDrawMode)
      : ((this.drawMode === "polygon" || this.drawMode === "rectangle" || this.drawMode === "circle")
        ? (this.drawMode as HatchDrawMode)
        : ("polygon" as HatchDrawMode));
  }

  /**
   * Freie Polygone sind offene Punktketten: keine automatische Kante vom
   * letzten zum ersten Punkt, gültig bereits ab zwei Punkten.
   */
  protected override _polygonMinPoints(): number {
    return this.drawMode === "polygon" ? 2 : 3;
  }

  protected override _polygonAutoCloses(): boolean {
    return this.drawMode !== "polygon";
  }

  /** Erzeugt aus der fertigen Kontur ein einzelnes Polygonobjekt. */
  protected override _createShapeFromPoints(points: Vec2[], closed = true) {
    const style = (this.app as any).getCurrentPolygonStyle?.() ?? {};
    const shapeMode: PolygonDrawMode =
      this.drawMode === "rectangle" || this.drawMode === "circle" ? this.drawMode : "polygon";
    const poly = (this.app as any).scene.createPolygon(points, {
      ...style,
      ...((this.app as any).getStrokeEffectDefaults?.("polygon") ?? {}),
      shapeMode,
      closed: shapeMode === "polygon" ? closed : true,
    });
    maybeRasterize(this.app, { type: "hatch", obj: poly });
    (this.app as any).notifyPolygonCreated?.(poly);
  }

  /**
   * Kreis: Mittelpunkt setzen → Radius bestimmen → fertig.
   * Es gibt keinen Sektor-/Bogenmodus, ein Kreis ist immer eine geschlossene
   * Polygonkontur.
   */
  protected override _onCircleClick(input: Input) {
    if (this.circleState === "idle") {
      super._onCircleClick(input);
      return;
    }
    if (this.circleState === "radius") {
      super._onCircleClick(input);
      if ((this.circleState as string) === "arc") this._finishCircle(true);
      return;
    }
    this._finishCircle(true);
  }
}
