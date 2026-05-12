/**
 * Lightweight HTML → Canvas rich-text renderer.
 *
 * Parses simple inline markup produced by `contenteditable` + `execCommand`
 * (b, strong, i, em, span style="color/font-size", font, br, div/p) into
 * styled "runs" and draws them onto a Canvas with line-wrapping and alignment.
 *
 * Not a full HTML engine — just enough for our text boxes.
 */

export interface RichRun {
  text: string;
  bold: boolean;
  italic: boolean;
  color: string | null;
  sizeOverridePx: number | null;
}

interface ParseStyle {
  bold: boolean;
  italic: boolean;
  color: string | null;
  sizePx: number | null;
}

const FONT_SIZE_TABLE: Record<string, number> = {
  "1": 10, "2": 13, "3": 16, "4": 18, "5": 24, "6": 32, "7": 48,
};

function parseInlineSize(value: string): number | null {
  if (!value) return null;
  const m = value.trim().match(/^([\d.]+)\s*(px|pt)?$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  if ((m[2] || "px").toLowerCase() === "pt") return num * 1.333;
  return num;
}

function parseInlineStyle(styleAttr: string | null): { color: string | null; sizePx: number | null; bold: boolean; italic: boolean } {
  const out = { color: null as string | null, sizePx: null as number | null, bold: false, italic: false };
  if (!styleAttr) return out;
  for (const part of styleAttr.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (key === "color") out.color = value;
    else if (key === "font-size") out.sizePx = parseInlineSize(value);
    else if (key === "font-weight") {
      const v = value.toLowerCase();
      if (v === "bold" || v === "bolder" || (parseInt(v, 10) >= 600)) out.bold = true;
    } else if (key === "font-style") {
      if (value.toLowerCase() === "italic") out.italic = true;
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
      color: style.color,
      sizeOverridePx: style.sizePx,
    });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    runs.push({ text: "\n", bold: style.bold, italic: style.italic, color: style.color, sizeOverridePx: style.sizePx });
    return;
  }

  // Block-level → newline before content (unless already at start)
  const isBlock = (tag === "div" || tag === "p");
  if (isBlock && runs.length > 0 && !runs[runs.length - 1].text.endsWith("\n")) {
    runs.push({ text: "\n", bold: style.bold, italic: style.italic, color: style.color, sizeOverridePx: style.sizePx });
  }

  const next: ParseStyle = { ...style };
  if (tag === "b" || tag === "strong") next.bold = true;
  if (tag === "i" || tag === "em") next.italic = true;
  if (tag === "font") {
    const color = el.getAttribute("color");
    if (color) next.color = color;
    const size = el.getAttribute("size");
    if (size && FONT_SIZE_TABLE[size] != null) next.sizePx = FONT_SIZE_TABLE[size];
  }
  const inline = parseInlineStyle(el.getAttribute("style"));
  if (inline.color) next.color = inline.color;
  if (inline.sizePx != null) next.sizePx = inline.sizePx;
  if (inline.bold) next.bold = true;
  if (inline.italic) next.italic = true;

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

export function htmlToRuns(html: string): RichRun[] {
  if (!_scratchContainer.parentNode) document.body.appendChild(_scratchContainer);
  _scratchContainer.innerHTML = html || "";
  const runs: RichRun[] = [];
  walk(_scratchContainer, { bold: false, italic: false, color: null, sizePx: null }, runs);
  // Trim leading newline produced by leading block-level elements
  if (runs.length && runs[0].text === "\n") runs.shift();
  return runs;
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
  baseFontSizePx: number,
  baseColor: string,
  maxWidthPx: number,
  wrap: boolean,
): Line[] {
  const positioned: PositionedRun[] = runs.map(r => ({
    ...r,
    fontSizePx: r.sizeOverridePx ?? baseFontSizePx,
    effectiveColor: r.color || baseColor,
  }));

  const lines: Line[] = [];
  let cur: Line = { segments: [], width: 0, height: 0, ascent: 0 };

  const pushLine = () => {
    if (cur.segments.length === 0) {
      // Empty line — give it the base font height
      cur.height = baseFontSizePx * 1.2;
      cur.ascent = baseFontSizePx * 0.8;
    }
    lines.push(cur);
    cur = { segments: [], width: 0, height: 0, ascent: 0 };
  };

  const addText = (run: PositionedRun, text: string) => {
    if (!text.length) return;
    const w = measureChunk(ctx, run, text);
    cur.segments.push({ run, text, width: w });
    cur.width += w;
    const lh = run.fontSizePx * 1.2;
    if (lh > cur.height) cur.height = lh;
    const asc = run.fontSizePx * 0.8;
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
          // Word wrap
          const words = chunk.split(/(\s+)/);
          for (const word of words) {
            if (!word.length) continue;
            const wordWidth = measureChunk(ctx, run, word);
            if (cur.width + wordWidth <= maxWidthPx || cur.segments.length === 0) {
              addText(run, word);
            } else {
              pushLine();
              // skip leading whitespace on the new line
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
  baseFontSizePx: number;
  baseColor: string;
  bgColor: string;
  bgAlpha: number;
  align: "left" | "center" | "right";
  wrap: boolean;
  borderEnabled: boolean;
  borderColor: string;
  borderWidthPx: number;
  paddingPx: number;
}

export function drawRichTextBox(opts: DrawTextBoxOptions) {
  const {
    ctx, centerScreenX, centerScreenY, widthPx, heightPx, rotationRad,
    html, baseFontSizePx, baseColor, bgColor, bgAlpha, align, wrap,
    borderEnabled, borderColor, borderWidthPx, paddingPx,
  } = opts;

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
  const runs = htmlToRuns(html);
  const lines = layoutLines(ctx, runs, baseFontSizePx, baseColor, innerW, wrap);

  // Draw lines
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
  baseFontSizePx: number,
  maxInnerWidthPx: number,
  wrap: boolean,
  paddingPx: number,
): { widthPx: number; heightPx: number } {
  if (!_measureCtx) return { widthPx: 0, heightPx: 0 };
  const runs = htmlToRuns(html || "");
  const lines = layoutLines(_measureCtx, runs, baseFontSizePx, "#000", maxInnerWidthPx, wrap);
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

