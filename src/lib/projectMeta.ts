/**
 * Gemeinsame Stammdaten-Logik für Projekte (Übersicht, Anlage, Bearbeiten).
 *
 * Enthält Auswahllisten für Projekttyp und Status, die Standard-Projektbilder
 * je Projekttyp sowie Hilfsfunktionen für Adresse, Erstellungsdatum und den
 * nächsten Termin aus der Organisation. Bestehende, unbekannte Werte werden
 * niemals ersetzt – sie bleiben lesbar erhalten.
 */
import type { Project } from "@/lib/projectStore";
import gebaeudebauAsset from "@/assets/projekt-gebaeudebau.png.asset.json";
import landschaftAsset from "@/assets/projekt-landschaft.png.asset.json";
import sonstigesAsset from "@/assets/projekt-sonstiges.png.asset.json";

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

/** Standardbild je Projekttyp – wird nur bei neuen Projekten gesetzt. */
export function defaultThumbnailForType(type: string | undefined): string {
  switch ((type ?? "").trim()) {
    case PROJECT_TYPE_LANDSCAPE:
      return landschaftAsset.url;
    case PROJECT_TYPE_BUILDING:
      return gebaeudebauAsset.url;
    default:
      return sonstigesAsset.url;
  }
}

/** Erkennt Platzhalter-Thumbnails aus der Projektanlage (SVG-Data-URL). */
export function isPlaceholderThumbnail(src: string | undefined): boolean {
  if (!src) return true;
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
