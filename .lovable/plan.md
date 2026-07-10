
## 01 — Mülltonne-Button im Kopf (links neben Undo/Redo)

Ein neuer Button (`Trash2`) im `WorkspaceHeader` links vor Undo. Verhalten wie die `Entf`-Taste — löscht alle aktuell ausgewählten Objekte in Projektmappe oder CAD-Oberfläche.

- **Header (`src/components/workspace/WorkspaceHeader.tsx`):** Neue Props `canDelete: boolean`, `onDelete?: () => void`. Button ist ausgegraut (disabled) wenn `canDelete=false`.
- **Projektmappe (`src/pages/ProjectWorkspace.tsx`):**
  - `canDelete` = `!!selectedElementId` **oder** ein CAD-Dokument im eingebetteten Engine ist selektiert.
  - `onDelete`: identisches Verhalten wie der bestehende Keyboard-Handler bei `Delete/Backspace` (Zeile ~1822) — dieselbe Funktion herausziehen und wiederverwenden.
- **CAD-Oberfläche (`src/pages/CadPage.tsx`):**
  - `canDelete` aus `app.selection` (Wand, Dokument, Textbox, Maßkette, Tür/Fenster, Sticker …) via kleines Polling/Abo wie es der Header schon für Undo/Redo hat.
  - `onDelete`: ruft die bestehende CAD-Delete-Route auf (dieselbe, die `Entf` triggert — vermutlich `app.deleteSelection()` oder Äquivalent; wird beim Umsetzen im Code verifiziert).

## 02 — Dokumenten-Werkzeug: „CAD-Zeichenblatt als PDF einfügen“

Neuer Menüpunkt im Dokumenten-Panel der Projektmappe (neben dem bestehenden Datei-Import-Button). Klick öffnet ein Dropdown mit den Zeichenblättern des Projekts (aus `cadEngine.sheetManager`). Nach Auswahl eines Zeichenblatts erscheint ein zweites Dropdown mit **Ausschnitt-Modus**:

1. **Gesamtes Zeichenblatt** — direkt exportieren.
2. **Aktuell ausgewählte Ansicht** — nutzt den aktiven Viewport / Sheet-Ausschnitt in der CAD-Oberfläche.
3. **Rahmen** — wechselt in die CAD-Oberfläche mit aktivem Rahmen-Werkzeug; Bestätigen per Häkchen-Symbol im Hub, dann Rückkehr zur Projektmappe.

In allen drei Fällen wird das Ergebnis identisch zu einem normalen PDF-Import behandelt (gleicher Maßstabs-Dialog, gleiche Nachbearbeitung: Skalieren, Anker, Drehen, Filter, Auflösen).

### Technischer Ablauf

- **Erzeugung des PDFs im Speicher:** eine Ein-Seiten-Variante von `exportPlansToPdf` (`src/cad/PlanPdfExport.ts`) — neue Funktion `exportSheetRegionToPdf(sheetId, region)` mit `region = "full" | "activeView" | { x, y, w, h }`. Rendert nur das eine Blatt anhand des vorhandenen `flattenSheetSnapshot` + `drawProjectionToPdf`-Codes und liefert `Uint8Array`.
- **Übergabe an den Importer:** Uint8Array → `File`-Objekt (`new File([bytes], "Zeichenblatt XY.pdf", { type: "application/pdf" })`) → bestehende `importFile()`-Pipeline (`src/cad/documentImport.ts`) → gleicher `scaleDialogPages`-Flow wie beim Datei-Upload. Kein neuer Import-Code, keine Sonderbehandlung.
- **Rahmen-Modus (Cross-Page-Handoff):**
  - Beim Klick auf „Rahmen“ speichert die Projektmappe eine Absicht im `projectStore` bzw. `sessionStorage`: `{ kind: "sheet-crop", projectId, sheetId, returnTo: pageId }`.
  - Navigation zu `/project/:id/cad` mit URL-Param `?crop=<sheetId>`.
  - `CadPage` erkennt den Param, wechselt zum bestehenden CAD-Rahmen-/Ausschnitts-Werkzeug (falls nicht vorhanden: ein leichter Rechteck-Picker analog `MeasureTool`), und blendet einen kleinen Hub mit Häkchen (Bestätigen) + X (Abbrechen) ein.
  - Häkchen → Rechteck in Sheet-Koordinaten wird an die Absicht angehängt → Rück-Navigation `/project/:id` → Projektmappe liest die Absicht, ruft `exportSheetRegionToPdf` und startet den normalen Import-Flow.

### Neue / geänderte Dateien

- `src/components/workspace/WorkspaceHeader.tsx` — Trash-Button + Props.
- `src/pages/ProjectWorkspace.tsx` — Header-Props, Delete-Handler wiederverwenden, Dokumenten-Panel um Dropdown erweitern, Rahmen-Handoff-Auswertung.
- `src/pages/CadPage.tsx` — Header-Props, `?crop=` erkennen und Rahmen-Werkzeug starten, Häkchen-Rückkehr.
- `src/cad/PlanPdfExport.ts` — neue `exportSheetRegionToPdf`-Funktion.
- Ggf. kleines neues Modul `src/cad/SheetCropTool.ts` (nur falls kein bestehendes Rahmen-Werkzeug wiederverwendbar ist — wird im Build-Modus geprüft; wenn `SelectTool` / `MeasureTool` reichen, entfällt es).
- `src/lib/projectStore.ts` — falls die Absicht dort persistiert wird (alternativ nur `sessionStorage`, keine Store-Änderung nötig).

### Offene Detailfragen, die beim Umsetzen entschieden werden

- Ob „aktuell ausgewählte Ansicht“ = aktiver Kamera-Ausschnitt in `CadPage` oder = selektierter `PlanProjection`/Viewport. Standard-Annahme: aktive Kamera (WYSIWYG „was du gerade siehst“). Wenn Sie den anderen Fall wollen, bitte kurz sagen.
- Ob der Rahmen fest im Sheet-Koordinatensystem (mm) oder in Weltkoordinaten gespeichert wird — plane in Sheet-mm, weil `exportSheetRegionToPdf` ohnehin sheet-basiert arbeitet.
