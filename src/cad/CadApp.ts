import { toast } from "sonner";
import { pageGuideSnapGeometry, paperMmToWorld } from "./pageGuides";
import { cancelRasterJobs, newRasterActionId } from "./raster/RasterJobs";
import { copyDisplayGradient } from "./displayGradient";
import { Defaults, ToolIds, PointEditAction, SelectionType } from "./constants";
import { clamp, v, Vec2 } from "./geometry";
import { Camera } from "./Camera";
import { Input, setLmbHint } from "./Input";
import { drawPendingPointHint } from "./pendingPointHint";
import { Scene, AreaLabel, DimensionStyle, TextBoxStyle, TextBox, copyStrokeEffects } from "./Scene";
import { DEFAULT_ROUGHEN, DEFAULT_STROKE_PATTERN, type RoughenParams, type StrokePatternParams } from "./strokeEffects";

/** Aufrauen-Werkzeugstandards in CAD: Regler jeweils auf 50 (= Detail 4, 400 %). */
const CAD_ROUGHEN_DEFAULT: RoughenParams = {
  ...DEFAULT_ROUGHEN,
  strengthMm: 50,
  detailPer100Mm: 4,
  scalePercent: 400,
};
import { autoSizeTextBox } from "./textAutoSize";
import { textStyleFontSizePt, ptToCssPx, ANNOTATION_M_PER_MM } from "./textTypography";
import { TableTool } from "./TableTool";
import { dominantRichStyle } from "./textDominantStyle";
import { LabelManager } from "./LabelManager";
import { RasterLayers, RasterTileStore, cadRasterPxPerM } from "./RasterLayers";
import { migrateCadSnapshot } from "@/lib/persistence";
import { TopologyEngine } from "./TopologyEngine";
import { GlobalGuides } from "./globalGuides";
import { GuideInteractionController } from "./GuideInteractionController";
import { Renderer, Selection, type SpreadNeighborInfo } from "./Renderer";
import { LineHub } from "./LineHub";
import { PropertyEditSession, installPropertyEditListeners } from "./propertyEdit";
import { runWallTopologyMaintenance as _wallMaint } from "./wallTopologyMaintenance";
import { PointEditMenu } from "./PointEditMenu";
import { SelectTool } from "./SelectTool";
import { LineTool } from "./LineTool";
import { HatchTool } from "./HatchTool";
import { PolygonTool } from "./PolygonTool";
import { MeasureTool } from "./MeasureTool";
import { TextTool } from "./TextTool";
import { TextEditorOverlay } from "./TextEditorOverlay";
import { PipetteTool } from "./PipetteTool";
import { Clipboard, buildClipboardFromSelection, commitClipboardAt, translatedItems, ClipboardItem } from "./ClipboardManager";
import type { LibraryDefinition, LibraryFolder } from "./library/types";
import { LibraryPlacementTool } from "./library/LibraryPlacementTool";
import { LibrarySnapSource } from "./library/librarySnapSource";
import * as Library from "./library/LibraryManager";
import { serializeDefinitions, restoreDefinitions, serializeFolders, restoreFolders, serializeLibraryInstance } from "./library/librarySerde";
import { DocumentTool } from "./DocumentTool";
import { rulerSideOf, rulerUnitOf } from "./rulerModel";
import { FreeDrawTool } from "./FreeDrawTool";
import { RulerTool } from "./RulerTool";
import { EraserTool } from "./EraserTool";
import { WallTool } from "./WallTool";
import { DoorTool } from "./DoorTool";
import { serializeStair } from "./Scene";
import { StairTool } from "./StairTool";

import { IdPanel } from "./IdPanel";
import { SheetManager, SheetOverlayStore, SheetDefaults } from "./SheetManager";
import { PlanManager, getPlanPaperSize } from "./PlanManager";
import { PlanController } from "./PlanController";
import { drawProjection as drawPlanProjection, computeProjectionLayout } from "./PlanProjections";
import { collectSceneSnapGeometry, transformSnapGeometryToPlan, type TracingSnapGeometry } from "./tracingSnapGeometry";
import { SheetPanel } from "./SheetPanel";
import { mirrorProxy } from "./multiEdit";
import { setStrokeAutoShape } from "./freeAutoShape";
import { asObjectToolId, type ObjectToolId } from "./selectionTools";
import { restoreOneScene } from "./sceneSerde";



export interface TextSettingsRefs {
  panel: HTMLDivElement;
  idSelect: HTMLSelectElement;
  textColor: HTMLInputElement;
  textColorPreview: HTMLDivElement;
  fontSize: HTMLInputElement;
  alignLeftBtn: HTMLButtonElement;
  alignCenterBtn: HTMLButtonElement;
  alignRightBtn: HTMLButtonElement;
  bgColor: HTMLInputElement;
  bgColorPreview: HTMLDivElement;
  bgAlpha: HTMLInputElement;
  wrapToggle: HTMLInputElement;
  borderToggle: HTMLInputElement;
  borderGroup: HTMLDivElement;
  borderColor: HTMLInputElement;
  borderColorPreview: HTMLDivElement;
  borderWidth: HTMLInputElement;
  modeAutoBtn?: HTMLButtonElement | null;
  modeFrameBtn?: HTMLButtonElement | null;
  boldBtn?: HTMLButtonElement | null;
  italicBtn?: HTMLButtonElement | null;
  underlineBtn?: HTMLButtonElement | null;
  strikeBtn?: HTMLButtonElement | null;
  lineHeightRange?: HTMLInputElement | null;
  lineHeightNum?: HTMLInputElement | null;
  bgAlphaRange?: HTMLInputElement | null;
  textAlpha?: HTMLInputElement | null;
  textAlphaRange?: HTMLInputElement | null;
  fontSizePt?: HTMLInputElement | null;
}

export interface TextEditorRefs {
  editor: HTMLDivElement;
  toolbar: HTMLDivElement;
  boldBtn: HTMLButtonElement;
  italicBtn: HTMLButtonElement;
  colorInput: HTMLInputElement;
  sizeSelect: HTMLSelectElement;
  symbolSelect: HTMLSelectElement;
}

export interface MeasureSettings {
  orientation: "parallel" | "diagonal" | "arc";
  /** "free" = Maßkette ohne Fangpunkt-Zwang. */
  pointCount: "two" | "multi" | "free" | "angle";
  /** Achsen-Richtung der Maßkette. "free" wird aus den ersten zwei Punkten abgeleitet. */
  direction: "horizontal" | "vertical" | "free";
  editMode: "parallel" | "endpoints";
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
  textGapPx: number;
  doorHeightText: string;
}


export interface MeasureSettingsRefs {
  panel: HTMLDivElement;
  idSelect: HTMLSelectElement;
  orientation: HTMLSelectElement;
  pointCount: HTMLSelectElement;
  direction: HTMLSelectElement;
  editMode: HTMLSelectElement;

  extensionsToggle: HTMLInputElement;
  extensionsGroup: HTMLDivElement;
  extensionStyle: HTMLSelectElement;
  extensionColor: HTMLInputElement;
  extensionColorPreview: HTMLDivElement;
  extensionAlpha: HTMLInputElement;

  freeTextToggle: HTMLInputElement;
  freeTextInput: HTMLInputElement;
  freeTextGroup: HTMLDivElement;
  freeTextBold: HTMLButtonElement;
  freeTextItalic: HTMLButtonElement;
  freeTextColor: HTMLInputElement;
  freeTextColorPreview: HTMLDivElement;

  textColor: HTMLInputElement;
  textColorPreview: HTMLDivElement;
  textSize: HTMLInputElement;
  decimals: HTMLInputElement;
  textBgToggle: HTMLInputElement;
  textBgGroup: HTMLDivElement;
  textBgColor: HTMLInputElement;
  textBgColorPreview: HTMLDivElement;
  textBgAlpha: HTMLInputElement;
  lineColor: HTMLInputElement;
  lineColorPreview: HTMLDivElement;
  tickLength: HTMLInputElement;
  showUnit: HTMLInputElement;
  unit: HTMLSelectElement;
  textGap?: HTMLInputElement;
  doorHeightText?: HTMLInputElement;
}

export class CadApp {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  hub: LineHub;
  pointEditMenu: PointEditMenu;

  lineSettingsPanel: HTMLDivElement;
  lineIdSelect: HTMLSelectElement;
  lineColorInput: HTMLInputElement;
  lineColorPreview: HTMLDivElement;
  lineThicknessInput: HTMLInputElement;

  hatchSettingsPanel: HTMLDivElement;
  hatchIdSelect: HTMLSelectElement;
  hatchFillColorInput: HTMLInputElement;
  hatchFillColorPreview: HTMLDivElement;
  hatchStrokeColorInput: HTMLInputElement;
  hatchStrokeColorPreview: HTMLDivElement;
  hatchStrokeWidthInput: HTMLInputElement;
  hatchAlphaInput: HTMLInputElement;
  areaShowInput: HTMLInputElement;
  areaSettingsGroup: HTMLDivElement;
  areaTextColorInput: HTMLInputElement;
  areaTextColorPreview: HTMLDivElement;
  areaFontSizeInput: HTMLInputElement;
  areaBgColorInput: HTMLInputElement;
  areaBgColorPreview: HTMLDivElement;
  areaBgAlphaInput: HTMLInputElement;

  measureRefs!: MeasureSettingsRefs;
  textRefs!: TextSettingsRefs;
  textEditorRefs!: TextEditorRefs;
  textEditor!: TextEditorOverlay;

  defaultLineColor = Defaults.lineColor;
  defaultLineThicknessM = Defaults.lineThicknessM;
  defaultArrowStart = false;
  defaultArrowEnd = false;
  defaultArrowScale = 1;

  defaultHatchFillColor = Defaults.hatchFillColor;
  defaultHatchStrokeColor = Defaults.hatchStrokeColor;
  defaultHatchStrokeWidthPx = Defaults.hatchStrokePx;
  defaultHatchFillAlphaPct = Defaults.hatchFillAlphaPct;
  /** Radierte Schraffur-Kanten automatisch glätten. */
  defaultHatchAutoSmooth = true;
  defaultHatchPatternEnabled = false;
  defaultHatchPatternId = "mauerwerk";
  defaultHatchPatternScale = 60;
  defaultHatchPatternAngleDeg = 0;
  defaultHatchPatternSkewDeg = 0;
  defaultHatchPatternRotateWithShape = true;
  defaultHatchPatternStretch = 1;
  defaultAreaShow = Defaults.areaShow;
  defaultAreaBorderEnabled = Defaults.areaBorderEnabled;
  defaultAreaBorderColor = Defaults.areaBorderColor;
  defaultAreaBorderWidthPx = Defaults.areaBorderWidthPx;

  defaultTextColor = Defaults.textColor;
  defaultTextFontSizePx = Defaults.textFontSizePx;
  defaultTextBgColor = Defaults.textBgColor;
  defaultTextBgAlphaPct = Defaults.textBgAlphaPct;
  defaultTextAlphaPct = Defaults.textAlphaPct;
  defaultTextWrap = Defaults.textWrap;
  defaultTextAlign: "left" | "center" | "right" = Defaults.textAlign;
  defaultTextBorderEnabled = Defaults.textBorderEnabled;
  defaultTextBorderColor = Defaults.textBorderColor;
  defaultTextBorderWidthPx = Defaults.textBorderWidthPx;
  defaultTextBold = Defaults.textBold;
  defaultTextItalic = Defaults.textItalic;
  defaultTextUnderline = Defaults.textUnderline;
  defaultTextStrike = Defaults.textStrike;
  defaultTextLineHeightPct = Defaults.textLineHeightPct;
  defaultTextAutoSize = true;


  // Freihand-Defaults
  defaultFreeColor = Defaults.freeColor;
  defaultFreeThicknessM = Defaults.freeThicknessM;
  defaultFreeOpacity = Defaults.freeOpacity;
  defaultFreeLineStyle: "solid" | "dashed" | "dotted" | "dashdot" | "blob" | "image" = Defaults.freeLineStyle;
  defaultFreeGapM = Defaults.freeGapM;
  defaultFreeImageSrc: string | null = null;
  defaultFreeImageSizeM = Defaults.freeImageSizeM;
  defaultFreeImageSpacingM = Defaults.freeImageSpacingM;
  defaultFreeImageRotate = Defaults.freeImageRotate;
  defaultFreeAutoShape = false;

  /** Zeichenmodus: "vector" (parametrisch) oder "pixel" (Objekt wird beim
   *  Fertigstellen zu einem Bild gerastert — wie in Malprogrammen). */
  defaultDrawRasterMode: "vector" | "pixel" = "vector";
  /**
   * Raster-Zeichenebenen (Pixelmodus) — je Zeichenblatt bzw. Druckplan ein
   * eigener Satz gekachelter Rasterebenen im selben Papier-Koordinatensystem
   * wie die Vektorobjekte. Pixelstriche sind damit Teil der Ebene und nicht
   * einzeln auswählbare Bildobjekte.
   */
  private _rasterLayersByKey = new Map<string, RasterLayers>();

  /** Kontextschlüssel der aktuell sichtbaren Zeichenfläche. */
  private _rasterKey(): string {
    return this.activePlanId ? `plan:${this.activePlanId}` : `sheet:${this.activeSheetId}`;
  }

  /** Geltungsbereich der Hilfslinien: CAD-Blatt, Plan oder Exportseite — nie übergreifend. */
  private _guideContextKey(): string {
    let view = "cad";
    try { if (new URLSearchParams(window.location.search).get("view") === "export") view = "export"; } catch {}
    return `${view}:${this._rasterKey()}`;
  }

  /** Rasterebenen der aktuell aktiven Zeichenfläche. */
  get rasterLayers(): RasterLayers {
    const key = this._rasterKey();
    let layers = this._rasterLayersByKey.get(key);
    if (!layers) {
      // Feste CAD-taugliche Grundqualität (600 dpi auf dem Papier, mit
      // Untergrenze in px/Weltmeter). Da im CAD in echten Metern gezeichnet
      // wird, wird die Papier-DPI durch den Zeichnungsmaßstab geteilt
      // (1:100 ⇒ 1 Papiermeter = 100 Weltmeter). Der Zoom ändert daran nichts.
      layers = new RasterLayers(cadRasterPxPerM());
      layers.onReady = () => { try { this.renderer?.render(); } catch { /* noop */ } };
      this._rasterLayersByKey.set(key, layers);
    }
    return layers;
  }

  /**
   * Rasterinhalt eines Exportausschnitts: verknüpft = aktueller bestätigter
   * Blattstand, eingefroren = beim Einfrieren gesicherte Kopie (`frozen:<id>`).
   */
  projectionRaster(proj: { id: string; mode?: string; sourceSheetId: string }): import("./PlanProjections").ProjectionRaster | null {
    const key = proj.mode === "frozen" ? `frozen:${proj.id}` : `sheet:${proj.sourceSheetId}`;
    const layers = this._rasterLayersByKey.get(key);
    if (!layers || !layers.hasAnyContent()) return null;
    return { layers, order: this.labelManager.list().map((g) => g.id), visible: (id) => this.labelManager.isVisible(id) };
  }

  /** Pixel direkt auf der Exportseite. */
  planRaster(planId: string): import("./PlanProjections").ProjectionRaster | null {
    const layers = this._rasterLayersByKey.get(`plan:${planId}`);
    if (!layers || !layers.hasAnyContent()) return null;
    return { layers, order: this.labelManager.list().map((g) => g.id), visible: (id) => this.labelManager.isVisible(id) };
  }

  /** Friert den Pixelstand eines Blatts für einen Ausschnitt ein (kodierte Kopie, keine Dekodierung). */
  freezeProjectionRaster(projectionId: string, sheetId: string) {
    const key = `frozen:${projectionId}`;
    this._rasterLayersByKey.get(key)?.clear();
    this._rasterLayersByKey.delete(key);
    const src = this._rasterLayersByKey.get(`sheet:${sheetId}`);
    if (!src || !src.hasAnyContent()) return;
    const copy = new RasterLayers();
    copy.onReady = () => { try { this.renderer?.render(); } catch { /* noop */ } };
    copy.restore(src.serialize());
    this._rasterLayersByKey.set(key, copy);
  }

  /** Projektweite Rasterqualität für neu fertiggestellte Pixelobjekte. */
  pixelRenderDpi = 1200;
  pixelSupersampling = false;
  pixelSupersamplingFactor: 2 | 4 = 2;



  // Eraser-Defaults
  defaultEraserRadiusM = Defaults.eraserRadiusM;
  defaultEraserStrength = Defaults.eraserStrength;
  defaultEraserMode: "hard" | "smooth" = Defaults.eraserMode;
  defaultEraserSoftness = Defaults.eraserSoftness;
  /** Radierseite relativ zum Lineal: links / mittig / rechts. */
  defaultEraserRulerSide: "left" | "center" | "right" = "center";

  camera: Camera;
  scene: Scene;
  input: Input;
  labelManager: LabelManager;
  topology: TopologyEngine;
  /** Globale Hilfslinien (Rechtsklick auf Fangpunkt) — für alle Werkzeuge. */
  globalGuides: GlobalGuides;
  guideController!: GuideInteractionController;
  renderer: Renderer;

  /**
   * Aktueller Ansichtsmaßstab (Nenner, z. B. 100 für 1:100).
   * REIN visuell: beeinflusst NUR die Darstellung von Dokumenten (Renderer)
   * und den Kamera-Zoom. Verändert NIE Modellgeometrie oder reale Maße.
   */
  drawingScale: number = 100;

  selectTool: SelectTool;
  lineTool: LineTool;
  hatchTool: HatchTool;
  polygonTool: PolygonTool;
  /** Standardwerte des Polygonwerkzeugs. */
  defaultPolygonColor = Defaults.lineColor;
  defaultPolygonThicknessM = Defaults.lineThicknessM;
  defaultPolygonAlpha = 1;
  measureTool!: MeasureTool;
  textTool!: TextTool;
  pipetteTool!: PipetteTool;
  /** Bibliotheks-Platzierungswerkzeug (nur eigenständige CAD-Oberfläche). */
  libraryTool!: LibraryPlacementTool;
  tableTool!: TableTool;
  documentTool!: DocumentTool;
  freeDrawTool!: FreeDrawTool;
  rulerTool!: RulerTool;
  stairTool!: StairTool;
  /** Rückmeldung an die Oberfläche: Treppe ausgewählt/erstellt. */
  onStairSelect: ((id: string | null) => void) | null = null;
  /** Ausgewählte Treppe direkt mit Griffen öffnen (Werkzeugeinstellungen). */
  openStairEdit(id: string): boolean {
    if (!(this.scene as any).getStairById?.(id)) return false;
    this.setTool(ToolIds.STAIR);
    const ok = this.stairTool.beginEdit(id);
    this.onToolChange?.(ToolIds.STAIR);
    return ok;
  }
  onStairCreated: ((id: string) => void) | null = null;
  eraserTool!: EraserTool;
  wallTool!: WallTool;
  doorTool!: DoorTool;
  activeTool: SelectTool | LineTool | HatchTool | MeasureTool | TextTool | PipetteTool | DocumentTool | FreeDrawTool | EraserTool | WallTool | DoorTool | TableTool | LibraryPlacementTool;

  /** Hub-Box-State für ausgewähltes Dokument (Verschieben/Drehen/Crop). Geschrieben von SelectTool, gelesen von CadEditor. */
  documentHubState: { visible: boolean; screenX: number; screenY: number; docId: string | null; cornerIndex: number; anchorWorld: { x: number; y: number } | null; cropSide: "top" | "right" | "bottom" | "left" | null } = {
    visible: false, screenX: 0, screenY: 0, docId: null, cornerIndex: 0, anchorWorld: null, cropSide: null,
  };

  /** Aktive Maus-Operation der PDF-/Bild-Hub-Box. Wird von CadEditor (React) gesetzt
   *  und von SelectTool gelesen, damit Canvas-Klicks bei aktivem Modus den Ankerpunkt
   *  verschieben/drehen/skalieren. */
  documentHubMode: "none" | "move" | "rotate" | "scale" | "crop" = "none";

  /** Erster Referenz-Klick für Rotate/Scale (Welt-Koordinate). */
  documentHubFirstClick: { x: number; y: number } | null = null;

  /** Kleiner "Maßkette fertig"-Button (Häkchen), den der MeasureTool im Sammel-Modus anzeigt. */
  measureFinishHubState: { visible: boolean; screenX: number; screenY: number } = {
    visible: false, screenX: 0, screenY: 0,
  };

  /** Hub-Box für eine ausgewählte Maßkette (Verschieben mit Snap). */
  dimensionHubState: { visible: boolean; screenX: number; screenY: number; dimensionId: string | null } = {
    visible: false, screenX: 0, screenY: 0, dimensionId: null,
  };
  /** Aktiver Modus der Dimension-Hub-Box. "move" = Verschiebe-Sitzung (Armierung + Vorschau). */
  dimensionHubMode: "none" | "move" = "none";

  // --- Maßketten-Verschiebung: explizite Transform-Sitzung ------------------
  // Ablauf: Symbol antippen → armiert. Erster Kontakt auf der Fläche setzt nur
  // den Greifpunkt (kein Sprung, kein Abschluss). Danach folgt die Vorschau.
  // Nur „✓ Fixieren“/Enter schreibt; Escape/Abbrechen verwirft alles.
  /** Sitzung läuft (armiert oder in Bewegung). */
  dimensionMoveActive = false;
  /** Armiert, aber noch kein Kontakt auf der Zeichenfläche. */
  dimensionMoveArmed = false;
  /** Maßkette der laufenden Sitzung. */
  dimensionMoveDimId: string | null = null;
  /** Ausgangsplatzierung — Grundlage für Abbrechen/Escape. */
  dimensionMoveOriginalPlacement: { x: number; y: number } | null = null;
  /** Flüchtige Vorschau; wird nie ins Scene-Modell geschrieben. */
  dimensionMovePreviewPlacement: { x: number; y: number } | null = null;
  /** Versatz zwischen erstem Kontaktpunkt und Platzierung (verhindert Springen). */
  dimensionMoveGrabOffset: { x: number; y: number } | null = null;

  /** Verschieben scharfstellen (noch keine Bewegung, keine Änderung). */
  startDimensionMove(dimensionId: string) {
    const dim = this.scene.getDimensionById(dimensionId);
    if (!dim) return;
    this.dimensionMoveActive = true;
    this.dimensionMoveArmed = true;
    this.dimensionMoveDimId = dimensionId;
    this.dimensionMoveOriginalPlacement = { x: dim.placementPoint.x, y: dim.placementPoint.y };
    this.dimensionMovePreviewPlacement = { x: dim.placementPoint.x, y: dim.placementPoint.y };
    this.dimensionMoveGrabOffset = null;
    this.dimensionHubMode = "move";
    this._syncDimensionMovePreview();
  }

  /** Vorschau übernehmen: genau ein Verlaufsschritt. */
  commitDimensionMove() {
    const id = this.dimensionMoveDimId;
    const preview = this.dimensionMovePreviewPlacement;
    const original = this.dimensionMoveOriginalPlacement;
    this._endDimensionMove();
    if (!id || !preview) return;
    const dim = this.scene.getDimensionById(id);
    if (!dim) return;
    const moved = !original
      || Math.abs(preview.x - original.x) > 1e-9
      || Math.abs(preview.y - original.y) > 1e-9;
    if (!moved) { this.renderer.render(); return; }
    dim.placementPoint = { x: preview.x, y: preview.y } as any;
    this.renderer.render();
    this.refreshLabelUI?.();
    this.commitHistorySnapshot?.();
  }

  /** Vorschau vollständig verwerfen — Ausgangslage bleibt erhalten. */
  cancelDimensionMove() {
    const id = this.dimensionMoveDimId;
    const original = this.dimensionMoveOriginalPlacement;
    this._endDimensionMove();
    if (id && original) {
      const dim = this.scene.getDimensionById(id);
      // Sicherheitsnetz: falls doch etwas geschrieben wurde, exakt zurücksetzen.
      if (dim) dim.placementPoint = { x: original.x, y: original.y } as any;
    }
    this.renderer.render();
  }

  private _endDimensionMove() {
    this.dimensionMoveActive = false;
    this.dimensionMoveArmed = false;
    this.dimensionMoveDimId = null;
    this.dimensionMoveOriginalPlacement = null;
    this.dimensionMovePreviewPlacement = null;
    this.dimensionMoveGrabOffset = null;
    this.dimensionHubMode = "none";
    this._syncDimensionMovePreview();
  }

  /** Vorschau an den Renderer spiegeln (rein visuell). */
  _syncDimensionMovePreview() {
    const r: any = this.renderer;
    if (!r) return;
    r.dimensionMovePreview = (this.dimensionMoveActive && this.dimensionMoveDimId && this.dimensionMovePreviewPlacement)
      ? { dimensionId: this.dimensionMoveDimId, placementPoint: { ...this.dimensionMovePreviewPlacement } }
      : null;
  }

  // Clipboard + Paste-Vorschau
  clipboard: Clipboard | null = null;
  pastePreviewActive = false;
  private _toolBeforePaste: string | null = null;

  // Bibliothek (projektweit, Teil von Undo/Redo und Persistenz)
  libraryDefinitions: LibraryDefinition[] = [];
  /** Schreibgeschützte Fangquelle für platzierte Bibliotheksinstanzen. */
  librarySnapSource!: LibrarySnapSource;
  /** Ordnerstruktur der Bibliotheksverwaltung (rein organisatorisch). */
  libraryFolders: LibraryFolder[] = [];
  onLibraryChange?: () => void;

  measureSettings: MeasureSettings = {
    orientation: Defaults.measureOrientation,
    pointCount: Defaults.measurePointCount,
    direction: Defaults.measureDirection,
    editMode: Defaults.measureEditMode,

    textColor: Defaults.measureTextColor,
    textSizePx: Defaults.measureTextSizePx,
    lineColor: Defaults.measureLineColor,
    decimals: Defaults.measureDecimals,
    tickLengthM: Defaults.measureTickLengthM,
    showExtensions: Defaults.measureShowExtensions,
    useFreeText: Defaults.measureUseFreeText,
    freeText: Defaults.measureFreeText,
    textBgEnabled: Defaults.measureTextBgEnabled,
    textBgColor: Defaults.measureTextBgColor,
    textBgAlpha: Defaults.measureTextBgAlpha,
    extensionStyle: Defaults.measureExtensionStyle,
    extensionColor: Defaults.measureExtensionColor,
    extensionAlpha: Defaults.measureExtensionAlpha,
    freeTextBold: Defaults.measureFreeTextBold,
    freeTextItalic: Defaults.measureFreeTextItalic,
    freeTextColor: Defaults.measureFreeTextColor,
    showUnit: Defaults.measureShowUnit,
    unit: Defaults.measureUnit,
    textGapPx: Defaults.measureTextGapPx,
    doorHeightText: Defaults.measureDoorHeightText,
  };

  // Drag state for parallel-shifting a selected dimension
  private _dragDimId: string | null = null;
  private _dragDimOffsetAlongNormal = 0;

  idPanel: IdPanel;

  /** Zeichnungs-IDs (Blätter) — pro Blatt eine eigene Scene. */
  sheetManager: SheetManager = new SheetManager();
  sheetOverlayStore: SheetOverlayStore = new SheetOverlayStore();
  activeSheetId: string = SheetDefaults.defaultSheetId;
  sheetPanel: SheetPanel | null = null;
  /** Map: sheetId → eigene Scene. Default-Sheet teilt sich die initiale `this.scene`. */
  scenesById: Map<string, Scene> = new Map();

  /** Exportseiten (Papierseiten mit Format, Ordnern, Ausschnitten). */
  planManager: PlanManager = new PlanManager();
  /** Aktiver Plan (null = Zeichnungsmodus, kein Plan-Hintergrund). */
  activePlanId: string | null = null;
  /**
   * Rein flüchtiger Bedienzustand „Seitenanordnung bearbeiten“ (freie Anordnung).
   * Nicht Cloud, nicht Undo/Redo, nicht Snapshot, nicht localStorage — nach
   * Seitenwechsel oder Neuladen startet die Ansicht immer fixiert.
   */
  spreadLayoutEditing = false;
  /** Plan-Modus Controller (Drop / Selektion / Drag / HUB). */
  planController: PlanController | null = null;
  /** Map: planId → eigene Annotation-Scene (Werkzeuge zeichnen darauf im Plan-Modus). */
  planScenesById: Map<string, Scene> = new Map();
  /** Transparentpause-States pro Plan (analog SheetOverlayStore). */
  planOverlayStore: SheetOverlayStore = new SheetOverlayStore();
  /** Pro Sheet/Plan gespeicherter Camera-State (Zoom + Pan), um beim Wechsel zurückzukehren. */
  private _camStateBySheetId: Map<string, { scale: number; offsetX: number; offsetY: number }> = new Map();
  private _camStateByPlanId: Map<string, { scale: number; offsetX: number; offsetY: number }> = new Map();
  /** Default-Linienstärke (m) speziell im Plan-Modus, damit Werkzeuge der Plangröße entsprechen. */
  private _planDefaultLineThicknessM: Map<string, number> = new Map();
  /** Default-Schriftgröße (px) speziell im Plan-Modus. */
  private _planDefaultTextFontSizePx: Map<string, number> = new Map();
  /** Gespeicherte Sheet-Defaults, damit beim Verlassen des Plan-Modus wiederhergestellt werden kann. */
  private _savedSheetDefaults: { lineThicknessM: number; textFontSizePx: number; tickLengthM: number } | null = null;

  selection: Selection | null = null;
  selectedLabelId: string | null = null;
  activeDrawLabelId: string = Defaults.defaultLabelId;

  private _btnMap = new Map<string, HTMLButtonElement>();
  private _rafId = 0;
  private _destroyed = false;
  private _resizeObserver: ResizeObserver | null = null;
  private _orientationHandler: (() => void) | null = null;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  // History (Undo/Redo)
  private _history: string[] = [];
  /** Action-ID je Verlaufseintrag (parallel zu `_history`) für atomare Rasterabschlüsse. */
  private _historyTokens: (string | null)[] = [];
  /** Action-ID der aktuell offenen äußeren Aktion. */
  private _actionToken: string | null = null;
  private _historyIndex = -1;
  /** 20 rückgängig machbare Handlungen + aktueller Ausgangsstand = 21 Zustände. */
  private _historyMax = 21;
  /** Solange true, werden keine automatischen History-Snapshots erzeugt (z. B. während Regler-Drag). */
  suspendHistory = false;
  /** Offene Eigenschafts-Transaktion der Einstellungs-Controls (1 Undo je Bedienaktion). */
  propertyEdit!: PropertyEditSession;
  private _uninstallPropertyEdit: (() => void) | null = null;
  /** Offene zentrale Aktion (beginAction … commitAction/cancelAction). */
  private _actionDepth = 0;
  private _actionStartSnapshot: string | null = null;
  private _actionPrevSuspend = false;
  private _lastSnapshot = "";
  private _snapshotTimer: number | null = null;
  private _isRestoring = false;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  /**
   * Wird nach jeder bestätigten Änderung der Zeichnung ausgelöst.
   * Wird von der CAD-Zusammenarbeit genutzt, um einzelne Objektänderungen
   * zu erkennen. Der Zeichenkern selbst bleibt davon unberührt.
   */
  onSceneCommitted?: () => void;

  onToolChange?: (toolId: string) => void;

  onSelectionChange?: () => void;
  onLabelsChange?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    hubRoot: HTMLDivElement, hubLenInput: HTMLInputElement, hubAngInput: HTMLInputElement,
    pointEditRoot: HTMLDivElement, pointEditButtons: Record<string, HTMLButtonElement>,
    lineSettingsPanel: HTMLDivElement, lineIdSelect: HTMLSelectElement,
    lineColorInput: HTMLInputElement, lineColorPreview: HTMLDivElement, lineThicknessInput: HTMLInputElement,
    idPanelRoot: HTMLDivElement, idPanelBody: HTMLDivElement, idPanelList: HTMLDivElement,
    idPanelAddBtn: HTMLButtonElement, idPanelToggleBtn: HTMLButtonElement,
    hatchSettingsPanel: HTMLDivElement,
    hatchIdSelect: HTMLSelectElement,
    hatchFillColorInput: HTMLInputElement, hatchFillColorPreview: HTMLDivElement,
    hatchStrokeColorInput: HTMLInputElement, hatchStrokeColorPreview: HTMLDivElement,
    hatchStrokeWidthInput: HTMLInputElement, hatchAlphaInput: HTMLInputElement,
    areaShowInput: HTMLInputElement, areaSettingsGroup: HTMLDivElement,
    areaTextColorInput: HTMLInputElement, areaTextColorPreview: HTMLDivElement,
    areaFontSizeInput: HTMLInputElement,
    areaBgColorInput: HTMLInputElement, areaBgColorPreview: HTMLDivElement, areaBgAlphaInput: HTMLInputElement,
    measureRefs: MeasureSettingsRefs,
    textRefs: TextSettingsRefs,
    textEditorRefs: TextEditorRefs,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    hubRoot.setAttribute("data-no-property-edit", "");
    pointEditRoot.setAttribute("data-no-property-edit", "");
    this.propertyEdit = new PropertyEditSession(this);
    if (typeof document !== "undefined") this._uninstallPropertyEdit = installPropertyEditListeners(this.propertyEdit);

    this.hub = new LineHub(hubRoot, hubLenInput, hubAngInput);
    this.pointEditMenu = new PointEditMenu(pointEditRoot, pointEditButtons);

    this.lineSettingsPanel = lineSettingsPanel;
    this.lineIdSelect = lineIdSelect;
    this.lineColorInput = lineColorInput;
    this.lineColorPreview = lineColorPreview;
    this.lineThicknessInput = lineThicknessInput;

    this.hatchSettingsPanel = hatchSettingsPanel;
    this.hatchIdSelect = hatchIdSelect;
    this.hatchFillColorInput = hatchFillColorInput;
    this.hatchFillColorPreview = hatchFillColorPreview;
    this.hatchStrokeColorInput = hatchStrokeColorInput;
    this.hatchStrokeColorPreview = hatchStrokeColorPreview;
    this.hatchStrokeWidthInput = hatchStrokeWidthInput;
    this.hatchAlphaInput = hatchAlphaInput;
    this.areaShowInput = areaShowInput;
    this.areaSettingsGroup = areaSettingsGroup;
    this.areaTextColorInput = areaTextColorInput;
    this.areaTextColorPreview = areaTextColorPreview;
    this.areaFontSizeInput = areaFontSizeInput;
    this.areaBgColorInput = areaBgColorInput;
    this.areaBgColorPreview = areaBgColorPreview;
    this.areaBgAlphaInput = areaBgAlphaInput;
    this.measureRefs = measureRefs;
    this.textRefs = textRefs;
    this.textEditorRefs = textEditorRefs;

    this.camera = new Camera();
    this.scene = new Scene();
    // Brücke für den Renderer: ermöglicht visuelles Skalieren von Dokumenten
    // mit dem aktuellen Ansichtsmaßstab, ohne CadApp direkt zu importieren.
    (this.scene as any)._drawingScaleRef = () => this.drawingScale;
    // Default-Sheet teilt sich die initiale Scene.
    this.scenesById.set(SheetDefaults.defaultSheetId, this.scene);
    this.input = new Input(canvas);
    this.labelManager = new LabelManager();
    this.topology = new TopologyEngine(this.scene, this.camera, this.labelManager);
    this.globalGuides = new GlobalGuides();
    this.topology.guides = this.globalGuides;
    this.guideController = new GuideInteractionController(this.globalGuides, this.topology as any, this.camera as any);
    this.renderer = new Renderer(this.ctx, this.camera, this.scene, this.labelManager);

    // Plan-Modus Controller (Step 4): Drop, Selektion, Drag, HUB.
    this.planController = new PlanController(this);
    this.renderer.planOverlayDraw = (ctx) => this.planController?.drawAll(ctx);

    // Drop von Sheet-Drags auf den Canvas (nur im Plan-Modus relevant).
    this.canvas.addEventListener("dragover", (e) => {
      if (!this.activePlanId) return;
      const types = Array.from(e.dataTransfer?.types || []);
      if (!types.includes("application/x-pixuna-sheet")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    this.canvas.addEventListener("drop", (e) => {
      if (!this.activePlanId) return;
      const sheetId = e.dataTransfer?.getData("application/x-pixuna-sheet");
      if (!sheetId) return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      void this.planController?.createProjectionFromSheet(sheetId, sx, sy);
    });

    this.selectTool = new SelectTool(this);
    this.lineTool = new LineTool(this);
    this.hatchTool = new HatchTool(this);
    this.polygonTool = new PolygonTool(this);
    this.measureTool = new MeasureTool(this);
    this.textTool = new TextTool(this);
    this.pipetteTool = new PipetteTool(this);
    this.libraryTool = new LibraryPlacementTool(this);
    this.renderer.libraryDefinitionSource = () => this.libraryDefinitions;
    // Bibliotheksinstanzen als schreibgeschützte Fangquelle für alle Werkzeuge.
    this.librarySnapSource = new LibrarySnapSource();
    this.librarySnapSource.definitions = () => this.libraryDefinitions;
    this.topology.librarySnaps = this.librarySnapSource;
    this.tableTool = new TableTool(this);
    this.documentTool = new DocumentTool(this);
    this.freeDrawTool = new FreeDrawTool(this);
    this.rulerTool = new RulerTool(this);
    this.stairTool = new StairTool(this);
    this.eraserTool = new EraserTool(this);
    this.wallTool = new WallTool(this);
    this.doorTool = new DoorTool(this);
    this.activeTool = this.selectTool;
    try { (window as any).__pixunaActiveTool = ToolIds.SELECT; } catch {}

    this.idPanel = new IdPanel(this, idPanelRoot, idPanelBody, idPanelList, idPanelAddBtn, idPanelToggleBtn);

    this.textEditor = new TextEditorOverlay(
      textEditorRefs.editor, textEditorRefs.toolbar,
      textEditorRefs.boldBtn, textEditorRefs.italicBtn,
      textEditorRefs.colorInput, textEditorRefs.sizeSelect, textEditorRefs.symbolSelect,
      this,
    );

    this.pointEditMenu.bindActivate((action) => {
      // Treppengriffe nutzen dasselbe Punktmenü (Treppe bleibt ein Objekt).
      if ((this.activeTool as any) === this.stairTool && this.stairTool.phase === "edit") {
        this.stairTool.onPointMenuAction(action);
        return;
      }
      const sel = this.selection;
      if (sel && sel.type === SelectionType.TEXTBOX_HANDLE && (sel as any).textBoxId && sel.handleIndex != null) {
        this.selectTool.beginTextBoxHandleEdit((sel as any).textBoxId, sel.handleIndex, action);
        return;
      }
      if (sel && sel.type === SelectionType.LIBRARY_INSTANCE && (sel as any).libraryInstanceId && (sel as any).handleIndex != null) {
        this.selectTool.beginLibraryHandleEdit((sel as any).libraryInstanceId, (sel as any).handleIndex, action);
        return;
      }
      if (sel && sel.type === SelectionType.AREA_LABEL_HANDLE && (sel as any).hatchId && (sel as any).handleIndex != null) {
        this.selectTool.beginAreaLabelHandleEdit((sel as any).hatchId, (sel as any).handleIndex, action);
        return;
      }
      if (action === PointEditAction.INSERT_POINT && sel && sel.type === SelectionType.HATCH && (sel as any).hatchId && (sel as any).edgeIndex != null) {
        this.selectTool.insertHatchEdgePoint((sel as any).hatchId, (sel as any).edgeIndex, (sel as any).holeIndex ?? null);
        return;
      }
      if (action === PointEditAction.BULGE && sel) {
        if (sel.type === SelectionType.HATCH && (sel as any).hatchId && (sel as any).edgeIndex != null) {
          this.selectTool.beginHatchEdgeBulge((sel as any).hatchId, (sel as any).edgeIndex, (sel as any).holeIndex ?? null);
          return;
        }
        if ((sel as any).hatchId && (sel as any).pointIndex != null) {
          this.selectTool.beginHatchPointBulge((sel as any).hatchId, (sel as any).pointIndex, (sel as any).holeIndex ?? null);
          return;
        }
        if (sel.type === SelectionType.WALL && (sel as any).wallId && (sel as any).edgeIndex != null) {
          this.selectTool.beginWallEdgeBulge((sel as any).wallId, (sel as any).edgeIndex);
          return;
        }
        if ((sel as any).segmentId) {
          this.selectTool.beginSegmentBulge((sel as any).segmentId);
          return;
        }
      }
      if (action === PointEditAction.SPLIT && sel) {
        if (sel.type === SelectionType.WALL && (sel as any).wallId && (sel as any).edgeIndex != null) {
          this.selectTool.beginWallSplit((sel as any).wallId, (sel as any).edgeIndex);
          return;
        }
        if ((sel as any).segmentId) {
          this.selectTool.beginSegmentSplit((sel as any).segmentId);
          return;
        }
        return;
      }
      if (action === PointEditAction.OFFSET && sel && sel.type === SelectionType.HATCH && (sel as any).hatchId && (sel as any).edgeIndex != null) {
        this.selectTool.beginHatchEdgeOffset((sel as any).hatchId, (sel as any).edgeIndex, (sel as any).holeIndex ?? null);
        return;
      }
      if (sel && sel.type === SelectionType.WALL && (sel as any).wallId && (sel as any).edgeIndex != null) {
        this.selectTool.beginWallEdgeAction((sel as any).wallId, (sel as any).edgeIndex, action);
        return;
      }
      if (sel && sel.type === SelectionType.FREE_STROKE && (sel as any).freeStrokeId) {
        this.selectTool.beginFreeStrokeAction((sel as any).freeStrokeId, action);
        return;
      }
      this.selectTool.beginPointEdit(action);
    });

    this._setupLineSettingsPanel();
    this._setupHatchSettingsPanel();
    this._setupMeasureSettingsPanel();
    this._setupTextSettingsPanel();
    this._setupShortcuts();
    this.refreshLabelUI();
    this._resize();
    // Ausrichtungswechsel (Handy/Tablet drehen) und Layout-Änderungen der
    // Zeichenfläche zuverlässig übernehmen — ohne zusätzliche Eigen-Drehung.
    try {
      this._resizeObserver = new ResizeObserver(() => {
        if (!this._destroyed) this._resize();
      });
      this._resizeObserver.observe(canvas);
    } catch { /* ResizeObserver nicht verfügbar */ }
    this._orientationHandler = () => {
      if (this._destroyed) return;
      this._resize();
      // Nach der Rotation liefert der Browser die endgültigen Maße oft erst
      // einen Frame später.
      window.setTimeout(() => { if (!this._destroyed) this._resize(); }, 250);
    };
    window.addEventListener("orientationchange", this._orientationHandler);
    window.visualViewport?.addEventListener("resize", this._orientationHandler);
    this.camera.center(canvas.getBoundingClientRect());
    this._tick();
    this._initHistory();
  }

  /* ---- History (Undo / Redo) ---- */
  private _serializeOneScene(scene: Scene) {
    return {
      segments: scene.segments.map(s => ({
        id: s.id, a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y },
        color: s.color, thicknessM: s.thicknessM, labelId: s.labelId,
        arrowStart: !!s.arrowStart, arrowEnd: !!s.arrowEnd, arrowScale: s.arrowScale || 1,
        bulge: (s as any).bulge || 0,
        ...copyStrokeEffects(s),
        _stickerEditOwnerId: s._stickerEditOwnerId || null,
      })),

      hatches: scene.hatches.map(h => ({
        id: h.id, points: h.points.map(p => ({ x: p.x, y: p.y })),
        holes: (h.holes || []).map(loop => loop.map(p => ({ x: p.x, y: p.y }))),
        fillColor: h.fillColor, strokeColor: h.strokeColor,
        fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
        labelId: h.labelId, areaLabel: { ...h.areaLabel },
        patternEnabled: h.patternEnabled, patternId: h.patternId,
        patternScale: h.patternScale, patternAngleDeg: h.patternAngleDeg,
        patternSkewDeg: h.patternSkewDeg, patternStretch: h.patternStretch,
        patternOffsetX: h.patternOffsetX, patternOffsetY: h.patternOffsetY,
        patternOrigin: (h as any).patternOrigin ? { ...(h as any).patternOrigin } : null,
        patternRotateWithShape: (h as any).patternRotateWithShape !== false,
        displayGradient: copyDisplayGradient((h as any).displayGradient),
        bulges: [...((h as any).bulges || [])],
        holeBulges: ((h as any).holeBulges || []).map((l: number[]) => [...l]),
        isPolygon: (h as any).isPolygon === true,
        closed: (h as any).isPolygon === true ? (h as any).closed !== false : undefined,
        shapeMode: (h as any).shapeMode,
        thicknessM: (h as any).thicknessM,
        alpha: (h as any).alpha,
        midpointSnap: !!(h as any).midpointSnap,
        divisionSnap: (h as any).divisionSnap,
        ...copyStrokeEffects(h),
        _stickerEditOwnerId: h._stickerEditOwnerId || null,
      })),
      walls: scene.walls.map(w => ({
        id: w.id,
        kind: w.kind,
        thicknessM: w.thicknessM,
        referenceSide: w.referenceSide,
        corners: w.corners.map(p => ({ x: p.x, y: p.y })),
        hiddenCornerIndices: [...(w.hiddenCornerIndices || [])],
        cornerAnchors: (w.cornerAnchors || []).map(a => a ? { ...a } : null),

        customName: w.customName,
        color: w.color,
        fillColor: w.fillColor,
        labelId: w.labelId,
        priority: w.priority,
        patternId: w.patternId,
        patternScale: w.patternScale,
        patternAlignToWall: !!w.patternAlignToWall,
        patternAngleDeg: (w as any).patternAngleDeg ?? 0,
        bulges: [...((w as any).bulges || [])],
        _stickerEditOwnerId: w._stickerEditOwnerId || null,
      })),
      dimensions: scene.dimensions.map(d => ({
        id: d.id,
        p1: { x: d.p1.x, y: d.p1.y }, p2: { x: d.p2.x, y: d.p2.y },
        placementPoint: { x: d.placementPoint.x, y: d.placementPoint.y },
        mode: d.mode, refDir: d.refDir ? { x: d.refDir.x, y: d.refDir.y } : null, bulge: (d as any).bulge || 0,
        p3: d.p3 ? { x: d.p3.x, y: d.p3.y } : null,
        textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
        decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
        useFreeText: d.useFreeText, freeText: d.freeText,
        textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
        extensionStyle: d.extensionStyle, extensionColor: d.extensionColor, extensionAlpha: d.extensionAlpha,
        freeTextBold: d.freeTextBold, freeTextItalic: d.freeTextItalic, freeTextColor: d.freeTextColor,
        labelId: d.labelId,
        doorRefId: d.doorRefId || null,
        mirror: !!d.mirror,
        textGapPx: d.textGapPx,
        doorHeightText: d.doorHeightText,
        _textSideBase: (d as any)._textSideBase ?? null,
        _stickerEditOwnerId: d._stickerEditOwnerId || null,
      })),

      tables: (scene as any).tables.map((t: any) => ({
        id: t.id,
        center: { x: t.center.x, y: t.center.y },
        rotationRad: t.rotationRad,
        mPerMm: t.mPerMm,
        scale: t.scale,
        data: t.data,
        labelId: t.labelId,
        _stickerEditOwnerId: t._stickerEditOwnerId || null,
      })),
      textBoxes: scene.textBoxes.map(t => ({
        id: t.id,
        center: { x: t.center.x, y: t.center.y },
        widthM: t.widthM, heightM: t.heightM,
        rotationRad: t.rotationRad, html: t.html,
        style: { ...t.style },
        labelId: t.labelId,
        _stickerEditOwnerId: t._stickerEditOwnerId || null,
      })),
      libraryInstances: (scene.libraryInstances || []).map(serializeLibraryInstance),
      documents: scene.documents
        .filter(d => !(d as any)._snapOnly)
        .map(d => {
        // Falls Maske dirty ist, vor Serialisierung in DataUrl exportieren.
        let maskUrl = d.eraseMaskDataUrl;
        if (d._eraseMaskDirty && d._eraseMask) {
          try { maskUrl = d._eraseMask.toDataURL("image/png"); d.eraseMaskDataUrl = maskUrl; d._eraseMaskDirty = false; }
          catch { /* ignore */ }
        }
        return {
          id: d.id, name: d.name, kind: d.kind, src: d.src, pageIndex: d.pageIndex,
          position: { x: d.position.x, y: d.position.y },
          widthM: d.widthM, heightM: d.heightM, rotationRad: d.rotationRad,
          pixelWidth: d.pixelWidth, pixelHeight: d.pixelHeight, labelId: d.labelId,
          eraseMaskDataUrl: maskUrl || null,
          pdfSourceB64: d.pdfSourceB64 || null,
          guideEdges: { ...d.guideEdges },
          cropM: { ...(d as any).cropM },
          opacity: (d as any).opacity,
          filters: ((d as any).filters || []).map((f: any) => ({ ...f })),
          activeFilterId: (d as any).activeFilterId || null,
          anchors: ((d as any).anchors || []).map((a: any) => ({ x: a.x, y: a.y })),
          warpCorners: (d as any).warpCorners ? (d as any).warpCorners.map((c: any) => ({ x: c.x, y: c.y })) : null,
          flipX: !!(d as any).flipX,
          flipY: !!(d as any).flipY,
          displayGradient: copyDisplayGradient((d as any).displayGradient),
        };
      }),

      freeStrokes: scene.freeStrokes.map(s => ({
        id: s.id, points: s.points.map(p => ({ x: p.x, y: p.y })),
        color: s.color, thicknessM: s.thicknessM, opacity: s.opacity,
        lineStyle: s.lineStyle, gapM: s.gapM,
        blobSpacingM: s.blobSpacingM, blobSizeM: s.blobSizeM,
        smoothing: s.smoothing, labelId: s.labelId,
        imageSrc: s.imageSrc, imageSizeM: s.imageSizeM,
        imageSpacingM: s.imageSpacingM, imageRotateAlongPath: s.imageRotateAlongPath,
        sourceStartDistanceM: (s as any).sourceStartDistanceM || 0,
        sourceStrokeId: (s as any).sourceStrokeId || null,
        pressures: (s as any).pressures ? [...(s as any).pressures] : null,
        ...copyStrokeEffects(s),
        _stickerEditOwnerId: s._stickerEditOwnerId || null,
      })),
      rulerGuide: scene.rulerGuide ? {
        a: { x: scene.rulerGuide.a.x, y: scene.rulerGuide.a.y },
        b: { x: scene.rulerGuide.b.x, y: scene.rulerGuide.b.y },
        side: rulerSideOf(scene.rulerGuide),
        unit: rulerUnitOf(scene.rulerGuide),
      } : null,
      doors: scene.doors.map(d => ({
        id: d.id, wallId: d.wallId, posM: d.posM, widthM: d.widthM, heightM: d.heightM,
        breakHeightM: d.breakHeightM,
        breakHeightVisible: d.breakHeightVisible,
        kind: d.kind,
        side: d.side, hand: d.hand, edge: d.edge, color: d.color,
        jambEnabled: d.jambEnabled, jambColor: d.jambColor, jambLenM: d.jambLenM, jambThickM: d.jambThickM,
        sashEnabled: d.sashEnabled, glassColor: d.glassColor, glassThickM: d.glassThickM, glassFillColor: d.glassFillColor,
        labelId: d.labelId,
      })),
      stairs: ((scene as any).stairs || []).map(serializeStair),

    };
  }

  /**
   * Deserialisierung — bewusst NUR über die zentrale `restoreOneScene()`-Logik
   * aus `sceneSerde`. Es darf keine zweite, unvollständige Wiederherstellung
   * geben: früher gingen hier u. a. `strokePattern`, `roughen`,
   * `appearanceSeed`, `isGuide` und die Fangpunkt-Optionen verloren, wodurch
   * Objekte nach Undo/Redo wieder auf „Durchgezogen“ zurücksprangen.
   */
  private _restoreOneScene(scene: Scene, data: any) {
    restoreOneScene(scene, data);
    if (!data) return;
    // Sticker-Besitzer der Tabellen ergänzen (positionsgleiche Reihenfolge).
    const tables: any[] = (scene as any).tables || [];
    const rawTables: any[] = Array.isArray(data.tables) ? data.tables : [];
    for (let i = 0; i < Math.min(tables.length, rawTables.length); i++) {
      if (rawTables[i]?._stickerEditOwnerId) tables[i]._stickerEditOwnerId = rawTables[i]._stickerEditOwnerId;
    }
  }


  /** Verlaufs-Kachelspeicher: Pixeldaten liegen einmal im Speicher, Stände referenzieren nur. */
  private _rasterTileStore = new RasterTileStore();
  /** Kompakter Stand für Verlauf/Vergleich (Rasterkacheln als Referenz). */
  private _snapHistory(): string { return this._serializeScene(true); }

  private _serializeScene(forHistory = false): string {
    const scenesObj: Record<string, any> = {};
    for (const [id, sc] of this.scenesById.entries()) {
      scenesObj[id] = this._serializeOneScene(sc);
    }
    return JSON.stringify({
      // Backwards-compat: aktive Scene flach.
      ...this._serializeOneScene(this.scene),
      labels: this.labelManager.list().map(l => ({ ...l })),
      libraryDefinitions: serializeDefinitions(this.libraryDefinitions),
      libraryFolders: serializeFolders(this.libraryFolders),
      // Multi-Sheet-State
      sheets: this.sheetManager.toJSON(),
      activeSheetId: this.activeSheetId,
      sheetOverlays: this.sheetOverlayStore.toJSON(),
      scenesById: scenesObj,
      // Druckpläne
      plans: this.planManager.toJSON(),
      planFolders: this.planManager.foldersToJSON(),
      spreadLayouts: this.planManager.spreadLayoutsToJSON(),
      planScenesById: (() => {
        const out: Record<string, any> = {};
        for (const [id, sc] of this.planScenesById.entries()) {
          out[id] = this._serializeOneScene(sc);
        }
        return out;
      })(),
      planOverlays: this.planOverlayStore.toJSON(),
      // Rasterebenen (Pixelmodus) je Zeichenblatt/Druckplan.
      rasterLayersByKey: (() => {
        const out: Record<string, any> = {};
        // Eingefrorene Pixelkopien nur, solange ihr Ausschnitt eingefroren ist.
        const frozen = new Set<string>();
        for (const pl of this.planManager.list()) for (const pr of pl.projections) if (pr.mode === "frozen") frozen.add(`frozen:${pr.id}`);
        for (const [key, layers] of this._rasterLayersByKey.entries()) {
          if (key.startsWith("frozen:") && !frozen.has(key)) continue;
          const json = layers.serialize(forHistory ? this._rasterTileStore : undefined);
          if (json.length > 0) out[key] = json;
        }
        return out;
      })(),
    });
  }

  private _restoreScene(snapshot: string) {
    // Zentrale Schema-Migration: Legacy-Datenstände werden beim Laden auf das
    // aktuelle Objektmodell gehoben (rein additiv, ohne sichtbare Änderung).
    const data = migrateCadSnapshot(JSON.parse(snapshot));
    this._isRestoring = true;
    this.contentRevision++;
    // Rasterebenen zuerst (Kacheln laden asynchron nach).
    try {
      this._rasterLayersByKey.clear();
      const raster = data.rasterLayersByKey;
      if (raster && typeof raster === "object") {
        for (const key of Object.keys(raster)) {
          const layers = new RasterLayers();
          layers.onReady = () => { try { this.renderer?.render(); } catch { /* noop */ } };
          layers.restore(raster[key], this._rasterTileStore);
          this._rasterLayersByKey.set(key, layers);
        }
      }
    } catch (e) { console.error("CadApp raster restore:", e); }
    // Restore labels first
    if (Array.isArray(data.labels) && (this.labelManager as any).restore) {
      try { (this.labelManager as any).restore(data.labels); } catch {}
    }
    // Bibliotheksdefinitionen (additiv, fehlende Daten => leere Liste)
    this.libraryDefinitions = restoreDefinitions(data.libraryDefinitions);
    this.libraryFolders = restoreFolders(data.libraryFolders);
    this.onLibraryChange?.();
    // Restore sheets list (falls vorhanden).
    if (Array.isArray(data.sheets)) {
      this.sheetManager.restore(data.sheets);
    }
    if (data.sheetOverlays && typeof data.sheetOverlays === "object") {
      this.sheetOverlayStore.restore(data.sheetOverlays);
    }
    // Druckpläne wiederherstellen.
    if (Array.isArray(data.plans)) {
      this.planManager.restore(data.plans, Array.isArray(data.planFolders) ? data.planFolders : null);
    } else {
      this.planManager.restore([]);
    }
    this.planManager.restoreSpreadLayouts(data.spreadLayouts);
    // PlanController-Cache invalidieren (Snapshot-Items neu flatten).
    this.planController?.invalidateCache();
    // Plan-Annotation-Scenes wiederherstellen.
    this._syncPlanSceneMap();
    if (data.planScenesById && typeof data.planScenesById === "object") {
      for (const planId of [...this.planScenesById.keys()]) {
        const sc = this.planScenesById.get(planId)!;
        this._restoreOneScene(sc, data.planScenesById[planId] || null);
      }
    } else {
      // Keine Daten → alle Plan-Scenes leeren.
      for (const sc of this.planScenesById.values()) {
        this._restoreOneScene(sc, null);
      }
    }
    if (data.planOverlays && typeof data.planOverlays === "object") {
      this.planOverlayStore.restore(data.planOverlays);
    }
    if (data.scenesById && typeof data.scenesById === "object") {
      // Map auf gültige Sheet-Liste reduzieren / ergänzen.
      const validIds = new Set(this.sheetManager.list().map(s => s.id));
      // Verwaiste Scenes löschen.
      for (const id of [...this.scenesById.keys()]) {
        if (!validIds.has(id) && id !== SheetDefaults.defaultSheetId) this.scenesById.delete(id);
      }
      for (const id of validIds) {
        let sc = this.scenesById.get(id);
        if (!sc) {
          sc = new Scene();
          (sc as any)._drawingScaleRef = () => this.drawingScale;
          this.scenesById.set(id, sc);
        }
        this._restoreOneScene(sc, data.scenesById[id] || null);
      }
    } else {
      // Backwards-compat: nur aktive Scene aus flachen Feldern wiederherstellen.
      this._restoreOneScene(this.scene, data);
    }
    // Aktives Sheet wiederherstellen.
    const nextActive = (typeof data.activeSheetId === "string" && this.sheetManager.getById(data.activeSheetId))
      ? data.activeSheetId
      : SheetDefaults.defaultSheetId;
    this.activeSheetId = nextActive;
    const activeScene = this.scenesById.get(nextActive);
    if (activeScene) {
      this.scene = activeScene;
      this.renderer.scene = activeScene;
      this.topology.scene = activeScene;
    }
    this.clearSelection();
    this.setSelectedLabelId(null);
    this.pointEditMenu.hide();
    this._syncOverlayScenes();
    this.refreshLabelUI();
    this.refreshSheetUI();
    // Die geöffnete Exportseite ist lokaler Bedienzustand (nie aus Snapshot/Verlauf/Cloud):
    // sie bleibt, solange die Seite existiert – Undo/Redo schaltet nie um.
    const keptPlanId = (this.activePlanId && this.planManager.getById(this.activePlanId)) ? this.activePlanId : null;
    this.activePlanId = keptPlanId;
    this._applyPlanModeToRenderer();
    this.refreshPlanUI();
    this._lastSnapshot = this._snapHistory();
    this._isRestoring = false;
  }

  private _initHistory() {
    this._lastSnapshot = this._snapHistory();
    this._history = [this._lastSnapshot];
    this._historyTokens = [null];
    this._historyIndex = 0;
    this._emitHistoryChange();
    // Poll for scene changes (cheap: short string compare on JSON)
    this._snapshotTimer = window.setInterval(() => this._maybeSnapshot(), 250);
    void import("./raster/RasterTempStore").then((m) => m.rasterTempStoreAvailable() && m.tempCleanup(new Set())).catch(() => undefined);
  }

  private _maybeSnapshot() {
    if (this._isRestoring || this._destroyed || this.suspendHistory) return;
    // Aktion wartet auf ihren Rasterabschluss: noch kein Schritt (sonst zwei).
    if (this._deferredPending) return;
    // Don't snapshot mid-drag
    if (this.input.mouse.left || this.input.mouse.mid || this.input.mouse.right || this.input.isPanning) return;
    // Don't snapshot during an active point edit (Bewegen/Verschieben/Drehen/Offset),
    // damit Undo den gesamten Edit als einen Schritt zurücknimmt.
    if (this.selectTool && this.selectTool.isEditing()) return;
    if ((this.documentTool as any)?.warpPending) return;
    if ((this.documentTool as any)?.dissolving) return;

    if (this._actionDepth > 0) return;
    this._pushHistory(this._snapHistory());
  }

  /** Erzwingt einen History-Push der aktuellen Scene (für Plan-Operationen). */
  commitHistorySnapshot() {
    if (this._isRestoring || this._destroyed) return;
    if (this._actionDepth === 0) this._flushDeferred();
    // Innerhalb einer offenen Aktion entsteht der Schritt erst bei commitAction().
    if (this._actionDepth > 0) return;
    this._pushHistory(this._snapHistory());
  }

  /** Zentraler Push: verwirft den Redo-Zweig, begrenzt auf 21 Zustände. */
  /**
   * Inhaltsrevision: steigt bei jeder erfassten Änderung (Aktion, Auto-Snapshot,
   * Undo/Redo, Import, Cloud). Verknüpfte Ausschnitte vergleichen danach den
   * echten Blattinhalt – nicht zufällige Renderzyklen.
   */
  contentRevision = 0;
  bumpContentRevision() { this.contentRevision++; }

  private _pushHistory(snap: string, token: string | null = null) {
    if (snap === this._lastSnapshot) return;
    if (!Array.isArray(this._historyTokens) || this._historyTokens.length !== this._history.length) {
      this._historyTokens = this._history.map(() => null);
    }
    this.contentRevision++;
    if (this._historyIndex < this._history.length - 1) {
      this._history = this._history.slice(0, this._historyIndex + 1);
      this._historyTokens = this._historyTokens.slice(0, this._historyIndex + 1);
    }
    this._history.push(snap);
    this._historyTokens.push(token);
    while (this._history.length > this._historyMax) { this._history.shift(); this._historyTokens.shift(); }
    this._historyIndex = this._history.length - 1;
    this._lastSnapshot = snap;
    this._rasterTileStore.prune([...this._history, this._lastSnapshot]);
    this._emitHistoryChange();
  }

  /**
   * Zentrale Aktionsschnittstelle: beginAction() → Änderung → commitAction()
   * erzeugt genau EINEN Undo-Schritt (egal wie viele Objekte). cancelAction()
   * stellt den Ausgangsstand wieder her, ohne Verlaufsschritt. Verschachtelt
   * aufrufbar; nur die äußerste Aktion zählt.
   */
  beginAction() {
    if (this._destroyed) return;
    if (this._actionDepth === 0) {
      this._flushDeferred();
      // Noch nicht erfasste Vorher-Änderungen zuerst als eigenen Schritt sichern.
      if (!this._isRestoring) {
        const pre = this._snapHistory();
        this._pushHistory(pre);
      }
      this._actionStartSnapshot = this._lastSnapshot;
      this._actionToken = null;
      this._actionPrevSuspend = this.suspendHistory;
      this.suspendHistory = true;
    }
    this._actionDepth++;
  }

  commitAction() {
    if (this._actionDepth <= 0) return;
    this._actionDepth--;
    if (this._actionDepth > 0) return;
    this.suspendHistory = this._actionPrevSuspend;
    this._actionStartSnapshot = null;
    const token = this._actionToken;
    this._actionToken = null;
    if (this._isRestoring || this._destroyed) return;
    (this as any)._changeDirty = true;
    if (token && this._deferredTokens.has(token)) {
      // Rasterjob dieser Aktion läuft noch: der Schritt entsteht erst mit
      // seinem Abschluss (Zeichnen + Rastern = genau ein Undo-Schritt).
      this._deferredPending = token;
      return;
    }
    this._pushHistory(this._snapHistory(), token);
  }

  /** Zugehörige Rasterjobs von Aktionen, deren Schritt bis zum Abschluss wartet. */
  private _deferredTokens = new Set<string>();
  private _deferredPending: string | null = null;

  /** Rasterjob meldet: Schritt der Aktion `token` erst mit dem Jobabschluss bilden. */
  deferActionCommit(token: string | null) { if (token) this._deferredTokens.add(token); }

  /** Job beendet (Erfolg, Fehler, Abbruch): wartenden Schritt ggf. jetzt bilden. */
  releaseDeferredAction(token: string | null) {
    if (!token) return;
    if (this._deferredPending === token) this._flushDeferred();
    this._deferredTokens.delete(token);
  }

  /** Bildet den wartenden Schritt sofort (Vektorstand) – nie Nachtrag in alte Schritte. */
  private _flushDeferred() {
    const t = this._deferredPending;
    if (!t) return;
    this._deferredPending = null;
    this._deferredTokens.delete(t);
    if (this._isRestoring || this._destroyed) return;
    this._pushHistory(this._snapHistory(), null);
  }

  /** Action-ID der offenen Aktion (für zugehörige Hintergrund-Rasterjobs). */
  currentActionToken(): string | null {
    if (this._actionDepth <= 0) return null;
    if (!this._actionToken) this._actionToken = newRasterActionId();
    return this._actionToken;
  }

  /**
   * Atomarer Abschluss eines Hintergrund-Rasterjobs. Ist der oberste
   * Verlaufseintrag noch die auslösende Aktion (und nichts dazwischen), wird
   * das Ergebnis in genau diesen Schritt übernommen – eine Benutzeraktion
   * bleibt EIN Undo-Schritt. Sonst entsteht ein eigener Schritt. Läuft gerade
   * eine fremde Aktion, wird nichts eingeschachtelt (false).
   */
  commitRasterJob(token: string | null, apply: () => void): boolean {
    if (this._destroyed || this._isRestoring || this._actionDepth > 0) return false;
    if (!token || this._deferredPending !== token) {
      // Auslösende Aktion ist bereits ein eigener Schritt: abgeschlossene
      // Schritte werden nie verändert → Ergebnis als eigener Schritt.
      let ok = false;
      this.runAction(() => { apply(); ok = true; });
      return ok;
    }
    try { apply(); }
    catch (e) {
      console.error("Rasterabschluss fehlgeschlagen:", e);
      this._flushDeferred(); // Aktion bleibt mit Vektorstand erhalten
      return false;
    }
    this._deferredPending = null;
    this._deferredTokens.delete(token);
    (this as any)._changeDirty = true;
    this._pushHistory(this._snapHistory(), token);
    return true;
  }

  cancelAction() {
    if (this._actionDepth <= 0) return;
    this._actionDepth = 0;
    this._actionToken = null;
    this.suspendHistory = this._actionPrevSuspend;
    const start = this._actionStartSnapshot;
    this._actionStartSnapshot = null;
    if (start && !this._destroyed && start !== this._snapHistory()) {
      this._restoreScene(start);
      this._lastSnapshot = start;
    }
  }

  isActionOpen() { return this._actionDepth > 0; }

  /**
   * Eine abgeschlossene Benutzerhandlung (Strich fertig, Objekt platziert …)
   * = genau ein Undo-Schritt. Verschachtelte Schritte (z. B. Rastern im
   * Pixelmodus) gehen in derselben äußeren Aktion auf. Wirft fn, wird alles
   * zurückgenommen – keine Teiländerungen im Projekt.
   */
  runAction<T>(fn: () => T): T | undefined {
    this.beginAction();
    let ok = false;
    try { const r = fn(); ok = true; return r; }
    catch (e) { console.error("Aktion abgebrochen:", e); return undefined; }
    finally { if (ok) this.commitAction(); else this.cancelAction(); }
  }

  /**
   * Sicherheitsnetz: keine offene Aktion und kein hängendes suspendHistory
   * über Werkzeug-/Blattwechsel oder Fokusverlust hinaus.
   */
  settleHistoryState() {
    // Laufende Rasterjobs liegen bewusst AUSSERHALB von _actionDepth: sie werden
    // hier weder bestätigt noch abgebrochen, sondern schließen atomar selbst ab.
    if (this._actionDepth > 0) this.commitAction();
    if (this._actionDepth === 0 && this.suspendHistory) this.suspendHistory = false;
  }

  private _emitHistoryChange() {
    this.onHistoryChange?.(this._historyIndex > 0, this._historyIndex < this._history.length - 1);
    this._emitPlanUiChange?.();
    this.onSceneCommitted?.();
  }

  /**
   * Übernimmt eine von außen eingespielte Änderung (Zusammenarbeit) in den
   * Vergleichsstand, damit sie KEINEN eigenen Verlaufsschritt erzeugt.
   * Der lokale Verlauf beginnt danach neu, damit Undo nie fremde Änderungen
   * zurücknimmt.
   */
  markExternalChange() {
    if (this._destroyed) return;
    const snap = this._snapHistory();
    if (snap === this._lastSnapshot) return;
    cancelRasterJobs(this, "external");
    this._lastSnapshot = snap;
    this._history = [snap];
    this._historyTokens = [null];
    this._historyIndex = 0;
    this._rasterTileStore.prune([...this._history, this._lastSnapshot]);
    this.onHistoryChange?.(false, false);
  }

  /** Serialisierungsstand für die Zusammenarbeit (schreibgeschützt). */
  serializeForCollab(): string | null {
    if (this._destroyed) return null;
    return this._serializeScene();
  }

  /**
   * Übernimmt Blatt- bzw. Ebenenliste aus der Cloud – ohne Undo-Schritt und
   * ohne Werkzeug, Kamera oder Auswahl zu verändern.
   */
  resolveCollabScene(sheetId: string): Scene | null {
    if (sheetId.startsWith("plan:")) {
      const planId = sheetId.slice(5);
      if (!this.planManager.getById(planId)) return null;
      return this._ensurePlanScene(planId);
    }
    return this.scenesById.get(sheetId) ?? null;
  }

  applyCollabStructure(kind: "sheets" | "labels" | "plans" | "planFolders" | "planOverlays" | "spreadLayouts", list: Record<string, unknown>[]) {
    if (this._destroyed) return;
    if (kind === "plans" || kind === "planFolders" || kind === "planOverlays" || kind === "spreadLayouts") {
      if (kind === "plans") this.planManager.restore(list as any, this.planManager.listFolders());
      else if (kind === "planFolders") this.planManager.restore(this.planManager.toJSON(), list as any);
      else if (kind === "spreadLayouts") {
        const rec: Record<string, any> = {};
        for (const { id, ...st } of list as any[]) rec[id] = st;
        this.planManager.restoreSpreadLayouts(rec);
      }
      else {
        const rec: Record<string, any> = {};
        for (const { id, ...st } of list as any[]) rec[id] = st;
        this.planOverlayStore.restore(rec);
      }
      this._syncPlanSceneMap();
      if (this.activePlanId && !this.planManager.getById(this.activePlanId)) this.setActivePlanId(null);
      else if (this.activePlanId) this._applyPlanModeToRenderer();
      this._syncPlanTracingLayers();
      this.planController?.invalidateCache();
      this.bumpContentRevision();
      this.refreshPlanUI();
      this.renderer?.render?.();
      return;
    }
    if (kind === "sheets") {
      if (!list.length) return;
      this.sheetManager.restore(list as any);
      this._syncSheetSceneMap();
    } else {
      this.labelManager.restore(list as any);
    }
    this.bumpContentRevision();
    this.renderer?.render?.();
  }

  undo() {
    cancelRasterJobs(this, "undo");
    this._flushDeferred();
    if (this._actionDepth > 0) { this.cancelAction(); this._emitHistoryChange(); return; }
    // Treppe: laufendes Zeichnen/Bewegen nimmt zuerst den lokalen Schritt zurück.
    if ((this.activeTool as any) === this.stairTool && this.stairTool.undoStep()) { this.renderer?.render?.(); return; }
    this._maybeSnapshot();
    if (this._historyIndex <= 0) return;
    this._historyIndex--;
    this._restoreScene(this._history[this._historyIndex]);
    this.stairTool?.afterHistoryRestore?.();
    this._emitHistoryChange();
  }

  redo() {
    cancelRasterJobs(this, "redo");
    this._flushDeferred();
    if (this._historyIndex >= this._history.length - 1) return;
    this._historyIndex++;
    this._restoreScene(this._history[this._historyIndex]);
    this.stairTool?.afterHistoryRestore?.();
    this._emitHistoryChange();
  }

  /* ---- Selection ---- */
  setSelection(selection: Selection | null) {
    // Tabellen-Zellmodus endet, sobald die Auswahl diese Tabelle verlässt
    // (freie Fläche, anderes Objekt oder andere Tabelle).
    if (this.tableEditId) {
      const stillSameTable = !!selection
        && ((selection as any).type === SelectionType.TEXTBOX || (selection as any).type === SelectionType.TEXTBOX_HANDLE)
        && (selection as any).textBoxId === this.tableEditId;
      if (!stillSameTable) this.endTableEdit();
    }
    this.selection = selection;

    this.renderer.setSelection(selection);
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this._updateSettingsVisibility();
    this.onSelectionChange?.();
  }

  clearSelection() { this.setSelection(null); }

  /**
   * Zuletzt gewähltes objektbezogenes Werkzeug (Linie, Polygon, Text …).
   * Bestimmt, welche Objektarten "Alles"/Strg+A auswählt. Auswahlwerkzeug,
   * Radierer und Pipette ändern diesen Zustand ausdrücklich NICHT.
   */
  selectionFilterTool: ObjectToolId | null = null;

  /** Hebt den Werkzeugfilter auf — "Alles" wählt dann wieder alles aus. */
  clearSelectionFilterTool() { this.selectionFilterTool = null; }

  /**
   * "Alles auswählen" im aktiven CAD-Plan. Sammelt alle auswählbaren Objekte
   * über denselben Collector wie die Rahmen-Auswahl und schreibt sie direkt in
   * `selectTool.marqueeSelectedIds` — kein zweiter Auswahlzustand.
   * Ist zuletzt ein objektbezogenes Werkzeug aktiv gewesen, werden nur dessen
   * Objekte erfasst. Läuft gerade eine unbestätigte Zeichenaktion, passiert nichts.
   */
  selectAllInActiveCadPlan(): boolean {
    // Kein sicherer Wechsel zum Auswahlwerkzeug, solange gezeichnet wird.
    try {
      if (this.textEditor?.isActive?.()) return false;
      const t: any = this.activeTool as any;
      if (t && t !== this.selectTool && typeof t.isDrawing === "function" && t.isDrawing()) return false;
      const st: any = this.selectTool as any;
      if (st?.pasteFloatActive || st?.groupRotateActive || st?.groupDragActive || st?.groupAnchorActive) return false;
    } catch { /* ignore */ }

    // Filter VOR dem Werkzeugwechsel sichern — `setTool(SELECT)` darf den
    // Werkzeugkontext nicht verlieren.
    const filter = this.selectionFilterTool;
    if (this.activeTool !== this.selectTool) this.setTool(ToolIds.SELECT);
    const n = this.selectTool.selectAll(filter);
    if (!n) return false;
    // Führendes Objekt = zuletzt erfasstes Objekt der Auswahl.
    try { this.selectTool.syncPrimarySelection(); } catch {}
    try { this.onSelectionChange?.(); } catch {}
    try { this.renderer.render(); } catch {}
    return true;
  }



  /** True, wenn eine Löschung per Entf-Taste etwas entfernen würde. */
  hasDeletableSelection(): boolean {
    if (this.doorTool?.selectedDoorId) return true;
    if (this.activePlanId && (this.planController as any)?.hasSelection?.()) return true;
    if (this.activeTool === this.selectTool && this.selectTool.marqueeSelectedIds.length > 0) return true;
    if (this.selection) return true;
    if (this.selectedLabelId) return true;
    return false;
  }

  /** Programmgesteuertes Löschen der aktuellen Auswahl — identisches Verhalten
   *  wie die Entf/Backspace-Taste. */
  deleteSelection(): boolean {
    const ev = new KeyboardEvent("keydown", { key: "Delete", bubbles: true });
    try { Object.defineProperty(ev, "target", { value: document.body }); } catch {}
    window.dispatchEvent(ev);
    return true;
  }

  /* ---- Mehrfachauswahl: Einstellungen auf alle gleichartigen Objekte ---- */

  /** IDs der Mehrfachauswahl (Marquee/Shift) einer bestimmten Objektart. */
  private _multiSelectedIds(kind: string): string[] {
    const ids: string[] = [];
    const list = (this.selectTool as any)?.marqueeSelectedIds as { kind: string; id: string }[] | undefined;
    if (!list) return ids;
    for (const m of list) {
      const k = m.kind === "textbox" ? "textBox" : m.kind;
      if (k === kind) ids.push(m.id);
    }
    return ids;
  }

  /**
   * Nur echt gleichartige Werkzeugobjekte dürfen gespiegelt werden.
   * Polygon vs. Schraffur und Linie vs. Hilfslinie teilen sich zwar die
   * interne Struktur, bleiben aber getrennte Werkzeugtypen.
   */
  private _sameToolType(primary: any, other: any): boolean {
    if (!!other?.isPolygon !== !!primary?.isPolygon) return false;
    if (!!other?.isGuide !== !!primary?.isGuide) return false;
    return true;
  }

  private _panelMirror<T extends object>(primary: T | null, kind: string, lookup: (id: string) => T | null | undefined): T | null {
    if (!primary) return null;
    const sibs: T[] = [];
    for (const id of this._multiSelectedIds(kind)) {
      const o = lookup(id);
      if (o && o !== primary && this._sameToolType(primary, o)) sibs.push(o);
    }
    return sibs.length ? mirrorProxy(primary, sibs) : primary;
  }


  /** Von den Werkzeugeinstellungen genutzte Getter — spiegeln Änderungen bei
   *  Mehrfachauswahl automatisch auf alle Objekte derselben Art. */
  getEditSegment() {
    return this._panelMirror(this.getSelectedSegment(), "segment", (id) => this.scene.getSegmentById(id));
  }
  getEditHatch() {
    return this._panelMirror(this.getSelectedHatch(), "hatch", (id) => this.scene.getHatchById(id));
  }
  getEditTextBox() {
    return this._panelMirror(this.getSelectedTextBox(), "textBox", (id) => this.scene.getTextBoxById(id));
  }
  getEditDimension() {
    return this._panelMirror(this.getSelectedDimension() as any, "dimension", (id) => (this.scene as any).getDimensionById?.(id));
  }
  getEditFreeStroke() {
    return this._panelMirror(this.getSelectedFreeStroke() as any, "freeStroke", (id) => this.scene.getFreeStrokeById(id));
  }

  /**
   * Zentrale Batch-Ziele der Mehrfachauswahl: Leader (= aktuelle Host-Auswahl,
   * also erstes Objekt) plus alle ausgewählten Objekte DESSELBEN konkreten
   * Objekttyps (Polygon ≠ Schraffur, Linie ≠ Hilfslinie, Text ≠ Tabelle).
   * Gesperrte Ebenen werden ausgelassen.
   */
  getBatchEditTargets(kind: "segment" | "hatch" | "textBox" | "table" | "dimension" | "freeStroke" | "wall" | "document" | "stair" | "library"): { leader: any | null; targets: any[] } {
    const sc: any = this.scene;
    const lookup: Record<string, (id: string) => any> = {
      segment: (id) => sc.getSegmentById(id),
      hatch: (id) => sc.getHatchById(id),
      textBox: (id) => sc.getTextBoxById?.(id),
      table: (id) => sc.getTableById?.(id),
      dimension: (id) => sc.getDimensionById?.(id),
      freeStroke: (id) => sc.getFreeStrokeById(id),
      wall: (id) => sc.getWallById(id),
      document: (id) => sc.getDocumentById?.(id),
      stair: (id) => (sc.stairs || []).find((s: any) => s.id === id),
      library: (id) => (sc.libraryInstances || []).find((s: any) => s.id === id),
    };
    const sel: any = this.selection;
    const leaderId: string | null =
      kind === "segment" ? sel?.segmentId
      : kind === "hatch" ? sel?.hatchId
      : kind === "textBox" || kind === "table" ? sel?.textBoxId
      : kind === "dimension" ? sel?.dimensionId
      : kind === "freeStroke" ? sel?.freeStrokeId
      : kind === "wall" ? sel?.wallId
      : kind === "document" ? sel?.documentId
      : kind === "stair" ? (sel?.stairId ?? null)
      : kind === "library" ? sel?.libraryInstanceId
      : null;
    let leader = leaderId ? lookup[kind](leaderId) : null;
    const list = ((this.selectTool as any)?.marqueeSelectedIds ?? []) as { kind: string; id: string }[];
    const listKind = kind === "textBox" ? "textbox" : kind;
    if (!leader) {
      const first = list.find(m => m.kind === listKind);
      leader = first ? lookup[kind](first.id) : null;
    }
    if (!leader) return { leader: null, targets: [] };
    const editable = (o: any) => {
      try { return !o?.labelId || (this.labelManager as any).isEditable?.(o.labelId) !== false; } catch { return true; }
    };
    const targets: any[] = [leader];
    for (const m of list) {
      if (m.kind !== listKind) continue;
      const o = lookup[kind](m.id);
      if (!o || targets.includes(o) || !this._sameToolType(leader, o) || !editable(o)) continue;
      targets.push(o);
    }
    return { leader, targets };
  }

  /**
   * Bewusste Ausnahme zur Geometrie-Sperre: Wanddicke gemeinsam für alle
   * ausgewählten gleichartigen Wände. Nur thicknessM, Verlauf/Ecken/Bezugsseite
   * bleiben je Wand erhalten; Topologie wird neu berechnet; 1 Undo-Schritt.
   */
  setBatchWallThickness(thicknessM: number): boolean {
    const v = Math.max(0.001, Number(thicknessM));
    if (!Number.isFinite(v)) return false;
    const { targets } = this.getBatchEditTargets("wall");
    if (!targets.length) return false;
    this.beginAction();
    try {
      for (const w of targets) w.thicknessM = v;
      _wallMaint(this.scene as any, targets);
    } finally { this.commitAction(); }
    try { (this as any).topology?.invalidate?.(); } catch {}
    try { this.renderer.render(); } catch {}
    return true;
  }

  /** Ebenenwechsel für Leader + gleichartige Auswahl über die passende assign…ToLabel()-Methode. */
  assignBatchToLabel(kind: Parameters<CadApp["getBatchEditTargets"]>[0], nextId: string): boolean {
    const { targets } = this.getBatchEditTargets(kind);
    if (!targets.length) return false;
    const ids = targets.map(t => t.id);
    const sc: any = this.scene;
    switch (kind) {
      case "segment": sc.assignSegmentsToLabel(ids, nextId); break;
      case "hatch": sc.assignHatchesToLabel(ids, nextId); break;
      case "textBox": sc.assignTextBoxesToLabel(ids, nextId); break;
      case "table": sc.assignTablesToLabel(ids, nextId); break;
      case "dimension": sc.assignDimensionsToLabel(ids, nextId); break;
      case "document": sc.assignDocumentsToLabel(ids, nextId); break;
      case "stair": sc.assignStairsToLabel(ids, nextId); break;
      case "library": sc.assignLibraryInstancesToLabel(ids, nextId); break;
      case "wall": sc.assignWallsToLabel(ids, nextId); break;
      case "freeStroke": sc.assignFreeStrokesToLabel(ids, nextId); break;
    }
    this.commitHistorySnapshot();
    this.refreshLabelUI();
    try { this.renderer.render(); } catch {}
    return true;
  }


  getSelectedSegment() {
    if (!this.selection || !this.selection.segmentId) return null;
    return this.scene.getSegmentById(this.selection.segmentId);
  }

  getSelectedHatch() {
    if (!this.selection || !this.selection.hatchId) return null;
    const h = this.scene.getHatchById(this.selection.hatchId);
    // Polygone sind eigenständige Objekte und keine Schraffuren.
    return h && (h as any).isPolygon === true ? null : h;
  }

  getSelectedDimension() {
    if (!this.selection || this.selection.type !== SelectionType.DIMENSION) return null;
    return this.scene.getDimensionById((this.selection as any).dimensionId);
  }

  getSelectedTextBox(): TextBox | null {
    if (!this.selection) return null;
    if (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE) return null;
    const id = (this.selection as any).textBoxId;
    if (!id) return null;
    return this.scene.getTextBoxById(id);
  }

  /** Aktuell gewähltes Tabellenobjekt (nutzt die TextBox-Auswahlart). */
  getSelectedTable(): any {
    if (!this.selection) return null;
    if (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE) return null;
    const id = (this.selection as any).textBoxId;
    return id ? (this.scene as any).getTableById(id) : null;
  }

  /** TextBox ODER Tabelle — gemeinsame Box-Infrastruktur (Auswahl/HUB/Snap). */
  getSelectedBox(): any {
    if (!this.selection) return null;
    if (this.selection.type !== SelectionType.TEXTBOX && this.selection.type !== SelectionType.TEXTBOX_HANDLE) return null;
    const id = (this.selection as any).textBoxId;
    return id ? (this.scene as any).getBoxById(id) : null;
  }

  /** ID der Tabelle im internen Zellmodus (null = normaler CAD-Objektmodus). */
  tableEditId: string | null = null;
  /** UI-Hook: native Tabellenplatzierung wurde abgeschlossen. */
  onTablePlaced?: (id: string) => void;
  private _tableEditListeners = new Set<(id: string | null) => void>();
  onTableEditChange(fn: (id: string | null) => void) {
    this._tableEditListeners.add(fn);
    return () => { this._tableEditListeners.delete(fn); };
  }
  beginTableEdit(id: string) {
    if (!(this.scene as any).getTableById(id)) return;
    this.tableEditId = id;
    this._tableEditListeners.forEach((l) => l(id));
    try { this.renderer?.render(); } catch { /* noop */ }
  }
  endTableEdit() {
    if (!this.tableEditId) return;
    this.tableEditId = null;
    this._tableEditListeners.forEach((l) => l(null));
    try { this.renderer?.render(); } catch { /* noop */ }
  }

  getSelectedWall() {
    if (!this.selection) return null;
    const wallId = (this.selection as any).wallId;
    if (!wallId) return null;
    return this.scene.getWallById(wallId);
  }

  /** Alle ausgewählten Wände (führende Auswahl + Mehrfachauswahl). */
  getSelectedWalls(): any[] {
    const out: any[] = [];
    const primary = this.getSelectedWall();
    if (primary) out.push(primary);
    for (const id of this._multiSelectedIds("wall")) {
      const w = this.scene.getWallById(id);
      if (w && !out.includes(w)) out.push(w);
    }
    return out;
  }

  getSelectedFreeStroke() {
    if (!this.selection || this.selection.type !== SelectionType.FREE_STROKE) return null;
    return this.scene.getFreeStrokeById((this.selection as any).freeStrokeId);
  }

  /** Auto-Form nachträglich auf alle ausgewählten Freihandlinien anwenden/lösen. */
  setSelectedFreeAutoShape(on: boolean): boolean {
    const targets = new Set<any>();
    const primary = this.getSelectedFreeStroke();
    if (primary) targets.add(primary);
    for (const id of this._multiSelectedIds("freeStroke")) {
      const s = this.scene.getFreeStrokeById(id);
      if (s) targets.add(s);
    }
    let changed = false;
    for (const s of targets) if (setStrokeAutoShape(s, on)) changed = true;
    if (changed) { (this as any).requestRender?.(); this.commitHistorySnapshot?.(); }
    return changed;
  }


  /* ---- Label Selection ---- */
  setSelectedLabelId(labelId: string | null) {
    this.selectedLabelId = labelId || null;
    this.renderer.setSelectedLabelId(this.selectedLabelId);
    this.idPanel.render();
    this._syncLineSettingsFromContext();
    this._updateSettingsVisibility();
  }

  selectLabelGroup(labelId: string) {
    this.clearSelection();
    this.setSelectedLabelId(labelId);
    this.showLineSettingsPanel(true);
  }

  setActiveDrawLabelId(labelId: string) {
    let next = labelId || Defaults.defaultLabelId;
    // Auf gesperrten Ebenen darf nicht gezeichnet werden: automatisch auf die
    // nächste freie Ebene wechseln, sonst Hinweis geben.
    if (this.labelManager.isEditLocked(next)) {
      const free = this.labelManager.list().find((g) => !g.editLocked && g.visible !== false);
      if (free) next = free.id;
      else { try { console.warn("Alle Ebenen sind gesperrt — Zeichnen nicht möglich."); } catch {} }
    }
    this.activeDrawLabelId = next;
    this._syncLabelSelect();
  }

  refreshLabelUI() {
    this._syncLabelSelect();
    this._syncHatchLabelSelect();
    this._syncMeasureLabelSelect();
    this._syncTextLabelSelect();
    this.idPanel.render();
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this.onLabelsChange?.();
  }

  private _syncLabelSelect() {
    const groups = this.labelManager.list();
    const currentValue = this.lineIdSelect.value;
    this.lineIdSelect.innerHTML = "";
    for (const group of groups) {
      const opt = document.createElement("option");
      opt.value = group.id;
      opt.textContent = group.name;
      this.lineIdSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(currentValue) ? currentValue : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.activeDrawLabelId = preferred;
    this.lineIdSelect.value = preferred;
  }

  private _syncHatchLabelSelect() {
    const groups = this.labelManager.list();
    const currentValue = this.hatchIdSelect.value;
    this.hatchIdSelect.innerHTML = "";
    for (const group of groups) {
      const opt = document.createElement("option");
      opt.value = group.id;
      opt.textContent = group.name;
      this.hatchIdSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(currentValue) ? currentValue : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.hatchIdSelect.value = preferred;
  }

  /* ---- Selected objects ---- */
  getSelectedObjectIds(): string[] {
    const selected = this.getSelectedSegment();
    if (selected) return [selected.id];
    if (this.selectedLabelId) return this.scene.getSegmentsByLabelId(this.selectedLabelId).map(s => s.id);
    return [];
  }

  getSelectedHatchObjectIds(): string[] {
    const selected = this.getSelectedHatch();
    if (selected) return [selected.id];
    if (this.selectedLabelId) return this.scene.getHatchesByLabelId(this.selectedLabelId).map(h => h.id);
    return [];
  }

  getSelectedGroupSegments() {
    if (!this.selectedLabelId) return [];
    return this.scene.getSegmentsByLabelId(this.selectedLabelId);
  }

  getSelectedGroupHatches() {
    if (!this.selectedLabelId) return [];
    return this.scene.getHatchesByLabelId(this.selectedLabelId);
  }

  /**
   * Gemeinsame Standardwerte für Linienart und Roughen je Werkzeug.
   * Neue Objekte erhalten stets einen frischen Seed (kein appearanceSeed hier).
   */
  strokeEffectDefaults: Record<string, { strokePattern: StrokePatternParams; roughen: RoughenParams }> = {
    line: { strokePattern: { ...DEFAULT_STROKE_PATTERN }, roughen: { ...CAD_ROUGHEN_DEFAULT } },
    polygon: { strokePattern: { ...DEFAULT_STROKE_PATTERN }, roughen: { ...CAD_ROUGHEN_DEFAULT } },
    hatch: { strokePattern: { ...DEFAULT_STROKE_PATTERN }, roughen: { ...CAD_ROUGHEN_DEFAULT } },
    // Freihand nutzt in der CAD-Oberfläche die gemeinsamen 80-mm-Standards.
    free: { strokePattern: { ...DEFAULT_STROKE_PATTERN }, roughen: { ...CAD_ROUGHEN_DEFAULT } },
  };

  getStrokeEffectDefaults(kind: "line" | "polygon" | "hatch" | "free") {
    const d = this.strokeEffectDefaults[kind] || this.strokeEffectDefaults.line;
    return { strokePattern: { ...d.strokePattern }, roughen: { ...d.roughen } };
  }

  getCurrentLineStyle() {
    const selected = this.getSelectedSegment();
    if (selected) {
      return {
        color: selected.color || this.defaultLineColor,
        thicknessM: selected.thicknessM || this.defaultLineThicknessM,
        labelId: selected.labelId || Defaults.defaultLabelId,
        arrowStart: !!selected.arrowStart,
        arrowEnd: !!selected.arrowEnd,
        arrowScale: (typeof selected.arrowScale === "number" && selected.arrowScale > 0) ? selected.arrowScale : 1,
      };
    }
    const groupSegs = this.getSelectedGroupSegments();
    if (groupSegs.length > 0) {
      const ref = groupSegs[0];
      return {
        color: ref.color || this.defaultLineColor,
        thicknessM: ref.thicknessM || this.defaultLineThicknessM,
        labelId: ref.labelId || Defaults.defaultLabelId,
        arrowStart: !!ref.arrowStart,
        arrowEnd: !!ref.arrowEnd,
        arrowScale: (typeof ref.arrowScale === "number" && ref.arrowScale > 0) ? ref.arrowScale : 1,
      };
    }
    return {
      color: this.defaultLineColor,
      thicknessM: this.defaultLineThicknessM,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
      arrowStart: this.defaultArrowStart,
      arrowEnd: this.defaultArrowEnd,
      arrowScale: this.defaultArrowScale,
    };
  }


  /** Aktueller Stil des Polygonwerkzeugs (ausgewähltes Polygon hat Vorrang). */
  getCurrentPolygonStyle() {
    const sel = this.selection?.hatchId ? this.scene.getHatchById(this.selection.hatchId) : null;
    const selPoly = sel && (sel as any).isPolygon ? (sel as any) : null;
    return {
      color: selPoly?.strokeColor || this.defaultPolygonColor,
      thicknessM: selPoly?.thicknessM ?? this.defaultPolygonThicknessM,
      alpha: selPoly?.alpha ?? this.defaultPolygonAlpha,
      labelId: selPoly?.labelId || this.selectedLabelId || Defaults.defaultLabelId,
    };
  }

  getCurrentHatchStyle() {
    const selected = this.getSelectedHatch();
    if (selected) {
      return {
        fillColor: selected.fillColor || this.defaultHatchFillColor,
        strokeColor: selected.strokeColor || this.defaultHatchStrokeColor,
        fillAlphaPct: selected.fillAlphaPct ?? this.defaultHatchFillAlphaPct,
        strokeWidthPx: (typeof selected.strokeWidthPx === "number") ? selected.strokeWidthPx : this.defaultHatchStrokeWidthPx,
        patternEnabled: !!selected.patternEnabled,
        patternId: selected.patternId || this.defaultHatchPatternId,
        patternScale: selected.patternScale ?? this.defaultHatchPatternScale,
        patternAngleDeg: selected.patternAngleDeg ?? this.defaultHatchPatternAngleDeg,
        patternSkewDeg: selected.patternSkewDeg ?? this.defaultHatchPatternSkewDeg, patternStretch: selected.patternStretch ?? this.defaultHatchPatternStretch, patternOffsetX: selected.patternOffsetX ?? 0, patternOffsetY: selected.patternOffsetY ?? 0,
        labelId: selected.labelId || Defaults.defaultLabelId,
        areaLabel: {
          show: !!selected.areaLabel?.show,
          textColor: selected.areaLabel?.textColor || Defaults.areaTextColor,
          fontSizePx: selected.areaLabel?.fontSizePx ?? Defaults.areaFontSizePx,
          bgColor: selected.areaLabel?.bgColor || Defaults.areaBgColor,
          bgAlphaPct: selected.areaLabel?.bgAlphaPct ?? Defaults.areaBgAlphaPct,
          offsetX: selected.areaLabel?.offsetX || 0,
          offsetY: selected.areaLabel?.offsetY || 0,
        } as Partial<AreaLabel>,
      };
    }
    const groupHatches = this.getSelectedGroupHatches();
    if (groupHatches.length > 0) {
      const ref = groupHatches[0];
      return {
        fillColor: ref.fillColor || this.defaultHatchFillColor,
        strokeColor: ref.strokeColor || this.defaultHatchStrokeColor,
        fillAlphaPct: ref.fillAlphaPct ?? this.defaultHatchFillAlphaPct,
        strokeWidthPx: (typeof ref.strokeWidthPx === "number") ? ref.strokeWidthPx : this.defaultHatchStrokeWidthPx,
        patternEnabled: !!ref.patternEnabled,
        patternId: ref.patternId || this.defaultHatchPatternId,
        patternScale: ref.patternScale ?? this.defaultHatchPatternScale,
        patternAngleDeg: ref.patternAngleDeg ?? this.defaultHatchPatternAngleDeg,
        patternSkewDeg: ref.patternSkewDeg ?? this.defaultHatchPatternSkewDeg, patternStretch: ref.patternStretch ?? this.defaultHatchPatternStretch, patternOffsetX: ref.patternOffsetX ?? 0, patternOffsetY: ref.patternOffsetY ?? 0,
        labelId: ref.labelId || Defaults.defaultLabelId,
        areaLabel: {
          show: !!ref.areaLabel?.show,
          textColor: ref.areaLabel?.textColor || Defaults.areaTextColor,
          fontSizePx: ref.areaLabel?.fontSizePx ?? Defaults.areaFontSizePx,
          bgColor: ref.areaLabel?.bgColor || Defaults.areaBgColor,
          bgAlphaPct: ref.areaLabel?.bgAlphaPct ?? Defaults.areaBgAlphaPct,
          offsetX: ref.areaLabel?.offsetX || 0,
          offsetY: ref.areaLabel?.offsetY || 0,
        } as Partial<AreaLabel>,
      };
    }
    return {
      fillColor: this.defaultHatchFillColor,
      strokeColor: this.defaultHatchStrokeColor,
      fillAlphaPct: this.defaultHatchFillAlphaPct,
      strokeWidthPx: this.defaultHatchStrokeWidthPx,
      patternEnabled: this.defaultHatchPatternEnabled,
      patternId: this.defaultHatchPatternId,
      patternScale: this.defaultHatchPatternScale,
      patternAngleDeg: this.defaultHatchPatternAngleDeg,
      patternSkewDeg: this.defaultHatchPatternSkewDeg, patternStretch: this.defaultHatchPatternStretch, patternOffsetX: 0, patternOffsetY: 0, patternRotateWithShape: this.defaultHatchPatternRotateWithShape,
      displayGradient: copyDisplayGradient((this as any).defaultHatchDisplayGradient),
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
      areaLabel: {
        show: this.defaultAreaShow, textColor: Defaults.areaTextColor, fontSizePx: Defaults.areaFontSizePx,
        bgColor: Defaults.areaBgColor, bgAlphaPct: Defaults.areaBgAlphaPct, offsetX: 0, offsetY: 0,
      } as Partial<AreaLabel>,
    };
  }

  getCurrentMeasureStyle(): DimensionStyle {
    const sel = (this.selection && this.selection.type === SelectionType.DIMENSION)
      ? this.scene.getDimensionById((this.selection as any).dimensionId) : null;
    if (sel) {
      return {
        textColor: sel.textColor, textSizePx: sel.textSizePx, lineColor: sel.lineColor,
        decimals: sel.decimals, tickLengthM: sel.tickLengthM, showExtensions: sel.showExtensions,
        useFreeText: sel.useFreeText, freeText: sel.freeText,
        textBgEnabled: sel.textBgEnabled, textBgColor: sel.textBgColor, textBgAlpha: sel.textBgAlpha,
        extensionStyle: sel.extensionStyle, extensionColor: sel.extensionColor, extensionAlpha: sel.extensionAlpha,
        freeTextBold: sel.freeTextBold, freeTextItalic: sel.freeTextItalic, freeTextColor: sel.freeTextColor,
        showUnit: sel.showUnit, unit: sel.unit,
        labelId: sel.labelId,
      };
    }
    return {
      textColor: this.measureSettings.textColor, textSizePx: this.measureSettings.textSizePx,
      lineColor: this.measureSettings.lineColor, decimals: this.measureSettings.decimals,
      tickLengthM: this.measureSettings.tickLengthM, showExtensions: this.measureSettings.showExtensions,
      useFreeText: this.measureSettings.useFreeText, freeText: this.measureSettings.freeText,
      textBgEnabled: this.measureSettings.textBgEnabled, textBgColor: this.measureSettings.textBgColor,
      textBgAlpha: this.measureSettings.textBgAlpha,
      extensionStyle: this.measureSettings.extensionStyle, extensionColor: this.measureSettings.extensionColor,
      extensionAlpha: this.measureSettings.extensionAlpha,
      freeTextBold: this.measureSettings.freeTextBold, freeTextItalic: this.measureSettings.freeTextItalic,
      freeTextColor: this.measureSettings.freeTextColor,
      showUnit: this.measureSettings.showUnit, unit: this.measureSettings.unit,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  showLineSettingsPanel(shouldShow: boolean) { this.lineSettingsPanel.classList.toggle("hidden", !shouldShow); }
  showHatchSettingsPanel(shouldShow: boolean) { this.hatchSettingsPanel.classList.toggle("hidden", !shouldShow); }
  showMeasureSettingsPanel(shouldShow: boolean) { this.measureRefs.panel.classList.toggle("hidden", !shouldShow); }
  showTextSettingsPanel(shouldShow: boolean) { this.textRefs.panel.classList.toggle("hidden", !shouldShow); }

  getCurrentTextStyle(): TextBoxStyle {
    const sel = this.getSelectedTextBox();
    if (sel) {
      // Bei ausgewählter Textbox den überwiegenden Stil des Inhalts anzeigen,
      // damit die Sidebar zu dem passt, was tatsächlich zu sehen ist.
      const dom = dominantRichStyle(sel.html || "", sel.style as any);
      const domPt = dom.fontSizePt;
      return {
        textColor: dom.color ?? sel.style.textColor,
        fontSizePt: domPt ?? textStyleFontSizePt(sel.style),
        fontSizePx: sel.style.fontSizePx,
        textAlphaPct: (sel.style as any).textAlphaPct ?? Defaults.textAlphaPct,
        bgColor: sel.style.bgColor, bgAlphaPct: sel.style.bgAlphaPct,
        wrap: sel.style.wrap, align: sel.style.align,
        bold: dom.bold ?? sel.style.bold, italic: dom.italic ?? sel.style.italic,
        underline: dom.underline ?? sel.style.underline, strike: dom.strike ?? sel.style.strike,
        lineHeightPct: sel.style.lineHeightPct,
        autoSize: (sel.style as any).autoSize !== false,
        borderEnabled: sel.style.borderEnabled, borderColor: sel.style.borderColor,
        borderWidthPx: sel.style.borderWidthPx,
        labelId: sel.labelId,
      };
    }
    return {
      textColor: this.defaultTextColor, fontSizePx: this.defaultTextFontSizePx,
      textAlphaPct: this.defaultTextAlphaPct,
      bgColor: this.defaultTextBgColor, bgAlphaPct: this.defaultTextBgAlphaPct,
      wrap: this.defaultTextWrap, align: this.defaultTextAlign,
      bold: this.defaultTextBold, italic: this.defaultTextItalic,
      underline: this.defaultTextUnderline, strike: this.defaultTextStrike,
      lineHeightPct: this.defaultTextLineHeightPct,
      autoSize: this.defaultTextAutoSize,
      borderEnabled: this.defaultTextBorderEnabled, borderColor: this.defaultTextBorderColor,
      borderWidthPx: this.defaultTextBorderWidthPx,
      labelId: this.activeDrawLabelId || Defaults.defaultLabelId,
    };
  }

  beginTextEdit(box: TextBox) {
    this.showTextSettingsPanel(true);
    this.textEditor.beginEdit(box);
  }

  private _updateSettingsVisibility() {
    // Kontext-Panels aus der Auswahl nur, solange das Auswahl-Werkzeug aktiv ist —
    // beim Wechsel auf ein anderes Werkzeug erscheinen dessen Einstellungen.
    const selCtx = this.activeTool === this.selectTool;
    const isMeasureCtx = this.activeTool === this.measureTool || (selCtx && !!this.getSelectedDimension());
    const isHatchCtx = this.activeTool === this.hatchTool || (selCtx && !!(this.selection && this.selection.hatchId));
    const isLineCtx = this.activeTool === this.lineTool || (selCtx && !!(this.selection && this.selection.segmentId));
    const isTextCtx = this.activeTool === this.textTool || (selCtx && !!this.getSelectedTextBox());
    const showLine = isLineCtx || (!!this.selectedLabelId && !isMeasureCtx && !isTextCtx);
    const showHatch = isHatchCtx || (!!this.selectedLabelId && !isMeasureCtx && !isTextCtx);
    const showMeasure = isMeasureCtx;
    const showText = isTextCtx;
    this.showLineSettingsPanel(showLine);
    this.showHatchSettingsPanel(showHatch);
    this.showMeasureSettingsPanel(showMeasure);
    this.showTextSettingsPanel(showText);
  }

  /* ---- Text Settings Panel ---- */
  private _syncTextLabelSelect() {
    if (!this.textRefs?.idSelect) return;
    const groups = this.labelManager.list();
    const cur = this.textRefs.idSelect.value;
    this.textRefs.idSelect.innerHTML = "";
    for (const g of groups) {
      const opt = document.createElement("option");
      opt.value = g.id; opt.textContent = g.name;
      this.textRefs.idSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(cur) ? cur : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.textRefs.idSelect.value = preferred;
  }

  private _setupTextSettingsPanel() {
    const r = this.textRefs;
    if (!r) return;

    r.idSelect.addEventListener("change", () => {
      const nextId = r.idSelect.value || Defaults.defaultLabelId;
      if (this.getSelectedTable()) { if (this.assignBatchToLabel("table", nextId)) return; }
      else if (this.assignBatchToLabel("textBox", nextId)) return;
      if (this.selectedLabelId) {
        const groupIds = this.scene.getTextBoxesByLabelId(this.selectedLabelId).map(t => t.id);
        if (groupIds.length > 0) {
          this.scene.assignTextBoxesToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });

    r.textColor.addEventListener("input", () => {
      r.textColorPreview.style.background = r.textColor.value;
      // Markierter Text / Caret im offenen Editor → nur dieser Bereich.
      if (this.textEditor?.applyInlineFormat({ color: r.textColor.value })) return;
      const sel = this.getEditTextBox();
      if (sel) sel.style.textColor = r.textColor.value;
      else this.defaultTextColor = r.textColor.value;
      r.textColorPreview.style.background = r.textColor.value;
    });

    r.fontSize.addEventListener("input", () => {
      let v = parseFloat((r.fontSize.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      v = clamp(v, 6, 200);
      if (this.textEditor?.applyInlineFormat({ fontSizePt: v * 72 / 96 })) return;
      const sel = this.getEditTextBox();
      if (sel) {
        sel.style.fontSizePx = v;
        sel.style.fontSizePt = v * 72 / 96;
        autoSizeTextBox(sel, (this.renderer as any).referencePxPerM, (this.renderer as any).textPtScale);
      }
      else this.defaultTextFontSizePx = v;
    });
    r.fontSize.addEventListener("blur", () => this._syncTextSettingsFromContext());

    const setAlign = (a: "left" | "center" | "right") => {
      const sel = this.getEditTextBox();
      if (sel) sel.style.align = a;
      else this.defaultTextAlign = a;
      this._syncTextSettingsFromContext();
    };
    r.alignLeftBtn.addEventListener("click", () => setAlign("left"));
    r.alignCenterBtn.addEventListener("click", () => setAlign("center"));
    r.alignRightBtn.addEventListener("click", () => setAlign("right"));

    r.bgColor.addEventListener("input", () => {
      const sel = this.getEditTextBox();
      if (sel) sel.style.bgColor = r.bgColor.value;
      else this.defaultTextBgColor = r.bgColor.value;
      this._syncTextSettingsFromContext();
    });

    r.bgAlpha.addEventListener("input", () => {
      let v = parseFloat((r.bgAlpha.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(v, 0, 100);
      const sel = this.getEditTextBox();
      if (sel) sel.style.bgAlphaPct = v;
      else this.defaultTextBgAlphaPct = v;
      this._syncTextSettingsFromContext();
    });

    const setTextAlpha = (raw: string) => {
      let v = parseFloat((raw || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(Math.round(v), 0, 100);
      const sel = this.getEditTextBox();
      if (sel) (sel.style as any).textAlphaPct = v;
      else this.defaultTextAlphaPct = v;
      this._syncTextSettingsFromContext();
    };
    r.textAlpha?.addEventListener("input", () => setTextAlpha(r.textAlpha!.value));
    r.textAlphaRange?.addEventListener("input", () => setTextAlpha(r.textAlphaRange!.value));

    r.wrapToggle.addEventListener("change", () => {
      const sel = this.getEditTextBox();
      if (sel) { sel.style.wrap = !!r.wrapToggle.checked; autoSizeTextBox(sel, (this.renderer as any).referencePxPerM, (this.renderer as any).textPtScale); }
      else this.defaultTextWrap = !!r.wrapToggle.checked;
    });

    r.borderToggle.addEventListener("change", () => {
      const v = !!r.borderToggle.checked;
      const sel = this.getEditTextBox();
      if (sel) sel.style.borderEnabled = v;
      else this.defaultTextBorderEnabled = v;
      r.borderGroup.classList.toggle("hidden", !v);
    });

    r.borderColor.addEventListener("input", () => {
      const sel = this.getEditTextBox();
      if (sel) sel.style.borderColor = r.borderColor.value;
      else this.defaultTextBorderColor = r.borderColor.value;
      r.borderColorPreview.style.background = r.borderColor.value;
    });

    r.borderWidth.addEventListener("input", () => {
      let v = parseFloat((r.borderWidth.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v < 0) return;
      v = clamp(v, 0, 30);
      const sel = this.getEditTextBox();
      if (sel) sel.style.borderWidthPx = v;
      else this.defaultTextBorderWidthPx = v;
    });
    r.borderWidth.addEventListener("blur", () => this._syncTextSettingsFromContext());

    // --- Modus: Rahmen variabel / Rahmen fix ---
    const setAutoSize = (auto: boolean) => {
      const sel = this.getEditTextBox();
      if (sel) {
        (sel.style as any).autoSize = auto;
        sel.style.wrap = !auto;
        autoSizeTextBox(sel, (this.renderer as any).referencePxPerM, (this.renderer as any).textPtScale);
      } else {
        this.defaultTextAutoSize = auto;
        this.defaultTextWrap = !auto;
      }
      this._syncTextSettingsFromContext();
    };
    r.modeAutoBtn?.addEventListener("click", () => setAutoSize(true));
    r.modeFrameBtn?.addEventListener("click", () => setAutoSize(false));

    // --- Stil: Fett / Kursiv / Unterstrichen / Durchgestrichen ---
    const toggleStyle = (key: "bold" | "italic" | "underline" | "strike") => {
      if (this.textEditor?.toggleInlineStyle(key)) return;
      const sel = this.getEditTextBox();
      if (sel) {
        (sel.style as any)[key] = !(sel.style as any)[key];
        autoSizeTextBox(sel, (this.renderer as any).referencePxPerM, (this.renderer as any).textPtScale);
      } else {
        if (key === "bold") this.defaultTextBold = !this.defaultTextBold;
        else if (key === "italic") this.defaultTextItalic = !this.defaultTextItalic;
        else if (key === "underline") this.defaultTextUnderline = !this.defaultTextUnderline;
        else this.defaultTextStrike = !this.defaultTextStrike;
      }
      this._syncTextSettingsFromContext();
    };
    r.boldBtn?.addEventListener("click", () => toggleStyle("bold"));
    r.italicBtn?.addEventListener("click", () => toggleStyle("italic"));
    r.underlineBtn?.addEventListener("click", () => toggleStyle("underline"));
    r.strikeBtn?.addEventListener("click", () => toggleStyle("strike"));

    // --- Absatz (Zeilenabstand) ---
    const setLineHeight = (raw: string) => {
      let v = parseFloat((raw || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(Math.round(v), 80, 300);
      const sel = this.getEditTextBox();
      if (sel) { (sel.style as any).lineHeightPct = v; autoSizeTextBox(sel, (this.renderer as any).referencePxPerM, (this.renderer as any).textPtScale); }
      else this.defaultTextLineHeightPct = v;
      this._syncTextSettingsFromContext();
    };
    r.lineHeightRange?.addEventListener("input", () => setLineHeight(r.lineHeightRange!.value));
    r.lineHeightNum?.addEventListener("change", () => setLineHeight(r.lineHeightNum!.value));

    // --- Transparenz-Regler (spiegelt das Zahlenfeld) ---
    r.bgAlphaRange?.addEventListener("input", () => {
      const v = clamp(Math.round(parseFloat(r.bgAlphaRange!.value) || 0), 0, 100);
      const sel = this.getEditTextBox();
      if (sel) sel.style.bgAlphaPct = v;
      else this.defaultTextBgAlphaPct = v;
      this._syncTextSettingsFromContext();
    });

    // --- Schriftstärke in Punkt (Word-Konvention: 1 pt = 4/3 px) ---
    r.fontSizePt?.addEventListener("change", () => {
      let pt = parseFloat((r.fontSizePt!.value || "").replace(",", "."));
      if (!Number.isFinite(pt) || pt <= 0) return;
      pt = clamp(pt, 1, 400);
      const px = ptToCssPx(pt);
      if (this.textEditor?.applyInlineFormat({ fontSizePt: pt })) return;
      const sel = this.getEditTextBox();
      if (sel) {
        sel.style.fontSizePt = pt;
        sel.style.fontSizePx = px;
        autoSizeTextBox(sel, (this.renderer as any).referencePxPerM, (this.renderer as any).textPtScale);
      }
      else this.defaultTextFontSizePx = px;
      this._syncTextSettingsFromContext();
    });

    this._syncTextSettingsFromContext();
  }

  private _syncTextSettingsFromContext() {
    const r = this.textRefs;
    if (!r) return;
    const s = this.getCurrentTextStyle();
    r.textColor.value = this._toHexColor(s.textColor || Defaults.textColor);
    r.textColorPreview.style.background = r.textColor.value;
    r.fontSize.value = String(Math.round(s.fontSizePx ?? Defaults.textFontSizePx));
    r.bgColor.value = this._toHexColor(s.bgColor || Defaults.textBgColor);
    r.bgColorPreview.style.background = `${r.bgColor.value}`;
    r.bgAlpha.value = String(Math.round(s.bgAlphaPct ?? Defaults.textBgAlphaPct));
    r.wrapToggle.checked = !!s.wrap;
    r.alignLeftBtn.classList.toggle("active", s.align === "left");
    r.alignCenterBtn.classList.toggle("active", s.align === "center");
    r.alignRightBtn.classList.toggle("active", s.align === "right");
    r.borderToggle.checked = !!s.borderEnabled;
    r.borderGroup.classList.toggle("hidden", !s.borderEnabled);
    r.borderColor.value = this._toHexColor(s.borderColor || Defaults.textBorderColor);
    r.borderColorPreview.style.background = r.borderColor.value;
    r.borderWidth.value = String((s.borderWidthPx ?? Defaults.textBorderWidthPx).toFixed(1).replace(/\.0$/, ""));
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (s.labelId && this.labelManager.getById(s.labelId)) ? s.labelId
        : (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    r.idSelect.value = labelForDisplay;

    const autoSize = (s as any).autoSize !== false;
    r.modeAutoBtn?.classList.toggle("active", autoSize);
    r.modeFrameBtn?.classList.toggle("active", !autoSize);
    r.boldBtn?.classList.toggle("active", !!(s as any).bold);
    r.italicBtn?.classList.toggle("active", !!(s as any).italic);
    r.underlineBtn?.classList.toggle("active", !!(s as any).underline);
    r.strikeBtn?.classList.toggle("active", !!(s as any).strike);
    const lh = Math.round((s as any).lineHeightPct ?? Defaults.textLineHeightPct);
    if (r.lineHeightRange) r.lineHeightRange.value = String(lh);
    if (r.lineHeightNum) r.lineHeightNum.value = String(lh);
    if (r.bgAlphaRange) r.bgAlphaRange.value = String(Math.round(s.bgAlphaPct ?? Defaults.textBgAlphaPct));
    const tAlpha = String(Math.round((s as any).textAlphaPct ?? Defaults.textAlphaPct));
    if (r.textAlpha) r.textAlpha.value = tAlpha;
    if (r.textAlphaRange) r.textAlphaRange.value = tAlpha;
    if (r.fontSizePt) {
      r.fontSizePt.value = String(Math.round(textStyleFontSizePt(s)));
    }
  }

  /* ---- Line Settings Panel ---- */
  private _setupLineSettingsPanel() {
    this.lineIdSelect.addEventListener("change", () => {
      const nextId = this.lineIdSelect.value || Defaults.defaultLabelId;
      // Einzel-Objekt-Auswahl: nur dieses Objekt umhängen, keine Gruppen-Selektion auslösen.
      if (this.assignBatchToLabel("segment", nextId)) return;
      // Gruppen-Auswahl (über IdPanel-Klick) → ganze Gruppe umhängen.
      if (this.selectedLabelId) {
        const groupIds = this.scene.getSegmentsByLabelId(this.selectedLabelId).map(s => s.id);
        if (groupIds.length > 0) {
          this.scene.assignSegmentsToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });
    this.lineColorInput.addEventListener("input", () => this._applyLineColor(this.lineColorInput.value));
    this.lineThicknessInput.addEventListener("input", () => this._applyLineThicknessFromInput());
    this.lineThicknessInput.addEventListener("blur", () => this._syncLineSettingsFromContext());
    this._syncLineSettingsFromContext();
  }

  private _applyLineColor(color: string) {
    const selected = this.getEditSegment();
    if (selected) { selected.color = color; }
    else {
      const groupSegs = this.getSelectedGroupSegments();
      if (groupSegs.length > 0) { for (const seg of groupSegs) seg.color = color; }
      else { this.defaultLineColor = color; }
    }
    this._syncLineSettingsFromContext();
  }

  private _applyLineThicknessFromInput() {
    // Eingabe erfolgt in Zentimetern -> intern Meter.
    let value = parseFloat((this.lineThicknessInput.value || "").replace(",", ".")) / 100;
    if (!Number.isFinite(value) || value <= 0) return;
    value = clamp(value, 0.001, 1);
    const selected = this.getEditSegment();
    if (selected) { selected.thicknessM = value; return; }
    const groupSegs = this.getSelectedGroupSegments();
    if (groupSegs.length > 0) { for (const seg of groupSegs) seg.thicknessM = value; return; }
    this.defaultLineThicknessM = value;
  }

  private _syncLineSettingsFromContext() {
    const style = this.getCurrentLineStyle();
    this.lineColorInput.value = this._toHexColor(style.color || Defaults.lineColor);
    this.lineColorPreview.style.background = this.lineColorInput.value;
    this.lineThicknessInput.value = String(((style.thicknessM || Defaults.lineThicknessM) * 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (style.labelId || this.activeDrawLabelId || Defaults.defaultLabelId);
    if (this.labelManager.getById(labelForDisplay)) this.lineIdSelect.value = labelForDisplay;
    else this.lineIdSelect.value = Defaults.defaultLabelId;
  }

  /* ---- Hatch Settings Panel ---- */
  private _setupHatchSettingsPanel() {
    this.hatchIdSelect.addEventListener("change", () => {
      const nextId = this.hatchIdSelect.value || Defaults.defaultLabelId;
      if (this.assignBatchToLabel("hatch", nextId)) return;
      if (this.selectedLabelId) {
        const groupIds = this.scene.getHatchesByLabelId(this.selectedLabelId).map(h => h.id);
        if (groupIds.length > 0) {
          this.scene.assignHatchesToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });
    this.hatchFillColorInput.addEventListener("input", () => {
      const sel = this.getEditHatch();
      if (sel) sel.fillColor = this.hatchFillColorInput.value;
      else this.defaultHatchFillColor = this.hatchFillColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.hatchStrokeColorInput.addEventListener("input", () => {
      const sel = this.getEditHatch();
      if (sel) sel.strokeColor = this.hatchStrokeColorInput.value;
      else this.defaultHatchStrokeColor = this.hatchStrokeColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.hatchStrokeWidthInput.addEventListener("input", () => {
      let v = parseFloat((this.hatchStrokeWidthInput.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v < 0) return;
      v = clamp(v, 0, 30);
      const sel = this.getEditHatch();
      if (sel) sel.strokeWidthPx = v; else this.defaultHatchStrokeWidthPx = v;
    });
    this.hatchStrokeWidthInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());
    this.hatchAlphaInput.addEventListener("input", () => {
      let v = parseFloat((this.hatchAlphaInput.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(v, 0, 100);
      const sel = this.getEditHatch();
      if (sel) sel.fillAlphaPct = v; else this.defaultHatchFillAlphaPct = v;
    });
    this.hatchAlphaInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());
    this.areaShowInput.addEventListener("change", () => {
      const checked = !!this.areaShowInput.checked;
      // Persist als Default für neue Schraffuren
      this.defaultAreaShow = checked;
      const sel = this.getEditHatch();
      if (sel) {
        sel.areaLabel.show = checked;
      } else {
        // Keine Auswahl → auf alle bestehenden Schraffuren anwenden
        for (const h of this.scene.hatches) h.areaLabel.show = checked;
      }
      this._syncHatchSettingsFromContext();
    });
    this.areaTextColorInput.addEventListener("input", () => {
      const sel = this.getEditHatch();
      if (sel) sel.areaLabel.textColor = this.areaTextColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.areaFontSizeInput.addEventListener("input", () => {
      let v = parseFloat((this.areaFontSizeInput.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      v = clamp(v, 6, 72);
      const sel = this.getEditHatch();
      if (sel) sel.areaLabel.fontSizePx = v;
    });
    this.areaFontSizeInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());
    this.areaBgColorInput.addEventListener("input", () => {
      const sel = this.getEditHatch();
      if (sel) sel.areaLabel.bgColor = this.areaBgColorInput.value;
      this._syncHatchSettingsFromContext();
    });
    this.areaBgAlphaInput.addEventListener("input", () => {
      let v = parseFloat((this.areaBgAlphaInput.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      v = clamp(v, 0, 100);
      const sel = this.getEditHatch();
      if (sel) sel.areaLabel.bgAlphaPct = v;
    });
    this.areaBgAlphaInput.addEventListener("blur", () => this._syncHatchSettingsFromContext());

    // Border (Rahmen) für Flächenanzeige
    const borderToggle = document.getElementById("cad-area-border") as HTMLInputElement | null;
    const borderColor = document.querySelector<HTMLInputElement>("[data-area-border-color]");
    const borderWidth = document.querySelector<HTMLInputElement>("[data-area-border-width]");
    const borderPreview = document.querySelector<HTMLDivElement>("[data-area-border-preview]");
    const borderGroup = document.querySelector<HTMLDivElement>("[data-area-border-group]");
    const syncBorderUI = () => {
      const sel = this.getEditHatch();
      const enabled = sel ? !!sel.areaLabel.borderEnabled : this.defaultAreaBorderEnabled;
      const col = sel ? sel.areaLabel.borderColor : this.defaultAreaBorderColor;
      const wpx = sel ? sel.areaLabel.borderWidthPx : this.defaultAreaBorderWidthPx;
      if (borderToggle) borderToggle.checked = enabled;
      if (borderGroup) borderGroup.classList.toggle("hidden", !enabled);
      if (borderColor) borderColor.value = this._toHexColor(col);
      if (borderPreview) borderPreview.style.background = this._toHexColor(col);
      if (borderWidth) borderWidth.value = String(wpx);
    };
    borderToggle?.addEventListener("change", () => {
      const checked = !!borderToggle.checked;
      this.defaultAreaBorderEnabled = checked;
      const sel = this.getEditHatch();
      if (sel) sel.areaLabel.borderEnabled = checked;
      else for (const h of this.scene.hatches) h.areaLabel.borderEnabled = checked;
      syncBorderUI();
    });
    borderColor?.addEventListener("input", () => {
      const c = borderColor.value;
      this.defaultAreaBorderColor = c;
      const sel = this.getEditHatch();
      if (sel) sel.areaLabel.borderColor = c;
      if (borderPreview) borderPreview.style.background = c;
    });
    borderWidth?.addEventListener("input", () => {
      let w = parseFloat((borderWidth.value || "").replace(",", "."));
      if (!Number.isFinite(w)) return;
      w = clamp(w, 0, 20);
      this.defaultAreaBorderWidthPx = w;
      const sel = this.getEditHatch();
      if (sel) sel.areaLabel.borderWidthPx = w;
    });
    // Hook in den bestehenden Sync-Pfad: nach jedem _syncHatchSettingsFromContext aktualisieren
    const origSync = this._syncHatchSettingsFromContext.bind(this);
    this._syncHatchSettingsFromContext = () => { origSync(); syncBorderUI(); };

    this._syncHatchSettingsFromContext();
  }

  private _syncHatchSettingsFromContext() {
    const style = this.getCurrentHatchStyle();
    this.hatchFillColorInput.value = this._toHexColor(style.fillColor);
    this.hatchFillColorPreview.style.background = `rgba(77,163,255,${(style.fillAlphaPct ?? 35) / 100})`;
    this.hatchStrokeColorInput.value = this._toHexColor(style.strokeColor);
    this.hatchStrokeColorPreview.style.background = this.hatchStrokeColorInput.value;
    this.hatchStrokeWidthInput.value = String((style.strokeWidthPx ?? Defaults.hatchStrokePx).toFixed(1).replace(/\.0$/, ""));
    this.hatchAlphaInput.value = String(Math.round(style.fillAlphaPct ?? Defaults.hatchFillAlphaPct));
    const area = style.areaLabel;
    this.areaShowInput.checked = !!area?.show;
    this.areaSettingsGroup.classList.toggle("hidden", !this.areaShowInput.checked);
    this.areaTextColorInput.value = this._toHexColor(area?.textColor || Defaults.areaTextColor);
    this.areaTextColorPreview.style.background = this.areaTextColorInput.value;
    this.areaFontSizeInput.value = String(Math.round(area?.fontSizePx ?? Defaults.areaFontSizePx));
    this.areaBgColorInput.value = this._toHexColor(area?.bgColor || Defaults.areaBgColor);
    this.areaBgColorPreview.style.background = this.areaBgColorInput.value;
    this.areaBgAlphaInput.value = String(Math.round(area?.bgAlphaPct ?? Defaults.areaBgAlphaPct));
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (style.labelId || this.activeDrawLabelId || Defaults.defaultLabelId);
    if (this.labelManager.getById(labelForDisplay)) this.hatchIdSelect.value = labelForDisplay;
    else this.hatchIdSelect.value = Defaults.defaultLabelId;
  }

  private _toHexColor(color: string): string {
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    if (computed.startsWith("#")) return computed;
    const m = computed.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!m) return "#111111";
    const r = Number(m[1]).toString(16).padStart(2, "0");
    const g = Number(m[2]).toString(16).padStart(2, "0");
    const b = Number(m[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  /* ---- Shortcuts ---- */
  private _setupShortcuts() {
    this._keydownHandler = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      const isHubInput = document.activeElement === this.hub.lenInputEl || document.activeElement === this.hub.angInputEl;

      // Undo / Redo (also work while inputs focused except hub)
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
        if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); this.redo(); return; }
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const selectAllShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
        && e.key.toLowerCase() === "a";
      const editingTarget = tag === "input" || tag === "textarea" || tag === "select"
        || !!activeEl?.isContentEditable || !!this.tableEditId;
      // In sämtlichen Editoren und Eingabefeldern bleibt Strg/Cmd+A die native
      // Text-/Zell-Auswahl — auch in den numerischen HUB-Feldern.
      if (selectAllShortcut && editingTarget) return;
      const inTextField = (tag === "input" || tag === "textarea" || tag === "select"
        || !!activeEl?.isContentEditable) && !isHubInput;

      if (inTextField) {
        // ESC wirkt immer: Eingabefeld verlassen und Abbruch-Logik ausführen.
        if (e.key === "Escape") { try { activeEl?.blur?.(); } catch {} }
        else return;
      }

      // Strg/Cmd + A → alles im aktiven CAD-Plan auswählen.
      if (selectAllShortcut) {
        if (this.selectAllInActiveCadPlan()) { e.preventDefault(); return; }
      }



      // Copy / Paste — Shift+C / Shift+V (zusätzlich zu Strg+C/V)
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "c" && this.copySelection()) { e.preventDefault(); return; }
        if (k === "v" && this.startPastePreview()) { e.preventDefault(); return; }
      }

      // Copy / Paste (after early-return for inputs)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === "c") {
          if (this.copySelection()) { e.preventDefault(); return; }
        }
        if (k === "v") {
          if (this.startPastePreview()) { e.preventDefault(); return; }
        }
      }

      // ENTER bestätigt eine laufende Fangpunkt-Aktion (Verschieben/Drehen …)
      // — wichtig für die Tablet-Bedienung über das Hilfsrad.
      if (e.key === "Enter" && !isHubInput && this.selectTool.requestEnterCommit()) {
        e.preventDefault();
        return;
      }

      if (this.activeTool === this.selectTool) {
        if (e.key === "Tab" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.cyclePointMenu(); return; }
        if (e.key === "Enter" && this.selectTool.hasPointMenu()) { e.preventDefault(); this.selectTool.activatePointMenu(); return; }
      }

      if (e.key === "Tab") {
        if (this.activeTool === this.lineTool) { const h = this.lineTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
        if (this.activeTool === this.hatchTool) { const h = this.hatchTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
        if (this.activeTool === this.polygonTool) { const h = this.polygonTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
        if (this.activeTool === this.wallTool) { const h = this.wallTool.onTabRequest(); if (h) { e.preventDefault(); return; } }
      }

      if (e.key === "Enter" && (this.activeTool as any) === this.stairTool && !isHubInput) {
        if (this.stairTool.confirm()) { e.preventDefault(); return; }
      }
      // Schritt 02: Winkel per Tastatur (Grad) wie beim Wand-Drehen.
      if ((this.activeTool as any) === this.stairTool && !isHubInput && !e.ctrlKey && !e.metaKey
        && !["input", "textarea", "select"].includes(tag) && this.stairTool.angleKey(e.key)) {
        e.preventDefault(); this.renderer?.render?.(); return;
      }
      // Beim Zeichnen der Referenzlinie nimmt die Rücktaste den letzten Punkt zurück.
      if (e.key === "Backspace" && (this.activeTool as any) === this.stairTool && !isHubInput
        && !["input", "textarea", "select"].includes(tag) && this.stairTool.phase === "path") {
        if (this.stairTool.undoStep()) { e.preventDefault(); this.renderer?.render?.(); return; }
      }
      if ((e.key === "Delete" || e.key === "Backspace") && (this.activeTool as any) === this.stairTool && !isHubInput
        && this.stairTool.phase === "edit" && !this.stairTool.moving) {
        const st = this.stairTool.editStair();
        if (st) {
          e.preventDefault();
          this.stairTool.exitEdit();
          (this.scene as any).removeStair(st);
          this.commitHistorySnapshot();
          return;
        }
      }
      if (e.key === "Enter" && this.activeTool === this.polygonTool && !isHubInput) {
        if (this.polygonTool.finishFromKey()) { e.preventDefault(); return; }
      }
      // BACKSPACE entfernt beim Polygonwerkzeug den zuletzt gesetzten Punkt.
      if (e.key === "Backspace" && this.activeTool === this.polygonTool && !isHubInput) {
        if (this.polygonTool.removeLastPoint()) { e.preventDefault(); return; }
      }
      if (e.key === "Enter" && this.activeTool === this.hatchTool && !isHubInput) {
        if (this.hatchTool.drawMode === "circle" && this.hatchTool.circleState === "arc") {
          e.preventDefault();
          this.hatchTool.finishCircleFromKey();
          return;
        }
        if (this.hatchTool.finishFromKey()) { e.preventDefault(); return; }
      }

      if (e.key === "Enter" && this.activeTool === this.lineTool && !isHubInput) {
        if (this.lineTool.finishFromKey()) { e.preventDefault(); return; }
        if (this.lineTool.isDrawing()) { e.preventDefault(); this.lineTool.finish(); return; }
      }


      // ENTER platziert ein schwebendes Dokument (PNG/JPG/PDF) endgültig.
      if (e.key === "Enter" && this.activeTool === this.documentTool && !isHubInput) {
        if (this.documentTool.finishFromKey()) { e.preventDefault(); return; }
      }


      if (e.key === "Enter" && this.activeTool === this.wallTool && !isHubInput) {
        if (this.wallTool.isDrawing?.()) { e.preventDefault(); this.wallTool.finish(); return; }
      }


      if (e.key === "Enter" && this.activeTool === this.measureTool && !isHubInput) {
        if (this.measureTool.finishCollect()) { e.preventDefault(); return; }
      }

      // Don't trigger tool shortcuts while text editor is active
      const isTextEditing = this.textEditor?.isActive();
      if (isTextEditing) {
        if (e.key === "Escape") { e.preventDefault(); this.textEditor.commit(); return; }
        return;
      }

      if (e.key === "v" || e.key === "V") this.setTool(ToolIds.SELECT);
      if (e.key === "l" || e.key === "L") this.setTool(ToolIds.LINE);
      if (e.key === "h" || e.key === "H") this.setTool(ToolIds.HATCH);
      if (e.key === "g" || e.key === "G") this.setTool(ToolIds.POLYGON);
      if (e.key === "m" || e.key === "M") this.setTool(ToolIds.MEASURE);
      if (e.key === "t" || e.key === "T") this.setTool(ToolIds.TEXT);
      if (e.key === "p" || e.key === "P") this.setTool(ToolIds.PIPETTE);
      if (e.key === "d" || e.key === "D") this.setTool(ToolIds.DOCUMENT);
      if (e.key === "f" || e.key === "F") this.setTool(ToolIds.FREE);
      if (e.key === "e" || e.key === "E") this.setTool(ToolIds.ERASER);
      if (e.key === "w" || e.key === "W") this.setTool(ToolIds.WALL);
      if (e.key === "u" || e.key === "U") this.setTool(ToolIds.DOOR);
      if (e.key === "k" || e.key === "K") this.setTool(ToolIds.LIBRARY);

      // 'B' = Bezugslinie einer selektierten Wand an gegenüberliegender Kante koppeln
      // (cycelt outer → center → inner → outer, Wandkörper bleibt sichtbar gleich).
      if ((e.key === "b" || e.key === "B") && this.selection && (this.selection as any).wallId) {
        const wall = this.scene.getWallById((this.selection as any).wallId);
        if (wall) {
          e.preventDefault();
          this.scene.flipWallReferenceSide(wall);
          this.scene.markWallsDirty();
          return;
        }
      }

      // Enter bestätigt eine laufende Gruppen-Aktion am Fangpunkt.
      if (e.key === "Enter" && this.selectTool.groupAnchorActive) {
        e.preventDefault();
        this.selectTool.confirmGroupAction();
        return;
      }

      // Enter bestätigt eine laufende Gruppen-Drehung.
      if (e.key === "Enter" && this.selectTool.groupRotateActive) {
        e.preventDefault();
        this.selectTool.cancelGroupTransform(false);
        this.commitHistorySnapshot();
        return;
      }

      // "R" → Mehrfachauswahl um ihren Schwerpunkt drehen.
      if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey
          && this.activeTool === this.selectTool
          && this.selectTool.marqueeSelectedIds.length > 0
          && !this.selectTool.groupRotateActive) {
        if (this.selectTool.startGroupRotate()) { e.preventDefault(); return; }
      }

      // Enter → eingefügte Kopie festsetzen.
      if (e.key === "Enter" && this.selectTool.pasteFloatActive) {
        e.preventDefault(); this.selectTool.confirmPasteFloat(); return;
      }

      // Enter → laufende Maßketten-Verschiebung übernehmen (ein Undo-Schritt).
      if (e.key === "Enter" && this.dimensionMoveActive) {
        e.preventDefault(); this.commitDimensionMove(); return;
      }

      if (e.key === "Escape") {
        // ESC bricht ALLES ab — unabhängig von Werkzeug und Objekt:
        // laufende Hub-Interaktionen, Sonder-Modi und Rahmen-Auswahl.
        if (this.dimensionMoveActive) this.cancelDimensionMove();
        this.dimensionHubMode = "none";
        this.documentHubMode = "none";
        this.measureFinishHubState = { visible: false, screenX: 0, screenY: 0 };
        this.globalGuides.clear();
        try { this.hub?.hide?.(); } catch {}
        try { this.pointEditMenu?.hide?.(); } catch {}
        if (this.selectTool.pasteFloatActive) {
          e.preventDefault();
          if (this.multiPasteActive) { this.multiPasteActive = false; this.onMultiPasteChange?.(false); }
          this.selectTool.cancelGroupTransform(true);
          this.selectTool.deleteMarqueeSelection();
          this.selectTool.pasteFloatActive = false;
          return;
        }
        if (this.selectTool.groupRotateActive || this.selectTool.groupDragActive
            || this.selectTool.groupAnchorActive) {
          e.preventDefault(); this.selectTool.cancelGroupTransform(true); return;
        }

        // ESC im Tabellen-Zellmodus: nur den Zellmodus beenden, Tabelle bleibt
        // als normales CAD-Objekt ausgewählt.
        if (this.tableEditId) { e.preventDefault(); this.endTableEdit(); return; }

        if (this.pastePreviewActive || this.pasteArmed) { this.cancelPastePreview(); return; }
        // Stufe 1: Läuft gerade eine Zeichen-Aktion? Dann NUR diese abbrechen —
        // das Werkzeug bleibt aktiv. Erst der nächste ESC wechselt zur Auswahl.
        {
          const t: any = this.activeTool as any;
          if (t && t !== this.selectTool && typeof t.isDrawing === "function" && t.isDrawing()) {
            e.preventDefault();
            t.cancel();
            return;
          }
          if (t === this.documentTool && this.documentTool.phase !== "idle") { e.preventDefault(); this.documentTool.cancel(); return; }
        }
        if (this.activeTool === this.lineTool) { this.lineTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.polygonTool) {
          // ESC arbeitet stufenweise: laufende Kontur abbrechen, sonst Werkzeug verlassen.
          if (this.polygonTool.isDrawing()) { this.polygonTool.cancel(); return; }
          this.clearSelection(); this.setTool(ToolIds.SELECT); return;
        }
        if (this.activeTool === this.hatchTool) { this.hatchTool.cancel(); this.clearSelection(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.textTool) { this.textTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.measureTool) { this.measureTool.cancel(); this.clearSelection(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.pipetteTool) {
          // 1. ESC: nur die gemerkte Quelle verwerfen — Werkzeug bleibt aktiv.
          if (this.pipetteTool.hasSource) { this.pipetteTool.clearSource(); return; }
          this.pipetteTool.cancel(); this.setTool(ToolIds.SELECT); return;
        }
        if ((this.activeTool as any) === this.stairTool) {
          if (this.stairTool.escape()) return;
          this.setTool(ToolIds.SELECT); return;
        }
        if ((this.activeTool as any) === this.rulerTool) {
          // 1. ESC: laufende Platzierung verwerfen — Werkzeug bleibt aktiv.
          if (this.rulerTool.isDrawing()) { this.rulerTool.cancel(); return; }
          this.setTool(ToolIds.SELECT); return;
        }
        if (this.activeTool === this.wallTool) { this.wallTool.cancel(); this.setTool(ToolIds.SELECT); return; }
        if (this.activeTool === this.doorTool) {
          if (this.doorTool.selectedDoorId) { this.doorTool.selectDoor(null); return; }
          this.doorTool.cancel(); this.setTool(ToolIds.SELECT); return;
        }
        if ((this.activeTool as any) === this.libraryTool) {
          if (this.libraryTool.phase !== "idle") { this.libraryTool.cancel(); return; }
          this.setTool(ToolIds.SELECT);
          return;
        }
        if (this.activeTool === this.documentTool) {
          if (this.documentTool.phase !== "idle") { this.documentTool.cancel(); return; }
          this.setTool(ToolIds.SELECT);
          return;
        }
        if (this.activeTool === this.selectTool) { this.selectTool.cancel(); this.clearSelection(); this.setSelectedLabelId(null); this.pointEditMenu.hide(); return; }
        // Jedes andere Werkzeug (z. B. Radiergummi): abbrechen und zurück zur Auswahl.
        this.activeTool.cancel();
        this.clearSelection();
        this.setSelectedLabelId(null);
        this.setTool(ToolIds.SELECT);
        return;
      }


      if (e.key === "Delete" || e.key === "Backspace") {
        // Tabelle im Zellmodus: Entf löscht dort nur den Zellinhalt,
        // im Objektmodus dagegen die Tabelle selbst.
        const kt = e.target as HTMLElement | null;
        if (kt && typeof kt.closest === "function" && kt.closest("[data-table-cellmode]")) return;
        // Laufende Gruppen-Transformation → abbrechen statt löschen.
        if (this.selectTool.groupRotateActive || this.selectTool.groupDragActive) {
          e.preventDefault();
          this.selectTool.cancelGroupTransform(true);
          return;
        }
        // Läuft gerade eine Bearbeitung (Verschieben/Drehen/Resize)? Dann bricht
        // ENTF diese Aktion ab (wie ESC) statt etwas zu löschen.
        // Radiergummi: ENTF hebt das Werkzeug auf (zurück zur Auswahl).
        if (this.activeTool === this.eraserTool) {
          e.preventDefault();
          e.stopPropagation();
          this.eraserTool.cancel();
          this.setTool(ToolIds.SELECT);
          return;
        }
        const st: any = this.selectTool as any;
        if (this.activeTool === this.selectTool &&

            (st.editTarget || st.rotateTextBoxId || st.dragTextBoxId || st.dragDocId || st.dragFreeStrokeId || st.dragDimId)) {
          e.preventDefault();
          e.stopPropagation();
          this.selectTool.cancel();
          this.pointEditMenu.hide();
          return;
        }
        // Textwerkzeug mit laufender Platzierung: Vorschau verwerfen.
        if (this.activeTool === this.textTool && (this.textTool as any).phase !== undefined
            && (this.textTool as any).phase !== "idle") {
          e.preventDefault();
          this.textTool.cancel();
          return;
        }
        // Tür/Fenster: ausgewähltes Bauelement löschen.
        if (this.doorTool?.selectedDoorId) {
          const door = this.scene.getDoorById(this.doorTool.selectedDoorId);
          if (door) {
            e.preventDefault();
            e.stopPropagation();
            this.scene.removeDoor(door);
            this.doorTool.selectDoor(null);
            this.refreshLabelUI();
            return;
          }
        }
        // Marquee-Auswahl hat Vorrang: mehrere Elemente in einem Rutsch löschen.

        if (this.activeTool === this.selectTool && this.selectTool.marqueeSelectedIds.length > 0) {
          this.selectTool.deleteMarqueeSelection();
          return;
        }
        // Plan-Modus: zuerst Projektion-Selektion versuchen zu löschen.
        if (this.activePlanId && this.planController?.deleteSelected()) {
          return;
        }
        if (this.selection && (this.selection as any).wallId) {
          const wall = this.scene.getWallById((this.selection as any).wallId);
          if (wall) { this.scene.removeWall(wall); this.clearSelection(); this.pointEditMenu.hide(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.segmentId) {
          const seg = this.scene.getSegmentById(this.selection.segmentId);
          if (seg) { this.scene.removeSegment(seg); this.clearSelection(); this.pointEditMenu.hide(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.DIMENSION) {
          const dim = this.getEditDimension();
          if (dim) { this.scene.removeDimension(dim); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.LIBRARY_INSTANCE) {
          const inst = this.scene.getLibraryInstanceById((this.selection as any).libraryInstanceId);
          if (inst) { this.scene.removeLibraryInstance(inst); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.DOCUMENT) {
          const doc = this.scene.getDocumentById((this.selection as any).documentId);
          if (doc) { this.scene.removeDocument(doc); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && (this.selection.type === SelectionType.TEXTBOX || this.selection.type === SelectionType.TEXTBOX_HANDLE)) {
          const tbl = this.getSelectedTable();
          if (tbl) {
            (this.scene as any).removeTable(tbl);
            this.endTableEdit();
            this.clearSelection(); this.refreshLabelUI();
            return;
          }
          const box = this.getEditTextBox();
          if (box) { this.scene.removeTextBox(box); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.type === SelectionType.FREE_STROKE) {
          const stroke = this.scene.getFreeStrokeById((this.selection as any).freeStrokeId);
          if (stroke) { this.scene.removeFreeStroke(stroke); this.clearSelection(); this.refreshLabelUI(); }
          return;
        }
        if (this.selection && this.selection.hatchId) {
          const hatch = this.scene.getHatchById(this.selection.hatchId);
          if (hatch) {
            if (this.selection.type === SelectionType.POINT && hatch.points.length > 3) {
              this.scene.removePointFromHatch(hatch, this.selection.pointIndex!);
              this.setSelection({ type: SelectionType.HATCH, hatchId: hatch.id, pointIndex: null });
            } else {
              this.scene.removeHatch(hatch);
              this.clearSelection();
              this.pointEditMenu.hide();
            }
          }
          return;
        }
        if (this.selectedLabelId) {
          this.scene.removeSegmentsByLabelId(this.selectedLabelId);
          this.scene.removeHatchesByLabelId(this.selectedLabelId);
          this.scene.removeDimensionsByLabelId(this.selectedLabelId);
          this.scene.removeTextBoxesByLabelId(this.selectedLabelId);
          (this.scene as any).removeTablesByLabelId?.(this.selectedLabelId);
          this.scene.removeDocumentsByLabelId(this.selectedLabelId);
          this.setSelectedLabelId(null);
          this.refreshLabelUI();
        }
      }
    };
    window.addEventListener("keydown", this._keydownHandler);
  }

  /* ---- Copy / Paste ---- */
  copySelection(): boolean {
    // Anker: ausgewählter Segment-Endpunkt > Mausposition
    let anchor: { x: number; y: number } | null = null;
    const sel = this.selection;
    if (sel && sel.type === SelectionType.POINT) {
      const seg = this.scene.getSegmentById(sel.segmentId);
      if (seg) {
        const p = sel.pointIndex === 0 ? seg.a : seg.b;
        anchor = { x: p.x, y: p.y };
      }
    }
    // Bibliotheksobjekt/Dokument: deren definierter Einfügepunkt.
    if (!anchor) {
      const lib = (this as any).getSelectedLibraryInstance?.();
      if (lib?.position) anchor = { x: lib.position.x, y: lib.position.y };
    }
    if (!anchor) {
      const doc = (this as any).getSelectedDocument?.();
      if (doc?.position) anchor = { x: doc.position.x, y: doc.position.y };
    }
    // Sonst bestimmt buildClipboardFromSelection den Fangpunkt der Auswahl,
    // der dem Mauszeiger am nächsten liegt (bewusst angeklickter Griffpunkt).
    const clip = buildClipboardFromSelection(this, anchor);
    if (!clip) return false;
    this.clipboard = clip;
    return true;
  }

  /**
   * Fügt die Zwischenablage exakt an der Ursprungsposition ein. Die Kopie ist
   * sofort als Gruppe ausgewählt, frei verschiebbar und wird per Häkchen-
   * Symbol (oder Enter) gesetzt.
   */
  startPastePreview(): boolean {
    if (!this.clipboard || this.clipboard.items.length === 0) return false;
    if (this.textEditor?.isActive()) return false;
    // Tastatur außerhalb der Zeichenfläche wartet ebenso auf ein neues echtes
    // Canvas-Ereignis; innerhalb darf sie die aktuelle Canvas-Position nutzen.
    if (!this.input?.pointerInside) return this._armPasteForNextCanvasPointer();
    return this._beginPasteFloatNow();
  }

  /** Wartender Einfügemodus („bereit“, Kopie folgt beim Eintritt in den Canvas). */
  pasteArmed = false;
  private _pasteArmedAfterPointerSeq = -1;

  private _armPasteForNextCanvasPointer(): boolean {
    this.pasteArmed = true;
    this._pasteArmedAfterPointerSeq = this.input?.pointerEventSeq ?? 0;
    return true;
  }

  /**
   * Expliziter Pfad für das Einfüge-Symbol in der Kopfzeile. Er erzeugt nie
   * sofort eine Kopie und verwendet keine zuvor gespeicherte Mausposition.
   */
  armPasteFromHeader(): boolean {
    if (!this.clipboard || this.clipboard.items.length === 0) return false;
    if (this.textEditor?.isActive()) return false;
    return this._armPasteForNextCanvasPointer();
  }

  private _beginPasteFloatNow(): boolean {
    if (!this.clipboard || this.clipboard.items.length === 0) return false;
    if (this.activeTool !== this.selectTool) {
      this._toolBeforePaste = (this.activeTool as any).id || ToolIds.SELECT;
      this.setTool(ToolIds.SELECT);
    } else {
      this._toolBeforePaste = ToolIds.SELECT;
    }
    this.clearSelection();
    this.setSelectedLabelId(null);
    this.pointEditMenu.hide();
    this.pastePreviewActive = false;
    // Zielpunkt zuerst: aktuelle echte Cursorposition, auf vorhandene
    // Fangpunkte gesnappt. Die Kopie entsteht direkt dort — nie am Original.
    const cursor = v(this.input?.mouse?.wx ?? 0, this.input?.mouse?.wy ?? 0);
    let target = cursor;
    try { target = this.selectTool.snapWorldPointPublic(cursor) || cursor; } catch { target = cursor; }
    const created = commitClipboardAt(this, this.clipboard, v(target.x, target.y));
    if (!created.length) return false;
    this.selectTool.beginPasteFloat(created, v(target.x, target.y), true);
    this.refreshLabelUI();

    return true;
  }

  /** Häkchen / Enter: eingefügte Kopie festsetzen. */
  confirmPasteFloat(): boolean {
    return this.selectTool.confirmPasteFloat();
  }

  cancelPastePreview() {
    this.pastePreviewActive = false;
    this.pasteArmed = false;
    this._pasteArmedAfterPointerSeq = -1;
    this._pasteArmedAwayFrom = null;
    if (this.multiPasteActive) {
      this.multiPasteActive = false;
      this.onMultiPasteChange?.(false);
    }
    this._toolBeforePaste = null;
    this.canvas.style.cursor = "";
  }

  /**
   * Wird im Frame-Takt aufgerufen: Sobald der Zeiger die Zeichenfläche
   * erreicht, entsteht die bereitstehende Kopie exakt unter dem Cursor.
   */
  /** Bestätigungsstelle (Häkchen/Enter) im Mehrfachmodus — dort nie starten. */
  private _pasteArmedAwayFrom: { sx: number; sy: number } | null = null;

  private _resolveArmedPaste() {
    if (!this.pasteArmed) return;
    // Ausschließlich ein echtes Canvas-Ereignis NACH dem Scharfstellen darf
    // den Vorgang starten. `input.update()` hat dessen aktuelle Position im
    // selben Frame bereits in Weltkoordinaten umgerechnet.
    if (!this.input || this.input.pointerEventSeq <= this._pasteArmedAfterPointerSeq) return;
    const away = this._pasteArmedAwayFrom;
    if (away && this.input.mouse
      && Math.hypot(this.input.mouse.sx - away.sx, this.input.mouse.sy - away.sy) < 16) return;
    this._pasteArmedAwayFrom = null;
    this.pasteArmed = false;
    this._pasteArmedAfterPointerSeq = -1;
    if (!this._beginPasteFloatNow()) this.stopMultiPaste();
  }

  /* ---- Mehrfach einfügen (fortlaufendes Platzieren) ---- */
  multiPasteActive = false;
  onMultiPasteChange?: (on: boolean) => void;
  private _multiPasteBusy = false;

  /** Startet/beendet den Mehrfach-Einfüge-Modus (Toggle). */
  toggleMultiPaste(): boolean {
    if (this.multiPasteActive) { this.stopMultiPaste(); return false; }
    if (!this.clipboard || this.clipboard.items.length === 0) return false;
    this.multiPasteActive = true;
    this.onMultiPasteChange?.(true);
    if (!this.startPastePreview()) { this.stopMultiPaste(); return false; }
    return true;
  }

  /** Kopfzeilen-Toggle: erste Kopie immer erst beim nächsten Canvas-Ereignis. */
  toggleMultiPasteFromHeader(): boolean {
    if (this.multiPasteActive) { this.stopMultiPaste(); return false; }
    if (!this.clipboard || this.clipboard.items.length === 0) return false;
    this.multiPasteActive = true;
    this.onMultiPasteChange?.(true);
    if (!this.armPasteFromHeader()) { this.stopMultiPaste(); return false; }
    return true;
  }

  /** Beendet den Mehrfach-Modus sauber (ESC, Rechtsklick, Werkzeugwechsel). */
  stopMultiPaste() {
    if (!this.multiPasteActive) return;
    this.multiPasteActive = false;
    this.pasteArmed = false;
    this._pasteArmedAfterPointerSeq = -1;
    this._pasteArmedAwayFrom = null;
    this.onMultiPasteChange?.(false);
    try { this.selectTool.cancelPasteFloat(); } catch { /* optional */ }
  }

  /**
   * Nach jeder bestätigten Kopie wird die nächste Vorschau nur scharfgestellt.
   * Sie entsteht erst beim nächsten echten Canvas-Kontakt bzw. einer Bewegung
   * weg von der Bestätigungsstelle — nie am Häkchen.
   */
  afterPasteFloatConfirmed() {
    if (!this.multiPasteActive || this._multiPasteBusy) return;
    this._multiPasteBusy = true;
    try {
      if (!this.clipboard || this.clipboard.items.length === 0 || !this._armPasteForNextCanvasPointer()) {
        this.stopMultiPaste();
        return;
      }
      const m = this.input?.mouse;
      this._pasteArmedAwayFrom = m ? { sx: m.sx, sy: m.sy } : null;
    } finally {
      this._multiPasteBusy = false;
    }
  }

  /* ------------------------------------------------ Bibliothek (CAD-only) */

  /** Vorschau-Info zur aktuellen Auswahl (unterstützt/nicht unterstützt). */
  getLibrarySelectionInfo() {
    const sel = Library.collectLibrarySelection(this);
    return { count: sel.snapshots.length, unsupported: sel.unsupported };
  }

  /** „Zur Bibliothek hinzufügen“ — Objekte bleiben auf dem Blatt. */
  addLibraryDefinitionFromSelection(meta: any) {
    return Library.addDefinitionFromSelection(this, meta);
  }

  /** „In Bibliotheksobjekt umwandeln“ — ersetzt die Auswahl (ein Undo-Schritt). */
  convertSelectionToLibraryObject(meta: any) {
    return Library.convertSelectionToInstance(this, meta);
  }

  beginLibraryPlacement(definitionId: string, scale = 1) {
    const def = Library.getDefinition(this, definitionId);
    if (!def) return;
    if (this.activeTool !== this.libraryTool) this.setTool(ToolIds.LIBRARY);
    this.libraryTool.beginPlacement(def, scale);
    this.onLibraryChange?.();
  }

  renameLibraryDefinition(id: string, name: string) { return Library.renameDefinition(this, id, name); }
  removeLibraryDefinition(id: string) { return Library.removeDefinition(this, id); }
  exportLibraryDefinition(id: string) { return Library.exportDefinition(this, id); }
  importLibraryDefinition(json: string) { return Library.importDefinition(this, json); }
  getLibraryDefinition(id: string) { return Library.getDefinition(this, id); }
  updateLibraryDefinitionMeta(id: string, meta: any) { return Library.updateDefinitionMeta(this, id, meta); }
  duplicateLibraryDefinition(id: string) { return Library.duplicateDefinition(this, id); }
  createLibraryFolder(name: string, parentId: string | null = null) { return Library.createFolder(this, name, parentId); }
  renameLibraryFolder(id: string, name: string) { return Library.renameFolder(this, id, name); }
  removeLibraryFolder(id: string) { return Library.removeFolder(this, id); }
  moveLibraryFolder(id: string, parentId: string | null) { return Library.moveFolder(this, id, parentId); }
  setLibraryDefinitionFolder(defId: string, folderId: string | null) { return Library.setDefinitionFolder(this, defId, folderId); }
  exportLibraryDefinitionSvg(id: string) { return Library.exportDefinitionSvg(this, id); }
  importLibraryDefinitionFromSvg(svg: string, meta: any, unitsPerMeter?: number) {
    return Library.importDefinitionFromSvg(this, svg, meta, unitsPerMeter);
  }
  exportLibraryDefinitionDxf(id: string) { return Library.exportDefinitionDxf(this, id); }
  importLibraryDefinitionFromDxf(dxf: string, meta: any, unitsPerMeter?: number) {
    return Library.importDefinitionFromDxf(this, dxf, meta, unitsPerMeter);
  }

  /** Bricht eine laufende Platzierung ab (Auswahl ist danach wieder möglich). */
  cancelLibraryPlacement() { this.libraryTool.cancel(); }

  /** Aktuell ausgewählte Bibliotheksinstanz (oder null). */
  getSelectedLibraryInstance() {
    if (!this.selection || this.selection.type !== SelectionType.LIBRARY_INSTANCE) return null;
    return this.scene.getLibraryInstanceById((this.selection as any).libraryInstanceId);
  }

  /** „Auflösen“ — dauerhaft in normale CAD-Objekte (ein Undo-Schritt). */
  explodeSelectedLibraryInstance(): boolean {
    const inst = this.getSelectedLibraryInstance();
    if (!inst) return false;
    this.setTool(ToolIds.SELECT);
    return Library.explodeLibraryInstance(this, inst.id);
  }

  /** Transformation der ausgewählten Instanz (Drehen/Skalieren aus dem Panel). */
  setSelectedLibraryInstanceTransform(patch: { rotationRad?: number; scale?: number }): boolean {
    const inst = this.getSelectedLibraryInstance();
    if (!inst) return false;
    if (typeof patch.rotationRad === "number") inst.rotationRad = patch.rotationRad;
    if (typeof patch.scale === "number" && patch.scale > 0) { inst.scaleX = patch.scale; inst.scaleY = patch.scale; }
    this.commitHistorySnapshot?.();
    return true;
  }



  private _commitPasteAtMouse() {
    if (!this.clipboard) { this.cancelPastePreview(); return; }
    const mw = v(this.input.mouse.wx, this.input.mouse.wy);
    commitClipboardAt(this, this.clipboard, mw);
    this.pastePreviewActive = false;
    this.canvas.style.cursor = "";
    this.refreshLabelUI();
  }

  private _drawPastePreview(ctx: CanvasRenderingContext2D) {
    if (!this.pastePreviewActive || !this.clipboard) return;
    const dx = this.input.mouse.wx - this.clipboard.anchor.x;
    const dy = this.input.mouse.wy - this.clipboard.anchor.y;
    const items = translatedItems(this.clipboard.items, dx, dy);
    const cam = this.camera;

    ctx.save();
    ctx.globalAlpha = 0.55;
    let primary = "#4da3ff";
    try { primary = (getComputedStyle(document.documentElement).getPropertyValue("--primary") || "").trim() || primary; } catch {}

    for (const it of items) {
      if (it.kind === "segment") {
        const a = cam.worldToScreen(it.a.x, it.a.y);
        const b = cam.worldToScreen(it.b.x, it.b.y);
        ctx.strokeStyle = it.color || primary;
        ctx.lineWidth = (this.renderer as any)._segStrokePx?.(it.thicknessM) ?? Math.max(1, it.thicknessM * cam.scale);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else if (it.kind === "hatch") {
        ctx.beginPath();
        for (let i = 0; i < it.points.length; i++) {
          const p = cam.worldToScreen(it.points[i].x, it.points[i].y);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = it.fillColor;
        ctx.globalAlpha = 0.3 * (it.fillAlphaPct / 100 + 0.5);
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = it.strokeColor;
        ctx.lineWidth = Math.max(1, it.strokeWidthPx);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
      } else if (it.kind === "textbox") {
        const cx = it.center.x, cy = it.center.y;
        const w = it.widthM, h = it.heightM;
        const rot = it.rotationRad || 0;
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const corners = [
          { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
        ].map(p => cam.worldToScreen(cx + p.x * cs - p.y * sn, cy + p.x * sn + p.y * cs));
        ctx.strokeStyle = primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath(); ctx.stroke();
        ctx.setLineDash([]);
      } else if (it.kind === "dimension") {
        const a = cam.worldToScreen(it.p1.x, it.p1.y);
        const b = cam.worldToScreen(it.p2.x, it.p2.y);
        ctx.strokeStyle = it.lineColor || primary;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  setTool(id: string) {
    try { this.propertyEdit?.flush(); } catch {}
    try { this.settleHistoryState(); } catch {}
    // Zuletzt gewähltes objektbezogenes Werkzeug merken. Der Wechsel zum
    // Auswahlwerkzeug (oder zu Radierer/Pipette) löscht diesen Filter NICHT —
    // er bestimmt, welche Objekte "Alles"/Strg+A auswählt.
    const objTool = asObjectToolId(id);
    if (objTool) this.selectionFilterTool = objTool;
    // Werkzeugwechsel beendet immer den Tabellen-Zellmodus.
    this.endTableEdit();
    if (this.pastePreviewActive) this.cancelPastePreview();
    // Ein anderes Werkzeug (z. B. Bibliotheks-/Dokumentplatzierung) beendet
    // den Mehrfach-Einfüge-Modus sauber.
    if (this.multiPasteActive && id !== ToolIds.SELECT) this.stopMultiPaste();


    if (this.activeTool && this.activeTool.cancel) this.activeTool.cancel();
    // Cursor zentral zurücksetzen: kein Werkzeugcursor bleibt im nächsten Werkzeug.
    try { this.canvas.style.cursor = "default"; } catch { /* optional */ }
    // Wand-Helfer ausschalten, wenn das Wandwerkzeug verlassen wird.
    if (this.activeTool === this.wallTool && id !== ToolIds.WALL) {
      this.renderer.showWallHelpers = false;
    }
    if (id === ToolIds.SELECT) { this.activeTool = this.selectTool; this.selectTool.activate(); }
    else if (id === ToolIds.LINE) { this.activeTool = this.lineTool; this.lineTool.activate(); }
    else if (id === ToolIds.HATCH) { this.activeTool = this.hatchTool; this.hatchTool.activate(); }
    else if (id === ToolIds.POLYGON) { this.activeTool = this.polygonTool; this.polygonTool.activate(); }
    else if (id === ToolIds.MEASURE) { this.activeTool = this.measureTool; this.measureTool.activate(); }
    else if (id === ToolIds.TEXT) { this.activeTool = this.textTool; this.textTool.activate(); }
    else if (id === ToolIds.PIPETTE) { this.activeTool = this.pipetteTool; this.pipetteTool.activate(); }
    // Bibliothek: solange nichts platziert wird, arbeitet die normale Auswahl
    // weiter (Klick, Shift-Klick, Rahmenauswahl). Erst `beginPlacement()`
    // übernimmt das Bibliothekswerkzeug die Eingabe.
    else if (id === ToolIds.LIBRARY) { this.activeTool = this.selectTool; this.selectTool.activate(); }
    else if (id === ToolIds.DOCUMENT) { this.activeTool = this.documentTool; this.documentTool.activate(); }
    else if (id === ToolIds.FREE) { this.activeTool = this.freeDrawTool; this.freeDrawTool.activate(); }
    else if (id === ToolIds.ERASER) { this.activeTool = this.eraserTool; this.eraserTool.activate(); }
    else if (id === ToolIds.WALL) { this.activeTool = this.wallTool; this.wallTool.activate(); }
    else if (id === ToolIds.DOOR) { this.activeTool = this.doorTool; this.doorTool.activate(); }
    else if (id === ToolIds.TABLE) { this.activeTool = this.tableTool; this.tableTool.activate(); }
    else if (id === ToolIds.RULER) { this.activeTool = this.rulerTool as any; this.rulerTool.activate(); }
    else if (id === ToolIds.STAIR) { this.activeTool = this.stairTool as any; this.stairTool.activate(); }
    this._syncLineSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._syncTextSettingsFromContext();
    this._syncHatchSettingsFromContext();
    this._syncMeasureSettingsFromContext();
    this._updateSettingsVisibility();
    try {
      if ((window as any).__pixunaActiveTool !== id) setLmbHint(false);
      (window as any).__pixunaActiveTool = id;
    } catch {}
    this.onToolChange?.(id);
  }

  /* ---- Measure Settings Panel ---- */
  private _syncMeasureLabelSelect() {
    if (!this.measureRefs?.idSelect) return;
    const groups = this.labelManager.list();
    const cur = this.measureRefs.idSelect.value;
    this.measureRefs.idSelect.innerHTML = "";
    for (const g of groups) {
      const opt = document.createElement("option");
      opt.value = g.id; opt.textContent = g.name;
      this.measureRefs.idSelect.appendChild(opt);
    }
    const preferred =
      (this.labelManager.getById(cur) ? cur : null) ||
      (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    this.measureRefs.idSelect.value = preferred;
  }

  private _setupMeasureSettingsPanel() {
    const r = this.measureRefs;
    if (!r) return;

    r.idSelect.addEventListener("change", () => {
      const nextId = r.idSelect.value || Defaults.defaultLabelId;
      if (this.assignBatchToLabel("dimension", nextId)) return;
      if (this.selectedLabelId) {
        const groupIds = this.scene.getDimensionsByLabelId(this.selectedLabelId).map(d => d.id);
        if (groupIds.length > 0) {
          this.scene.assignDimensionsToLabel(groupIds, nextId);
          this.setSelectedLabelId(nextId);
          this.refreshLabelUI();
          return;
        }
      }
      this.setActiveDrawLabelId(nextId);
    });

    r.orientation.addEventListener("change", () => {
      const val = r.orientation.value as "parallel" | "diagonal" | "arc";
      this.measureSettings.orientation = val;
      const sel = this.getEditDimension();
      if (sel) sel.mode = val;
    });

    r.pointCount.addEventListener("change", () => {
      this.measureSettings.pointCount = r.pointCount.value as MeasureSettings["pointCount"];
    });

    r.direction.addEventListener("change", () => {
      const val = r.direction.value as "horizontal" | "vertical" | "free";
      this.measureSettings.direction = val;
      // Im "frei"-Modus ist Endpunkt-Editierung sinnvoller als Parallel-Verschiebung.
      if (val === "free") {
        this.measureSettings.editMode = "endpoints";
        r.editMode.value = "endpoints";
      }
    });


    r.editMode.addEventListener("change", () => {
      this.measureSettings.editMode = r.editMode.value as "parallel" | "endpoints";
    });

    r.extensionsToggle.addEventListener("change", () => {
      const val = !!r.extensionsToggle.checked;
      this.measureSettings.showExtensions = val;
      const sel = this.getEditDimension();
      if (sel) sel.showExtensions = val;
      r.extensionsGroup.classList.toggle("hidden", !val);
    });

    r.extensionStyle.addEventListener("change", () => {
      const val = r.extensionStyle.value as "dashed" | "solid";
      this.measureSettings.extensionStyle = val;
      const sel = this.getEditDimension();
      if (sel) sel.extensionStyle = val;
    });

    r.extensionColor.addEventListener("input", () => {
      const val = r.extensionColor.value;
      this.measureSettings.extensionColor = val;
      const sel = this.getEditDimension();
      if (sel) sel.extensionColor = val;
      r.extensionColorPreview.style.background = val;
    });

    r.extensionAlpha.addEventListener("input", () => {
      const v = parseFloat((r.extensionAlpha.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 1);
      this.measureSettings.extensionAlpha = c;
      const sel = this.getEditDimension();
      if (sel) sel.extensionAlpha = c;
    });

    r.freeTextToggle.addEventListener("change", () => {
      const val = !!r.freeTextToggle.checked;
      this.measureSettings.useFreeText = val;
      const sel = this.getEditDimension();
      if (sel) sel.useFreeText = val;
      r.freeTextInput.classList.toggle("hidden", !val);
      r.freeTextGroup.classList.toggle("hidden", !val);
    });

    const toggleFreeTextBtn = (btn: HTMLButtonElement, get: () => boolean, set: (v: boolean) => void) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const next = !get();
        set(next);
        btn.classList.toggle("active", next);
      });
    };
    toggleFreeTextBtn(
      r.freeTextBold,
      () => this.measureSettings.freeTextBold,
      (v) => {
        this.measureSettings.freeTextBold = v;
        const sel = this.getEditDimension();
        if (sel) sel.freeTextBold = v;
      },
    );
    toggleFreeTextBtn(
      r.freeTextItalic,
      () => this.measureSettings.freeTextItalic,
      (v) => {
        this.measureSettings.freeTextItalic = v;
        const sel = this.getEditDimension();
        if (sel) sel.freeTextItalic = v;
      },
    );

    r.freeTextColor.addEventListener("input", () => {
      const val = r.freeTextColor.value;
      this.measureSettings.freeTextColor = val;
      const sel = this.getEditDimension();
      if (sel) sel.freeTextColor = val;
      r.freeTextColorPreview.style.background = val;
    });

    r.freeTextInput.addEventListener("input", () => {
      const val = r.freeTextInput.value;
      this.measureSettings.freeText = val;
      const sel = this.getEditDimension();
      if (sel) sel.freeText = val;
    });

    r.textColor.addEventListener("input", () => {
      const val = r.textColor.value;
      this.measureSettings.textColor = val;
      const sel = this.getEditDimension();
      if (sel) sel.textColor = val;
      r.textColorPreview.style.background = val;
    });

    r.textSize.addEventListener("input", () => {
      const v = parseFloat((r.textSize.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      const c = clamp(v, 1, 200);
      this.measureSettings.textSizePx = c;
      const sel = this.getEditDimension();
      if (sel) sel.textSizePx = c;
    });

    r.decimals.addEventListener("input", () => {
      const v = parseInt(r.decimals.value || "0", 10);
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 6);
      this.measureSettings.decimals = c;
      const sel = this.getEditDimension();
      if (sel) sel.decimals = c;
    });

    r.textBgToggle.addEventListener("change", () => {
      const val = !!r.textBgToggle.checked;
      this.measureSettings.textBgEnabled = val;
      const sel = this.getEditDimension();
      if (sel) sel.textBgEnabled = val;
      r.textBgGroup.classList.toggle("hidden", !val);
    });

    r.textBgColor.addEventListener("input", () => {
      const val = r.textBgColor.value;
      this.measureSettings.textBgColor = val;
      const sel = this.getEditDimension();
      if (sel) sel.textBgColor = val;
      r.textBgColorPreview.style.background = val;
    });

    r.textBgAlpha.addEventListener("input", () => {
      const v = parseFloat((r.textBgAlpha.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 1);
      this.measureSettings.textBgAlpha = c;
      const sel = this.getEditDimension();
      if (sel) sel.textBgAlpha = c;
    });

    r.lineColor.addEventListener("input", () => {
      const val = r.lineColor.value;
      this.measureSettings.lineColor = val;
      const sel = this.getEditDimension();
      if (sel) sel.lineColor = val;
      r.lineColorPreview.style.background = val;
    });

    r.tickLength.addEventListener("input", () => {
      const v = parseFloat((r.tickLength.value || "").replace(",", "."));
      if (!Number.isFinite(v) || v <= 0) return;
      const c = clamp(v, 0.001, 10);
      this.measureSettings.tickLengthM = c;
      const sel = this.getEditDimension();
      if (sel) sel.tickLengthM = c;
    });

    if (r.showUnit) r.showUnit.addEventListener("change", () => {
      const val = !!r.showUnit.checked;
      this.measureSettings.showUnit = val;
      const sel = this.getEditDimension();
      if (sel) sel.showUnit = val;
    });

    if (r.unit) r.unit.addEventListener("change", () => {
      const val = (r.unit.value === "mm" || r.unit.value === "cm" || r.unit.value === "m") ? r.unit.value : "m";
      this.measureSettings.unit = val;
      const sel = this.getEditDimension();
      if (sel) sel.unit = val;
    });

    if (r.textGap) r.textGap.addEventListener("input", () => {
      const v = parseFloat((r.textGap!.value || "").replace(",", "."));
      if (!Number.isFinite(v)) return;
      const c = clamp(v, 0, 200);
      this.measureSettings.textGapPx = c;
      const sel = this.getEditDimension();
      if (sel) sel.textGapPx = c;
    });

    if (r.doorHeightText) r.doorHeightText.addEventListener("input", () => {
      const val = r.doorHeightText!.value;
      this.measureSettings.doorHeightText = val;
      const sel = this.getEditDimension();
      if (sel) sel.doorHeightText = val;
    });

    this._syncMeasureSettingsFromContext();
  }

  private _syncMeasureSettingsFromContext() {
    const r = this.measureRefs;
    if (!r) return;
    const sel = this.getEditDimension();
    const s = sel ? {
      orientation: (sel.mode === "angle" ? this.measureSettings.orientation : sel.mode), pointCount: (sel.mode === "angle" ? "angle" : this.measureSettings.pointCount), direction: this.measureSettings.direction,
      editMode: this.measureSettings.editMode,
      showExtensions: sel.showExtensions, useFreeText: sel.useFreeText, freeText: sel.freeText,
      textColor: sel.textColor, textSizePx: sel.textSizePx, decimals: sel.decimals,
      textBgEnabled: sel.textBgEnabled, textBgColor: sel.textBgColor, textBgAlpha: sel.textBgAlpha,
      lineColor: sel.lineColor, tickLengthM: sel.tickLengthM, labelId: sel.labelId,
      extensionStyle: sel.extensionStyle, extensionColor: sel.extensionColor, extensionAlpha: sel.extensionAlpha,
      freeTextBold: sel.freeTextBold, freeTextItalic: sel.freeTextItalic, freeTextColor: sel.freeTextColor,
      showUnit: sel.showUnit, unit: sel.unit,
      textGapPx: sel.textGapPx, doorHeightText: sel.doorHeightText,
    } : { ...this.measureSettings, labelId: this.activeDrawLabelId };

    r.orientation.value = s.orientation;
    r.pointCount.value = s.pointCount;
    r.pointCount.dispatchEvent(new Event("cad-value-sync"));
    r.direction.value = s.direction;
    r.editMode.value = s.editMode;
    r.extensionsToggle.checked = !!s.showExtensions;
    r.extensionsGroup.classList.toggle("hidden", !s.showExtensions);
    r.extensionStyle.value = s.extensionStyle || "dashed";
    r.extensionColor.value = this._toHexColor(s.extensionColor);
    r.extensionColorPreview.style.background = r.extensionColor.value;
    r.extensionAlpha.value = String(s.extensionAlpha ?? 1);
    r.freeTextToggle.checked = !!s.useFreeText;
    r.freeTextInput.value = s.freeText || "";
    r.freeTextInput.classList.toggle("hidden", !s.useFreeText);
    r.freeTextGroup.classList.toggle("hidden", !s.useFreeText);
    r.freeTextBold.classList.toggle("active", !!s.freeTextBold);
    r.freeTextItalic.classList.toggle("active", !!s.freeTextItalic);
    r.freeTextColor.value = this._toHexColor(s.freeTextColor);
    r.freeTextColorPreview.style.background = r.freeTextColor.value;
    r.textColor.value = this._toHexColor(s.textColor);
    r.textColorPreview.style.background = r.textColor.value;
    r.textSize.value = String(s.textSizePx);
    r.decimals.value = String(s.decimals);
    r.textBgToggle.checked = !!s.textBgEnabled;
    r.textBgGroup.classList.toggle("hidden", !s.textBgEnabled);
    r.textBgColor.value = this._toHexColor(s.textBgColor);
    r.textBgColorPreview.style.background = r.textBgColor.value;
    r.textBgAlpha.value = String(s.textBgAlpha);
    r.lineColor.value = this._toHexColor(s.lineColor);
    r.lineColorPreview.style.background = r.lineColor.value;
    r.tickLength.value = String(s.tickLengthM);
    if (r.showUnit) r.showUnit.checked = !!s.showUnit;
    if (r.unit) r.unit.value = s.unit || "m";
    if (r.textGap) r.textGap.value = String((s as any).textGapPx ?? Defaults.measureTextGapPx);
    if (r.doorHeightText) r.doorHeightText.value = (s as any).doorHeightText ?? "";
    const labelForDisplay =
      (this.selectedLabelId && this.labelManager.getById(this.selectedLabelId)) ? this.selectedLabelId
        : (s.labelId && this.labelManager.getById(s.labelId)) ? s.labelId
        : (this.labelManager.getById(this.activeDrawLabelId) ? this.activeDrawLabelId : Defaults.defaultLabelId);
    r.idSelect.value = labelForDisplay;
  }

  resize() { this._resize(); }

  private _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderer.setViewport(rect.width, rect.height);
  }

  private _tick() {
    if (this._destroyed) return;
    try {
      if (this.input.isPanning) this.camera.panBy(this.input.panDX, this.input.panDY);
      if (this.input.wheelDelta !== 0) this.camera.zoomAt(this.input.wheelDelta, this.input.mouse.sx, this.input.mouse.sy);
      this.input.update(this.camera);
      {
        const sel = (this.selectTool as any)?.marqueeSelectedIds as { kind: string; id: string }[] | undefined;
        const ids = (sel || []).filter((o) => o.kind === "stair").map((o) => o.id);
        const cur = this.renderer.stairHighlightIds;
        if (ids.length !== cur.size || ids.some((i) => !cur.has(i))) this.renderer.stairHighlightIds = new Set(ids);
      }
      // Bereitstehendes Einfügen: erst jetzt, mit echter Cursorposition.
      this._resolveArmedPaste();

      // Rechtsklick auf einen Fangpunkt setzt/entfernt eine globale Hilfslinie —
      // werkzeugübergreifend. Linien-/Wandwerkzeug und der Punkt-Edit des
      // Auswahlwerkzeugs bringen eigene Hilfslinien mit und bleiben unberührt.
      // Rechtsklick beendet das fortlaufende Platzieren.
      // Rechtsklick → Hilfslinien: ausschließlich über den zentralen
      // GuideInteractionController (werkzeug- und objektübergreifend).
      this.globalGuides.setContext(this._guideContextKey());
      if (this.input.rightClicked) {
        const tool: any = this.activeTool;
        let anchor: Vec2 | null = null;
        let extraEdges: [Vec2, Vec2][] = [];
        try { anchor = tool?.getGuideAnchor?.() ?? null; } catch { anchor = null; }
        try { extraEdges = tool?.getGuideExtraEdges?.() ?? []; } catch { extraEdges = []; }
        let extraPoints: Vec2[] = [];
        try {
          const xg = tool?.getGuideExtraGeometry?.();
          if (xg) {
            extraEdges = [...extraEdges, ...xg.edges.map((e: any) => [e.a, e.b] as [Vec2, Vec2])];
            extraPoints = xg.points.map((p: any) => p.world);
          }
        } catch { extraPoints = []; }
        const handled = this.guideController.handleRightClick(
          { x: this.input.mouse.sx, y: this.input.mouse.sy },
          { x: this.input.mouse.wx, y: this.input.mouse.wy },
          { anchor, extraEdges, extraPoints },
        );
        if (handled) this.input.rightClicked = false;
      }
      // Rechtsklick ohne Hilfslinienziel beendet das fortlaufende Platzieren.
      if (this.input.rightClicked && this.multiPasteActive) {
        this.input.rightClicked = false;
        this.stopMultiPaste();
      }

      if (this.activePlanId) {
        // Plan-Modus: PlanController bekommt Vorrang (Selektion / Drag / HUB),
        // Werkzeuge bleiben aber zusätzlich nutzbar (Annotation auf dem Plan).
        const planConsumed = this.planController?.update() ?? false;
        if (!planConsumed) {
          if (this.pastePreviewActive) {
            this.canvas.style.cursor = "copy";
            if (this.input.clicked) this._commitPasteAtMouse();
          } else {
            this.activeTool.update(this.input);
          }
        }
      } else if (this.pastePreviewActive) {
        this.canvas.style.cursor = "copy";
        if (this.input.clicked) this._commitPasteAtMouse();
      } else {
        this.activeTool.update(this.input);
      }

      // Rasterebenen der aktiven Zeichenfläche an den Renderer hängen.
      this.renderer.rasterLayers = this.rasterLayers;
      this.renderer.wallEditActive = !!(this.selectTool && this.selectTool.isEditing());
      this.topology.priorityWallId = this.selectTool?.getPriorityWallId?.() || null;


      this.renderer.render();
      this.globalGuides.draw(this.ctx, this.camera, this.renderer.vw, this.renderer.vh);
      if (this.pastePreviewActive) this._drawPastePreview(this.ctx);
      this._drawPendingPointHint(this.ctx);
      this.input.endFrame();
    } catch (err) {
      console.error("CAD tick error:", err);
      try { this.input.endFrame(); } catch (_) {}
    }
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  /**
   * Tablet-Hilfsrad: Zeigt den "vorerfassten" Punkt am Cursor an, solange der
   * Stift die Fläche berührt hat, der Punkt aber noch nicht per LMB/ENTER
   * gesetzt wurde.
   */
  private _drawPendingPointHint(ctx: CanvasRenderingContext2D) {
    drawPendingPointHint(ctx, this.input.mouse.sx, this.input.mouse.sy);
  }


  /**
   * Verdrahtet das Zeichnungs-ID-Panel (Blätter + Transparentpause).
   * Wird vom React-Wrapper nach dem Mount aufgerufen.
   */
  attachSheetPanel(
    root: HTMLDivElement,
    body: HTMLDivElement,
    list: HTMLDivElement,
    addBtn: HTMLButtonElement,
    toggleBtn: HTMLButtonElement,
  ) {
    this.sheetPanel = new SheetPanel(
      this.sheetManager,
      this.sheetOverlayStore,
      root, body, list, addBtn, toggleBtn,
      {
        getActiveSheetId: () => this.activeSheetId,
        setActiveSheetId: (id: string) => this.setActiveSheetId(id),
        onChange: () => {
          this._syncSheetSceneMap();
          this._syncOverlayScenes();
          this.refreshSheetUI();
          this.bumpContentRevision();
          this._emitPlanUiChange();
        },
        beforeDeleteSheet: (sheetId: string) => this._confirmSheetDeleteWithProjections(sheetId),
      },
    );
    this.sheetPanel.render();
  }

  refreshSheetUI() {
    this.sheetPanel?.render();
  }

  refreshPlanUI() {
    this._emitPlanUiChange();
  }

  // ---------- Exportbereich (React-Oberfläche über derselben Plan-Engine) ----------
  private _planUiListeners = new Set<() => void>();
  /** Zähler für React-Abonnenten des Exportbereichs. */
  planUiVersion = 0;
  onPlanUiChange(fn: () => void): () => void {
    this._planUiListeners.add(fn);
    return () => { this._planUiListeners.delete(fn); };
  }
  private _emitPlanUiChange() {
    this.planUiVersion++;
    for (const fn of this._planUiListeners) { try { fn(); } catch { /* noop */ } }
  }

  /**
   * Einziger Mutationsweg des Exportbereichs: Änderung ausführen, Plan-Scenes/
   * Renderer/Transparenzpause synchronisieren, genau EIN Verlaufsschritt.
   */
  mutatePlans(fn: () => void) {
    fn();
    this._syncPlanSceneMap();
    if (this.activePlanId && !this.planManager.getById(this.activePlanId)) {
      this.setActivePlanId(null);
    } else if (this.activePlanId) {
      this._applyPlanModeToRenderer();
    }
    this._syncPlanTracingLayers();
    this.planController?.invalidateCache();
    this.refreshPlanUI();
    this.commitHistorySnapshot();
  }

  /** Verknüpften Ausschnitt eines CAD-Blatts auf der aktiven Exportseite platzieren (Canvas-Mitte). */
  placeSheetOnActivePlan(sheetId: string) {
    if (!this.activePlanId || !this.planController) return;
    const r = this.canvas.getBoundingClientRect();
    void this.planController.createProjectionFromSheet(sheetId, r.width / 2, r.height / 2).then(p => {
      if (p) { this.refreshPlanUI(); }
    });
  }

  private _confirmSheetDeleteWithProjections(sheetId: string): boolean {
    const uses: { planId: string; projId: string }[] = [];
    for (const plan of this.planManager.list()) {
      for (const pr of plan.projections) {
        if (pr.sourceSheetId === sheetId && pr.mode === "linked") uses.push({ planId: plan.id, projId: pr.id });
      }
    }
    if (uses.length === 0) return true;
    if (!window.confirm(`Dieses CAD-Blatt wird in ${uses.length} verknüpften Export-Ausschnitt(en) verwendet. Trotzdem löschen?`)) return false;
    const freeze = window.confirm(
      "Ausschnitte einfrieren?\n\nOK: Die Ausschnitte behalten den aktuellen Zeichenstand als feste Kopie.\nAbbrechen: Die Ausschnitte bleiben als Platzhalter „Quelle fehlt“ stehen.",
    );
    if (freeze) {
      for (const u of uses) this.planController?.freezeProjection(u.planId, u.projId);
    }
    return true;
  }

  /** Setzt aktiven Plan (null = zurück zur Zeichnungsoberfläche). */
  setActivePlanId(id: string | null) {
    // Beim Betreten/Verlassen einer Exportseite verknüpfte Ausschnitte frisch lesen.
    this.bumpContentRevision();
    if (id != null && !this.planManager.getById(id)) return;
    if (id === this.activePlanId) { this.refreshPlanUI(); return; }
    // Anordnungsmodus ist rein flüchtig: jeder Seitenwechsel startet fixiert.
    this.spreadLayoutEditing = false;
    // Aktuellen Camera-State sichern (für Sheet bzw. den vorherigen Plan).
    this._saveCurrentCameraState();
    this.activePlanId = id;
    this._applyPlanModeToRenderer();
    this.refreshPlanUI();
  }

  /** Wendet den aktuellen Plan-Status auf Renderer + Scene an. */
  private _applyPlanModeToRenderer() {
    if (this.activePlanId) {
      const plan = this.planManager.getById(this.activePlanId);
      if (plan) {
        const size = getPlanPaperSize(plan);
        const spreadNeighbors = this._spreadNeighborsOf(plan.id);
        this.renderer.planMode = { widthMm: size.width, heightMm: size.height, marginsMm: plan.marginsMm, holePattern: plan.holePattern, holePunchSide: plan.holePunchSide, spreadNeighbors };
        this.renderer.planNeighborDraw = (ctx, nb) => this._drawSpreadNeighborContent(ctx, nb.id, nb.dxMm, nb.dyMm);
        const guides = this._spreadGuideGeometry(size.width, size.height, plan, spreadNeighbors);
        this.topology.planFrame = {
          widthM: size.width / 1000,
          heightM: size.height / 1000,
          guides,
        };
        // Annotation-Scene des Plans als aktive Scene swappen, damit Werkzeuge
        // direkt auf dem Plan zeichnen können.
        const planScene = this._ensurePlanScene(this.activePlanId);
        this.scene = planScene;
        (this.renderer as any).scene = planScene;
        this.topology.scene = planScene;
        // Selection / Hover zurücksetzen.
        this.selection = null;
        this.renderer.setSelection(null);
        this.renderer.setHoverSegmentId(null);
        this.renderer.setHoverHatchId(null);
        this.renderer.setHoverTextBoxId(null);
        // Sheet-Overlays im Plan-Modus aus (Sheets gehören nicht auf Pläne).
        this.renderer.overlayScenes = [];
        // Plan-Tracing (andere Pläne als Transparentpause) berechnen.
        this._syncPlanTracingLayers();
        // Tools/HUDs sauber beenden.
        try { (this.activeTool as any)?.cancel?.(); } catch { /* noop */ }
        try { (this.activeTool as any)?.reset?.(); } catch { /* noop */ }
        this.pointEditMenu.hide();
        this.hub.hide();
        // Kamera: gespeicherten Zustand wiederherstellen — sonst Fit auf Papier.
        const cached = this._camStateByPlanId.get(this.activePlanId);
        if (cached) {
          this.camera.scale = cached.scale;
          this.camera.offsetX = cached.offsetX;
          this.camera.offsetY = cached.offsetY;
        } else {
          this._fitCameraToPaper(size.width, size.height);
        }
        // Referenz-Skalierung für Werkzeuge/Texte: an Plan-Fit-Größe binden,
        // damit Werkzeuge nicht überdimensional auf dem Papier wirken.
        const fitRef = this._computePlanFitScale(size.width, size.height);
        this.renderer.referencePxPerM = fitRef;
        // Plan-spezifische Defaults (Linienstärke, Schriftgröße) aktivieren.
        // Plan-spezifische Defaults (Linienstärke, Schriftgröße, Maßketten-Tick) aktivieren.
        if (!this._savedSheetDefaults) {
          this._savedSheetDefaults = {
            lineThicknessM: this.defaultLineThicknessM,
            textFontSizePx: this.defaultTextFontSizePx,
            tickLengthM: this.measureSettings.tickLengthM,
          };
        }
        const planScale = Defaults.strokeWidthBaseScale / fitRef;
        const planLine = this._planDefaultLineThicknessM.get(this.activePlanId)
          ?? Defaults.lineThicknessM * planScale;
        const planFont = this._planDefaultTextFontSizePx.get(this.activePlanId)
          ?? Defaults.textFontSizePx;
        this._planDefaultLineThicknessM.set(this.activePlanId, planLine);
        this._planDefaultTextFontSizePx.set(this.activePlanId, planFont);
        this.defaultLineThicknessM = planLine;
        this.defaultTextFontSizePx = planFont;
        // Maßketten-Ticks: in m gespeichert → mit Plan-Skalierung anpassen.
        this.measureSettings.tickLengthM = Defaults.measureTickLengthM * planScale;
      }
    } else {
      const leavingPlan = this.renderer.planMode != null;
      this.renderer.planMode = null;
      this.topology.planFrame = null;
      this.renderer.planTracingLayers = [];
      // Nur beim Verlassen einer Exportseite: Kamera des Zeichenblatts wiederherstellen
      // (nicht die der Exportseite übernehmen). Undo/Restore im CAD bewegt die Kamera nie.
      const sheetCam = leavingPlan ? this._camStateBySheetId.get(this.activeSheetId) : undefined;
      if (!leavingPlan) { /* Kamera unverändert */ }
      else if (sheetCam) {
        this.camera.scale = sheetCam.scale;
        this.camera.offsetX = sheetCam.offsetX;
        this.camera.offsetY = sheetCam.offsetY;
      } else {
        this.applyDefaultSheetView();
      }
      // Referenz-Skalierung zurück auf Sheet-Default.
      this.renderer.referencePxPerM = Defaults.strokeWidthBaseScale;
      // Aktive Sheet-Scene wiederherstellen.
      const activeScene = this.scenesById.get(this.activeSheetId) || this.scene;
      this.scene = activeScene;
      (this.renderer as any).scene = activeScene;
      this.topology.scene = activeScene;
      // Overlay-Sheets wiederherstellen.
      this._syncOverlayScenes();
      // Plan-Controller-State zurücksetzen (HUB ausblenden).
      this.planController?.onExitPlanMode();
      this.canvas.style.cursor = "";
      // Sheet-Defaults zurückholen, falls wir aus einem Plan kommen.
      if (this._savedSheetDefaults) {
        this.defaultLineThicknessM = this._savedSheetDefaults.lineThicknessM;
        this.defaultTextFontSizePx = this._savedSheetDefaults.textFontSizePx;
        this.measureSettings.tickLengthM = this._savedSheetDefaults.tickLengthM;
        this._savedSheetDefaults = null;
      }
    }
    // Beim Plan-Wechsel Auswahl/Hover des Plan-Controllers zurücksetzen.
    if (this.planController && this.activePlanId) {
      this.planController.selectedProjectionId = null;
      this.planController.hoverProjectionId = null;
    }
  }

  /** Berechnet den Fit-Zoom (px/m) für ein Plan-Papier mit gegebener mm-Größe. */
  private _computePlanFitScale(widthMm: number, heightMm: number): number {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return Defaults.strokeWidthBaseScale;
    const wM = widthMm / 1000;
    const hM = heightMm / 1000;
    const marginPx = 40;
    const sx = (rect.width - marginPx * 2) / wM;
    const sy = (rect.height - marginPx * 2) / hM;
    return Math.max(1, Math.min(sx, sy));
  }

  /** Nachbarseiten der Seite im Verbund, relativ zur oberen linken Ecke dieser Seite (mm). */
  private _spreadNeighborsOf(planId: string): SpreadNeighborInfo[] {
    const plan = this.planManager.getById(planId);
    if (!plan?.spreadId) return [];
    const rects = this.planManager.spreadRects(plan.spreadId);
    const self = rects.find(r => r.id === planId);
    if (!self || rects.length < 2) return [];
    return rects.filter(r => r.id !== planId).map(r => {
      const p = this.planManager.getById(r.id);
      return {
        id: r.id,
        name: p?.name ?? "",
        dxMm: r.x - self.x,
        dyMm: r.y - self.y,
        widthMm: r.width,
        heightMm: r.height,
        marginsMm: p?.marginsMm ?? 0,
        holePattern: p?.holePattern ?? "none",
        holePunchSide: p?.holePunchSide ?? "left",
      };
    });
  }

  /**
   * Nicht druckbare Fanggeometrie der aktiven Seite plus Papierkanten, Ränder und
   * Lochung sichtbarer Nachbarseiten. Objekte der Nachbarseiten liefern keine Fangpunkte.
   */
  private _spreadGuideGeometry(wMm: number, hMm: number, plan: { marginsMm: number; holePattern: any; holePunchSide: any }, neighbors: SpreadNeighborInfo[]) {
    const guides = pageGuideSnapGeometry({ widthMm: wMm, heightMm: hMm, marginsMm: plan.marginsMm, holePattern: plan.holePattern, holePunchSide: plan.holePunchSide });
    for (const nb of neighbors) {
      const c = [
        { x: nb.dxMm, y: nb.dyMm }, { x: nb.dxMm + nb.widthMm, y: nb.dyMm },
        { x: nb.dxMm + nb.widthMm, y: nb.dyMm + nb.heightMm }, { x: nb.dxMm, y: nb.dyMm + nb.heightMm },
      ].map(pt => paperMmToWorld(pt, wMm, hMm));
      for (let i = 0; i < 4; i++) { guides.points.push(c[i]); guides.lines.push([c[i], c[(i + 1) % 4]]); }
      // Rand/Lochung der Nachbarseite: eigene Geometrie, um den Mittelpunkt der Nachbarseite verschoben.
      const own = pageGuideSnapGeometry({ widthMm: nb.widthMm, heightMm: nb.heightMm, marginsMm: nb.marginsMm, holePattern: nb.holePattern, holePunchSide: nb.holePunchSide });
      const ctr = paperMmToWorld({ x: nb.dxMm + nb.widthMm / 2, y: nb.dyMm + nb.heightMm / 2 }, wMm, hMm);
      const sh = (p: { x: number; y: number }) => ({ x: p.x + ctr.x, y: p.y + ctr.y });
      for (const p of own.points) guides.points.push(sh(p));
      for (const [a, b] of own.lines) guides.lines.push([sh(a), sh(b)]);
    }
    return guides;
  }

  /** Schreibgeschützte Vorschau einer Nachbarseite: Ausschnitte + Anmerkungs-Scene, um dx/dy versetzt. */
  private _drawSpreadNeighborContent(ctx: CanvasRenderingContext2D, planId: string, dxMm: number, dyMm: number) {
    const nbPlan = this.planManager.getById(planId);
    const active = this.activePlanId ? this.planManager.getById(this.activePlanId) : null;
    if (!nbPlan || !active) return;
    const a = getPlanPaperSize(active), n = getPlanPaperSize(nbPlan);
    // Mittelpunkt der Nachbarseite in Welt-m (aktive Seite ist am Ursprung zentriert).
    const cx = (dxMm + n.width / 2 - a.width / 2) / 1000;
    const cy = (dyMm + n.height / 2 - a.height / 2) / 1000;
    const cam = this.camera;
    const ox = cam.offsetX, oy = cam.offsetY;
    const r = this.renderer as any;
    const realScene = r.scene, realCtx = r.ctx;
    try {
      cam.offsetX = ox + cx * cam.scale;
      cam.offsetY = oy + cy * cam.scale;
      for (const proj of nbPlan.projections) {
        try { drawPlanProjection(ctx, cam, this.planController?.getItems(proj) ?? [], proj, false, false); } catch { /* noop */ }
      }
      const sc = this.planScenesById.get(planId);
      if (sc) {
        r.scene = sc; r.ctx = ctx;
        r._drawByLabelOrder?.();
      }
    } finally {
      r.scene = realScene; r.ctx = realCtx;
      cam.offsetX = ox; cam.offsetY = oy;
    }
  }

  /** Öffentlich für die Verbund-Bedienung: Nachbarseiten der aktiven Exportseite. */
  activeSpreadNeighbors() {
    return this.activePlanId ? this._spreadNeighborsOf(this.activePlanId) : [];
  }

  /** Macht die Nachbarseite unter dem Bildschirmpunkt aktiv (Antippen der Papierfläche). */
  activateSpreadPageAt(sx: number, sy: number): boolean {
    const pm = this.renderer.planMode;
    if (!pm?.spreadNeighbors?.length) return false;
    const w = this.camera.screenToWorld(sx, sy);
    const mx = w.x * 1000 + pm.widthMm / 2, my = w.y * 1000 + pm.heightMm / 2;
    if (mx >= 0 && my >= 0 && mx <= pm.widthMm && my <= pm.heightMm) return false;
    const hit = [...pm.spreadNeighbors].reverse().find(n => mx >= n.dxMm && mx <= n.dxMm + n.widthMm && my >= n.dyMm && my <= n.dyMm + n.heightMm);
    if (!hit) return false;
    this.setActivePlanId(hit.id);
    return true;
  }

  /** Kamera-Stand zu Beginn einer Vorschau der aktiven Seite (für Abbrechen). */
  private _spreadPreviewBase: { offsetX: number; offsetY: number; neighbors: SpreadNeighborInfo[] } | null = null;

  /**
   * Temporäre Gesamt-Layoutvorschau: verschiebt eine Verbundseite (aktive oder Nachbar)
   * um dx/dy mm gegenüber ihrer Ausgangslage. Kein Verlaufsschritt.
   * Bei der aktiven Seite wandert die Seite sichtbar mit, die übrigen bleiben stehen.
   */
  previewSpreadPage(id: string, dxMm: number, dyMm: number) {
    const pm = this.renderer.planMode;
    if (!pm || !this.activePlanId) return;
    if (!this._spreadPreviewBase) {
      this._spreadPreviewBase = { offsetX: this.camera.offsetX, offsetY: this.camera.offsetY, neighbors: this._spreadNeighborsOf(this.activePlanId) };
    }
    const base = this._spreadPreviewBase;
    const k = this.camera.scale / 1000;
    if (id === this.activePlanId) {
      this.camera.offsetX = base.offsetX + dxMm * k;
      this.camera.offsetY = base.offsetY + dyMm * k;
      pm.spreadNeighbors = base.neighbors.map(n => ({ ...n, dxMm: n.dxMm - dxMm, dyMm: n.dyMm - dyMm }));
    } else {
      this.camera.offsetX = base.offsetX;
      this.camera.offsetY = base.offsetY;
      pm.spreadNeighbors = base.neighbors.map(n => n.id === id ? { ...n, dxMm: n.dxMm + dxMm, dyMm: n.dyMm + dyMm } : n);
    }
    this.renderer.render?.();
  }

  /** Bricht die Vorschau ab: Ausgangslage und Kamera wiederherstellen. */
  cancelSpreadPreview() {
    const base = this._spreadPreviewBase;
    this._spreadPreviewBase = null;
    if (!base) return;
    this.camera.offsetX = base.offsetX;
    this.camera.offsetY = base.offsetY;
    if (this.renderer.planMode) this.renderer.planMode.spreadNeighbors = base.neighbors;
    this.renderer.render?.();
  }

  /** Fixiert die Verschiebung einer Verbundseite (genau ein Verlaufsschritt). */
  commitSpreadPage(id: string, dxMm: number, dyMm: number) {
    const base = this._spreadPreviewBase;
    this._spreadPreviewBase = null;
    const active = this.activePlanId ? this.planManager.getById(this.activePlanId) : null;
    if (!active?.spreadId) return;
    const rects = this.planManager.spreadRects(active.spreadId);
    const r = rects.find(x => x.id === id);
    if (!r) return;
    if (base && id !== active.id) { this.camera.offsetX = base.offsetX; this.camera.offsetY = base.offsetY; }
    // Bei der aktiven Seite bleibt die verschobene Kamera: die Seite steht dort, wo sie losgelassen wurde.
    const cam = { scale: this.camera.scale, offsetX: this.camera.offsetX, offsetY: this.camera.offsetY };
    this.mutatePlans(() => this.planManager.setSpreadOffset(id, r.x + dxMm, r.y + dyMm));
    // Neuaufbau des Plan-Modus darf die Ansicht nicht zurückspringen lassen.
    this.camera.scale = cam.scale; this.camera.offsetX = cam.offsetX; this.camera.offsetY = cam.offsetY;
    this._camStateByPlanId.set(active.id, cam);
  }

  /** Kompatibilität: Nachbarseite live verschieben (absolute Lage relativ zur aktiven Seite). */
  previewSpreadNeighbor(id: string, dxMm: number, dyMm: number) {
    const nb = (this._spreadPreviewBase?.neighbors ?? this.activeSpreadNeighbors()).find(n => n.id === id);
    if (nb) this.previewSpreadPage(id, dxMm - nb.dxMm, dyMm - nb.dyMm);
  }

  /** Kompatibilität: Nachbarseite fixieren (absolute Lage relativ zur aktiven Seite). */
  commitSpreadNeighbor(id: string, dxMm: number, dyMm: number) {
    const nb = (this._spreadPreviewBase?.neighbors ?? this.activeSpreadNeighbors()).find(n => n.id === id);
    if (nb) this.commitSpreadPage(id, dxMm - nb.dxMm, dyMm - nb.dyMm);
  }

  /** Startansicht für neue Zeichenblätter: etwa 40 m Bildbreite, auf den Ursprung zentriert. */
  applyDefaultSheetView() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = Math.max(this.camera.minScale ?? 1, rect.width / 40);
    this.camera.scale = scale;
    this.camera.offsetX = rect.width / 2;
    this.camera.offsetY = rect.height / 2;
  }

  /** Speichert den aktuellen Camera-State für die zuletzt aktive Ansicht. */
  private _saveCurrentCameraState() {
    const snap = { scale: this.camera.scale, offsetX: this.camera.offsetX, offsetY: this.camera.offsetY };
    if (this.activePlanId) {
      this._camStateByPlanId.set(this.activePlanId, snap);
    } else if (this.activeSheetId) {
      this._camStateBySheetId.set(this.activeSheetId, snap);
    }
  }

  /** Stellt die Annotation-Scene für einen Plan sicher. */
  private _ensurePlanScene(planId: string): Scene {
    let sc = this.planScenesById.get(planId);
    if (!sc) {
      sc = new Scene();
      (sc as any)._drawingScaleRef = () => this.drawingScale;
      this.planScenesById.set(planId, sc);
    }
    return sc;
  }

  /**
   * Baut die Tracing-Pause-Layer für den aktiven Plan zusammen.
   * Jeder andere Plan mit aktiver Transparentpause liefert seine
   * Projektionen + Annotation-Scene als ein Layer.
   */
  private _syncPlanTracingLayers() {
    if (!this.activePlanId) {
      this.renderer.planTracingLayers = [];
      this.topology.tracingSnapScenes = [];
      this.topology.tracingSnapGeometry = [];
      return;
    }
    const layers: Renderer["planTracingLayers"] = [];
    const snapScenes: Scene[] = [];
    const snapGeometry: TracingSnapGeometry[] = [];
    for (const plan of this.planManager.list()) {
      if (plan.id === this.activePlanId) continue;
      const state = this.planOverlayStore.get(plan.id);
      if (!state || state.mode === "none") continue;
      const annotationScene = this._ensurePlanScene(plan.id);
      // Schreibgeschützte Fangquelle: nur solange diese Seite wirklich sichtbar ist
      // (Transparenzpause aktiv und Deckkraft größer als 0).
      const visible = (state.opacity ?? 0) > 0;
      if (visible) {
        snapScenes.push(annotationScene);
        for (const proj of plan.projections) {
          const geo = this._projectionSnapGeometry(proj);
          if (geo) snapGeometry.push(geo);
        }
      }
      // Projektionen via PlanController-Hilfen + Annotation-Scene via Renderer-Pfad.
      const drawCb = (offCtx: CanvasRenderingContext2D) => {
        // 1) Projektionen dieses Plans zeichnen
        for (const proj of plan.projections) {
          const items = this.planController?.getItems(proj) ?? [];
          try {
            drawPlanProjection(offCtx, this.camera, items, proj, false, false);
          } catch { /* noop */ }
        }
        // 2) Annotation-Scene über bestehenden Renderer-Pfad.
        // Wir swappen Renderer.scene + ctx temporär.
        const r = this.renderer;
        const realScene = (r as any).scene;
        const realCtx = (r as any).ctx;
        try {
          (r as any).scene = annotationScene;
          (r as any).ctx = offCtx;
          (r as any)._drawByLabelOrder?.();
        } finally {
          (r as any).scene = realScene;
          (r as any).ctx = realCtx;
        }
      };
      layers.push({
        drawCb,
        mode: state.mode === "tint" ? "tint" : "stamp",
        color: state.color,
        opacity: state.opacity,
      });
    }
    this.renderer.planTracingLayers = layers;
    this.topology.tracingSnapScenes = snapScenes;
    this.topology.tracingSnapGeometry = snapGeometry;
  }

  /**
   * Temporäre Fanggeometrie eines sichtbaren CAD-Ausschnitts (Transparenzpause).
   * Wird bei Änderung von Inhalt, Sichtbarkeit, Position, Maßstab, Drehung oder
   * Clip neu berechnet und nie gespeichert.
   */
  private _tracingGeoCache = new Map<string, { sig: string; geo: TracingSnapGeometry }>();
  private _tracingFrozenScenes = new Map<string, { json: string; scene: Scene }>();

  private _projectionSnapGeometry(proj: any): TracingSnapGeometry | null {
    const hidden = this.labelManager.list().filter(g => g.visible === false).map(g => g.id).join(",");
    const clip = proj.clip || { left: 0, right: 0, top: 0, bottom: 0 };
    const sig = [
      this.contentRevision, hidden, proj.mode, proj.sourceSheetId,
      proj.x, proj.y, proj.rotation, proj.scaleDen ?? proj.scale,
      clip.left, clip.right, clip.top, clip.bottom,
    ].join("|");
    const hit = this._tracingGeoCache.get(proj.id);
    if (hit && hit.sig === sig) return hit.geo;

    let source: Scene | null = null;
    if (proj.mode === "linked") {
      source = this.scenesById.get(proj.sourceSheetId) || null;
    } else if (proj.sceneSnapshot) {
      const json = JSON.stringify(proj.sceneSnapshot);
      const cached = this._tracingFrozenScenes.get(proj.id);
      if (cached && cached.json === json) source = cached.scene;
      else {
        const sc = new Scene();
        try { restoreOneScene(sc, proj.sceneSnapshot); } catch { /* defensiv */ }
        this._tracingFrozenScenes.set(proj.id, { json, scene: sc });
        source = sc;
      }
    }
    if (!source) return null;

    const libScenes = this.librarySnapSource
      ? this.librarySnapSource
          .scenesFor(source, (id) => this.labelManager.isVisible(id))
          .map(ls => ls.scene)
      : [];
    const raw = collectSceneSnapGeometry(source, (id) => this.labelManager.isVisible(id), libScenes);
    const items = this.planController?.getItems(proj) ?? [];
    const layout = computeProjectionLayout(items, proj);
    const geo = transformSnapGeometryToPlan(raw, layout, proj.rotation || 0);
    this._tracingGeoCache.set(proj.id, { sig, geo });
    return geo;
  }

  /** Cached leere Scene als Anzeige-Backing im Plan-Modus (legacy, ungenutzt). */
  private _planEmptyScene: Scene | null = null;

  /** Zentriert Kamera auf (0,0) und zoomt so, dass das Papier mit Rand passt. */
  private _fitCameraToPaper(widthMm: number, heightMm: number) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const wM = widthMm / 1000;
    const hM = heightMm / 1000;
    const marginPx = 40;
    const sx = (rect.width - marginPx * 2) / wM;
    const sy = (rect.height - marginPx * 2) / hM;
    const scale = Math.max(1, Math.min(sx, sy));
    (this.camera as any).scale = scale;
    this.camera.center(rect);
  }

  /** Sammel-PDF-Druck via pdf-lib (Multi-Page). */
  /** Exportiert die angegebenen Exportseiten in genau dieser Reihenfolge als EINE PDF. */
  async exportPlansByIds(ids: string[]) {
    const plans = ids.map(id => this.planManager.getById(id)).filter((p): p is NonNullable<typeof p> => !!p);
    if (plans.length === 0) return;
    await this._exportPlansPdf(plans);
  }

  private async _renderPlanAnnotationPng(plan: { id: string }, widthMm: number, heightMm: number): Promise<Uint8Array | null> {
    const sc = this.planScenesById.get(plan.id);
    if (!sc) return null;
    const json = this._serializeOneScene(sc);
    const raster = this.planRaster(plan.id);
    const hasContent = Object.values(json || {}).some(v => Array.isArray(v) && v.length > 0);
    if (!hasContent && !raster) return null;
    const { renderSceneRegionToCanvas } = await import("./SceneRegionRenderer");
    const pxPerMm = 200 / 25.4;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(widthMm * pxPerMm));
    canvas.height = Math.max(1, Math.round(heightMm * pxPerMm));
    const { setExportMode, isExportMode } = await import("@/lib/printExport");
    const labels = this.labelManager.list() as any[];
    const renderVectors = (target: HTMLCanvasElement, onlyLabel: string | null) => {
      const was = isExportMode();
      setExportMode(true);
      try {
        renderSceneRegionToCanvas({
          canvas: target, sceneJson: json,
          labelsJson: (onlyLabel ? labels.map((g) => ({ ...g, visible: g.id === onlyLabel && g.visible !== false })) : labels) as any,
          paperWmm: widthMm, paperHmm: heightMm, scaleDen: 1, centerM: { x: 0, y: 0 },
          background: "rgba(0,0,0,0)",
        });
      } finally { setExportMode(was); }
    };
    if (raster) {
      // Vorhandene Ebenenreihenfolge (hinten → vorne): je Ebene erst Pixel, dann Vektoren.
      const octx = canvas.getContext("2d")!;
      const k = pxPerMm * 1000;
      const rect = { x: -widthMm / 2000, y: -heightMm / 2000, w: widthMm / 1000, h: heightMm / 1000 };
      const tmp = document.createElement("canvas");
      try {
        for (let i = labels.length - 1; i >= 0; i--) {
          const id = labels[i].id;
          if (!raster.visible(id)) continue;
          const ok = await raster.layers.drawRegionAsync(octx, rect, k, (widthMm / 2) * pxPerMm, (heightMm / 2) * pxPerMm, (l) => l === id);
          if (!ok) throw new Error("PIXUNA_RASTER_INCOMPLETE");
          if (hasContent) {
            tmp.width = canvas.width; tmp.height = canvas.height;
            renderVectors(tmp, id);
            octx.drawImage(tmp, 0, 0);
          }
        }
      } catch (err) { canvas.width = 0; throw err; } finally { tmp.width = 0; tmp.height = 0; }
      const b2: Blob | null = await new Promise(res => canvas.toBlob(b => res(b), "image/png"));
      canvas.width = 0;
      return b2 ? new Uint8Array(await b2.arrayBuffer()) : null;
    }
    renderVectors(canvas, null);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(b => res(b), "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }


  private async _exportPlansPdf(sel: import("./PlanManager").Plan[]) {
    try {
      // Der Druckplan wird 1:1 in seiner Papiergröße exportiert. Jede
      // Projektion behält ihren eigenen Maßstab — der Export ist eine reine
      // Ausgabeoperation und verändert das Dokumentmodell NICHT.
      const { exportPlansToPdf, downloadPdfBytes } = await import("./PlanPdfExport");
      const resolveSheet = (sheetId: string): unknown | null => {
        const sc = this.scenesById.get(sheetId);
        if (!sc) return null;
        return this._serializeOneScene(sc);
      };
      // Kein vorheriges Dekodieren aller Pixelkacheln: Ausgaben laden nur ihren
      // Ausschnitt portionsweise (`RasterLayers.drawRegionAsync`).
      const bytes = await exportPlansToPdf(
        sel, resolveSheet, (p, w, h) => this._renderPlanAnnotationPng(p, w, h),
        (p) => p.spreadId ? { key: p.spreadId, rects: this.planManager.spreadRects(p.spreadId) } : null,
        (_p, proj) => this.projectionRaster(proj),
      );

      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}`;
      const fname = sel.length === 1
        ? `${sel[0].name.replace(/[^\w\-]+/g, "_")}_${stamp}.pdf`
        : `Druckplaene_${stamp}.pdf`;
      downloadPdfBytes(bytes, fname);
    } catch (err) {
      if (String((err as Error)?.message).includes("PIXUNA_PATTERN_MISSING")) {
        toast.error("PDF-Export abgebrochen", { description: "Benötigte Flächenmuster fehlen oder konnten nicht geladen werden – es wurde kein unvollständiges PDF erzeugt." });
        return;
      }
      if (String((err as Error)?.message).includes("PIXUNA_RASTER_INCOMPLETE")) {
        toast.error("PDF-Export abgebrochen", { description: "Pixelbereiche konnten nicht vollständig geladen werden – bitte erneut versuchen." });
        return;
      }
      console.error("[exportPlansPdf] PDF-Export fehlgeschlagen:", err);
      alert("PDF-Export fehlgeschlagen. Details in der Browser-Konsole.");
    }
  }

  /** Stellt sicher, dass für jeden Plan eine Annotation-Scene existiert; entfernt verwaiste. */
  private _syncPlanSceneMap() {
    const validIds = new Set(this.planManager.list().map(p => p.id));
    for (const id of validIds) {
      if (!this.planScenesById.has(id)) {
        const sc = new Scene();
        (sc as any)._drawingScaleRef = () => this.drawingScale;
        this.planScenesById.set(id, sc);
      }
    }
    for (const id of [...this.planScenesById.keys()]) {
      if (!validIds.has(id)) {
        this.planScenesById.delete(id);
        this.planOverlayStore.delete(id);
      }
    }
  }

  /** Stellt sicher, dass für jedes Blatt eine Scene existiert; entfernt verwaiste Scenes. */
  private _syncSheetSceneMap() {
    const validIds = new Set(this.sheetManager.list().map(s => s.id));
    // Neue Sheets → leere Scene anlegen.
    for (const id of validIds) {
      if (!this.scenesById.has(id)) {
        const sc = new Scene();
        (sc as any)._drawingScaleRef = () => this.drawingScale;
        this.scenesById.set(id, sc);
      }
    }
    // Verwaiste Scenes löschen (nicht das Default-Sheet).
    for (const id of [...this.scenesById.keys()]) {
      if (!validIds.has(id) && id !== SheetDefaults.defaultSheetId) {
        this.scenesById.delete(id);
      }
    }
    // Falls aktives Blatt gelöscht wurde → auf Default zurück.
    if (!validIds.has(this.activeSheetId)) {
      this.setActiveSheetId(SheetDefaults.defaultSheetId);
    }
  }

  /** Wechselt das aktive Blatt: Scene swappen, UI/Selektion zurücksetzen, Overlay neu binden. */
  setActiveSheetId(id: string) {
    if (!this.sheetManager.getById(id)) return;
    // Aktuellen Camera-State der bisherigen Ansicht (Sheet ODER Plan) sichern.
    this._saveCurrentCameraState();
    // Falls wir gerade im Plan-Modus sind: zurück in den Zeichenmodus.
    if (this.activePlanId) {
      this.activePlanId = null;
      this._applyPlanModeToRenderer();
      this.refreshPlanUI();
    }
    if (id === this.activeSheetId) {
      // Selber Sheet → ggf. gespeicherten Camera-State wiederherstellen.
      const cached = this._camStateBySheetId.get(id);
      if (cached) {
        this.camera.scale = cached.scale;
        this.camera.offsetX = cached.offsetX;
        this.camera.offsetY = cached.offsetY;
      }
      this.refreshSheetUI();
      return;
    }
    // Scene sicherstellen.
    if (!this.scenesById.has(id)) {
      const sc = new Scene();
      (sc as any)._drawingScaleRef = () => this.drawingScale;
      this.scenesById.set(id, sc);
    }
    // Tools/Selektion sauber beenden.
    this.clearSelection();
    this.pointEditMenu.hide();
    this.hub.hide();
    // Aktives Tool zurücksetzen, damit kein halb-fertiger State (z. B. laufende Linie) bleibt.
    try { (this.activeTool as any)?.cancel?.(); } catch { /* noop */ }
    try { (this.activeTool as any)?.reset?.(); } catch { /* noop */ }

    this.activeSheetId = id;
    const next = this.scenesById.get(id)!;
    this.scene = next;
    this.renderer.scene = next;
    this.topology.scene = next;

    this._syncOverlayScenes();
    this.refreshLabelUI();
    this.refreshSheetUI();
    // Camera-State des neuen Sheets wiederherstellen, falls vorhanden.
    const cached = this._camStateBySheetId.get(id);
    if (cached) {
      this.camera.scale = cached.scale;
      this.camera.offsetX = cached.offsetX;
      this.camera.offsetY = cached.offsetY;
    } else {
      // Noch nie geöffnetes Blatt: weiter herausgezoomte Startansicht.
      this.applyDefaultSheetView();
    }
    // History-Snapshot triggern, damit Sheetwechsel nicht als "keine Änderung" gewertet wird.
    this._lastSnapshot = this._snapHistory();
  }

  /** Aktualisiert die Liste der Overlay-Scenes für Renderer & Topology. */
  private _syncOverlayScenes() {
    const overlays: { scene: Scene; mode: "stamp" | "tint"; color: string | null; opacity: number }[] = [];
    const topoOverlays: Scene[] = [];
    for (const sheet of this.sheetManager.list()) {
      if (sheet.id === this.activeSheetId) continue;
      const state = this.sheetOverlayStore.get(sheet.id);
      if (!state || state.mode === "none" || state.opacity <= 0) continue;
      const sc = this.scenesById.get(sheet.id);
      if (!sc) continue;
      overlays.push({
        scene: sc,
        mode: state.mode === "tint" ? "tint" : "stamp",
        color: state.color,
        opacity: state.opacity,
      });
      topoOverlays.push(sc);
    }
    this.renderer.overlayScenes = overlays;
    this.topology.overlayScenes = topoOverlays;
  }

  destroy() {
    try { this._uninstallPropertyEdit?.(); } catch {}
    this._uninstallPropertyEdit = null;
    this._destroyed = true;
    cancelRasterJobs(this, "unmount");
    cancelAnimationFrame(this._rafId);
    if (this._snapshotTimer != null) { clearInterval(this._snapshotTimer); this._snapshotTimer = null; }
    this.input.destroy();
    this.hub.destroy();
    this.textEditor?.destroy();
    this.planController?.destroy();
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    if (this._orientationHandler) {
      window.removeEventListener("orientationchange", this._orientationHandler);
      window.visualViewport?.removeEventListener("resize", this._orientationHandler);
      this._orientationHandler = null;
    }
    if (this._keydownHandler) window.removeEventListener("keydown", this._keydownHandler);
  }
}
