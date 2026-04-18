---
name: Clipboard & Pipette
description: Strg+C/V kopiert/fügt alle Objekttypen oder ID-Gruppe ein (Vorschau am Cursor, Klick platziert). Pipette (P) übernimmt Stil + Bezeichnungs-ID; Shift = nur Stil.
type: feature
---
- Copy: aktive Einzel-Auswahl (Linie/Hatch/Maßkette/Textbox) ODER alle Objekte einer ausgewählten Bezeichnungs-ID-Gruppe.
- Paste (Strg+V): startet Vorschau am Mauscursor (Anker = Schwerpunkt der Auswahl). Klick platziert, Esc bricht ab. Während Paste-Vorschau wird das aktive Tool gepausst.
- Pipette (P): Klick auf Quellobjekt überträgt Stil. Wenn passendes Objekt ausgewählt ist → direkt zuweisen. Sonst → Tool-Defaults setzen + passendes Werkzeug aktivieren. Shift+Klick = nur Stil ohne Bezeichnungs-ID.
- Module: `src/cad/ClipboardManager.ts` (Snapshots/Translation/Commit), `src/cad/PipetteTool.ts`. Integration in `CadApp` (copySelection/startPastePreview/cancelPastePreview/_drawPastePreview, Tick-Hook für Klick-Commit).
