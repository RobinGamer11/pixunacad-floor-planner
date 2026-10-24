/**
 * Inhalte flacher 3D-Platten (Dokumente, Textfelder, Tabellen) als Bild.
 * Gezeichnet wird mit dem normalen CAD-Renderer (über ProjectionRender) –
 * nur das eine Objekt, im Rahmen seiner vier Ecken. Flüchtig, nie gespeichert.
 */
import type { Vec2 } from "../geometry";
import { ProjectionCamera, drawSheetSnapshotContent, preloadSnapshotDocImages } from "../ProjectionRender";
import type { Texture3D } from "./geometryDerivation";

const MAX_PX = 1024;
const MAX_PX_PER_M = 600;

export interface PlaneTextureResult { canvas: HTMLCanvasElement; transparent: boolean; failed: boolean }

/** Snapshot mit genau einem Objekt einer Liste. */
function singleObjectSnapshot(sheetSnap: any, list: string, id: string): any | null {
  const src = (sheetSnap?.[list] || []) as any[];
  const o = src.find((x) => x?.id === id);
  if (!o) return null;
  const out: any = {};
  for (const k of Object.keys(sheetSnap)) out[k] = Array.isArray(sheetSnap[k]) ? [] : sheetSnap[k];
  out[list] = [o];
  return out;
}

function errorCanvas(w: number, h: number, msg: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(64, w); c.height = Math.max(64, h);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#f3eee4"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#c0392b"; ctx.lineWidth = Math.max(2, c.width / 120);
  ctx.setLineDash([c.width / 30, c.width / 40]);
  ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, c.width - 2 * ctx.lineWidth, c.height - 2 * ctx.lineWidth);
  ctx.setLineDash([]);
  ctx.fillStyle = "#c0392b";
  ctx.font = `600 ${Math.max(12, Math.round(Math.min(c.width, c.height) / 12))}px sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(msg, c.width / 2, c.height / 2, c.width * 0.9);
  return c;
}

/**
 * Zeichnet das Objekt in eine Canvas, deren Ränder genau den Ecken
 * (oben-links, oben-rechts, unten-rechts, unten-links) entsprechen.
 */
export async function renderPlaneTexture(
  sheetSnap: any, list: Texture3D["list"], id: string, corners: Vec2[], definitions: any[],
): Promise<PlaneTextureResult | null> {
  if (list === "infoBoxes") return renderInfoBoxTexture(sheetSnap?.infoBoxes?.find((b: any) => b.id === id));
  if (corners.length !== 4) return null;
  const [tl, tr, , bl] = corners;
  const ux = tr.x - tl.x, uy = tr.y - tl.y, vx = bl.x - tl.x, vy = bl.y - tl.y;
  const wM = Math.hypot(ux, uy), hM = Math.hypot(vx, vy);
  if (!(wM > 1e-6 && hM > 1e-6)) return null;
  const s = Math.min(MAX_PX_PER_M, MAX_PX / Math.max(wM, hM));
  const W = Math.max(2, Math.round(wM * s)), H = Math.max(2, Math.round(hM * s));
  const snap = singleObjectSnapshot(sheetSnap, list, id);
  if (!snap) return null;

  let imgs: Map<string, HTMLImageElement> | undefined;
  if (list === "documents") {
    const doc = snap.documents[0];
    const srcs = doc?.src ? [String(doc.src)] : [];
    try { imgs = await preloadSnapshotDocImages({ documents: [{ ...doc, pdfSourceB64: undefined }] }); } catch { imgs = new Map(); }
    if (!srcs.length || !srcs.every((x) => imgs?.has(x))) {
      return { canvas: errorCanvas(W, H, "Inhalt konnte nicht geladen werden"), transparent: false, failed: true };
    }
  }

  // Welt → Pixel relativ zur oberen linken Ecke (Achsen der Welt) …
  const cam = new ProjectionCamera(s, -tl.x * s, -tl.y * s);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // … dann in die Achsen des Objekts drehen (inkl. Spiegelung).
  const ax = ux / wM, ay = uy / wM, bx = vx / hM, by = vy / hM;
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-12) return null;
  ctx.setTransform(by/det, -bx/det, -ay/det, ax/det, 0, 0);
  drawSheetSnapshotContent(ctx, snap, cam, definitions, imgs);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const transparent = list === "documents" || list === "libraryInstances";
  return { canvas, transparent, failed: false };
}

function renderInfoBoxTexture(box: any): PlaneTextureResult | null {
  if (!box) return null;
  const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 768;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  ctx.fillStyle = "#f8f9fa"; ctx.fillRect(0,0,768,768);
  ctx.fillStyle = box.kind === "task" ? (box.status === "done" ? "#23875b" : "#b18b49") : "#343b44";
  ctx.fillRect(0,0,768,100); ctx.fillStyle = "#ffffff"; ctx.font = "600 32px sans-serif";
  ctx.fillText(box.kind === "task" ? (box.status === "done" ? "Erledigt" : "Aufgabe · Offen") : "Information",32,64);
  ctx.fillStyle = "#202830";
  let y=156;
  const write = (text: string, bold: boolean) => {
    ctx.font = `${bold ? "600" : "400"} ${bold ? 36 : 28}px sans-serif`;
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (ctx.measureText(line+word).width > 690 && line) { ctx.fillText(line,32,y,704); y+=42; line=""; }
        line+=word+" ";
        if (y>708) break;
      }
      if (y<=708) ctx.fillText(line,32,y,704);
      y+=48;
    }
  };
  write(String(box.title || "Infobox"),true); y+=16; write(String(box.desc || ""),false);
  return {canvas,transparent:false,failed:false};
}
