/**
 * Verlustfreie Geometrie-Snapshots für Bibliotheksobjekte.
 *
 * Die Snapshots verwenden exakt das Serialisierungsformat der Szene
 * (`SerializedScene`). Dadurch:
 *   • geht beim Speichern KEINE Eigenschaft verloren (Bögen, Pfeile,
 *     Linienarten, Aufrauen, Fangpunkte, Muster, Löcher, Wölbungen,
 *     Druckdaten, Bildstempel, Textstil, Tabellendaten …),
 *   • läuft das Erzeugen echter Objekte über denselben Pfad wie das Laden
 *     einer Szene (`appendSceneObjects`) — keine zweite, unvollständige
 *     Wiederherstellung.
 */
import type { Scene } from "../Scene";
import { copyStrokeEffects } from "../Scene";
import type { SerializedScene } from "../sceneSerde";
import { appendSceneObjects } from "../sceneSerde";
import type { LibraryGeometryKind, LibraryGeometrySnapshot, LibraryTransform } from "./types";

type Pt = { x: number; y: number };

const clonePt = (p: Pt) => ({ x: p.x, y: p.y });

/* ------------------------------------------------------------- Snapshots */

/** Vollständiger Snapshot eines Scene-Objekts (plain JSON, ohne Laufzeit-Caches). */
export function snapshotFromSceneObject(kind: LibraryGeometryKind, o: any): LibraryGeometrySnapshot | null {
  if (!o) return null;
  switch (kind) {
    case "segment":
      return {
        kind,
        data: {
          a: clonePt(o.a), b: clonePt(o.b),
          color: o.color, thicknessM: o.thicknessM, labelId: o.labelId,
          isGuide: !!o.isGuide,
          midpointSnap: !!o.midpointSnap,
          divisionSnap: o.divisionSnap,
          arrowStart: !!o.arrowStart, arrowEnd: !!o.arrowEnd,
          arrowScale: typeof o.arrowScale === "number" ? o.arrowScale : 1,
          bulge: typeof o.bulge === "number" ? o.bulge : 0,
          ...copyStrokeEffects(o),
        },
      };
    case "hatch":
      return {
        kind,
        data: {
          points: (o.points || []).map(clonePt),
          holes: (o.holes || []).map((loop: Pt[]) => loop.map(clonePt)),
          fillColor: o.fillColor, strokeColor: o.strokeColor,
          fillAlphaPct: o.fillAlphaPct, strokeWidthPx: o.strokeWidthPx,
          labelId: o.labelId, areaLabel: { ...(o.areaLabel || {}) },
          patternEnabled: o.patternEnabled, patternId: o.patternId,
          patternScale: o.patternScale, patternAngleDeg: o.patternAngleDeg,
          patternSkewDeg: o.patternSkewDeg, patternStretch: o.patternStretch,
          patternOffsetX: o.patternOffsetX, patternOffsetY: o.patternOffsetY,
          patternOrigin: o.patternOrigin ? { ...o.patternOrigin } : null,
          patternRotateWithShape: o.patternRotateWithShape !== false,
          bulges: [...(o.bulges || [])],
          holeBulges: (o.holeBulges || []).map((l: number[]) => [...l]),
          isPolygon: o.isPolygon === true,
          closed: o.isPolygon === true ? o.closed !== false : undefined,
          shapeMode: o.shapeMode,
          thicknessM: o.thicknessM,
          alpha: o.alpha,
          midpointSnap: !!o.midpointSnap,
          divisionSnap: o.divisionSnap,
          ...copyStrokeEffects(o),
        },
      };
    case "wall":
      return {
        kind,
        data: {
          kind: o.kind,
          thicknessM: o.thicknessM,
          referenceSide: o.referenceSide,
          corners: (o.corners || []).map(clonePt),
          hiddenCornerIndices: [...(o.hiddenCornerIndices || [])],
          cornerAnchors: (o.cornerAnchors || []).map((a: any) => (a ? { ...a } : null)),
          customName: o.customName,
          color: o.color, fillColor: o.fillColor,
          labelId: o.labelId, priority: o.priority,
          patternId: o.patternId, patternScale: o.patternScale,
          patternAlignToWall: !!o.patternAlignToWall,
          patternAngleDeg: o.patternAngleDeg ?? 0,
          bulges: [...(o.bulges || [])],
        },
      };
    case "dimension":
      return {
        kind,
        data: {
          p1: clonePt(o.p1), p2: clonePt(o.p2),
          placementPoint: clonePt(o.placementPoint),
          mode: o.mode, refDir: o.refDir ? clonePt(o.refDir) : null,
          bulge: o.bulge || 0, p3: o.p3 ? clonePt(o.p3) : null,
          textColor: o.textColor, textSizePx: o.textSizePx, lineColor: o.lineColor,
          decimals: o.decimals, tickLengthM: o.tickLengthM, showExtensions: o.showExtensions,
          useFreeText: o.useFreeText, freeText: o.freeText,
          textBgEnabled: o.textBgEnabled, textBgColor: o.textBgColor, textBgAlpha: o.textBgAlpha,
          extensionStyle: o.extensionStyle, extensionColor: o.extensionColor, extensionAlpha: o.extensionAlpha,
          freeTextBold: o.freeTextBold, freeTextItalic: o.freeTextItalic, freeTextColor: o.freeTextColor,
          textGapPx: o.textGapPx, doorHeightText: o.doorHeightText,
          labelId: o.labelId, mirror: !!o.mirror,
          // Türreferenzen sind instanzbezogen und werden bewusst nicht kopiert.
          doorRefId: null,
        },
      };
    case "textBox":
      return {
        kind,
        data: {
          center: clonePt(o.center),
          widthM: o.widthM, heightM: o.heightM,
          rotationRad: o.rotationRad, html: o.html,
          style: { ...(o.style || {}) },
          labelId: o.labelId,
        },
      };
    case "table":
      return {
        kind,
        data: {
          center: clonePt(o.center),
          rotationRad: o.rotationRad,
          mPerMm: o.mPerMm,
          scale: o.scale,
          data: JSON.parse(JSON.stringify(o.data ?? null)),
          labelId: o.labelId,
        },
      };
    case "freeStroke":
      return {
        kind,
        data: {
          points: (o.points || []).map(clonePt),
          color: o.color, thicknessM: o.thicknessM, opacity: o.opacity,
          lineStyle: o.lineStyle, gapM: o.gapM,
          blobSpacingM: o.blobSpacingM, blobSizeM: o.blobSizeM,
          smoothing: o.smoothing, labelId: o.labelId,
          imageSrc: o.imageSrc ?? null, imageSizeM: o.imageSizeM,
          imageSpacingM: o.imageSpacingM, imageRotateAlongPath: o.imageRotateAlongPath,
          pressures: o.pressures ? [...o.pressures] : null,
          autoShape: !!o.autoShape,
          autoShapeSource: o.autoShapeSource ? o.autoShapeSource.map(clonePt) : null,
          ...copyStrokeEffects(o),
        },
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------ Transform */

function txPoint(p: Pt, t: LibraryTransform, cs: number, sn: number): Pt {
  const sx = p.x * t.scaleX;
  const sy = p.y * t.scaleY;
  return { x: t.position.x + sx * cs - sy * sn, y: t.position.y + sx * sn + sy * cs };
}

/** Mittlerer Skalierungsfaktor für Strichbreiten/Längen (gleichmäßig = exakt). */
function avgScale(t: LibraryTransform): number {
  return (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2;
}

/**
 * Transformiert einen lokalen Snapshot nach Weltkoordinaten.
 * Bögen (`bulge`) sind Verhältniswerte und bleiben unter Drehung/gleichmäßiger
 * Skalierung unverändert gültig.
 */
export function transformSnapshot(snap: LibraryGeometrySnapshot, t: LibraryTransform): LibraryGeometrySnapshot {
  const cs = Math.cos(t.rotationRad);
  const sn = Math.sin(t.rotationRad);
  const s = avgScale(t);
  const d: any = JSON.parse(JSON.stringify(snap.data));
  const P = (p: Pt) => txPoint(p, t, cs, sn);

  switch (snap.kind) {
    case "segment":
      d.a = P(d.a); d.b = P(d.b);
      d.thicknessM = (d.thicknessM || 0) * s;
      break;
    case "hatch":
      d.points = (d.points || []).map(P);
      d.holes = (d.holes || []).map((loop: Pt[]) => loop.map(P));
      if (typeof d.thicknessM === "number") d.thicknessM *= s;
      break;
    case "wall":
      d.corners = (d.corners || []).map(P);
      d.thicknessM = (d.thicknessM || 0) * s;
      break;
    case "dimension":
      d.p1 = P(d.p1); d.p2 = P(d.p2);
      d.placementPoint = P(d.placementPoint);
      if (d.p3) d.p3 = P(d.p3);
      if (d.refDir) {
        // Richtungsvektor: nur drehen, nicht verschieben.
        const rx = d.refDir.x * t.scaleX, ry = d.refDir.y * t.scaleY;
        d.refDir = { x: rx * cs - ry * sn, y: rx * sn + ry * cs };
      }
      if (typeof d.tickLengthM === "number") d.tickLengthM *= s;
      break;
    case "textBox":
      d.center = P(d.center);
      d.widthM = (d.widthM || 0) * Math.abs(t.scaleX);
      d.heightM = (d.heightM || 0) * Math.abs(t.scaleY);
      d.rotationRad = (d.rotationRad || 0) + t.rotationRad;
      break;
    case "table":
      d.center = P(d.center);
      d.rotationRad = (d.rotationRad || 0) + t.rotationRad;
      d.scale = (d.scale || 1) * s;
      break;
    case "freeStroke":
      d.points = (d.points || []).map(P);
      if (d.autoShapeSource) d.autoShapeSource = d.autoShapeSource.map(P);
      d.thicknessM = (d.thicknessM || 0) * s;
      if (typeof d.gapM === "number") d.gapM *= s;
      if (typeof d.blobSpacingM === "number") d.blobSpacingM *= s;
      if (typeof d.blobSizeM === "number") d.blobSizeM *= s;
      if (typeof d.imageSizeM === "number") d.imageSizeM *= s;
      if (typeof d.imageSpacingM === "number") d.imageSpacingM *= s;
      break;
  }
  return { kind: snap.kind, data: d };
}

export function transformSnapshots(snaps: LibraryGeometrySnapshot[], t: LibraryTransform): LibraryGeometrySnapshot[] {
  return snaps.map((s) => transformSnapshot(s, t));
}

/** Verschiebt Snapshots (z. B. Welt → lokal relativ zum Einfügepunkt). */
export function translateSnapshots(snaps: LibraryGeometrySnapshot[], dx: number, dy: number): LibraryGeometrySnapshot[] {
  return transformSnapshots(snaps, { position: { x: dx, y: dy }, rotationRad: 0, scaleX: 1, scaleY: 1 });
}

/* ------------------------------------------------------------- Auswertung */

/** Alle relevanten Eckpunkte eines Snapshots (für AABB/Hit-Test). */
export function snapshotPoints(snap: LibraryGeometrySnapshot): Pt[] {
  const d: any = snap.data;
  switch (snap.kind) {
    case "segment": return [d.a, d.b];
    case "hatch": return [...(d.points || [])];
    case "wall": {
      const t = (d.thicknessM || 0) / 2;
      const out: Pt[] = [];
      for (const p of d.corners || []) { out.push({ x: p.x - t, y: p.y - t }); out.push({ x: p.x + t, y: p.y + t }); }
      return out;
    }
    case "dimension": return [d.p1, d.p2, d.placementPoint];
    case "textBox":
    case "table": {
      const w2 = (d.widthM || 0.2) / 2, h2 = (d.heightM || 0.2) / 2;
      return [
        { x: d.center.x - w2, y: d.center.y - h2 },
        { x: d.center.x + w2, y: d.center.y + h2 },
      ];
    }
    case "freeStroke": return [...(d.points || [])];
    default: return [];
  }
}

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function snapshotsBounds(snaps: LibraryGeometrySnapshot[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of snaps) {
    for (const p of snapshotPoints(s)) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Schwerpunkt aller Snapshot-Punkte (Standard-Einfügepunkt). */
export function snapshotsCentroid(snaps: LibraryGeometrySnapshot[]): Pt {
  let sx = 0, sy = 0, n = 0;
  for (const s of snaps) for (const p of snapshotPoints(s)) { sx += p.x; sy += p.y; n++; }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

/** Welt-Eckpunkte der Bounding-Box einer Instanz (rotiert + skaliert). */
export function instanceCornersWorld(snaps: LibraryGeometrySnapshot[], t: LibraryTransform): Pt[] {
  const b = snapshotsBounds(snaps);
  const cs = Math.cos(t.rotationRad), sn = Math.sin(t.rotationRad);
  return [
    { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
  ].map((p) => txPoint(p, t, cs, sn));
}

/** Liegt ein Weltpunkt in der (rotierten/skalierten) Bounding-Box? */
export function pointInInstanceBounds(snaps: LibraryGeometrySnapshot[], t: LibraryTransform, world: Pt): boolean {
  const cs = Math.cos(-t.rotationRad), sn = Math.sin(-t.rotationRad);
  const dx = world.x - t.position.x, dy = world.y - t.position.y;
  const sx = t.scaleX || 1, sy = t.scaleY || 1;
  const lx = (dx * cs - dy * sn) / sx;
  const ly = (dx * sn + dy * cs) / sy;
  const b = snapshotsBounds(snaps);
  return lx >= b.minX && lx <= b.maxX && ly >= b.minY && ly <= b.maxY;
}

/* ----------------------------------------------------- Szene-Erzeugung */

/** Gruppiert Snapshots in das Szenen-JSON-Format. */
export function snapshotsToSerializedScene(snaps: LibraryGeometrySnapshot[]): SerializedScene {
  const out: SerializedScene = {
    segments: [], hatches: [], walls: [], dimensions: [],
    textBoxes: [], tables: [], freeStrokes: [],
  };
  for (const s of snaps) {
    switch (s.kind) {
      case "segment": out.segments!.push(s.data); break;
      case "hatch": out.hatches!.push(s.data); break;
      case "wall": out.walls!.push(s.data); break;
      case "dimension": out.dimensions!.push(s.data); break;
      case "textBox": out.textBoxes!.push(s.data); break;
      case "table": out.tables!.push(s.data); break;
      case "freeStroke": out.freeStrokes!.push(s.data); break;
    }
  }
  return out;
}

/**
 * Erzeugt aus Welt-Snapshots echte Scene-Objekte in einer bestehenden Szene.
 * Nutzt denselben Wiederherstellungspfad wie das Laden einer Szene.
 * Optional wird allen Objekten eine Ebene zugewiesen.
 */
export function createObjectsFromSnapshots(
  scene: Scene,
  worldSnaps: LibraryGeometrySnapshot[],
  labelId?: string,
): { kind: string; id: string }[] {
  const before = {
    segments: new Set(scene.segments.map((o) => o.id)),
    hatches: new Set(scene.hatches.map((o) => o.id)),
    walls: new Set(scene.walls.map((o) => o.id)),
    dimensions: new Set(scene.dimensions.map((o) => o.id)),
    textBoxes: new Set(scene.textBoxes.map((o) => o.id)),
    tables: new Set<string>(((scene as any).tables || []).map((o: any) => String(o.id))),
    freeStrokes: new Set(scene.freeStrokes.map((o) => o.id)),
  };
  const data = snapshotsToSerializedScene(
    labelId
      ? worldSnaps.map((s) => ({ kind: s.kind, data: { ...s.data, labelId } }))
      : worldSnaps,
  );
  // Neue IDs erzwingen: gespeicherte IDs würden sonst Instanz-Duplikate erzeugen.
  for (const list of Object.values(data)) {
    if (Array.isArray(list)) for (const item of list) if (item && typeof item === "object") delete (item as any).id;
  }
  appendSceneObjects(scene, data);
  scene.markWallsDirty();

  const created: { kind: string; id: string }[] = [];
  const collect = (kind: string, list: any[], seen: Set<string>) => {
    for (const o of list || []) if (!seen.has(o.id)) created.push({ kind, id: o.id });
  };
  collect("segment", scene.segments, before.segments);
  collect("hatch", scene.hatches, before.hatches);
  collect("wall", scene.walls, before.walls);
  collect("dimension", scene.dimensions, before.dimensions);
  collect("textbox", scene.textBoxes, before.textBoxes);
  collect("table", (scene as any).tables || [], before.tables);
  collect("freeStroke", scene.freeStrokes, before.freeStrokes);
  return created;
}
