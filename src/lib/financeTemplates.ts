// Standard-Mustervorlagen für Angebot, Rechnung und Nachtrag.
// Bewusst leer: hinterlegt wird nur ein leeres A4-Blatt mit der Bezeichnung
// "Standard-Mustervorlage". Inhalte legt der Nutzer selbst an und speichert
// sie bei Bedarf als Favorit.

import type { ProjectPage } from "./projectStore";
import type { FinancePositionType } from "./financeStore";

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
