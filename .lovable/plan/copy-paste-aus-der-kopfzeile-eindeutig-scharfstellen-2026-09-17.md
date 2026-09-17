# Copy/Paste aus der Kopfzeile eindeutig scharfstellen

## Ziel
Normales und mehrfaches Einfügen über die Kopfzeile erzeugen erst beim nächsten echten Zeigerereignis in der CAD-Zeichenfläche eine Kopie. Tastenkürzel behalten ihren bisherigen Sofortstart innerhalb der Zeichenfläche.

## Umsetzung
- In `CadApp` eine öffentliche Header-Methode ergänzen, die ausschließlich Clipboard und Editorzustand prüft und anschließend immer `pasteArmed` setzt.
- Den bestehenden Tastaturpfad über `startPastePreview()` beibehalten; nur dieser darf anhand einer gültigen aktuellen Canvas-Position sofort starten.
- Das Auflösen von `pasteArmed` direkt an echte `pointerenter`, `pointermove` und `pointerdown` der Zeichenfläche koppeln. Die Eventposition wird dabei zuerst in Bildschirm- und anschließend in Weltkoordinaten aktualisiert.
- Beim Start den bestehenden Clipboard-Anker an `SelectTool.beginPasteFloat(created, clipboardAnchor)` übergeben. Dessen Snap-Berechnung setzt genau diesen Anker auf die aktuelle gesnappte Cursorposition; Quellposition, Schwerpunkt und `nearestGroupPoint` bleiben ausgeschlossen, solange der gespeicherte Anker vorhanden ist.
- `CadEditor` um die Header-Methode erweitern und `CadPage` so umstellen, dass das normale Einfüge-Symbol ausschließlich diesen Pfad nutzt.
- Den Mehrfach-Einfüge-Button ebenfalls über einen expliziten Header-Start führen; Folgekopien nach Bestätigung dürfen weiterhin direkt an der aktuellen Canvas-Position entstehen.
- ESC, Rechtsklick, Werkzeugwechsel und erneuter Mehrfach-Button brechen den wartenden beziehungsweise schwebenden Zustand vollständig ab.

## Prüfung
- Automatisierter Regressionstest: Header-Aktivierung erzeugt noch keine Objekte und liest keine alte Mausposition.
- Automatisierter Regressionstest: Erstes echtes Canvas-Ereignis startet die Kopie mit aktueller Weltposition und gespeichertem Clipboard-Anker.
- Entsprechender Test für Mehrfach-Einfügen und Abbruch per ESC.
- Gezielter Browserablauf gemäß Abnahme: Objekt links kopieren, Kopf-Button klicken, rechts unten in die Fläche fahren; keine Kopie vor Eintritt, danach sofort am Cursor/Snap-Punkt und nie kurz am Original.
- TypeScript-Prüfung, relevante Tests und Produktions-Build; anschließend Diff- und Secret-Prüfung sowie Synchronisierung mit `main` ohne Force-Push.
