/**
 * Standalone scene (de)serialization — extracted 1:1 from `CadApp` so that
 * the same JSON format can be restored in isolated contexts (Projektmappe-
 * Live-Viewport-Renderer). No dependency on the CAD app runtime.
 */
import { Scene } from "./Scene";

export interface SerializedScene {
  segments?: any[];
  hatches?: any[];
  walls?: any[];
  dimensions?: any[];
  textBoxes?: any[];
  stickerInstances?: any[];
  documents?: any[];
  freeStrokes?: any[];
  rulerGuide?: any;
  doors?: any[];
}

/** Deserialize a scene JSON into the given Scene instance (in-place). */
export function restoreOneScene(scene: Scene, data: SerializedScene | null | undefined): void {
  scene.segments = [];
  scene.hatches = [];
  scene.dimensions = [];
  scene.textBoxes = [];
  scene.stickerInstances = [];
  scene.documents = [];
  scene.freeStrokes = [];
  scene.walls = [];
  scene.doors = [];
  scene.rulerGuide = null;
  scene.markWallsDirty();
  (scene as any)._rebuildSegIdMap?.();
  (scene as any)._rebuildHatchIdMap?.();
  (scene as any)._rebuildDimIdMap?.();
  (scene as any)._rebuildTextIdMap?.();
  (scene as any)._rebuildStickerIdMap?.();
  (scene as any)._rebuildDocIdMap?.();
  (scene as any)._rebuildFreeIdMap?.();
  if (!data) return;

  for (const s of data.freeStrokes || []) {
    const stroke = scene.createFreeStroke(s.points || [], {
      color: s.color, thicknessM: s.thicknessM, opacity: s.opacity,
      lineStyle: s.lineStyle, gapM: s.gapM,
      blobSpacingM: s.blobSpacingM, blobSizeM: s.blobSizeM,
      smoothing: s.smoothing, labelId: s.labelId,
      imageSrc: s.imageSrc || null, imageSizeM: s.imageSizeM,
      imageSpacingM: s.imageSpacingM, imageRotateAlongPath: s.imageRotateAlongPath,
    });
    if (s._stickerEditOwnerId) (stroke as any)._stickerEditOwnerId = s._stickerEditOwnerId;
  }
  if (data.rulerGuide && data.rulerGuide.a && data.rulerGuide.b) {
    scene.rulerGuide = {
      a: { x: data.rulerGuide.a.x, y: data.rulerGuide.a.y },
      b: { x: data.rulerGuide.b.x, y: data.rulerGuide.b.y },
    };
  }
  for (const s of data.segments || []) {
    const seg = scene.createSegment(s.a, s.b, {
      color: s.color, thicknessM: s.thicknessM, labelId: s.labelId,
      arrowStart: !!s.arrowStart, arrowEnd: !!s.arrowEnd,
      arrowScale: typeof s.arrowScale === "number" ? s.arrowScale : 1,
    });
    if (s._stickerEditOwnerId) (seg as any)._stickerEditOwnerId = s._stickerEditOwnerId;
  }
  for (const h of data.hatches || []) {
    const hatch = scene.createHatch(h.points, {
      fillColor: h.fillColor, strokeColor: h.strokeColor,
      fillAlphaPct: h.fillAlphaPct, strokeWidthPx: h.strokeWidthPx,
      labelId: h.labelId, areaLabel: h.areaLabel,
      holes: h.holes || [],
    });
    if (h._stickerEditOwnerId) (hatch as any)._stickerEditOwnerId = h._stickerEditOwnerId;
  }
  for (const w of data.walls || []) {
    const wall = scene.createWall({
      kind: w.kind === "inner" ? "inner" : "outer",
      thicknessM: w.thicknessM,
      referenceSide: w.referenceSide === "inner" ? "inner" : w.referenceSide === "center" ? "center" : "outer",
      corners: w.corners || [],
      hiddenCornerIndices: Array.isArray(w.hiddenCornerIndices) ? w.hiddenCornerIndices : [],
      cornerAnchors: Array.isArray(w.cornerAnchors) ? w.cornerAnchors : undefined,
      customName: w.customName || "",
      color: w.color,
      fillColor: w.fillColor,
      labelId: w.labelId,
      priority: w.priority,
    });
    if (w.id) (wall as any).id = w.id;
    if (w._stickerEditOwnerId) (wall as any)._stickerEditOwnerId = w._stickerEditOwnerId;
  }
  for (const d of data.dimensions || []) {
    const dim = scene.createDimension(d.p1, d.p2, d.placementPoint, d.mode, d.refDir, {
      textColor: d.textColor, textSizePx: d.textSizePx, lineColor: d.lineColor,
      decimals: d.decimals, tickLengthM: d.tickLengthM, showExtensions: d.showExtensions,
      useFreeText: d.useFreeText, freeText: d.freeText,
      textBgEnabled: d.textBgEnabled, textBgColor: d.textBgColor, textBgAlpha: d.textBgAlpha,
      extensionStyle: d.extensionStyle, extensionColor: d.extensionColor, extensionAlpha: d.extensionAlpha,
      freeTextBold: d.freeTextBold, freeTextItalic: d.freeTextItalic, freeTextColor: d.freeTextColor,
      labelId: d.labelId, mirror: d.mirror,
    }, d.doorRefId || null);
    if (typeof d._textSideBase === "number") (dim as any)._textSideBase = d._textSideBase;
    if (d._stickerEditOwnerId) (dim as any)._stickerEditOwnerId = d._stickerEditOwnerId;
  }
  for (const t of data.textBoxes || []) {
    const box = scene.createTextBox(
      t.center, t.widthM, t.heightM,
      { ...(t.style || {}), labelId: t.labelId },
      t.html || "",
      t.rotationRad || 0,
    );
    if (t._stickerEditOwnerId) (box as any)._stickerEditOwnerId = t._stickerEditOwnerId;
  }
  if (Array.isArray(data.stickerInstances)) {
    for (const si of data.stickerInstances) {
      const inst = scene.createStickerInstance({
        defId: si.defId, name: si.name, items: si.items,
        position: si.position, rotationRad: si.rotationRad || 0,
        scale: si.scale || 1, labelId: si.labelId,
      });
      if (si.id) (inst as any).id = si.id;
    }
    (scene as any)._rebuildStickerIdMap?.();
  }
  for (const d of data.documents || []) {
    const doc = scene.createDocument({
      name: d.name, kind: d.kind, src: d.src, pageIndex: d.pageIndex,
      position: d.position, widthM: d.widthM, heightM: d.heightM, rotationRad: d.rotationRad,
      pixelWidth: d.pixelWidth, pixelHeight: d.pixelHeight, labelId: d.labelId,
      eraseMaskDataUrl: d.eraseMaskDataUrl || null,
      pdfSourceB64: d.pdfSourceB64 || null,
      guideEdges: d.guideEdges || undefined,
      cropM: d.cropM || undefined,
      opacity: typeof d.opacity === "number" ? d.opacity : undefined,
      filters: Array.isArray(d.filters) ? d.filters : undefined,
      activeFilterId: d.activeFilterId || null,
      bgRemoval: d.bgRemoval || undefined,
      anchors: Array.isArray(d.anchors) ? d.anchors : undefined,
    });
    if (d.id) (doc as any).id = d.id;
  }
  (scene as any)._rebuildDocIdMap?.();
  for (const d of data.doors || []) {
    const door = scene.createDoor({
      wallId: d.wallId, posM: d.posM, widthM: d.widthM, heightM: d.heightM,
      breakHeightM: d.breakHeightM,
      breakHeightVisible: !!d.breakHeightVisible,
      kind: d.kind,
      side: d.side, hand: d.hand, edge: d.edge, color: d.color,
      jambEnabled: d.jambEnabled, jambColor: d.jambColor, jambLenM: d.jambLenM, jambThickM: d.jambThickM,
      sashEnabled: d.sashEnabled, glassColor: d.glassColor, glassThickM: d.glassThickM, glassFillColor: d.glassFillColor,
      labelId: d.labelId,
    });
    if (d.id) (door as any).id = d.id;
  }
}
