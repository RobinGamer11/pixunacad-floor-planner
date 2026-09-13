/**
 * DXF-Export-Adapter für das Bibliothekssystem.
 *
 *   LibraryDefinition → exportDefinitionToDxf() → ASCII-DXF (AC1015)
 *
 * Es wird eine eigenständige Datei mit Header (`$INSUNITS = 6`, also Meter),
 * einem BLOCK mit dem Objektnamen und einem INSERT am Ursprung erzeugt.
 * Der Adapter kennt weder Scene noch Renderer — Eingang ist ausschließlich
 * `LibraryGeometrySnapshot`.
 *
 * Koordinaten: PixunaCAD rechnet mit Y nach unten, DXF mit Y nach oben.
 * Daher `y_dxf = -y_pixuna`; dadurch dreht sich das Bogenvorzeichen um:
 * `dxfBulge = -2 * pixunaBulge` (PixunaCAD-Bulge = Pfeilhöhe/Sehnenlänge,
 * DXF-Bulge = tan(Öffnungswinkel/4)).
 *
 * Hinweis: `.pxobj` bleibt das verlustfreie Masterformat. DXF gibt die
 * sichtbare Geometrie wieder, nicht jede PixunaCAD-Wirkung (Muster, Aufrauen,
 * Kontureffekte, Drucksimulation).
 */
import type { LibraryDefinition, LibraryGeometrySnapshot } from "./types";

type Pt = { x: number; y: number };

const NL = "\r\n";

class Writer {
  private parts: string[] = [];
  pair(code: number, value: string | number) {
    this.parts.push(String(code), String(value));
  }
  toString() {
    return this.parts.join(NL) + NL;
  }
}

function num(n: number): string {
  return (Number.isFinite(n) ? n : 0).toFixed(6);
}

/** Y-Achse spiegeln: PixunaCAD (Y ↓) → DXF (Y ↑). */
function d(p: Pt): Pt {
  return { x: p.x, y: -p.y };
}

function dxfBulge(pixuna: number): number {
  return -2 * (pixuna || 0);
}

function hexToAci(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return 7;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  if (r > 230 && g > 230 && b > 230) return 7;
  if (r < 30 && g < 30 && b < 30) return 7;
  const table: [number, number, number, number][] = [
    [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255],
    [5, 0, 0, 255], [6, 255, 0, 255], [8, 128, 128, 128], [9, 192, 192, 192],
  ];
  let best = 7, bestD = Infinity;
  for (const [aci, rr, gg, bb] of table) {
    const dd = (r - rr) ** 2 + (g - gg) ** 2 + (b - bb) ** 2;
    if (dd < bestD) { bestD = dd; best = aci; }
  }
  return best;
}

function hexToTrueColor(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  return m ? parseInt(m[1], 16) : null;
}

function sanitizeLayer(name: string): string {
  const s = String(name || "").replace(/[<>/\\":;?*|=`,]/g, "_").trim();
  return s || "PIXUNA";
}

export interface DxfExportResult {
  dxf: string;
  /** Verständliche Hinweise zu nicht 1:1 übertragbaren Inhalten. */
  warnings: string[];
}

/* ----------------------------------------------------------- Entitäten */

interface Ctx {
  w: Writer;
  layers: Set<string>;
  warn: (s: string) => void;
}

function common(ctx: Ctx, type: string, layer: string, color: string) {
  ctx.layers.add(layer);
  ctx.w.pair(0, type);
  ctx.w.pair(8, layer);
  const tc = hexToTrueColor(color);
  ctx.w.pair(62, hexToAci(color));
  if (tc != null) ctx.w.pair(420, tc);
}

function writeLineOrArc(ctx: Ctx, a: Pt, b: Pt, bulge: number, layer: string, color: string) {
  const A = d(a), B = d(b);
  if (!bulge) {
    common(ctx, "LINE", layer, color);
    ctx.w.pair(10, num(A.x)); ctx.w.pair(20, num(A.y)); ctx.w.pair(30, "0.0");
    ctx.w.pair(11, num(B.x)); ctx.w.pair(21, num(B.y)); ctx.w.pair(31, "0.0");
    return;
  }
  // Einzelne Bogenkante als zweipunktige LWPOLYLINE mit Bulge (exakt).
  common(ctx, "LWPOLYLINE", layer, color);
  ctx.w.pair(100, "AcDbEntity");
  ctx.w.pair(90, 2);
  ctx.w.pair(70, 0);
  ctx.w.pair(10, num(A.x)); ctx.w.pair(20, num(A.y)); ctx.w.pair(42, num(dxfBulge(bulge)));
  ctx.w.pair(10, num(B.x)); ctx.w.pair(20, num(B.y));
}

function writePolyline(ctx: Ctx, pts: Pt[], bulges: number[] | undefined, closed: boolean, layer: string, color: string) {
  if (pts.length < 2) return;
  common(ctx, "LWPOLYLINE", layer, color);
  ctx.w.pair(90, pts.length);
  ctx.w.pair(70, closed ? 1 : 0);
  pts.forEach((p, i) => {
    const P = d(p);
    ctx.w.pair(10, num(P.x));
    ctx.w.pair(20, num(P.y));
    const b = bulges?.[i];
    if (b) ctx.w.pair(42, num(dxfBulge(b)));
  });
}

function writeSolidHatch(ctx: Ctx, loops: { pts: Pt[]; bulges?: number[] }[], layer: string, color: string) {
  const usable = loops.filter((l) => l.pts.length >= 3);
  if (usable.length === 0) return;
  common(ctx, "HATCH", layer, color);
  ctx.w.pair(100, "AcDbHatch");
  ctx.w.pair(10, "0.0"); ctx.w.pair(20, "0.0"); ctx.w.pair(30, "0.0");
  ctx.w.pair(210, "0.0"); ctx.w.pair(220, "0.0"); ctx.w.pair(230, "1.0");
  ctx.w.pair(2, "SOLID");
  ctx.w.pair(70, 1); // solid
  ctx.w.pair(71, 0); // nicht assoziativ
  ctx.w.pair(91, usable.length);
  usable.forEach((loop, idx) => {
    ctx.w.pair(92, idx === 0 ? 1 : 16); // äußere Kontur / normale (Loch-)Kontur
    ctx.w.pair(72, 1); // Polylinie mit Bulge
    ctx.w.pair(73, 1); // geschlossen
    ctx.w.pair(93, loop.pts.length);
    loop.pts.forEach((p, i) => {
      const P = d(p);
      ctx.w.pair(10, num(P.x));
      ctx.w.pair(20, num(P.y));
      ctx.w.pair(42, num(dxfBulge(loop.bulges?.[i] || 0)));
    });
    ctx.w.pair(97, 0);
  });
  ctx.w.pair(75, 0);
  ctx.w.pair(76, 1);
  ctx.w.pair(98, 0);
}

function plainText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>(\s*)/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function writeText(ctx: Ctx, txt: string, insert: Pt, heightM: number, rotationRad: number, layer: string, color: string) {
  if (!txt) return;
  const P = d(insert);
  common(ctx, "TEXT", layer, color);
  ctx.w.pair(10, num(P.x)); ctx.w.pair(20, num(P.y)); ctx.w.pair(30, "0.0");
  ctx.w.pair(40, num(Math.max(0.001, heightM)));
  ctx.w.pair(1, txt);
  const deg = (-rotationRad * 180) / Math.PI;
  if (deg) ctx.w.pair(50, num(deg));
}

/* --------------------------------------------------------- Snapshot-Weg */

function writeSnapshot(ctx: Ctx, s: LibraryGeometrySnapshot) {
  const data: any = s.data || {};
  const layer = sanitizeLayer(data.sourceLayer || s.kind.toUpperCase());
  switch (s.kind) {
    case "segment":
      writeLineOrArc(ctx, data.a, data.b, data.bulge || 0, layer, data.color || "#000000");
      if (data.strokeEffects) ctx.warn("Kontureffekte von Linien wurden als einfache Geometrie exportiert.");
      return;
    case "hatch": {
      const pts: Pt[] = data.points || [];
      if (pts.length < 3) return;
      const holes: Pt[][] = data.holes || [];
      const filled = (data.fillAlphaPct ?? 0) > 0;
      if (filled) {
        writeSolidHatch(
          ctx,
          [{ pts, bulges: data.bulges }, ...holes.map((h, i) => ({ pts: h, bulges: data.holeBulges?.[i] }))],
          layer,
          data.fillColor || "#808080",
        );
        if (data.patternEnabled) ctx.warn("Schraffurmuster wurden als einfarbige Fläche exportiert.");
      }
      writePolyline(ctx, pts, data.bulges, true, layer, data.strokeColor || data.fillColor || "#000000");
      holes.forEach((h, i) => writePolyline(ctx, h, data.holeBulges?.[i], true, layer, data.strokeColor || "#000000"));
      return;
    }
    case "wall": {
      const corners: Pt[] = (data.corners || []).map((c: any) => (c && c.x !== undefined ? c : c?.point)).filter(Boolean);
      if (corners.length >= 2) {
        writePolyline(ctx, corners, data.bulges, false, sanitizeLayer(data.customName || "WAND"), data.color || "#000000");
        ctx.warn("Wände wurden als Mittellinie exportiert (Dicke und Verschneidung gehen verloren).");
      }
      return;
    }
    case "freeStroke": {
      const pts: Pt[] = data.points || [];
      if (pts.length >= 2) writePolyline(ctx, pts, undefined, false, layer, data.color || "#000000");
      if (data.imageSrc) ctx.warn("Bildstempel von Freihandlinien wurden nicht exportiert.");
      return;
    }
    case "dimension": {
      if (data.p1 && data.p2) writePolyline(ctx, [data.p1, data.p2], undefined, false, "MASSE", data.lineColor || "#000000");
      const len = data.p1 && data.p2 ? Math.hypot(data.p2.x - data.p1.x, data.p2.y - data.p1.y) : 0;
      const label = data.useFreeText && data.freeText ? String(data.freeText) : len.toFixed(Math.max(0, data.decimals ?? 2));
      const mid = data.placementPoint || (data.p1 && data.p2 ? { x: (data.p1.x + data.p2.x) / 2, y: (data.p1.y + data.p2.y) / 2 } : null);
      if (mid) writeText(ctx, label, mid, Math.max(0.05, len * 0.06), 0, "MASSE", data.textColor || "#000000");
      ctx.warn("Maßketten wurden als Linie mit Text exportiert (keine DXF-Bemaßung).");
      return;
    }
    case "textBox": {
      const txt = plainText(data.html);
      if (!txt) return;
      const h = Math.max(0.01, (data.heightM || 0.2) / 1.4);
      const c = data.center || { x: 0, y: 0 };
      writeText(ctx, txt, { x: c.x - (data.widthM || 0) / 2, y: c.y + h / 2 }, h, data.rotationRad || 0, layer, data.style?.color || "#000000");
      return;
    }
    case "table":
      ctx.warn("Tabellen wurden nicht nach DXF exportiert (nur im Pixuna-Format .pxobj enthalten).");
      return;
    default:
      ctx.warn(`Ein Objekt vom Typ „${s.kind}“ wurde nicht exportiert.`);
  }
}

/* ------------------------------------------------------------- Hauptlauf */

export function exportDefinitionToDxf(def: LibraryDefinition): DxfExportResult {
  const warnSet = new Set<string>();
  const body = new Writer();
  const ctx: Ctx = { w: body, layers: new Set<string>(), warn: (s) => warnSet.add(s) };

  for (const snap of def.geometry || []) {
    try { writeSnapshot(ctx, snap); } catch { ctx.warn("Ein Objekt konnte nicht nach DXF geschrieben werden."); }
  }

  const blockName = sanitizeLayer(def.name).toUpperCase().replace(/\s+/g, "_") || "PIXUNA_OBJEKT";
  const out = new Writer();

  // HEADER — Einheiten ausdrücklich Meter.
  out.pair(0, "SECTION"); out.pair(2, "HEADER");
  out.pair(9, "$ACADVER"); out.pair(1, "AC1015");
  out.pair(9, "$INSUNITS"); out.pair(70, 6);
  out.pair(9, "$MEASUREMENT"); out.pair(70, 1);
  out.pair(0, "ENDSEC");

  // TABLES — Layer.
  const layers = [...ctx.layers];
  out.pair(0, "SECTION"); out.pair(2, "TABLES");
  out.pair(0, "TABLE"); out.pair(2, "LAYER"); out.pair(70, layers.length + 1);
  for (const name of ["0", ...layers]) {
    out.pair(0, "LAYER"); out.pair(2, name); out.pair(70, 0); out.pair(62, 7); out.pair(6, "CONTINUOUS");
  }
  out.pair(0, "ENDTAB");
  out.pair(0, "ENDSEC");

  // BLOCKS — das Bibliotheksobjekt als benannter Block.
  out.pair(0, "SECTION"); out.pair(2, "BLOCKS");
  out.pair(0, "BLOCK");
  out.pair(8, "0"); out.pair(2, blockName); out.pair(70, 0);
  out.pair(10, "0.0"); out.pair(20, "0.0"); out.pair(30, "0.0");
  out.pair(3, blockName); out.pair(1, "");
  const bodyText = body.toString();
  out.pair(0, "ENDBLK"); // Platzhalter wird gleich ersetzt
  out.pair(8, "0");
  out.pair(0, "ENDSEC");

  // ENTITIES — INSERT am Ursprung.
  out.pair(0, "SECTION"); out.pair(2, "ENTITIES");
  out.pair(0, "INSERT"); out.pair(8, "0"); out.pair(2, blockName);
  out.pair(10, "0.0"); out.pair(20, "0.0"); out.pair(30, "0.0");
  out.pair(41, "1.0"); out.pair(42, "1.0"); out.pair(43, "1.0"); out.pair(50, "0.0");
  out.pair(0, "ENDSEC");
  out.pair(0, "EOF");

  // Blockinhalt an der richtigen Stelle einfügen.
  const dxf = out.toString().replace(`0${NL}ENDBLK${NL}`, `${bodyText}0${NL}ENDBLK${NL}`);

  const meta = [
    `999${NL}PixunaCAD Bibliotheksobjekt: ${def.name}`,
    def.category ? `999${NL}Kategorie: ${def.category}` : "",
    def.tags?.length ? `999${NL}Tags: ${def.tags.join(", ")}` : "",
  ].filter(Boolean).join(NL);

  return { dxf: (meta ? meta + NL : "") + dxf, warnings: [...warnSet] };
}
