/**
 * SVG-Export-Adapter für das Bibliothekssystem.
 *
 *   LibraryDefinition → exportDefinitionToSvg() → SVG-Datei
 *
 * Das verlustfreie Masterformat bleibt `.pxobj`. Der SVG-Export bildet die
 * Geometrie visuell möglichst korrekt ab. Die Zeichenengine wird nicht
 * verwendet und nicht verändert.
 */
import { snapshotsBounds } from "./libraryGeometry";
import type { LibraryDefinition, LibraryGeometrySnapshot } from "./types";

/** SVG-Benutzereinheiten pro Meter (1 Einheit = 1 cm). */
const UPM = 100;

const esc = (s: string) =>
  String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string));

const n = (x: number) => (Math.round(x * 1000) / 1000).toString();

function pts(list: { x: number; y: number }[]): string {
  return list.map((p) => `${n(p.x * UPM)},${n(p.y * UPM)}`).join(" ");
}

function strokeW(thicknessM: number | undefined, fallbackPx = 1): number {
  if (typeof thicknessM === "number" && thicknessM > 0) return Math.max(0.2, thicknessM * UPM);
  return fallbackPx;
}

function plainText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function snapshotToSvg(snap: LibraryGeometrySnapshot): string {
  const d: any = snap.data || {};
  switch (snap.kind) {
    case "segment": {
      const a = d.a, b = d.b;
      if (!a || !b) return "";
      return `<line x1="${n(a.x * UPM)}" y1="${n(a.y * UPM)}" x2="${n(b.x * UPM)}" y2="${n(b.y * UPM)}" stroke="${esc(d.color || "#000000")}" stroke-width="${n(strokeW(d.thicknessM))}" stroke-linecap="round" fill="none"/>`;
    }
    case "hatch": {
      const outer: any[] = d.points || [];
      if (outer.length < 3) return "";
      const holes: any[][] = d.holes || [];
      const fill = d.fillColor && d.fillAlphaPct > 0 ? esc(d.fillColor) : "none";
      const fillOpacity = Math.max(0, Math.min(100, d.fillAlphaPct ?? 100)) / 100;
      const stroke = d.strokeColor ? esc(d.strokeColor) : "none";
      const sw = Math.max(0.2, (d.strokeWidthPx ?? 1) * 0.35);
      if (holes.length === 0) {
        return `<polygon points="${pts(outer)}" fill="${fill}" fill-opacity="${n(fillOpacity)}" stroke="${stroke}" stroke-width="${n(sw)}"/>`;
      }
      const loop = (l: any[]) => `M ${l.map((p) => `${n(p.x * UPM)} ${n(p.y * UPM)}`).join(" L ")} Z`;
      const path = [outer, ...holes].map(loop).join(" ");
      return `<path d="${path}" fill-rule="evenodd" fill="${fill}" fill-opacity="${n(fillOpacity)}" stroke="${stroke}" stroke-width="${n(sw)}"/>`;
    }
    case "wall": {
      const corners: any[] = d.corners || [];
      if (corners.length < 2) return "";
      return `<polyline points="${pts(corners)}" fill="none" stroke="${esc(d.color || "#333333")}" stroke-width="${n(strokeW(d.thicknessM, 2))}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    case "freeStroke": {
      const p: any[] = d.points || [];
      if (p.length < 2) return "";
      return `<polyline points="${pts(p)}" fill="none" stroke="${esc(d.color || "#000000")}" stroke-width="${n(strokeW(d.thicknessM))}" stroke-opacity="${n(Math.max(0, Math.min(1, (d.opacity ?? 100) / 100)))}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    case "dimension": {
      const a = d.p1, b = d.p2;
      if (!a || !b) return "";
      const color = esc(d.lineColor || "#000000");
      const label = d.useFreeText && d.freeText ? esc(d.freeText) : "";
      const mid = { x: ((a.x + b.x) / 2) * UPM, y: ((a.y + b.y) / 2) * UPM };
      const line = `<line x1="${n(a.x * UPM)}" y1="${n(a.y * UPM)}" x2="${n(b.x * UPM)}" y2="${n(b.y * UPM)}" stroke="${color}" stroke-width="0.6"/>`;
      const text = label ? `<text x="${n(mid.x)}" y="${n(mid.y - 2)}" font-size="6" text-anchor="middle" fill="${esc(d.textColor || color)}">${label}</text>` : "";
      return line + text;
    }
    case "textBox": {
      const c = d.center;
      if (!c) return "";
      const text = plainText(d.html);
      if (!text) return "";
      const size = Math.max(2, (d.heightM || 0.1) * UPM * 0.6);
      return `<text x="${n(c.x * UPM)}" y="${n(c.y * UPM)}" font-size="${n(size)}" text-anchor="middle" dominant-baseline="middle" fill="${esc(d.style?.color || "#000000")}">${esc(text)}</text>`;
    }
    case "table": {
      const c = d.center;
      if (!c) return "";
      const w = (d.widthM || 0.4) * UPM, h = (d.heightM || 0.2) * UPM;
      return `<rect x="${n(c.x * UPM - w / 2)}" y="${n(c.y * UPM - h / 2)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="#666666" stroke-width="0.6"/>`;
    }
    default:
      return "";
  }
}

export function exportDefinitionToSvg(def: LibraryDefinition): string {
  const geo = def.geometry || [];
  const b = snapshotsBounds(geo);
  const pad = 0.05;
  const minX = (b.minX - pad) * UPM;
  const minY = (b.minY - pad) * UPM;
  const width = Math.max(1, (b.maxX - b.minX + pad * 2) * UPM);
  const height = Math.max(1, (b.maxY - b.minY + pad * 2) * UPM);
  const body = geo.map(snapshotToSvg).filter(Boolean).join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
     viewBox="${n(minX)} ${n(minY)} ${n(width)} ${n(height)}"
     width="${n(width)}mm" height="${n(height)}mm"
     data-pixuna-name="${esc(def.name)}" data-pixuna-category="${esc(def.category || "")}">
  <title>${esc(def.name)}</title>
  <desc>PixunaCAD Bibliotheksobjekt${def.category ? ` — ${esc(def.category)}` : ""}${def.tags?.length ? ` — ${esc(def.tags.join(", "))}` : ""}</desc>
  <g>
    ${body}
  </g>
</svg>
`;
}
