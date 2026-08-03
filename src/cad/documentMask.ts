import { Defaults } from "./constants";
import type { DocumentObject } from "./Scene";
import { Vec2, v } from "./geometry";
import { documentCenterWorld } from "./documentGeometry";

/**
 * Pixelmasken-Verwaltung für Dokumente (Radiergummi).
 *
 * Konzept:
 * - Jedes Dokument hat eine optionale Alpha-Maske (HTMLCanvasElement).
 * - Maske beginnt vollständig opak weiß (= alles sichtbar).
 * - Radieren stempelt mit destination-out → Pixel werden durchsichtig.
 * - Beim Rendern composite: Bild zeichnen → destination-in Maske → Ergebnis blitten.
 * - Persistenz: Maske als PNG-DataURL serialisieren (eraseMaskDataUrl).
 *
 * Auflösung: Maskengröße = min(originalPixelGröße, docMaskMaxPx).
 * Verhindert riesige Masken bei hochauflösenden PDFs.
 */

/** Liefert die Mask-Auflösung (kein Hilfscanvas-Erstellen). */
export function getMaskDimensions(doc: DocumentObject): { w: number; h: number } {
  const cap = Defaults.docMaskMaxPx;
  const pw = doc.pixelWidth || Math.round(doc.widthM * 200);
  const ph = doc.pixelHeight || Math.round(doc.heightM * 200);
  if (pw <= 0 || ph <= 0) return { w: 1, h: 1 };
  const longer = Math.max(pw, ph);
  if (longer <= cap) return { w: pw, h: ph };
  const f = cap / longer;
  return { w: Math.max(1, Math.round(pw * f)), h: Math.max(1, Math.round(ph * f)) };
}

/**
 * Holt die Maske als HTMLCanvasElement; erstellt sie lazy.
 * Wenn doc.eraseMaskDataUrl gesetzt ist, wird sie asynchron geladen — bis dahin
 * wird eine vollopake (weiße) Maske zurückgegeben (= alles sichtbar). Der Loader
 * markiert dann _eraseMaskDirty=false sobald das echte Bild da ist (re-render).
 */
export function getOrCreateDocMask(doc: DocumentObject, onLoaded?: () => void): HTMLCanvasElement {
  if (doc._eraseMask) return doc._eraseMask;
  const { w, h } = getMaskDimensions(doc);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // Vollopake weiße Maske = alles sichtbar
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  doc._eraseMask = c;

  if (doc.eraseMaskDataUrl) {
    const img = new Image();
    img.onload = () => {
      try {
        const ctx2 = c.getContext("2d")!;
        ctx2.clearRect(0, 0, c.width, c.height);
        ctx2.drawImage(img, 0, 0, c.width, c.height);
        doc._eraseMaskDirty = false;
        onLoaded?.();
      } catch { /* ignore */ }
    };
    img.src = doc.eraseMaskDataUrl;
  }
  return c;
}

/**
 * Stempelt einen Welt-Kreis (centerWorld, radiusWorldM) in die Doc-Maske.
 * Berücksichtigt Position + Rotation des Dokuments.
 * Gibt true zurück, wenn etwas in den Bounds gestempelt wurde.
 */
export function eraseDocCircle(doc: DocumentObject, centerW: Vec2, radiusM: number, strength = 1, mode: "hard" | "smooth" = "hard", softness = 0.5): boolean {
  if (radiusM <= 0) return false;
  // Welt → lokale (unrotierte) Doc-Koords
  const c = documentCenterWorld(doc);
  const dx = centerW.x - c.x;
  const dy = centerW.y - c.y;
  const cosA = Math.cos(-doc.rotationRad);
  const sinA = Math.sin(-doc.rotationRad);
  const lx = dx * cosA - dy * sinA + doc.widthM / 2;
  const ly = dx * sinA + dy * cosA + doc.heightM / 2;

  // Quick-Bounds-Check
  if (lx + radiusM < 0 || lx - radiusM > doc.widthM || ly + radiusM < 0 || ly - radiusM > doc.heightM) return false;

  const mask = getOrCreateDocMask(doc);
  const sx = mask.width / doc.widthM;
  const sy = mask.height / doc.heightM;
  const px = lx * sx;
  const py = ly * sy;
  // Mittlerer Skalierungsfaktor für Radius (Maske ist evtl. nicht-uniform — nehmen längere Achse)
  const pr = radiusM * Math.max(sx, sy);

  const ctx = mask.getContext("2d")!;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  // Weicher Rand für sanftes Radieren
  const a = Math.max(0.05, Math.min(1, strength));
  if (mode === "hard") {
    // Harte Kante: alles innerhalb des Radius wird voll radiert.
    ctx.fillStyle = `rgba(0,0,0,${a})`;
  } else {
    // Vignette: Kern hart, nach außen nebelartig ausblendend.
    const soft = Math.max(0.05, Math.min(1, softness));
    const core = pr * (1 - soft);
    const grad = ctx.createRadialGradient(px, py, Math.max(0, core), px, py, Math.max(core + 0.01, pr));
    grad.addColorStop(0, `rgba(0,0,0,${a})`);
    grad.addColorStop(0.55, `rgba(0,0,0,${a * 0.45})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
  }
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  doc._eraseMaskDirty = true;
  return true;
}

/** Setzt die Maske komplett zurück (alles wieder sichtbar) und löscht persistente DataUrl. */
export function resetDocMask(doc: DocumentObject) {
  doc.eraseMaskDataUrl = null;
  doc._eraseMask = null;
  doc._eraseMaskDirty = true;
}

/** Exportiert die aktuelle Maske in DataUrl (für Persistenz / Snapshot). */
export function exportDocMaskDataUrl(doc: DocumentObject): string | null {
  if (!doc._eraseMask) return doc.eraseMaskDataUrl || null;
  try {
    const url = doc._eraseMask.toDataURL("image/png");
    doc.eraseMaskDataUrl = url;
    doc._eraseMaskDirty = false;
    return url;
  } catch {
    return doc.eraseMaskDataUrl || null;
  }
}

/** Prüft ob ein Welt-Punkt im Doc-Rechteck liegt (für Eraser-Targeting). */
export function pointInDoc(doc: DocumentObject, p: Vec2): boolean {
  const c = documentCenterWorld(doc);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const cosA = Math.cos(-doc.rotationRad);
  const sinA = Math.sin(-doc.rotationRad);
  const lx = dx * cosA - dy * sinA;
  const ly = dx * sinA + dy * cosA;
  return Math.abs(lx) <= doc.widthM / 2 && Math.abs(ly) <= doc.heightM / 2;
}
