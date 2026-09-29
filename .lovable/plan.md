# Export: Seiteneinstellungen wie Mappe, Lochungsmuster, echter Verbund, mindestens eine Seite, CAD-Startansicht

## 1. Seiteneinstellungen im Mappen-Stil
- Die Gestaltung von `PageSettings` (ProjectWorkspace) wird als datenmodellneutrale Bausteine herausgelöst: Abschnittsüberschrift, Format-Auswahlfeld (Bezeichnung + Maße), zwei Symbolknöpfe Hoch/Quer, Ränder (Checkbox + Zahl + „mm“), Lochungsgruppe, Verbundgruppe.
- Die Mappe nutzt diese Bausteine weiter mit ihren eigenen Daten (sichtbar unverändert). Der Export nutzt sie mit PlanManager-Daten. ProjectWorkspace wird nicht eingebettet.
- Reihenfolge im Tab: CAD-Blätter, SEITENEINSTELLUNGEN (Titel, Format, Ausrichtung, Ränder, Hintergrund wie bisher), ABHEFTUNG, SEITENANSICHT (VERBUND), danach der ausgewählte Ausschnitt.

## 2. Lochungsmuster
- `holePunch: boolean` wird zu `holePattern: "none" | "din2" | "four" | "a5ring6"`; die Position `holePunchSide` bleibt.
- Beim Einlesen: `holePunch:false` wird zu `none`, `true` wird zu `din2`. Geschrieben wird nur noch `holePattern`.
- `pageGuides.ts` liefert für jedes Muster und jede Position die Lochmittelpunkte und die gemeinsame Mitte. Renderer und Fangpunkte verwenden genau diese Funktion. In der PDF erscheint keine Lochung (unverändert nur im Exportmodus).

## 3. Echter Seitenverbund
- Neue Felder: je Seite `spreadOffset {xMm, yMm}`, je Verbund `spreadLayoutMode: "grid" | "free"` (am Verbund gespeichert, synchronisiert wie die übrigen Planfelder).
- `grid`: Die Seiten werden automatisch bündig nebeneinander gelegt. `free`: Die Versätze sind frei verschiebbar.
- Auf der Exportfläche wird die aktive Seite gemeinsam mit ihren Verbundseiten als zusammenhängende Papierfläche gezeichnet. Nur die aktive Seite ist bearbeitbar; ein Antippen einer Nachbarseite macht sie zur aktiven Seite. So gehören Anmerkungen, Ausschnitte, Fangpunkte und Werkzeuge immer eindeutig zu einer Seite.
- Im Modus `free` hat jede Verbundseite einen Griff: Ziehen mit Finger oder Stift, flüssige Vorschau, Einrasten an Nachbarkanten, Speichern erst beim Loslassen (genau ein Verlaufsschritt), kein Sprung beim ersten Berühren.
- Aktionen: „Mit vorheriger/nächster Seite verbinden“, „Anordnung zurücksetzen“, „Aus Verbund lösen“.
- PDF: Ein Verbund wird zu einer gemeinsamen PDF-Seite (Begrenzungsrahmen aller Seiten, jede Seite an ihrem Versatz).
- Es wird kein Verbund-Code aus der alten Mappe übernommen; nur die Feldnamen dienen als Vorlage.

## 4. Mindestens eine Exportseite
- `PlanManager.deletePlan()` lehnt das Löschen der letzten Seite ab (auch beim Löschen eines Ordners, der die letzte Seite enthält). In der linken Leiste ist die Löschaktion dann ausgegraut.
- Gibt es im Export noch keine Seite, wird automatisch eine A4-Seite angelegt.

## 5. CAD-Startansicht
- Neue bzw. noch nie geöffnete Blätter starten mit einer festen, weiter herausgezoomten Ansicht (etwa 40 m Bildbreite, auf den Ursprung zentriert).
- Eine gespeicherte Blattansicht bleibt erhalten. Beim Rückwechsel von Export nach CAD wird die gespeicherte Ansicht des Blatts wiederhergestellt, nicht die Kamera der Exportseite.

## Prüfung
- Unit-Tests: Lochungsgeometrie (3 Muster × 4 Positionen), Übernahme alter Daten, Verbund-Anordnung (grid und Rücksetzen), letzte Seite nicht löschbar, Kamera-Startansicht.
- Typprüfung, Build, bestehende Tests.
- Browser-Prüfung mit Anmeldung ist hier nicht möglich. Die Sichtprüfung übernimmst du: Tablet-Ziehen, PDF des Verbunds, Lochung fehlt in der PDF.

## Technische Details
- Geändert: `PlanManager.ts` (Felder, Übernahme alter Daten, deletePlan-Regel, Verbundfunktionen), `pageGuides.ts`, `Renderer.ts` (Nachbarseiten im Verbund, Muster), `CadApp.ts` (Fangpunkte, Kamera je Blatt, Verbund-Ziehen), `PlanPdfExport.ts` (Verbund als eine Seite), `ExportPageSettings.tsx`, `ExportSidebar.tsx`, neue gemeinsame Bausteine unter `src/components/pageSettings/`, `ProjectWorkspace.tsx` (nutzt dieselben Bausteine, sichtbar unverändert).
- Cloud: Die neuen Felder laufen über die bestehende Planstruktur-Synchronisierung. Kein neues Tabellenschema.
