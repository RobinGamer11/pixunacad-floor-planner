/**
 * RasterLayers — gekachelte Raster-Zeichenebenen (Pixelmodus der Projektmappe).
 *
 * Konzept
 * -------
 * Jede Ebene (LabelManager-Gruppe) kann zusätzlich zu ihren Vektorobjekten
 * einen durchgehenden Rasterinhalt besitzen:
 *
 *   Seite
 *   ├── Ebene A ── Vektorobjekte + Rasterinhalt
 *   └── Ebene B ── Vektorobjekte + Rasterinhalt
 *
 * Der Rasterinhalt ist KEIN Szenenobjekt: er ist nicht auswählbar, hat keinen
 * Auswahlrahmen und wird ausschließlich über Zeichnen, Radieren, Sichtbarkeit
 * und Ebenenreihenfolge bearbeitet.
 *
 * Koordinatensystem
 * -----------------
 * Identisch zum Vektorinhalt: 1 Welt-Einheit = 1 Meter Papier (Seiten-Oben-Links
 * = Welt 0/0). Die Auflösung (`pxPerM`) ist FEST und unabhängig von Zoom,
 * Bildschirmauflösung oder devicePixelRatio — beim Zoomen wird lediglich
 * hochskaliert gezeichnet, gespeichert bleibt immer dieselbe Papier-DPI.
 *
 * Speichermodell
 * --------------
 * Kacheln (Tiles) von `tilePx` × `tilePx` Pixeln, adressiert über ganzzahlige
 * Kachelkoordinaten. Nur tatsächlich bemalte Kacheln existieren im Speicher und
 * werden gespeichert (PNG-DataURL je Kachel, gecached bis die Kachel sich
 * ändert). Leere Kacheln werden beim Serialisieren verworfen.
 */

import type { Camera } from "./Camera";

/** Kantenlänge einer Kachel in Pixeln. */
export const RASTER_TILE_PX = 512;

/**
 * Standard-Rasterauflösung: 300 dpi bezogen auf Papiermeter.
 * (300 / 25.4 mm) * 1000 mm/m ≈ 11811 px/m — A4 ⇒ 2480 × 3508 px.
 */
export const DEFAULT_RASTER_PX_PER_M = Math.round((300 / 25.4) * 1000);

/**
 * CAD-taugliche Grundqualität: 600 dpi bezogen auf das Papier.
 * Damit bleiben Pixelstriche auch beim Ausdruck und beim Hineinzoomen
 * werkplantauglich scharf. Die Auflösung ist FEST gespeichert — Zoomen
 * ändert sie nie.
 */
export const CAD_RASTER_DPI = 600;

/**
 * Untergrenze der Rasterauflösung in Pixeln pro WELT-Meter. Im CAD wird in
 * echten Metern gezeichnet; bei sehr großen Maßstabsnennern (1:500) würde die
 * reine Papier-DPI-Umrechnung sonst zu grob werden.
 */
export const MIN_RASTER_PX_PER_M = 120;

export interface RasterTileJSON {
  tx: number;
  ty: number;
  /** PNG-DataURL der Kachel (fehlt, wenn `ref` gesetzt ist). */
  src?: string;
  /**
   * Verweis auf den Index einer inhaltsgleichen Kachel derselben Ebene.
   * Vermeidet Bildduplikate in der Persistenz (z. B. gleichmäßige Flächen).
   */
  ref?: number;
}

export interface RasterLayerJSON {
  labelId: string;
  /** Anzahl eingebrannter Rasterstriche (nur für die Ebenen-Objektzählung). */
  strokeCount?: number;
  pxPerM: number;
  tilePx: number;
  tiles: RasterTileJSON[];
}

interface RasterTile {
  tx: number;
  ty: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Gecachte PNG-DataURL (null = neu erzeugen). */
  dataUrl: string | null;
  /** true, solange das Restore-Bild noch lädt. */
  loading: boolean;
  /** true, wenn die Kachel seit dem letzten Radieren leer sein könnte. */
  maybeEmpty?: boolean;
}

function makeTileCanvas(px: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

/** Rasterinhalt genau einer Ebene. */
export class RasterLayer {
  readonly labelId: string;
  readonly pxPerM: number;
  readonly tilePx: number;
  private tiles = new Map<string, RasterTile>();
  /** Anzahl der in diese Ebene eingebrannten Rasterstriche. */
  strokeCount = 0;

  constructor(labelId: string, pxPerM = DEFAULT_RASTER_PX_PER_M, tilePx = RASTER_TILE_PX) {
    this.labelId = labelId;
    this.pxPerM = pxPerM;
    this.tilePx = tilePx;
  }

  /** Kantenlänge einer Kachel in Weltmetern. */
  get tileWorld(): number {
    return this.tilePx / this.pxPerM;
  }

  private _key(tx: number, ty: number) { return `${tx},${ty}`; }

  private _tile(tx: number, ty: number, create: boolean): RasterTile | null {
    const key = this._key(tx, ty);
    let t = this.tiles.get(key);
    if (!t && create) {
      const { canvas, ctx } = makeTileCanvas(this.tilePx);
      t = { tx, ty, canvas, ctx, dataUrl: null, loading: false };
      this.tiles.set(key, t);
    }
    return t || null;
  }

  /** Iteriert über alle Kacheln, die das Weltrechteck berühren. */
  private _forRect(
    x: number, y: number, w: number, h: number, create: boolean,
    cb: (tile: RasterTile, originX: number, originY: number) => void,
  ) {
    const tw = this.tileWorld;
    const tx0 = Math.floor(x / tw), tx1 = Math.floor((x + w) / tw);
    const ty0 = Math.floor(y / tw), ty1 = Math.floor((y + h) / tw);
    // Schutz gegen absurd große Bereiche (z. B. fehlerhafte Bounds).
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 4096) return;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = this._tile(tx, ty, create);
        if (!tile) continue;
        cb(tile, tx * tw, ty * tw);
      }
    }
  }

  /**
   * Zeichnet ein vorgerendertes Canvas (Weltrechteck) in die Ebene ein.
   *
   * Die Zielposition wird auf ganze Pixel gerundet und die Quellgröße 1:1
   * übernommen. Andernfalls würde jede Kachel dasselbe Bild mit einem eigenen
   * Sub-Pixel-Versatz neu abtasten — an den Kachelgrenzen entstünden dann
   * sichtbare Raster-/Gitterlinien.
   */
  blit(src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
    this.strokeCount += 1;
    const gx = Math.round(x * this.pxPerM);
    const gy = Math.round(y * this.pxPerM);
    this._forRect(x, y, w, h, true, (tile) => {
      const ctx = tile.ctx;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, gx - tile.tx * this.tilePx, gy - tile.ty * this.tilePx, src.width, src.height);
      ctx.restore();
      tile.dataUrl = null;
    });
  }


  /**
   * Radiert einen Kreis aus dem Rasterinhalt.
   * - hard: harte Kante, volle Deckkraft-Abtragung
   * - smooth: weicher radialer Verlauf (`softness` = weicher Randanteil)
   */
  eraseCircle(cx: number, cy: number, r: number, mode: "hard" | "smooth", strength: number, softness: number) {
    if (r <= 0) return;
    const alpha = Math.max(0.05, Math.min(1, mode === "hard" ? 1 : strength || 1));
    const soft = Math.max(0.05, Math.min(1, softness));
    this._forRect(cx - r, cy - r, r * 2, r * 2, false, (tile, ox, oy) => {
      const ctx = tile.ctx;
      const px = (cx - ox) * this.pxPerM;
      const py = (cy - oy) * this.pxPerM;
      const pr = r * this.pxPerM;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      if (mode === "smooth") {
        const inner = pr * (1 - soft);
        const g = ctx.createRadialGradient(px, py, Math.max(0, inner), px, py, pr);
        g.addColorStop(0, `rgba(0,0,0,${alpha})`);
        g.addColorStop(0.65, `rgba(0,0,0,${alpha * 0.45})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      tile.dataUrl = null;
      tile.maybeEmpty = true;
    });
    this.pruneEmptyTiles();
  }

  /**
   * Gibt vollständig leergeräumte Kacheln frei (sparse bleibt sparse).
   * Wird nach dem Radieren aufgerufen und prüft nur betroffene Kacheln.
   */
  pruneEmptyTiles() {
    for (const [key, tile] of [...this.tiles]) {
      if (!tile.maybeEmpty || tile.loading) continue;
      tile.maybeEmpty = false;
      if (this._isTileEmpty(tile)) this.tiles.delete(key);
    }
  }

  /** Zeichnet den Rasterinhalt in den Viewport (Bildschirm-Canvas). */
  draw(ctx: CanvasRenderingContext2D, camera: Camera) {
    if (this.tiles.size === 0) return;
    const tw = this.tileWorld;
    const sizePx = tw * camera.scale;
    ctx.save();
    // Beim Vergrößern über die gespeicherte Rasterauflösung hinaus würde die
    // Glättung nur verwaschen — ab ~1,5-facher Vergrößerung wird pixelgenau
    // gezeichnet. Die gespeicherte Qualität bleibt davon unberührt.
    const magnify = camera.scale / this.pxPerM;
    ctx.imageSmoothingEnabled = magnify <= 1.5;
    ctx.imageSmoothingQuality = "high";
    for (const tile of this.tiles.values()) {
      if (tile.loading) continue;
      const p = camera.worldToScreen(tile.tx * tw, tile.ty * tw);
      // Kanten auf ganze Bildschirmpixel runden: benachbarte Kacheln stoßen so
      // exakt aneinander, es entstehen weder Lücken noch Doppelkanten (Gitter).
      const x0 = Math.round(p.x), y0 = Math.round(p.y);
      const x1 = Math.round(p.x + sizePx), y1 = Math.round(p.y + sizePx);
      ctx.drawImage(tile.canvas, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));

    }
    ctx.restore();
  }

  hasContent(): boolean {
    return this.tiles.size > 0;
  }

  /** Prüft, ob an einem Weltpunkt deckende Pixel liegen (Boundary-Analyse). */
  isOpaqueAt(x: number, y: number, threshold = 24): boolean {
    const tw = this.tileWorld;
    const tile = this._tile(Math.floor(x / tw), Math.floor(y / tw), false);
    if (!tile) return false;
    const px = Math.floor((x - Math.floor(x / tw) * tw) * this.pxPerM);
    const py = Math.floor((y - Math.floor(y / tw) * tw) * this.pxPerM);
    try {
      const d = tile.ctx.getImageData(Math.max(0, Math.min(this.tilePx - 1, px)), Math.max(0, Math.min(this.tilePx - 1, py)), 1, 1).data;
      return d[3] >= threshold;
    } catch {
      return false;
    }
  }

  /** Zeichnet den Rasterinhalt eines Weltrechtecks in ein Analyse-Canvas. */
  drawIntoMask(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pxPerM: number) {
    const k = pxPerM / this.pxPerM;
    this._forRect(x, y, w, h, false, (tile, ox, oy) => {
      if (tile.loading) return;
      ctx.drawImage(
        tile.canvas,
        (ox - x) * pxPerM, (oy - y) * pxPerM,
        this.tilePx * k, this.tilePx * k,
      );
    });
  }

  /**
   * Speicherschonende Persistenz:
   * - leere Kacheln werden verworfen UND aus dem Speicher entfernt (sparse),
   * - inhaltsgleiche Kacheln werden nur einmal als PNG abgelegt und sonst per
   *   `ref` referenziert (keine Bildduplikate).
   */
  serialize(): RasterLayerJSON | null {
    const tiles: RasterTileJSON[] = [];
    const seen = new Map<string, number>();
    const push = (tile: RasterTile, src: string) => {
      const hit = seen.get(src);
      if (hit !== undefined) { tiles.push({ tx: tile.tx, ty: tile.ty, ref: hit }); return; }
      seen.set(src, tiles.length);
      tiles.push({ tx: tile.tx, ty: tile.ty, src });
    };
    for (const [key, tile] of [...this.tiles]) {
      if (tile.loading) {
        if (tile.dataUrl) push(tile, tile.dataUrl);
        continue;
      }
      if (!tile.dataUrl) {
        if (this._isTileEmpty(tile)) { this.tiles.delete(key); continue; }
        tile.dataUrl = tile.canvas.toDataURL("image/png");
      }
      push(tile, tile.dataUrl);
    }
    if (tiles.length === 0) return null;
    return { labelId: this.labelId, pxPerM: this.pxPerM, tilePx: this.tilePx, tiles, strokeCount: this.strokeCount };
  }

  private _isTileEmpty(tile: RasterTile): boolean {
    try {
      const data = tile.ctx.getImageData(0, 0, this.tilePx, this.tilePx).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 2) return false;
      return true;
    } catch {
      return false;
    }
  }

  /** Lädt Kacheln aus JSON (asynchron je Kachel; `onReady` triggert ein Re-Render). */
  restore(json: RasterLayerJSON, onReady?: () => void) {
    this.strokeCount = Math.max(0, json.strokeCount ?? (json.tiles?.length ? 1 : 0));
    const list = json.tiles || [];
    for (const t of list) {
      // `ref` verweist auf eine inhaltsgleiche Kachel (Dedupe beim Speichern).
      const src = t.src ?? (typeof t.ref === "number" ? list[t.ref]?.src : undefined);
      if (!src) continue;
      const tile = this._tile(t.tx, t.ty, true)!;
      tile.dataUrl = src;
      tile.loading = true;
      const img = new Image();
      img.onload = () => {
        try {
          tile.ctx.clearRect(0, 0, this.tilePx, this.tilePx);
          tile.ctx.drawImage(img, 0, 0, this.tilePx, this.tilePx);
        } catch { /* Kachel bleibt leer */ }
        tile.loading = false;
        onReady?.();
      };
      img.onerror = () => { tile.loading = false; onReady?.(); };
      img.src = src;
    }
  }

  /**
   * Weltrechteck, das allen belegten Kacheln dieser Ebene umschließt.
   * Kachelgenau (nicht pixelgenau) — reicht für die Boundary-Analyse.
   */
  contentBoundsWorld(): { x: number; y: number; w: number; h: number } | null {
    if (this.tiles.size === 0) return null;
    const tw = this.tileWorld;
    let minTx = Infinity, minTy = Infinity, maxTx = -Infinity, maxTy = -Infinity;
    for (const t of this.tiles.values()) {
      if (t.tx < minTx) minTx = t.tx;
      if (t.ty < minTy) minTy = t.ty;
      if (t.tx > maxTx) maxTx = t.tx;
      if (t.ty > maxTy) maxTy = t.ty;
    }
    if (!Number.isFinite(minTx)) return null;
    return { x: minTx * tw, y: minTy * tw, w: (maxTx - minTx + 1) * tw, h: (maxTy - minTy + 1) * tw };
  }
}


/**
 * Verwaltung aller Raster-Ebenen einer Szene.
 * Wird von MiniCad instanziiert und vom Renderer, den Zeichenwerkzeugen und
 * dem Radiergummi genutzt.
 */
export class RasterLayers {
  private layers = new Map<string, RasterLayer>();
  /** Feste Rasterauflösung neuer Ebenen (Papier-DPI, zoom-unabhängig). */
  pxPerM: number;
  /** Wird nach asynchronem Nachladen gespeicherter Kacheln aufgerufen. */
  onReady: (() => void) | null = null;

  constructor(pxPerM = DEFAULT_RASTER_PX_PER_M) {
    this.pxPerM = pxPerM;
  }

  get(labelId: string, create = false): RasterLayer | null {
    let l = this.layers.get(labelId);
    if (!l && create) {
      l = new RasterLayer(labelId, this.pxPerM);
      this.layers.set(labelId, l);
    }
    return l || null;
  }

  hasAnyContent(): boolean {
    for (const l of this.layers.values()) if (l.hasContent()) return true;
    return false;
  }

  /**
   * Weltrechteck über alle (optional gefilterten) Rasterebenen mit Inhalt.
   * Wird von der hybriden Boundary-Analyse genutzt, um den Analyseausschnitt
   * zoom-unabhängig zu bestimmen.
   */
  contentBoundsWorld(filter?: (labelId: string) => boolean): { x: number; y: number; w: number; h: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [labelId, layer] of this.layers) {
      if (filter && !filter(labelId)) continue;
      const b = layer.contentBoundsWorld();
      if (!b) continue;
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }
    if (!Number.isFinite(minX)) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }


  /** Zeichnet genau eine Ebene (Aufruf aus der Label-Reihenfolge des Renderers). */
  drawLayer(ctx: CanvasRenderingContext2D, camera: Camera, labelId: string) {
    this.layers.get(labelId)?.draw(ctx, camera);
  }

  /**
   * Radiert in allen Ebenen, die `isVisible` zulässt (gesperrte Ebenen können
   * über `isEditable` ausgeschlossen werden).
   */
  eraseCircle(
    cx: number, cy: number, r: number,
    mode: "hard" | "smooth", strength: number, softness: number,
    isEditable?: (labelId: string) => boolean,
  ): boolean {
    let touched = false;
    for (const [labelId, layer] of this.layers) {
      if (isEditable && !isEditable(labelId)) continue;
      if (!layer.hasContent()) continue;
      layer.eraseCircle(cx, cy, r, mode, strength, softness);
      touched = true;
    }
    return touched;
  }

  /** Löscht allen Rasterinhalt (z. B. vor `loadState`). */
  clear() {
    this.layers.clear();
  }

  serialize(): RasterLayerJSON[] {
    const out: RasterLayerJSON[] = [];
    for (const layer of this.layers.values()) {
      const json = layer.serialize();
      if (json) out.push(json);
    }
    return out;
  }

  restore(data: RasterLayerJSON[] | null | undefined) {
    this.clear();
    if (!Array.isArray(data)) return;
    for (const json of data) {
      if (!json?.labelId) continue;
      const layer = new RasterLayer(json.labelId, json.pxPerM || this.pxPerM, json.tilePx || RASTER_TILE_PX);
      layer.restore(json, () => this.onReady?.());
      this.layers.set(json.labelId, layer);
    }
  }

  /** Alle Ebenen-IDs mit Rasterinhalt (für die Boundary-Analyse). */
  labelIds(): string[] {
    return [...this.layers.keys()];
  }
}
