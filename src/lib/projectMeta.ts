/**
 * Gemeinsame Stammdaten-Logik für Projekte (Übersicht, Anlage, Bearbeiten).
 *
 * Enthält Auswahllisten für Projekttyp und Status, die Standard-Projektbilder
 * je Projekttyp sowie Hilfsfunktionen für Adresse, Erstellungsdatum und den
 * nächsten Termin aus der Organisation. Bestehende, unbekannte Werte werden
 * niemals ersetzt – sie bleiben lesbar erhalten.
 */
import type { Project } from "@/lib/projectStore";

export const PROJECT_TYPE_BUILDING = "Gebäudebau";
export const PROJECT_TYPE_LANDSCAPE = "Landschaft/Freiraum";
export const PROJECT_TYPE_OTHER = "Sonstiges";

export const PROJECT_TYPES = [
  PROJECT_TYPE_BUILDING,
  PROJECT_TYPE_LANDSCAPE,
  PROJECT_TYPE_OTHER,
] as const;

export const PROJECT_STATUSES = [
  "Idee",
  "Planung",
  "Genehmigung",
  "Ausführung",
  "Pausiert",
  "Abgeschlossen",
] as const;

/**
 * Standard-Projektbilder liegen als echte Dateien im Ordner `public/` und
 * funktionieren dadurch in jeder Umgebung (Lovable, Vercel, Self-Hosting).
 */
const THUMB_BUILDING = "/project-images/projekt-gebaeudebau.png";
const THUMB_LANDSCAPE = "/project-images/projekt-landschaft.png";
const THUMB_OTHER = "/project-images/projekt-sonstiges.png";

/** Alte, nur intern gültige Bildadresse aus der Lovable-Vorschau. */
const LEGACY_ASSET_PREFIX = "/__l5e/assets-v1/";

export function isLegacyAssetThumbnail(src: string | undefined): boolean {
  return !!src && src.startsWith(LEGACY_ASSET_PREFIX);
}

/** Standardbild je Projekttyp – wird nur bei neuen Projekten gesetzt. */
export function defaultThumbnailForType(type: string | undefined): string {
  switch ((type ?? "").trim()) {
    case PROJECT_TYPE_LANDSCAPE:
      return THUMB_LANDSCAPE;
    case PROJECT_TYPE_BUILDING:
      return THUMB_BUILDING;
    default:
      return THUMB_OTHER;
  }
}

/**
 * Anzeigepfad eines Projektbildes: eigene Bilder bleiben erhalten, alte
 * interne Verweise werden durch das Standardbild des Projekttyps ersetzt.
 */
export function projectThumbnailSrc(
  src: string | undefined,
  type?: string | undefined,
): string {
  if (!src || isLegacyAssetThumbnail(src) || src.startsWith("data:image/svg+xml")) {
    return defaultThumbnailForType(type);
  }
  return src;
}

/** `onError`-Behandlung: ungültige Bildpfade fallen auf das Standardbild zurück. */
export function thumbnailErrorFallback(
  e: { currentTarget: HTMLImageElement },
  type?: string | undefined,
): void {
  const fallback = defaultThumbnailForType(type);
  const img = e.currentTarget;
  if (img.getAttribute("src") === fallback) return;
  img.src = fallback;
}

/** Erkennt Platzhalter-Thumbnails aus der Projektanlage (SVG-Data-URL). */
export function isPlaceholderThumbnail(src: string | undefined): boolean {
  if (!src) return true;
  if (isLegacyAssetThumbnail(src)) return true;
  return src.startsWith("data:image/svg+xml");
}

export interface ProjectAddress {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  land: string;
}

export const EMPTY_ADDRESS: ProjectAddress = {
  strasse: "", hausnummer: "", plz: "", ort: "", land: "",
};

export function readAddress(p: Project): ProjectAddress {
  return {
    strasse: p.adrStrasse ?? "",
    hausnummer: p.adrHausnummer ?? "",
    plz: p.adrPlz ?? "",
    ort: p.adrOrt ?? "",
    land: p.adrLand ?? "",
  };
}

/** Baut die Anzeige-/Wetteradresse aus den Einzelfeldern. */
export function composeAddress(a: ProjectAddress): string {
  const line1 = [a.strasse, a.hausnummer].filter((s) => s.trim()).join(" ").trim();
  const line2 = [a.plz, a.ort].filter((s) => s.trim()).join(" ").trim();
  return [line1, line2, a.land.trim()].filter(Boolean).join(", ");
}

export function formatDateDE(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Erstellungsdatum: bevorzugt der feste ISO-Wert, sonst der Altbestand. */
export function createdAtLabel(p: Project): string {
  if (p.createdAtIso) return formatDateDE(p.createdAtIso);
  if (p.erstelltAm) return p.erstelltAm;
  return "";
}

export const NOT_SET = "Noch nicht hinterlegt";
