/**
 * SceneRegionRenderer — rendert eine gespeicherte CAD-Szene (per-Sheet JSON)
 * in ein Offscreen-Canvas, wobei der sichtbare Modellausschnitt **mathematisch
 * exakt** aus Papier-Millimetern und Nennmaßstab abgeleitet wird.
 *
 * Verwendung (Projektmappe-Viewport):
 *   renderSceneRegionToCanvas({
 *     canvas,
 *     sceneJson,          // aus CadApp.getSheetSceneJson(sheetId)
 *     labelsJson,         // aus CadApp.getLabelsJson()
 *     paperWmm, paperHmm, // Rahmengröße in Papier-Millimetern
 *     scaleDen,           // 100 für 1:100
 *     centerM,            // Modell-Mittelpunkt in Metern
 *     rotationDeg,        // Viewport-Rotation
 *   });
 *
 * Kernformel:
 *   modelWmm = paperWmm * scaleDen   →  modelWm = modelWmm / 1000
 *   camera.scale (px/m) = canvas.width / modelWm
 *
 * Dadurch entspricht 1 mm Papier auf dem Bildschirm-Canvas (bzw. später im
 * PDF-Export) exakt `scaleDen` mm Modell — unabhängig von der gewählten
 * Bildschirm-Pixelauflösung.
 */
import { Camera } from "./Camera";
import { Scene } from "./Scene";
import { Renderer } from "./Renderer";
import { LabelManager, LabelGroup } from "./LabelManager";
import { restoreOneScene } from "./sceneSerde";

export interface RenderRegionOptions {
  canvas: HTMLCanvasElement;
  sceneJson: any | string | null | undefined;
  labelsJson?: LabelGroup[] | null;
  paperWmm: number;
  paperHmm: number;
  scaleDen: number;
  centerM?: { x: number; y: number };
  rotationDeg?: number;
  /** CSS-Hintergrund (Standard: weiß). */
  background?: string;
}

export function renderSceneRegionToCanvas(opts: RenderRegionOptions): void {
  const {
    canvas,
    sceneJson,
    labelsJson,
    paperWmm,
    paperHmm,
    scaleDen,
    centerM = { x: 0, y: 0 },
    rotationDeg = 0,
    background = "#ffffff",
  } = opts;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const pxW = canvas.width;
  const pxH = canvas.height;

  // Weißer Hintergrund immer — Papier-Space ist per Definition weiß.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, pxW, pxH);
  ctx.restore();

  // Sichtbarer Modellausschnitt (in Metern), rein aus Papier-mm × Maßstab.
  const modelWm = (paperWmm * scaleDen) / 1000;
  if (modelWm <= 0 || pxW <= 0) return;

  // px/m so, dass paperWmm exakt in canvas.width passt.
  const pxPerM = pxW / modelWm;

  // Szene deserialisieren.
  const data = typeof sceneJson === "string"
    ? (() => { try { return JSON.parse(sceneJson); } catch { return null; } })()
    : sceneJson;

  const scene = new Scene();
  const labels = new LabelManager();
  if (Array.isArray(labelsJson) && labelsJson.length > 0) {
    labels.groups = labelsJson.map((g) => ({
      id: g.id, name: g.name, locked: !!g.locked, visible: g.visible !== false,
    }));
  }

  try {
    restoreOneScene(scene, data);
  } catch (err) {
    console.warn("[SceneRegionRenderer] restore failed:", err);
    return;
  }

  const camera = new Camera();
  camera.scale = pxPerM;
  // Zentrum des sichtbaren Modellbereichs → Mitte des Canvas.
  camera.offsetX = pxW / 2 - centerM.x * pxPerM;
  camera.offsetY = pxH / 2 - centerM.y * pxPerM;

  const renderer = new Renderer(ctx, camera, scene, labels);
  renderer.setViewport(pxW, pxH);
  renderer.gridSettings = { ...renderer.gridSettings, enabled: false };
  renderer.backgroundColor = background;
  renderer.referencePxPerM = pxPerM;

  // Rotation um den Canvas-Mittelpunkt (in Bildschirm-Pixel-Koordinaten).
  if (rotationDeg && Math.abs(rotationDeg) > 1e-6) {
    ctx.save();
    ctx.translate(pxW / 2, pxH / 2);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.translate(-pxW / 2, -pxH / 2);
    try { renderer.render(); } finally { ctx.restore(); }
  } else {
    renderer.render();
  }
}
