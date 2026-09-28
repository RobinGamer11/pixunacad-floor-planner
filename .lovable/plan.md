# Neuer Bereich „Export“ auf der bestehenden CAD-Engine

## Ausgangslage (Bestand)
Die CAD-Oberfläche hat schon einen Druckplan-Modus:
- `PlanManager` (Pläne mit Format/Quer/Frei, Projektionen), `PlanPanel` (schwebende Liste), `PlanController` (Projektionen verschieben, drehen, zuschneiden), `PlanPdfExport` (mehrseitige PDF über pdf-lib).
- `CadApp.setActivePlanId()` tauscht die aktive Scene gegen eine eigene Anmerkungs-Scene pro Plan. Alle Werkzeuge, Fangpunkte, die Auswahl, Copy/Paste und der Verlauf laufen dabei weiter über dieselbe `CadApp`.
- Transparenzpause pro Plan über `planOverlayStore`.

Lücken:
- Projektionen sind eingefrorene Snapshots, keine Verknüpfungen.
- Es gibt keine Ordner, keine Ränder, keine Lochung und keinen Seitenverbund.
- Pläne und Plan-Scenes werden nicht objektweise in die Cloud übertragen.

Export wird deshalb zu **CadApp im Plan-Modus mit neuer Oberfläche**. Es entsteht keine neue Engine.

## Umsetzung

### 1. Navigation
- Im Kopf `CAD | Mappe | Export`. Export führt auf eine neue Route `/project/:id/export`, die dieselbe `CadPage`/`CadEditor`-Instanz mit `mode="export"` rendert.
- Beim Umschalten CAD ↔ Export wird nur `setActivePlanId(null | letzte Seite)` aufgerufen. Werkzeug, Einstellungen, Ebenen und Verlauf bleiben dieselben Objekte.
- Die Mappe bleibt unverändert.

### 2. Datenmodell (Erweiterung von `Plan`, kein zweites Modell)
- `Plan` erhält diese Felder:
  - `marginsMm`, `holePunch`, `offset` (Position), `spreadId`/`spreadIndex`, `includeInExport`
  - `parentFolderId`, `order`
- Neu `PlanFolder { id, name, parentId, order, collapsed }` in `PlanManager`, mit Methoden für Baum, Verschieben, Umbenennen und Löschen.
- Die sichtbare Baum-Reihenfolge ergibt die Export-Reihenfolge (`flattenTreeOrder()`).
- `Projection` erhält `mode: "linked" | "frozen"`:
  - `linked` referenziert `sourceSheetId` und liest die Geometrie live aus `scenesById`. Die Cache-Invalidierung hängt an Scene-Änderungen.
  - `frozen` nutzt den bisherigen `sceneSnapshot` (alte Daten bleiben lesbar).
- Die Exportauswahl lebt nur im React-Zustand. Sie erzeugt keine Undo-Schritte. Das alte Feld `selected` wird nur noch beim Lesen alter Daten berücksichtigt.

### 3. Linke Exportseiten-Leiste (neu, React)
- `src/components/export/ExportSidebar.tsx` liegt neben der unveränderten CAD-Werkzeugleiste.
- Oben die Knöpfe „Exportieren“, „+ Seite“ und „+ Ordner“.
- Darunter der Baum:
  - Ordner mit Seitenanzahl, ein- und ausklappbar
  - Seiten mit Titel und Format (z. B. „A3 quer“)
  - Umbenennen per Doppelklick
  - Drag & Drop über Pointer-Events, damit es auch auf dem Tablet funktioniert
- Unten die Transparenzpause, gelesen und geschrieben über `planOverlayStore`: Hintergrundseite, sichtbar, Deckkraft, Original/Einfärbung, Farbe.
- Exportauswahl-Modus:
  - große Zeilen-Checkboxen, die aktive Seite ist vorgewählt
  - Ordner mit drei Zuständen (leer / Häkchen / Minus)
  - Ergebnis ohne doppelte Seiten, in Baum-Reihenfolge
  - Knöpfe „Abbrechen“ und „N Seiten als PDF exportieren“
- „+ Seite“ nutzt die bestehende Formatwahl, erweitert um den Seitentitel.
- Im Export-Modus wird das alte schwebende `PlanPanel` ausgeblendet, damit es keine doppelte Bedienung gibt.

### 4. Papierbereich
- Bestehende Darstellung über `renderer.planMode`, ergänzt um Randlinien, Lochungsmarken und Seitenverbund. Diese Hilfslinien werden nicht exportiert (`isExportMode`).

### 5. Rechte Seite
- Reiter „Seiteneinstellungen“ (neu):
  - oben die CAD-Blätter zum Ziehen oder per „Platzieren“ als verknüpften Ausschnitt einfügen; Einstellungen: Maßstab, Position, Crop, Drehung, Aktualisieren, Einfrieren
  - darunter die Einstellungen der aktiven Seite (Titel, Format, Ausrichtung, freie Maße, Ränder, Lochung, Position, Verbund, beim Export berücksichtigen)
- „Werkzeugeinstellungen“ und „Ebenen“ bleiben die bestehenden CAD-Reiter ohne Kopie.

### 6. PDF-Export
- `PlanPdfExport` wird erweitert: Seiten in Baum-Reihenfolge, Ränder und Lochung nach der bestehenden Mappen-Semantik, verknüpfte Ausschnitte live gerendert.
- Die Transparenzpause wird weiterhin nicht mitgedruckt.

### 7. Speichern, Verlauf, Cloud
- Jede Seiten- oder Ordneraktion schreibt genau einen `commitHistorySnapshot()`. Ziehen und Tippen schreibt erst am Ende.
- Die Cloud-Struktur (`__structure__`) wird um die Objekte `plans`/`planFolders` ergänzt. Plan-Anmerkungs-Scenes werden objektweise wie Blätter übertragen (Blatt-ID `plan:<id>`).
- Es gibt keinen Gesamtupload. Die Regeln aus `decideOpen` und `cloud`/`shared` bleiben unverändert.

### 8. Tests und Abnahme
- Unit-Tests:
  - Baum-Reihenfolge
  - Ordner-Dreifachzustand und Duplikatfreiheit
  - Undo pro Aktion
  - verknüpfte gegenüber eingefrorener Projektion
  - Serialisierung und Rückwärtskompatibilität alter Pläne
- Playwright mit Sitzung:
  - Export öffnen, Seite A3 quer anlegen, Linie zeichnen
  - CAD-Blatt platzieren, in CAD ändern, Ausschnitt aktualisiert sich
  - Ordner mit zwei Seiten exportieren ergibt eine PDF mit zwei Seiten
  - Mappe weiterhin unverändert
- Typprüfung, Build, bestehende Tests.
- Die Dokumentation der wiederverwendeten Bausteine kommt in `AGENTS.md`.

## Umfang
Die Aufgabe ist groß. Vorschlag: in einem Durchgang umsetzen, aber in zwei Commits:
- A: Navigation, Datenmodell, Seitenleiste, Seiteneinstellungen, PDF
- B: verknüpfte Ausschnitte und Cloud-Übertragung

## Technische Details
- Neue Dateien: `src/components/export/ExportSidebar.tsx`, `ExportPageSettings.tsx`, `src/cad/planTree.ts` (+ Test).
- Geänderte Dateien: `PlanManager.ts`, `PlanController.ts`, `PlanPdfExport.ts`, `CadApp.ts` (Modus-Schalter, Serialisierung), `CadEditor.tsx`, `CadPage.tsx`, `WorkspaceHeader.tsx`, `App.tsx`, `Renderer.ts` (Ränder/Lochung), `cadCollab/sceneDiff.ts`/`applyOps.ts` (Plan-Strukturobjekte).
- Nicht angefasst: Mappe (`ProjectWorkspace`, `MiniCad`, `projectStore`-Seiten), Werkzeuge, Auswahl, Fangpunkte, Zwischenablage.
