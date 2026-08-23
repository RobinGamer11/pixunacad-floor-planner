// Standard-Mustervorlagen für Angebot, Rechnung und Nachtrag.
// Die eigentliche Nutzer-Vorlage lebt als vollständiger Seitensatz im Projekt.
// Diese Datei liefert nur den leeren Notfall-Fallback und die Erkennung der
// einmalig zu übernehmenden Legacy-Musterseiten.

import type { ProjectPage } from "./projectStore";
import type { FinancePositionType } from "./financeStore";

/**
 * Version der mitgelieferten Mustervorlagen. Wird pro Projekt und Belegart
 * markiert, damit die einmalige Platzhalter-Migration nicht bei jedem Öffnen
 * erneut läuft. Bei einer inhaltlichen Änderung der Mustervorlage erhöhen.
 */
export const TEMPLATE_SEED_VERSION = "2";

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

/** Eine vollständige Vorlage enthält mindestens ein DOM- oder MiniCad-Objekt. */
export function hasTemplateObjects(pages: ProjectPage[] | undefined): boolean {
  return !!pages?.some((page) => !isBlankTemplatePage(page));
}

const normalizeTitle = (value: string) => value
  .toLocaleLowerCase("de-DE")
  .replace(/[–—_-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Findet eine frühere, versehentlich als normale Projektmappenseite
 * gespeicherte Mustervorlage. Es werden ausschließlich eindeutig benannte,
 * inhaltliche Seiten übernommen; gewöhnliche Projektseiten bleiben unberührt.
 * Mehrseitige Vorlagen bleiben in ihrer bestehenden Projekt-Reihenfolge.
 */
export function findLegacyTemplatePages(
  pages: ProjectPage[],
  type: FinancePositionType,
): ProjectPage[] | undefined {
  const typeNames: Record<FinancePositionType, string[]> = {
    offer: ["angebot"],
    invoice: ["rechnung"],
    supplement: ["nachtrag"],
  };
  const names = typeNames[type];
  const matches = pages.filter((page) => {
    if (page.templateKey) return false;
    const title = normalizeTitle(page.title ?? "");
    const namesType = names.some((name) => title.includes(name));
    const namesTemplate = title.includes("mustervorlage") || title.includes("muster vorlage")
      || title.includes("standardvorlage") || title.includes("standard vorlage")
      || title.includes("vorlage");
    return namesType && namesTemplate;
  });
  return hasTemplateObjects(matches) ? matches : undefined;
}

/** Leerer A4-Notfall-Fallback, falls noch keine gespeicherte Vorlage existiert. */
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

