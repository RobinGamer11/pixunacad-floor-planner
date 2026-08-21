# Tabellen als native CAD-Objekte + Ebenen-Integration + Orga-Ansicht

## 1. Bestandsaufnahme (geprüft)

- **CAD-Engine**: `Scene` hält typisierte Objektlisten (`segments`, `hatches`, `dimensions`, `textBoxes`, `stickerInstances`, `documents`, `walls`, `doors`, `freeStrokes`). `TextBox` ist das passende Vorbild für die Tabelle: Rechteckobjekt mit `center`, `widthM`, `heightM`, `rotationRad`, `labelId` (= Ebene/Bezeichnung) und Style-Objekt.
- **Auswahl/HUB/Snap**: `SelectTool.ts` kennt Objektarten über einen Kind-String (`"textbox"`, `"hatch"`, …) — u. a. in `_iterAll` (Zeile ~4412), `boxCornersWorld` für Fangpunkte (~4378), Löschen (~4488), Objektlookup (~4822), Translate/Rotate/Handle-Logik. Verschieben, Drehen, Skalieren, Snap-Farben, Copy/Paste, Delete, Mehrfachauswahl laufen zentral hier.
- **Rendering**: `Renderer.ts` zeichnet Textboxen canvas-nativ (`_textBoxesBackToFront`, `_drawSingleTextBox`) inkl. Hover-/Selektionsdarstellung. Zellbearbeitung hat mit `TextEditorOverlay.ts` ein Vorbild: DOM nur während der Bearbeitung, nicht dauerhaft.
- **Serialisierung**: `sceneSerde.ts` (`SerializedScene`, `restoreOneScene`) plus die Speicherpfade in `CadApp`.
- **Aktueller Fehlstand**: `src/components/cad/CadTableLayer.tsx` (320 Zeilen DOM-Overlay mit eigener Auswahl, eigenen blauen Fangpunkten, eigenem Move-/Rotate-HUB, eigener Kamera-Nachführung) und `src/lib/cadTableStore.ts` (eigene localStorage-Persistenz `pixuna.cadTables.*`).
- **Gemeinsame Logik bleibt**: `src/lib/table/tableModel.ts`, `tableLayout.ts`, `tableFormula.ts`.

Zusätzlich gefunden:
- **Mappe**: `placeTableOnPage()` legt das Tabellenelement ohne `labelId` an — deshalb taucht die Tabelle nicht in der Ebenenstruktur der Projektmappe auf (andere Objekte setzen `labelId: engine.activeDrawLabelId`).
- **Orga**: `getBoardSurface()` in `src/lib/timelineStore.ts` kann nie `"cal"` zurückgeben (nur `"net"`/`"ray"`), deshalb geht die Kalenderansicht beim Zurückkehren verloren.

## 2. CAD-Zielarchitektur

### Szenenobjekt
Neue Klasse `TableObject` in `src/cad/Scene.ts`, analog `TextBox`:

```text
TableObject {
  id, center: Vec2, rotationRad, labelId
  data: TableData          // gemeinsames Modell aus lib/table
  mmPerModelUnit: number   // Papier-mm → Meter (Blattmaßstab bei Erstellung, z. B. 1:100)
  // widthM/heightM werden aus layoutTable(data) * Maßstab abgeleitet (keine Redundanz)
}
```
Scene bekommt `tables: TableObject[]`, `createTable/removeTable/getTableById` und `_rebuildTableIdMap` nach dem Muster der Textboxen.

### Auswahl / HUB / Snap / Layer
Kein neuer Interaktionscode. In `SelectTool.ts` wird die Objektart `"table"` an genau den bestehenden Stellen ergänzt: Iterator, Eckpunkt-/Fangpunktberechnung (`boxCornersWorld` — Tabelle ist ein rotiertes Rechteck wie die Textbox), Translate, Rotate, Scale-Handles, Delete, Copy/Paste, Lookup, Mehrfachauswahl. Damit gelten automatisch die bestehenden Snapfarben, HUB-Symbole und Ebenenlogik (`labelId`).

### Renderer
`Renderer.ts` erhält `_drawTables()` analog `_drawSingleTextBox`: Zellraster und Text canvas-nativ über `layoutTable()` und `tableFormula`, Linienbreiten in Bildschirmpixeln (zoomstabil scharf), Kopfzeile/Zellhintergründe/Rahmenstile (einfach, doppelt, Kantenschaltung) exakt wie in der Mappe. Kein Overlay, keine rAF-Nachführung.

### Zellmodus
Ein Zustand `tableEditId` in `CadApp`. Doppelklick auf eine Tabelle (an der Stelle, an der heute Textboxen inline editierbar werden) oder „Tabelle bearbeiten“ im Panel startet ihn. Solange er aktiv ist:
- Objekttransformation der Tabelle ist gesperrt (wie in der Mappe),
- Zellselektion/Zeilen-Spalten-Griffe werden vom Renderer gezeichnet,
- Texteingabe läuft über ein temporäres Eingabefeld nach dem Muster von `TextEditorOverlay`.
ESC/Klick außerhalb beendet den Modus und stellt normale CAD-Objektinteraktion her.

### Persistenz / Migration
`SerializedScene.tables` in `sceneSerde.ts` ergänzen (Serialisieren + `restoreOneScene`), damit Tabellen mit Blatt/Projekt gespeichert und geladen werden, inkl. Undo/Redo über die bestehende History.
Einmalige Migration beim Laden eines Blattes: vorhandene `pixuna.cadTables.<projectId>`-Einträge werden in Szenen-Tabellen übernommen und der localStorage-Schlüssel als `…​.migrated` umbenannt statt gelöscht. Danach werden `CadTableLayer.tsx` und `cadTableStore.ts` entfernt.

## 3. Weitere Punkte dieser Aufgabe

- **Mappe – Ebenenstruktur**: `placeTableOnPage()` setzt `labelId: cadEngine.activeDrawLabelId`, damit Tabellen wie alle anderen Elemente in der Ebenenliste erscheinen, umgehängt und aus-/eingeblendet werden können.
- **CAD – Ebenenstruktur**: über `labelId` am `TableObject` (Standard: aktive Bezeichnung), inklusive Sichtbarkeitsfilter im Renderer.
- **Orga**: `getBoardSurface` gibt `"cal"` korrekt zurück; Kalenderansicht bleibt nach Verlassen/Zurückkehren aktiv.

## 4. Reihenfolge

1. Orga-Fix und Ebenen-Zuordnung in der Mappe (klein, risikoarm).
2. `TableObject` + Scene-API + Serialisierung (noch ohne UI-Änderung).
3. Renderer für Tabellen (Anzeige nativ, Overlay parallel noch aktiv).
4. `SelectTool`-Integration (Auswahl, HUB, Snap, Transformation, Copy/Paste, Delete).
5. Zellmodus über temporäres Eingabefeld + Panel-Anbindung `TableToolSettings`.
6. Migration alter `cadTableStore`-Daten, danach Overlay und Store entfernen.

## 5. Abschlussprüfung

Tabelle erstellen, auswählen, mit CAD-HUB verschieben/drehen/skalieren, Snapfarben, Ebene wechseln/ausblenden, Copy/Paste, Delete, Undo/Redo, Doppelklick → Zellmodus, Zellbearbeitung, Modus verlassen, Speichern → Reload, Blattwechsel, PDF-Export; zusätzlich `tsgo` und Vitest.
