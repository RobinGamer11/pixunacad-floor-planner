/**
 * Zentrale Zuordnung "Objekttyp ↔ Werkzeug" für die Auswahlsteuerung.
 *
 * Wird gemeinsam von der CAD-Oberfläche (`CadApp`/`SelectTool`) und der
 * Projektmappe (`ProjectWorkspace`/`MiniCad`) verwendet, damit "Alles" und
 * Strg/Cmd+A in beiden Oberflächen exakt dieselben Objektarten je Werkzeug
 * erfassen. Keine abweichenden Sonderlösungen pro Oberfläche.
 */

/** Werkzeuge, die eigene Objekte erzeugen und damit einen Auswahlfilter bilden. */
export type ObjectToolId =
  | "line"
  | "guide"
  | "free"
  | "polygon"
  | "hatch"
  | "text"
  | "table"
  | "document"
  | "measure"
  | "wall"
  | "door"
  | "sticker";

export const OBJECT_TOOL_IDS: readonly ObjectToolId[] = [
  "line", "guide", "free", "polygon", "hatch", "text",
  "table", "document", "measure", "wall", "door", "sticker",
];

/**
 * Normalisiert eine Werkzeug-ID (CAD `ToolIds` oder Mappen-`PageTool`) auf
 * einen Auswahlfilter. Werkzeuge ohne eigene Objekte (Auswahl, Radierer,
 * Pipette, CAD-Blatt …) liefern `null` und bilden damit KEINEN neuen Filter.
 */
export function asObjectToolId(toolId: unknown): ObjectToolId | null {
  if (typeof toolId !== "string" || !toolId) return null;
  return (OBJECT_TOOL_IDS as readonly string[]).includes(toolId)
    ? (toolId as ObjectToolId)
    : null;
}

/**
 * Engine-Objekt (`SelectTool`-Kind + Objekt) → Werkzeug.
 * Polygon und Schraffur teilen sich intern die Hatch-Struktur, bleiben hier
 * aber ausdrücklich getrennte Werkzeugtypen. Ebenso Linie und Hilfslinie.
 */
export function engineToolForObject(kind: string, obj: any): ObjectToolId | null {
  switch (kind) {
    case "segment":     return obj?.isGuide === true ? "guide" : "line";
    case "wall":        return "wall";
    case "door":        return "door";
    case "hatch":       return obj?.isPolygon === true ? "polygon" : "hatch";
    case "polygon":     return "polygon";
    case "freeStroke":  return "free";
    case "dimension":   return "measure";
    case "textbox":
    case "textBox":     return "text";
    case "table":       return "table";
    case "document":    return "document";
    case "sticker":     return "sticker";
    default:            return null;
  }
}

/** Seitenelement der Projektmappe (`element.kind`) → Werkzeug. */
export function pageToolForElementKind(kind: string): ObjectToolId | null {
  switch (kind) {
    case "line":         return "line";
    case "guide":        return "guide";
    case "text":
    case "note":         return "text";
    case "table":        return "table";
    case "image":
    case "pdf":          return "document";
    case "shape":        return "polygon";
    default:             return null; // cad-view / cad-viewport / timeline: kein Werkzeugfilter
  }
}

/** Prüft, ob ein Engine-Objekt zum gewünschten Werkzeugfilter gehört. */
export function engineObjectMatchesTool(
  filter: ObjectToolId | null,
  kind: string,
  obj: any,
): boolean {
  if (!filter) return true;
  return engineToolForObject(kind, obj) === filter;
}

/** Prüft, ob ein Seitenelement zum gewünschten Werkzeugfilter gehört. */
export function pageElementMatchesTool(
  filter: ObjectToolId | null,
  kind: string,
): boolean {
  if (!filter) return true;
  return pageToolForElementKind(kind) === filter;
}
