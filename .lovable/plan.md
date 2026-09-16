# CAD-Bibliothek kompakt neu gestalten

## Ziel
Die Bibliotheks-Seitenleiste wird entsprechend den beiden Referenzen dichter, klarer und schneller scannbar. Alle vorhandenen Aktionen und ihre bestehende Logik bleiben erhalten.

## Umsetzung
- Bibliotheksübersicht mit kompakter Hauptaktion, Suche, Kategorie-/Tag-Filtern, Import-Dropdown und Zusatzmenü neu ordnen.
- Vorhandene Kategorien als rein visuelle, aufklappbare Ordner mit Objektanzahl darstellen; keine neue Speicherung oder Verschiebelogik.
- Bibliotheksobjekte als dichte Zeilen mit Auswahlzustand, Platzieren-Icon und Menü für Bearbeiten, PXOBJ-/SVG-/DXF-Export und Löschen darstellen.
- Für das ausgewählte Objekt unten eine angeheftete Aktionsleiste mit Vorschau, Namen, Kategorie, Platzieren und Aktionsmenü ergänzen.
- Eine echte, nicht-interaktive 2D-Vorschau direkt aus den vorhandenen Geometrie-Snapshots erzeugen und in Liste, Aktionsleiste sowie Speichern-/Bearbeitenansicht wiederverwenden.
- Speichern und Bearbeiten gemäß Referenz neu gliedern: Kopf mit Zurück, Status, Modusumschalter, kompakte Stammdaten, Tag-Chips, geschlossenes Akkordeon für Zusatzinformationen, Einfügepunkt-Hinweis und getrennte Abschlussaktionen.
- Schmale Seitenleisten berücksichtigen: Filter umbrechen lassen, Inhalte scrollbar halten und Aktionen als Icons/Menüs verfügbar lassen.

## Technische Grenzen
- Keine Änderungen an Zeichenengine, Scene, Renderer, Bibliotheks-Datenmodell, Import-/Export- oder Platzierungslogik.
- Keine Migration, neue Ordnerpersistenz oder Änderung der Bedeutung von Kopie/Original.
- Kategorien bleiben die alleinige Grundlage der visuellen Ordnergruppen.

## Prüfung
- Gezielte Typ-/Lint-Prüfung der geänderten Oberfläche.
- Produktions-Build.
- Sichtprüfung der Bibliotheksübersicht und Speichern-/Bearbeitenansicht in breiter und schmaler Seitenleiste, soweit der vorhandene Testzugang dies erlaubt.
- Git-Diff auf unbeabsichtigte Änderungen außerhalb der Bibliotheksoberfläche prüfen.
