/**
 * CadOverlayLayer — React mount point for the embedded MiniCad engine.
 *
 * Renders an absolutely positioned <canvas> over the page plus the DOM hosts
 * required by LineHub and PointEditMenu. The CAD engine is created on mount,
 * receives zoom updates on prop changes, and persists scene state to the
 * project store on every geometry change.
 *
 * pointer-events is gated by `enabled`: when no CAD tool is active the
 * overlay is fully click-through so the user can still interact with regular
 * page elements beneath.
 */
import { useEffect, useRef } from "react";
import { MiniCad, type MiniTool } from "@/cad/embed/MiniCad";
import { PointEditAction } from "@/cad/constants";

interface Props {
  pageWidthMm: number;
  pageHeightMm: number;
  basePxPerMm: number;
  zoom: number; // 1.0 = 100%
  activeTool: MiniTool;
  enabled: boolean; // pointer-events on/off
  initialState?: any;
  onChange: (state: any) => void;
  lineColor?: string;
  lineThicknessMm?: number;
  /** Linien-Transparenz, 0..1 (1 = vollständig deckend). */
  lineAlpha?: number;
}

export default function CadOverlayLayer({
  pageWidthMm,
  pageHeightMm,
  basePxPerMm,
  zoom,
  activeTool,
  enabled,
  initialState,
  onChange,
  lineColor,
  lineThicknessMm,
  lineAlpha,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const hubLenRef = useRef<HTMLInputElement>(null);
  const hubAngRef = useRef<HTMLInputElement>(null);
  const peRef = useRef<HTMLDivElement>(null);
  const peMoveRef = useRef<HTMLButtonElement>(null);
  const peTranslateRef = useRef<HTMLButtonElement>(null);
  const peRotateRef = useRef<HTMLButtonElement>(null);
  const peDeleteRef = useRef<HTMLButtonElement>(null);
  const peOffsetRef = useRef<HTMLButtonElement>(null);

  const engineRef = useRef<MiniCad | null>(null);
  // Latest onChange in a ref so the engine can call it without re-creating.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount engine once per page-size combination.
  useEffect(() => {
    if (
      !canvasRef.current || !hubRef.current || !hubLenRef.current || !hubAngRef.current ||
      !peRef.current || !peMoveRef.current || !peTranslateRef.current ||
      !peRotateRef.current || !peDeleteRef.current || !peOffsetRef.current
    ) return;

    const engine = new MiniCad({
      dom: {
        canvas: canvasRef.current,
        hubRoot: hubRef.current,
        hubLenInput: hubLenRef.current,
        hubAngInput: hubAngRef.current,
        pointEditRoot: peRef.current,
        pointEditButtons: {
          [PointEditAction.MOVE]: peMoveRef.current,
          [PointEditAction.TRANSLATE]: peTranslateRef.current,
          [PointEditAction.ROTATE]: peRotateRef.current,
          [PointEditAction.DELETE]: peDeleteRef.current,
          [PointEditAction.OFFSET]: peOffsetRef.current,
        },
      },
      pageWidthMm,
      pageHeightMm,
      basePxPerMm,
      initialZoom: zoom,
      initialState,
      onChange: () => onChangeRef.current(engine.serialize()),
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // We intentionally do NOT depend on `initialState` here — the engine owns
    // scene state after mount; re-mounting would wipe in-progress drawings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidthMm, pageHeightMm, basePxPerMm]);

  // Zoom updates.
  useEffect(() => {
    engineRef.current?.applyZoom(zoom);
  }, [zoom]);

  // Tool switches.
  useEffect(() => {
    engineRef.current?.setActiveTool(activeTool);
  }, [activeTool]);

  // Line defaults.
  useEffect(() => {
    engineRef.current?.setLineDefaults({
      color: lineColor,
      thicknessM: typeof lineThicknessMm === "number" ? lineThicknessMm / 1000 : undefined,
    });
  }, [lineColor, lineThicknessMm]);


  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: enabled ? "auto" : "none" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          // width/height set by MiniCad.applyZoom in CSS pixels
          background: "transparent",
        }}
      />
      {/* LineHub */}
      <div
        ref={hubRef}
        className="hidden"
        style={{
          position: "absolute",
          background: "white",
          border: "1px solid hsl(var(--hairline))",
          borderRadius: 6,
          padding: 6,
          boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
          display: "flex",
          gap: 6,
          zIndex: 50,
        }}
      >
        <input
          ref={hubLenRef}
          type="text"
          readOnly
          style={{ width: 72, fontSize: 11, padding: "2px 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4 }}
        />
        <input
          ref={hubAngRef}
          type="text"
          readOnly
          style={{ width: 56, fontSize: 11, padding: "2px 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4 }}
        />
      </div>
      {/* PointEditMenu */}
      <div
        ref={peRef}
        className="hidden"
        style={{
          position: "absolute",
          background: "white",
          border: "1px solid hsl(var(--hairline))",
          borderRadius: 6,
          padding: 4,
          boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
          display: "flex",
          gap: 2,
          zIndex: 50,
        }}
      >
        <button ref={peMoveRef} style={pointEditBtn}>↔</button>
        <button ref={peTranslateRef} style={pointEditBtn}>⇄</button>
        <button ref={peRotateRef} style={pointEditBtn}>⟳</button>
        <button ref={peOffsetRef} style={pointEditBtn}>±</button>
        <button ref={peDeleteRef} style={pointEditBtn}>✕</button>
      </div>
    </div>
  );
}

const pointEditBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  fontSize: 12,
  border: "1px solid hsl(var(--hairline))",
  borderRadius: 4,
  background: "white",
  cursor: "pointer",
};
