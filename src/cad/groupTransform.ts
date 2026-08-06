/**
 * groupTransform.ts — Verschieben und Drehen einer Mehrfachauswahl
 * (Marquee-/Shift-Auswahl) im CAD.
 *
 * Die Marquee-Auswahl hält nur `{ kind, id }`-Paare. Hier werden diese
 * aufgelöst und die eigentliche Geometrie transformiert.
 */
import { Vec2, v } from "./geometry";

export type GroupRef = { kind: string; id: string };

export function getGroupObject(app: any, kind: string, id: string): any {
  const s = app.scene as any;
  switch (kind) {
    case "segment":    return s.getSegmentById?.(id);
    case "wall":       return s.getWallById?.(id);
    case "hatch":      return s.getHatchById?.(id);
    case "freeStroke": return s.getFreeStrokeById?.(id);
    case "dimension":  return s.getDimensionById?.(id);
    case "textbox":    return s.getTextBoxById?.(id);
    case "document":   return s.getDocumentById?.(id);
    case "sticker":    return s.getStickerInstanceById?.(id);
    default: return null;
  }
}

/** Alle beweglichen Weltpunkte eines Objekts (Referenzen, in-place mutierbar). */
function movablePoints(kind: string, o: any): Vec2[] {
  const out: Vec2[] = [];
  switch (kind) {
    case "segment": out.push(o.a, o.b); break;
    case "wall": for (const p of o.corners || []) out.push(p); break;
    case "hatch":
      for (const p of o.points || []) out.push(p);
      for (const loop of o.holes || []) for (const p of loop) out.push(p);
      break;
    case "freeStroke": for (const p of o.points || []) out.push(p); break;
    case "dimension": out.push(o.p1, o.p2, o.placementPoint); break;
    case "textbox": out.push(o.center); break;
    case "document": out.push(o.position); break;
    case "sticker": out.push(o.position); break;
  }
  return out.filter(Boolean);
}

/** Schwerpunkt der Auswahl (Mittel der Objekt-Punkte). */
export function groupCentroid(app: any, refs: GroupRef[]): Vec2 | null {
  let sx = 0, sy = 0, n = 0;
  for (const r of refs) {
    const o = getGroupObject(app, r.kind, r.id);
    if (!o) continue;
    const pts = movablePoints(r.kind, o);
    // Dokument: Zentrum statt Ecke gewichten.
    if (r.kind === "document") {
      sx += o.position.x + (o.widthM || 0) / 2;
      sy += o.position.y + (o.heightM || 0) / 2;
      n++;
      continue;
    }
    for (const p of pts) { sx += p.x; sy += p.y; n++; }
  }
  if (!n) return null;
  return v(sx / n, sy / n);
}

/** Verschiebt alle Objekte der Auswahl um (dx, dy). */
export function translateGroup(app: any, refs: GroupRef[], dx: number, dy: number): void {
  if (!dx && !dy) return;
  let touchedWall = false;
  for (const r of refs) {
    const o = getGroupObject(app, r.kind, r.id);
    if (!o) continue;
    for (const p of movablePoints(r.kind, o)) { p.x += dx; p.y += dy; }
    if (r.kind === "wall") touchedWall = true;
  }
  if (touchedWall) app.scene.markWallsDirty?.();
}

function rot(p: Vec2, c: Vec2, cos: number, sin: number) {
  const x = p.x - c.x, y = p.y - c.y;
  p.x = c.x + x * cos - y * sin;
  p.y = c.y + x * sin + y * cos;
}

/** Dreht alle Objekte der Auswahl um `angle` (rad) um `center`. */
export function rotateGroup(app: any, refs: GroupRef[], angle: number, center: Vec2): void {
  if (!angle) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let touchedWall = false;
  for (const r of refs) {
    const o = getGroupObject(app, r.kind, r.id);
    if (!o) continue;

    if (r.kind === "document") {
      const c = { x: o.position.x + (o.widthM || 0) / 2, y: o.position.y + (o.heightM || 0) / 2 };
      rot(c as Vec2, center, cos, sin);
      o.position.x = c.x - (o.widthM || 0) / 2;
      o.position.y = c.y - (o.heightM || 0) / 2;
      o.rotationRad = (o.rotationRad || 0) + angle;
      continue;
    }

    for (const p of movablePoints(r.kind, o)) rot(p, center, cos, sin);

    if (r.kind === "textbox" || r.kind === "sticker") {
      o.rotationRad = (o.rotationRad || 0) + angle;
    } else if (r.kind === "hatch" && o.areaLabel) {
      o.areaLabel.rotationRad = (o.areaLabel.rotationRad || 0) + angle;
    } else if (r.kind === "dimension" && o.refDir) {
      const d = { x: o.refDir.x, y: o.refDir.y };
      o.refDir = { x: d.x * cos - d.y * sin, y: d.x * sin + d.y * cos };
    }
    if (r.kind === "wall") touchedWall = true;
  }
  if (touchedWall) app.scene.markWallsDirty?.();
}
