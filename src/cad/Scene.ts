import { Defaults } from "./constants";
import { Vec2, v, clamp, lerp } from "./geometry";
import { WallTopologyGraph } from "./WallTopologyGraph";
import { offsetPolyline } from "./wallGeom";

export class Segment {
  id: string;
  a: Vec2;
  b: Vec2;
  color: string;
  thicknessM: number;
  labelId: string;
  /** Wenn true: Hilfslinie — wird hellblau gestrichelt im Hintergrund gezeichnet
   *  und vom Druck/Export ausgeschlossen. */
  isGuide: boolean;
  /** Wenn true: Mittelpunkt der Linie wird als zusätzlicher Snap-Punkt
   *  angeboten (für Halbierungs-Orientierung). */
  midpointSnap?: boolean;
  /** Wenn ≥ 2: erzeugt N-1 äquidistante Snap-Punkte auf der Linie,
   *  die sie in N gleiche Abschnitte teilen. */
  divisionSnap?: number;
  /** Pfeilspitze am Anfangs-/Endpunkt. */
  arrowStart?: boolean;
  arrowEnd?: boolean;
  /** Skalierungsfaktor der Pfeilspitze (Multiplikator auf Linienstärke). Default 1. */
  arrowScale?: number;
  /** Wenn gesetzt: dieses Objekt gehört zum Edit-Mode der Sticker-Instanz mit dieser ID. */
  _stickerEditOwnerId?: string | null;

  constructor({ id, a, b, color, thicknessM, labelId, isGuide, midpointSnap, divisionSnap, arrowStart, arrowEnd, arrowScale }: { id: string; a: Vec2; b: Vec2; color?: string; thicknessM?: number; labelId?: string; isGuide?: boolean; midpointSnap?: boolean; divisionSnap?: number; arrowStart?: boolean; arrowEnd?: boolean; arrowScale?: number }) {
    this.id = id;
    this.a = v(a.x, a.y);
    this.b = v(b.x, b.y);
    this.color = color || Defaults.lineColor;
    this.thicknessM = (typeof thicknessM === "number" && thicknessM > 0) ? thicknessM : Defaults.lineThicknessM;
    this.labelId = labelId || Defaults.defaultLabelId;
    this.isGuide = !!isGuide;
    this.midpointSnap = !!midpointSnap;
    this.divisionSnap = (typeof divisionSnap === "number" && divisionSnap >= 2) ? Math.floor(divisionSnap) : undefined;
    this.arrowStart = !!arrowStart;
    this.arrowEnd = !!arrowEnd;
    this.arrowScale = (typeof arrowScale === "number" && arrowScale > 0) ? arrowScale : 1;
    this._stickerEditOwnerId = null;
  }
}



export interface AreaLabel {
  show: boolean;
  textColor: string;
  fontSizePx: number;
  bgColor: string;
  bgAlphaPct: number;
  offsetX: number;
  offsetY: number;
  borderEnabled: boolean;
  borderColor: string;
  borderWidthPx: number;
  /** Rotation der m²-Box um ihr Zentrum (Bogenmaß). */
  rotationRad: number;
  /** Uniforme Skalierung der Box (Font + Padding × scale). Default 1. */
  scale: number;
}

export class Hatch {
  id: string;
  points: Vec2[];
  /** Carved-out inner loops (holes). Each loop is a closed polygon. */
  holes: Vec2[][];
  fillColor: string;
  strokeColor: string;
  fillAlphaPct: number;
  strokeWidthPx: number;
  labelId: string;
  areaLabel: AreaLabel;
  _stickerEditOwnerId?: string | null;

  constructor({ id, points, holes, fillColor, strokeColor, fillAlphaPct, strokeWidthPx, labelId, areaLabel }: {
    id: string; points: Vec2[]; holes?: Vec2[][]; fillColor?: string; strokeColor?: string;
    fillAlphaPct?: number; strokeWidthPx?: number; labelId?: string; areaLabel?: Partial<AreaLabel>;
  }) {
    this.id = id;
    this.points = points.map(p => v(p.x, p.y));
    this.holes = (holes || []).map(loop => loop.map(p => v(p.x, p.y)));
    this.fillColor = fillColor || Defaults.hatchFillColor;
    this.strokeColor = strokeColor || Defaults.hatchStrokeColor;
    this.fillAlphaPct = clamp(fillAlphaPct ?? Defaults.hatchFillAlphaPct, 0, 100);
    this.strokeWidthPx = (typeof strokeWidthPx === "number" && strokeWidthPx >= 0) ? strokeWidthPx : Defaults.hatchStrokePx;
    this.labelId = labelId || Defaults.defaultLabelId;
    this.areaLabel = {
      show: !!(areaLabel?.show ?? Defaults.areaShow),
      textColor: areaLabel?.textColor || Defaults.areaTextColor,
      fontSizePx: clamp(areaLabel?.fontSizePx ?? Defaults.areaFontSizePx, 6, 72),
      bgColor: areaLabel?.bgColor || Defaults.areaBgColor,
      bgAlphaPct: clamp(areaLabel?.bgAlphaPct ?? Defaults.areaBgAlphaPct, 0, 100),
      offsetX: Number.isFinite(areaLabel?.offsetX) ? areaLabel!.offsetX! : 0,
      offsetY: Number.isFinite(areaLabel?.offsetY) ? areaLabel!.offsetY! : 0,
      borderEnabled: !!(areaLabel?.borderEnabled ?? Defaults.areaBorderEnabled),
      borderColor: areaLabel?.borderColor || Defaults.areaBorderColor,
      borderWidthPx: clamp(areaLabel?.borderWidthPx ?? Defaults.areaBorderWidthPx, 0, 20),
      rotationRad: Number.isFinite(areaLabel?.rotationRad) ? areaLabel!.rotationRad! : 0,
      scale: Number.isFinite(areaLabel?.scale) ? clamp(areaLabel!.scale!, 0.1, 20) : 1,
    };
    this._stickerEditOwnerId = null;
  }
}

export interface DimensionStyle {
  textColor?: string;
  textSizePx?: number;
  lineColor?: string;
  decimals?: number;
  tickLengthM?: number;
  showExtensions?: boolean;
  useFreeText?: boolean;
  freeText?: string;
  textBgEnabled?: boolean;
  textBgColor?: string;
  textBgAlpha?: number;
  /** Verlängerungslinien-Stil. */
  extensionStyle?: "dashed" | "solid";
  extensionColor?: string;
  extensionAlpha?: number;
  /** Freier-Text Styling. */
  freeTextBold?: boolean;
  freeTextItalic?: boolean;
  freeTextColor?: string;
  /** Anzeige der Einheit hinter der Maßzahl (z. B. "2,45 m"). */
  showUnit?: boolean;
  /** Einheit für die Anzeige der Maßzahl (intern bleiben die Werte in m). */
  unit?: "mm" | "cm" | "m";
  labelId?: string;
}

export class Dimension {
  id: string;
  p1: Vec2;
  p2: Vec2;
  placementPoint: Vec2;
  mode: "parallel" | "diagonal";
  refDir: Vec2 | null;

  textColor: string;
  textSizePx: number;
  lineColor: string;
  decimals: number;
  tickLengthM: number;
  showExtensions: boolean;

  useFreeText: boolean;
  freeText: string;

  textBgEnabled: boolean;
  textBgColor: string;
  textBgAlpha: number;

  extensionStyle: "dashed" | "solid";
  extensionColor: string;
  extensionAlpha: number;

  freeTextBold: boolean;
  freeTextItalic: boolean;
  freeTextColor: string;

  showUnit: boolean;
  unit: "mm" | "cm" | "m";

  labelId: string;
  /** Optional: Referenz auf eine Tür/ein Fenster, wenn das Maß die Öffnungsbreite misst.
   *  Wenn gesetzt, wird unterhalb der Maßlinie die Höhe und die Brüstungshöhe (BRH) ergänzt. */
  doorRefId: string | null;
  _stickerEditOwnerId?: string | null;

  constructor({ id, p1, p2, placementPoint, mode, refDir, style, labelId, doorRefId }: {
    id: string; p1: Vec2; p2: Vec2; placementPoint: Vec2;
    mode?: "parallel" | "diagonal"; refDir?: Vec2 | null; style?: DimensionStyle; labelId?: string;
    doorRefId?: string | null;
  }) {
    this.id = id;
    this.p1 = v(p1.x, p1.y);
    this.p2 = v(p2.x, p2.y);
    this.placementPoint = v(placementPoint.x, placementPoint.y);
    this.mode = mode || (Defaults.measureOrientation as "parallel" | "diagonal");
    this.refDir = refDir ? v(refDir.x, refDir.y) : null;

    const s = style || {};
    this.textColor = s.textColor || Defaults.measureTextColor;
    this.textSizePx = (typeof s.textSizePx === "number" && s.textSizePx > 0) ? s.textSizePx : Defaults.measureTextSizePx;
    this.lineColor = s.lineColor || Defaults.measureLineColor;
    this.decimals = Number.isInteger(s.decimals) ? s.decimals! : Defaults.measureDecimals;
    this.tickLengthM = (typeof s.tickLengthM === "number" && s.tickLengthM > 0) ? s.tickLengthM : Defaults.measureTickLengthM;
    this.showExtensions = (typeof s.showExtensions === "boolean") ? s.showExtensions : Defaults.measureShowExtensions;
    this.useFreeText = (typeof s.useFreeText === "boolean") ? s.useFreeText : Defaults.measureUseFreeText;
    this.freeText = (typeof s.freeText === "string") ? s.freeText : Defaults.measureFreeText;
    this.textBgEnabled = (typeof s.textBgEnabled === "boolean") ? s.textBgEnabled : Defaults.measureTextBgEnabled;
    this.textBgColor = s.textBgColor || Defaults.measureTextBgColor;
    this.textBgAlpha = (typeof s.textBgAlpha === "number") ? clamp(s.textBgAlpha, 0, 1) : Defaults.measureTextBgAlpha;
    this.extensionStyle = (s.extensionStyle === "solid" || s.extensionStyle === "dashed") ? s.extensionStyle : Defaults.measureExtensionStyle;
    this.extensionColor = s.extensionColor || Defaults.measureExtensionColor;
    this.extensionAlpha = (typeof s.extensionAlpha === "number") ? clamp(s.extensionAlpha, 0, 1) : Defaults.measureExtensionAlpha;
    this.freeTextBold = !!(s.freeTextBold ?? Defaults.measureFreeTextBold);
    this.freeTextItalic = !!(s.freeTextItalic ?? Defaults.measureFreeTextItalic);
    this.freeTextColor = s.freeTextColor || Defaults.measureFreeTextColor;
    this.freeTextColor = s.freeTextColor || Defaults.measureFreeTextColor;
    this.showUnit = (typeof s.showUnit === "boolean") ? s.showUnit : Defaults.measureShowUnit;
    this.unit = (s.unit === "mm" || s.unit === "cm" || s.unit === "m") ? s.unit : Defaults.measureUnit;
    this.labelId = labelId || s.labelId || Defaults.defaultLabelId;
    this.doorRefId = doorRefId || null;
    this._stickerEditOwnerId = null;
  }
}


export interface TextBoxStyle {
  textColor?: string;
  fontSizePx?: number;
  bgColor?: string;
  bgAlphaPct?: number;
  wrap?: boolean;
  align?: "left" | "center" | "right";
  borderEnabled?: boolean;
  borderColor?: string;
  borderWidthPx?: number;
  /** Wenn false: Box wächst NICHT automatisch; Text wird im fixen Rahmen umbrochen. */
  autoSize?: boolean;
  labelId?: string;
}

export class TextBox {
  id: string;
  center: Vec2;
  widthM: number;
  heightM: number;
  rotationRad: number;
  html: string;
  style: Required<Omit<TextBoxStyle, "labelId">>;
  labelId: string;
  _stickerEditOwnerId?: string | null;

  constructor({ id, center, widthM, heightM, rotationRad, html, style, labelId }: {
    id: string; center: Vec2; widthM: number; heightM: number;
    rotationRad?: number; html?: string; style?: TextBoxStyle; labelId?: string;
  }) {
    this.id = id;
    this.center = v(center.x, center.y);
    this.widthM = Math.max(Defaults.textMinBoxSizeM, widthM);
    this.heightM = Math.max(Defaults.textMinBoxSizeM, heightM);
    this.rotationRad = rotationRad || 0;
    this.html = html || "";
    const s = style || {};
    this.style = {
      textColor: s.textColor || Defaults.textColor,
      fontSizePx: clamp(s.fontSizePx ?? Defaults.textFontSizePx, 6, 200),
      bgColor: s.bgColor || Defaults.textBgColor,
      bgAlphaPct: clamp(s.bgAlphaPct ?? Defaults.textBgAlphaPct, 0, 100),
      wrap: (typeof s.wrap === "boolean") ? s.wrap : Defaults.textWrap,
      align: s.align || Defaults.textAlign,
      borderEnabled: (typeof s.borderEnabled === "boolean") ? s.borderEnabled : Defaults.textBorderEnabled,
      borderColor: s.borderColor || Defaults.textBorderColor,
      borderWidthPx: clamp(s.borderWidthPx ?? Defaults.textBorderWidthPx, 0, 30),
      autoSize: (typeof s.autoSize === "boolean") ? s.autoSize : true,
    } as any;
    this.labelId = labelId || s.labelId || Defaults.defaultLabelId;
    this._stickerEditOwnerId = null;
  }
}

export interface StickerInstanceItem {
  // Lokale Snapshot-Items (relativ zu (0,0)). Strukturell identisch zu ClipboardItem.
  // Wir lassen das absichtlich "any" um keine Zirkulärimporte zu erzeugen.
  [key: string]: any;
}

export class StickerInstance {
  id: string;
  defId: string | null; // optional: Referenz auf Bibliotheks-Definition
  name: string;
  items: StickerInstanceItem[]; // lokale Geometrie (Kopie)
  position: Vec2;
  rotationRad: number;
  scale: number;
  labelId: string;

  constructor({ id, defId, name, items, position, rotationRad, scale, labelId }: {
    id: string; defId?: string | null; name?: string;
    items: StickerInstanceItem[];
    position: Vec2; rotationRad?: number; scale?: number; labelId?: string;
  }) {
    this.id = id;
    this.defId = defId || null;
    this.name = name || "Sticker";
    this.items = items;
    this.position = v(position.x, position.y);
    this.rotationRad = rotationRad || 0;
    this.scale = (typeof scale === "number" && scale > 0) ? scale : 1;
    this.labelId = labelId || Defaults.defaultLabelId;
  }
}

export class DocumentObject {
  id: string;
  name: string;
  /** "image" (jpg/png) oder "pdf-page" (gerendertes PDF). */
  kind: "image" | "pdf-page";
  /** Base64 DataURL des gerenderten Bildes (PNG für PDF, original für JPG/PNG). */
  src: string;
  /** Bei PDFs: Seitenindex (0-basiert). */
  pageIndex: number;
  /** Welt-Position der oberen-linken Ecke (vor Rotation). */
  position: Vec2;
  /** Welt-Breite/-Höhe in Metern. */
  widthM: number;
  heightM: number;
  /** Rotation um die Mitte, in Radiant. */
  rotationRad: number;
  /** Original-Pixelgröße. */
  pixelWidth: number;
  pixelHeight: number;
  labelId: string;
  /** Beim Import gewählter Plan-Maßstab (Nenner). z. B. 100 für 1:100. Kann nachträglich geändert werden. */
  importScaleDenom: number;
  /**
   * Persistente Pixelmaske (Alpha) für den Radiergummi.
   * Als PNG-DataURL serialisiert. null = keine Radierung.
   * Wird in Renderer/Eraser lazy in HTMLCanvasElement umgewandelt.
   */
  eraseMaskDataUrl: string | null;
  /** Runtime-Cache (NICHT serialisiert): Maske als Canvas. */
  _eraseMask?: HTMLCanvasElement | null;
  /** Runtime-Flag: Maske wurde verändert → Composite-Cache invalidieren + DataUrl neu exportieren. */
  _eraseMaskDirty?: boolean;
  /** Bei kind === "pdf-page": Original-PDF-Bytes als Base64 (für Vektor-Re-Render & Auflösen). */
  pdfSourceB64?: string | null;
  /** Welche Kanten als unendliche Hilfslinien sichtbar sind (Toggle per Klick). */
  guideEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  /** Kanten-Crop in Metern (positiv = Kante nach innen geschoben, Inhalt wird abgeschnitten). */
  cropM: { top: number; right: number; bottom: number; left: number };
  /** Anzeigeopazität (0..1). Default 1. */
  opacity: number;
  /** Benutzerdefinierte Filter. "Original" ist immer aktiv, wenn activeFilterId === null. */
  filters: import("./documentFilters").DocumentFilter[];
  /** Aktiver Filter (id) oder null = Original. */
  activeFilterId: string | null;
  /** Hintergrund-Ausschnitt-Einstellungen (Magic-Wand + Pinsel + FG/BG-Einfärbung). */
  bgRemoval?: import("./documentBgRemove").BgRemoval;
  /** Runtime-Cache: FG-Maske als Canvas (weiß = Vordergrund). Nicht serialisiert. */
  _bgFgMask?: HTMLCanvasElement | null;
  /** Runtime-Revision (Cache-Invalidierung). */
  _bgMaskRev?: number;
  /** Runtime-Flag: Dokument existiert nur als Snap-/Hub-Quelle (z. B. Projektmappen-PDF),
   *  Bild wird NICHT gezeichnet, Serialisierung überspringt es. Nicht persistiert. */
  _snapOnly?: boolean;
  /** Benutzerdefinierte Fangpunkte in Dokument-lokalen UV-Koordinaten (0..1
   *  relativ zu widthM/heightM). Werden über alle Werkzeuge fangbar; per
   *  Anker-Werkzeug am Dokument platziert. */
  anchors: { x: number; y: number }[];


  constructor({ id, name, kind, src, pageIndex, position, widthM, heightM, rotationRad, pixelWidth, pixelHeight, labelId, importScaleDenom, eraseMaskDataUrl, pdfSourceB64, guideEdges, cropM, opacity, filters, activeFilterId, bgRemoval, anchors }: {
    id: string; name?: string; kind?: "image" | "pdf-page"; src: string;
    pageIndex?: number; position: Vec2; widthM: number; heightM: number;
    rotationRad?: number; pixelWidth?: number; pixelHeight?: number; labelId?: string;
    importScaleDenom?: number; eraseMaskDataUrl?: string | null;
    pdfSourceB64?: string | null;
    guideEdges?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };
    cropM?: { top?: number; right?: number; bottom?: number; left?: number };
    opacity?: number;
    filters?: import("./documentFilters").DocumentFilter[];
    activeFilterId?: string | null;
    bgRemoval?: import("./documentBgRemove").BgRemoval;
    anchors?: { x: number; y: number }[];
  }) {
    this.id = id;
    this.name = name || "Dokument";
    this.kind = kind || "image";
    this.src = src;
    this.pageIndex = pageIndex || 0;
    this.position = v(position.x, position.y);
    this.widthM = Math.max(0.001, widthM);
    this.heightM = Math.max(0.001, heightM);
    this.rotationRad = rotationRad || 0;
    this.pixelWidth = pixelWidth || 0;
    this.pixelHeight = pixelHeight || 0;
    this.labelId = labelId || Defaults.defaultLabelId;
    this.importScaleDenom = (typeof importScaleDenom === "number" && importScaleDenom > 0) ? importScaleDenom : 100;
    this.eraseMaskDataUrl = eraseMaskDataUrl || null;
    this._eraseMask = null;
    this._eraseMaskDirty = false;
    this.pdfSourceB64 = pdfSourceB64 || null;
    this.guideEdges = {
      top: !!guideEdges?.top,
      right: !!guideEdges?.right,
      bottom: !!guideEdges?.bottom,
      left: !!guideEdges?.left,
    };
    this.cropM = {
      top: Math.max(0, cropM?.top || 0),
      right: Math.max(0, cropM?.right || 0),
      bottom: Math.max(0, cropM?.bottom || 0),
      left: Math.max(0, cropM?.left || 0),
    };
    this.opacity = typeof opacity === "number" ? Math.max(0, Math.min(1, opacity)) : 1;
    this.filters = Array.isArray(filters) ? filters.map(f => ({ ...f })) : [];
    this.activeFilterId = activeFilterId || null;
    this.bgRemoval = bgRemoval ? { ...bgRemoval } : undefined;
    this._bgFgMask = null;
    this._bgMaskRev = 0;
  }
}

export type FreeLineStyle = "solid" | "dashed" | "dotted" | "dashdot" | "blob" | "image";

export class FreeStroke {
  id: string;
  points: Vec2[];
  color: string;
  thicknessM: number;
  opacity: number;
  lineStyle: FreeLineStyle;
  gapM: number;
  blobSpacingM: number;
  blobSizeM: number;
  smoothing: boolean;
  /** Bild-Stempel: DataURL des Bildes (nur bei lineStyle === "image" aktiv). */
  imageSrc: string | null;
  /** Bild-Stempel: Bildgröße (Welt-m, längere Kante). */
  imageSizeM: number;
  /** Bild-Stempel: Abstand zwischen Stempeln entlang Pfad (m). */
  imageSpacingM: number;
  /** Bild-Stempel: Rotation entlang Pfad-Tangente. */
  imageRotateAlongPath: boolean;
  labelId: string;
  _stickerEditOwnerId?: string | null;

  constructor(opts: {
    id: string; points: Vec2[]; color?: string; thicknessM?: number; opacity?: number;
    lineStyle?: FreeLineStyle; gapM?: number; blobSpacingM?: number; blobSizeM?: number;
    smoothing?: boolean; labelId?: string;
    imageSrc?: string | null; imageSizeM?: number; imageSpacingM?: number; imageRotateAlongPath?: boolean;
  }) {
    this.id = opts.id;
    this.points = opts.points.map(p => v(p.x, p.y));
    this.color = opts.color || Defaults.freeColor;
    this.thicknessM = (typeof opts.thicknessM === "number" && opts.thicknessM > 0) ? opts.thicknessM : Defaults.freeThicknessM;
    this.opacity = clamp(typeof opts.opacity === "number" ? opts.opacity : Defaults.freeOpacity, 0, 1);
    this.lineStyle = opts.lineStyle || (Defaults.freeLineStyle as FreeLineStyle);
    this.gapM = (typeof opts.gapM === "number" && opts.gapM > 0) ? opts.gapM : Defaults.freeGapM;
    this.blobSpacingM = (typeof opts.blobSpacingM === "number" && opts.blobSpacingM > 0) ? opts.blobSpacingM : Defaults.freeBlobSpacingM;
    this.blobSizeM = (typeof opts.blobSizeM === "number" && opts.blobSizeM > 0) ? opts.blobSizeM : Defaults.freeBlobSizeM;
    this.smoothing = (typeof opts.smoothing === "boolean") ? opts.smoothing : Defaults.freeSmooth;
    this.imageSrc = opts.imageSrc || null;
    this.imageSizeM = (typeof opts.imageSizeM === "number" && opts.imageSizeM > 0) ? opts.imageSizeM : Defaults.freeImageSizeM;
    this.imageSpacingM = (typeof opts.imageSpacingM === "number" && opts.imageSpacingM > 0) ? opts.imageSpacingM : Defaults.freeImageSpacingM;
    this.imageRotateAlongPath = (typeof opts.imageRotateAlongPath === "boolean") ? opts.imageRotateAlongPath : Defaults.freeImageRotate;
    this.labelId = opts.labelId || Defaults.defaultLabelId;
    this._stickerEditOwnerId = null;
  }
}

/** Hilfslinie (Lineal) für das Eraser-Tool. Optional, max. 1 pro Scene. */
export interface RulerGuide {
  a: Vec2;
  b: Vec2;
}

export type WallKind = "outer" | "inner";
export type WallReferenceSide = "outer" | "center" | "inner";

export class Wall {
  id: string;
  kind: WallKind;
  thicknessM: number;
  referenceSide: WallReferenceSide;
  /** Bezugs-Polylinie (gezeichnete Eckpunkte). */
  corners: Vec2[];
  /** Automatisch erzeugte T-Anschluss-Stützpunkte: topologisch vorhanden,
   * aber nicht sichtbar und nicht direkt als Fangpunkt auswählbar. */
  hiddenCornerIndices: number[];
  /** Pro Eckpunkt (index-parallel zu `corners`) optional ein fixer Anschluss
   * an eine Nachbar-Wand-Sub-Linie/-Gehrung. Der Anker verhindert nur das
   * Zurücktrimmen auf die Bezugslinie; er zieht später nicht mit der Host-Wand mit. */
  cornerAnchors: (WallCornerAnchor | null)[];
  /** Freier ID-Name (überschreibt Auto-ID AW01/IW01). Leer = Auto. */
  customName: string;
  color: string;
  /** Flächenfarbe (Füllung). Default: dunkelgrau (AW) / hellgrau (IW). */
  fillColor: string;
  labelId: string;
  /**
   * ArchiCAD-Verschneidungspriorität — höhere Werte gewinnen am Knoten.
   * Default: AW = 200, IW = 100. Beim Render werden niedrigere Prioritäten
   * von höheren subtrahiert (kein Überlapp, sauberer T-Stoß).
   */
  priority: number;
  _stickerEditOwnerId?: string | null;

  constructor(opts: {
    id: string; kind: WallKind; thicknessM: number; referenceSide: WallReferenceSide;
    corners: Vec2[]; customName?: string; color?: string; fillColor?: string; labelId?: string;
    priority?: number; hiddenCornerIndices?: number[];
    cornerAnchors?: (WallCornerAnchor | null)[];
  }) {
    this.id = opts.id;
    this.kind = opts.kind;
    this.thicknessM = Math.max(0.001, opts.thicknessM);
    this.referenceSide = opts.referenceSide;
    this.corners = opts.corners.map(p => v(p.x, p.y));
    this.hiddenCornerIndices = (opts.hiddenCornerIndices || [])
      .filter(i => Number.isInteger(i) && i >= 0 && i < this.corners.length);
    this.cornerAnchors = (opts.cornerAnchors && opts.cornerAnchors.length === this.corners.length)
      ? opts.cornerAnchors.map(a => a ? { ...a } : null)
      : new Array(this.corners.length).fill(null);
    this.customName = opts.customName || "";
    this.color = opts.color || Defaults.lineColor;
    this.fillColor = opts.fillColor
      || (opts.kind === "outer" ? Defaults.wallFillColorOuter : Defaults.wallFillColorInner);
    this.labelId = opts.labelId || Defaults.defaultLabelId;
    this.priority = opts.priority ?? (opts.kind === "outer" ? 200 : 100);
    this._stickerEditOwnerId = null;
  }
}

/** Fixierter Anschluss eines Wand-Eckpunkts an die Sub-/Gehrungsgeometrie einer anderen Wand. */
export type WallCornerAnchor =
  | { kind: "subMiter"; hostWallId: string; hostCornerIndex: number }
  | { kind: "subEdge"; hostWallId: string; hostEdgeIndex: number; t: number };

export type DoorSide = "inner" | "outer";
export type DoorHand = "left" | "right";
export type DoorEdge = "inner" | "center" | "outer";

export type DoorKind = "door" | "window";

export class Door {
  id: string;
  wallId: string;
  /** "door" = klassische Tür mit Flügel+Schwung. "window" = Fenster mit zwei Linien. */
  kind: DoorKind;
  /** Position des Türmittelpunkts entlang Wand-Bezugslinie (Meter ab Start). */
  posM: number;
  /** Gesamte Öffnungsbreite (mit Laibungen). */
  widthM: number;
  heightM: number;
  /** Brüstungshöhe (m). Bei Fenstern üblich; bei Türen i. d. R. 0. */
  breakHeightM: number;
  /** Brüstungshöhe in Maßketten anzeigen (BRH-Label). */
  breakHeightVisible: boolean;
  /** Öffnungsseite — auf welche Seite die Tür aufschlägt. */
  side: DoorSide;
  /** Öffnungsrichtung links/rechts entlang Wand. */
  hand: DoorHand;
  /** Start-Kante: Türschwung beginnt an dieser Kante (innen/mitte/außen). */
  edge: DoorEdge;
  color: string;
  /** Laibungen aktiv. */
  jambEnabled: boolean;
  jambColor: string;
  /** Laibungsbreite (entlang Wand, je Seite, in m). */
  jambLenM: number;
  /** Laibungsdicke (quer zur Wand, in m). 0 = volle Wandstärke. */
  jambThickM: number;
  /** Flügeltür sichtbar (default: true für Tür, false für Fenster). */
  sashEnabled: boolean;
  /** Farbe der Fenster-Linien (nur kind="window"). */
  glassColor: string;
  /** Dicke des Fenster-Elements (Abstand zwischen den beiden Linien, in m). 0 = auto = wallThick/2. */
  glassThickM: number;
  /** Füllfarbe zwischen den beiden Fensterlinien. "" = keine Füllung. */
  glassFillColor: string;
  labelId: string;

  constructor(opts: {
    id: string; wallId: string; posM: number; widthM: number; heightM?: number;
    breakHeightM?: number;
    breakHeightVisible?: boolean;
    kind?: DoorKind;
    side?: DoorSide; hand?: DoorHand; edge?: DoorEdge; color?: string;
    jambEnabled?: boolean; jambColor?: string; jambLenM?: number; jambThickM?: number;
    sashEnabled?: boolean; glassColor?: string; glassThickM?: number; glassFillColor?: string;
    labelId?: string;
  }) {
    this.id = opts.id;
    this.wallId = opts.wallId;
    this.kind = opts.kind || "door";
    this.posM = opts.posM;
    this.widthM = Math.max(0.1, opts.widthM);
    this.heightM = opts.heightM ?? 2.1;
    this.breakHeightM = (typeof opts.breakHeightM === "number" && opts.breakHeightM >= 0)
      ? opts.breakHeightM
      : (this.kind === "window" ? 0.9 : 0);
    this.breakHeightVisible = !!opts.breakHeightVisible;
    this.side = opts.side || "inner";
    this.hand = opts.hand || "left";
    this.edge = opts.edge || "center";
    this.color = opts.color || "#111111";
    this.jambEnabled = opts.jambEnabled ?? true;
    this.jambColor = opts.jambColor || "#9aa3ad";
    this.jambLenM = (typeof opts.jambLenM === "number" && opts.jambLenM >= 0) ? opts.jambLenM : 0.06;
    this.jambThickM = (typeof opts.jambThickM === "number" && opts.jambThickM >= 0) ? opts.jambThickM : 0;
    this.sashEnabled = (typeof opts.sashEnabled === "boolean") ? opts.sashEnabled : (this.kind === "door");
    this.glassColor = opts.glassColor || "#2a2f36";
    this.glassThickM = (typeof opts.glassThickM === "number" && opts.glassThickM >= 0) ? opts.glassThickM : 0;
    this.glassFillColor = (typeof opts.glassFillColor === "string") ? opts.glassFillColor : "";
    this.labelId = opts.labelId || Defaults.defaultLabelId;
  }
}



export class Scene {
  segments: Segment[] = [];
  freeStrokes: FreeStroke[] = [];
  rulerGuide: RulerGuide | null = null;
  hatches: Hatch[] = [];
  dimensions: Dimension[] = [];
  textBoxes: TextBox[] = [];
  stickerInstances: StickerInstance[] = [];
  documents: DocumentObject[] = [];
  walls: Wall[] = [];
  doors: Door[] = [];
  /**
   * Wenn !== null: alle danach via create* erzeugten Objekte werden mit dieser
   * Sticker-Edit-Owner-ID markiert. Wird von CadApp während enterStickerEdit
   * gesetzt und beim Exit wieder geleert.
   */
  _currentEditOwnerId: string | null = null;
  private _segIdMap = new Map<string, Segment>();
  private _hatchIdMap = new Map<string, Hatch>();
  private _dimIdMap = new Map<string, Dimension>();
  private _textIdMap = new Map<string, TextBox>();
  private _stickerIdMap = new Map<string, StickerInstance>();
  private _docIdMap = new Map<string, DocumentObject>();
  private _freeIdMap = new Map<string, FreeStroke>();

  /** Lazy/inkrementell aufgebauter Wand-Topologie-Graph (Phase 2). */
  private _wallTopology: WallTopologyGraph | null = null;
  private _wallTopologyDirty = true;
  private _wallTopologyHash = "";

  /** Markiert die Wand-Topologie als veraltet — Aufruf nach jeder Wand-Mutation. */
  markWallsDirty(): void { this._wallTopologyDirty = true; }

  /** Lazy: liefert den aktuellen Topologie-Graph (rebuild bei dirty oder Hash-Change). */
  getWallTopology(): WallTopologyGraph {
    if (!this._wallTopology) this._wallTopology = new WallTopologyGraph();
    // Inkrementelles Hashing als Sicherheitsnetz für vergessene markWallsDirty-Aufrufe.
    let h = "" + this.walls.length;
    for (const w of this.walls) {
      h += "|" + w.id + ":" + w.corners.length + ":" + w.thicknessM + ":" + w.referenceSide;
      for (const c of w.corners) h += "," + c.x.toFixed(3) + "," + c.y.toFixed(3);
    }
    if (this._wallTopologyDirty || h !== this._wallTopologyHash) {
      this._wallTopology.build(this.walls);
      this._wallTopologyDirty = false;
      this._wallTopologyHash = h;
    }
    return this._wallTopology;
  }


  private _makeId(): string {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  private _rebuildSegIdMap() {
    this._segIdMap.clear();
    for (const s of this.segments) this._segIdMap.set(s.id, s);
  }

  private _rebuildHatchIdMap() {
    this._hatchIdMap.clear();
    for (const h of this.hatches) this._hatchIdMap.set(h.id, h);
  }

  private _rebuildDimIdMap() {
    this._dimIdMap.clear();
    for (const d of this.dimensions) this._dimIdMap.set(d.id, d);
  }

  private _rebuildTextIdMap() {
    this._textIdMap.clear();
    for (const t of this.textBoxes) this._textIdMap.set(t.id, t);
  }

  private _rebuildStickerIdMap() {
    this._stickerIdMap.clear();
    for (const s of this.stickerInstances) this._stickerIdMap.set(s.id, s);
  }

  private _rebuildDocIdMap() {
    this._docIdMap.clear();
    for (const d of this.documents) this._docIdMap.set(d.id, d);
  }

  private _rebuildFreeIdMap() {
    this._freeIdMap.clear();
    for (const s of this.freeStrokes) this._freeIdMap.set(s.id, s);
  }

  // ---- FreeStrokes (Freihandzeichnen) ----
  createFreeStroke(points: Vec2[], style: {
    color?: string; thicknessM?: number; opacity?: number; lineStyle?: FreeLineStyle;
    gapM?: number; blobSpacingM?: number; blobSizeM?: number; smoothing?: boolean; labelId?: string;
    imageSrc?: string | null; imageSizeM?: number; imageSpacingM?: number; imageRotateAlongPath?: boolean;
  } = {}) {
    const stroke = new FreeStroke({ id: this._makeId(), points, ...style });
    stroke._stickerEditOwnerId = this._currentEditOwnerId;
    this.freeStrokes.push(stroke);
    this._rebuildFreeIdMap();
    return stroke;
  }

  getFreeStrokeById(id: string): FreeStroke | null { return this._freeIdMap.get(id) || null; }

  getFreeStrokesByLabelId(labelId: string): FreeStroke[] {
    return this.freeStrokes.filter(s => s.labelId === labelId);
  }

  removeFreeStroke(s: FreeStroke) {
    this.freeStrokes = this.freeStrokes.filter(x => x !== s);
    this._rebuildFreeIdMap();
  }

  removeFreeStrokesByIds(ids: string[]) {
    const set = new Set(ids);
    this.freeStrokes = this.freeStrokes.filter(s => !set.has(s.id));
    this._rebuildFreeIdMap();
  }

  removeFreeStrokesByLabelId(labelId: string) {
    this.freeStrokes = this.freeStrokes.filter(s => s.labelId !== labelId);
    this._rebuildFreeIdMap();
  }

  reassignFreeStrokesLabel(oldId: string, newId: string) {
    for (const s of this.freeStrokes) if (s.labelId === oldId) s.labelId = newId;
  }

  /** Ersetzt einen Stroke durch beliebig viele Sub-Strokes (Eraser-Splitting). */
  replaceFreeStrokeWithChunks(stroke: FreeStroke, chunks: Vec2[][]) {
    this.removeFreeStroke(stroke);
    for (const ch of chunks) {
      if (!ch || ch.length < 2) continue;
      this.createFreeStroke(ch, {
        color: stroke.color, thicknessM: stroke.thicknessM, opacity: stroke.opacity,
        lineStyle: stroke.lineStyle, gapM: stroke.gapM,
        blobSpacingM: stroke.blobSpacingM, blobSizeM: stroke.blobSizeM,
        smoothing: stroke.smoothing, labelId: stroke.labelId,
        imageSrc: stroke.imageSrc, imageSizeM: stroke.imageSizeM,
        imageSpacingM: stroke.imageSpacingM, imageRotateAlongPath: stroke.imageRotateAlongPath,
      });
    }
  }

  // ---- Documents (PDF/JPG/PNG) ----
  createDocument(opts: {
    name?: string; kind?: "image" | "pdf-page"; src: string; pageIndex?: number;
    position: Vec2; widthM: number; heightM: number; rotationRad?: number;
    pixelWidth?: number; pixelHeight?: number; labelId?: string;
    importScaleDenom?: number; eraseMaskDataUrl?: string | null;
    pdfSourceB64?: string | null;
    guideEdges?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };
    cropM?: { top?: number; right?: number; bottom?: number; left?: number };
    opacity?: number;
    filters?: import("./documentFilters").DocumentFilter[];
    activeFilterId?: string | null;
    bgRemoval?: import("./documentBgRemove").BgRemoval;
  }): DocumentObject {
    const doc = new DocumentObject({ id: this._makeId(), ...opts });
    this.documents.push(doc);
    this._rebuildDocIdMap();
    return doc;
  }

  getDocumentById(id: string): DocumentObject | null { return this._docIdMap.get(id) || null; }

  getDocumentsByLabelId(labelId: string): DocumentObject[] {
    return this.documents.filter(d => d.labelId === labelId);
  }

  removeDocument(doc: DocumentObject) {
    this.documents = this.documents.filter(d => d !== doc);
    this._rebuildDocIdMap();
  }

  removeDocumentsByIds(ids: string[]) {
    const set = new Set(ids);
    this.documents = this.documents.filter(d => !set.has(d.id));
    this._rebuildDocIdMap();
  }

  removeDocumentsByLabelId(labelId: string) {
    this.documents = this.documents.filter(d => d.labelId !== labelId);
    this._rebuildDocIdMap();
  }

  reassignDocumentsLabel(oldId: string, newId: string) {
    for (const d of this.documents) if (d.labelId === oldId) d.labelId = newId;
  }

  assignDocumentsToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const d of this.documents) if (set.has(d.id)) d.labelId = newId;
  }

  // ---- Sticker Instances ----
  createStickerInstance(opts: {
    defId?: string | null; name?: string;
    items: StickerInstanceItem[];
    position: Vec2; rotationRad?: number; scale?: number; labelId?: string;
  }): StickerInstance {
    const inst = new StickerInstance({ id: this._makeId(), ...opts });
    this.stickerInstances.push(inst);
    this._rebuildStickerIdMap();
    return inst;
  }

  getStickerInstanceById(id: string): StickerInstance | null { return this._stickerIdMap.get(id) || null; }

  getStickerInstancesByLabelId(labelId: string): StickerInstance[] {
    return this.stickerInstances.filter(s => s.labelId === labelId);
  }

  removeStickerInstance(inst: StickerInstance) {
    this.stickerInstances = this.stickerInstances.filter(s => s !== inst);
    this._rebuildStickerIdMap();
  }

  removeStickerInstancesByLabelId(labelId: string) {
    this.stickerInstances = this.stickerInstances.filter(s => s.labelId !== labelId);
    this._rebuildStickerIdMap();
  }

  reassignStickerInstancesLabel(oldId: string, newId: string) {
    for (const s of this.stickerInstances) if (s.labelId === oldId) s.labelId = newId;
  }

  assignStickerInstancesToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const s of this.stickerInstances) if (set.has(s.id)) s.labelId = newId;
  }

  // ---- TextBoxes ----
  createTextBox(center: Vec2, widthM: number, heightM: number, style: TextBoxStyle = {}, html: string = "", rotationRad: number = 0) {
    const box = new TextBox({
      id: this._makeId(), center, widthM, heightM, rotationRad, html, style, labelId: style.labelId,
    });
    box._stickerEditOwnerId = this._currentEditOwnerId;
    this.textBoxes.push(box);
    this._rebuildTextIdMap();
    return box;
  }

  getTextBoxById(id: string): TextBox | null { return this._textIdMap.get(id) || null; }

  getTextBoxesByLabelId(labelId: string): TextBox[] {
    return this.textBoxes.filter(t => t.labelId === labelId);
  }

  removeTextBox(box: TextBox) {
    this.textBoxes = this.textBoxes.filter(t => t !== box);
    this._rebuildTextIdMap();
  }

  removeTextBoxesByIds(ids: string[]) {
    const set = new Set(ids);
    this.textBoxes = this.textBoxes.filter(t => !set.has(t.id));
    this._rebuildTextIdMap();
  }

  removeTextBoxesByLabelId(labelId: string) {
    this.textBoxes = this.textBoxes.filter(t => t.labelId !== labelId);
    this._rebuildTextIdMap();
  }

  reassignTextBoxesLabel(oldId: string, newId: string) {
    for (const t of this.textBoxes) {
      if (t.labelId === oldId) t.labelId = newId;
    }
  }

  assignTextBoxesToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const t of this.textBoxes) {
      if (set.has(t.id)) t.labelId = newId;
    }
  }

  // ---- Dimensions ----
  createDimension(p1: Vec2, p2: Vec2, placementPoint: Vec2, mode: "parallel" | "diagonal", refDir: Vec2 | null, style: DimensionStyle = {}, doorRefId: string | null = null) {
    const dim = new Dimension({ id: this._makeId(), p1, p2, placementPoint, mode, refDir, style, labelId: style.labelId, doorRefId });
    dim._stickerEditOwnerId = this._currentEditOwnerId;
    this.dimensions.push(dim);
    this._rebuildDimIdMap();
    return dim;
  }


  getDimensionById(id: string): Dimension | null { return this._dimIdMap.get(id) || null; }

  getDimensionsByLabelId(labelId: string): Dimension[] {
    return this.dimensions.filter(d => d.labelId === labelId);
  }

  removeDimension(dim: Dimension) {
    this.dimensions = this.dimensions.filter(d => d !== dim);
    this._rebuildDimIdMap();
  }

  removeDimensionsByIds(ids: string[]) {
    const set = new Set(ids);
    this.dimensions = this.dimensions.filter(d => !set.has(d.id));
    this._rebuildDimIdMap();
  }

  removeDimensionsByLabelId(labelId: string) {
    this.dimensions = this.dimensions.filter(d => d.labelId !== labelId);
    this._rebuildDimIdMap();
  }

  reassignDimensionsLabel(oldId: string, newId: string) {
    for (const d of this.dimensions) {
      if (d.labelId === oldId) d.labelId = newId;
    }
  }

  assignDimensionsToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const d of this.dimensions) {
      if (set.has(d.id)) d.labelId = newId;
    }
  }

  // ---- Segments ----
  createSegment(a: Vec2, b: Vec2, style: { color?: string; thicknessM?: number; labelId?: string; isGuide?: boolean; midpointSnap?: boolean; divisionSnap?: number; arrowStart?: boolean; arrowEnd?: boolean; arrowScale?: number } = {}) {
    const seg = new Segment({ id: this._makeId(), a, b, color: style.color, thicknessM: style.thicknessM, labelId: style.labelId, isGuide: style.isGuide, midpointSnap: style.midpointSnap, divisionSnap: style.divisionSnap, arrowStart: style.arrowStart, arrowEnd: style.arrowEnd, arrowScale: style.arrowScale });
    seg._stickerEditOwnerId = this._currentEditOwnerId;
    this.segments.push(seg);
    this._rebuildSegIdMap();
    return seg;
  }



  getSegmentById(id: string): Segment | null { return this._segIdMap.get(id) || null; }

  getSegmentsByLabelId(labelId: string): Segment[] {
    return this.segments.filter(s => s.labelId === labelId);
  }

  removeSegment(seg: Segment) {
    this.segments = this.segments.filter(s => s !== seg);
    this._rebuildSegIdMap();
  }

  removeSegmentsByIds(ids: string[]) {
    const set = new Set(ids);
    this.segments = this.segments.filter(s => !set.has(s.id));
    this._rebuildSegIdMap();
  }

  removeSegmentsByLabelId(labelId: string) {
    this.segments = this.segments.filter(s => s.labelId !== labelId);
    this._rebuildSegIdMap();
  }

  reassignSegmentsLabel(oldId: string, newId: string) {
    for (const seg of this.segments) {
      if (seg.labelId === oldId) seg.labelId = newId;
    }
  }

  assignSegmentsToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const seg of this.segments) {
      if (set.has(seg.id)) seg.labelId = newId;
    }
  }

  splitSegmentAtT(seg: Segment, t: number) {
    t = clamp(t, 0, 1);
    if (t <= Defaults.splitEpsT || t >= 1 - Defaults.splitEpsT) {
      return { didSplit: false, point: (t < 0.5 ? seg.a : seg.b), newSegments: [seg] };
    }
    const p = lerp(seg.a, seg.b, t);
    const style = { color: seg.color, thicknessM: seg.thicknessM, labelId: seg.labelId, isGuide: seg.isGuide };
    this.removeSegment(seg);
    const s1 = this.createSegment(seg.a, p, style);
    const s2 = this.createSegment(p, seg.b, style);
    return { didSplit: true, point: p, newSegments: [s1, s2] };
  }

  // ---- Hatches ----
  createHatch(points: Vec2[], style: {
    fillColor?: string; strokeColor?: string; fillAlphaPct?: number;
    strokeWidthPx?: number; labelId?: string; areaLabel?: Partial<AreaLabel>;
    holes?: Vec2[][];
  } = {}) {
    const hatch = new Hatch({
      id: this._makeId(), points, holes: style.holes,
      fillColor: style.fillColor, strokeColor: style.strokeColor,
      fillAlphaPct: style.fillAlphaPct, strokeWidthPx: style.strokeWidthPx,
      labelId: style.labelId, areaLabel: style.areaLabel,
    });
    hatch._stickerEditOwnerId = this._currentEditOwnerId;
    this.hatches.push(hatch);
    this._rebuildHatchIdMap();
    return hatch;
  }

  getHatchById(id: string): Hatch | null { return this._hatchIdMap.get(id) || null; }

  getHatchesByLabelId(labelId: string): Hatch[] {
    return this.hatches.filter(h => h.labelId === labelId);
  }

  removeHatch(hatch: Hatch) {
    this.hatches = this.hatches.filter(h => h !== hatch);
    this._rebuildHatchIdMap();
  }

  removeHatchesByIds(ids: string[]) {
    const set = new Set(ids);
    this.hatches = this.hatches.filter(h => !set.has(h.id));
    this._rebuildHatchIdMap();
  }

  removeHatchesByLabelId(labelId: string) {
    this.hatches = this.hatches.filter(h => h.labelId !== labelId);
    this._rebuildHatchIdMap();
  }

  reassignHatchesLabel(oldId: string, newId: string) {
    for (const h of this.hatches) {
      if (h.labelId === oldId) h.labelId = newId;
    }
  }

  assignHatchesToLabel(ids: string[], newId: string) {
    const set = new Set(ids);
    for (const h of this.hatches) {
      if (set.has(h.id)) h.labelId = newId;
    }
  }

  removePointFromHatch(hatch: Hatch, pointIndex: number): boolean {
    if (!hatch || hatch.points.length <= 3) return false;
    if (pointIndex < 0 || pointIndex >= hatch.points.length) return false;
    hatch.points.splice(pointIndex, 1);
    return true;
  }

  /** Punkt aus einer Hole-Loop entfernen. Bei < 3 verbleibenden Punkten wird die Loop entfernt. */
  removePointFromHatchHole(hatch: Hatch, holeIndex: number, pointIndex: number): boolean {
    if (!hatch || !hatch.holes) return false;
    const loop = hatch.holes[holeIndex];
    if (!loop) return false;
    if (pointIndex < 0 || pointIndex >= loop.length) return false;
    if (loop.length <= 3) {
      hatch.holes.splice(holeIndex, 1);
      return true;
    }
    loop.splice(pointIndex, 1);
    return true;
  }

  insertPointIntoHatchEdge(hatch: Hatch, edgeIndex: number, t: number) {
    if (!hatch || hatch.points.length < 2) {
      return { didInsert: false, point: v(0, 0) as Vec2, pointIndex: -1 };
    }
    const n = hatch.points.length;
    const a = hatch.points[edgeIndex];
    const b = hatch.points[(edgeIndex + 1) % n];
    t = clamp(t, 0, 1);
    if (t <= Defaults.splitEpsT) return { didInsert: false, point: v(a.x, a.y), pointIndex: edgeIndex };
    if (t >= 1 - Defaults.splitEpsT) return { didInsert: false, point: v(b.x, b.y), pointIndex: (edgeIndex + 1) % n };
    const p = lerp(a, b, t);
    hatch.points.splice(edgeIndex + 1, 0, v(p.x, p.y));
    return { didInsert: true, point: p, pointIndex: edgeIndex + 1 };
  }

  /** Punkt-Insertion in einer Hole-Kante. */
  insertPointIntoHatchHoleEdge(hatch: Hatch, holeIndex: number, edgeIndex: number, t: number) {
    const loop = hatch?.holes?.[holeIndex];
    if (!loop || loop.length < 2) return { didInsert: false, point: v(0, 0) as Vec2, pointIndex: -1 };
    const n = loop.length;
    const a = loop[edgeIndex];
    const b = loop[(edgeIndex + 1) % n];
    t = clamp(t, 0, 1);
    if (t <= Defaults.splitEpsT) return { didInsert: false, point: v(a.x, a.y), pointIndex: edgeIndex };
    if (t >= 1 - Defaults.splitEpsT) return { didInsert: false, point: v(b.x, b.y), pointIndex: (edgeIndex + 1) % n };
    const p = lerp(a, b, t);
    loop.splice(edgeIndex + 1, 0, v(p.x, p.y));
    return { didInsert: true, point: p, pointIndex: edgeIndex + 1 };
  }

  getHatchEdges(): { hatch: Hatch; edgeIndex: number; a: Vec2; b: Vec2 }[] {
    const edges: { hatch: Hatch; edgeIndex: number; a: Vec2; b: Vec2 }[] = [];
    for (const hatch of this.hatches) {
      const n = hatch.points.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        edges.push({ hatch, edgeIndex: i, a: hatch.points[i], b: hatch.points[(i + 1) % n] });
      }
    }
    return edges;
  }


  // ---- Walls ----
  createWall(opts: {
    kind: WallKind; thicknessM: number; referenceSide: WallReferenceSide;
    corners: Vec2[]; customName?: string; color?: string; fillColor?: string; labelId?: string;
    priority?: number; hiddenCornerIndices?: number[];
    cornerAnchors?: (WallCornerAnchor | null)[];
  }) {
    const w = new Wall({ id: this._makeId(), ...opts });
    w._stickerEditOwnerId = this._currentEditOwnerId;
    this.walls.push(w);
    this.markWallsDirty();
    return w;
  }


  removeWall(w: Wall) { this.walls = this.walls.filter(x => x !== w); this.markWallsDirty(); }

  /**
   * Wechselt die Bezugsseite einer Wand und verschiebt gleichzeitig die
   * Bezugspolylinie so, dass der sichtbare Wandkörper exakt erhalten bleibt
   * (ArchiCAD: "Bezugslinie an gegenüberliegender Kante koppeln").
   * Cycelt outer → center → inner → outer.
   */
  flipWallReferenceSide(wall: Wall, newSide?: WallReferenceSide): WallReferenceSide {
    const order: WallReferenceSide[] = ["outer", "center", "inner"];
    const oldSide = wall.referenceSide;
    const target: WallReferenceSide = newSide ?? order[(order.indexOf(oldSide) + 1) % order.length];
    if (target === oldSide) return oldSide;
    const t = wall.thicknessM;
    // Body-Center-Offset relativ zur Bezugslinie (in perpLeftScreen-Richtung):
    // outer = -t/2, center = 0, inner = +t/2.
    const c = (s: WallReferenceSide) => s === "outer" ? -t / 2 : s === "inner" ? t / 2 : 0;
    const delta = c(oldSide) - c(target);
    if (Math.abs(delta) > 1e-9 && wall.corners.length >= 2) {
      // Verschiebt jeden Knoten entlang perpLeftScreen mit Live-Gehrung.
      wall.corners = offsetPolyline(wall.corners, delta);
    }
    wall.referenceSide = target;
    this.markWallsDirty();
    return target;
  }

  getWallById(id: string): Wall | null { return this.walls.find(w => w.id === id) || null; }
  getWallsByLabelId(labelId: string): Wall[] { return this.walls.filter(w => w.labelId === labelId); }
  removeWallsByLabelId(labelId: string) { this.walls = this.walls.filter(w => w.labelId !== labelId); this.markWallsDirty(); }
  reassignWallsLabel(oldId: string, newId: string) { for (const w of this.walls) if (w.labelId === oldId) w.labelId = newId; this.markWallsDirty(); }

  /**
   * Splittet eine Wand exakt am Punkt p (muss auf einer Edge liegen). Erzeugt zwei neue
   * Wände mit gleichen Eigenschaften und ersetzt die ursprüngliche Wand. Gibt [a, b] zurück
   * oder null wenn Split nicht möglich (Punkt nicht auf Edge / Restlänge zu kurz).
   */
  splitWallAt(wall: Wall, p: Vec2, minSegLenM = 0.01, newLabelIdForB?: string): [Wall, Wall] | null {
    if (wall.corners.length < 2) return null;
    let edgeIdx = -1;
    let bestT = 0;
    let bestDist = Infinity;
    for (let i = 0; i < wall.corners.length - 1; i++) {
      const a = wall.corners[i], b = wall.corners[i + 1];
      const ab = { x: b.x - a.x, y: b.y - a.y };
      const ab2 = ab.x * ab.x + ab.y * ab.y || 1e-12;
      const t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / ab2;
      if (t < 0.001 || t > 0.999) continue;
      const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestDist) { bestDist = d; edgeIdx = i; bestT = t; }
    }
    if (edgeIdx < 0) return null;

    const cornersA = wall.corners.slice(0, edgeIdx + 1).map(pt => v(pt.x, pt.y));
    cornersA.push(v(p.x, p.y));
    const cornersB: Vec2[] = [v(p.x, p.y)];
    for (let i = edgeIdx + 1; i < wall.corners.length; i++) cornersB.push(v(wall.corners[i].x, wall.corners[i].y));

    const lenPoly = (pts: Vec2[]) => {
      let L = 0;
      for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      return L;
    };
    if (lenPoly(cornersA) < minSegLenM || lenPoly(cornersB) < minSegLenM) return null;

    const wA = new Wall({
      id: this._makeId(), kind: wall.kind, thicknessM: wall.thicknessM, referenceSide: wall.referenceSide,
      corners: cornersA, customName: wall.customName, color: wall.color, fillColor: wall.fillColor, labelId: wall.labelId,
    });
    const wB = new Wall({
      id: this._makeId(), kind: wall.kind, thicknessM: wall.thicknessM, referenceSide: wall.referenceSide,
      corners: cornersB, customName: "", color: wall.color, fillColor: wall.fillColor, labelId: newLabelIdForB || wall.labelId,
    });
    wA._stickerEditOwnerId = wall._stickerEditOwnerId;
    wB._stickerEditOwnerId = wall._stickerEditOwnerId;
    const idx = this.walls.indexOf(wall);
    if (idx >= 0) this.walls.splice(idx, 1, wA, wB);
    else { this.walls.push(wA); this.walls.push(wB); }
    this.markWallsDirty();
    return [wA, wB];
  }

  // ---- Doors (Türen) ----
  createDoor(opts: {
    wallId: string; posM: number; widthM: number; heightM?: number;
    breakHeightM?: number;
    breakHeightVisible?: boolean;
    kind?: DoorKind;
    side?: DoorSide; hand?: DoorHand; edge?: DoorEdge; color?: string;
    jambEnabled?: boolean; jambColor?: string; jambLenM?: number; jambThickM?: number;
    sashEnabled?: boolean; glassColor?: string; glassThickM?: number; glassFillColor?: string;
    labelId?: string;
  }): Door {

    const d = new Door({ id: this._makeId(), ...opts });
    this.doors.push(d);
    return d;
  }
  getDoorById(id: string): Door | null { return this.doors.find(d => d.id === id) || null; }
  getDoorsByWallId(wallId: string): Door[] { return this.doors.filter(d => d.wallId === wallId); }
  getDoorsByLabelId(labelId: string): Door[] { return this.doors.filter(d => d.labelId === labelId); }
  removeDoor(d: Door) { this.doors = this.doors.filter(x => x !== d); }
  removeDoorsByIds(ids: string[]) { const set = new Set(ids); this.doors = this.doors.filter(d => !set.has(d.id)); }
  removeDoorsByWallId(wallId: string) { this.doors = this.doors.filter(d => d.wallId !== wallId); }
  removeDoorsByLabelId(labelId: string) { this.doors = this.doors.filter(d => d.labelId !== labelId); }
  reassignDoorsLabel(oldId: string, newId: string) { for (const d of this.doors) if (d.labelId === oldId) d.labelId = newId; }
}
