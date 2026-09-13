/**
 * SVG-Import-Adapter für das Bibliothekssystem.
 *
 * Der Adapter ist bewusst vollständig getrennt von der Zeichenengine:
 *
 *   SVG-Datei → importSvgToSnapshots() → LibraryGeometrySnapshot[]
 *             → LibraryDefinition (LibraryManager)
 *
 * Es werden KEINE Scene-Objekte erzeugt und keine bestehenden Werkzeuge
 * verändert. Spätere DXF-/DWG-Adapter docken an derselben Stelle an.
 */
import type { LibraryGeometrySnapshot } from "./types";

type Pt = { x: number; y: number };
/** Affine Matrix [a b c d e f] wie in SVG. */
type Mat = [number, number, number, number, number, number];

export interface SvgImportOptions {
  /**
   * SVG-Benutzereinheiten pro Meter.
   *
   * Verbindlicher PixunaCAD-Umrechnungsweg: **1 SVG-Benutzereinheit = 1 mm**,
   * also 1000 Einheiten pro Meter. Genau diesen Maßstab schreibt auch
   * `svgExport.ts` (viewBox in Millimetern, `width`/`height` mit „mm“).
   * Wird hier nichts angegeben, versucht der Import den Maßstab aus
   * `width`/`height` + `viewBox` der Datei zu ermitteln und fällt sonst auf
   * 1000 zurück.
   */
  unitsPerMeter?: number;
}

/** Verbindlicher Standardmaßstab: 1 SVG-Benutzereinheit = 1 mm. */
export const SVG_UNITS_PER_METER = 1000;


export interface SvgImportResult {
  snapshots: LibraryGeometrySnapshot[];
  /** Verständliche Hinweise zu vereinfachten oder ausgelassenen Elementen. */
  warnings: string[];
}

const IDENT: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function apply(m: Mat, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
function matScale(m: Mat): number {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  return (sx + sy) / 2 || 1;
}

function parseTransform(value: string | null): Mat {
  if (!value) return IDENT;
  let out: Mat = IDENT;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    const n = m[2].split(/[\s,]+/).map(Number).filter((x) => !Number.isNaN(x));
    switch (m[1]) {
      case "matrix": if (n.length >= 6) out = mul(out, [n[0], n[1], n[2], n[3], n[4], n[5]]); break;
      case "translate": out = mul(out, [1, 0, 0, 1, n[0] || 0, n[1] || 0]); break;
      case "scale": out = mul(out, [n[0] ?? 1, 0, 0, n.length > 1 ? n[1] : (n[0] ?? 1), 0, 0]); break;
      case "rotate": {
        const a = ((n[0] || 0) * Math.PI) / 180;
        const cx = n[1] || 0, cy = n[2] || 0;
        out = mul(out, [1, 0, 0, 1, cx, cy]);
        out = mul(out, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
        out = mul(out, [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case "skewX": out = mul(out, [1, 0, Math.tan(((n[0] || 0) * Math.PI) / 180), 1, 0, 0]); break;
      case "skewY": out = mul(out, [1, Math.tan(((n[0] || 0) * Math.PI) / 180), 0, 1, 0, 0]); break;
    }
  }
  return out;
}

/* ------------------------------------------------------------- Stil */

interface Style {
  stroke: string | null;
  strokeWidth: number;
  strokeOpacity: number;
  fill: string | null;
  fillOpacity: number;
  opacity: number;
  fontSize: number;
}

const DEFAULT_STYLE: Style = {
  stroke: null, strokeWidth: 1, strokeOpacity: 1,
  fill: "#000000", fillOpacity: 1, opacity: 1, fontSize: 16,
};

function inlineStyle(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = el.getAttribute("style");
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function normColor(value: string | null | undefined, inherited: string | null): string | null {
  if (value == null || value === "") return inherited;
  const t = value.trim().toLowerCase();
  if (t === "none" || t === "transparent") return null;
  if (t === "currentcolor" || t === "inherit") return inherited;
  if (t.startsWith("url(")) return inherited;
  return value.trim();
}

function num(value: string | null | undefined, fallback: number): number {
  if (value == null || value === "") return fallback;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function resolveStyle(el: Element, parent: Style): Style {
  const css = inlineStyle(el);
  const get = (k: string) => css[k] ?? el.getAttribute(k);
  return {
    stroke: normColor(get("stroke"), parent.stroke),
    strokeWidth: num(get("stroke-width"), parent.strokeWidth),
    strokeOpacity: num(get("stroke-opacity"), parent.strokeOpacity),
    fill: normColor(get("fill"), parent.fill),
    fillOpacity: num(get("fill-opacity"), parent.fillOpacity),
    opacity: num(get("opacity"), parent.opacity),
    fontSize: num(get("font-size"), parent.fontSize),
  };
}

/* --------------------------------------------------------- Pfad-Parser */

interface SubPath { pts: Pt[]; closed: boolean }

function flattenPath(d: string, warn: (s: string) => void): SubPath[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const subs: SubPath[] = [];
  let cur: SubPath | null = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let prevCtrl: Pt | null = null;
  let cmd = "";
  let i = 0;
  const next = () => parseFloat(tokens[i++]);
  const push = (p: Pt) => { if (!cur) { cur = { pts: [], closed: false }; subs.push(cur); } cur.pts.push(p); };

  const bezier = (p0: Pt, p1: Pt, p2: Pt, p3: Pt) => {
    const steps = 24;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  };

  const arc = (p0: Pt, rx: number, ry: number, rot: number, laf: number, sf: number, p1: Pt) => {
    if (rx === 0 || ry === 0) { push(p1); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = (rot * Math.PI) / 180;
    const dx2 = (p0.x - p1.x) / 2, dy2 = (p0.y - p1.y) / 2;
    const x1 = Math.cos(phi) * dx2 + Math.sin(phi) * dy2;
    const y1 = -Math.sin(phi) * dx2 + Math.cos(phi) * dy2;
    let lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
    const sign = laf === sf ? -1 : 1;
    const numr = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const co = sign * Math.sqrt(Math.max(0, numr / (den || 1)));
    const cxp = (co * rx * y1) / ry, cyp = (-co * ry * x1) / rx;
    const ccx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (p0.x + p1.x) / 2;
    const ccy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (p0.y + p1.y) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => {
      const s = Math.sign(ux * vy - uy * vx) || 1;
      const c = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
      return s * Math.acos(Math.min(1, Math.max(-1, c)));
    };
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sf && dt > 0) dt -= 2 * Math.PI;
    if (sf && dt < 0) dt += 2 * Math.PI;
    const steps = Math.max(8, Math.ceil((Math.abs(dt) / Math.PI) * 24));
    for (let s = 1; s <= steps; s++) {
      const t = t1 + (dt * s) / steps;
      push({
        x: ccx + Math.cos(phi) * rx * Math.cos(t) - Math.sin(phi) * ry * Math.sin(t),
        y: ccy + Math.sin(phi) * rx * Math.cos(t) + Math.cos(phi) * ry * Math.sin(t),
      });
    }
  };

  while (i < tokens.length) {
    const tk = tokens[i];
    if (/[a-zA-Z]/.test(tk)) { cmd = tk; i++; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    switch (C) {
      case "M": {
        const x = next(), y = next();
        cx = rel ? cx + x : x; cy = rel ? cy + y : y;
        cur = { pts: [{ x: cx, y: cy }], closed: false };
        subs.push(cur);
        sx = cx; sy = cy; prevCtrl = null;
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": { const x = next(), y = next(); cx = rel ? cx + x : x; cy = rel ? cy + y : y; push({ x: cx, y: cy }); prevCtrl = null; break; }
      case "H": { const x = next(); cx = rel ? cx + x : x; push({ x: cx, y: cy }); prevCtrl = null; break; }
      case "V": { const y = next(); cy = rel ? cy + y : y; push({ x: cx, y: cy }); prevCtrl = null; break; }
      case "C": {
        const p0 = { x: cx, y: cy };
        const c1 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        const c2 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        const p1 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        bezier(p0, c1, c2, p1); cx = p1.x; cy = p1.y; prevCtrl = c2;
        break;
      }
      case "S": {
        const p0 = { x: cx, y: cy };
        const c1 = prevCtrl ? { x: 2 * cx - prevCtrl.x, y: 2 * cy - prevCtrl.y } : p0;
        const c2 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        const p1 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        bezier(p0, c1, c2, p1); cx = p1.x; cy = p1.y; prevCtrl = c2;
        break;
      }
      case "Q": {
        const p0 = { x: cx, y: cy };
        const q = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        const p1 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        bezier(p0, { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) },
          { x: p1.x + (2 / 3) * (q.x - p1.x), y: p1.y + (2 / 3) * (q.y - p1.y) }, p1);
        cx = p1.x; cy = p1.y; prevCtrl = q;
        break;
      }
      case "T": {
        const p0 = { x: cx, y: cy };
        const q = prevCtrl ? { x: 2 * cx - prevCtrl.x, y: 2 * cy - prevCtrl.y } : p0;
        const p1 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        bezier(p0, { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) },
          { x: p1.x + (2 / 3) * (q.x - p1.x), y: p1.y + (2 / 3) * (q.y - p1.y) }, p1);
        cx = p1.x; cy = p1.y; prevCtrl = q;
        break;
      }
      case "A": {
        const p0 = { x: cx, y: cy };
        const rx = next(), ry = next(), rot = next(), laf = next(), sf = next();
        const p1 = { x: (rel ? cx : 0) + next(), y: (rel ? cy : 0) + next() };
        arc(p0, rx, ry, rot, laf, sf, p1);
        cx = p1.x; cy = p1.y; prevCtrl = null;
        break;
      }
      case "Z": {
        if (cur) { cur.closed = true; cur = null; }
        cx = sx; cy = sy; prevCtrl = null;
        break;
      }
      default:
        warn(`Pfadbefehl „${cmd}“ wurde übersprungen.`);
        i++;
        break;
    }
  }
  return subs.filter((s) => s.pts.length > 1);
}

/* --------------------------------------------------------- Konvertierung */

function ellipsePoints(cx: number, cy: number, rx: number, ry: number): Pt[] {
  const out: Pt[] = [];
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return out;
}

function parsePointList(raw: string | null): Pt[] {
  if (!raw) return [];
  const n = raw.trim().split(/[\s,]+/).map(Number).filter((x) => !Number.isNaN(x));
  const out: Pt[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}

/** Physische Länge eines `width`/`height`-Attributs in Millimetern. */
function lengthToMm(raw: string | null): number | null {
  if (!raw) return null;
  const m = /^\s*(-?[\d.]+)\s*(mm|cm|m|in|pt|pc|px)?\s*$/i.exec(raw);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (m[2] || "px").toLowerCase();
  const perUnit: Record<string, number> = {
    mm: 1, cm: 10, m: 1000, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96,
  };
  return value * (perUnit[unit] ?? 25.4 / 96);
}

export function importSvgToSnapshots(svgText: string, opts: SvgImportOptions = {}): SvgImportResult {
  const warnSet = new Set<string>();
  const warn = (s: string) => warnSet.add(s);
  const snapshots: LibraryGeometrySnapshot[] = [];

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  } catch {
    return { snapshots: [], warnings: ["Die Datei konnte nicht als SVG gelesen werden."] };
  }
  const root = doc.querySelector("svg");
  if (!root || doc.querySelector("parsererror")) {
    return { snapshots: [], warnings: ["Die Datei enthält kein gültiges SVG."] };
  }

  // viewBox: Ursprung normalisieren.
  let base: Mat = IDENT;
  const vb = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const hasViewBox = vb.length === 4 && vb.every((n) => Number.isFinite(n));
  if (hasViewBox) {
    base = [1, 0, 0, 1, -vb[0], -vb[1]];
  }

  // Maßstab: ausdrückliche Vorgabe > physische Größe der Datei > 1 mm je Einheit.
  let upm = SVG_UNITS_PER_METER;
  if (opts.unitsPerMeter && opts.unitsPerMeter > 0) {
    upm = opts.unitsPerMeter;
  } else if (hasViewBox && vb[2] > 0) {
    const mm = lengthToMm(root.getAttribute("width"));
    if (mm) upm = (vb[2] / mm) * 1000;
  }




  const byId = new Map<string, Element>();
  doc.querySelectorAll("[id]").forEach((el) => byId.set(el.getAttribute("id")!, el));

  const w = (p: Pt) => ({ x: p.x / upm, y: p.y / upm });

  const addPoly = (pts: Pt[], closed: boolean, st: Style, m: Mat) => {
    const world = pts.map((p) => w(apply(m, p)));
    if (world.length < 2) return;
    const strokeW = st.strokeWidth * matScale(m);
    const hasFill = !!st.fill && closed;
    if (hasFill) {
      snapshots.push({
        kind: "hatch",
        data: {
          points: world,
          holes: [],
          fillColor: st.fill,
          strokeColor: st.stroke || st.fill,
          fillAlphaPct: Math.round(Math.max(0, Math.min(1, st.fillOpacity * st.opacity)) * 100),
          strokeWidthPx: st.stroke ? Math.max(0.5, strokeW) : 0.5,
          areaLabel: {},
          patternEnabled: false,
          bulges: world.map(() => 0),
          holeBulges: [],
          isPolygon: true,
          closed: true,
        },
      });
      return;
    }
    const color = st.stroke || "#000000";
    const thicknessM = Math.max(0.001, strokeW / upm);
    const n = closed ? world.length : world.length - 1;
    for (let i = 0; i < n; i++) {
      const a = world[i], b = world[(i + 1) % world.length];
      if (a.x === b.x && a.y === b.y) continue;
      snapshots.push({ kind: "segment", data: { a, b, color, thicknessM } });
    }
  };

  const walk = (el: Element, parentMat: Mat, parentStyle: Style, depth: number) => {
    if (depth > 24) { warn("Sehr tief verschachtelte Gruppen wurden abgebrochen."); return; }
    const tag = el.tagName.toLowerCase();
    if (tag === "defs" || tag === "symbol" || tag === "clippath" || tag === "mask" || tag === "style" || tag === "metadata" || tag === "title" || tag === "desc") return;

    const m = mul(parentMat, parseTransform(el.getAttribute("transform")));
    const st = resolveStyle(el, parentStyle);

    switch (tag) {
      case "svg":
      case "g":
      case "a":
        for (const c of Array.from(el.children)) walk(c, m, st, depth + 1);
        return;
      case "use": {
        const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
        const ref = href.startsWith("#") ? byId.get(href.slice(1)) : null;
        if (!ref) { warn("Ein <use>-Verweis konnte nicht aufgelöst werden."); return; }
        const um = mul(m, [1, 0, 0, 1, num(el.getAttribute("x"), 0), num(el.getAttribute("y"), 0)]);
        if (ref.tagName.toLowerCase() === "symbol") {
          for (const c of Array.from(ref.children)) walk(c, um, st, depth + 1);
        } else walk(ref, um, st, depth + 1);
        return;
      }
      case "line":
        addPoly([
          { x: num(el.getAttribute("x1"), 0), y: num(el.getAttribute("y1"), 0) },
          { x: num(el.getAttribute("x2"), 0), y: num(el.getAttribute("y2"), 0) },
        ], false, { ...st, fill: null }, m);
        return;
      case "polyline":
        addPoly(parsePointList(el.getAttribute("points")), false, { ...st, fill: null }, m);
        return;
      case "polygon":
        addPoly(parsePointList(el.getAttribute("points")), true, st, m);
        return;
      case "rect": {
        const x = num(el.getAttribute("x"), 0), y = num(el.getAttribute("y"), 0);
        const rw = num(el.getAttribute("width"), 0), rh = num(el.getAttribute("height"), 0);
        if (rw <= 0 || rh <= 0) return;
        if (num(el.getAttribute("rx"), 0) > 0 || num(el.getAttribute("ry"), 0) > 0) {
          warn("Abgerundete Ecken von Rechtecken wurden vereinfacht.");
        }
        addPoly([{ x, y }, { x: x + rw, y }, { x: x + rw, y: y + rh }, { x, y: y + rh }], true, st, m);
        return;
      }
      case "circle": {
        const r = num(el.getAttribute("r"), 0);
        if (r <= 0) return;
        addPoly(ellipsePoints(num(el.getAttribute("cx"), 0), num(el.getAttribute("cy"), 0), r, r), true, st, m);
        return;
      }
      case "ellipse": {
        const rx = num(el.getAttribute("rx"), 0), ry = num(el.getAttribute("ry"), 0);
        if (rx <= 0 || ry <= 0) return;
        addPoly(ellipsePoints(num(el.getAttribute("cx"), 0), num(el.getAttribute("cy"), 0), rx, ry), true, st, m);
        return;
      }
      case "path": {
        const d = el.getAttribute("d");
        if (!d) return;
        const subs = flattenPath(d, warn);
        if (subs.length > 1 && st.fill) warn("Zusammengesetzte Pfade wurden als getrennte Flächen übernommen (Löcher gehen verloren).");
        for (const s of subs) addPoly(s.pts, s.closed, s.closed ? st : { ...st, fill: null }, m);
        return;
      }
      case "text": {
        const txt = (el.textContent || "").trim();
        if (!txt) return;
        const p = w(apply(m, { x: num(el.getAttribute("x"), 0), y: num(el.getAttribute("y"), 0) }));
        const sizeM = (st.fontSize * matScale(m)) / upm;
        const widthM = Math.max(sizeM, txt.length * sizeM * 0.6);
        snapshots.push({
          kind: "textBox",
          data: {
            center: { x: p.x + widthM / 2, y: p.y - sizeM / 2 },
            widthM,
            heightM: sizeM * 1.4,
            rotationRad: 0,
            html: txt.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)),
            style: { color: st.fill || "#000000" },
          },
        });
        warn("Texte wurden als Textfelder mit geschätzter Größe übernommen.");
        return;
      }
      case "image":
        warn("Eingebettete Bilder werden nicht übernommen.");
        return;
      default:
        if (el.children.length) for (const c of Array.from(el.children)) walk(c, m, st, depth + 1);
        else warn(`SVG-Element <${tag}> wird nicht unterstützt.`);
        return;
    }
  };

  walk(root, base, DEFAULT_STYLE, 0);

  if (snapshots.length === 0) warn("Es konnte keine darstellbare Geometrie gefunden werden.");
  return { snapshots, warnings: [...warnSet] };
}
