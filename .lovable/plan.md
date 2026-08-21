# Tabellenwerkzeug – Bestandsanalyse und Umsetzungsplan

## 1. Was heute existiert

**Datenmodell (`src/lib/projectStore.ts`)**
`PageElement.kind === "table"` mit `tableData`: `cells: string[][]`, optional `colWidths`/`rowHeights` (mm, werden aktuell nirgends gelesen), `filters`, `headerRow`, `borderColor`, `borderWidthPx`, `background`, `headerBackground`. Position/Größe laufen über die normalen Element-Felder (`x/y/w/h` in % plus kanonisch `xMm/yMm/wMm/hMm`), Rotation, Ebene (`layerName`), Gruppen und Undo/Redo sind damit bereits vorhanden.

**Darstellung (`src/components/page/TableElementView.tsx`, 459 Zeilen)**
HTML-`<table>` im Element-Rahmen, Formelauswertung (`evalCell`) für SUM/AVG/MIN/MAX/COUNT inkl. Bereichs-Referenzen (`A1:A9`), Spaltenfilter, Formel-Klick-Picker.

**Einstellungen (`src/components/page/TableToolSettings.tsx`)**
Zeilen/Spalten-Stepper (setzt `w/h` aus festen 26×7 mm), Rahmen/Hintergrundfarben, Formel-Buttons, Bestätigen/Abbrechen für die Platzierung (`pendingTableId`).

**Export/Vorschau**
PDF- und Druckexport laufen über html2canvas auf dem gerenderten DOM – die Tabelle wird also bereits korrekt exportiert. `PageThumb` zeichnet eine grobe Rasterminiatur.

**CAD-Oberfläche:** kein Tabellenobjekt vorhanden (weder Scene-Typ noch Renderer noch Serialisierung).

## 2. Was Bedienprobleme verursacht

- `onPointerDown` wird im Tabellen-Root gestoppt → das Objekt lässt sich über seiner eigenen Fläche **nicht verschieben**; Objekt- und Zellebene sind nicht getrennt.
- Ein Klick öffnet sofort die Zellbearbeitung – versehentliche Änderungen im Auswahlmodus.
- `overflow-auto` macht die Tabelle zu einem Mini-Browserfenster statt gedrucktem Seiteninhalt.
- Zellhöhen/-breiten sind Pixel (`minWidth: 64`, `minHeight: 32`), nicht Papier-mm; `colWidths`/`rowHeights` werden ignoriert, Zoom-Verhalten dadurch inkonsistent.
- Kein Tab/Enter-Navigieren, keine Mehrfachzellauswahl, kein Merge, keine Zellformatierung, kein Drag an Spalten-/Zeilengrenzen.
- Modifizier-Modus zeigt eigene +/− Mini-Buttons in eigener visueller Sprache (destructive/primary statt Pixuna-Gold/Hairline).

**Brauchbar und zu erhalten:** Datenmodell-Anker `tableData`, Formelauswertung, Filterlogik, Settings-Panel-Gerüst, Platzierungs-Flow mit `pendingTableId`, Element-Integration (Ebenen, Undo/Redo, Export).

## 3. Zielarchitektur (eine Lösung, keine zweite parallel)

Gemeinsam nutzbar (engine-unabhängig), neu als `src/lib/table/`:
- `tableModel.ts` – Typen + Migration `cells: string[][]` → strukturiertes Modell, Zeilen/Spalten in mm, Zellformate, Merges. Alte Daten bleiben lesbar und werden beim Laden verlustfrei migriert.
- `tableFormula.ts` – die bestehende `evalCell`-Logik ausgelagert, erweitert um Zellarithmetik (`=C2*D2`) und Bereichsfunktionen; Auswertung über eine Referenz-Auflösung, damit spätere Funktionen ohne Modelländerung möglich sind.
- `tableLayout.ts` – berechnet aus dem Modell Spaltenränder, Zeilenränder und Zellrechtecke in Papier-mm (eine Quelle für Mappe-DOM, CAD-Canvas und Miniaturen).

Engine-spezifisch bleibt nur: Hit-Test, Eingabefeld-Overlay, Renderer.

Datenmodell (migrierbar, additiv):

```text
tableData {
  cells: string[][]                  // bleibt: Rohwerte (Text oder "=...")
  colWidthsMm: number[]              // pro Spalte
  rowHeightsMm: number[]             // pro Zeile
  cellFormats?: { [ "r,c" ]: {       // sparse, nur belegte Zellen
      align, valign, fontSizePt, bold, italic, color, background } }
  merges?: { r, c, rowSpan, colSpan }[]
  headerRow, borderColor, borderWidthPx, background, headerBackground, filters  // wie bisher
}
```

## 4. Bedienkonzept

**Auswahlmodus (Default):** Tabelle ist ein Objekt – Auswahlrahmen, HUB, Verschieben, Drehen, Skalieren, Kopieren/Einfügen, Löschen, Ebene, Vorder-/Hintergrund. Keine Zellinteraktion, keine internen Buttons.

**Tabellenmodus:** Start per Doppelklick oder „Tabelle bearbeiten“ im Einstellungspanel; Ende per ESC oder Klick außerhalb. Im Tabellenmodus ist die Objekt-Transformation deaktiviert (und umgekehrt) – ein einziges Zustandsfeld steuert beides, damit sie nie gleichzeitig aktiv sind.

Im Tabellenmodus: Zelle wählen, tippen, Tab/Shift+Tab, Enter/Shift+Enter, ESC; Zellbereich per Drag; Zeilen/Spalten einfügen/löschen; Merge/Unmerge; Ausrichtung, Schriftgröße, fett/kursiv, Textfarbe, Zellhintergrund über das rechte Panel; Spaltenbreite/Zeilenhöhe per Drag an den Gitterlinien (eigener Cursor, ändert nur `colWidthsMm[i]` bzw. `rowHeightsMm[i]`, nie die Objektgröße).

**Platzierung:** Werkzeug aktivieren → Panel fragt Spalten × Zeilen (Default 3 × 4) → Aufziehen auf der Seite oder Klick für Standardgröße (Spaltenbreite 26 mm, Zeilenhöhe 7 mm). Gespeichert wird in Papier-mm.

## 5. Design-Konsistenz

Vor der Umsetzung werden die bestehenden Muster übernommen statt neu erfunden: Auswahlrahmen und HUB-Griffe der Projektmappen-Elemente, Fangpunkt- und Hover-Farben der CAD-Objekte, `--accent-gold` als Aktivfarbe, `--hairline` für Rahmen, die Panelbausteine aus `CadFieldProxies`/den bestehenden Werkzeugpanels (gleiche Höhen, Radien, Schriftgrößen), vorhandene lucide-Icons (Verschieben/Drehen/Löschen/Kopieren wie bei anderen Werkzeugen). Die heutigen `bg-destructive/10`- und `bg-primary/10`-Mini-Buttons der Tabelle werden auf diese Sprache angeglichen. Abschluss-Check auf Icons, Farben, Größen, HUB-Verhalten.

## 6. Reihenfolge (Risiko begrenzt)

**Schritt 1 – gemeinsames Modell:** `src/lib/table/` anlegen, `evalCell` dorthin verschieben (bestehende Importe umbiegen), Migration alter `tableData` einbauen. Keine sichtbare Änderung.

**Schritt 2 – Projektmappe professionell:** `TableElementView` auf mm-Layout, getrennte Objekt-/Zellmodi, Tastaturnavigation, Grenz-Drag, Merge, Zellformate; `TableToolSettings` auf die bestehende Panel-Sprache und die neuen Optionen umstellen; Platzierungs-Flow mit Spalten/Zeilen-Vorwahl und Aufziehen; kein interner Scrollcontainer; Miniatur und Export prüfen.

**Schritt 3 – CAD-Oberfläche:** erst nach stabiler Mappe. CAD-natives Tabellenobjekt in Scene/Renderer/Serialisierung, Weltkoordinaten, Layer, HUB, Hit-Test, Zellbearbeitung über ein Overlay-Eingabefeld (analog `TextEditorOverlay`), PDF-/Druckexport. Gleiches Modell, gleiche Formel- und Layout-Module.

Falls Schritt 3 sich als riskant zeigt, endet die Lieferung nach Schritt 2 mit klarer Ansage – keine halbfertige Lösung in beiden Oberflächen.

## 7. Tests je Schritt

Platzieren; Objekt auswählen/verschieben/drehen/skalieren; Bearbeitungsmodus betreten/verlassen; Zellen bearbeiten ohne Objektbewegung; Spaltenbreite- und Zeilenhöhen-Drag; Undo/Redo; Copy/Paste; Ebene aus-/einblenden; Speichern und neu laden; Zoom/Pan; PDF- und Druckexport; Laden bestehender Projekte mit alten Tabellen; zusätzlich `tsgo` und die vorhandenen Vitest-Tests.
