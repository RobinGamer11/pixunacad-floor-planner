/**
 * hatchPatterns.ts — typische 2D-CAD-Schraffurmuster für Flächen.
 *
 * Jedes Muster wird in eine Kachel (Unit-Quadrat 0..1) gezeichnet und als
 * CanvasPattern über die geclippte Fläche gelegt. Skalierung, Drehung und
 * Scherung (Verzerrung) werden per DOMMatrix auf das Pattern angewendet.
 */

import { getCustomPatternImage, isCustomPatternId } from "./customHatchPatterns";
import { getImagePattern, isImagePatternId } from "./builtinImagePatterns";

export type BuiltinHatchPatternId =
  | "mauerwerk"
  | "stahlbeton"
  | "holz"
  | "kies"
  | "kies_02"
  | "pflasterung_01"
  | "naturstein"
  | "sand"
  | "ziegelverband"
  | "holzdielen"
  | "holzdielen_01"
  | "erdreich"
  | "daemmung_weich"
  | "daemmung_hart"
  | "waermedaemmung"
  | "xps"
  | "abdichtung"
  | "abdichtung_01";

/** Eingebaute IDs plus benutzerdefinierte Muster (`custom:...`). */
export type HatchPatternId = BuiltinHatchPatternId | (string & {});

export const HATCH_PATTERNS: { id: BuiltinHatchPatternId; label: string }[] = [
  { id: "mauerwerk", label: "Mauerwerk" },
  { id: "stahlbeton", label: "Stahlbeton" },
  { id: "holz", label: "Holz" },
  { id: "sand", label: "Sand" },
  { id: "kies", label: "Kies 01" },
  { id: "kies_02", label: "Kies 02" },
  { id: "pflasterung_01", label: "Pflasterung 01" },
  { id: "naturstein", label: "Naturstein" },
  { id: "ziegelverband", label: "Ziegelverband" },
  { id: "holzdielen_01", label: "Holzdielen 01" },
  { id: "holzdielen", label: "Holzdielen 02" },
  { id: "erdreich", label: "Erdreich" },
  { id: "daemmung_weich", label: "Wärmedämmung" },
  { id: "xps", label: "XPS-Dämmung" },
  { id: "daemmung_hart", label: "Wasser" },
  { id: "waermedaemmung", label: "Muster 01" },
  { id: "abdichtung_01", label: "Abdichtung 01" },
  { id: "abdichtung", label: "Abdichtung 02" },
];

/** Vorgabe-Skalierung je Muster (Bildmuster brauchen deutlich mehr). */
const DEFAULT_PATTERN_SCALE: Record<string, number> = {
  kies_02: 250,
  pflasterung_01: 250,
  naturstein: 250,
  holzdielen_01: 250,
  daemmung_weich: 250,
  abdichtung_01: 250,
  holzdielen: 100,
};

/** Standard-Skalierung eines Musters (Fallback 60). */
export function defaultPatternScale(id: string | undefined | null): number {
  if (!id) return 60;
  return DEFAULT_PATTERN_SCALE[id] ?? 60;
}


/**
 * Auswählbare Baustoff-Muster des Wandwerkzeugs (eigene Bezeichnungen —
 * das Schraffurwerkzeug bleibt davon unberührt).
 */
export const WALL_PATTERNS: { id: BuiltinHatchPatternId; label: string }[] = [
  { id: "mauerwerk", label: "Mauerwerk" },
  { id: "stahlbeton", label: "Stahlbeton" },
  { id: "holz", label: "Holz" },
  { id: "waermedaemmung", label: "Wärmedämmung" },
  { id: "xps", label: "XPS-Dämmung" },
  { id: "abdichtung", label: "Abdichtung" },
];

/**
 * Migration alter Wand-Muster-IDs. "daemmung_weich" wird kontrolliert auf das
 * neue vektorielle Wandmuster "waermedaemmung" abgebildet.
 */
export function normalizeWallPatternId(id: string | undefined | null): string {
  if (!id) return "none";
  if (id === "daemmung_weich") return "waermedaemmung";
  return id;
}

/** Feste Grunddrehung eines Musters relativ zur Wandrichtung (Grad). */
export function patternBaseAngleDeg(id: string | undefined | null): number {
  if (id === "xps") return 45;
  if (id === "daemmung_hart") return 45; // Wasser: um 45° gedreht
  return 0;
}


/** Muster, die in Wänden immer der Wandachse folgen (unabhängig von der Option). */
export function patternAlwaysFollowsWall(id: string | undefined | null): boolean {
  return id === "xps" || id === "abdichtung";
}

/** Muster, die im Wandrenderer als wandgebundene Vektorgeometrie entstehen. */
export function isWallBoundPattern(id: string | undefined | null): boolean {
  return id === "waermedaemmung";
}

/** Basis-Kachelgröße in Metern (bei patternScale = 1). */
export const PATTERN_BASE_TILE_M = 0.1 / 15;

/** Deterministischer Zufallsgenerator (stabil über Zoom/Export hinweg). */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t * 1664525 + 1013904223) >>> 0;
    return t / 4294967296;
  };
}

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

/** Geschlossene, leicht unregelmäßige Rundform (Stein/Kiesel), kachelbar. */
function blob(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number,
  rot: number, rand: () => number, wobble = 0.18, corners = 9,
) {
  const pts: [number, number][] = [];
  for (let i = 0; i < corners; i++) {
    const a = (i / corners) * Math.PI * 2;
    const k = 1 + (rand() - 0.5) * 2 * wobble;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (i === 0) ctx.moveTo(m[0], m[1]);
    const c = pts[(i + 1) % pts.length];
    const n = pts[(i + 2) % pts.length];
    ctx.quadraticCurveTo(c[0], c[1], (c[0] + n[0]) / 2, (c[1] + n[1]) / 2);
  }
  ctx.closePath();
  ctx.stroke();
}

/** Zeichnet ein Muster in eine Kachel der Kantenlänge `s` (px). */
function drawTile(ctx: CanvasRenderingContext2D, id: BuiltinHatchPatternId, s: number, color: string, lw: number) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

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
    case "kies_02": {
      // Dicht gepackte Kiesel unterschiedlicher Größe (nahtlos gekachelt)
      const rand = rng(20260829);
      ctx.lineWidth = lw * 0.9;
      const n = 5;
      const cell = s / n;
      const draw = (cx: number, cy: number, rx: number, ry: number, rot: number, r: () => number) => {
        for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
          if (cx + dx < -rx * 1.6 || cx + dx > s + rx * 1.6) continue;
          if (cy + dy < -ry * 1.6 || cy + dy > s + ry * 1.6) continue;
          blob(ctx, cx + dx, cy + dy, rx, ry, rot, rng(Math.floor(cx * 91 + cy * 37 + rx * 13)), 0.16, 9);
        }
        void r;
      };
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const cx = (i + 0.5 + (rand() - 0.5) * 0.45) * cell;
          const cy = (j + 0.5 + (rand() - 0.5) * 0.45) * cell;
          const rx = cell * (0.30 + rand() * 0.22);
          const ry = rx * (0.72 + rand() * 0.28);
          draw(cx, cy, rx, ry, rand() * Math.PI, rand);
        }
      }
      // Kleine Füllkiesel in den Lücken
      ctx.lineWidth = lw * 0.7;
      for (let k = 0; k < 14; k++) {
        const cx = rand() * s;
        const cy = rand() * s;
        const rx = cell * (0.08 + rand() * 0.08);
        for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
          blob(ctx, cx + dx, cy + dy, rx, rx * 0.85, rand() * Math.PI, rng(k * 7919 + 13), 0.2, 7);
        }
      }
      break;
    }
    case "pflasterung_01": {
      // Pflasterverband: versetzte Rechtecke unterschiedlicher Größe
      ctx.lineWidth = lw * 1.6;
      const h = s / 4;
      const rows: [number, number][][] = [
        [[0, 0.55], [0.55, 0.45]],
        [[0, 0.3], [0.3, 0.4], [0.7, 0.3]],
        [[0, 0.45], [0.45, 0.55]],
        [[0, 0.35], [0.35, 0.3], [0.65, 0.35]],
      ];
      for (let r = 0; r < 4; r++) {
        const y = r * h;
        line(ctx, 0, y, s, y);
        for (const [x0] of rows[r]) {
          if (x0 <= 0) continue;
          line(ctx, x0 * s, y, x0 * s, y + h);
        }
        line(ctx, 0, y, 0, y + h);
      }
      line(ctx, 0, s, s, s);
      // feine Kratzer als Steintextur
      ctx.save();
      ctx.lineWidth = lw * 0.5;
      const rand = rng(7717);
      for (let k = 0; k < 12; k++) {
        const x = rand() * s, y = rand() * s, l = s * 0.05;
        line(ctx, x, y, x + l, y - l);
      }
      ctx.restore();
      break;
    }
    case "naturstein": {
      // Bruchsteinmauerwerk: große, kantige Steine mit kräftiger Fuge
      const rand = rng(48271);
      ctx.lineWidth = lw * 2.2;
      const n = 3;
      const cell = s / n;
      const stone = (cx: number, cy: number, rx: number, ry: number, seed: number) => {
        const r = rng(seed);
        const corners = 6 + Math.floor(r() * 3);
        const pts: [number, number][] = [];
        for (let i = 0; i < corners; i++) {
          const a = (i / corners) * Math.PI * 2 + (r() - 0.5) * 0.35;
          const k = 0.88 + r() * 0.24;
          pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.stroke();
      };
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const cx = (i + 0.5 + (rand() - 0.5) * 0.22) * cell;
          const cy = (j + 0.5 + (rand() - 0.5) * 0.22) * cell;
          const rx = cell * (0.40 + rand() * 0.07);
          const ry = cell * (0.37 + rand() * 0.08);
          for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
            stone(cx + dx, cy + dy, rx, ry, i * 131 + j * 17 + 3);
          }
        }
      }
      // kleine Zwickelsteine in den Fugenkreuzen
      ctx.lineWidth = lw * 1.3;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const cx = (i + 1) * cell + (rand() - 0.5) * cell * 0.15;
          const cy = (j + 1) * cell + (rand() - 0.5) * cell * 0.15;
          const r0 = cell * 0.11;
          for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
            stone(cx + dx, cy + dy, r0, r0 * 0.85, i * 77 + j * 191 + 9);
          }
        }
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
    case "holzdielen_01": {
      // Liegende Dielen mit versetzten Stößen und feiner Maserung
      const rows = 4;
      const h = s / rows;
      const joints = [0.62, 0.18, 0.8, 0.4];
      const rand = rng(90210);
      for (let r = 0; r < rows; r++) {
        const y = r * h;
        ctx.lineWidth = lw * 1.3;
        line(ctx, 0, y, s, y);
        line(ctx, joints[r] * s, y, joints[r] * s, y + h);
        // Maserung
        ctx.lineWidth = lw * 0.45;
        for (let g = 1; g <= 5; g++) {
          const gy = y + (g / 6) * h;
          const amp = h * 0.06 * (0.4 + rand());
          const ph = rand() * Math.PI * 2;
          ctx.beginPath();
          for (let i = 0; i <= 32; i++) {
            const x = (i / 32) * s;
            const yy = gy + Math.sin((x / s) * Math.PI * 4 + ph) * amp;
            if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
        // Astauge
        ctx.lineWidth = lw * 0.45;
        const kx = (0.2 + rand() * 0.6) * s;
        const ky = y + h * 0.5;
        for (let e = 1; e <= 3; e++) {
          ctx.beginPath();
          ctx.ellipse(kx, ky, h * 0.06 * e, h * 0.03 * e, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.lineWidth = lw * 1.3;
      line(ctx, 0, s, s, s);
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
        for (let x = -s; x <= s * 2; x += bw * 0.45) {
          line(ctx, x, base - x, x + bw / 2, base - x + bw / 2);
        }
        ctx.restore();
      }
      break;
    }
    case "daemmung_weich": {
      // Wärmedämmung weich: Schlaufenkette wie im Wandmuster
      const r = s * 0.45;
      for (let i = -1; i <= 2; i++) {
        const cx = i * s;
        ctx.beginPath();
        ctx.arc(cx, r, r, Math.PI, 0);
        ctx.lineTo(cx + s * 0.5 - r, s - r);
        ctx.arc(cx + s * 0.5, s - r, r, Math.PI, 0, true);
        ctx.lineTo(cx + s, r);
        ctx.stroke();
      }
      break;
    }

    case "waermedaemmung": {
      // Fallback-Kachel (z. B. Schraffurwerkzeug). In Wänden wird das Muster
      // wandgebunden als exakte Vektorgeometrie erzeugt (siehe Renderer).
      const r = s * 0.45;
      for (let i = -1; i <= 2; i++) {
        const cx = i * s;
        ctx.beginPath();
        ctx.arc(cx, r, r, Math.PI, 0);
        ctx.lineTo(cx + s * 0.5 - r, s - r);
        ctx.arc(cx + s * 0.5, s - r, r, Math.PI, 0, true);
        ctx.lineTo(cx + s, r);
        ctx.stroke();
      }
      break;
    }
    case "daemmung_hart": {
      // Wasser: liegende Wellenlinien
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const y0 = ((r + 0.5) / rows) * s;
        const amp = s * 0.06;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const x = (i / 40) * s;
          const y = y0 + Math.sin((x / s) * Math.PI * 2 + (r % 2 ? Math.PI : 0)) * amp;
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
    case "abdichtung_01": {
      // Durchgehendes Band aus abwechselnd gefüllten und leeren Feldern
      const h = s * 0.34;
      const y = (s - h) / 2;
      const n = 4;
      const w = s / n;
      ctx.save();
      ctx.lineWidth = lw * 0.9;
      ctx.lineJoin = "miter";
      ctx.strokeRect(0, y, s, h);
      for (let i = 0; i < n; i++) {
        const x = i * w;
        if (i % 2 === 0) ctx.fillRect(x, y, w, h);
        else line(ctx, x, y, x, y + h);
      }
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
  if (isCustomPatternId(id) || isImagePatternId(id)) {
    const img = isCustomPatternId(id) ? getCustomPatternImage(id) : getImagePattern(id);
    if (!img) return c; // noch nicht geladen: nicht cachen
    // Bildmuster in Originalauflösung (max. 2048 px) kacheln → keine Unschärfe.
    const nw = Math.max(1, img.naturalWidth);
    const nh = Math.max(1, img.naturalHeight);
    const f = Math.min(1, 2048 / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * f));
    const h = Math.max(1, Math.round(nh * f));
    c.width = w; c.height = h;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    drawTile(ctx, id as BuiltinHatchPatternId, s, color, lw);
  }

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
  /** Längung: Streckung in Musterrichtung (X der gedrehten Achse). */
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
  // Bildkacheln können in Originalauflösung vorliegen → auf Kachelbreite normieren.
  const kx = tilePx / Math.max(1, tile.width);
  const ky = tilePx / Math.max(1, tile.width);
  try {
    const m = new DOMMatrix()
      .translateSelf(originScreen.x, originScreen.y)
      .rotateSelf(opt.angleDeg || 0)
      .scaleSelf(kx * stretch, ky)
      .skewXSelf(Math.max(-70, Math.min(70, opt.skewDeg || 0)));

    (pat as any).setTransform?.(m);
  } catch { /* ältere Engine: ohne Transform zeichnen */ }

  ctx.save();
  ctx.globalAlpha = opt.alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  ctx.restore();
}
