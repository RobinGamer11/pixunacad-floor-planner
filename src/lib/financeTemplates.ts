// Standard-Mustervorlagen für Angebot, Rechnung und Nachtrag.
// Bewusst leer: hinterlegt wird nur ein leeres A4-Blatt mit der Bezeichnung
// "Standard-Mustervorlage". Inhalte legt der Nutzer selbst an und speichert
// sie bei Bedarf als Favorit.

import type { ProjectPage } from "./projectStore";
import type { FinancePositionType } from "./financeStore";

/**
 * Version der mitgelieferten Mustervorlagen. Wird pro Projekt und Belegart
 * markiert, damit die einmalige Platzhalter-Migration nicht bei jedem Öffnen
 * erneut läuft. Bei einer inhaltlichen Änderung der Mustervorlage erhöhen.
 */
export const TEMPLATE_SEED_VERSION = "1";

/**
 * Erkennt den unveränderten leeren Platzhalter: keine Elemente und keine
 * CAD-Overlay-Inhalte. Nur solche Seiten dürfen migriert werden.
 */
export function isBlankTemplatePage(page: ProjectPage): boolean {
  if ((page.elements ?? []).length > 0) return false;
  const ov = (page as any).cadOverlay;
  if (!ov || typeof ov !== "object") return true;
  return !Object.values(ov).some((v) => Array.isArray(v) && v.length > 0);
}

/** Erzeugt die Standard-Mustervorlage (ein leeres A4-Blatt) für einen Belegtyp. */
export function buildDefaultTemplatePages(_type: FinancePositionType, title: string): ProjectPage[] {
  return [{
    id: "",
    title: title || "Standard-Mustervorlage",
    format: "A4-hoch",
    margins: 0,
    background: false,
    guides: false,
    elements: [],
  }];
}

