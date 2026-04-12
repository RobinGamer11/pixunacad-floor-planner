export const Defaults = {
  hitPx: 10,
  snapPx: 12,
  minSegLenM: 1e-4,
  splitEpsT: 1e-4,
  lineThicknessM: 0.03,
  lineColor: "#111111",
  geomEps: 1e-9,
};

export const ToolIds = {
  SELECT: "select",
  LINE: "line",
} as const;

export const SelectionType = {
  SEGMENT: "segment",
  POINT: "point",
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
} as const;
