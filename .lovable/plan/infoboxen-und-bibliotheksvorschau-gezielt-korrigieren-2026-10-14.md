# Infoboxen und Bibliotheksvorschau gezielt korrigieren

## Geprüfter Ausgangsstand

Lokaler Stand, `origin/main` und GitHub `RobinGamer11/pixunacad-floor-planner/main` stimmen überein: `23f6341df`.

## Änderungen

1. **Stellenvorschau entfernen:** Den gesamten Bereich „Vorschau der Stelle“ einschließlich Augenschalter aus den Infobox-Einstellungen entfernen. Bestehende gespeicherte Infoboxen bleiben erhalten.
2. **Informationsbox kompakt verbreitern:** Das „i“-Symbol bleibt sichtbar; rechts daneben steht der Titel. Die Box wächst passend zum Titel nach rechts, bei unverändertem Ankerpunkt. Aufgabenboxen und der obere Infobox-Knopf behalten ihre bisherige Gestaltung.
3. **Einstellungen bei Werkzeugwechsel schließen:** Die Infobox-Auswahl und ihre flüchtige Bearbeitung beim Wechsel zu einem anderen Werkzeug beenden – auch wenn der Infobox-Setzmodus nicht aktiv ist. Rechts erscheinen die Einstellungen des neuen Werkzeugs; keine Infobox-Einstellungen bleiben darüber liegen.
4. **Kein blauer Auswahlrahmen:** Den noch gemeldeten Rahmen im tatsächlichen Auswahlablauf lokalisieren und ausschließlich für Infoboxen unterdrücken. Der einzelne Fang-/Greifpunkt und das Verschieben mit Vorschau bleiben bedienbar, auch per Tablet. Andere Objektarten behalten ihre Auswahlmarkierungen.
5. **Großer Auflösen-Knopf:** In „Darstellung“ eines ausgewählten Bibliotheksexemplars einen großen, hervorgehobenen Knopf „Ausgewähltes Exemplar auflösen“ mit passendem Symbol ergänzen. Er nutzt dieselbe Aktion wie der vorhandene Knopf unter der Bibliothek, wirkt nur auf das gewählte Exemplar und erzeugt genau einen Rückgängig-Schritt.
6. **Keine falsche Polygon-Schlusslinie:** Bibliotheksvorschauen respektieren offene Polygone: keine zusätzliche Verbindung zwischen letztem und erstem Punkt und keine künstliche Füllfläche. Tatsächlich geschlossene Polygone bleiben geschlossen. Gilt für kleine Bibliotheksbilder und die Platzierungsvorschau.
7. **Feste Zeichnungsgröße und Position:** Infoboxen haben feste Maße in der Zeichnung, nicht auf dem Bildschirm. Die eingestellte Breite (Standard 0,50 m) bestimmt die Größe; beim Rauszoomen werden Box, Symbol und Titel entsprechend kleiner, beim Reinzoomen größer. Beim Verschieben der Ansicht bleibt die Box an derselben Zeichnungsstelle. Auswahl und Verschiebevorschau nutzen denselben Anker und dieselben Maße; ausreichend große Tablet-Trefferflächen verändern nicht die sichtbare Boxgröße.

## Technische Details

- `InfoBoxSettingsPanel.tsx`: `SpotPreview`, dessen Aufruf und nicht mehr benötigte Augen-Imports entfernen; keine destruktive Änderung gespeicherter Felder.
- `CadInfoBoxLayer.tsx`: Die aktuelle feste Pin-Größe von 32 Bildschirm-Pixeln durch aus Zeichnungsmaßen und Kameramaßstab abgeleitete Abmessungen ersetzen. Symbol, Titel, Box und Verschiebevorschau gemeinsam skalieren; die kompakte Titel-Erweiterung in Zeichnungsmaßen bestimmen, nicht bei jedem Zoom neu umbrechen. Den gespeicherten Weltanker erhalten und mit der Kamera projizieren. Fang-/Auswahlgeometrie in `infoBoxUi.ts` und den Verbrauchern auf dieselben Maße abstimmen. Vorhandene Navigation beibehalten, keine zusätzliche Zoom-Implementierung.
- Werkzeugwechsel und Panelpriorität in `CadApp.ts`/`CadEditor.tsx` prüfen; flüchtige Auswahl über `infoBoxUi` zurücksetzen. Aktuell überwacht die Infobox-Ebene den Werkzeugwechsel nur bei aktivem Setzmodus.
- Die Herkunft des verbleibenden blauen Rahmens ist noch nicht bestätigt; Auswahlzeichnung einschließlich `SelectTool` untersuchen, bevor sie geändert wird.
- `LibraryPanel.tsx`: Auflösen auch im Bearbeitungszweig anbieten. Dieser Zweig beendet die Darstellung derzeit vor dem vorhandenen Knopf am Listenende.
- `LibraryGeometryPreview.tsx`: Der Vorschaupfad für `hatch` schließt und füllt derzeit immer. Vorhandene Snapshot-Felder `isPolygon` und `closed` berücksichtigen; gespeicherte Geometrie nicht umschreiben.
- Keine neuen Pakete, keine Datenbankänderungen, keine Änderung am allgemeinen Hilfslinienprinzip.

## Prüfung und Abschluss

- Gezielte Regressionstests für Werkzeugwechsel, offene/geschlossene Polygongeometrie und Auflösen einschließlich Rückgängig-Verhalten. Größenregel konkret prüfen: 0,50 m ergeben bei 20 px/m eine Basisbreite von 10 px und bei 80 px/m 40 px; Zoom und Pan verändern die gespeicherten Weltkoordinaten nicht.
- Vorhandene Infobox- und Bibliothekstests ausführen; automatische Build-Ausgabe und vorhandene Fehler prüfen.
- Bedienung in der laufenden Anwendung mit Maus und Tablet-Berührung prüfen: Box öffnen → Werkzeug wechseln, Titel ändern, rein-/rauszoomen und Ansicht verschieben (Größe maßstäblich, Anker stabil), Fangpunkt/Verschiebevorschau, Bibliotheksexemplar auflösen und rückgängig machen.
- Änderungen und nicht durchführbare Prüfungen knapp benennen. Lovable verwaltet Commit und Synchronisierung; GitHub-main anschließend lesend verifizieren und einen nicht erfolgten Transfer ausdrücklich melden.

PowerShell zum sicheren Abruf des GitHub-Stands im lokalen Repository: `git fetch origin main` (ändert keine Arbeitsdateien).
