/**
 * Lightweight HTML → Canvas rich-text renderer.
 *
 * Parses simple inline markup produced by `contenteditable` + `execCommand`
 * (b, strong, i, em, span style="color/font-size", font, br, div/p) into
 * styled "runs" and draws them onto a Canvas with line-wrapping and alignment.
 *
 * Not a full HTML engine — just enough for our text boxes.
 */

import { cssPxToPt, ptToCssPx } from "./textTypography";

export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  sizeOverridePt: number | null;
}

interface ParseStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  sizePt: number | null;
}

/** Basis-Textstil einer Textbox (gilt für alle Runs ohne eigene Auszeichnung). */
export interface BaseTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

const FONT_SIZE_TABLE: Record<string, number> = {
  "1": 10, "2": 13, "3": 16, "4": 18, "5": 24, "6": 32, "7": 48,
};

function parseInlineSizePt(value: string): number | null {
  if (!value) return null;
  const m = value.trim().match(/^([\d.]+)\s*(px|pt)?$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  if ((m[2] || "px").toLowerCase() === "pt") return num;
  return cssPxToPt(num);
}

function parseInlineStyle(styleAttr: string | null): { color: string | null; sizePt: number | null; bold: boolean; italic: boolean; underline: boolean; strike: boolean } {
  const out = { color: null as string | null, sizePt: null as number | null, bold: false, italic: false, underline: false, strike: false };
  if (!styleAttr) return out;
  for (const part of styleAttr.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key === "color") out.color = value;
    else if (key === "font-size") out.sizePt = parseInlineSizePt(value);
    else if (key === "font-weight") {
      const v = value.toLowerCase();
      if (v === "bold" || v === "bolder" || (parseInt(v, 10) >= 600)) out.bold = true;
    } else if (key === "font-style") {
      if (value.toLowerCase() === "italic") out.italic = true;
    } else if (key === "text-decoration" || key === "text-decoration-line") {
      const v = value.toLowerCase();
      if (v.includes("underline")) out.underline = true;
      if (v.includes("line-through")) out.strike = true;
    }
  }
  return out;
}

function walk(node: Node, style: ParseStyle, runs: RichRun[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node.textContent || "";
    if (!t.length) return;
    runs.push({
      text: t,
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      strike: style.strike,
      color: style.color,
      sizeOverridePt: style.sizePt,
    });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    runs.push({ text: "\n", bold: style.bold, italic: style.italic, underline: style.underline, strike: style.strike, color: style.color, sizeOverridePt: style.sizePt });
    return;
  }

  // Block-level → newline before content (unless already at start)
  const isBlock = (tag === "div" || tag === "p");
  if (isBlock && runs.length > 0 && !runs[runs.length - 1].text.endsWith("\n")) {
    runs.push({ text: "\n", bold: style.bold, italic: style.italic, underline: style.underline, strike: style.strike, color: style.color, sizeOverridePt: style.sizePt });
  }

  const next: ParseStyle = { ...style };
  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;
  if (tag === "u" || tag === "ins") next.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  if (tag === "font") {
    const color = el.getAttribute("color");
    if (color) next.color = color;
    const size = el.getAttribute("size");
    if (size && FONT_SIZE_TABLE[size] != null) next.sizePt = cssPxToPt(FONT_SIZE_TABLE[size]);
  }
  const canonicalPt = parseFloat(el.getAttribute("data-font-size-pt") || "");
  if (Number.isFinite(canonicalPt) && canonicalPt > 0) next.sizePt = canonicalPt;
  const inline = parseInlineStyle(el.getAttribute("style"));
  if (inline.color) next.color = inline.color;
  if (inline.sizePt != null && next.sizePt == null) next.sizePt = inline.sizePt;
  if (inline.bold) next.bold = true;
  if (inline.italic) next.italic = true;
  if (inline.underline) next.underline = true;
  if (inline.strike) next.strike = true;

  for (const child of Array.from(el.childNodes)) {
    walk(child, next, runs);
  }
}

const _scratchContainer: HTMLDivElement = (() => {
  const d = document.createElement("div");
  d.style.position = "absolute";
  d.style.visibility = "hidden";
  d.style.pointerEvents = "none";
  d.style.left = "-99999px";
  d.style.top = "0";
  return d;
})();

export function htmlToRuns(html: string, base?: BaseTextStyle): RichRun[] {
  if (!_scratchContainer.parentNode) document.body.appendChild(_scratchContainer);
  _scratchContainer.innerHTML = html || "";
  const runs: RichRun[] = [];
  walk(_scratchContainer, {
    bold: !!base?.bold,
    italic: !!base?.italic,
    underline: !!base?.underline,
    strike: !!base?.strike,
    color: null,
    sizePt: null,
  }, runs);
  // Trim leading newline produced by leading block-level elements
  if (runs.length && runs[0].text === "\n") runs.shift();
  return runs;
}

/**
 * Migriert nur die typografischen Größen eines Legacy-HTML-Fragments in die
 * kanonische Dokumenteinheit. Sonstige Markup-Struktur bleibt unangetastet.
 */
export function normalizeRichTextHtml(html: string): string {
  const root = document.createElement("div");
  root.innerHTML = (html || "").replace(/\u200B/g, "");
  root.querySelectorAll<HTMLElement>("[style*='font-size'], font[size]").forEach(node => {
    if (!node.dataset.fontSizePt) {
      const fontSize = node.style.fontSize;
      const legacyFontSize = node.tagName.toLowerCase() === "font"
        ? FONT_SIZE_TABLE[node.getAttribute("size") || ""]
        : undefined;
      const pt = fontSize ? parseInlineSizePt(fontSize) : (legacyFontSize ? cssPxToPt(legacyFontSize) : null);
      if (pt != null && pt > 0) node.dataset.fontSizePt = String(pt);
    }
    node.style.removeProperty("font-size");
    node.removeAttribute("size");
    if (!node.getAttribute("style")) node.removeAttribute("style");
  });
  return root.innerHTML;
}

interface PositionedRun extends RichRun {
  fontSizePx: number;
  effectiveColor: string;
}

interface Line {
  segments: { run: PositionedRun; text: string; width: number }[];
  width: number;
  height: number;
  ascent: number;
}

function fontStringFor(run: PositionedRun): string {
  const weight = run.bold ? "700" : "400";
  const style = run.italic ? "italic" : "normal";
  return `${style} ${weight} ${run.fontSizePx}px system-ui, Arial, sans-serif`;
}

function measureChunk(ctx: CanvasRenderingContext2D, run: PositionedRun, text: string): number {
  ctx.font = fontStringFor(run);
  return ctx.measureText(text).width;
}

function layoutLines(
  ctx: CanvasRenderingContext2D,
  runs: RichRun[],
  baseFontSizePt: number,
  baseColor: string,
  maxWidthPx: number,
  wrap: boolean,
  lineFactor = 1.05,
  displayScale = 1,
): Line[] {
  const positioned: PositionedRun[] = runs.map(r => ({
    ...r,
    fontSizePx: ptToCssPx(r.sizeOverridePt ?? baseFontSizePt) * displayScale,
    effectiveColor: r.color || baseColor,
  }));

  const lines: Line[] = [];
  let cur: Line = { segments: [], width: 0, height: 0, ascent: 0 };

  const pushLine = () => {
    if (cur.segments.length === 0) {
      // Empty line — give it the base font height
      const basePx = ptToCssPx(baseFontSizePt) * displayScale;
      cur.height = basePx * lineFactor;
      cur.ascent = basePx * 0.86;
    }
    lines.push(cur);
    cur = { segments: [], width: 0, height: 0, ascent: 0 };
  };

  const addText = (run: PositionedRun, text: string) => {
    if (!text.length) return;
    const w = measureChunk(ctx, run, text);
    cur.segments.push({ run, text, width: w });
    cur.width += w;
    const lh = run.fontSizePx * lineFactor;
    if (lh > cur.height) cur.height = lh;
    const asc = run.fontSizePx * 0.86;
    if (asc > cur.ascent) cur.ascent = asc;
  };

  for (const run of positioned) {
    // Split on explicit newlines first
    const parts = run.text.split("\n");
    for (let pi = 0; pi < parts.length; pi++) {
      let chunk = parts[pi];
      if (chunk.length > 0) {
        if (!wrap) {
          addText(run, chunk);
        } else {
          // Word wrap (with character-level break for words wider than the line)
          const words = chunk.split(/(\s+)/);
          for (const word of words) {
            if (!word.length) continue;
            const wordWidth = measureChunk(ctx, run, word);
            if (cur.width + wordWidth <= maxWidthPx || (cur.segments.length === 0 && wordWidth <= maxWidthPx)) {
              addText(run, word);
            } else if (wordWidth > maxWidthPx && !/^\s+$/.test(word)) {
              // Word longer than a full line — break by character.
              let buf = "";
              for (const ch of word) {
                const test = buf + ch;
                const testW = measureChunk(ctx, run, test);
                if (cur.width + testW > maxWidthPx && (buf.length > 0 || cur.segments.length > 0)) {
                  if (buf.length > 0) addText(run, buf);
                  pushLine();
                  buf = ch;
                } else {
                  buf = test;
                }
              }
              if (buf.length > 0) addText(run, buf);
            } else {
              pushLine();
              if (/^\s+$/.test(word)) continue;
              addText(run, word);
            }
          }
        }
      }
      if (pi < parts.length - 1) pushLine();
    }
  }
  pushLine();
  // If last line is empty AND it's the only one with no real content, keep it (so empty boxes have a line height)
  return lines;
}

export interface DrawTextBoxOptions {
  ctx: CanvasRenderingContext2D;
  centerScreenX: number;
  centerScreenY: number;
  widthPx: number;
  heightPx: number;
  rotationRad: number;
  html: string;
  baseFontSizePt: number;
  /** Camera/display multiplier only; never persisted in rich text. */
  displayScale?: number;
  baseColor: string;
  bgColor: string;
  bgAlpha: number;
  /** Deckkraft des Textes (0..1). */
  textAlpha?: number;
  align: "left" | "center" | "right";
  wrap: boolean;
  baseBold?: boolean;
  baseItalic?: boolean;
  baseUnderline?: boolean;
  baseStrike?: boolean;
  /** Zeilenabstand in Prozent der Schriftgröße (100 = einzeilig). */
  lineHeightPct?: number;
  borderEnabled: boolean;
  borderColor: string;
  borderWidthPx: number;
  paddingPx: number;
}

export function drawRichTextBox(opts: DrawTextBoxOptions) {
  const {
    ctx, centerScreenX, centerScreenY, widthPx, heightPx, rotationRad,
    html, baseFontSizePt, baseColor, bgColor, bgAlpha, align, wrap,
    borderEnabled, borderColor, borderWidthPx, paddingPx,
  } = opts;
  const lineFactor = Math.max(0.6, (opts.lineHeightPct ?? 105) / 100);
  const baseStyle: BaseTextStyle = {
    bold: opts.baseBold, italic: opts.baseItalic,
    underline: opts.baseUnderline, strike: opts.baseStrike,
  };

  ctx.save();
  ctx.translate(centerScreenX, centerScreenY);
  ctx.rotate(rotationRad);

  // Background
  if (bgAlpha > 0) {
    ctx.globalAlpha = bgAlpha;
    ctx.fillStyle = bgColor;
    ctx.fillRect(-widthPx / 2, -heightPx / 2, widthPx, heightPx);
    ctx.globalAlpha = 1;
  }

  // Border
  if (borderEnabled && borderWidthPx > 0) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidthPx;
    ctx.strokeRect(-widthPx / 2, -heightPx / 2, widthPx, heightPx);
  }

  // Clip to inner area (so overflowing text doesn't bleed out)
  ctx.beginPath();
  ctx.rect(-widthPx / 2, -heightPx / 2, widthPx, heightPx);
  ctx.clip();

  // Layout
  const innerW = Math.max(1, widthPx - paddingPx * 2);
  const runs = htmlToRuns(html, baseStyle);
  const lines = layoutLines(ctx, runs, baseFontSizePt, baseColor, innerW, wrap, lineFactor, opts.displayScale ?? 1);

  // Draw lines
  const textAlpha = Math.max(0, Math.min(1, opts.textAlpha ?? 1));
  ctx.globalAlpha = textAlpha;
  ctx.textBaseline = "alphabetic";
  let y = -heightPx / 2 + paddingPx;
  for (const line of lines) {
    const lineY = y + line.ascent;
    let xStart: number;
    if (align === "center") xStart = -line.width / 2;
    else if (align === "right") xStart = widthPx / 2 - paddingPx - line.width;
    else xStart = -widthPx / 2 + paddingPx;

    let cx = xStart;
    for (const seg of line.segments) {
      ctx.font = fontStringFor(seg.run);
      ctx.fillStyle = seg.run.effectiveColor;
      ctx.fillText(seg.text, cx, lineY);
      if (seg.run.underline || seg.run.strike) {
        const lw = Math.max(0.6, seg.run.fontSizePx * 0.07);
        ctx.strokeStyle = seg.run.effectiveColor;
        ctx.lineWidth = lw;
        if (seg.run.underline) {
          const uy = lineY + seg.run.fontSizePx * 0.14;
          ctx.beginPath(); ctx.moveTo(cx, uy); ctx.lineTo(cx + seg.width, uy); ctx.stroke();
        }
        if (seg.run.strike) {
          const sy = lineY - seg.run.fontSizePx * 0.28;
          ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(cx + seg.width, sy); ctx.stroke();
        }
      }
      cx += seg.width;
    }
    y += line.height;
  }

  ctx.restore();
}

/** Scratch canvas for offline text measurement (independent of camera). */
const _measureCanvas = (typeof document !== "undefined") ? document.createElement("canvas") : null;
const _measureCtx = _measureCanvas ? _measureCanvas.getContext("2d") : null;

/**
 * Measures the natural pixel size of a text-box's content given the current
 * style. Used for auto-grow:
 *  - wrap=true:  caller passes the desired widthPx; height grows.
 *  - wrap=false: caller passes Infinity for widthPx; both width & height grow.
 *
 * Returns {widthPx, heightPx} INCLUDING padding on all sides.
 */
export function measureTextBoxContent(
  html: string,
  baseFontSizePt: number,
  maxInnerWidthPx: number,
  wrap: boolean,
  paddingPx: number,
  base?: BaseTextStyle & { lineHeightPct?: number },
): { widthPx: number; heightPx: number } {
  if (!_measureCtx) return { widthPx: 0, heightPx: 0 };
  const runs = htmlToRuns(html || "", base);
  const lineFactor = Math.max(0.6, (base?.lineHeightPct ?? 105) / 100);
  const lines = layoutLines(_measureCtx, runs, baseFontSizePt, "#000", maxInnerWidthPx, wrap, lineFactor, 1);
  let maxLineW = 0;
  let totalH = 0;
  for (const line of lines) {
    if (line.width > maxLineW) maxLineW = line.width;
    totalH += line.height;
  }
  return {
    widthPx: maxLineW + paddingPx * 2,
    heightPx: totalH + paddingPx * 2,
  };
}

