/**
 * Inhalte flacher 3D-Platten (Dokumente, Textfelder, Tabellen) als Bild.
 * Gezeichnet wird mit dem normalen CAD-Renderer (über ProjectionRender) –
 * nur das eine Objekt, im Rahmen seiner vier Ecken. Flüchtig, nie gespeichert.
 */
import type { Vec2 } from "../geometry";
import { ProjectionCamera, drawSheetSnapshotContent, preloadSnapshotDocImages } from "../ProjectionRender";
import type { Texture3D } from "./geometryDerivation";
import { infoBoxTone } from "./infoBoxGeometry";

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

/** Infobox in 3D wie in 2D: Pin mit Info-Symbol bzw. Kürzel, ruhige Farben. */
function renderInfoBoxTexture(box: any): PlaneTextureResult | null {
  if (!box) return null;
  const N = 768;
  const canvas = document.createElement("canvas"); canvas.width = N; canvas.height = N;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  const tone = infoBoxTone(box);
  const task = box.kind === "task";
  // Hintergrund: sanfter Verlauf in der Grundfarbe.
  const bg = ctx.createLinearGradient(0, 0, 0, N);
  bg.addColorStop(0, "#fbfaf7"); bg.addColorStop(1, tone.body);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, N, N);
  // Pin wie in 2D: rund, Ecke unten links spitz (50% 50% 50% 19%).
  const cx = N / 2, cy = task || !box.title ? N / 2 : N * 0.42, R = N * 0.27, rs = R * 0.38;
  const x0 = cx - R, y0 = cy - R, x1 = cx + R, y1 = cy + R;
  const pin = () => {
    ctx.beginPath();
    ctx.moveTo(cx, y0);
    ctx.arcTo(x1, y0, x1, cy, R); ctx.arcTo(x1, y1, cx, y1, R);
    ctx.arcTo(x0, y1, x0, cy, rs); ctx.arcTo(x0, y0, cx, y0, R);
    ctx.closePath();
  };
  ctx.save(); ctx.shadowColor = "rgba(40,36,30,0.18)"; ctx.shadowBlur = 36; ctx.shadowOffsetY = 12;
  pin(); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.restore();
  pin(); ctx.lineWidth = R * 0.12; ctx.strokeStyle = tone.accent; ctx.stroke();
  if (task) {
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, Math.PI * 2); ctx.fillStyle = tone.accent; ctx.fill();
    ctx.lineWidth = R * 0.08; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.font = `700 ${Math.round(R * 0.6)}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(box.authorInitials || "?").slice(0, 3), cx, cy + R * 0.03, R * 1.3);
  } else {
    // Info-Symbol (Kreis mit „i“) wie im 2D-Pin.
    ctx.strokeStyle = "#4a443b"; ctx.fillStyle = "#4a443b"; ctx.lineWidth = R * 0.09; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.56, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.02); ctx.lineTo(cx, cy + R * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - R * 0.27, R * 0.06, 0, Math.PI * 2); ctx.fill();
    if (box.title) {
      ctx.fillStyle = "#3b362f"; ctx.font = `600 ${Math.round(N * 0.07)}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(box.title), cx, N * 0.82, N * 0.86);
    }
  }
  return { canvas, transparent: false, failed: false };
}
