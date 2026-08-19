/**
 * CadOverlayLayer — React mount point for the embedded MiniCad engine.
 *
 * Hosts the CAD <canvas>, plus DOM hosts required by LineHub, PointEditMenu,
 * and the inline TextEditorOverlay. pointer-events is gated by `enabled`.
 *
 * Zusätzlich: rendert die Hub-Box für externe Dokumente (Projektmappen-
 * PDFs/Bilder) — analog zur Hub-Box in der CAD-Hauptseite (Move/Rotate).
 */
import { useEffect, useRef, useState } from "react";
import { Move, RotateCw, Scaling, Scissors } from "lucide-react";
import { MiniCad, type MiniTool } from "@/cad/embed/MiniCad";
import { projectStore } from "@/lib/projectStore";
import type { MiniCadSelectionInfo } from "@/cad/embed/MiniCad";
import type { HatchDrawMode } from "@/cad/HatchTool";
import { PointEditAction } from "@/cad/constants";

export type ExternalDocSpec = {
  id: string;
  xMM: number; yMM: number; wMM: number; hMM: number;
  rotationRad?: number;
  guideEdges?: { top: boolean; right: boolean; bottom: boolean; left: boolean };
};

interface Props {
  pageWidthMm: number;
  pageHeightMm: number;
  basePxPerMm: number;
  pageMarginsMm?: number;
  zoom: number;
  activeTool: MiniTool;
  enabled: boolean;
  initialState?: any;
  /**
   * Zähler, der bei jedem externen Szenen-Reset (Undo/Redo aus der Projekt-
   * Historie) erhöht wird. Ändert er sich, lädt die Engine `initialState` neu.
   */
  restoreToken?: number;
  onChange: (state: any) => void;
  onSelectionChange?: (info: MiniCadSelectionInfo | null, count?: number) => void;
  onEngineReady?: (api: {
    setSelectedSegmentSnap: (opts: { midpointSnap?: boolean; divisionSnap?: number | null }) => void;
    duplicateSelectedSegments: (offsetMm?: number) => number;
    engine: MiniCad;
  }) => void;

  /**
   * Externe Dokumente (Projektmappen-PDF/Bild) als snap-only DocumentObjects.
   * Bekommen Ecken-Marker, Kanten-Hilfslinien und Hub-Box. mm-Koords.
   */
  externalDocs?: ExternalDocSpec[];
  /** Callback bei Hub-Verschiebung/-Drehung oder Hilfslinien-Toggle. */
  onExternalDocChange?: (
    id: string,
    t: { xMM: number; yMM: number; wMM: number; hMM: number; rotationDeg: number; guideEdges: { top: boolean; right: boolean; bottom: boolean; left: boolean } },
  ) => void;
  /** Callback, wenn ein externes Projektmappen-Dokument über ENTF/Kopf gelöscht wird. */
  onExternalDocDelete?: (id: string) => void;

  lineColor?: string;
  lineThicknessMm?: number;
  lineAlpha?: number;
  guideColor?: string;
  guidesLocked?: boolean;
  multiSelectMode?: boolean;
  selectMarqueeMode?: "touch" | "enclose" | "click";

  textColor?: string;
  textFontSizePx?: number;
  textBold?: boolean;
  textItalic?: boolean;
  textUnderline?: boolean;
  textStrike?: boolean;
  textLineHeightPct?: number;
  textAlpha?: number;
  textAlign?: "left" | "center" | "right";
  textBgColor?: string;
  textBgAlphaPct?: number;
  textWrap?: boolean;
  textAutoSize?: boolean;
  textBorderEnabled?: boolean;
  textBorderColor?: string;
  textBorderWidthPx?: number;

  hatchDrawMode?: HatchDrawMode;

  /**
   * Optionale CAD-State einer Hintergrundseite (Transparenzpause). Deren
   * Segmente/Freistriche/Hatch-Umrisse werden als unsichtbare Snap-Kanten
   * in die aktive Engine übernommen, sodass Fangpunkte anvisiert werden können.
   */
  ghostSnapState?: any;

  /** Radier-Hook: Zentrum/Radius in Welt-Metern (= Papier-mm / 1000). */
  onEraseWorld?: (
    center: { x: number; y: number },
    radiusM: number,
    mode: "hard" | "smooth",
    softness: number,
    strength: number,
  ) => void;

}

export default function CadOverlayLayer(props: Props) {
  const {
    pageWidthMm, pageHeightMm, basePxPerMm, pageMarginsMm,
    zoom, activeTool, enabled, initialState, restoreToken, onChange, onSelectionChange, onEngineReady,
    externalDocs, onExternalDocChange, onExternalDocDelete,
    lineColor, lineThicknessMm, lineAlpha, guideColor, guidesLocked, multiSelectMode, selectMarqueeMode,
    textColor, textFontSizePx, textBold, textItalic, textUnderline, textStrike, textLineHeightPct, textAlpha, textAlign,
    textBgColor, textBgAlphaPct, textWrap, textAutoSize, textBorderEnabled, textBorderColor, textBorderWidthPx,
    hatchDrawMode,
    ghostSnapState,
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const hubLenRef = useRef<HTMLInputElement>(null);
  const hubAngRef = useRef<HTMLInputElement>(null);
  const peRef = useRef<HTMLDivElement>(null);
  const peMoveRef = useRef<HTMLButtonElement>(null);
  const peTranslateRef = useRef<HTMLButtonElement>(null);
  const peRotateRef = useRef<HTMLButtonElement>(null);
  const peOffsetRef = useRef<HTMLButtonElement>(null);
  const peInsertPointRef = useRef<HTMLButtonElement>(null);
  const peBulgeRef = useRef<HTMLButtonElement>(null);
  const peResizeRef = useRef<HTMLButtonElement>(null);
  const peDuplicateRef = useRef<HTMLButtonElement>(null);
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
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onExternalDocChangeRef = useRef(onExternalDocChange);
  onExternalDocChangeRef.current = onExternalDocChange;
  const onExternalDocDeleteRef = useRef(onExternalDocDelete);
  onExternalDocDeleteRef.current = onExternalDocDelete;

  // Hub-Box state (mirrors engine.documentHubState).
  const [docHub, setDocHub] = useState<{ visible: boolean; screenX: number; screenY: number; docId: string | null; mode: "none" | "move" | "rotate" | "scale" | "crop"; cropSide: "top" | "right" | "bottom" | "left" | null }>({ visible: false, screenX: 0, screenY: 0, docId: null, mode: "none", cropSide: null });
  const [docHubDx, setDocHubDx] = useState<string>("0.000");
  const [docHubDy, setDocHubDy] = useState<string>("0.000");
  const [docHubRot, setDocHubRot] = useState<string>("0");
  const [docHubScale, setDocHubScale] = useState<string>("1.000");

  useEffect(() => {
    if (
      !canvasRef.current || !hubRef.current || !hubLenRef.current || !hubAngRef.current ||
      !peRef.current || !peMoveRef.current || !peTranslateRef.current ||
      !peRotateRef.current || !peOffsetRef.current ||
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
          [PointEditAction.OFFSET]: peOffsetRef.current,
          [PointEditAction.INSERT_POINT]: peInsertPointRef.current!,
          [PointEditAction.BULGE]: peBulgeRef.current!,
          [PointEditAction.RESIZE]: peResizeRef.current!,
          [PointEditAction.DUPLICATE]: peDuplicateRef.current!,
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
      onSelectionChange: (info, count) => onSelectionChangeRef.current?.(info, count),
    });
    engineRef.current = engine;
    onEngineReady?.({
      setSelectedSegmentSnap: (opts) => engine.setSelectedSegmentSnapSettings(opts),
      duplicateSelectedSegments: (offsetMm) => engine.duplicateSelectedSegments(offsetMm),
      engine,
    });

    // Hub-Box-Polling synchron zum Render-Tick.
    let raf = 0;
    const tick = () => {
      const e = engineRef.current;
      if (e) {
        const hs = e.documentHubState;
        setDocHub(prev => {
          if (!hs?.visible) {
              return prev.visible ? { visible: false, screenX: 0, screenY: 0, docId: null, mode: "none", cropSide: null } : prev;
          }
          const cropSide = (hs as any).cropSide ?? null;
          if (prev.visible && prev.docId === hs.docId && prev.cropSide === cropSide && Math.abs(prev.screenX - hs.screenX) < 0.5 && Math.abs(prev.screenY - hs.screenY) < 0.5) return prev;
          return { visible: true, screenX: hs.screenX, screenY: hs.screenY, docId: hs.docId, mode: prev.docId === hs.docId ? prev.mode : "none", cropSide };
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageWidthMm, pageHeightMm, basePxPerMm]);

  // Externer Szenen-Reset (Undo/Redo): aktuellen Stand in die Engine laden.
  const initialStateRef = useRef(initialState);
  initialStateRef.current = initialState;
  const lastRestoreRef = useRef<number | undefined>(restoreToken);
  useEffect(() => {
    if (restoreToken === undefined) return;
    if (lastRestoreRef.current === restoreToken) return;
    lastRestoreRef.current = restoreToken;
    engineRef.current?.loadState(initialStateRef.current ?? null);
  }, [restoreToken]);

  // Undo/Redo aus der Projekt-Historie: Tick setzen, damit der Effekt unten
  // NACH dem Re-Render (also mit dem wiederhergestellten initialState) läuft.
  const [restoreTick, setRestoreTick] = useState(0);
  useEffect(() => {
    const unsub = projectStore.subscribeHistoryRestore(() => setRestoreTick((t) => t + 1));
    return () => { unsub?.(); };
  }, []);
  const firstRestoreTick = useRef(true);
  useEffect(() => {
    if (firstRestoreTick.current) { firstRestoreTick.current = false; return; }
    engineRef.current?.loadState(initialStateRef.current ?? null);
  }, [restoreTick]);

  useEffect(() => { engineRef.current?.applyZoom(zoom); }, [zoom]);

  // PDF-Export: Backing-Store der CAD-Zeichenfläche temporär hochskalieren,
  // damit der Snapshot nicht verpixelt.
  useEffect(() => {
    const onScale = (ev: Event) => {
      const k = (ev as CustomEvent<number>).detail ?? 1;
      engineRef.current?.setRenderScale(k);
      // Auch bei unverändertem Faktor sicherstellen, dass ein aktueller
      // Frame auf der Zeichenfläche liegt, bevor der Snapshot entsteht.
      engineRef.current?.renderNow();
    };
    window.addEventListener("pixuna:export-render-scale", onScale as EventListener);
    return () => window.removeEventListener("pixuna:export-render-scale", onScale as EventListener);
  }, []);
  useEffect(() => { engineRef.current?.setActiveTool(activeTool); }, [activeTool]);
  // Radier-Hook: externe Seiten-Objekte (CAD-Blatt) mitradieren.
  const onEraseWorldRef = useRef(props.onEraseWorld);
  onEraseWorldRef.current = props.onEraseWorld;
  useEffect(() => {
    const e: any = engineRef.current;
    if (e) e.onEraseStroke = (c: any, r: number, mode: any, soft: number, strength: number) =>
      onEraseWorldRef.current?.(c, r, mode, soft, strength);
  });

  useEffect(() => {
    const engine: any = engineRef.current;
    if (engine) {
      engine.documentHubMode = docHub.mode;
      const tabletTransform = docHub.mode !== "none" && !!(window as any).__pixunaTabletCommit;
      engine.selectTool.documentHubTabletArmed = tabletTransform;
      (window as any).__pixunaDocumentTransformActive = tabletTransform;
    }
    return () => {
      if ((window as any).__pixunaDocumentTransformActive) {
        (window as any).__pixunaDocumentTransformActive = false;
      }
    };
  }, [docHub.mode]);
  useEffect(() => {
    if (hatchDrawMode) engineRef.current?.hatchTool.setDrawMode(hatchDrawMode);
  }, [hatchDrawMode, activeTool]);
  useEffect(() => {
    if (typeof pageMarginsMm === "number") engineRef.current?.setPageMargins(pageMarginsMm);
  }, [pageMarginsMm]);

  // Ghost-Snap: Segmente/Punkte einer Hintergrundseite als unsichtbare Snap-Kanten.
  const ghostKey = ghostSnapState ? JSON.stringify(ghostSnapState) : "";
  useEffect(() => {
    engineRef.current?.setGhostSnapState(ghostSnapState ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostKey]);

  // Externe Dokumente (Projektmappen-PDF/Bild) synchronisieren — inkl. Callback.
  const extDocsKey = JSON.stringify(externalDocs ?? []);
  useEffect(() => {
    engineRef.current?.setExternalDocuments(
      externalDocs ?? [],
      (id, t) => onExternalDocChangeRef.current?.(id, t),
      (id) => onExternalDocDeleteRef.current?.(id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extDocsKey]);

  useEffect(() => {
    engineRef.current?.setLineDefaults({
      color: lineColor,
      thicknessM: typeof lineThicknessMm === "number" ? lineThicknessMm / 1000 : undefined,
      alpha: typeof lineAlpha === "number" ? lineAlpha : undefined,
    });
  }, [lineColor, lineThicknessMm, lineAlpha]);

  useEffect(() => {
    if (typeof guideColor === "string") engineRef.current?.setGuideColor(guideColor);
  }, [guideColor]);

  useEffect(() => {
    engineRef.current?.setGuidesLocked(!!guidesLocked);
  }, [guidesLocked]);

  useEffect(() => {
    engineRef.current?.setMultiSelectMode(!!multiSelectMode);
  }, [multiSelectMode]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine && selectMarqueeMode) engine.selectTool.marqueeMode = selectMarqueeMode;
  }, [selectMarqueeMode]);

  useEffect(() => {
    engineRef.current?.setTextDefaults({
      color: textColor,
      fontSizePx: textFontSizePx,
      bold: textBold,
      italic: textItalic,
      underline: textUnderline,
      strike: textStrike,
      lineHeightPct: textLineHeightPct,
      alpha: textAlpha,
      align: textAlign,
      bgColor: textBgColor,
      bgAlphaPct: textBgAlphaPct,
      wrap: textWrap,
      autoSize: textAutoSize,
      borderEnabled: textBorderEnabled,
      borderColor: textBorderColor,
      borderWidthPx: textBorderWidthPx,
    });
  }, [textColor, textFontSizePx, textBold, textItalic, textUnderline, textStrike, textLineHeightPct, textAlpha, textAlign,
      textBgColor, textBgAlphaPct, textWrap, textAutoSize, textBorderEnabled, textBorderColor, textBorderWidthPx]);

  const closeDocHub = () => {
    const e: any = engineRef.current;
    if (e) {
      e.documentHubMode = "none";
      e.documentHubState = { visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null };
    }
    setDocHub({ visible: false, screenX: 0, screenY: 0, docId: null, mode: "none", cropSide: null });
  };

  const applyMove = () => {
    const dx = parseFloat(docHubDx.replace(",", "."));
    const dy = parseFloat(docHubDy.replace(",", "."));
    const e = engineRef.current;
    if (e && docHub.docId && Number.isFinite(dx) && Number.isFinite(dy)) {
      const doc = e.scene.getDocumentById(docHub.docId);
      if (doc) {
        doc.position.x += dx;
        doc.position.y += dy;
        setDocHubDx("0.000"); setDocHubDy("0.000");
        closeDocHub();
      }
    }
  };

  const applyRotate = () => {
    const deg = parseFloat(docHubRot.replace(",", "."));
    const e = engineRef.current;
    if (e && docHub.docId && Number.isFinite(deg)) {
      const doc = e.scene.getDocumentById(docHub.docId);
      if (doc) {
        doc.rotationRad = (deg * Math.PI) / 180;
        closeDocHub();
      }
    }
  };

  const applyScale = () => {
    const f = parseFloat(docHubScale.replace(",", "."));
    const e = engineRef.current;
    if (e && docHub.docId && Number.isFinite(f) && f > 0) {
      const doc = e.scene.getDocumentById(docHub.docId);
      if (doc) {
        const cx = doc.position.x + doc.widthM / 2;
        const cy = doc.position.y + doc.heightM / 2;
        doc.widthM = Math.max(0.001, doc.widthM * f);
        doc.heightM = Math.max(0.001, doc.heightM * f);
        doc.position.x = cx - doc.widthM / 2;
        doc.position.y = cy - doc.heightM / 2;
        setDocHubScale("1.000");
        closeDocHub();
      }
    }
  };

  // cycleAnchor entfernt — der Hub-Button „Anker wechseln" wurde aus dem UI
  // genommen, damit der Dokumenten-Hub kompakt bleibt.
  void 0;


  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: enabled ? "auto" : "none" }}
    >
      <div style={{ position: "absolute", left: -16, top: -16, width: 0, height: 0 }}>
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", left: 0, top: 0, background: "transparent" }}
        />
        {/* Document Hub: Anker · Verschieben · Drehen · Skalieren — analog CadEditor */}
        {docHub.visible && (
          <div
            data-hub-control
            style={{
              position: "absolute",
              left: Math.max(8, docHub.screenX + 12),
              top: Math.max(8, docHub.screenY + 12),
              background: "white",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              padding: "6px 8px",
              boxShadow: "0 4px 16px -4px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              zIndex: 55,
              pointerEvents: "auto",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* „Anker wechseln" wurde entfernt (Wunsch: erste HUB-Funktion raus). */}
            <button
              type="button"
              title="Verschieben (Δx, Δy in m)"
              onClick={() => setDocHub(h => ({ ...h, mode: h.mode === "move" ? "none" : "move" }))}
              style={{ ...hubBtnStyle, background: docHub.mode === "move" ? "hsl(var(--accent))" : "white" }}
            >
              <Move size={14} strokeWidth={1.6} className="shrink-0" />
            </button>
            {docHub.mode === "move" && (
              <>
                <input type="text" value={docHubDx} onChange={(e) => setDocHubDx(e.target.value)}
                  data-hub-control
                  onKeyDown={(e) => { if (e.key === "Enter") applyMove(); else if (e.key === "Escape") closeDocHub(); }}
                  style={hubInputStyle} title="Δx (m)" placeholder="Δx" />
                <input type="text" value={docHubDy} onChange={(e) => setDocHubDy(e.target.value)}
                  data-hub-control
                  onKeyDown={(e) => { if (e.key === "Enter") applyMove(); else if (e.key === "Escape") closeDocHub(); }}
                  style={hubInputStyle} title="Δy (m)" placeholder="Δy" />
                <span style={{ fontSize: 10, opacity: 0.6 }}>m</span>
              </>
            )}
            <button
              type="button"
              title="Drehen (Winkel in Grad)"
              onClick={() => {
                const e = engineRef.current;
                if (e && docHub.docId) {
                  const doc = e.scene.getDocumentById(docHub.docId);
                  if (doc) setDocHubRot(((doc.rotationRad * 180 / Math.PI) % 360).toFixed(1));
                }
                setDocHub(h => ({ ...h, mode: h.mode === "rotate" ? "none" : "rotate" }));
              }}
              style={{ ...hubBtnStyle, background: docHub.mode === "rotate" ? "hsl(var(--accent))" : "white" }}
            >
              <RotateCw size={14} />
            </button>
            {docHub.mode === "rotate" && (
              <>
                <input type="text" value={docHubRot} onChange={(e) => setDocHubRot(e.target.value)}
                  data-hub-control
                  onKeyDown={(e) => { if (e.key === "Enter") applyRotate(); else if (e.key === "Escape") closeDocHub(); }}
                  style={{ ...hubInputStyle, width: 64 }} title="Drehwinkel absolut (°)" placeholder="°" />
                <span style={{ fontSize: 10, opacity: 0.6 }}>°</span>
              </>
            )}
            <button
              type="button"
              title="Skalieren (Faktor um Zentrum)"
              onClick={() => setDocHub(h => ({ ...h, mode: h.mode === "scale" ? "none" : "scale" }))}
              style={{ ...hubBtnStyle, background: docHub.mode === "scale" ? "hsl(var(--accent))" : "white" }}
            >
              <Scaling size={14} />
            </button>
            {docHub.mode === "scale" && (
              <>
                <input type="text" value={docHubScale} onChange={(e) => setDocHubScale(e.target.value)}
                  data-hub-control
                  onKeyDown={(e) => { if (e.key === "Enter") applyScale(); else if (e.key === "Escape") closeDocHub(); }}
                  style={{ ...hubInputStyle, width: 64 }} title="Skalierungsfaktor (× um Zentrum)" placeholder="×" />
                <span style={{ fontSize: 10, opacity: 0.6 }}>×</span>
              </>
            )}
            {docHub.cropSide && (
              <button
                type="button"
                title={`Kante "${docHub.cropSide}" zuschneiden (Klick auf Canvas setzt neue Kante)`}
                onClick={() => setDocHub(h => ({ ...h, mode: h.mode === "crop" ? "none" : "crop" }))}
                style={{ ...hubBtnStyle, background: docHub.mode === "crop" ? "hsl(var(--accent))" : "white" }}
              >
                <Scissors size={14} />
              </button>
            )}
          </div>
        )}
        {/* LineHub */}
        <div
          ref={hubRef}
          data-hub-control
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
          <input ref={hubLenRef} data-hub-control type="text" readOnly
            style={{ width: 72, fontSize: 11, padding: "2px 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4 }} />
          <input ref={hubAngRef} data-hub-control type="text" readOnly
            style={{ width: 56, fontSize: 11, padding: "2px 4px", border: "1px solid hsl(var(--hairline))", borderRadius: 4 }} />
        </div>
        {/* PointEditMenu */}
        <div
          ref={peRef}
          data-hub-control
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
          <button ref={peMoveRef} type="button" data-hub-control style={pointEditBtn} title="Bewegen" aria-label="Bewegen">↔</button>
          <button ref={peTranslateRef} type="button" data-hub-control style={pointEditBtn} title="Verschieben" aria-label="Verschieben"><Move size={14} strokeWidth={1.6} className="shrink-0" /></button>
          <button ref={peRotateRef} type="button" data-hub-control style={pointEditBtn} title="Drehen" aria-label="Drehen">⟳</button>
          <button ref={peOffsetRef} data-hub-control style={pointEditBtn} title="Kante rein-/rausziehen">⇆</button>
          <button ref={peInsertPointRef} data-hub-control style={pointEditBtn} title="Neuen Fangpunkt auf der Kante setzen">＋</button>
          <button ref={peBulgeRef} data-hub-control style={pointEditBtn} title="Kante wölben (rein-/rauswölben)">◠</button>
          <button ref={peResizeRef} data-hub-control style={pointEditBtn} title="Box vergrößern/verkleinern">⤡</button>
          <button ref={peDuplicateRef} data-hub-control style={pointEditBtn} title="Duplizieren">⎘</button>
        </div>
        {/* TextEditor (contenteditable) + toolbar */}
        <div ref={teEditorRef} className="hidden" style={{ zIndex: 60 }} />
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
      </div>
    </div>
  );
}


const pointEditBtn: React.CSSProperties = {
  width: 24, height: 24, fontSize: 12, padding: 0, lineHeight: 1,
  border: "1px solid hsl(var(--hairline))",
  borderRadius: 4, background: "white", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const toolbarBtn: React.CSSProperties = {
  width: 26, height: 22, fontSize: 12, padding: 0,
  border: "1px solid hsl(var(--hairline))",
  borderRadius: 4, background: "white", cursor: "pointer", lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const hubBtnStyle: React.CSSProperties = {
  width: 28, height: 28,
  border: "1px solid hsl(var(--border))",
  borderRadius: 4, background: "white", cursor: "pointer",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const hubInputStyle: React.CSSProperties = {
  width: 60, fontSize: 11, padding: "3px 6px",
  border: "1px solid hsl(var(--border))",
  borderRadius: 4, fontVariantNumeric: "tabular-nums",
};
