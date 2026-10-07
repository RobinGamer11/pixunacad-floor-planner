/**
 * Ermittelt die tatsächlich von einer Geometrie berührten Rasterkacheln –
 * entlang des Strichverlaufs bzw. der Flächenkontur, nicht das gesamte
 * umschließende Rechteck. Reine Geometrie, ohne Canvas.
 */
export interface Pt { x: number; y: number }
export interface CoverageGeom {
  /** Linienzüge mit halber Strichbreite inkl. Kappen/Effektrand (Welt). */
  polylines: { pts: Pt[]; pad: number }[];
  /** Geschlossene, gefüllte Konturen (Außenkontur; Löcher konservativ ignoriert). */
  polygons: { pts: Pt[]; pad: number }[];
}

export interface TileKey { tx: number; ty: number }

/** Liang–Barsky: schneidet die Strecke a–b das Rechteck? */
export function segmentHitsRect(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Liefert die berührten Kacheln. Bricht mit `null` ab, sobald `limit`
 * überschritten wird (Überlaufschutz VOR jeder Allokation).
 */
export function coveredTiles(geom: CoverageGeom, tileWorld: number, limit: number): TileKey[] | null {
  if (!(tileWorld > 0) || !Number.isFinite(tileWorld)) return null;
  const set = new Set<string>();
  const out: TileKey[] = [];
  const add = (tx: number, ty: number) => {
    const k = `${tx},${ty}`;
    if (set.has(k)) return true;
    set.add(k); out.push({ tx, ty });
    return out.length <= limit;
  };
  for (const pl of geom.polylines) {
    const pts = pl.pts.filter(Boolean);
    const pad = Math.max(0, pl.pad);
    const pairs: [Pt, Pt][] = pts.length === 1 ? [[pts[0], pts[0]]] : [];
    for (let i = 1; i < pts.length; i++) pairs.push([pts[i - 1], pts[i]]);
    for (const [a, b] of pairs) {
      const minX = Math.min(a.x, b.x) - pad, maxX = Math.max(a.x, b.x) + pad;
      const minY = Math.min(a.y, b.y) - pad, maxY = Math.max(a.y, b.y) + pad;
      const tx0 = Math.floor(minX / tileWorld), tx1 = Math.floor(maxX / tileWorld);
      const ty0 = Math.floor(minY / tileWorld), ty1 = Math.floor(maxY / tileWorld);
      if (!Number.isFinite(tx0 + tx1 + ty0 + ty1)) return null;
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const k = `${tx},${ty}`;
        if (set.has(k)) continue;
        const rx0 = tx * tileWorld - pad, ry0 = ty * tileWorld - pad;
        if (segmentHitsRect(a, b, rx0, ry0, rx0 + tileWorld + 2 * pad, ry0 + tileWorld + 2 * pad)) {
          if (!add(tx, ty)) return null;
        }
      }
    }
  }
  for (const pg of geom.polygons) {
    const pts = pg.pts.filter(Boolean);
    if (pts.length < 3) continue;
    const pad = Math.max(0, pg.pad);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const tx0 = Math.floor((minX - pad) / tileWorld), tx1 = Math.floor((maxX + pad) / tileWorld);
    const ty0 = Math.floor((minY - pad) / tileWorld), ty1 = Math.floor((maxY + pad) / tileWorld);
    const bboxTiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
    if (!Number.isFinite(bboxTiles)) return null;
    // Innenkacheln einer Fläche sind echte Füllung; ein riesiges Rechteck
    // darf hier nicht erst durchlaufen werden.
    if (bboxTiles > limit * 4) return null;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const k = `${tx},${ty}`;
      if (set.has(k)) continue;
      const rx0 = tx * tileWorld - pad, ry0 = ty * tileWorld - pad;
      const rx1 = rx0 + tileWorld + 2 * pad, ry1 = ry0 + tileWorld + 2 * pad;
      let hit = pointInPolygon({ x: (rx0 + rx1) / 2, y: (ry0 + ry1) / 2 }, pts);
      for (let i = 0; !hit && i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if (segmentHitsRect(a, b, rx0, ry0, rx1, ry1)) hit = true;
      }
      if (hit && !add(tx, ty)) return null;
    }
  }
  return out;
}
