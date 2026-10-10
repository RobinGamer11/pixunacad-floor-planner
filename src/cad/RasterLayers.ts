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
import { rasterResources, type ResidentTile } from "./raster/RasterResourceManager";
import { segmentHitsRect } from "./raster/rasterCoverage";
import { resolveTileSrc } from "./raster/lazyTileSrc";
import { fillWithHatchPattern, type HatchPatternId } from "./hatchPatterns";
import { getCustomPatternImage, isCustomPatternId } from "./customHatchPatterns";
import { getImagePattern, isImagePatternId } from "./builtinImagePatterns";

/**
 * Kompakte Vollfläche (Manifest `solidFill`): Kontur + Löcher + Füllregel +
 * Farbe/Alpha statt flächendeckender Bitmap. Kein Szenenobjekt, nicht
 * auswählbar. Wird nur in Kacheln materialisiert, die später lokal bearbeitet
 * werden (`mat` = Schlüssel bereits materialisierter Kacheln).
 */
export interface CompactFillJSON {
  id: string;
  rings: { x: number; y: number }[][];
  rule: "evenodd" | "nonzero";
  color: string;
  alpha: number;
  mat?: string[];
  /** Manifest `patternFill`: Muster über der Grundfläche (sonst reine Vollfläche). */
  pattern?: CompactPatternJSON;
}
/**
 * Mustertransformation in Weltkoordinaten. Eingebaute Muster sind über `id`
 * referenziert (Bild liegt in der App); eigene Musterbilder liegen genau
 * einmal je Inhalt als Blob (`hash`, Laufzeit-`src`).
 */
export interface CompactPatternJSON {
  id: string;
  scale: number;
  angleDeg: number;
  skewDeg: number;
  stretch: number;
  color: string;
  /** Strichbreite in Weltmetern (zoom-/auflösungsunabhängig). */
  lineWidthM: number;
  /** Musteranker in Weltkoordinaten. */
  ax: number;
  ay: number;
  /** nur eigene Bildmuster: Bildquelle (data:/blob:) bzw. Inhaltshash im Manifest. */
  src?: string;
  hash?: string;
}
interface CompactFill extends Omit<CompactFillJSON, "mat"> {
  mat: Set<string>;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  img?: HTMLImageElement | null;
}

/** Bild eines eigenen Musters (einmal je Quelle geladen). */
const patternImages = new Map<string, HTMLImageElement>();
const patternFailed = new Set<string>();
function patternImage(src: string): HTMLImageElement | null {
  let img = patternImages.get(src);
  if (!img) {
    const im = new Image();
    img = im;
    patternImages.set(src, im);
    im.onerror = () => patternFailed.add(src);
    resolveTileSrc(src).then((u) => { if (u) im.src = u; else patternFailed.add(src); }, () => patternFailed.add(src));
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
/** Wartezeit, nach der ein nicht verfügbares Muster als fehlend gilt. */
export const PATTERN_MISSING_AFTER_MS = 60_000;
const patternFirstAsk = new Map<string, number>();
/** Zustand des Musters einer Fläche: bereit, lädt noch oder fehlt. */
export type PatternState = "ready" | "loading" | "failed";
function fillState(f: CompactFill): PatternState {
  const p = f.pattern;
  if (!p) return "ready";
  let ok = true;
  if (p.src) ok = !!patternImage(p.src);
  else if (isCustomPatternId(p.id)) ok = !!getCustomPatternImage(p.id);
  else if (isImagePatternId(p.id)) ok = !!getImagePattern(p.id);
  if (ok) return "ready";
  const key = p.src ?? p.id;
  if (p.src && patternFailed.has(p.src)) return "failed";
  const t0 = patternFirstAsk.get(key) ?? (patternFirstAsk.set(key, Date.now()), Date.now());
  return Date.now() - t0 > PATTERN_MISSING_AFTER_MS ? "failed" : "loading";
}
/** true, wenn das Muster der Fläche ohne Nachladen zeichnbar ist. */
function fillReady(f: CompactFill): boolean { return fillState(f) === "ready"; }
/**
 * Eindeutiger Lade-/Fehlerzustand statt unvollständiger Fläche: gestrichelte
 * Kontur + Schraffur + Hinweis (grau = lädt, rot = Muster fehlt).
 */
function paintPatternPlaceholder(ctx: CanvasRenderingContext2D, f: CompactFill, state: PatternState, k: number, offX: number, offY: number) {
  const col = state === "failed" ? "rgba(200,30,30," : "rgba(90,90,90,";
  ctx.save();
  ctx.beginPath();
  for (const r of f.rings) {
    if (r.length < 3) continue;
    ctx.moveTo(r[0].x * k + offX, r[0].y * k + offY);
    for (let i = 1; i < r.length; i++) ctx.lineTo(r[i].x * k + offX, r[i].y * k + offY);
    ctx.closePath();
  }
  ctx.fillStyle = col + "0.08)";
  ctx.fill(f.rule);
  ctx.save();
  ctx.clip(f.rule);
  const x0 = f.bbox.x0 * k + offX, y0 = f.bbox.y0 * k + offY, x1 = f.bbox.x1 * k + offX, y1 = f.bbox.y1 * k + offY;
  ctx.strokeStyle = col + "0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = x0 - (y1 - y0); d < x1; d += 10) { ctx.moveTo(d, y1); ctx.lineTo(d + (y1 - y0), y0); }
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = col + "0.9)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  if (x1 - x0 > 70 && y1 - y0 > 16) {
    ctx.fillStyle = col + "0.95)";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state === "failed" ? "Muster fehlt" : "Muster lädt …", (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.restore();
}
/**
 * Zeichnet eine kompakte Fläche (Grundfarbe + optional Muster) mit der
 * Abbildung ctx = Welt * k + off. Setzt `fillReady` voraus.
 */
function paintCompactFill(ctx: CanvasRenderingContext2D, f: CompactFill, k: number, offX: number, offY: number) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  for (const r of f.rings) {
    if (r.length < 3) continue;
    ctx.moveTo(r[0].x * k + offX, r[0].y * k + offY);
    for (let i = 1; i < r.length; i++) ctx.lineTo(r[i].x * k + offX, r[i].y * k + offY);
    ctx.closePath();
  }
  if (f.alpha > 0) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.alpha));
    ctx.fillStyle = f.color;
    ctx.fill(f.rule);
  }
  const p = f.pattern;
  if (p) {
    ctx.globalAlpha = 1;
    ctx.clip(f.rule);
    const bx = f.bbox.x0 * k + offX, by = f.bbox.y0 * k + offY;
    const tile = p.src ? patternImage(p.src) : null;
    fillWithHatchPattern(ctx, { x: bx - 2, y: by - 2, w: (f.bbox.x1 - f.bbox.x0) * k + 4, h: (f.bbox.y1 - f.bbox.y0) * k + 4 },
      { x: p.ax * k + offX, y: p.ay * k + offY }, k, {
        patternId: p.id as HatchPatternId, scale: p.scale, angleDeg: p.angleDeg, skewDeg: p.skewDeg, stretch: p.stretch,
        color: p.color, alpha: 1, lineWidthPx: Math.max(0.6, p.lineWidthM * k),
        ...(tile ? { tileOverride: tile } : {}),
      } as any);
  }
  ctx.restore();
}
function fillBBox(rings: { x: number; y: number }[][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
function insideFill(f: CompactFill, x: number, y: number): boolean {
  let wn = 0, odd = false;
  for (const r of f.rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a.y > y) !== (b.y > y)) {
      const cx = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      if (x < cx) { odd = !odd; wn += a.y > b.y ? 1 : -1; }
    }
  }
  return f.rule === "evenodd" ? odd : wn !== 0;
}
/** Berührt die Fläche das Weltrechteck? (konservativ, reine Geometrie) */
function fillHitsRect(f: CompactFill, x0: number, y0: number, x1: number, y1: number): boolean {
  if (f.bbox.x1 < x0 || f.bbox.x0 > x1 || f.bbox.y1 < y0 || f.bbox.y0 > y1) return false;
  for (const r of f.rings) for (let i = 0; i < r.length; i++) {
    if (segmentHitsRect(r[i], r[(i + 1) % r.length], x0, y0, x1, y1)) return true;
  }
  return insideFill(f, (x0 + x1) / 2, (y0 + y1) / 2);
}

/** Kantenlänge einer Kachel in Pixeln. */
export const RASTER_TILE_PX = 512;

/**
 * Standard-Rasterauflösung: 300 dpi bezogen auf Papiermeter.
 * (300 / 25.4 mm) * 1000 mm/m ≈ 11811 px/m — A4 ⇒ 2480 × 3508 px.
 */
export const DEFAULT_RASTER_PX_PER_M = Math.round((300 / 25.4) * 1000);

/**
 * Zielqualität auf dem Papier: 300 dpi genügen für Werkpläne und Druck.
 * (Nur dokumentarisch — die gespeicherte Modellauflösung ist fix.)
 */
export const CAD_RASTER_DPI = 300;

/**
 * Referenz-Ausgabemaßstab, aus dem die feste Modellauflösung abgeleitet wird.
 * 300 dpi bei 1:50 ⇒ (300/25.4)*1000/50 ≈ 236 px pro Weltmeter; wir runden auf
 * einen speicherverträglichen, glatten Wert auf.
 */
export const CAD_RASTER_REFERENCE_SCALE = 50;

/**
 * FESTE Rasterauflösung des Modellraums in Pixeln pro WELT-Meter.
 *
 * Der Modellraum ist immer 1:1 — der Ausgabemaßstab entsteht erst im Druckplan
 * bzw. CAD-Viewport. Die gespeicherte Pixelqualität darf deshalb NICHT vom
 * (Legacy-)Zeichnungsmaßstab abhängen, sonst entstünden bei 1:1 absurde
 * ~23.600 px/m. 500 px/m (2 mm Weltraster pro Pixel) entspricht ~250 dpi bei
 * 1:20 und ~600 dpi bei 1:50 — scharf, zoomunabhängig und sparse speicherbar.
 */
export const CAD_RASTER_PX_PER_M = 500;

/** Untergrenze (Kompatibilität). */
export const MIN_RASTER_PX_PER_M = 120;

/**
 * Feste Rasterauflösung (px pro Weltmeter). Bewusst unabhängig vom
 * Zeichnungs-/Druckmaßstab; das Argument wird nur noch aus Kompatibilität
 * akzeptiert und ignoriert.
 */
export function cadRasterPxPerM(_scaleDenominator?: number): number {
  return CAD_RASTER_PX_PER_M;
}

/**
 * Dieselbe Rasterqualität für Oberflächen, deren Weltmeter KEIN realer Meter
 * ist (Projektmappe/MiniCad: 1 Welt-Einheit = 1 Meter PAPIER).
 *
 * Die CAD-Oberfläche rendert mit `referencePxPerM = 80` (Defaults.
 * strokeWidthBaseScale) und speichert Raster mit `CAD_RASTER_PX_PER_M`
 * Pixeln pro Weltmeter — also `CAD_RASTER_PX_PER_M / 80` Rasterpixel je
 * Referenz-Renderpixel. Genau dieses Verhältnis wird hier auf die
 * Papierskalierung der Projektmappe (`referencePxPerM = basePxPerMm * 1000`)
 * übertragen, damit Pixelobjekte dort dieselbe effektive Qualität haben.
 */
export function cadRasterPxPerMForReference(
  referencePxPerM: number,
  baseReferencePxPerM = 80,
): number {
  const ref = Number.isFinite(referencePxPerM) && referencePxPerM > 0 ? referencePxPerM : baseReferencePxPerM;
  const px = cadRasterPxPerM() * (ref / Math.max(1, baseReferencePxPerM));
  // Obergrenze = 600 dpi Papier: darüber liefern die Offscreen-Renderpuffer
  // (MAX_PIXELS in rasterize.ts) keine höhere Qualität mehr, sondern nur noch
  // heruntergerechnete Kacheln.
  const MAX = Math.round((600 / 25.4) * 1000);
  return Math.max(MIN_RASTER_PX_PER_M, Math.min(MAX, Math.round(px)));
}



export interface RasterTileJSON {
  tx: number;
  ty: number;
  /** Auflösungsfaktor dieser Kachel relativ zu `pxPerM` (fehlt = 1). Weltgröße bleibt gleich. */
  s?: number;
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
  /** Kompakte Vollflächen (ohne Bitmap). */
  fills?: CompactFillJSON[];
}

/** Ausdrückliche Ablehnung eines zu großen Einzeichnungsbereichs. */
export class RasterRegionTooLargeError extends Error {
  constructor(public tiles: number) { super(`Rasterbereich zu groß (${tiles} Kacheln)`); }
}

interface RasterTile {
  tx: number;
  ty: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Gecachte PNG-DataURL (null = neu erzeugen). */
  dataUrl: string | null;
  /** Unveränderliche Version im gemeinsamen Kachelspeicher (null = geändert). */
  sid?: number | null;
  /** true, solange das Restore-Bild noch lädt. */
  loading: boolean;
  /** true, wenn die Kachel seit dem letzten Radieren leer sein könnte. */
  maybeEmpty?: boolean;
  /** Pixelpuffer vom RAM-Budget freigegeben; Quelle (`dataUrl`) bleibt. */
  evicted?: boolean;
  /** Änderungen, die nach dem (Nach-)Laden in Reihenfolge angewendet werden. */
  pending?: ((ctx: CanvasRenderingContext2D) => void)[];
  /** Zeitpunkt des letzten fehlgeschlagenen Ladeversuchs (Kachel bleibt unbekannt). */
  failedAt?: number;
  /** >0, solange ein Musterbild für die Materialisierung noch lädt. */
  patternWait?: number;
  res: ResidentTile;
  /** Eigener Auflösungsfaktor (1 = Ebenenauflösung, <1 = gröber). */
  s: number;
}

/** Zulässige Kachelauflösungsstufen (Halbierungen). */
export const TILE_SCALES = [1, 0.5, 0.25, 0.125] as const;
export function normTileScale(s: unknown): number {
  const n = typeof s === "number" && s > 0 ? s : 1;
  let best = 1;
  for (const c of TILE_SCALES) if (Math.abs(c - n) < Math.abs(best - n)) best = c;
  return best;
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
  private fills: CompactFill[] = [];
  /** Änderungszähler je Kachel (für Abschlussprüfung von Hintergrundjobs). */
  private ver = new Map<string, number>();
  /** Änderungszähler der kompakten Flächen. */
  fillsVersion = 0;
  private _materializing = false;
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

  /** Pixelkantenlänge einer Kachel bei ihrer eigenen Auflösung. */
  private _px(t: RasterTile): number { return Math.max(1, Math.round(this.tilePx * t.s)); }

  /** Auflösungsfaktor einer belegten Kachel (null = keine Kachel). */
  tileScale(tx: number, ty: number): number | null { return this.tiles.get(this._key(tx, ty))?.s ?? null; }

  private _tile(tx: number, ty: number, create: boolean, scale = 1): RasterTile | null {
    const key = this._key(tx, ty);
    let t = this.tiles.get(key);
    if (!t && create) {
      const sc = normTileScale(scale);
      const { canvas, ctx } = makeTileCanvas(Math.max(1, Math.round(this.tilePx * sc)));
      const tile: RasterTile = { tx, ty, canvas, ctx, dataUrl: null, loading: false, res: null as unknown as ResidentTile, s: sc };
      const tilePx = Math.max(1, Math.round(this.tilePx * sc));
      tile.res = {
        tilePx,
        evict: () => {
          if (tile.loading || tile.evicted || !tile.dataUrl || tile.pending?.length || tile.patternWait) return false;
          tile.canvas.width = 0; tile.canvas.height = 0; tile.evicted = true;
          return true;
        },
      };
      t = tile;
      this.tiles.set(key, t);
      rasterResources.touch(t.res);
    }
    return t || null;
  }

  private _bump(key: string) { this.ver.set(key, (this.ver.get(key) ?? 0) + 1); }
  tileVersion(tx: number, ty: number): number { return this.ver.get(this._key(tx, ty)) ?? 0; }

  private _paintFill(ctx: CanvasRenderingContext2D, f: CompactFill, ox: number, oy: number, k: number) {
    paintCompactFill(ctx, f, k, -ox * k, -oy * k);
  }

  /**
   * Materialisiert alle noch nicht eingebrachten Flächen in genau diese Kachel
   * (in Flächenreihenfolge). Läuft vor jeder lokalen Kachelbearbeitung.
   */
  private _materialize(tile: RasterTile) {
    if (!this.fills.length || this._materializing) return;
    const key = this._key(tile.tx, tile.ty);
    const tw = this.tileWorld, ox = tile.tx * tw, oy = tile.ty * tw;
    const todo = this.fills.filter((f) => !f.mat.has(key) && fillHitsRect(f, ox, oy, ox + tw, oy + tw));
    if (!todo.length) return;
    for (const f of todo) f.mat.add(key);
    // Musterbild noch nicht geladen: Kachel wartet (unbekannt, nie leer);
    // Materialisierung und alle späteren Änderungen laufen danach in Reihenfolge.
    if (todo.some((f) => !fillReady(f))) this._waitForPatterns(tile, todo);
    this._materializing = true;
    try {
      this._mutate(tile, this._scaled(tile, (ctx) => { for (const f of todo) this._paintFill(ctx, f, ox, oy, this.pxPerM); }));
    } finally { this._materializing = false; }
  }

  private _waitForPatterns(tile: RasterTile, todo: CompactFill[]) {
    tile.patternWait = (tile.patternWait ?? 0) + 1;
    const started = Date.now();
    const poll = () => {
      // Nie ohne Muster materialisieren: die Kachel bleibt unbekannt (Platzhalter
      // auf dem Bildschirm), bis das Muster verfügbar ist.
      if (!todo.every(fillReady)) { setTimeout(poll, Date.now() - started < 60_000 ? 100 : 1000); return; }
      tile.patternWait = Math.max(0, (tile.patternWait ?? 1) - 1);
      this._flushPending(tile);
      this.onTileReady?.();
    };
    setTimeout(poll, 0);
  }

  /** Wendet wartende Änderungen an, sobald die Kachel vollständig bereit ist. */
  private _flushPending(tile: RasterTile) {
    if (tile.loading || tile.evicted || tile.patternWait) { if (tile.evicted && !tile.patternWait) this._ensure(tile); return; }
    const pend = tile.pending; tile.pending = undefined;
    if (!pend?.length) return;
    for (const fn of pend) { tile.ctx.save(); fn(tile.ctx); tile.ctx.restore(); }
    tile.dataUrl = null; tile.sid = null;
    rasterResources.touch(tile.res);
  }

  /** Legt Kacheln an, wo Flächen im Rechteck noch nicht materialisiert sind. */
  private _ensureFillTiles(x: number, y: number, w: number, h: number) {
    if (!this.fills.length) return;
    const tw = this.tileWorld;
    const tx0 = Math.floor(x / tw), tx1 = Math.floor((x + w) / tw);
    const ty0 = Math.floor(y / tw), ty1 = Math.floor((y + h) / tw);
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 4096) return;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const key = this._key(tx, ty);
      if (this.tiles.has(key)) continue;
      const ox = tx * tw, oy = ty * tw;
      if (this.fills.some((f) => !f.mat.has(key) && fillHitsRect(f, ox, oy, ox + tw, oy + tw))) {
        this._materialize(this._tile(tx, ty, true)!);
      }
    }
  }

  /**
   * Fügt eine kompakte Vollfläche hinzu. Bereits vorhandene Kacheln im
   * Bereich werden sofort materialisiert, damit die Reihenfolge (Fläche über
   * früheren Strichen) stimmt; alle übrigen Bereiche bleiben kompakt.
   */
  addFill(json: CompactFillJSON) {
    const rings = (json.rings || []).filter((r) => Array.isArray(r) && r.length >= 3).map((r) => r.map((p) => ({ x: p.x, y: p.y })));
    if (!rings.length) return;
    const f: CompactFill = { id: json.id, rings, rule: json.rule === "nonzero" ? "nonzero" : "evenodd", color: json.color, alpha: json.alpha, mat: new Set(json.mat ?? []), bbox: fillBBox(rings), ...(json.pattern ? { pattern: { ...json.pattern } } : {}) };
    if (f.pattern?.src) patternImage(f.pattern.src); // früh nachladen
    this.fills.push(f);
    this.fillsVersion++;
    for (const t of [...this.tiles.values()]) this._materialize(t);
  }

  get fillCount() { return this.fills.length; }

  private _drop(key: string) {
    this._bump(key);
    const t = this.tiles.get(key);
    if (t) rasterResources.release(t.res);
    this.tiles.delete(key);
  }

  /** Lädt ein Bild in die Kachel und wendet danach offene Änderungen an. */
  private _loadInto(tile: RasterTile, src: string, onReady?: () => void) {
    tile.loading = true;
    const img = new Image();
    const done = (ok: boolean) => {
      const n = this._px(tile);
      if (tile.canvas.width !== n) { tile.canvas.width = n; tile.canvas.height = n; }
      tile.evicted = false;
      try {
        tile.ctx.clearRect(0, 0, n, n);
        if (ok) tile.ctx.drawImage(img, 0, 0, n, n);
      } catch { /* Kachel bleibt leer */ }
      tile.loading = false;
      tile.failedAt = undefined;
      this._flushPending(tile);
      rasterResources.touch(tile.res);
      onReady?.();
    };
    img.onload = () => done(true);
    img.onerror = () => fail();
    // Nicht ladbar ≠ leer: Kachel bleibt verdrängt (unbekannt), offene
    // Änderungen bleiben erhalten; nächster Bedarf versucht es erneut.
    const fail = () => { tile.loading = false; tile.failedAt = Date.now(); };
    resolveTileSrc(src).then((u) => { if (u) img.src = u; else fail(); }, fail);
  }

  /** Lädt eine verdrängte Kachel bei Bedarf nach (Cache-Miss ≠ transparent). */
  private _ensure(tile: RasterTile): boolean {
    if (tile.evicted && !tile.loading && tile.dataUrl && !(tile.failedAt && Date.now() - tile.failedAt < 5000)) this._loadInto(tile, tile.dataUrl, () => this.onTileReady?.());
    if (tile.loading || tile.evicted || tile.patternWait) return false;
    rasterResources.touch(tile.res);
    return true;
  }

  /** Ändert eine Kachel; bei ladender/verdrängter Kachel wird nach dem Laden angewendet. */
  private _mutate(tile: RasterTile, fn: (ctx: CanvasRenderingContext2D) => void) {
    this._materialize(tile);
    this._bump(this._key(tile.tx, tile.ty));
    if (tile.loading || tile.evicted || tile.patternWait) {
      (tile.pending ||= []).push(fn);
      tile.sid = null;
      this._ensure(tile);
      return;
    }
    tile.ctx.save(); fn(tile.ctx); tile.ctx.restore();
    tile.dataUrl = null; tile.sid = null;
    rasterResources.touch(tile.res);
  }

  /** Wendet `fn` in Ebenen-Pixelkoordinaten an; gröbere Kacheln werden passend skaliert. */
  private _scaled(tile: RasterTile, fn: (ctx: CanvasRenderingContext2D) => void) {
    return (ctx: CanvasRenderingContext2D) => {
      if (tile.s !== 1) { ctx.scale(tile.s, tile.s); ctx.imageSmoothingEnabled = true; }
      fn(ctx);
    };
  }

  /** Re-Render nach dem Nachladen verdrängter Kacheln. */
  onTileReady: (() => void) | null = null;

  /** Iteriert über alle Kacheln, die das Weltrechteck berühren. */
  private _forRect(
    x: number, y: number, w: number, h: number, create: boolean,
    cb: (tile: RasterTile, originX: number, originY: number) => void,
    scale = 1,
  ) {
    const tw = this.tileWorld;
    const tx0 = Math.floor(x / tw), tx1 = Math.floor((x + w) / tw);
    const ty0 = Math.floor(y / tw), ty1 = Math.floor((y + h) / tw);
    // Schutz gegen absurd große Bereiche (z. B. fehlerhafte Bounds). Beim
    // Einzeichnen ist das eine ausdrückliche Ablehnung – nie ein stiller
    // Teil-Erfolg. Große Pixelaktionen laufen kachelweise über `applyTiles`.
    const count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
    if (!Number.isFinite(count) || count > 4096) {
      if (create) throw new RasterRegionTooLargeError(count);
      return;
    }
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = this._tile(tx, ty, create, scale);
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
  blit(src: HTMLCanvasElement, x: number, y: number, w: number, h: number, countStroke = true, scale = 1) {
    if (countStroke) this.strokeCount += 1;
    const gx = Math.round(x * this.pxPerM);
    const gy = Math.round(y * this.pxPerM);
    this._forRect(x, y, w, h, true, (tile) => {
      const dx = gx - tile.tx * this.tilePx, dy = gy - tile.ty * this.tilePx;
      this._mutate(tile, this._scaled(tile, (ctx) => {
        ctx.globalCompositeOperation = "source-over";
        if (tile.s === 1) ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, dx, dy, src.width, src.height);
      }));
    }, scale);
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
    // Der weiche Rand wächst bis auf den dreifachen Werkzeugradius. Dadurch
    // unterscheidet sich 100 % Weichheit auch bei kleinen Radierern klar von
    // einer harten Kante.
    const outerR = mode === "smooth" ? r * (1 + 2 * soft) : r;
    this._ensureFillTiles(cx - outerR, cy - outerR, outerR * 2, outerR * 2);
    this._forRect(cx - outerR, cy - outerR, outerR * 2, outerR * 2, false, (tile, ox, oy) => {
      this._mutate(tile, this._scaled(tile, (ctx) => {
      const px = (cx - ox) * this.pxPerM;
      const py = (cy - oy) * this.pxPerM;
      const pr = outerR * this.pxPerM;
      ctx.globalCompositeOperation = "destination-out";
      if (mode === "smooth") {
        const inner = r * this.pxPerM * Math.pow(1 - soft, 2);
        const softAlpha = alpha * (1 - 0.65 * soft);
        const g = ctx.createRadialGradient(px, py, Math.max(0, inner), px, py, pr);
        g.addColorStop(0, `rgba(0,0,0,${softAlpha})`);
        g.addColorStop(0.2, `rgba(0,0,0,${softAlpha * (1 - 0.35 * soft)})`);
        g.addColorStop(0.5, `rgba(0,0,0,${softAlpha * (1 - 0.75 * soft) * 0.55})`);
        g.addColorStop(0.8, `rgba(0,0,0,${softAlpha * 0.08})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      }));
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
      if (!tile.maybeEmpty || tile.loading || tile.evicted) continue;
      tile.maybeEmpty = false;
      if (this._isTileEmpty(tile)) this._drop(key);
    }
  }

  /** Zeichnet den Rasterinhalt in den Viewport (Bildschirm-Canvas). */
  draw(ctx: CanvasRenderingContext2D, camera: Camera) {
    const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
    const sx = m && m.a ? Math.abs(m.a) : 1, sy = m && m.d ? Math.abs(m.d) : 1;
    const k = camera.scale || 1;
    const vw = ctx.canvas.width / sx, vh = ctx.canvas.height / sy;
    this.drawMapped(ctx, k, camera.offsetX, camera.offsetY, { x: -camera.offsetX / k, y: -camera.offsetY / k, w: vw / k, h: vh / k });
  }

  /**
   * Synchrones Zeichnen mit Abbildung ctx = Welt * k + off (Bildschirm,
   * CAD-Ausschnitt auf Exportseite). Lädt nur Kacheln im sichtbaren
   * Weltrechteck `view` (+1 Kachel Rand) nach.
   */
  drawMapped(ctx: CanvasRenderingContext2D, k: number, offX: number, offY: number, view: { x: number; y: number; w: number; h: number }) {
    this._drawFills(ctx, k, offX, offY, 0, 0);
    if (this.tiles.size === 0) return;
    const tw = this.tileWorld;
    const tx0 = Math.floor(view.x / tw) - 1, ty0 = Math.floor(view.y / tw) - 1;
    const tx1 = Math.floor((view.x + view.w) / tw) + 1, ty1 = Math.floor((view.y + view.h) / tw) + 1;
    ctx.save();
    // Beim Vergrößern über die gespeicherte Rasterauflösung hinaus würde die
    // Glättung nur verwaschen — ab ~1,5-facher Vergrößerung wird pixelgenau
    // gezeichnet. Die gespeicherte Qualität bleibt davon unberührt.
    const magnify = k / this.pxPerM;
    ctx.imageSmoothingEnabled = magnify <= 1.5;
    ctx.imageSmoothingQuality = "high";
    for (const tile of this.tiles.values()) {
      if (tile.tx < tx0 || tile.tx > tx1 || tile.ty < ty0 || tile.ty > ty1) continue;
      if (!this._ensure(tile)) continue;
      this._blitTile(ctx, tile, k, offX, offY);
    }
    ctx.restore();
  }

  /**
   * Kachel auf ganze Zielpixel gerundet zeichnen und um 1 px überlappen:
   * Die Glättung tastet am Kachelrand sonst Transparenz ab – sichtbare
   * Haarlinien an Kachel-/Materialisierungsgrenzen.
   */
  private _blitTile(ctx: CanvasRenderingContext2D, tile: RasterTile, k: number, offX: number, offY: number) {
    const tw = this.tileWorld;
    const x0 = Math.round(tile.tx * tw * k + offX), y0 = Math.round(tile.ty * tw * k + offY);
    const x1 = Math.round((tile.tx + 1) * tw * k + offX), y1 = Math.round((tile.ty + 1) * tw * k + offY);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const n = tile.canvas.width;
    if (n > 2 && w > 2) {
      // 1 Zielpixel Überlappung aus dem eigenen Inhalt (Rand um einen Quellpixel wiederholt).
      const e = n / w;
      ctx.drawImage(tile.canvas, 0, 0, n, n, x0, y0, w, h);
      ctx.drawImage(tile.canvas, n - e, 0, e, n, x1, y0, 1, h);
      ctx.drawImage(tile.canvas, 0, n - e, n, e, x0, y1, w, 1);
    } else ctx.drawImage(tile.canvas, x0, y0, w, h);
  }

  /**
   * Zeichnet kompakte Flächen direkt (nur sichtbarer Ausschnitt), ausgenommen
   * bereits materialisierte Kacheln – deren Inhalt kommt aus der Kachel.
   * Abbildung: Bildschirm = Welt * k + (offX, offY).
   */
  private _drawFills(ctx: CanvasRenderingContext2D, k: number, offX: number, offY: number, vw: number, vh: number): boolean {
    if (!this.fills.length) return true;
    const tw = this.tileWorld;
    const vx0 = -offX / k, vy0 = -offY / k, vx1 = (vw - offX) / k, vy1 = (vh - offY) / k;
    let ok = true;
    for (const f of this.fills) {
      if (vw > 0 && (f.bbox.x1 < vx0 || f.bbox.x0 > vx1 || f.bbox.y1 < vy0 || f.bbox.y0 > vy1)) continue;
      const st = fillState(f);
      if (st !== "ready") {
        ok = false; this._retryFills();
        // Platzhalter über die ganze Fläche (auch materialisierte Kacheln warten).
        paintPatternPlaceholder(ctx, f, st, k, offX, offY);
        continue;
      }
      ctx.save();
      if (f.mat.size) {
        // Deckende Flächen laufen 1 px unter materialisierte Kacheln (keine
        // Haarlinie); halbtransparente stoßen exakt an (keine doppelte Deckung).
        const inset = f.alpha >= 0.999 && !f.pattern ? 1 : 0;
        ctx.beginPath();
        ctx.rect(-1e7, -1e7, 2e7, 2e7);
        for (const key of f.mat) {
          const [tx, ty] = key.split(",").map(Number);
          const x0 = Math.round(tx * tw * k + offX), y0 = Math.round(ty * tw * k + offY);
          const x1 = Math.round((tx + 1) * tw * k + offX), y1 = Math.round((ty + 1) * tw * k + offY);
          ctx.rect(x0 + inset, y0 + inset, Math.max(0, x1 - x0 - 2 * inset), Math.max(0, y1 - y0 - 2 * inset));
        }
        ctx.clip("evenodd");
      }
      paintCompactFill(ctx, f, k, offX, offY);
      ctx.restore();
    }
    return ok;
  }

  private _fillRetry: ReturnType<typeof setTimeout> | null = null;
  private _retryFills() {
    if (this._fillRetry) return;
    this._fillRetry = setTimeout(() => { this._fillRetry = null; this.onTileReady?.(); }, 150);
  }

  /** Gibt alle Kacheln beim RAM-Budget frei. */
  releaseAll() { for (const k of [...this.tiles.keys()]) this._drop(k); }

  hasContent(): boolean {
    return this.tiles.size > 0 || this.fills.length > 0;
  }

  /** Prüft, ob an einem Weltpunkt deckende Pixel liegen (Boundary-Analyse). */
  /** null = Kachel noch nicht geladen (unbekannt, NICHT transparent). */
  isOpaqueAt(x: number, y: number, threshold = 24): boolean | null {
    const tw = this.tileWorld;
    const tile = this._tile(Math.floor(x / tw), Math.floor(y / tw), false);
    if (!tile) {
      const key = this._key(Math.floor(x / tw), Math.floor(y / tw));
      const hit = this.fills.filter((f) => !f.mat.has(key) && insideFill(f, x, y));
      if (hit.some((f) => f.alpha * 255 >= threshold)) return true;
      // Muster ohne deckende Grundfläche: Linienlage erst nach Laden bekannt.
      if (hit.some((f) => f.pattern && !fillReady(f))) return null;
      return false;
    }
    if (!this._ensure(tile)) return null;
    const n = this._px(tile);
    const px = Math.floor((x - Math.floor(x / tw) * tw) * this.pxPerM * tile.s);
    const py = Math.floor((y - Math.floor(y / tw) * tw) * this.pxPerM * tile.s);
    try {
      const d = tile.ctx.getImageData(Math.max(0, Math.min(n - 1, px)), Math.max(0, Math.min(n - 1, py)), 1, 1).data;
      return d[3] >= threshold;
    } catch {
      return false;
    }
  }

  /** Zeichnet den Rasterinhalt eines Weltrechtecks in ein Analyse-Canvas. */
  /** Liefert false, wenn Kacheln noch nachladen (Ergebnis unvollständig). */
  drawIntoMask(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pxPerM: number): boolean {
    const k = pxPerM / this.pxPerM;
    let complete = this._drawFills(ctx, pxPerM, -x * pxPerM, -y * pxPerM, Math.ceil(w * pxPerM), Math.ceil(h * pxPerM));
    this._forRect(x, y, w, h, false, (tile, ox, oy) => {
      if (!this._ensure(tile)) { complete = false; return; }
      ctx.drawImage(
        tile.canvas,
        (ox - x) * pxPerM, (oy - y) * pxPerM,
        this.tilePx * k, this.tilePx * k,
      );
    });
    return complete;
  }

  /**
   * Speicherschonende Persistenz:
   * - leere Kacheln werden verworfen UND aus dem Speicher entfernt (sparse),
   * - inhaltsgleiche Kacheln werden nur einmal als PNG abgelegt und sonst per
   *   `ref` referenziert (keine Bildduplikate).
   */
  serialize(store?: RasterTileStore): RasterLayerJSON | null {
    const tiles: RasterTileJSON[] = [];
    const seen = new Map<string, number>();
    const push = (tile: RasterTile, src: string) => {
      if (store) {
        // Verlauf: nur unveränderliche Kachel-Referenz, Bilddaten liegen einmal im Speicher.
        if (tile.sid == null || store.get(tile.sid) !== src) tile.sid = store.put(src);
        tiles.push({ tx: tile.tx, ty: tile.ty, ...(tile.s !== 1 ? { s: tile.s } : {}), src: RasterTileStore.ref(tile.sid) });
        return;
      }
      const sc = tile.s !== 1 ? { s: tile.s } : {};
      const hit = seen.get(src);
      if (hit !== undefined && (tiles[hit].s ?? 1) === tile.s) { tiles.push({ tx: tile.tx, ty: tile.ty, ...sc, ref: hit }); return; }
      seen.set(src, tiles.length);
      tiles.push({ tx: tile.tx, ty: tile.ty, ...sc, src });
    };
    for (const [key, tile] of [...this.tiles]) {
      if (tile.loading || tile.evicted) {
        if (tile.dataUrl) push(tile, tile.dataUrl);
        continue;
      }
      if (!tile.dataUrl) {
        if (this._isTileEmpty(tile)) { this._drop(key); continue; }
        tile.dataUrl = tile.canvas.toDataURL("image/png");
      }
      push(tile, tile.dataUrl);
    }
    if (tiles.length === 0 && !this.fills.length) return null;
    const out: RasterLayerJSON = { labelId: this.labelId, pxPerM: this.pxPerM, tilePx: this.tilePx, tiles, strokeCount: this.strokeCount };
    if (this.fills.length) out.fills = this.fills.map((f) => ({ id: f.id, rings: f.rings, rule: f.rule, color: f.color, alpha: f.alpha, mat: [...f.mat], ...(f.pattern ? { pattern: f.pattern } : {}) }));
    return out;
  }

  private _isTileEmpty(tile: RasterTile): boolean {
    if (tile.evicted || tile.loading) return false;
    try {
      const n = this._px(tile);
      const data = tile.ctx.getImageData(0, 0, n, n).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 2) return false;
      return true;
    } catch {
      return false;
    }
  }


  /** true, wenn die Kachel noch aus dem gespeicherten Stand nachlädt. */
  isTileLoading(tx: number, ty: number): boolean {
    const t = this.tiles.get(this._key(tx, ty));
    if (!t) return false;
    this._ensure(t); // verdrängte Kachel nachladen, sonst wartet der Aufrufer ewig
    return t.loading || !!t.evicted;
  }

  /**
   * Zeichnet fertig gerenderte Kachelinhalte (exakt kachelgroß, Kachelursprung)
   * in einem synchronen Schritt ein. Zählt NICHT als Strich – die Objektzählung
   * erfolgt einmal je Benutzeraktion über `noteStroke()`.
   */
  applyTiles(entries: { tx: number; ty: number; image: CanvasImageSource; s?: number }[]) {
    for (const e of entries) {
      // Neue Kachel übernimmt die Auflösung des Ergebnisses; bestehende Kacheln
      // behalten ihre eigene (Inhalt wird nie umgerechnet).
      let tile = this._tile(e.tx, e.ty, true, e.s ?? 1)!;
      // Feinerer Inhalt auf grober Kachel: Kachel auf die feinere Stufe heben
      // (vorhandener Inhalt wird nur vergrößert übernommen, nie vergröbert).
      if ((e.s ?? 1) > tile.s) tile = this._upgrade(tile, normTileScale(e.s));
      const n = this._px(tile);
      this._mutate(tile, (ctx) => {
        ctx.globalCompositeOperation = "source-over";
        ctx.imageSmoothingEnabled = (e.s ?? 1) !== tile.s;
        ctx.drawImage(e.image, 0, 0, n, n);
      });
    }
  }

  /** Hebt eine residente Kachel auf eine feinere Auflösungsstufe. */
  private _upgrade(tile: RasterTile, s: number): RasterTile {
    if (tile.loading || tile.evicted || s <= tile.s) return tile;
    const key = this._key(tile.tx, tile.ty);
    const old = tile.canvas;
    const oldMat = this.fills.filter((f) => f.mat.has(key));
    this._drop(key);
    for (const f of oldMat) f.mat.add(key);
    const nt = this._tile(tile.tx, tile.ty, true, s)!;
    const n = this._px(nt);
    nt.ctx.imageSmoothingEnabled = true;
    nt.ctx.drawImage(old, 0, 0, n, n);
    old.width = 0; old.height = 0;
    this._bump(key);
    return nt;
  }

  /**
   * Bereitet eine Kachel für den speicherschonenden Jobabschluss vor: setzt
   * vorhandenen Inhalt + noch nicht materialisierte Flächen + neues Ergebnis
   * zu EINEM kodierten Blob zusammen (nur diese eine Kachel im RAM). Ohne
   * bestehenden Inhalt wird das Ergebnis unverändert übernommen.
   */
  async composeForCommit(tx: number, ty: number, blob: Blob, s: number): Promise<{ blob: Blob; s: number; version: number; fillsVersion: number }> {
    const key = this._key(tx, ty);
    const version = this.tileVersion(tx, ty), fillsVersion = this.fillsVersion;
    const tile = this.tiles.get(key);
    const tw = this.tileWorld, ox = tx * tw, oy = ty * tw;
    const fills = this.fills.filter((f) => !f.mat.has(key) && fillHitsRect(f, ox, oy, ox + tw, oy + tw));
    if (!tile && !fills.length) return { blob, s, version, fillsVersion };
    const sc = Math.max(s, tile?.s ?? 0, fills.length ? 1 : 0);
    const n = Math.max(1, Math.round(this.tilePx * sc));
    const { canvas, ctx } = makeTileCanvas(n);
    const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    try {
      if (tile) {
        if (!tile.loading && !tile.evicted) ctx.drawImage(tile.canvas, 0, 0, n, n);
        else if (tile.dataUrl) {
          const u = await resolveTileSrc(tile.dataUrl);
          if (!u) throw new Error("Kachel nicht verfügbar");
          ctx.drawImage(await loadImg(u), 0, 0, n, n);
        }
        else throw new Error("Kachel nicht verfügbar");
      }
      for (const until = Date.now() + 15000; !fills.every(fillReady);) {
        if (Date.now() > until) throw new Error("Musterbild nicht verfügbar");
        await new Promise((r) => setTimeout(r, 50));
      }
      for (const f of fills) this._paintFill(ctx, f, ox, oy, this.pxPerM * sc);
      const url = URL.createObjectURL(blob);
      try { ctx.drawImage(await loadImg(url), 0, 0, n, n); } finally { URL.revokeObjectURL(url); }
      const out: Blob = await new Promise((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error("PNG-Kodierung fehlgeschlagen"))), "image/png"));
      return { blob: out, s: sc, version, fillsVersion };
    } finally { canvas.width = 0; canvas.height = 0; }
  }

  /** true, wenn eine vorbereitete Kachel noch zum aktuellen Stand passt. */
  isCommitFresh(tx: number, ty: number, version: number, fillsVersion: number): boolean {
    return this.tileVersion(tx, ty) === version && this.fillsVersion === fillsVersion;
  }

  /**
   * Übernimmt vorbereitete Kacheln synchron und ohne Dekodierung: jede Kachel
   * wird zur verdrängten Kachel mit kodierter Quelle (lädt erst bei Bedarf).
   */
  replaceTilesLazy(entries: { tx: number; ty: number; blob: Blob; s: number }[]) {
    for (const e of entries) {
      const key = this._key(e.tx, e.ty);
      this._drop(key);
      const t = this._tile(e.tx, e.ty, true, e.s)!;
      t.canvas.width = 0; t.canvas.height = 0;
      t.evicted = true;
      t.dataUrl = URL.createObjectURL(e.blob);
      t.sid = null;
      rasterResources.release(t.res);
      // Der Blob enthält bereits alle Flächen dieser Kachel.
      const tw = this.tileWorld, ox = e.tx * tw, oy = e.ty * tw;
      for (const f of this.fills) if (fillHitsRect(f, ox, oy, ox + tw, oy + tw)) f.mat.add(key);
      this._bump(key);
    }
  }

  /** Eine abgeschlossene Zeichenaktion = genau ein gezählter Rasterstrich. */
  noteStroke() { this.strokeCount += 1; }

  /**
   * Übernimmt Kacheln aus JSON nur als REFERENZ: keine Dekodierung beim
   * Öffnen. Jede Kachel gilt als verdrängt (= unbekannt, nie leer) und wird
   * erst geladen, wenn sie gezeichnet, bearbeitet oder ausgegeben wird.
   */
  restore(json: RasterLayerJSON, onReady?: () => void, store?: RasterTileStore) {
    this.strokeCount = Math.max(0, json.strokeCount ?? (json.tiles?.length ? 1 : 0));
    // Flächen zuerst (ohne Materialisierung – `mat` stammt aus dem Stand).
    this._materializing = true;
    try { for (const f of json.fills ?? []) this.addFill(f); } finally { this._materializing = false; }
    if (onReady) this.onTileReady = onReady;
    const list = json.tiles || [];
    for (const t of list) {
      // `ref` verweist auf eine inhaltsgleiche Kachel (Dedupe beim Speichern).
      const raw = t.src ?? (typeof t.ref === "number" ? list[t.ref]?.src : undefined);
      const sid = RasterTileStore.parse(raw);
      const src = sid != null ? store?.get(sid) : raw;
      if (!src) continue;
      const tile = this._tile(t.tx, t.ty, true, t.s ?? (typeof t.ref === "number" ? list[t.ref]?.s : undefined) ?? 1)!;
      tile.dataUrl = src;
      tile.sid = sid;
      tile.canvas.width = 0; tile.canvas.height = 0;
      tile.evicted = true;
      rasterResources.release(tile.res);
    }
  }

  /** true, solange eine angeforderte Kachel dieser Ebene noch lädt. */
  isLoading(): boolean {
    for (const t of this.tiles.values()) if (t.loading) return true;
    return false;
  }

  /**
   * Portionsweise Ausgabe eines Weltrechtecks (PDF, Vorschau, Analyse):
   * Kacheln werden in Gruppen innerhalb des halben RAM-Budgets geladen,
   * gezeichnet und danach wieder verdrängbar gemacht. Nie das ganze Projekt
   * dekodiert. false = Kachel nicht ladbar (Ergebnis unvollständig).
   */
  async drawRegionAsync(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, k: number, offX: number, offY: number): Promise<boolean> {
    const vw = Math.ceil(ctx.canvas.width), vh = Math.ceil(ctx.canvas.height);
    // Benötigte Muster fehlen → Abbruch statt unvollständiger Ausgabe.
    const needed = this.fills.filter((f) => f.pattern && f.bbox.x1 >= rect.x && f.bbox.x0 <= rect.x + rect.w && f.bbox.y1 >= rect.y && f.bbox.y0 <= rect.y + rect.h);
    for (const until = Date.now() + 15000; !needed.every(fillReady);) {
      if (Date.now() > until || needed.some((f) => fillState(f) === "failed")) throw new Error("PIXUNA_PATTERN_MISSING");
      await new Promise((r) => setTimeout(r, 50));
    }
    this._drawFills(ctx, k, offX, offY, vw, vh);
    const tw = this.tileWorld;
    const inRect = [...this.tiles.values()].filter((t) => {
      const x0 = t.tx * tw, y0 = t.ty * tw;
      return x0 + tw > rect.x && x0 < rect.x + rect.w && y0 + tw > rect.y && y0 < rect.y + rect.h;
    });
    const perBatch = Math.max(1, Math.floor(rasterResources.budget / 2 / Math.max(1, this.tilePx * this.tilePx * 4)));
    let ok = true;
    for (let i = 0; i < inRect.length; i += perBatch) {
      const batch = inRect.slice(i, i + perBatch);
      for (const t of batch) this._ensure(t);
      const until = Date.now() + 15000;
      while (batch.some((t) => t.loading || t.patternWait)) {
        if (Date.now() > until) {
          if (batch.some((t) => t.patternWait)) throw new Error("PIXUNA_PATTERN_MISSING");
          return false;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      for (const t of batch) {
        if (!this._ensure(t)) { ok = false; continue; }
        this._blitTile(ctx, t, k, offX, offY);
      }
      rasterResources.trim();
    }
    return ok;
  }

  /**
   * Weltrechteck, das allen belegten Kacheln dieser Ebene umschließt.
   * Kachelgenau (nicht pixelgenau) — reicht für die Boundary-Analyse.
   */
  contentBoundsWorld(): { x: number; y: number; w: number; h: number } | null {
    let fb: { x: number; y: number; w: number; h: number } | null = null;
    for (const f of this.fills) {
      const b = { x: f.bbox.x0, y: f.bbox.y0, w: f.bbox.x1 - f.bbox.x0, h: f.bbox.y1 - f.bbox.y0 };
      fb = !fb ? b : (() => { const x = Math.min(fb!.x, b.x), y = Math.min(fb!.y, b.y); return { x, y, w: Math.max(fb!.x + fb!.w, b.x + b.w) - x, h: Math.max(fb!.y + fb!.h, b.y + b.h) - y }; })();
    }
    if (this.tiles.size === 0) return fb;
    const tw = this.tileWorld;
    let minTx = Infinity, minTy = Infinity, maxTx = -Infinity, maxTy = -Infinity;
    for (const t of this.tiles.values()) {
      if (t.tx < minTx) minTx = t.tx;
      if (t.ty < minTy) minTy = t.ty;
      if (t.tx > maxTx) maxTx = t.tx;
      if (t.ty > maxTy) maxTy = t.ty;
    }
    if (!Number.isFinite(minTx)) return fb;
    const tb = { x: minTx * tw, y: minTy * tw, w: (maxTx - minTx + 1) * tw, h: (maxTy - minTy + 1) * tw };
    if (!fb) return tb;
    const x = Math.min(fb.x, tb.x), y = Math.min(fb.y, tb.y);
    return { x, y, w: Math.max(fb.x + fb.w, tb.x + tb.w) - x, h: Math.max(fb.y + fb.h, tb.y + tb.h) - y };
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
      l.onTileReady = () => this.onReady?.();
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
    for (const l of this.layers.values()) l.releaseAll();
    this.layers.clear();
  }

  serialize(store?: RasterTileStore): RasterLayerJSON[] {
    const out: RasterLayerJSON[] = [];
    for (const layer of this.layers.values()) {
      const json = layer.serialize(store);
      if (json) out.push(json);
    }
    // Nach dem Kodieren sind geänderte Kacheln wieder sauber → verdrängbar.
    rasterResources.trim();
    return out;
  }

  restore(data: RasterLayerJSON[] | null | undefined, store?: RasterTileStore) {
    this.clear();
    if (!Array.isArray(data)) return;
    for (const json of data) {
      if (!json?.labelId) continue;
      const layer = new RasterLayer(json.labelId, json.pxPerM || this.pxPerM, json.tilePx || RASTER_TILE_PX);
      layer.onTileReady = () => this.onReady?.();
      layer.restore(json, () => this.onReady?.(), store);
      this.layers.set(json.labelId, layer);
    }
  }

  /** true, solange irgendeine angeforderte Kachel noch lädt. */
  isLoading(): boolean {
    for (const l of this.layers.values()) if (l.isLoading()) return true;
    return false;
  }

  /** Wartet, bis alle bereits ANGEFORDERTEN Kacheln geladen sind (lädt nichts zusätzlich). */
  async whenIdle(timeoutMs = 15000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (this.isLoading()) {
      if (Date.now() > until) return false;
      await new Promise((r) => setTimeout(r, 40));
    }
    return true;
  }

  /**
   * Zeichnet ein Weltrechteck aller (gefilterten) Ebenen portionsweise in
   * `ctx` (Abbildung Bildschirm = Welt * k + off). Siehe `RasterLayer.drawRegionAsync`.
   */
  async drawRegionAsync(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, k: number, offX: number, offY: number, filter?: (labelId: string) => boolean, order?: string[]): Promise<boolean> {
    let ok = true;
    // `order` wie LabelManager.list(): Index 0 = vorne → von hinten nach vorne zeichnen.
    const ids = order ? order.filter((id) => this.layers.has(id)).reverse() : [...this.layers.keys()];
    for (const id of ids) {
      if (filter && !filter(id)) continue;
      if (!(await this.layers.get(id)!.drawRegionAsync(ctx, rect, k, offX, offY))) ok = false;
    }
    return ok;
  }

  /** Alle Ebenen-IDs mit Rasterinhalt (für die Boundary-Analyse). */
  labelIds(): string[] {
    return [...this.layers.keys()];
  }
}

/**
 * Gemeinsamer, unveränderlicher Kachelspeicher für den Verlauf: jede
 * kodierte Kachelversion liegt genau einmal im Speicher; Verlaufsstände
 * enthalten nur "rtile:<id>"-Referenzen. Spätere Striche erzeugen neue
 * Versionen und überschreiben nie alte Undo-Stände.
 */
export class RasterTileStore {
  private map = new Map<number, string>();
  private next = 1;
  static PREFIX = "rtile:";
  static ref(id: number) { return RasterTileStore.PREFIX + id; }
  static parse(src: string | undefined | null): number | null {
    if (typeof src !== "string" || !src.startsWith(RasterTileStore.PREFIX)) return null;
    const n = Number(src.slice(RasterTileStore.PREFIX.length));
    return Number.isFinite(n) ? n : null;
  }
  put(dataUrl: string): number { const id = this.next++; this.map.set(id, dataUrl); return id; }
  get(id: number): string | undefined { return this.map.get(id); }
  get size() { return this.map.size; }
  /** Gibt alle Versionen frei, die in keinem der Stände mehr vorkommen. */
  prune(snapshots: string[]) {
    const used = new Set<number>();
    const re = /"rtile:(\d+)"/g;
    for (const s of snapshots) { let m: RegExpExecArray | null; while ((m = re.exec(s))) used.add(Number(m[1])); }
    for (const id of [...this.map.keys()]) if (!used.has(id)) this.map.delete(id);
  }
}
