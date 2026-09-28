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

## Verbindliche Präzisierungen
1. **Instanz:** Die Export-Route nutzt dieselben CAD-Komponenten und Datenquellen. Die JavaScript-Instanz darf nach einem Routenwechsel neu entstehen. Entscheidend ist:
   - kein zweites Objektmodell, kein zweiter Renderer, keine zweiten Werkzeuge
   - kein eigener Speicher für Werkzeug-Einstellungen oder Ebenen
   - kein eigener Rückgängig-Verlauf
2. **Begriffe:**
   - CAD-Blatt = Zeichenquelle aus CAD
   - Exportseite = erweiterter `Plan`
   - CAD-Ausschnitt = `Projection`, also eine Referenz auf ein CAD-Blatt

   Rechts oben erscheinen nur echte CAD-Blätter als Quellen, nie Exportseiten oder deren Anmerkungs-Scenes. Links stehen nur Exportordner und Exportseiten. Die beiden Listen werden nie vermischt.
3. **Verknüpft als Standard:**
   - Neue Ausschnitte sind `linked` und speichern keine Geometriekopie.
   - Maßstab, Crop, Position und Rotation gehören zur Exportseite.
   - „Einfrieren“ ist eine bewusste Zusatzaktion mit Erklärung.
   - Beim Löschen eines CAD-Blatts mit verknüpften Ausschnitten erscheint eine Warnung mit der Wahl „Ausschnitte einfrieren“ oder „Als Platzhalter behalten“. Es wird nie stillschweigend gelöscht. Ein Platzhalter wird auf dem Papier als „Quelle fehlt“ gezeichnet.
4. **Zuverlässige Aktualisierung:** Verknüpfte Ausschnitte werden über eine Revisionsnummer pro CAD-Blatt invalidiert, nicht über einen Render-Cache. Die Nummer hängt nicht allein an `commitHistorySnapshot()`, sondern am zentralen Scene-Änderungssignal. Sie steigt bei:
   - jeder erfolgreichen Scene-Mutation und automatischem Snapshot
   - Undo/Redo
   - Import
   - Löschen
   - Ebenen-Sichtbarkeit
   - Cloud-Operationen (`applyOps`) und Cloud-Neuladen
5. **Auswahl vs. `includeInExport`:** `includeInExport` entfällt vollständig: nicht im Datenmodell, nicht in den Seiteneinstellungen, nicht in Serialisierung, Cloud oder PDF-Filter. Es gibt nur die temporäre Exportauswahl im UI, ohne Undo-Schritte und ohne gespeicherte Daten.
6. **PDF-Regel:** Alle gewählten Seiten werden zu einer gemeinsamen mehrseitigen PDF. Die Reihenfolge folgt dem sichtbaren Baum, rekursiv durch alle Ordner. Keine Seite erscheint doppelt.
7. **Cloud vollständig:** Diese Daten werden objektweise im bestehenden Operationsmodell übertragen:
   - Ordner, Exportseiten und ihre Einstellungen
   - Transparenzpause und Verbünde
   - Ausschnitt-Referenzen
   - Plan-Anmerkungs-Scenes

   Der bestehende Weg (`sceneDiff`/`applyOps`/`opsRepo`, `__structure__`) wird vor der Umsetzung im Code geprüft und mit einem Zwei-Geräte-Test abgesichert.
8. **Rückgängig-Verlauf projektweit:** Jeder Verlaufsschritt erfasst den vollständigen Zustand:
   - alle CAD-Blätter
   - alle Exportseiten und ihre Anmerkungs-Scenes
   - Ordner und Reihenfolgen
   - Seiteneinstellungen und Transparenzpausen
   - Ausschnitt-Referenzen

   Die bestehende Serialisierung `plans`/`planScenesById` wird dafür geprüft und um Ordner und Overlays ergänzt. Eine Änderung auf Seite A bleibt nach dem Wechsel zu Seite B oder zu CAD im Verlauf. Beim Rückgängigmachen wird der betroffene Bereich wieder aktiviert. Ein Test deckt die Abfolge A ändern, zu B wechseln, zu CAD wechseln, Undo ab.
9. **Transparenzpause projektweit:** Die Einstellungen aus `planOverlayStore` (Hintergrundseite, sichtbar, Deckkraft, Original/Einfärbung, Farbe) werden Teil des Planstands, der Serialisierung, des Verlaufs und der objektweisen Cloud-Übertragung. Ein zweites Gerät zeigt dieselbe Pause auf derselben Seite.
10. **Bearbeitungsregel:** Die Werkzeuge bleiben dieselben. Was auf einer Exportseite gezeichnet wird, landet in der Anmerkungs-Scene dieser Seite; das CAD-Blatt wird nicht verändert. Ein verknüpfter Ausschnitt ist eine Referenz und nicht mit CAD-Werkzeugen editierbar. Die Aktion „CAD-Blatt bearbeiten“ wechselt bewusst in den CAD-Bereich zu diesem Blatt.
11. **Veröffentlichung:** Commit A wird nicht allein veröffentlicht. Export ist erst sichtbar, wenn Commit B (Cloud für Anmerkungs-Scenes, Seitenstruktur, Transparenzpause, Ausschnitt-Referenzen) fertig ist und der Zwei-Geräte-Test bestanden ist. Bis dahin bleibt der Export-Tab hinter einem internen Schalter verborgen.
12. **Mappe unangetastet:** keine Migration, keine Umleitung, keine Löschung.

## Umsetzung

### 1. Navigation
- Im Kopf `CAD | Mappe | Export`. Export führt auf eine neue Route `/project/:id/export`, die dieselbe `CadPage`/`CadEditor`-Instanz mit `mode="export"` rendert.
- Beim Umschalten CAD ↔ Export wird nur `setActivePlanId(null | letzte Seite)` aufgerufen. Werkzeug, Einstellungen, Ebenen und Verlauf bleiben dieselben Objekte.
- Die Mappe bleibt unverändert.

### 2. Datenmodell (Erweiterung von `Plan`, kein zweites Modell)
- `Plan` erhält diese Felder:
  - `marginsMm`, `holePunch`, `offset` (Position), `spreadId`/`spreadIndex`
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
  - darunter die Einstellungen der aktiven Seite (Titel, Format, Ausrichtung, freie Maße, Ränder, Lochung, Position, Verbund)
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
  - CAD-Änderung in CAD: der verknüpfte Ausschnitt folgt; Undo/Redo: der Ausschnitt folgt korrekt
  - Werkzeug-Einstellung in CAD geändert: derselbe Wert erscheint im Export
  - Ebenen-Sichtbarkeit in CAD: der Ausschnitt reagiert identisch
  - Tablet-Ansicht: der Auswahlmodus ist per Finger vollständig bedienbar
  - Zwei-Geräte-Test: Plan-Scenes und Ausschnitte kommen auf dem zweiten Gerät an
- Typprüfung, Build, bestehende Tests.
- Die Dokumentation kommt nach `docs/export-architecture.md`, nicht in `AGENTS.md`. Inhalt: Begriffe, verknüpft vs. eingefroren, Speicher-/Cloud-Modell, Baum und PDF-Reihenfolge, Trennung Modellraum/Papier-Anmerkungen.

## Umfang
Die Aufgabe ist groß. Vorschlag: in einem Durchgang umsetzen, aber in zwei Commits:
- A: Navigation, Datenmodell, Seitenleiste, Seiteneinstellungen, PDF
- B: verknüpfte Ausschnitte und Cloud-Übertragung

## Technische Details
- Neue Dateien: `src/components/export/ExportSidebar.tsx`, `ExportPageSettings.tsx`, `src/cad/planTree.ts` (+ Test).
- Geänderte Dateien: `PlanManager.ts`, `PlanController.ts`, `PlanPdfExport.ts`, `CadApp.ts` (Modus-Schalter, Serialisierung), `CadEditor.tsx`, `CadPage.tsx`, `WorkspaceHeader.tsx`, `App.tsx`, `Renderer.ts` (Ränder/Lochung), `cadCollab/sceneDiff.ts`/`applyOps.ts` (Plan-Strukturobjekte).
- Nicht angefasst: Mappe (`ProjectWorkspace`, `MiniCad`, `projectStore`-Seiten), Werkzeuge, Auswahl, Fangpunkte, Zwischenablage.
