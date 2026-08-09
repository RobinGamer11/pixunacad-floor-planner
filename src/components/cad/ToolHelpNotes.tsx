import React, { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";

/**
 * Hellgraue, auf-/zuklappbare Kurzhilfe unten in den Werkzeugeinstellungen.
 * Listet die nicht offensichtlichen Funktionen des jeweils aktiven Werkzeugs.
 */

const GLOBAL_HINTS: string[] = [
  "Nutzung über Tablet oder Handy: „Tablet“-Hilfsrad in der Kopfzeile aktivieren",
  "Rechtsklick auf einen Fangpunkt: Hilfslinien erscheinen",
  "Copy/Paste, Löschen sowie Undo/Redo über die Symbole in der Kopfzeile",
  "ESC: bricht jede laufende Aktion ab",
  "Shift+Klick oder Shift+Rahmen: mehrere Objekte zur Auswahl hinzufügen",
];

const TOOL_HINTS: Record<string, string[]> = {
  select: [
    "Shift+Klick oder Shift+Rahmen: mehrere Objekte zur Auswahl hinzufügen",
    "Shift+Klick auf einen Fangpunkt der Auswahl: Ankerpunkt setzen — daneben erscheinen Verschieben und Drehen",
    "Gedrehte/verschobene Gruppen rasten am Ankerpunkt an fremder Geometrie ein",
    "R: ausgewähltes Objekt bzw. Gruppe drehen · Häkchen oder Enter bestätigt",
    "Doppelklick: Objekt bearbeiten (Text, Maßkette, Dokument)",
    "Eingefügte Kopien hängen zunächst frei am Cursor und werden per Häkchen platziert",
  ],
  line: [
    "Klick setzt Punkte, Doppelklick oder Enter beendet den Linienzug",
    "Shift: auf 0°/45°/90° einrasten",
    "Längen-/Winkeleingabe über die Tastatur, Tab wechselt das Feld",
    "Rechtsklick auf Fangpunkt: Hilfslinie zur Ausrichtung",
  ],
  wall: [
    "Shift: Wandrichtung auf feste Winkelschritte einrasten",
    "Wanddicke und Anschlagseite in den Einstellungen oben",
    "Wände verbinden sich automatisch an gemeinsamen Punkten (Topologie)",
    "Punkt ziehen: angrenzende Wände werden mitgeführt",
  ],
  free: [
    "Zeichnen mit gedrückter Maustaste bzw. Stift, Vorschau zeigt Stärke und Farbe",
    "Fertige Striche lassen sich mit dem Auswahlwerkzeug nachbearbeiten",
    "Stift-Modus am Hilfsrad: nur Stift zeichnet, Finger pannt",
  ],
  eraser: [
    "Hart: schneidet exakt entlang der Kontur (auch Schraffuren werden durchbrochen)",
    "Smooth: weiches Ausradieren — nur bei PNG/JPG-Bildern verfügbar",
    "Stärke bestimmt den Radius, Undo/Redo gilt auch für Radierschritte",
  ],
  hatch: [
    "Klick in eine geschlossene Fläche füllt automatisch",
    "Umriss-Modus: Punkte selbst setzen, Enter schließt die Fläche",
    "Radiergummi schneidet Löcher in bestehende Schraffuren",
  ],
  measure: [
    "Zwei Punkte wählen, dritter Klick legt den Abstand der Maßlinie fest",
    "Spiegeln in den Einstellungen dreht die Maßkette an gleicher Stelle",
    "Maßtext lässt sich nach Auswahl frei verschieben",
  ],
  text: [
    "Andere Objekte lassen sich an ihren Fangpunkten zur Ausrichtung anvisieren",
    "Textbox bleibt in Bearbeitung, bis erneut gesetzt wird — auch beim Drehen",
    "Doppelklick öffnet den Editor, ESC bricht ab",
  ],
  document: [
    "Import platziert das Dokument zunächst frei — Klick setzt es ab",
    "2-Punkt-Skalierung: reale Länge eingeben, Maßstab wird exakt übernommen",
    "Verzerren: vier Eckpunkte perspektivisch ziehen · Spiegeln mit Richtung",
    "Mehrseitige PDFs fragen beim Import nach der gewünschten Seite",
  ],
  sticker: [
    "Bauelement platzieren, R dreht vor dem Absetzen",
    "Fangpunkte von Wänden werden beim Platzieren berücksichtigt",
  ],
  door: [
    "Tür auf eine Wand setzen — Öffnungsrichtung per Klick umschalten",
    "Breite in den Einstellungen, Position rastet an Wandkanten ein",
  ],
  pipette: [
    "Klick auf ein Objekt übernimmt dessen Eigenschaften",
    "Anschließend gilt der Stil für neu gezeichnete Objekte",
  ],
  guide: [
    "Rechtsklick auf einen Fangpunkt erzeugt Hilfslinien",
    "ESC entfernt alle Hilfslinien",
  ],
  cad: [
    "CAD-Blatt wird als lebende Referenz eingefügt — Änderungen im CAD erscheinen sofort",
    "Beim Drehen fixiert sich der Cursor an den oberen Fangpunkten, Winkel wird angezeigt",
    "Maßstab in den Einstellungen ändern und mit „Aktualisieren“ übernehmen",
  ],
  table: [
    "Zellen per Klick auswählen, Formeln über das Formelfeld",
    "Enter bestätigt die Tabelle, ESC bricht ab",
  ],
};

export function ToolHelpNotes({
  toolId,
  extra,
}: {
  toolId?: string | null;
  extra?: string[];
}) {
  const key = "pixuna.toolHelp.open";
  // Immer zuerst eingeklappt — unabhängig vom letzten Zustand.
  const [open, setOpen] = useState<boolean>(false);
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(key, next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const toolHints = (toolId && TOOL_HINTS[toolId]) || TOOL_HINTS.select;
  const hints = [...(extra ?? []), ...toolHints, ...GLOBAL_HINTS];

  return (
    <div
      className="mt-3 rounded-md border"
      style={{ borderColor: "hsl(var(--hairline))", background: "hsl(var(--surface-muted))" }}
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-1.5 px-2 h-8 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "hsl(var(--ink-soft))" }}
        title="Kurzhilfe ein-/ausklappen"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <HelpCircle size={12} />
        <span>Hilfe & Kurzbefehle</span>
      </button>
      {open && (
        <ul className="px-3 pb-2 pt-0.5 space-y-1 text-[10.5px] leading-snug list-disc list-outside ml-3"
            style={{ color: "hsl(var(--ink-soft))", opacity: 0.85 }}>
          {hints.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ToolHelpNotes;
