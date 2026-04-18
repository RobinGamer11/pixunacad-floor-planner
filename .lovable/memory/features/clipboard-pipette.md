---
name: Clipboard & Pipette
description: Strg+C/V kopiert/fügt alle Objekttypen oder ID-Gruppe ein (Anker = Mausposition oder ausgewählter Punkt; Vorschau am Cursor, Klick platziert). Pipette (P) übernimmt Stil + Bezeichnungs-ID; Shift = nur Stil; Quelle→Ziel ohne Auswahl möglich.
type: feature
---
- Copy: aktive Einzel-Auswahl (Linie/Hatch/Maßkette/Textbox) ODER alle Objekte einer ausgewählten Bezeichnungs-ID-Gruppe.
- Paste-Anker (Strg+C-Zeitpunkt): ausgewählter Segment-Endpunkt (SelectionType.POINT) > Mausposition. KEIN Schwerpunkt mehr.
- Paste (Strg+V): startet Vorschau am Mauscursor (Verschiebung relativ zum Anker). Klick platziert, Esc bricht ab. Während Paste-Vorschau wird das aktive Tool gepausst.
- Pipette (P) — drei Fälle:
  1. Passende Auswahl vorhanden → Klick auf Quellobjekt überträgt Stil (+ ID) direkt auf Auswahl.
  2. Keine Auswahl, gemerkte Quelle existiert und Ziel ist gleichartig → Quelle→Ziel-Übertragung (Stil + ID).
  3. Keine Auswahl, keine gleichartige gemerkte Quelle → Klick merkt Quelle (durchgehend hervorgehoben).
- Shift+Klick = nur Stil, ohne Bezeichnungs-ID-Übernahme.
- Module: `src/cad/ClipboardManager.ts` (`buildClipboardFromSelection(app, anchorOverride?)`, Translation, Commit), `src/cad/PipetteTool.ts` (mit `pickedSource` für Quelle→Ziel). Integration in `CadApp` (copySelection setzt anchor; startPastePreview/cancelPastePreview/_drawPastePreview, Tick-Hook für Klick-Commit).
