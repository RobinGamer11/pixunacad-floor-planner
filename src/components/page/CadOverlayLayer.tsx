/**
 * CadOverlayLayer — React mount point for the embedded MiniCad engine.
 *
 * Hosts the CAD <canvas>, plus DOM hosts required by LineHub, PointEditMenu,
 * and the inline TextEditorOverlay. pointer-events is gated by `enabled`.
 */
import { useEffect, useRef } from "react";
import { MiniCad, type MiniTool } from "@/cad/embed/MiniCad";
import { PointEditAction } from "@/cad/constants";

interface Props {
  pageWidthMm: number;
  pageHeightMm: number;
  basePxPerMm: number;
  /** Page margins in mm (snap-only frame). */
  pageMarginsMm?: number;
  zoom: number;
  activeTool: MiniTool;
  enabled: boolean;
  initialState?: any;
  onChange: (state: any) => void;
  // Line defaults
  lineColor?: string;
  lineThicknessMm?: number;
  lineAlpha?: number;
  // Text defaults
  textColor?: string;
  textFontSizePx?: number;
  textBold?: boolean;
  textItalic?: boolean;
  textAlpha?: number;
  textAlign?: "left" | "center" | "right";
  textBgColor?: string;
  textBgAlphaPct?: number;
  textWrap?: boolean;
  textBorderEnabled?: boolean;
  textBorderColor?: string;
  textBorderWidthPx?: number;
}

export default function CadOverlayLayer(props: Props) {
  const {
    pageWidthMm, pageHeightMm, basePxPerMm, pageMarginsMm,
    zoom, activeTool, enabled, initialState, onChange,
    lineColor, lineThicknessMm, lineAlpha,
    textColor, textFontSizePx, textBold, textItalic, textAlpha, textAlign,
    textBgColor, textBgAlphaPct, textWrap, textBorderEnabled, textBorderColor, textBorderWidthPx,
  } = props;

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
  // Text editor DOM
  const teEditorRef = useRef<HTMLDivElement>(null);
  const teToolbarRef = useRef<HTMLDivElement>(null);
  const teBoldRef = useRef<HTMLButtonElement>(null);
  const teItalicRef = useRef<HTMLButtonElement>(null);
  const teColorRef = useRef<HTMLInputElement>(null);
  const teSizeRef = useRef<HTMLSelectElement>(null);
  const teSymbolRef = useRef<HTMLSelectElement>(null);

  const engineRef = useRef<MiniCad | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount engine once per page-size combination.
  useEffect(() => {
    if (
      !canvasRef.current || !hubRef.current || !hubLenRef.current || !hubAngRef.current ||
      !peRef.current || !peMoveRef.current || !peTranslateRef.current ||
      !peRotateRef.current || !peDeleteRef.current || !peOffsetRef.current ||
      !teEditorRef.current || !teToolbarRef.current || !teBoldRef.current ||
      !teItalicRef.current || !teColorRef.current || !teSizeRef.current || !teSymbolRef.current
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
        textEditor: {
          editor: teEditorRef.current,
          toolbar: teToolbarRef.current,
          boldBtn: teBoldRef.current,
          italicBtn: teItalicRef.current,
          colorInput: teColorRef.current,
          sizeSelect: teSizeRef.current,
          symbolSelect: teSymbolRef.current,
        },
      },
      pageWidthMm,
      pageHeightMm,
      basePxPerMm,
      pageMarginsMm,
      initialZoom: zoom,
      initialState,
      onChange: () => onChangeRef.current(engine.serialize()),
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidthMm, pageHeightMm, basePxPerMm]);

  useEffect(() => { engineRef.current?.applyZoom(zoom); }, [zoom]);
  useEffect(() => { engineRef.current?.setActiveTool(activeTool); }, [activeTool]);
  useEffect(() => {
    if (typeof pageMarginsMm === "number") engineRef.current?.setPageMargins(pageMarginsMm);
  }, [pageMarginsMm]);

  useEffect(() => {
    engineRef.current?.setLineDefaults({
      color: lineColor,
      thicknessM: typeof lineThicknessMm === "number" ? lineThicknessMm / 1000 : undefined,
      alpha: typeof lineAlpha === "number" ? lineAlpha : undefined,
    });
  }, [lineColor, lineThicknessMm, lineAlpha]);

  useEffect(() => {
    engineRef.current?.setTextDefaults({
      color: textColor,
      fontSizePx: textFontSizePx,
      bold: textBold,
      italic: textItalic,
      alpha: textAlpha,
      align: textAlign,
      bgColor: textBgColor,
      bgAlphaPct: textBgAlphaPct,
      wrap: textWrap,
      borderEnabled: textBorderEnabled,
      borderColor: textBorderColor,
      borderWidthPx: textBorderWidthPx,
    });
  }, [textColor, textFontSizePx, textBold, textItalic, textAlpha, textAlign,
      textBgColor, textBgAlphaPct, textWrap, textBorderEnabled, textBorderColor, textBorderWidthPx]);

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: enabled ? "auto" : "none", zIndex: 30 }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
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
          gap: 6,
          zIndex: 50,
        }}
      >
        <input ref={hubLenRef} type="text" readOnly
          style={{ width: 72, fontSize: 11, padding: "2px 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4 }} />
        <input ref={hubAngRef} type="text" readOnly
          style={{ width: 56, fontSize: 11, padding: "2px 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4 }} />
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
      {/* TextEditor (contenteditable) + toolbar */}
      <div
        ref={teEditorRef}
        className="hidden"
        style={{ zIndex: 60 }}
      />
      <div
        ref={teToolbarRef}
        className="hidden"
        style={{
          position: "absolute",
          background: "white",
          border: "1px solid hsl(var(--hairline))",
          borderRadius: 6,
          padding: "4px 6px",
          boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
          gap: 4,
          alignItems: "center",
          zIndex: 70,
        }}
      >
        <button ref={teBoldRef} style={{ ...toolbarBtn, fontWeight: 700 }} title="Fett">B</button>
        <button ref={teItalicRef} style={{ ...toolbarBtn, fontStyle: "italic" }} title="Kursiv">I</button>
        <input ref={teColorRef} type="color" defaultValue="#111111"
          style={{ width: 26, height: 22, padding: 0, border: "1px solid hsl(var(--hairline))", borderRadius: 4, background: "white" }} />
        <select ref={teSizeRef} defaultValue="16"
          style={{ height: 22, fontSize: 11, padding: "0 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4, background: "white" }}>
          {[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64].map((s) => (
            <option key={s} value={String(s)}>{s} px</option>
          ))}
        </select>
        <select ref={teSymbolRef} defaultValue=""
          style={{ height: 22, fontSize: 11, padding: "0 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4, background: "white" }}>
          <option value="">⚙ Symbol</option>
          <option value="°">° Grad</option>
          <option value="±">± Plus/Minus</option>
          <option value="Ø">Ø Durchmesser</option>
          <option value="≈">≈ Ungefähr</option>
          <option value="≤">≤ Kleiner-gleich</option>
          <option value="≥">≥ Größer-gleich</option>
          <option value="×">× Mal</option>
          <option value="→">→ Pfeil</option>
        </select>
      </div>
      {/* TextHub — Breite / Höhe / Drehung / X / Y (mm) für ausgewählte Textbox */}
      <div
        ref={thRef}
        className="hidden"
        style={{
          position: "absolute",
          background: "white",
          border: "1px solid hsl(var(--hairline))",
          borderRadius: 6,
          padding: 6,
          boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
          gap: 4,
          alignItems: "center",
          zIndex: 50,
        }}
        title="Tab = Bearbeiten · Enter = Übernehmen · Esc = abbrechen"
      >
        <input ref={thWRef} type="text" readOnly title="Breite (mm)"
          style={hubInput} />
        <span style={hubSep}>×</span>
        <input ref={thHRef} type="text" readOnly title="Höhe (mm)"
          style={hubInput} />
        <span style={hubSep}>·</span>
        <input ref={thRRef} type="text" readOnly title="Drehung (°)"
          style={{ ...hubInput, width: 52 }} />
        <span style={hubSep}>@</span>
        <input ref={thXRef} type="text" readOnly title="X (mm, links)"
          style={hubInput} />
        <span style={hubSep}>,</span>
        <input ref={thYRef} type="text" readOnly title="Y (mm, oben)"
          style={hubInput} />
      </div>
    </div>
  );
}

const hubInput: React.CSSProperties = {
  width: 64, fontSize: 11, padding: "2px 4px",
  border: "1px solid hsl(var(--hairline))", borderRadius: 4,
};
const hubSep: React.CSSProperties = {
  fontSize: 11, color: "hsl(var(--ink-soft))", padding: "0 1px",
};

const pointEditBtn: React.CSSProperties = {
  width: 24, height: 24, fontSize: 12,
  border: "1px solid hsl(var(--hairline))",
  borderRadius: 4, background: "white", cursor: "pointer",
};
const toolbarBtn: React.CSSProperties = {
  width: 26, height: 22, fontSize: 12,
  border: "1px solid hsl(var(--hairline))",
  borderRadius: 4, background: "white", cursor: "pointer", lineHeight: 1,
};
