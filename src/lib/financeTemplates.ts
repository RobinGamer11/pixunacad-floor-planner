// Standard-Mustervorlagen für Angebot, Rechnung und Nachtrag.
// Werden verwendet, solange für den jeweiligen Belegtyp kein Favorit
// gespeichert wurde. Aufbau mit den Werkzeugen der Projektmappe
// (Text- und Tabellen-Elemente) auf einem A4-Hochformat-Blatt ohne Ränder.

import type { PageElement, ProjectPage } from "./projectStore";
import type { FinancePositionType } from "./financeStore";

const PW = 210; // A4 Breite in mm
const PH = 297; // A4 Höhe in mm

let counter = 0;
const nid = () => `tplel-${(counter++).toString(36)}`;

/** Text-Element in Papier-Millimetern. */
function txt(
  x: number, y: number, w: number, h: number, text: string,
  opts: { size?: number; bold?: boolean; soft?: boolean; italic?: boolean } = {},
): PageElement {
  return {
    id: nid(),
    kind: "text",
    x: (x / PW) * 100, y: (y / PH) * 100, w: (w / PW) * 100, h: (h / PH) * 100,
    xMm: x, yMm: y, wMm: w, hMm: h,
    text,
    fontSize: opts.size ?? 13,
    bold: !!opts.bold,
    italic: !!opts.italic,
    color: opts.soft ? "hsl(var(--ink-soft))" : "hsl(var(--ink))",
  };
}

/** Dünne Trennlinie (als flache Tabelle ohne Inhalt). */
function rule(x: number, y: number, w: number): PageElement {
  return {
    id: nid(),
    kind: "table",
    x: (x / PW) * 100, y: (y / PH) * 100, w: (w / PW) * 100, h: (0.4 / PH) * 100,
    xMm: x, yMm: y, wMm: w, hMm: 0.4,
    tableData: {
      cells: [[""]],
      headerRow: false,
      borderColor: "hsl(var(--ink))",
      borderWidthPx: 1,
      background: "transparent",
    },
  };
}

function positionsTable(x: number, y: number, w: number, h: number): PageElement {
  const head = ["Pos.", "Leistungsbeschreibung", "Menge", "Einheit", "Einzelpreis", "Gesamt"];
  const rows: string[][] = [head];
  for (let i = 1; i <= 8; i++) {
    rows.push([String(i).padStart(2, "0"), "", "", "", "", ""]);
  }
  return {
    id: nid(),
    kind: "table",
    x: (x / PW) * 100, y: (y / PH) * 100, w: (w / PW) * 100, h: (h / PH) * 100,
    xMm: x, yMm: y, wMm: w, hMm: h,
    tableData: {
      cells: rows,
      headerRow: true,
      colWidths: [14, 74, 16, 18, 24, 24],
      borderColor: "hsl(var(--hairline))",
      borderWidthPx: 1,
      background: "transparent",
      headerBackground: "hsl(var(--surface-muted))",
    },
  };
}

const TITLE: Record<FinancePositionType, string> = {
  offer: "ANGEBOT",
  invoice: "RECHNUNG",
  supplement: "NACHTRAG",
};

const NUMBER_LABEL: Record<FinancePositionType, string> = {
  offer: "Angebots-Nr.",
  invoice: "Rechnungs-Nr.",
  supplement: "Nachtrags-Nr.",
};

const INTRO: Record<FinancePositionType, string> = {
  offer: "Sehr geehrte Damen und Herren, gerne unterbreiten wir Ihnen folgendes Angebot:",
  invoice: "Sehr geehrte Damen und Herren, für die erbrachten Leistungen berechnen wir Ihnen:",
  supplement: "Sehr geehrte Damen und Herren, für die zusätzlich beauftragten Leistungen berechnen wir Ihnen:",
};

const CLOSING: Record<FinancePositionType, string> = {
  offer: "Zahlungsziel: 14 Tage netto  ·  Ausführungszeitraum: [Zeitraum]  ·  Bindefrist: 30 Tage",
  invoice: "Zahlbar ohne Abzug innerhalb von 14 Tagen nach Rechnungserhalt.",
  supplement: "Nachtrag zur Rechnung [Rechnungs-Nr.]  ·  Zahlbar ohne Abzug innerhalb von 14 Tagen.",
};

/** Erzeugt die Standard-Mustervorlage (eine A4-Seite) für einen Belegtyp. */
export function buildDefaultTemplatePages(type: FinancePositionType, title: string): ProjectPage[] {
  const els: PageElement[] = [
    // Kopf
    txt(20, 15, 100, 10, "[Ihr Firmenname]", { size: 26, bold: true }),
    txt(20, 25, 100, 5, "Planung · Bauleitung · Ausführung", { size: 11, soft: true }),
    txt(130, 15, 60, 5, "[Straße Nr.]", { size: 11, soft: true }),
    txt(130, 20, 60, 5, "[PLZ Ort]", { size: 11, soft: true }),
    txt(130, 25, 60, 5, "Tel. [Telefonnummer]", { size: 11, soft: true }),
    txt(130, 30, 60, 5, "[E-Mail-Adresse]", { size: 11, soft: true }),
    rule(20, 40, 170),

    // Empfänger
    txt(20, 46, 80, 5, "EMPFÄNGER", { size: 10, bold: true, soft: true }),
    txt(20, 52, 80, 6, "[Firma / Name]", { size: 14 }),
    txt(20, 59, 80, 5, "[Straße Nr.]", { size: 12 }),
    txt(20, 65, 80, 5, "[PLZ Ort]", { size: 12 }),

    // Metadaten
    txt(120, 46, 70, 5, `${NUMBER_LABEL[type]}: [Nummer]`, { size: 12 }),
    txt(120, 52, 70, 5, "Datum: [TT.MM.JJJJ]", { size: 12 }),
    txt(120, 58, 70, 5, "Projekt: [Projektbezeichnung]", { size: 12 }),
    txt(120, 64, 70, 5, "Ansprechpartner: [Name]", { size: 12 }),

    // Titel + Anschreiben
    txt(20, 80, 120, 11, TITLE[type], { size: 30, bold: true }),
    txt(20, 93, 170, 6, INTRO[type], { size: 12 }),

    // Positionen
    positionsTable(20, 103, 170, 88),

    // Summen
    txt(110, 196, 50, 5, "Zwischensumme netto", { size: 12 }),
    txt(162, 196, 28, 5, "[0,00 €]", { size: 12 }),
    txt(110, 202, 50, 5, "zzgl. 19 % MwSt.", { size: 12 }),
    txt(162, 202, 28, 5, "[0,00 €]", { size: 12 }),
    rule(110, 209, 80),
    txt(110, 211, 50, 6, "Gesamtbetrag brutto", { size: 14, bold: true }),
    txt(162, 211, 28, 6, "[0,00 €]", { size: 14, bold: true }),

    // Konditionen
    txt(20, 226, 170, 5, CLOSING[type], { size: 11 }),
    txt(20, 232, 170, 5, "Bankverbindung: [Bank] · IBAN [DE00 0000 0000 0000 0000 00] · BIC [XXXXXXXX]", { size: 11, soft: true }),

    // Unterschriften
    rule(20, 258, 65),
    txt(20, 260, 65, 5, "Ort, Datum", { size: 10, soft: true }),
    rule(115, 258, 75),
    txt(115, 260, 75, 5, "Unterschrift / Stempel", { size: 10, soft: true }),

    // Fußzeile
    rule(20, 275, 170),
    txt(20, 278, 170, 5, "[Firmenname] · [Adresse] · USt-IdNr. [DE000000000] · Geschäftsführung [Name]", { size: 9, soft: true }),
  ];

  return [{
    id: "",
    title,
    format: "A4-hoch",
    margins: 0,
    background: false,
    guides: false,
    elements: els,
  }];
}
