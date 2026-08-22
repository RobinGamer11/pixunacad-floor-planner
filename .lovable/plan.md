# Textwerkzeug in CAD und Mappe stabilisieren

## Diagnose

Die Fehler entstehen nicht aus einem einzelnen Fokusproblem, sondern aus widersprüchlichen Größen- und Auswahlmodellen:

- `TextBox.style.fontSizePx` ist derzeit Dokumentgröße, UI-Wert und Rendergröße zugleich. CAD und Mappe rechnen diese Werte an unterschiedlichen Stellen zwischen `pt` und `px` um.
- Der Canvas skaliert nur die Basisgröße mit `camera.scale / referencePxPerM`. Inline-Größen aus HTML werden in `textRichRenderer` dagegen als absolute `px` übernommen. Dadurch werden Inline-Zeichen beim Zoomen und erneuten Öffnen relativ zur Basisgröße falsch bzw. extrem groß.
- Das `contenteditable` skaliert die geerbte Basisgröße, aber gespeicherte Inline-`style="font-size: …px"` nicht mit demselben Dokument-/Bildschirmfaktor. Editor und Canvas zeigen daher unterschiedliche Größen.
- `autoSizeTextBox` misst logische Größen, während der Renderer teils bereits skalierte Basiswerte mit unskalierten Inline-Overrides mischt. Messung und Zeichnung verwenden dadurch nicht dieselbe Einheit.
- Auswahlzustand liegt gleichzeitig in Browser-Selection, `_savedRange`, CSS-Highlight und Fokus-Wiederherstellung. DOM-Umbauten durch `execCommand("fontSize", ..., "7")` invalidieren bzw. verändern diese Ranges.
- Der Zero-Width-Space für Typing-Style wird während Live-Sync zunächst ins Modell geschrieben und erst beim Commit entfernt; wiederholte Änderungen können leere/verschachtelte Spans erzeugen.
- In der Mappe heißt ein `pt`-Wert über mehrere Komponenten weiterhin `fontSizePx` und wird in `MiniCad.setTextDefaults` nochmals umgerechnet. Die „Tatsächliche Größe“-Anzeige verwendet zusätzlich die aktuelle Bildschirmdichte statt der festen Beziehung `pt × 25,4 / 72`.

## Umsetzung

### 1. Kanonische Typografie und Rückwärtskompatibilität

- Einen zentralen Typografie-Helfer für `pt ↔ CSS-px` und `pt ↔ mm` einführen; keine lokalen `4/3`-Umrechnungen mehr.
- `fontSizePt` als kanonische Textbox-Basisgröße verwenden.
- Bestehende gespeicherte `fontSizePx`-Werte beim Laden einmalig als Legacy-Werte interpretieren (`px × 72/96`); beim Speichern das neue kanonische Feld schreiben und Legacy-Dateien weiterhin öffnen können.
- Inline-Größen kanonisch als `data-font-size-pt` speichern. Altes `<font size>`, `style="font-size: px/pt"` und bestehende HTML-Inhalte beim Einlesen weiterhin unterstützen und beim nächsten Editieren normalisieren.

### 2. Gemeinsamer Rich-Text-Kern

- Parsing, Normalisierung und Zusammenführen benachbarter Runs in `textRichRenderer` zentralisieren.
- Ein gemeinsames Layout erzeugen, das logische Rich-Text-Runs plus einen expliziten Darstellungsfaktor erhält.
- Canvas-Rendering und AutoSize auf dieses Layout stützen: AutoSize misst bei Referenzmaßstab, Renderer zeichnet dasselbe Layout mit Kamera-Skalierung.
- Inline- und Basisgrößen immer mit demselben Darstellungsfaktor skalieren; Zoom bleibt ausschließlich Darstellung und gelangt nie in HTML oder TextBox-Daten.

### 3. Editor ohne konkurrierende Workarounds

- `execCommand("fontSize", ..., "7")` vollständig entfernen; Größenformatierung direkt als kanonischen Span auf die Range anwenden.
- Selection intern über stabile Text-Offsets plus Richtung verwalten. Browser-Range dient nur als momentane Darstellung, nicht als zweite Wahrheitsquelle.
- Nach DOM-Normalisierung dieselben Offsets wiederherstellen, sodass `14 pt → fett → rot` ohne Neumarkierung möglich bleibt.
- Das vorhandene CSS-Highlight nur als visuelle Projektion dieser einen Selection verwenden; `_savedRange` als dauerhafte konkurrierende Quelle entfernen.
- Typing-Style als separaten Editorzustand halten. Bei kollabiertem Caret werden erst neu eingegebene Zeichen mit diesem Stil eingefügt; keine Zero-Width-Zeichen speichern und keine leeren Format-Spans persistieren.
- Commit und Live-Sync verwenden dieselbe Normalisierung, sodass Editor schließen, erneut öffnen und Reload identisches HTML ergeben.

### 4. Drei explizite Formatierungszustände

- **Objektmodus:** Editor geschlossen; Änderungen aktualisieren ausschließlich den Basisstil der gesamten Textbox.
- **Textauswahl:** Editor offen und Range nicht kollabiert; Änderungen aktualisieren nur die ausgewählten Runs.
- **Caret/Typing-Style:** Editor offen und Range kollabiert; bestehende Runs bleiben unverändert, nur neuer Text erhält den gewählten Stil.
- Host-Aufrufer erhalten eine eindeutige Rückmeldung, ob der Editor die Änderung verarbeitet hat; Fokusverlust darf nicht auf Objektmodus zurückfallen.

### 5. CAD- und Mappe-Integration getrennt korrigieren

- `CadApp` auf `fontSizePt` und den eindeutigen Editorzustand umstellen; alte parallele px-/pt-Eingabepfade beseitigen, ohne die bestehende UI zu verändern.
- `ProjectWorkspace`/`CadOverlayLayer`/`MiniCad` ebenfalls mit `fontSizePt` anbinden, aber Auswahl, HUB, Layer und Objektbearbeitung unverändert host-spezifisch lassen.
- Die mm-Anzeige fest aus typografischen Punkten berechnen, unabhängig von Zoom und `pxPerMm`.
- Beide Hosts synchronisieren Panelwerte aus dem aktiven Run/Typing-Style beziehungsweise im Objektmodus aus dem Textbox-Basisstil.

## Technische Dateien

Voraussichtlich betroffen:

- `src/cad/textTypography.ts` (neu: zentrale Einheiten)
- `src/cad/textRichRenderer.ts`
- `src/cad/textAutoSize.ts`
- `src/cad/TextEditorOverlay.ts`
- `src/cad/Scene.ts`
- `src/cad/Renderer.ts`
- `src/cad/sceneSerde.ts`
- `src/cad/CadApp.ts`
- `src/cad/embed/MiniCad.ts`
- `src/components/CadEditor.tsx`
- `src/components/page/CadOverlayLayer.tsx`
- `src/pages/ProjectWorkspace.tsx`

## Prüfung

- Unit-Tests für zentrale Umrechnung, Legacy-HTML, kanonische Inline-Runs, Span-Zusammenführung und identische Layoutmaße.
- Editor-Tests für die drei Zustände: gesamte Box, markierte Zeichen, Caret/Typing-Style; außerdem mehrere Folgeformatierungen ohne Neumarkierung.
- Persistenztest: editieren → committen → serialisieren → laden → erneut öffnen; Größen und HTML bleiben stabil.
- Zoomtests bei 25 %, 100 % und 400 %: gespeicherte `pt` bleiben gleich, Editor und Canvas stimmen visuell überein.
- Je ein Nutzerfluss in CAD und Mappe mit gemischtem Text `11 pt | 14 pt fett rot | 11 pt` einschließlich AutoSize und Reload.
- Anschließend gezielte Tests, Lint und Produktions-Build sowie vollständige Diff-/Secret-Prüfung.
