/**
 * Aquarell-Archviz Pipeline für den Adjust-Filter.
 *
 * 1:1-Portierung der Referenz "Archviz Aquarell Render Filter V4".
 * Reihenfolge der Render-Schritte, Formeln, Masken, Schwellenwerte, Blur-Radien,
 * Alpha-Werte, Composite-Modi, Zufallsverteilungen und Preset-/Default-Werte
 * entsprechen der Referenz.
 *
 * Bewusst NICHT portiert (auf Wunsch entfernt):
 *  - "Äste & Gräser" (twigs)
 *  - "Gerade Linien" (linework)
 * Alle übrigen Effekte bleiben unverändert kalibriert.
 */

export const ADJUST_KEYS = [
  "strength", "paper", "wash", "splatter", "lift",
  "trees", "leaves", "greenVar",
  "arch", "facade", "plaza", "ao", "people",
  "model", "haze", "bloom", "edges",
  "warmth", "softContrast", "sat", "vignette",
] as const;

export type AdjustKey = typeof ADJUST_KEYS[number];
export type AdjustParams = Record<AdjustKey, number>;

/** Default-Werte = alles auf 0 (kein Effekt). Regler 0..100 = Stärke des Filters. */
export const DEFAULT_ADJUST: AdjustParams = {
  strength: 0, paper: 0, wash: 0, splatter: 0, lift: 0,
  trees: 0, leaves: 0, greenVar: 0,
  arch: 0, facade: 0, plaza: 0, ao: 0, people: 0,
  model: 0, haze: 0, bloom: 0, edges: 0,
  warmth: 0, softContrast: 0, sat: 0, vignette: 0,
};

// -------------------- Presets (Referenzwerte, ohne twigs/linework)
export const ADJUST_PRESETS: { key: string; name: string; values: Partial<AdjustParams> }[] = [
  { key: "master", name: "Archviz Master stark", values: {
    strength: 96, paper: 80, wash: 88, splatter: 72, lift: 65,
    trees: 100, leaves: 96, greenVar: 90,
    arch: 88, facade: 74, plaza: 56, ao: 52, people: 30,
    model: 68, haze: 44, bloom: 42, edges: 72,
    warmth: 68, softContrast: 76, sat: 50, vignette: 12,
  }},
  { key: "trees", name: "Bäume sehr schön", values: {
    strength: 96, paper: 84, wash: 92, splatter: 80, lift: 70,
    trees: 100, leaves: 100, greenVar: 100,
    arch: 48, facade: 45, plaza: 28, ao: 35, people: 10,
    model: 45, haze: 35, bloom: 30, edges: 76,
    warmth: 55, softContrast: 72, sat: 52, vignette: 8,
  }},
  { key: "architecture", name: "Architektur stark", values: {
    strength: 82, paper: 50, wash: 62, splatter: 34, lift: 28,
    trees: 62, leaves: 50, greenVar: 55,
    arch: 100, facade: 92, plaza: 88, ao: 80, people: 46,
    model: 86, haze: 34, bloom: 36, edges: 70,
    warmth: 72, softContrast: 58, sat: 46, vignette: 8,
  }},
  { key: "competition", name: "Wettbewerbs-Rendering", values: {
    strength: 94, paper: 70, wash: 80, splatter: 52, lift: 52,
    trees: 86, leaves: 82, greenVar: 78,
    arch: 92, facade: 86, plaza: 70, ao: 62, people: 52,
    model: 80, haze: 50, bloom: 58, edges: 54,
    warmth: 82, softContrast: 70, sat: 42, vignette: 16,
  }},
];

export const ADJUST_GROUPS: { title: string; note: string; keys: { key: AdjustKey; label: string }[] }[] = [
  { title: "Aquarell / Kunst", note: "Gesamtstärke, Papier, Washes, Kleckse, Auswaschungen.", keys: [
    { key: "strength", label: "Gesamtstärke" }, { key: "paper", label: "Papierstruktur" },
    { key: "wash", label: "Farb-Washes" }, { key: "splatter", label: "Farbkleckse" },
    { key: "lift", label: "Weiße Auswaschungen" },
  ]},
  { title: "Bäume & Natur", note: "Aquarell-Bäume, Blätter-Tupfer, Grün-/Oliv-Variation.", keys: [
    { key: "trees", label: "Aquarell-Bäume" }, { key: "leaves", label: "Blätter-Tupfer" },
    { key: "greenVar", label: "Grün/Oliv Variation" },
  ]},
  { title: "Architektur", note: "Erkennung, Fassaden, Bodenplatten, Kontaktschatten, Figuren.", keys: [
    { key: "arch", label: "Architektur-Erkennung" }, { key: "facade", label: "Fassaden warm" },
    { key: "plaza", label: "Plaza/Bodenplatten" }, { key: "ao", label: "Ambient Occlusion" },
    { key: "people", label: "Maßstabsfiguren" },
  ]},
  { title: "3D Render Look", note: "Modell-Glättung, Luftperspektive, Bloom, Tusche.", keys: [
    { key: "model", label: "3D-Modell-Glättung" }, { key: "haze", label: "Luftperspektive/Dunst" },
    { key: "bloom", label: "Bloom/Sonne" }, { key: "edges", label: "Tusche/Kanten" },
  ]},
  { title: "Farbe & Licht", note: "Golden Hour, weicher Kontrast, Sättigung, Vignette.", keys: [
    { key: "warmth", label: "Golden Hour Wärme" }, { key: "softContrast", label: "Kontrast weich" },
    { key: "sat", label: "Sättigung" }, { key: "vignette", label: "Vignette" },
  ]},
];

// ---------------- util (Referenz)
const clamp = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

// ---------------- makeMasks (Referenz)
interface Masks {
  green: Uint8ClampedArray; edge: Uint8ClampedArray;
  arch: Uint8ClampedArray; flat: Uint8ClampedArray;
}
function makeMasks(img: ImageData, w: number, h: number): Masks {
  const d = img.data;
  const green = new Uint8ClampedArray(w * h);
  const edge = new Uint8ClampedArray(w * h);
  const arch = new Uint8ClampedArray(w * h);
  const flat = new Uint8ClampedArray(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x, i = p * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      green[p] = (g > r * 0.82 && g > b * 0.86 && g > 50)
        ? Math.min(255, (g - Math.max(r, b) + 55) * 3) : 0;
      const ix = i + 4, iy = i + w * 4;
      const lx = 0.2126 * d[ix] + 0.7152 * d[ix + 1] + 0.0722 * d[ix + 2];
      const ly = 0.2126 * d[iy] + 0.7152 * d[iy + 1] + 0.0722 * d[iy + 2];
      const e = Math.min(255, (Math.abs(lum - lx) + Math.abs(lum - ly)) * 3.4);
      edge[p] = e;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      arch[p] = (green[p] < 25 && chroma < 70 && lum > 55 && lum < 230)
        ? Math.min(255, 80 + e * 0.9) : 0;
      flat[p] = (green[p] < 30 && e < 55 && lum > 70) ? 180 : 0;
    }
  }
  return { green, edge, arch, flat };
}

/**
 * Referenz-Renderpass. Arbeitet exakt auf der übergebenen Canvas-Größe
 * (der Aufrufer skaliert auf die Referenzauflösung, damit pixelabhängige
 * Effekte identisch wirken).
 */
function renderReference(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  original: ImageData,
  p: AdjustParams,
) {
  const w = canvas.width, h = canvas.height;
  const val = (k: AdjustKey) => (p[k] ?? 0) / 100;
  const work = () => makeCanvas(w, h);
  const blurCopy = (amount: number, alpha: number, mode: GlobalCompositeOperation = "source-over") => {
    const c = work(), cx = c.getContext("2d")!;
    cx.filter = `blur(${amount}px)`;
    cx.drawImage(canvas, 0, 0);
    ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = mode;
    ctx.drawImage(c, 0, 0); ctx.restore();
  };

  const strength = val("strength"), paper = val("paper"), wash = val("wash"), lift = val("lift"),
    splatter = val("splatter"), trees = val("trees"), leaves = val("leaves"), greenVar = val("greenVar"),
    facade = val("facade"), plaza = val("plaza"), ao = val("ao"), people = val("people"),
    model = val("model"), haze = val("haze"), bloom = val("bloom"), edges = val("edges"),
    warmth = val("warmth"), softC = val("softContrast"), sat = val("sat"), vign = val("vignette");

  const data = new Uint8ClampedArray(original.data);
  const m = makeMasks(original, w, h);

  // Base color grading, 3D flattening, green/facade material
  for (let y = 0; y < h; y++) {
    const fy = y / h;
    for (let x = 0; x < w; x++) {
      const pi = y * w + x, i = pi * 4;
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const contrast = 1 - (0.42 * softC + 0.17 * strength);
      r = 128 + (r - 128) * contrast; g = 128 + (g - 128) * contrast; b = 128 + (b - 128) * contrast;
      const q = 1 + (model * 11 + strength * 7);
      r = mix(r, Math.round(r / q) * q, (model + strength) * 0.24);
      g = mix(g, Math.round(g / q) * q, (model + strength) * 0.24);
      b = mix(b, Math.round(b / q) * q, (model + strength) * 0.24);
      const avg = (r + g + b) / 3;
      const satF = 1 + sat * 0.18; // 0 = unverändert, 100 = stärkste Sättigung
      r = mix(avg, r, satF); g = mix(avg, g, satF); b = mix(avg, b, satF);
      r += 28 * warmth; g += 13 * warmth; b -= 12 * warmth;
      const gm = m.green[pi] / 255, am = m.arch[pi] / 255;
      if (gm > 0) {
        const nz = (Math.sin(x * 0.085 + y * 0.13) + Math.sin(x * 0.22 - y * 0.075)) * 0.5;
        r += gm * (32 * greenVar + nz * 24 * greenVar);
        g += gm * (10 * greenVar + nz * 14 * greenVar);
        b -= gm * (34 * greenVar);
        const av = (r + g + b) / 3;
        r = mix(r, av + 26, trees * 0.20 * gm);
        g = mix(g, av + 18, trees * 0.16 * gm);
        b = mix(b, av - 24, trees * 0.20 * gm);
      }
      if (am > 0) {
        r += am * facade * 26; g += am * facade * 15; b += am * facade * 2;
        const target = 188 + Math.sin(x * 0.03 + y * 0.02) * 14;
        r = mix(r, target + 25, am * facade * 0.14);
        g = mix(g, target + 8, am * facade * 0.12);
        b = mix(b, target - 15, am * facade * 0.10);
      }
      const ha = haze * (0.28 + 0.72 * (1 - fy));
      r = mix(r, 240, ha * 0.20); g = mix(g, 228, ha * 0.18); b = mix(b, 200, ha * 0.14);
      const dx = x / w - 0.5, dy = y / h - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vv = 1 - Math.max(0, dist - 0.25) * vign * 1.25;
      r *= vv; g *= vv; b *= vv;
      data[i] = clamp(r); data[i + 1] = clamp(g); data[i + 2] = clamp(b);
    }
  }
  ctx.putImageData(new ImageData(data, w, h), 0, 0);

  // watercolor layers
  blurCopy(2 + wash * 8, wash * 0.42);
  blurCopy(10 + wash * 22, wash * 0.20, "screen");
  blurCopy(4 + wash * 10, wash * 0.18, "multiply");

  // tree painterly blobs
  const base = ctx.getImageData(0, 0, w, h), bd = base.data;
  const brush = work(), bc = brush.getContext("2d")!;
  for (let n = 0; n < Math.floor((w * h / 2600) * trees); n++) {
    const x = Math.random() * w, y = Math.random() * h;
    const pp = Math.floor(y) * w + Math.floor(x);
    if (m.green[pp] < 55) continue;
    const i = pp * 4, r = bd[i], g = bd[i + 1], b = bd[i + 2];
    const rad = (5 + Math.random() * 22) * (0.60 + trees);
    bc.save();
    bc.globalAlpha = (0.11 + Math.random() * 0.20) * trees;
    bc.translate(x, y); bc.rotate(Math.random() * Math.PI);
    bc.fillStyle = `rgb(${clamp(r + Math.random() * 45 - 12)},${clamp(g + Math.random() * 34 - 6)},${clamp(b - Math.random() * 24)})`;
    bc.beginPath();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const rr = rad * (0.55 + Math.random() * 0.65);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.70;
      if (a === 0) bc.moveTo(px, py); else bc.lineTo(px, py);
    }
    bc.closePath();
    bc.filter = `blur(${1 + Math.random() * 2.8}px)`;
    bc.fill(); bc.restore();
  }
  ctx.drawImage(brush, 0, 0);

  // leaves/splatter
  const leaf = work(), lc = leaf.getContext("2d")!;
  for (let n = 0; n < Math.floor((w * h / 1350) * leaves); n++) {
    const x = Math.random() * w, y = Math.random() * h;
    const pp = Math.floor(y) * w + Math.floor(x);
    if (m.green[pp] < 45) continue;
    const bright = Math.random() < 0.58;
    lc.globalAlpha = (bright ? 0.22 : 0.18) * leaves;
    lc.fillStyle = bright ? "rgba(246,234,140,.9)" : "rgba(30,62,39,.8)";
    lc.beginPath();
    lc.ellipse(x, y, 1 + Math.random() * 4.6, 1 + Math.random() * 5.8, Math.random() * Math.PI, 0, Math.PI * 2);
    lc.fill();
  }
  ctx.drawImage(leaf, 0, 0);

  // façade grid (linework-Effekt entfernt, Fassadenlinien bleiben)
  const line = work(), ln = line.getContext("2d")!;
  ln.lineCap = "round";
  ln.strokeStyle = `rgba(255,235,180,${0.18 * facade})`;
  ln.lineWidth = 0.7;
  for (let y = 10; y < h; y += Math.max(16, Math.floor(h / 45))) {
    ln.beginPath();
    ln.moveTo(0, y + Math.sin(y) * 2);
    ln.lineTo(w, y + Math.sin(y) * 2);
    ln.stroke();
  }
  ctx.drawImage(line, 0, 0);

  // plaza/ground texture
  const plazaC = work(), pc = plazaC.getContext("2d")!;
  pc.strokeStyle = `rgba(230,218,190,${0.12 * plaza})`;
  pc.lineWidth = 1;
  for (let y = h * 0.42; y < h; y += Math.max(18, h / 42)) {
    pc.beginPath(); pc.moveTo(0, y); pc.lineTo(w, y + Math.sin(y * 0.03) * 8); pc.stroke();
  }
  for (let x = 0; x < w; x += Math.max(22, w / 55)) {
    pc.beginPath(); pc.moveTo(x, h * 0.38); pc.lineTo(x + (x - w / 2) * 0.28, h); pc.stroke();
  }
  ctx.drawImage(plazaC, 0, 0);

  // white lifts / paper blooms
  const liftC = work(), lctx = liftC.getContext("2d")!;
  lctx.fillStyle = "rgba(255,250,225,.56)";
  for (let n = 0; n < Math.floor((w * h / 3300) * lift); n++) {
    const x = Math.random() * w, y = Math.random() * h;
    const pp = Math.floor(y) * w + Math.floor(x);
    if (m.green[pp] < 25 && m.arch[pp] < 25 && Math.random() < 0.5) continue;
    lctx.globalAlpha = (0.055 + Math.random() * 0.14) * lift;
    lctx.beginPath();
    lctx.ellipse(x, y, 4 + Math.random() * 22, 2 + Math.random() * 13, Math.random() * Math.PI, 0, Math.PI * 2);
    lctx.fill();
  }
  ctx.save(); ctx.filter = `blur(${0.7 + lift * 1.6}px)`; ctx.drawImage(liftC, 0, 0); ctx.restore();

  // AO/contact shadows from edges
  let im = ctx.getImageData(0, 0, w, h);
  let d = im.data;
  for (let pp = 0; pp < w * h; pp++) {
    const e = m.edge[pp] / 255, a = m.arch[pp] / 255, i = pp * 4;
    const dark = e * edges * 0.50 + a * ao * 0.10;
    if (dark > 0.03) {
      d[i] = clamp(d[i] * (1 - dark));
      d[i + 1] = clamp(d[i + 1] * (1 - dark));
      d[i + 2] = clamp(d[i + 2] * (1 - dark));
    }
  }
  ctx.putImageData(im, 0, 0);

  // small scale people silhouettes in flatter/plaza areas
  const ppl = work(), pp2 = ppl.getContext("2d")!;
  for (let n = 0; n < Math.floor(26 * people); n++) {
    const x = Math.random() * w, y = h * (0.45 + Math.random() * 0.38);
    const pi = Math.floor(y) * w + Math.floor(x);
    if (m.green[pi] > 30) continue;
    const size = (h * 0.006 + h * 0.010 * Math.random()) * (1 - (y / h - 0.45) * 0.35);
    pp2.save();
    pp2.globalAlpha = 0.35 * people;
    pp2.translate(x, y);
    pp2.fillStyle = "rgba(35,32,28,.75)";
    pp2.beginPath(); pp2.arc(0, -size * 2.2, size * 0.35, 0, Math.PI * 2); pp2.fill();
    pp2.fillRect(-size * 0.22, -size * 1.9, size * 0.44, size * 1.5);
    pp2.strokeStyle = "rgba(35,32,28,.7)";
    pp2.lineWidth = Math.max(0.7, size * 0.12);
    pp2.beginPath();
    pp2.moveTo(0, -size * 0.6); pp2.lineTo(-size * 0.45, size * 0.45);
    pp2.moveTo(0, -size * 0.6); pp2.lineTo(size * 0.45, size * 0.45);
    pp2.stroke(); pp2.restore();
  }
  ctx.drawImage(ppl, 0, 0);

  // bloom
  if (bloom > 0) {
    const tmp = work(), t = tmp.getContext("2d")!;
    t.drawImage(canvas, 0, 0);
    const bim = t.getImageData(0, 0, w, h), dd = bim.data;
    for (let i = 0; i < dd.length; i += 4) {
      const l = 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];
      const k = Math.max(0, (l - 135) / 115);
      dd[i] = clamp(dd[i] * k + 255 * k * bloom);
      dd[i + 1] = clamp(dd[i + 1] * k + 230 * k * bloom);
      dd[i + 2] = clamp(dd[i + 2] * k + 170 * k * bloom);
      dd[i + 3] = clamp(255 * k);
    }
    t.putImageData(bim, 0, 0);
    ctx.save();
    ctx.filter = `blur(${8 + bloom * 30}px)`;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.54 * bloom;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  }

  const flare = ctx.createRadialGradient(w * 0.83, h * 0.08, 0, w * 0.83, h * 0.08, w * 0.70);
  flare.addColorStop(0, `rgba(255,246,198,${0.24 * strength})`);
  flare.addColorStop(0.38, `rgba(255,226,160,${0.09 * strength})`);
  flare.addColorStop(1, "rgba(255,226,160,0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, w, h);

  // paper + colored speckles
  im = ctx.getImageData(0, 0, w, h);
  d = im.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const n = (Math.sin(x * 0.78) + Math.sin(y * 0.51) + Math.sin((x + y) * 0.23)) * paper * 3.4
        + (Math.random() - 0.5) * paper * 7.5;
      d[i] = clamp(d[i] + n + paper * 5);
      d[i + 1] = clamp(d[i + 1] + n + paper * 4);
      d[i + 2] = clamp(d[i + 2] + n + paper * 1.5);
      if (Math.random() < splatter * 0.0025) {
        d[i] = clamp(d[i] + (Math.random() * 80 - 20) * splatter);
        d[i + 1] = clamp(d[i + 1] + (Math.random() * 60 - 10) * splatter);
        d[i + 2] = clamp(d[i + 2] - (Math.random() * 30) * splatter);
      }
    }
  }
  ctx.putImageData(im, 0, 0);
}

/** Referenzauflösung — pixelabhängige Effekte (Blur, Pinsel, Texturen). */
const REFERENCE_MAX_PX = 1900;

/**
 * Rendert die Aquarell-Archviz-Pipeline in eine neue Canvas der Zielgröße w×h.
 *
 * Die Referenzlogik läuft dabei auf einer temporären Canvas mit der
 * Referenzauflösung (max. 1900 px lange Kante), damit die Wirkung
 * pixelabhängiger Effekte erhalten bleibt; das Ergebnis wird anschließend auf
 * die Zielgröße skaliert. Es wird nichts dauerhaft gespeichert.
 */
export function renderAdjust(
  source: CanvasImageSource,
  w: number,
  h: number,
  params: AdjustParams,
): HTMLCanvasElement {
  const out = makeCanvas(w, h);
  const octx = out.getContext("2d", { willReadFrequently: true })!;

  // Alle Regler auf 0 → kein Effekt: Quelle unverändert durchreichen.
  const allZero = ADJUST_KEYS.every((k) => !((params as any)?.[k] > 0));
  if (allZero) {
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(source, 0, 0, w, h);
    return out;
  }

  const s = Math.min(1, REFERENCE_MAX_PX / Math.max(w, h));
  const rw = Math.max(1, Math.round(w * s));
  const rh = Math.max(1, Math.round(h * s));

  const workCanvas = makeCanvas(rw, rh);
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, rw, rh);
  const original = ctx.getImageData(0, 0, rw, rh);

  const v: AdjustParams = { ...DEFAULT_ADJUST, ...params };
  renderReference(workCanvas, ctx, original, v);

  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(workCanvas, 0, 0, w, h);
  return out;
}
