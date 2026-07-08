/**
 * Aquarell-Archviz Pipeline für den Adjust-Filter.
 * Portiert aus dem Referenz-Standalone-Renderer (30 Regler, 6 Presets).
 * Alle Werte im ADJUST_KEYS-Set sind 0..100.
 */

export const ADJUST_KEYS = [
  "paper", "wash", "pigment", "waterEdges", "splatter", "lift",
  "trees", "leaves", "greenVar", "treeDepth", "twigs", "grass",
  "surface", "linework", "facade", "plaza", "ao", "scalePeople",
  "depthFog", "skyGlow", "haze", "sunBloom", "warmth", "palette",
  "ink", "softContrast", "saturation", "grain", "vignette", "detail",
] as const;

export type AdjustKey = typeof ADJUST_KEYS[number];
export type AdjustParams = Record<AdjustKey, number>;

export const DEFAULT_ADJUST: AdjustParams = ADJUST_KEYS.reduce((acc, k) => {
  acc[k] = 0; return acc;
}, {} as AdjustParams);

// -------------------- Presets (Werte 0..100, 1:1 aus Vorlage)
export const ADJUST_PRESETS: { key: string; name: string; values: Partial<AdjustParams> }[] = [
  { key: "competition", name: "Wettbewerb", values: {
    paper: 76, wash: 86, pigment: 78, waterEdges: 72, splatter: 56, lift: 62,
    trees: 88, leaves: 86, greenVar: 82, treeDepth: 74, twigs: 44, grass: 54,
    surface: 80, linework: 86, facade: 82, plaza: 74, ao: 60, scalePeople: 38,
    depthFog: 54, skyGlow: 58, haze: 50, sunBloom: 52, warmth: 82, palette: 80,
    ink: 62, softContrast: 72, saturation: 44, grain: 42, vignette: 14, detail: 34,
  }},
  { key: "archvizWarm", name: "Archviz Warm", values: {
    paper: 62, wash: 72, pigment: 66, waterEdges: 52, splatter: 36, lift: 44,
    trees: 76, leaves: 70, greenVar: 72, treeDepth: 66, twigs: 28, grass: 40,
    surface: 86, linework: 82, facade: 86, plaza: 76, ao: 64, scalePeople: 32,
    depthFog: 46, skyGlow: 50, haze: 42, sunBloom: 58, warmth: 88, palette: 76,
    ink: 46, softContrast: 68, saturation: 42, grain: 30, vignette: 12, detail: 40,
  }},
  { key: "vegetation", name: "Vegetation Stark", values: {
    paper: 84, wash: 92, pigment: 88, waterEdges: 82, splatter: 72, lift: 70,
    trees: 100, leaves: 100, greenVar: 100, treeDepth: 90, twigs: 78, grass: 80,
    surface: 46, linework: 52, facade: 42, plaza: 34, ao: 40, scalePeople: 8,
    depthFog: 40, skyGlow: 42, haze: 36, sunBloom: 34, warmth: 56, palette: 70,
    ink: 76, softContrast: 76, saturation: 52, grain: 58, vignette: 8, detail: 22,
  }},
  { key: "watercolorLandscape", name: "Aquarell Landschaft", values: {
    paper: 92, wash: 98, pigment: 94, waterEdges: 90, splatter: 82, lift: 78,
    trees: 98, leaves: 96, greenVar: 90, treeDepth: 86, twigs: 72, grass: 86,
    surface: 38, linework: 44, facade: 30, plaza: 24, ao: 32, scalePeople: 0,
    depthFog: 56, skyGlow: 66, haze: 56, sunBloom: 42, warmth: 58, palette: 64,
    ink: 82, softContrast: 82, saturation: 46, grain: 70, vignette: 10, detail: 14,
  }},
  { key: "nordic", name: "Nordic Soft", values: {
    paper: 72, wash: 78, pigment: 70, waterEdges: 60, splatter: 42, lift: 66,
    trees: 72, leaves: 68, greenVar: 62, treeDepth: 60, twigs: 34, grass: 42,
    surface: 78, linework: 72, facade: 58, plaza: 66, ao: 46, scalePeople: 24,
    depthFog: 62, skyGlow: 72, haze: 58, sunBloom: 28, warmth: 38, palette: 88,
    ink: 56, softContrast: 84, saturation: 34, grain: 52, vignette: 6, detail: 26,
  }},
  { key: "inkSketch", name: "Tusche Skizze", values: {
    paper: 82, wash: 58, pigment: 50, waterEdges: 62, splatter: 34, lift: 60,
    trees: 74, leaves: 54, greenVar: 42, treeDepth: 54, twigs: 88, grass: 58,
    surface: 72, linework: 100, facade: 44, plaza: 72, ao: 66, scalePeople: 18,
    depthFog: 28, skyGlow: 24, haze: 20, sunBloom: 12, warmth: 36, palette: 50,
    ink: 100, softContrast: 76, saturation: 22, grain: 66, vignette: 8, detail: 58,
  }},
];

export const ADJUST_GROUPS: { title: string; note: string; keys: { key: AdjustKey; label: string }[] }[] = [
  { title: "Aquarell Basis", note: "Papier, Washes, Pigmentverläufe, helle Auswaschungen.", keys: [
    { key: "paper", label: "Papierstruktur" }, { key: "wash", label: "Farb-Washes" },
    { key: "pigment", label: "Pigmentverlauf" }, { key: "waterEdges", label: "Aquarellränder" },
    { key: "splatter", label: "Farbkleckse" }, { key: "lift", label: "Weiße Auswaschungen" },
  ]},
  { title: "Vegetation", note: "Pinsel-Tupfer, Grün/Oliv-Palette, Blattspitzen, feine Linien.", keys: [
    { key: "trees", label: "Aquarell Bäume" }, { key: "leaves", label: "Blätter-Tupfer" },
    { key: "greenVar", label: "Grün/Oliv Variation" }, { key: "treeDepth", label: "Baum-Tiefe" },
    { key: "twigs", label: "Äste & Gräser" }, { key: "grass", label: "Gras/Stauden" },
  ]},
  { title: "Architektur", note: "Klare Kanten, Fassadenwärme, Bodenplatten, Kontaktabdunklung.", keys: [
    { key: "surface", label: "Flächenvereinfachung" }, { key: "linework", label: "Gerade Linien" },
    { key: "facade", label: "Fassaden Material" }, { key: "plaza", label: "Bodenplatten" },
    { key: "ao", label: "Kontakt-Schatten" }, { key: "scalePeople", label: "Maßstabsfiguren" },
  ]},
  { title: "Atmosphäre & Licht", note: "Heller Horizont, Luftperspektive, Sonnen-Bloom, Golden Hour.", keys: [
    { key: "depthFog", label: "Depth Fog" }, { key: "skyGlow", label: "Sky Glow" },
    { key: "haze", label: "Luftperspektive" }, { key: "sunBloom", label: "Sun Bloom" },
    { key: "warmth", label: "Golden Hour Wärme" }, { key: "palette", label: "Color Palette" },
  ]},
  { title: "Zeichnung & Finish", note: "Tusche, weicher Kontrast, Sättigung, Vignette, Grain.", keys: [
    { key: "ink", label: "Tusche/Kanten" }, { key: "softContrast", label: "Kontrast weich" },
    { key: "saturation", label: "Sättigung" }, { key: "grain", label: "Paper Grain" },
    { key: "vignette", label: "Vignette" }, { key: "detail", label: "Detail-Rettung" },
  ]},
];

// ---------------- util
const clamp = (v: number, mn: number, mx: number) => v < mn ? mn : v > mx ? mx : v;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function hash(x: number, y: number, seed: number): number {
  let n = x * 374761393 + y * 668265263 + seed * 982451653;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n >>> 0) / 4294967295;
}
function noise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const xf = x - x0, yf = y - y0;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return mix(mix(a, b, u), mix(c, d, u), v);
}
function fractalNoise(x: number, y: number, seed: number): number {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < 4; i++) { t += noise(x * f, y * f, seed + i * 19) * amp; n += amp; amp *= 0.5; f *= 2; }
  return t / n;
}
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// ---------------- masks
interface Masks {
  green: Uint8ClampedArray; sky: Uint8ClampedArray; water: Uint8ClampedArray;
  arch: Uint8ClampedArray; ground: Uint8ClampedArray; edge: Uint8ClampedArray;
  dark: Uint8ClampedArray; light: Uint8ClampedArray; flat: Uint8ClampedArray;
}
function createMasks(src: ImageData, w: number, h: number): Masks {
  const d = src.data;
  const size = w * h;
  const m: Masks = {
    green: new Uint8ClampedArray(size), sky: new Uint8ClampedArray(size),
    water: new Uint8ClampedArray(size), arch: new Uint8ClampedArray(size),
    ground: new Uint8ClampedArray(size), edge: new Uint8ClampedArray(size),
    dark: new Uint8ClampedArray(size), light: new Uint8ClampedArray(size),
    flat: new Uint8ClampedArray(size),
  };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x, i = p * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = luma(r, g, b);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const chroma = mx - mn;
      const ix = i + 4, iy = i + w * 4;
      const lx = luma(d[ix], d[ix + 1], d[ix + 2]);
      const ly = luma(d[iy], d[iy + 1], d[iy + 2]);
      const e = Math.min(255, (Math.abs(lum - lx) + Math.abs(lum - ly)) * 3.35);
      m.edge[p] = e;
      const gs = (g - Math.max(r * 0.82, b * 0.86) + 50) * 3.2;
      m.green[p] = (g > r * 0.80 && g > b * 0.82 && g > 45) ? clamp(gs, 0, 255) : 0;
      const ss = (b - r * 0.95 + 20) * 2.4;
      m.sky[p] = (b > r * 0.98 && b > g * 0.88 && lum > 95 && y < h * 0.72) ? clamp(ss, 0, 220) : 0;
      m.water[p] = (b > r * 0.82 && g > r * 0.76 && lum > 45 && lum < 210 && y > h * 0.28) ? clamp(110 - chroma + e * 0.3, 0, 180) : 0;
      const archBase = (m.green[p] < 28 && m.sky[p] < 42 && chroma < 78 && lum > 48 && lum < 236);
      m.arch[p] = archBase ? clamp(72 + e * 0.92 + (1 - chroma / 120) * 45, 0, 255) : 0;
      const groundBase = (y > h * 0.40 && m.sky[p] < 30 && m.green[p] < 100 && lum > 45);
      m.ground[p] = groundBase ? clamp(120 - chroma * 0.5 + (y / h) * 80, 0, 210) : 0;
      m.dark[p] = lum < 70 ? clamp((80 - lum) * 3, 0, 255) : 0;
      m.light[p] = lum > 170 ? clamp((lum - 165) * 2.4, 0, 255) : 0;
      m.flat[p] = e < 46 && chroma < 80 ? 180 : 0;
    }
  }
  blurMask(m.green, w, h); blurMask(m.arch, w, h);
  blurMask(m.ground, w, h); blurMask(m.sky, w, h);
  return m;
}
function blurMask(mask: Uint8ClampedArray, w: number, h: number) {
  const c = new Uint8ClampedArray(mask);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const v = c[p] * 4 + c[p - 1] + c[p + 1] + c[p - w] + c[p + w]
        + c[p - w - 1] * 0.5 + c[p - w + 1] * 0.5 + c[p + w - 1] * 0.5 + c[p + w + 1] * 0.5;
      mask[p] = v / 10;
    }
  }
}

// ---------------- pipeline (kompakt portiert)
function applyBaseGrade(im: ImageData, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const d = im.data;
  const surface = v.surface / 100, palette = v.palette / 100, softC = v.softContrast / 100;
  const sat = v.saturation / 100, warmth = v.warmth / 100, greenVar = v.greenVar / 100;
  const trees = v.trees / 100, facade = v.facade / 100, haze = v.haze / 100;
  const depthFog = v.depthFog / 100, vignette = v.vignette / 100, plaza = v.plaza / 100;
  const skyGlow = v.skyGlow / 100;
  const strength = 0.9;
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const avg = (r + g + b) / 3;
      const contrast = 1 - (softC * 0.38 + strength * 0.11);
      r = 128 + (r - 128) * contrast; g = 128 + (g - 128) * contrast; b = 128 + (b - 128) * contrast;
      const q = 1 + surface * 14 + strength * 6, qMix = surface * 0.28 + 0.12;
      r = mix(r, Math.round(r / q) * q, qMix);
      g = mix(g, Math.round(g / q) * q, qMix);
      b = mix(b, Math.round(b / q) * q, qMix);
      const satAmt = 0.55 + sat * 0.70;
      r = mix(avg, r, satAmt); g = mix(avg, g, satAmt); b = mix(avg, b, satAmt);
      r += 30 * warmth; g += 14 * warmth; b -= 13 * warmth;
      const gm = m.green[p] / 255, am = m.arch[p] / 255;
      const sm = m.sky[p] / 255, ground = m.ground[p] / 255;
      if (gm > 0) {
        const n1 = fractalNoise(x * 0.012, y * 0.012, seed + 5) - 0.5;
        const n2 = fractalNoise(x * 0.055, y * 0.055, seed + 8) - 0.5;
        r += gm * (34 * greenVar + n1 * 42 * greenVar + n2 * 18);
        g += gm * (12 * greenVar + n1 * 25 * greenVar);
        b -= gm * (36 * greenVar);
        const oR = 146 + n1 * 36, oG = 152 + n2 * 30, oB = 82 + n1 * 16;
        r = mix(r, oR, gm * palette * 0.12);
        g = mix(g, oG, gm * palette * 0.12);
        b = mix(b, oB, gm * palette * 0.14);
        const av = (r + g + b) / 3;
        r = mix(r, av + 28, trees * 0.14 * gm);
        g = mix(g, av + 18, trees * 0.12 * gm);
        b = mix(b, av - 22, trees * 0.14 * gm);
      }
      if (am > 0) {
        const nn = fractalNoise(x * 0.018, y * 0.018, seed + 13) - 0.5;
        const beige = 185 + nn * 22;
        r += am * facade * 28; g += am * facade * 16; b += am * facade * 2;
        r = mix(r, beige + 30, am * facade * 0.14);
        g = mix(g, beige + 10, am * facade * 0.13);
        b = mix(b, beige - 16, am * facade * 0.10);
      }
      if (ground > 0) {
        const stone = 176 + fractalNoise(x * 0.022, y * 0.022, seed + 17) * 32;
        r = mix(r, stone + 16, ground * plaza * 0.10);
        g = mix(g, stone + 8, ground * plaza * 0.10);
        b = mix(b, stone - 10, ground * plaza * 0.10);
      }
      if (sm > 0) {
        r = mix(r, 210, sm * skyGlow * 0.20);
        g = mix(g, 224, sm * skyGlow * 0.22);
        b = mix(b, 236, sm * skyGlow * 0.25);
      }
      const depth = (0.25 + 0.75 * (1 - fy)) * (haze * 0.6 + depthFog * 0.7);
      r = mix(r, 240, depth * 0.18); g = mix(g, 229, depth * 0.17); b = mix(b, 204, depth * 0.13);
      const dx = x / w - 0.5, dy = y / h - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vv = 1 - Math.max(0, dist - 0.25) * vignette * 1.25;
      r *= vv; g *= vv; b *= vv;
      d[i] = clamp(r, 0, 255); d[i + 1] = clamp(g, 0, 255); d[i + 2] = clamp(b, 0, 255);
    }
  }
}

function blurLayer(target: CanvasRenderingContext2D, src: HTMLCanvasElement, radius: number, alpha: number, mode: GlobalCompositeOperation) {
  const c = makeCanvas(src.width, src.height);
  const cx = c.getContext("2d")!;
  cx.filter = `blur(${radius}px)`;
  cx.drawImage(src, 0, 0);
  target.save();
  target.globalAlpha = alpha;
  target.globalCompositeOperation = mode;
  target.drawImage(c, 0, 0);
  target.restore();
}

function applyPigment(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const pig = v.pigment / 100; if (pig <= 0) return;
  const c = makeCanvas(w, h), cx = c.getContext("2d")!;
  const count = Math.floor((w * h / 5000) * pig * 1.8);
  for (let n = 0; n < count; n++) {
    const x = hash(n, 2, seed) * w, y = hash(n, 3, seed) * h;
    const p = Math.floor(y) * w + Math.floor(x);
    const gm = m.green[p] / 255, am = m.arch[p] / 255, sm = m.sky[p] / 255;
    let r = 190, g = 172, b = 110;
    if (gm > 0.15) { r = 120 + hash(n, 4, seed) * 80; g = 140 + hash(n, 5, seed) * 70; b = 70 + hash(n, 6, seed) * 40; }
    else if (am > 0.15) { r = 190 + hash(n, 7, seed) * 38; g = 170 + hash(n, 8, seed) * 28; b = 130 + hash(n, 9, seed) * 20; }
    else if (sm > 0.15) { r = 160 + hash(n, 10, seed) * 45; g = 188 + hash(n, 11, seed) * 45; b = 210 + hash(n, 12, seed) * 35; }
    const rad = 10 + hash(n, 13, seed) * 60;
    const alpha = (0.025 + hash(n, 14, seed) * 0.085) * pig;
    cx.save(); cx.globalAlpha = alpha;
    cx.translate(x, y); cx.rotate(hash(n, 15, seed) * Math.PI);
    cx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    cx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
      const rr = rad * (0.55 + hash(n, Math.floor(a * 100) + 16, seed) * 0.65);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * (0.55 + hash(n, Math.floor(a * 100) + 17, seed) * 0.45);
      if (a === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
    }
    cx.closePath(); cx.filter = `blur(${1 + pig * 3}px)`; cx.fill(); cx.restore();
  }
  ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.drawImage(c, 0, 0); ctx.restore();
}

function applyTrees(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const tr = v.trees / 100; if (tr <= 0) return;
  const src = ctx.getImageData(0, 0, w, h); const d = src.data;
  const c = makeCanvas(w, h), cx = c.getContext("2d")!;
  const count = Math.floor((w * h / 2200) * tr);
  for (let n = 0; n < count; n++) {
    const x = hash(n, 21, seed) * w, y = hash(n, 22, seed) * h;
    const p = Math.floor(y) * w + Math.floor(x);
    if (m.green[p] < 45) continue;
    const i = p * 4; let r = d[i], g = d[i + 1], b = d[i + 2];
    const va = hash(n, 23, seed);
    if (va < 0.35) { r += 40; g += 30; b -= 12; }
    else if (va < 0.7) { r -= 18; g -= 8; b -= 20; }
    else { r += 12; g += 16; b -= 30; }
    const rad = (5 + hash(n, 24, seed) * 24) * (0.75 + tr);
    const alpha = (0.10 + hash(n, 25, seed) * 0.22) * tr;
    cx.save(); cx.globalAlpha = alpha;
    cx.translate(x, y); cx.rotate(hash(n, 26, seed) * Math.PI);
    cx.fillStyle = `rgb(${clamp(r, 0, 255) | 0},${clamp(g, 0, 255) | 0},${clamp(b, 0, 255) | 0})`;
    cx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const rr = rad * (0.50 + hash(n, Math.floor(a * 100) + 27, seed) * 0.75);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * (0.55 + hash(n, Math.floor(a * 100) + 28, seed) * 0.40);
      if (a === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
    }
    cx.closePath(); cx.filter = `blur(${0.8 + tr * 2.8}px)`; cx.fill(); cx.restore();
  }
  ctx.drawImage(c, 0, 0);
}

function applyLeaves(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const lv = v.leaves / 100; if (lv <= 0) return;
  const c = makeCanvas(w, h), cx = c.getContext("2d")!;
  const count = Math.floor((w * h / 1100) * lv);
  for (let n = 0; n < count; n++) {
    const x = hash(n, 31, seed) * w, y = hash(n, 32, seed) * h;
    const p = Math.floor(y) * w + Math.floor(x);
    if (m.green[p] < 42) continue;
    const bright = hash(n, 33, seed) < 0.58, warm = hash(n, 34, seed);
    let fill: string;
    if (bright) {
      const rr = 220 + warm * 35, gg = 210 + warm * 25, bb = 112 + warm * 28;
      fill = `rgba(${rr | 0},${gg | 0},${bb | 0},.88)`;
    } else {
      const rr = 28 + warm * 20, gg = 58 + warm * 35, bb = 34 + warm * 18;
      fill = `rgba(${rr | 0},${gg | 0},${bb | 0},.76)`;
    }
    cx.globalAlpha = (bright ? 0.18 : 0.15) * lv;
    cx.fillStyle = fill;
    cx.beginPath();
    cx.ellipse(x, y, 1 + hash(n, 35, seed) * 4.8, 1 + hash(n, 36, seed) * 6.2, hash(n, 37, seed) * Math.PI, 0, Math.PI * 2);
    cx.fill();
  }
  ctx.drawImage(c, 0, 0);
}

function applyGrassTwigs(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const twigs = v.twigs / 100, grass = v.grass / 100;
  if (twigs <= 0 && grass <= 0) return;
  const c = makeCanvas(w, h), cx = c.getContext("2d")!;
  cx.lineCap = "round"; cx.lineJoin = "round";
  if (twigs > 0) {
    const tc = Math.floor((w * h / 6200) * twigs);
    cx.strokeStyle = `rgba(32,45,26,${0.34 * twigs})`;
    cx.lineWidth = 0.6 + twigs * 1.4;
    for (let n = 0; n < tc; n++) {
      const x = hash(n, 41, seed) * w, y = hash(n, 42, seed) * h;
      const p = Math.floor(y) * w + Math.floor(x);
      if (m.green[p] < 55) continue;
      const len = 30 + hash(n, 43, seed) * 70;
      const bend = hash(n, 44, seed) * 40 - 20;
      cx.beginPath(); cx.moveTo(x, y);
      cx.bezierCurveTo(x + bend * 0.3, y - len * 0.35, x + bend * 0.7, y - len * 0.7, x + bend, y - len);
      cx.stroke();
    }
  }
  if (grass > 0) {
    const gc = Math.floor((w * h / 4100) * grass);
    cx.strokeStyle = `rgba(112,118,55,${0.30 * grass})`;
    cx.lineWidth = 0.5 + grass * 0.9;
    for (let n = 0; n < gc; n++) {
      const x = hash(n, 47, seed) * w;
      const y = (0.48 + hash(n, 48, seed) * 0.5) * h;
      const p = Math.floor(y) * w + Math.floor(x);
      if (m.green[p] < 28 && m.ground[p] < 50) continue;
      const len = 10 + hash(n, 49, seed) * 42;
      const bend = hash(n, 50, seed) * 18 - 9;
      cx.beginPath(); cx.moveTo(x, y);
      cx.quadraticCurveTo(x + bend * 0.4, y - len * 0.5, x + bend, y - len);
      cx.stroke();
    }
  }
  ctx.drawImage(c, 0, 0);
}

function applyLinework(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const lw = v.linework / 100, fc = v.facade / 100;
  if (lw <= 0 && fc <= 0) return;
  const c = makeCanvas(w, h), cx = c.getContext("2d")!;
  cx.lineCap = "round"; cx.lineJoin = "round";
  cx.strokeStyle = `rgba(37,34,28,${0.36 * lw})`;
  cx.lineWidth = 0.55 + lw * 1.25;
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const p = y * w + x;
      if (m.arch[p] > 66 && m.edge[p] > 62) {
        const chance = hash(x, y, seed + 61);
        if (chance < 0.085 * lw) {
          const hb = hash(x, y, seed + 62);
          if (hb < 0.62) {
            const len = 8 + hash(x, y, seed + 63) * 20;
            cx.beginPath(); cx.moveTo(x - len * 0.5, y);
            cx.lineTo(x + len * 0.5, y + hash(x, y, seed + 64) * 2 - 1); cx.stroke();
          } else {
            const len = 8 + hash(x, y, seed + 65) * 20;
            cx.beginPath(); cx.moveTo(x, y - len * 0.5);
            cx.lineTo(x + hash(x, y, seed + 66) * 2 - 1, y + len * 0.5); cx.stroke();
          }
        }
      }
    }
  }
  cx.strokeStyle = `rgba(255,235,180,${0.13 * fc})`;
  cx.lineWidth = 0.7;
  const rowStep = Math.max(18, Math.floor(h / 52));
  for (let y = 12; y < h; y += rowStep) {
    if (hash(y, 7, seed) < 0.55) {
      cx.beginPath(); cx.moveTo(0, y + Math.sin(y * 0.05) * 2);
      cx.lineTo(w, y + Math.sin(y * 0.05) * 2); cx.stroke();
    }
  }
  ctx.drawImage(c, 0, 0);
}

function applyPlaza(ctx: CanvasRenderingContext2D, v: AdjustParams, seed: number, w: number, h: number) {
  const pl = v.plaza / 100; if (pl <= 0) return;
  const c = makeCanvas(w, h), cx = c.getContext("2d")!;
  cx.strokeStyle = `rgba(230,218,190,${0.13 * pl})`;
  cx.lineWidth = 1;
  const yStart = h * 0.42, yStep = Math.max(18, h / 44);
  for (let y = yStart; y < h; y += yStep) {
    cx.beginPath(); cx.moveTo(0, y); cx.lineTo(w, y + Math.sin(y * 0.03) * 9); cx.stroke();
  }
  const xStep = Math.max(22, w / 58);
  for (let x = 0; x < w; x += xStep) {
    cx.beginPath(); cx.moveTo(x, h * 0.38);
    cx.lineTo(x + (x - w / 2) * 0.28, h); cx.stroke();
  }
  cx.fillStyle = `rgba(160,145,110,${0.045 * pl})`;
  for (let n = 0; n < Math.floor((w * h / 12000) * pl); n++) {
    const x = hash(n, 71, seed) * w;
    const y = h * (0.45 + hash(n, 72, seed) * 0.5);
    const rw = 40 + hash(n, 73, seed) * 130;
    const rh = 8 + hash(n, 74, seed) * 32;
    cx.save(); cx.translate(x, y);
    cx.rotate((hash(n, 75, seed) - 0.5) * 0.3);
    cx.beginPath(); cx.ellipse(0, 0, rw, rh, 0, 0, Math.PI * 2);
    cx.fill(); cx.restore();
  }
  ctx.drawImage(c, 0, 0);
}

function applyLifts(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const li = v.lift / 100; if (li <= 0) return;
  const c = makeCanvas(w, h), cx = c.getContext("2d")!;
  const count = Math.floor((w * h / 3000) * li);
  cx.fillStyle = "rgba(255,251,229,.58)";
  for (let n = 0; n < count; n++) {
    const x = hash(n, 81, seed) * w, y = hash(n, 82, seed) * h;
    const p = Math.floor(y) * w + Math.floor(x);
    if (m.green[p] < 20 && m.arch[p] < 25 && hash(n, 83, seed) < 0.48) continue;
    const rx = 4 + hash(n, 84, seed) * 24;
    const ry = 2 + hash(n, 85, seed) * 14;
    cx.globalAlpha = (0.055 + hash(n, 86, seed) * 0.14) * li;
    cx.beginPath();
    cx.ellipse(x, y, rx, ry, hash(n, 87, seed) * Math.PI, 0, Math.PI * 2);
    cx.fill();
  }
  ctx.save(); ctx.filter = `blur(${0.7 + li * 1.7}px)`;
  ctx.drawImage(c, 0, 0); ctx.restore();
}

function applyWaterEdges(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, seed: number, w: number, h: number) {
  const we = v.waterEdges / 100; if (we <= 0) return;
  const im = ctx.getImageData(0, 0, w, h); const d = im.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x, i = p * 4;
      const e = m.edge[p] / 255;
      const wet = (m.green[p] + m.arch[p] + m.sky[p] + m.ground[p]) / (255 * 4);
      const nn = fractalNoise(x * 0.04, y * 0.04, seed + 91);
      const border = Math.max(0, e * 0.5 + wet * 0.45 + (nn - 0.5) * 0.3);
      if (border > 0.22) {
        const k = border * we * 0.18;
        d[i] = clamp(d[i] * (1 - k) + 110 * k, 0, 255);
        d[i + 1] = clamp(d[i + 1] * (1 - k) + 100 * k, 0, 255);
        d[i + 2] = clamp(d[i + 2] * (1 - k) + 80 * k, 0, 255);
      }
    }
  }
  ctx.putImageData(im, 0, 0);
}

function applyInkAO(ctx: CanvasRenderingContext2D, m: Masks, v: AdjustParams, w: number, h: number) {
  const ink = v.ink / 100, ao = v.ao / 100, td = v.treeDepth / 100;
  if (ink <= 0 && ao <= 0 && td <= 0) return;
  const im = ctx.getImageData(0, 0, w, h); const d = im.data;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const e = m.edge[p] / 255, am = m.arch[p] / 255, gm = m.green[p] / 255;
    const dk = e * ink * 0.48 + am * ao * 0.10 + gm * td * 0.04;
    if (dk > 0.025) {
      d[i] = clamp(d[i] * (1 - dk), 0, 255);
      d[i + 1] = clamp(d[i + 1] * (1 - dk), 0, 255);
      d[i + 2] = clamp(d[i + 2] * (1 - dk), 0, 255);
    }
  }
  ctx.putImageData(im, 0, 0);
}

function applyDepthFog(ctx: CanvasRenderingContext2D, v: AdjustParams, w: number, h: number) {
  const df = v.depthFog / 100; if (df <= 0) return;
  const im = ctx.getImageData(0, 0, w, h); const d = im.data;
  for (let y = 0; y < h; y++) {
    const fy = y / h; const k = Math.max(0, (1 - fy) - 0.12) * df;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] = mix(d[i], 236, k * 0.15);
      d[i + 1] = mix(d[i + 1], 226, k * 0.14);
      d[i + 2] = mix(d[i + 2], 206, k * 0.12);
    }
  }
  ctx.putImageData(im, 0, 0);
}

function applySkyGlow(ctx: CanvasRenderingContext2D, v: AdjustParams, w: number, h: number) {
  const sg = v.skyGlow / 100; if (sg <= 0) return;
  const grad = ctx.createRadialGradient(w * 0.78, h * 0.08, 0, w * 0.78, h * 0.08, w * 0.72);
  grad.addColorStop(0, `rgba(255,248,208,${0.22 * sg})`);
  grad.addColorStop(0.35, `rgba(255,226,165,${0.09 * sg})`);
  grad.addColorStop(1, "rgba(255,226,165,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  const hz = ctx.createLinearGradient(0, 0, 0, h);
  hz.addColorStop(0, `rgba(225,235,235,${0.16 * sg})`);
  hz.addColorStop(0.45, `rgba(242,230,198,${0.06 * sg})`);
  hz.addColorStop(1, "rgba(242,230,198,0)");
  ctx.fillStyle = hz; ctx.fillRect(0, 0, w, h);
}

function applySunBloom(ctx: CanvasRenderingContext2D, srcCanvas: HTMLCanvasElement, v: AdjustParams, w: number, h: number) {
  const bloom = v.sunBloom / 100; if (bloom <= 0) return;
  const tmp = makeCanvas(w, h); const t = tmp.getContext("2d")!;
  t.drawImage(srcCanvas, 0, 0);
  const im = t.getImageData(0, 0, w, h); const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d[i], d[i + 1], d[i + 2]);
    const k = Math.max(0, (l - 132) / 118);
    d[i] = clamp(d[i] * k + 255 * k * bloom, 0, 255);
    d[i + 1] = clamp(d[i + 1] * k + 230 * k * bloom, 0, 255);
    d[i + 2] = clamp(d[i + 2] * k + 172 * k * bloom, 0, 255);
    d[i + 3] = clamp(255 * k, 0, 255);
  }
  t.putImageData(im, 0, 0);
  ctx.save(); ctx.filter = `blur(${8 + bloom * 34}px)`;
  ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = 0.55 * bloom;
  ctx.drawImage(tmp, 0, 0); ctx.restore();
}

function applyPaperGrain(ctx: CanvasRenderingContext2D, v: AdjustParams, seed: number, w: number, h: number) {
  const paper = v.paper / 100, grain = v.grain / 100, splatter = v.splatter / 100;
  if (paper <= 0 && grain <= 0 && splatter <= 0) return;
  const im = ctx.getImageData(0, 0, w, h); const d = im.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const fiber = (Math.sin(x * 0.78) + Math.sin(y * 0.51) + Math.sin((x + y) * 0.23)) * paper * 3.2;
      const nz = (hash(x, y, seed + 111) - 0.5) * (paper * 7 + grain * 8);
      const cloud = (fractalNoise(x * 0.018, y * 0.018, seed + 112) - 0.5) * paper * 10;
      d[i] = clamp(d[i] + fiber + nz + cloud + paper * 5, 0, 255);
      d[i + 1] = clamp(d[i + 1] + fiber + nz + cloud + paper * 4, 0, 255);
      d[i + 2] = clamp(d[i + 2] + fiber + nz + cloud + paper * 1.5, 0, 255);
      const sChance = splatter * 0.0022;
      if (hash(x, y, seed + 113) < sChance) {
        const mult = splatter * (0.5 + hash(x, y, seed + 114));
        d[i] = clamp(d[i] + (hash(x, y, seed + 115) * 90 - 25) * mult, 0, 255);
        d[i + 1] = clamp(d[i + 1] + (hash(x, y, seed + 116) * 70 - 18) * mult, 0, 255);
        d[i + 2] = clamp(d[i + 2] - (hash(x, y, seed + 117) * 35) * mult, 0, 255);
      }
    }
  }
  ctx.putImageData(im, 0, 0);
}

function applyDetail(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, v: AdjustParams, w: number, h: number) {
  const dt = v.detail / 100; if (dt <= 0) return;
  const before = ctx.getImageData(0, 0, w, h);
  const bc = makeCanvas(w, h); const b = bc.getContext("2d")!;
  b.filter = "blur(1.2px)"; b.drawImage(src, 0, 0);
  const blur = b.getImageData(0, 0, w, h);
  const a = before.data, bd = blur.data;
  for (let i = 0; i < a.length; i += 4) {
    a[i] = clamp(a[i] + (a[i] - bd[i]) * dt * 0.55, 0, 255);
    a[i + 1] = clamp(a[i + 1] + (a[i + 1] - bd[i + 1]) * dt * 0.55, 0, 255);
    a[i + 2] = clamp(a[i + 2] + (a[i + 2] - bd[i + 2]) * dt * 0.55, 0, 255);
  }
  ctx.putImageData(before, 0, 0);
}

/**
 * Rendert die komplette Aquarell-Archviz-Pipeline in eine neue Canvas.
 * Erhält Alpha (transparente Pixel bleiben transparent, alle Passes skippen sie
 * implizit über edge/mask-Werte und alpha-freien Compositing-Modi).
 */
export function renderAdjust(
  source: CanvasImageSource,
  w: number,
  h: number,
  params: AdjustParams,
): HTMLCanvasElement {
  const out = makeCanvas(w, h);
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const seed = ((w * 13 + h * 17) % 9999) + 101;

  const v = { ...DEFAULT_ADJUST, ...params };
  const im = ctx.getImageData(0, 0, w, h);
  const masks = createMasks(im, w, h);

  applyBaseGrade(im, masks, v, seed, w, h);
  ctx.putImageData(im, 0, 0);

  // Washes
  const wash = v.wash / 100, pig = v.pigment / 100;
  if (wash > 0) {
    blurLayer(ctx, out, 2 + wash * 7, wash * 0.34, "source-over");
    blurLayer(ctx, out, 9 + wash * 24, wash * 0.20, "screen");
  }
  if (pig > 0) {
    blurLayer(ctx, out, 4 + pig * 12, pig * 0.18, "multiply");
    blurLayer(ctx, out, 16 + pig * 30, pig * 0.07, "overlay");
  }

  applyPigment(ctx, masks, v, seed, w, h);
  applyTrees(ctx, masks, v, seed, w, h);
  applyLeaves(ctx, masks, v, seed, w, h);
  applyGrassTwigs(ctx, masks, v, seed, w, h);
  applyLinework(ctx, masks, v, seed, w, h);
  applyPlaza(ctx, v, seed, w, h);
  applyLifts(ctx, masks, v, seed, w, h);
  applyWaterEdges(ctx, masks, v, seed, w, h);
  applyInkAO(ctx, masks, v, w, h);
  applyDepthFog(ctx, v, w, h);
  applySkyGlow(ctx, v, w, h);
  applySunBloom(ctx, out, v, w, h);
  applyPaperGrain(ctx, v, seed, w, h);
  applyDetail(ctx, out, v, w, h);

  return out;
}
