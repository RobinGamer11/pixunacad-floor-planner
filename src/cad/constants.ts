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
};

export const ToolIds = {
  SELECT: "select",
  LINE: "line",
  HATCH: "hatch",
} as const;

export const SelectionType = {
  SEGMENT: "segment",
  POINT: "point",
  HATCH: "hatch",
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
} as const;
