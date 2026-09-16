import { useId, useMemo } from "react";
import { Boxes } from "lucide-react";
import type { LibraryGeometrySnapshot } from "@/cad/library/types";

type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

interface Props {
  geometry: LibraryGeometrySnapshot[];
  label: string;
  className?: string;
}

const finitePoint = (value: unknown): value is Point => {
  const point = value as Point | undefined;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
};

const plainText = (html: unknown) => String(html ?? "")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]*>/g, "")
  .replace(/&nbsp;/g, " ")
  .trim();

function tableSize(data: Record<string, any>): { width: number; height: number } {
  const table = data.data ?? {};
  const scale = Number(data.scale) || 1;
  const metersPerMillimeter = Number(data.mPerMm) || 0.001;
  const widthMm = (table.colWidthsMm ?? table.colWidths ?? []).reduce((sum: number, value: number) => sum + (Number(value) || 0), 0);
  const heightMm = (table.rowHeightsMm ?? table.rowHeights ?? []).reduce((sum: number, value: number) => sum + (Number(value) || 0), 0);
  return {
    width: Math.max(0.2, widthMm * metersPerMillimeter * scale),
    height: Math.max(0.12, heightMm * metersPerMillimeter * scale),
  };
}

function snapshotPoints(snapshot: LibraryGeometrySnapshot): Point[] {
  const data = snapshot.data ?? {};
  switch (snapshot.kind) {
    case "segment": return [data.a, data.b].filter(finitePoint);
    case "hatch": return [...(data.points ?? []), ...(data.holes ?? []).flat()].filter(finitePoint);
    case "wall": return (data.corners ?? []).filter(finitePoint);
    case "dimension": return [data.p1, data.p2, data.placementPoint, data.p3].filter(finitePoint);
    case "freeStroke": return (data.points ?? []).filter(finitePoint);
    case "textBox": {
      if (!finitePoint(data.center)) return [];
      const halfWidth = Math.max(0.1, Number(data.widthM) || 0.2) / 2;
      const halfHeight = Math.max(0.06, Number(data.heightM) || 0.12) / 2;
      return [
        { x: data.center.x - halfWidth, y: data.center.y - halfHeight },
        { x: data.center.x + halfWidth, y: data.center.y + halfHeight },
      ];
    }
    case "table": {
      if (!finitePoint(data.center)) return [];
      const size = tableSize(data);
      return [
        { x: data.center.x - size.width / 2, y: data.center.y - size.height / 2 },
        { x: data.center.x + size.width / 2, y: data.center.y + size.height / 2 },
      ];
    }
  }
}

function geometryBounds(geometry: LibraryGeometrySnapshot[]): Bounds {
  const points = geometry.flatMap(snapshotPoints);
  if (points.length === 0) return { minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function pathFromPoints(points: Point[], bulges: number[] = [], closed = false): string {
  if (points.length === 0) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  const edgeCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < edgeCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const bulge = Number(bulges[index]) || 0;
    if (Math.abs(bulge) < 0.000001) {
      path += ` L ${end.x} ${end.y}`;
      continue;
    }
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    const radius = Math.abs(chord * (1 + bulge * bulge) / (4 * bulge));
    const largeArc = Math.abs(4 * Math.atan(bulge)) > Math.PI ? 1 : 0;
    const sweep = bulge > 0 ? 1 : 0;
    path += ` A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
  }
  return closed ? `${path} Z` : path;
}

function SnapshotShape({ snapshot, index, markerId }: { snapshot: LibraryGeometrySnapshot; index: number; markerId: string }) {
  const data = snapshot.data ?? {};
  const stroke = data.color || data.strokeColor || data.lineColor || "currentColor";
  const lineWidth = Math.max(Number(data.thicknessM) || 0.008, 0.004);
  switch (snapshot.kind) {
    case "segment":
      if (!finitePoint(data.a) || !finitePoint(data.b)) return null;
      return <path d={pathFromPoints([data.a, data.b], [data.bulge])} fill="none" stroke={stroke} strokeWidth={lineWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
    case "hatch": {
      const points = (data.points ?? []).filter(finitePoint);
      if (points.length < 3) return null;
      const loops = [pathFromPoints(points, data.bulges, true), ...(data.holes ?? []).map((hole: Point[], holeIndex: number) => pathFromPoints(hole.filter(finitePoint), data.holeBulges?.[holeIndex], true))];
      return <path d={loops.join(" ")} fill={data.fillColor || "none"} fillOpacity={Math.max(0, Math.min(1, (Number(data.fillAlphaPct) || 0) / 100))} fillRule="evenodd" stroke={data.strokeColor || "currentColor"} strokeWidth={Math.max(0.5, Number(data.strokeWidthPx) || 1)} vectorEffect="non-scaling-stroke" />;
    }
    case "wall": {
      const points = (data.corners ?? []).filter(finitePoint);
      return points.length > 1 ? <path d={pathFromPoints(points, data.bulges)} fill="none" stroke={data.fillColor || data.color || "currentColor"} strokeWidth={Math.max(Number(data.thicknessM) || 0.12, 0.02)} strokeLinejoin="round" strokeLinecap="round" /> : null;
    }
    case "freeStroke": {
      const points = (data.points ?? []).filter(finitePoint);
      return points.length > 1 ? <path d={pathFromPoints(points)} fill="none" stroke={stroke} strokeOpacity={Math.max(0, Math.min(1, (Number(data.opacity) || 100) / 100))} strokeWidth={lineWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null;
    }
    case "dimension": {
      if (!finitePoint(data.p1) || !finitePoint(data.p2)) return null;
      const center = finitePoint(data.placementPoint) ? data.placementPoint : { x: (data.p1.x + data.p2.x) / 2, y: (data.p1.y + data.p2.y) / 2 };
      const text = data.useFreeText ? plainText(data.freeText) : "";
      return <g stroke={data.lineColor || "currentColor"} fill={data.textColor || data.lineColor || "currentColor"}>
        <line x1={data.p1.x} y1={data.p1.y} x2={data.p2.x} y2={data.p2.y} strokeWidth="1" vectorEffect="non-scaling-stroke" markerStart={`url(#${markerId})`} markerEnd={`url(#${markerId})`} />
        {text && <text x={center.x} y={center.y} fontSize="10" textAnchor="middle" vectorEffect="non-scaling-stroke">{text}</text>}
      </g>;
    }
    case "textBox":
      if (!finitePoint(data.center)) return null;
      return <text x={data.center.x} y={data.center.y} fill={data.style?.color || "currentColor"} fontSize={Math.max(0.08, (Number(data.heightM) || 0.12) * 0.62)} fontWeight={data.style?.bold ? 700 : 400} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(Number(data.rotationRad) || 0) * 180 / Math.PI} ${data.center.x} ${data.center.y})`}>{plainText(data.html).slice(0, 42)}</text>;
    case "table": {
      if (!finitePoint(data.center)) return null;
      const size = tableSize(data);
      const rows = Math.max(1, Number(data.data?.rows) || data.data?.cells?.length || 2);
      const cols = Math.max(1, Number(data.data?.cols) || data.data?.cells?.[0]?.length || 2);
      const left = data.center.x - size.width / 2;
      const top = data.center.y - size.height / 2;
      return <g transform={`rotate(${(Number(data.rotationRad) || 0) * 180 / Math.PI} ${data.center.x} ${data.center.y})`} fill="none" stroke="currentColor" strokeWidth="0.75" vectorEffect="non-scaling-stroke">
        <rect x={left} y={top} width={size.width} height={size.height} />
        {Array.from({ length: cols - 1 }, (_, column) => <line key={`c-${index}-${column}`} x1={left + size.width * (column + 1) / cols} y1={top} x2={left + size.width * (column + 1) / cols} y2={top + size.height} />)}
        {Array.from({ length: rows - 1 }, (_, row) => <line key={`r-${index}-${row}`} x1={left} y1={top + size.height * (row + 1) / rows} x2={left + size.width} y2={top + size.height * (row + 1) / rows} />)}
      </g>;
    }
  }
}

export function LibraryGeometryPreview({ geometry, label, className = "" }: Props) {
  const markerId = useId().replace(/:/g, "");
  const bounds = useMemo(() => geometryBounds(geometry), [geometry]);
  const width = Math.max(0.01, bounds.maxX - bounds.minX);
  const height = Math.max(0.01, bounds.maxY - bounds.minY);
  const pad = Math.max(width, height) * 0.12;

  return (
    <div className={`library-preview ${className}`} role="img" aria-label={`2D-Vorschau: ${label}`}>
      {geometry.length > 0 ? (
        <svg viewBox={`${bounds.minX - pad} ${bounds.minY - pad} ${width + pad * 2} ${height + pad * 2}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id={markerId} markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse">
              <path d="M 0 0 L 5 2.5 L 0 5 Z" fill="context-stroke" />
            </marker>
          </defs>
          {geometry.map((snapshot, index) => <SnapshotShape key={`${snapshot.kind}-${index}`} snapshot={snapshot} index={index} markerId={markerId} />)}
        </svg>
      ) : <Boxes className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
    </div>
  );
}

export default LibraryGeometryPreview;