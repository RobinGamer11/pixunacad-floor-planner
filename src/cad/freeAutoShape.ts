/**
 * Nachträgliche Auto-Form für Freihandlinien.
 *
 * Die Umschaltung ist verlustfrei: beim Aktivieren werden die Originalpunkte
 * gesichert, beim Deaktivieren exakt wiederhergestellt.
 */
import { autoShapePoints } from "./freeGeom";
import type { Vec2 } from "./geometry";

export function setStrokeAutoShape(stroke: any, on: boolean): boolean {
  if (!stroke) return false;
  const isOn = stroke.autoShape === true;
  if (isOn === on) return false;
  if (on) {
    const src: Vec2[] = (stroke.points || []).map((p: Vec2) => ({ x: p.x, y: p.y }));
    const shaped = autoShapePoints(src);
    if (!shaped || shaped.length < 2) return false;
    stroke.autoShapeSource = src;
    stroke.points = shaped.map((p) => ({ x: p.x, y: p.y }));
    stroke.autoShape = true;
  } else {
    const src: Vec2[] | null = stroke.autoShapeSource || null;
    if (src && src.length >= 2) stroke.points = src.map((p) => ({ x: p.x, y: p.y }));
    stroke.autoShapeSource = null;
    stroke.autoShape = false;
  }
  return true;
}
