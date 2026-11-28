# Beitragsaktionen und beidseitige Infoboxen

Basis: `896950a3`; HEAD und lokale Referenz `origin/main` stimmten beim Start überein. Kein neuer Remoteabruf/Push in diesem Turn.

## Ergebnis
- Organisationsübersicht: Symbolaktionen sind in Kalender, Ansichtstrahl, Projektnetz und Gantt ausgeblendet. Beiträge lassen sich weiterhin öffnen. Die Aktuelle-Beiträge-Liste behält ihre Aktionen.
- Beitragsdialog: 16-px-Mülltonne mit 40-px-Bedienfläche direkt rechts neben Schließen; kein großer Löschtextknopf. Weiß im dunklen Design, kontrastgerecht dunkel im hellen Design. Datumseingaben nutzen im dunklen Design helle native Kalendersymbole. Bestehende Bestätigung, Schreibrechte und Undo bleiben unverändert.
- Infobox-Geometrie erhält eine zusätzliche kreisförmige Rückseitenfläche außerhalb des Körpers. Rückseitige UV-Koordinaten sind gespiegelt, damit das Symbol von hinten richtig herum erscheint. Keine Änderung an gespeicherten CAD-Objekten oder 2D-Optik.

## Prüfungen
- 30/30 Tests: `infoBoxGeometry.test.ts`, `package02.test.ts`, `projectOverviewFinance.test.ts`.
- Fehlende native Bindung des optionalen Canvas-Pakets verhinderte zunächst jsdom. Paketordner für diese nicht rasterabhängigen Tests temporär ausgelagert, anschließend wiederhergestellt; keine Abhängigkeitsänderung.
- ESLint: keine Fehler; drei bestehende Warnungen zu Hook-Abhängigkeiten/Fast Refresh.
- Automatisches Prüfprotokoll: build OK. `git diff --check` erfolgreich.
- Chromium mit echten isoliert montierten Komponenten: 1179×993 und 390×844. Alle vier Diagrammansichten ohne zusätzliche Beitragsaktionen; Dialog öffnen, Name speichern und bestätigtes Löschen mit Store-Rücklesen erfolgreich. Weißes Löschsymbol, Position rechts neben Schließen und dunkles Datumsschema geprüft. Keine Seitenfehler in diesen Abläufen.
- Echter Three.js-Viewer mit abgeleiteter Infobox und normalem Texturpfad: Vorder- und Rückseite aus gegenüberliegenden Kamerapositionen aufgenommen und visuell geprüft, beide zeigen das Symbol.

## Grenzen
- Keine angemeldete Prüfung von `/project/p-mwguo5f8/cad` oder der zugehörigen 3D-Ansicht: Testsitzungsbereitstellung verweigert; isolierte Komponentenprüfung ersetzt keine echte Projektabnahme.
- Keine unabhängige GitHub-Push-/Vercel-Verifikation. Die Plattform überträgt den Commit nach Abschluss.
- Architekturhinweise konnten wegen des 8192-Byte-Budgets der unveränderten Nutzerregeln nicht zusätzlich in der root-AGENTS-Datei gespeichert werden.

```powershell
git fetch origin; git log origin/main --oneline -5
```