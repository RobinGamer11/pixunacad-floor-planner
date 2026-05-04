export const Defaults = {
  hitPx: 10,
  snapPx: 12,
  minSegLenM: 1e-4,
  splitEpsT: 1e-4,
  lineThicknessM: 0.03,
  lineColor: "#111111",
  geomEps: 1e-9,
  defaultLabelId: "default-line",
  defaultLabelName: "Default",

  // Hatch defaults
  hatchFillColor: "#4da3ff",
  hatchStrokeColor: "#111111",
  hatchStrokePx: 2.2,
  hatchFillAlphaPct: 35,
  strokeWidthBaseScale: 80,

  // Area label defaults
  areaShow: false,
  areaTextColor: "#000000",
  areaFontSizePx: 16,
  areaBgColor: "#ffffff",
  areaBgAlphaPct: 72,

  // Measure (dimension) defaults
  measureOrientation: "parallel" as "parallel" | "diagonal",
  measurePointCount: "two" as "two" | "multi",
  measureEditMode: "parallel" as "parallel" | "endpoints",
  measureTextColor: "#111111",
  measureTextSizePx: 12,
  measureLineColor: "#2b2b2b",
  measureDecimals: 3,
  measureTickLengthM: 0.06,
  measureShowExtensions: false,
  measureUseFreeText: false,
  measureFreeText: "",
  measureTextBgEnabled: false,
  measureTextBgColor: "#ffffff",
  measureTextBgAlpha: 0.8,
  measureReferenceScalePxPerM: 80,

  // TextBox defaults
  textColor: "#111111",
  textFontSizePx: 16,
  textBgColor: "#ffffff",
  textBgAlphaPct: 0,
  textWrap: true,
  textAlign: "left" as "left" | "center" | "right",
  textBorderEnabled: false,
  textBorderColor: "#111111",
  textBorderWidthPx: 1.5,
  textBoxWidthM: 2.6,
  textBoxHeightM: 0.6,
  textMinBoxSizeM: 0.05,
  textHandlePx: 10,

  // FreeDraw defaults
  freeColor: "#111111",
  freeThicknessM: 0.03,
  freeOpacity: 1.0,
  freeLineStyle: "solid" as "solid" | "dashed" | "dotted" | "dashdot" | "blob" | "image",
  freeGapM: 0.08,
  freeSmooth: true,
  freeSampleMinPx: 2.5,
  freeBlobSpacingM: 0.12,
  freeBlobSizeM: 0.06,
  freeImageSizeM: 0.18,
  freeImageSpacingM: 0.22,
  freeImageRotate: true,

  // Eraser defaults
  eraserRadiusM: 0.12,
  eraserStrength: 1.0,
  eraserOpacity: 1.0,
  eraserUseRuler: false,
  // Auflösungs-Cap (px Kantenlänge) für persistente Dokument-Radiermaske
  docMaskMaxPx: 2048,

  // Document import defaults
  // 96 DPI assumption: 96 px = 1 inch = 0.0254 m -> 1 px = 0.0254/96 m
  documentMetersPerPx: 0.0254 / 96,
  // 72 pt = 1 inch -> 1 pt = 0.0254/72 m  (PDF point convention)
  documentMetersPerPdfPt: 0.0254 / 72,
  // Render PDF pages at this device-pixel scale for crisper bitmaps
  documentPdfRenderScale: 2,
};

export const ToolIds = {
  SELECT: "select",
  LINE: "line",
  HATCH: "hatch",
  MEASURE: "measure",
  TEXT: "text",
  PIPETTE: "pipette",
  STICKER: "sticker",
  DOCUMENT: "document",
  FREE: "free",
  ERASER: "eraser",
  WALL: "wall",
} as const;

export const SelectionType = {
  SEGMENT: "segment",
  POINT: "point",
  HATCH: "hatch",
  DIMENSION: "dimension",
  TEXTBOX: "textbox",
  TEXTBOX_HANDLE: "textbox_handle",
  STICKER_INSTANCE: "sticker_instance",
  DOCUMENT: "document",
  FREE_STROKE: "free_stroke",
} as const;

export const SnapType = {
  POINT: "POINT",
  LINE: "LINE",
  GUIDE: "GUIDE",
  GUIDE_POINT: "GUIDE_POINT",
} as const;

export const PointEditAction = {
  MOVE: "move",
  TRANSLATE: "translate",
  ROTATE: "rotate",
  DELETE: "delete",
  OFFSET: "offset",
} as const;
