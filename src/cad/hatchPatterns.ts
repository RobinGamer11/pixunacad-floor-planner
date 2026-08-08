/**
 * hatchPatterns.ts — typische 2D-CAD-Schraffurmuster für Flächen.
 *
 * Jedes Muster wird in eine Kachel (Unit-Quadrat 0..1) gezeichnet und als
 * CanvasPattern über die geclippte Fläche gelegt. Skalierung, Drehung und
 * Scherung (Verzerrung) werden per DOMMatrix auf das Pattern angewendet.
 */

export type HatchPatternId =
  | "mauerwerk"
  | "stahlbeton"
  | "holz"
  | "kies"
  | "sand"
  | "ziegelverband"
  | "holzdielen"
  | "erdreich"
  | "daemmung_weich"
  | "daemmung_hart"
  | "xps"
  | "abdichtung";

export const HATCH_PATTERNS: { id: HatchPatternId; label: string }[] = [
  { id: "mauerwerk", label: "Mauerwerk" },
  { id: "stahlbeton", label: "Stahlbeton" },
  { id: "holz", label: "Holz" },
  { id: "kies", label: "Kies" },
  { id: "sand", label: "Sand" },
  { id: "ziegelverband", label: "Ziegelverband" },
  { id: "holzdielen", label: "Holzdielen" },
  { id: "erdreich", label: "Erdreich" },
  { id: "daemmung_weich", label: "Wärmedämmung weich" },
  { id: "daemmung_hart", label: "Wärmedämmung hart" },
  { id: "xps", label: "XPS-Dämmung" },
  { id: "abdichtung", label: "Abdichtung" },
];

/** Basis-Kachelgröße in Metern (bei patternScale = 1). */
export const PATTERN_BASE_TILE_M = 0.1 / 15;


function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Zeichnet ein Muster in eine Kachel der Kantenlänge `s` (px). */
function drawTile(ctx: CanvasRenderingContext2D, id: HatchPatternId, s: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";

  switch (id) {
    case "mauerwerk": {
      // 45°-Diagonalen (kachelbar über die Ecken hinweg)
      for (const o of [-1, 0, 1]) line(ctx, o * s, s, (o + 1) * s, 0);
      break;
    }
    case "stahlbeton": {
      // Durchgezogene 45°-Linien, dazwischen jeweils eine gestrichelte
      for (const o of [-1, 0, 1]) line(ctx, o * s, s, (o + 1) * s, 0);
      ctx.save();
      ctx.setLineDash([s * 0.09, s * 0.07]);
      for (const o of [-1, 0, 1]) line(ctx, o * s, s * 0.5, (o + 0.5) * s, 0);
      for (const o of [-1, 0, 1]) line(ctx, (o + 0.5) * s, s, (o + 1) * s, s * 0.5);
      ctx.restore();
      break;
    }
    case "holz": {
      // Maserung: leicht wellige, diagonal verlaufende Linien
      const steps = 24;
      for (let b = -2; b <= 4; b += 0.5) {
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const x = (i / steps) * s;
          const y = b * s - x + Math.sin((x / s) * Math.PI * 2) * s * 0.05;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }

    case "kies": {
      const blobs: [number, number, number][] = [
        [0.2, 0.22, 0.11], [0.62, 0.18, 0.08], [0.85, 0.45, 0.1],
        [0.35, 0.55, 0.09], [0.68, 0.72, 0.12], [0.13, 0.82, 0.08],
      ];
      for (const [x, y, r] of blobs) {
        ctx.beginPath();
        ctx.ellipse(x * s, y * s, r * s, r * s * 0.78, (x + y) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "sand": {
      const pts: [number, number][] = [
        [0.12, 0.18], [0.42, 0.1], [0.72, 0.24], [0.9, 0.6],
        [0.28, 0.44], [0.58, 0.52], [0.18, 0.76], [0.5, 0.86], [0.8, 0.82],
      ];
      for (const [x, y] of pts) dot(ctx, x * s, y * s, Math.max(lw * 0.6, s * 0.018));
      break;
    }
    case "ziegelverband": {
      const h = s / 2;
      line(ctx, 0, 0, s, 0);
      line(ctx, 0, h, s, h);
      line(ctx, 0, s, s, s);
      line(ctx, 0, 0, 0, h);       // untere Reihe: Stoßfuge links
      line(ctx, h, h, h, s);       // obere Reihe: Stoßfuge versetzt
      break;
    }
    case "holzdielen": {
      // Enge, durchgezogene, vertikale Dielenfugen
      for (let i = 0; i < 5; i++) line(ctx, (i / 5) * s, 0, (i / 5) * s, s);
      break;
    }
    case "erdreich": {
      // Diagonale Bänder mit senkrechten Sprossen (klassische Erdreich-Schraffur)
      const d = s;              // Bandraster (Y-Achsenabschnitt)
      const bw = d * 0.42;      // Bandbreite
      for (let b = -2; b <= 4; b += 1) {
        const base = b * d;
        line(ctx, -s, base + s, s * 2, base - s * 2);
        line(ctx, -s, base + bw + s, s * 2, base + bw - s * 2);
        ctx.save();
        ctx.lineWidth = lw * 0.8;
        for (let x = -s; x <= s * 2; x += bw * 0.75) {
          line(ctx, x, base - x, x + bw / 2, base - x + bw / 2);
        }
        ctx.restore();
      }
      break;
    }
    case "daemmung_weich": {
      // Weiche Dämmung: aneinandergereihte, bauchige Schlaufen
      const w = s / 2;
      for (let i = -1; i <= 2; i++) {
        const cx = i * w;
        ctx.beginPath();
        ctx.moveTo(cx, s);
        ctx.bezierCurveTo(cx + w * 0.02, s * 0.4, cx + w * 0.12, 0, cx + w * 0.5, 0);
        ctx.bezierCurveTo(cx + w * 0.88, 0, cx + w * 0.98, s * 0.4, cx + w, s);
        ctx.stroke();
      }
      break;
    }

    case "daemmung_hart": {
      // Harte Dämmung: Zickzacklinien
      const rows = 3;
      const zig = s / 6;
      for (let r = 0; r <= rows; r++) {
        const y0 = (r / rows) * s;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const x = i * zig;
          const y = y0 + (i % 2 === 0 ? 0 : zig * 0.8);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case "xps": {
      // Enges Raster aus aneinanderliegenden Vierecken
      const n = 4;
      for (let i = 0; i <= n; i++) {
        const p = (i / n) * s;
        line(ctx, p, 0, p, s);
        line(ctx, 0, p, s, p);
      }
      break;
    }
    case "abdichtung": {
      // Abwechselnd weißes und schwarzes Rechteck
      const h = s * 0.4;
      const y = (s - h) / 2;
      ctx.fillRect(0, y, s * 0.5, h);
      ctx.save();
      ctx.lineWidth = lw * 0.8;
      ctx.strokeRect(s * 0.5, y, s * 0.5, h);
      ctx.restore();
      break;
    }
  }

}

const tileCache = new Map<string, HTMLCanvasElement>();

export function getPatternTile(id: HatchPatternId, sizePx: number, color: string, lineWidthPx: number): HTMLCanvasElement {
  const s = Math.max(6, Math.round(sizePx));
  const lw = Math.max(0.4, lineWidthPx);
  const key = `${id}|${s}|${color}|${lw.toFixed(2)}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = s; c.height = s;
  const ctx = c.getContext("2d")!;
  drawTile(ctx, id, s, color, lw);
  if (tileCache.size > 120) tileCache.clear();
  tileCache.set(key, c);
  return c;
}

export interface HatchPatternOptions {
  patternId: HatchPatternId;
  /** Skalierung der Kachel (1 = Basisgröße). */
  scale: number;
  /** Drehung des Musters in Grad. */
  angleDeg: number;
  /** Scherung/Verzerrung in Grad (-60..60). */
  skewDeg: number;
  /** Längung: Streckung in Y-Richtung (1 = quadratisch). */
  stretch?: number;
  color: string;
  alpha: number;
  lineWidthPx: number;
}


/**
 * Füllt den aktuellen (bereits geclippten) Bereich mit dem Muster.
 * `originScreen` ist der Bildschirmpunkt des Welt-Ursprungs, `pxPerMeter`
 * der aktuelle Kameramaßstab. `bbox` ist das Bildschirm-Rechteck der Fläche.
 */
export function fillWithHatchPattern(
  ctx: CanvasRenderingContext2D,
  bbox: { x: number; y: number; w: number; h: number },
  originScreen: { x: number; y: number },
  pxPerMeter: number,
  opt: HatchPatternOptions,
): void {
  // Kachelgröße rein in CAD-Einheiten (Meter) -> Bildschirm; zoom-konsistent.
  const tilePx = PATTERN_BASE_TILE_M * Math.max(0.02, opt.scale) * pxPerMeter;
  if (!(tilePx > 0.5) || !Number.isFinite(tilePx)) return;
  const stretch = Math.max(0.1, Math.min(10, opt.stretch ?? 1));
  // Feste Render-Auflösung der Kachel: kein Umschalten/Runden beim Zoomen.
  const RENDER_PX = 128;
  const k = tilePx / RENDER_PX;
  // Linienstärke im Kachelraum so wählen, dass sie nach Skalierung
  // konstante Bildschirmstärke ergibt.
  const kAvg = k * Math.sqrt(stretch);
  const lwRaw = Math.max(0.35, Math.min(RENDER_PX / 12, opt.lineWidthPx / Math.max(1e-6, kAvg)));
  const lwTile = Math.round(lwRaw * 4) / 4; // quantisiert -> stabiler Kachel-Cache
  const tile = getPatternTile(opt.patternId, RENDER_PX, opt.color, lwTile);
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  try {
    const m = new DOMMatrix()
      .translateSelf(originScreen.x, originScreen.y)
      .rotateSelf(opt.angleDeg || 0)
      .skewXSelf(Math.max(-70, Math.min(70, opt.skewDeg || 0)))
      .scaleSelf(k, k * stretch);
    (pat as any).setTransform?.(m);
  } catch { /* ältere Engine: ohne Transform zeichnen */ }

  ctx.save();
  ctx.globalAlpha = opt.alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  ctx.restore();
}
