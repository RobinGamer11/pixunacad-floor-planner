/**
 * Render-Dossier (Paket 01, Schritt 3).
 *
 * Erzeugt aus dem gemeinsamen Projektzustand einen Datensatz mit eindeutigen
 * Dossier-Kennungen (D001 …, eindeutig im ganzen Dossier) und verbindet jede
 * Kennung mit vollständigem Objektnamen, Objekt-ID (objCode), Blatt und interner ID.
 * Ausgabe als PDF (pdf-lib) und als JSON für die spätere KI-Übergabe.
 */
import { meshBounds } from "./solidMesh";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Derived3D } from "./geometryDerivation";
import type { ObjectAttachment } from "../objectMeta";

export interface RenderPresets {
  view: "3d" | "2d";
  timeOfDay: string;
  weather: string;
  season: string;
  style: string;
  mood: string;
  freeText: string;
  camera?: { tx: number; ty: number; tz: number; r: number; theta: number; phi: number };
}

export const DEFAULT_PRESETS: RenderPresets = {
  view: "3d", timeOfDay: "Mittag", weather: "Sonnig", season: "Sommer",
  style: "Fotorealistisch", mood: "Freundlich, hell", freeText: "",
};

export const PRESET_OPTIONS = {
  timeOfDay: ["Morgen", "Mittag", "Nachmittag", "Abenddämmerung", "Nacht"],
  weather: ["Sonnig", "Leicht bewölkt", "Bedeckt", "Regen", "Nebel", "Schnee"],
  season: ["Frühling", "Sommer", "Herbst", "Winter"],
  style: ["Fotorealistisch", "Architekturskizze", "Aquarell", "Modellfoto", "Minimalistisch"],
  mood: ["Freundlich, hell", "Warm, einladend", "Ruhig, sachlich", "Dramatisch", "Stimmungsvoll"],
};

export interface DossierObject {
  dossierId: string;
  name: string;
  objCode: string | null;
  kind: string;
  sheetId: string;
  sheetName: string;
  objectId: string;
  sizeM: { x: number; y: number; z: number };
  elevationM: { base: number; top: number };
  description: string;
  attachments: { name: string; type: string; category: string | null }[];
  center: { x: number; y: number; z: number };
}

export interface DossierData {
  version: 1;
  projectName: string;
  createdAt: string;
  presets: RenderPresets;
  objects: DossierObject[];
  workOrder: string;
}

export interface DossierInput {
  key: string; // sheetId::objectId
  sheetName: string;
  name: string;
  objCode: string | null;
  kind: string;
  description: string;
  attachments: ObjectAttachment[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fasst abgeleitete Körper je Objekt zusammen und vergibt eindeutige Kennungen. */
export function buildDossierData(projectName: string, items: Derived3D[], info: (key: string) => DossierInput | null, presets: RenderPresets): DossierData {
  const groups = new Map<string, Derived3D[]>();
  for (const d of items) {
    const k = `${d.sheetId}::${d.sourceId}`;
    const a = groups.get(k) || []; a.push(d); groups.set(k, a);
  }
  const objects: DossierObject[] = [];
  let n = 0;
  for (const [key, list] of groups) {
    const meta = info(key);
    if (!meta) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const d of list) {
      if (d.type === "mesh") {
        // Tatsächlich geneigte/begrenzte Geometrie.
        const b = meshBounds(d.mesh);
        minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); minY = Math.min(minY, b.minY); maxY = Math.max(maxY, b.maxY);
        z0 = Math.min(z0, b.minZ); z1 = Math.max(z1, b.maxZ);
        continue;
      }
      const pts = d.type === "prism" ? d.footprint : d.type === "plane" ? d.outline : d.points;
      for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
      const a = d.type === "prism" ? d.z0 : d.z, b = d.type === "prism" ? d.z1 : d.z;
      z0 = Math.min(z0, a); z1 = Math.max(z1, b);
    }
    if (!isFinite(minX)) continue;
    n++;
    const [sheetId, objectId] = key.split("::");
    objects.push({
      dossierId: `D${String(n).padStart(3, "0")}`,
      name: meta.name, objCode: meta.objCode, kind: meta.kind,
      sheetId, sheetName: meta.sheetName, objectId,
      sizeM: { x: r2(maxX - minX), y: r2(maxY - minY), z: r2(z1 - z0) },
      elevationM: { base: r2(z0), top: r2(z1) },
      description: meta.description,
      attachments: (meta.attachments || []).map(a => ({ name: a.name, type: a.type, category: a.category ?? null })),
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (z0 + z1) / 2 },
    });
  }
  return { version: 1, projectName, createdAt: new Date().toISOString(), presets, objects, workOrder: workOrderText(projectName, presets, objects) };
}

export function workOrderText(projectName: string, p: RenderPresets, objs: DossierObject[]): string {
  return [
    `Erstelle eine ${p.style.toLowerCase()}e Visualisierung des Projekts „${projectName}“ aus der beigefügten ${p.view === "3d" ? "3D-Kameraansicht" : "2D-Draufsicht"}.`,
    `Blickrichtung und Bildausschnitt exakt wie in der Zielansicht beibehalten; Geometrie, Proportionen und Lage der Objekte nicht verändern.`,
    `Tageszeit: ${p.timeOfDay}. Wetter: ${p.weather}. Jahreszeit: ${p.season}. Bildwirkung: ${p.mood}.`,
    `Die Kennungen D001–D${String(objs.length).padStart(3, "0")} der Zuordnungsansicht verweisen auf die Objekttabelle; Materialien und Ansichten gemäß den zugeordneten Referenzanlagen.`,
    p.freeText ? `Zusätzliche Hinweise: ${p.freeText}` : "",
  ].filter(Boolean).join("\n");
}

// ---------- PDF ----------
const A4L: [number, number] = [841.89, 595.28];
const GOLD = rgb(0.72, 0.6, 0.35);

/** WinAnsi-sichere Zeichen für Standardschriften. */
const safe = (s: string) => (s || "").replace(/[\u2013\u2014]/g, "-").replace(/[„“”]/g, '"').replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function header(page: PDFPage, bold: PDFFont, font: PDFFont, title: string, sub: string) {
  page.drawText(safe(title), { x: 36, y: A4L[1] - 44, size: 18, font: bold });
  page.drawText(safe(sub), { x: 36, y: A4L[1] - 62, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawLine({ start: { x: 36, y: A4L[1] - 70 }, end: { x: A4L[0] - 36, y: A4L[1] - 70 }, thickness: 1, color: GOLD });
}

async function imagePage(pdf: PDFDocument, bold: PDFFont, font: PDFFont, title: string, sub: string, png: string, badges?: { id: string; x: number; y: number }[], imgW?: number, imgH?: number) {
  const page = pdf.addPage(A4L);
  header(page, bold, font, title, sub);
  const img = await pdf.embedPng(png);
  const boxW = A4L[0] - 72, boxH = A4L[1] - 120;
  const s = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * s, h = img.height * s, x = 36 + (boxW - w) / 2, y = 36 + (boxH - h) / 2;
  page.drawImage(img, { x, y, width: w, height: h });
  page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 });
  if (badges && imgW && imgH) {
    for (const b of badges) {
      const bx = x + (b.x / imgW) * w, by = y + h - (b.y / imgH) * h;
      if (bx < x || bx > x + w || by < y || by > y + h) continue;
      const tw = bold.widthOfTextAtSize(b.id, 7) + 6;
      page.drawRectangle({ x: bx - tw / 2, y: by - 5, width: tw, height: 10, color: rgb(0.1, 0.1, 0.1), borderColor: rgb(1, 1, 1), borderWidth: 0.6 });
      page.drawText(b.id, { x: bx - tw / 2 + 3, y: by - 2.5, size: 7, font: bold, color: rgb(1, 1, 1) });
    }
  }
}

export interface DossierImages {
  target: { png: string; w: number; h: number };
  assignment: { png: string; w: number; h: number; badges: { id: string; x: number; y: number }[] };
}

export async function buildDossierPdf(data: DossierData, images: DossierImages, attachmentData: (dossierId: string) => ObjectAttachment[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Render-Dossier ${data.projectName}`); pdf.setCreator("PixunaCAD");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sub = `${data.projectName} · ${new Date(data.createdAt).toLocaleString("de-DE")} · ${data.presets.view === "3d" ? "3D-Kameraansicht" : "2D-Draufsicht"}`;

  await imagePage(pdf, bold, font, "Zielansicht", sub, images.target.png);
  await imagePage(pdf, bold, font, "Zuordnungsansicht", sub, images.assignment.png, images.assignment.badges, images.assignment.w, images.assignment.h);

  // Objekttabelle
  const cols = [{ t: "Kennung", w: 52 }, { t: "Name", w: 150 }, { t: "Objekt-ID", w: 70 }, { t: "Blatt", w: 90 }, { t: "Maße L×B×H (m)", w: 105 }, { t: "Höhe von–bis (m)", w: 90 }, { t: "Beschreibung", w: 213 }];
  let page = pdf.addPage(A4L); header(page, bold, font, "Objekttabelle", sub);
  let y = A4L[1] - 92;
  const head = () => { let x = 36; for (const c of cols) { page.drawText(safe(c.t), { x, y, size: 8, font: bold }); x += c.w; } y -= 14; };
  head();
  for (const o of data.objects) {
    const desc = wrap(o.description || "-", font, 7.5, cols[6].w - 6).slice(0, 4);
    const rowH = Math.max(12, desc.length * 9 + 3);
    if (y - rowH < 36) { page = pdf.addPage(A4L); header(page, bold, font, "Objekttabelle (Forts.)", sub); y = A4L[1] - 92; head(); }
    const vals = [o.dossierId, o.name, o.objCode ?? "-", o.sheetName, `${o.sizeM.x} × ${o.sizeM.y} × ${o.sizeM.z}`, `${o.elevationM.base} – ${o.elevationM.top}`];
    let x = 36;
    vals.forEach((v, i) => { page.drawText(safe(v).slice(0, 34), { x, y, size: 7.5, font: i === 0 ? bold : font }); x += cols[i].w; });
    desc.forEach((l, i) => page.drawText(l, { x, y: y - i * 9, size: 7.5, font }));
    y -= rowH;
    page.drawLine({ start: { x: 36, y: y + 4 }, end: { x: A4L[0] - 36, y: y + 4 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
  }

  // Referenzanlagen
  const withAtt = data.objects.filter(o => o.attachments.length);
  if (withAtt.length) {
    page = pdf.addPage(A4L); header(page, bold, font, "Referenzanlagen", sub); y = A4L[1] - 92;
    for (const o of withAtt) {
      const atts = attachmentData(o.dossierId);
      if (y < 160) { page = pdf.addPage(A4L); header(page, bold, font, "Referenzanlagen (Forts.)", sub); y = A4L[1] - 92; }
      page.drawText(safe(`${o.dossierId} · ${o.name}${o.objCode ? ` (${o.objCode})` : ""}`), { x: 36, y, size: 10, font: bold }); y -= 14;
      let x = 36;
      for (const a of atts) {
        const label = safe(`${a.category ?? "ohne Kategorie"}: ${a.name}`);
        if (/^image\/(png|jpeg)/.test(a.type) && a.dataUrl) {
          try {
            const img = a.type === "image/png" ? await pdf.embedPng(a.dataUrl) : await pdf.embedJpg(a.dataUrl);
            const s = Math.min(150 / img.width, 100 / img.height);
            if (x + 150 > A4L[0] - 36) { x = 36; y -= 122; }
            if (y - 110 < 36) { page = pdf.addPage(A4L); header(page, bold, font, "Referenzanlagen (Forts.)", sub); y = A4L[1] - 92; x = 36; }
            page.drawImage(img, { x, y: y - 100, width: img.width * s, height: img.height * s });
            page.drawText(label.slice(0, 40), { x, y: y - 110, size: 7, font });
            x += 160; continue;
          } catch { /* unlesbares Bild → als Text */ }
        }
        page.drawText(label.slice(0, 90), { x: 36, y: y - 10, size: 8, font }); y -= 12;
      }
      y -= 125;
    }
  }

  // Bildvorgaben & Arbeitsauftrag
  page = pdf.addPage(A4L); header(page, bold, font, "Bildvorgaben & Arbeitsauftrag", sub); y = A4L[1] - 96;
  const p = data.presets;
  const rows: [string, string][] = [["Ansicht", p.view === "3d" ? "3D-Kameraansicht" : "2D-Draufsicht"], ["Tageszeit", p.timeOfDay], ["Wetter", p.weather], ["Jahreszeit", p.season], ["Darstellungsstil", p.style], ["Bildwirkung", p.mood], ["Freitext", p.freeText || "-"]];
  for (const [k, v] of rows) {
    page.drawText(safe(k), { x: 36, y, size: 10, font: bold });
    const lines = wrap(v, font, 10, A4L[0] - 200);
    lines.forEach((l, i) => page.drawText(l, { x: 160, y: y - i * 13, size: 10, font }));
    y -= Math.max(16, lines.length * 13 + 3);
  }
  y -= 10;
  page.drawText("Arbeitsauftrag", { x: 36, y, size: 12, font: bold }); y -= 16;
  for (const l of wrap(data.workOrder, font, 10, A4L[0] - 72)) { page.drawText(l, { x: 36, y, size: 10, font }); y -= 13; }

  return await pdf.save();
}

export function downloadBytes(bytes: Uint8Array | string, filename: string, type: string) {
  const blob = typeof bytes === "string" ? new Blob([bytes], { type }) : new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
